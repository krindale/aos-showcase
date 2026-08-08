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

// 7가지 기본 특수 행동 + 맵 전용 추가 행동 (lowGravitation — Moon 8번째, MapProfile.extraActions로만 노출)
export type SpecialAction =
  | 'firstMove'      // 먼저 이동
  | 'firstBuild'     // 먼저 건설
  | 'engineer'       // 엔지니어 (4개 트랙)
  | 'locomotive'     // 기관차 (+1 엔진)
  | 'urbanization'   // 도시화
  | 'production'     // 생산
  | 'turnOrder'      // 턴 순서 패스
  | 'lowGravitation' // 저중력 (Moon 전용 신규 행동 — 이동 시 타인 링크 1개 수입 획득)
  | 'gainSupport';   // 지지 확보 (Southern China 전용 신규 행동 — 지지 토큰 1개 획득)

// 10단계 + 게임 종료 (+ Montréal 전용 정부 링크 단계)
export type GamePhase =
  | 'governmentLink'        // 0. 정부 링크 건설 (Montréal — 주식 발행 전)
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
  /** 두 번째 경로(secondary)가 추가된 턴 — 독일 미완성 제거가 "이번 턴 추가된 교차"를
   *  판별하는 데 쓴다 (builtTurn은 원 타일 것이라 교차 추가 시점을 담지 못함). */
  secondaryBuiltTurn?: number;
  /** 트랙 위 물품 큐브 (St. Lucia — 미완성 링크여도 배달 가능) */
  cube?: CubeColor | null;
  /** 건설된 턴 (이번 턴에 지은 트랙 시각 표시용) */
  builtTurn?: number;
  /** 정부 트랙 (Montréal): owner=null 중립 — 누구나 이동 가능하나 수입 없음, 수정/방향전환 불가 */
  isGovernment?: boolean;
  /** 국유화 트랙 (Southern China): isGovernment 중립 기계를 재사용하되 이 마커로 구분 —
   *  Hong Kong행 배달 경유 금지 판정 + 렌더 색 구분 전용 (항상 isGovernment와 함께 true). */
  isNationalized?: boolean;
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
  /** 두 색 화물을 모두 받는 겸용 도시의 보조 수요색 (Montréal Atwater: 빨강+파랑).
   *  배달 판정은 cityAcceptsCube 한 곳에서 color/extraColor를 함께 본다. 렌더는 반반 분할. */
  extraColor?: CityColor;
  /** 색·수요 없는 도시 (Moon: Moon Base) — 어떤 큐브도 여기서 배달이 끝나지 않고 출발/통과만
   *  가능하다 (cityAcceptsCube가 항상 false). color 필드는 타입 충족용일 뿐 수요에 쓰이지 않는다. */
  noDemand?: boolean;
  /** 모든 색 화물을 받는 도시 (Southern China: Hong Kong) — cityAcceptsCube가 색과 무관하게
   *  수용을 허용한다(어떤 색이든 여기서 배달 종료라 통과는 불가). color 필드는 타입 충족용.
   *  ⚠️ 단 `BoardState.allAcceptClosed`(마지막 2턴 폐쇄)가 서면 cityAcceptsCube가 false를
   *  돌려준다 — 폐쇄 판정은 이 플래그와 함께 **cityAcceptsCube 한 곳**에서 이뤄진다. */
  acceptsAllColors?: boolean;
  /** 도시화(Urbanization)로 배치된 신도시 (placeNewCity가 세팅). 중복 배치 검사가 신도시만
   *  보게 하는 구분자 — 맵 원본 도시 id가 신도시 타일 id(A~H)와 겹치는 맵(튜토리얼 Cleveland='C')에서
   *  타일 배치가 오탐 거부되던 버그(2026-07-26) 방지. 구버전 저장본의 신도시엔 없을 수 있으나
   *  그 경우도 NewCityTile.used가 중복을 막는다. */
  isUrbanizedNewCity?: boolean;
}

// 마을
export interface Town {
  id: string;
  coord: HexCoord;
  newCityColor: CityColor | null;  // 도시화된 경우 색상
  cubes: CubeColor[];              // 마을 위 물품 (도시화 전)
}

