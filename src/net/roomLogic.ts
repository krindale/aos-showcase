/**
 * 방 좌석/승계 순수 규칙 (Phase 2)
 * netStore에서 분리한 결정 로직 — 연결 객체 없이 단위 테스트 가능.
 */
import type { RoomSeat } from './types';

const KOREAN_ORDINALS = ['하나', '둘', '셋', '넷', '다섯', '여섯'];

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
  claimName?: string
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
      s.seat === open.seat ? { ...s, clientId: claimClientId, name } : s
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
    return seats.map((s) => (s.seat === target.seat ? { ...s, clientId: claimClientId } : s));
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
