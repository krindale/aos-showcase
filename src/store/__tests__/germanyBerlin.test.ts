import { describe, it, expect } from 'vitest';
import { useGameStore, createInitialGameState } from '@/store/gameStore';

describe('Germany Berlin 매 턴 물품 보너스', () => {
  it('growGoods 호출 시 Berlin에 큐브 1개가 추가된다', () => {
    const s = createInitialGameState('germany', ['A', 'B', 'C', 'D'], []);
    useGameStore.setState(s);
    const berlin = () => useGameStore.getState().board.cities.find(c => c.id === 'berlin')!;
    const before = berlin().cubes.length;
    const bagBefore = useGameStore.getState().goodsDisplay.bag.length;
    useGameStore.getState().growGoods([1, 2, 3, 4]);
    const after = berlin().cubes.length;
    console.log(`Berlin cubes: ${before} → ${after}, bag: ${bagBefore} → ${useGameStore.getState().goodsDisplay.bag.length}`);
    expect(after).toBe(before + 1);
  });
});
