// Age of Steam 게임 타입 정의

// === 기본 타입 ===
// 최대 6인 플레이어 지원
export type PlayerId = 'player1' | 'player2' | 'player3' | 'player4' | 'player5' | 'player6';

export type CityColor = 'red' | 'blue' | 'yellow' | 'purple' | 'black';
/** 물품 큐브 색 — 도시 색 + 면화(white, Southern US 전용).
 *  면화는 도시 색이 될 수 없고, 4대 항구(board.cottonPorts)에서만 배달이 끝난다. */
export type CubeColor = CityColor | 'white';

// 6인용 플레이어 색상 (룰북 기준)
export type PlayerColor = 'orange' | 'blue' | 'green' | 'pink' | 'gray' | 'yellow';

// 플레이어 ID 순서 배열
export const PLAYER_ID_ORDER: PlayerId[] = [
  'player1', 'player2', 'player3', 'player4', 'player5', 'player6'
];

// 플레이어 색상 순서 배열
export const PLAYER_COLOR_ORDER: PlayerColor[] = [
  'orange', 'blue', 'green', 'pink', 'gray', 'yellow'
];

// 플레이어 수에 따른 턴 수 (룰북 기준)
export const TURNS_BY_PLAYER_COUNT: Record<number, number> = {
  2: 8,
  3: 7,
  4: 6,
  5: 7,
  6: 6,
};

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

// 트랙 타일 유형
export type TrackType = 'simple' | 'crossing' | 'coexist';

// 트랙 타일 (엣지 연결)
export interface TrackTile {
  id: string;
  coord: HexCoord;
  edges: [number, number];  // 연결된 두 엣지 (0-5)
  owner: PlayerId | null;
  trackType: TrackType;           // 트랙 유형 (기본: simple)
  secondaryEdges?: [number, number];  // 복합 트랙의 두 번째 경로 (crossing, coexist)
  secondaryOwner?: PlayerId | null;   // 두 번째 경로 소유자
  /** 트랙 위 물품 큐브 (St. Lucia — 미완성 링크여도 배달 가능) */
  cube?: CubeColor | null;
  /** 건설된 턴 (이번 턴에 지은 트랙 시각 표시용) */
  builtTurn?: number;
}

// 도시
export interface City {
  id: string;              // 'P', 'C', 'O', 'W', 'I'
  name: string;
  coord: HexCoord;
  color: CityColor;
  cubes: CubeColor[];      // 현재 배치된 물품
  /** 외국 터미널(Germany): 통과 불가·물품 생산 안 함. 셋업때 무작위 큐브1로 수용색(color)이 정해진다.
   *  터미널 위 큐브는 "물품"이 아니라 수용색 마커이며 배달 대상이 아니다. */
  isTerminal?: boolean;
  /** Western US: 동/서 지역 분류 — 동↔서 배달 보너스 + 대륙횡단 연결 판정.
   *  'west'/'east'는 서부/동부 시작 도시, 미지정은 중앙 도시(Denver/SLC, 트랙 시작 불가). */
  region?: 'east' | 'west';
}

// 마을
export interface Town {
  id: string;
  coord: HexCoord;
  newCityColor: CityColor | null;  // 도시화된 경우 색상
  cubes: CubeColor[];              // 마을 위 물품 (도시화 전)
}

// 지형 타입
export type TerrainType = 'plain' | 'river' | 'mountain' | 'swamp' | 'lake';

// 헥스 타일
export interface HexTile {
  coord: HexCoord;
  terrain: TerrainType;
  /** 헥스 위 물품 큐브 (St. Lucia 셋업 — 건설 시 트랙 위로 이동) */
  cube?: CubeColor | null;
  /** 헥스별 고정 건설 비용(Germany €6~€12). 지정되면 지형별 기본 비용을 무시하고 이 값을 쓴다.
   *  (도시-도시 직결 링크는 별도 BoardState.directLinks로 표현 — fixedCost와 무관) */
  fixedCost?: number;
  /** 강줄기가 지나는 두 변(면) 번호 [시작면, 끝면] (0=E,1=SE,2=SW,3=W,4=NW,5=NE).
   *  지정되면 강을 이 두 면 사이로 그린다 — 강이 옆 도시 쪽 면을 향하게 해 도시를 관통/연결시킬 때 쓴다.
   *  미지정이면 인접한 강 타일끼리 자동 연결(기본). 맵 데이터로 강 방향을 적는 칸이라 맵별 코드 분기가 없다. */
  riverEdges?: [number, number];
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
  // Turn Order 액션은 phase III(행동 선택)에서 고르지만 효과는 "다음 턴" phase II(경매)의
  // 무탈락 패스 1회다. selectedAction은 턴 롤오버 때 지워지므로, 롤오버 시 "직전 턴에
  // turnOrder를 골랐는지"를 이 지속 플래그로 넘겨받아 다음 턴 경매에서 판정한다.
  turnOrderPassAvailable: boolean;  // 이번 턴 경매에 쓸 Turn Order 패스 보유 여부
  turnOrderPassUsed: boolean;  // 이번 경매에서 패스를 이미 썼는지 (롤오버 시 리셋)
  eliminated: boolean;         // 파산으로 탈락 여부
  isAI: boolean;               // AI 플레이어 여부
  /** Western US: 이 플레이어의 철도가 대륙횡단(서부 시작도시↔동부 시작도시)을 달성했는지.
   *  달성 시 연속성 강제(분리 구간 금지) 해제. 다른 맵에서는 undefined. */
  transcontinental?: boolean;
}

