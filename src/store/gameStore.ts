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
  NEW_CITY_TILES,
  NewCityTileId,
  City,
  PLAYER_ID_ORDER,
  PLAYER_COLOR_ORDER,
  TURNS_BY_PLAYER_COUNT,
  AIExecutionQueue,
  CapturedAIContext,
  MovingCubeContext,
  BoardState,
  ACTION_INFO,
} from '@/types/game';
import { getAIDecision, AI_TURN_DELAY, isCurrentPlayerAI, aiPlayerManager } from '@/ai';
import { addFailedBuildCoord, hasPendingFreeSpur } from '@/ai/strategies/buildTrack';
import { initializeGoodsDisplay } from '@/utils/tutorialMap';
import { getMapData } from '@/utils/mapRegistry';
import { getMapProfile } from '@/maps/getMapProfile';
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
  findTrackCubeDeliveries,
  countPathLinks,
  getNeighborHex,
  getOppositeEdge } from '@/utils/hexGrid';
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
import { debugLog, logAction, newLogSession } from '@/utils/debugConfig';

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

// 마을 가닥(스퍼) 건설 비용 — 가닥은 타일 건설 시 자동 생성되지 않고,
// 마을 클릭(buildTownSpur)으로만 별도 건설된다 (첫 진입 1카운트, 비용 가닥당 $1).
const TOWN_SPUR_COST = 1;

// ============================================================
// 실행 취소(Undo): 사람 플레이어의 커밋 행동 스냅샷
// 단계/차례 전환(nextPhase) 시 초기화 — "다음으로 넘어가기 전"까지만 취소 가능
// ============================================================
interface UndoSnapshot {
  label: string;
  board: BoardState;
  players: GameState['players'];
  phaseState: GameState['phaseState'];
  newCityTiles: GameState['newCityTiles'];
  logs: GameState['logs'];
}
const undoSnapshots: UndoSnapshot[] = [];

/** 현재 상태를 스냅샷으로 저장 (AI 차례는 저장 안 함 — 사람의 취소 버튼 전용) */
function captureUndo(state: GameState, label: string) {
  const player = state.players[state.currentPlayer];
  if (!player || player.isAI) return;
  undoSnapshots.push({
    label,
    board: structuredClone(state.board),
    players: structuredClone(state.players),
    phaseState: structuredClone(state.phaseState),
    newCityTiles: structuredClone(state.newCityTiles),
    logs: state.logs, // 로그 배열은 불변 갱신이므로 참조 보관으로 충분
  });
  if (undoSnapshots.length > 30) undoSnapshots.shift();
}

function clearUndo() {
  undoSnapshots.length = 0;
}

/** 다음에 취소될 행동의 라벨 (UI 버튼 표시용) */
export function getUndoLabel(): string | null {
  return undoSnapshots[undoSnapshots.length - 1]?.label ?? null;
}

/**
 * 마을에서 빠져 있는 가닥(스퍼) 찾기 — 내 트랙이 마을 변에 닿아 있으나 가닥이 없는 변.
 * (카운트 부족으로 타일만 짓고 미연결된 트랙을 다음 턴에 buildTownSpur로 완성하는 용도)
 */
function findMissingTownSpurs(
  townCoord: HexCoord,
  board: BoardState,
  playerId: PlayerId
): { townCoord: HexCoord; edge: number }[] {
  const isTown = board.towns.some(t => hexCoordsEqual(t.coord, townCoord) && t.newCityColor === null);
  if (!isTown) return [];

  const missing: { townCoord: HexCoord; edge: number }[] = [];
  for (let edge = 0; edge < 6; edge++) {
    // 이미 가닥이 있는 변은 (소유자 무관) 연결 완료
    const hasSpur = (board.townSpurs ?? []).some(
      sp => hexCoordsEqual(sp.townCoord, townCoord) && sp.edge === edge
    );
    if (hasSpur) continue;

    // 이 변 너머 이웃 타일에 내 트랙이 마을 쪽 엣지로 닿아 있는지
    const nb = getNeighborHex(townCoord, edge);
    const facingEdge = getOppositeEdge(edge);
    const tile = board.trackTiles.find(t => hexCoordsEqual(t.coord, nb));
    if (!tile) continue;
    const mineFacing =
      (tile.owner === playerId && tile.edges.includes(facingEdge)) ||
      (tile.secondaryOwner === playerId && tile.secondaryEdges?.includes(facingEdge));
    if (mineFacing) missing.push({ townCoord, edge });
  }
  return missing;
}

