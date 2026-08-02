// Montréal Métro 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 규칙만 override
//
// 특수 규칙(원본 룰 — rules/AoS_Montreal_Rules.doc):
//  - 3인 전용 9라운드, 물품 성장(IX) 단계 없음 (물품 디스플레이 미사용)
//  - 정부 링크: 매 라운드 주식 발행 전, 정부 관리 플레이어(순번 로테이션)가 중립 링크 1개 무료 건설
//    (누구나 사용 가능하나 수입 없음, governmentLinks)
//  - 마스터 네트워크: 보드 위 모든 트랙(정부 포함)의 총합이 항상 연속 (masterNetwork)
//  - Locomotive: 일반 엔진 대신 정부 전용 엔진(DGEL) +1 — 정부 링크 위 추가 이동 전용, 비용에 합산
//    (dedicatedGovEngine). DGEL을 올리는 유일한 방법.
//  - 경매: 무입찰 패스 2인 이상이면 그들은 이번 턴 특수 행동 선택 불가 (auctionNoBidPassPenalty)
//  - Production → Repopulation: 선택 즉시 주머니에서 3개 뽑아 1개를 맵의 도시에 배치 (productionAsRepopulation)
//  - 셋업: 신규 도시 타일마다 큐브 1개 — 도시화 시 함께 보드에 (newCitySetupCube)
//  - 지형 비용(평지 $2/언덕 $3/도로 $4/물 $6·예외 $5)과 Parc Mont-Royal 건설 금지는
//    보드 데이터(HexTile.fixedCost / blockedEdges)로 표현 — montrealMap.ts

import { StandardMapProfile } from './StandardMapProfile';
import { MapRuleSummary } from '../MapProfile';
import { MapId } from '../MapId';
import { SpecialAction } from '@/types/game';
import {
  MONTREAL_MAP,
  MONTREAL_CITY_CUBE_COUNTS,
  createMontrealBoardState,
} from '@/utils/montrealMap';

export class MontrealMapProfile extends StandardMapProfile {
  constructor() {
    super({
      id: MapId.Montreal,
      name: MONTREAL_MAP.name,
      nameKo: MONTREAL_MAP.nameKo,
      supportedPlayers: MONTREAL_MAP.supportedPlayers,
      maxTurns: MONTREAL_MAP.maxTurns,
      createBoardState: createMontrealBoardState,
      engineMax: 4, // 좁은 맵 + DGEL(정부 링크 추가 이동)이 있어 일반 엔진 과투자는 낭비
    });
  }

  override get cityCubeCounts(): Record<string, number> {
    return MONTREAL_CITY_CUBE_COUNTS;
  }

  // 원본 시트: 도시 숫자 박스(초기 화물 수)는 어두운 박스 + 흰 숫자
  override isCityNumberBoxBlack(): boolean { return true; }

  // ── 몬트리올 특수룰 플래그 ──
  override get governmentLinks(): boolean { return true; }
  override get masterNetwork(): boolean { return true; }
  override get dedicatedGovEngine(): boolean { return true; }
  override get auctionNoBidPassPenalty(): boolean { return true; }
  override get productionAsRepopulation(): boolean { return true; }
  override get newCitySetupCube(): boolean { return true; }
  // 물품 성장 단계 없음 (mapRegistry rules.skipGoodsGrowth와 이중 안전망)
  override get skipGoodsGrowth(): boolean { return true; }

