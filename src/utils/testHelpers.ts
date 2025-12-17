// 테스트 헬퍼 함수
// 단위 테스트에서 게임 상태를 쉽게 생성하고 조작할 수 있는 유틸리티

import {
  GameState,
  PlayerId,
  PlayerState,
  GamePhase,
  PlayerColor,
  SpecialAction,
  HexCoord,
  TrackTile,
  CubeColor,
  BoardState,
  City,
  GAME_CONSTANTS,
  PLAYER_ID_ORDER,
  PLAYER_COLOR_ORDER,
  TURNS_BY_PLAYER_COUNT,
  NEW_CITY_TILES,
} from '@/types/game';
import { createInitialPlayerState } from './gameLogic';

// === 타입 정의 ===

export interface TestPlayerOptions {
  cash?: number;
  income?: number;
  engineLevel?: number;
  issuedShares?: number;
  selectedAction?: SpecialAction | null;
  eliminated?: boolean;
}

export interface TestGameStateOptions {
  playerCount?: number;
  playerNames?: string[];
  currentTurn?: number;
  currentPhase?: GamePhase;
  currentPlayer?: PlayerId;
  playerOverrides?: Partial<Record<PlayerId, TestPlayerOptions>>;
}

// === 플레이어 상태 생성 ===

/**
 * 테스트용 플레이어 상태 생성
 */
export function createTestPlayer(
  id: PlayerId,
  name: string,
  color: PlayerColor,
  options: TestPlayerOptions = {}
): PlayerState {
  const base = createInitialPlayerState(id, name, color);
  return {
    ...base,
    cash: options.cash ?? base.cash,
    income: options.income ?? base.income,
    engineLevel: options.engineLevel ?? base.engineLevel,
    issuedShares: options.issuedShares ?? base.issuedShares,
    selectedAction: options.selectedAction ?? base.selectedAction,
    eliminated: options.eliminated ?? base.eliminated,
  };
}

/**
 * 테스트용 플레이어 맵 생성
 */
export function createTestPlayers(
  playerCount: number,
  playerNames?: string[],
  overrides?: Partial<Record<PlayerId, TestPlayerOptions>>
): Record<PlayerId, PlayerState> {
  const names = playerNames ?? Array.from({ length: playerCount }, (_, i) => `테스트-${i + 1}`);
  const players: Partial<Record<PlayerId, PlayerState>> = {};

  for (let i = 0; i < playerCount; i++) {
    const id = PLAYER_ID_ORDER[i];
    const playerOverride = overrides?.[id] ?? {};
    players[id] = createTestPlayer(id, names[i], PLAYER_COLOR_ORDER[i], playerOverride);
  }

  return players as Record<PlayerId, PlayerState>;
}

// === 보드 상태 생성 ===

/**
 * 테스트용 빈 보드 상태 생성
 */
export function createEmptyBoard(): BoardState {
  return {
    hexTiles: [],
    trackTiles: [],
    cities: [],
    towns: [],
  };
}

/**
 * 테스트용 도시 생성
 */
export function createTestCity(
  id: string,
  name: string,
  coord: HexCoord,
  color: CubeColor,
  cubes: CubeColor[] = []
): City {
  return {
    id,
    name,
    coord,
    color,
    cubes,
  };
}

/**
 * 테스트용 트랙 타일 생성
 */
