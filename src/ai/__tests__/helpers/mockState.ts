/**
 * AI 전략 테스트용 Mock 데이터 헬퍼
 */

import {
  GameState,
  BoardState,
  City,
  TrackTile,
  HexTile,
  HexCoord,
  CubeColor,
  CityColor,
  PlayerId,
  PlayerState,
  GAME_CONSTANTS,
} from '@/types/game';

/**
 * 테스트용 도시 생성
 */
export function createMockCity(
  id: string,
  color: CityColor,
  coord: HexCoord,
  cubes: CubeColor[] = []
): City {
  return {
    id,
    name: id,
    coord,
    color,
    cubes,
  };
}

/**
 * 테스트용 트랙 타일 생성
 */
export function createMockTrack(
  coord: HexCoord,
  edges: [number, number],
  owner: PlayerId | null = null
): TrackTile {
  return {
    id: `track-${coord.col}-${coord.row}`,
    coord,
    edges,
    owner,
    trackType: 'simple',
  };
}

/**
 * 테스트용 헥스 타일 생성
 */
export function createMockHexTile(
  coord: HexCoord,
  terrain: 'plain' | 'river' | 'mountain' | 'lake' = 'plain'
): HexTile {
  return { coord, terrain };
}

/**
 * 테스트용 플레이어 생성
 */
export function createMockPlayer(
  id: PlayerId,
  overrides?: Partial<PlayerState>
): PlayerState {
  return {
    id,
    name: id,
    color: 'orange',
    cash: GAME_CONSTANTS.STARTING_CASH,
    income: GAME_CONSTANTS.STARTING_INCOME,
    engineLevel: GAME_CONSTANTS.STARTING_ENGINE,
    issuedShares: GAME_CONSTANTS.STARTING_SHARES,
    selectedAction: null,
    turnOrderPassUsed: false,
    eliminated: false,
    isAI: true,
    ...overrides,
  };
}

/**
 * 테스트용 보드 생성 (Tutorial 맵 기반 간소화)
 */
export function createMockBoard(
  cities?: City[],
  tracks?: TrackTile[]
): BoardState {
  const defaultCities: City[] = cities || [
    createMockCity('Pittsburgh', 'yellow', { col: 4, row: 0 }),
    createMockCity('Cleveland', 'blue', { col: 1, row: 1 }),
    createMockCity('Columbus', 'red', { col: 2, row: 3 }),
    createMockCity('Cincinnati', 'purple', { col: 0, row: 4 }),
  ];

  // 기본 헥스 타일 (3x5 그리드)
  const hexTiles: HexTile[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      // 도시 위치가 아닌 곳만 헥스 타일 추가
      const isCity = defaultCities.some(
        c => c.coord.col === col && c.coord.row === row
      );
      if (!isCity) {
        hexTiles.push(createMockHexTile({ col, row }));
      }
    }
  }

  return {
    cities: defaultCities,
    towns: [],
    trackTiles: tracks || [],
    hexTiles,
  };
}

/**
 * 최소 게임 상태 생성
 */
export function createMockGameState(
  overrides?: Partial<GameState>
): GameState {
  const player1 = createMockPlayer('player1', { name: 'AI Player 1', isAI: true });
  const player2 = createMockPlayer('player2', { name: 'AI Player 2', isAI: true, color: 'blue' });

  const defaultState: GameState = {
    gameId: 'test-game',
    mapId: 'tutorial',
    playerCount: 2,
    activePlayers: ['player1', 'player2'],
    maxTurns: 8,

    currentTurn: 1,
    currentPhase: 'buildTrack',
    currentPlayer: 'player1',
    playerOrder: ['player1', 'player2'],

    players: {
      player1,
      player2,
      player3: createMockPlayer('player3'),
      player4: createMockPlayer('player4'),
      player5: createMockPlayer('player5'),
      player6: createMockPlayer('player6'),
    },

    board: createMockBoard(),
    goodsDisplay: {
      slots: Array(52).fill(null),
      bag: [],
    },
    newCityTiles: [],

    auction: null,
    phaseState: {
      builtTracksThisTurn: 0,
      maxTracksThisTurn: GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
      moveGoodsRound: 1,
      playerMoves: {
        player1: false,
        player2: false,
        player3: false,
        player4: false,
        player5: false,
        player6: false,
      },
      productionUsed: false,
      locomotiveUsed: false,
    },

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

    logs: [],
    winner: null,
    finalScores: null,
  };

  return {
    ...defaultState,
    ...overrides,
    players: {
      ...defaultState.players,
      ...(overrides?.players || {}),
    },
    board: {
      ...defaultState.board,
      ...(overrides?.board || {}),
    },
  };
}

/**
 * 특정 도시에 물품 추가
 */
export function addCubesToCity(
  state: GameState,
  cityId: string,
  cubes: CubeColor[]
): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      cities: state.board.cities.map(city =>
        city.id === cityId
          ? { ...city, cubes: [...city.cubes, ...cubes] }
          : city
      ),
    },
  };
}

/**
 * 트랙 추가
 */
export function addTrack(
  state: GameState,
  coord: HexCoord,
  edges: [number, number],
  owner: PlayerId
): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      trackTiles: [
        ...state.board.trackTiles,
        createMockTrack(coord, edges, owner),
      ],
    },
  };
}

/**
 * 플레이어 현금 설정
 */
export function setPlayerCash(
  state: GameState,
  playerId: PlayerId,
  cash: number
): GameState {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId],
        cash,
      },
    },
  };
}

/**
 * 플레이어 엔진 레벨 설정
 */
export function setPlayerEngine(
  state: GameState,
  playerId: PlayerId,
  engineLevel: number
): GameState {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId],
        engineLevel,
      },
    },
  };
}

/**
 * 상대 플레이어 트랙 추가
 */
export function addOpponentTrack(
  state: GameState,
  coord: HexCoord,
  edges: [number, number],
  opponentId: PlayerId
): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      trackTiles: [
        ...state.board.trackTiles,
        createMockTrack(coord, edges, opponentId),
      ],
    },
  };
}

/**
 * 발행 주식 설정
 */
export function setPlayerShares(
  state: GameState,
  playerId: PlayerId,
  issuedShares: number
): GameState {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId],
        issuedShares,
      },
    },
  };
}

/**
 * 빌드 트랙 페이즈 상태 설정
 */
export function setPhaseState(
  state: GameState,
  builtTracksThisTurn: number,
  maxTracksThisTurn: number = GAME_CONSTANTS.NORMAL_TRACK_LIMIT
): GameState {
  return {
    ...state,
    phaseState: {
      ...state.phaseState,
      builtTracksThisTurn,
      maxTracksThisTurn,
    },
  };
}
