/**
 * Phase V: 물품 이동 전략 (ΔVP 기반)
 *
 * 모든 선택지(배달 / 엔진 업그레이드 / 스킵)를 "예상 VP 증분(ΔVP)" 단위로
 * 평가해 최대값을 선택합니다.
 *
 *  - 배달: deliveryDeltaVP = 내 링크 income VP + 잔여턴 현금흐름 − 상대 링크 페널티
 *  - 엔진 업그레이드: 해금되는 배달의 ΔVP × 실현확률 − 매턴 비용
 *  - 어느 쪽도 양수가 아니면 스킵 (상대만 이득인 배달은 하지 않음)
 */

import { GameState, PlayerId, HexCoord, CubeColor } from '@/types/game';
import { findReachableDestinations, findRouteOptions, hexCoordsEqual, findTrackCubeDeliveries } from '@/utils/hexGrid';
import { calculateVictoryPoints, playerBonusVP, effectiveEngineLevel } from '@/utils/gameLogic';
import { calculateTrackScore } from '@/utils/trackValidation';
import { getSelectedStrategy, getCurrentRoute } from '../strategy/state';
import { getConnectedCities } from '../strategy/analyzer';
import { getMapAIConfig } from '../strategy/mapConfig';
import { getMapProfile } from '@/maps/getMapProfile';
import {
  deliveryDeltaVP,
  engineUpgradeDeltaVP,
  engineUpgradeShortfall,
  opponentWeight,
  VP_PER_INCOME,
  SAME_TURN_DELIVERY_DISCOUNT,
  FUTURE_DELIVERY_DISCOUNT,
} from '../strategy/vp';
import { debugLog } from '@/utils/debugConfig';

export type MoveGoodsDecision =
  | { action: 'move'; sourceCityId: string; cubeIndex: number; destinationCoord: HexCoord; cubeColor: CubeColor }
  | { action: 'moveTrackCube'; trackId: string; destCityId: string } // St. Lucia: 트랙 위 큐브 배달
  | { action: 'upgradeEngine' }
  | { action: 'skip' };

interface MoveCandidate {
  sourceCityId: string;
  cubeIndex: number;
  cubeColor: CubeColor;
  destinationCoord: HexCoord;
  destinationCityId: string;
  path: HexCoord[];
  deltaVP: number;     // 배달의 ΔVP (선점 보너스 포함)
  routeScore: number;  // 전략 경로 일치 tie-break (ΔVP 대비 소액)
  linksCount: number;
  ownTrackCount: number;
}

/**
 * 물품 이동 결정
 */