// 지형 타입 — sea(바다)는 헥스 전체를 물색으로 채우는 건설 가능 지형 (Montréal $6).
// river(강)는 평지색 + 강줄기 곡선 오버레이로 그려진다는 점이 다르다. lake는 건설 불가.
export type TerrainType = 'plain' | 'river' | 'mountain' | 'swamp' | 'lake' | 'sea';

// 헥스 타일
export interface HexTile {
  coord: HexCoord;
  terrain: TerrainType;
  /** 헥스 위 물품 큐브 (St. Lucia 셋업 — 건설 시 트랙 위로 이동) */
  cube?: CubeColor | null;
  /** 헥스별 고정 건설 비용(Germany €6~€12). 지정되면 지형별 기본 비용을 무시하고 이 값을 쓴다.
   *  (도시-도시 직결 링크는 별도 BoardState.directLinks로 표현 — fixedCost와 무관) */
  fixedCost?: number;
  /** hexCostMode 'legend' 맵에서도 이 헥스만 비용 숫자를 표시 (Montréal — 원본 시트에
   *  숫자가 인쇄된 물 헥스 3곳: "6"×2·"5"×1. perHex 맵에선 불필요 — 모든 fixedCost가 표시됨). */
  showCostMarker?: boolean;
  /** 시각 전용(Montréal $5 헥스): 바다 헥스를 원본 시트처럼 "서쪽 초록 쐐기 + 사선 분할"로 그린다.
   *  게임 로직엔 영향 없음 — 지형/비용은 terrain·fixedCost 그대로. */
  landWedgeWest?: boolean;
  /** 시각 전용(Southern China 하이난 해협 (4,10)): 이 변들을 두꺼운 흰 실선으로 강조해
   *  원본 시트의 해협 통로 표시를 재현한다. 게임 로직엔 영향 없음. */
  whiteEdges?: number[];
  /** 강줄기가 지나는 두 변(면) 번호 [시작면, 끝면] (0=E,1=SE,2=SW,3=W,4=NW,5=NE).
   *  지정되면 강을 이 두 면 사이로 그린다 — 강이 옆 도시 쪽 면을 향하게 해 도시를 관통/연결시킬 때 쓴다.
   *  미지정이면 인접한 강 타일끼리 자동 연결(기본). 맵 데이터로 강 방향을 적는 칸이라 맵별 코드 분기가 없다. */
  riverEdges?: [number, number];
}

// === AI 경매 성격 ===
/** 봇별 경매 입찰 성격 풀. standard = 현 산식과 비트 동일(미지정 기본값).
 *  게임마다 무작위 배정(setup의 randomizeBotPersonalities — 가중치 셔플·중복 최소화)하며
 *  UI에는 비노출(플레이 패턴으로만 드러남). 정의·레버는 src/ai/strategy/vp.ts AUCTION_PERSONALITIES. */
