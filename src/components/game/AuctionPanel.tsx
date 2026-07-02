'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useShallow } from 'zustand/react/shallow';
import { PLAYER_COLORS } from '@/types/game';
import { DollarSign, User, Crown, Check, Bot } from 'lucide-react';

export default function AuctionPanel() {
  const { auction, players, playerOrder, currentPlayer } = useGameStore(
    useShallow((state) => ({
      auction: state.auction,
      players: state.players,
      playerOrder: state.playerOrder,
      currentPlayer: state.currentPlayer,
    }))
  );
  const { placeBid, passBid, skipBid, resolveAuction, nextPhase } = useGameStore();

  // 입찰 금액 상태
  const [bidAmount, setBidAmount] = useState(1);

  // 경매 상태 초기화 (처음 진입 시)
  useEffect(() => {
    if (!auction) {
      // 경매가 없으면 최소 입찰 금액으로 초기화
      setBidAmount(1);
    } else {
      // 경매가 있으면 현재 최고 입찰 + 1
      setBidAmount(auction.highestBid + 1);
    }
  }, [auction]);

  // 현재 입찰 차례 = store가 관리하는 currentPlayer (placeBid/passBid/skipBid가 정확히 갱신).
  // 컴포넌트가 자체 계산하던 방식은 store와 어긋날 수 있어 제거.
  // (경매 완료 시 currentPlayer는 승자이지만, 입찰 UI는 isAuctionComplete로 가려진다)
  const currentBidder = currentPlayer;
  const currentBidderData = players[currentBidder];
  const playerColor = PLAYER_COLORS[currentBidderData.color];
  // AI 차례엔 사람이 임의로 입찰/포기하지 못하게 컨트롤을 막는다 (AI가 자동 입찰).
  const isAITurn = currentBidderData?.isAI ?? false;

  // 경매 종료 조건 확인
  const isAuctionComplete = () => {
    if (!auction) return false;

    // 모든 플레이어가 패스했거나 1명만 남았으면 종료
    const activePlayers = playerOrder.filter(p => !auction.passedPlayers.includes(p));
    return activePlayers.length <= 1;
  };

  // Turn Order 패스 사용 가능 여부
  const canUseTurnOrderPass = () => {
    const player = players[currentBidder];
    return player.selectedAction === 'turnOrder' && !player.turnOrderPassUsed;
  };

  // 입찰 가능 금액 범위
  const minBid = auction ? auction.highestBid + 1 : 1;
  const maxBid = currentBidderData.cash;

  // 입찰 핸들러
  const handleBid = () => {
    if (bidAmount < minBid || bidAmount > maxBid) return;
    placeBid(currentBidder, bidAmount);
    setBidAmount(bidAmount + 1); // 다음 입찰을 위해 +1
  };

  // 패스 핸들러
  const handlePass = () => {
    passBid(currentBidder);
  };

  // Turn Order 패스 핸들러 (탈락 없이 패스)
  const handleTurnOrderPass = () => {
    // 1. Turn Order 패스 사용 플래그 설정
    useGameStore.setState((state) => ({
      players: {
        ...state.players,
        [currentBidder]: {
          ...state.players[currentBidder],
          turnOrderPassUsed: true,
        },
      },
    }));

    // 2. skipBid 호출로 다음 입찰자로 진행 (탈락 없음)
    skipBid(currentBidder);
  };

  // 경매 완료 처리
  const handleCompleteAuction = () => {
    resolveAuction();
    nextPhase();
  };

  // 경매 건너뛰기 (간소화 모드)
  const handleSkipAuction = () => {
    nextPhase();
  };

  // 입찰 금액 버튼 생성
  const bidButtons = [];
  for (let i = minBid; i <= Math.min(minBid + 4, maxBid); i++) {
    bidButtons.push(i);
  }

  return (
    <div className="space-y-4">
        {/* 현재 최고 입찰 — 갱신될 때마다 금액이 크게 팝 */}
        <div className="p-3 rounded-lg bg-background/50 border border-foreground/10">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-secondary">현재 최고 입찰</span>
            {auction?.highestBidder ? (
              <div className="flex items-center gap-2">
                <motion.span
                  key={`crown-${auction.highestBid}`}
                  initial={{ rotate: -30, scale: 1.4 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 12 }}
                >
                  <Crown size={16} fill="#f0c040" strokeWidth={1.8} style={{ color: '#7a5200' }} />
                </motion.span>
                <motion.span
                  key={`bid-${auction.highestBid}`}
                  initial={{ scale: 2 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 16 }}
                  className="text-lg font-extrabold"
                  style={{ color: PLAYER_COLORS[players[auction.highestBidder].color] }}
                >
                  ${auction.highestBid}
                </motion.span>
                <span
                  className="text-sm px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: PLAYER_COLORS[players[auction.highestBidder].color] + '30' }}
                >
                  {players[auction.highestBidder].name}
                </span>
              </div>
            ) : (
              <span className="text-foreground-secondary">입찰 없음</span>
            )}
          </div>
        </div>

        {/* 플레이어 상태 */}
        <div className="grid grid-cols-2 gap-2">
          {playerOrder.map((playerId) => {
            const player = players[playerId];
            const isCurrentBidder = currentBidder === playerId;
            const hasPassed = auction?.passedPlayers.includes(playerId);
            const playerBid = auction?.bids[playerId] || 0;
            const pColor = PLAYER_COLORS[player.color];

            const isTopBidder = auction?.highestBidder === playerId && !hasPassed;

            return (
              <div
                key={playerId}
                className={`relative p-3 rounded-lg border transition-all ${
                  isCurrentBidder
                    ? 'border-accent bg-accent/10'
                    : hasPassed
                    ? 'border-red-500/30 bg-red-500/10 opacity-60'
                    : 'border-foreground/10 bg-background/30'
                }`}
                style={
                  isTopBidder
                    ? { borderColor: pColor, boxShadow: `0 0 0 1px ${pColor}, 0 4px 14px -6px ${pColor}AA` }
                    : undefined
                }
              >
                {/* 포기 도장 — 쾅 찍히는 효과 */}
                {hasPassed && (
                  <motion.span
                    initial={{ scale: 2.6, opacity: 0, rotate: -24 }}
                    animate={{ scale: 1, opacity: 1, rotate: -10 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 15 }}
                    className="absolute right-1.5 top-1.5 rounded border-2 border-red-500 px-1 text-[10px] font-extrabold tracking-widest text-red-500"
                  >
                    포기
                  </motion.span>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: pColor }}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {player.name}
                  </span>
                  {isCurrentBidder && !hasPassed && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-accent/30 text-accent">
                      입찰 중
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground-secondary">
                    현금: ${player.cash}
                  </span>
                  {playerBid > 0 && (
                    /* 입찰액이 오를 때마다 그 자리에서 크게 팝 */
                    <motion.span
                      key={playerBid}
                      initial={{ scale: 2.1 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                      className="font-extrabold"
                      style={{ color: pColor, transformOrigin: 'right center' }}
                    >
                      입찰: ${playerBid}
                    </motion.span>
                  )}
                </div>
                {player.selectedAction === 'turnOrder' && (
                  <div className="mt-1 text-xs text-purple-400">
                    Turn Order {player.turnOrderPassUsed ? '(사용됨)' : '(사용 가능)'}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {isAuctionComplete() ? (
            /* 경매 완료 */
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <div className="p-4 rounded-lg border border-accent/30 bg-[#fffdf8] text-center shadow-glass">
                {/* 라이트 테마 대비: 금색 채움 + 진한 갈색 외곽선 왕관 */}
                <motion.span
                  initial={{ scale: 0.4, rotate: -18 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 14 }}
                  className="mb-2 inline-block"
                >
                  <Crown size={34} fill="#f0c040" strokeWidth={1.8} style={{ color: '#7a5200' }} />
                </motion.span>
                {auction?.highestBidder ? (
                  <>
                    <p className="text-lg font-bold text-foreground">
                      <span style={{ color: PLAYER_COLORS[players[auction.highestBidder].color] }}>
                        {players[auction.highestBidder].name}
                      </span>{' '}
                      승리!
                    </p>
                    <p className="text-sm font-medium text-foreground-secondary">
                      ${auction.highestBid} 지불
                    </p>
                  </>
                ) : (
                  <p className="text-lg font-bold text-foreground">
                    입찰 없이 종료
                  </p>
                )}
              </div>
              <button
                onClick={handleCompleteAuction}
                className="w-full py-3 rounded-lg text-sm font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2"
              >
                <Check size={18} />
                경매 완료 및 다음 단계
              </button>
            </motion.div>
          ) : (
            /* 입찰 UI */
            <motion.div
              key="bidding"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {/* 현재 입찰자 표시 */}
              <div
                className="p-3 rounded-lg border-2 text-center"
                style={{ borderColor: playerColor, backgroundColor: playerColor + '10' }}
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <User size={16} style={{ color: playerColor }} />
                  <span className="font-semibold text-foreground">
                    {currentBidderData.name}의 차례
                  </span>
                </div>
                <p className="text-xs text-foreground-secondary">
                  보유 현금: ${currentBidderData.cash}
                </p>
              </div>

              {isAITurn ? (
                /* AI 차례: 사람 컨트롤 숨김, AI 입찰 중 표시 */
                <div className="p-3 rounded-lg bg-background/30 text-center text-sm text-foreground-secondary flex items-center justify-center gap-2">
                  <Bot size={16} className="text-blue-400" />
                  {currentBidderData.name} 입찰 중…
                </div>
              ) : (
                <>
                  {/* 입찰 금액 선택 */}
                  <div>
                    <label className="text-xs text-foreground-secondary block mb-2">
                      입찰 금액 선택 (최소 ${minBid})
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {bidButtons.map((amount) => (
                        <button
                          key={amount}
                          onClick={() => setBidAmount(amount)}
                          disabled={amount > maxBid}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            bidAmount === amount
                              ? 'bg-accent text-background'
                              : 'bg-background/50 text-foreground hover:bg-background/70'
                          } disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                          ${amount}
                        </button>
                      ))}
                      {maxBid > minBid + 4 && (
                        <span className="text-xs text-foreground-secondary self-center">
                          ...${maxBid}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 입찰 버튼 */}
                  <button
                    onClick={handleBid}
                    disabled={bidAmount > maxBid || bidAmount < minBid}
                    className="w-full py-3 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <DollarSign size={18} />
                    ${bidAmount} 입찰
                  </button>

                  {/* 패스 버튼들 */}
                  <div className="flex gap-2">
                    {canUseTurnOrderPass() && (
                      <button
                        onClick={handleTurnOrderPass}
                        className="flex-1 py-2 rounded-lg text-sm font-medium bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition-colors border border-purple-600/30"
                      >
                        Turn Order 패스
                      </button>
                    )}
                    <button
                      onClick={handlePass}
                      className={`${canUseTurnOrderPass() ? 'flex-1' : 'w-full'} py-2 rounded-lg text-sm font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors border border-red-600/30`}
                    >
                      포기 (마지막 순서)
                    </button>
                  </div>

                  {/* 비용 안내 */}
                  <div className="p-2 rounded bg-background/30 text-xs text-foreground-secondary">
                    <p>* 첫 번째 포기: 마지막 순서, 비용 없음</p>
                    <p>* 마지막 두 명: 입찰액 전액 / 그 외 포기: 절반(올림)</p>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

      {/* 간소화 모드 버튼 (개발용) */}
      {!auction && (
        <div className="pt-2 border-t border-foreground/10">
          <button
            onClick={handleSkipAuction}
            className="w-full py-2 rounded-lg text-xs text-foreground-secondary hover:text-foreground hover:bg-background/30 transition-colors"
          >
            경매 건너뛰기 (현재 순서 유지)
          </button>
        </div>
      )}
    </div>
  );
}
