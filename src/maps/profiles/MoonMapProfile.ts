// 달(The Moon) 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 규칙만 override
//
// 특수 규칙(원본 룰 — rules/AosExpMoon.md):
//  - 3~4인 8턴
//  - 건설: 턴당 2개(Engineer 3개 — 표준 3/4에서 −1), 크레이터 $3 / 산 $4
//  - Moon Base 네트워크: 모든 트랙은 Moon Base에서 시작하거나 그 네트워크에 이어져야 함
//    (masterNetwork + masterNetworkSeedCityId='moonBase')
//  - 랩 어라운드: 외곽 같은 번호 변끼리 연결 (보드 데이터 wrapEdges — moonMap.ts)
//  - Moon Base: 색·수요 없는 도시 (City.noDemand) — 출발/통과 전용
//  - 밤/낮: 매 턴 절반이 밤 — 밤쪽 도시는 검은 도시(검은 큐브만 배달, 타색은 통과도 불가).
//    물품 성장 후 교대 (nightDayCycle, GameState.nightSide)
//  - Production → Low Gravitation: 이동 때 상대 링크 1개를 내 링크처럼(수입 포함) 사용
//  - 물품 성장: 주사위 인원×2 — 낮쪽 + Moon Base 연결 도시만 주머니에서 직접 성장
//    (cityDiceGrowth, 도시 인쇄 번호 1/2·3/4·5/6)
//  - 신규 도시 C, D, G, H 제거 (columnMapping에 A, B, E, F만 등록 — moonMap.ts)

import { StandardMapProfile } from './StandardMapProfile';
import { MapRuleSummary } from '../MapProfile';
import { MapId } from '../MapId';
import { City, CubeColor, GameState, PlayerId, SpecialAction } from '@/types/game';
import { findCompletedLinks, isTrackPartOfCompletedLink } from '@/utils/hexGrid';
import {
  MOON_MAP,
  MOON_CITY_DICE,
  createMoonBoardState,
  getMoonSide,
  nightSideAfter,
} from '@/utils/moonMap';

/**
 * 이 플레이어의 완성 링크가 닿아 있는 반구 집합 (달 반구 포트폴리오 판정용).
 * 링크 양끝 정거장의 반구를 모은다 — 중앙 열(Moon Base)은 어느 쪽도 아니므로 제외.
 * 경로 평가마다 호출되므로 보드 인스턴스 단위로 캐시한다(턴 중 보드는 불변 참조).
 */
const coveredCache = new WeakMap<object, Map<string, Set<'west' | 'east'>>>();
function coveredSides(state: GameState, playerId: PlayerId): Set<'west' | 'east'> {
  let byPlayer = coveredCache.get(state.board);
  if (!byPlayer) { byPlayer = new Map(); coveredCache.set(state.board, byPlayer); }
  const hit = byPlayer.get(playerId);
  if (hit) return hit;

  const sides = new Set<'west' | 'east'>();
  for (const link of findCompletedLinks(state.board)) {
    if (link.owner !== playerId) continue;
    for (const end of [link.startCity, link.endCity]) {
      const side = getMoonSide(end);
      if (side) sides.add(side);
    }
  }
  byPlayer.set(playerId, sides);
  return sides;
}

export class MoonMapProfile extends StandardMapProfile {
  constructor() {
    super({
      id: MapId.Moon,
      name: MOON_MAP.name,
      nameKo: MOON_MAP.nameKo,
      supportedPlayers: MOON_MAP.supportedPlayers,
      maxTurns: MOON_MAP.maxTurns,
      createBoardState: createMoonBoardState,
    });
  }

  /** 셋업: 일반 도시 2(기본), Landing hex(Moon Base)는 플레이어 인원당 2개 (공식 룰) */
  override get perPlayerCityCubes(): Record<string, number> {
    return { moonBase: 2 };
  }

