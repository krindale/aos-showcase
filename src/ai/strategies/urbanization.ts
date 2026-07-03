/**
 * 도시화(Urbanization) 계획 — 배치 위치·타일 색·가치·연결 경로를 한 번에 결정
 *
 * 배경(2026-07 사용자 피드백): AI가 "생각 없이" 도시화를 남발했다.
 *  - selectAction의 가치 평가가 배치 계획과 무관(타일 색만 확인)해 매 턴 도시화를 선택
 *  - 배치 후 건설은 무관한 목표 경로로 향해, 신도시의 36%가 끝까지 미연결(Korea 10시드 측정)
 *
 * 해결: 행동 선택(selectAction)·배치(AIPlayer)·건설(buildTrack)이 모두 이 모듈의
 * 같은 계획을 공유한다.
 *  - 가치: 신도시 수요색이 "내가 픽업 가능한 화물색"이면서 "기존 수요 도시가 멀거나 없는" 색일 때만 큼
 *  - 배치: 내 트랙이 없으면 이번 턴 계획 경로(planPath) 위/옆 마을만 (엉뚱한 곳 배제)
 *  - 연결: 신도시로 실제 배달 가능한 출발 도시를 찾아 connectRoute로 반환 → 건설이 이를 커밋
 */

import { GameState, PlayerId, HexCoord, NewCityTileId, City, CubeColor } from '@/types/game';
import { hexDistance, hexCoordsEqual, getNeighborHex, cityAcceptsCube } from '@/utils/hexGrid';
import { getDisplaySlotRange } from '@/utils/mapRegistry';
import { getMapProfile } from '@/maps/getMapProfile';
import { getMapAIConfig } from '../strategy/mapConfig';
import { ensureTurnPlan } from '../strategy/turnPlan';
import { getConnectedCities } from '../strategy/analyzer';
import type { DeliveryRoute } from '../strategy/types';

/** 이 거리 이상 떨어져 있으면(또는 없으면) "기존 수요 도시가 없다"고 보고 신도시 가치를 인정 */
const FRESH_DEST_MIN_DIST = 5;
/** 애매한 거리(이 값 이상 ~ FRESH_DEST_MIN_DIST 미만)는 절반만 인정 — MIN_DIST에 연동 */
const FRESH_DEST_HALF_DIST = FRESH_DEST_MIN_DIST - 2;

export interface UrbanizationPlan {
  townCoord: HexCoord;
  tileId: NewCityTileId;
  /** 도시화의 기대 ΔVP — selectAction에서 다른 행동과 같은 단위로 비교 */
  deltaVP: number;
  /** 신도시로의 배달 경로 (건설 단계가 커밋해 신도시를 실제로 연결) */
  connectRoute: DeliveryRoute | null;
}

/** 같은 턴·같은 Phase의 계획 캐시 (경매 루프가 입찰마다 재계산하는 것 방지) */
const planCache: Map<PlayerId, { turn: number; phase: string; plan: UrbanizationPlan | null }> = new Map();

/**
 * planUrbanization의 캐시 버전 — 행동 가치 평가(selectAction/경매)용.
 *
 * 경매는 입찰 결정마다 rankActionsByDeltaVP → planUrbanization(O(도시×마을) 순회)을 반복
 * 호출하지만, 입찰/행동 선택 중에는 보드(마을·큐브·트랙·타일)가 변하지 않으므로 같은 턴·같은
 * Phase 안에서는 1회만 계산한다. 배치 실행 시점(buildTrack Phase)은 보드가 변하므로
 * AIPlayer가 원본 planUrbanization을 직접 호출한다 — 이 캐시를 쓰지 말 것.
 */
export function planUrbanizationCached(
  state: GameState,
  playerId: PlayerId,
): UrbanizationPlan | null {
  const cached = planCache.get(playerId);
  if (cached && cached.turn === state.currentTurn && cached.phase === state.currentPhase) {
    return cached.plan;
  }
  const plan = planUrbanization(state, playerId);
  planCache.set(playerId, { turn: state.currentTurn, phase: state.currentPhase, plan });
  return plan;
}

/** 게임 리셋 시 캐시 초기화 (이전 게임의 같은 턴·Phase 키 충돌 방지) */
export function clearUrbanizationPlanCache(): void {
  planCache.clear();
}

