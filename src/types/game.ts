// Age of Steam 게임 타입 정의

// === 기본 타입 ===
export type PlayerId = 'player1' | 'player2';

export type CityColor = 'red' | 'blue' | 'yellow' | 'purple' | 'black';
export type CubeColor = CityColor;

// 2인용 플레이어 색상
export type PlayerColor = 'orange' | 'blue';

// 7가지 특수 행동
export type SpecialAction =
  | 'firstMove'      // 먼저 이동
  | 'firstBuild'     // 먼저 건설
  | 'engineer'       // 엔지니어 (4개 트랙)
  | 'locomotive'     // 기관차 (+1 엔진)
  | 'urbanization'   // 도시화
  | 'production'     // 생산
  | 'turnOrder';     // 턴 순서 패스

// 10단계 + 게임 종료
export type GamePhase =
  | 'issueShares'           // I. 주식 발행
  | 'determinePlayerOrder'  // II. 플레이어 순서 결정
  | 'selectActions'         // III. 행동 선택
  | 'buildTrack'            // IV. 트랙 건설
  | 'moveGoods'             // V. 물품 이동
  | 'collectIncome'         // VI. 수입 수집
  | 'payExpenses'           // VII. 비용 지불
  | 'incomeReduction'       // VIII. 수입 감소
  | 'goodsGrowth'           // IX. 물품 성장
  | 'advanceTurn'           // X. 턴 마커 전진
  | 'gameOver';             // 게임 종료

// === 헥스 그리드 타입 ===
export interface HexCoord {
  col: number;
  row: number;
}

// 트랙 타일 (엣지 연결)
export interface TrackTile {
  id: string;
  coord: HexCoord;
  edges: [number, number];  // 연결된 두 엣지 (0-5)
  owner: PlayerId | null;
}

// 도시
export interface City {
  id: string;              // 'P', 'C', 'O', 'W', 'I'
  name: string;
  coord: HexCoord;
  color: CityColor;
  cubes: CubeColor[];      // 현재 배치된 물품
}

// 마을
export interface Town {
  id: string;
  coord: HexCoord;
  newCityColor: CityColor | null;  // 도시화된 경우 색상
  cubes: CubeColor[];              // 마을 위 물품 (도시화 전)
}

// 지형 타입
export type TerrainType = 'plain' | 'river' | 'mountain' | 'lake';

// 헥스 타일
export interface HexTile {
  coord: HexCoord;
  terrain: TerrainType;
}

// === 플레이어 상태 ===
export interface PlayerState {
  id: PlayerId;
  name: string;
  color: PlayerColor;
  cash: number;
  income: number;              // 수입 트랙 위치 (-10 ~ 50)
  engineLevel: number;         // 기관차 레벨 (1-6)
  issuedShares: number;        // 발행한 주식 수 (2 시작)
  selectedAction: SpecialAction | null;
  turnOrderPassUsed: boolean;  // Turn Order 패스 사용 여부
}

// === 게임 보드 상태 ===
export interface BoardState {
  cities: City[];
  towns: Town[];
  trackTiles: TrackTile[];     // 모든 트랙 (소유자 정보 포함)
  hexTiles: HexTile[];         // 모든 헥스 타일 (지형 정보)
}

// === 물품 디스플레이 ===
export interface GoodsDisplay {
  slots: (CubeColor | null)[];  // 52칸 물품 디스플레이
  bag: CubeColor[];             // 주머니 속 물품
}

// === 턴 순서 경매 ===
export interface AuctionState {
  currentBidder: PlayerId | null;
  highestBid: number;
  highestBidder: PlayerId | null;
  passedPlayers: PlayerId[];
  bids: Record<PlayerId, number>;
}

// === 현재 단계 임시 상태 ===
export interface PhaseState {
  // Build Track 단계
  builtTracksThisTurn: number;
  maxTracksThisTurn: number;  // 3 또는 4 (Engineer)

  // Move Goods 단계
  moveGoodsRound: 1 | 2;
  playerMoves: Record<PlayerId, boolean>;  // 각 플레이어가 이번 라운드에 이동했는지

