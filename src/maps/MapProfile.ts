// 맵 프로파일 추상 베이스 클래스
//
// 게임 세팅 + 규칙 + AI 설정을 "맵별로 달라질 수 있는 동작"으로 보고, 베이스 클래스에
// 기본 구현(표준 맵)을 두고 변형 맵이 상속받아 override 한다.
// "mapId === 'st-lucia'" 같은 분기 대신 다형성으로 맵별 동작을 표현하는 것이 목적.
//
// 의존 방향: maps/ 는 저수준 기반 — types/game 만 의존하고 ai/ 나 store/ 를 import 하지 않는다.
// (AI 전략·게임 엔진이 maps/ 를 의존하는 단방향. AI 액션 메서드는 의존 방향을 정리한 뒤 단계적으로 추가)

import { BoardState, SpecialAction, GAME_CONSTANTS, GameState, PlayerId, City, CubeColor } from '@/types/game';
import { DeliveryRoute } from '@/ai/strategy/types';
import { MapId } from './MapId';

/** income(배달) 원천 — 맵마다 화물이 있는 곳이 다르다 (도시 안 / 트랙 위 헥스큐브 / 향후 마을·항구 등). */
export type IncomeSource = 'cityCubes' | 'trackCubes' | 'townCubes';

/** 게임 시작 화면에서 보여줄 맵 특수룰 1줄 요약 (제목 + 설명). */
export interface MapRuleSummary {
  title: string;
  detail: string;
}

export abstract class MapProfile {
  // ── 정체성 ──
  abstract readonly id: MapId;
  abstract readonly name: string;
  abstract readonly nameKo: string;
  abstract readonly supportedPlayers: number[];
  abstract readonly maxTurns: number;

  // ── 세팅 ──
  /** 초기 보드 상태 생성 (도시/마을/헥스 + 큐브 배치는 createInitialGameState에서 추가) */
  abstract createBoardState(): BoardState;

  // ── 게임 규칙 (기본 = 표준 맵; 변형 맵이 override) ──
  /** IX. 물품 성장 단계 생략 */
  get skipGoodsGrowth(): boolean { return false; }
  /** II. 경매 대신 교대 선공권 방식 */
  get alternateTurnOrder(): boolean { return false; }
  /** 교대 선공권 비용 ($) */
  get firstSeatCost(): number { return 0; }
  /** 선택 불가 특수 행동 */
  get disabledActions(): SpecialAction[] { return []; }
  /** 셋업: 도시 큐브 대신 평지/강 헥스마다 큐브 1개 (건설 시 트랙 위로) */
  get hexCubeSetup(): boolean { return false; }
  /** AI가 1턴에 무조건 도시화 (도시 0개로 시작하는 맵) */
  get forceFirstTurnUrbanization(): boolean { return false; }
  /** 도시에 자기 색과 같은 화물은 배치하지 않음 (초기 배치 + 물품 성장 모두). 튜토리얼 하우스룰. */
  get noOwnColorCubes(): boolean { return false; }
  /** 도시별 초기 큐브 수 오버라이드 (미지정 도시는 INITIAL_CUBES_PER_CITY=2).
   *  Rust Belt: Pittsburgh/Wheeling 3개, 그 외 2개 (룰북 셋업). */
  get cityCubeCounts(): Record<string, number> { return {}; }
  /** Germany: Engineer 행동 시 트랙 1개 건설 비용을 절반(올림)으로. 이번 턴 1회만. */
  get engineerHalfCost(): boolean { return false; }
  /** Germany: 미완성 트랙 구간 건설 금지 — 모든 건설은 완성 링크를 만들어야 함. */
  get requireCompleteLinks(): boolean { return false; }
  /** Germany: 매 턴 시작에 이 도시(id)에 주머니에서 무작위 큐브 1개 추가 (Berlin). null이면 없음. */
  get bonusCityCubeId(): string | null { return null; }
  /** bonusCityCubeId 보너스가 적용되는 마지막 턴. null이면 매 턴 (Germany Berlin).
   *  Southern US: Atlanta는 1~4턴만 (남북전쟁 전 호황) → 4. */
  get bonusCityCubeMaxTurn(): number | null { return null; }

  /**
   * 도시 헥스 위·아래 주사위 숫자 박스가 검은색(흰 숫자)인지 — 공식 맵 시트 기준 맵별 규칙.
   * 기본은 흰 박스(검은 숫자). 맵 디자인이 색/도시별로 다르므로 프로파일에서 override.
   * - Germany: 전부 검은 박스 → true
   * - Korea: 어두운 수요색(파랑·보라·검정)만 검은 박스
   * - Rust Belt: 특정 도시(id)만 검은 박스 (색과 무관 — 공식 시트 디자인)
   */
  isCityNumberBoxBlack(_cityId: string, _demandColor: string): boolean { return false; }

  // ── 한국(Korea) 특수룰 (기본값 = 영향 없음) ──
  /** 도시화 시 물품 디스플레이에서 신도시 위로 옮길 큐브 수 (Korea: 2). 0이면 신도시는 빈 회색. */
  get urbanizeFromDisplayCount(): number { return 0; }
  /** 물품 성장(IX) 단계에서 새 물품을 받지 않는 도시 id 목록 (Korea: 평양·수원).
   *  columnMapping에서 빠진 도시는 어차피 성장하지 않지만, 의도를 코드로 명시하는 방어 가드. */
  get noGrowthCityIds(): string[] { return []; }

