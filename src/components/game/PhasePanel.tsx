'use client';

import { motion } from 'framer-motion';
import { useGameStore, getUndoLabel } from '@/store/gameStore';
import { useShallow } from 'zustand/react/shallow';
import {
  GamePhase,
  PHASE_INFO,
  ACTION_INFO,
  SpecialAction,
  GAME_CONSTANTS,
  PLAYER_COLORS,
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
  X,
  Undo2,
} from 'lucide-react';
import AuctionPanel from './AuctionPanel';
import TurnOrderOfferPanel from './TurnOrderOfferPanel';
import { POP_SPRING, useIsFirstRender } from './uiEffects';
import { getMapProfile } from '@/maps/getMapProfile';
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
    aiExecution,
    turnOrderOffer,
    mapId,
  } = useGameStore(
    useShallow((state) => ({
      currentPhase: state.currentPhase,
      currentPlayer: state.currentPlayer,
      players: state.players,
      activePlayers: state.activePlayers,
      phaseState: state.phaseState,
      aiExecution: state.aiExecution,
      turnOrderOffer: state.turnOrderOffer,
      mapId: state.mapId,
    }))
  );

  // AI 실행 중 여부 (버튼 비활성화에 사용)
  const isAIExecuting = aiExecution.pending;
  const { nextPhase, selectAction, upgradeEngine, cancelSelection, undoLastAction } = useGameStore();

  // 커밋 전 선택이 있는지 (취소 버튼 표시용 — boolean 셀렉터라 값이 바뀔 때만 리렌더)
  const hasActiveSelection = useGameStore(
    (s) =>
      s.ui.buildMode !== 'idle' ||
      s.ui.selectedCube !== null ||
      s.ui.complexTrackSelection !== null ||
      s.ui.redirectTrackSelection !== null
  );

  // 실행 취소 가능한 확정 행동 수 (주식 발행/행동 선택/트랙 건설 — 단계 전환 전까지)
  const undoCount = useGameStore((s) => s.undoCount);

  // 실행 취소 버튼 (사람 차례에만, 취소할 행동이 있을 때만)
  const undoButton =
    undoCount > 0 && !players[currentPlayer]?.isAI ? (
      <button
        onClick={undoLastAction}
        disabled={isAIExecuting}
        className="flex-shrink-0 min-h-[44px] px-3 py-3 md:py-2 rounded-lg text-sm font-medium bg-steam-red/10 text-steam-red border border-steam-red/30 hover:bg-steam-red/20 transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="실행 취소"
        title={`취소: ${getUndoLabel() ?? '마지막 행동'}`}
      >
        <Undo2 className="w-4 h-4" />
        취소
      </button>
    ) : null;

  const phaseInfo = PHASE_INFO[currentPhase];
  const currentPlayerData = players[currentPlayer];

  // 리마운트(모바일 시트 여닫기 등) 시 지난 선택 팝이 일제 재생되지 않게 첫 렌더는 애니메이션 생략
  const firstRender = useIsFirstRender();

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
      {/* 헤더 - 반응형 패딩 */}
      <div className="px-2 py-2 md:px-4 md:py-3 bg-accent/10 border-b border-accent/20 flex items-center gap-2 md:gap-3">
        <span className="text-accent flex-shrink-0">{PHASE_ICONS[currentPhase]}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm md:text-base text-foreground truncate">{phaseInfo.name}</h3>
          <p className="text-[10px] md:text-xs text-foreground-secondary truncate">{phaseInfo.description}</p>
        </div>
      </div>

      {/* 단계별 UI - 반응형 패딩 */}
      <div className="p-2 md:p-4">
        {/* I. 주식 발행 - 반응형 */}
        {currentPhase === 'issueShares' && (
          <div className="space-y-2 md:space-y-3">
            <p className="text-xs md:text-sm text-foreground-secondary">
              현재 플레이어: <span className="text-foreground font-medium">{currentPlayerData.name}</span>
            </p>
            <p className="text-xs md:text-sm text-foreground-secondary">
              보유 주식: {currentPlayerData.issuedShares}주 / 현금: ${currentPlayerData.cash}
            </p>
            {currentPlayerData.isAI ? (
              <div className="text-center py-4">
                <div className="animate-pulse text-accent font-medium">
                  {currentPlayerData.name} (AI) 주식 발행 중...
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleNextPhase}
                  disabled={isAIExecuting}
                  className="flex-1 min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="다음 단계로"
                >
                  다음 단계로
                  <ChevronRight className="w-4 h-4" />
                </button>
                {undoButton}
              </div>
            )}
          </div>
        )}

        {/* II. 플레이어 순서 - 교대 선공권 맵(St. Lucia)은 제안 패널, 그 외 경매 */}
        {currentPhase === 'determinePlayerOrder' && (
          turnOrderOffer ? <TurnOrderOfferPanel /> : <AuctionPanel />
        )}

        {/* III. 행동 선택 - 반응형 */}
        {currentPhase === 'selectActions' && (
          <div className="space-y-2 md:space-y-3">
            {currentPlayerData.isAI ? (
              <div className="text-center py-4">
                <div className="animate-pulse text-accent font-medium">
                  {currentPlayerData.name} (AI) 행동 선택 중...
                </div>
              </div>
            ) : (
              <p className="text-xs md:text-sm text-foreground-secondary mb-2 md:mb-3">
                <span className="text-accent font-medium">{currentPlayerData.name}</span>, 행동을 선택하세요:
              </p>
            )}
            {/* 선택 현황 표시 — 선택되는 순간 그 항목이 플레이어 색으로 팝 (탈락자는 제외) */}
            <div className="p-1.5 md:p-2 rounded-lg bg-background/30 text-[10px] md:text-xs text-foreground-secondary flex flex-wrap gap-x-3 gap-y-1">
              {activePlayers.map((pid) => {
                const p = players[pid];
                if (!p || p.eliminated) return null;
                const pColor = PLAYER_COLORS[p.color];
                return p.selectedAction ? (
                  <motion.span
                    key={`${pid}-${p.selectedAction}`}
                    initial={firstRender.current ? false : { scale: 1.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={POP_SPRING}
                    className="inline-flex items-center gap-1 font-bold"
                    style={{ color: pColor, transformOrigin: 'left center' }}
                  >
                    <span className="inline-block h-2 w-2 rounded-full ring-1 ring-black/15" style={{ background: pColor }} />
                    {p.name}: {ACTION_INFO[p.selectedAction].name}
                  </motion.span>
                ) : (
                  <span key={pid} className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full ring-1 ring-black/15" style={{ background: pColor }} />
                    {p.name}: 선택 대기
                  </span>
                );
              })}
            </div>
            {/* AI가 아닌 경우에만 행동 선택 버튼 표시 */}
            {!currentPlayerData.isAI && (
              <>
                <div className="grid grid-cols-1 gap-1.5 md:gap-2">
                  {ACTIONS.map((action) => {
                    const info = ACTION_INFO[action];
                    const taken = isActionTaken(action);
                    const isSelected = currentPlayerData.selectedAction === action;
                    // 맵 룰로 금지된 행동 (St. Lucia: production, turnOrder)
                    const mapDisabled = getMapProfile(mapId).disabledActions.includes(action);

                    return (
                      <button
                        key={action}
                        onClick={() => handleSelectAction(action)}
                        disabled={taken || mapDisabled || currentPlayerData.selectedAction !== null}
                        className={`p-2 md:p-3 min-h-[44px] rounded-lg text-left transition-all ${
                          isSelected
                            ? 'bg-accent/20 border border-accent'
                            : taken || mapDisabled
                            ? 'bg-background/30 opacity-40 cursor-not-allowed'
                            : currentPlayerData.selectedAction !== null
                            ? 'bg-background/30 opacity-50 cursor-not-allowed'
                            : 'bg-background/50 hover:bg-background/70 border border-transparent'
                        }`}
                        aria-label={`${info.name} 선택`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-medium text-xs md:text-sm ${mapDisabled ? 'line-through text-foreground-muted' : 'text-foreground'}`}>
                            {info.name}
                          </span>
                          {mapDisabled ? (
                            <span className="text-[10px] md:text-xs text-steam-red">이 맵에서 사용 불가</span>
                          ) : taken && !isSelected ? (
                            <span className="text-[10px] md:text-xs text-foreground-secondary">선택됨</span>
                          ) : null}
                        </div>
                        <p className="text-[10px] md:text-xs text-foreground-secondary mt-0.5 md:mt-1">
                          {action === 'engineer' && getMapProfile(mapId).engineerHalfCost
                            ? '이번 턴에 트랙 1개를 절반 비용으로 건설합니다. (4개 혜택 없음)'
                            : info.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {currentPlayerData.selectedAction && (
                  <>
                    <div className="mt-3 md:mt-4">{undoButton}</div>
                    <button
                      onClick={handleNextPhase}
                      disabled={isAIExecuting}
                      className="w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="다음 단계로"
                    >
                      {players.player1.selectedAction && players.player2.selectedAction
                        ? '트랙 건설 단계로'
                        : `${currentPlayer === 'player1' ? players.player2.name : players.player1.name} 차례로`}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* IV. 트랙 건설 - 반응형 */}
        {currentPhase === 'buildTrack' && (
          <div className="space-y-2 md:space-y-3">
            <p className="text-xs md:text-sm text-foreground-secondary">
              <span className="text-accent font-medium">{currentPlayerData.name}</span>의 트랙 건설 차례
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs md:text-sm text-foreground-secondary">건설한 트랙</span>
              <span className="text-base md:text-lg font-bold text-foreground">
                {phaseState.builtTracksThisTurn} / {phaseState.maxTracksThisTurn}
              </span>
            </div>
            <div className="p-2 md:p-3 rounded-lg bg-background/50">
              <p className="text-[10px] md:text-xs text-foreground-secondary">
                1. 도시 또는 기존 트랙을 클릭
              </p>
              <p className="text-[10px] md:text-xs text-foreground-secondary">
                2. 노란색 헥스를 클릭 (건설 위치)
              </p>
              <p className="text-[10px] md:text-xs text-foreground-secondary">
                3. 나갈 방향 클릭 (곡선/직선 선택)
              </p>
              <p className="text-[10px] md:text-xs text-foreground-secondary mt-1 md:mt-2">
                • 평지: $2 / 강: $3 / 산: $4
              </p>
              <p className="text-[10px] md:text-xs text-foreground-secondary">
                • 현금: ${currentPlayerData.cash}
              </p>
              {currentPlayerData.selectedAction === 'engineer' && (
                <p className="text-[10px] md:text-xs text-accent mt-1">
                  {getMapProfile(mapId).engineerHalfCost
                    ? '• Engineer: 트랙 1개를 절반 비용으로!'
                    : '• Engineer: 4개까지 건설 가능!'}
                </p>
              )}
            </div>
            {hasActiveSelection && !currentPlayerData.isAI && (
              <button
                onClick={cancelSelection}
                className="w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-steam-red/10 text-steam-red border border-steam-red/30 hover:bg-steam-red/20 transition-colors flex items-center justify-center gap-2"
                aria-label="선택 취소"
              >
                <X className="w-4 h-4" />
                선택 취소
              </button>
            )}
            {undoButton}
            <button
              onClick={handleNextPhase}
              disabled={isAIExecuting}
              className="w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="다음 단계로"
            >
              {(() => {
                // 클릭 후 상태 예측
                const updatedMoves = { ...phaseState.playerMoves, [currentPlayer]: true };
                const willAllBuilt = activePlayers.every(p => updatedMoves[p]);

                if (!willAllBuilt) {
                  // 아직 건설 안 한 플레이어 찾기
                  const nextBuilder = activePlayers.find(p => !updatedMoves[p]);
                  if (nextBuilder) {
                    return `${players[nextBuilder].name} 건설 차례로`;
                  }
                }
                return '물품 이동 단계로';
              })()}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* V. 물품 이동 - 반응형 */}
        {currentPhase === 'moveGoods' && (
          <div className="space-y-2 md:space-y-3">
            <p className="text-xs md:text-sm text-foreground-secondary">
              <span className="text-accent font-medium">{currentPlayerData.name}</span>의 물품 이동 차례
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs md:text-sm text-foreground-secondary">이동 라운드</span>
              <span className="text-base md:text-lg font-bold text-foreground">
                {phaseState.moveGoodsRound} / 2
              </span>
            </div>
            <div className="p-2 md:p-3 rounded-lg bg-background/50">
              <p className="text-[10px] md:text-xs text-foreground-secondary">
                • 엔진 레벨: {currentPlayerData.engineLevel} 링크
              </p>
              <p className="text-[10px] md:text-xs text-foreground-secondary">
                • 물품을 클릭하여 이동하거나
              </p>
              {currentPlayerData.selectedAction === 'firstMove' && (
                <p className="text-[10px] md:text-xs text-accent mt-1">
                  • First Move: 먼저 이동!
                </p>
              )}
            </div>
            {hasActiveSelection && !currentPlayerData.isAI && (
              <button
                onClick={cancelSelection}
                className="w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-steam-red/10 text-steam-red border border-steam-red/30 hover:bg-steam-red/20 transition-colors flex items-center justify-center gap-2"
                aria-label="선택 취소"
              >
                <X className="w-4 h-4" />
                선택 취소
              </button>
            )}
            <button
              onClick={() => upgradeEngine()}
              disabled={isAIExecuting || currentPlayerData.engineLevel >= GAME_CONSTANTS.MAX_ENGINE || phaseState.playerMoves[currentPlayer]}
              className="w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-background/50 hover:bg-background/70 text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="엔진 업그레이드"
            >
              엔진 업그레이드 (+1 링크)
            </button>
            <button
              onClick={() => {
                // 인간 플레이어가 아직 이동하지 않았으면 확인
                if (!currentPlayerData.isAI && !phaseState.playerMoves[currentPlayer]) {
                  if (!window.confirm('물품 이동을 건너뛰시겠습니까?')) return;
                }
                handleNextPhase();
              }}
              disabled={isAIExecuting}
              className={`w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                !currentPlayerData.isAI && !phaseState.playerMoves[currentPlayer]
                  ? 'bg-foreground/10 text-foreground-secondary hover:bg-foreground/20 border border-foreground/20'
                  : 'bg-accent text-background hover:bg-accent-light'
              }`}
              aria-label="다음 단계로"
            >
              {(() => {
                // 인간이 아직 이동 안 했으면 "이동 건너뛰기"
                if (!currentPlayerData.isAI && !phaseState.playerMoves[currentPlayer]) {
                  return '이동 건너뛰기';
                }
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
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* VI. 수입 수집 - 반응형 */}
        {currentPhase === 'collectIncome' && (
          <div className="space-y-2 md:space-y-3">
            <p className="text-xs md:text-sm text-foreground-secondary">
              각 플레이어가 수입 트랙 위치만큼 현금을 받습니다.
            </p>
            {activePlayers.map(pid => {
              const p = players[pid];
              if (!p || p.eliminated) return null;
              return (
                <div key={pid} className="p-2 rounded-lg bg-background/30 text-[10px] md:text-xs text-foreground-secondary flex justify-between">
                  <span>{p.name}</span>
                  <span>수입 {p.income} → +${Math.max(0, p.income)}</span>
                </div>
              );
            })}
            <button
              onClick={handleNextPhase}
              disabled={isAIExecuting}
              className="w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="진행"
            >
              진행
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* VII. 비용 지불 - 반응형 */}
        {currentPhase === 'payExpenses' && (
          <div className="space-y-2 md:space-y-3">
            <p className="text-xs md:text-sm text-foreground-secondary">
              주식 + 엔진 레벨만큼 비용을 지불합니다.
            </p>
            {activePlayers.map(pid => {
              const p = players[pid];
              if (!p || p.eliminated) return null;
              const expense = p.issuedShares + p.engineLevel;
              const canPay = p.cash >= expense;
              const shortage = canPay ? 0 : expense - p.cash;
              const newIncome = canPay ? p.income : p.income - shortage;
              const willBankrupt = !canPay && newIncome < GAME_CONSTANTS.MIN_INCOME;
              return (
                <div
                  key={pid}
                  className={`p-2 rounded-lg text-xs ${
                    willBankrupt ? 'bg-red-500/20 text-red-300' : 'bg-background/30 text-foreground-secondary'
                  }`}
                >
                  <div className="flex justify-between">
                    <span>{p.name}</span>
                    <span>비용: ${expense} (주식 {p.issuedShares} + 엔진 {p.engineLevel})</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>현금: ${p.cash}</span>
                    {canPay ? (
                      <span className="text-green-400">→ ${p.cash - expense}</span>
                    ) : (
                      <span className="text-red-400">
                        부족 ${shortage} → 수입 {p.income}→{newIncome}
                        {willBankrupt && ' (파산!)'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <button
              onClick={handleNextPhase}
              disabled={isAIExecuting}
              className="w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="진행"
            >
              진행
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* VIII, X. 기타 자동 단계들 - 반응형 */}
        {['incomeReduction', 'advanceTurn'].includes(currentPhase) && (
          <div className="space-y-2 md:space-y-3">
            <p className="text-xs md:text-sm text-foreground-secondary">
              이 단계는 자동으로 처리됩니다.
            </p>
            <button
              onClick={handleNextPhase}
              disabled={isAIExecuting}
              className="w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="진행"
            >
              진행
              <ChevronRight className="w-4 h-4" />
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
