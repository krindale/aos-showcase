// Zustand 게임 상태 관리

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  GameState,
  PlayerId,
  GamePhase,
  SpecialAction,
  HexCoord,
  TrackTile,
  CubeColor,
  PlayerState,
  GAME_CONSTANTS,
  TRACK_REPLACE_COSTS,
  NewCityTileId,
  City,
  PLAYER_ID_ORDER,
  AIExecutionQueue,
  CapturedAIContext,
  MovingCubeContext,
  BoardState,
  ACTION_INFO,
} from '@/types/game';
import { getAIDecision, AI_TURN_DELAY, aiPlayerManager } from '@/ai';
import { clearUrbanizationPlanCache } from '@/ai/strategies/urbanization';
import { clearDesperationCache } from '@/ai/strategies/auction';
import { addFailedBuildCoord, hasPendingFreeSpur } from '@/ai/strategies/buildTrack';
import { getMapData, getDisplaySlotRange } from '@/utils/mapRegistry';
import { getMapProfile } from '@/maps/getMapProfile';
import {
  validateFirstTrackRule,
  validateTrackConnection,
  playerHasTrack,
  canRedirectTrack,
  getRedirectableEdges,
  isEndpointOfIncompleteSection,
} from '@/utils/trackValidation';
import {
  hexCoordsEqual,
  findTrackCubeDeliveries,
  getNeighborHex,
} from '@/utils/hexGrid';
import {
  getNextPlayerId,
  createPlayerMoves,
  allPlayersMoved,
  allPlayersSelectedAction,
  resetPlayerActions,
  findFirstBuildPlayer,
  findFirstMovePlayer,
  isLastPlayer,
} from '@/utils/gameLogic';
import { debugLog, logAction, newLogSession } from '@/utils/debugConfig';
// 모듈 헬퍼 (2026-07-03 스텝 3a 분리 — 로직 무변경, 파일만 이동)
import { undoSnapshots, captureUndo, clearUndo } from './helpers/undo';
import {
  crossesBlockedEdge,
  findMissingTownSpurs,
  releaseUnextendedTrack,
  removeIncompleteNewTracks,
} from './helpers/boardRules';
import { AIPlayerConfig, TUTORIAL_GAME_CONFIG, createInitialGameState } from './helpers/setup';
import { computeTranscontinental } from './helpers/transcontinental';
import {
  tryAcquireAILock,
  releaseAILock,
  validateExecutionContext,
  PLAYER_ACTION_PHASES,
  scheduleAICheck,
} from './helpers/aiScheduler';
// UI slice (2026-07-03 스텝 3b 분리 — 로직 무변경, 파일만 이동)
import { createUiSlice } from './slices/uiSlice';
import { createAuctionSlice } from './slices/auctionSlice';

// 기존 import 경로 호환 재export (PhasePanel·테스트가 gameStore에서 가져다 씀)
export { getUndoLabel } from './helpers/undo';
export { createInitialGameState, TUTORIAL_GAME_CONFIG } from './helpers/setup';
export type { AIPlayerConfig } from './helpers/setup';

// 마을 가닥(스퍼) 건설 비용 — 가닥은 타일 건설 시 자동 생성되지 않고,
// 마을 클릭(buildTownSpur)으로만 별도 건설된다 (첫 진입 1카운트, 비용 가닥당 $1).
const TOWN_SPUR_COST = 1;


// ============================================================
// 스토어 인터페이스
// ============================================================
export interface GameStore extends GameState {
  // --- 게임 라이프사이클 ---
  /** 게임 초기화 */
  initGame: (mapId: string, playerNames: string[], aiPlayers?: AIPlayerConfig[]) => void;
  /** 게임 리셋 (플레이어 이름 유지) */
  resetGame: () => void;

  // --- AI 관련 ---
  /** AI 턴 실행 */
  executeAITurn: () => void;
  /** AI 실행 상태 (레이스 컨디션 방지) */
  aiExecution: AIExecutionQueue;

  // --- 플레이어 순환 헬퍼 ---
  /** 다음 플레이어 ID 반환 */
  getNextPlayer: (playerId: PlayerId) => PlayerId;
  /** 이전 플레이어 ID 반환 */
  getPreviousPlayer: (playerId: PlayerId) => PlayerId;

  // --- Phase I: 주식 발행 ---
  /** 주식 발행 ($5/주) */
  issueShare: (playerId: PlayerId, amount: number) => void;

  // --- Phase II: 플레이어 순서 경매 ---
  /** 입찰 */
  placeBid: (playerId: PlayerId, amount: number) => void;
  /** 입찰 포기 (탈락) */
  passBid: (playerId: PlayerId) => void;
  /** Turn Order 패스 (탈락 없이 스킵) */
  skipBid: (playerId: PlayerId) => void;
  /** 경매 해결 */
  resolveAuction: () => void;
  /** 교대 선공권 응답 (alternateTurnOrder 맵 전용) - 수락 시 firstSeatCost 지불 후 선공 */
  respondTurnOrderOffer: (playerId: PlayerId, accept: boolean) => void;

  /** 트랙 위 큐브 배달 (St. Lucia — 미완성 링크여도 배달 가능, 구간 소유자 보너스 수입 1) */
  moveTrackCube: (trackId: string, destCityId: string) => boolean;

  // --- Phase III: 행동 선택 ---
  /** 특수 행동 선택 */
  selectAction: (playerId: PlayerId, action: SpecialAction) => void;

  // --- Phase IV: 트랙 건설 ---
  /** 트랙 건설 */
  buildTrack: (coord: HexCoord, edges: [number, number]) => boolean;
  /** 트랙 건설 가능 여부 확인 */
  canBuildTrack: (coord: HexCoord, edges: [number, number]) => boolean;
  /** Western US: 대륙횡단 연결 감지 → 연속성 해제 플래그 + 1회성 보너스 적용 (건설 후 호출) */
  applyTranscontinental: () => void;
  /** 대륙횡단 연결 팝업 닫기 (transcontinentalEvent 초기화) */
  dismissTranscontinental: () => void;
  /** 복합 트랙 건설 (교차/공존) */
  buildComplexTrack: (
    coord: HexCoord,
    newEdges: [number, number],
    trackType: 'crossing' | 'coexist'
  ) => boolean;
  /** 복합 트랙 건설 가능 여부 확인 */
  canBuildComplexTrack: (
    coord: HexCoord,
    newEdges: [number, number],
    trackType: 'crossing' | 'coexist'
  ) => boolean;
  /** 마을 가닥(스퍼) 단독 건설. edge 지정 시 그 변 가닥만(방향 선택 — 트랙 없이도 가능),
   *  생략 시 마을에 닿은 미연결 트랙 변 전부 연결. (이번 턴 그 마을 첫 변경 1카운트 + $1) */
  buildTownSpur: (townCoord: HexCoord, edge?: number) => boolean;
  /** 도시-도시 직결 링크 건설 (Germany: Essen↔Düsseldorf $2). 건설 1회로 카운트 */
  buildDirectLink: (cityAId: string, cityBId: string) => boolean;
  /** 마을 가닥 단독 건설 가능 여부 (edge 지정 시 그 변) */
  canBuildTownSpur: (townCoord: HexCoord, edge?: number) => boolean;

  // --- Phase V: 물품 이동 ---
  /** 물품 이동 */
  moveGoods: (cubeColor: CubeColor, path: HexCoord[]) => void;
  /** 엔진 업그레이드 (물품 이동 대신) */
  upgradeEngine: (playerId?: PlayerId) => void;

  // --- Phase VI-VIII: 수입/비용 ---
  /** 수입 수집 */
  collectIncome: () => void;
  /** 비용 지불 */
  payExpenses: () => void;
  /** 수입 감소 */
  applyIncomeReduction: () => void;

  // --- Phase IX: 물품 성장 ---
  /** 물품 성장 (주사위 결과 기반) */
  growGoods: (diceResults: number[]) => void;

  // --- Phase X: 턴 진행 ---
  /** 다음 단계로 진행 */
  nextPhase: () => void;
  /** 턴 종료 (자동 단계 실행) */
  endTurn: () => void;

  // --- UI: 기본 선택 ---
  /** 헥스 선택 */
  selectHex: (coord: HexCoord | null) => void;
  /** 큐브 선택 */
  selectCube: (cityId: string, cubeIndex: number) => void;
  /** 선택 초기화 */
  clearSelection: () => void;
  /** 현재 선택 취소 — 커밋 전 선택(건설 위치/방향, 큐브, 패널)만 되돌림 (진행 중 애니메이션은 유지) */
  cancelSelection: () => void;
  /** 마지막 확정 행동 실행 취소 (주식 발행/행동 선택/트랙 건설 등 — 단계 전환 전까지) */
  undoLastAction: () => void;
  /** 트랙 미리보기 설정 */
  setPreviewTrack: (track: { coord: HexCoord; edges: [number, number] } | null) => void;
  /** 하이라이트 헥스 설정 */
  setHighlightedHexes: (hexes: HexCoord[]) => void;
  /** 이동 경로 설정 */
  setMovePath: (path: HexCoord[]) => void;

  // --- UI: 트랙 건설 ---
  /** 연결점 선택 */
  selectSourceHex: (coord: HexCoord) => void;
  /** 대상 헥스 선택 */
  selectTargetHex: (coord: HexCoord) => void;
  /** 나가는 방향 선택하여 트랙 건설 */
  selectExitDirection: (exitEdge: number) => boolean;
  /** 호버 시 미리보기 업데이트 */
  updateTrackPreview: (targetCoord: HexCoord) => void;
  /** 빌드 모드 초기화 */
  resetBuildMode: () => void;

  // --- UI: 복합 트랙 ---
  /** 복합 트랙 선택 패널 표시 */
  showComplexTrackSelection: (coord: HexCoord, newEdges: [number, number]) => void;
  /** 복합 트랙 선택 패널 숨김 */
  hideComplexTrackSelection: () => void;

  // --- UI: 트랙 방향 전환 ---
  /** 방향 전환할 트랙 선택 */
  selectTrackToRedirect: (coord: HexCoord) => boolean;
  /** 트랙 방향 전환 실행 */
  redirectTrack: (coord: HexCoord, newExitEdge: number) => boolean;
  /** 방향 전환 가능 여부 확인 */
  canRedirect: (coord: HexCoord) => boolean;
  /** 방향 전환 선택 숨김 */
  hideRedirectSelection: () => void;

  // --- UI: 도시화 (Urbanization) ---
  /** 도시화 모드 진입 */
  enterUrbanizationMode: () => void;
  /** 도시화 모드 종료 */
  exitUrbanizationMode: () => void;
  /** 신규 도시 타일 선택 */
  selectNewCityTile: (tileId: NewCityTileId) => void;
  /** 신규 도시 배치 */
  placeNewCity: (townCoord: HexCoord) => boolean;
  /** 신규 도시 배치 가능 여부 */
  canPlaceNewCity: (townCoord: HexCoord) => boolean;

  // --- UI: Production (생산) ---
  /** 생산 모드 시작 */
  startProduction: () => void;
  /** 생산 슬롯 선택 */
  selectProductionSlot: (slotIndex: number) => void;
  /** 생산 확정 */
  confirmProduction: () => boolean;
  /** 생산 취소 */
  cancelProduction: () => void;
  /** 빈 슬롯 목록 반환 */
  getEmptySlots: () => number[];

  // --- UI: 물품 이동 애니메이션 ---
  /** 목적지 도시 선택 */
  selectDestinationCity: (coord: HexCoord) => void;
  /** 큐브 애니메이션 시작 */
  startCubeAnimation: (path: HexCoord[], color: CubeColor) => void;
  /** 애니메이션 다음 단계 */
  advanceCubeAnimation: () => void;
  /** 큐브 이동 완료 */
  completeCubeMove: () => void;

  // --- 로그 ---
  /** 로그 추가 */
  addLog: (action: string) => void;
}

