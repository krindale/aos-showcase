// Germany: Engineer 절반 할인 계산 (룰북 "may place one track tile at half the cost, rounded up")
//
// 룰북은 어느 타일에 할인을 쓸지 플레이어가 고르지만, 이 게임은 타일을 하나씩 커밋하므로
// 건설 시점엔 뒤에 더 비싼 타일이 올지 알 수 없다. 그래서 "이번 빌더 턴에 지은 타일 중 가장
// 비싼 1개가 절반(올림)"이 항상 성립하도록 매 건설마다 차액을 정산한다 — 플레이어가 최적으로
// 골랐을 때와 결과가 같고, 건설 순서에 영향받지 않으며, 화면의 현금도 실시간으로 정확하다.
//
//   $2 → $12 순서: $1 + $7 = $8      $12 → $2 순서: $6 + $2 = $8
//
// ⚠️ 지형/비용 하한 조건을 두지 말 것 — 룰북엔 없다. 평지($2)만 짓는 턴도 $1로 깎인다.

import { PhaseState } from '@/types/game';

export interface EngineerDiscountResult {
  /** 이 타일에 실제로 청구할 금액 (정가 − 이번에 추가로 깎아줄 차액) */
  charge: number;
  /** 갱신된 phaseState 조각 */
  engineerMaxTileCost: number;
  engineerDiscountGiven: number;
}

/**
 * 타일 정가(tileCost)에 Engineer 절반 할인을 반영한 청구액과 갱신 상태를 돌려준다.
 * 마을 가닥 비용은 타일 비용이 아니므로 호출자가 이 결과에 따로 더한다.
 *
 * @param tileCost 지형/고정비용까지 반영된 이 타일의 정가
 * @param phaseState 현재 단계 상태 (engineerMaxTileCost / engineerDiscountGiven)
 */
export function applyEngineerDiscount(
  tileCost: number,
  phaseState: Pick<PhaseState, 'engineerMaxTileCost' | 'engineerDiscountGiven'>
): EngineerDiscountResult {
  const prevMax = phaseState.engineerMaxTileCost ?? 0;
  const given = phaseState.engineerDiscountGiven ?? 0;

  const nextMax = Math.max(prevMax, tileCost);
  // 최고가 타일을 절반(올림)으로 = floor(max/2) 만큼 깎아준다.
  const desired = Math.floor(nextMax / 2);
  // 이미 깎아준 만큼은 빼고 차액만 이번 청구에서 추가로 할인.
  // prevMax >= tileCost면 desired === given이라 정가 청구. 청구액은 항상 ceil(tileCost/2) 이상이라 음수 불가.
  const charge = tileCost - (desired - given);

  return { charge, engineerMaxTileCost: nextMax, engineerDiscountGiven: desired };
}

/** 이 플레이어·맵에서 Engineer 절반 할인이 적용되는가 (Germany + engineer 선택). */
export function hasEngineerDiscount(
  engineerHalfCost: boolean,
  selectedAction: string | null | undefined
): boolean {
  return engineerHalfCost && selectedAction === 'engineer';
}
