// Zustand 게임 상태 관리

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  GameState,
  PlayerId,
  GamePhase,
  SpecialAction,
  HexCoord,
  CubeColor,
  GAME_CONSTANTS,
  NewCityTileId,
  City,
  PLAYER_ID_ORDER,
  AIExecutionQueue,
  CapturedAIContext,
  ACTION_INFO,
} from '@/types/game';
import { getAIDecision, AI_TURN_DELAY, aiPlayerManager } from '@/ai';
import { clearUrbanizationPlanCache } from '@/ai/strategies/urbanization';
import { clearDesperationCache } from '@/ai/strategies/auction';
import { addFailedBuildCoord, hasPendingFreeSpur } from '@/ai/strategies/buildTrack';
import { getDisplaySlotRange } from '@/utils/mapRegistry';
import { getMapProfile } from '@/maps/getMapProfile';
import { hexCoordsEqual } from '@/utils/hexGrid';
import {
  getNextPlayerId,
  createPlayerMoves,
  allPlayersMoved,
  allPlayersSelectedAction,
  resetPlayerActions,
  findFirstBuildPlayer,
  findFirstMovePlayer,
  isLastPlayer,
  calculateVictoryPoints,
} from '@/utils/gameLogic';
import { calculateTrackScore } from '@/utils/trackValidation';
import { logAction, newLogSession } from '@/utils/debugConfig';
import { turboDelay, resetTurboFlag } from '@/utils/turboMode';
// 모듈 헬퍼 (2026-07-03 스텝 3a 분리 — 로직 무변경, 파일만 이동)
import { undoSnapshots, captureUndo, clearUndo } from './helpers/undo';
import {
  releaseUnextendedTrack,
  removeIncompleteNewTracks,
  removeIncompleteGovernmentTracks,
  maxTracksForBuilder,
} from './helpers/boardRules';
import { AIPlayerConfig, TUTORIAL_GAME_CONFIG, createInitialGameState } from './helpers/setup';
import { runGovernmentBuildAI, pickRepopulationPlacement } from './helpers/governmentBuildAI';
import {
  tryAcquireAILock,
  releaseAILock,
  validateExecutionContext,
  scheduleAICheck,
} from './helpers/aiScheduler';
import { safeTimeout } from '@/utils/safeTimers';
// slice 합성 (2026-07-03 스텝 3b~3d 분리 — 로직 무변경, 파일만 이동)
import { createUiSlice } from './slices/uiSlice';
import { createAuctionSlice } from './slices/auctionSlice';
import { createGoodsGrowthSlice } from './slices/goodsGrowthSlice';
import { createBuildSlice } from './slices/buildSlice';
import { createMoveSlice } from './slices/moveSlice';
import { createSettlementSlice } from './slices/settlementSlice';

// 기존 import 경로 호환 재export (PhasePanel·테스트가 gameStore에서 가져다 씀)
export { getUndoLabel } from './helpers/undo';
export { createInitialGameState, TUTORIAL_GAME_CONFIG } from './helpers/setup';
export type { AIPlayerConfig } from './helpers/setup';

/**
 * AI 행동 결과 확인 딜레이 (ms) — 봇이 행동한 뒤 바로 다음 플레이어/단계로 넘어가면
 * "마지막 플레이어가 뭘 했는지" 볼 수 없다는 피드백(2026-07-04)으로, 행동이 화면에 머문 뒤
 * 진행한다. 시뮬/테스트(VITEST)에선 0 — 게임 로직·베이스라인에 영향 없음.
 */
const AI_ACTION_VIEW_DELAY =
  typeof process !== 'undefined' && process.env?.VITEST ? 0 : 1200;


// ============================================================
// 스토어 인터페이스
// ============================================================
export interface GameStore extends GameState {
  // --- 게임 라이프사이클 ---
  /** 게임 초기화 */
  initGame: (mapId: string, playerNames: string[], aiPlayers?: AIPlayerConfig[], options?: { randomizeStartOrder?: boolean }) => void;
  /** 게임 리셋 (플레이어 이름 유지) */
  resetGame: () => void;

