// Zustand 게임 상태 관리

import { create } from 'zustand';
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
  NEW_CITY_TILES,
  NewCityTileId,
  City,
  PLAYER_ID_ORDER,
  PLAYER_COLOR_ORDER,
  TURNS_BY_PLAYER_COUNT,
  AIExecutionQueue,
  CapturedAIContext,
  MovingCubeContext,
} from '@/types/game';
import { getAIDecision, AI_TURN_DELAY, isCurrentPlayerAI, aiPlayerManager } from '@/ai';
import {
  createInitialBoardState,
  initializeGoodsDisplay,
} from '@/utils/tutorialMap';
import {
  isValidConnectionPoint,
  validateFirstTrackRule,
  validateTrackConnection,
  playerHasTrack,
  isTrackPartOfCompletedLink,
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
} from '@/utils/hexGrid';
import {
  getNextPlayerId,
  createPlayerMoves,
  allPlayersMoved,
  allPlayersSelectedAction,
  resetPlayerActions,
  createInitialPlayerState,
  findFirstBuildPlayer,
  findFirstMovePlayer,
  isLastPlayer,
} from '@/utils/gameLogic';

/**
 * AI 플레이어 설정
 */
export interface AIPlayerConfig {
  playerIndex: number;  // 0-based 인덱스
  name: string;
}

/**
 * 튜토리얼 게임 설정
 */
export const TUTORIAL_GAME_CONFIG = {
  maxTurns: 3,  // 튜토리얼은 3턴
  defaultAI: { playerIndex: 1, name: '컴퓨터-기차' } as AIPlayerConfig,
};

// 테스트에서 사용할 수 있도록 export
export function createInitialGameState(
  mapId: string,
  playerNames: string[],
  aiPlayers: AIPlayerConfig[] = []
): GameState {
  const boardState = createInitialBoardState();
  const goodsDisplay = initializeGoodsDisplay();

  // 도시에 물품 배치
  const bag = [...goodsDisplay.bag];
  const citiesWithCubes = boardState.cities.map((city) => {
    const cubes: CubeColor[] = [];
    for (let i = 0; i < GAME_CONSTANTS.INITIAL_CUBES_PER_CITY; i++) {
      if (bag.length > 0) {
        const cube = bag.pop();
        if (cube) cubes.push(cube);
      }
    }
    return { ...city, cubes };
  });

  // 동적 플레이어 초기화
  const playerCount = playerNames.length;
  const activePlayers = PLAYER_ID_ORDER.slice(0, playerCount);

  // AI 플레이어 인덱스 세트 생성
  const aiPlayerIndexes = new Set(aiPlayers.map(ai => ai.playerIndex));

  // 플레이어 객체 생성
  const players: Partial<Record<PlayerId, PlayerState>> = {};
  activePlayers.forEach((playerId, index) => {
    const isAI = aiPlayerIndexes.has(index);
    players[playerId] = createInitialPlayerState(
      playerId,
      playerNames[index],
      PLAYER_COLOR_ORDER[index],
      isAI
    );
  });

  // playerMoves 동적 생성
  const playerMoves: Partial<Record<PlayerId, boolean>> = {};
  activePlayers.forEach(p => { playerMoves[p] = false; });

  // 튜토리얼 맵은 3턴으로 제한
  const maxTurns = mapId === 'tutorial' ? TUTORIAL_GAME_CONFIG.maxTurns : (TURNS_BY_PLAYER_COUNT[playerCount] || 6);

  return {
    // 메타 정보
    gameId: `game-${Date.now()}`,
    mapId,
    playerCount,
    activePlayers,
    maxTurns,

    // 턴 진행
    currentTurn: 1,
    currentPhase: 'issueShares',
    currentPlayer: 'player1',
    playerOrder: [...activePlayers],

    // 플레이어
    players: players as Record<PlayerId, PlayerState>,

    // 보드
    board: {
      ...boardState,
      cities: citiesWithCubes,
    },
    goodsDisplay: {
      slots: goodsDisplay.slots,
      bag,
    },
    newCityTiles: NEW_CITY_TILES.map(tile => ({ ...tile })),  // 복사본 생성

    // 경매
    auction: null,

    // 단계 상태
    phaseState: {
      builtTracksThisTurn: 0,
      maxTracksThisTurn: GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
      moveGoodsRound: 1,
      playerMoves: playerMoves as Record<PlayerId, boolean>,
      productionUsed: false,
      locomotiveUsed: false,
    },

    // UI 상태
    ui: {
      selectedHex: null,
      selectedCube: null,
      previewTrack: null,
      highlightedHexes: [],
      movePath: [],
      // 트랙 건설 UI 상태
      buildMode: 'idle',
      sourceHex: null,
      buildableNeighbors: [],
      targetHex: null,
      entryEdge: null,
      exitDirections: [],
      // 복합 트랙 선택 UI 상태
      complexTrackSelection: null,
      // 방향 전환 UI 상태
      redirectTrackSelection: null,
      // 도시화 UI 상태
      urbanizationMode: false,
      selectedNewCityTile: null,
      // Production UI 상태
      productionMode: false,
      productionCubes: [],
      selectedProductionSlots: [],
      // 물품 이동 애니메이션 상태
      movingCube: null,
      reachableDestinations: [],
    },

    // 로그
    logs: [],

    // 결과
    winner: null,
    finalScores: null,
  };
}

