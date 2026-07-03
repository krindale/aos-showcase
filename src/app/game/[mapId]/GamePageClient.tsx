'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';

// 개발 모드에서 AI 디버거 활성화
import '@/ai/debug';

// [개발 전용] 브라우저 콘솔/게임 로그를 로컬 수신 서버(:3999)로 미러링 — 디버깅용
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  const w = window as unknown as { __logMirrorInstalled?: boolean };
  if (!w.__logMirrorInstalled) {
    w.__logMirrorInstalled = true;
    const send = (level: string, args: unknown[]) => {
      try {
        const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
        fetch('http://localhost:3999/', {
          method: 'POST',
          body: JSON.stringify({ level, msg }),
          keepalive: true,
        }).catch(() => {});
      } catch { /* noop */ }
    };
    (['log', 'warn', 'error'] as const).forEach(level => {
      const orig = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        orig(...args);
        send(level, args);
      };
    });
    send('log', ['=== 콘솔 미러 연결됨 ===']);
  }
}
import ConfirmDialog from '@/components/game/ConfirmDialog';
import GameBoard from '@/components/game/GameBoard';
import GameChat from '@/components/game/GameChat';
import OnlineLobby from '@/components/game/OnlineLobby';
import PhaseTransition from '@/components/game/PhaseTransition';
import { useNetStore } from '@/net/netStore';
import { isNetConfigured } from '@/net';
import PlayerPanel from '@/components/game/PlayerPanel';
import PhasePanel from '@/components/game/PhasePanel';
import TurnTrack from '@/components/game/TurnTrack';
import GoodsDisplayPanel from '@/components/game/GoodsDisplayPanel';
import ComplexTrackPanel from '@/components/game/ComplexTrackPanel';
import RedirectTrackPanel from '@/components/game/RedirectTrackPanel';
import UrbanizationPanel from '@/components/game/UrbanizationPanel';
import ProductionPanel from '@/components/game/ProductionPanel';
import MoveCubeOverlay from '@/components/game/MoveCubeOverlay';
import DebugPanel from '@/components/game/DebugPanel';
import { POP_SPRING, useIsFirstRender } from '@/components/game/uiEffects';
import TranscontinentalModal from '@/components/game/TranscontinentalModal';
import BottomSheet from '@/components/game/BottomSheet';
import { calculateTrackScore } from '@/utils/trackValidation';
import { ArrowLeft, RotateCcw, Users, Zap, X, Bot, ChevronRight, ChevronLeft } from 'lucide-react';
import {
  PLAYER_COLOR_ORDER,
  PLAYER_COLORS,
  TURNS_BY_PLAYER_COUNT,
  ACTION_INFO,
} from '@/types/game';
import { getMapData } from '@/utils/mapRegistry';
import { getMapProfile } from '@/maps/getMapProfile';

interface GamePageClientProps {
  mapId: string;
}

// 기본 플레이어 이름 생성 (튜토리얼은 AI 포함)
const DEFAULT_NAMES = ['기차-하나', '컴퓨터-기차', '컴퓨터-기차II', '컴퓨터-기차III', '컴퓨터-기차IV', '컴퓨터-기차V'];

// 색상 이름 한글화
const COLOR_NAMES: Record<string, string> = {
  orange: '주황',
  blue: '파랑',
  green: '초록',
  pink: '분홍',
  gray: '회색',
  yellow: '노랑',
};

