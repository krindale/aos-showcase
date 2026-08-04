// 맵 프로파일 추상 베이스 클래스
//
// 게임 세팅 + 규칙 + AI 설정을 "맵별로 달라질 수 있는 동작"으로 보고, 베이스 클래스에
// 기본 구현(표준 맵)을 두고 변형 맵이 상속받아 override 한다.
// "mapId === 'st-lucia'" 같은 분기 대신 다형성으로 맵별 동작을 표현하는 것이 목적.
//
// 의존 방향: maps/ 는 저수준 기반 — types/game 만 의존하고 ai/ 나 store/ 를 import 하지 않는다.
// (AI 전략·게임 엔진이 maps/ 를 의존하는 단방향. AI 액션 메서드는 의존 방향을 정리한 뒤 단계적으로 추가)

import { BoardState, SpecialAction, GAME_CONSTANTS, GamePhase, GameState, PHASE_INFO, PlayerId, City, CubeColor, HexCoord } from '@/types/game';
import { DeliveryRoute, DeliveryOpportunity } from '@/ai/strategy/types';
import { MapId } from './MapId';

/** income(배달) 원천 — 맵마다 화물이 있는 곳이 다르다 (도시 안 / 트랙 위 헥스큐브 / 향후 마을·항구 등). */
export type IncomeSource = 'cityCubes' | 'trackCubes' | 'townCubes';

