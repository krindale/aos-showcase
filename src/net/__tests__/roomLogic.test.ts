// 좌석 배정/호스트 승계 순수 규칙 테스트 (Phase 2)
import { describe, it, expect } from 'vitest';
import { MAX_BANNED, addBan, assignSeatForClaim, buildRoomSeats, isBanned, isHostAbsent, pickHostSuccessor, removeBan, releaseSeat, uniqueSeatName, renameSeat } from '../roomLogic';
import type { RoomSeat } from '../types';

const seats = (over: Partial<RoomSeat>[]): RoomSeat[] =>
  over.map((o, i) => ({ seat: i, name: `자리${i}`, kind: 'human', clientId: null, ...o }));

describe('buildRoomSeats (방 만들기 좌석 구성 — /online·OnlineLobby 공유)', () => {
  it('seat 0 = 호스트(사람, 트림된 이름), 나머지는 기본 이름의 빈 사람 좌석', () => {
    const s = buildRoomSeats(3, '  선장 ', new Set());
    expect(s).toHaveLength(3);
    expect(s[0]).toMatchObject({ seat: 0, name: '선장', kind: 'human', clientId: null });
    expect(s[1]).toMatchObject({ seat: 1, name: '기차-둘', kind: 'human', clientId: null });
    expect(s[2]).toMatchObject({ seat: 2, name: '기차-셋', kind: 'human', clientId: null });
  });

  it('빈 호스트 이름은 "호스트"로 폴백', () => {
    expect(buildRoomSeats(2, '   ', new Set())[0].name).toBe('호스트');
  });

  it('aiSeats 좌석은 봇 — 이름은 컴퓨터-기차/컴퓨터-기차II… (좌석 index 기준)', () => {
    const s = buildRoomSeats(4, '호스트', new Set([1, 3]));
    expect(s[1]).toMatchObject({ kind: 'ai', name: '컴퓨터-기차' });
    expect(s[2]).toMatchObject({ kind: 'human', name: '기차-셋' });
    expect(s[3]).toMatchObject({ kind: 'ai', name: '컴퓨터-기차III' });
  });

  it('인원 밖 aiSeats 잔존값은 무시 (인원을 줄였다 늘리는 UI 상태 재사용에 안전)', () => {
    const s = buildRoomSeats(3, '호스트', new Set([2, 4]));
    expect(s).toHaveLength(3);
    expect(s.filter((x) => x.kind === 'ai')).toHaveLength(1);
  });

  it('6인 전 좌석 이름이 서로 겹치지 않는다', () => {
    const s = buildRoomSeats(6, '기차-둘', new Set([3]));
    expect(new Set(s.map((x) => x.name)).size).toBe(6);
  });
});

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

