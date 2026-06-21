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
  /** 3인+ 게임: 비활성 플레이어를 한 줄 요약으로 압축 (전원을 한눈에) */
  compact?: boolean;
}

export default function PlayerPanel({ playerId, compact = false }: PlayerPanelProps) {
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

  // 3인+ 게임: 현재 턴이 아닌 플레이어는 한 줄 요약으로 압축 (다른 사람 상황을 한눈에)
  if (compact && !isActive) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className={`rounded-lg border px-2 py-1.5 flex items-center justify-between gap-2 ${
          isEliminated
            ? 'border-red-500/40 bg-red-500/10 opacity-60'
            : 'border-foreground/10 bg-background-secondary'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: isEliminated ? '#ef4444' : playerColor }}
          />
          <span className={`font-semibold text-xs truncate ${isEliminated ? 'text-red-400 line-through' : 'text-foreground'}`}>
            {player.name}
          </span>
          {isAI && <Bot className="w-2.5 h-2.5 text-blue-400 flex-shrink-0" />}
          {isEliminated && <Skull className="w-2.5 h-2.5 text-red-400 flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-2 text-[11px] font-medium flex-shrink-0">
          <span className="flex items-center gap-0.5 text-green-400" title="현금"><DollarSign className="w-3 h-3" />{player.cash}</span>
          <span className="flex items-center gap-0.5 text-blue-400" title="수입"><TrendingUp className="w-3 h-3" />{player.income}</span>
          <span className="flex items-center gap-0.5 text-yellow-400" title="엔진"><Train className="w-3 h-3" />{player.engineLevel}</span>
          <span className="flex items-center gap-0.5 text-purple-400" title="발행 주식"><FileText className="w-3 h-3" />{player.issuedShares}</span>
        </div>
      </motion.div>
    );
  }

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
      {/* 헤더 - 반응형 패딩 */}
      <div
        className="px-2 py-1.5 md:px-3 md:py-2 rounded-t-xl flex items-center justify-between"
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
        <div className="flex items-center gap-1.5 md:gap-2">
          <div
            className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full"
            style={{
              backgroundColor: isEliminated ? '#ef4444' : playerColor,
            }}
          />
          <span className={`font-semibold text-xs md:text-sm ${isEliminated ? 'text-red-400 line-through' : 'text-foreground'}`}>
            {player.name}
          </span>
          {isAI && (
            <span className="text-[10px] md:text-xs px-1 md:px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 flex items-center gap-0.5 md:gap-1">
              <Bot className="w-2 h-2 md:w-2.5 md:h-2.5" />
              AI
            </span>
          )}
          {isEliminated && (
            <span className="text-[10px] md:text-xs px-1 md:px-1.5 py-0.5 rounded-full bg-red-500/30 text-red-400 flex items-center gap-0.5 md:gap-1">
              <Skull className="w-2 h-2 md:w-2.5 md:h-2.5" />
              <span className="hidden sm:inline">파산</span>
            </span>
          )}
          {isActive && !isEliminated && (
            <span className="text-[10px] md:text-xs px-1 md:px-1.5 py-0.5 rounded-full bg-accent/20 text-accent whitespace-nowrap">
              {isAICurrentlyThinking ? '생각 중...' : '현재 턴'}
            </span>
          )}
        </div>
      </div>

      {/* 스탯 그리드 - 반응형 패딩 및 간격 */}
      <div className="p-1.5 md:p-2 grid grid-cols-2 gap-1.5 md:gap-2">
        {/* 현금 */}
        <div className="flex items-center gap-1.5 md:gap-2 p-1.5 rounded-lg bg-background/50">
          <DollarSign className="text-green-400 flex-shrink-0 w-3 h-3 md:w-3.5 md:h-3.5" />
          <div className="min-w-0">
            <div className="text-[10px] md:text-xs text-foreground-secondary">현금</div>
            <div className="text-sm md:text-base font-bold text-foreground truncate">${player.cash}</div>
          </div>
        </div>

        {/* 수입 */}
        <div className="flex items-center gap-1.5 md:gap-2 p-1.5 rounded-lg bg-background/50">
          <TrendingUp className="text-blue-400 flex-shrink-0 w-3 h-3 md:w-3.5 md:h-3.5" />
          <div className="min-w-0">
            <div className="text-[10px] md:text-xs text-foreground-secondary">수입</div>
            <div className="text-sm md:text-base font-bold text-foreground truncate">{player.income}</div>
          </div>
        </div>

        {/* 엔진 레벨 */}
        <div className="flex items-center gap-1.5 md:gap-2 p-1.5 rounded-lg bg-background/50">
          <Train className="text-yellow-400 flex-shrink-0 w-3 h-3 md:w-3.5 md:h-3.5" />
          <div className="min-w-0">
            <div className="text-[10px] md:text-xs text-foreground-secondary">엔진</div>
            <div className="text-sm md:text-base font-bold text-foreground">
              {player.engineLevel}
              <span className="text-[10px] md:text-xs text-foreground-secondary"> / {GAME_CONSTANTS.MAX_ENGINE}</span>
            </div>
          </div>
        </div>

        {/* 발행 주식 */}
        <div className="flex items-center gap-1.5 md:gap-2 p-1.5 rounded-lg bg-background/50">
          <FileText className="text-purple-400 flex-shrink-0 w-3 h-3 md:w-3.5 md:h-3.5" />
          <div className="min-w-0">
            <div className="text-[10px] md:text-xs text-foreground-secondary">주식</div>
            <div className="text-sm md:text-base font-bold text-foreground">
              {player.issuedShares}
              <span className="text-[10px] md:text-xs text-foreground-secondary"> 주</span>
            </div>
          </div>
        </div>
      </div>

      {/* 비용 표시 - 반응형 패딩 및 텍스트 */}
      <div className="px-1.5 md:px-2 pb-1.5 md:pb-2">
        <div className="text-[10px] md:text-xs text-foreground-secondary flex items-center justify-between p-1.5 rounded bg-background/30">
          <span>턴 비용</span>
          <span className="text-foreground whitespace-nowrap">
            ${expense} <span className="hidden sm:inline">(주식 {player.issuedShares} + 엔진 {player.engineLevel})</span>
          </span>
        </div>
      </div>

      {/* 주식 발행 UI (해당 단계에서만, 탈락하지 않은 경우, AI가 아닌 경우) - 반응형 */}
      {currentPhase === 'issueShares' && isActive && !isEliminated && !isAI && (
        <div className="px-2 md:px-3 pb-2 md:pb-3 space-y-2 border-t border-foreground/10 pt-2">
          {/* 발행량 선택 - 터치 친화적인 버튼 크기 */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-background/50">
            <span className="text-xs md:text-sm text-foreground-secondary">발행할 주식</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDecreaseAmount}
                disabled={shareAmount <= 1}
                className="p-2 md:p-1 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 rounded hover:bg-foreground/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                aria-label="주식 수량 감소"
              >
                <Minus className="w-4 h-4 text-foreground-secondary" />
              </button>
              <span className="w-8 md:w-10 text-center font-bold text-sm md:text-base text-foreground">{shareAmount}</span>
              <button
                onClick={handleIncreaseAmount}
                disabled={shareAmount >= maxIssuable}
                className="p-2 md:p-1 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 rounded hover:bg-foreground/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                aria-label="주식 수량 증가"
              >
                <Plus className="w-4 h-4 text-foreground-secondary" />
              </button>
            </div>
          </div>

          {/* 예상 결과 - 반응형 텍스트 */}
          <div className="flex items-center justify-between px-2 text-[10px] md:text-xs text-foreground-secondary">
            <span>받는 금액</span>
            <span className="text-green-400 font-medium">+${shareAmount * GAME_CONSTANTS.SHARE_VALUE}</span>
          </div>
          <div className="flex items-center justify-between px-2 text-[10px] md:text-xs text-foreground-secondary">
            <span>발행 후 총 주식</span>
            <span className="text-foreground">{player.issuedShares + shareAmount}주</span>
          </div>
          <div className="flex items-center justify-between px-2 text-[10px] md:text-xs text-foreground-secondary">
            <span>발행 후 턴 비용</span>
            <span className="text-red-400">${player.issuedShares + shareAmount + player.engineLevel}</span>
          </div>

          {/* 발행 버튼 - 터치 친화적인 크기 (min 44px) */}
          <button
            onClick={handleIssueShare}
            disabled={maxIssuable <= 0}
            className="w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium transition-colors
              bg-accent hover:bg-accent-light text-background
              disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={`${shareAmount}주 발행`}
          >
            {shareAmount}주 발행 (+${shareAmount * GAME_CONSTANTS.SHARE_VALUE})
          </button>

          {maxIssuable <= 0 && (
            <p className="text-[10px] md:text-xs text-red-400 text-center">
              최대 발행 한도({GAME_CONSTANTS.MAX_SHARES}주)에 도달했습니다
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
