'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import {
  GamePhase,
  PHASE_INFO,
  ACTION_INFO,
  SpecialAction,
  GAME_CONSTANTS,
} from '@/types/game';
import {
  FileText,
  Users,
  Zap,
  Hammer,
  Package,
  DollarSign,
  CreditCard,
  TrendingDown,
  Sparkles,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';
import AuctionPanel from './AuctionPanel';
import GoodsGrowthPanel from './GoodsGrowthPanel';

const PHASE_ICONS: Record<GamePhase, React.ReactNode> = {
  issueShares: <FileText size={18} />,
  determinePlayerOrder: <Users size={18} />,
  selectActions: <Zap size={18} />,
  buildTrack: <Hammer size={18} />,
  moveGoods: <Package size={18} />,
  collectIncome: <DollarSign size={18} />,
  payExpenses: <CreditCard size={18} />,
  incomeReduction: <TrendingDown size={18} />,
  goodsGrowth: <Sparkles size={18} />,
  advanceTurn: <ArrowRight size={18} />,
  gameOver: <Sparkles size={18} />,
};

const ACTIONS: SpecialAction[] = [
  'firstMove',
  'firstBuild',
  'engineer',
  'locomotive',
  'urbanization',
  'production',
  'turnOrder',
];

export default function PhasePanel() {
  const {
    currentPhase,
    currentPlayer,
    players,
    activePlayers,
    phaseState,
    nextPhase,
    selectAction,
    upgradeEngine,
  } = useGameStore();

  const phaseInfo = PHASE_INFO[currentPhase];
  const currentPlayerData = players[currentPlayer];

  // 행동 선택 가능 여부
  const isActionTaken = (action: SpecialAction) => {
    return Object.values(players).some((p) => p.selectedAction === action);
  };

  // 행동 선택 핸들러
  const handleSelectAction = (action: SpecialAction) => {
    if (!isActionTaken(action)) {
      selectAction(currentPlayer, action);
    }
  };

  // 다음 단계로 이동
  const handleNextPhase = () => {
    nextPhase();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-accent/30 bg-accent/5 overflow-hidden"
    >
      {/* 헤더 */}
      <div className="px-4 py-3 bg-accent/10 border-b border-accent/20 flex items-center gap-3">
        <span className="text-accent">{PHASE_ICONS[currentPhase]}</span>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">{phaseInfo.name}</h3>
          <p className="text-xs text-foreground-secondary">{phaseInfo.description}</p>
        </div>
      </div>

      {/* 단계별 UI */}
      <div className="p-4">
        {/* I. 주식 발행 */}
        {currentPhase === 'issueShares' && (
          <div className="space-y-3">
            <p className="text-sm text-foreground-secondary">
              현재 플레이어: <span className="text-foreground font-medium">{currentPlayerData.name}</span>
            </p>
            <p className="text-sm text-foreground-secondary">
              보유 주식: {currentPlayerData.issuedShares}주 / 현금: ${currentPlayerData.cash}
            </p>
            <button
              onClick={handleNextPhase}
              className="w-full py-2 rounded-lg text-sm font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2"
            >
              다음 단계로
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* II. 플레이어 순서 - AuctionPanel 사용 */}
        {currentPhase === 'determinePlayerOrder' && (
          <AuctionPanel />
        )}

        {/* III. 행동 선택 */}
        {currentPhase === 'selectActions' && (
          <div className="space-y-3">
            <p className="text-sm text-foreground-secondary mb-3">
              <span className="text-accent font-medium">{currentPlayerData.name}</span>, 행동을 선택하세요:
            </p>
            {/* 선택 현황 표시 */}
            <div className="p-2 rounded-lg bg-background/30 text-xs text-foreground-secondary">
              {players.player1.selectedAction ? (
                <span className="text-green-400">{players.player1.name}: {ACTION_INFO[players.player1.selectedAction].name}</span>
              ) : (
                <span>{players.player1.name}: 선택 대기</span>
              )}
              {' / '}
              {players.player2.selectedAction ? (
                <span className="text-green-400">{players.player2.name}: {ACTION_INFO[players.player2.selectedAction].name}</span>
              ) : (
                <span>{players.player2.name}: 선택 대기</span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2">
              {ACTIONS.map((action) => {
                const info = ACTION_INFO[action];
                const taken = isActionTaken(action);
                const isSelected = currentPlayerData.selectedAction === action;

                return (
                  <button
                    key={action}
                    onClick={() => handleSelectAction(action)}
                    disabled={taken || currentPlayerData.selectedAction !== null}
                    className={`p-3 rounded-lg text-left transition-all ${
                      isSelected
                        ? 'bg-accent/20 border border-accent'
                        : taken
                        ? 'bg-background/30 opacity-50 cursor-not-allowed'
                        : currentPlayerData.selectedAction !== null
                        ? 'bg-background/30 opacity-50 cursor-not-allowed'
                        : 'bg-background/50 hover:bg-background/70 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-foreground">
                        {info.name}
                      </span>
                      {taken && !isSelected && (
                        <span className="text-xs text-foreground-secondary">선택됨</span>
                      )}
                    </div>
                    <p className="text-xs text-foreground-secondary mt-1">
                      {info.description}
                    </p>
                  </button>
                );
              })}
            </div>
            {currentPlayerData.selectedAction && (
              <button
                onClick={handleNextPhase}
                className="w-full py-2 rounded-lg text-sm font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2 mt-4"
              >
                {players.player1.selectedAction && players.player2.selectedAction
                  ? '트랙 건설 단계로'
                  : `${currentPlayer === 'player1' ? players.player2.name : players.player1.name} 차례로`}
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        )}

        {/* IV. 트랙 건설 */}
        {currentPhase === 'buildTrack' && (
          <div className="space-y-3">
            <p className="text-sm text-foreground-secondary">
              <span className="text-accent font-medium">{currentPlayerData.name}</span>의 트랙 건설 차례
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-secondary">건설한 트랙</span>
              <span className="text-lg font-bold text-foreground">
                {phaseState.builtTracksThisTurn} / {phaseState.maxTracksThisTurn}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-background/50">
              <p className="text-xs text-foreground-secondary">
                1. 도시 또는 기존 트랙을 클릭
              </p>
              <p className="text-xs text-foreground-secondary">
                2. 노란색 헥스를 클릭 (건설 위치)
              </p>
              <p className="text-xs text-foreground-secondary">
                3. 나갈 방향 클릭 (곡선/직선 선택)
              </p>
              <p className="text-xs text-foreground-secondary mt-2">
                • 평지: $2 / 강: $3 / 산: $4
              </p>
              <p className="text-xs text-foreground-secondary">
                • 현금: ${currentPlayerData.cash}
              </p>
              {currentPlayerData.selectedAction === 'engineer' && (
                <p className="text-xs text-accent mt-1">
                  • Engineer: 4개까지 건설 가능!
                </p>
              )}
            </div>
            <button
              onClick={handleNextPhase}
              className="w-full py-2 rounded-lg text-sm font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2"
            >
              {(() => {
                const currentIndex = activePlayers.indexOf(currentPlayer);
                const isLastPlayer = currentIndex === activePlayers.length - 1;
                if (isLastPlayer) {
                  return '물품 이동 단계로';
                } else {
                  const nextPlayer = activePlayers[currentIndex + 1];
                  return `${players[nextPlayer].name} 건설 차례로`;
                }
              })()}
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* V. 물품 이동 */}
        {currentPhase === 'moveGoods' && (
          <div className="space-y-3">
            <p className="text-sm text-foreground-secondary">
              <span className="text-accent font-medium">{currentPlayerData.name}</span>의 물품 이동 차례
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-secondary">이동 라운드</span>
              <span className="text-lg font-bold text-foreground">
                {phaseState.moveGoodsRound} / 2
              </span>
            </div>
            <div className="p-3 rounded-lg bg-background/50">
              <p className="text-xs text-foreground-secondary">
                • 엔진 레벨: {currentPlayerData.engineLevel} 링크
              </p>
              <p className="text-xs text-foreground-secondary">
                • 물품을 클릭하여 이동하거나
              </p>
              {currentPlayerData.selectedAction === 'firstMove' && (
                <p className="text-xs text-accent mt-1">
                  • First Move: 먼저 이동!
                </p>
              )}
            </div>
            <button
              onClick={upgradeEngine}
              disabled={currentPlayerData.engineLevel >= GAME_CONSTANTS.MAX_ENGINE || phaseState.playerMoves[currentPlayer]}
              className="w-full py-2 rounded-lg text-sm font-medium bg-background/50 hover:bg-background/70 text-foreground transition-colors disabled:opacity-50"
            >
              엔진 업그레이드 (+1 링크)
            </button>
            <button
              onClick={handleNextPhase}
              className="w-full py-2 rounded-lg text-sm font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2"
            >
              {(() => {
                // 클릭 후 상태 예측
                const updatedMoves = { ...phaseState.playerMoves, [currentPlayer]: true };
                const willBothMoved = updatedMoves.player1 && updatedMoves.player2;

                if (!willBothMoved) {
                  const otherPlayer = currentPlayer === 'player1' ? players.player2.name : players.player1.name;
                  return `${otherPlayer} 이동 차례로`;
                }
                if (phaseState.moveGoodsRound < 2) {
                  return '라운드 2로';
                }
                return '수입 수집 단계로';
              })()}
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* VI-VIII. 자동 단계들 */}
        {['collectIncome', 'payExpenses', 'incomeReduction', 'advanceTurn'].includes(
          currentPhase
        ) && (
          <div className="space-y-3">
            <p className="text-sm text-foreground-secondary">
              이 단계는 자동으로 처리됩니다.
            </p>
            <button
              onClick={handleNextPhase}
              className="w-full py-2 rounded-lg text-sm font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2"
            >
              진행
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* IX. 물품 성장 */}
        {currentPhase === 'goodsGrowth' && (
          <GoodsGrowthPanel />
        )}
      </div>
    </motion.div>
  );
}