// === 게임 보드 상태 ===
export interface BoardState {
  cities: City[];
  towns: Town[];
  trackTiles: TrackTile[];     // 모든 트랙 (소유자 정보 포함)
  hexTiles: HexTile[];         // 모든 헥스 타일 (지형 정보)
  /** 마을 안 철길 가닥 (원→변). 노선이 마을에 연결될 때 함께 건설되며 건설 1회로 카운트 */
  townSpurs?: TownSpur[];
  /** 인접 도시 간 직접 링크(Germany: Essen/Dortmund↔Düsseldorf/Köln $2).
   *  보드에서 변을 공유하는 두 도시를 사이 헥스 없이 직접 잇는 특수 링크. owner가 있으면 건설된 완성 링크. */
  directLinks?: DirectLink[];
  /** 한국(Korea): 도시에 고정색이 없고, 도시의 "수요색" = 현재 놓인 큐브들의 색.
   *  true면 배달 목적지/통과 판정이 city.color 대신 city.cubes로 결정된다 (cityAcceptsCube 헬퍼 참조).
   *  빈 도시는 수요 없음. 비-한국 맵은 미설정(falsy)이라 기존 city.color 동작 그대로. */
  dynamicCityColors?: boolean;
  /** 철도 건설 불가 경계 변 — 두 인접 헥스의 공유 변을 막아 그 변으로는 트랙을 잇지 못한다(한국 산맥 등).
   *  렌더는 지도 외곽선의 2배 굵기 실선으로 표시. (a,b 순서 무관) */
  blockedEdges?: { a: HexCoord; b: HexCoord }[];
  /** 남부 미국(Southern US): 면화(흰 큐브)의 배달 종착 항구 도시 id 목록.
   *  흰 큐브는 이 도시들에서만 배달이 끝난다 (cityAcceptsCube 헬퍼 참조). 비-남부 맵은 미설정. */
  cottonPorts?: string[];
}

/** 도시-도시 직접 링크 (사이 헥스 없이 인접한 두 도시를 잇는 특수 트랙) */
export interface DirectLink {
  cityA: string;           // 도시 id
  cityB: string;           // 도시 id
  cost: number;            // 건설 비용 ($)
  owner: PlayerId | null;  // 건설한 플레이어 (null=미건설)
  builtTurn?: number;
}

/** 마을 안 철길 가닥: 마을 원에서 특정 변까지. 실제 건설물 (비용/카운트 발생) */
export interface TownSpur {
  id: string;
  townCoord: HexCoord;
  edge: number;            // 가닥이 닿는 마을 헥스의 변 (0~5)
  owner: PlayerId;
  builtTurn?: number;      // 이번 턴 건설 표시용
}

// === 물품 디스플레이 ===
export interface GoodsDisplay {
  slots: (CubeColor | null)[];  // 52칸 물품 디스플레이
  bag: CubeColor[];             // 주머니 속 물품
}

// 물품 디스플레이 열 식별자.
// 맵마다 열 구성이 다르다 — Tutorial은 '1'~'6'(주사위 번호) + 'A'~'D'(신규 도시)지만,
// Rust Belt처럼 도시가 많아 여러 도시가 한 주사위 번호를 공유하는 맵은 도시별 고유 열이
// 필요하므로 string으로 일반화한다 (열↔주사위 번호 매핑은 GoodsColumnMapping.diceNumber).
export type GoodsColumnId = string;

