/**
 * 방 좌석/승계 순수 규칙 (Phase 2)
 * netStore에서 분리한 결정 로직 — 연결 객체 없이 단위 테스트 가능.
 */
import type { BannedEntry, RoomSeat } from './types';

const KOREAN_ORDINALS = ['하나', '둘', '셋', '넷', '다섯', '여섯'];

/** 봇 좌석 이름 접미 — 좌석 index(1~) 기준. seat 0은 항상 호스트(사람)라 미사용. */
const AI_SEAT_ORDINALS = ['', '', 'II', 'III', 'IV', 'V', 'VI'];

/**
 * 방 만들기 좌석 구성 — /online(방 만들기)과 게임 내 OnlineLobby가 공유한다.
 * seat 0 = 호스트(사람), aiSeats에 든 좌석 = 봇, 나머지 = 겹치지 않는 기본 이름의 빈 사람 좌석.
 * (두 화면이 각자 같은 루프를 복붙하던 것을 한 곳으로 — 규칙이 어긋나지 않게.)
 */
export function buildRoomSeats(
  playerCount: number,
  hostName: string,
  aiSeats: Set<number>
): RoomSeat[] {
  const seats: RoomSeat[] = [];
  for (let i = 0; i < playerCount; i++) {
    if (i === 0) {
      seats.push({ seat: 0, name: hostName.trim() || '호스트', kind: 'human', clientId: null });
    } else if (aiSeats.has(i)) {
      seats.push({ seat: i, name: `컴퓨터-기차${AI_SEAT_ORDINALS[i] ?? ''}`, kind: 'ai', clientId: null });
    } else {
      seats.push({ seat: i, name: uniqueSeatName(undefined, seats, i), kind: 'human', clientId: null });
    }
  }
  return seats;
}

/**
 * 좌석 이름 중복 방지 — 다들 디폴트 이름(기차-하나)으로 들어와도
 * 좌석 순서대로 기차-하나/기차-둘/기차-셋…이 되게 한다.
 * 원하는 이름이 다른 좌석과 안 겹치면 그대로 사용.
 */
export function uniqueSeatName(
  desired: string | undefined,
  seats: RoomSeat[],
  seat: number
): string {
  const others = seats.filter((s) => s.seat !== seat).map((s) => s.name);
  const trimmed = desired?.trim();
  if (trimmed && !others.includes(trimmed)) return trimmed;
  const base = `기차-${KOREAN_ORDINALS[seat] ?? seat + 1}`;
  let name = base;
  let i = 2;
  while (others.includes(name)) name = `${base}${i++}`;
  return name;
}

/**
 * 좌석 비우기 — 사람이 앉아 있던 자리를 빈자리로 되돌린다.
 *
 * **강퇴(kickSeat)와 자발적 퇴장(leaveSeat)이 공유하는 한 곳**이다. 예전엔 양쪽에
 * 같은 map이 복제돼 있었는데, 그러면 한쪽만 고쳐 어긋난다(예: uid를 안 지워
 * 나간 사람이 그 잔존 uid로 차단되는 사고 — kickSeat 주석 참조).
 *
 * 이름은 기본 이름으로 되돌린다. 앞 사람 이름이 빈자리에 남아 있으면 새로 들어온
 * 사람이 그 이름을 물려받은 것처럼 보인다.
 *
 * ⚠️ 정체성 필드(clientId·uid)를 **둘 다** 지운다. 좌석은 남기고(kind 유지) 사람만 뺀다.
 */
export function releaseSeat(seats: RoomSeat[], seat: number): RoomSeat[] {
  return seats.map((s) =>
    s.seat === seat
      ? { ...s, clientId: null, uid: null, name: uniqueSeatName(undefined, seats, s.seat) }
      : s
  );
}

/**
 * 좌석 이름 변경 규칙 (대기실에서 본인 이름 수정).
 * - 이름은 앞뒤 공백을 트림해 저장한다.
 * - 빈 이름(트림 후 '')은 거부(null).
 * - 다른 좌석과 같은 이름이면 거부(null) — 중복 금지.
 * 성공 시 해당 좌석 이름만 바꾼 새 seats 배열, 실패 시 null.
 */
export function renameSeat(
  seats: RoomSeat[],
  seat: number,
  desired: string
): RoomSeat[] | null {
  const trimmed = desired.trim();
  if (!trimmed) return null;
  const others = seats.filter((s) => s.seat !== seat).map((s) => s.name);
  if (others.includes(trimmed)) return null;
  return seats.map((s) => (s.seat === seat ? { ...s, name: trimmed } : s));
}

/**
 * claimSeat 좌석 배정 규칙.
 * ① 이미 내 좌석이 있으면 그대로 (같은 탭 새로고침 — sessionStorage clientId 유지)
 * ② 대기실(waiting): 빈 human 좌석 배정 (요청 이름 반영)
 * ③ 게임 중(playing): 접속이 끊긴 human 좌석 이어받기 — 이름이 같은 좌석 우선,
 *    없으면 첫 오프라인 좌석. 좌석 이름은 유지(좌석 = 게임 내 플레이어 정체성).
 * 배정 불가면 null (관전).
 */