describe('차단 목록 (O4 — 강퇴 실효화)', () => {
  const banned = [{ uid: 'u-kicked', name: '기차-둘', at: 1000 }];

  it('isBanned: 차단된 uid만 true', () => {
    expect(isBanned(banned, 'u-kicked')).toBe(true);
    expect(isBanned(banned, 'u-other')).toBe(false);
    expect(isBanned([], 'u-kicked')).toBe(false);
    expect(isBanned(undefined, 'u-kicked')).toBe(false);
  });

  it('isBanned: uid를 모르면(익명 로그인 실패) 통과시킨다 — 막을 근거가 없는데 막으면 정상 사용자만 손해', () => {
    expect(isBanned(banned, null)).toBe(false);
  });

  it('addBan: 추가하되 이미 있으면 최초 차단 시각을 보존한다', () => {
    const added = addBan(banned, 'u-new', '기차-셋', 2000);
    expect(added).toHaveLength(2);
    expect(added[1]).toMatchObject({ uid: 'u-new', name: '기차-셋', at: 2000 });

    const dup = addBan(banned, 'u-kicked', '바뀐이름', 9999);
    expect(dup).toHaveLength(1);
    expect(dup[0].at).toBe(1000); // 갱신하지 않음
  });

  it('addBan: 상한(DB check와 동일)에 닿으면 추가하지 않고 그대로 둔다 — 퇴장만 되고 차단은 생략', () => {
    let list = [] as ReturnType<typeof addBan>;
    for (let i = 0; i < MAX_BANNED; i++) list = addBan(list, `u${i}`, `이름${i}`, i);
    expect(list).toHaveLength(MAX_BANNED);

    const atLimit = addBan(list, 'u-new', '새사람', 9999);
    expect(atLimit).toHaveLength(MAX_BANNED); // 상한 유지
    expect(atLimit).toBe(list); // 같은 참조 — 호출부가 "추가 안 됨"을 판별할 수 있다
    expect(atLimit.some((b) => b.uid === 'u-new')).toBe(false); // 새 사람은 안 들어감
    expect(atLimit.some((b) => b.uid === 'u0')).toBe(true); // 오래된 것도 안 밀려남
  });

  it('removeBan: 해제하면 다시 입장할 수 있다', () => {
    const after = removeBan(banned, 'u-kicked');
    expect(after).toHaveLength(0);
    expect(isBanned(after, 'u-kicked')).toBe(false);
  });

  it('assignSeatForClaim: 착석 시 uid를 좌석에 기록한다 — 이게 있어야 나중에 그 사람을 특정해 차단할 수 있다', () => {
    const s = seats([{ clientId: 'host' }, {}]);
    const next = assignSeatForClaim(s, 'waiting', ['host'], 'guest', '손님', 'uid-guest');
    expect(next?.[1]).toMatchObject({ clientId: 'guest', uid: 'uid-guest' });
  });

  it('assignSeatForClaim: uid를 안 넘기면 null로 남는다(구 데이터 호환)', () => {
    const s = seats([{ clientId: 'host' }, {}]);
    const next = assignSeatForClaim(s, 'waiting', ['host'], 'guest', '손님');
    expect(next?.[1].uid).toBeNull();
  });
});

describe('releaseSeat (좌석 비우기 — 강퇴·자발적 퇴장 공유 규칙)', () => {
  const occupied = seats([
    { name: '방장', clientId: 'c-host', uid: 'u-host' },
    { name: '나가는사람', clientId: 'c-guest', uid: 'u-guest' },
    { name: '남는사람', clientId: 'c-other', uid: 'u-other' },
  ]);

  it('정체성 필드(clientId·uid)를 둘 다 지운다', () => {
    const next = releaseSeat(occupied, 1);
    expect(next[1].clientId).toBeNull();
    // uid가 남으면 이미 나간 사람이 그 잔존 uid로 차단된다(kickSeat 사고 이력)
    expect(next[1].uid ?? null).toBeNull();
  });

  it('이름을 기본 이름으로 되돌린다 — 앞 사람 이름이 빈자리에 남지 않게', () => {
    const next = releaseSeat(occupied, 1);
    expect(next[1].name).not.toBe('나가는사람');
    expect(next[1].name).toBe(uniqueSeatName(undefined, occupied, 1));
  });

  it('좌석 자체는 남긴다 — 사람만 빠지고 자리 수·kind는 그대로', () => {
    const next = releaseSeat(occupied, 1);
    expect(next).toHaveLength(occupied.length);
    expect(next[1].seat).toBe(1);
    expect(next[1].kind).toBe('human');
  });

  it('다른 좌석은 건드리지 않는다', () => {
    const next = releaseSeat(occupied, 1);
    expect(next[0]).toEqual(occupied[0]);
    expect(next[2]).toEqual(occupied[2]);
  });

  it('없는 좌석 번호면 아무것도 바뀌지 않는다', () => {
    expect(releaseSeat(occupied, 99)).toEqual(occupied);
  });

  it('원본 배열을 변형하지 않는다(불변)', () => {
    const before = JSON.stringify(occupied);
    releaseSeat(occupied, 1);
    expect(JSON.stringify(occupied)).toBe(before);
  });

  it('되돌린 이름이 남은 좌석 이름과 겹치지 않는다', () => {
    // 빈자리 기본 이름이 이미 다른 좌석에 쓰이고 있어도 충돌을 피해야 한다
    const clash = seats([
      { name: '기차-둘', clientId: 'c-a', uid: 'u-a' },
      { name: '나가는사람', clientId: 'c-b', uid: 'u-b' },
    ]);
    const next = releaseSeat(clash, 1);
    expect(next[1].name).not.toBe(next[0].name);
  });
});
