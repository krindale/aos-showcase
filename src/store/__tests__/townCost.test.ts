import { describe, it, expect } from 'vitest';
import { calcTownSpurCost, townCostFor, hasTouchedTownThisTurn } from '../helpers/townCost';
import { BoardState, HexCoord } from '@/types/game';

/**
 * 마을 연결 비용 — 룰북 IV "마을 $1 + 마을로 연결되는 트랙당 $1".
 *
 * 2026-08-02 이전엔 기본료가 통째로 빠져 있어(가닥 수 × $1) 마을을 거치는 모든 건설이
 * 정확히 $1씩 쌌다. 룰북이 못박은 경계값(가장 싼 마을 $2 / 가장 비싼 $5)을 회귀로 박아 둔다.
 */

const T: HexCoord = { col: 3, row: 4 };
const T2: HexCoord = { col: 7, row: 2 };

/** townSpurs만 있으면 되는 최소 보드 */
const boardWith = (spurs: BoardState['townSpurs']): BoardState =>
  ({ townSpurs: spurs } as unknown as BoardState);

describe('마을 연결 비용 (룰북: 마을 $1 + 연결 트랙당 $1)', () => {
  it('룰북 경계값 — 가닥 1개 = $2 (가장 싼 마을 타일), 4개 = $5 (가장 비싼)', () => {
    expect(townCostFor('rust-belt', 1, false)).toBe(2);
    expect(townCostFor('rust-belt', 2, false)).toBe(3);
    expect(townCostFor('rust-belt', 3, false)).toBe(4);
    expect(townCostFor('rust-belt', 4, false)).toBe(5);
  });

  it('같은 턴 같은 마을에 가닥을 더 놓으면 기본료는 다시 안 붙는다', () => {
    expect(townCostFor('rust-belt', 1, true)).toBe(1);
    expect(townCostFor('rust-belt', 2, true)).toBe(2);
  });

  it('가닥 0개면 비용 0 (기본료도 없음)', () => {
    expect(townCostFor('rust-belt', 0, false)).toBe(0);
    expect(calcTownSpurCost('rust-belt', boardWith([]), [], 1, 'player1')).toBe(0);
  });

  it('한 번에 같은 마을 여러 변을 놓아도 기본료는 1회', () => {
    const board = boardWith([]);
    // 같은 마을 2변 = $1(기본) + $2(가닥 2개) = $3
    expect(calcTownSpurCost('rust-belt', board, [{ townCoord: T }, { townCoord: T }], 1, 'player1')).toBe(3);
  });

  it('서로 다른 마을이면 마을마다 기본료가 붙는다', () => {
    const board = boardWith([]);
    // 마을 2곳 각 1변 = ($1+$1) × 2 = $4
    expect(calcTownSpurCost('rust-belt', board, [{ townCoord: T }, { townCoord: T2 }], 1, 'player1')).toBe(4);
  });

  it('이번 턴에 이미 건드린 마을은 기본료 면제 — 단 소유자·턴이 모두 같을 때만', () => {
    const mine = boardWith([{ id: 's1', townCoord: T, edge: 0, owner: 'player1', builtTurn: 3 }]);
    expect(hasTouchedTownThisTurn(mine, T, 3, 'player1')).toBe(true);
    expect(calcTownSpurCost('rust-belt', mine, [{ townCoord: T }], 3, 'player1')).toBe(1);

    // 상대가 건드린 것은 내 기본료를 면제하지 않는다 (건설 카운트 규칙과 같은 이유)
    expect(hasTouchedTownThisTurn(mine, T, 3, 'player2')).toBe(false);
    expect(calcTownSpurCost('rust-belt', mine, [{ townCoord: T }], 3, 'player2')).toBe(2);

    // 지난 턴 가닥도 면제 대상이 아니다
    expect(hasTouchedTownThisTurn(mine, T, 4, 'player1')).toBe(false);
    expect(calcTownSpurCost('rust-belt', mine, [{ townCoord: T }], 4, 'player1')).toBe(2);
  });

  it('Moon은 공식대로 기본료 $2 + 가닥당 $1', () => {
    expect(townCostFor('moon', 1, false)).toBe(3);
    expect(townCostFor('moon', 2, false)).toBe(4);
    expect(townCostFor('moon', 1, true)).toBe(1); // 기본료는 이미 냈다
  });
});
