/**
 * 방 좌석/승계 순수 규칙 (Phase 2)
 * netStore에서 분리한 결정 로직 — 연결 객체 없이 단위 테스트 가능.
 */
import type { RoomSeat } from './types';

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
    return seats.map((s) =>
      s.seat === open.seat
        ? { ...s, clientId: claimClientId, name: claimName?.trim() || s.name }
        : s
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