export function decideMoveGoods(state: GameState, playerId: PlayerId): MoveGoodsDecision {
  const player = state.players[playerId];
  if (!player) return { action: 'skip' };

  // 이미 이동했는지 확인
  if (state.phaseState.playerMoves[playerId]) {
    debugLog.goodsMovement(`[Phase V: 물품 이동] ${player.name}: 이번 라운드 이동 완료`);
    return { action: 'skip' };
  }

  // 전략 및 목표 경로 가져오기 (tie-break용 — 조회만, 상태 변경 없음)
  // 주의: getNextTargetRoute는 setCurrentRoute 부수효과 + A* 비용이 있으므로
  // buildTrack에서 커밋된 경로를 O(1)로 읽기만 한다 (경로 커밋 보존)
  const strategy = getSelectedStrategy(playerId);
  const targetRoute = getCurrentRoute(playerId);

  const { board } = state;
  const profile = getMapProfile(state.mapId);
  const incomeSources = getMapAIConfig(state).incomeSources;
  // Montréal DGEL: 정부 링크 전용 추가 이동 (다른 맵은 0 — 탐색 동작 무변경)
  const govExtra = profile.dedicatedGovEngine ? (player.dgel ?? 0) : 0;
  // 타인 철도 개방(전 맵, 룰북): 타인 링크는 엔진 한도 내 무제한 — 본인 철도 우선 게이트와
  // "최저 VP 주인에게 수입 주기" 디폴트는 findRouteOptions가 사람 UI와 동일하게 적용.
  // 실효 엔진 = engineLevel + 지지 토큰 임시 +1 (Southern China, 다른 맵 항등)
  const myEngine = effectiveEngineLevel(state.players, playerId);
  const oppExtra = myEngine;
  // 달(Moon) 저중력 보유: 빌린 링크 1개 수입 이전(applyLowGravitation)을 경로 수치에 반영
  const lowGravCredit = player.selectedAction === 'lowGravitation';
  // 후보 정렬용 상대 점수(VP) — 사람 UI(uiSlice.ownerScoreOf)와 동일 공식
  const ownerScore: Partial<Record<PlayerId, number>> = {};
  for (const pid of state.activePlayers) {
    const p = state.players[pid];
    if (!p) continue;
    ownerScore[pid] = calculateVictoryPoints(p.income, calculateTrackScore(board, pid), p.issuedShares, playerBonusVP(p));
  }
  const candidates: MoveCandidate[] = [];

  // 한 출발지(도시/마을)의 큐브들에 대해 배달 후보를 생성해 candidates에 추가 (도시·마을 공용).
  //  - sourceRegion: 동↔서 보너스 판정용 (마을은 region 없음 → 보너스 0)
  //  - routeScoreFor: 전략 경로 일치 tie-break (도시만; 마을은 항상 0)
  const collectFromSource = (
    sourceCoord: HexCoord,
    sourceId: string,
    sourceRegion: 'east' | 'west' | undefined,
    cubes: CubeColor[],
    routeScoreFor?: (destId: string) => number,
  ) => {
    for (let cubeIndex = 0; cubeIndex < cubes.length; cubeIndex++) {
      const cubeColor = cubes[cubeIndex];
      const reachable = findReachableDestinations(sourceCoord, board, playerId, myEngine, cubeColor, govExtra, oppExtra);
      if (reachable.length === 0) continue;

      // 선점 보너스용 상대 도달 집합 — (출발지·큐브)당 상대별 1회만 계산해 목적지 루프에서 재사용
      // (목적지 루프 안에서 재탐색하면 같은 탐색을 목적지 수만큼 반복 — 개방 후 탐색이 무거워져 체감 큼)
      const oppReachSets = state.activePlayers
        .filter(oppId => oppId !== playerId && state.players[oppId] && !state.players[oppId].eliminated)
        .map(oppId => {
          const oppPlayer = state.players[oppId];
          return findReachableDestinations(sourceCoord, board, oppId, oppPlayer.engineLevel, cubeColor, 0, oppPlayer.engineLevel);
        });

      for (const destCity of reachable) {
        // 목적지별 대표 경로 = findRouteOptions 디폴트([0]) — 사람 UI와 동일 정책
        // (내 수입 최대 → 최저 VP 주인 → 빌린 링크 최소, 저중력 수입 이전 반영)
        const opt = findRouteOptions(
          sourceCoord, destCity.coord, board, playerId, myEngine, cubeColor,
          govExtra, ownerScore, lowGravCredit
        )[0];
        if (!opt || opt.path.length < 2) continue;
        const path = opt.path;

        const linksCount = opt.totalLinks;
        const ownTrackCount = opt.ownLinks;

        // 배달의 기본 ΔVP (내 income VP + 현금흐름 − 상대 income 페널티)
        // own/opp는 정산 미러 수치(저중력 이전 포함) — 과거의 평가/정산 불일치 해소
        let deltaVP = deliveryDeltaVP(state, playerId, ownTrackCount, opt.oppLinks);

        // Western US: 동↔서 배달 보너스(+$1 income, 배달자에게) — ΔVP에 가산
        // Southern US: 면화(흰 큐브) 배달 +$1 보너스도 동일하게 가산
        const regionBonus = profile.regionDeliveryBonus(sourceRegion, destCity.region)
          + profile.cubeDeliveryBonus(cubeColor);
        if (regionBonus > 0) deltaVP += VP_PER_INCOME * regionBonus;

        // 선점 보너스: 상대도 같은 배달이 가능하면, 내가 먼저 옮겨 상대의 income 기회를 차단
        // (상대도 타인 철도를 쓸 수 있으므로 opponentExtra = 상대 엔진으로 판정 — 집합은 위에서 1회 계산)
        // ⚠️ "상납" 경로(내 수입 0인데 상대 링크에 수입을 주는 경로)엔 주지 않는다 —
        // 2026-07-24 한국 실측(own0/opp1 배달 3건)에서 도입. 2026-07-25 게이트 분리 측정:
        // 이 가드의 VP 비용 = Korea −1.2 (44.41→43.21), Germany/Rust Belt도 유사 폭 하락
        // 추정 — 상납에도 선점 이득이 있어 데이터상으론 무조건이 우세하나, **사용자 선택으로
        // 가드 유지**(봇이 상대에게 공짜 수입을 주는 수를 두지 않는 것을 우선). 몬트리올은
        // 정밀 가드(aiPreemptZeroIncomeDenial → !isPureGift, 14.82/0.70) 별도 유지.
        const isPureGift = ownTrackCount === 0 && opt.oppLinks > 0 && regionBonus === 0;
        const preemptEligible = profile.aiPreemptZeroIncomeDenial
          ? !isPureGift
          : ownTrackCount > 0 || regionBonus > 0;
        if (
          preemptEligible &&
          oppReachSets.some(set => set.some(d => hexCoordsEqual(d.coord, destCity.coord)))
        ) {
          deltaVP += VP_PER_INCOME * opponentWeight(state);
        }

        candidates.push({
          sourceCityId: sourceId,
          cubeIndex,
          cubeColor,
          destinationCoord: destCity.coord,
          destinationCityId: destCity.id,
          path,
          deltaVP,
          routeScore: routeScoreFor ? routeScoreFor(destCity.id) : 0,
          linksCount,
          ownTrackCount,
        });
      }
    }
  };

  // 전략 경로 일치 tie-break (ΔVP 스케일 대비 소액: 동점일 때 계획 경로 우선) — 도시 출발 전용
  const cityRouteScore = (srcId: string, destId: string): number => {
    if (!strategy || !targetRoute) return 0;
    if (srcId === targetRoute.from && destId === targetRoute.to) return 0.5;
    if (srcId === targetRoute.from || destId === targetRoute.to) return 0.3;
    if (strategy.targetRoutes.some(r =>
      (r.from === srcId && r.to === destId) || (r.from === srcId) || (r.to === destId)
    )) return 0.1;
    return 0;
  };

  // 도시 큐브 배달 후보
  for (const city of board.cities) {
    collectFromSource(city.coord, city.id, city.region, city.cubes, destId => cityRouteScore(city.id, destId));
  }

  // Western US: 마을 위 큐브 배달 후보 ('townCubes' income 원천). 마을을 도시처럼 출발점으로,
  // 완성 링크를 따라 같은 색 도시로 배달 → 일반 'move' 액션(sourceCityId='town:<id>')으로 실행.
  if (incomeSources.includes('townCubes')) {
    for (const town of board.towns) {
      if (town.newCityColor !== null) continue; // 도시화된 마을은 도시 경로
      collectFromSource(town.coord, `town:${town.id}`, undefined, town.cubes);
    }
  }

  // St. Lucia: 트랙 위 큐브 배달 후보 (미완성 링크 허용 — 구간 소유자 수입 +1)
  // ownIncome/oppIncome = 정산 미러(시작 구간 보너스 + 이후 링크 귀속) — 과거의
  // "시작 구간 소유만 보는" 거친 근사를 전체 수입 분배로 교체 (타인 철도 개방 정책과 통일)
  let bestTrackCube: { trackId: string; destCityId: string; deltaVP: number } | null = null;
  for (const track of board.trackTiles) {
    if (!track.cube) continue;
    for (const delivery of findTrackCubeDeliveries(board, track.id, effectiveEngineLevel(state.players, playerId), playerId)) {
      const vp = deliveryDeltaVP(state, playerId, delivery.ownIncome, delivery.oppIncome);
      if (!bestTrackCube || vp > bestTrackCube.deltaVP) {
        bestTrackCube = { trackId: track.id, destCityId: delivery.city.id, deltaVP: vp };
      }
    }
  }

  // 총 ΔVP 기준 정렬
  candidates.sort((a, b) => (b.deltaVP + b.routeScore) - (a.deltaVP + a.routeScore));
  const best = candidates.length > 0 ? candidates[0] : null;
  const bestMoveVP = best ? best.deltaVP + best.routeScore : -Infinity;

  // 엔진 업그레이드 옵션을 동일 단위(ΔVP)로 평가
  const upgradeVP = evaluateEngineUpgradeOption(state, playerId);

  debugLog.goodsMovement(
    `[Phase V: 물품 이동] ${player.name}: 옵션 비교 — 배달 ΔVP=${bestMoveVP === -Infinity ? '없음' : bestMoveVP.toFixed(2)}, 업그레이드 ΔVP=${upgradeVP === -Infinity ? '불가' : upgradeVP.toFixed(2)}`
  );

  // 최대 ΔVP 선택: 트랙 큐브 배달 vs 도시 배달 vs 업그레이드 vs 스킵(0)
  if (bestTrackCube && bestTrackCube.deltaVP > bestMoveVP && bestTrackCube.deltaVP > upgradeVP && bestTrackCube.deltaVP > 0) {
    debugLog.goodsMovement(`[Phase V: 물품 이동] ${player.name}: 트랙 큐브 배달 → ${bestTrackCube.destCityId}, ΔVP=${bestTrackCube.deltaVP.toFixed(2)}`);
    return { action: 'moveTrackCube', trackId: bestTrackCube.trackId, destCityId: bestTrackCube.destCityId };
  }

  if (upgradeVP > bestMoveVP && upgradeVP > 0) {
    debugLog.goodsMovement(`[Phase V: 물품 이동] ${player.name}: 엔진 업그레이드 (${player.engineLevel}→${player.engineLevel + 1}), ΔVP=${upgradeVP.toFixed(2)}`);
    return { action: 'upgradeEngine' };
  }

  // 실행 문턱 훅 분기(사용자 지시로 몬트리올 전용): aiStrictDeliveryVP 맵은 routeScore를
  // 뺀 순수 ΔVP>0 — tie-break가 문턱을 넘겨 "아무도 수입 안 받는 배달"(정부 링크 경유
  // deltaVP=0)이 실행되던 것 차단(몬트리올 0수입 배달 11/38건). 그 외 맵은 기존 동작 유지.
  const commitVP = best ? (profile.aiStrictDeliveryVP ? best.deltaVP : bestMoveVP) : -Infinity;
  if (best && commitVP > 0) {
    debugLog.goodsMovement(
      `[Phase V: 물품 이동] ${player.name}: ${best.cubeColor} 물품 이동 (${best.sourceCityId} → ${best.destinationCityId}), 링크=${best.linksCount}(내쪽=${best.ownTrackCount}), ΔVP=${bestMoveVP.toFixed(2)}`
    );
    return {
      action: 'move',
      sourceCityId: best.sourceCityId,
      cubeIndex: best.cubeIndex,
      destinationCoord: best.destinationCoord,
      cubeColor: best.cubeColor,
    };
  }

  debugLog.goodsMovement(`[Phase V: 물품 이동] ${player.name}: 양수 ΔVP 옵션 없음 → 스킵 (엔진=${player.engineLevel})`);
  return { action: 'skip' };
}