export function createTestTrack(
  coord: HexCoord,
  edges: [number, number],
  owner: PlayerId,
  options: Partial<Omit<TrackTile, 'coord' | 'edges' | 'owner'>> = {}
): TrackTile {
  return {
    id: options.id ?? `test-track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    coord,
    edges,
    owner,
    trackType: options.trackType ?? 'simple',
    ...options,
  };
}

// === 게임 상태 생성 ===

/**
 * 테스트용 최소 게임 상태 생성
 * 단위 테스트에서 필요한 부분만 오버라이드하여 사용
 */
export function createTestGameState(options: TestGameStateOptions = {}): GameState {
  const playerCount = options.playerCount ?? 2;
  const playerNames = options.playerNames ?? Array.from({ length: playerCount }, (_, i) => `테스트-${i + 1}`);
  const activePlayers = PLAYER_ID_ORDER.slice(0, playerCount);
  const players = createTestPlayers(playerCount, playerNames, options.playerOverrides);

  const playerMoves: Partial<Record<PlayerId, boolean>> = {};
  activePlayers.forEach(p => { playerMoves[p] = false; });

  return {
    // 메타 정보
    gameId: `test-game-${Date.now()}`,
    mapId: 'test',
    playerCount,
    activePlayers,
    maxTurns: TURNS_BY_PLAYER_COUNT[playerCount] ?? 6,

    // 턴 진행
    currentTurn: options.currentTurn ?? 1,
    currentPhase: options.currentPhase ?? 'issueShares',
    currentPlayer: options.currentPlayer ?? activePlayers[0],
    playerOrder: [...activePlayers],

    // 플레이어
    players,

    // 보드
    board: createEmptyBoard(),
    goodsDisplay: {
      slots: [],
      bag: [],
    },
    newCityTiles: NEW_CITY_TILES.map(tile => ({ ...tile })),

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
      buildMode: 'idle',
      sourceHex: null,
      buildableNeighbors: [],
      targetHex: null,
      entryEdge: null,
      exitDirections: [],
      complexTrackSelection: null,
      redirectTrackSelection: null,
      urbanizationMode: false,
      selectedNewCityTile: null,
      productionMode: false,
      productionCubes: [],
      selectedProductionSlots: [],
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

// === 상태 수정 헬퍼 ===

/**
 * 게임 상태에서 특정 플레이어 상태 업데이트
 */
export function updatePlayer(
  state: GameState,
  playerId: PlayerId,
  updates: Partial<PlayerState>
): GameState {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId],
        ...updates,
      },
    },
  };
}

/**
 * 게임 상태에 트랙 추가
 */
export function addTrack(
  state: GameState,
  track: TrackTile
): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      trackTiles: [...state.board.trackTiles, track],
    },
  };
}

/**
 * 게임 상태에 도시 추가
 */
export function addCity(
  state: GameState,
  city: City
): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      cities: [...state.board.cities, city],
    },
  };
}

/**
 * 게임 단계 변경
 */
export function setPhase(
  state: GameState,
  phase: GamePhase,
  currentPlayer?: PlayerId
): GameState {
  return {
    ...state,
    currentPhase: phase,
    currentPlayer: currentPlayer ?? state.currentPlayer,
  };
}

// === 어설션 헬퍼 ===

/**
 * 플레이어 현금 검증
 */
export function assertPlayerCash(
  state: GameState,
  playerId: PlayerId,
  expectedCash: number
): boolean {
  const actual = state.players[playerId]?.cash;
  if (actual !== expectedCash) {
    console.error(`[ASSERT FAIL] Player ${playerId} cash: expected ${expectedCash}, got ${actual}`);
    return false;
  }
  return true;
}

/**
 * 플레이어 수입 검증
 */
export function assertPlayerIncome(
  state: GameState,
  playerId: PlayerId,
  expectedIncome: number
): boolean {
  const actual = state.players[playerId]?.income;
  if (actual !== expectedIncome) {
    console.error(`[ASSERT FAIL] Player ${playerId} income: expected ${expectedIncome}, got ${actual}`);
    return false;
  }
  return true;
}

/**
 * 현재 단계 검증
 */
export function assertPhase(
  state: GameState,
  expectedPhase: GamePhase
): boolean {
  if (state.currentPhase !== expectedPhase) {
    console.error(`[ASSERT FAIL] Phase: expected ${expectedPhase}, got ${state.currentPhase}`);
    return false;
  }
  return true;
}