/**
 * 도시화 계획: 어느 마을에 어떤 색 신규 도시를 놓을지 + 그 가치와 연결 경로
 *
 * - 타일 색: 내 철도에서 픽업 가능한 화물색 중, 그 색 수요 도시가 멀거나 없는 색 우선
 * - 마을: 이번 턴 철도로 연결 가능한 범위(건설 슬롯) 안 + 계획 경로 위 우선.
 *   내 트랙이 아직 없으면(다인 cityCubes) 계획 경로 위/옆 마을만 — 아니면 보류(null)
 * - 가치: "새 목적지를 여는" 화물(기존 수요 도시가 먼 색)만 인정 — 중복 목적지는 소액
 */
export function planUrbanization(
  state: GameState,
  playerId: PlayerId,
): UrbanizationPlan | null {
  const { board } = state;
  const towns = board.towns.filter(t => !t.newCityColor);
  const availableTiles = state.newCityTiles.filter(t => !t.used);
  if (towns.length === 0 || availableTiles.length === 0) return null;

  const myTracks = board.trackTiles.filter(t => t.owner === playerId);
  // 그 도시가 해당 색 화물을 받는 수요 도시인지 — 게임 엔진과 동일 판정(cityAcceptsCube) 재사용
  const acceptsColor = (c: City, color: string) => cityAcceptsCube(c, color as CubeColor, board);

  // 1) 내가 픽업 가능한 화물색별 수 = 내 철도 근처(≤3) 도시 큐브 + 내 트랙 위 큐브 (+헥스큐브: trackCubes 맵)
  const cargoByColor = new Map<string, number>();
  const bumpCargo = (c: string | null | undefined) => { if (c) cargoByColor.set(c, (cargoByColor.get(c) ?? 0) + 1); };
  board.cities.forEach(c => {
    if (myTracks.some(tr => hexDistance(tr.coord, c.coord) <= 3)) c.cubes.forEach(bumpCargo);
  });
  board.trackTiles.forEach(t => { if (t.owner === playerId) bumpCargo(t.cube); });
  board.hexTiles.forEach(h => bumpCargo(h.cube));

  // 2) 색별 목적지 거리: 내 철도 기준 그 색을 받는 수요 도시까지 최소 거리 (없으면 ∞=가장 우선).
  const destDistOf = (color: string): number => {
    if (myTracks.length === 0) return Infinity;
    let best = Infinity;
    board.cities.forEach(c => {
      if (!acceptsColor(c, color)) return;
      const d = Math.min(...myTracks.map(tr => hexDistance(tr.coord, c.coord)));
      if (d < best) best = d;
    });
    return best;
  };

  // 타일의 "예상 신도시 수요색": 동적색+디스플레이 보충 맵(한국)은 신도시 수요색이 tile.color가 아니라
  // placeNewCity가 그 타일 칸(A~H)에서 옮겨오는 디스플레이 큐브로 정해진다 → 그 칸 큐브색으로 평가.
  // (그 외 맵은 [tile.color] 그대로)
  const displayCount = getMapProfile(state.mapId).urbanizeFromDisplayCount;
  const useDisplayColor = board.dynamicCityColors && displayCount > 0;
  const expectedColorsOf = (tileId: string, tileColor: string): string[] => {
    if (!useDisplayColor) return [tileColor];
    const range = getDisplaySlotRange(state.mapId, tileId); // gameStore.placeNewCity와 동일 인덱싱
    if (!range) return [];
    const colors: string[] = [];
    for (let i = 0; i < range.rowCount && colors.length < displayCount; i++) {
      const cube = state.goodsDisplay.slots[range.startIndex + i];
      if (cube) colors.push(cube as string);
    }
    return colors;
  };

  // 3) 타일 색 점수: 그 타일이 만들 신도시 수요색이 "내 화물색 + 목적지 먼 색"일수록 높음.
  const colorScore = (color: string): number => {
    const cargo = cargoByColor.get(color) ?? 0;
    if (cargo === 0) return -100;                                   // 내 철도에 그 색 화물 없음 → 무의미
    const dd = destDistOf(color);
    const farBonus = dd === Infinity ? 30 : Math.min(30, dd * 5);   // 목적지 멀수록/없을수록 우선
    return cargo * 2 + farBonus;
  };
  let bestTile = availableTiles[0];
  let bestTileScore = -Infinity;
  for (const tile of availableTiles) {
    const colors = expectedColorsOf(tile.id, tile.color as string);
    // 타일이 만들 수요색 중 최고가치로 평가 (한국은 디스플레이 큐브 2개 = 2색 수요 가능)
    const score = colors.length ? Math.max(...colors.map(colorScore)) : -100;
    if (score > bestTileScore) { bestTileScore = score; bestTile = tile; }
  }
  const bestTileColors = expectedColorsOf(bestTile.id, bestTile.color as string);

  // ★ 가치(ΔVP): "새 목적지를 여는" 화물만 인정 — 그 색을 받는 기존 도시가 가까이 있으면
  // 신도시는 중복 목적지라 income 기여가 거의 없다 (도시화 남발의 원인이던 과대평가 차단).
  // ⚠️ 동적색 맵(한국)은 예외: 도시 수요 = 현재 놓인 큐브(소모성 — 배달 1건마다 수요가 사라짐)라
  // 기존 도시가 그 색을 "지금" 받아도 신도시는 중복이 아니다. 신선도 검사를 걸면 도시화가
  // 말살돼 VP 20.7→3.7로 붕괴했다(100시드 실측) — 화물량 기반으로만 평가한다.
  let freshCargo = 0;
  for (const color of bestTileColors) {
    const cargo = cargoByColor.get(color) ?? 0;
    if (cargo === 0) continue;
    if (board.dynamicCityColors) {
      freshCargo += Math.min(cargo, 3);
    } else {
      const dd = destDistOf(color);
      if (dd >= FRESH_DEST_MIN_DIST) freshCargo += Math.min(cargo, 3);
      else if (dd >= FRESH_DEST_HALF_DIST) freshCargo += Math.min(cargo, 3) * 0.5; // 애매한 거리: 절반 인정
    }
  }
  // 중복 목적지(freshCargo 0)는 floor(0.2)와 동점 → TIE_BREAK_ORDER상 도시화가 뒤라 필러로도 안 뽑힌다
  const deltaVP = freshCargo > 0 ? Math.min(8, freshCargo * 1.5) : 0.2;

  // ★ 마을 점수: "이번 턴에 철도로 연결할 수 있는 범위"의 마을만 — 가까울수록 가점.
  const areaMulti = state.activePlayers.length >= 3 && !getMapAIConfig(state).incomeSources.includes('trackCubes');
  // 이번 턴 목표 경로(트랙 건설 전 도시화 시점에 이 경로로 연결할 계획) — 그 경로가 지나는 마을 우선
  const planPath = areaMulti ? (ensureTurnPlan(state, playerId).fullPath ?? null) : null;
  const nearPlanPath = (t: { coord: HexCoord }) =>
    planPath ? planPath.some(c => hexDistance(c, t.coord) <= 1) : false;
  const onPlanPath = (t: { coord: HexCoord }) =>
    planPath ? planPath.some(c => hexCoordsEqual(c, t.coord)) : false;
  // 이번 턴에 철도로 연결할 수 있는 범위 = "남은" 건설 슬롯 수. 도시화는 보통 build 단계
  // 첫머리(0개 건설)지만, 첫 시도에서 배치를 보류하고 트랙을 먼저 깐 뒤 재시도되는 경우가 있어
  // 이미 쓴 슬롯을 빼야 한다 — 안 빼면 연결 불가능한 마을에 배치해 끝까지 미연결로 남는다.
  // ⚠️ 동적색 맵(한국)은 신도시 수요가 소모성·전역 공유라, 내 연결 편의보다 "수요를 어디에 만드나"가
  //   지배적 — 배치 제한(잔여 슬롯·계획 경로)을 걸면 VP가 회귀해(100시드 실측) 기존 범위를 유지한다.
  const dynamicLegacy = !!board.dynamicCityColors;
  const slots = dynamicLegacy
    ? (state.phaseState.maxTracksThisTurn ?? 3)
    : Math.max(0, (state.phaseState.maxTracksThisTurn ?? 3) - (state.phaseState.builtTracksThisTurn ?? 0));
  // 내 트랙의 변이 그 마을을 직접 향하면, 도시화 즉시 연결된다(도시는 모든 변 연결) — 슬롯 불필요.
  const instantlyConnected = (townCoord: HexCoord): boolean =>
    myTracks.some(t => t.edges.some(e => hexCoordsEqual(getNeighborHex(t.coord, e), townCoord)));

  let bestTown: { coord: HexCoord } | null = null;
  let bestTownScore = -Infinity;
  for (const town of towns) {
    let score = 0;

    // 1) 연결성: 트랙이 있으면 이번 턴 연결 가능 범위(잔여 슬롯) 안의 마을만 허용, 가까울수록 가점.
    if (myTracks.length > 0) {
      const minDist = Math.min(...myTracks.map(t => hexDistance(t.coord, town.coord)));
      const instant = !dynamicLegacy && instantlyConnected(town.coord);
      if (!instant && minDist > slots) continue;           // 이번 턴 연결 불가 → 도시화 후보 제외
      if (instant) score += 25;                            // 배치 즉시 연결 (내 변이 마을을 향함)
      if (onPlanPath(town)) score += 30;
      if (minDist <= 1) score += 20;                       // 즉시 합류
      else if (minDist <= 2) score += 14;                  // 한두 칸이면 이번 턴 닿음
      else score += Math.max(0, 10 - minDist * 2);         // 슬롯 내 더 먼 곳도 연결 가능(가점만 체감)
    } else if (areaMulti && !dynamicLegacy) {
      // ★ 다인 cityCubes에서 트랙이 아직 없으면(주로 1턴) 이번 턴 계획 경로 위/옆 마을만 —
      // 아무 데나 놓으면 이후 건설이 그쪽으로 가지 않아 끝까지 미연결로 남는다 (측정: 36% 미연결).
      if (!nearPlanPath(town)) continue;
      score += onPlanPath(town) ? 30 : 15;
    } else {
      // trackCubes(St.Lucia 강제 1턴 도시화)·동적색 맵: 기존 동작 보존 — 큐브 근처로만 판단
      if (onPlanPath(town)) score += 30;
    }

    // 2) 큐브 배달 잠재력 (보조): 신도시가 가질 수요색 큐브가 가까이 있으면 배달처로서 가치
    for (const city of board.cities) {
      if (city.cubes.some(c => bestTileColors.includes(c as string))
          && hexDistance(city.coord, town.coord) <= 2) score += 8;
    }
    for (const hex of board.hexTiles) {
      if (hex.cube && bestTileColors.includes(hex.cube as string) && hexDistance(hex.coord, town.coord) <= 3) score += 2;
    }

    if (score > bestTownScore) {
      bestTownScore = score;
      bestTown = town;
    }
  }

  // 연결 가능 범위(또는 계획 경로 위/옆)에 마을이 하나도 없으면 도시화 보류 — 엉뚱한 먼 곳에 안 만든다.
  if (!bestTown) return null;

  // ★ 연결 경로: 신도시(수요색 = bestTileColors)로 배달할 화물을 가진 출발 도시를 찾는다.
  // 내 연결 도시 우선(산발 금지 필터와 정합), 없으면 내 트랙 근접(≤3) 도시. 건설 단계가 이 경로를
  // 커밋해 도시화 → 연결 → 배달이 같은 계획으로 이어진다.
  let connectRoute: DeliveryRoute | null = null;
  const connectedIds = myTracks.length > 0 ? getConnectedCities(state, playerId) : [];
  const sourceCandidates = board.cities
    .filter(c => c.cubes.some(cu => bestTileColors.includes(cu as string)))
    .filter(c => myTracks.length === 0 || connectedIds.includes(c.id)
      || myTracks.some(tr => hexDistance(tr.coord, c.coord) <= 3))
    .sort((a, b) => {
      // 내 연결 도시 우선, 그다음 신도시와 가까운 순
      const ac = connectedIds.includes(a.id) ? 0 : 1;
      const bc = connectedIds.includes(b.id) ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return hexDistance(a.coord, bestTown!.coord) - hexDistance(b.coord, bestTown!.coord);
    });
  if (sourceCandidates.length > 0) {
    connectRoute = { from: sourceCandidates[0].id, to: bestTile.id, priority: 1 };
  }

  return { townCoord: bestTown.coord, tileId: bestTile.id, deltaVP, connectRoute };
}
