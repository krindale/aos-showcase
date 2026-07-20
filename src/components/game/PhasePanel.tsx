'use client';

import { useState, useEffect } from 'react';
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
  CUBE_COLORS,
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
  Truck,
  TrainTrack,
  HardHat,
  Train,
  Building2,
  Boxes,
  ListOrdered,
  Landmark,
  type LucideIcon,
  Feather,
} from 'lucide-react';
import AuctionPanel from './AuctionPanel';
import TurnOrderOfferPanel from './TurnOrderOfferPanel';
import { POP_SPRING, useIsFirstRender } from './uiEffects';
import ConfirmDialog from './ConfirmDialog';
import { getMapProfile } from '@/maps/getMapProfile';
import { hasIncompleteNewTracks } from '@/store/helpers/boardRules';
import GoodsGrowthPanel from './GoodsGrowthPanel';
import { useNetStore } from '@/net/netStore';
import { safeTimeout } from '@/utils/safeTimers';

export const PHASE_ICONS: Record<GamePhase, React.ReactNode> = {
  governmentLink: <Landmark size={18} />,
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

export const ACTIONS: SpecialAction[] = [
  'firstMove',
  'firstBuild',
  'engineer',
  'locomotive',
  'urbanization',
  'production',
  'turnOrder',
];

/** 이 맵의 행동 목록 = 기본 7종 + 맵 전용 추가 행동 (Moon: lowGravitation 8번째) */
export const actionsForMap = (mapId: string): SpecialAction[] =>
  [...ACTIONS, ...getMapProfile(mapId).extraActions];

/** 행동 선택 버튼용 축약 설명 (좁은 2열 그리드 — 상세는 도움말/룰북 참고) */
const ACTION_SHORT: Record<SpecialAction, string> = {
  firstMove: '남보다 먼저 이동',
  firstBuild: '남보다 먼저 건설',
  engineer: '트랙 4개 건설', // 실제 표시는 동적(buildsPerTurn+1) — 아래 그리드 삼항 참조
  locomotive: '엔진 +1칸',
  urbanization: '마을에 신도시',
  production: '큐브 2개 보충',
  turnOrder: '다음 경매 패스',
  lowGravitation: '타인 링크 수입 1',
};

/** 행동 선택 버튼 아이콘 — 특수 액션 페이지(/actions)·도움말과 동일 */
export const ACTION_ICONS: Record<SpecialAction, LucideIcon> = {
  firstMove: Truck,
  firstBuild: TrainTrack,
  engineer: HardHat,
  locomotive: Train,
  urbanization: Building2,
  production: Boxes,
  turnOrder: ListOrdered,
  lowGravitation: Feather,
};

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

  // Montréal Repopulation 배치 UI 상태 — 큐브 선택은 스토어 ui(보드 도시 클릭으로 배치)
  const repopCubes = phaseState.repopulationCubes ?? [];
  const repopPlayer = phaseState.repopulationPlayer ?? null;
  const repoCube = useGameStore((s) => s.ui.repopulationCube);
  const { selectRepopulationCube } = useGameStore();

  // Montréal 정부 관리 로테이션 (셋업 순번 고정 — 라운드 N 관리자 = [(N-1) % 인원])
  const govControllers = useGameStore((s) => s.governmentControllers);
  const currentTurn = useGameStore((s) => s.currentTurn);

  // 커밋 전 선택이 있는지 (취소 버튼 표시용 — boolean 셀렉터라 값이 바뀔 때만 리렌더)
  const hasActiveSelection = useGameStore(
    (s) =>
      s.ui.buildMode !== 'idle' ||
      s.ui.selectedCube !== null ||
      s.ui.complexTrackSelection !== null ||
      s.ui.redirectTrackSelection !== null
  );

  // 독일(완성 링크만): 이번 턴 미완성 신설 트랙이 있으면 넘어갈 때 삭제·환불된다 → 실수로 잃지
  // 않게 '다음 단계로'를 막고 안내한다 (사람 차례만, boolean 셀렉터라 값이 바뀔 때만 리렌더).
  const incompleteBlocks = useGameStore(
    (s) =>
      s.currentPhase === 'buildTrack' &&
      getMapProfile(s.mapId).requireCompleteLinks &&
      !s.players[s.currentPlayer]?.isAI &&
      hasIncompleteNewTracks(s.board, s.currentTurn, s.currentPlayer)
  );

  // 실행 취소 가능한 확정 행동 수 (주식 발행/행동 선택/트랙 건설 — 단계 전환 전까지)
  const undoCount = useGameStore((s) => s.undoCount);

  // 온라인 좌석/역할 판정
  // - myPlayerId: 내 좌석의 플레이어 (offline이면 null = 단일 조작자)
  // - isMyTurn: 개인 결정(주식/행동/건설/이동) 버튼 표시 조건 — 내 차례에만
  // - amIHost: 공통 진행(정산/물품성장/턴마커) 버튼 표시 조건 — 방장(또는 오프라인)만.
  //   게스트가 공통 버튼을 눌러도 호스트가 거부해 되돌아가 혼란스러웠던 것을 UI에서 차단한다.
  const netMode = useNetStore((s) => s.mode);
  const netMySeat = useNetStore((s) => s.mySeat);
  const myPlayerId =
    netMode === 'offline' || netMySeat === null ? null : activePlayers[netMySeat] ?? null;
  const isMyTurn = myPlayerId === null || myPlayerId === currentPlayer;
  const amIHost = netMode === 'offline' || netMode === 'host';
  const isGuest = netMode === 'guest';

  // 게스트 취소 요청 대기 표시 — 게스트의 undoLastAction은 호스트로 intent만 보내고
  // 실제 되돌리기는 호스트 스냅샷이 도착해야 반영된다(로컬 즉시 반영 아님). 호스트가 잠깐
  // 불통이면 아무 피드백 없이 "안 먹히는" 것처럼 보였다 → 요청 후 대기 상태를 명시한다.
  const [undoPending, setUndoPending] = useState<'idle' | 'sent' | 'timeout'>('idle');
  // 호스트 스냅샷으로 undoCount가 바뀌면 취소가 확정된 것 — 대기 해제
  useEffect(() => { setUndoPending('idle'); }, [undoCount]);
  // 3.5초 내 반영 안 되면 호스트 미도달로 간주 (재시도 안내).
  // safeTimeout 사용 — 백그라운드 탭 스로틀 회피 규칙(CLAUDE.md) 준수.
  useEffect(() => {
    if (undoPending !== 'sent') return;
    return safeTimeout(() => setUndoPending('timeout'), 3500);
  }, [undoPending]);

  const handleUndo = () => {
    if (isGuest) {
      // 진단: 게스트가 취소 요청을 실제로 보냈는지 추적 (호스트 onIntent 로그와 대조)
      console.log('[undo] 게스트 취소 요청 전송', {
        seat: netMySeat,
        undoCount,
        currentPlayer,
      });
    }
    undoLastAction();
    if (isGuest) setUndoPending('sent'); // 호스트 확정(스냅샷) 대기
  };

  // 실행 취소 버튼 (사람 차례에만, 취소할 행동이 있을 때만)
  const undoButton =
    undoCount > 0 && !players[currentPlayer]?.isAI && isMyTurn ? (
      <button
        onClick={handleUndo}
        disabled={isAIExecuting || undoPending === 'sent'}
        className={`flex-shrink-0 min-h-[44px] px-3 py-3 md:py-2 rounded-lg text-sm font-medium bg-steam-red/10 text-steam-red border transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-steam-red/20 ${
          undoPending === 'timeout' ? 'border-steam-red/70 ring-1 ring-steam-red/50' : 'border-steam-red/30'
        }`}
        aria-label="실행 취소"
        title={
          undoPending === 'timeout'
            ? '취소가 아직 반영되지 않았어요 — 다시 눌러 주세요'
            : `취소: ${getUndoLabel() ?? '마지막 행동'}`
        }
      >
        <Undo2 className="w-4 h-4" />
        {undoPending === 'sent' ? '취소 중…' : undoPending === 'timeout' ? '다시 취소' : '취소'}
      </button>
    ) : null;

  const phaseInfo = PHASE_INFO[currentPhase];
  const currentPlayerData = players[currentPlayer];

  // 상대 차례 안내 (개인 결정 단계에서 내 차례가 아닐 때 버튼 대신 표시)
  const otherTurnNote = (
    <div className="text-center py-3 md:py-4">
      <p className="text-xs md:text-sm text-foreground-secondary">
        <span className="text-accent font-medium">{currentPlayerData.name}</span>님의 차례입니다
      </p>
    </div>
  );

  // 방장 진행 대기 안내 (공통 정산/진행 단계에서 게스트에게 표시)
  const hostProgressNote = (
    <div className="text-center py-3 text-xs md:text-sm text-foreground-secondary">
      방장이 진행하기를 기다리는 중...
    </div>
  );

  // 이동 건너뛰기 확인 다이얼로그 (window.confirm 대체 — 디자인 시스템 모달)
  const [skipMoveConfirmOpen, setSkipMoveConfirmOpen] = useState(false);

  // Montréal 정부 링크: 아무것도 안 짓고 넘어가려 할 때 확인 (원본 룰: 관리자는 반드시 건설)
  const [govSkipConfirmOpen, setGovSkipConfirmOpen] = useState(false);
  const builtGovThisTurn = useGameStore((s) =>
    s.board.trackTiles.some((t) => t.isGovernment && t.builtTurn === s.currentTurn)
  );

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
          <p className="text-[10px] md:text-xs text-foreground-secondary truncate">{getMapProfile(mapId).phaseDescription(currentPhase)}</p>
        </div>
      </div>

      {/* 단계별 UI - 반응형 패딩 */}
      <div className="p-2 md:p-4">
        {/* 0. 정부 링크 건설 (Montréal) */}
        {currentPhase === 'governmentLink' && (
          <div className="space-y-2 md:space-y-3">
            <p className="text-xs md:text-sm text-foreground-secondary">
              정부 관리: <span className="text-accent font-medium">{currentPlayerData.name}</span>
            </p>
            {/* 관리 로테이션 — 셋업 순번 고정, 라운드마다 다음 사람으로 (원본 Govt. Player 트랙) */}
            {govControllers && govControllers.length > 0 && (
              <div className="p-1.5 md:p-2 rounded-lg bg-background/30 text-[10px] md:text-xs text-foreground-secondary flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="shrink-0">관리 순서:</span>
                {govControllers.map((pid, i) => {
                  const isNow = i === (currentTurn - 1) % govControllers.length;
                  const p = players[pid];
                  if (!p) return null;
                  return (
                    <span key={pid} className="inline-flex items-center gap-1">
                      {i > 0 && <span className="text-foreground-muted">→</span>}
                      <span
                        className={`inline-flex items-center gap-1 rounded px-1 ${isNow ? 'bg-[#4E4D46] text-white font-semibold' : ''}`}
                      >
                        <span className="inline-block h-2 w-2 rounded-full ring-1 ring-black/15" style={{ background: PLAYER_COLORS[p.color] }} />
                        {p.name}
                      </span>
                    </span>
                  );
                })}
                <span className="w-full text-foreground-muted">라운드마다 순서대로 돌아갑니다 (이번 라운드 {currentTurn})</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs md:text-sm text-foreground-secondary">정부 트랙 (최대 3)</span>
              <span className="text-base md:text-lg font-bold text-foreground">
                {phaseState.builtTracksThisTurn} / {phaseState.maxTracksThisTurn}
              </span>
            </div>
            <div className="p-2 md:p-3 rounded-lg bg-background/50">
              <p className="text-[10px] md:text-xs text-foreground-secondary">
                • 중립 정부 링크 1개를 무료로 건설합니다 (도시에서 시작해 링크를 완성하세요)
              </p>
              <p className="text-[10px] md:text-xs text-foreground-secondary">
                • 누구나 이용할 수 있지만 수입은 없습니다 — 미완성 구간은 넘어갈 때 제거됩니다
              </p>
              <p className="text-[10px] md:text-xs text-foreground-secondary">
                • 모든 트랙은 하나의 네트워크로 이어져야 합니다 (첫 링크가 시작점)
              </p>
            </div>
            {currentPlayerData.isAI ? (
              <div className="text-center py-4">
                <div className="animate-pulse text-accent font-medium">
                  {currentPlayerData.name} (BOT) 정부 링크 건설 중...
                </div>
              </div>
            ) : !isMyTurn ? (
              otherTurnNote
            ) : (
              <div className="flex gap-2">
                {hasActiveSelection && (
                  <button
                    onClick={cancelSelection}
                    className="flex-shrink-0 min-h-[44px] px-3 py-3 md:py-2 rounded-lg text-sm font-medium bg-steam-red/10 text-steam-red border border-steam-red/30 hover:bg-steam-red/20 transition-colors flex items-center justify-center gap-1"
                    aria-label="선택 취소"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => {
                    // 원본 룰: 관리자는 정부 링크를 반드시 건설 — 안 짓고 넘어가면 확인을 받는다
                    if (!builtGovThisTurn) setGovSkipConfirmOpen(true);
                    else handleNextPhase();
                  }}
                  disabled={isAIExecuting}
                  className="flex-1 min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="정부 링크 완료"
                >
                  건설 완료 — 주식 발행으로
                  <ChevronRight className="w-4 h-4" />
                </button>
                {undoButton}
              </div>
            )}
            <ConfirmDialog
              open={govSkipConfirmOpen}
              title="정부 링크를 건설하지 않고 넘어갈까요?"
              message="원본 룰에서는 정부 관리자가 매 라운드 중립 링크 1개를 반드시 건설합니다. 도시를 클릭해 무료로 건설할 수 있어요."
              confirmLabel="그냥 넘어가기"
              cancelLabel="건설할게요"
              onConfirm={() => {
                setGovSkipConfirmOpen(false);
                handleNextPhase();
              }}
              onCancel={() => setGovSkipConfirmOpen(false)}
            />
          </div>
        )}

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
                  {currentPlayerData.name} (BOT) 주식 발행 중...
                </div>
              </div>
            ) : !isMyTurn ? (
              otherTurnNote
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
        {currentPhase === 'selectActions' && repopCubes.length > 0 && (
          // Montréal Repopulation: production 선택 즉시 뽑힌 3개 중 1개를 도시에 배치
          <div className="space-y-2 md:space-y-3">
            <p className="text-xs md:text-sm text-foreground-secondary">
              <span className="text-accent font-medium">{repopPlayer ? players[repopPlayer]?.name : ''}</span>
              — Repopulation: 뽑힌 화물 3개 중 1개를 도시에 배치하세요 (나머지는 주머니로)
            </p>
            {(myPlayerId === null || myPlayerId === repopPlayer) && repopPlayer && !players[repopPlayer]?.isAI ? (
              <>
                <div className="flex gap-2">
                  {repopCubes.map((c, i) => (
                    <button
                      key={`${c}-${i}`}
                      onClick={() => selectRepopulationCube(repoCube === c ? null : c)}
                      className={`w-10 h-10 rounded-md border-2 transition-all ${
                        repoCube === c ? 'border-accent scale-110' : 'border-glass-border'
                      }`}
                      style={{ background: CUBE_COLORS[c] }}
                      aria-label={`${c} 큐브 선택`}
                    />
                  ))}
                </div>
                <p className="text-xs text-foreground-secondary">
                  {repoCube
                    ? '보드에서 금색 테두리의 도시를 클릭해 배치하세요'
                    : '배치할 화물을 먼저 선택하세요'}
                </p>
              </>
            ) : (
              <div className="text-center py-3 text-xs md:text-sm text-foreground-secondary">
                배치를 기다리는 중...
              </div>
            )}
          </div>
        )}
        {currentPhase === 'selectActions' && repopCubes.length === 0 && currentPlayerData.actionBanned && (
          <div className="space-y-2 md:space-y-3">
            <p className="text-xs md:text-sm text-steam-red">
              무입찰 패스 2인 이상 — <span className="font-medium">{currentPlayerData.name}</span>은(는) 이번 턴 특수 행동을 선택할 수 없습니다.
            </p>
            {(isMyTurn && !currentPlayerData.isAI) && (
              <button
                onClick={handleNextPhase}
                disabled={isAIExecuting}
                className="w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                다음으로
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        {currentPhase === 'selectActions' && repopCubes.length === 0 && !currentPlayerData.actionBanned && (
          <div className="space-y-2 md:space-y-3">
            {currentPlayerData.isAI ? (
              <div className="text-center py-4">
                <div className="animate-pulse text-accent font-medium">
                  {currentPlayerData.name} (BOT) 행동 선택 중...
                </div>
              </div>
            ) : isMyTurn ? (
              <p className="text-xs md:text-sm text-foreground-secondary mb-2 md:mb-3">
                <span className="text-accent font-medium">{currentPlayerData.name}</span>, 행동을 선택하세요:
              </p>
            ) : (
              <p className="text-xs md:text-sm text-foreground-secondary mb-2 md:mb-3">
                <span className="text-accent font-medium">{currentPlayerData.name}</span>님이 행동을 선택하는 중...
              </p>
            )}
            {/* 선택 현황 표시 — 봇 차례에만 표시(사람 차례엔 숨김). 선택 순간 플레이어 색으로 팝 */}
            {currentPlayerData.isAI && (
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
            )}
            {/* 내 차례(오프라인 포함)이고 AI가 아닐 때만 행동 선택 버튼 표시 */}
            {!currentPlayerData.isAI && isMyTurn && (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  {actionsForMap(mapId).map((action) => {
                    const info = ACTION_INFO[action];
                    const Icon = ACTION_ICONS[action];
                    const taken = isActionTaken(action);
                    const isSelected = currentPlayerData.selectedAction === action;
                    // 맵 룰로 금지된 행동 (St. Lucia: production, turnOrder)
                    const mapDisabled = getMapProfile(mapId).disabledActions.includes(action);

                    return (
                      <button
                        key={action}
                        onClick={() => handleSelectAction(action)}
                        disabled={taken || mapDisabled || currentPlayerData.selectedAction !== null}
                        className={`p-2 min-h-[44px] rounded-lg text-left transition-all ${
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
                        <div className="flex items-center gap-2">
                          {/* 좌측: 아이템에 맞는 아이콘 */}
                          <Icon className={`shrink-0 w-[25px] h-[25px] ${mapDisabled ? 'text-foreground-muted' : 'text-accent'}`} />
                          {/* 우측: 타이틀 + 축약 설명 */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span className={`font-medium text-xs truncate ${mapDisabled ? 'line-through text-foreground-muted' : 'text-foreground'}`}>
                                {info.name}
                              </span>
                              {mapDisabled ? (
                                <span className="text-[9px] text-steam-red shrink-0">불가</span>
                              ) : taken && !isSelected ? (
                                <span className="text-[9px] text-foreground-secondary shrink-0">선택됨</span>
                              ) : null}
                            </div>
                            <p className="text-[10px] text-foreground-secondary mt-0.5">
                              {action === 'engineer' && getMapProfile(mapId).engineerHalfCost
                                ? '3개 + 최고가 1개 절반값'
                                : action === 'engineer'
                                // 맵별 건설 상한 반영 (표준 3+1=4, 달 2+1=3) — 하드코딩 '4개' 오표기 방지
                                ? `트랙 ${getMapProfile(mapId).buildsPerTurn + 1}개 건설`
                                : action === 'locomotive' && getMapProfile(mapId).dedicatedGovEngine
                                ? '정부 엔진(DGEL) +1'
                                : action === 'production' && getMapProfile(mapId).productionAsRepopulation
                                ? '3개 뽑아 1개 즉시 배치'
                                : ACTION_SHORT[action]}
                            </p>
                          </div>
                        </div>
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
                • {getMapProfile(mapId).buildCostHint}
              </p>
              <p className="text-[10px] md:text-xs text-foreground-secondary">
                • 현금: ${currentPlayerData.cash}
              </p>
              {currentPlayerData.selectedAction === 'engineer' && (
                <p className="text-[10px] md:text-xs text-accent mt-1">
                  {getMapProfile(mapId).engineerHalfCost
                    ? '• Engineer: 3개까지 건설 + 가장 비싼 타일 1개는 절반 비용!'
                    : '• Engineer: 4개까지 건설 가능!'}
                </p>
              )}
            </div>
            {isMyTurn ? (
              <>
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
                {incompleteBlocks && (
                  <div className="p-2 md:p-3 rounded-lg bg-steam-red/10 border border-steam-red/30 text-[11px] md:text-xs text-steam-red flex items-start gap-1.5">
                    <span className="mt-0.5">⚠️</span>
                    <span>
                      완성되지 않은 철도가 있어요. 이대로 넘어가면 <b>삭제됩니다</b> (독일: 완성 링크만 건설).
                      연결을 완성하거나 <b>취소</b>한 뒤 넘어가세요.
                    </span>
                  </div>
                )}
                <button
                  onClick={handleNextPhase}
                  disabled={isAIExecuting || incompleteBlocks}
                  className="w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="다음 단계로"
                  title={incompleteBlocks ? '완성되지 않은 철도가 있어 넘어갈 수 없어요' : undefined}
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
              </>
            ) : (
              otherTurnNote
            )}
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
            {isMyTurn ? (
              <>
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
                      setSkipMoveConfirmOpen(true);
                      return;
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
                {undoButton}
              </>
            ) : (
              otherTurnNote
            )}
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
            {amIHost ? (
              <button
                onClick={handleNextPhase}
                disabled={isAIExecuting}
                className="w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="진행"
              >
                진행
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              hostProgressNote
            )}
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
            {amIHost ? (
              <button
                onClick={handleNextPhase}
                disabled={isAIExecuting}
                className="w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="진행"
              >
                진행
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              hostProgressNote
            )}
          </div>
        )}

        {/* VIII, X. 기타 자동 단계들 - 반응형 */}
        {['incomeReduction', 'advanceTurn'].includes(currentPhase) && (
          <div className="space-y-2 md:space-y-3">
            <p className="text-xs md:text-sm text-foreground-secondary">
              이 단계는 자동으로 처리됩니다.
            </p>
            {amIHost ? (
              <button
                onClick={handleNextPhase}
                disabled={isAIExecuting}
                className="w-full min-h-[44px] py-3 md:py-2 rounded-lg text-sm md:text-base font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="진행"
              >
                진행
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              hostProgressNote
            )}
          </div>
        )}

        {/* IX. 물품 성장 */}
        {currentPhase === 'goodsGrowth' && (
          <GoodsGrowthPanel />
        )}
      </div>

      {/* 이동 건너뛰기 확인 (fixed 오버레이 — 레이아웃 밖) */}
      <ConfirmDialog
        open={skipMoveConfirmOpen}
        title="이동 건너뛰기"
        message="물품 이동을 건너뛰시겠습니까? 이번 라운드의 수송 기회가 사라집니다."
        confirmLabel="건너뛰기"
        onConfirm={() => {
          setSkipMoveConfirmOpen(false);
          handleNextPhase();
        }}
        onCancel={() => setSkipMoveConfirmOpen(false)}
      />
    </motion.div>
  );
}
