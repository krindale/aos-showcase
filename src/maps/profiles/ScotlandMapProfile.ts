// Scotland 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 부분만 override
//
// 정본: rules/AOSD Exp Vol II Rules v2.pdf "Scotland" (Kevin Duffy) + maps/scotland-v2.pdf 인쇄문.
// 2인 전용 8턴 ("the 4-player end"). 변형:
//  ① Turn Order 행동 = 다음 턴 경매 생략·무조건 선공 (turnOrderSkipsAuction)
//  ② 페리 항로 2개(Ayr↔Belfast·Ullapool↔Stornoway) — 양끝 마을이 모두 도시화된 후에만
//     $6 구매 (DirectLink.requiresCities), 건설 액션 1개 소모, 완성 후엔 일반 링크
//  ③ Ayr↔Glasgow 특수 링크 $2 — 마을 상태에선 표준 마을 가닥($1+$1=$2)이 링크 그 자체,
//     Ayr 도시화 시 가닥 소유자에게 직결 링크로 승계 (placeNewCity — "제거되지 않는다")
//  ④ 산+강 헥스 $5 (헥스 fixedCost — 맵 데이터 주입)
//  ⑤ 물품 성장: 주사위 4개(라이트: 도시·A~D) + 4개(다크: E~H) — growthDiceSplit
//  ⑥ 경매 패자 절반(올림) 지불 (v2 시트 인쇄문 — 룰북과 충돌 없는 보완)
//  ⑦ 셋업: 주머니 색깔별 큐브 −6 (v2 시트 — mapRegistry goodsCubeCounts로 주입)

import { StandardMapProfile } from './StandardMapProfile';
import { AiRouteBuildGateContext, MapRuleSummary } from '../MapProfile';
import { MapId } from '../MapId';
import { SpecialAction } from '@/types/game';
import { SCOTLAND_MAP, createScotlandBoardState } from '@/utils/scotlandMap';

export class ScotlandMapProfile extends StandardMapProfile {
  constructor() {
    super({
      id: MapId.Scotland,
      name: SCOTLAND_MAP.name,
      nameKo: SCOTLAND_MAP.nameKo,
      supportedPlayers: SCOTLAND_MAP.supportedPlayers, // [2] — 2인 전용
      maxTurns: SCOTLAND_MAP.maxTurns, // 8턴 고정
      createBoardState: createScotlandBoardState,
      engineMax: 5, // 도시 6개 소형 보드 — 엔진 6까지의 유지비 과투자 방지 (튜토리얼 3 선례)
    });
  }

  // ① Turn Order = 다음 턴 경매 생략·무조건 선공
  override get turnOrderSkipsAuction(): boolean { return true; }

  // ── AI 재무 튜닝: 계획 발행 전면 금지 (전 8턴 — 생존 발행은 항상 허용) ──
  // 소형 보드(도시 6·8턴)는 배달 공급이 얇아 income 성장이 주식 유지비를 못 따라간다.
  // 100시드 스윕(금지 턴 3/5/6/7/8): VP −9.4→−7.1→−5.5→−0.1→+7.0, 파산 0.79→0.30 —
  // 시작 자금($10) + 생존 발행만으로 충분하며 계획 발행은 전 구간에서 순손실이었다.
  // (aiPlanExpensesNetOfIncome·aiSkipHopelessSurvivalIssue·aiEngineUpgradeCap은 이 값에선
  //  전부 무효라 걸지 않는다 — 계획 발행 자체가 없으면 닿지 않는 코드. 2026-08-05 A/B 확인)
  override get aiNoBuildIssueLastTurns(): number { return 8; }
  // 적응형 레버리지: income이 뒤질 때만 계획 발행 허용 (MapProfile 훅 주석 참조)
  override get aiLeverageWhenBehind(): boolean { return true; }
  // 레버리지 완충 (달 선례): 발행 자기증폭 차단 + 가망 없는 생존 발행 포기
  override get aiPlanExpensesNetOfIncome(): boolean { return true; }
  override get aiSkipHopelessSurvivalIssue(): boolean { return true; }
  // 좀비 락 탈출: income 0이면 계획 발행 금지의 예외로 회생 발행 허용 (MapProfile 훅 주석 참조.
  // 사람이 큐브를 선점해 봇 income이 0으로 깎이면, 생존 발행 $5 = 유지비 전액 소멸 +
  // 예비금 게이트 예산 $0의 영구 락 — 2026-08-05 실플레이 리포트)
  override get aiRecapitalizeAtZeroIncome(): boolean { return true; }

