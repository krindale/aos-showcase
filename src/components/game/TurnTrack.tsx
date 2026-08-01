'use client';

import { useEffect, useState } from 'react';
import { Crown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { getMapProfile } from '@/maps/getMapProfile';
import { GamePhase, PHASE_INFO, PLAYER_COLORS } from '@/types/game';
import { useMyPlayerId, isMyPlayer } from '@/hooks/useMyPlayerId';
import { predictAuctionOrderSlots } from '@/store/helpers/auctionOrder';
import { CROWN_GOLD, CROWN_INK, POP_SPRING } from './uiEffects';

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

  // 경매 진행 중(determinePlayerOrder + auction 존재)이면 "새로운 순서" 미리보기를 파생한다.
  // auction은 온라인 스냅샷에 자동 포함되므로 게스트/관전도 동일하게 본다(순수 파생, store 무변경).
  const auction = useGameStore((s) => s.auction);
  const showNewOrder = currentPhase === 'determinePlayerOrder' && !!auction;
  // 경매 완료(미포기 잔존 ≤1명, AuctionPanel의 isAuctionComplete와 동일 조건)면 승자 확정 →
  // 미정으로 남은 1등 자리도 채운다. 승자 = 포기하지 않고 남은 유일한 플레이어
  // (최고입찰자가 포기했을 수 있어 highestBidder로 단정 금지 — resolveAuction 승자 규칙과 일치).
  const activeBidders = auction
    ? playerOrder.filter((p) => !auction.droppedOutPlayers.includes(p))
    : [];
  const auctionWinner =
    auction && activeBidders.length <= 1
      ? activeBidders[0] ?? auction.highestBidder ?? null
      : null;
  const newOrderSlots = showNewOrder
    ? predictAuctionOrderSlots(playerOrder, auction!.droppedOutPlayers, auctionWinner)
    : null;

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

  /**
   * "새로운 순서" 영역이 다 펼쳐졌는지. `width: 0 → auto` 애니메이션에는 overflow-hidden이
   * 필요하지만, **펼쳐진 뒤에도 켜져 있으면** 포기할 때마다 채워지는 색 원의 스프링
   * overshoot(POP_SPRING = stiffness 480·damping 16 → 감쇠비 ≈0.37이라 scale이 1을 넘어 튄다)이
   * 네모 경계에서 잘린다 (2026-07-28 사용자 보고). 그래서 펼침이 끝나면 해제한다.
   * 닫힐 때(showNewOrder=false)는 이 effect가 먼저 돌아 다시 잘라주므로 exit의 width→0도 깔끔하다.
   */
  const [newOrderExpanded, setNewOrderExpanded] = useState(false);
  useEffect(() => {
    if (!showNewOrder) setNewOrderExpanded(false);
  }, [showNewOrder]);

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
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
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
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white transition-[box-shadow,transform,opacity] ${
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

          {/* 경매 진행 중: "새로운 순서" 미리보기 (정부 링크 배지 좌측에 위치) — 포기가 쌓일
              때마다 맨 우측(꼴등)부터 해당 플레이어 색 토큰이 채워진다(우→좌). 경매가 끝나면
              auction=null이 되며 이 영역이 사라지고 위 "순서"가 새 playerOrder로 대체된다. */}
          <AnimatePresence>
            {showNewOrder && newOrderSlots && (
              <motion.div
                key="new-order"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                onAnimationComplete={() => { if (showNewOrder) setNewOrderExpanded(true); }}
                className={`flex items-center gap-3 ${newOrderExpanded ? '' : 'overflow-hidden'}`}
              >
                <div className="w-px h-6 bg-foreground/10 flex-none" />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-accent font-medium whitespace-nowrap">새로운 순서</span>
                  <div className="flex gap-1">
                    {newOrderSlots.map((pid, index) => {
                      const player = pid ? players[pid] : null;
                      return (
                        <div key={index} className="relative w-6 h-6">
                          <AnimatePresence mode="wait">
                            {player ? (
                              <motion.div
                                key={pid}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={POP_SPRING}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                style={{ backgroundColor: PLAYER_COLORS[player.color] }}
                                title={`${index + 1}번(예상): ${player.name}`}
                              >
                                {index + 1}
                              </motion.div>
                            ) : (
                              <div
                                key="empty"
                                className="w-6 h-6 rounded-full border-2 border-dashed border-foreground/20 flex items-center justify-center text-[10px] text-foreground-muted"
                                title={`${index + 1}번(미정)`}
                              >
                                {index + 1}
                              </div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