// ============================================================
// AI 동기화 헬퍼 (레이스 컨디션 방지)
// ============================================================

/** AI 체크 debounce 타임아웃 ID */
let aiCheckTimeoutId: ReturnType<typeof setTimeout> | null = null;

/** AI 체크 debounce 딜레이 (ms) */
const AI_CHECK_DEBOUNCE = 150;

/**
 * AI 실행 락 획득 시도
 * @returns executionId if acquired, null if already locked
 */
const tryAcquireAILock = (get: () => GameStore, set: (partial: Partial<GameStore>) => void): number | null => {
  const state = get();
  if (state.aiExecution.pending) {
    console.log('[AI Lock] 이미 실행 중 - 락 획득 실패');
    return null;
  }
  const executionId = Date.now();
  set({ aiExecution: { pending: true, executionId } });
  console.log(`[AI Lock] 락 획득 성공 - executionId: ${executionId}`);
  return executionId;
};

/**
 * AI 실행 락 해제
 * @param executionId 획득한 executionId
 */
const releaseAILock = (
  executionId: number,
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void
): void => {
  const state = get();
  if (state.aiExecution.executionId === executionId) {
    set({ aiExecution: { pending: false, executionId: 0 } });
    console.log(`[AI Lock] 락 해제 - executionId: ${executionId}`);
  } else {
    console.warn(`[AI Lock] 락 해제 실패 - executionId 불일치: ${executionId} vs ${state.aiExecution.executionId}`);
  }
};

/**
 * 실행 컨텍스트 유효성 검증
 * @returns true if context is still valid
 */
const validateExecutionContext = (
  context: CapturedAIContext,
  get: () => GameStore
): boolean => {
  const currentState = get();
  const isValid = (
    currentState.currentPlayer === context.currentPlayer &&
    currentState.currentPhase === context.currentPhase &&
    currentState.aiExecution.executionId === context.executionId
  );
  if (!isValid) {
    console.warn('[AI Context] 컨텍스트 유효성 검증 실패:', {
      expected: { player: context.currentPlayer, phase: context.currentPhase, execId: context.executionId },
      actual: { player: currentState.currentPlayer, phase: currentState.currentPhase, execId: currentState.aiExecution.executionId },
    });
  }
  return isValid;
};

/** 플레이어 행동이 필요한 단계들 */
const PLAYER_ACTION_PHASES: GamePhase[] = [
  'issueShares',
  'determinePlayerOrder',
  'selectActions',
  'buildTrack',
  'moveGoods',
];

/**
 * 중앙 집중식 AI 스케줄러 (debounce 적용)
 * 모든 AI 트리거 포인트에서 이 함수를 호출하여 중복 실행 방지
 */
const scheduleAICheck = (get: () => GameStore): void => {
  // 기존 타임아웃 취소 (debounce)
  if (aiCheckTimeoutId) {
    clearTimeout(aiCheckTimeoutId);
  }

  aiCheckTimeoutId = setTimeout(() => {
    aiCheckTimeoutId = null;

    const state = get();

    // 조건 체크
    const isPhaseMatch = PLAYER_ACTION_PHASES.includes(state.currentPhase);
    const isAI = isCurrentPlayerAI(state);
    const notPending = !state.aiExecution.pending;

    console.log(`[AI 스케줄러] phase=${state.currentPhase}, player=${state.currentPlayer}, isAI=${isAI}, pending=${state.aiExecution.pending}`);

    if (isPhaseMatch && isAI && notPending) {
      console.log('[AI 스케줄러] 조건 충족 - AI 턴 실행');
      state.executeAITurn();
    }
  }, AI_CHECK_DEBOUNCE);
};

// ============================================================
// 스토어 인터페이스
// ============================================================
interface GameStore extends GameState {
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

  // --- Phase III: 행동 선택 ---
  /** 특수 행동 선택 */
  selectAction: (playerId: PlayerId, action: SpecialAction) => void;