  // 이번 턴 잔여 슬롯·"예비금 뺀 현금"으로 첫 미완성 링크를 완성 못 하면 착공/계속 금지.
  // 계획 발행이 없는 이 맵은 T1 현금 $10뿐이라, 예비금에 걸린 봇이 "비싼 경로 계속" 대신
  // "싼 새 출발점"으로 갈아타며 미완성 토막을 여러 개 벌였다 — 사용자 버그 리포트 2026-08-05:
  // T1에 세 곳 분산 착공(완성 링크 1 + 방치될 토막 2). 완성 못 할 착공은 돈을 아꼈다가
  // 다음 턴에 링크를 끝내는 편이 낫다.
  // ⚠️ cash가 아니라 cash−reserve로 판정 — cash만 보면(독일식) 착공은 통과하는데 마지막
  // 타일에서 건설 예비금 규칙에 걸려 경로가 중간에 끊긴다 (2차 리포트: Glasgow→Oban 2타일
  // 경로를 $7로 착공 → $5 지점에서 예비금 $3 미달로 중단, 토막 1개 잔존).
  override aiRouteBuildGate(ctx: AiRouteBuildGateContext): boolean {
    const work = ctx.missingWork();
    if (work === null) return false;
    return work.tiles <= ctx.remainingSlots && work.cost <= ctx.cash - ctx.reserve;
  }

  // ⚠️ 기각 실험(2026-08-05d): 체인 연결 보너스 — aiRouteExtraVP로 "경로 끝이 내 네트워크
  // 도시면 +N VP" 가산(사용자 관찰: 봇이 +1짜리 독립 토막으로 찢는 동안 사람은 체인 +3/+3).
  // 100시드 스윕 N=0/2/4/8 → VP 12.22/12.17/12.11/10.95 (단조 악화·개선 없음). 예선 점수의
  // 연결 출발 +10이 이미 상위 K를 편향하고, 정밀 ΔVP는 실제 배달 수입(다링크 포함)을 직접
  // 계산하므로 휴리스틱 가산은 왜곡만 더한다 (달 성장 가치 기각과 동일 패턴 — 이중 계상).
  // 토막 분산의 진짜 원인은 초반 현금 제약(게이트가 이미 처리)이었다.

  // ⑤ 성장 주사위 4(라이트)+4(다크) — 인원수 무관 고정
  override get growthDiceSplit(): { light: number; dark: number } | null {
    return { light: 4, dark: 4 };
  }

  // ⚠️ 기각 실험(2026-08-05f): turnOrderSeatVP 상향 — "이 맵 Turn Order는 경매 생략+무조건
  // 선공의 강화판인데 봇이 안 쓴다"는 관찰로 0.1→0.3→1.0 스윕 → VP 13.95→8.43→2.03 단조 폭락.
  // 행동은 턴당 하나뿐이라(몬트리올 Repopulation 기각과 동일 원리) 턴오더에 쓴 슬롯의 기회비용
  // (engineer 4건설·firstBuild·urbanization)이 "다음 턴 무경매 선공" 가치(2인 경매는 패자 절반
  // $1~2 수준이라 애초에 싸다)를 압도한다. 봇이 안 고르는 게 측정상 최적 — 기본 0.1 유지.

  // ⑥ 경매 패자 절반(올림)
  override get auctionLoserPaysHalf(): boolean { return true; }

  // ④ 지형 비용 안내 (fixedCost 주입 맵은 반드시 override — PhasePanel 문구)
  override get buildCostHint(): string {
    return '평지: $2 / 강: $3 / 산: $4 / 강+산: $5';
  }

  // Turn Order 설명 보정 (도움말/행동 선택 UI)
  override actionDescription(action: SpecialAction): string | undefined {
    if (action === 'turnOrder') {
      return '다음 턴 플레이어 순서 결정에서 경매 없이 무조건 선공이 됩니다.';
    }
    return undefined;
  }

  override get specialRules(): MapRuleSummary[] {
    return [
      { title: '2인 전용 8턴', detail: '스코틀랜드는 2인 전용 맵이며 8턴을 플레이합니다. 셋업 시 주머니에서 색깔별 큐브 6개를 제거하고, 모든 도시에 큐브 2개를 놓습니다.' },
      { title: '페리 항로', detail: 'Ayr↔Belfast, Ullapool↔Stornoway 두 페리 항로는 양끝 마을이 모두 도시화된 후에만 $6에 건설할 수 있습니다(건설 액션 1개 소모). 완성되면 일반 링크처럼 이동·수입이 발생합니다.' },
      { title: 'Ayr↔Glasgow 특수 링크', detail: '인접한 Ayr와 Glasgow는 링크 없이는 화물이 오갈 수 없습니다. 링크는 $2(마을 기본료 $1 + 가닥 $1)로 건설하며, Ayr가 도시화돼도 제거되지 않고 건설자 소유로 유지됩니다.' },
      { title: '강+산 헥스 $5', detail: '강이 흐르는 산 헥스 3곳은 트랙 건설 비용이 $5입니다 (보드 우측 상단 건설 비용 범례의 "강+산" 항목).' },
      { title: 'Turn Order 행동', detail: '이 맵의 Turn Order는 다음 턴 경매를 생략하고 무조건 선공이 되는 강력한 행동입니다.' },
      { title: '경매 패자 절반 지불', detail: '플레이어 순서 경매에서 포기한 플레이어는 자기 입찰액의 절반(올림)만 지불합니다.' },
      { title: '물품 성장 주사위 4+4', detail: '물품 성장에서 라이트(도시 1~6·신도시 A~D)에 주사위 4개, 다크(신도시 E~H)에 4개를 굴립니다. E~H가 배치되기 전엔 다크 주사위는 효과가 없습니다.' },
    ];
  }
}
