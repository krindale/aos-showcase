// Phase IV 트랙 건설 slice (2026-07-03 스텝 3e 분리 — 로직 무변경, 코드 그대로 이동)
//
// 건설 커밋 액션 전부: canBuildTrack/buildTrack · 복합(교차/공존) · 마을 가닥 · 직결 링크 ·
// 방향 전환(redirectTrack) · 대륙횡단 감지 적용(applyTranscontinental).
// 건설 제한 카운트·비용·검증 규칙이 한 파일에 응집. 도시화 배치(placeNewCity)는
// undo/디스플레이 보충과 얽혀 gameStore에 잔류.
// GameStore 타입은 순환을 피하기 위해 type-only import (다른 slice와 동일 패턴).

import type { StoreApi } from 'zustand';
import type { GameStore } from '../gameStore';
import { HexCoord, TrackTile, GAME_CONSTANTS, TRACK_REPLACE_COSTS } from '@/types/game';
import { getMapProfile } from '@/maps/getMapProfile';
import {
  validateFirstTrackRule,
  validateTrackConnection,
  validateGovernmentTrackConnection,
  playerHasTrack,
  canRedirectTrack,
  getRedirectableEdges,
  isEndpointOfIncompleteSection,
  isTrackPartOfCompletedLink,
  touchesClaimableUnownedTrack,
} from '@/utils/trackValidation';
import { hexCoordsEqual, getNeighborHex } from '@/utils/hexGrid';
import { debugLog, logAction } from '@/utils/debugConfig';
import { captureUndo, undoSnapshots } from '../helpers/undo';
import { crossesBlockedEdge, findMissingTownSpurs, touchesMasterNetwork, findClaimableSectionKeys } from '../helpers/boardRules';
import { applyEngineerDiscount, hasEngineerDiscount } from '../helpers/engineerDiscount';
import { computeTranscontinental } from '../helpers/transcontinental';

type Set = StoreApi<GameStore>['setState'];
type Get = StoreApi<GameStore>['getState'];

// 마을 가닥(스퍼) 건설 비용 — 가닥은 타일 건설 시 자동 생성되지 않고,
// 마을 클릭(buildTownSpur)으로만 별도 건설된다 (첫 진입 1카운트, 비용 가닥당 기본 $1).
// 맵 오버라이드: MapProfile.townSpurCost (Moon $2 — 공식 "마을 \$2+트랙당\$1"의 스퍼 근사)
const townSpurCost = (mapId: string) => getMapProfile(mapId).townSpurCost;

/** buildSlice가 제공하는 액션 — 인터페이스 정의는 gameStore(GameStore)에 그대로, Pick으로 참조 */
export type BuildSlice = Pick<
  GameStore,
  | 'canBuildTrack' | 'buildTrack' | 'applyTranscontinental' | 'dismissTranscontinental'
  | 'canBuildComplexTrack' | 'buildComplexTrack'
  | 'canBuildTownSpur' | 'buildTownSpur' | 'buildDirectLink'
  | 'redirectTrack'
>;