export const AUCTION_PERSONALITY_IDS = ['standard', 'denial', 'wuType', 'aggressive', 'conservative'] as const;
export type AuctionPersonalityId = (typeof AUCTION_PERSONALITY_IDS)[number];

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
  /** AI 전용: 경매 입찰 성격 (미지정 = standard = 기존 산식과 비트 동일). UI 비노출 —
   *  게임마다 무작위 배정(setup randomizeBotPersonalities), 플레이 패턴으로만 드러난다.
   *  PlayerState에 두는 이유: persist·스냅샷 자동 동승 → resetGame 재구성·지연 등록(ai/index.ts)
   *  경로에서도 유실되지 않는다. 구 저장본 rehydrate는 undefined = standard 폴백. */
  auctionPersonality?: AuctionPersonalityId;
  /** Montréal: 정부 전용 엔진 레벨(DGEL) — Locomotive로만 +1. 정부 링크 위 추가 이동 전용,
   *  비용 지불에 합산. 다른 맵은 undefined(=0). */
  dgel?: number;
  /** Montréal 경매 트윅: 무입찰 패스 2인 이상 → 이번 턴 특수 행동 선택 불가. 턴 롤오버 시 리셋. */
  actionBanned?: boolean;
  /** Western US: 이 플레이어의 철도가 대륙횡단(서부 시작도시↔동부 시작도시)을 달성했는지.
   *  달성 시 연속성 강제(분리 구간 금지) 해제. 다른 맵에서는 undefined. */
  transcontinental?: boolean;
  /** Southern China: 보유 지지 토큰(tokens of support) 수 — Gain Support 행동·국유화 보상으로
   *  획득. 반납해 건설 4개/기관차 임시 +1, 미사용분은 종료 시 개당 3 VP. 다른 맵은 undefined. */
  supportTokens?: number;
  /** Southern China: 건설·완성한 인터어반/페리 수 — 종료 시 개당 1 VP. 다른 맵은 undefined. */
  ferriesBuilt?: number;
  /** Southern China: 이번 턴 지지 토큰 반납 효과 ① — 건설 상한 4개 (턴 롤오버 시 리셋) */
  supportBuildActive?: boolean;
  /** Southern China: 이번 턴 지지 토큰 반납 효과 ② — 수송 단계 양 라운드 기관차 +1
   *  (임시 레벨 — 비용 지불(payExpenses)에는 포함되지 않는다. 턴 롤오버 시 리셋) */
  supportLocoActive?: boolean;
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
  /** 달(Moon): 보드 외곽 랩 어라운드 — 같은 번호가 인쇄된 두 외곽 변이 서로 이어진다.
   *  건설/이동/경로탐색의 이웃 계산이 이 테이블로 반대편 헥스에 닿는다 (hexGrid getNeighborHex).
   *  비-달 맵은 미설정. */
  wrapEdges?: WrapEdge[];
  /** 달(Moon): 현재 밤인 반쪽 ('west'=화면 왼쪽). 밤쪽 도시는 검은 도시 취급.
   *  1턴 west 시작, 물품 성장 후 교대 (nightDayCycle 맵만 설정 — 비-달 맵은 미설정). */
  nightSide?: 'west' | 'east';
  /** Southern China: 전색 수용 도시(Hong Kong)의 폐쇄 상태 — 마지막 2턴 진입 시 턴 롤오버가
   *  true로 설정, cityAcceptsCube가 참조해 배달 수령을 막는다. 비-중국 맵은 미설정. */
  allAcceptClosed?: boolean;
  /** Southern China: 구매식 페리 변 — 소유자가 생기면(구매) a·b 변이 서로 인접이 된다
   *  (getNeighborHex가 wrapEdges처럼 참조). 서안 육지 헥스 ↔ Hong Kong. */
  ferryEdges?: FerryEdge[];
}

/** 구매식 페리 변 연결 — $8, 건설 1회 카운트, 건설자 +1 VP (ferriesBuilt).
 *  ⚠️ **현재 이 배열을 채우는 맵은 없다** (남부 중국 서안↔홍콩 페리는 정본 확인 후 제거).
 *  기계(getNeighborHex 인접 활성화 + buildFerryEdge + BoardCities 렌더)는 그대로 두어
 *  "변 대 변" 페리가 필요한 맵이 생기면 데이터만 채우면 되게 남겨둔 것. */
export interface FerryEdge {
  id: string;
  a: { coord: HexCoord; edge: number };
  b: { coord: HexCoord; edge: number };
  cost: number;
  owner: PlayerId | null; // null = 미건설 (인접 비활성)
  builtTurn?: number;
}

/** 달(Moon): 외곽 랩 연결 한 쌍 — 변 a와 변 b가 이어진다 (시트 인쇄 번호 1~37, 렌더에도 사용) */
export interface WrapEdge {
  number: number;
  a: { coord: HexCoord; edge: number };
  b: { coord: HexCoord; edge: number };
}

/** 도시-도시 직접 링크 (사이 헥스 없이 인접한 두 도시를 잇는 특수 트랙) */
export interface DirectLink {
  cityA: string;           // 도시 id
  cityB: string;           // 도시 id
  cost: number;            // 건설 비용 ($)
  owner: PlayerId | null;  // 건설한 플레이어 (null=미건설)
  builtTurn?: number;
  /** 국유화된 직결 링크 (Southern China) — owner null이지만 "미건설"이 아니라 중립 링크:
   *  누구나 이동 가능·수입 0·재구매 불가. 트랙의 isGovernment+isNationalized에 대응. */
  isNationalized?: boolean;
  /** 시각 전용 — 비인접 도시 쌍(Southern China GZ↔HK 페리)의 면 앵커 [cityA 변, cityB 변].
   *  지정 시 두 도시 중심 대신 각 도시 헥스의 이 변 중점끼리 직선 점선으로 잇는다
   *  (중심-중심 직선이 사이 도시 헥스를 관통하는 문제 방지). 게임 로직에는 영향 없음. */
  faces?: [number, number];
  /** 양끝이 모두 도시일 때만 구매 가능 (Scotland 페리 — 룰북: "양끝 마을이 도시화된 후에만").
   *  cityA/cityB가 마을 id인 동안은 잠재 링크(점선 표시만) — placeNewCity가 도시화 시
   *  해당 마을 id를 신도시 id로 갱신해 두 끝이 도시로 해석되면 구매가 열린다. */
  requiresCities?: boolean;
}