// ============================================================
// 스토어 구현
// ============================================================
export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
  // 초기 상태 (빈 게임) - AI 플레이어 포함
  ...createInitialGameState('tutorial', ['기차-하나', '컴퓨터-기차'], [TUTORIAL_GAME_CONFIG.defaultAI]),

  // AI 실행 상태 (레이스 컨디션 방지)
  aiExecution: { pending: false, executionId: 0 },

  // ============================================================
  // 게임 라이프사이클
  // ============================================================
  initGame: (mapId, playerNames, aiPlayers = []) => {
    // 기존 AI 인스턴스 정리
    aiPlayerManager.clear();
    clearUndo();

    // 새 게임 세션ID 부여 (이후 모든 액션 로그가 이 세션으로 묶임)
    const sessionId = newLogSession();
    logAction('preparation', 'initGame', {
      session: sessionId, mapId, players: playerNames,
      ai: aiPlayers.map(a => a.playerIndex),
    });

    // 새 게임 상태 설정
    set({
      ...createInitialGameState(mapId, playerNames, aiPlayers),
      aiExecution: { pending: false, executionId: 0 },
    });

    // AI 플레이어 인스턴스 등록
    const activePlayers = PLAYER_ID_ORDER.slice(0, playerNames.length);
    for (const aiConfig of aiPlayers) {
      const playerId = activePlayers[aiConfig.playerIndex];
      if (playerId) {
        aiPlayerManager.getOrCreate(playerId, aiConfig.name);
      }
    }

    console.log(`[initGame] AI 플레이어 ${aiPlayerManager.count}명 등록됨`);

    // 첫 번째 플레이어가 AI면 자동 실행 트리거
    scheduleAICheck(get);
  },

  resetGame: () => {
    const state = get();
    // 기존 플레이어 이름과 AI 설정 유지하며 리셋
    const playerNames = state.activePlayers.map(
      pid => state.players[pid]?.name || `플레이어 ${pid.slice(-1)}`
    );
    // AI 플레이어 설정 복원
    const aiPlayers: AIPlayerConfig[] = state.activePlayers
      .map((pid, index) => ({ playerIndex: index, name: state.players[pid]?.name || '', isAI: state.players[pid]?.isAI }))
      .filter(p => p.isAI)
      .map(p => ({ playerIndex: p.playerIndex, name: p.name }));

    // AI 인스턴스 상태 리셋 (인스턴스는 유지, 전략만 초기화)
    aiPlayerManager.resetAll();
    clearUndo();

    // 새 게임 세션ID 부여 (리셋 = 새 게임)
    const sessionId = newLogSession();
    logAction('preparation', 'resetGame', { session: sessionId, mapId: state.mapId, players: playerNames });

    set({
      ...createInitialGameState(state.mapId, playerNames, aiPlayers),
      aiExecution: { pending: false, executionId: 0 },
    });

    console.log(`[resetGame] AI 플레이어 ${aiPlayerManager.count}명 리셋됨`);

    // 첫 번째 플레이어가 AI면 자동 실행 트리거
    scheduleAICheck(get);
  },

  // ============================================================
  // AI 관련
  // ============================================================
  executeAITurn: () => {
    const state = get();
    const currentPlayer = state.currentPlayer;
    const player = state.players[currentPlayer];

    if (!player?.isAI) {
      console.log('[AI] 현재 플레이어는 AI가 아닙니다.');
      return;
    }

    // 락 획득 시도 (레이스 컨디션 방지)
    const executionId = tryAcquireAILock(get, set);
    if (!executionId) {
      console.log('[AI] 이미 실행 중 - 락 획득 실패');
      return;
    }

    // 컨텍스트 캡처 (setTimeout 내부에서 사용)
    const capturedContext: CapturedAIContext = {
      currentPlayer,
      currentPhase: state.currentPhase,
      phaseState: { ...state.phaseState },
      executionId,
    };

    // moveGoods 단계에서 추가 디버그 로그
    if (state.currentPhase === 'moveGoods') {
      console.log(`[AI moveGoods] currentPlayer: ${currentPlayer}, playerOrder: [${state.playerOrder.join(', ')}]`);
      console.log(`[AI moveGoods] selectedActions:`, Object.entries(state.players).map(([id, p]) => `${id}: ${p.selectedAction}`).join(', '));
    }

    // AI 결정 가져오기 (캡처된 상태 기반)
    const decision = getAIDecision(state, currentPlayer);

    console.log(`[AI] ${player.name} 결정:`, decision);

    // 결정 실행 (약간의 딜레이 후)
    setTimeout(() => {
      // 컨텍스트 유효성 검증
      if (!validateExecutionContext(capturedContext, get)) {
        console.warn('[AI] 컨텍스트 불일치 - 실행 취소');
        releaseAILock(executionId, get, set);
        return;
      }

      const store = get();

      switch (decision.type) {
        case 'issueShares': {
          const beforeCash = store.players[capturedContext.currentPlayer]?.cash;
          if (decision.amount > 0) {
            store.issueShare(capturedContext.currentPlayer, decision.amount);
          }
          const afterCash = get().players[capturedContext.currentPlayer]?.cash;
          console.log(`[AI 주식발행] ${player.name}: ${decision.amount}주 발행, 현금 $${beforeCash} → $${afterCash}, shares=${get().players[capturedContext.currentPlayer]?.issuedShares}`);
          store.nextPhase();
          break;
        }

        case 'auction': {
          const { decision: auctionDecision } = decision;
          if (auctionDecision.action === 'bid') {
            store.placeBid(capturedContext.currentPlayer, auctionDecision.amount);
          } else if (auctionDecision.action === 'pass') {
            store.passBid(capturedContext.currentPlayer);
          } else if (auctionDecision.action === 'skip') {
            store.skipBid(capturedContext.currentPlayer);
          } else if (auctionDecision.action === 'complete') {
            // 경매 완료 - 혼자 남았을 때
            console.log('[AI 경매] 경매 완료 처리');
            store.resolveAuction();
            store.nextPhase();
            releaseAILock(executionId, get, set);
            scheduleAICheck(get);
            return;
          }
          // 경매: 락 해제 후 다음 AI 체크 스케줄링
          // (passBid/placeBid 내 scheduleAICheck는 락이 아직 걸려있어 실행 안됨)
          releaseAILock(executionId, get, set);
          scheduleAICheck(get);
          return;
        }

        case 'placeNewCity': {
          // 도시화: 신규 도시 배치 (트랙 건설 전) — 배치 후 같은 buildTrack 단계에서 건설 계속
          console.log(`[AI 도시화] ${player.name}: ${decision.tileId} 타일 → (${decision.townCoord.col},${decision.townCoord.row})`);
          store.enterUrbanizationMode();
          store.selectNewCityTile(decision.tileId);
          const placed = store.placeNewCity(decision.townCoord);
          if (!placed) {
            console.warn('[AI 도시화] 배치 실패 — 건설 계속 진행');
            store.exitUrbanizationMode();
          }
          releaseAILock(executionId, get, set);
          scheduleAICheck(get); // 같은 플레이어의 buildTrack 결정으로 재진입
          return;
        }

        case 'turnOrderOffer': {
          // 교대 선공권 응답 (alternateTurnOrder 맵 전용)
          console.log(`[AI 선공권] ${player.name}: ${decision.accept ? '수락 ($지불)' : '거절'}`);
          store.respondTurnOrderOffer(capturedContext.currentPlayer, decision.accept);
          releaseAILock(executionId, get, set);
          scheduleAICheck(get);
          return;
        }

        case 'selectAction': {
          const cashBeforeAction = store.players[capturedContext.currentPlayer]?.cash;
          console.log(`[AI 액션선택] ${player.name}: ${decision.action} 선택, 현금 $${cashBeforeAction}, shares=${store.players[capturedContext.currentPlayer]?.issuedShares}`);
          store.selectAction(capturedContext.currentPlayer, decision.action);
          store.nextPhase();
          break;
        }

        case 'buildTrack': {
          const { decision: buildDecision } = decision;
          if (buildDecision.action === 'build') {
            const beforeState = get();
            const buildNum = beforeState.phaseState.builtTracksThisTurn + 1;
            console.log(`[AI 트랙 건설] Turn ${beforeState.currentTurn}, ${player.name}: ${buildNum}/${beforeState.phaseState.maxTracksThisTurn}번째 트랙 (${buildDecision.coord.col},${buildDecision.coord.row}) edges=[${buildDecision.edges}]`);
            const success = store.buildTrack(buildDecision.coord, buildDecision.edges);

            if (!success) {
              // [수정] 실패 좌표 기록 후 재시도 (decideBuildTrack가 실패 좌표 필터링)
              addFailedBuildCoord(capturedContext.currentPlayer, buildDecision.coord, beforeState.currentTurn);
              console.warn(`[AI 트랙 건설] 실패: (${buildDecision.coord.col},${buildDecision.coord.row}) → 재시도`);
              releaseAILock(executionId, get, set);
              scheduleAICheck(get);
              return;
            }

            // 트랙 건설 후 상태 확인
            const afterBuildState = get();
            const { builtTracksThisTurn, maxTracksThisTurn } = afterBuildState.phaseState;

            // 아직 더 건설할 수 있으면 다시 AI 결정 실행 (스케줄러 사용)
            if (builtTracksThisTurn < maxTracksThisTurn) {
              releaseAILock(executionId, get, set);
              scheduleAICheck(get);
              return; // nextPhase 호출하지 않음
            }
            // 3/3을 다 썼어도, 방금 타일이 마을에 새 연결을 만들어 무료(0카운트) 가닥이 남았으면 한 번 더
            // 호출해 같은 턴에 메운다 (미연결 토막 방지). buildSpur는 종료로 가므로 루프 없음.
            if (hasPendingFreeSpur(afterBuildState, capturedContext.currentPlayer)) {
              releaseAILock(executionId, get, set);
              scheduleAICheck(get);
              return;
            }
          } else if (buildDecision.action === 'buildSpur') {
            // 마을 가닥 단독 건설 (지난 턴 카운트 부족으로 미연결된 트랙의 연결 완성)
            const beforeState = get();
            const buildNum = beforeState.phaseState.builtTracksThisTurn + 1;
            console.log(`[AI 트랙 건설] Turn ${beforeState.currentTurn}, ${player.name}: ${buildNum}/${beforeState.phaseState.maxTracksThisTurn}번째 마을 가닥 (${buildDecision.townCoord.col},${buildDecision.townCoord.row})`);
            const spurSuccess = store.buildTownSpur(buildDecision.townCoord);

            if (spurSuccess) {
              const afterSpurState = get();
              if (afterSpurState.phaseState.builtTracksThisTurn < afterSpurState.phaseState.maxTracksThisTurn) {
                releaseAILock(executionId, get, set);
                scheduleAICheck(get);
                return; // 남은 카운트로 계속 건설
              }
            } else {
              // 실패 시 재시도하지 않고 단계 종료 (무한 루프 방지)
              console.warn(`[AI 트랙 건설] 마을 가닥 실패: (${buildDecision.townCoord.col},${buildDecision.townCoord.row}) → 건설 단계 종료`);
            }
          } else if (buildDecision.action === 'buildComplex') {
            // 복합 트랙 건설 (교차 또는 공존)
            const beforeState = get();
            const buildNum = beforeState.phaseState.builtTracksThisTurn + 1;
            console.log(`[AI 트랙 건설] Turn ${beforeState.currentTurn}, ${player.name}: ${buildNum}/${beforeState.phaseState.maxTracksThisTurn}번째 복합트랙(${buildDecision.trackType}) (${buildDecision.coord.col},${buildDecision.coord.row}) edges=[${buildDecision.edges}]`);
            const complexSuccess = store.buildComplexTrack(buildDecision.coord, buildDecision.edges, buildDecision.trackType);

            if (!complexSuccess) {
              // [수정] 실패 좌표 기록 후 재시도
              addFailedBuildCoord(capturedContext.currentPlayer, buildDecision.coord, beforeState.currentTurn);
              console.warn(`[AI 트랙 건설] 복합 트랙 실패: (${buildDecision.coord.col},${buildDecision.coord.row}) → 재시도`);
              releaseAILock(executionId, get, set);
              scheduleAICheck(get);
              return;
            }

            // 트랙 건설 후 상태 확인
            const afterBuildState = get();
            const { builtTracksThisTurn, maxTracksThisTurn } = afterBuildState.phaseState;

            // 아직 더 건설할 수 있으면 다시 AI 결정 실행 (스케줄러 사용)
            if (builtTracksThisTurn < maxTracksThisTurn) {
              releaseAILock(executionId, get, set);
              scheduleAICheck(get);
              return; // nextPhase 호출하지 않음
            }
          }
          // 더 이상 건설 불가하거나 skip이면 다음 플레이어로 전환
          store.nextPhase();
          break;
        }

        case 'moveGoods': {
          const { decision: moveDecision } = decision;
          if (moveDecision.action === 'move') {
            // 큐브 선택 및 이동 (completeCubeMove에서 nextPhase 호출됨)
            store.selectCube(moveDecision.sourceCityId, moveDecision.cubeIndex);
            store.selectDestinationCity(moveDecision.destinationCoord);
            // move 액션: 애니메이션이 완료될 때까지 락 유지
            // completeCubeMove에서 releaseAILock 호출됨
            return;
          } else if (moveDecision.action === 'moveTrackCube') {
            // St. Lucia: 트랙 위 큐브 배달 — 애니메이션 시작
            // 성공 시 락 유지: completeCubeMove에서 releaseAILock + nextPhase
            const ok = store.moveTrackCube(moveDecision.trackId, moveDecision.destCityId);
            if (!ok) {
              store.nextPhase(); // 배달 실패 시 스킵으로 처리
              releaseAILock(executionId, get, set);
              scheduleAICheck(get);
            }
            return;
          } else if (moveDecision.action === 'upgradeEngine') {
            // 중요: captured currentPlayer를 사용 (레이스 컨디션 방지)
            store.upgradeEngine(capturedContext.currentPlayer);
            store.nextPhase();
          } else {
            // skip
            store.nextPhase();
          }
          break;
        }

        case 'skip':
        default:
          store.nextPhase();
          break;
      }

      // 락 해제 및 다음 AI 체크 스케줄링
      releaseAILock(executionId, get, set);
      scheduleAICheck(get);
    }, AI_TURN_DELAY);
  },

  // ============================================================
  // 플레이어 순환 헬퍼
  // ============================================================
  getNextPlayer: (playerId: PlayerId) => {
    const state = get();
    const currentIndex = state.activePlayers.indexOf(playerId);
    const nextIndex = (currentIndex + 1) % state.activePlayers.length;
    return state.activePlayers[nextIndex];
  },

  getPreviousPlayer: (playerId: PlayerId) => {
    const state = get();
    const currentIndex = state.activePlayers.indexOf(playerId);
    const prevIndex = (currentIndex - 1 + state.activePlayers.length) % state.activePlayers.length;
    return state.activePlayers[prevIndex];
  },

  // ============================================================
  // Phase I: 주식 발행
  // ============================================================
  issueShare: (playerId, amount) => {
    const state = get();
    logAction('preparation', 'issueShare', { player: playerId, amount, turn: state.currentTurn });
    const player = state.players[playerId];
    if (!player) {
      console.error(`[ERROR] issueShare: 플레이어 없음 - playerId: ${playerId}`);
      return;
    }
    const maxShares = GAME_CONSTANTS.MAX_SHARES - player.issuedShares;
    const actualAmount = Math.min(amount, maxShares);

    if (actualAmount <= 0) {
      console.warn(`[WARN] issueShare: 발행 불가 - playerId: ${playerId}, 요청: ${amount}, 최대 가능: ${maxShares}`);
      return;
    }

    captureUndo(state, `주식 ${actualAmount}주 발행`);

    set({
      players: {
        ...state.players,
        [playerId]: {
          ...player,
          issuedShares: player.issuedShares + actualAmount,
          cash: player.cash + actualAmount * GAME_CONSTANTS.SHARE_VALUE,
        },
      },
      undoCount: undoSnapshots.length,
      logs: [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: playerId,
          action: `주식 ${actualAmount}주 발행 (+$${actualAmount * GAME_CONSTANTS.SHARE_VALUE})`,
          timestamp: Date.now(),
        },
      ],
    });
  },

  // ============================================================
  // Phase II: 플레이어 순서 경매 + 교대 선공권(alternateTurnOrder 맵)
  // — slices/auctionSlice.ts로 분리 (스텝 3c)
  // ============================================================
  ...createAuctionSlice(set, get),

  // ============================================================
  // St. Lucia: 트랙 위 큐브 배달 (미완성 링크 허용 + 보너스 수입)
  // ============================================================
  moveTrackCube: (trackId, destCityId) => {
    const state = get();
    const currentPlayer = state.currentPlayer;
    logAction('goodsMovement', 'moveTrackCube', { player: currentPlayer, trackId, dest: destCityId, turn: state.currentTurn });

    if (state.phaseState.playerMoves[currentPlayer]) {
      console.warn('[moveTrackCube] 이미 이번 라운드에 이동함');
      return false;
    }

    // 수송 시작 — 같은 도시로 가는 후보 루트를 모두 로그(사람/AI 공통), 그 다음 선택 루트 로그
    const deliveries = findTrackCubeDeliveries(
      state.board, trackId, state.players[state.currentPlayer]?.engineLevel ?? 1, state.currentPlayer,
      (cand) => logAction('goodsMovement', 'deliveryCandidate', { player: currentPlayer, trackId, ...cand }),
    );
    const delivery = deliveries.find(d => d.city.id === destCityId);
    if (!delivery) {
      console.warn(`[moveTrackCube] 배달 불가: track=${trackId} → ${destCityId}`);
      return false;
    }
    logAction('goodsMovement', 'deliverySelected', {
      player: currentPlayer, trackId, dest: destCityId,
      linkCount: delivery.linkCount, oppLinks: delivery.oppLinks,
      path: [...delivery.pathCoords, delivery.city.coord],
    });

    const track = state.board.trackTiles.find(t => t.id === trackId);
    if (!track || !track.cube) return false;
    const cubeColor = track.cube;

    // 큐브를 트랙에서 즉시 제거하고 애니메이션 시작
    // (수입/이동 완료 처리는 completeCubeMove에서 — 도시 큐브 배달과 동일한 흐름)
    const newTrackTiles = state.board.trackTiles.map(t =>
      t.id === trackId ? { ...t, cube: null } : t
    );
    const path = [...delivery.pathCoords, delivery.city.coord];
    const context: MovingCubeContext = {
      playerId: currentPlayer,
      phase: state.currentPhase,
      moveRound: state.phaseState.moveGoodsRound,
      trackCubeSectionOwner: delivery.sectionOwner,
    };

    set({
      board: { ...state.board, trackTiles: newTrackTiles },
      ui: {
        ...state.ui,
        movingCube: { color: cubeColor, path, currentIndex: 0, context },
        movePath: path,
        selectedCube: null,
        reachableDestinations: [],
      },
    });

    console.log(`[moveTrackCube] ${currentPlayer}: ${cubeColor} → ${destCityId} 애니메이션 시작 (구간 소유 ${delivery.sectionOwner ?? '없음'})`);
    // [PLAY] 사람 플레이 분석용 — 배달 링크 깊이(4-5링크 목표 확인)
    console.log(`[PLAY] T${state.currentTurn} ${currentPlayer} 배달 ${cubeColor}→${destCityId} ${delivery.linkCount}링크 (경로 ${path.map(c => `(${c.col},${c.row})`).join('→')})`);
    return true;
  },

  // ============================================================
  // Phase III: 행동 선택
  // ============================================================
  selectAction: (playerId, action) => {
    logAction('preparation', 'selectAction', { player: playerId, action, turn: get().currentTurn });
    // 성공 조건을 미리 확인하고 스냅샷 저장 (취소 버튼용 — locomotive 즉시 효과까지 되돌리기 위함)
    {
      const pre = get();
      const prePlayer = pre.players[playerId];
      if (
        prePlayer &&
        !getMapProfile(pre.mapId).disabledActions.includes(action) &&
        !Object.values(pre.players).some((p) => p.selectedAction === action)
      ) {
        captureUndo(pre, `행동 선택 (${ACTION_INFO[action]?.name ?? action})`);
      }
    }

    set((state) => {
      // 플레이어 존재 검증
      const player = state.players[playerId];
      if (!player) {
        console.error(`[ERROR] selectAction: 플레이어 없음 - playerId: ${playerId}`);
        return state;
      }

      // 맵 룰에서 비활성화된 행동인지 확인 (예: St. Lucia의 production)
      if (getMapProfile(state.mapId).disabledActions.includes(action)) {
        console.warn(`[WARN] selectAction: 이 맵에서 사용 불가한 행동 - playerId: ${playerId}, action: ${action}`);
        return state;
      }

      // 이미 선택된 행동인지 확인
      const alreadySelected = Object.values(state.players).some(
        (p) => p.selectedAction === action
      );
      if (alreadySelected) {
        console.warn(`[WARN] selectAction: 이미 선택된 행동 - playerId: ${playerId}, action: ${action}`);
        return state;
      }

      const newState: Partial<GameState> = {
        players: {
          ...state.players,
          [playerId]: {
            ...player,
            selectedAction: action,
          },
        },
      };

      // Locomotive 즉시 적용
      if (action === 'locomotive') {
        const currentPlayers = newState.players ?? state.players;
        if (player.engineLevel < GAME_CONSTANTS.MAX_ENGINE) {
          const oldLevel = player.engineLevel;
          const newLevel = oldLevel + 1;
          console.log(`[Locomotive] ${player.name}: 엔진 즉시 업그레이드 ${oldLevel} → ${newLevel}`);
          newState.players = {
            ...currentPlayers,
            [playerId]: {
              ...currentPlayers[playerId],
              engineLevel: newLevel,
            },
          };
          newState.phaseState = {
            ...state.phaseState,
            locomotiveUsed: true,
          };
        }
      }

      // Engineer 효과
      if (action === 'engineer') {
        // Germany: Engineer는 '트랙 1개를 절반 비용으로'(룰북)이며 4타일 혜택은 없다 → 표준 타일 수 유지
        const engineerHalfCost = getMapProfile(state.mapId).engineerHalfCost;
        newState.phaseState = {
          ...state.phaseState,
          maxTracksThisTurn: engineerHalfCost ? GAME_CONSTANTS.NORMAL_TRACK_LIMIT : GAME_CONSTANTS.ENGINEER_TRACK_LIMIT,
        };
      }

      // 로깅 추가
      newState.logs = [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: playerId,
          action: `행동 선택: ${action}`,
          timestamp: Date.now(),
        },
      ];

      newState.undoCount = undoSnapshots.length;

      return newState as GameState;
    });
  },

  // ============================================================
  // Phase IV: 트랙 건설
  // ============================================================
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
    if (existingTrack) {
      // 리다이렉트 가능 여부 확인
      if (!canRedirectTrack(coord, board, currentPlayer)) {
        return false;
      }
    }

    // 연결성 검증 (Western US: 시작도시 제한 + 대륙횡단 전 연속성 강제)
    const hasExistingTrack = playerHasTrack(board, currentPlayer);
    const profile = getMapProfile(state.mapId);
    const allowedStartCityIds = profile.startingCitiesOnly
      ? new Set(board.cities.filter(c => profile.isStartingCity(c)).map(c => c.id))
      : undefined;
    const requireNetwork = profile.requireContiguousUntilTranscontinental
      && !state.players[currentPlayer]?.transcontinental;

    if (!hasExistingTrack) {
      // 첫 트랙: (시작) 도시에 인접해야 함
      if (!validateFirstTrackRule(coord, edges, board, allowedStartCityIds)) {
        return false;
      }
    } else {
      // 후속 트랙: 기존 트랙/도시에 연결되어야 함 (연속성 강제 시 분리 구간 금지)
      if (!validateTrackConnection(coord, edges, board, currentPlayer, requireNetwork)) {
        return false;
      }
    }

    return true;
  },

  applyTranscontinental: () => {
    const result = computeTranscontinental(get(), get().currentPlayer);
    if (!result) return;
    set({
      players: result.players,
      transcontinentalAwarded: result.awarded,
      // 보너스 수령 or 연속성 해제가 발생한 순간 — 사람에게 팝업으로 알림 (모달이 닫으면 초기화)
      transcontinentalEvent: result.event,
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

    // 비용 계산
    let cost = 0;
    const existingTrack = state.board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));

    if (existingTrack) {
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
    // Germany: Engineer 절반 비용 — 이번 턴 1회, 타일 비용에만 (마을 가닥 제외).
    // 평지($2)에 낭비하지 않고 비용이 더 비싼 헥스(강/산/고정비용)에 우선 적용한다.
    let engineerDiscountApplied = false;
    if (mapProfile.engineerHalfCost && player.selectedAction === 'engineer'
        && !state.phaseState.engineerHalfUsed && cost > GAME_CONSTANTS.PLAIN_TRACK_COST) {
      cost = Math.ceil(cost / 2);
      engineerDiscountApplied = true;
    }
    // 마을 안 가닥 비용 (가닥당 $1)
    cost += newSpurs.length * TOWN_SPUR_COST;

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
    const trackId = existingTrack ? existingTrack.id : `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newTrack: TrackTile = {
      id: trackId,
      coord,
      edges,
      owner: currentPlayer,
      trackType: 'simple',
      builtTurn: state.currentTurn,
      ...(carriedCube ? { cube: carriedCube } : {}),
    };

    const newTrackTiles = existingTrack
      ? state.board.trackTiles.map(t => hexCoordsEqual(t.coord, coord) ? newTrack : t)
      : [...state.board.trackTiles, newTrack];

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
        engineerHalfUsed: state.phaseState.engineerHalfUsed || engineerDiscountApplied,
      },
      logs: [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: currentPlayer,
          action: `트랙 건설 (${coord.col}, ${coord.row})${newSpurs.length > 0 ? ` + 마을 가닥 ${newSpurs.length}개` : ''}${skippedSpurCount > 0 ? ' (마을 미연결 — 다음 턴 마을 클릭으로 가닥 건설)' : ''} - $${cost} [${newBuiltCount}/${state.phaseState.maxTracksThisTurn}]`,
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
          cash: player.cash - cost - complexSpurs.length * TOWN_SPUR_COST,
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
    if (state.currentPhase !== 'buildTrack') return false;
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
      targetCount = findMissingTownSpurs(townCoord, state.board, state.currentPlayer).length;
    }
    if (targetCount === 0) return false;
    // 카운트 = 이번 턴에 "내가" 그 마을을 변경한 적 있으면 0(같은 마을 추가 가닥), 처음이면 1. 지난 턴 무관.
    // ★ owner 필터 필수: 상대가 같은 턴 같은 마을에 가닥을 지어도 내 카운트는 영향 없어야 한다
    //   (필터 누락 시 중앙 마을을 둘 다 거치는 St.Lucia에서 내 가닥이 공짜가 돼 4건설 위반 발생).
    const builtThisTurn = (state.board.townSpurs ?? []).some(
      e => hexCoordsEqual(e.townCoord, townCoord) && e.builtTurn === state.currentTurn && e.owner === state.currentPlayer
    );
    const townCount = builtThisTurn ? 0 : 1;
    if (state.phaseState.builtTracksThisTurn + townCount > state.phaseState.maxTracksThisTurn) return false;
    const player = state.players[state.currentPlayer];
    if (!player || player.cash < targetCount * TOWN_SPUR_COST) return false;
    return true;
  },

  buildTownSpur: (townCoord, edge) => {
    const state = get();
    logAction('trackBuilding', 'buildTownSpur', { player: state.currentPlayer, town: townCoord, edge, turn: state.currentTurn });
    if (!state.canBuildTownSpur(townCoord, edge)) return false;

    captureUndo(state, `마을 가닥 건설 (${townCoord.col},${townCoord.row})`);

    const currentPlayer = state.currentPlayer;
    const player = state.players[currentPlayer];
    // edge 지정: 그 변 가닥만(방향 직접 선택). 생략: 마을에 닿은 미연결 트랙 변 전부.
    // 카운트 = 이번 턴 그 마을 첫 변경이면 1, 추가면 0. 비용은 가닥당 $1.
    const missing = edge !== undefined ? [{ townCoord, edge }] : findMissingTownSpurs(townCoord, state.board, currentPlayer);
    // owner 필터 필수 — 상대의 같은 턴 같은 마을 가닥이 내 카운트를 0으로 만들면 안 됨 (4건설 위반 방지)
    const builtThisTurn = (state.board.townSpurs ?? []).some(
      e => hexCoordsEqual(e.townCoord, townCoord) && e.builtTurn === state.currentTurn && e.owner === currentPlayer
    );
    const townCount = builtThisTurn ? 0 : 1;
    const cost = missing.length * TOWN_SPUR_COST;
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
            owner: currentPlayer,
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

  // ============================================================
  // Phase V: 물품 이동
  // ============================================================
  moveGoods: (cubeColor, path) => {
    set((state) => {
      if (path.length < 2) {
        console.warn(`[WARN] moveGoods: 경로 부족 - cubeColor: ${cubeColor}, pathLength: ${path.length}`);
        return state;
      }

      const fromCoord = path[0];
      // TODO: toCoord를 사용한 도착 도시 검증 로직 추가 예정

      // 출발 도시에서 큐브 제거
      const newCities = state.board.cities.map((city) => {
        if (city.coord.col === fromCoord.col && city.coord.row === fromCoord.row) {
          const cubeIndex = city.cubes.indexOf(cubeColor);
          if (cubeIndex >= 0) {
            return {
              ...city,
              cubes: city.cubes.filter((_, i) => i !== cubeIndex),
            };
          }
        }
        return city;
      });

      // 경로에서 완성된 링크 소유자 확인 및 수입 계산
      const incomeChanges: Partial<Record<PlayerId, number>> = {};
      state.activePlayers.forEach(p => { incomeChanges[p] = 0; });

      let currentLinkOwner: PlayerId | null = null;
      let inLink = false;
      let prevStopCoord: HexCoord | null = null;

      for (let i = 0; i < path.length; i++) {
        const coord = path[i];
        const isCity = state.board.cities.some(c => hexCoordsEqual(c.coord, coord));
        const isTown = state.board.towns.some(t => hexCoordsEqual(t.coord, coord));

        if (isCity || isTown) {
          if (inLink && currentLinkOwner) {
            // 도시/마을에 도착했으므로 이전 링크 완료, 소유자 수입 +1
            incomeChanges[currentLinkOwner] = (incomeChanges[currentLinkOwner] || 0) + 1;
          } else if (inLink && !currentLinkOwner && prevStopCoord) {
            // Germany 직결 링크: 사이 트랙 없이 두 도시가 바로 이어진 구간 → 직결 owner 수입 +1
            const a = state.board.cities.find(c => hexCoordsEqual(c.coord, prevStopCoord!));
            const b = state.board.cities.find(c => hexCoordsEqual(c.coord, coord));
            if (a && b) {
              const dl = (state.board.directLinks ?? []).find(d => d.owner &&
                ((d.cityA === a.id && d.cityB === b.id) || (d.cityA === b.id && d.cityB === a.id)));
              if (dl?.owner && state.activePlayers.includes(dl.owner)) {
                incomeChanges[dl.owner] = (incomeChanges[dl.owner] || 0) + 1;
              }
            }
          }
          // 새 링크 시작
          inLink = true;
          currentLinkOwner = null;
          prevStopCoord = coord;
        } else {
          // 트랙 구간: 소유자 확인 (한 링크는 한 소유자만 가짐)
          if (inLink && !currentLinkOwner) {
            const track = state.board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
            if (track?.owner) {
              currentLinkOwner = track.owner;
            }
          }
        }
      }

      const newPlayers = { ...state.players };
      for (const playerId of state.activePlayers) {
        const incomeGain = incomeChanges[playerId] ?? 0;
        if (incomeGain > 0) {
          newPlayers[playerId] = {
            ...newPlayers[playerId],
            income: Math.min(
              newPlayers[playerId].income + incomeGain,
              GAME_CONSTANTS.MAX_INCOME
            ),
          };
        }
      }

      return {
        board: {
          ...state.board,
          cities: newCities,
        },
        players: newPlayers,
        phaseState: {
          ...state.phaseState,
          playerMoves: {
            ...state.phaseState.playerMoves,
            [state.currentPlayer]: true,
          },
        },
        ui: {
          ...state.ui,
          movePath: [],
          selectedCube: null,
        },
      };
    });
  },

  upgradeEngine: (targetPlayerId?: PlayerId) => {
    set((state) => {
      // targetPlayerId가 제공되면 사용, 아니면 currentPlayer 사용
      const playerId = targetPlayerId || state.currentPlayer;
      logAction('goodsMovement', 'upgradeEngine', { player: playerId, turn: state.currentTurn });
      const player = state.players[playerId];
      if (!player) {
        console.error(`[ERROR] upgradeEngine: 플레이어 없음 - playerId: ${playerId}`);
        return state;
      }
      if (player.engineLevel >= GAME_CONSTANTS.MAX_ENGINE) {
        console.warn(`[WARN] upgradeEngine: 최대 레벨 도달 - playerId: ${playerId}, engineLevel: ${player.engineLevel}`);
        return state;
      }
      // 이미 이동했으면 업그레이드 불가 (물품 이동 또는 업그레이드 중 택1)
      if (state.phaseState.playerMoves[playerId]) {
        console.warn(`[WARN] upgradeEngine: 이미 이동 완료 - playerId: ${playerId}`);
        return state;
      }
      // 이번 턴에 이미 엔진 업그레이드했으면 불가 (2 move round 통틀어 1회만 — 룰북)
      if (state.phaseState.engineUpgradedThisTurn?.[playerId]) {
        console.warn(`[WARN] upgradeEngine: 이번 턴 이미 엔진업 완료 - playerId: ${playerId}`);
        return state;
      }

      const oldLevel = player.engineLevel;
      const newLevel = player.engineLevel + 1;
      console.log(`[upgradeEngine] ${player.name}: 엔진 업그레이드 ${oldLevel} → ${newLevel}`);
      console.log(`[PLAY] T${state.currentTurn} ${playerId} 엔진업 ${oldLevel}→${newLevel}`);

      return {
        players: {
          ...state.players,
          [playerId]: {
            ...player,
            engineLevel: newLevel,
          },
        },
        phaseState: {
          ...state.phaseState,
          playerMoves: {
            ...state.phaseState.playerMoves,
            [playerId]: true,
          },
          // 턴당 1회 엔진업 — 라운드2로 넘어가도 유지돼 재업그레이드를 막는다
          engineUpgradedThisTurn: {
            ...state.phaseState.engineUpgradedThisTurn,
            [playerId]: true,
          },
        },
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: playerId,
            action: `엔진 업그레이드: ${oldLevel} → ${newLevel} 링크`,
            timestamp: Date.now(),
          },
        ],
      };
    });
  },

  // ============================================================
  // Phase VI-VIII: 수입/비용
  // ============================================================
  collectIncome: () => {
    set((state) => {
      const newPlayers = { ...state.players };
      const newLogs = [...state.logs];

      for (const playerId of state.activePlayers) {
        const player = newPlayers[playerId];
        if (!player) continue;
        const incomeCollected = Math.max(0, player.income);
        newPlayers[playerId] = {
          ...player,
          cash: player.cash + incomeCollected,
        };

        // 각 플레이어 수입 수집 로깅
        newLogs.push({
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: playerId,
          action: `수입 수집: $${incomeCollected}`,
          timestamp: Date.now(),
        });
      }

      // 새 턴 수입 수집 시점에 직전 수입 감소 배지 초기화 (한 턴 동안만 노출)
      return { players: newPlayers, logs: newLogs, incomeReductions: null };
    });
  },

  payExpenses: () => {
    set((state) => {
      const newPlayers = { ...state.players };
      let newBoard = state.board;
      const bankruptPlayers: PlayerId[] = [];
      const newLogs = [...state.logs];

      console.log(`[payExpenses] 시작 - activePlayers: ${state.activePlayers.join(', ')}`);

      for (const playerId of state.activePlayers) {
        const player = newPlayers[playerId];
        if (!player) continue;

        // 이미 탈락한 플레이어는 건너뛰기
        if (player.eliminated) {
          console.log(`[payExpenses] ${player.name}: 이미 탈락 - 스킵`);
          continue;
        }

        const expense = player.issuedShares + player.engineLevel;
        console.log(`[payExpenses] ${player.name}: expense=${expense} (shares=${player.issuedShares} + engine=${player.engineLevel}), cash=${player.cash}, income=${player.income}`);

        if (player.cash >= expense) {
          // 현금으로 지불 가능
          console.log(`[payExpenses] ${player.name}: 현금 지불 가능 - cash ${player.cash} → ${player.cash - expense}`);
          newPlayers[playerId] = {
            ...player,
            cash: player.cash - expense,
          };
        } else {
          // 현금 부족 시 수입 감소
          const shortage = expense - player.cash;
          const newIncome = player.income - shortage;

          console.log(`[payExpenses] ${player.name}: 현금 부족 - shortage=${shortage}, newIncome=${newIncome}, MIN_INCOME=${GAME_CONSTANTS.MIN_INCOME}`);

          // 파산 체크: 수입이 MIN_INCOME 미만이면 파산
          if (newIncome < GAME_CONSTANTS.MIN_INCOME) {
            // 파산 처리
            console.log(`[payExpenses] ${player.name}: 파산! (newIncome ${newIncome} < MIN_INCOME ${GAME_CONSTANTS.MIN_INCOME})`);
            bankruptPlayers.push(playerId);
            newPlayers[playerId] = {
              ...player,
              cash: 0,
              income: GAME_CONSTANTS.MIN_INCOME,
              eliminated: true,
            };

            newLogs.push({
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: playerId,
              action: `${player.name} 파산! (비용 $${expense}, 현금 $${player.cash}, 수입 ${player.income})`,
              timestamp: Date.now(),
            });
          } else {
            // 수입 감소로 비용 충당
            console.log(`[payExpenses] ${player.name}: 수입 감소로 충당 - income ${player.income} → ${newIncome}`);
            newPlayers[playerId] = {
              ...player,
              cash: 0,
              income: newIncome,
            };

            newLogs.push({
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: playerId,
              action: `비용 지불: 현금 부족으로 수입 ${shortage} 감소 (${player.income} → ${newIncome})`,
              timestamp: Date.now(),
            });
          }
        }
      }

      // 파산한 플레이어의 모든 트랙을 공용(미소유)으로 전환.
      // 룰: 미완성 트랙은 소유 디스크를 제거하고, 완성 링크는 보드에 남되 파산자는 그 위
      // 운송으로 수입을 받지 못한다. → 완성/미완성 모두 owner를 null로 만들면, 누구나 그
      // 위로 이동할 수 있는 공용 철도가 되고, 소유자가 없으므로 그 링크 운송으로는 아무도
      // 수입을 받지 못한다 (복합 트랙의 secondaryOwner, 마을 가닥 townSpur도 동일).
      if (bankruptPlayers.length > 0) {
        console.log(`[payExpenses] 파산 플레이어: ${bankruptPlayers.join(', ')} — 철도를 공용으로 전환`);
        const updatedTrackTiles = newBoard.trackTiles.map(track => {
          let t = track;
          if (track.owner && bankruptPlayers.includes(track.owner)) t = { ...t, owner: null };
          if (t.secondaryOwner && bankruptPlayers.includes(t.secondaryOwner)) t = { ...t, secondaryOwner: null };
          return t;
        });
        const updatedTownSpurs = (newBoard.townSpurs ?? []).filter(
          sp => !bankruptPlayers.includes(sp.owner)
        );
        newBoard = {
          ...newBoard,
          trackTiles: updatedTrackTiles,
          townSpurs: updatedTownSpurs,
        };
      }

      // 남은 플레이어 수 체크 - 1명만 남으면 게임 종료
      const remainingPlayers = state.activePlayers.filter(
        pid => !newPlayers[pid]?.eliminated
      );

      console.log(`[payExpenses] 남은 플레이어: ${remainingPlayers.length}명 (${remainingPlayers.join(', ')})`);

      if (remainingPlayers.length <= 1) {
        const winner = remainingPlayers[0];
        const winnerName = winner ? newPlayers[winner]?.name : '없음';

        console.log(`[payExpenses] 게임 종료! 승자: ${winnerName}`);

        newLogs.push({
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: winner || state.currentPlayer,
          action: `게임 종료! ${winnerName} 승리 (상대 파산)`,
          timestamp: Date.now(),
        });

        return {
          players: newPlayers,
          board: newBoard,
          logs: newLogs,
          currentPhase: 'gameOver' as GamePhase,
          winner: winner || null,
        };
      }

      return {
        players: newPlayers,
        board: newBoard,
        logs: newLogs,
      };
    });
  },

  applyIncomeReduction: () => {
    set((state) => {
      const newPlayers = { ...state.players };
      const newLogs = [...state.logs];
      // 이번 감소량을 플레이어별로 기록 → PlayerPanel "-N (수익 감소)" 배지
      const reductions: Partial<Record<PlayerId, number>> = {};
      // Southern US: 4턴(남북전쟁)에는 수입 감소 2배 — 플레이어 루프 밖에서 1회 계산
      const incomeReductionMult = getMapProfile(state.mapId).incomeReductionMultiplier(state.currentTurn);

      for (const playerId of state.activePlayers) {
        const player = newPlayers[playerId];
        if (!player) continue;
        let reduction = 0;

        for (const rule of GAME_CONSTANTS.INCOME_REDUCTION) {
          if (player.income >= rule.min && player.income <= rule.max) {
            reduction = rule.reduction;
            break;
          }
        }

        reduction *= incomeReductionMult;

        if (reduction > 0) {
          const oldIncome = player.income;
          const newIncome = Math.max(player.income - reduction, GAME_CONSTANTS.MIN_INCOME);
          const applied = oldIncome - newIncome;
          newPlayers[playerId] = {
            ...player,
            income: newIncome,
          };
          if (applied > 0) reductions[playerId] = applied;

          // 수입 감소 로깅
          newLogs.push({
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: playerId,
            action: `수입 감소: ${oldIncome} → ${newIncome} (-${reduction})`,
            timestamp: Date.now(),
          });
        }
      }

      return {
        players: newPlayers,
        logs: newLogs,
        incomeReductions: Object.keys(reductions).length > 0 ? reductions : null,
      };
    });
  },

  // ============================================================
  // Phase IX: 물품 성장
  // ============================================================
  growGoods: (diceResults) => {
    set((state) => {
      // Production은 이제 수동으로 처리됨 (startProduction/confirmProduction)
      // 여기서는 주사위 결과에 따른 물품 성장만 처리

      const newSlots = [...state.goodsDisplay.slots];
      const newBag = [...state.goodsDisplay.bag];
      const newCities = state.board.cities.map(city => ({ ...city, cubes: [...city.cubes] }));
      const newLogs = [...state.logs];

      // 열-도시 매핑 (맵 레지스트리의 columnMapping에서 유도).
      // 한 주사위 번호를 여러 도시 열이 공유할 수 있다 (Rust Belt: 12도시가 6번호를 2개씩).
      // diceNumber 미지정 시 columnId를 숫자로 해석 (Tutorial '1'~'6' 하위 호환).
      const columnMapping = getMapData(state.mapId).columnMapping;
      type ColInfo = { cityId: string; startIndex: number; rowCount: number };
      const colsByDice: Record<number, ColInfo[]> = {};
      {
        let slotIndex = 0;
        for (const m of columnMapping) {
          const startIndex = slotIndex;
          slotIndex += m.rowCount;
          // 신규 도시 열도 diceNumber가 있으면 보충 대상.
          // 배치 안 된 신규 도시는 아래에서 city를 못 찾아(if (!city) continue) 자동으로 건너뛴다.
          const dice = m.diceNumber ?? Number(m.columnId);
          if (!Number.isFinite(dice)) continue;
          if (!colsByDice[dice]) colsByDice[dice] = [];
          colsByDice[dice].push({ cityId: m.cityId, startIndex, rowCount: m.rowCount });
        }
      }

      // 주사위 번호별 출현 횟수
      const diceCounts: Record<number, number> = {};
      for (const result of diceResults) {
        diceCounts[result] = (diceCounts[result] || 0) + 1;
      }

      // noOwnColorCubes: 도시 자기 색 화물은 도시에 배치하지 않음 (튜토리얼)
      const skipOwnColor = getMapProfile(state.mapId).noOwnColorCubes;
      // 한국: 평양·수원은 물품 성장 안 받음 (columnMapping에서 이미 제외되지만 방어 가드)
      const noGrowthCityIds = new Set(getMapProfile(state.mapId).noGrowthCityIds);

      // 주사위 번호 → 그 번호를 공유하는 모든 도시 열에서 각각 count개씩 도시로 이동
      for (const [diceStr, count] of Object.entries(diceCounts)) {
        const cols = colsByDice[Number(diceStr)];
        if (!cols) continue;
        for (const col of cols) {
          if (noGrowthCityIds.has(col.cityId)) continue; // 평양·수원 성장 제외
          const city = newCities.find(c => c.id === col.cityId);
          if (!city) continue;

          // 위에서부터 큐브 가져오기 (자기 색 큐브는 건너뛰고 다음 큐브를 가져옴)
          let moved = 0;
          for (let i = 0; i < col.rowCount && moved < count; i++) {
            const slotIdx = col.startIndex + i;
            const cube = newSlots[slotIdx];
            if (cube && (!skipOwnColor || cube !== city.color)) {
              city.cubes.push(cube);
              newSlots[slotIdx] = null;
              moved++;
            }
          }

          if (moved > 0) {
            newLogs.push({
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: state.currentPlayer,
              action: `물품 성장: ${city.name}에 ${moved}개 추가`,
              timestamp: Date.now(),
            });
          }
        }
      }

      // Germany: Berlin은 매 물품 성장마다 주머니에서 무작위 큐브 1개를 받는다
      // Southern US: Atlanta는 1~4턴만 (bonusCityCubeMaxTurn — 남북전쟁 전 호황)
      const bonusProfile = getMapProfile(state.mapId);
      const bonusCityId = bonusProfile.bonusCityCubeId;
      const bonusMaxTurn = bonusProfile.bonusCityCubeMaxTurn;
      if (bonusCityId && (bonusMaxTurn == null || state.currentTurn <= bonusMaxTurn) && newBag.length > 0) {
        // 주머니는 이미 셔플돼 있으므로 pop으로 무작위 1개 — Math.random 미사용(시드 결정성 유지)
        const cube = newBag.pop();
        const bonusCity = newCities.find(c => c.id === bonusCityId);
        if (bonusCity && cube) {
          bonusCity.cubes.push(cube);
          console.log(`[Berlin 보너스] T${state.currentTurn} ${bonusCity.name}에 ${cube} 큐브 +1 (매 턴 물품 성장)`);
          newLogs.push({
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: state.currentPlayer,
            action: `${bonusCity.name} 보너스 물품 +1 (${cube})`,
            timestamp: Date.now(),
          });
        }
      }

      return {
        goodsDisplay: {
          slots: newSlots,
          bag: newBag,
        },
        board: {
          ...state.board,
          cities: newCities,
        },
        phaseState: {
          ...state.phaseState,
          productionUsed: true,
        },
        logs: newLogs,
      };
    });
  },

  // ============================================================
  // Phase X: 단계/턴 진행
  // ============================================================
  nextPhase: () => {
    const currentState = get();
    logAction('turnEnd', 'nextPhase', { from: currentState.currentPhase, player: currentState.currentPlayer, turn: currentState.currentTurn });

    // 이미 게임 오버면 진행하지 않음
    if (currentState.currentPhase === 'gameOver') {
      console.log('[nextPhase] 이미 게임 오버 - 진행 중단');
      return;
    }

    // 단계/차례가 넘어가면 이전 행동은 확정 — 실행 취소 스택 비움
    clearUndo();
    if (currentState.undoCount !== 0) {
      set({ undoCount: 0 });
    }

    // 자동 단계 로직 실행 (단계 전환 전에 실행)
    if (currentState.currentPhase === 'collectIncome') {
      get().collectIncome();
    } else if (currentState.currentPhase === 'payExpenses') {
      get().payExpenses();
      // payExpenses 후 gameOver 체크 - 파산으로 게임 종료되었으면 phase 전환 중단
      const afterPayExpenses = get();
      if (afterPayExpenses.currentPhase === 'gameOver') {
        console.log('[nextPhase] payExpenses 후 게임 오버 감지 - 진행 중단');
        return;
      }
    } else if (currentState.currentPhase === 'incomeReduction') {
      get().applyIncomeReduction();
    }

    set((state) => {
      // 다시 한번 gameOver 체크
      if (state.currentPhase === 'gameOver') {
        console.log('[nextPhase set] 게임 오버 상태 - 변경 없음');
        return state;
      }
      const mapRules = getMapProfile(state.mapId);
      // 룰북(St. Lucia): 선공권 결정(Determine Player Order)이 Issue Shares보다 먼저
      const phases: GamePhase[] = mapRules.alternateTurnOrder
        ? [
          'determinePlayerOrder',
          'issueShares',
          'selectActions',
          'buildTrack',
          'moveGoods',
          'collectIncome',
          'payExpenses',
          'incomeReduction',
          'goodsGrowth',
          'advanceTurn',
        ]
        : [
          'issueShares',
          'determinePlayerOrder',
          'selectActions',
          'buildTrack',
          'moveGoods',
          'collectIncome',
          'payExpenses',
          'incomeReduction',
          'goodsGrowth',
          'advanceTurn',
        ];

      const currentIndex = phases.indexOf(state.currentPhase);
      const playerOrder = state.playerOrder;
      const { activePlayers } = state;

      // 빈 배열 방어 검증
      if (playerOrder.length === 0 || activePlayers.length === 0) {
        console.error('[ERROR] nextPhase: playerOrder 또는 activePlayers가 비어있음');
        return state;
      }

      // 다음 플레이어는 경매로 정해진 순서(playerOrder)를 따른다.
      // (activePlayers는 player1,2,3… 고정 순서라 경매 1등이 밀리는 버그가 있었음 — 2인에선 동일해 안 드러남)
      const nextPlayer = getNextPlayerId(state.currentPlayer, playerOrder);

      // 현재 플레이어가 마지막 플레이어인지 확인
      const isLast = isLastPlayer(state.currentPlayer, playerOrder);

      // === I. 주식 발행 단계 ===
      if (state.currentPhase === 'issueShares') {
        // 마지막 플레이어까지 완료했으면 다음 단계로
        if (isLast) {
          // 교대 선공권 맵(St. Lucia): 선공권은 이미 턴 시작에 끝남 → 행동 선택으로
          const nextAfterShares: GamePhase = mapRules.alternateTurnOrder
            ? 'selectActions'
            : 'determinePlayerOrder';
          return {
            currentPhase: nextAfterShares,
            currentPlayer: playerOrder[0],
          };
        }
        // 다음 플레이어로 전환
        return {
          currentPlayer: nextPlayer,
        };
      }

      // === II. 플레이어 순서 결정 ===
      if (state.currentPhase === 'determinePlayerOrder') {
        // 교대 선공권 맵(St. Lucia): 선공권이 턴 첫 단계 → 주식 발행으로
        const nextAfterOrder: GamePhase = mapRules.alternateTurnOrder
          ? 'issueShares'
          : 'selectActions';
        console.log(`[nextPhase] determinePlayerOrder → ${nextAfterOrder}: playerOrder=[${playerOrder.join(', ')}], 새 currentPlayer=${playerOrder[0]} (isAI: ${state.players[playerOrder[0]]?.isAI})`);
        return {
          currentPhase: nextAfterOrder,
          currentPlayer: playerOrder[0],
          turnOrderOffer: null, // 미해결 선공권 제안 정리 (안전장치)
        };
      }

      // === III. 행동 선택 단계 ===
      if (state.currentPhase === 'selectActions') {
        // 모든 플레이어가 행동을 선택했는지 확인
        const allSelected = allPlayersSelectedAction(state.players, activePlayers);

        if (allSelected) {
          // 모든 플레이어 선택 완료 → 다음 단계
          // First Build 확인
          const firstBuildPlayer = findFirstBuildPlayer(state.players, activePlayers);

          // 실제로 첫 번째로 건설할 플레이어 결정
          const firstBuilder = firstBuildPlayer || playerOrder[0];

          // 디버그: buildTrack 진입 로그
          const initialPlayerMoves = createPlayerMoves(activePlayers);
          console.log(`[buildTrack 진입] firstBuilder: ${firstBuilder}, playerOrder: [${playerOrder.join(', ')}]`);
          console.log(`[buildTrack 진입] activePlayers: [${activePlayers.join(', ')}]`);
          console.log(`[buildTrack 진입] 초기 playerMoves:`, JSON.stringify(initialPlayerMoves));

          return {
            currentPhase: 'buildTrack' as GamePhase,
            currentPlayer: firstBuilder,
            phaseState: {
              ...state.phaseState,
              builtTracksThisTurn: 0,
              lastBuiltCoords: [],
              engineerHalfUsed: false, // Germany: 빌더마다 Engineer 절반 할인 재설정
              // 첫 번째로 건설할 플레이어의 Engineer 효과 확인 (Germany는 4타일 혜택 없음 — 절반 비용만)
              maxTracksThisTurn: state.players[firstBuilder].selectedAction === 'engineer' && !getMapProfile(state.mapId).engineerHalfCost
                ? GAME_CONSTANTS.ENGINEER_TRACK_LIMIT
                : GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
              // 모든 플레이어의 건설 완료 상태 초기화
              playerMoves: initialPlayerMoves,
            },
          };
        }

        // 현재 플레이어가 선택했으면 다음 플레이어로 전환
        if (state.players[state.currentPlayer].selectedAction !== null) {
          console.log(`[nextPhase] selectActions 내 플레이어 전환: ${state.currentPlayer} → ${nextPlayer} (isAI: ${state.players[nextPlayer]?.isAI})`);
          return {
            currentPlayer: nextPlayer,
          };
        }

        // 아직 선택 안 했으면 상태 유지
        return state;
      }

      // === IV. 트랙 건설 단계 ===
      if (state.currentPhase === 'buildTrack') {
        // 디버그: 현재 상태 로그
        console.log(`[buildTrack nextPhase] currentPlayer: ${state.currentPlayer}`);
        console.log(`[buildTrack nextPhase] playerMoves 전:`, JSON.stringify(state.phaseState.playerMoves));

        // Germany 미완성 링크 금지: 방금 건설을 마친 플레이어의 이번 턴 미완성 신설 트랙 제거 + 환불
        let bwBoard = state.board;
        let bwPlayers = state.players;
        if (getMapProfile(state.mapId).requireCompleteLinks) {
          const r = removeIncompleteNewTracks(state.board, state.currentTurn, state.currentPlayer);
          if (r.board !== state.board) {
            bwBoard = r.board;
            const p = state.players[state.currentPlayer];
            bwPlayers = { ...state.players, [state.currentPlayer]: { ...p, cash: p.cash + r.refund } };
            console.log(`[미완성 제거] ${state.currentPlayer}: 미완성 신설 트랙 제거, $${r.refund} 환불 (Germany 미완성 링크 금지)`);
          }
        }

        // 현재 플레이어를 완료 처리 (이미 완료된 경우 중복 마킹 방지)
        const alreadyCompleted = state.phaseState.playerMoves[state.currentPlayer];
        if (alreadyCompleted) {
          console.log(`[buildTrack nextPhase] ${state.currentPlayer}는 이미 완료됨 - 중복 마킹 방지`);
        }
        const updatedPlayerMoves = alreadyCompleted
          ? state.phaseState.playerMoves
          : {
            ...state.phaseState.playerMoves,
            [state.currentPlayer]: true,
          };
        const allPlayersBuilt = allPlayersMoved(updatedPlayerMoves, activePlayers);

        console.log(`[buildTrack nextPhase] playerMoves 후:`, JSON.stringify(updatedPlayerMoves));
        console.log(`[buildTrack nextPhase] allPlayersBuilt: ${allPlayersBuilt}`);

        if (allPlayersBuilt) {
          // First Move 확인
          const firstMover = findFirstMovePlayer(state.players, activePlayers);

          // 디버그 로그
          console.log(`[Move Goods 진입] firstMover: ${firstMover || 'none'}, playerOrder[0]: ${playerOrder[0]}`);
          console.log(`[Move Goods 진입] 선택된 행동들:`, Object.entries(state.players).map(([id, p]) => `${id}: ${p.selectedAction}`));

          return {
            currentPhase: 'moveGoods' as GamePhase,
            currentPlayer: firstMover || playerOrder[0],
            board: bwBoard,       // Germany 미완성 트랙 제거 반영
            players: bwPlayers,   // 환불 반영
            phaseState: {
              ...state.phaseState,
              moveGoodsRound: 1,
              playerMoves: createPlayerMoves(activePlayers),
              // 새 Move Goods 단계 시작 — 엔진업 1회 권리 리셋(라운드2 전환 때는 유지해 턴당 1회 보장)
              engineUpgradedThisTurn: createPlayerMoves(activePlayers),
            },
            // 건설 단계 UI 잔재 제거 (선택 중이던 하이라이트가 물품 이동을 가리는 버그 방지)
            ui: {
              ...state.ui,
              buildMode: 'idle' as const,
              sourceHex: null,
              buildableNeighbors: [],
              highlightedHexes: [],
              previewTrack: null,
              selectedHex: null,
              targetHex: null,
              entryEdge: null,
              exitDirections: [],
            },
          };
        }

        // 다음 빌더: 경매 순서(playerOrder)에서 아직 건설 안 한 첫 플레이어.
        // First Build 선택자가 순서와 무관하게 먼저 건설한 뒤에도, 나머지는 경매 순서를 따른다.
        const nextBuilder = playerOrder.find(p => !updatedPlayerMoves[p]) ?? nextPlayer;
        console.log(`[빌드카운트 리셋] 차례 전환: ${state.currentPlayer}(${state.phaseState.builtTracksThisTurn}개 건설) → ${nextBuilder}, turn=${state.currentTurn}`);
        return {
          currentPlayer: nextBuilder,
          board: bwBoard,       // Germany 미완성 트랙 제거 반영
          players: bwPlayers,   // 환불 반영
          phaseState: {
            ...state.phaseState,
            builtTracksThisTurn: 0,
            lastBuiltCoords: [],
            engineerHalfUsed: false, // Germany: 빌더마다 Engineer 절반 할인 재설정
            maxTracksThisTurn: state.players[nextBuilder].selectedAction === 'engineer' && !getMapProfile(state.mapId).engineerHalfCost
              ? GAME_CONSTANTS.ENGINEER_TRACK_LIMIT
              : GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
            playerMoves: updatedPlayerMoves,
          },
          // 이전 플레이어의 건설 선택 UI 잔재 제거
          ui: {
            ...state.ui,
            buildMode: 'idle' as const,
            sourceHex: null,
            buildableNeighbors: [],
            highlightedHexes: [],
            previewTrack: null,
            selectedHex: null,
            targetHex: null,
            entryEdge: null,
            exitDirections: [],
          },
          logs: [
            ...state.logs,
            {
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: state.currentPlayer,
              action: `[시스템] 건설 차례 종료 (${state.phaseState.builtTracksThisTurn}개 건설) → ${state.players[nextBuilder]?.name} 차례`,
              timestamp: Date.now(),
            },
          ],
        };
      }

      // === V. 물품 이동 단계 ===
      if (state.currentPhase === 'moveGoods') {
        // 현재 플레이어를 완료 처리 (이미 완료된 경우 중복 마킹 방지)
        const alreadyCompleted = state.phaseState.playerMoves[state.currentPlayer];
        const updatedPlayerMoves = alreadyCompleted
          ? state.phaseState.playerMoves
          : {
            ...state.phaseState.playerMoves,
            [state.currentPlayer]: true,
          };
        const allMoved = allPlayersMoved(updatedPlayerMoves, activePlayers);

        if (allMoved) {
          // 모든 라운드 완료했으면 다음 단계
          if (state.phaseState.moveGoodsRound >= GAME_CONSTANTS.MOVE_GOODS_ROUNDS) {
            return {
              currentPhase: 'collectIncome' as GamePhase,
              currentPlayer: playerOrder[0],
            };
          }

          // 다음 라운드로 진행
          const firstMover = findFirstMovePlayer(state.players, activePlayers);

          return {
            phaseState: {
              ...state.phaseState,
              moveGoodsRound: 2,
              playerMoves: createPlayerMoves(activePlayers),
            },
            currentPlayer: firstMover || playerOrder[0],
          };
        }

        // 다음 이동자: 경매 순서(playerOrder)에서 아직 이동 안 한 첫 플레이어.
        // First Move 선택자가 먼저 이동한 뒤에도 나머지는 경매 순서를 따른다.
        const nextMover = playerOrder.find(p => !updatedPlayerMoves[p]) ?? nextPlayer;
        return {
          currentPlayer: nextMover,
          phaseState: {
            ...state.phaseState,
            playerMoves: updatedPlayerMoves,
          },
        };
      }

      // === VI-X. 자동 단계들 ===
      let nextIndex = (currentIndex + 1) % phases.length;
      // 맵 룰: 물품 성장 단계 생략 (St. Lucia)
      if (phases[nextIndex] === 'goodsGrowth' && getMapProfile(state.mapId).skipGoodsGrowth) {
        console.log('[nextPhase] 물품 성장 단계 생략 (맵 룰: skipGoodsGrowth)');
        nextIndex = (nextIndex + 1) % phases.length;
      }
      const nextPhaseName = phases[nextIndex];

      // advanceTurn 후에는 새 턴 시작
      if (currentIndex === phases.length - 1) {
        // 미완성 트랙 소유권 해제(룰 IV): 이번 턴에 연장 안 한 미완성 구간을 공용(owner null)으로
        const { board: cleanedBoard, released } = releaseUnextendedTrack(state.board, state.currentTurn);
        if (released > 0) {
          console.log(`[nextPhase] 미완성 트랙 ${released}개 공용화 (이번 턴 미연장 구간)`);
        }

        // 게임 종료 확인
        if (state.currentTurn >= state.maxTurns) {
          return {
            board: cleanedBoard,
            currentPhase: 'gameOver' as GamePhase,
          };
        }

        const newTurnBase = {
          currentPhase: nextPhaseName,
          currentTurn: state.currentTurn + 1,
          currentPlayer: playerOrder[0],
          board: cleanedBoard,
          phaseState: {
            builtTracksThisTurn: 0,
            maxTracksThisTurn: GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
            lastBuiltCoords: [] as HexCoord[],
            moveGoodsRound: 1 as const,
            playerMoves: createPlayerMoves(activePlayers),
            engineUpgradedThisTurn: createPlayerMoves(activePlayers),
            productionUsed: false,
      urbanizationUsed: false,
            locomotiveUsed: false,
          },
          players: resetPlayerActions(state.players, activePlayers),
        };

        // 교대 선공권 맵(St. Lucia): 새 턴은 선공권 제안으로 시작
        // 차례: Turn Order 행동 보유자(룰북: 다음 선공권 단계에서 1번으로 간주)가 있으면 선점,
        //       없으면 엄격 교대(nextFirstSeatOption). 어느 쪽이든 교대 시퀀스는 계속 진행.
        if (mapRules.alternateTurnOrder) {
          const turnOrderHolder = activePlayers.find(
            p => state.players[p]?.selectedAction === 'turnOrder'
          );
          const alternation = state.nextFirstSeatOption ?? playerOrder[0];
          const firstOption = turnOrderHolder ?? alternation;
          const nextAlternation = activePlayers.find(p => p !== alternation) ?? alternation;
          console.log(`[nextPhase] 턴 ${state.currentTurn + 1} 교대 선공권 시작: 제안 대상=${firstOption}${turnOrderHolder ? ' (Turn Order 행동 선점)' : ''}`);
          return {
            ...newTurnBase,
            currentPlayer: firstOption,
            turnOrderOffer: {
              offerPlayer: firstOption,
              firstOptionPlayer: firstOption,
              declined: [],
            },
            nextFirstSeatOption: nextAlternation,
          };
        }

        return newTurnBase;
      }

      // 물품 성장 진입: Production 선택자(사람)가 먼저 주머니 큐브를 배치한다 (룰북 IX).
      // currentPlayer를 그 플레이어로 잡아야 ProductionPanel이 뜬다 — playerOrder[0]으로만 잡으면
      // 경매 1등이 아닌 사람의 생산 기회가 통째로 사라진다 (실플레이 버그: 독일 맵 생산 스킵).
      // AI 선택자는 제외 (goodsGrowth는 AI 스케줄러 대상이 아니라 사람이 주사위를 진행).
      let phaseEntryPlayer = playerOrder[0];
      if (nextPhaseName === 'goodsGrowth' && !state.phaseState.productionUsed) {
        const productionHolder = activePlayers.find(
          p => state.players[p]?.selectedAction === 'production' && !state.players[p]?.isAI
        );
        if (productionHolder) phaseEntryPlayer = productionHolder;
      }

      // 단계 전환 로깅
      return {
        currentPhase: nextPhaseName,
        currentPlayer: phaseEntryPlayer,
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: nextPhaseName,
            player: state.currentPlayer,
            action: `[시스템] 단계 전환: ${state.currentPhase} → ${nextPhaseName}`,
            timestamp: Date.now(),
          },
        ],
      };
    });

    // AI 턴 트리거 (중앙 집중식 스케줄러 사용)
    scheduleAICheck(get);
  },

  endTurn: () => {
    const state = get();

    // 빈 배열 방어 검증
    if (state.playerOrder.length === 0 || state.activePlayers.length === 0) {
      console.error('[ERROR] endTurn: playerOrder 또는 activePlayers가 비어있음');
      return;
    }

    // 모든 단계 자동 실행
    state.collectIncome();
    state.payExpenses();
    state.applyIncomeReduction();

    set((prevState) => ({
      currentTurn: prevState.currentTurn + 1,
      currentPhase: 'issueShares',
      currentPlayer: prevState.playerOrder[0] ?? prevState.activePlayers[0],
      phaseState: {
        builtTracksThisTurn: 0,
        maxTracksThisTurn: GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
        lastBuiltCoords: [],
        moveGoodsRound: 1,
        playerMoves: createPlayerMoves(prevState.activePlayers),
        engineUpgradedThisTurn: createPlayerMoves(prevState.activePlayers),
        productionUsed: false,
      urbanizationUsed: false,
        locomotiveUsed: false,
      },
      players: resetPlayerActions(prevState.players, prevState.activePlayers),
      logs: [
        ...prevState.logs,
        {
          turn: prevState.currentTurn,
          phase: prevState.currentPhase,
          player: prevState.activePlayers[0],
          action: `[시스템] 턴 ${prevState.currentTurn} 종료`,
          timestamp: Date.now(),
        },
      ],
    }));
  },

  // ============================================================
  // UI 액션 (기본 선택·건설 플로우·복합/방향전환 패널·도시화 모드·
  // 이동 목적지/큐브 애니메이션) — slices/uiSlice.ts로 분리 (스텝 3b)
  // ============================================================
  ...createUiSlice(set, get),

  undoLastAction: () => {
    const snap = undoSnapshots.pop();
    if (!snap) {
      set({ undoCount: 0 });
      return;
    }
    // 취소로 phaseState/보드가 복원되므로, 취소 전 상태 기준으로 계산된 AI 턴 캐시를 비운다
    // (같은 턴·Phase 키라 캐시가 취소를 감지하지 못함 — 다음 AI 결정 시 재계산)
    clearUrbanizationPlanCache();
    clearDesperationCache();
    const state = get();
    set({
      board: snap.board,
      players: snap.players,
      phaseState: snap.phaseState,
      newCityTiles: snap.newCityTiles,
      goodsDisplay: snap.goodsDisplay,
      undoCount: undoSnapshots.length,
      logs: [
        ...snap.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: state.currentPlayer,
          action: `↩ 취소: ${snap.label}`,
          timestamp: Date.now(),
        },
      ],
      // 진행 중이던 선택 UI도 함께 정리
      ui: {
        ...state.ui,
        buildMode: 'idle',
        sourceHex: null,
        buildableNeighbors: [],
        targetHex: null,
        entryEdge: null,
        exitDirections: [],
        previewTrack: null,
        highlightedHexes: [],
        selectedHex: null,
        complexTrackSelection: null,
        redirectTrackSelection: null,
        selectedCube: null,
        reachableDestinations: [],
      },
    });
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
    const redirectInfo = getRedirectableEdges(coord, state.board);
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

    // 트랙 업데이트
    const updatedTrack: TrackTile = {
      ...track,
      edges: newEdges,
      owner: currentPlayer, // 방향 전환하면 소유권 획득
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
          cash: player.cash - cost - redirectSpurs.length * TOWN_SPUR_COST,
        },
      },
      undoCount: undoSnapshots.length,
      phaseState: {
        ...state.phaseState,
        builtTracksThisTurn: state.phaseState.builtTracksThisTurn + 1, // 타일만 1카운트 (가닥 자동 생성 없음)
        lastBuiltCoords: [...state.phaseState.lastBuiltCoords, coord],
      },
      ui: {
        ...state.ui,
        buildMode: 'idle',
        selectedHex: null,
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

  // === 도시화 (Urbanization) — 모드/타일 선택 UI는 slices/uiSlice.ts로 분리, 배치(placeNewCity)만 잔류 ===

  placeNewCity: (townCoord) => {
    const state = get();
    logAction('trackBuilding', 'placeNewCity', { player: state.currentPlayer, town: townCoord, turn: state.currentTurn });

    if (!state.canPlaceNewCity(townCoord)) {
      return false;
    }

    const selectedTileId = state.ui.selectedNewCityTile;
    if (!selectedTileId) {
      console.error('[ERROR] placeNewCity: No new city tile selected');
      return false;
    }
    const tile = state.newCityTiles.find(t => t.id === selectedTileId);
    if (!tile) return false;
    // 이미 사용된 타일/이미 배치된 신규 도시는 거부.
    // (cities에 같은 id가 중복 추가되면 GameBoard에서 React 중복 key → 무한 리렌더 freeze)
    if (tile.used || state.board.cities.some(c => c.id === selectedTileId)) {
      console.warn(`[placeNewCity] 이미 배치된 신규 도시 타일: ${selectedTileId}`);
      return false;
    }

    const town = state.board.towns.find(t => hexCoordsEqual(t.coord, townCoord));
    if (!town) return false;

    captureUndo(state, `도시화 (${townCoord.col},${townCoord.row})`);

    // 한국 룰: 도시화 시 디스플레이의 해당 신도시 칸에서 큐브 N개(=urbanizeFromDisplayCount)를
    // 신도시 위로 옮기고, 빈 칸을 주머니에서 보충한다. 동적 색상이라 신도시 수요색이 이 큐브로 결정됨.
    const profile = getMapProfile(state.mapId);
    const urbanizeCount = profile.urbanizeFromDisplayCount;
    const newCityCubes: CubeColor[] = [];
    let updatedGoodsDisplay = state.goodsDisplay;
    if (profile.urbanizationMovesTownCubes) {
      // Southern US: 면화 마을이 도시화되면 면화(마을 위 큐브)는 신규 도시 위로 이동 (룰북)
      newCityCubes.push(...town.cubes);
    } else if (town.cubes.length > 0) {
      // Western US 룰북: 마을이 도시화되면 마을 위 물품은 주머니로 반환 (마을 큐브 없는 맵은 no-op)
      updatedGoodsDisplay = {
        ...updatedGoodsDisplay,
        bag: [...updatedGoodsDisplay.bag, ...town.cubes],
      };
    }
    if (urbanizeCount > 0) {
      const range = getDisplaySlotRange(state.mapId, selectedTileId); // AI 수요색 예측과 동일 인덱싱 (mapRegistry 공유)
      if (range) {
        const { startIndex, rowCount } = range;
        const slots = [...updatedGoodsDisplay.slots];
        const bag = [...updatedGoodsDisplay.bag];
        for (let i = 0; i < rowCount && newCityCubes.length < urbanizeCount; i++) {
          const idx = startIndex + i;
          const cube = slots[idx];
          if (cube) {
            newCityCubes.push(cube);
            slots[idx] = bag.length > 0 ? bag.pop()! : null; // 빈 칸을 주머니에서 보충
          }
        }
        updatedGoodsDisplay = { ...updatedGoodsDisplay, slots, bag };
      }
    }

    // 1. 마을을 신규 도시로 변환
    const updatedTowns = state.board.towns.map(t => {
      if (hexCoordsEqual(t.coord, townCoord)) {
        return {
          ...t,
          newCityColor: tile.color,
          cubes: [],  // 마을의 물품 비움 — Southern은 신규 도시로 이동, 그 외(Western)는 주머니로 반환됨
        };
      }
      return t;
    });

    // 2. 새 도시를 cities 배열에 추가
    // Western US 도시화 특례: Kansas City→동부, San Diego/Portland→서부 (배달/대륙횡단 판정용).
    // 단 신도시는 "시작 도시"가 아니므로 isStartingCity는 여전히 false (트랙 시작 불가).
    const newCityRegion = profile.newCityRegion(town.id);
    const newCity: City = {
      id: selectedTileId,  // 타일 ID를 도시 ID로 사용
      name: `New City ${selectedTileId}`,
      coord: townCoord,
      color: tile.color,
      cubes: newCityCubes,  // 한국: 디스플레이에서 옮긴 큐브(수요색 결정). 그 외 맵: 빈 배열
      ...(newCityRegion ? { region: newCityRegion } : {}),
    };

    // 3. 해당 헥스의 트랙 타일 제거 (룰북: 신규 도시 배치 시 기존 트랙 제거)
    const updatedTrackTiles = state.board.trackTiles.filter(
      track => !hexCoordsEqual(track.coord, townCoord)
    );
    // 도시는 모든 변이 연결되므로 마을 안 가닥은 제거
    const updatedTownSpurs = (state.board.townSpurs ?? []).filter(
      sp => !hexCoordsEqual(sp.townCoord, townCoord)
    );

    // 4. 신규 도시 타일 사용 표시
    const updatedNewCityTiles = state.newCityTiles.map(t => {
      if (t.id === selectedTileId) {
        return { ...t, used: true };
      }
      return t;
    });

    set({
      phaseState: {
        ...state.phaseState,
        urbanizationUsed: true,
      },
      board: {
        ...state.board,
        towns: updatedTowns,
        cities: [...state.board.cities, newCity],
        trackTiles: updatedTrackTiles,
        townSpurs: updatedTownSpurs,
      },
      newCityTiles: updatedNewCityTiles,
      goodsDisplay: updatedGoodsDisplay, // 한국: 디스플레이 보충 / Western: 마을 큐브 주머니 반환 (그 외 맵 무변경)
      undoCount: undoSnapshots.length,
      ui: {
        ...state.ui,
        urbanizationMode: false,
        selectedNewCityTile: null,
      },
      logs: [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: state.currentPlayer,
          action: `도시화: ${town.id || '마을'}에 ${tile.color} 신규 도시 (${selectedTileId}) 배치`,
          timestamp: Date.now(),
        },
      ],
    });

    // [PLAY] 사람 플레이 분석용 — 도시화 위치/색
    console.log(`[PLAY] T${state.currentTurn} ${state.currentPlayer} 도시화 ${tile.color} 도시(${selectedTileId}) @${town.id}(${townCoord.col},${townCoord.row})`);
    // Western US: 도시화로 마지막 칸이 이어져 서부↔동부가 연결될 수 있음
    get().applyTranscontinental();
    return true;
  },

  // === Production (생산) ===
  getEmptySlots: () => {
    const state = get();
    const emptySlots: number[] = [];
    state.goodsDisplay.slots.forEach((slot, index) => {
      if (slot === null) {
        emptySlots.push(index);
      }
    });
    return emptySlots;
  },

  startProduction: () => {
    const state = get();
    const currentPlayer = state.currentPlayer;
    const player = state.players[currentPlayer];

    // Production 행동을 선택한 플레이어만 가능
    if (player.selectedAction !== 'production') {
      return;
    }

    // 이미 Production 사용됨
    if (state.phaseState.productionUsed) {
      return;
    }

    // 주머니에서 큐브 뽑기 (미리보기)
    const bag = [...state.goodsDisplay.bag];
    const cubes: CubeColor[] = [];

    for (let i = 0; i < GAME_CONSTANTS.PRODUCTION_CUBE_COUNT && bag.length > 0; i++) {
      const cube = bag.pop();
      if (cube) cubes.push(cube);
    }

    if (cubes.length === 0) {
      return;
    }

    set({
      ui: {
        ...state.ui,
        productionMode: true,
        productionCubes: cubes,
        selectedProductionSlots: [],
      },
    });
  },

  selectProductionSlot: (slotIndex) => {
    const state = get();

    if (!state.ui.productionMode) return;

    // 해당 슬롯이 비어있는지 확인
    if (state.goodsDisplay.slots[slotIndex] !== null) return;

    const currentSlots = [...state.ui.selectedProductionSlots];
    const maxSlots = state.ui.productionCubes.length;

    // 이미 선택된 슬롯이면 선택 해제
    const existingIndex = currentSlots.indexOf(slotIndex);
    if (existingIndex >= 0) {
      currentSlots.splice(existingIndex, 1);
    } else {
      // 최대 선택 수 체크
      if (currentSlots.length >= maxSlots) {
        // 가장 먼저 선택한 것 제거하고 새로 추가
        currentSlots.shift();
      }
      currentSlots.push(slotIndex);
    }

    set({
      ui: {
        ...state.ui,
        selectedProductionSlots: currentSlots,
      },
    });
  },

  confirmProduction: () => {
    const state = get();

    if (!state.ui.productionMode) return false;

    const selectedSlots = state.ui.selectedProductionSlots;
    const cubes = state.ui.productionCubes;

    // 선택된 슬롯 수가 큐브 수와 같아야 함
    if (selectedSlots.length !== cubes.length) return false;

    // 새 슬롯 배열 생성
    const newSlots = [...state.goodsDisplay.slots];
    const newBag = [...state.goodsDisplay.bag];

    // 선택된 슬롯에 큐브 배치
    selectedSlots.forEach((slotIndex, i) => {
      newSlots[slotIndex] = cubes[i];
      // 주머니에서 실제로 제거 (이미 startProduction에서 뽑았지만, 확인차 다시 처리)
      const bagIndex = newBag.indexOf(cubes[i]);
      if (bagIndex >= 0) {
        newBag.splice(bagIndex, 1);
      }
    });

    // 주머니에서 사용된 큐브 제거 (실제로 제거)
    const finalBag = [...state.goodsDisplay.bag];
    for (let i = 0; i < cubes.length; i++) {
      finalBag.pop();
    }

    set({
      goodsDisplay: {
        slots: newSlots,
        bag: finalBag,
      },
      phaseState: {
        ...state.phaseState,
        productionUsed: true,
      },
      ui: {
        ...state.ui,
        productionMode: false,
        productionCubes: [],
        selectedProductionSlots: [],
      },
      logs: [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: state.currentPlayer,
          action: `Production: 물품 ${cubes.length}개 디스플레이에 배치`,
          timestamp: Date.now(),
        },
      ],
    });

    return true;
  },

  cancelProduction: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        productionMode: false,
        productionCubes: [],
        selectedProductionSlots: [],
      },
    }));
  },

  // === 물품 이동 — 목적지 선택/큐브 애니메이션 UI는 slices/uiSlice.ts로 분리, 정산(completeCubeMove)만 잔류 ===

  completeCubeMove: () => {
    const state = get();
    if (!state.ui.movingCube) return;
    logAction('goodsMovement', 'completeCubeMove', { player: state.currentPlayer, turn: state.currentTurn });

    const { path, color, context } = state.ui.movingCube;

    // 캡처된 컨텍스트에서 플레이어 ID 사용 (레이스 컨디션 방지)
    const movingPlayerId = context.playerId;

    // 경로의 트랙 소유자에게 수입 추가 (동적 플레이어 지원)
    const incomeChanges: Partial<Record<PlayerId, number>> = {};
    state.activePlayers.forEach(p => { incomeChanges[p] = 0; });

    const { cities, towns, trackTiles } = state.board;
    const isStopAt = (coord: HexCoord) =>
      cities.some(c => hexCoordsEqual(c.coord, coord)) ||
      towns.some(t => hexCoordsEqual(t.coord, coord));

    // 링크 계산 시작점: 일반 큐브는 출발 도시(path[0]),
    // 트랙 큐브(St. Lucia)는 첫 도착 정거장 — 시작 구간은 아래에서 별도 +1
    let linkStartIndex = 0;

    if (context.trackCubeSectionOwner !== undefined) {
      // 룰북(St. Lucia): 큐브가 놓인 시작 구간은 미완성 링크여도 소유자에게 수입 1 제공
      // (이후 지나가는 완성 링크들은 일반 규칙대로 각각 +1)
      const owner = context.trackCubeSectionOwner;
      if (owner && state.activePlayers.includes(owner)) {
        incomeChanges[owner] = (incomeChanges[owner] || 0) + 1;
      }
      const firstStop = path.findIndex((coord, idx) => idx > 0 && isStopAt(coord));
      linkStartIndex = firstStop === -1 ? path.length : firstStop;
    }

    // 링크별로 수입 계산 (도시/마을 → 다음 도시/마을 = 1 링크)
    // 룰북: "물품이 지나가는 각 완성된 철도 링크마다 해당 링크 소유자의 수입이 1 증가"
    for (let i = linkStartIndex + 1; i < path.length; i++) {
      if (isStopAt(path[i])) {
        // 이 링크(linkStartIndex → i) 구간의 트랙 소유자 찾기
        let credited = false;
        for (let j = linkStartIndex + 1; j < i; j++) {
          const track = trackTiles.find(t => hexCoordsEqual(t.coord, path[j]));
          if (track?.owner) {
            incomeChanges[track.owner] = (incomeChanges[track.owner] || 0) + 1;
            credited = true;
            break; // 링크당 한 번만 계산 (같은 링크 내 트랙은 같은 소유자)
          }
        }
        // Germany 직결 링크: 사이 트랙 없이 두 도시가 바로 이어진 구간 → 직결 owner에게 수입 +1
        if (!credited) {
          const a = cities.find(c => hexCoordsEqual(c.coord, path[linkStartIndex]));
          const b = cities.find(c => hexCoordsEqual(c.coord, path[i]));
          if (a && b) {
            const dl = (state.board.directLinks ?? []).find(d => d.owner &&
              ((d.cityA === a.id && d.cityB === b.id) || (d.cityA === b.id && d.cityB === a.id)));
            if (dl?.owner && state.activePlayers.includes(dl.owner)) {
              incomeChanges[dl.owner] = (incomeChanges[dl.owner] || 0) + 1;
            }
          }
        }
        linkStartIndex = i; // 다음 링크 시작점 업데이트
      }
    }

    // Western US: 동(east)↔서(west) 배달 +$1 income 보너스 (배달한 플레이어에게).
    // 출발/도착이 모두 east/west 도시여야 함 — 중앙 도시(Denver/SLC)·마을·트랙 출발은 보너스 없음.
    // Southern US: 면화(흰 큐브) 배달 +$1 보너스 (cubeDeliveryBonus).
    const profile = getMapProfile(state.mapId);
    {
      const fromCity = cities.find(c => hexCoordsEqual(c.coord, path[0]));
      const toCity = cities.find(c => hexCoordsEqual(c.coord, path[path.length - 1]));
      const regionBonus = profile.regionDeliveryBonus(fromCity?.region, toCity?.region)
        + profile.cubeDeliveryBonus(color);
      if (regionBonus > 0 && state.activePlayers.includes(movingPlayerId)) {
        incomeChanges[movingPlayerId] = (incomeChanges[movingPlayerId] || 0) + regionBonus;
      }
    }

    const newPlayers = { ...state.players };
    for (const playerId of state.activePlayers) {
      const incomeGain = incomeChanges[playerId] ?? 0;
      if (incomeGain > 0) {
        newPlayers[playerId] = {
          ...newPlayers[playerId],
          income: Math.min(
            newPlayers[playerId].income + incomeGain,
            GAME_CONSTANTS.MAX_INCOME
          ),
        };
      }
    }

    // 총 링크 수 계산 (로그용)
    const totalLinks = Object.values(incomeChanges).reduce((a, b) => a + b, 0);

    // 캡처된 플레이어 ID 사용 (state.currentPlayer 대신)
    set({
      players: newPlayers,
      // 룰북 V: "이동 완료 후 큐브는 미사용 물품 주머니로 반환" — 반환하지 않으면 주머니가
      // 게임 진행에 따라 고갈돼 생산(Production)·물품 성장 보충·Berlin 보너스가 어긋난다.
      // 단 Southern US 면화(흰 큐브)는 배달 후 게임에서 제거 (룰북: removed from the game).
      goodsDisplay: {
        ...state.goodsDisplay,
        bag: profile.deliveredCubeLeavesGame(color)
          ? [...state.goodsDisplay.bag]
          : [...state.goodsDisplay.bag, color],
      },
      phaseState: {
        ...state.phaseState,
        playerMoves: {
          ...state.phaseState.playerMoves,
          [movingPlayerId]: true,  // 캡처된 플레이어 ID 사용
        },
      },
      ui: {
        ...state.ui,
        movingCube: null,
        movePath: [],
        selectedCube: null,
        reachableDestinations: [],
      },
      logs: [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: context.phase,  // 캡처된 phase 사용
          player: movingPlayerId,  // 캡처된 플레이어 ID 사용
          action: context.trackCubeSectionOwner !== undefined
            ? `${color} 트랙 큐브 배달 (${totalLinks} 링크 수입, 시작 구간 소유 ${context.trackCubeSectionOwner ?? '없음'})`
            : `${color} 물품 배달 (${totalLinks} 링크, +${incomeChanges[movingPlayerId] ?? 0} 수입)`,
          timestamp: Date.now(),
        },
      ],
    });

    // 물품 이동 완료 후 AI 락 해제 및 다음 단계로 진행
    // AI의 'move' 액션에서 락을 유지했으므로 여기서 해제
    const currentExecId = state.aiExecution.executionId;
    if (state.aiExecution.pending && currentExecId > 0) {
      releaseAILock(currentExecId, get, set);
    }

    get().nextPhase();
  },

  // === 로그 ===
  addLog: (action) => {
    set((state) => ({
      logs: [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: state.currentPlayer,
          action,
          timestamp: Date.now(),
        },
      ],
    }));
  },
    }),
    {
      name: 'age-of-steam-game',
      // 보드 구조가 바뀌면 버전을 올려 이전 저장 상태를 폐기
      // (v2: St. Lucia 공식 맵 재구성 — 옛 보드가 복원되어 화면이 깨지는 문제 방지)
      // (v3: 마을 허브 재설계 — 마을 헥스 안에 타일이 깔린 옛 보드 폐기)
      version: 3,
      migrate: () => ({}) as never,
      // rehydrate(새로고침) 후 1회성/실행 상태는 항상 초기화한다.
      // (저장본을 복원하면 닫지 않은 대륙횡단 모달·수입감소 배지가 다시 뜨거나,
      //  AI 실행 플래그가 pending:true로 박제되는 문제를 방지)
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<GameStore>),
        transcontinentalEvent: null,
        incomeReductions: null,
        aiExecution: { pending: false, executionId: 0 },
      }),
    }
  )
);

// 디버깅용: 전역에 스토어 노출
if (typeof window !== 'undefined') {
  (window as unknown as { __GAME_STORE__: typeof useGameStore }).__GAME_STORE__ = useGameStore;
}