  // ── 몬트리올 AI 재무 훅 (달에서 실증된 훅 3종을 몬트리올 값으로, 2026-07-25) ──
  // 진단(3봇 로그 wbmv): 전원 주식 만발행(14~15)·기차III 파산 VP −45 — 몬트리올은
  // 언덕$3/도로$4에 income 성장이 느려(정부 링크 무수입·성장 없음) 후반 차입 회수가 안 된다.
  // 달과 동일 병리(만성 저수입 차입 자기증폭)라 같은 처방. ⚠️ 100시드 게이트로 검증 예정.
  /** 후반 5라운드(9라운드 중 T5~9)는 건설 계획 발행 금지 — 생존 발행은 허용.
   *  스윕①(100시드, 마을 기본료 도입 **전**): 4→VP12.51·파산0.74 / 5→13.84·0.76 /
   *    6→13.46·0.70 / 7→9.42·0.88(과소투자 붕괴) → 당시엔 **파산 최소**인 6을 채택(사용자 우선순위).
   *  스윕②(100시드, 2026-08-02 마을 기본료 도입 **후** 재측정 — 선행조건이 바뀌면 결론도 바뀐다):
   *    4→VP9.57·파산0.80·주식11.61 / 5→**10.97**·0.81·10.88 / 6→10.36·0.81·10.29
   *    → 비용이 오르면서 **파산이 셋 다 0.80~0.81로 평평해져** 6을 고를 근거(파산 최소)가 사라졌다.
   *    VP 최고인 5로 교체. 4는 건설·income이 가장 높지만(42.1/12.49) 주식이 11.61로 불어 VP가 깎인다
   *    — "투자를 늘리면 좋다"가 무한정 성립하진 않는 지점.
   *  엔진 상한 3은 VP 6.36·파산 0.83으로 기각(엔진4 필수). */
  override get aiNoBuildIssueLastTurns(): number { return 5; }
  /** 발행→비용↑→필요현금↑→또 발행의 자기증폭 차단 (달 최대 기여 훅) */
  override get aiPlanExpensesNetOfIncome(): boolean { return true; }
  /** 최대 발행으로도 파산 회피 불가면 발행 포기 — VP만 깎는 무의미 발행 방지 */
  override get aiSkipHopelessSurvivalIssue(): boolean { return true; }
  /** 배달 실행 문턱 = 순수 ΔVP>0 (tie-break 제외) — 정부 링크 0수입 배달 차단 (100시드 VP 5.43→12.51) */
  override get aiStrictDeliveryVP(): boolean { return true; }
  /** own0/opp0 순수 차단(정부 링크 경유)에 선점 보너스 인정.
   *  기각(2026-07-25): off 실험 → VP 13.56·파산 0.77 (on 14.82·0.70) — 약자 봇이 차단
   *  배달로 수송 기회를 소진하는 개별 사례는 있으나, 통계적으론 차단이 상대 수입을 눌러
   *  VP·파산 모두 개선. 파산의 근본 원인은 차단이 아니라 초반 자기 링크 확보 실패. */
  override get aiPreemptZeroIncomeDenial(): boolean { return true; }
  /** ⚠️ 기각 (2026-08-02, 100시드): 도시화 가산 +1.5 → VP 12.23→**7.91** · 파산 0.73→0.99.
   *  가설은 "성장 없는 맵이라 화물이 마른다(잔여 6.1개) → 셋업 화물을 달고 오는 신도시를
   *  더 쓰자"였는데, 도시화가 3.13→6.21로 2배가 되자 **잔여 화물도 6.1→12.8로 2배**가 됐다.
   *  → 잔여 화물은 "고갈"이 아니라 **"다 못 나른 나머지"**였다. 이 맵의 병목은 화물 공급이
   *    아니라 **배달 능력(노선)**이다. 같은 전제로 실패한 Repopulation 실험(VP −11.55)과 한 쌍 —
   *    공급을 늘리는 처방은 이 맵에서 전부 역효과다.
   *  ⚠️ 건설 40.5→38.6·배달 41.0→37.5은 **행동 슬롯을 뺏겨서가 아니다** — 룰상 도시화는
   *    "배치 무료 + 트랙 3개 그대로"라 건설을 소모하지 않는다. 파산 0.73→0.99로 **조기 종료가
   *    6게임→23게임**(평균 완주 8.78→7.97턴) 늘어 총량이 줄어든 것이다. 감소율이 완주턴
   *    감소율과 거의 일치한다. 파산이 는 원인은 ① 다른 행동(First Move·Engineer) 포기의
   *    기회비용 ② 경로 중간에 생긴 같은 색 신도시가 화물을 조기 정차시켜 링크 수를 깎는 것
   *    (income −12.1%가 완주턴 −9.2%보다 크다) 중 하나로 보이나 미규명.
   *  훅은 남겨 둠(다른 맵에서 유효 가능). */
  /** ⚠️ 기각 스윕(2026-07-25, 100시드) — 경매 상시 참여·꼴등 턴오더 가중 (사용자 제안 검증):
   *  기본(참여 강제 없음·턴오더 0.1) 14.82/파산0.70 ← 최적
   *  턴오더 0.5 → 6.26/0.91 · 턴오더 2.0 → 0.56/1.18 · 상시 참여 → −0.17/1.01 ·
   *  결합(참여+2.0) → −7.94/1.43. 몬트리올 봇 경제에서 경매 참여=현금 유출+행동(추가
   *  지출 경로) 획득이고, 턴오더=이번 턴 경제 행동 0개라 순서 가치가 기회비용에 못 미침.
   *  훅·구현은 남겨둠(aiAuctionAlwaysParticipate / turnOrderSeatVP) — 켜면 재현 가능. */
  /** 행동권 확보 참여(정밀판, 최선 행동 ΔVP > 입찰비 조건)도 기각: 2.35/파산 1.08 —
   *  행동 가치 평가가 몬트리올에서 과대(회수 미달)라 조건이 사실상 항상 참 → 전원 참여
   *  동학 재현. "경매 밴 = 과지출 브레이크"가 3개 변형에서 일관 확인됨. */
  // (지연 완성 페널티 11 오버라이드는 제거 — vp.ts가 배달 시작 지연의 현금 흐름 손실과
  //  엔진 증분 유지비를 직접 계산하게 되면서 기본값으로도 즉시 경로가 자연 우선됨. 2026-07-14)