// 열-도시 매핑 (맵별로 다름)
export interface GoodsColumnMapping {
  columnId: GoodsColumnId;
  cityId: string;           // 해당 열이 가리키는 도시 ID
  isNewCity: boolean;       // 신규 도시 열인지
  rowCount: number;         // 해당 열의 칸 수
  // 이 열이 물품을 보충받는 주사위 번호(1-6). 여러 열이 같은 번호를 공유할 수 있다
  // (Rust Belt: 12도시가 6번호를 2개씩). 신규 도시 열은 주사위로 보충되지 않아 undefined.
  // (지정 안 하면 columnId를 숫자로 해석 — Tutorial '1'~'6' 하위 호환)
  diceNumber?: number;
}

// 물품 디스플레이 설정
export const GOODS_DISPLAY_CONFIG = {
  TOTAL_SLOTS: 52,
  COLUMNS: ['1', '2', '3', '4', '5', '6', 'A', 'B', 'C', 'D'] as GoodsColumnId[],
  ROWS_PER_COLUMN: [6, 6, 6, 6, 6, 6, 4, 4, 4, 4],  // 총 52칸
};

// === 교대 선공권 (St. Lucia 등 alternateTurnOrder 맵) ===
// 경매 대신: 제안받은 플레이어가 $5를 내고 선공하거나 거절 →
// 상대에게 옵션이 넘어가고, 둘 다 거절하면 첫 제안자가 무료로 선공
export interface TurnOrderOfferState {
  offerPlayer: PlayerId;       // 현재 선공권 제안을 받은 플레이어
  firstOptionPlayer: PlayerId; // 이번 턴 첫 제안 대상 (모두 거절 시 무료 선공)
  declined: PlayerId[];        // 거절한 플레이어들
}

// === 턴 순서 경매 ===
export interface AuctionState {
  currentBidder: PlayerId | null;
  highestBid: number;
  highestBidder: PlayerId | null;
  passedPlayers: PlayerId[];
  bids: Record<PlayerId, number>;
  lastActedPlayer: PlayerId | null;  // Turn Order 패스용 - 마지막 행동 플레이어
}

// === 현재 단계 임시 상태 ===
export interface PhaseState {
  // Build Track 단계
  builtTracksThisTurn: number;
  maxTracksThisTurn: number;  // 3 또는 4 (Engineer)
  lastBuiltCoords: HexCoord[];  // 이번 턴에 건설한 트랙 좌표 순서

  // Move Goods 단계
  moveGoodsRound: 1 | 2;
  playerMoves: Record<PlayerId, boolean>;  // 각 플레이어가 이번 라운드에 이동했는지
  // 이번 턴에 엔진 업그레이드를 이미 했는지 — 2 move round 통틀어 1회만 허용(룰북). playerMoves는
  // 라운드마다 리셋되므로 별도 턴 단위 플래그가 필요하다(없으면 라운드1·2 둘 다 엔진업되던 버그).
  engineUpgradedThisTurn: Record<PlayerId, boolean>;

  // 기타 플래그
  productionUsed: boolean;
  // Urbanization으로 이번 턴 신규 도시를 배치했는지 (AI 중복 배치 방지)
  urbanizationUsed: boolean;
  locomotiveUsed: boolean;
  /** Germany: Engineer 절반 비용 할인을 이번 턴에 이미 1회 사용했는지 (Engineer는 트랙 1개만 절반) */
  engineerHalfUsed?: boolean;
}

// === AI 실행 동기화 ===

/**
 * AI 실행 큐 상태
 * isAIThinking 대신 사용하여 레이스 컨디션 방지
 */
export interface AIExecutionQueue {
  pending: boolean;        // AI 실행 중 여부
  executionId: number;     // 현재 실행의 고유 ID (중복 방지)
}

/**
 * AI 실행 컨텍스트
 * setTimeout 콜백에서 사용할 캡처된 상태
 */
export interface CapturedAIContext {
  currentPlayer: PlayerId;
  currentPhase: GamePhase;
  phaseState: PhaseState;
  executionId: number;
}

/**
 * 물품 이동 애니메이션 컨텍스트
 * 애니메이션 완료 시 사용할 캡처된 상태
 */
export interface MovingCubeContext {
  playerId: PlayerId;        // 이동을 수행한 플레이어
  phase: GamePhase;          // 이동 시작 시 단계
  moveRound: 1 | 2;          // 이동 라운드
  // 트랙 큐브 배달(St. Lucia): 정의되어 있으면 링크 수입 대신 구간 소유자 +1
  trackCubeSectionOwner?: PlayerId | null;
}