/**
 * 엔진 업그레이드 옵션의 ΔVP 평가
 *
 * 업그레이드로 "해금되는" 배달(현재 엔진으로는 불가능한 링크 수)의 가치를
 * 실현 확률로 할인하고 매턴 비용을 차감한다.
 */
function evaluateEngineUpgradeOption(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) return -Infinity;

  const config = getMapAIConfig(state);

  // 엔진 상한 도달 / 이번 턴 locomotive로 이미 업그레이드함
  // 엔진업 결정 상한 (맵별, 기본 = engineMax). 경로 평가의 engineMax와 분리 — MapProfile 주석 참조
  const upgradeCap = getMapProfile(state.mapId).aiEngineUpgradeCap ?? config.engineMax;
  if (player.engineLevel >= upgradeCap) return -Infinity;
  if (player.selectedAction === 'locomotive') return -Infinity;
  // 이번 턴에 이미 move-round 엔진 업그레이드함 (2 move round 통틀어 1회 — 룰북).
  // 없으면 AI가 라운드2에 또 엔진업을 결정→store가 거부→같은 결정 반복으로 정체한다.
  if (state.phaseState.engineUpgradedThisTurn?.[playerId]) return -Infinity;

  // ★ 치명적 디폴트 가드 (2026-07 파산 궤적 진단): engineUpgradeDeltaVP에는 파산 위험 -∞ 가드가
  // 있지만 아래 front-load 지름길(return 5)이 그걸 우회한다 — T1에 건설로 현금을 소진한 플레이어가
  // 배달(즉시 income) 대신 엔진업을 골라, 이번 턴 지출을 못 내고 즉사했다.
  // 파산 확정(bankrupt)만 차단 — 부족분이 있어도 회복 가능한 저현금 front-load는 통과시킨다
  // (판정 수식은 vp.engineUpgradeShortfall 단일 소스 공유 — 엄격/치명 가드 차이는 그쪽 주석 참조).
  if (engineUpgradeShortfall(state, playerId).bankrupt) return -Infinity;


  // ★ 사용자 지침: trackCubes 맵 T4 이후엔 수송 포기(move-round) 엔진업 전면 금지 —
  // 엔진은 오직 Locomotive 액션으로만 올린다(배달 라운드를 더 이상 엔진에 쓰지 않음).
  if (config.incomeSources.includes('trackCubes') && state.currentTurn > 4) return -Infinity;

  // 완성된 링크(연결 네트워크)가 없으면 업그레이드는 시기상조.
  // 단 trackCubes 맵(St. Lucia)은 트랙 큐브를 미완성 링크로도 배달하므로,
  // 트랙 위에 내 큐브가 있으면 2개 도시 연결 전이라도 엔진 업그레이드가 유효하다.
  const connectedCities = getConnectedCities(state, playerId);
  const hasTrackCube = state.board.trackTiles.some(t => t.cube && t.owner === playerId);
  if (connectedCities.length < 2 && !(config.incomeSources.includes('trackCubes') && hasTrackCube)) {
    return -Infinity;
  }

  const round = state.phaseState.moveGoodsRound;
  const remainingTurns = config.totalTurns - state.currentTurn;

  // ★ trackCubes front-load (사용자 전략): 초반부터 수송 1개 포기로 엔진을 3까지 미리 올린다.
  // "T4까지 엔진 3~4 유동적" — front-load는 3까지(수송 포기 비용 최소), 3→4는 Locomotive 깊은-경로
  // 부스트가 상황에 따라(깊은 배달 필요 시) 처리 → 측정상 엔진 ~3.9에 안착(3~4). 상한 4로 강제하면
  // 초반 배달을 과도하게 포기해 income↓·파산↑·VP↓(측정 확인). 값 5는 짧은 배달(1링크)만 이김.
  // 다인(3+) cityCubes도 trackCubes처럼 엔진을 미리 올린다 — 장거리(4-5링크) 배달이
  // 수입의 핵심이기 때문(사용자 목표: income 20). 2인 tutorial(cityCubes)은 제외해 회귀 보존.
  // 사용자 지침: 엔진은 T4까지만 front-load로 3까지 올리고, T5+ 는 move-round 엔진업을
  // 금지하고 특수액션 Locomotive로만 올린다 (move-round 엔진업은 배달 1개를 포기 → income 손실).
  // 맵별 front-load 스위치 (기본 true = 기존 동작). 달은 false — 초반 기회를 배달에 쓴다.
  const longHaul = getMapProfile(state.mapId).aiEngineFrontLoad
    && (config.incomeSources.includes('trackCubes') || state.activePlayers.length >= 3);
  const frontLoadTarget = Math.min(3, state.currentTurn + 1);
  const frontLoad = (longHaul && player.engineLevel < frontLoadTarget
    && state.currentTurn <= 4 && remainingTurns >= 1)
    ? 5
    : 0;
  if (longHaul && state.currentTurn >= 5) {
    return frontLoad; // T5+: move-round 엔진업 금지 (frontLoad=0) → 엔진은 Locomotive로만
  }

  // round 2의 업그레이드는 다음 턴에야 실현 → 마지막 턴이면 가치 없음
  if (round !== 1 && remainingTurns < 1) return -Infinity;
  const prob = round === 1 ? SAME_TURN_DELIVERY_DISCOUNT : FUTURE_DELIVERY_DISCOUNT;

  // 엔진+1로 해금되는 최선의 자기 트랙 배달 탐색 (도시 큐브 + 트랙 큐브)
  const bestUnlocked = findBestUnlockedDelivery(state, playerId, player.engineLevel + 1);
  const bestUnlockedTrackVP = config.incomeSources.includes('trackCubes')
    ? findBestUnlockedTrackCubeVP(state, playerId, player.engineLevel)
    : -Infinity;

  const cityUnlockedVP = bestUnlocked
    ? deliveryDeltaVP(state, playerId, bestUnlocked.ownLinks, bestUnlocked.totalLinks - bestUnlocked.ownLinks)
    : -Infinity;
  const unlockedVP = Math.max(cityUnlockedVP, bestUnlockedTrackVP);

  if (unlockedVP > -Infinity) {
    const base = engineUpgradeDeltaVP(state, playerId, unlockedVP, prob);
    // trackCubes 맵: 마을 경유로 깊어진 체인의 먼 큐브를 배달하려면 엔진을 키워야 한다. 짧은 즉시
    // 배달에 안주하지 않도록 엔진 업그레이드를 강하게 우대(사용자 목표: 4-5링크 배달 실현).
    // 장거리 배달 해금 시 엔진 업그레이드를 강하게 우대 — 짧은 1링크 배달에 안주하지 않게.
    // trackCubes(깊은 트랙큐브 체인) + 다인 cityCubes(3링크+ 장거리 도시 배달) 모두 적용.
    const longHaulUnlock = (bestUnlockedTrackVP >= unlockedVP && config.incomeSources.includes('trackCubes'))
      || (state.activePlayers.length >= 3 && bestUnlocked && bestUnlocked.totalLinks >= 3);
    if (base > 0 && longHaulUnlock) {
      return Math.max(base * 6, frontLoad);
    }
    return Math.max(base, frontLoad);
  }

  // 해금 배달이 없어도, 보드에 화물이 전혀 없으면 다음 턴 물품 성장을 기대
  const totalCubes = state.board.cities.reduce((sum, c) => sum + c.cubes.length, 0);
  if (totalCubes === 0 && remainingTurns >= 1) {
    // 보수적 기대: 1링크 배달, 불확실성 추가 할인
    const expectedVP = deliveryDeltaVP(state, playerId, 1, 0);
    return Math.max(engineUpgradeDeltaVP(state, playerId, expectedVP, FUTURE_DELIVERY_DISCOUNT * 0.5), frontLoad);
  }

  return frontLoad > 0 ? frontLoad : -Infinity; // front-load: 해금 큐브가 없어도 미리 엔진을 올려둔다
}