export function assignSeatForClaim(
  seats: RoomSeat[],
  status: 'waiting' | 'playing' | 'finished',
  presentClientIds: string[],
  claimClientId: string,
  claimName?: string,
  /** 착석자의 auth.uid — 좌석에 함께 기록해 두어야 나중에 "이 좌석 사람"을 차단할 수 있다(O4) */
  claimUid?: string | null
): RoomSeat[] | null {
  if (seats.some((s) => s.clientId === claimClientId)) return seats; // 이미 착석

  if (status === 'waiting') {
    // 진짜 빈자리 우선, 없으면 나갔다 안 돌아온(오프라인) 좌석 재사용
    const open =
      seats.find((s) => s.kind === 'human' && !s.clientId) ??
      seats.find(
        (s) => s.kind === 'human' && s.clientId && !presentClientIds.includes(s.clientId)
      );
    if (!open) return null;
    const name = uniqueSeatName(claimName, seats, open.seat);
    return seats.map((s) =>
      s.seat === open.seat ? { ...s, clientId: claimClientId, name, uid: claimUid ?? null } : s
    );
  }

  if (status === 'playing') {
    const offline = seats.filter(
      (s) => s.kind === 'human' && (!s.clientId || !presentClientIds.includes(s.clientId))
    );
    if (offline.length === 0) return null;
    const byName = claimName?.trim()
      ? offline.find((s) => s.name === claimName.trim())
      : undefined;
    const target = byName ?? offline[0];
    return seats.map((s) =>
      s.seat === target.seat ? { ...s, clientId: claimClientId, uid: claimUid ?? null } : s
    );
  }

  return null;
}

/**
 * 호스트 승계 후보 — 접속 중인 human 좌석 중 좌석 번호가 가장 빠른 클라이언트.
 * 결정론적(전원이 같은 결론)이라 레이스 없이 한 명만 승계를 시도한다.
 */
export function pickHostSuccessor(
  seats: RoomSeat[],
  presentClientIds: string[]
): string | null {
  const candidates = seats
    .filter((s) => s.kind === 'human' && s.clientId && presentClientIds.includes(s.clientId))
    .sort((a, b) => a.seat - b.seat);
  return candidates[0]?.clientId ?? null;
}

/** 호스트가 presence에서 사라졌는가 */
export function isHostAbsent(hostClientId: string | null, presentClientIds: string[]): boolean {
  return Boolean(hostClientId) && !presentClientIds.includes(hostClientId as string);
}

// ---- 차단 목록 (O4: 강퇴 실효화) ----

/**
 * 이 uid가 방에서 차단됐는가.
 *
 * uid로 판정하는 이유: clientId는 sessionStorage라 **탭만 새로 열어도 바뀌어** 차단이
 * 무의미하다. auth 세션 uid는 localStorage라 같은 브라우저에서 유지된다.
 * uid가 없으면(익명 로그인 실패) 차단할 근거가 없으므로 통과시킨다 — 막을 방법이 없는데
 * 막힌 것처럼 굴면 정상 사용자만 못 들어온다.
 */
export function isBanned(banned: BannedEntry[] | undefined, uid: string | null): boolean {
  if (!uid || !banned?.length) return false;
  return banned.some((b) => b.uid === uid);
}

/**
 * 차단 목록 상한 — DB의 rooms_banned_shape check(<= 50)와 **같은 값이어야 한다**.
 * 클라이언트가 이 한도를 모르면 51번째 강퇴에서 update가 통째로 check 위반으로 실패하고,
 * 호스트는 "내보내기가 안 된다"만 겪게 된다(리뷰 스텝1).
 */
export const MAX_BANNED = 50;

/**
 * 차단 목록에 추가 (중복은 갱신하지 않고 무시 — 최초 차단 시각을 보존한다).
 * 호출부는 participant_uids에서도 이 uid를 함께 빼야 RLS update 권한까지 회수된다.
 *
 * **상한(MAX_BANNED)에 도달하면 추가하지 않고 목록을 그대로 돌려준다.** 내보내기 자체는
 * 그대로 되고 차단만 생략된다 — 오래된 차단을 말없이 밀어내면 그때 풀린 사람이 다시
 * 들어와도 호스트는 이유를 모른다. 목록이 꽉 찼다는 사실은 UI가 알린다.
 * 호출부는 반환값이 입력과 같은 참조인지로 "추가됐는지"를 판별할 수 있다.
 */
export function addBan(
  banned: BannedEntry[] | undefined,
  uid: string,
  name: string,
  at: number
): BannedEntry[] {
  const list = banned ?? [];
  if (list.some((b) => b.uid === uid)) return list;
  if (list.length >= MAX_BANNED) return list; // 상한 — 차단은 생략, 내보내기는 그대로
  return [...list, { uid, name, at }];
}

/** 차단 해제 */
export function removeBan(banned: BannedEntry[] | undefined, uid: string): BannedEntry[] {
  return (banned ?? []).filter((b) => b.uid !== uid);
}