  // --- AI 관련 ---
  /** AI 턴 실행 */
  executeAITurn: () => void;
  /**
   * 봇이 currentPlayer인 "자동 단계"를 대신 진행 (정산 collectIncome·payExpenses·
   * incomeReduction·advanceTurn = 자동 nextPhase / goodsGrowth = 봇 주사위 자동 굴림 후 진행).
   * 이 단계들은 봇의 결정이 필요 없어 AI 스케줄러(PLAYER_ACTION_PHASES) 대상이 아니고
   * 원래 사람이 '진행'/'주사위' 버튼으로 넘겼다 — 온라인에서 그 사람(게스트)이 끊겨 봇 전환되면
   * 진행 주체가 사라져 교착되던 것을 여기서 자동화한다. scheduleAICheck에서만 호출.
   */
  runAIAutoPhase: () => void;
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
  /** Montréal Repopulation: 뽑아 둔 3개 중 1개를 지정 도시에 배치 (나머지는 주머니로 반환) */
  placeRepopulationCube: (cubeColor: CubeColor, cityId: string) => boolean;
  /** Montréal Repopulation: 배치할 큐브 선택 (보드 도시 클릭으로 배치 — 로컬 UI) */
  selectRepopulationCube: (cubeColor: CubeColor | null) => void;

