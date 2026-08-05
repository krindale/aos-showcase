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
import { MapRuleSummary } from '../MapProfile';
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

  // ⑤ 성장 주사위 4(라이트)+4(다크) — 인원수 무관 고정
  override get growthDiceSplit(): { light: number; dark: number } | null {
    return { light: 4, dark: 4 };
  }

  // ⑥ 경매 패자 절반(올림)
  override get auctionLoserPaysHalf(): boolean { return true; }

  // ④ 지형 비용 안내 (fixedCost 주입 맵은 반드시 override — PhasePanel 문구)
  override get buildCostHint(): string {
    return '평지: $2 / 강: $3 / 산: $4 / 산+강(원 숫자): $5';
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
      { title: '산+강 헥스 $5', detail: '강이 흐르는 산 헥스(원 숫자 표시 3곳)는 트랙 건설 비용이 $5입니다.' },
      { title: 'Turn Order 행동', detail: '이 맵의 Turn Order는 다음 턴 경매를 생략하고 무조건 선공이 되는 강력한 행동입니다.' },
      { title: '경매 패자 절반 지불', detail: '플레이어 순서 경매에서 포기한 플레이어는 자기 입찰액의 절반(올림)만 지불합니다.' },
      { title: '물품 성장 주사위 4+4', detail: '물품 성장에서 라이트(도시 1~6·신도시 A~D)에 주사위 4개, 다크(신도시 E~H)에 4개를 굴립니다. E~H가 배치되기 전엔 다크 주사위는 효과가 없습니다.' },
    ];
  }
}