/**
 * 이번 턴에 연장(새 타일 추가)하지 않은 미완성 트랙 구간의 소유권을 해제(공용화)한다.
 * 룰(IV): "미완성 트랙 구간을 자기 턴에 추가 트랙으로 연장하지 않으면 소유 디스크가 제거되어
 * 미소유 상태가 된다. 방향 전환만으로는 연장으로 인정되지 않는다."
 * 연결된 같은-소유자 구간 단위로 판정 — 구간에 이번 턴(builtTurn===currentTurn) 타일이 하나라도
 * 있으면 유지, 없으면 그 구간 전체를 owner null로(점진 건설 구간이 매 턴 끊기지 않도록 구간 단위).
 */
function releaseUnextendedTrack(board: BoardState, currentTurn: number): { board: BoardState; released: number } {
  const k = (c: HexCoord) => `${c.col},${c.row}`;
  // 소유된 미완성 트랙(완성 링크의 일부가 아님)만 대상
  const incomplete = board.trackTiles.filter(
    t => t.owner != null && !isTrackPartOfCompletedLink(t.coord, board)
  );
  if (incomplete.length === 0) return { board, released: 0 };
  const incByKey = new Map(incomplete.map(t => [k(t.coord), t]));
  const visited = new Set<string>();
  const releaseKeys = new Set<string>();

  for (const start of incomplete) {
    if (visited.has(k(start.coord))) continue;
    // 같은 소유자로 연결된 미완성 구간 BFS
    const group: typeof incomplete = [];
    const stack = [start];
    visited.add(k(start.coord));
    while (stack.length) {
      const t = stack.pop()!;
      group.push(t);
      for (const e of [...t.edges, ...(t.secondaryEdges ?? [])]) {
        const nb = getNeighborHex(t.coord, e);
        const nbT = incByKey.get(k(nb));
        if (!nbT || visited.has(k(nb)) || nbT.owner !== t.owner) continue;
        const back = (e + 3) % 6; // 인접 헥스에서 마주보는 변
        if (![...nbT.edges, ...(nbT.secondaryEdges ?? [])].includes(back)) continue;
        visited.add(k(nb));
        stack.push(nbT);
      }
    }
    // 구간에 이번 턴 연장(새 타일)이 하나도 없으면 전체 소유권 해제
    if (!group.some(t => t.builtTurn === currentTurn)) {
      group.forEach(t => releaseKeys.add(k(t.coord)));
    }
  }

  if (releaseKeys.size === 0) return { board, released: 0 };
  const updated = board.trackTiles.map(t =>
    releaseKeys.has(k(t.coord)) ? { ...t, owner: null } : t
  );
  return { board: { ...board, trackTiles: updated }, released: releaseKeys.size };
}

