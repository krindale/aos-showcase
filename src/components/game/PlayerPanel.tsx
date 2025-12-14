'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { PlayerId, PLAYER_COLORS, ACTION_INFO, GAME_CONSTANTS } from '@/types/game';
import {
  DollarSign,
  TrendingUp,
  Train,
  FileText,
  Zap,
} from 'lucide-react';

interface PlayerPanelProps {
  playerId: PlayerId;
}

export default function PlayerPanel({ playerId }: PlayerPanelProps) {
  const { players, currentPlayer, currentPhase, issueShare } = useGameStore();
  const player = players[playerId];
  const isActive = currentPlayer === playerId;
  const playerColor = PLAYER_COLORS[player.color];

  // 비용 계산
  const expense = player.issuedShares + player.engineLevel;

  // 주식 발행 핸들러
  const handleIssueShare = () => {
    if (currentPhase === 'issueShares' && isActive) {
      issueShare(playerId, 1);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`rounded-xl border transition-all ${
        isActive
          ? 'border-accent bg-accent/5'
          : 'border-foreground/10 bg-background-secondary'
      }`}
    >
      {/* 헤더 */}
      <div
        className="px-4 py-3 rounded-t-xl flex items-center justify-between"
        style={{
          backgroundColor: isActive ? `${playerColor}20` : 'transparent',
          borderBottom: `2px solid ${isActive ? playerColor : 'transparent'}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: playerColor }}
          />
          <span className="font-semibold text-foreground">{player.name}</span>
          {isActive && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">
              현재 턴
            </span>
          )}
        </div>
      </div>

      {/* 스탯 그리드 */}
      <div className="p-4 grid grid-cols-2 gap-3">
        {/* 현금 */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50">
          <DollarSign size={16} className="text-green-400" />
          <div>
            <div className="text-xs text-foreground-secondary">현금</div>
            <div className="text-lg font-bold text-foreground">${player.cash}</div>
          </div>
        </div>

        {/* 수입 */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50">
          <TrendingUp size={16} className="text-blue-400" />
          <div>
            <div className="text-xs text-foreground-secondary">수입</div>
            <div className="text-lg font-bold text-foreground">{player.income}</div>
          </div>
        </div>

        {/* 엔진 레벨 */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50">
          <Train size={16} className="text-yellow-400" />
          <div>
            <div className="text-xs text-foreground-secondary">엔진</div>
            <div className="text-lg font-bold text-foreground">
              {player.engineLevel}
              <span className="text-xs text-foreground-secondary"> / {GAME_CONSTANTS.MAX_ENGINE}</span>
            </div>
          </div>
        </div>

        {/* 발행 주식 */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50">
          <FileText size={16} className="text-purple-400" />
          <div>
            <div className="text-xs text-foreground-secondary">주식</div>
            <div className="text-lg font-bold text-foreground">
              {player.issuedShares}
              <span className="text-xs text-foreground-secondary"> 주</span>
            </div>
          </div>
        </div>
      </div>

      {/* 비용 표시 */}
      <div className="px-4 pb-2">
        <div className="text-xs text-foreground-secondary flex items-center justify-between p-2 rounded bg-background/30">
          <span>턴 비용</span>
          <span className="text-foreground">
            ${expense} (주식 {player.issuedShares} + 엔진 {player.engineLevel})
          </span>
        </div>
      </div>

      {/* 선택한 행동 */}
      {player.selectedAction && (
        <div className="px-4 pb-3">
          <div className="p-2 rounded-lg bg-accent/10 border border-accent/30">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-accent" />
              <span className="text-sm font-medium text-accent">
                {ACTION_INFO[player.selectedAction].name}
              </span>
            </div>
            <p className="text-xs text-foreground-secondary mt-1">
              {ACTION_INFO[player.selectedAction].description}
            </p>
          </div>
        </div>
      )}

      {/* 주식 발행 버튼 (해당 단계에서만) */}
      {currentPhase === 'issueShares' && isActive && (
        <div className="px-4 pb-4">
          <button
            onClick={handleIssueShare}
            disabled={player.issuedShares >= GAME_CONSTANTS.MAX_SHARES}
            className="w-full py-2 rounded-lg text-sm font-medium transition-colors
              bg-accent/20 hover:bg-accent/30 text-accent
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            주식 발행 (+$5)
          </button>
        </div>
      )}
    </motion.div>
  );
}