  // --- Phase IV: 트랙 건설 ---
  /** 트랙 건설 */
  buildTrack: (coord: HexCoord, edges: [number, number]) => boolean;
  /** 트랙 건설 가능 여부 확인 */
  canBuildTrack: (coord: HexCoord, edges: [number, number]) => boolean;
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
export const useGameStore = create<GameStore>((set, get) => ({
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

    set({
      ...createInitialGameState(state.mapId, playerNames, aiPlayers),
      aiExecution: { pending: false, executionId: 0 },
    });

    console.log(`[resetGame] AI 플레이어 ${aiPlayerManager.count}명 리셋됨`);
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
        case 'issueShares':
          if (decision.amount > 0) {
            store.issueShare(capturedContext.currentPlayer, decision.amount);
          }
          store.nextPhase();
          break;

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

        case 'selectAction':
          store.selectAction(capturedContext.currentPlayer, decision.action);
          store.nextPhase();
          break;

        case 'buildTrack': {
          const { decision: buildDecision } = decision;
          if (buildDecision.action === 'build') {
            store.buildTrack(buildDecision.coord, buildDecision.edges);

            // 트랙 건설 후 상태 확인
            const afterBuildState = get();
            const { builtTracksThisTurn, maxTracksThisTurn } = afterBuildState.phaseState;

            // 아직 더 건설할 수 있으면 다시 AI 결정 실행 (스케줄러 사용)
            if (builtTracksThisTurn < maxTracksThisTurn) {
              releaseAILock(executionId, get, set);
              scheduleAICheck(get);
              return; // nextPhase 호출하지 않음
            }
          } else if (buildDecision.action === 'buildComplex') {
            // 복합 트랙 건설 (교차 또는 공존)
            store.buildComplexTrack(buildDecision.coord, buildDecision.edges, buildDecision.trackType);

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
    set((state) => {
      const player = state.players[playerId];
      if (!player) {
        console.error(`[ERROR] issueShare: 플레이어 없음 - playerId: ${playerId}`);
        return state;
      }
      const maxShares = GAME_CONSTANTS.MAX_SHARES - player.issuedShares;
      const actualAmount = Math.min(amount, maxShares);

      if (actualAmount <= 0) {
        console.warn(`[WARN] issueShare: 발행 불가 - playerId: ${playerId}, 요청: ${amount}, 최대 가능: ${maxShares}`);
        return state;
      }

      return {
        players: {
          ...state.players,
          [playerId]: {
            ...player,
            issuedShares: player.issuedShares + actualAmount,
            cash: player.cash + actualAmount * GAME_CONSTANTS.SHARE_VALUE,
          },
        },
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
      };
    });
  },

  // ============================================================
  // Phase II: 플레이어 순서 경매
  // ============================================================
  placeBid: (playerId, amount) => {
    set((state) => {
      if (!state.auction) {
        // 경매 시작 - 다음 입찰자 계산
        const activePlayers = state.playerOrder;
        const currentIndex = activePlayers.indexOf(playerId);
        const nextIndex = (currentIndex + 1) % activePlayers.length;
        const nextBidder = activePlayers[nextIndex];

        return {
          auction: {
            currentBidder: playerId,
            highestBid: amount,
            highestBidder: playerId,
            passedPlayers: [],
            bids: { [playerId]: amount } as Record<PlayerId, number>,
            lastActedPlayer: playerId,
          },
          currentPlayer: nextBidder,
        };
      }

      // 입찰
      if (amount <= state.auction.highestBid) {
        console.warn(`[WARN] placeBid: 입찰 금액 부족 - playerId: ${playerId}, 입찰: $${amount}, 현재 최고: $${state.auction.highestBid}`);
        return state;
      }

      // 다음 입찰자 계산 (패스한 플레이어 제외)
      const activePlayers = state.playerOrder.filter(p => !state.auction!.passedPlayers.includes(p));
      const currentIndex = activePlayers.indexOf(playerId);
      const nextIndex = (currentIndex + 1) % activePlayers.length;
      const nextBidder = activePlayers[nextIndex];

      return {
        auction: {
          ...state.auction,
          currentBidder: playerId,
          highestBid: amount,
          highestBidder: playerId,
          lastActedPlayer: playerId,
          bids: {
            ...state.auction.bids,
            [playerId]: amount,
          },
        },
        currentPlayer: nextBidder,
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: playerId,
            action: `입찰: $${amount}`,
            timestamp: Date.now(),
          },
        ],
      };
    });

    // AI 턴 트리거 (중앙 집중식 스케줄러 사용)
    scheduleAICheck(get);
  },

  passBid: (playerId) => {
    set((state) => {
      // 첫 번째 플레이어가 입찰 없이 포기하는 경우 (auction이 null)
      if (!state.auction) {
        console.log(`[passBid] 첫 번째 플레이어 포기 - playerId: ${playerId}`);
        const newPassedPlayers = [playerId];
        const activePlayers = state.playerOrder.filter(p => !newPassedPlayers.includes(p));

        // 다음 입찰자 계산
        let nextBidder: PlayerId;
        if (activePlayers.length <= 1) {
          // 경매 종료 (모두 포기 또는 1명 남음)
          nextBidder = activePlayers[0] || state.playerOrder[0];
        } else {
          nextBidder = activePlayers[0];
        }

        return {
          auction: {
            currentBidder: nextBidder,
            highestBid: 0,
            highestBidder: null,
            passedPlayers: newPassedPlayers,
            bids: {} as Record<PlayerId, number>,
            lastActedPlayer: playerId,
          },
          currentPlayer: nextBidder,
          logs: [
            ...state.logs,
            {
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: playerId,
              action: `입찰 포기 (첫 번째)`,
              timestamp: Date.now(),
            },
          ],
        };
      }

      const newPassedPlayers = [...state.auction.passedPlayers, playerId];

      // 다음 입찰자 계산 (패스한 플레이어 제외)
      const activePlayers = state.playerOrder.filter(p => !newPassedPlayers.includes(p));

      // 남은 플레이어가 1명 이하면 경매 종료 상태
      let nextBidder: PlayerId;
      if (activePlayers.length <= 1) {
        // 경매 종료 - 승자가 현재 플레이어가 됨
        nextBidder = state.auction.highestBidder || state.playerOrder[0];
      } else {
        const currentIndex = activePlayers.indexOf(state.auction.lastActedPlayer || playerId);
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % activePlayers.length;
        nextBidder = activePlayers[nextIndex >= activePlayers.length ? 0 : nextIndex];
      }

      return {
        auction: {
          ...state.auction,
          passedPlayers: newPassedPlayers,
          lastActedPlayer: playerId,
        },
        currentPlayer: nextBidder,
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: playerId,
            action: `입찰 포기`,
            timestamp: Date.now(),
          },
        ],
      };
    });

    // AI 턴 트리거 (중앙 집중식 스케줄러 사용)
    scheduleAICheck(get);
  },