/**
 * 지정 엔진 레벨에서 가능한 배달 중, 현재 엔진으로는 불가능한(해금되는)
 * 자기 트랙 포함 최선 배달 탐색
 */
function findBestUnlockedDelivery(
  state: GameState,
  playerId: PlayerId,
  engineLevel: number,
): { ownLinks: number; totalLinks: number } | null {
  const player = state.players[playerId];
  if (!player) return null;

  const { board } = state;
  let bestValue = -Infinity;
  let best: { ownLinks: number; totalLinks: number } | null = null;

  for (const city of board.cities) {
    for (let ci = 0; ci < city.cubes.length; ci++) {
      const cubeColor = city.cubes[ci];
      // 타인 철도 개방 반영 — 해금 판정도 실제 이동 규칙과 같은 탐색으로
      const reachable = findReachableDestinations(city.coord, board, playerId, engineLevel, cubeColor, 0, engineLevel);

      for (const destCity of reachable) {
        const opt = findRouteOptions(city.coord, destCity.coord, board, playerId, engineLevel, cubeColor)[0];
        if (!opt || opt.path.length < 2) continue;

        const totalLinks = opt.totalLinks;
        const ownLinks = opt.ownLinks;

        // 현재 엔진으로도 가능한 배달은 "해금"이 아님
        if (totalLinks <= player.engineLevel) continue;
        // 내 income이 없는 배달은 업그레이드 근거가 안 됨
        if (ownLinks < 1) continue;

        const value = deliveryDeltaVP(state, playerId, ownLinks, opt.oppLinks);
        if (value > bestValue) {
          bestValue = value;
          best = { ownLinks, totalLinks };
        }
      }
    }
  }

  return best;
}