  // ── Western US 특수룰 (기본값 = 영향 없음) ──
  /** 셋업: 마을별 초기 큐브 수 (Western US: 모든 마을 1). 미지정 마을은 0. */
  get townCubeCounts(): Record<string, number> { return {}; }
  /** 플레이어 시작 현금 오버라이드 ($). null이면 표준(주식×$5 = $10). Western US: $20. */
  get startingCash(): number | null { return null; }
  /** 첫 트랙이 특정 "시작 도시"에 인접해야만 하는가 (Western US: 서부/동부 시작도시만). */
  get startingCitiesOnly(): boolean { return false; }
  /** 이 도시가 트랙을 시작할 수 있는 "시작 도시"인가. 기본: 모든 도시 허용.
   *  Western US: region이 east/west인 도시만(중앙 Denver/SLC·신도시 제외). */
  isStartingCity(city: City): boolean { void city; return true; }
  /** 대륙횡단(서부↔동부 시작도시) 연결 전까지 모든 트랙이 연속이어야 하는가 (Western US). */
  get requireContiguousUntilTranscontinental(): boolean { return false; }
  /** 대륙횡단 연결 보너스($4/$2)를 쓰는 맵인가 (Western US). */
  get transcontinentalBonus(): boolean { return false; }
  /** 마을이 도시화될 때 부여할 지역(배달/대륙횡단 판정). Western US: KansasCity→east, SanDiego/Portland→west. */
  newCityRegion(townId: string): 'east' | 'west' | undefined { void townId; return undefined; }
  /** 출발/도착 도시 지역에 따른 배달 income 보너스 ($). Western US: 동↔서 +1. */
  regionDeliveryBonus(fromRegion?: 'east' | 'west', toRegion?: 'east' | 'west'): number {
    void fromRegion; void toRegion; return 0;
  }

  // ── Southern US 특수룰 (기본값 = 영향 없음) ──
  /** 셋업: 모든 마을에 이 색 큐브 1개를 고정 배치 (주머니에서 뽑지 않음). Southern US: 면화(white). */
  get townFixedCube(): CubeColor | null { return null; }
  /** 큐브 색에 따른 배달 income 보너스 ($). Southern US: 면화(white) +1. */
  cubeDeliveryBonus(color: CubeColor): number { void color; return 0; }
  /** 배달 완료 시 큐브를 주머니로 반환하지 않고 게임에서 제거하는가. Southern US: 면화(white). */
  deliveredCubeLeavesGame(color: CubeColor): boolean { void color; return false; }
  /** 도시화 시 마을 위 큐브를 신규 도시로 옮기는가 (기본: 제거). Southern US: 면화 유지. */
  get urbanizationMovesTownCubes(): boolean { return false; }
  /** VIII. 수입 감소 배수 (턴별). Southern US: 4턴(남북전쟁) 2배. */
  incomeReductionMultiplier(turn: number): number { void turn; return 1; }

  // ── UI: 게임 시작 화면 특수룰 안내 (기본 = 표준 맵, 특수룰 없음) ──
  /** 게임 시작(플레이어 설정) 화면 우측에 표시할 이 맵만의 특수룰 목록. 빈 배열이면 패널 미표시. */
  get specialRules(): MapRuleSummary[] { return []; }

  // ── AI 설정 (기본 = 룰북 기본값; 맵 규모/특성에 따라 override) ──
  /** AI가 올릴 엔진 레벨 전략 상한 */
  get engineMax(): number { return GAME_CONSTANTS.MAX_ENGINE; }
  /** 턴당 기본 건설 트랙 수 (Engineer 시 +1) */
  get buildsPerTurn(): number { return GAME_CONSTANTS.NORMAL_TRACK_LIMIT; }
  /** 이 맵의 income 원천 — analyzer가 이 목록으로 배달 기회를 생성 */
  get incomeSources(): IncomeSource[] { return ['cityCubes']; }
  /**
   * AI가 목표로 하는 최소 완성 트랙 수 (0이면 비활성). 완성트랙이 이 미만이면 트랙 건설 VP를
   * 기회비용 없이 정상 인정해 경로 완성을 적극 추구 → 완성트랙(VP)·income 동반 상승.
   * Western US만 7 (다른 맵은 0 — 기존 동작 보존).
   */
  get targetCompletedTracks(): number { return 0; }
  /** selectAction의 Turn Order 행동 가치 계수 (꼴찌 기준 최대 ΔVP). 기본 0.1 = vp.ts TURN_ORDER_SEAT_VP.
   *  맵별 격리해 조율 — 뒤 순번이 Turn Order로 다음 턴 순서를 탈환하는 강도. */
  get turnOrderSeatVP(): number { return 0.1; }
  /** 현재 비딩 순번(rank, 0=1위)에 따른 1번 입찰 상한 보너스($). 기본 0(없음).
   *  뒤 순번일수록 입찰 상한을 올려 순서 순환을 유도하나, cityCubes 맵(Rust Belt·Germany)에선
   *  뒤 순번이 1번 사느라 건설예산을 소진해 붕괴한다(측정: Rust VP 11.7→3.5). 마을 큐브로 부작용이
   *  상쇄되는 Western US만 override로 켠다. */
  firstSeatRankBidBonus(rank: number, activePlayerCount: number): number { void rank; void activePlayerCount; return 0; }

  // ── AI 액션: 경로 선택 (맵별 전략 — 표준 맵 vs 헥스큐브 맵 등) ──
  /** 이번에 착공할 목표 배달 경로 1개 선택 (없으면 null) */
  abstract selectTargetRoute(state: GameState, playerId: PlayerId): DeliveryRoute | null;
  /** 상위 우선순위 경로 후보 (대체 경로 탐색용) */
  abstract selectTopRoutes(state: GameState, playerId: PlayerId, count?: number): DeliveryRoute[];
}
