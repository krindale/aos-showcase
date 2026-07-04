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
import { HexCoord, MovingCubeContext } from '@/types/game';
import {
  isValidConnectionPoint,
  canRedirectTrack,
  getRedirectableEdges,
  isEndpointOfIncompleteSection,
} from '@/utils/trackValidation';
import {
  getBuildableNeighbors,
  getExitDirections,
  hexCoordsEqual,
  findLongestPath,
  findReachableDestinations,
  findTrackCubeDeliveries,
  countPathLinks,
  cityAcceptsCube,
  isBlockedEdge,
} from '@/utils/hexGrid';
import { logAction } from '@/utils/debugConfig';
import { useToastStore } from '../toastStore';
import { getBuildBlockReason } from '../helpers/buildReason';

type Set = StoreApi<GameStore>['setState'];
type Get = StoreApi<GameStore>['getState'];

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
          state.board, trackId, state.players[state.currentPlayer]?.engineLevel ?? 1, state.currentPlayer,
          (cand) => logAction('goodsMovement', 'deliveryCandidate', { player: state.currentPlayer, trackId, ...cand }),
        );
        logAction('goodsMovement', 'trackCubeSelect', { player: state.currentPlayer, trackId, cities: deliveries.map(d => d.city.id) });
        if (deliveries.length === 0) {
          // 엔진 무제한으로 다시 탐색 → 엔진 부족(거리 초과)인지 vs 연결 자체가 없는지 구분
          const eng = state.players[state.currentPlayer]?.engineLevel ?? 1;
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
        logAction('goodsMovement', 'deliveryRoutes', { player: state.currentPlayer, trackId, routes: deliveries.map(d => ({ city: d.city.id, links: d.linkCount, oppLinks: d.oppLinks })) });
        // 최적 경로(상대철도 적고 → 링크 긴=수입 큰 순)를 골라 하이라이트(movePath)로 표시
        const best = deliveries.reduce((a, b) =>
          (b.oppLinks < a.oppLinks || (b.oppLinks === a.oppLinks && b.linkCount > a.linkCount)) ? b : a
        );
        set({
          ui: {
            ...state.ui,
            selectedCube: { cityId, cubeIndex: 0 },
            reachableDestinations: deliveries.map(d => d.city.coord),
            movePath: [...best.pathCoords, best.city.coord],
          },
        });
        return;
      }

      // 마을 위 큐브 선택 (Western US — 'town:<townId>' 컨벤션). 마을은 도시처럼 출발점이 되며
      // 완성 링크를 따라 같은 색 도시로 배달된다(마을이 연결되어 있어야 함).
      if (cityId.startsWith('town:')) {
        const townId = cityId.slice('town:'.length);
        const town = state.board.towns.find(t => t.id === townId);
        if (!town || town.newCityColor !== null) return; // 도시화된 마을은 도시 큐브 경로로 처리
        const cubeColor = town.cubes[cubeIndex];
        if (!cubeColor) return;
        const player = state.players[state.currentPlayer];
        const reachable = findReachableDestinations(
          town.coord, state.board, state.currentPlayer, player.engineLevel, cubeColor
        );
        let bestPath: HexCoord[] = [];
        let bestLinks = -1;
        for (const dest of reachable) {
          const p = findLongestPath(town.coord, dest.coord, state.board, state.currentPlayer, player.engineLevel, cubeColor);
          if (p) { const links = countPathLinks(p, state.board); if (links > bestLinks) { bestLinks = links; bestPath = p; } }
        }
        logAction('goodsMovement', 'townCubeSelect', { player: state.currentPlayer, town: townId, color: cubeColor, cities: reachable.map(c => c.id) });
        if (reachable.length === 0) get().addLog('이 마을 화물은 배달할 수 있는 도시가 없습니다 (트랙으로 연결된 같은 색 도시 필요)');
        set({
          ui: { ...state.ui, selectedCube: { cityId, cubeIndex }, reachableDestinations: reachable.map(c => c.coord), movePath: bestPath },
        });
        return;
      }

      const city = state.board.cities.find(c => c.id === cityId);
      if (!city) return;

      const cubeColor = city.cubes[cubeIndex];
      if (!cubeColor) return;

      const player = state.players[state.currentPlayer];

      // 도달 가능한 목적지 계산
      const reachable = findReachableDestinations(
        city.coord,
        state.board,
        state.currentPlayer,
        player.engineLevel,
        cubeColor
      );

      // 화물 선택 시 최적 경로(최대 링크=최대 수입)를 골라 골드 점선으로 미리보기 표시 (모든 맵 공통).
      // 사용자가 목적지를 클릭하면 moveGoods가 그 목적지로 경로를 다시 계산해 이동한다.
      let bestPath: HexCoord[] = [];
      let bestLinks = -1;
      for (const dest of reachable) {
        const p = findLongestPath(
          city.coord, dest.coord, state.board, state.currentPlayer, player.engineLevel, cubeColor
        );
        if (p) {
          const links = countPathLinks(p, state.board);
          if (links > bestLinks) { bestLinks = links; bestPath = p; }
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
          routes: reachable.map(c => ({ city: c.id })), bestLinks,
        });
      }

      set({
        ui: {
          ...state.ui,
          selectedCube: { cityId, cubeIndex },
          reachableDestinations: reachable.map(c => c.coord),
          movePath: bestPath, // 최적 경로 골드 점선 미리보기 (St. Lucia와 동일)
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

    // === 트랙 건설 UI ===
    selectSourceHex: (coord) => {
      const state = get();
      const currentPlayer = state.currentPlayer;

      // 유효한 연결점인지 확인 (도시, 또는 플레이어의 트랙/진입 마을)
      if (!isValidConnectionPoint(coord, state.board, currentPlayer)) {
        return;
      }

      // 건설 가능한 이웃 헥스 계산 (교체/방향전환 포함). 건설 불가 경계 변 쪽은 제외(가이드에서 숨김).
      const neighbors = getBuildableNeighbors(coord, state.board, currentPlayer, true)
        .filter(n => !isBlockedEdge(state.board, coord, n.coord));

      // 노란 칸이 하나도 안 뜨는 흔한 원인 = 이번 턴 건설 제한 도달. 그 경우만 토스트로 안내
      // (그 외 "여기 방향 없음"은 다른 곳 클릭하면 되므로 노이즈 방지 차원에서 생략).
      if (neighbors.length === 0) {
        const { builtTracksThisTurn: b, maxTracksThisTurn: m } = state.phaseState;
        if (b >= m) {
          useToastStore.getState().showToast(`이번 턴 건설 제한에 도달했어요 (${b}/${m})`);
        }
      }

      // 하이라이트할 헥스 목록
      const highlightedHexes = neighbors.map(n => n.coord);

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

      // 방향 전환 가능한지 확인
      if (!canRedirectTrack(coord, state.board, currentPlayer)) {
        return false;
      }

      // 방향 전환 가능한 엣지 정보 가져오기
      const redirectInfo = getRedirectableEdges(coord, state.board);
      if (!redirectInfo) return false;

      const { isEndpoint, connectedEdge } = isEndpointOfIncompleteSection(coord, state.board);
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

      // 마을 위 큐브 배달 (Western US) — 마을 좌표에서 일반 배달과 동일 흐름
      if (sourceCityId.startsWith('town:')) {
        const town = state.board.towns.find(t => t.id === sourceCityId.slice('town:'.length));
        if (!town) return;
        const cubeColor = town.cubes[cubeIndex];
        if (!cubeColor) return;
        const player = state.players[state.currentPlayer];
        const path = findLongestPath(town.coord, coord, state.board, state.currentPlayer, player.engineLevel, cubeColor);
        if (!path || path.length < 2) return;
        state.startCubeAnimation(path, cubeColor);
        return;
      }

      const sourceCity = state.board.cities.find(c => c.id === sourceCityId);
      if (!sourceCity) return;

      const cubeColor = sourceCity.cubes[cubeIndex];
      if (!cubeColor) return;

      const player = state.players[state.currentPlayer];

      // 가장 긴 경로 찾기
      const path = findLongestPath(
        sourceCity.coord,
        coord,
        state.board,
        state.currentPlayer,
        player.engineLevel,
        cubeColor
      );

      if (!path || path.length < 2) return;

      // 애니메이션 시작
      state.startCubeAnimation(path, cubeColor);
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