  // --- UI: 물품 이동 애니메이션 ---
  /** 목적지 도시 선택 */
  selectDestinationCity: (coord: HexCoord) => void;
  /** 타인 철도 경로 선택 모드에서 후보 경로 선택 (routeChoice.options 인덱스) */
  selectRouteOption: (index: number) => void;
  /** 경로 선택 모드에서 현재 선택 경로로 수송 확정 */
  confirmRouteChoice: () => void;
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
  initGame: (mapId, playerNames, aiPlayers = [], options = {}) => {
    // 기존 AI 인스턴스 정리
    aiPlayerManager.clear();
    clearUndo();
    resetTurboFlag(); // 새 게임은 터보 디폴트 OFF (사용자 요청 2026-07-24)

    // 새 게임 세션ID 부여 (이후 모든 액션 로그가 이 세션으로 묶임)
    const sessionId = newLogSession();
    logAction('preparation', 'initGame', {
      session: sessionId, mapId, players: playerNames,
      ai: aiPlayers.map(a => a.playerIndex),
    });

    // 새 게임 상태 설정
    set({
      ...createInitialGameState(mapId, playerNames, aiPlayers, options),
      gameStarted: true, // F5 복원 판단용 — 셋업 화면을 건너뛰고 게임 화면 복원
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
    resetTurboFlag(); // 새 게임은 터보 디폴트 OFF
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
      ...createInitialGameState(state.mapId, playerNames, aiPlayers, { randomizeStartOrder: true }),
      aiExecution: { pending: false, executionId: 0 },
    });

    console.log(`[resetGame] AI 플레이어 ${aiPlayerManager.count}명 리셋됨`);

    // ⚠️ 여기서 scheduleAICheck를 호출하지 않는다 — resetGame의 두 호출처(게임 리셋 버튼·
    // 이어하기 배너 X)는 모두 셋업 화면으로 돌아가는 경로다. 봇을 시동하면 사용자가 셋업을
    // 보는 동안 뒤에서 유령 게임이 진행돼 진행 흔적(주식/트랙)이 쌓이고, 재입장 시
    // "진행 중인 게임" 배너가 되살아났다 (2026-07-24 사용자 보고 — X 눌러도 배너 재발).
    // 실제 게임 시작은 initGame(게임 시작 버튼)이 하며 거기서 봇이 시동된다.
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

    // 결정 실행 (약간의 딜레이 후) — safeTimeout: 창이 백그라운드여도 스로틀 없이 진행
    safeTimeout(() => {
      // 컨텍스트 유효성 검증
      if (!validateExecutionContext(capturedContext, get)) {
        console.warn('[AI] 컨텍스트 불일치 - 실행 취소');
        releaseAILock(executionId, get, set);
        return;
      }

      const store = get();

      // 이 진행(nextPhase)으로 "단계가 끝나는지" 판정 — 마지막 플레이어일 때만 확인 딜레이.
      // 그 외(단계 내 다음 플레이어로 넘어가는 경우)는 봇 속도 기존 그대로 즉시 진행.
      const endsPhaseNow = (): boolean => {
        const s = get();
        const alive = s.playerOrder.filter((p) => !s.players[p]?.eliminated);
        const withPriority = (priority: PlayerId | undefined) =>
          priority && alive.includes(priority)
            ? [priority, ...alive.filter((p) => p !== priority)]
            : alive;
        switch (s.currentPhase) {
          case 'issueShares':
            return isLastPlayer(s.currentPlayer, alive);
          case 'determinePlayerOrder':
            return true; // 경매 완료 처리 = 항상 단계 종료
          case 'selectActions':
            return allPlayersSelectedAction(s.players, s.activePlayers.filter((p) => !s.players[p]?.eliminated));
          case 'buildTrack':
            return isLastPlayer(s.currentPlayer, withPriority(findFirstBuildPlayer(s.players, s.activePlayers)));
          case 'moveGoods':
            return (
              s.phaseState.moveGoodsRound >= 2 &&
              isLastPlayer(s.currentPlayer, withPriority(findFirstMovePlayer(s.players, s.activePlayers)))
            );
          default:
            return false;
        }
      };

      // 행동 결과를 화면에 잠시 보여준 뒤 진행 — 락은 유지한 채 대기해 중복 실행 방지.
      // 딜레이는 "보여줄 행동이 있고(view) + 이 진행으로 단계가 끝날 때"만 (마지막 플레이어 전용)
      const proceedAfterView = (view: boolean) => {
        const delay = view && endsPhaseNow() ? turboDelay(AI_ACTION_VIEW_DELAY) : 0;
        safeTimeout(() => {
          get().nextPhase();
          releaseAILock(executionId, get, set);
          scheduleAICheck(get);
        }, delay);
      };

      switch (decision.type) {
        case 'issueShares': {
          const beforeCash = store.players[capturedContext.currentPlayer]?.cash;
          if (decision.amount > 0) {
            store.issueShare(capturedContext.currentPlayer, decision.amount);
          }
          const afterCash = get().players[capturedContext.currentPlayer]?.cash;
          console.log(`[AI 주식발행] ${player.name}: ${decision.amount}주 발행, 현금 $${beforeCash} → $${afterCash}, shares=${get().players[capturedContext.currentPlayer]?.issuedShares}`);
          proceedAfterView(decision.amount > 0);
          return;
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
            // 경매 완료 - 혼자 남았을 때 (결과 도장을 잠시 보여준 뒤 진행)
            console.log('[AI 경매] 경매 완료 처리');
            store.resolveAuction();
            proceedAfterView(true);
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

          // Montréal Repopulation: production 선택 즉시 봇이 큐브 1개를 도시에 배치
          // (배치 전엔 nextPhase가 진행을 막으므로 여기서 바로 처리)
          {
            const s = get();
            const drawn = s.phaseState.repopulationCubes ?? [];
            if (drawn.length > 0 && s.phaseState.repopulationPlayer === capturedContext.currentPlayer) {
              const pick = pickRepopulationPlacement(s, drawn);
              if (pick) {
                console.log(`[AI Repopulation] ${player.name}: ${pick.cube} → ${pick.cityId}`);
                get().placeRepopulationCube(pick.cube, pick.cityId);
              } else {
                // 배치할 곳이 없으면 첫 큐브를 첫 도시에 (교착 방지)
                const anyCity = s.board.cities[0];
                if (anyCity) get().placeRepopulationCube(drawn[0], anyCity.id);
              }
            }
          }
          proceedAfterView(true);
          return;
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
          // (마지막 건설 타일을 잠시 보여준 뒤 — skip이면 보여줄 게 없어 즉시)
          proceedAfterView(buildDecision.action !== 'skip');
          return;
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
            proceedAfterView(true);
          } else {
            // skip — 보여줄 행동 없음, 즉시 진행
            proceedAfterView(false);
          }
          return;
        }

        case 'skip':
        default:
          proceedAfterView(false);
          return;
      }
    }, turboDelay(AI_TURN_DELAY));
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

  // === St. Lucia 트랙 위 큐브 배달(moveTrackCube)은 slices/moveSlice.ts로 분리 (스텝 3f) ===

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