/** 마을 안 철길 가닥: 마을 원에서 특정 변까지. 실제 건설물 (비용/카운트 발생)
 *  owner null = 정부 가닥 (Montréal governmentLink — 중립, 수입 없음) */
export interface TownSpur {
  id: string;
  townCoord: HexCoord;
  edge: number;            // 가닥이 닿는 마을 헥스의 변 (0~5)
  owner: PlayerId | null;
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
  /** 이 열이 물품을 보충받는 주사위 번호 여러 개 (Southern China: Changsha·Hong Kong = 5와 6 모두).
   *  지정되면 표준 성장 루프가 diceNumber 대신 이 목록의 모든 번호와 일치하는 주사위 수만큼 보충한다. */
  diceNumbers?: number[];
  /** 디스플레이 열 헤더 표시용 라벨 오버라이드 (Moon: 도시당 두 주사위 번호 "1/2" 표기 —
   *  성장 판정은 diceNumber가 아니라 MapProfile.cityGrowthDice로 별도 처리). */
  displayLabel?: string;
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
  /** 포기(drop out)한 플레이어 — 포기 순서대로. Turn Order 패스는 포기가 아니므로
   *  여기 들어가지 않는다 (패스 사용 여부는 PlayerState.turnOrderPassUsed가 별도 관리).
   *  경매 종료 판정은 오직 이 목록 기준: 미포기 1명 남을 때까지 계속 (룰북
   *  "Bidding continues until all but one player has dropped out"). */
  droppedOutPlayers: PlayerId[];
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
  /** Germany: Engineer 절반 할인(룰북 "트랙 1개를 절반 비용, 올림") — 이번 빌더 턴에 지은 타일 중
   *  최고 정가. 항상 "가장 비싼 타일 1개가 절반"이 되도록 매 건설마다 차액을 정산한다. */
  engineerMaxTileCost?: number;
  /** Germany: 위 정산으로 지금까지 깎아준 누적 할인액 (= floor(engineerMaxTileCost / 2)) */
  engineerDiscountGiven?: number;
  /** Montréal Repopulation: production 선택 즉시 주머니에서 뽑은 큐브 3개 (배치 대기).
   *  1개를 도시에 배치(placeRepopulationCube)하면 나머지는 주머니로 반환 후 비워진다. */
  repopulationCubes?: CubeColor[];
  /** Montréal Repopulation: 배치할 플레이어 (repopulationCubes와 함께 설정/해제) */
  repopulationPlayer?: PlayerId | null;
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
  /** Montréal Repopulation: 배치하려고 고른 큐브 (보드 도시 클릭으로 배치) — 로컬 UI 선택 */
  repopulationCube: CubeColor | null;

  // 물품 이동 애니메이션 상태
  movingCube: {
    color: CubeColor;
    path: HexCoord[];
    currentIndex: number;
    context: MovingCubeContext;  // 캡처된 실행 컨텍스트
  } | null;
  reachableDestinations: HexCoord[];             // 이동 가능한 목적지 도시들

  // 타인 철도 이용 (전 맵) — 큐브 선택 시 목적지별 후보 경로. 로컬 UI 상태(스냅샷 미동기화).
  routeOptions: { dest: HexCoord; options: RouteOption[] }[];
  /** 목적지 클릭 후 후보가 2개 이상일 때의 경로 선택 상태 — [selectedIndex]가 현재 선택(초기값 0=디폴트) */
  routeChoice: { dest: HexCoord; options: RouteOption[]; selectedIndex: number } | null;
}

/**
 * 화물 이동 후보 경로 (타인 철도 이용 — utils/hexGrid.findRouteOptions가 생성).
 * ownLinks = 내 수입 링크 수(정산 미러 기준), owners = 빌린 링크 소유자들.
 */
