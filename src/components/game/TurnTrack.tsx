'use client';

import { Crown } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { getMapProfile } from '@/maps/getMapProfile';
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

  // Montréal: 이번/다음 라운드 정부 링크 관리자 (셋업 순번 로테이션, 탈락자는 건너뜀)
  // 맵 룰 게이트 — 스테일 저장본(비몬트리올 맵에 governmentControllers 잔존)에서도 배지 미표시
  const mapId = useGameStore((s) => s.mapId);
  const hasGovernmentLinks = getMapProfile(mapId).governmentLinks;
  const govControllers = useGameStore((s) => s.governmentControllers);
  const controllerForTurn = (turn: number) => {
    if (!hasGovernmentLinks || !govControllers || govControllers.length === 0) return null;
    for (let k = 0; k < govControllers.length; k++) {
      const cand = govControllers[(turn - 1 + k) % govControllers.length];
      // 플레이어 존재 검사 필수 — 스테일 저장본(타 맵에 남은 3인 배열)이면 cand가 없는 플레이어일 수 있다
      const p = players[cand];
      if (p && !p.eliminated) return cand;
    }
    return null;
  };
  const govController = controllerForTurn(currentTurn);
  const govControllerNext = controllerForTurn(currentTurn + 1);

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

        {/* 플레이어 순서 (내 플레이어 위엔 왕관, Montréal은 정부 관리자에 하단 바) */}
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
          {/* Montréal: 이번/다음 라운드 정부 링크 관리자 — 글자는 위에 띄우고,
              색 원의 세로 중앙을 순서 원과 맞춘다 (왕관과 같은 오버레이 방식) */}
          {govController && (
            <span
              className="relative ml-[10px] flex items-center whitespace-nowrap"
              title={`정부 링크 건설 — 이번 라운드: ${players[govController]?.name}${
                govControllerNext ? `, 다음 라운드: ${players[govControllerNext]?.name}` : ''
              }`}
            >
              <span className="absolute -top-[13px] left-1/2 -translate-x-1/2 text-[10px] leading-none text-foreground-muted whitespace-nowrap">
                정부 링크 건설
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-4 h-4 rounded-full ring-2 ring-[#4E4D46]"
                  style={{ backgroundColor: PLAYER_COLORS[players[govController]!.color] }}
                  aria-label={`이번 라운드 정부: ${players[govController]?.name}`}
                />
                {govControllerNext && (
                  <>
                    <span className="text-[10px] text-foreground-muted">→</span>
                    <span
                      className="inline-block w-3 h-3 rounded-full opacity-60 ring-1 ring-[#4E4D46]"
                      style={{ backgroundColor: PLAYER_COLORS[players[govControllerNext]!.color] }}
                      aria-label={`다음 라운드 정부: ${players[govControllerNext]?.name}`}
                    />
                  </>
                )}
              </span>
            </span>
          )}
        </div>
      </div>
    </>
  );
}
