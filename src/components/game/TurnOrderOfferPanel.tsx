'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useShallow } from 'zustand/react/shallow';
import { PLAYER_COLORS } from '@/types/game';
import { getMapProfile } from '@/maps/getMapProfile';
import { Crown, DollarSign, XCircle, Bot } from 'lucide-react';

/**
 * 교대 선공권 패널 (alternateTurnOrder 맵 전용 — 예: St. Lucia)
 *
 * 경매 대신: 제안받은 플레이어가 $5를 내고 선공하거나 거절.
 * 거절하면 상대에게 옵션이 넘어가고, 모두 거절하면 첫 제안 대상이 무료로 선공.
 */
export default function TurnOrderOfferPanel() {
  const { turnOrderOffer, players, mapId } = useGameStore(
    useShallow((state) => ({
      turnOrderOffer: state.turnOrderOffer,
      players: state.players,
      mapId: state.mapId,
    }))
  );
  const { respondTurnOrderOffer } = useGameStore();

  if (!turnOrderOffer) return null;

  const rules = getMapProfile(mapId);
  const offerPlayer = players[turnOrderOffer.offerPlayer];
  const playerColor = PLAYER_COLORS[offerPlayer.color];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-foreground-secondary">
        <Crown className="w-4 h-4 text-accent" />
        선공권 제안
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-3 space-y-3"
      >
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: playerColor }}
          />
          <span className="text-sm font-medium">{offerPlayer.name}</span>
          <span className="text-xs text-foreground-muted">
            (보유 ${offerPlayer.cash})
          </span>
        </div>

        <p className="text-xs text-foreground-secondary">
          ${rules.firstSeatCost}를 지불하고 이번 턴 1번 플레이어가 되시겠습니까?
          {turnOrderOffer.declined.length === 0 && ' (모두 거절하면 첫 제안 대상이 무료로 선공)'}
        </p>

        {offerPlayer.isAI ? (
          <div className="flex items-center gap-2 text-xs text-foreground-muted animate-pulse">
            <Bot className="w-4 h-4" />
            AI가 결정 중...
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => respondTurnOrderOffer(turnOrderOffer.offerPlayer, true)}
              disabled={offerPlayer.cash < rules.firstSeatCost}
              className="btn-primary flex-1 flex items-center justify-center gap-1 text-sm py-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <DollarSign className="w-4 h-4" />
              선공 (${rules.firstSeatCost})
            </button>
            <button
              onClick={() => respondTurnOrderOffer(turnOrderOffer.offerPlayer, false)}
              className="btn-secondary flex-1 flex items-center justify-center gap-1 text-sm py-2"
            >
              <XCircle className="w-4 h-4" />
              거절
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