export default function GamePageClient({ mapId }: GamePageClientProps) {
  const router = useRouter();

  // 맵 설정 (mapRegistry에서 맵별 주입)
  const mapConfig = getMapData(mapId);
  const supportedPlayers = mapConfig.supportedPlayers;
  // 맵 특수룰 요약 (게임 시작 화면 우측 패널) — MapProfile 다형성으로 주입
  const specialRules = getMapProfile(mapId).specialRules;

  const [showSetup, setShowSetup] = useState(true);
  const [setupTab, setSetupTab] = useState<'local' | 'online'>('local');
  const [playerCount, setPlayerCount] = useState(supportedPlayers[0]);
  const [playerNames, setPlayerNames] = useState<string[]>(DEFAULT_NAMES);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  // 리마운트 시 지난 "선택 행동" 칩 팝이 일제 재생되지 않게 첫 렌더는 애니메이션 생략
  const chipFirstRender = useIsFirstRender();
  const [isLandscape, setIsLandscape] = useState(false);
  // 기본: 플레이어 1(인덱스 0)만 사람, 나머지는 모두 AI (인원수만큼 — 모든 맵)
  const [aiPlayerIndexes, setAiPlayerIndexes] = useState<Set<number>>(
    () => new Set(Array.from({ length: supportedPlayers[0] - 1 }, (_, i) => i + 1))
  );

  const {
    initGame,
    resetGame,
    currentTurn,
    currentPhase,
    currentPlayer,
    players,
    activePlayers,
    maxTurns,
    winner,
    board,
    ui,
    hideComplexTrackSelection,
    resetBuildMode,
  } = useGameStore();

  // ---- 온라인 세션 (Phase 1) ----
  const netMode = useNetStore((s) => s.mode);
  const netRoom = useNetStore((s) => s.room);
  const netMySeat = useNetStore((s) => s.mySeat);
  const netPresent = useNetStore((s) => s.presentClientIds);
  const leaveRoom = useNetStore((s) => s.leaveRoom);
  const autoRejoin = useNetStore((s) => s.autoRejoin);
  const disconnectedSeat = useNetStore((s) => s.disconnectedSeat);
  const convertSeatToAI = useNetStore((s) => s.convertSeatToAI);
  const dismissDisconnectPrompt = useNetStore((s) => s.dismissDisconnectPrompt);
  const isOnline = netMode !== 'offline';
  // 호스트 연결 끊김 (게스트 시점) — 재접속/승계 대기 안내
  const hostAbsent =
    isOnline &&
    netMode === 'guest' &&
    Boolean(netRoom?.hostClientId) &&
    !netPresent.includes(netRoom?.hostClientId as string);

  // 같은 탭 새로고침(F5) 후 마지막 방으로 자동 재입장 (Phase 2 재접속)
  useEffect(() => {
    void autoRejoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const myPlayerId = isOnline && netMySeat !== null ? activePlayers[netMySeat] ?? null : null;
  // 지금 행동해야 하는 플레이어 — 경매 입찰 차례 포함 currentPlayer가 단일 진실
  // (auction.currentBidder는 갱신 안 되는 레거시 필드 — AuctionPanel.tsx:39 주석 참조)
  const actingPlayer = currentPlayer;
  const actingPlayerState = players[actingPlayer] ?? null;
  const isMyTurn = !isOnline || actingPlayer === myPlayerId;
  // 상호작용 허용: 오프라인 전부 / 온라인은 내 차례 / 정산·물품성장 진행은 호스트가 담당
  const PLAYER_PHASES = ['issueShares', 'determinePlayerOrder', 'selectActions', 'buildTrack', 'moveGoods'];
  const canInteract =
    !isOnline || isMyTurn || (netMode === 'host' && !PLAYER_PHASES.includes(currentPhase));

  // 온라인 방 상태 → 화면 전환 (호스트 initGame / 게스트 스냅샷 수신 후 status가 playing)
  useEffect(() => {
    if (!isOnline || !netRoom) return;
    if (netRoom.status === 'playing') setShowSetup(false);
    else if (netRoom.status === 'waiting') {
      setShowSetup(true);
      setSetupTab('online');
    }
  }, [isOnline, netRoom, netRoom?.status]);

  // 다른 맵의 방에 입장한 경우 그 맵 페이지로 이동 (netStore는 모듈 싱글턴이라 세션 유지)
  useEffect(() => {
    if (isOnline && netRoom && netRoom.mapId !== mapId) {
      router.replace(`/game/${netRoom.mapId}/`);
    }
  }, [isOnline, netRoom, mapId, router]);

  // 플레이어 이름 업데이트
  const updatePlayerName = (index: number, name: string) => {
    const newNames = [...playerNames];
    newNames[index] = name;
    setPlayerNames(newNames);
  };

  // AI 플레이어 토글
  const toggleAI = (index: number) => {
    setAiPlayerIndexes(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
        // AI 해제 시 이름 복원
        if (playerNames[index].startsWith('컴퓨터-기차')) {
          const newNames = [...playerNames];
          newNames[index] = `기차-${['하나', '둘', '셋', '넷', '다섯', '여섯'][index]}`;
          setPlayerNames(newNames);
        }
      } else {
        next.add(index);
        // AI 설정 시 이름 변경 (로마 숫자 패턴)
        // 현재 AI 수 + 1이 새 AI의 번호
        const aiCount = next.size;
        const romanNumerals = ['', 'II', 'III', 'IV', 'V', 'VI'];
        const suffix = romanNumerals[aiCount - 1] || `${aiCount}`;
        const newNames = [...playerNames];
        newNames[index] = aiCount === 1 ? '컴퓨터-기차' : `컴퓨터-기차${suffix}`;
        setPlayerNames(newNames);
      }
      return next;
    });
  };

  // 게임 시작
  const handleStartGame = () => {
    const aiPlayers = Array.from(aiPlayerIndexes).map(index => ({
      playerIndex: index,
      name: playerNames[index],
    }));
    initGame(mapId, playerNames.slice(0, playerCount), aiPlayers);
    setShowSetup(false);
  };

  // 게임 리셋
  const handleResetGame = () => {
    resetGame();
    setShowSetup(true);
  };

  // 맵 페이지로 돌아가기 (온라인이면 방도 나감)
  const handleBack = () => {
    if (isOnline) void leaveRoom();
    router.push('/maps');
  };

  // 온라인 방 나가기 (게임 화면 → 셋업으로)
  const handleLeaveRoom = () => {
    void leaveRoom();
    setShowSetup(true);
  };

  // Responsive: Reset panel state on desktop (lg breakpoint) + detect landscape
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        // Desktop: always show panel
        setIsPanelCollapsed(false);
      }

      // Detect landscape orientation on mobile/tablet
      const isMobile = window.innerWidth < 768;
      const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
      const isLandscapeMode = window.innerHeight < window.innerWidth && window.innerHeight < 600;

      setIsLandscape((isMobile || isTablet) && isLandscapeMode);
    };

    handleResize(); // Check initial size
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // 셋업 화면
  if (showSetup) {
    return (
      <motion.div
        className="min-h-screen bg-background flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
          }}
          className={`w-full flex flex-col lg:flex-row gap-4 lg:items-start justify-center ${
            specialRules.length > 0 ? 'max-w-4xl' : 'max-w-md'
          }`}
        >
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 20, scale: 0.97 },
              show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
            }}
            className="glass-card p-8 rounded-2xl relative w-full lg:max-w-md lg:flex-1"
          >
            <button
              onClick={handleBack}
              className="absolute top-4 right-4 p-2 text-foreground-secondary hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors"
              title="닫기"
            >
              <X size={20} />
            </button>

            <h1 className="text-3xl font-bold text-foreground mb-2">
              Age of Steam
            </h1>
            <p className="text-foreground-secondary mb-6">
              {mapConfig.name} - {playerCount}인 게임
            </p>

            {/* 로컬 / 온라인 모드 탭 (Supabase 설정된 배포에서만) */}
            {isNetConfigured() && (
              <div className="flex gap-2 mb-6">
                {([['local', '로컬 (한 기기)'], ['online', '온라인 멀티']] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setSetupTab(tab)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      setupTab === tab
                        ? 'bg-accent text-background'
                        : 'bg-background-secondary text-foreground-secondary hover:bg-background-tertiary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {setupTab === 'online' ? (
              <OnlineLobby mapId={mapId} supportedPlayers={supportedPlayers} />
            ) : (
              <>
            <div className="space-y-6">
              {/* 플레이어 수 선택 */}
              {supportedPlayers.length > 1 && (
                <div>
                  <label className="flex items-center gap-2 text-sm text-foreground-secondary mb-2">
                    <Users size={16} />
                    플레이어 수
                  </label>
                  <div className="flex gap-2">
                    {supportedPlayers.map((n) => (
                      <button
                        key={n}
                        onClick={() => setPlayerCount(n)}
                        className={`
                          flex-1 py-2 px-3 rounded-lg font-semibold transition-colors
                          ${playerCount === n
                            ? 'bg-accent text-background'
                            : 'bg-background-secondary text-foreground-secondary hover:bg-background-tertiary'
                          }
                        `}
                      >
                        {n}인
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-foreground-secondary">
                    {mapConfig.maxTurns || TURNS_BY_PLAYER_COUNT[playerCount]}턴 진행
                    {mapId === 'tutorial' && <span className="text-accent ml-1">(튜토리얼)</span>}
                  </p>
                </div>
              )}

              {/* 플레이어 이름 입력 */}
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {Array.from({ length: playerCount }).map((_, index) => {
                  const color = PLAYER_COLOR_ORDER[index];
                  const colorName = COLOR_NAMES[color];
                  const colorHex = PLAYER_COLORS[color];
                  const isAI = aiPlayerIndexes.has(index);

                  return (
                    <div key={index}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="flex items-center gap-2 text-sm text-foreground-secondary">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: colorHex }}
                          />
                          플레이어 {index + 1} ({colorName})
                        </label>
                        <button
                          onClick={() => toggleAI(index)}
                          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full transition-colors ${
                            isAI
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-background-tertiary text-foreground-secondary hover:bg-background-secondary'
                          }`}
                        >
                          <Bot size={12} />
                          {isAI ? 'AI' : '사람'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={playerNames[index]}
                        onChange={(e) => updatePlayerName(index, e.target.value)}
                        disabled={isAI}
                        className={`w-full px-4 py-2 bg-background-secondary rounded-lg border border-foreground/10 text-foreground focus:border-accent focus:outline-none ${
                          isAI ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                        placeholder={`플레이어 ${index + 1} 이름`}
                      />
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleStartGame}
                className="w-full btn-primary py-4 text-lg font-semibold rounded-xl"
              >
                게임 시작
              </button>
            </div>

            <div className="mt-8 p-4 bg-background-tertiary rounded-lg">
              <h3 className="text-sm font-semibold text-accent mb-2">
                {mapId === 'tutorial' ? '튜토리얼 모드' : '게임 규칙'}
              </h3>
              <ul className="text-xs text-foreground-secondary space-y-1">
                <li>• {mapConfig.maxTurns || TURNS_BY_PLAYER_COUNT[playerCount]}턴 동안 진행</li>
                <li>• 시작: ${getMapProfile(mapId).startingCash ?? 10}, 2주 발행</li>
                <li>• 매 턴 10단계 진행</li>
                <li>• 최종 승점으로 승자 결정</li>
                {aiPlayerIndexes.size > 0 && (
                  <li className="text-blue-400">• AI와 대전 ({aiPlayerIndexes.size}명의 AI 플레이어)</li>
                )}
              </ul>
            </div>
              </>
            )}
          </motion.div>

          {/* 맵 특수룰 안내 패널 (우측) */}
          {specialRules.length > 0 && (
            <motion.aside
              variants={{
                hidden: { opacity: 0, y: 20, scale: 0.97 },
                show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
              }}
              className="glass-card p-6 rounded-2xl w-full lg:max-w-sm lg:flex-1 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
            >
              <h2 className="text-lg font-bold text-gradient mb-1">
                {mapConfig.name} 특수룰
              </h2>
              <p className="text-xs text-foreground-secondary mb-4">
                이 맵만의 규칙을 확인하세요.
              </p>
              <ul className="space-y-3">
                {specialRules.map((rule, i) => (
                  <li key={i} className="border-l-2 border-accent/40 pl-3">
                    <div className="text-sm font-semibold text-foreground">{rule.title}</div>
                    <div className="text-xs text-foreground-secondary leading-relaxed mt-0.5">
                      {rule.detail}
                    </div>
                  </li>
                ))}
              </ul>
            </motion.aside>
          )}
        </motion.div>
      </motion.div>
    );
  }

  // 게임 종료 화면
  if (currentPhase === 'gameOver' || winner) {
    // 모든 플레이어의 점수 계산 (동적)
    const playerScores = activePlayers.map(playerId => {
      const player = players[playerId];
      const trackScore = calculateTrackScore(board, playerId);
      const totalScore = player.income * 3 + trackScore - player.issuedShares * 3;
      return {
        playerId,
        player,
        trackScore,
        totalScore,
      };
    }).sort((a, b) => b.totalScore - a.totalScore);

    // 승자 결정 (동점 가능)
    const highestScore = playerScores[0]?.totalScore || 0;
    const winners = playerScores.filter(p => p.totalScore === highestScore);
    const isTie = winners.length > 1;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg"
        >
          <div className="glass-card p-8 rounded-2xl text-center">
            <h1 className="text-4xl font-bold text-accent mb-4">
              게임 종료!
            </h1>

            {/* 파산 플레이어 표시 */}
            {activePlayers.some(pid => players[pid]?.eliminated) && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-sm text-red-400">
                  {activePlayers
                    .filter(pid => players[pid]?.eliminated)
                    .map(pid => players[pid]?.name)
                    .join(', ')} 파산으로 탈락!
                </p>
              </div>
            )}

            <div className="space-y-3 my-6 max-h-[400px] overflow-y-auto">
              {playerScores.map(({ playerId, player, trackScore, totalScore }, rank) => {
                const isWinner = totalScore === highestScore;
                const colorHex = PLAYER_COLORS[player.color];

                return (
                  <div
                    key={playerId}
                    className={`p-4 rounded-lg ${isWinner ? 'bg-accent/20 ring-2 ring-accent' : 'bg-background-secondary'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-foreground-secondary">
                          {rank + 1}위
                        </span>
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: colorHex }}
                        />
                        <span className="font-semibold text-foreground">{player.name}</span>
                      </div>
                      <span className="text-2xl font-bold text-foreground">{totalScore} VP</span>
                    </div>
                    <div className="text-xs text-foreground-secondary mt-2 space-y-1">
                      <div className="flex justify-between">
                        <span>수입 {player.income} × 3</span>
                        <span>+{player.income * 3}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>완성 트랙</span>
                        <span>+{trackScore}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>주식 {player.issuedShares} × 3</span>
                        <span>-{player.issuedShares * 3}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!isTie && winners[0] && (
              <p className="text-xl text-foreground mb-6">
                <span className="text-accent font-bold">{winners[0].player.name}</span> 승리!
              </p>
            )}
            {isTie && (
              <p className="text-xl text-foreground mb-6">
                <span className="text-accent font-bold">
                  {winners.map(w => w.player.name).join(', ')}
                </span> 공동 1위!
              </p>
            )}

            <div className="flex gap-4">
              <button
                onClick={isOnline ? handleLeaveRoom : handleResetGame}
                className="flex-1 btn-secondary py-3 rounded-xl flex items-center justify-center gap-2"
              >
                <RotateCcw size={18} />
                {isOnline ? '방 나가기' : '다시 하기'}
              </button>
              <button
                onClick={handleBack}
                className="flex-1 btn-primary py-3 rounded-xl"
              >
                맵 선택
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // 패널 콘텐츠 렌더 함수 (재사용)
  const renderPanelContent = () => (
    <>
      {/* 선택한 행동 표시 */}
      {activePlayers.some(pid => players[pid].selectedAction) && (
        <div className="rounded-xl border border-foreground/10 bg-background-secondary p-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} className="text-accent" />
            <span className="text-xs font-medium text-foreground-secondary">선택 행동</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {activePlayers.map(pid => {
              const player = players[pid];
              const action = player.selectedAction;
              if (!action) return null;
              const pColor = PLAYER_COLORS[player.color];
              return (
                /* 선택되는 순간 그 자리에서 플레이어 색으로 팝 (공용 POP_SPRING — 경매 팝과 동일한 결) */
                <motion.div
                  key={`${pid}-${action}`}
                  initial={chipFirstRender.current ? false : { scale: 1.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={POP_SPRING}
                  className="flex items-center gap-2 px-2 py-1 rounded bg-accent/10 border"
                  style={{ borderColor: `${pColor}80` }}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: pColor }}
                  />
                  <span className="text-xs text-foreground">{player.name}</span>
                  <span className="text-xs font-bold" style={{ color: pColor }}>
                    {ACTION_INFO[action].name}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* 현재 단계 */}
      <PhasePanel />

      {/* 도시화 패널 (트랙 건설 단계에서 Urbanization 행동 선택 시) */}
      <UrbanizationPanel />

      {/* 생산 패널 (물품 성장 단계에서 Production 행동 선택 시) */}
      <ProductionPanel />

      {/* 화물 이동 시 전체 맵을 화면에 꽉 차게 보여주는 오버레이 (큰 맵 가독성) */}
      <MoveCubeOverlay />

      {/* 플레이어 패널 (동적 렌더링) — 3인+ 게임은 비활성 플레이어를 한 줄로 압축 */}
      {activePlayers.map(playerId => (
        <PlayerPanel key={playerId} playerId={playerId} compact={activePlayers.length >= 3} />
      ))}
    </>
  );

  // 메인 게임 화면
  return (
    <div className={`bg-background ${isLandscape ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {/* 헤더 */}
      <header className={`fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-foreground/10 ${isLandscape ? 'py-1' : ''}`}>
        <div className={`max-w-[1800px] mx-auto px-2 sm:px-4 flex items-center justify-between gap-2 sm:gap-4 ${isLandscape ? 'py-1' : 'py-2 sm:py-3'}`}>
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              onClick={handleBack}
              className="p-1.5 sm:p-2 hover:bg-foreground/10 rounded-lg transition-colors flex-shrink-0"
              aria-label="뒤로 가기"
            >
              <ArrowLeft size={18} className="text-foreground-secondary sm:w-5 sm:h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold text-foreground truncate">Age of Steam</h1>
              <p className="text-xs text-foreground-secondary hidden sm:block">{mapConfig.name}</p>
            </div>
          </div>

          <TurnTrack
            currentTurn={currentTurn}
            maxTurns={maxTurns}
            currentPhase={currentPhase}
          />

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* Tablet Toggle Button (768-1024px only) */}
            <button
              onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
              className="hidden md:block lg:hidden p-1.5 sm:p-2 hover:bg-foreground/10 rounded-lg transition-colors"
              title={isPanelCollapsed ? '패널 열기' : '패널 닫기'}
              aria-label={isPanelCollapsed ? '사이드 패널 열기' : '사이드 패널 닫기'}
            >
              {isPanelCollapsed ? (
                <ChevronLeft size={18} className="text-foreground-secondary sm:w-5 sm:h-5" />
              ) : (
                <ChevronRight size={18} className="text-foreground-secondary sm:w-5 sm:h-5" />
              )}
            </button>

            {isOnline ? (
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 text-xs font-semibold text-accent tracking-widest">
                  {netRoom?.code}
                </span>
                <button
                  onClick={handleLeaveRoom}
                  className="p-1.5 sm:p-2 hover:bg-foreground/10 rounded-lg transition-colors"
                  title="방 나가기"
                  aria-label="방 나가기"
                >
                  <X size={18} className="text-foreground-secondary sm:w-5 sm:h-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleResetGame}
                className="p-1.5 sm:p-2 hover:bg-foreground/10 rounded-lg transition-colors"
                title="게임 리셋"
                aria-label="게임 리셋"
              >
                <RotateCcw size={18} className="text-foreground-secondary sm:w-5 sm:h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className={`${isLandscape ? 'pt-12 pb-2 px-2 h-[calc(100vh-3.5rem)] overflow-y-auto' : 'pt-20 pb-8 px-4 md:pb-8 pb-[30vh]'}`}>
        <div className={`mx-auto ${isLandscape ? '' : 'max-w-[1800px]'}`}>
          {/* 온라인: 호스트 연결 끊김 안내 (재접속 대기 → 6초 후 자동 승계) */}
          {hostAbsent && (
            <div className="mb-3 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-500 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              호스트 연결이 끊겼습니다 — 재접속을 기다리는 중 (잠시 후 자동 승계)
            </div>
          )}
          {/* 온라인: 차례 안내 배너 */}
          {isOnline && !isMyTurn && actingPlayerState && (
            <div className="mb-3 px-4 py-2 rounded-lg bg-background-tertiary border border-foreground/10 text-sm text-foreground-secondary flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: PLAYER_COLORS[actingPlayerState.color] }}
              />
              지금은 <b className="text-foreground">{actingPlayerState.name}</b> 차례입니다
              {actingPlayerState.isAI && ' (AI 진행 중…)'}
            </div>
          )}
          {/* lg(데스크톱): 패널 320px 고정 + 지도 가변(나머지 전부) — 넓은 화면일수록 지도 최대.
              md(태블릿): 12-그리드 유지(패널 토글). */}
          <div className="relative">
          <div className={`grid grid-cols-1 md:grid-cols-12 lg:grid-cols-[minmax(0,1fr)_340px] ${isLandscape ? 'gap-2' : 'gap-6'}`}>
            {/* 왼쪽: 게임 보드 + 물품 디스플레이 */}
            <div className={`
              col-span-1
              ${isPanelCollapsed ? 'md:col-span-12' : 'md:col-span-8'}
              lg:col-span-1
              ${isLandscape ? 'space-y-2' : 'space-y-4'}
            `}>
              <GameBoard />
              {/* 물품 성장이 없는 맵(St. Lucia)은 물품 디스플레이가 무의미 → 숨김 */}
              {!isLandscape && !mapConfig.rules.skipGoodsGrowth && <GoodsDisplayPanel />}
            </div>

            {/* 오른쪽: 패널들 (Desktop: always visible, Tablet: collapsible, Mobile: hidden) */}
            <AnimatePresence mode="wait">
              {!isPanelCollapsed && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  className="hidden md:block md:col-span-4 lg:col-span-1 space-y-4 md:sticky md:top-20 md:self-start md:max-h-[calc(100vh-6rem)] md:overflow-y-auto md:pr-1"
                >
                  {renderPanelContent()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* 온라인: 내 차례가 아니면 보드/패널 클릭 차단 (호스트 검증의 UX 보강 — 최종 방어는 applyGameIntent) */}
          {isOnline && !canInteract && <div className="absolute inset-0 z-20" aria-hidden />}
          </div>
        </div>
      </main>

      {/* Mobile: Bottom Sheet (visible only on <768px) */}
      <div className="md:hidden">
        <BottomSheet
          defaultExpanded={false}
          collapsedHeight={isLandscape ? '15vh' : '30vh'}
          expandedHeight={isLandscape ? '40vh' : '70vh'}
          onExpandedChange={() => {}}
        >
          <div className="space-y-4">
            {/* In landscape, show only critical info */}
            {isLandscape ? (
              <>
                {/* Current Phase only */}
                <PhasePanel />
                {/* Active Player Panel only */}
                {activePlayers.slice(0, 1).map(playerId => (
                  <PlayerPanel key={playerId} playerId={playerId} />
                ))}
              </>
            ) : (
              renderPanelContent()
            )}
          </div>
        </BottomSheet>
      </div>

      {/* 복합 트랙 선택 모달 */}
      {ui.complexTrackSelection && (
        <ComplexTrackPanel
          coord={ui.complexTrackSelection.coord}
          newEdges={ui.complexTrackSelection.newEdges}
          onClose={() => hideComplexTrackSelection()}
          onComplete={() => {
            hideComplexTrackSelection();
            resetBuildMode();
          }}
        />
      )}

      {/* 방향 전환 선택 모달 */}
      {ui.redirectTrackSelection && <RedirectTrackPanel />}

      {/* 디버그 패널 */}
      <DebugPanel />

      {/* 대륙횡단 연결 팝업 (Western US) */}
      <TranscontinentalModal />

      {/* 온라인 채팅 (Phase 3) — 오프라인이면 자체적으로 렌더 안 함 */}
      <GameChat />

      {/* 단계 전환 1초 멈춤 오버레이 */}
      <PhaseTransition />

      {/* 호스트: 이탈한 게스트를 AI로 전환할지 확인 (10초 유예 후 표시) */}
      <ConfirmDialog
        open={netMode === 'host' && disconnectedSeat !== null}
        title="플레이어 연결 끊김"
        message={`${disconnectedSeat?.name}님의 연결이 끊겼습니다. 이 자리를 AI로 전환해 게임을 계속할까요? 기다리면 재접속 시 자동으로 복귀합니다. (AI 전환 후에는 이번 게임에서 되돌릴 수 없어요)`}
        confirmLabel="AI로 전환"
        cancelLabel="계속 기다리기"
        onConfirm={() => {
          if (disconnectedSeat) void convertSeatToAI(disconnectedSeat.seat);
        }}
        onCancel={dismissDisconnectPrompt}
      />
    </div>
  );
}