/**
 * trackCubes 맵: 엔진+1로 "해금"되는(현재 엔진으론 불가) 최선의 트랙 큐브 배달 ΔVP.
 *
 * 현재 엔진 레벨에선 도달 못 하지만 +1이면 배달 가능해지는 트랙 큐브를 찾는다.
 * "짧게 시작 → 엔진 키워 먼 배달" 전략의 엔진 성장 신호 (백본의 더 깊은 큐브 해금).
 */
function findBestUnlockedTrackCubeVP(
  state: GameState,
  playerId: PlayerId,
  engineLevel: number,
): number {
  const { board } = state;
  let best = -Infinity;
  for (const track of board.trackTiles) {
    if (!track.cube) continue;
    // 현재 엔진으로 이미 배달 가능하면 "해금"이 아님
    const nowReachable = findTrackCubeDeliveries(board, track.id, engineLevel, playerId).length > 0;
    if (nowReachable) continue;
    for (const delivery of findTrackCubeDeliveries(board, track.id, engineLevel + 1, playerId)) {
      if (delivery.ownIncome < 1) continue; // 내 income 없는 배달은 업그레이드 근거 아님
      const vp = deliveryDeltaVP(state, playerId, delivery.ownIncome, delivery.oppIncome);
      if (vp > best) best = vp;
    }
  }
  return best;
}

