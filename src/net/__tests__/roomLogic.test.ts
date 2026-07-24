// 좌석 배정/호스트 승계 순수 규칙 테스트 (Phase 2)
import { describe, it, expect } from 'vitest';
import { assignSeatForClaim, isHostAbsent, pickHostSuccessor, uniqueSeatName, renameSeat } from '../roomLogic';
import type { RoomSeat } from '../types';

const seats = (over: Partial<RoomSeat>[]): RoomSeat[] =>
  over.map((o, i) => ({ seat: i, name: `자리${i}`, kind: 'human', clientId: null, ...o }));

describe('renameSeat', () => {
  it('이름을 바꾸고 앞뒤 공백을 트림해 저장', () => {
    const s = seats([{ name: '호스트' }, { name: '기차-둘' }]);
    const r = renameSeat(s, 1, '  새이름  ');
    expect(r?.[1].name).toBe('새이름');
    expect(r?.[0].name).toBe('호스트'); // 다른 좌석 불변
  });

  it('다른 좌석과 같은 이름이면 거부(null)', () => {
    const s = seats([{ name: '호스트' }, { name: '기차-둘' }]);
    expect(renameSeat(s, 1, '호스트')).toBeNull();
    // 트림 후 중복도 거부
    expect(renameSeat(s, 1, '  호스트 ')).toBeNull();
  });

  it('빈 이름(트림 후 빈 문자열)은 거부(null)', () => {
    const s = seats([{ name: '호스트' }, { name: '기차-둘' }]);
    expect(renameSeat(s, 1, '   ')).toBeNull();
    expect(renameSeat(s, 1, '')).toBeNull();
  });

  it('내 현재 이름 그대로(트림만) 저장은 허용', () => {
    const s = seats([{ name: '호스트' }, { name: '기차-둘' }]);
    expect(renameSeat(s, 1, ' 기차-둘 ')?.[1].name).toBe('기차-둘');
  });
});

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

  it('대기실: 디폴트 이름 중복이면 좌석 순서대로 기차-둘/셋… 자동 부여', () => {
    const s = seats([{ clientId: 'host', name: '기차-하나' }, {}, {}]);
    const r1 = assignSeatForClaim(s, 'waiting', ['host'], 'g1', '기차-하나');
    expect(r1?.[1].name).toBe('기차-둘');
    const r2 = assignSeatForClaim(r1!, 'waiting', ['host', 'g1'], 'g2', '기차-하나');
    expect(r2?.[2].name).toBe('기차-셋');
  });

  it('uniqueSeatName: 안 겹치는 이름은 그대로, 겹치면 좌석 기본 이름', () => {
    const s = seats([{ name: '기차-하나' }, { name: '철도왕' }]);
    expect(uniqueSeatName('나만의이름', s, 2)).toBe('나만의이름');
    expect(uniqueSeatName('철도왕', s, 2)).toBe('기차-셋');
    expect(uniqueSeatName('', s, 2)).toBe('기차-셋');
  });

  it('대기실: 나갔다 안 돌아온(오프라인) 좌석은 새 게스트에게 재배정', () => {
    const s = seats([{ clientId: 'host' }, { clientId: 'gone', name: '나간사람' }]);
    const result = assignSeatForClaim(s, 'waiting', ['host'], 'g2', '새사람');
    expect(result?.[1]).toMatchObject({ clientId: 'g2', name: '새사람' });
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