  /** 원본 시트: 동쪽 도시(Nectaris·Tranquillitatis·Serenitatis)만 검은 숫자 박스 */
  override isCityNumberBoxBlack(cityId: string): boolean {
    return ['nectaris', 'tranquillitatis', 'serenitatis'].includes(cityId);
  }

  // ── 달 특수룰 플래그 ──
  /** 턴당 건설 2개 (Engineer 3개) — 표준 3/4에서 −1 */
  override get buildsPerTurn(): number { return 2; }
  /** 모든 트랙이 Moon Base 네트워크에 이어져야 함 */
  override get masterNetwork(): boolean { return true; }
  override get masterNetworkSeedCityId(): string | null { return 'moonBase'; }
  /** 밤/낮 교대 */
  override get nightDayCycle(): boolean { return true; }
  /** 저중력 — 달 전용 8번째 행동 (공식 룰: "new action". Production은 표준 기능 유지) */
  override get extraActions(): SpecialAction[] { return ['lowGravitation']; }

  /**
   * 저중력(lowGravitation) AI 선호 ΔVP — 2026-07-22 타인 철도 전 맵 개방 후 효과는
   * "빌린 링크 1개 수입 이전"만 잔존. 가치 ≈ 상대 완성 링크가 많을수록(빌릴 후보↑) —
   * 소액에서 점증, 상한 2.5.
   * ⚠️ 기각(2026-07-21, 100시드): "내 네트워크에 닿은 상대 링크만 집계"하는 정밀화는
   *   VP −11.49→−11.78로 악화(30시드 실측 발동률 43%임에도). 죽은 선택을 걸러도 대체 선택
   *   (production/firstMove)의 가치가 더 낮고, 도시 접점만 보면 마을 접점 확장을 과소집계한다.
   * 최적값(2026-07-22 달 100시드 스윕): base 2.0·계수 0.12·상한 2.5 — 응답면이 결정론적이라
   *   plateau 직접 확인(base 1.8~2.4·cap 2.4~2.8 모두 동일, 중앙값 채택). coef 0=−3.91,
   *   cap 3.0+/coef 0.2는 미세 하락. 원본(0.8/0.1/2.5)=−4.60 → 이 값=−2.15 (+2.45).
   */
  override aiExtraActionVP(action: SpecialAction, state: GameState, playerId: PlayerId): number {
    if (action !== 'lowGravitation') return 0;
    const oppCompleted = state.board.trackTiles.filter(
      t => t.owner && t.owner !== playerId && isTrackPartOfCompletedLink(t.coord, state.board)
    ).length;
    if (oppCompleted === 0) return 0;
    return Math.min(2.5, 2.0 + oppCompleted * 0.12);
  }
  /** 물품 성장: 주사위 → 도시 직접 (디스플레이 미사용) */
  override get cityDiceGrowth(): boolean { return true; }
  override get growthDicePerPlayer(): number { return 2; }
  override get cityGrowthDice(): Record<string, number[]> { return MOON_CITY_DICE; }
  /** 공식 룰: "검은 신규 도시 타일 제거" — 이 구현의 타일 색(E~H=검정) 기준 A·B·C·D(빨/파/보/노) 유지.
   *  밤쪽 도시가 이미 검은 도시 역할을 하므로 검은 신도시는 게임에서 제외된다. */
  override get availableNewCityTiles(): string[] | null { return ['A', 'B', 'C', 'D']; }
  /** 공식 룰: 마을 $2 + 트랙 구간당 $1 — 기본료만 $2로 올리고 가닥당은 표준($1) 그대로.
   *  (2026-08-02 이전엔 기본료 개념이 없어 "가닥당 $2"로 근사했었다) */
  override get townBaseCost(): number { return 2; }

