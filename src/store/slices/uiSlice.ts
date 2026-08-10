// UI 선택/건설 플로우 액션 slice (2026-07-03 스텝 3b 분리 — 로직 무변경, 코드 그대로 이동)
//
// gameStore에서 "순수 UI 상태 전이 + store 액션 위임"만 모았다:
// 기본 선택(selectHex/selectCube/clearSelection/cancelSelection) · 트랙 건설 상태기계
// (source→target→exit, 미리보기) · 복합 트랙/방향 전환 패널 · 도시화 모드/타일 선택 ·
// 물품 이동 목적지 선택/큐브 애니메이션.
// 게임 상태를 직접 변경하는 액션(undoLastAction · redirectTrack · placeNewCity ·
// Production 그룹 · completeCubeMove · addLog)은 gameStore에 잔류.
//
// GameStore 타입은 순환을 피하기 위해 type-only import (런타임 의존 없음 — aiScheduler와 동일 패턴).

import type { StoreApi } from 'zustand';
import type { GameStore } from '../gameStore';
import { HexCoord, MovingCubeContext, PlayerId, RouteOption } from '@/types/game';
import {
  isValidConnectionPoint,
  canRedirectTrack,
  getRedirectableEdges,
  getRedirectTargetHexes,
  isEndpointOfIncompleteSection,
  pickRedirectPath,
  calculateTrackScore,
} from '@/utils/trackValidation';
import {
  getBuildableNeighbors,
  getConnectableEdges,
  getNeighborHex,
  getOppositeEdge,
  getExitDirections,
  hexCoordsEqual,
  findReachableDestinations,
  findRouteOptions,
  findTrackCubeDeliveries,
  cityAcceptsCube,
  isBlockedEdge,
} from '@/utils/hexGrid';
import { calculateVictoryPoints, playerBonusVP, effectiveEngineLevel } from '@/utils/gameLogic';
import { logAction } from '@/utils/debugConfig';
import { useToastStore } from '../toastStore';
import { getBuildBlockReason } from '../helpers/buildReason';
import { getMapProfile } from '@/maps/getMapProfile';

type Set = StoreApi<GameStore>['setState'];
type Get = StoreApi<GameStore>['getState'];

/** Montréal DGEL: 이동 탐색에 넘길 정부 링크 전용 추가 이동 수 (다른 맵은 0) */
function govExtraOf(state: GameStore): number {
  return getMapProfile(state.mapId).dedicatedGovEngine
    ? (state.players[state.currentPlayer]?.dgel ?? 0)
    : 0;
}


/**
 * 요구사항 1의 **큐브 단위** 게이트 (2026-07-22 사용자 피드백): 본인 철도 최선(모든 목적지
 * 통틀어 내 수입 최대)과 비교해, 내 수입이 **더 커지지 않는** 타인 경유 옵션은 숨긴다 —
 * 목적지가 달라도 내 수입이 같으면 상대에게 수입만 헌납하는 선택지다(예: 하노버 own2 본인
 * 철도가 있는데 뉘른베르크 own2+opp3 타인 경유가 노출되던 사례).
 * ⚠️ 단, **본인 철도만으론 도달 불가한 목적지는 지우지 않는다** (2026-07-26 사용자 발견):
 * 이 게이트가 그런 목적지의 유일한 길(타인 경유)까지 숨겨 "엔진상 3링크 배달이 합법인데
 * 2링크 가이드만 표시"되는 버그가 났다. 목적지 선택은 수입 외 전략 가치(가는 큐브·색 수요·
 * 견제)가 있으므로 합법 목적지는 남긴다 — CLAUDE.md 정책 "본인 철도로 도달 불가한 목적지에는
 * 타인 경유 노출"(2ⓑ)과 일치. 숨김은 "본인 철도로도 갈 수 있는 목적지의 열등한 타인 경유"만.
 * 본인 철도 경로가 전무한 큐브는 전면 개방 유지(배달 가능성 보존).
 * ⚠️ 사람 전용 — 봇은 ΔVP(타인 수입 페널티)가 같은 판단을 하므로 미적용
 * (AI 결정 목적지가 여기서 숨겨지면 selectDestinationCity의 reachable 검사에 걸려 멈춘다).
 */
function gateMixedByCubeBest(
  routeOptions: { dest: HexCoord; options: RouteOption[] }[]
): { dest: HexCoord; options: RouteOption[] }[] {
  let globalOwnBest = -1;
  for (const r of routeOptions) {
    for (const o of r.options) {
      if (o.oppLinks === 0 && o.ownLinks > globalOwnBest) globalOwnBest = o.ownLinks;
    }
  }
  if (globalOwnBest < 0) return routeOptions;
  return routeOptions
    .map(r => {
      // 본인 철도 단독 경로가 없는 목적지 = 타인 경유가 유일한 길 → 그대로 노출
      const ownOnlyReachable = r.options.some(o => o.oppLinks === 0);
      if (!ownOnlyReachable) return r;
      return {
        dest: r.dest,
        // 내 수입이 큐브 최선을 **넘지 못하는** 타인 경유는 숨긴다 — 동률 포함
        // (2026-07-28 사용자 지시: 내 수입이 같으면 남에게 헌납일 뿐이라 선택지로도 두지 않는다)
        options: r.options.filter(o => o.oppLinks === 0 || o.ownLinks > globalOwnBest),
      };
    })
    .filter(r => r.options.length > 0);
}