/** 게임 시작 화면에서 보여줄 맵 특수룰 1줄 요약 (제목 + 설명). */
/** aiRouteBuildGate 컨텍스트 — 일반 buildTrack 알고리즘이 계산해 프로파일 훅에 주입 */
export interface AiRouteBuildGateContext {
  /** 이번 턴 잔여 건설 슬롯 (maxTracksThisTurn − builtTracksThisTurn) */
  remainingSlots: number;
  /** 현재 현금 */
  cash: number;
  /** 지연 계산 — 경로 완성에 필요한 신규 타일 수·예상 비용(지형/fixedCost 기준, Engineer 할인 미반영=보수적).
   *  A* 경로가 없으면 null. 기본 구현은 호출하지 않으므로 기본 맵은 비용 0. */
  missingWork: () => { tiles: number; cost: number } | null;
}

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
  /** 인원별 턴 수 (다인원 지원 맵의 룰북 턴 트랙). 미지정 = maxTurns 고정 (기존 맵 항등) */
  readonly turnsByPlayers?: Record<number, number>;

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
  /** 도시별 "플레이어 인원당" 초기 큐브 수 (Moon: Landing hex 인원×2).
   *  cityCubeCounts보다 우선하며, 실제 개수 = 값 × 활성 인원. */
  get perPlayerCityCubes(): Record<string, number> { return {}; }
  /** Germany: Engineer 행동 시 트랙 1개 건설 비용을 절반(올림)으로. 이번 턴 1회만. */
  get engineerHalfCost(): boolean { return false; }
  /** Germany: 미완성 트랙 구간 건설 금지 — 모든 건설은 완성 링크를 만들어야 함. */
  get requireCompleteLinks(): boolean { return false; }
  /** Germany: 매 턴 시작에 이 도시(id)에 주머니에서 무작위 큐브 1개 추가 (Berlin). null이면 없음. */
  get bonusCityCubeId(): string | null { return null; }
  /** bonusCityCubeId 보너스가 적용되는 마지막 턴. null이면 매 턴 (Germany Berlin).
   *  Southern US: Atlanta는 1~4턴만 (남북전쟁 전 호황) → 4. */
  get bonusCityCubeMaxTurn(): number | null { return null; }
  /** 회색 헥스로 렌더하는 도시 id (Germany Berlin — 원본 맵 시트의 시각 표현).
   *  ⚠️ 보너스 규칙(bonusCityCubeId)과 별개의 순수 시각 속성 — 둘을 묶으면
   *  Southern US Atlanta(보너스만 공유, 빨강 도시)까지 회색이 되는 버그가 난다. */
  get grayRenderCityId(): string | null { return null; }

  /**
   * 도시 헥스 위·아래 주사위 숫자 박스가 검은색(흰 숫자)인지 — 공식 맵 시트 기준 맵별 규칙.
   * 기본은 흰 박스(검은 숫자). 맵 디자인이 색/도시별로 다르므로 프로파일에서 override.
   * - Germany: 전부 검은 박스 → true
   * - Korea: 어두운 수요색(파랑·보라·검정)만 검은 박스
   * - Rust Belt: 특정 도시(id)만 검은 박스 (색과 무관 — 공식 시트 디자인)
   */
  isCityNumberBoxBlack(_cityId: string, _demandColor: string): boolean { return false; }

  // ── Southern England 특수룰 (기본값 = 항등) ──
  /** 셋업·물품 성장에서 도시에 큐브가 놓이기 직전 호출 — 실제 배치될 도시 id를 반환.
   *  England(v2 시트): 파란 큐브가 London에 놓이려 하면 주사위 1-4 → North West, 5-6 → North East.
   *  (파랑 목적지가 London뿐이라, London 안의 파랑은 배달 불가능한 데드 큐브가 되기 때문)
   *  기본 = 그대로(항등) — 다른 맵 동작 무변경. */
  redirectCubePlacement(cityId: string, color: CubeColor): string { void color; return cityId; }

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

  // ── Montréal Métro 특수룰 (기본값 = 영향 없음) ──
  /** 매 라운드 주식 발행 전, 정부 관리 플레이어가 중립 정부 링크 1개를 무료 건설 (governmentLink 단계). */
  get governmentLinks(): boolean { return false; }
  /** 마스터 네트워크: 보드 위 모든 트랙(정부 포함)의 총합이 항상 연속(연결)이어야 함. */
  get masterNetwork(): boolean { return false; }
  /** Locomotive 행동이 일반 엔진 대신 정부 전용 엔진 레벨(DGEL)을 +1.
   *  DGEL은 정부 링크 위 추가 이동 전용이며 비용 지불에 합산된다. */
  get dedicatedGovEngine(): boolean { return false; }
  /** 경매에서 무입찰 패스가 2인 이상이면 그 플레이어들은 이번 턴 특수 행동 선택 불가. */
  get auctionNoBidPassPenalty(): boolean { return false; }
  /** Production 행동이 Repopulation으로 대체: 선택 즉시 주머니에서 3개 뽑아 1개를 맵의 도시에 배치. */
  get productionAsRepopulation(): boolean { return false; }
  /** 셋업: 신규 도시 타일마다 주머니에서 큐브 1개를 올려두고, 도시화 시 함께 보드에 올라감. */
  get newCitySetupCube(): boolean { return false; }

  // ── Southern China 특수룰 (기본값 = 영향 없음) ──
  /** 지지 토큰(tokens of support) 룰 사용 — Gain Support 행동·국유화 보상으로 획득,
   *  반납해 건설 4개(spendSupportToken 'build')/수송 기관차 임시 +1('loco'),
   *  미사용분 종료 시 개당 3 VP (playerBonusVP). */
  get supportTokensRule(): boolean { return false; }
  /** 소유 디스크 상한 — 완성 링크 + 미완성 구간 + 직결 링크(인터어반/페리) 합계가 이 수를
   *  넘으면 기존 완성 링크를 국유화해야 한다 (null = 무제한 = 기존 맵 항등). China: 4. */
  get ownershipDiscLimit(): number | null { return null; }
  /** 동시에 가질 수 있는 미완성 트랙 구간 수 (null = 무제한). China: 1. */
  get unfinishedSectionLimit(): number | null { return null; }
  /** 전색 수용 도시(acceptsAllColors — Hong Kong)가 배달을 안 받는 마지막 N턴 (0 = 없음).
   *  턴 롤오버가 board.allAcceptClosed를 설정, cityAcceptsCube가 참조. China: 2. */
  get allAcceptCityClosedLastTurns(): number { return 0; }
  /** 인터어반/페리 룰 (Southern China) — 직결 링크·페리 변 구매 시 플레이어당 턴 1개 제한
   *  + 건설자 ferriesBuilt(종료 1 VP) 가산. Germany 직결 링크($2)에는 적용 안 함. */
  get interurbanFerryRule(): boolean { return false; }

  // ── 달(Moon) 특수룰 (기본값 = 영향 없음) ──
  /** masterNetwork의 시드 도시 id — 네트워크가 항상 이 도시를 포함해야 한다 (Moon: 'moonBase').
   *  null이면 몬트리올식(첫 링크가 시드). masterNetwork=false면 무의미. */
  get masterNetworkSeedCityId(): string | null { return null; }
  /** 밤/낮 교대: 매 턴 보드 절반이 밤 — 밤쪽 도시는 검은 도시 취급(검은 큐브만 배달,
   *  다른 색 큐브는 통과도 불가). 물품 성장 후 밤쪽이 교대된다 (GameState.nightSide). */
  get nightDayCycle(): boolean { return false; }
  /** 맵 전용 추가 특수 행동 (기본 7종 외 — Moon: lowGravitation 8번째).
   *  행동 그리드·AI 후보·도움말이 기본 7종 + 이 목록을 함께 순회한다. */
  get extraActions(): SpecialAction[] { return []; }
  /** 물품 성장: 디스플레이 대신 주사위가 도시 인쇄 번호와 일치하면 주머니에서 도시로 직접 배치.
   *  (Moon: 낮쪽 + Moon Base 연결 도시만 — 조건 미달 배정분은 버려짐) */
  get cityDiceGrowth(): boolean { return false; }
  /** cityDiceGrowth 맵의 물품 성장 주사위 수 (플레이어당). 표준 맵(디스플레이 성장)은 1. Moon: 2. */
  get growthDicePerPlayer(): number { return 1; }
  /** cityDiceGrowth 맵의 도시별 인쇄 주사위 번호 (도시 id → 번호들) */
  get cityGrowthDice(): Record<string, number[]> { return {}; }
  /** 셋업에 사용하는 신규 도시 타일 id 목록 (null = 전부 A~H).
   *  Moon: 공식 룰 "검은 신규 도시 제거" — 이 구현의 타일 색 기준 검은 4장(E~H) 제거 → A·B·C·D. */
  get availableNewCityTiles(): string[] | null { return null; }
  /** 마을 가닥(스퍼) 1개 건설 비용 ($). 룰북 "마을로 연결되는 트랙당 $1". */
  get townSpurCost(): number { return 1; }
  /** 마을 기본료 ($) — 룰북 "마을 $1 + 트랙당 $1"의 앞항. 그 마을을 이번 턴 처음 건드릴 때 1회.
   *  Moon은 공식이 "마을 $2 + 트랙 구간당 $1"이라 기본료만 $2다.
   *  ⚠️ 계산은 helpers/townCost.ts 한 곳에서 — 청구 지점이 네 곳으로 흩어져 있다. */
  get townBaseCost(): number { return 1; }

  // ── UI: 규칙 안내 문구 (기본 = 표준 맵, 특수룰 없음) ──
  /** 단계 설명 (PHASE_INFO 기반, 맵별 수치 보정). buildTrack은 buildsPerTurn을 반영 —
   *  달(2개) 같은 맵에서 표준 "최대 3개" 문구가 실제 규칙과 어긋나는 것을 막는다. */
  phaseDescription(phase: GamePhase): string {
    const base = PHASE_INFO[phase]?.description ?? '';
    if (phase === 'buildTrack' && this.buildsPerTurn !== GAME_CONSTANTS.NORMAL_TRACK_LIMIT) {
      return `최대 ${this.buildsPerTurn}개의 트랙 타일을 배치합니다.`;
    }
    return base;
  }
  /** 게임 시작(플레이어 설정) 화면 우측에 표시할 이 맵만의 특수룰 목록. 빈 배열이면 패널 미표시. */
  get specialRules(): MapRuleSummary[] { return []; }
  /** 이 맵에서 효과가 다른 특수 행동의 설명문 (도움말/행동 선택 UI가 ACTION_INFO 대신 사용).
   *  undefined면 ACTION_INFO의 표준 설명을 그대로 쓴다. Germany: Engineer가 4개 건설이 아님. */
  actionDescription(action: SpecialAction): string | undefined { void action; return undefined; }
  /** 건설 단계 패널에 띄우는 지형별 비용 한 줄. 지형 비용을 바꾸는 맵(fixedCost 주입)은 반드시 override
   *  — 안 하면 표준값($2/$3/$4)을 그대로 보여줘 실제 청구액과 어긋난다. */
  get buildCostHint(): string { return '평지: $2 / 강: $3 / 산: $4'; }

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
  /**
   * 건설 예비금 "이번 턴 완성+배달 가능 시 면제"의 배달 판정을 **현재 상태**(cityAcceptsCube)로
   * 할지 (기본 false = 기존 동작 = cityEverAcceptsCube). 밤낮이 없는 맵은 두 판정이 동치라
   * 이 훅은 달에서만 의미가 있다 — 달은 목적지가 지금 밤이면 이번 턴 배달이 불가능한데도
   * 계획용 판정이 "배달로 회수 가능"으로 오판해 비용 지불용 현금을 건설에 헐었다
   * (2026-07-21 파산 해부: 파산 턴 건설지출 \$4.4 → 수정 후 VP −12.23→−11.49·파산 1.56→1.50).
   */
  get aiExemptionUsesCurrentDemand(): boolean { return false; }

  /**
   * **막을 수 없는 파산 앞에서는 생존 발행을 포기**할지 (기본 false = 기존 동작 = 항상 발행).
   * 주식 1주는 현금 +\$5지만 비용도 +\$1 늘어 실효 보전액이 \$4뿐이라, 부족분이 크면 최대치를
   * 발행해도 파산을 못 막는다. 그 경우 발행은 VP −3/주만 내고 결과를 못 바꾸는 순손실이다.
   * true면 "최대 발행으로도 파산 회피가 불가능"할 때 발행량을 0으로 만들어 VP를 보존한다.
   * ⚠️ 회피가 **가능한** 경우의 생존 발행은 그대로 유지 — 파산 방어를 약화시키지 않는다.
   * (2026-07-21 기각 실험: 반대로 부족분을 \$4로 나눠 "정확히" 메우게 했더니 주식이 늘어
   *  VP −12.73→−13.83 악화 — income 몇 점을 지키려 주식을 더 발행하는 건 손해였다.)
   */
  get aiSkipHopelessSurvivalIssue(): boolean { return false; }

  /**
   * AI가 **엔진을 올릴 상한** (기본 null = engineMax와 동일 = 기존 동작).
   * `engineMax`와 분리한 이유: engineMax를 낮추면 `vp.ts`가 그보다 긴 경로를 −∞로 배제해
   * income 천장까지 함께 내려간다(2026-07-21 실측 악화). 이 훅은 **엔진업 결정만** 제한하고
   * 경로 평가는 engineMax 그대로 두어, "긴 경로는 계속 평가하되 엔진 과투자는 막는" 절충을 만든다.
   * Moon: 배달의 97%가 3링크 이하인데 엔진 3.7까지 올려 게임당 ~$30(=타일 10개)을 유지비로 쓴다.
   */
  get aiEngineUpgradeCap(): number | null { return null; }

  /**
   * AI가 초반(T1~4) 수송 기회를 **배달 대신 엔진 업그레이드**에 쓰는 front-load 전략을 켤지.
   * 기본은 기존 동작 유지 — trackCubes 맵이거나 3인 이상이면 켜진다(moveGoods가 인원 조건을 함께 판정).
   * ⚠️ **기각 실험 (2026-07-21, 달 100시드)**: "달은 배달 링크가 짧으니(97%가 3링크 이하)
   *   엔진 front-load가 낭비"라는 가설로 false를 줬더니 VP −13.3 → −19.6·파산 1.59 → 2.07로
   *   크게 악화. 엔진이 3.2로 낮아지자 **배달 가능 경로 자체가 줄어** 스킵 40%→46%,
   *   income 6.4→5.6. 짧은 링크 분포는 "엔진이 낮아서 짧은 것"이지 그 반대가 아니었다.
   *   현재 false를 쓰는 맵은 없다 — 끄려면 income 지표를 반드시 함께 볼 것.
   */
  get aiEngineFrontLoad(): boolean { return true; }

  /**
   * AI 계획 발행(건설 자금 목적)을 금지하는 **마지막 N턴** (기본 0 = 마지막 턴만, 기존 동작).
   * 생존 발행(파산 방지)은 항상 허용 — 막는 것은 "건설하려고 빌리는" 발행뿐이다.
   * 근거: 주식 1주는 −3VP + 남은 턴수만큼의 유지비인데, 늦게 빌린 돈은 배달로 회수할 턴이
   * 부족해 순손실이 된다. 달은 크레이터 $3·건설 2개 제한이라 $5로 링크를 못 만들어
   * 회수 시점이 특히 늦다(2026-07-21 실측: 주식 14.7 = VP −44가 income 16.8을 압도).
   * 선례: trackCubes 맵 마지막 2턴 건설 발행 금지 → 파산 13→11·VP 유지 (docs/ai-system.md).
   */
  get aiNoBuildIssueLastTurns(): number { return 0; }

  /**
   * 배달 실행 문턱에서 전략 경로 tie-break(routeScore)를 제외하고 순수 ΔVP>0만 볼지.
   * 기본 false = 기존 동작(deltaVP+routeScore>0). Montréal true — 정부 링크(무수입) 경유
   * ΔVP=0 배달이 tie-break에 밀려 실행돼 유한한 큐브를 공짜로 태우던 문제(0수입 배달 29%).
   * 다른 맵은 모든 링크에 소유자가 있어 ΔVP가 정확히 0인 배달이 구조적으로 없지만,
   * 미세 음수 배달의 행동 변화 가능성이 있어 사용자 지시로 몬트리올 전용(2026-07-25).
   */
  get aiStrictDeliveryVP(): boolean { return false; }

  /**
   * 선점 보너스에서 "아무에게도 수입이 없는 경로"(정부 링크 경유)의 차단을 인정할지.
   * 기본 false = 상납 가드만(내 수입 0이면 보너스 없음 — 2026-07-24 한국 상납 배달 수정).
   * Montréal true — own0/opp0 순수 차단(상대가 배달할 큐브를 0원에 제거)은 정당한 선점.
   */
  get aiPreemptZeroIncomeDenial(): boolean { return false; }

  /**
   * 경매 상시 참여(사용자 지시, Montréal): 무입찰 패스 대신 감당 가능한 소액이라도 입찰해
   * 입찰 기록을 남긴다 — 몬트리올 트윅에서 무입찰 패스는 행동 밴이지만, 입찰 후 첫 포기는
   * 비용 무료라 행동권을 지킬 수 있다. 기본 false = 기존 가치 기반 참여 판단 그대로.
   */
  get aiAuctionAlwaysParticipate(): boolean { return false; }

  /**
   * 도시화 ΔVP에 더할 맵 고정 가산 ($ 아닌 VP). 기본 0 = 기존 동작.
   *
   * 물품 성장이 없는 맵에서는 신도시가 화물을 늘리는 몇 안 되는 수단이고, 특히 신도시 타일에
   * 셋업 화물이 딸려 오는 맵(Montréal `NewCityTile.setupCube`)은 도시화 한 번이
   * "화물 +1 + 영구 목적지 +1"이다. 기본 평가(planUrbanization)는 목적지 가치만 보므로
   * 그 화물 몫이 빠진다.
   * ⚠️ 크게 주면 안 된다 — 같은 취지로 Repopulation 가치를 올렸다가 행동 한 칸의 기회비용에
   * 밀려 VP가 −11.55 났다(selectAction 주석). 행동은 턴당 하나뿐이다.
   */
  get aiUrbanizationBonus(): number { return 0; }

  /**
   * AI 턴 예산(turnPlan.cashNeeded)에서 **운영비를 income으로 상계**할지 (기본 false = 현재 동작).
   * 표준 맵은 운영비 전액을 예산에 넣어도 income이 커서 문제가 없지만, 달처럼 income이 낮고
   * 유지비가 큰 맵에서는 이것이 "발행 → issuedShares↑ → expenses↑ → cashNeeded↑ → 또 발행"의
   * 자기증폭 고리가 된다(2026-07-21 실측: 매 턴 발행 캡 소진, 주식 14.7 = VP −44).
   * true면 `max(0, expenses - max(0, income))`만 예산에 반영 — **필요한 돈을 막는 게 아니라
   * 이미 income으로 충당되는 몫을 이중 계상하지 않는 것**(과거 기각된 "발행 차단"과 다름).
   */
  get aiPlanExpensesNetOfIncome(): boolean { return false; }

  /**
   * AI 경로 평가용 **배달 타이밍 계수** — 배달당 가치에 곱하는 배수 (기본 1 = 항등).
   * 목적지가 "언제 받아주느냐"의 유연성을 순위에 반영한다. AI 평가 전용 — 실제 규칙 무관.
   * ⚠️ `cubeDeliveryBonus`/`regionDeliveryBonus`는 스토어가 income에 직접 더하는 **게임 규칙 훅**이라
   *    AI 평가용으로 전용하면 안 된다 (그래서 별도 훅으로 분리).
   * ⚠️ 반드시 **배달당 가치(perDeliveryVP)** 에 곱할 것 — `deliverableTurns`에 곱하면
   *    `expectedDeliveries = min(deliverableTurns, matchingCubes)`의 큐브 쪽 병목에 묻혀 무효가 된다
   *    (2026-07-21 실측: 무조건 반감을 넣어도 VP 변화 0.03).
   * Moon: 검은 큐브는 밤쪽 도시 어디든 받아 매 턴 배달처가 있음(우대), 색 큐브는 목적지가
   *   낮인 격턴에만 가능(첫 배달 예상 턴이 밤이면 1턴 더 대기 = 소폭 할인).
   */
  aiDeliveryTimingFactor(
    _to: City, _cube: CubeColor, _startTurn: number, _state: GameState, _playerId?: PlayerId
  ): number { return 1; }

  /**
   * AI 경로 평가용 **가산 보너스** — 이 경로의 완성이 여는 "미모델링 VP 원천"을 더한다
   * (기본 0 = 항등). `transcontinentalVP`(vp.ts, 대륙횡단 즉시 보너스)와 같은 계열의 가산형 훅 —
   * `aiDeliveryTimingFactor`(곱셈, 배달당 가치 조정)와 달리 경로 전체에 한 번 가산된다.
   * ⚠️ **기각 이력(2026-07-21, 달)**: 성장 연결(낮쪽+Moon Base 연결 도시만 성장) 가치를 여기 얹는
   * 실험 — 최소 자극조차 VP 악화, 크기 비례 악화(estimateRouteVP가 이미 "현재 큐브"를 정확히
   * 보는데 "미래 성장 큐브" 가치를 얹으면 이중 계상). docs/ai-auction-baseline-100seed.md 참조.
   * 현재 아무 맵도 override하지 않음 — 배관만 유지(다른 축이 재사용 가능).
   */
  aiRouteExtraVP(
    _state: GameState, _playerId: PlayerId, _opp: DeliveryOpportunity,
    _fullPath: HexCoord[], _deliveryStartDelay: number,
  ): number { return 0; }

  /**
   * AI 건설 후보 게이트 (DI 지점) — "이 배달 경로를 지금 착공/계속해도 되는가".
   * 일반 알고리즘(strategies/buildTrack의 후보 루프)이 경로마다 호출하고, 맵 전용 건설
   * 제약은 프로파일 override로 주입한다. 기본 = 항상 허용(항등). 비용 계산이 필요한
   * 맵만 지연 썽크(ctx.missingWork)를 호출하므로 기본 맵은 추가 비용 0.
   *
   * Germany(requireCompleteLinks) override: 이번 턴 잔여 슬롯·현금으로 경로 전체를
   * 완성 못 하면 착공 금지 — 부분 건설은 단계 전환 시 removeIncompleteNewTracks가
   * 삭제·환불하므로 "짓다 사라짐"만 반복(2026-07-22 사용자 관찰). 과거 인라인 게이트는
   * 첫 슬롯·슬롯 수만 검사해 중간 슬롯 착공·현금 부족(숫자 헥스 $6~12)을 놓쳤다.
   */
  aiRouteBuildGate(_ctx: AiRouteBuildGateContext): boolean { return true; }

  /**
   * 맵 전용 추가 행동(extraActions)의 AI 선호 ΔVP (DI 지점) — 행동 자체가 맵 전용이므로
   * 평가식도 프로파일이 소유한다. selectAction의 공유 switch는 기본 7종 외 행동에 대해
   * 이 훅을 호출한다. 기본 0 = 등록만 되고 평가 미구현인 행동은 선택하지 않음.
   * (Moon lowGravitation이 유일한 구현 — MoonMapProfile 참조)
   */
  aiExtraActionVP(_action: SpecialAction, _state: GameState, _playerId: PlayerId): number { return 0; }

  /**
   * AI 경로 선택의 **거점 거리 감점(areaBias)** 사용 여부 (기본 true = 기존 동작).
   * false면 경로 점수에서 "내 거점에서 먼 출발 도시 감점"을 끈다 — 거점 배정(혼잡 회피 참조점,
   * 반구 균형)은 그대로 유지된다. Korea가 dynamicCityColors 조건으로 끄는 것과 같은 처방의
   * 훅 일반화. ⚠️ **기각 이력(2026-07-21, 달 100시드)**: 파산의 92%가 나쁜 거점(nubium/nectaris)
   * 봇이라 "areaBias가 격차를 증폭한다"는 가설로 달을 false로 했으나 VP −3.94→−4.78 악화 —
   * 달에서도 areaBias의 충돌 감소 순기능이 격차 증폭보다 컸다. 현재 끄는 맵 없음(배관만 유지).
   */
  get aiHomeBaseAreaBias(): boolean { return true; }

  /**
   * AI 경로 선택의 **겹침 판정 완화** — 상대 커밋 경로와 "도시 하나만 공유"하는 경로를
   * 완전 차단(-Infinity) 대신 이 값만큼 감점한다 (기본 null = 기존 동작 = 도시 하나만
   * 공유해도 완전 차단, Korea는 별도 감점). **정확히 같은 연결**(from-to 쌍, 방향 무시)은
   * 이 훅과 무관하게 항상 완전 차단 유지 — 같은 링크 정면 충돌(중복 부설 경쟁)은 여전히 막는다.
   * Moon: 배달 기회가 Moon Base 단일 허브에 몰려 있어, 앞 순번 1~2명이 moonBase 경로를
   * 잡는 순간 뒷순번의 정밀 평가 후보 top-K가 전부 -Infinity로 죽고 fallback이 겹침·평가를
   * 무시한 경로를 커밋했다(2026-07-21 30시드 계측: 스나이핑 20.2건/게임, 그중 52%가 fallback
   * 우회 커밋 — T1에서 3·4번이 같은 moonBase→imbrium을 잡고 충돌). moonBase는 화물이
   * 인원×2개라 출발지 공유는 정상 플레이 — 감점으로 낮춰 뒷순번도 평가된 경로를 갖게 한다.
   */
  get aiRouteOverlapSharedCityPenalty(): number | null { return null; }

  /**
   * 홈베이스(거점) 배정용 **구역 키** (기본 null = 구역 개념 없음, 기존 그리디 그대로).
   * 같은 키를 가진 도시는 서로 경쟁 구역 — `assignHomeBases`(selector.ts)가 이미 배정된
   * 인원이 목표치(⌈인원/구역수⌉)에 찬 구역을 후순위로 밀어 구역 간 인원을 고르게 분산한다.
   * Moon: 동/서 반구(getMoonSide)가 구역 — 그리디 최원거리 배정이 반구를 무시해 4인 중
   * 2명이 같은 반구(3개 도시)에 몰리고 나머지 반구는 1명이 독점하는 1:2 불균형이 났다
   * (2026-07-21 실측: 독점 반구 파산율 13~17% vs 공유 반구 57~67% — 4~5배 차이가 VP
   * 격차 −4.9/−2.2 vs −23.1/−15.8의 주 원인).
   */
  aiHomeBaseGroup(_city: City): string | null { return null; }

  /** AI 경로 평가의 "지연 완성 페널티" (완성이 1턴 늦어질 때마다 −N VP, cityCubes 다인 맵).
   *  타이밍 실비(배달 시작 지연의 현금 흐름 손실 + 엔진 증분 유지비, vp.ts estimateRouteVP)가
   *  직접 계산되면서 이 값은 잔여 리스크(선점·자금 불확실성)의 프록시로 축소 — 8을 유지하면
   *  실비와 겹쳐 다턴 경로 이중 청구(Southern −1.06 회귀, 2026-07-14 100시드).
   *  trackCubes 맵은 vp.ts에서 0 (미적용). */
  get lateCompletionPenaltyPerTurn(): number { return 4; }
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