export interface RouteOption {
  path: HexCoord[];
  ownLinks: number;
  oppLinks: number;
  totalLinks: number;
  owners: PlayerId[];
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
   * initGame으로 시작된 진행 중 게임 여부 — 오프라인 F5 복원 판단용.
   * (persist로 살아나며, GamePageClient가 마운트 시 이 값으로 셋업 화면을 건너뛴다.
   *  resetGame/초기값은 false — 셋업 화면에서 새로고침하면 셋업 유지)
   */
  gameStarted?: boolean;

  /**
   * 터보 모드 표시 상태 (방장이 토글, 스냅샷으로 전원 동기화 — 게스트는 버튼
   * disabled + 이 값으로 라벨/토스트만). 실제 딜레이 축소는 방장 로컬의
   * localStorage 'aos-turbo'(utils/turboMode)가 담당하고, 이 필드는 표시/알림 전용.
   */
  turboMode?: boolean;

  /**
   * 화물 이동 가이드(목적지 골드 링·최적 경로 점선 미리보기) 허용 여부 — 방 설정.
   * 온라인은 방장이 방 만들기/대기실에서 정하고 시작 시 주입(스냅샷으로 전원 동기화),
   * 오프라인은 항상 true. false면 개인 토글(gameSettingsStore)과 무관하게 전원 강제 off이며
   * 게임 중 변경 불가(설정 창 스위치 잠김). 표시 계층만 게이팅 — 목적지 클릭·수송·
   * 경로 선택 모드(routeChoice)·이동 애니메이션은 그대로 동작한다.
   */
  moveGuideAllowed?: boolean;

  /**
   * 파산(Phase VII)이 발생한 순간의 알림 이벤트 — 사람/봇 구분 없이 담는다.
   * 온라인 스냅샷으로 전파돼 게스트도 같은 팝업을 본다(호스트 전용 아님).
   * ⚠️ persist merge 리셋 목록에 넣지 말 것 — 게스트 적용 경로가 merge를 재사용하므로
   * 넣으면 게스트에게 팝업이 뜨지 않는다 (deliveryIncomeEvent와 동일한 이유).
   * 중복 재생은 BankruptcyModal의 "최초 관측 key 스킵" 가드가 막는다.
   */
  bankruptcyEvent?: BankruptcyEvent | null;

  /**
   * 직전 수입 감소(Phase VIII)에서 각 플레이어가 잃은 수입량 (playerId → 감소량, >0만).
   * "수입이 갑자기 줄었다"를 PlayerPanel에 "-N (수익 감소)" 배지로 알리는 용도.
   * 다음 턴 수입 수집(collectIncome) 때 초기화된다.
   */
  incomeReductions?: Partial<Record<PlayerId, number>> | null;

  /**
   * Montréal: 정부 링크 관리 순번 (셋업 시 첫 턴 순서 스냅샷 — 라운드 N의 관리자는
   * governmentControllers[(N-1) % 인원수]. 원본 룰: 셋업 때 순번 스톤을 고정 배치).
   * 다른 맵은 undefined.
   */
  governmentControllers?: PlayerId[];

  /**
   * 직전 물품 성장(Phase IX)에서 굴린 주사위와 도시별 추가된 화물 큐브.
   * 방장이 굴린 결과(어느 도시에 어떤 큐브가 늘었는지)를 게스트에게도 스냅샷으로 보여주기
   * 위한 1회성 표시 상태. goodsGrowth 진입 시 null로 초기화된다(다음 턴 stale 방지).
   */
  goodsGrowthEvent?: { dice: number[]; results: { cityName: string; cubes: CubeColor[] }[] } | null;

  /**
   * 직전 수송(Phase V) 정산에서 수입을 얻은 플레이어별 증가량과 도착지 좌표.
   * BoardPulses가 도착 도시 위에 "누가 +몇" 펄스로 표시하는 1회성 표시 상태 —
   * 스냅샷에 실려 게스트도 같은 펄스를 본다. 표시 계층이 key 변화만 재생하므로
   * 새로고침 rehydrate·스냅샷 재적용에 중복 재생 없음(persist merge 리셋 불요).
   */
  deliveryIncomeEvent?: { dest: HexCoord; gains: { player: PlayerId; amount: number }[]; key: number } | null;