export function createInitialGameState(
  mapId: string,
  playerNames: string[],
  aiPlayers: AIPlayerConfig[] = []
): GameState {
  const mapData = getMapData(mapId);
  const boardState = mapData.createBoardState();
  // 디스플레이 칸 수는 맵의 columnMapping rowCount 합, 큐브 색 구성은 맵별(미지정 시 표준).
  const totalGoodsSlots = mapData.columnMapping.reduce((sum, m) => sum + m.rowCount, 0) || 52;
  let goodsDisplay = initializeGoodsDisplay(mapData.goodsCubeCounts, totalGoodsSlots);

  const setupRules = getMapProfile(mapId);

  // noOwnColorCubes(튜토리얼): 물품 디스플레이의 각 도시 열에 그 도시 색 큐브가
  // 놓이지 않도록 교체한다 (예: 빨강 도시 Pittsburgh 열엔 빨강 화물이 보이지 않음).
  // 빼낸 자기 색 큐브는 주머니로 보내고, 주머니의 다른 색 큐브와 맞바꾼다.
  if (setupRules.noOwnColorCubes && !setupRules.hexCubeSetup) {
    const slots = [...goodsDisplay.slots];
    const pool = [...goodsDisplay.bag];
    let slotIndex = 0;
    for (const m of mapData.columnMapping) {
      const mappedCity = m.isNewCity ? undefined : mapData.cities.find(c => c.id === m.cityId);
      // 도시(주사위 열)인데 매칭 도시가 없으면 = 마을/미사용 열(예: 마을이 된 Wheeling의 4번 열).
      // 물품이 배달될 곳이 없으므로 열을 비워 주머니로 돌려보낸다.
      if (!m.isNewCity && !mappedCity) {
        for (let i = 0; i < m.rowCount; i++) {
          const idx = slotIndex + i;
          if (slots[idx] !== null) { pool.push(slots[idx]!); slots[idx] = null; }
        }
        slotIndex += m.rowCount;
        continue;
      }
      // 신규 도시 열(A~D)은 고정 색이 없으므로 제외
      const ownColor = mappedCity?.color;
      if (ownColor) {
        for (let i = 0; i < m.rowCount; i++) {
          const idx = slotIndex + i;
          if (slots[idx] === ownColor) {
            const replIdx = pool.findIndex(c => c !== ownColor);
            if (replIdx >= 0) {
              const repl = pool[replIdx];
              pool[replIdx] = ownColor; // 자기 색은 주머니로
              slots[idx] = repl;        // 다른 색으로 교체
            }
            // 주머니에 다른 색이 없으면(극히 드묾) 그대로 둠
          }
        }
      }
      slotIndex += m.rowCount;
    }
    goodsDisplay = { slots, bag: pool };
  }

  // 헥스 큐브 맵(St. Lucia): 물품 성장이 없어 디스플레이가 불필요 →
  // 디스플레이에 깔린 큐브까지 전부 주머니로 합쳐 모든 평지/강 헥스를 채운다
  // (디스플레이 52개를 빼면 주머니가 44개뿐이라 일부 헥스가 비는 문제 방지)
  const bag = setupRules.hexCubeSetup
    ? [...goodsDisplay.bag, ...goodsDisplay.slots.filter((c): c is NonNullable<typeof c> => c !== null)]
    : [...goodsDisplay.bag];
  const displaySlots = setupRules.hexCubeSetup
    ? goodsDisplay.slots.map(() => null)
    : goodsDisplay.slots;

  // 도시에 물품 배치 (헥스 큐브 셋업 맵은 도시 큐브 없음 — 룰북 St. Lucia)
  const cityCubeCounts = setupRules.cityCubeCounts;
  // 색이 한쪽으로 몰리지 않도록 전역 색 사용량을 추적해 균형 있게 배치한다.
  // (순수 무작위면 한 도시에 같은 색 2개·특정 색 쏠림이 생겨 시각적으로 빈약함)
  const colorUsage = new Map<CubeColor, number>();
  const citiesWithCubes = boardState.cities.map((city) => {
    // Germany 외국 터미널: 무작위 큐브 1개로 수용색(color)을 정하고 그 큐브를 마커로 올린다.
    // (이 큐브는 "물품"이 아니라 수용색 표시 — 배달 대상이 아니며 물품 성장도 받지 않는다)
    if (city.isTerminal) {
      if (bag.length === 0) return { ...city, cubes: [] };
      let tIdx = bag.length - 1;
      let tUsed = Infinity;
      for (let j = bag.length - 1; j >= 0; j--) {
        const used = colorUsage.get(bag[j]) ?? 0;
        if (used < tUsed) { tUsed = used; tIdx = j; }
      }
      const cube = bag.splice(tIdx, 1)[0];
      colorUsage.set(cube, (colorUsage.get(cube) ?? 0) + 1);
      return { ...city, color: cube, cubes: [cube] };
    }
    if (setupRules.hexCubeSetup) return { ...city, cubes: [] };
    const cubes: CubeColor[] = [];
    // 도시별 초기 큐브 수 (Rust Belt: Pittsburgh/Wheeling 3, 나머지 2)
    const targetCubes = cityCubeCounts[city.id] ?? GAME_CONSTANTS.INITIAL_CUBES_PER_CITY;
    for (let i = 0; i < targetCubes; i++) {
      if (bag.length === 0) break;
      // 후보 선택: ① 이 도시에 아직 없는 색 우선(도시 내 중복 회피)
      //           ② 그 중 전역 사용량이 가장 적은 색(전체 균형)
      //  noOwnColorCubes(튜토리얼)는 도시 자기 색을 후보에서 제외.
      let bestIdx = -1;
      let bestUsed = Infinity;
      let fallbackIdx = -1; // 자기색 제약만 통과(도시 내 중복 허용)하는 차선책
      for (let j = bag.length - 1; j >= 0; j--) {
        const c = bag[j];
        if (setupRules.noOwnColorCubes && c === city.color) continue;
        if (fallbackIdx === -1) fallbackIdx = j;
        if (cubes.includes(c)) continue;
        const used = colorUsage.get(c) ?? 0;
        if (used < bestUsed) { bestUsed = used; bestIdx = j; }
      }
      const idx = bestIdx !== -1 ? bestIdx : fallbackIdx;
      if (idx === -1) break; // 배치 가능한 색이 전혀 없음(튜토리얼 극단)
      const cube = bag.splice(idx, 1)[0];
      if (cube) {
        cubes.push(cube);
        colorUsage.set(cube, (colorUsage.get(cube) ?? 0) + 1);
      }
    }
    return { ...city, cubes };
  });

  // 헥스 큐브 셋업 (공식 맵: "1 Good: Every Plain and River space")
  // 마을 헥스는 제외 — AoS 룰북 용어상 마을 칸은 'Town hex'로 plain hex와 구분됨
  const hexTilesWithCubes = setupRules.hexCubeSetup
    ? boardState.hexTiles.map((hex) => {
      if (hex.terrain !== 'plain' && hex.terrain !== 'river') return hex;
      const isTownHex = boardState.towns.some(
        t => t.coord.col === hex.coord.col && t.coord.row === hex.coord.row
      );
      if (isTownHex) return hex;
      const cube = bag.length > 0 ? bag.pop() : null;
      return { ...hex, cube: cube ?? null };
    })
    : boardState.hexTiles;

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

  // 맵별 턴 수 (튜토리얼 3턴, St. Lucia 8턴 등 - mapRegistry에서 정의)
  const maxTurns = mapData.maxTurns || (TURNS_BY_PLAYER_COUNT[playerCount] || 6);

  // 교대 선공권 맵: 첫 턴 1번 플레이어를 무작위 결정 (룰북: randomly determine the first player)
  const mapRules = getMapProfile(mapId);
  const initialPlayerOrder = [...activePlayers];
  if (mapRules.alternateTurnOrder && initialPlayerOrder.length >= 2 && Math.random() < 0.5) {
    [initialPlayerOrder[0], initialPlayerOrder[1]] = [initialPlayerOrder[1], initialPlayerOrder[0]];
  }

  return {
    // 메타 정보
    gameId: `game-${Date.now()}`,
    mapId,
    playerCount,
    activePlayers,
    maxTurns,

    // 턴 진행
    // 룰북(St. Lucia): 첫 턴 1번은 무작위 결정 (선공권 제안 없음), 이후 턴부터 교대 제안
    currentTurn: 1,
    currentPhase: 'issueShares',
    currentPlayer: initialPlayerOrder[0],
    playerOrder: initialPlayerOrder,

    // 플레이어
    players: players as Record<PlayerId, PlayerState>,

    // 보드
    board: {
      ...boardState,
      cities: citiesWithCubes,
      hexTiles: hexTilesWithCubes,
    },
    goodsDisplay: {
      slots: displaySlots,
      bag,
    },
    newCityTiles: NEW_CITY_TILES.map(tile => ({ ...tile })),  // 복사본 생성

    // 경매
    auction: null,

    // 교대 선공권 제안 (alternateTurnOrder 맵 전용)
    turnOrderOffer: null,
    // 다음 턴(2턴) 선공권 제안 차례: 첫 턴 1번이 아닌 플레이어 (엄격 교대)
    nextFirstSeatOption: mapRules.alternateTurnOrder ? (initialPlayerOrder[1] ?? null) : null,

    // 단계 상태
    phaseState: {
      builtTracksThisTurn: 0,
      maxTracksThisTurn: GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
      lastBuiltCoords: [],
      moveGoodsRound: 1,
      playerMoves: playerMoves as Record<PlayerId, boolean>,
      productionUsed: false,
      urbanizationUsed: false,
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

    // 실행 취소
    undoCount: 0,

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
  // Phase II: 플레이어 순서 경매
  // ============================================================
  placeBid: (playerId, amount) => {
    logAction('preparation', 'placeBid', { player: playerId, amount, turn: get().currentTurn });
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
    logAction('preparation', 'passBid', { player: playerId, turn: get().currentTurn });
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
        nextBidder = state.auction.highestBidder || activePlayers[0] || state.playerOrder[0];
      } else {
        // 방금 포기한 playerId의 다음 순서부터 미포기 플레이어를 찾는다.
        // (lastActedPlayer 기반 계산은 그 플레이어가 이미 포기했을 때 indexOf가 -1이 되어
        //  첫 입찰자로 잘못 되돌아가는 버그 — 5인+ 경매에서 차례가 꼬임)
        const order = state.playerOrder;
        const start = order.indexOf(playerId);
        nextBidder = activePlayers[0];
        for (let i = 1; i <= order.length; i++) {
          const cand = order[(start + i) % order.length];
          if (activePlayers.includes(cand)) { nextBidder = cand; break; }
        }
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
    logAction('preparation', 'skipBid', { player: playerId, turn: get().currentTurn });
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
  // Phase II (대체): 교대 선공권 (alternateTurnOrder 맵 전용)
  // ============================================================
  respondTurnOrderOffer: (playerId, accept) => {
    // 가드는 set 밖에서: 해결(offer가 null이 됨) 시 nextPhase 호출 여부를 판단해야 함
    const pre = get();
    if (!pre.turnOrderOffer || pre.turnOrderOffer.offerPlayer !== playerId) {
      console.warn(`[WARN] respondTurnOrderOffer: 유효하지 않은 응답 - playerId: ${playerId}`);
      return;
    }

    set((state) => {
      const offer = state.turnOrderOffer;
      if (!offer || offer.offerPlayer !== playerId) {
        return state;
      }

      const rules = getMapProfile(state.mapId);
      const others = state.activePlayers.filter(p => p !== playerId);

      // 수락: firstSeatCost 지불 후 선공
      if (accept) {
        const player = state.players[playerId];
        const cost = rules.firstSeatCost;
        if (player.cash < cost) {
          console.warn(`[WARN] respondTurnOrderOffer: 현금 부족 - ${playerId}, 필요: $${cost}, 보유: $${player.cash}`);
          return state;
        }
        return {
          players: {
            ...state.players,
            [playerId]: { ...player, cash: player.cash - cost },
          },
          playerOrder: [playerId, ...others],
          turnOrderOffer: null,
          currentPlayer: playerId,
          logs: [
            ...state.logs,
            {
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: playerId,
              action: `선공권 구매 ($${cost} 지불) - 1번 플레이어`,
              timestamp: Date.now(),
            },
          ],
        };
      }

      // 거절: 다음 플레이어에게 옵션 이전
      const declined = [...offer.declined, playerId];
      const nextOffer = state.activePlayers.find(p => !declined.includes(p));

      if (nextOffer) {
        return {
          turnOrderOffer: { ...offer, offerPlayer: nextOffer, declined },
          currentPlayer: nextOffer,
          logs: [
            ...state.logs,
            {
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: playerId,
              action: `선공권 거절 → ${state.players[nextOffer]?.name}에게 옵션 이전`,
              timestamp: Date.now(),
            },
          ],
        };
      }

      // 모두 거절: 첫 제안 대상이 무료로 선공
      const first = offer.firstOptionPlayer;
      const rest = state.activePlayers.filter(p => p !== first);
      return {
        playerOrder: [first, ...rest],
        turnOrderOffer: null,
        currentPlayer: first,
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: first,
            action: `모두 선공권 거절 → ${state.players[first]?.name} 무료 선공`,
            timestamp: Date.now(),
          },
        ],
      };
    });

    // 선공권이 해결됨(수락 또는 모두 거절) → 다음 단계로 진행
    // (이게 없으면 determinePlayerOrder에 머물러 경매 패널이 표시되는 버그)
    if (!get().turnOrderOffer) {
      get().nextPhase(); // 내부에서 scheduleAICheck 호출
      return;
    }

    // 옵션이 다음 플레이어에게 이전됨 → AI 턴 트리거만
    scheduleAICheck(get);
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

    // 이미 트랙이 있는지 확인
    const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
    if (existingTrack) {
      // 리다이렉트 가능 여부 확인
      if (!canRedirectTrack(coord, board, currentPlayer)) {
        return false;
      }
    }

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
        if (terrain === 'river') cost = GAME_CONSTANTS.RIVER_TRACK_COST;
        if (terrain === 'mountain') cost = GAME_CONSTANTS.MOUNTAIN_TRACK_COST;
      }
    }
    // Germany: Engineer 절반 비용 — 이번 턴 1회, 타일 비용에만 (마을 가닥 제외)
    let engineerDiscountApplied = false;
    if (mapProfile.engineerHalfCost && player.selectedAction === 'engineer' && !state.phaseState.engineerHalfUsed) {
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

      for (let i = 0; i < path.length; i++) {
        const coord = path[i];
        const isCity = state.board.cities.some(c => hexCoordsEqual(c.coord, coord));
        const isTown = state.board.towns.some(t => hexCoordsEqual(t.coord, coord));

        if (isCity || isTown) {
          if (inLink && currentLinkOwner) {
            // 도시/마을에 도착했으므로 이전 링크 완료, 소유자 수입 +1
            incomeChanges[currentLinkOwner] = (incomeChanges[currentLinkOwner] || 0) + 1;
          }
          // 새 링크 시작
          inLink = true;
          currentLinkOwner = null;
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

      // 주사위 번호 → 그 번호를 공유하는 모든 도시 열에서 각각 count개씩 도시로 이동
      for (const [diceStr, count] of Object.entries(diceCounts)) {
        const cols = colsByDice[Number(diceStr)];
        if (!cols) continue;
        for (const col of cols) {
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
      const bonusCityId = getMapProfile(state.mapId).bonusCityCubeId;
      if (bonusCityId && newBag.length > 0) {
        const idx = Math.floor(Math.random() * newBag.length);
        const cube = newBag.splice(idx, 1)[0];
        const bonusCity = newCities.find(c => c.id === bonusCityId);
        if (bonusCity && cube) {
          bonusCity.cubes.push(cube);
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
          phaseState: {
            ...state.phaseState,
            builtTracksThisTurn: 0,
            lastBuiltCoords: [],
            engineerHalfUsed: false, // Germany: 빌더마다 Engineer 절반 할인 재설정
            maxTracksThisTurn: state.players[nextBuilder].selectedAction === 'engineer'
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
        lastBuiltCoords: [],
        moveGoodsRound: 1,
        playerMoves: createPlayerMoves(prevState.activePlayers),
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
  // UI: 기본 선택
  // ============================================================
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
            sameColorCities: state.board.cities.filter(c => c.color === stk?.cube).map(c => ({ id: c.id, c: c.coord })),
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
        sameColorCities: state.board.cities.filter(c => c.color === cubeColor).map(c => c.id),
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

  undoLastAction: () => {
    const snap = undoSnapshots.pop();
    if (!snap) {
      set({ undoCount: 0 });
      return;
    }
    const state = get();
    set({
      board: snap.board,
      players: snap.players,
      phaseState: snap.phaseState,
      newCityTiles: snap.newCityTiles,
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

    // 건설 가능한 이웃 헥스 계산 (교체/방향전환 포함)
    const neighbors = getBuildableNeighbors(coord, state.board, currentPlayer, true);

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
    let exitDirs = getExitDirections(coord, neighbor.targetEdge, state.board);

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

    // 트랙 위 큐브 배달 (St. Lucia)
    if (sourceCityId.startsWith('track:')) {
      const destCity = state.board.cities.find(c => hexCoordsEqual(c.coord, coord));
      if (destCity) {
        state.moveTrackCube(sourceCityId.slice('track:'.length), destCity.id);
      }
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
    }
  )
);

// 디버깅용: 전역에 스토어 노출
if (typeof window !== 'undefined') {
  (window as unknown as { __GAME_STORE__: typeof useGameStore }).__GAME_STORE__ = useGameStore;
}