// === UI 상태 ===
export type BuildMode = 'idle' | 'source_selected' | 'target_selected' | 'redirect_selected';

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

  // 복합 트랙 선택 UI 상태
  complexTrackSelection: {
    coord: HexCoord;
    newEdges: [number, number];
  } | null;

  // 방향 전환 UI 상태
  redirectTrackSelection: {
    coord: HexCoord;
    connectedEdge: number;     // 연결된 엣지 (유지됨)
    currentOpenEdge: number;   // 현재 열린 엣지
    availableEdges: number[];  // 변경 가능한 엣지들
  } | null;

  // 도시화 UI 상태
  urbanizationMode: boolean;          // 도시화 모드 활성화 여부
  selectedNewCityTile: NewCityTileId | null;  // 선택된 신규 도시 타일

  // Production UI 상태
  productionMode: boolean;            // 생산 모드 활성화 여부
  productionCubes: CubeColor[];       // 주머니에서 뽑은 큐브들
  selectedProductionSlots: number[];  // 선택된 빈 칸 인덱스

  // 물품 이동 애니메이션 상태
  movingCube: {
    color: CubeColor;
    path: HexCoord[];
    currentIndex: number;
    context: MovingCubeContext;  // 캡처된 실행 컨텍스트
  } | null;
  reachableDestinations: HexCoord[];             // 이동 가능한 목적지 도시들
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
  playerCount: number;        // 현재 게임의 플레이어 수 (2-6)
  activePlayers: PlayerId[];  // 활성 플레이어 목록
  maxTurns: number;           // 플레이어 수에 따라 결정

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
  newCityTiles: NewCityTile[];  // 신규 도시 타일 사용 상태

  // 경매 (플레이어 순서 결정 단계)
  auction: AuctionState | null;

  // 교대 선공권 제안 (alternateTurnOrder 맵 전용, 그 외 항상 null)
  turnOrderOffer: TurnOrderOfferState | null;

  // 다음 턴 선공권 제안 차례 (alternateTurnOrder 맵 전용 — 룰북: 차례는 두 플레이어 간 엄격 교대)
  nextFirstSeatOption: PlayerId | null;

  // 현재 단계 관련 임시 상태
  phaseState: PhaseState;

  // UI 상태
  ui: UIState;

  // 게임 로그
  logs: GameLog[];

  // 실행 취소 가능한 행동 수 (스냅샷은 스토어 모듈에 보관 — 단계/차례 전환 시 0)
  undoCount: number;

  // 게임 결과
  winner: PlayerId | null;
  finalScores: Record<PlayerId, number> | null;

  /** Western US: 대륙횡단 연결 보너스($4/$2)가 이미 1회 지급됐는지 (보드 전체 1회). */
  transcontinentalAwarded?: boolean;

  /**
   * Western US: 서부↔동부 시작도시가 막 연결된 순간의 알림 이벤트.
   * 보너스 수령자/연속성 해제 플레이어를 팝업으로 보여주기 위한 1회성 상태.
   * 모달을 닫으면 null로 초기화 (dismissTranscontinental).
   */
  transcontinentalEvent?: TranscontinentalEvent | null;

  /**
   * 직전 수입 감소(Phase VIII)에서 각 플레이어가 잃은 수입량 (playerId → 감소량, >0만).
   * "수입이 갑자기 줄었다"를 PlayerPanel에 "-N (수익 감소)" 배지로 알리는 용도.
   * 다음 턴 수입 수집(collectIncome) 때 초기화된다.
   */
  incomeReductions?: Partial<Record<PlayerId, number>> | null;
}

/** 대륙횡단 연결 순간을 사람 플레이어에게 알리는 팝업 데이터. */
export interface TranscontinentalEvent {
  /** 보드 전체 최초 연결 보너스 수령자 (없으면 빈 배열 — 연속성 해제만 발생). */
  bonusRecipients: { playerId: PlayerId; name: string; amount: number }[];
  /** 이번 연결로 "한 줄 연속 건설" 규칙이 해제된 플레이어 (자기 철도로 서↔동 연결). */
  unlockedPlayers: { playerId: PlayerId; name: string }[];
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
  orange: '#FF6D00',  // 주황
  blue: '#2979FF',    // 파랑
  green: '#40a060',   // 초록
  pink: '#e080a0',    // 분홍
  gray: '#808080',    // 회색
  yellow: '#f0c040',  // 노랑
};

export const CUBE_COLORS: Record<CubeColor, string> = {
  red: '#E53935',
  blue: '#1E88E5',
  yellow: '#FFB300',
  purple: '#8E24AA',
  black: '#455A64',
  white: '#FAF7EF',   // 면화 (Southern US) — 밝아서 렌더 시 어두운 테두리 필요
};