  // Turn Order 패스: 탈락 없이 다음 입찰자로 넘어가기
  skipBid: (playerId) => {
    set((state) => {
      if (!state.auction) {
        console.warn(`[WARN] skipBid: 경매 없음 - playerId: ${playerId}`);
        return state;
      }

      // 다음 입찰자 계산 (패스한 플레이어 제외)
      const activePlayers = state.playerOrder.filter(p => !state.auction!.passedPlayers.includes(p));
      const currentIndex = activePlayers.indexOf(playerId);
      const nextIndex = (currentIndex + 1) % activePlayers.length;
      const nextBidder = activePlayers[nextIndex];

      return {
        auction: {
          ...state.auction,
          lastActedPlayer: playerId,  // 마지막 행동자 업데이트 (passedPlayers에는 추가 안 함)
        },
        currentPlayer: nextBidder,
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: playerId,
            action: `Turn Order 패스 사용 (탈락 없음)`,
            timestamp: Date.now(),
          },
        ],
      };
    });

    // AI 턴 트리거 (중앙 집중식 스케줄러 사용)
    scheduleAICheck(get);
  },

  resolveAuction: () => {
    set((state) => {
      if (!state.auction) {
        console.warn('[WARN] resolveAuction: 경매 없음');
        return state;
      }

      const { highestBid, bids, passedPlayers } = state.auction;
      let { highestBidder } = state.auction;

      // 비용 지불 및 순서 결정
      const newPlayers = { ...state.players };
      const newPlayerOrder: PlayerId[] = [];

      // 다중 플레이어 경매 규칙 (룰북 기준):
      // - 첫 번째로 포기한 플레이어: 마지막 순서, $0 지불
      // - 마지막 2명 (승자 + 마지막 포기자): 각자 입찰액 전액 지불
      // - 나머지 포기자들 (중간): 입찰액의 절반 (올림) 지불

      // 포기 순서 복사 (원본 변경 방지)
      const passOrder = [...passedPlayers];
      const lastDropoutIndex = passOrder.length - 1;

      // highestBidder가 없으면 (모두 포기하거나 입찰 없이 완료된 경우)
      // 포기하지 않은 플레이어를 승자로 설정
      if (!highestBidder) {
        const activePlayers = state.activePlayers.filter(p => !passedPlayers.includes(p));
        if (activePlayers.length > 0) {
          highestBidder = activePlayers[0];
          console.log(`[resolveAuction] 입찰 없이 완료 - 승자: ${highestBidder}`);
        }
      }

      // 최고 입찰자가 1번 (전액 지불)
      if (highestBidder) {
        const bidderCash = newPlayers[highestBidder].cash - highestBid;
        if (bidderCash < 0) {
          console.warn(`[WARN] resolveAuction: 현금 부족 - ${highestBidder}, 입찰: $${highestBid}, 보유: $${newPlayers[highestBidder].cash}`);
        }
        newPlayers[highestBidder] = {
          ...newPlayers[highestBidder],
          cash: Math.max(0, bidderCash),
        };
        newPlayerOrder.push(highestBidder);
      }

      // 포기한 플레이어들 처리 (포기 역순으로 순서 결정)
      // 마지막 포기자부터 첫 번째 포기자까지 (1번 다음 순서부터)
      for (let i = lastDropoutIndex; i >= 0; i--) {
        const player = passOrder[i];
        if (newPlayerOrder.includes(player)) continue;

        const playerBid = bids[player] || 0;

        // 비용 계산
        if (i === 0) {
          // 첫 번째 포기자: $0 지불
          // 이미 cash 변경 없음
        } else if (i === lastDropoutIndex) {
          // 마지막 포기자 (승자와 함께 "마지막 2명"): 전액 지불
          if (playerBid > 0) {
            newPlayers[player] = {
              ...newPlayers[player],
              cash: Math.max(0, newPlayers[player].cash - playerBid),
            };
          }
        } else {
          // 중간 포기자: 절반 (올림) 지불
          if (playerBid > 0) {
            newPlayers[player] = {
              ...newPlayers[player],
              cash: Math.max(0, newPlayers[player].cash - Math.ceil(playerBid / 2)),
            };
          }
        }

        // 순서에 추가
        newPlayerOrder.push(player);
      }

      // 모든 플레이어가 순서에 있는지 확인 (안전장치)
      for (const playerId of state.activePlayers) {
        if (!newPlayerOrder.includes(playerId)) {
          newPlayerOrder.push(playerId);
        }
      }

      console.log(`[resolveAuction] 새 playerOrder: [${newPlayerOrder.join(', ')}], 1번: ${newPlayerOrder[0]} (isAI: ${newPlayers[newPlayerOrder[0]]?.isAI})`);

      return {
        players: newPlayers,
        playerOrder: newPlayerOrder,
        auction: null,
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: highestBidder || state.playerOrder[0],
            action: highestBidder
              ? `경매 승리: ${newPlayers[highestBidder].name} ($${highestBid} 지불)`
              : '경매 없이 순서 유지',
            timestamp: Date.now(),
          },
        ],
      };
    });
  },

  // ============================================================
  // Phase III: 행동 선택
  // ============================================================
  selectAction: (playerId, action) => {
    set((state) => {
      // 플레이어 존재 검증
      const player = state.players[playerId];
      if (!player) {
        console.error(`[ERROR] selectAction: 플레이어 없음 - playerId: ${playerId}`);
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
        newState.phaseState = {
          ...state.phaseState,
          maxTracksThisTurn: GAME_CONSTANTS.ENGINEER_TRACK_LIMIT,
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

      return newState as GameState;
    });
  },

  // ============================================================
  // Phase IV: 트랙 건설
  // ============================================================
  canBuildTrack: (coord, edges) => {
    const state = get();
    const currentPlayer = state.currentPlayer;

    // 트랙 제한 확인
    if (state.phaseState.builtTracksThisTurn >= state.phaseState.maxTracksThisTurn) {
      return false;
    }

    const { board } = state;

    // 유효한 헥스인지 확인 (도시, 호수 제외)
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
    if (isCity) return false;

    const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
    if (hexTile && hexTile.terrain === 'lake') return false;

    // 이미 트랙이 있는지 확인
    const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
    if (existingTrack) return false;

    // 연결성 검증
    const hasExistingTrack = playerHasTrack(board, currentPlayer);

    if (!hasExistingTrack) {
      // 첫 트랙: 도시에 인접해야 함
      if (!validateFirstTrackRule(coord, edges, board)) {
        return false;
      }
    } else {
      // 후속 트랙: 기존 트랙/도시에 연결되어야 함
      if (!validateTrackConnection(coord, edges, board, currentPlayer)) {
        return false;
      }
    }

    return true;
  },

  buildTrack: (coord, edges) => {
    const state = get();

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

    const currentPlayer = state.currentPlayer;
    const terrain = state.board.hexTiles.find(
      (h) => hexCoordsEqual(h.coord, coord)
    )?.terrain || 'plain';

    // 비용 계산
    let cost = GAME_CONSTANTS.PLAIN_TRACK_COST;
    if (terrain === 'river') cost = GAME_CONSTANTS.RIVER_TRACK_COST;
    if (terrain === 'mountain') cost = GAME_CONSTANTS.MOUNTAIN_TRACK_COST;

    const player = state.players[currentPlayer];
    if (!player) {
      console.error(`[ERROR] buildTrack: 플레이어 없음 - currentPlayer: ${currentPlayer}`);
      return false;
    }
    if (player.cash < cost) {
      console.warn(`[WARN] buildTrack: 현금 부족 - 필요: $${cost}, 보유: $${player.cash}`);
      return false;
    }

    const newTrack: TrackTile = {
      id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      coord,
      edges,
      owner: currentPlayer,
      trackType: 'simple',
    };

    const newBuiltCount = state.phaseState.builtTracksThisTurn + 1;

    set({
      board: {
        ...state.board,
        trackTiles: [...state.board.trackTiles, newTrack],
      },
      players: {
        ...state.players,
        [currentPlayer]: {
          ...player,
          cash: player.cash - cost,
        },
      },
      phaseState: {
        ...state.phaseState,
        builtTracksThisTurn: newBuiltCount,
      },
      logs: [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: currentPlayer,
          action: `트랙 건설 (${coord.col}, ${coord.row}) - $${cost}`,
          timestamp: Date.now(),
        },
      ],
    });

    // 참고: nextPhase()는 호출자(UI 버튼 또는 AI)가 직접 호출함
    // 여기서 자동 호출하면 중복 호출로 버그 발생

    return true;
  },

  // === 복합 트랙 건설 ===
  canBuildComplexTrack: (coord, newEdges, trackType) => {
    const state = get();
    const currentPlayer = state.currentPlayer;

    // 트랙 제한 확인
    if (state.phaseState.builtTracksThisTurn >= state.phaseState.maxTracksThisTurn) {
      return false;
    }

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
    if (!validateTrackConnection(coord, newEdges, state.board, currentPlayer)) {
      return false;
    }

    return true;
  },

  buildComplexTrack: (coord, newEdges, trackType) => {
    const state = get();

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

    const newBuiltCount = state.phaseState.builtTracksThisTurn + 1;

    set({
      board: {
        ...state.board,
        trackTiles: updatedTrackTiles,
      },
      players: {
        ...state.players,
        [currentPlayer]: {
          ...player,
          cash: player.cash - cost,
        },
      },
      phaseState: {
        ...state.phaseState,
        builtTracksThisTurn: newBuiltCount,
      },
      logs: [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: currentPlayer,
          action: `복합 트랙 건설 (${trackType}) (${coord.col}, ${coord.row}) - $${cost}`,
          timestamp: Date.now(),
        },
      ],
    });

    // 참고: nextPhase()는 호출자(UI 버튼 또는 AI)가 직접 호출함
    // 여기서 자동 호출하면 중복 호출로 버그 발생

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

      // 경로의 트랙 소유자에게 수입 추가 (동적 플레이어 지원)
      const incomeChanges: Partial<Record<PlayerId, number>> = {};
      state.activePlayers.forEach(p => { incomeChanges[p] = 0; });

      for (let i = 0; i < path.length - 1; i++) {
        const track = state.board.trackTiles.find(
          (t) =>
            (t.coord.col === path[i].col && t.coord.row === path[i].row) ||
            (t.coord.col === path[i + 1].col && t.coord.row === path[i + 1].row)
        );
        if (track?.owner) {
          incomeChanges[track.owner] = (incomeChanges[track.owner] || 0) + 1;
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

      const oldLevel = player.engineLevel;
      const newLevel = player.engineLevel + 1;
      console.log(`[upgradeEngine] ${player.name}: 엔진 업그레이드 ${oldLevel} → ${newLevel}`);

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

      return { players: newPlayers, logs: newLogs };
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

      // 파산한 플레이어의 미완성 트랙 소유권 제거
      if (bankruptPlayers.length > 0) {
        console.log(`[payExpenses] 파산 플레이어: ${bankruptPlayers.join(', ')}`);
        const updatedTrackTiles = newBoard.trackTiles.map(track => {
          if (track.owner && bankruptPlayers.includes(track.owner)) {
            // 완성된 링크의 일부가 아닌 트랙만 소유권 제거
            if (!isTrackPartOfCompletedLink(track.coord, newBoard)) {
              return { ...track, owner: null };
            }
          }
          return track;
        });

        newBoard = {
          ...newBoard,
          trackTiles: updatedTrackTiles,
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

        if (reduction > 0) {
          const oldIncome = player.income;
          const newIncome = Math.max(player.income - reduction, GAME_CONSTANTS.MIN_INCOME);
          newPlayers[playerId] = {
            ...player,
            income: newIncome,
          };

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

      return { players: newPlayers, logs: newLogs };
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

      // 열-도시 매핑 (Tutorial Map - TUTORIAL_COLUMN_MAPPING과 일치해야 함)
      // 1-6: 주사위 열, A-D: 신규 도시 열
      const columnToCityId: Record<string, string> = {
        '1': 'P', // Pittsburgh
        '2': 'C', // Cleveland
        '3': 'O', // Columbus
        '4': 'W', // Wheeling
        '5': 'I', // Cincinnati
        '6': 'P', // Pittsburgh (다시)
      };

      // 열의 시작 인덱스 계산
      const columnStartIndex: Record<string, number> = {
        '1': 0,   // 0-5
        '2': 6,   // 6-11
        '3': 12,  // 12-17
        '4': 18,  // 18-23
        '5': 24,  // 24-29
        '6': 30,  // 30-35
        'A': 36,  // 36-39
        'B': 40,  // 40-43
        'C': 44,  // 44-47
        'D': 48,  // 48-51
      };

      // 주사위 결과에 따른 물품 배치
      const columnCounts: Record<string, number> = {};
      for (const result of diceResults) {
        const key = String(result);
        columnCounts[key] = (columnCounts[key] || 0) + 1;
      }

      // 각 열에서 도시로 큐브 이동
      for (const [column, count] of Object.entries(columnCounts)) {
        const cityId = columnToCityId[column];
        if (!cityId) continue;

        const city = newCities.find(c => c.id === cityId);
        if (!city) continue;

        const startIdx = columnStartIndex[column];
        const rowCount = column.match(/[A-D]/) ? 4 : 6;

        // 위에서부터 큐브 가져오기
        let moved = 0;
        for (let i = 0; i < rowCount && moved < count; i++) {
          const slotIdx = startIdx + i;
          const cube = newSlots[slotIdx];
          if (cube) {
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

    // 이미 게임 오버면 진행하지 않음
    if (currentState.currentPhase === 'gameOver') {
      console.log('[nextPhase] 이미 게임 오버 - 진행 중단');
      return;
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
      const phases: GamePhase[] = [
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

      const nextPlayer = getNextPlayerId(state.currentPlayer, activePlayers);

      // 현재 플레이어가 마지막 플레이어인지 확인
      const isLast = isLastPlayer(state.currentPlayer, playerOrder);

      // === I. 주식 발행 단계 ===
      if (state.currentPhase === 'issueShares') {
        // 마지막 플레이어까지 완료했으면 다음 단계로
        if (isLast) {
          return {
            currentPhase: 'determinePlayerOrder' as GamePhase,
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
        console.log(`[nextPhase] determinePlayerOrder → selectActions: playerOrder=[${playerOrder.join(', ')}], 새 currentPlayer=${playerOrder[0]} (isAI: ${state.players[playerOrder[0]]?.isAI})`);
        return {
          currentPhase: 'selectActions' as GamePhase,
          currentPlayer: playerOrder[0],
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
              // 첫 번째로 건설할 플레이어의 Engineer 효과 확인
              maxTracksThisTurn: state.players[firstBuilder].selectedAction === 'engineer'
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
            phaseState: {
              ...state.phaseState,
              moveGoodsRound: 1,
              playerMoves: createPlayerMoves(activePlayers),
            },
          };
        }

        // 다음 플레이어로 전환
        return {
          currentPlayer: nextPlayer,
          phaseState: {
            ...state.phaseState,
            builtTracksThisTurn: 0,
            maxTracksThisTurn: state.players[nextPlayer].selectedAction === 'engineer'
              ? GAME_CONSTANTS.ENGINEER_TRACK_LIMIT
              : GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
            playerMoves: updatedPlayerMoves,
          },
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

        // 다음 플레이어로 전환
        return {
          currentPlayer: nextPlayer,
          phaseState: {
            ...state.phaseState,
            playerMoves: updatedPlayerMoves,
          },
        };
      }

      // === VI-X. 자동 단계들 ===
      const nextIndex = (currentIndex + 1) % phases.length;
      const nextPhaseName = phases[nextIndex];

      // advanceTurn 후에는 새 턴 시작
      if (nextPhaseName === 'issueShares' && currentIndex === phases.length - 1) {
        // 게임 종료 확인
        if (state.currentTurn >= state.maxTurns) {
          return {
            currentPhase: 'gameOver' as GamePhase,
          };
        }

        return {
          ...state,
          currentPhase: nextPhaseName,
          currentTurn: state.currentTurn + 1,
          currentPlayer: playerOrder[0],
          phaseState: {
            builtTracksThisTurn: 0,
            maxTracksThisTurn: GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
            moveGoodsRound: 1,
            playerMoves: createPlayerMoves(activePlayers),
            productionUsed: false,
            locomotiveUsed: false,
          },
          players: resetPlayerActions(state.players, activePlayers),
        };
      }

      // 단계 전환 로깅
      return {
        currentPhase: nextPhaseName,
        currentPlayer: playerOrder[0],
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
        moveGoodsRound: 1,
        playerMoves: createPlayerMoves(prevState.activePlayers),
        productionUsed: false,
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
  // UI: 기본 선택
  // ============================================================
  selectHex: (coord) => {
    set((state) => ({
      ui: { ...state.ui, selectedHex: coord },
    }));
  },

  selectCube: (cityId, cubeIndex) => {
    const state = get();

    // 이미 이번 라운드에 이동했으면 리턴
    if (state.phaseState.playerMoves[state.currentPlayer]) {
      console.log('이미 이번 라운드에 이동했습니다.');
      return;
    }

    const city = state.board.cities.find(c => c.id === cityId);
    if (!city) return;

    const cubeColor = city.cubes[cubeIndex];
    if (!cubeColor) return;

    const player = state.players[state.currentPlayer];

    // 디버그: 큐브 선택 정보
    console.log('=== selectCube 디버그 ===');
    console.log('출발 도시:', city.name, city.coord);
    console.log('큐브 색상:', cubeColor);
    console.log('엔진 레벨:', player.engineLevel);
    console.log('같은 색상 도시들:', state.board.cities.filter(c => c.color === cubeColor).map(c => ({ name: c.name, coord: c.coord })));
    console.log('전체 트랙 수:', state.board.trackTiles.length);
    console.log('트랙 목록:', state.board.trackTiles.map(t => ({ coord: t.coord, edges: t.edges, owner: t.owner })));

    // 도달 가능한 목적지 계산
    const reachable = findReachableDestinations(
      city.coord,
      state.board,
      state.currentPlayer,
      player.engineLevel,
      cubeColor
    );

    console.log('도달 가능한 목적지:', reachable.map(c => ({ name: c.name, coord: c.coord })));
    console.log('=========================');

    set({
      ui: {
        ...state.ui,
        selectedCube: { cityId, cubeIndex },
        reachableDestinations: reachable.map(c => c.coord),
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

    // 유효한 연결점인지 확인 (도시 또는 플레이어의 트랙)
    if (!isValidConnectionPoint(coord, state.board, currentPlayer)) {
      return;
    }

    // 건설 가능한 이웃 헥스 계산
    const neighbors = getBuildableNeighbors(coord, state.board, currentPlayer);

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

    // 나갈 수 있는 방향들 계산 (들어오는 방향 제외)
    const exitDirs = getExitDirections(coord, neighbor.targetEdge, state.board);

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

    // 기존 트랙이 있고 단순 트랙이면 복합 트랙 선택 패널 표시
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

  redirectTrack: (coord, newExitEdge) => {
    const state = get();
    const currentPlayer = state.currentPlayer;

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
      },
      players: {
        ...state.players,
        [currentPlayer]: {
          ...player,
          cash: player.cash - cost,
        },
      },
      phaseState: {
        ...state.phaseState,
        builtTracksThisTurn: state.phaseState.builtTracksThisTurn + 1,
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
          action: `트랙 방향 전환 (${coord.col}, ${coord.row}) - $${cost}`,
          timestamp: Date.now(),
        },
      ],
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

  placeNewCity: (townCoord) => {
    const state = get();

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

    const town = state.board.towns.find(t => hexCoordsEqual(t.coord, townCoord));
    if (!town) return false;

    // 1. 마을을 신규 도시로 변환
    const updatedTowns = state.board.towns.map(t => {
      if (hexCoordsEqual(t.coord, townCoord)) {
        return {
          ...t,
          newCityColor: tile.color,
          cubes: [],  // 마을의 물품은 제거 (Southern US 맵에서만 관련)
        };
      }
      return t;
    });

    // 2. 새 도시를 cities 배열에 추가
    const newCity: City = {
      id: selectedTileId,  // 타일 ID를 도시 ID로 사용
      name: `New City ${selectedTileId}`,
      coord: townCoord,
      color: tile.color,
      cubes: [],  // 처음에는 물품 없음
    };

    // 3. 해당 헥스의 트랙 타일 제거 (룰북: 신규 도시 배치 시 기존 트랙 제거)
    const updatedTrackTiles = state.board.trackTiles.filter(
      track => !hexCoordsEqual(track.coord, townCoord)
    );

    // 4. 신규 도시 타일 사용 표시
    const updatedNewCityTiles = state.newCityTiles.map(t => {
      if (t.id === selectedTileId) {
        return { ...t, used: true };
      }
      return t;
    });

    set({
      board: {
        ...state.board,
        towns: updatedTowns,
        cities: [...state.board.cities, newCity],
        trackTiles: updatedTrackTiles,
      },
      newCityTiles: updatedNewCityTiles,
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

    // 출발 도시에서 큐브 즉시 제거
    const sourceCityId = state.ui.selectedCube.cityId;
    const cubeIndex = state.ui.selectedCube.cubeIndex;

    const newCities = state.board.cities.map(city => {
      if (city.id === sourceCityId) {
        const newCubes = [...city.cubes];
        newCubes.splice(cubeIndex, 1);
        return { ...city, cubes: newCubes };
      }
      return city;
    });

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

  completeCubeMove: () => {
    const state = get();
    if (!state.ui.movingCube) return;

    const { path, color, context } = state.ui.movingCube;

    // 캡처된 컨텍스트에서 플레이어 ID 사용 (레이스 컨디션 방지)
    const movingPlayerId = context.playerId;

    // 경로의 트랙 소유자에게 수입 추가 (동적 플레이어 지원)
    const incomeChanges: Partial<Record<PlayerId, number>> = {};
    state.activePlayers.forEach(p => { incomeChanges[p] = 0; });

    // 링크별로 수입 계산 (도시/마을 → 다음 도시/마을 = 1 링크)
    // 룰북: "물품이 지나가는 각 완성된 철도 링크마다 해당 링크 소유자의 수입이 1 증가"
    let linkStartIndex = 0;
    const { cities, towns, trackTiles } = state.board;

    for (let i = 1; i < path.length; i++) {
      const coord = path[i];
      const isCity = cities.some(c => hexCoordsEqual(c.coord, coord));
      const isTown = towns.some(t => hexCoordsEqual(t.coord, coord));

      if (isCity || isTown) {
        // 이 링크(linkStartIndex → i) 구간의 트랙 소유자 찾기
        for (let j = linkStartIndex + 1; j < i; j++) {
          const track = trackTiles.find(t => hexCoordsEqual(t.coord, path[j]));
          if (track?.owner) {
            incomeChanges[track.owner] = (incomeChanges[track.owner] || 0) + 1;
            break; // 링크당 한 번만 계산 (같은 링크 내 트랙은 같은 소유자)
          }
        }
        linkStartIndex = i; // 다음 링크 시작점 업데이트
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
          action: `${color} 물품 배달 (${totalLinks} 링크, +${incomeChanges[movingPlayerId] ?? 0} 수입)`,
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
}));

// 디버깅용: 전역에 스토어 노출
if (typeof window !== 'undefined') {
  (window as unknown as { __GAME_STORE__: typeof useGameStore }).__GAME_STORE__ = useGameStore;
}
