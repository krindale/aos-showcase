'use client';

import { Crown, Star, User } from 'lucide-react';
import { useNetStore } from '@/net/netStore';
import { getClientId } from '@/net';
import { CROWN_GOLD, CROWN_INK } from './uiEffects';

/**
 * 채팅 발신자 아이콘 — 이름 옆에 붙는다.
 * - 나(내 clientId) → 왕관
 * - 호스트(room.hostClientId) → 별
 * - 그 외 사람 → 사람 아이콘
 * 내가 호스트면 "나"가 우선이라 왕관으로 표시된다.
 */
export function ChatSenderIcon({ clientId, size = 12 }: { clientId: string; size?: number }) {
  const hostClientId = useNetStore((s) => s.room?.hostClientId ?? null);
  const mine = clientId === getClientId();
  const isHost = !mine && !!hostClientId && clientId === hostClientId;

  // 이름·텍스트와 같은 줄에서 세로로 맞게 인라인 배치 (align 살짝 내려 텍스트 중앙에 오게)
  const cls = 'inline align-[-0.15em] shrink-0 mr-0.5';
  if (mine) {
    return (
      <Crown
        size={size}
        fill={CROWN_GOLD}
        strokeWidth={1.8}
        style={{ color: CROWN_INK }}
        className={cls}
        aria-label="나"
      />
    );
  }
  if (isHost) {
    return (
      <Star size={size} className={cls} fill={CROWN_GOLD} strokeWidth={1.8} style={{ color: CROWN_INK }} aria-label="호스트" />
    );
  }
  return (
    <User size={size} fill="currentColor" className={cls} style={{ color: CROWN_INK }} aria-label="사람" />
  );
}