  // 기타 플래그
  productionUsed: boolean;
  locomotiveUsed: boolean;
}

// === UI 상태 ===
export type BuildMode = 'idle' | 'source_selected' | 'target_selected';

export interface BuildableNeighbor {
  coord: HexCoord;
  sourceEdge: number;  // 출발점에서 나가는 엣지
  targetEdge: number;  // 대상 헥스로 들어가는 엣지
}

// 트랙 출구 방향 (targetHex에서 나가는 방향)
export interface ExitDirection {
  exitEdge: number;       // 나가는 엣지 번호
  neighborCoord: HexCoord; // 해당 방향의 이웃 헥스 좌표
}

export interface UIState {
  selectedHex: HexCoord | null;
  selectedCube: { cityId: string; cubeIndex: number } | null;
  previewTrack: { coord: HexCoord; edges: [number, number] } | null;
  highlightedHexes: HexCoord[];
  movePath: HexCoord[];  // 물품 이동 경로

  // 트랙 건설 UI 상태
  buildMode: BuildMode;
  sourceHex: HexCoord | null;                    // 선택된 연결점 (도시 또는 기존 트랙)
  buildableNeighbors: BuildableNeighbor[];       // 건설 가능한 이웃 헥스 목록
  targetHex: HexCoord | null;                    // 선택된 대상 헥스
  entryEdge: number | null;                      // 대상 헥스로 들어오는 엣지
  exitDirections: ExitDirection[];               // 나갈 수 있는 방향들
}

// === 게임 로그 ===
export interface GameLog {
  turn: number;
  phase: GamePhase;
  player: PlayerId;
  action: string;
  timestamp: number;
}

// === 전체 게임 상태 ===
export interface GameState {
  // 메타 정보
  gameId: string;
  mapId: string;
  maxTurns: number;           // 2인: 8턴

  // 턴 진행
  currentTurn: number;
  currentPhase: GamePhase;
  currentPlayer: PlayerId;
  playerOrder: PlayerId[];    // 현재 턴 플레이어 순서

  // 플레이어
  players: Record<PlayerId, PlayerState>;

  // 보드
  board: BoardState;
  goodsDisplay: GoodsDisplay;

  // 경매 (플레이어 순서 결정 단계)
  auction: AuctionState | null;

  // 현재 단계 관련 임시 상태
  phaseState: PhaseState;

  // UI 상태
  ui: UIState;

  // 게임 로그
  logs: GameLog[];

  // 게임 결과
  winner: PlayerId | null;
  finalScores: Record<PlayerId, number> | null;
}

// === 게임 액션 타입 ===
export type GameAction =
  | { type: 'INIT_GAME'; mapId: string; player1Name: string; player2Name: string }
  | { type: 'ISSUE_SHARE'; playerId: PlayerId; amount: number }
  | { type: 'PLACE_BID'; playerId: PlayerId; amount: number }
  | { type: 'PASS_BID'; playerId: PlayerId }
  | { type: 'SELECT_ACTION'; playerId: PlayerId; action: SpecialAction }
  | { type: 'BUILD_TRACK'; playerId: PlayerId; coord: HexCoord; edges: [number, number] }
  | { type: 'MOVE_GOODS'; playerId: PlayerId; cubeColor: CubeColor; path: HexCoord[] }
  | { type: 'UPGRADE_ENGINE'; playerId: PlayerId }
  | { type: 'NEXT_PHASE' }
  | { type: 'END_TURN' }
  | { type: 'SELECT_HEX'; coord: HexCoord | null }
  | { type: 'SELECT_CUBE'; cityId: string; cubeIndex: number }
  | { type: 'CLEAR_SELECTION' };

// === 색상 상수 ===
export const CITY_COLORS: Record<CityColor, string> = {
  red: '#C62828',
  blue: '#1565C0',
  yellow: '#F9A825',
  purple: '#8E24AA',
  black: '#455A64',
};

export const PLAYER_COLORS: Record<PlayerColor, string> = {
  orange: '#FF6D00',
  blue: '#2979FF',
};

export const CUBE_COLORS: Record<CubeColor, string> = {
  red: '#E53935',
  blue: '#1E88E5',
  yellow: '#FFB300',
  purple: '#8E24AA',
  black: '#455A64',
};