// === 맵 설정 ===
export interface MapConfig {
  id: string;
  name: string;
  supportedPlayers: number[];  // 지원하는 플레이어 수 목록 (예: [2, 3, 4, 5, 6])
  description?: string;
}

// === 신규 도시 타일 ===
export type NewCityTileId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export interface NewCityTile {
  id: NewCityTileId;
  color: CityColor;
  used: boolean;  // 사용 여부
}

// 신규 도시 타일 초기 데이터
export const NEW_CITY_TILES: NewCityTile[] = [
  { id: 'A', color: 'red', used: false },
  { id: 'B', color: 'blue', used: false },
  { id: 'C', color: 'purple', used: false },
  { id: 'D', color: 'yellow', used: false },
  { id: 'E', color: 'black', used: false },
  { id: 'F', color: 'black', used: false },
  { id: 'G', color: 'black', used: false },
  { id: 'H', color: 'black', used: false },
];

// === 게임 상수 ===
export const GAME_CONSTANTS = {
  // 플레이어 수 제한
  MAX_PLAYERS: 6,
  MIN_PLAYERS: 2,

  // 시작 값
  STARTING_SHARES: 2,
  STARTING_CASH: 10,
  STARTING_ENGINE: 1,
  STARTING_INCOME: 0,

  // 제한
  MAX_ENGINE: 6,
  MAX_SHARES: 15,
  MAX_INCOME: 50,
  MIN_INCOME: 0, // 수입이 0 미만이 되면 파산 (룰북 기준)

  // 비용
  SHARE_VALUE: 5,
  PLAIN_TRACK_COST: 2,
  RIVER_TRACK_COST: 3,
  MOUNTAIN_TRACK_COST: 4,

  // 턴당 트랙
  NORMAL_TRACK_LIMIT: 3,
  ENGINEER_TRACK_LIMIT: 4,

  // 물품 이동 라운드
  MOVE_GOODS_ROUNDS: 2,

  // Production 큐브 수
  PRODUCTION_CUBE_COUNT: 2,

  // UI 딜레이 (ms)
  PHASE_TRANSITION_DELAY: 100,

  // 도시당 초기 큐브 수
  INITIAL_CUBES_PER_CITY: 2,

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

// 트랙 타입별 비용 테이블
export const TRACK_COSTS: Record<TrackType, { plain: number; river: number; mountain: number }> = {
  simple: { plain: 2, river: 3, mountain: 4 },
  coexist: { plain: 3, river: 4, mountain: 5 },
  crossing: { plain: 4, river: 5, mountain: 6 },
};

// 트랙 교체 비용
export const TRACK_REPLACE_COSTS = {
  // 단순 → 복합 교차: $3
  simpleToCrossing: 3,
  // 마을 내 교체: $3
  townReplace: 3,
  // 기타 모든 교체: $2
  default: 2,
  // 방향 전환: $2
  redirect: 2,
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

// === 에러 처리 타입 ===

/**
 * 게임 에러 코드
 */
export type GameErrorCode =
  | 'PLAYER_NOT_FOUND'
  | 'INVALID_PHASE'
  | 'INVALID_ACTION'
  | 'INSUFFICIENT_FUNDS'
  | 'MAX_SHARES_REACHED'
  | 'ACTION_ALREADY_SELECTED'
  | 'INVALID_TRACK_PLACEMENT'
  | 'INVALID_MOVE'
  | 'NOT_YOUR_TURN';

/**
 * 게임 에러 인터페이스
 */
export interface GameError {
  code: GameErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * 작업 결과 타입 (성공 또는 실패)
 */
export type Result<T = void> =
  | { success: true; value: T }
  | { success: false; error: GameError };

/**
 * Result 헬퍼 함수들
 */
export const Result = {
  ok: <T>(value: T): Result<T> => ({ success: true, value }),
  fail: (code: GameErrorCode, message: string, details?: Record<string, unknown>): Result<never> => ({
    success: false,
    error: { code, message, details },
  }),
  isOk: <T>(result: Result<T>): result is { success: true; value: T } => result.success,
  isFail: <T>(result: Result<T>): result is { success: false; error: GameError } => !result.success,
};

// === 타입 가드 함수 ===

/**
 * 문자열이 유효한 PlayerId인지 검사
 */
export function isValidPlayerId(id: string): id is PlayerId {
  return PLAYER_ID_ORDER.includes(id as PlayerId);
}

/**
 * 값이 null 또는 undefined가 아닌지 검사
 */
export function isNonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}
