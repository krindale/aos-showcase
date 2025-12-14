'use client';

import { GamePhase, PHASE_INFO } from '@/types/game';

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
    </div>
  );
}
