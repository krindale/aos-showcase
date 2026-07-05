'use client';

import { useGameStore } from '@/store/gameStore';
import { useNetStore } from '@/net/netStore';
import { PlayerId } from '@/types/game';

/**
 * 내 좌석의 플레이어 id (offline이면 null = 단일 조작자).
 * PhasePanel의 좌석 판정(netMode/mySeat → activePlayers[mySeat])과 **동일 매핑**이라
 * undo 게이팅·버튼 표시 계층과 일관된다.
 */
export function useMyPlayerId(): PlayerId | null {
  const activePlayers = useGameStore((s) => s.activePlayers);
  const netMode = useNetStore((s) => s.mode);
  const netMySeat = useNetStore((s) => s.mySeat);
  return netMode === 'offline' || netMySeat === null ? null : activePlayers[netMySeat] ?? null;
}

/**
 * 플레이어가 "나"인지 판정 (왕관 표시용).
 * - 온라인: 내 좌석의 플레이어와 같은 id면 나
 * - 오프라인(myPlayerId=null): 사람(비AI)이면 내가 조작하는 플레이어 = 나
 *   (봇과 구분해 왕관을 씌우기 위함)
 */
export function isMyPlayer(
  playerId: PlayerId,
  isAI: boolean,
  myPlayerId: PlayerId | null,
): boolean {
  return myPlayerId === null ? !isAI : playerId === myPlayerId;
}
