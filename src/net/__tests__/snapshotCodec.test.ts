// 스냅샷 코덱 왕복/제외 필드/크기 검증 (Phase 1 스텝 1)
import { describe, it, expect } from 'vitest';
import { encodeSnapshot, decodeSnapshot, extractSyncedState } from '../snapshotCodec';
import { createInitialGameState } from '@/store/helpers/setup';

describe('snapshotCodec', () => {
  it('extractSyncedState: 함수·로컬 전용 키 제외, 게임 필드 유지', () => {
    const state = {
      ...createInitialGameState('tutorial', ['A', 'B'], []),
      aiExecution: { pending: true, executionId: 7 },
      undoCount: 3,
      issueShare: () => {}, // zustand 액션 흉내
    } as unknown as Record<string, unknown>;

    const synced = extractSyncedState(state);
    expect(synced.ui).toBeUndefined();
    expect(synced.aiExecution).toBeUndefined();
    expect(synced.undoCount).toBeUndefined();
    expect(synced.issueShare).toBeUndefined();
    expect(synced.board).toBeDefined();
    expect(synced.players).toBeDefined();
    expect(synced.currentPhase).toBe('issueShares');
  });

  it('logs는 최근 30개만 포함', () => {
    const state = createInitialGameState('tutorial', ['A', 'B'], []) as unknown as Record<string, unknown>;
    state.logs = Array.from({ length: 100 }, (_, i) => ({
      turn: 1, phase: 'issueShares', player: 'player1', action: `log-${i}`, timestamp: i,
    }));
    const synced = extractSyncedState(state);
    expect((synced.logs as unknown[]).length).toBe(30);
    expect((synced.logs as { action: string }[])[29].action).toBe('log-99');
  });

  it('인코딩 → 디코딩 왕복이 무손실 (tutorial 2인)', async () => {
    const state = createInitialGameState('tutorial', ['기차-하나', '컴퓨터-기차'], []) as unknown as Record<string, unknown>;
    const { z } = await encodeSnapshot(state);
    const decoded = await decodeSnapshot(z);
    expect(decoded).toEqual(JSON.parse(JSON.stringify(extractSyncedState(state))));
  });

  it('압축 크기가 게이트 목표(≤20KB) 이내 (rust-belt 5인 초기 상태)', async () => {
    const state = createInitialGameState(
      'rust-belt',
      ['P1', 'P2', 'P3', 'P4', 'P5'],
      [{ playerIndex: 1, name: 'P2' }, { playerIndex: 2, name: 'P3' }]
    ) as unknown as Record<string, unknown>;
    const { z, bytes } = await encodeSnapshot(state);
    const rawBytes = JSON.stringify(extractSyncedState(state)).length;
    console.log(`[snapshotCodec] rust-belt 5인: 원본 ${rawBytes}B → 압축 ${bytes}B (base64 ${z.length}B)`);
    expect(bytes).toBeLessThan(20_000);
    // Realtime 메시지 한도(256KB)에 base64 기준으로도 크게 못 미쳐야 함
    expect(z.length).toBeLessThan(100_000);
  });
});