// === 게임 상수 ===
export const GAME_CONSTANTS = {
  // 시작 값
  STARTING_SHARES: 2,
  STARTING_CASH: 10,
  STARTING_ENGINE: 1,
  STARTING_INCOME: 0,

  // 제한
  MAX_ENGINE: 6,
  MAX_SHARES: 15,
  MAX_INCOME: 50,
  MIN_INCOME: -10,

  // 비용
  SHARE_VALUE: 5,
  PLAIN_TRACK_COST: 2,
  RIVER_TRACK_COST: 3,
  MOUNTAIN_TRACK_COST: 4,

  // 턴당 트랙
  NORMAL_TRACK_LIMIT: 3,
  ENGINEER_TRACK_LIMIT: 4,

  // 2인 게임 턴 수
  TWO_PLAYER_TURNS: 8,

  // 수입 감소 테이블
  INCOME_REDUCTION: [
    { min: 50, max: 999, reduction: 10 },
    { min: 41, max: 49, reduction: 8 },
    { min: 31, max: 40, reduction: 6 },
    { min: 21, max: 30, reduction: 4 },
    { min: 11, max: 20, reduction: 2 },
    { min: -999, max: 10, reduction: 0 },
  ],
};

// === 게임 단계 정보 ===
export const PHASE_INFO: Record<GamePhase, { name: string; description: string }> = {
  issueShares: {
    name: 'I. 주식 발행',
    description: '주식을 발행하여 현금 $5를 받습니다.',
  },
  determinePlayerOrder: {
    name: 'II. 플레이어 순서',
    description: '경매를 통해 다음 턴의 플레이어 순서를 결정합니다.',
  },
  selectActions: {
    name: 'III. 행동 선택',
    description: '7가지 특수 행동 중 하나를 선택합니다.',
  },
  buildTrack: {
    name: 'IV. 트랙 건설',
    description: '최대 3개의 트랙 타일을 배치합니다.',
  },
  moveGoods: {
    name: 'V. 물품 이동',
    description: '물품 큐브를 배달하여 수입을 올립니다.',
  },
  collectIncome: {
    name: 'VI. 수입 수집',
    description: '수입 트랙에 표시된 금액을 받습니다.',
  },
  payExpenses: {
    name: 'VII. 비용 지불',
    description: '주식 + 엔진 레벨만큼 비용을 지불합니다.',
  },
  incomeReduction: {
    name: 'VIII. 수입 감소',
    description: '수입 구간에 따라 수입이 감소합니다.',
  },
  goodsGrowth: {
    name: 'IX. 물품 성장',
    description: '주사위를 굴려 새 물품을 배치합니다.',
  },
  advanceTurn: {
    name: 'X. 턴 전진',
    description: '다음 턴으로 넘어갑니다.',
  },
  gameOver: {
    name: '게임 종료',
    description: '최종 점수를 계산합니다.',
  },
};

// === 특수 행동 정보 ===
export const ACTION_INFO: Record<SpecialAction, { name: string; description: string }> = {
  firstMove: {
    name: '먼저 이동',
    description: '물품 이동 단계에서 플레이어 순서와 관계없이 먼저 이동합니다.',
  },
  firstBuild: {
    name: '먼저 건설',
    description: '트랙 건설 단계에서 플레이어 순서와 관계없이 먼저 건설합니다.',
  },
  engineer: {
    name: '엔지니어',
    description: '이번 턴에 트랙을 3개 대신 4개 배치할 수 있습니다.',
  },
  locomotive: {
    name: '기관차',
    description: '즉시 엔진 레벨을 1 올립니다. (최대 6)',
  },
  urbanization: {
    name: '도시화',
    description: '트랙 건설 전에 마을에 신규 도시 타일을 배치할 수 있습니다.',
  },
  production: {
    name: '생산',
    description: '물품 성장 단계에서 물품 큐브 2개를 추가로 배치합니다.',
  },
  turnOrder: {
    name: '턴 순서',
    description: '다음 플레이어 순서 결정 시 한 번 패스할 수 있습니다.',
  },
};
