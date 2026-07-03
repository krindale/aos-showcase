// 좌석 배정/호스트 승계 순수 규칙 테스트 (Phase 2)
import { describe, it, expect } from 'vitest';
import { assignSeatForClaim, isHostAbsent, pickHostSuccessor } from '../roomLogic';
import type { RoomSeat } from '../types';

const seats = (over: Partial<RoomSeat>[]): RoomSeat[] =>
  over.map((o, i) => ({ seat: i, name: `자리${i}`, kind: 'human', clientId: null, ...o }));

describe('assignSeatForClaim', () => {
  it('이미 착석한 clientId는 좌석 그대로 (같은 탭 새로고침)', () => {
    const s = seats([{ clientId: 'host' }, { clientId: 'me' }]);
    expect(assignSeatForClaim(s, 'playing', ['host', 'me'], 'me', '아무개')).toBe(s);
  });

  it('대기실: 빈 human 좌석에 이름과 함께 배정', () => {
    const s = seats([{ clientId: 'host', name: '호스트' }, {}, { kind: 'ai', name: 'AI' }]);
    const result = assignSeatForClaim(s, 'waiting', ['host'], 'g1', '기차-둘');
    expect(result?.[1]).toMatchObject({ clientId: 'g1', name: '기차-둘' });
    expect(result?.[2].clientId).toBeNull(); // AI 좌석은 불변
  });

  it('대기실 만석이면 null (관전)', () => {
    const s = seats([{ clientId: 'host' }, { clientId: 'g1' }]);
    expect(assignSeatForClaim(s, 'waiting', ['host', 'g1'], 'g2', '늦은사람')).toBeNull();
  });

  it('게임 중: 끊긴 좌석을 이어받고 좌석 이름은 유지', () => {
    const s = seats([{ clientId: 'host' }, { clientId: 'dead-client', name: '기차-둘' }]);
    const result = assignSeatForClaim(s, 'playing', ['host'], 'new-tab', '기차-둘');
    expect(result?.[1]).toMatchObject({ clientId: 'new-tab', name: '기차-둘' });
  });

  it('게임 중: 오프라인 좌석이 여럿이면 이름 일치 우선', () => {
    const s = seats([
      { clientId: 'host' },
      { clientId: 'dead-a', name: '기차-둘' },
      { clientId: 'dead-b', name: '기차-셋' },
    ]);
    const result = assignSeatForClaim(s, 'playing', ['host'], 'new', '기차-셋');
    expect(result?.[2].clientId).toBe('new');
    expect(result?.[1].clientId).toBe('dead-a');
  });

  it('게임 중: 전원 접속 중이면 null (관전)', () => {
    const s = seats([{ clientId: 'host' }, { clientId: 'g1' }]);
    expect(assignSeatForClaim(s, 'playing', ['host', 'g1'], 'x', 'y')).toBeNull();
  });
});

describe('호스트 승계', () => {
  it('isHostAbsent: presence에 없으면 이탈', () => {
    expect(isHostAbsent('host', ['g1'])).toBe(true);
    expect(isHostAbsent('host', ['host', 'g1'])).toBe(false);
    expect(isHostAbsent(null, ['g1'])).toBe(false);
  });

  it('pickHostSuccessor: 접속 중 human 좌석 중 가장 빠른 좌석', () => {
    const s = seats([
      { clientId: 'host' }, // 이탈했다고 가정 (presence에 없음)
      { kind: 'ai', name: 'AI' },
      { clientId: 'g2' },
      { clientId: 'g3' },
    ]);
    expect(pickHostSuccessor(s, ['g2', 'g3'])).toBe('g2');
    expect(pickHostSuccessor(s, ['g3'])).toBe('g3');
    expect(pickHostSuccessor(s, [])).toBeNull();
  });
});
