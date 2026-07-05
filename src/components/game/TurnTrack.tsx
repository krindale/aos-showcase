'use client';

import { Crown } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { GamePhase, PHASE_INFO, PLAYER_COLORS } from '@/types/game';
import { useMyPlayerId, isMyPlayer } from '@/hooks/useMyPlayerId';
import { CROWN_GOLD, CROWN_INK } from './uiEffects';

interface TurnTrackProps {
  currentTurn: number;
  maxTurns: number;
  currentPhase: GamePhase;
}

export default function TurnTrack({
  currentTurn,
  maxTurns,
  currentPhase,
}: TurnTrackProps) {
  const phaseInfo = PHASE_INFO[currentPhase];
  const { playerOrder, players, currentPlayer } = useGameStore();
  const myPlayerId = useMyPlayerId();

  return (
    <>
      {/* Mobile: Compact view - only show turn and phase */}
      <div className="flex md:hidden items-center gap-2">
        {/* 턴 표시 (간략) */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-foreground-secondary">T{currentTurn}</span>
        </div>

        {/* 구분선 */}
        <div className="w-px h-4 bg-foreground/10" />

        {/* 현재 단계 (약어) */}
        <div className="flex items-center">
          <span className="text-xs text-accent font-medium truncate max-w-[120px]">
            {phaseInfo.name}
          </span>
        </div>
      </div>

      {/* Desktop: Full view */}
      <div className="hidden md:flex items-center gap-4">
        {/* 턴 표시 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground-secondary">턴</span>
          <div className="flex gap-1">
            {[...Array(maxTurns)].map((_, i) => (
              <div
                key={i}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                  i + 1 === currentTurn
                    ? 'bg-accent text-background'
                    : i + 1 < currentTurn
                    ? 'bg-accent/30 text-accent'
                    : 'bg-foreground/10 text-foreground-secondary'
                }`}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* 구분선 */}
        <div className="w-px h-6 bg-foreground/10" />

        {/* 현재 단계 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-accent font-medium">
            {phaseInfo.name}
          </span>
        </div>

        {/* 구분선 */}
        <div className="w-px h-6 bg-foreground/10" />

        {/* 플레이어 순서 (내 플레이어 위엔 왕관) */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground-secondary">순서</span>
          <div className="flex gap-1">
            {playerOrder.map((playerId, index) => {
              const player = players[playerId];
              if (!player) return null;
              const isCurrent = playerId === currentPlayer;
              const isMe = isMyPlayer(playerId, player.isAI, myPlayerId);
              return (
                <div key={playerId} className="relative">
                  {isMe && (
                    <Crown
                      className={`absolute left-1/2 -translate-x-1/2 w-[15px] h-[15px] drop-shadow ${
                        isCurrent ? '-top-[21px]' : '-top-[17px]'
                      }`}
                      fill={CROWN_GOLD}
                      strokeWidth={1.8}
                      style={{ color: CROWN_INK }}
                      aria-label="내 플레이어"
                    />
                  )}
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white transition-all ${
                      isCurrent ? 'ring-2 ring-accent ring-offset-1 ring-offset-background scale-110' : 'opacity-70'
                    }`}
                    style={{ backgroundColor: PLAYER_COLORS[player.color] }}
                    title={`${index + 1}번: ${player.name}${isMe ? ' (나)' : ''}`}
                  >
                    {index + 1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
