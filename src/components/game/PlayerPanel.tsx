'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useShallow } from 'zustand/react/shallow';
import { PlayerId, PLAYER_COLORS, GAME_CONSTANTS } from '@/types/game';
import {
  DollarSign,
  TrendingUp,
  Train,
  FileText,
  Plus,
  Minus,
  Skull,
  Bot,
} from 'lucide-react';

interface PlayerPanelProps {
  playerId: PlayerId;
}

export default function PlayerPanel({ playerId }: PlayerPanelProps) {
  const { players, currentPlayer, currentPhase, aiExecution } = useGameStore(
    useShallow((state) => ({
      players: state.players,
      currentPlayer: state.currentPlayer,
      currentPhase: state.currentPhase,
      aiExecution: state.aiExecution,
    }))
  );
  const issueShare = useGameStore((state) => state.issueShare);
  const player = players[playerId];
  const isActive = currentPlayer === playerId;
  const playerColor = PLAYER_COLORS[player.color];
  const isAI = player.isAI;
  const isAICurrentlyThinking = isAI && isActive && aiExecution.pending;

  // 다중 주식 발행을 위한 상태
  const [shareAmount, setShareAmount] = useState(1);

  // 비용 계산
  const expense = player.issuedShares + player.engineLevel;

  // 발행 가능한 최대 주식 수
  const maxIssuable = GAME_CONSTANTS.MAX_SHARES - player.issuedShares;

  // 주식 발행량 조절 핸들러
  const handleDecreaseAmount = () => {
    setShareAmount(prev => Math.max(1, prev - 1));
  };

  const handleIncreaseAmount = () => {
    setShareAmount(prev => Math.min(maxIssuable, prev + 1));
  };

  // 주식 발행 핸들러
  const handleIssueShare = () => {
    if (currentPhase === 'issueShares' && isActive && shareAmount > 0) {
      issueShare(playerId, shareAmount);
      setShareAmount(1); // 발행 후 초기화
    }
  };

  // 탈락 상태 체크
  const isEliminated = player.eliminated;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`rounded-xl border transition-all ${
        isEliminated
          ? 'border-red-500/50 bg-red-500/10 opacity-60'
          : isActive
          ? 'border-accent bg-accent/5'
          : 'border-foreground/10 bg-background-secondary'
      }`}
    >
      {/* 헤더 */}
      <div
        className="px-3 py-2 rounded-t-xl flex items-center justify-between"
        style={{
          backgroundColor: isEliminated
            ? 'rgba(239, 68, 68, 0.2)'
            : isActive
            ? `${playerColor}20`
            : 'transparent',
          borderBottom: `2px solid ${
            isEliminated ? '#ef4444' : isActive ? playerColor : 'transparent'
          }`,
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{
              backgroundColor: isEliminated ? '#ef4444' : playerColor,
            }}
          />
          <span className={`font-semibold text-sm ${isEliminated ? 'text-red-400 line-through' : 'text-foreground'}`}>
            {player.name}
          </span>
          {isAI && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 flex items-center gap-1">
              <Bot size={10} />
              AI
            </span>
          )}
          {isEliminated && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/30 text-red-400 flex items-center gap-1">
              <Skull size={10} />
              파산
            </span>
          )}
          {isActive && !isEliminated && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
              {isAICurrentlyThinking ? '생각 중...' : '현재 턴'}
            </span>
          )}
        </div>
      </div>

      {/* 스탯 그리드 - 높이 줄임 */}
      <div className="p-2 grid grid-cols-2 gap-2">
        {/* 현금 */}
        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-background/50">
          <DollarSign size={14} className="text-green-400" />
          <div>
            <div className="text-xs text-foreground-secondary">현금</div>
            <div className="text-base font-bold text-foreground">${player.cash}</div>
          </div>
        </div>

        {/* 수입 */}
        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-background/50">
          <TrendingUp size={14} className="text-blue-400" />
          <div>
            <div className="text-xs text-foreground-secondary">수입</div>
            <div className="text-base font-bold text-foreground">{player.income}</div>
          </div>
        </div>

        {/* 엔진 레벨 */}
        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-background/50">
          <Train size={14} className="text-yellow-400" />
          <div>
            <div className="text-xs text-foreground-secondary">엔진</div>
            <div className="text-base font-bold text-foreground">
              {player.engineLevel}
              <span className="text-xs text-foreground-secondary"> / {GAME_CONSTANTS.MAX_ENGINE}</span>
            </div>
          </div>
        </div>

        {/* 발행 주식 */}
        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-background/50">
          <FileText size={14} className="text-purple-400" />
          <div>
            <div className="text-xs text-foreground-secondary">주식</div>
            <div className="text-base font-bold text-foreground">
              {player.issuedShares}
              <span className="text-xs text-foreground-secondary"> 주</span>
            </div>
          </div>
        </div>
      </div>

      {/* 비용 표시 */}
      <div className="px-2 pb-2">
        <div className="text-xs text-foreground-secondary flex items-center justify-between p-1.5 rounded bg-background/30">
          <span>턴 비용</span>
          <span className="text-foreground">
            ${expense} (주식 {player.issuedShares} + 엔진 {player.engineLevel})
          </span>
        </div>
      </div>

      {/* 주식 발행 UI (해당 단계에서만, 탈락하지 않은 경우, AI가 아닌 경우) */}
      {currentPhase === 'issueShares' && isActive && !isEliminated && !isAI && (
        <div className="px-3 pb-3 space-y-2 border-t border-foreground/10 pt-2">
          {/* 발행량 선택 */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-background/50">
            <span className="text-sm text-foreground-secondary">발행할 주식</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDecreaseAmount}
                disabled={shareAmount <= 1}
                className="p-1 rounded hover:bg-foreground/10 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Minus size={16} className="text-foreground-secondary" />
              </button>
              <span className="w-8 text-center font-bold text-foreground">{shareAmount}</span>
              <button
                onClick={handleIncreaseAmount}
                disabled={shareAmount >= maxIssuable}
                className="p-1 rounded hover:bg-foreground/10 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus size={16} className="text-foreground-secondary" />
              </button>
            </div>
          </div>

          {/* 예상 결과 */}
          <div className="flex items-center justify-between px-2 text-xs text-foreground-secondary">
            <span>받는 금액</span>
            <span className="text-green-400 font-medium">+${shareAmount * GAME_CONSTANTS.SHARE_VALUE}</span>
          </div>
          <div className="flex items-center justify-between px-2 text-xs text-foreground-secondary">
            <span>발행 후 총 주식</span>
            <span className="text-foreground">{player.issuedShares + shareAmount}주</span>
          </div>
          <div className="flex items-center justify-between px-2 text-xs text-foreground-secondary">
            <span>발행 후 턴 비용</span>
            <span className="text-red-400">${player.issuedShares + shareAmount + player.engineLevel}</span>
          </div>

          {/* 발행 버튼 */}
          <button
            onClick={handleIssueShare}
            disabled={maxIssuable <= 0}
            className="w-full py-2 rounded-lg text-sm font-medium transition-colors
              bg-accent hover:bg-accent-light text-background
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {shareAmount}주 발행 (+${shareAmount * GAME_CONSTANTS.SHARE_VALUE})
          </button>

          {maxIssuable <= 0 && (
            <p className="text-xs text-red-400 text-center">
              최대 발행 한도({GAME_CONSTANTS.MAX_SHARES}주)에 도달했습니다
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
