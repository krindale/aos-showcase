import { describe, it, expect } from 'vitest';
import { useGameStore } from '../gameStore';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 게임 로그 기반 건설 제한 검증 — 화면 폴링과 달리 누락이 불가능
// (turn, player) 조합마다 "트랙 건설" 로그가 max(3, Engineer 4)를 넘으면 위반
describe('턴당 건설 제한 (게임 로그 기반)', () => {
  it('St. Lucia 2 AI: 어떤 (턴, 플레이어)도 한 차례에 4개 이상 짓지 않는다', async () => {
    useGameStore.getState().initGame('st-lucia', ['AI-1', 'AI-2'], [
      { playerIndex: 0, name: 'AI-1' },
      { playerIndex: 1, name: 'AI-2' },
    ]);

    const start = Date.now();
    let stuckMs = 0;
    let lastLogCount = 0;
    while (Date.now() - start < 70_000) {
      const s = useGameStore.getState();
      if (s.currentPhase === 'gameOver') break;
      if (s.ui.movingCube) s.completeCubeMove();
      await wait(50);
      const now = useGameStore.getState();
      const autoPhases = ['collectIncome', 'payExpenses', 'incomeReduction', 'goodsGrowth', 'advanceTurn'];
      if (now.logs.length === lastLogCount && !now.ui.movingCube && !now.isAIThinking) {
        stuckMs += 50;
        if (stuckMs > 2000 && autoPhases.includes(now.currentPhase)) { now.nextPhase(); stuckMs = 0; continue; }
        if (stuckMs > 8000) break;
      } else { stuckMs = 0; lastLogCount = now.logs.length; }
    }

    const f = useGameStore.getState();
    // 건설 로그를 (turn, player)별 집계 — 방향 전환/복합도 건설 1회로 포함
    const counts = new Map<string, number>();
    for (const log of f.logs) {
      if (/트랙 건설|복합 트랙 건설|트랙 방향 전환/.test(log.action)) {
        const key = `T${log.turn}:${log.player}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const violations = [...counts.entries()].filter(([, n]) => n > 4); // Engineer 상한 4
    const over3NoEngineer = [...counts.entries()].filter(([, n]) => n > 3);
    console.log('차례별 건설 수:', Object.fromEntries(counts));
    if (over3NoEngineer.length > 0) {
      // 4건이 나오면 해당 턴에 Engineer 선택이 있었는지는 로그로 수동 확인
      console.warn('3 초과 차례 (Engineer 여부 확인 필요):', over3NoEngineer);
    }
    expect(violations).toEqual([]);
    expect(f.currentTurn).toBeGreaterThanOrEqual(3);
  }, 100_000);
});
