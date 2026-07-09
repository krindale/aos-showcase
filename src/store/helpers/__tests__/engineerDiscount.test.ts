import { describe, it, expect } from 'vitest';
import { applyEngineerDiscount, hasEngineerDiscount } from '../engineerDiscount';
import { PhaseState } from '@/types/game';

/** 타일 정가 배열을 순서대로 건설하며 실제 청구액과 잔액 추이를 뽑는다. */
function buildSequence(costs: number[], startCash: number) {
  let ps: Pick<PhaseState, 'engineerMaxTileCost' | 'engineerDiscountGiven'> = {};
  let cash = startCash;
  const charges: number[] = [];
  for (const c of costs) {
    const d = applyEngineerDiscount(c, ps);
    charges.push(d.charge);
    cash -= d.charge;
    ps = { engineerMaxTileCost: d.engineerMaxTileCost, engineerDiscountGiven: d.engineerDiscountGiven };
  }
  return { charges, totalPaid: startCash - cash, endCash: cash };
}

/** 룰북 최적: 정가합에서 최고가 타일의 절반(올림) 만큼만 덜 낸다. */
const optimal = (costs: number[]) =>
  costs.reduce((a, b) => a + b, 0) - Math.floor(Math.max(...costs) / 2);

describe('Engineer 절반 할인 (Germany)', () => {
  it('$10 보유, 2+4+8 타일 — 딱 지을 수 있다 (사용자 제보 케이스)', () => {
    const { charges, totalPaid, endCash } = buildSequence([2, 4, 8], 10);
    expect(charges).toEqual([1, 3, 6]);
    expect(totalPaid).toBe(10);
    expect(endCash).toBe(0);
    expect(totalPaid).toBe(optimal([2, 4, 8])); // 14 - floor(8/2) = 10
  });

  it('$10 보유, 2+8+4 순서 — 총액 동일', () => {
    const { charges, totalPaid } = buildSequence([2, 8, 4], 10);
    expect(charges).toEqual([1, 5, 4]);
    expect(totalPaid).toBe(10);
  });

  it('건설 순서와 무관하게 항상 룰북 최적 총액', () => {
    const perms = [
      [2, 4, 8], [2, 8, 4], [4, 2, 8], [4, 8, 2], [8, 2, 4], [8, 4, 2],
      [12, 2, 2], [2, 2, 12], [3, 3, 3], [2], [2, 2],
    ];
    for (const p of perms) {
      expect(buildSequence(p, 100).totalPaid).toBe(optimal(p));
    }
  });

  it('중간 시점 누적 지불도 그 시점까지의 최적 — 현금 부족 오탐 없음', () => {
    const costs = [2, 4, 8];
    let paid = 0;
    let ps: Pick<PhaseState, 'engineerMaxTileCost' | 'engineerDiscountGiven'> = {};
    costs.forEach((c, i) => {
      const d = applyEngineerDiscount(c, ps);
      paid += d.charge;
      ps = { engineerMaxTileCost: d.engineerMaxTileCost, engineerDiscountGiven: d.engineerDiscountGiven };
      expect(paid).toBe(optimal(costs.slice(0, i + 1)));
    });
  });

  it('평지($2)만 지어도 할인된다 — 룰북엔 비용 하한 조건이 없다', () => {
    expect(applyEngineerDiscount(2, {}).charge).toBe(1);
    expect(buildSequence([2, 2, 2], 10).totalPaid).toBe(5); // 6 - 1
  });

  it('청구액은 절대 음수가 아니고 최소 ceil(정가/2)', () => {
    for (let prevMax = 0; prevMax <= 12; prevMax++) {
      for (let c = 1; c <= 12; c++) {
        const ps = { engineerMaxTileCost: prevMax, engineerDiscountGiven: Math.floor(prevMax / 2) };
        const { charge } = applyEngineerDiscount(c, ps);
        expect(charge).toBeGreaterThanOrEqual(Math.ceil(c / 2));
        expect(charge).toBeLessThanOrEqual(c);
      }
    }
  });

  it('이미 더 비싼 타일을 지었으면 이후 타일은 정가', () => {
    const ps = { engineerMaxTileCost: 12, engineerDiscountGiven: 6 };
    expect(applyEngineerDiscount(2, ps).charge).toBe(2);
    expect(applyEngineerDiscount(12, ps).charge).toBe(12);
  });

  it('hasEngineerDiscount: Germany + engineer 선택일 때만', () => {
    expect(hasEngineerDiscount(true, 'engineer')).toBe(true);
    expect(hasEngineerDiscount(true, 'firstBuild')).toBe(false);
    expect(hasEngineerDiscount(false, 'engineer')).toBe(false); // 표준 맵
    expect(hasEngineerDiscount(true, null)).toBe(false);
  });
});
