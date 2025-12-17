'use client';

import { useGameStore } from '@/store/gameStore';
import { GamePhase, PHASE_INFO, PLAYER_COLORS } from '@/types/game';

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

  return (
    <div className="flex items-center gap-4">
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

      {/* 플레이어 순서 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground-secondary">순서</span>
        <div className="flex gap-1">
          {playerOrder.map((playerId, index) => {
            const player = players[playerId];
            if (!player) return null;
            const isCurrent = playerId === currentPlayer;
            return (
              <div
                key={playerId}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white transition-all ${
                  isCurrent ? 'ring-2 ring-accent ring-offset-1 ring-offset-background scale-110' : 'opacity-70'
                }`}
                style={{ backgroundColor: PLAYER_COLORS[player.color] }}
                title={`${index + 1}번: ${player.name}`}
              >
                {index + 1}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