  /**
   * 도시화로 신도시가 배치된 순간의 1회성 표시 상태 (placeNewCity가 기록).
   * BoardPulses가 배치 헥스 위에 "신도시!" 펄스를, MoveCubeOverlay가 잠시 미니맵 팝업을
   * 띄운다 — 스냅샷에 실려 온라인 참가자 전원이 같은 연출을 본다(사람·봇 배치 공통).
   * ⚠️ persist merge 리셋 목록에 넣지 말 것 — 게스트 적용 경로가 merge를 재사용하므로
   * 넣으면 게스트 표시가 죽는다. 재생 중복은 표시 계층의 "key 최초 관측 스킵" 가드가 방지.
   * ⚠️ key는 결정론(타일ID@좌표) — placeNewCity는 optimistic 인텐트라 게스트 로컬 실행과
   * 호스트 스냅샷이 각각 이벤트를 만드는데, Date.now()면 key가 달라져 이중 재생된다.
   * at = 발생 시각: 신도시 플래시로 새로 마운트되는 미니맵의 BoardPulses가 "첫 관측"이어도
   * 방금(5초 내) 이벤트는 재생하기 위한 신선도 판정용 — key 가드(중복 차단)와 역할이 다르다.
   */
  newCityEvent?: { coord: HexCoord; tileId: NewCityTileId; color: CityColor; player: PlayerId; key: string; at: number } | null;
  /** Southern China: 국유화 대기 — 건설로 소유 디스크(4개) 초과 시 설정.
   *  해당 플레이어가 기존 완성 링크 하나를 국유화(nationalizeLink)할 때까지 단계 진행이 막힌다.
   *  스냅샷 동기화 상태 (게스트도 대기 표시). 다른 맵은 항상 null/undefined. */
  nationalizationPending?: { playerId: PlayerId } | null;
}

/** 대륙횡단 연결 순간을 사람 플레이어에게 알리는 팝업 데이터. */
export interface TranscontinentalEvent {
  /** 보드 전체 최초 연결 보너스 수령자 (없으면 빈 배열 — 연속성 해제만 발생). */
  bonusRecipients: { playerId: PlayerId; name: string; amount: number }[];
  /** 이번 연결로 "한 줄 연속 건설" 규칙이 해제된 플레이어 (자기 철도로 서↔동 연결). */
  unlockedPlayers: { playerId: PlayerId; name: string }[];
  /**
   * 이 이벤트의 고유 키. 온라인에서 호스트가 클리어하지 않은 이벤트가 매 스냅샷마다
   * 게스트에게 재전파돼 팝업이 반복되던 버그 방지 — 모달이 이미 닫은 key는 다시 열지 않는다
   * (deliveryIncomeEvent와 동일한 "key 최초 관측" 가드).
   */
  key: number;
}

/** 파산 알림 팝업용 1회성 이벤트 (사람·봇 공통). */
export interface BankruptcyEvent {
  /** 이번에 파산한 플레이어들 (동시 파산 가능 — payExpenses가 전원을 순회하므로). */
  players: { id: PlayerId; name: string }[];
  /** 파산이 일어난 턴 (팝업 문구용). */
  turn: number;
  /** 중복 재생 방지 키 — `${turn}-${파산자 id들}`. */
  key: string;
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
  /** 셋업 때 타일 위에 놓인 화물 (Montréal: 신규 도시 타일마다 1개 — 도시화 시 함께 보드에 올라감) */
  setupCube?: CubeColor;
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

  // Montréal: 정부 전용 엔진(DGEL) 상한 (원본 보드의 Dedicated Government Links 트랙 = 1~4)
  MAX_DGEL: 4,

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
  governmentLink: {
    name: '0. 정부 링크 건설',
    description: '정부 관리 플레이어가 중립 정부 링크 1개를 무료로 건설합니다 (몬트리올).',
  },
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
  lowGravitation: {
    name: '저중력',
    description: '물품 이동 단계에서 다른 플레이어의 링크 1개를 내 링크처럼 사용해 그 수입을 가져옵니다. 두 수송 라운드 모두 사용할 수 있습니다. (달 전용)',
  },
  gainSupport: {
    name: '지지 확보',
    description: '즉시 지지 토큰 1개를 얻습니다. 토큰은 건설 4개 또는 수송 단계 기관차 +1에 쓰거나, 안 쓰면 게임 종료 시 개당 3 VP입니다. (남부 중국 전용)',
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