/** 타인 철도 후보 디폴트 정렬용 플레이어 점수(VP = income×3 + 완성링크 트랙 − 주식×3).
 *  게임 종료 정산(GamePageClient)과 동일 공식 — 점수 낮은 주인의 경로가 디폴트가 된다. */
function ownerScoreOf(state: GameStore): Partial<Record<PlayerId, number>> {
  const scores: Partial<Record<PlayerId, number>> = {};
  for (const pid of state.activePlayers) {
    const p = state.players[pid];
    if (!p) continue;
    scores[pid] = calculateVictoryPoints(p.income, calculateTrackScore(state.board, pid), p.issuedShares, playerBonusVP(p));
  }
  return scores;
}

/** uiSlice가 제공하는 액션 — 인터페이스 정의는 gameStore(GameStore)에 그대로, Pick으로 참조 */
export type UiSlice = Pick<
  GameStore,
  | 'selectHex' | 'selectCube' | 'clearSelection' | 'cancelSelection'
  | 'setPreviewTrack' | 'setHighlightedHexes' | 'setMovePath'
  | 'selectSourceHex' | 'selectTargetHex' | 'selectExitDirection'
  | 'updateTrackPreview' | 'resetBuildMode'
  | 'showComplexTrackSelection' | 'hideComplexTrackSelection'
  | 'canRedirect' | 'selectTrackToRedirect' | 'hideRedirectSelection'
  | 'enterUrbanizationMode' | 'exitUrbanizationMode' | 'selectNewCityTile' | 'canPlaceNewCity'
  | 'selectDestinationCity' | 'startCubeAnimation' | 'advanceCubeAnimation'
  | 'selectRouteOption' | 'confirmRouteChoice'
  | 'selectRepopulationCube'
>;