      // 맵 전용 추가 행동(lowGravitation 등)은 그 맵(extraActions)에서만 선택 가능
      if (action === 'lowGravitation' && !getMapProfile(state.mapId).extraActions.includes(action)) {
        console.warn(`[WARN] selectAction: 이 맵에 없는 추가 행동 - playerId: ${playerId}, action: ${action}`);
        return state;
      }

      // Montréal 경매 트윅: 무입찰 패스 페널티 — 이번 턴 행동 선택 불가
      if (player.actionBanned) {
        console.warn(`[WARN] selectAction: 무입찰 패스 페널티로 선택 불가 - playerId: ${playerId}`);
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
      // Montréal(dedicatedGovEngine): 일반 엔진 대신 정부 전용 엔진(DGEL) +1 —
      // 정부 링크 위 추가 이동 전용, 비용 지불에 합산. DGEL을 올리는 유일한 방법.
      if (action === 'locomotive' && getMapProfile(state.mapId).dedicatedGovEngine) {
        const currentPlayers = newState.players ?? state.players;
        const oldDgel = player.dgel ?? 0;
        if (oldDgel < GAME_CONSTANTS.MAX_DGEL) {
          console.log(`[Locomotive→DGEL] ${player.name}: 정부 엔진 ${oldDgel} → ${oldDgel + 1}`);
          newState.players = {
            ...currentPlayers,
            [playerId]: { ...currentPlayers[playerId], dgel: oldDgel + 1 },
          };
          newState.phaseState = { ...state.phaseState, locomotiveUsed: true };
        }
      } else if (action === 'locomotive') {
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

      // Montréal Repopulation: production 선택 즉시 주머니에서 3개 뽑아 배치 대기 상태로
      // (사람: RepopulationPanel에서 1개 배치, AI: executeAITurn이 곧바로 placeRepopulationCube)
      if (action === 'production' && getMapProfile(state.mapId).productionAsRepopulation) {
        const bag = [...state.goodsDisplay.bag];
        const drawn: CubeColor[] = [];
        for (let i = 0; i < 3 && bag.length > 0; i++) {
          drawn.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
        }
        newState.goodsDisplay = { ...state.goodsDisplay, bag };
        newState.phaseState = {
          ...(newState.phaseState ?? state.phaseState),
          repopulationCubes: drawn,
          repopulationPlayer: playerId,
        };
        console.log(`[Repopulation] ${player.name}: 주머니에서 [${drawn.join(', ')}] 뽑음 — 1개 배치 대기`);
      }

      // Engineer 효과 (맵 buildsPerTurn 기반 — Germany는 절반 할인만, 달은 2→3)
      if (action === 'engineer') {
        newState.phaseState = {
          ...state.phaseState,
          maxTracksThisTurn: maxTracksForBuilder({ ...state, players: newState.players ?? state.players }, playerId),
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
  // Phase IV: 트랙 건설 (+방향 전환) — slices/buildSlice.ts로 분리 (스텝 3e)
  // ============================================================
  ...createBuildSlice(set, get),

  // ============================================================
  // Phase V: 물품 이동 (moveGoods·upgradeEngine·moveTrackCube·completeCubeMove)
  // — slices/moveSlice.ts로 분리 (스텝 3f)
  // ============================================================
  ...createMoveSlice(set, get),

  // ============================================================
  // Phase VI-VIII: 수입/비용 정산 — slices/settlementSlice.ts로 분리 (스텝 3g)
  // ============================================================
  ...createSettlementSlice(set, get),

  // ============================================================
  // Phase IX: 물품 성장 + Production (생산)
  // — slices/goodsGrowthSlice.ts로 분리 (스텝 3d)
  // ============================================================
  ...createGoodsGrowthSlice(set, get),

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
      // Montréal: 매 라운드 주식 발행 전 정부 링크 건설 (governmentLink가 첫 단계)
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
          ...(mapRules.governmentLinks ? (['governmentLink'] as GamePhase[]) : []),
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
      // ⚠️ 파산자(eliminated) 제외 — state.activePlayers는 좌석 전체라, 그대로 완료 판정
      // (allPlayersSelectedAction/allPlayersMoved)에 쓰면 playerOrder에서 빠진 파산자가
      // 영원히 "미완료"로 남아 단계가 진행되지 않는 교착이 된다 (2026-07-24).
      // 좌석 자체(state.activePlayers)는 불변 — 여기 지역 변수만 생존자로 좁힌다.
      const activePlayers = state.activePlayers.filter(
        (p) => !state.players[p]?.eliminated
      );

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

      // === 0. 정부 링크 건설 (Montréal) ===
      if (state.currentPhase === 'governmentLink') {
        // 미완성 정부 트랙 제거 (원본 룰: 정부 링크에 미완성 구간 금지 — 무료라 환불 없음)
        const cleaned = removeIncompleteGovernmentTracks(state.board, state.currentTurn);
        if (cleaned.removed > 0) {
          console.log(`[정부 링크] 미완성 정부 트랙 ${cleaned.removed}개 제거`);
        }
        return {
          currentPhase: 'issueShares' as GamePhase,
          currentPlayer: playerOrder[0],
          board: cleaned.board,
          // 정부 건설 카운트를 비워 플레이어 건설 단계와 섞이지 않게 한다
          phaseState: {
            ...state.phaseState,
            builtTracksThisTurn: 0,
            lastBuiltCoords: [],
          },
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
        // Montréal 경매 트윅: 행동 선택 불가(actionBanned) 플레이어는 건너뛰고 첫 선택자를 잡는다
        const entryPlayer = nextAfterOrder === 'selectActions'
          ? (playerOrder.find(p => !state.players[p]?.actionBanned) ?? playerOrder[0])
          : playerOrder[0];
        console.log(`[nextPhase] determinePlayerOrder → ${nextAfterOrder}: playerOrder=[${playerOrder.join(', ')}], 새 currentPlayer=${entryPlayer} (isAI: ${state.players[entryPlayer]?.isAI})`);
        return {
          currentPhase: nextAfterOrder,
          currentPlayer: entryPlayer,
          turnOrderOffer: null, // 미해결 선공권 제안 정리 (안전장치)
        };
      }

      // === III. 행동 선택 단계 ===
      if (state.currentPhase === 'selectActions') {
        // Montréal Repopulation: 선택자가 큐브 배치를 마칠 때까지 단계를 진행하지 않는다
        // (원본 룰: 선택 즉시(IMMEDIATELY) 배치 — 온라인 차례 검증도 배치자에 고정되어야 함)
        if ((state.phaseState.repopulationCubes?.length ?? 0) > 0) {
          console.log('[nextPhase] Repopulation 배치 대기 중 — 단계 유지');
          return state;
        }

        // 모든 플레이어가 행동을 선택했는지 확인 (actionBanned는 선택 완료로 간주)
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
              engineerMaxTileCost: 0, // Germany: 빌더마다 Engineer 절반 할인 재설정
              engineerDiscountGiven: 0,
              // 첫 번째로 건설할 플레이어의 트랙 상한 (맵 buildsPerTurn + Engineer 보정)
              maxTracksThisTurn: maxTracksForBuilder(state, firstBuilder),
              // 모든 플레이어의 건설 완료 상태 초기화
              playerMoves: initialPlayerMoves,
            },
          };
        }

        // 현재 플레이어가 선택했으면(또는 선택 불가면) 다음 미선택·미차단 플레이어로 전환
        if (
          state.players[state.currentPlayer].selectedAction !== null ||
          state.players[state.currentPlayer].actionBanned
        ) {
          const nextSelector = playerOrder.find(
            p => state.players[p]?.selectedAction === null && !state.players[p]?.actionBanned
          ) ?? nextPlayer;
          console.log(`[nextPhase] selectActions 내 플레이어 전환: ${state.currentPlayer} → ${nextSelector} (isAI: ${state.players[nextSelector]?.isAI})`);
          return {
            currentPlayer: nextSelector,
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
          const r = removeIncompleteNewTracks(state.board, state.currentTurn, state.currentPlayer, getMapProfile(state.mapId).townSpurCost);
          if (r.board !== state.board) {
            bwBoard = r.board;
            const p = state.players[state.currentPlayer];
            bwPlayers = { ...state.players, [state.currentPlayer]: { ...p, cash: p.cash + r.refund } };
            console.log(`[미완성 제거] ${state.currentPlayer}: 미완성 신설 트랙 제거, $${r.refund} 환불 (Germany 미완성 링크 금지)`);
            // 분석용: 제거 내역(타일/교차/가닥)을 :3999 미러에 기록 — 교차·가닥 제거 실증용
            logAction('trackBuilding', 'incompleteRemoved', {
              player: state.currentPlayer, turn: state.currentTurn,
              refund: r.refund, ...r.removed,
            });
          }
        }

        // 룰 IV: 방금 건설을 마친 플레이어의 "이번 턴 미연장" 미완성 구간 소유권 해제(공용화).
        // 룰북 타이밍은 "자신의 건설 턴에 연장 안 하면 제거" — 턴 종료가 아니라 여기서.
        // (턴 종료의 전체 대상 해제는 안전망으로 유지. 사용자 버그 리포트 2026-07-04)
        // ⚠️ trackCubes 맵(St.Lucia)은 제외 — 미완성 구간 소유가 수입원(트랙 큐브 보너스)인데
        //    AI가 이 타이밍에 적응돼 있지 않아 즉시 해제 시 VP +3.8→−21·파산 15/20으로 붕괴
        //    (20시드 실측). 기존 턴말 해제를 유지하고, AI 연장 전략 적응은 별도 과제.
        if (!getMapProfile(state.mapId).incomeSources.includes('trackCubes')) {
          const rel = releaseUnextendedTrack(bwBoard, state.currentTurn, state.currentPlayer);
          if (rel.released > 0) {
            bwBoard = rel.board;
            console.log(`[소유권 해제] ${state.currentPlayer}: 미연장 미완성 트랙 ${rel.released}개 공용화 (룰 IV)`);
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
            engineerMaxTileCost: 0, // Germany: 빌더마다 Engineer 절반 할인 재설정
            engineerDiscountGiven: 0,
            maxTracksThisTurn: maxTracksForBuilder(state, nextBuilder),
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
          // 분석용 최종 점수 로그 (전 맵 공통 — :3999에서 봇 게임 결과를 바로 판독)
          logAction('turnEnd', 'finalScores', {
            turn: state.currentTurn,
            players: state.activePlayers.map((pid) => {
              const pl = state.players[pid];
              const trackScore = calculateTrackScore(cleanedBoard, pid);
              return {
                id: pid, name: pl?.name, eliminated: pl?.eliminated ?? false,
                income: pl?.income ?? 0, shares: pl?.issuedShares ?? 0,
                engine: pl?.engineLevel ?? 0, cash: pl?.cash ?? 0, trackScore,
                vp: pl ? calculateVictoryPoints(pl.income, trackScore, pl.issuedShares) : 0,
              };
            }),
          });
          return {
            board: cleanedBoard,
            currentPhase: 'gameOver' as GamePhase,
          };
        }

        // 분석용 턴 스탯 로그 (전 맵 공통 — 턴별 재무 추적)
        logAction('turnEnd', 'turnStats', {
          turn: state.currentTurn,
          players: state.activePlayers.map((pid) => {
            const pl = state.players[pid];
            return { id: pid, cash: pl?.cash ?? 0, income: pl?.income ?? 0,
              shares: pl?.issuedShares ?? 0, engine: pl?.engineLevel ?? 0,
              eliminated: pl?.eliminated ?? false };
          }),
        });

        // Montréal: 새 턴 첫 단계(governmentLink)의 차례는 정부 관리 순번 로테이션
        // (셋업 스냅샷 governmentControllers 기준, 탈락자는 건너뜀)
        let newTurnFirstPlayer = playerOrder[0];
        if (mapRules.governmentLinks && state.governmentControllers?.length) {
          const gcs = state.governmentControllers;
          const newTurn = state.currentTurn + 1;
          for (let k = 0; k < gcs.length; k++) {
            const cand = gcs[(newTurn - 1 + k) % gcs.length];
            if (!state.players[cand]?.eliminated) { newTurnFirstPlayer = cand; break; }
          }
        }

        // 달(Moon): 물품 성장이 끝나면(=턴 롤오버) 밤/낮 반쪽을 교대한다
        const rolledBoard = cleanedBoard.nightSide
          ? { ...cleanedBoard, nightSide: (cleanedBoard.nightSide === 'west' ? 'east' : 'west') as 'west' | 'east' }
          : cleanedBoard;
        if (cleanedBoard.nightSide) {
          // 분석용: 교대 결과를 :3999에 기록 (새 턴 기준 밤쪽)
          logAction('turnEnd', 'nightSideSwap', {
            turn: state.currentTurn + 1,
            nightSide: rolledBoard.nightSide,
          });
        }

        const newTurnBase = {
          currentPhase: nextPhaseName,
          currentTurn: state.currentTurn + 1,
          currentPlayer: newTurnFirstPlayer,
          board: rolledBoard,
          phaseState: {
            builtTracksThisTurn: 0,
            maxTracksThisTurn: getMapProfile(state.mapId).buildsPerTurn,
            lastBuiltCoords: [] as HexCoord[],
            moveGoodsRound: 1 as const,
            playerMoves: createPlayerMoves(activePlayers),
            engineUpgradedThisTurn: createPlayerMoves(activePlayers),
            productionUsed: false,
      urbanizationUsed: false,
            locomotiveUsed: false,
          },
          // 행동 리셋은 좌석 전체(파산자 포함) — 생존자만 리셋하면 파산자의 마지막
          // selectedAction이 스테일로 남아 그 행동이 계속 "선택됨"으로 잠긴다.
          players: resetPlayerActions(state.players, state.activePlayers),
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
      // 배치할 빈 칸/주머니 큐브가 없어 생산이 무의미하면 자동 완료(건너뛰기 아님 — 물리적으로 배치 불가).
      // 이걸 안 하면 아래 GoodsGrowthPanel이 주사위를 잠근 채 홀더는 배치할 게 없어 교착된다(첫 턴 등).
      let autoProductionUsed = false;
      if (nextPhaseName === 'goodsGrowth' && !state.phaseState.productionUsed) {
        const productionHolder = activePlayers.find(
          p => state.players[p]?.selectedAction === 'production' && !state.players[p]?.isAI
        );
        if (productionHolder) {
          const hasEmptySlot = state.goodsDisplay.slots.some(s => s === null);
          const hasBagCube = state.goodsDisplay.bag.length > 0;
          if (hasEmptySlot && hasBagCube) {
            phaseEntryPlayer = productionHolder; // 배치 가능 — 홀더가 배치할 때까지 주사위 대기
          } else {
            autoProductionUsed = true; // 배치할 게 없음 — 생산 자동 완료 → 주사위 잠금 해제
          }
        }
      }

      // 단계 전환 로깅
      return {
        currentPhase: nextPhaseName,
        currentPlayer: phaseEntryPlayer,
        // 물품 성장 진입 시 직전 턴 성장 이벤트를 비운다 (게스트가 이전 결과를 stale하게 보지 않도록)
        ...(nextPhaseName === 'goodsGrowth' ? { goodsGrowthEvent: null } : {}),
        ...(autoProductionUsed
          ? { phaseState: { ...state.phaseState, productionUsed: true } }
          : {}),
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

  runAIAutoPhase: () => {
    const state = get();
    const player = state.players[state.currentPlayer];
    // 방어: 봇이 아니면 자동 진행하지 않음 (사람 차례 정산은 '진행' 버튼으로 수동 확인 유지)
    if (!player?.isAI) return;

    // Montréal 정부 링크: 봇 관리자가 중립 링크를 자동 건설한 뒤 진행
    if (state.currentPhase === 'governmentLink') {
      runGovernmentBuildAI(get);
      get().nextPhase();
      return;
    }

    // 물품 성장: 봇이 currentPlayer면 사람이 굴리던 주사위를 대신 굴려 성장을 적용한다.
    // 주사위 수 = 탈락하지 않은 활성 플레이어 수 × 맵별 배수(표준 1, 달 2), 값 1~6 (DiceRoller와 동일 규칙).
    if (state.currentPhase === 'goodsGrowth') {
      const diceCount = state.activePlayers.filter((p) => !state.players[p]?.eliminated).length
        * getMapProfile(state.mapId).growthDicePerPlayer;
      const diceResults = Array.from(
        { length: diceCount },
        () => Math.floor(Math.random() * 6) + 1
      );
      console.log(`[AI 물품성장] ${player.name} 주사위 자동: [${diceResults.join(', ')}]`);
      state.growGoods(diceResults);

      // 봇은 주사위→성장→다음 단계를 즉시 처리해 성장 결과(주사위/도시별 추가 큐브)를 볼 틈이
      // 없었다("그냥 넘어감" 피드백, 2026-07-07). growGoods가 남긴 goodsGrowthEvent를
      // GoodsGrowthPanel이 잠시 보여준 뒤 넘어가도록 nextPhase만 지연한다(성장은 이미 적용됨).
      // VITEST에선 AI_ACTION_VIEW_DELAY=0이라 동기 진행 → 기존 테스트 영향 없음.
      if (AI_ACTION_VIEW_DELAY > 0) {
        safeTimeout(() => {
          // 컨텍스트 검증: 여전히 이 봇의 goodsGrowth일 때만 진행 (그 사이 상태가 바뀌었으면 무시)
          const s = get();
          if (s.currentPhase === 'goodsGrowth' && s.players[s.currentPlayer]?.isAI) {
            get().nextPhase();
          }
        }, turboDelay(AI_ACTION_VIEW_DELAY));
        return;
      }
    }

    // 정산(collectIncome/payExpenses/incomeReduction/advanceTurn)은 nextPhase가 내부에서
    // 해당 액션을 호출하며 다음 단계로 넘긴다. goodsGrowth도 위 성장 후 nextPhase로 진행.
    get().nextPhase();
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
      // 달(Moon): 턴 롤오버 시 밤/낮 교대
      ...(prevState.board.nightSide
        ? { board: { ...prevState.board, nightSide: (prevState.board.nightSide === 'west' ? 'east' : 'west') as 'west' | 'east' } }
        : {}),
      phaseState: {
        builtTracksThisTurn: 0,
        maxTracksThisTurn: getMapProfile(state.mapId).buildsPerTurn,
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
      // 팬텀 취소: undoCount(동기화 상태)는 남았는데 스택(메모리)이 비었다 —
      // 새로고침·호스트 승계 후 복원 경로에서 어긋난 경우. 되돌릴 게 없어 count만 0으로 자가치유.
      console.warn(
        `[undo] 팬텀 취소 — 스택 비어있음(새로고침/호스트 승계 후 가능), count만 0으로 정리`,
        { undoCountWas: get().undoCount }
      );
      set({ undoCount: 0 });
      return;
    }
    console.log(`[undo] 실행: "${snap.label}" → 남은 취소 ${undoSnapshots.length}개`);
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

  // === 트랙 방향 전환(redirectTrack)은 건설 액션과 함께 slices/buildSlice.ts로 분리 (스텝 3e) ===

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
    // Montréal: 셋업 때 신규 도시 타일 위에 놓인 화물(setupCube)이 도시화와 함께 보드에 올라감
    if (tile.setupCube) {
      newCityCubes.push(tile.setupCube);
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

  // === Production (생산) — growGoods와 함께 slices/goodsGrowthSlice.ts로 분리 (스텝 3d) ===

  // === 물품 이동 정산(completeCubeMove)은 slices/moveSlice.ts로 분리 (스텝 3f) ===

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
        // 실행 취소 스택(undoSnapshots)은 메모리 모듈 싱글턴이라 새로고침 후 비어 있다.
        // undoCount는 persist로 복원되므로 그대로 두면 "버튼은 보이는데 눌러도 안 되돌아가는"
        // 팬텀 취소가 된다 (undoLastAction이 pop→undefined로 count만 0으로 만듦). 항상 0으로 리셋.
        undoCount: 0,
      }),
    }
  )
);

// 디버깅용: 전역에 스토어 노출
if (typeof window !== 'undefined') {
  (window as unknown as { __GAME_STORE__: typeof useGameStore }).__GAME_STORE__ = useGameStore;
}