export function createBuildSlice(set: Set, get: Get): BuildSlice {
  return {
    canBuildTrack: (coord, edges) => {
      const state = get();
      const currentPlayer = state.currentPlayer;

      // 트랙 제한 확인 — 타일 1개만 카운트 (마을 가닥은 자동 생성 없이 마을 클릭으로 별도 건설).
      if (state.phaseState.builtTracksThisTurn + 1 > state.phaseState.maxTracksThisTurn) {
        return false;
      }

      const { board } = state;

      // 유효한 헥스인지 확인 (도시, 마을, 호수 제외)
      // 마을은 도시처럼 타일 없는 연결점 — 인접 트랙이 변에 닿으면 연결됨
      const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
      if (isCity) return false;
      const isTownHex = board.towns.some(t => hexCoordsEqual(t.coord, coord) && t.newCityColor === null);
      if (isTownHex) return false;

      const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
      if (hexTile && hexTile.terrain === 'lake') return false;

      // 철도 건설 불가 경계 변을 넘는 트랙 금지 (한국 산맥 등)
      if (crossesBlockedEdge(board, coord, edges)) return false;

      // 이미 트랙이 있는지 확인
      const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));

      const profileForGov = getMapProfile(state.mapId);
      // === Montréal 정부 링크 건설 (governmentLink 단계) ===
      if (state.currentPhase === 'governmentLink') {
        if (!profileForGov.governmentLinks) return false;
        // 정부는 새 타일만 (교체/방향 전환 불가)
        if (existingTrack) return false;
        // 링크 1개 제한: 이번 턴 정부 타일이 이미 완성 링크를 이뤘으면 추가 건설 불가
        const govThisTurn = board.trackTiles.filter(
          t => t.isGovernment && t.builtTurn === state.currentTurn
        );
        if (govThisTurn.some(t => isTrackPartOfCompletedLink(t.coord, board))) return false;
        // 연결성: 도시(Station) 인접 / 정부 트랙 / 정부 가닥 마을에만 이어 짓기
        if (!validateGovernmentTrackConnection(coord, edges, board)) return false;
        // 마스터 네트워크: 첫 정부 링크(트랙 0개)만 예외 — 이후엔 전체 네트워크에 닿아야 함
        if (!touchesMasterNetwork(board, coord, edges, profileForGov.masterNetworkSeedCityId)) return false;
        return true;
      }

      if (existingTrack) {
        // 리다이렉트 가능 여부 확인
        if (!canRedirectTrack(coord, board, currentPlayer)) {
          return false;
        }
      }

      // 연결성 검증 (Western US: 시작도시 제한 + 대륙횡단 전 연속성 강제)
      const hasExistingTrack = playerHasTrack(board, currentPlayer);
      const profile = profileForGov;
      const allowedStartCityIds = profile.startingCitiesOnly
        ? new Set(board.cities.filter(c => profile.isStartingCity(c)).map(c => c.id))
        : undefined;
      const requireNetwork = profile.requireContiguousUntilTranscontinental
        && !state.players[currentPlayer]?.transcontinental;

      if (!hasExistingTrack) {
        // 첫 트랙: (시작) 도시에 인접해야 함.
        // 예외(룰 IV 인수 연장): 내 트랙이 0개여도 미소유 미완성 구간에 변으로 이어 지으면 허용 —
        // 그 구간은 이미 도시로 이어져 있고, 커밋 시 구간 전체가 내 소유가 되므로 "궁극적으로
        // 도시 연결" 규칙을 만족한다. (내 트랙이 전부 미소유로 풀린 직후 인수가 막히던 실플레이
        // 버그 — 2026-07-22 브라우저 검증에서 발견.) Western US 연속성(requireNetwork) 중엔
        // 분리 구간 인수가 연속성을 깨므로 기존대로 불허.
        // Montréal 마스터 네트워크: 첫 트랙 연결성은 아래 touchesMasterNetwork가 대신 보장한다
        // (네트워크 정거장 = 도시 / 정부 가닥이 닿은 마을 / 아무 트랙). 도시 인접만 보는
        // validateFirstTrackRule은 정부 철도가 연결된 마을에서 첫 트랙 시작을 막으므로 건너뛴다.
        // ⚠️ 단 보드에 트랙이 하나도 없으면(정부 링크 미건설) touchesMasterNetwork가 true라
        //    아무 헥스에나 고립 트랙이 허용되므로, 그때는 표준 첫 트랙 규칙(도시 인접)을 유지한다.
        const boardHasNetwork = board.trackTiles.length > 0 || (board.townSpurs ?? []).length > 0;
        const skipFirstTrackRule = profile.masterNetwork && boardHasNetwork;
        if (!skipFirstTrackRule &&
            !validateFirstTrackRule(coord, edges, board, allowedStartCityIds)) {
          if (requireNetwork || !touchesClaimableUnownedTrack(coord, edges, board)) {
            return false;
          }
        }
      } else {
        // 후속 트랙: 기존 트랙/도시에 연결되어야 함 (연속성 강제 시 분리 구간 금지)
        if (!validateTrackConnection(coord, edges, board, currentPlayer, requireNetwork)) {
          return false;
        }
      }

      // Montréal 마스터 네트워크: 보드 위 모든 트랙의 총합이 연속이어야 함 —
      // 새 타일은 기존 네트워크(아무 트랙, 트랙이 닿은 정거장)에 닿아야 한다
      if (profile.masterNetwork && !touchesMasterNetwork(board, coord, edges, profile.masterNetworkSeedCityId)) {
        return false;
      }

      return true;
    },

    applyTranscontinental: () => {
      const result = computeTranscontinental(get(), get().currentPlayer);
      if (!result) return;
      set({
        players: result.players,
        transcontinentalAwarded: result.awarded,
        // 보너스 수령 or 연속성 해제가 발생한 순간 — 사람에게 팝업으로 알림 (모달이 닫으면 초기화).
        // key = 발생 시각: 온라인에서 이 이벤트가 스냅샷에 실려 게스트에게 반복 전파돼도
        // 모달이 같은 key는 다시 열지 않아 "건설할 때마다 팝업" 버그를 막는다.
        transcontinentalEvent: { ...result.event, key: Date.now() },
      });
      if (result.log) get().addLog(result.log);
    },

    /** 대륙횡단 팝업 닫기 — 이벤트 초기화. */
    dismissTranscontinental: () => set({ transcontinentalEvent: null }),

    buildTrack: (coord, edges) => {
      const state = get();
      logAction('trackBuilding', 'buildTrack', { player: state.currentPlayer, coord, edges, turn: state.currentTurn });

      if (!state.canBuildTrack(coord, edges)) {
        // 실패 원인 로깅 (디버깅용)
        const { board } = state;
        const playerForLog = state.players[state.currentPlayer];
        const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
        const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
        const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
        const hasExisting = playerHasTrack(board, state.currentPlayer);
        const isConnected = hasExisting
          ? validateTrackConnection(coord, edges, board, state.currentPlayer)
          : validateFirstTrackRule(coord, edges, board);

        console.error(`[buildTrack 실패] ${playerForLog?.name || state.currentPlayer}:`, {
          coord: `(${coord.col},${coord.row})`,
          edges,
          isCity,
          terrain: hexTile?.terrain || 'unknown',
          existingTrack: existingTrack ? `owner=${existingTrack.owner}` : null,
          hasExistingPlayerTrack: hasExisting,
          isConnected,
          builtThisTurn: state.phaseState.builtTracksThisTurn,
          maxThisTurn: state.phaseState.maxTracksThisTurn,
        });
        return false;
      }

      // 가닥은 타일 건설 시 자동 생성하지 않는다 — 타일만 1카운트 소모(수익 위해 타일 우선 건설).
      // 마을에 닿는 타일은 미연결 상태로 두고, 마을 연결(가닥)은 마을 클릭(buildTownSpur)으로
      // 별도 건설한다 (1카운트, 비용 가닥당 $1). edges는 향후 마을 연결 판정에 사용된다.
      const newSpurs: { townCoord: HexCoord; edge: number }[] = [];
      const townCount = 0;
      const skippedSpurCount = 0;

      // 최종 하드 가드: 어떤 경로로도 턴당 제한을 초과한 건설은 불가 (위반 시도는 박제)
      if (state.phaseState.builtTracksThisTurn >= state.phaseState.maxTracksThisTurn) {
        console.error(
          `[제한 위반 차단] ${state.currentPlayer} 트랙 건설 시도: ` +
          `built=${state.phaseState.builtTracksThisTurn} >= max=${state.phaseState.maxTracksThisTurn}, turn=${state.currentTurn}`
        );
        return false;
      }

      const currentPlayer = state.currentPlayer;
      const terrain = state.board.hexTiles.find(
        (h) => hexCoordsEqual(h.coord, coord)
      )?.terrain || 'plain';

      const player = state.players[currentPlayer];
      if (!player) {
        console.error(`[ERROR] buildTrack: 플레이어 없음 - currentPlayer: ${currentPlayer}`);
        return false;
      }
      const mapProfile = getMapProfile(state.mapId);
      // Montréal 정부 링크: 무료·중립(owner null·isGovernment) — 관리 플레이어가 대신 짓는다
      const isGovBuild = state.currentPhase === 'governmentLink';

      // 비용 계산
      let cost = 0;
      const existingTrack = state.board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));

      if (isGovBuild) {
        cost = 0;
      } else if (existingTrack) {
        // 리다이렉트 비용 적용
        cost = TRACK_REPLACE_COSTS.redirect;
      } else {
        // Germany: 헥스 고정비용(fixedCost)이 있으면 지형 기본비용 대신 사용
        const fixedCost = state.board.hexTiles.find(h => hexCoordsEqual(h.coord, coord))?.fixedCost;
        if (fixedCost !== undefined) {
          cost = fixedCost;
        } else {
          cost = GAME_CONSTANTS.PLAIN_TRACK_COST;
          if (terrain === 'river' || terrain === 'swamp') cost = GAME_CONSTANTS.RIVER_TRACK_COST;
          if (terrain === 'mountain') cost = GAME_CONSTANTS.MOUNTAIN_TRACK_COST;
        }
      }
      // Germany: Engineer 절반 할인 — 이번 빌더 턴 최고가 타일 1개가 절반(올림)이 되도록 차액 정산.
      // 타일 비용에만 적용 (마을 가닥 제외). 계산은 helpers/engineerDiscount.ts 한 곳.
      let engineerMaxTileCost = state.phaseState.engineerMaxTileCost;
      let engineerDiscountGiven = state.phaseState.engineerDiscountGiven;
      if (hasEngineerDiscount(mapProfile.engineerHalfCost, player.selectedAction)) {
        const d = applyEngineerDiscount(cost, state.phaseState);
        cost = d.charge;
        engineerMaxTileCost = d.engineerMaxTileCost;
        engineerDiscountGiven = d.engineerDiscountGiven;
      }
      // 마을 안 가닥 비용 (가닥당 $1)
      cost += newSpurs.length * townSpurCost(state.mapId);

      if (player.cash < cost) {
        console.warn(`[WARN] buildTrack: 현금 부족 - 필요: $${cost}, 보유: $${player.cash}`);
        return false;
      }

      captureUndo(state, `트랙 건설 (${coord.col},${coord.row})`);

      // 헥스 위 큐브 (St. Lucia 셋업): 건설 시 트랙 위로 이동 (룰북: place the cube on top of the just-built track)
      const hexTileHere = state.board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
      const hexCube = hexTileHere?.cube ?? null;
      // 기존 트랙 교체(방향 전환 등) 시에는 기존 트랙의 큐브 유지
      const carriedCube = existingTrack?.cube ?? hexCube;

      // 트랙 데이터 생성/수정
      // 룰(IV) 소유권: ① 기존 타일 위 건설 = 방향 전환 — "방향 전환만으로는 연장으로 인정되지
      // 않는다" → 소유권을 얻지 못하고(owner 유지, 미소유는 미소유대로) builtTurn도 유지해
      // releaseUnextendedTrack이 이를 연장으로 오인하지 않게 한다. ② 새 타일이 미소유 미완성
      // 구간에 이어지면(연장) 그 구간 전체의 소유권을 주장한다(findClaimableSectionKeys).
      const trackId = existingTrack ? existingTrack.id : `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newTrack: TrackTile = {
        id: trackId,
        coord,
        edges,
        owner: isGovBuild ? null : (existingTrack ? existingTrack.owner : currentPlayer),
        trackType: 'simple',
        builtTurn: existingTrack ? existingTrack.builtTurn : state.currentTurn,
        ...(isGovBuild ? { isGovernment: true } : {}),
        ...(carriedCube ? { cube: carriedCube } : {}),
      };

      const claimKeys = (!existingTrack && !isGovBuild)
        ? findClaimableSectionKeys(state.board, coord, edges)
        : new Set<string>();
      const claimKeyOf = (c: HexCoord) => `${c.col},${c.row}`;

      const newTrackTiles = existingTrack
        ? state.board.trackTiles.map(t => hexCoordsEqual(t.coord, coord) ? newTrack : t)
        : [
            ...state.board.trackTiles.map(t =>
              claimKeys.has(claimKeyOf(t.coord)) ? { ...t, owner: currentPlayer } : t
            ),
            newTrack,
          ];

      // 큐브가 트랙 위로 이동했으면 헥스에서 제거
      const newHexTiles = (hexCube && !existingTrack)
        ? state.board.hexTiles.map(h => hexCoordsEqual(h.coord, coord) ? { ...h, cube: null } : h)
        : state.board.hexTiles;

      const newBuiltCount = state.phaseState.builtTracksThisTurn + 1 + townCount; // 타일 1 + 마을 진입 수
      const newTownSpurs = [
        ...(state.board.townSpurs ?? []),
        ...newSpurs.map((sp, i) => ({
          id: `spur-${trackId}-${i}`,
          townCoord: sp.townCoord,
          edge: sp.edge,
          owner: currentPlayer,
          builtTurn: state.currentTurn,
        })),
      ];

      // 상세 건설 로그
      debugLog.trackBuilding(`[buildTrack 성공] ${player.name} (${currentPlayer}): Turn ${state.currentTurn}, ` +
        `(${coord.col},${coord.row}) edges=[${edges[0]},${edges[1]}], ` +
        `${newBuiltCount}/${state.phaseState.maxTracksThisTurn}번째, ` +
        `비용=$${cost}, 지형=${terrain}, 행동=${player.selectedAction || 'none'}`);

      set({
        board: {
          ...state.board,
          trackTiles: newTrackTiles,
          hexTiles: newHexTiles,
          townSpurs: newTownSpurs,
        },
        players: {
          ...state.players,
          [currentPlayer]: {
            ...player,
            cash: player.cash - cost,
          },
        },
        undoCount: undoSnapshots.length,
        phaseState: {
          ...state.phaseState,
          builtTracksThisTurn: newBuiltCount,
          lastBuiltCoords: [...state.phaseState.lastBuiltCoords, coord],
          engineerMaxTileCost,
          engineerDiscountGiven,
        },
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: currentPlayer,
            action: `${isGovBuild ? '정부 링크 트랙 건설' : '트랙 건설'} (${coord.col}, ${coord.row})${newSpurs.length > 0 ? ` + 마을 가닥 ${newSpurs.length}개` : ''}${skippedSpurCount > 0 ? ' (마을 미연결 — 다음 턴 마을 클릭으로 가닥 건설)' : ''}${claimKeys.size > 0 ? ` + 미소유 구간 ${claimKeys.size}타일 소유권 인수` : ''} - $${cost} [${newBuiltCount}/${state.phaseState.maxTracksThisTurn}]`,
            timestamp: Date.now(),
          },
        ],
      });

      // 참고: nextPhase()는 호출자(UI 버튼 또는 AI)가 직접 호출함
      // 여기서 자동 호출하면 중복 호출로 버그 발생

      // [PLAY] 사람 플레이 분석용 — 건설 좌표/엣지 (긴 라인 추적)
      console.log(`[PLAY] T${state.currentTurn} ${currentPlayer} 건설 (${coord.col},${coord.row}) edges[${edges}] [${newBuiltCount}/${state.phaseState.maxTracksThisTurn}]${newSpurs.length > 0 ? ` +가닥${newSpurs.length}` : ''}`);

      // Western US: 이 건설로 대륙횡단(서부↔동부)이 완성됐는지 확인 → 연속성 해제 + 보너스
      get().applyTranscontinental();
      return true;
    },

    // === 복합 트랙 건설 ===
    canBuildComplexTrack: (coord, newEdges, trackType) => {
      const state = get();
      const currentPlayer = state.currentPlayer;

      // 정부 링크 건설(Montréal)은 단순 신설 타일만 — 복합/교체 불가
      if (state.currentPhase === 'governmentLink') return false;

      // 트랙 제한 확인 — 타일 1개만 카운트 (마을 가닥은 마을 클릭으로 별도 건설)
      if (state.phaseState.builtTracksThisTurn + 1 > state.phaseState.maxTracksThisTurn) {
        return false;
      }

      // 마을 헥스에는 복합 트랙 불가 (마을은 타일 없는 연결점)
      if (state.board.towns.some(t => hexCoordsEqual(t.coord, coord))) return false;

      // 철도 건설 불가 경계 변을 넘는 복합 트랙 금지 (한국 산맥 등)
      if (crossesBlockedEdge(state.board, coord, newEdges)) return false;

      // 기존 트랙이 있어야 함
      const existingTrack = state.board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
      if (!existingTrack) return false;

      // 기존 트랙이 단순 트랙이어야 함 (이미 복합 트랙이면 불가)
      if (existingTrack.trackType !== 'simple') return false;

      // Montréal 정부 트랙(isGovernment) 위 교차/공존: 허용 — 원본 룰은 정부 링크를 "unused
      // colour의 중립 링크"로만 규정하고, 표준 룰의 "다른 플레이어 단순 트랙을 유지하며 복합
      // 교체 가능"이 그대로 적용된다(정부 원 트랙 보존). 방향전환만 금지(canRedirectTrack).

      // 새 경로가 기존 경로와 겹치지 않아야 함 (엣지가 같으면 안 됨)
      const existingEdges = existingTrack.edges;
      if (
        newEdges[0] === existingEdges[0] ||
        newEdges[0] === existingEdges[1] ||
        newEdges[1] === existingEdges[0] ||
        newEdges[1] === existingEdges[1]
      ) {
        return false;
      }

      // 교차(crossing)인 경우: 두 경로가 실제로 교차해야 함 (추후 검증 추가 가능)
      // 공존(coexist)인 경우: 두 경로가 교차하지 않아야 함
      // 현재는 trackType 로깅만 수행
      console.log(`복합 트랙 타입: ${trackType}`);

      // 연결성 검증: 새 경로가 현재 플레이어의 기존 트랙/도시에 연결되어야 함
      // (Western US: 대륙횡단 전 연속성 강제 — 단순 트랙과 동일하게 분리 구간 금지)
      const ctProfile = getMapProfile(state.mapId);
      const ctRequireNetwork = ctProfile.requireContiguousUntilTranscontinental
        && !state.players[currentPlayer]?.transcontinental;
      if (!validateTrackConnection(coord, newEdges, state.board, currentPlayer, ctRequireNetwork)) {
        return false;
      }

      return true;
    },

    buildComplexTrack: (coord, newEdges, trackType) => {
      const state = get();
      logAction('trackBuilding', 'buildComplexTrack', { player: state.currentPlayer, coord, newEdges, trackType, turn: state.currentTurn });

      if (!state.canBuildComplexTrack(coord, newEdges, trackType)) {
        return false;
      }

      const currentPlayer = state.currentPlayer;
      const existingTrack = state.board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
      if (!existingTrack) {
        console.error('[ERROR] buildComplexTrack: Track not found at', coord);
        return false;
      }

      // 교체 비용 계산
      const cost = trackType === 'crossing'
        ? TRACK_REPLACE_COSTS.simpleToCrossing
        : TRACK_REPLACE_COSTS.default;

      const player = state.players[currentPlayer];
      if (!player) {
        console.error(`[ERROR] buildComplexTrack: 플레이어 없음 - currentPlayer: ${currentPlayer}`);
        return false;
      }
      if (player.cash < cost) {
        console.warn(`[WARN] buildComplexTrack: 현금 부족 - 필요: $${cost}, 보유: $${player.cash}`);
        return false;
      }

      captureUndo(state, `복합 트랙 건설 (${coord.col},${coord.row})`);

      // 기존 트랙 업데이트 (복합 트랙으로 변환)
      const updatedTrack: TrackTile = {
        ...existingTrack,
        trackType,
        secondaryEdges: newEdges,
        secondaryOwner: currentPlayer,
        secondaryBuiltTurn: state.currentTurn, // 독일 미완성 제거의 "이번 턴 교차" 판별용
      };

      const updatedTrackTiles = state.board.trackTiles.map(t =>
        hexCoordsEqual(t.coord, coord) ? updatedTrack : t
      );

      // 가닥은 자동 생성하지 않음 — 타일만 1카운트. 마을 연결은 마을 클릭(buildTownSpur)으로.
      const complexSpurs: { townCoord: HexCoord; edge: number }[] = [];
      const newBuiltCount = state.phaseState.builtTracksThisTurn + 1;

      // 상세 복합 트랙 건설 로그
      debugLog.trackBuilding(`[buildComplexTrack 성공] ${player.name} (${currentPlayer}): Turn ${state.currentTurn}, ` +
        `(${coord.col},${coord.row}) newEdges=[${newEdges[0]},${newEdges[1]}], ` +
        `타입=${trackType}, 기존edges=[${existingTrack.edges[0]},${existingTrack.edges[1]}], ` +
        `${newBuiltCount}/${state.phaseState.maxTracksThisTurn}번째, ` +
        `비용=$${cost}, 행동=${player.selectedAction || 'none'}`);

      set({
        board: {
          ...state.board,
          trackTiles: updatedTrackTiles,
          townSpurs: [
            ...(state.board.townSpurs ?? []),
            ...complexSpurs.map((sp, i) => ({
              id: `spur-cx-${Date.now()}-${i}`,
              townCoord: sp.townCoord,
              edge: sp.edge,
              owner: currentPlayer,
              builtTurn: state.currentTurn,
            })),
          ],
        },
        players: {
          ...state.players,
          [currentPlayer]: {
            ...player,
            cash: player.cash - cost - complexSpurs.length * townSpurCost(state.mapId),
          },
        },
        undoCount: undoSnapshots.length,
        phaseState: {
          ...state.phaseState,
          builtTracksThisTurn: newBuiltCount,
          lastBuiltCoords: [...state.phaseState.lastBuiltCoords, coord],
        },
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: currentPlayer,
            action: `복합 트랙 건설 (${trackType}) (${coord.col}, ${coord.row}) - $${cost} [${newBuiltCount}/${state.phaseState.maxTracksThisTurn}]`,
            timestamp: Date.now(),
          },
        ],
      });

      // 참고: nextPhase()는 호출자(UI 버튼 또는 AI)가 직접 호출함
      // 여기서 자동 호출하면 중복 호출로 버그 발생

      // [PLAY] 사람 플레이 분석용 — 복합 건설 좌표
      console.log(`[PLAY] T${state.currentTurn} ${currentPlayer} 복합건설(${trackType}) (${coord.col},${coord.row}) edges[${newEdges}] [${newBuiltCount}/${state.phaseState.maxTracksThisTurn}]`);
      // Western US: 복합 트랙으로 서부↔동부가 이어졌는지 확인 (보너스/연속성 해제)
      get().applyTranscontinental();
      return true;
    },

    // === 마을 가닥(스퍼) 단독 건설 ===
    canBuildTownSpur: (townCoord, edge) => {
      const state = get();
      // governmentLink(Montréal): 정부 링크가 마을(Stop)을 지나도록 정부 가닥(무료·중립) 건설 허용
      const isGovSpur = state.currentPhase === 'governmentLink';
      if (state.currentPhase !== 'buildTrack' && !isGovSpur) return false;
      // edge 지정: 그 변 가닥(방향 직접 선택, 트랙 없이도 가능 — 유효 헥스 + 미생성).
      // 생략: 마을에 닿은 미연결 트랙 변 전부.
      let targetCount: number;
      if (edge !== undefined) {
        const nb = getNeighborHex(townCoord, edge);
        const hex = state.board.hexTiles.find(h => hexCoordsEqual(h.coord, nb));
        const exists = (state.board.townSpurs ?? []).some(sp => hexCoordsEqual(sp.townCoord, townCoord) && sp.edge === edge);
        if (!hex || hex.terrain === 'lake' || exists) return false;
        targetCount = 1;
      } else {
        targetCount = findMissingTownSpurs(townCoord, state.board, isGovSpur ? null : state.currentPlayer).length;
      }
      if (targetCount === 0) return false;
      // 카운트 = 이번 턴에 "내가" 그 마을을 변경한 적 있으면 0(같은 마을 추가 가닥), 처음이면 1. 지난 턴 무관.
      // ★ owner 필터 필수: 상대가 같은 턴 같은 마을에 가닥을 지어도 내 카운트는 영향 없어야 한다
      //   (필터 누락 시 중앙 마을을 둘 다 거치는 St.Lucia에서 내 가닥이 공짜가 돼 4건설 위반 발생).
      const spurOwner = isGovSpur ? null : state.currentPlayer;
      const builtThisTurn = (state.board.townSpurs ?? []).some(
        e => hexCoordsEqual(e.townCoord, townCoord) && e.builtTurn === state.currentTurn && e.owner === spurOwner
      );
      const townCount = builtThisTurn ? 0 : 1;
      if (state.phaseState.builtTracksThisTurn + townCount > state.phaseState.maxTracksThisTurn) return false;
      const player = state.players[state.currentPlayer];
      // 정부 가닥은 무료 (비용 무관 — 원본 룰: Cost is not relevant)
      if (!player || (!isGovSpur && player.cash < targetCount * townSpurCost(state.mapId))) return false;
      return true;
    },

    buildTownSpur: (townCoord, edge) => {
      const state = get();
      logAction('trackBuilding', 'buildTownSpur', { player: state.currentPlayer, town: townCoord, edge, turn: state.currentTurn });
      if (!state.canBuildTownSpur(townCoord, edge)) return false;

      captureUndo(state, `마을 가닥 건설 (${townCoord.col},${townCoord.row})`);

      const currentPlayer = state.currentPlayer;
      const player = state.players[currentPlayer];
      // 정부 가닥(Montréal governmentLink): 중립(owner null)·무료
      const isGovSpur = state.currentPhase === 'governmentLink';
      const spurOwner = isGovSpur ? null : currentPlayer;
      // edge 지정: 그 변 가닥만(방향 직접 선택). 생략: 마을에 닿은 미연결 트랙 변 전부.
      // 카운트 = 이번 턴 그 마을 첫 변경이면 1, 추가면 0. 비용은 가닥당 $1.
      const missing = edge !== undefined ? [{ townCoord, edge }] : findMissingTownSpurs(townCoord, state.board, spurOwner);
      // owner 필터 필수 — 상대의 같은 턴 같은 마을 가닥이 내 카운트를 0으로 만들면 안 됨 (4건설 위반 방지)
      const builtThisTurn = (state.board.townSpurs ?? []).some(
        e => hexCoordsEqual(e.townCoord, townCoord) && e.builtTurn === state.currentTurn && e.owner === spurOwner
      );
      const townCount = builtThisTurn ? 0 : 1;
      const cost = isGovSpur ? 0 : missing.length * townSpurCost(state.mapId);
      const newBuiltCount = state.phaseState.builtTracksThisTurn + townCount;

      debugLog.trackBuilding(`[buildTownSpur 성공] ${player.name} (${currentPlayer}): Turn ${state.currentTurn}, ` +
        `마을 (${townCoord.col},${townCoord.row}) 가닥 ${missing.length}개 연결, ` +
        `${newBuiltCount}/${state.phaseState.maxTracksThisTurn}번째, 비용=$${cost}`);

      set({
        board: {
          ...state.board,
          townSpurs: [
            ...(state.board.townSpurs ?? []),
            ...missing.map((sp, i) => ({
              id: `spur-solo-${Date.now()}-${i}-${sp.edge}`,
              townCoord: sp.townCoord,
              edge: sp.edge,
              owner: spurOwner,
              builtTurn: state.currentTurn,
            })),
          ],
        },
        players: {
          ...state.players,
          [currentPlayer]: {
            ...player,
            cash: player.cash - cost,
          },
        },
        undoCount: undoSnapshots.length,
        phaseState: {
          ...state.phaseState,
          builtTracksThisTurn: newBuiltCount,
        },
        // 건설 선택 중이었다면 선택 UI 정리
        ui: {
          ...state.ui,
          buildMode: 'idle',
          sourceHex: null,
          buildableNeighbors: [],
          previewTrack: null,
          targetHex: null,
          entryEdge: null,
          exitDirections: [],
        },
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: currentPlayer,
            action: `마을 가닥 건설 (${townCoord.col}, ${townCoord.row}) 가닥 ${missing.length}개 — 노선 연결 완성 - $${cost} [${newBuiltCount}/${state.phaseState.maxTracksThisTurn}]`,
            timestamp: Date.now(),
          },
        ],
      });

      // [PLAY] 사람 플레이 분석용 — 마을 가닥 완성(링크 완성 = 깊은 배달 핵심)
      console.log(`[PLAY] T${state.currentTurn} ${currentPlayer} 가닥완성 @(${townCoord.col},${townCoord.row}) 가닥${missing.length}개`);

      // Western US: 가닥 연결로 대륙횡단이 완성됐는지 확인
      get().applyTranscontinental();
      return true;
    },

    buildDirectLink: (cityAId, cityBId) => {
      const state = get();
      const link = (state.board.directLinks ?? []).find(
        d => (d.cityA === cityAId && d.cityB === cityBId) || (d.cityA === cityBId && d.cityB === cityAId)
      );
      if (!link) return false;
      if (link.owner !== null) return false; // 이미 건설됨
      if (state.currentPhase !== 'buildTrack') return false;
      // 건설 제한 (타일 1개 카운트)
      if (state.phaseState.builtTracksThisTurn >= state.phaseState.maxTracksThisTurn) {
        console.warn('[buildDirectLink] 건설 제한 초과');
        return false;
      }
      const currentPlayer = state.currentPlayer;
      const player = state.players[currentPlayer];
      if (!player) return false;
      // 직결 링크는 두 도시를 직접 잇는 완성 링크 — 항상 도시에 붙으므로 첫 트랙 규칙 자동 충족
      if (player.cash < link.cost) {
        console.warn(`[buildDirectLink] 현금 부족 ($${player.cash} < $${link.cost})`);
        return false;
      }

      captureUndo(state, `직결 링크 건설 (${link.cityA}↔${link.cityB})`);
      const newBuiltCount = state.phaseState.builtTracksThisTurn + 1;

      set({
        board: {
          ...state.board,
          directLinks: (state.board.directLinks ?? []).map(d =>
            d === link ? { ...d, owner: currentPlayer, builtTurn: state.currentTurn } : d
          ),
        },
        players: {
          ...state.players,
          [currentPlayer]: { ...player, cash: player.cash - link.cost },
        },
        undoCount: undoSnapshots.length,
        phaseState: { ...state.phaseState, builtTracksThisTurn: newBuiltCount },
        ui: { ...state.ui, buildMode: 'idle', sourceHex: null, buildableNeighbors: [], previewTrack: null, targetHex: null, entryEdge: null, exitDirections: [] },
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: currentPlayer,
            action: `직결 링크 건설 (${link.cityA} ↔ ${link.cityB}) - $${link.cost} [${newBuiltCount}/${state.phaseState.maxTracksThisTurn}]`,
            timestamp: Date.now(),
          },
        ],
      });
      get().applyTranscontinental();
      return true;
    },

    // === 트랙 방향 전환 — 선택/취소 UI는 slices/uiSlice.ts로 분리, 실행(redirectTrack)만 잔류 ===

    redirectTrack: (coord, newExitEdge) => {
      const state = get();
      const currentPlayer = state.currentPlayer;
      logAction('trackBuilding', 'redirectTrack', { player: currentPlayer, coord, newExitEdge, turn: state.currentTurn });

      // 트랙 제한 확인 (방향 전환도 건설 1회로 카운트 — 룰: 턴당 3개, Engineer 4개)
      if (state.phaseState.builtTracksThisTurn >= state.phaseState.maxTracksThisTurn) {
        return false;
      }

      // 방향 전환 가능한지 확인
      if (!canRedirectTrack(coord, state.board, currentPlayer)) {
        return false;
      }

      // 현재 트랙 정보 가져오기
      const track = state.board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
      if (!track) return false;

      // 방향 전환 정보 확인
      const redirectInfo = getRedirectableEdges(coord, state.board, currentPlayer);
      if (!redirectInfo) return false;

      // 유효한 방향인지 확인
      if (!redirectInfo.availableEdges.includes(newExitEdge)) {
        return false;
      }

      // 비용 확인
      const cost = TRACK_REPLACE_COSTS.redirect;
      const player = state.players[currentPlayer];
      if (player.cash < cost) {
        return false;
      }

      // 연결된 엣지 확인 (유지되는 엣지)
      const { connectedEdge } = isEndpointOfIncompleteSection(coord, state.board);
      if (connectedEdge === null) return false;

      // 새 엣지 설정
      const newEdges: [number, number] = [connectedEdge, newExitEdge];

      // 철도 건설 불가 경계 변으로는 방향 전환 불가 (한국 산맥 등)
      if (crossesBlockedEdge(state.board, coord, newEdges)) return false;

      // 가닥은 자동 생성하지 않음 — 타일만 1카운트. 마을 연결은 마을 클릭(buildTownSpur)으로.
      const redirectSpurs: { townCoord: HexCoord; edge: number }[] = [];

      captureUndo(state, `트랙 방향 전환 (${coord.col},${coord.row})`);

      // 트랙 업데이트 — 룰(IV): "방향 전환만으로는 연장으로 인정되지 않는다" → 소유권을 얻지
      // 못한다 (내 트랙은 내 것 그대로, 미소유 트랙은 미소유 그대로. builtTurn도 유지해
      // releaseUnextendedTrack이 연장으로 오인하지 않게). 소유권 인수는 새 타일 연장(buildTrack)으로만.
      const updatedTrack: TrackTile = {
        ...track,
        edges: newEdges,
      };

      const updatedTrackTiles = state.board.trackTiles.map(t =>
        hexCoordsEqual(t.coord, coord) ? updatedTrack : t
      );

      set({
        board: {
          ...state.board,
          trackTiles: updatedTrackTiles,
          townSpurs: [
            ...(state.board.townSpurs ?? []),
            ...redirectSpurs.map((sp, i) => ({
              id: `spur-rd-${Date.now()}-${i}`,
              townCoord: sp.townCoord,
              edge: sp.edge,
              owner: currentPlayer,
              builtTurn: state.currentTurn,
            })),
          ],
        },
        players: {
          ...state.players,
          [currentPlayer]: {
            ...player,
            cash: player.cash - cost - redirectSpurs.length * townSpurCost(state.mapId),
          },
        },
        undoCount: undoSnapshots.length,
        phaseState: {
          ...state.phaseState,
          builtTracksThisTurn: state.phaseState.builtTracksThisTurn + 1, // 타일만 1카운트 (가닥 자동 생성 없음)
          lastBuiltCoords: [...state.phaseState.lastBuiltCoords, coord],
        },
        // 건설 UI 전체 초기화 (resetBuildMode와 동일 필드 + redirectTrackSelection) —
        // 이제 방향 전환이 source_selected(하이라이트 표시 중)에서도 커밋되므로,
        // buildMode만 되돌리면 노란 하이라이트·소스 선택이 화면에 남는다 (2026-07-22 실플레이 버그).
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
          redirectTrackSelection: null,
        },
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: currentPlayer,
            action: `트랙 방향 전환 (${coord.col}, ${coord.row}) - $${cost} [${state.phaseState.builtTracksThisTurn + 1}/${state.phaseState.maxTracksThisTurn}]`,
            timestamp: Date.now(),
          },
        ],
      });

      get().applyTranscontinental();
      return true;
    },
  };
}