// 반환 타입을 Pick으로 명시 → 액션 파라미터는 contextual typing으로 자동 추론 (원본과 동일 시그니처)
export function createUiSlice(set: Set, get: Get): UiSlice {
  return {
    selectHex: (coord) => {
      set((state) => ({
        ui: { ...state.ui, selectedHex: coord },
      }));
    },

    selectCube: (cityId, cubeIndex) => {
      const state = get();
      logAction('goodsMovement', 'selectCube', { player: state.currentPlayer, city: cityId, cubeIndex, turn: state.currentTurn });

      // 이미 이번 라운드에 이동했으면 리턴
      if (state.phaseState.playerMoves[state.currentPlayer]) {
        console.log('이미 이번 라운드에 이동했습니다.');
        return;
      }

      // 트랙 위 큐브 선택 (St. Lucia — 'track:<trackId>' 컨벤션, 미완성 링크여도 배달 가능)
      if (cityId.startsWith('track:')) {
        const trackId = cityId.slice('track:'.length);
        // 화물 선택 — 수송 가능한 후보 루트를 모두 로그 (같은 도시 여러 경로의 채택/탈락 포함)
        const deliveries = findTrackCubeDeliveries(
          state.board, trackId, effectiveEngineLevel(state.players, state.currentPlayer), state.currentPlayer,
          (cand) => logAction('goodsMovement', 'deliveryCandidate', { player: state.currentPlayer, trackId, ...cand }),
        );
        logAction('goodsMovement', 'trackCubeSelect', { player: state.currentPlayer, trackId, cities: deliveries.map(d => d.city.id) });
        if (deliveries.length === 0) {
          // 엔진 무제한으로 다시 탐색 → 엔진 부족(거리 초과)인지 vs 연결 자체가 없는지 구분
          const eng = effectiveEngineLevel(state.players, state.currentPlayer);
          const withMaxEngine = findTrackCubeDeliveries(state.board, trackId, Infinity, state.currentPlayer);
          if (withMaxEngine.length > 0) {
            logAction('goodsMovement', 'cubeUndeliverable', { trackId, reason: 'engineShort', engine: eng, cities: withMaxEngine.map(d => d.city.id) }, 'error');
            get().addLog(`엔진 레벨이 부족합니다 (현재 ${eng}) — Move Goods에서 Locomotive로 엔진을 올리면 이 화물을 배달할 수 있습니다`);
          } else {
            const stk = state.board.trackTiles.find(t => t.id === trackId);
            logAction('goodsMovement', 'cubeUndeliverable', {
              trackId, reason: 'noConnection',
              cube: stk?.cube, at: stk?.coord, edges: stk?.edges,
              sameColorCities: state.board.cities.filter(c => stk?.cube != null && cityAcceptsCube(c, stk.cube, state.board)).map(c => ({ id: c.id, c: c.coord })),
              tracks: state.board.trackTiles.map(t => ({ c: t.coord, e: t.edges, se: t.secondaryEdges ?? null, tt: t.trackType, o: t.owner, so: t.secondaryOwner ?? null, cube: t.cube ?? null })),
              spurs: (state.board.townSpurs ?? []).map(s => ({ t: s.townCoord, e: s.edge, o: s.owner })),
              towns: state.board.towns.map(t => ({ c: t.coord, ncc: t.newCityColor })),
            }, 'error');
            get().addLog('이 화물은 배달할 수 있는 도시가 없습니다 (트랙으로 연결된 같은 색 도시 필요)');
          }
          return;
        }
        logAction('goodsMovement', 'deliveryRoutes', { player: state.currentPlayer, trackId, routes: deliveries.map(d => ({ city: d.city.id, links: d.linkCount, own: d.ownIncome, opp: d.oppIncome })) });
        // 최적 경로(내 수입 최대 → 타인 수입 최소 → 링크 최대 — findRouteOptions 디폴트와 동일 기준)
        const best = deliveries.reduce((a, b) =>
          (b.ownIncome > a.ownIncome ||
            (b.ownIncome === a.ownIncome && (b.oppIncome < a.oppIncome ||
              (b.oppIncome === a.oppIncome && b.linkCount > a.linkCount)))) ? b : a
        );
        set({
          ui: {
            ...state.ui,
            selectedCube: { cityId, cubeIndex: 0 },
            reachableDestinations: deliveries.map(d => d.city.coord),
            movePath: [...best.pathCoords, best.city.coord],
            // 직전 도시 큐브의 경로 선택 상태 잔존 방지 (트랙 큐브는 경로 선택 UI 미사용)
            routeOptions: [],
            routeChoice: null,
          },
        });
        return;
      }

      // 마을 위 큐브 선택 (Western US — 'town:<townId>' 컨벤션). 마을은 도시처럼 출발점이 되며
      // 완성 링크를 따라 같은 색 도시로 배달된다(마을이 연결되어 있어야 함).
      // 도시 큐브와 동일하게 타인 철도 개방 — ⚠️ AI 결정(decideMoveGoods.collectFromSource)이
      // 마을 출발도 개방해 후보를 만들므로, 여기가 본인 철도만 보면 결정/실행 불일치로 AI가 멈춘다.
      if (cityId.startsWith('town:')) {
        const townId = cityId.slice('town:'.length);
        const town = state.board.towns.find(t => t.id === townId);
        if (!town || town.newCityColor !== null) return; // 도시화된 마을은 도시 큐브 경로로 처리
        const cubeColor = town.cubes[cubeIndex];
        if (!cubeColor) return;
        const player = state.players[state.currentPlayer];
        const townEngine = effectiveEngineLevel(state.players, state.currentPlayer);
        const reachable = findReachableDestinations(
          town.coord, state.board, state.currentPlayer, townEngine, cubeColor, govExtraOf(state), townEngine
        );
        const townOwnerScore = ownerScoreOf(state);
        const townLowGrav = player.selectedAction === 'lowGravitation';
        let townRouteOptions = reachable
          .map(dest => ({
            dest: dest.coord,
            options: findRouteOptions(
              town.coord, dest.coord, state.board, state.currentPlayer,
              townEngine, cubeColor, govExtraOf(state), townOwnerScore, townLowGrav
            ),
          }))
          .filter(r => r.options.length > 0);
        if (!player.isAI) townRouteOptions = gateMixedByCubeBest(townRouteOptions);
        // 도시 큐브와 같은 기준: 내 수입 최대 → 빌린 링크 최소 → 총 링크 최대
        let bestPath: HexCoord[] = [];
        let bestOwnT = -1;
        let bestOppT = Infinity;
        let bestTotalT = -1;
        for (const r of townRouteOptions) {
          const d = r.options[0];
          const better =
            d.ownLinks > bestOwnT
            || (d.ownLinks === bestOwnT && d.oppLinks < bestOppT)
            || (d.ownLinks === bestOwnT && d.oppLinks === bestOppT && d.totalLinks > bestTotalT);
          if (better) {
            bestOwnT = d.ownLinks; bestOppT = d.oppLinks; bestTotalT = d.totalLinks; bestPath = d.path;
          }
        }
        logAction('goodsMovement', 'townCubeSelect', { player: state.currentPlayer, town: townId, color: cubeColor, cities: reachable.map(c => c.id) });
        if (townRouteOptions.length === 0) get().addLog('이 마을 화물은 배달할 수 있는 도시가 없습니다 (트랙으로 연결된 같은 색 도시 필요)');
        set({
          ui: {
            ...state.ui,
            selectedCube: { cityId, cubeIndex },
            reachableDestinations: townRouteOptions.map(r => r.dest),
            movePath: bestPath,
            routeOptions: townRouteOptions,
            routeChoice: null,
          },
        });
        return;
      }

      const city = state.board.cities.find(c => c.id === cityId);
      if (!city) return;

      const cubeColor = city.cubes[cubeIndex];
      if (!cubeColor) return;

      const player = state.players[state.currentPlayer];

      // 도달 가능한 목적지 계산 — 타인 철도 개방(룰북): 타인 링크는 엔진 한도 내 무제한
      // (opponentExtra = engineLevel. 본인 철도 우선 게이트는 findRouteOptions가 적용).
      // 실효 엔진 = engineLevel + 지지 토큰 임시 +1 (Southern China, 다른 맵 항등)
      const cityEngine = effectiveEngineLevel(state.players, state.currentPlayer);
      const reachable = findReachableDestinations(
        city.coord,
        state.board,
        state.currentPlayer,
        cityEngine,
        cubeColor,
        govExtraOf(state), cityEngine
      );

      // 목적지별 후보 경로: 본인-철도-최선 + (내 수입이 더 커지는) 타인 경유 경로들.
      // 디폴트([0]) = 내 수입 최대 → 빌린 주인 중 VP 낮은 순 (findRouteOptions 정렬).
      const ownerScore = ownerScoreOf(state);
      const lowGravCredit = player.selectedAction === 'lowGravitation';
      let routeOptions = reachable
        .map(dest => ({
          dest: dest.coord,
          options: findRouteOptions(
            city.coord, dest.coord, state.board, state.currentPlayer,
            cityEngine, cubeColor, govExtraOf(state), ownerScore, lowGravCredit
          ),
        }))
        .filter(r => r.options.length > 0);
      // 사람만 큐브 단위 게이트 — 내 수입이 본인-철도-최선을 못 넘는 타인 경유 목적지 숨김
      if (!player.isAI) routeOptions = gateMixedByCubeBest(routeOptions);

      // 화물 선택 시 미리보기 골드 점선: 목적지별 디폴트 중
      // 내 수입 최대 → **빌린 링크 최소** → 총 링크 최대 (findRouteOptions 디폴트 정렬과 동일 기준).
      // ⚠️ oppLinks를 빠뜨리면 내 수입이 동률일 때 "총 링크가 긴 쪽"이 이겨, 본인 철도로 갈 수 있는데도
      //    남의 철도를 낀 더 먼 목적지가 점선으로 추천된다(2026-07-28 사용자 보고).
      let bestPath: HexCoord[] = [];
      let bestOwn = -1;
      let bestOpp = Infinity;
      let bestTotal = -1;
      for (const r of routeOptions) {
        const d = r.options[0];
        const better =
          d.ownLinks > bestOwn
          || (d.ownLinks === bestOwn && d.oppLinks < bestOpp)
          || (d.ownLinks === bestOwn && d.oppLinks === bestOpp && d.totalLinks > bestTotal);
        if (better) {
          bestOwn = d.ownLinks; bestOpp = d.oppLinks; bestTotal = d.totalLinks; bestPath = d.path;
        }
      }

      // 구조화 로그 — St. Lucia 트랙 큐브 선택과 동일한 형태로 후보/채택 경로 기록
      logAction('goodsMovement', 'cityCubeSelect', {
        player: state.currentPlayer, city: cityId, color: cubeColor,
        cities: reachable.map(c => c.id),
      });
      if (reachable.length === 0) {
        logAction('goodsMovement', 'cubeUndeliverable', {
          city: cityId, color: cubeColor, reason: 'noConnection',
          sameColorCities: state.board.cities.filter(c => cityAcceptsCube(c, cubeColor, state.board)).map(c => c.id),
        }, 'error');
        get().addLog('이 화물은 배달할 수 있는 도시가 없습니다 (트랙으로 연결된 같은 색 도시 필요)');
      } else {
        logAction('goodsMovement', 'deliveryRoutes', {
          player: state.currentPlayer, city: cityId,
          routes: routeOptions.map(r => ({
            dest: r.dest,
            options: r.options.map(o => ({ own: o.ownLinks, opp: o.oppLinks, owners: o.owners })),
          })),
          bestOwn,
        });
      }

      set({
        ui: {
          ...state.ui,
          selectedCube: { cityId, cubeIndex },
          reachableDestinations: routeOptions.map(r => r.dest),
          movePath: bestPath, // 최적 경로 골드 점선 미리보기 (St. Lucia와 동일)
          routeOptions,
          routeChoice: null,
        },
      });
    },

    clearSelection: () => {
      set((state) => ({
        ui: {
          ...state.ui,
          selectedHex: null,
          selectedCube: null,
          previewTrack: null,
          highlightedHexes: [],
          movePath: [],
          // 트랙 건설 UI 초기화
          buildMode: 'idle',
          sourceHex: null,
          buildableNeighbors: [],
          targetHex: null,
          entryEdge: null,
          exitDirections: [],
          // 복합 트랙 선택 UI 초기화
          complexTrackSelection: null,
          // 방향 전환 UI 초기화
          redirectTrackSelection: null,
          // 도시화 UI 초기화
          urbanizationMode: false,
          selectedNewCityTile: null,
          // Production UI 초기화
          productionMode: false,
          productionCubes: [],
          selectedProductionSlots: [],
          // 물품 이동 UI 초기화
          movingCube: null,
          reachableDestinations: [],
          routeOptions: [],
          routeChoice: null,
        },
      }));
    },

    cancelSelection: () => {
      set((state) => ({
        ui: {
          ...state.ui,
          // 트랙 건설 선택 취소
          buildMode: 'idle',
          sourceHex: null,
          buildableNeighbors: [],
          targetHex: null,
          entryEdge: null,
          exitDirections: [],
          previewTrack: null,
          highlightedHexes: [],
          selectedHex: null,
          // 복합 트랙 / 방향 전환 패널 닫기
          complexTrackSelection: null,
          redirectTrackSelection: null,
          // 도시화 선택 취소 (행동 자체는 유지 — 패널에서 다시 진입 가능)
          urbanizationMode: false,
          selectedNewCityTile: null,
          // 물품 이동 큐브 선택 취소 (진행 중 애니메이션 movingCube는 건드리지 않음)
          selectedCube: null,
          reachableDestinations: [],
          routeOptions: [],
          routeChoice: null,
          ...(state.ui.movingCube ? {} : { movePath: [] }),
        },
      }));
    },

    setPreviewTrack: (track) => {
      set((state) => ({
        ui: { ...state.ui, previewTrack: track },
      }));
    },

    setHighlightedHexes: (hexes) => {
      set((state) => ({
        ui: { ...state.ui, highlightedHexes: hexes },
      }));
    },

    setMovePath: (path) => {
      set((state) => ({
        ui: { ...state.ui, movePath: path },
      }));
    },

    // === Montréal Repopulation: 배치할 큐브 선택 (보드 도시 클릭으로 배치) ===
    selectRepopulationCube: (cubeColor) => {
      set((state) => ({ ui: { ...state.ui, repopulationCube: cubeColor } }));
    },

    // === 트랙 건설 UI ===
    selectSourceHex: (coord) => {
      const state = get();
      const currentPlayer = state.currentPlayer;
      // Montréal 정부 링크 건설 단계 — 정부 트랙/가닥을 "내 것"으로 취급하는 정부 모드
      const govMode = state.currentPhase === 'governmentLink';

      // 유효한 연결점인지 확인 (도시, 또는 플레이어의 트랙/진입 마을)
      if (!isValidConnectionPoint(coord, state.board, currentPlayer, govMode)) {
        return;
      }

      // 건설 가능한 이웃 헥스 계산 (교체/방향전환 포함). 건설 불가 경계 변 쪽은 제외(가이드에서 숨김).
      // 정부 모드는 교체/방향전환 불가 → allowReplace=false
      const neighbors = getBuildableNeighbors(coord, state.board, currentPlayer, !govMode, govMode)
        .filter(n => !isBlockedEdge(state.board, coord, n.coord));

      // 소스가 미완성 트랙(내 것/미소유)이면 방향 전환 가능한 방향의 이웃도 함께 하이라이트 —
      // 노란 칸 클릭 한 번 = 그 방향으로 방향 전환($2). 연장 후보와 서로소(현재 변 제외)라
      // 클릭 판정이 겹치지 않는다 (GameBoard가 같은 헬퍼로 판정). 정부 모드는 방향 전환 불가.
      const redirectTargets = govMode
        ? []
        : getRedirectTargetHexes(coord, state.board, currentPlayer)
            .filter(rt => !isBlockedEdge(state.board, coord, rt.coord));

      // 마을 가닥 후보 — 마을은 타일을 놓는 곳이 아니라 가닥으로 잇는 곳이라 위 연장 후보
      // (getBuildableNeighbors)에서 빠진다. 그래도 사용자에겐 "여기를 눌러야 이어진다"가
      // 보여야 하므로 같은 노란 칸으로 표시한다 — 마을 연결도 건설 카운트·비용을 쓰는
      // 엄연한 건설이다(제보 2026-08-10: 마을이 후보로 안 떠 연결 방법을 알 수 없었다).
      // 판정은 canBuildTownSpur를 그대로 호출해 표시=커밋을 보장한다(미러 금지).
      const spurTargets: HexCoord[] = [];
      for (const e of getConnectableEdges(coord, state.board, currentPlayer, govMode) ?? []) {
        const nb = getNeighborHex(coord, e, state.board);
        if (isBlockedEdge(state.board, coord, nb)) continue;
        if (!state.board.towns.some(t => hexCoordsEqual(t.coord, nb) && t.newCityColor === null)) continue;
        if (state.canBuildTownSpur(nb, getOppositeEdge(e))) spurTargets.push(nb);
      }

      // 노란 칸이 하나도 안 뜨는 흔한 원인 = 이번 턴 건설 제한 도달. 그 경우만 토스트로 안내
      // (그 외 "여기 방향 없음"은 다른 곳 클릭하면 되므로 노이즈 방지 차원에서 생략).
      if (neighbors.length === 0 && redirectTargets.length === 0 && spurTargets.length === 0) {
        const { builtTracksThisTurn: b, maxTracksThisTurn: m } = state.phaseState;
        if (b >= m) {
          useToastStore.getState().showToast(`이번 턴 건설 제한에 도달했어요 (${b}/${m})`);
        }
      }

      // 하이라이트할 헥스 목록 (연장 타깃 + 방향 전환 타깃 + 마을 가닥 타깃)
      const highlightedHexes = [
        ...neighbors.map(n => n.coord),
        ...redirectTargets.map(rt => rt.coord),
        ...spurTargets,
      ];

      set({
        ui: {
          ...state.ui,
          buildMode: 'source_selected',
          sourceHex: coord,
          buildableNeighbors: neighbors,
          highlightedHexes,
          selectedHex: coord,
          previewTrack: null,
          targetHex: null,
          entryEdge: null,
          exitDirections: [],
        },
      });
    },

    selectTargetHex: (coord) => {
      const state = get();

      if (state.ui.buildMode !== 'source_selected' || !state.ui.sourceHex) {
        return;
      }

      // 타겟이 건설 가능한 이웃인지 확인
      const neighbor = state.ui.buildableNeighbors.find(
        n => hexCoordsEqual(n.coord, coord)
      );

      if (!neighbor) {
        return;
      }

      // 나갈 수 있는 방향들 계산 (들어오는 방향 제외). 건설 불가 경계 변 쪽 방향은 제외(가이드에서 숨김).
      let exitDirs = getExitDirections(coord, neighbor.targetEdge, state.board)
        .filter(d => !isBlockedEdge(state.board, coord, d.neighborCoord));

      // 기존 트랙이 있는 헥스: 기존 트랙의 엣지와 겹치는 방향 제외 (복합 트랙은 겹치지 않는 엣지만 허용)
      const existingTrack = state.board.trackTiles.find(
        t => hexCoordsEqual(t.coord, coord)
      );
      if (existingTrack) {
        exitDirs = exitDirs.filter(d =>
          !existingTrack.edges.includes(d.exitEdge)
        );
      }

      // 나갈 방향이 하나도 없으면 target_selected로 넘어가지 않는다 — 넘어가면 노란 칸이
      // 통째로 사라져 "눌렀는데 아무 일도 안 일어나고 선택도 풀린" 상태가 된다(무반응으로 보임).
      // 출발점 선택을 유지해 다른 칸을 이어서 고를 수 있게 하고, 이유만 알린다.
      if (exitDirs.length === 0) {
        useToastStore.getState().showToast('이 칸은 트랙이 나갈 방향이 없어요 (맵 끝·호수·기존 트랙과 겹침)');
        return;
      }

      // 하이라이트: 나갈 수 있는 방향의 이웃 헥스들
      const highlightedHexes = exitDirs.map(d => d.neighborCoord);

      set({
        ui: {
          ...state.ui,
          buildMode: 'target_selected',
          targetHex: coord,
          entryEdge: neighbor.targetEdge,
          exitDirections: exitDirs,
          highlightedHexes,
          selectedHex: coord,
          previewTrack: null,
        },
      });
    },

    selectExitDirection: (exitEdge) => {
      const state = get();
      const targetHex = state.ui.targetHex;
      const entryEdge = state.ui.entryEdge;

      if (state.ui.buildMode !== 'target_selected' || !targetHex || entryEdge === null) {
        return false;
      }

      // 유효한 출구인지 확인
      const exitDir = state.ui.exitDirections.find(d => d.exitEdge === exitEdge);
      if (!exitDir) {
        return false;
      }

      // 트랙 건설: targetHex에 트랙 배치
      // edges: [들어오는 엣지, 나가는 엣지]
      const edges: [number, number] = [entryEdge, exitEdge];

      // 기존 트랙이 있는지 확인
      const existingTrack = state.board.trackTiles.find(
        t => hexCoordsEqual(t.coord, targetHex)
      );

      // 기존 단순 트랙이면 복합 트랙 선택 패널 표시 (자기 트랙/상대 트랙 모두)
      if (existingTrack && existingTrack.trackType === 'simple') {
        // 엣지가 겹치지 않는지 확인
        const edgesOverlap =
          edges[0] === existingTrack.edges[0] ||
          edges[0] === existingTrack.edges[1] ||
          edges[1] === existingTrack.edges[0] ||
          edges[1] === existingTrack.edges[1];

        if (!edgesOverlap) {
          // 복합 트랙 선택 패널 표시
          state.showComplexTrackSelection(targetHex, edges);
          return true;
        }
      }

      const success = state.buildTrack(targetHex, edges);

      if (success) {
        // 빌드 모드 초기화
        state.resetBuildMode();
      } else {
        // 실패 사유를 토스트로 안내 (대개 현금 부족 — canBuildTrack은 통과했으나 비용 미달).
        // 이 경로는 사람 클릭(board)에서만 오므로 AI엔 안 뜬다.
        useToastStore.getState().showToast(getBuildBlockReason(state, targetHex, edges));
      }

      return success;
    },

    updateTrackPreview: (targetCoord) => {
      const state = get();

      // source_selected 모드: 타겟 헥스 위에서 직선 트랙 미리보기
      if (state.ui.buildMode === 'source_selected' && state.ui.sourceHex) {
        const neighbor = state.ui.buildableNeighbors.find(
          n => hexCoordsEqual(n.coord, targetCoord)
        );

        if (neighbor) {
          // 직선 트랙 미리보기 (반대편 엣지)
          const oppositeEdge = (neighbor.targetEdge + 3) % 6;
          set({
            ui: {
              ...state.ui,
              previewTrack: {
                coord: targetCoord,
                edges: [neighbor.targetEdge, oppositeEdge] as [number, number],
              },
            },
          });
        } else {
          set({ ui: { ...state.ui, previewTrack: null } });
        }
        return;
      }

      // target_selected 모드: 나가는 방향 위에서 커브/직선 트랙 미리보기
      if (state.ui.buildMode === 'target_selected' && state.ui.targetHex && state.ui.entryEdge !== null) {
        // 마우스가 있는 헥스가 exit direction에 해당하는지 확인
        const exitDir = state.ui.exitDirections.find(
          d => hexCoordsEqual(d.neighborCoord, targetCoord)
        );

        if (exitDir) {
          set({
            ui: {
              ...state.ui,
              previewTrack: {
                coord: state.ui.targetHex,
                edges: [state.ui.entryEdge, exitDir.exitEdge] as [number, number],
              },
            },
          });
        } else {
          set({ ui: { ...state.ui, previewTrack: null } });
        }
      }
    },

    resetBuildMode: () => {
      set((state) => ({
        ui: {
          ...state.ui,
          buildMode: 'idle',
          sourceHex: null,
          buildableNeighbors: [],
          highlightedHexes: [],
          previewTrack: null,
          selectedHex: null,
          targetHex: null,
          entryEdge: null,
          exitDirections: [],
        },
      }));
    },

    // === 복합 트랙 UI ===
    showComplexTrackSelection: (coord, newEdges) => {
      set((state) => ({
        ui: {
          ...state.ui,
          complexTrackSelection: { coord, newEdges },
        },
      }));
    },

    hideComplexTrackSelection: () => {
      set((state) => ({
        ui: {
          ...state.ui,
          complexTrackSelection: null,
        },
      }));
    },

    // === 트랙 방향 전환 ===
    canRedirect: (coord) => {
      const state = get();
      return canRedirectTrack(coord, state.board, state.currentPlayer);
    },

    selectTrackToRedirect: (coord) => {
      const state = get();
      const currentPlayer = state.currentPlayer;

      // 방향 전환 가능한지 확인 + 대상 경로 선택 (복합 타일 — redirectTrack과 동일 픽 로직 공유)
      const redirectPath = pickRedirectPath(coord, state.board, currentPlayer);
      if (!redirectPath) {
        return false;
      }

      // 방향 전환 가능한 엣지 정보 가져오기
      const redirectInfo = getRedirectableEdges(coord, state.board, currentPlayer, redirectPath);
      if (!redirectInfo) return false;

      const { isEndpoint, connectedEdge } = isEndpointOfIncompleteSection(coord, state.board, redirectPath);
      if (!isEndpoint || connectedEdge === null) return false;

      // 방향 전환 선택 UI 표시
      set({
        ui: {
          ...state.ui,
          buildMode: 'redirect_selected',
          selectedHex: coord,
          redirectTrackSelection: {
            coord,
            connectedEdge,
            currentOpenEdge: redirectInfo.currentOpenEdge,
            availableEdges: redirectInfo.availableEdges,
          },
        },
      });

      return true;
    },

    hideRedirectSelection: () => {
      set((state) => ({
        ui: {
          ...state.ui,
          buildMode: 'idle',
          selectedHex: null,
          redirectTrackSelection: null,
        },
      }));
    },

    // === 도시화 (Urbanization) ===
    enterUrbanizationMode: () => {
      const state = get();
      const currentPlayer = state.currentPlayer;
      const player = state.players[currentPlayer];

      // Urbanization 행동을 선택한 플레이어만 가능
      if (player.selectedAction !== 'urbanization') {
        return;
      }

      set({
        ui: {
          ...state.ui,
          urbanizationMode: true,
          selectedNewCityTile: null,
        },
      });
    },

    exitUrbanizationMode: () => {
      set((state) => ({
        ui: {
          ...state.ui,
          urbanizationMode: false,
          selectedNewCityTile: null,
        },
      }));
    },

    selectNewCityTile: (tileId) => {
      const state = get();

      // 이미 사용된 타일인지 확인
      const tile = state.newCityTiles.find(t => t.id === tileId);
      if (!tile || tile.used) {
        return;
      }

      set({
        ui: {
          ...state.ui,
          selectedNewCityTile: tileId,
        },
      });
    },

    canPlaceNewCity: (townCoord) => {
      const state = get();

      // 도시화 모드인지 확인
      if (!state.ui.urbanizationMode) return false;

      // 신규 도시 타일이 선택되었는지 확인
      if (!state.ui.selectedNewCityTile) return false;

      // 해당 좌표에 마을이 있는지 확인
      const town = state.board.towns.find(
        t => hexCoordsEqual(t.coord, townCoord)
      );
      if (!town) return false;

      // 이미 도시화된 마을인지 확인
      if (town.newCityColor !== null) return false;

      return true;
    },

    // === 물품 이동 UI ===
    selectDestinationCity: (coord) => {
      const state = get();
      if (!state.ui.selectedCube) return;

      // 도달 가능한 목적지인지 확인
      const isReachable = state.ui.reachableDestinations.some(
        d => hexCoordsEqual(d, coord)
      );
      if (!isReachable) return;

      // 출발 도시 정보
      const sourceCityId = state.ui.selectedCube.cityId;
      const cubeIndex = state.ui.selectedCube.cubeIndex;

      // 트랙 위 큐브 배달 (St. Lucia)
      if (sourceCityId.startsWith('track:')) {
        const destCity = state.board.cities.find(c => hexCoordsEqual(c.coord, coord));
        if (destCity) {
          state.moveTrackCube(sourceCityId.slice('track:'.length), destCity.id);
        }
        return;
      }

      // 마을 위 큐브 배달 (Western US) — 마을 좌표에서 일반 배달과 동일 흐름 (타인 철도 개방 동일)
      if (sourceCityId.startsWith('town:')) {
        const town = state.board.towns.find(t => t.id === sourceCityId.slice('town:'.length));
        if (!town) return;
        const cubeColor = town.cubes[cubeIndex];
        if (!cubeColor) return;

        if (state.ui.routeChoice && hexCoordsEqual(state.ui.routeChoice.dest, coord)) {
          get().confirmRouteChoice();
          return;
        }

        const player = state.players[state.currentPlayer];
        const options = state.ui.routeOptions.find(r => hexCoordsEqual(r.dest, coord))?.options
          ?? findRouteOptions(
            town.coord, coord, state.board, state.currentPlayer,
            effectiveEngineLevel(state.players, state.currentPlayer), cubeColor, govExtraOf(state), ownerScoreOf(state),
            player.selectedAction === 'lowGravitation'
          );
        if (options.length === 0) return;
        if (options.length === 1 || state.players[state.currentPlayer]?.isAI) {
          state.startCubeAnimation(options[0].path, cubeColor);
          return;
        }
        logAction('goodsMovement', 'routeChoiceOpen', {
          player: state.currentPlayer, dest: coord,
          options: options.map(o => ({ own: o.ownLinks, opp: o.oppLinks, owners: o.owners })),
        });
        set({
          ui: {
            ...state.ui,
            routeChoice: { dest: coord, options, selectedIndex: 0 },
            movePath: options[0].path,
          },
        });
        return;
      }

      const sourceCity = state.board.cities.find(c => c.id === sourceCityId);
      if (!sourceCity) return;

      const cubeColor = sourceCity.cubes[cubeIndex];
      if (!cubeColor) return;

      // 같은 목적지의 경로 선택이 이미 열려 있으면 = 목적지 재클릭 → 현재 선택 경로로 확정
      if (state.ui.routeChoice && hexCoordsEqual(state.ui.routeChoice.dest, coord)) {
        get().confirmRouteChoice();
        return;
      }

      // 후보 경로 (selectCube가 계산해둔 것 — 방어적으로 없으면 재계산)
      const player = state.players[state.currentPlayer];
      const options = state.ui.routeOptions.find(r => hexCoordsEqual(r.dest, coord))?.options
        ?? findRouteOptions(
          sourceCity.coord, coord, state.board, state.currentPlayer,
          effectiveEngineLevel(state.players, state.currentPlayer), cubeColor, govExtraOf(state), ownerScoreOf(state),
          player.selectedAction === 'lowGravitation'
        );
      if (options.length === 0) return;

      // 후보 1개 = 기존 UX 그대로 즉시 커밋. 봇도 즉시 커밋(경로 선택 UI 없이 디폴트 [0]) —
      // AI 결정(decideMoveGoods)이 같은 findRouteOptions 디폴트로 평가했으므로 일치.
      if (options.length === 1 || state.players[state.currentPlayer]?.isAI) {
        state.startCubeAnimation(options[0].path, cubeColor);
        return;
      }

      // 후보 여러 개 → 경로 선택 모드 (디폴트 [0] = 내 수입 최대 → 최저 VP 주인)
      logAction('goodsMovement', 'routeChoiceOpen', {
        player: state.currentPlayer, dest: coord,
        options: options.map(o => ({ own: o.ownLinks, opp: o.oppLinks, owners: o.owners })),
      });
      set({
        ui: {
          ...state.ui,
          routeChoice: { dest: coord, options, selectedIndex: 0 },
          movePath: options[0].path,
        },
      });
    },

    selectRouteOption: (index) => {
      set((state) => {
        const rc = state.ui.routeChoice;
        if (!rc || index < 0 || index >= rc.options.length) return state;
        return {
          ui: { ...state.ui, routeChoice: { ...rc, selectedIndex: index }, movePath: rc.options[index].path },
        };
      });
    },

    confirmRouteChoice: () => {
      const state = get();
      const rc = state.ui.routeChoice;
      if (!rc || !state.ui.selectedCube) return;
      const sel = rc.options[rc.selectedIndex];
      // 경로 선택 UI는 도시·마을 큐브 공용 (St.Lucia 트랙 큐브는 기존 단일 경로 흐름)
      const scid = state.ui.selectedCube.cityId;
      const cubeColor = scid.startsWith('town:')
        ? state.board.towns.find(t => t.id === scid.slice('town:'.length))?.cubes[state.ui.selectedCube.cubeIndex]
        : state.board.cities.find(c => c.id === scid)?.cubes[state.ui.selectedCube.cubeIndex];
      if (!sel || !cubeColor) return;
      logAction('goodsMovement', 'routeChoiceConfirm', {
        player: state.currentPlayer, own: sel.ownLinks, opp: sel.oppLinks, owners: sel.owners,
      });
      state.startCubeAnimation(sel.path, cubeColor);
    },

    startCubeAnimation: (path, color) => {
      const state = get();
      if (!state.ui.selectedCube) return;

      // 출발지에서 큐브 즉시 제거 (도시 또는 마을)
      const sourceCityId = state.ui.selectedCube.cityId;
      const cubeIndex = state.ui.selectedCube.cubeIndex;
      const isTownSource = sourceCityId.startsWith('town:');
      const sourceTownId = isTownSource ? sourceCityId.slice('town:'.length) : null;

      const newCities = isTownSource ? state.board.cities : state.board.cities.map(city => {
        if (city.id === sourceCityId) {
          const newCubes = [...city.cubes];
          newCubes.splice(cubeIndex, 1);
          return { ...city, cubes: newCubes };
        }
        return city;
      });
      const newTowns = isTownSource ? state.board.towns.map(town => {
        if (town.id === sourceTownId) {
          const newCubes = [...town.cubes];
          newCubes.splice(cubeIndex, 1);
          return { ...town, cubes: newCubes };
        }
        return town;
      }) : state.board.towns;

      // 실행 컨텍스트 캡처 (completeCubeMove에서 사용)
      const context: MovingCubeContext = {
        playerId: state.currentPlayer,
        phase: state.currentPhase,
        moveRound: state.phaseState.moveGoodsRound,
      };

      set({
        board: {
          ...state.board,
          cities: newCities,
          towns: newTowns,
        },
        ui: {
          ...state.ui,
          movingCube: {
            color,
            path,
            currentIndex: 0,
            context,  // 캡처된 컨텍스트 저장
          },
          movePath: path,
          selectedCube: null,
          reachableDestinations: [],
          routeOptions: [],
          routeChoice: null,
        },
      });
    },

    advanceCubeAnimation: () => {
      set((state) => {
        if (!state.ui.movingCube) return state;

        const nextIndex = state.ui.movingCube.currentIndex + 1;

        if (nextIndex >= state.ui.movingCube.path.length) {
          // 애니메이션 완료
          return state;
        }

        return {
          ui: {
            ...state.ui,
            movingCube: {
              ...state.ui.movingCube,
              currentIndex: nextIndex,
            },
          },
        };
      });
    },
  };
}