  /** 달: 예비금 면제의 배달 판정은 현재 상태로 — 밤인 목적지는 이번 턴 회수 불가 */
  override get aiExemptionUsesCurrentDemand(): boolean { return true; }
  /** 달: 만성 적자로 "발행해도 어차피 파산"이 잦다 — 그때 발행은 VP만 깎으므로 포기 */
  override get aiSkipHopelessSurvivalIssue(): boolean { return true; }
  /** 달: 배달의 97%가 3링크 이하 — 엔진 3에서 멈춰 유지비를 건설 자금으로 돌린다
   *  (경로 평가는 engineMax=6 그대로라 4링크 경로가 배제되지 않음) */
  override get aiEngineUpgradeCap(): number | null { return 3; }
  /** 달: income이 낮고 유지비가 커 운영비 전액 계상이 발행 자기증폭을 만든다 — income으로 상계 */
  override get aiPlanExpensesNetOfIncome(): boolean { return true; }
  /** 달: 후반 5턴(T4~8) 계획 발행 금지 — $5로 크레이터 1.67타일뿐이라 늦은 차입은 회수 불가
   *  (생존 발행은 계속 허용하므로 파산 방어는 유지) */
  override get aiNoBuildIssueLastTurns(): number { return 5; }
  /** 달: 경로 겹침 판정 완화 — "도시 하나만 공유"는 무감점(0), **같은 연결(from-to 쌍)만
   *  완전 차단**. 도시 6개 + Moon Base 단일 허브(화물 인원×2)라 출발지 공유가 정상 플레이인데,
   *  표준의 완전 차단은 앞 순번이 moonBase 경로를 잡는 순간 뒷순번의 평가 후보 top-K를
   *  전멸시켜 fallback(겹침·평가 무시)이 정면 충돌 경로를 커밋하게 했다 — player3·4 열세와
   *  경로 스나이핑(30시드 20.2건/게임, 식별된 단독 스나이퍼의 52%가 피해자와 도시를 공유 =
   *  앞 순번과 정면 경합)의 근본 원인 (2026-07-21 계측).
   *  100시드 스윕: 0 → VP −3.94·파산 0.87 / 3 → −6.28 / 6 → −6.40 / 10 → −7.53 (단조 악화
   *  — 감점조차 불필요). 같은 연결 차단까지 풀면 −4.47로 악화 → sameLink 차단은 유지. */
  override get aiRouteOverlapSharedCityPenalty(): number | null { return 0; }

  /**
   * 홈베이스 구역 — 동/서 반구(getMoonSide). Moon Base(중앙)는 후보에서 이미 제외되므로
   * null 분기는 실질적으로 도달하지 않지만 안전하게 유지.
   * (2026-07-21 실측: 반구 몰림 완화 전 파산율 west 13~17% vs east 57~67% — 한쪽 반구를
   * 두 플레이어가 나눠 쓰면 income이 반토막나며 만성 적자가 파산으로 직결됐다.)
   */
  override aiHomeBaseGroup(city: City): string | null {
    return getMoonSide(city.coord);
  }

  /**
   * 배달 타이밍 계수 — 밤낮 교대에서 이 목적지가 "얼마나 유연하게" 받아주는가.
   * · 검은 큐브: 매 턴 밤쪽 도시 3곳이 열려 있어 대기 없이 배달 가능 → **1.25 우대**
   *   (달에서 유일하게 타이밍에 안 묶이는 화물 — 봇이 검은 큐브 경로를 잡게 유도)
   * · 색 큐브: 목적지가 낮인 격턴에만 가능. 첫 배달 예상 턴이 이미 낮이면 1.0,
   *   밤이라 1턴 더 기다려야 하면 0.9로 소폭 할인 (기다림의 현금흐름 손실)
   * · Moon Base(무수요·중앙 열)는 목적지가 될 수 없어 판정 불가 → 1.0
   * ⚠️ 색 큐브를 일괄 반감하지 않는 이유: 수익만 깎이고 건설비는 그대로라 착공 자체가
   *   억제된다(안정화 목표에 역행). 상대 우위만 조정한다.
   */
  override aiDeliveryTimingFactor(
    to: City, cube: CubeColor, startTurn: number, state: GameState, playerId?: PlayerId
  ): number {
    const night = state.board.nightSide;
    if (!night) return 1;
    if (cube === 'black') return 1.25;            // 항상 배달처가 있음
    const toSide = getMoonSide(to.coord);
    if (to.noDemand || toSide === null) return 1; // Moon Base(중앙 열)
    const turnsAhead = Math.max(0, startTurn - state.currentTurn);
    let factor = toSide === nightSideAfter(night, turnsAhead) ? 0.9 : 1;

    // ★ 반구 포트폴리오: 내 완성 링크가 이미 이 반구를 커버하고 있으면, 그 반구가 밤인 턴에는
    //   가진 링크가 통째로 놀게 된다. 아직 안 닿은 반대 반구를 우대해 "매 턴 한쪽은 쓸 수 있는"
    //   구성을 만든다 (실측: 수송 스킵의 41%가 "링크가 한쪽 반구에만 있어서" 발생).
    if (playerId) {
      const covered = coveredSides(state, playerId);
      if (covered.size > 0) factor *= covered.has(toSide) ? 0.75 : 1.4;
    }
    return factor;
  }