  override actionDescription(action: SpecialAction): string | undefined {
    if (action === 'locomotive') {
      return '일반 엔진 대신 정부 전용 엔진(DGEL)이 +1 됩니다. DGEL만큼 정부 링크 위를 추가로 이동할 수 있고, 비용 지불에 합산됩니다.';
    }
    if (action === 'production') {
      return 'Repopulation — 선택 즉시 주머니에서 화물 3개를 뽑아 그중 1개를 맵의 도시에 배치합니다.';
    }
    return undefined;
  }

  override get buildCostHint(): string {
    return '평지: $2 / 언덕: $3 / 도로: $4 / 물: $6 (Jean-Drapeau 우측만 $5)';
  }

  override get specialRules(): MapRuleSummary[] {
    return [
      { title: '3인 9라운드', detail: '몬트리올 메트로 — 3명 전용, 9라운드로 진행합니다.' },
      {
        title: '정부 링크',
        detail: '매 라운드 시작(주식 발행 전)에 정부 관리 플레이어(1st→2nd→3rd 순번 로테이션)가 중립 링크 1개를 무료로 건설합니다. 누구나 사용할 수 있지만 수입은 없습니다.',
      },
      {
        title: '마스터 네트워크',
        detail: '보드 위 모든 트랙(정부 트랙 포함)은 항상 하나로 이어져 있어야 합니다. 첫 정부 링크가 네트워크의 시작점입니다.',
      },
      {
        title: 'Locomotive → 정부 엔진(DGEL)',
        detail: 'Locomotive 행동은 일반 엔진 대신 정부 전용 엔진 레벨을 +1 합니다. 배달 때 DGEL만큼 정부 링크를 추가로 이용할 수 있고, 비용 지불에도 합산됩니다.',
      },
      {
        title: '경매 무입찰 패스 페널티',
        detail: '경매에서 입찰 없이 패스한 플레이어가 2명 이상이면, 그들은 이번 라운드 특수 행동을 선택할 수 없습니다.',
      },
      {
        title: 'Production → Repopulation',
        detail: '선택 즉시 주머니에서 화물 3개를 뽑아 1개를 맵의 도시에 배치합니다 (물품 성장 단계 없음).',
      },
      {
        title: '지형 비용 / Parc Mont-Royal',
        detail: '평지 $2 · 언덕 $3 · 도로 $4 · 물 $6 (예외 1곳 $5). 굵은 외곽선의 Parc Mont-Royal 3헥스는 관통 건설 불가.',
      },
      { title: '신규 도시 화물', detail: '신규 도시 타일마다 셋업 때 화물 1개가 올려져 있어 도시화 시 함께 보드에 올라갑니다.' },
    ];
  }
}