  override actionDescription(action: SpecialAction): string | undefined {
    if (action === 'engineer') {
      return '이번 턴 트랙 타일을 2개 대신 3개까지 건설할 수 있습니다 (달 맵은 기본 2개).';
    }
    if (action === 'lowGravitation') {
      return '물품 이동 단계에서 다른 플레이어의 링크 1개를 내 링크처럼 사용해 그 수입을 가져옵니다. 수송마다 1회 — 경로에서 수입이 가장 큰 상대의 링크에 자동 적용됩니다.';
    }
    return undefined;
  }

  override get buildCostHint(): string {
    return '크레이터: $3 / 산: $4';
  }

  override get specialRules(): MapRuleSummary[] {
    return [
      { title: '3~4인 8턴', detail: '달 맵 — 3~4명, 8턴. 셋업: 일반 도시 2개씩 + Moon Base(랜딩 헥스)에 인원수×2개의 화물.' },
      {
        title: '건설 2개 제한',
        detail: '한 턴에 트랙 타일을 최대 2개만 건설할 수 있습니다 (Engineer 선택 시 3개). 크레이터 $3 / 산 $4.',
      },
      {
        title: 'Moon Base 네트워크',
        detail: '모든 트랙은 중앙 Moon Base에서 시작하거나 Moon Base와 이어진 선로망에 연결되어야 합니다. Moon Base는 색·수요가 없는 도시로 출발/통과만 가능합니다.',
      },
      {
        title: '랩 어라운드',
        detail: '달은 둥글기 때문에 맵 가장자리로 나간 선로는 반대편의 같은 번호 변으로 이어집니다.',
      },
      {
        title: '밤과 낮',
        detail: '1턴은 서쪽(왼쪽)이 밤으로 시작하고, 물품 성장이 끝날 때마다 밤쪽이 반대로 바뀝니다. 밤쪽 도시는 전부 검은 도시로 취급되어 검은 화물만 배달할 수 있고, 다른 색 화물은 통과도 할 수 없습니다.',
      },
      {
        title: '신규 행동: 저중력 (Low Gravitation)',
        detail: '기본 7종에 더해 8번째 행동. 물품 이동 단계에서 다른 플레이어의 링크 1개를 내 링크처럼 사용해 그 수입을 가져옵니다 (수송 라운드마다 1회). Production(생산)은 기본 게임 그대로 유지됩니다.',
      },
      {
        title: '물품 성장',
        detail: '주사위를 인원수×2개 굴려, 낮쪽에 있으면서 Moon Base와 완성 링크로 연결된 도시(인쇄 번호 1/2·3/4·5/6 일치)만 물품 디스플레이의 자기 열에서 화물을 받습니다. 조건 미달이면 디스플레이에 남습니다. 신규 도시 타일은 A·B·C·D만 사용합니다(검은 신도시 제거).',
      },
    ];
  }
}
