'use client';

import { useState, useEffect, useRef } from 'react';
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
import Toaster from '@/components/game/Toaster';
import DebugPanel from '@/components/game/DebugPanel';
import { POP_SPRING, useIsFirstRender, CROWN_GOLD, CROWN_INK } from '@/components/game/uiEffects';
import TranscontinentalModal from '@/components/game/TranscontinentalModal';
import BankruptcyModal from '@/components/game/BankruptcyModal';
import BottomSheet from '@/components/game/BottomSheet';
import HelpOverlay from '@/components/game/HelpOverlay';
import TurboSwitch from '@/components/game/TurboSwitch';
import HostTakeoverDialog from '@/components/game/HostTakeoverDialog';
import { calculateTrackScore } from '@/utils/trackValidation';
import { ArrowLeft, RotateCcw, Users, Zap, X, Bot, Crown, ChevronRight, ChevronLeft, HelpCircle } from 'lucide-react';
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
  // 부팅 게이트: F5 복원 판정(온라인 자동 재입장/오프라인 이어하기)이 끝나기 전엔 셋업 화면
  // 대신 "복원 중" 로딩을 보여준다 — 온라인 재접속(비동기 1~3초) 동안 셋업 화면이 먼저
  // 그려졌다가 보드로 튀는 깜빡임 방지(2026-07-26 사용자 보고). 해제 지점: ① 온라인 복원은
  // netRoom.status 효과(playing→보드/waiting→대기실), ② 오프라인·복원 없음은 autoRejoin 효과.
  const [booting, setBooting] = useState(true);
  // 진행 중 게임 이어하기 배너 (일부러 나갔다 재입장한 경우 — 자동 복원 대신 선택권)
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [setupTab, setSetupTab] = useState<'local' | 'online'>('local');
  const [playerCount, setPlayerCount] = useState(supportedPlayers[0]);
  const [playerNames, setPlayerNames] = useState<string[]>(DEFAULT_NAMES);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // 게임 이탈 확인 (실수 클릭 방지 — 리셋은 되돌릴 수 없고, 나가기/뒤로는 게임 화면을 떠남)
  const [exitConfirm, setExitConfirm] = useState<'reset' | 'leave' | 'back' | null>(null);
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

  // F5/재입장 복원: ① 온라인 자동 재입장 시도 → ② 실패/기록 없음이면 오프라인 진행 중 게임 처리.
  // - 같은 탭 F5(게임 화면에 있었음 = sessionStorage 'aos-ingame'): 자동으로 게임 화면 복원
  // - 일부러 나갔다 재입장(뒤로/리셋으로 플래그 지워짐): 자동 복원하지 않고 셋업에
  //   "이어하기" 배너만 표시 — 예전 게임이 강제로 뜨던 문제(2026-07-24 사용자 보고) 방지.
  // 온라인 복원 성공 시엔 netRoom.status 효과가 화면을 전환하므로 여기선 손대지 않는다.
  useEffect(() => {
    void (async () => {
      const rejoined = await autoRejoin().catch(() => false);
      // 온라인 복원 성공: booting 해제는 netRoom.status 효과가 화면 전환과 함께 담당 —
      // 여기서 풀면 status 효과가 setShowSetup(false)하기 전 한 프레임 셋업이 비친다
      if (rejoined) return;
      try {
        const s = useGameStore.getState();
        // gameStarted가 없는 옛 저장본(플래그 도입 전 시작한 게임)은 진행 흔적으로 추정.
        // ⚠️ persist 병합이 기본값 false를 채우므로 ?? 가 아니라 || 로 이어야 한다.
        // ⚠️ 시작 단계는 맵마다 다르다 — Montréal은 issueShares가 아니라 governmentLink로
        // 시작하므로, issueShares만 시작 단계로 보면 갓 리셋한 미시작 몬트리올 상태가
        // "진행 중"으로 오판돼 종료 후에도 배너가 떴다 (2026-07-25 사용자 보고).
        const isStartPhase =
          s.currentPhase === 'issueShares' || s.currentPhase === 'governmentLink';
        const inProgress =
          s.gameStarted ||
          s.currentTurn > 1 ||
          !isStartPhase ||
          s.board.trackTiles.length > 0 ||
          Object.values(s.players).some((p) => p.issuedShares !== 2);
        // 종료된 게임 제외 — winner(파산 종료)만 보면 턴 소진 종료(gameOver + finalScores,
        // winner 없음)를 놓쳐 끝난 게임에 이어하기 배너가 떴다 (2026-07-24 사용자 보고).
        const isOver = s.currentPhase === 'gameOver' || !!s.winner || !!s.finalScores;
        if (!inProgress || s.mapId !== mapId || isOver) return;
        let wasInGame = false;
        try { wasInGame = window.sessionStorage.getItem('aos-ingame') === '1'; } catch { /* noop */ }
        if (wasInGame) { setShowSetup(false); return; } // F5 — 이어서 진행
        setResumeAvailable(true); // 재입장 — 이어하기/삭제 선택권 제공
      } finally {
        setBooting(false); // 오프라인/복원 없음 — 셋업(또는 복원된 보드) 표시
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);

  // 게임 화면에 있는 동안 'aos-ingame' 마킹 (F5와 "화면을 떠남"을 구분하는 신호).
  // 정리(cleanup)에서 지운다 — 앱 뒤로 버튼뿐 아니라 브라우저 뒤로가기·다른 링크 등
  // 어떤 경로로든 게임 화면을 떠나면(언마운트/셋업 전환) 마킹이 사라져, 재입장 시
  // 자동 복원 대신 셋업+이어하기 배너가 뜬다. F5(하드 리로드)는 cleanup이 실행되지
  // 않아 마킹이 살아남고 자동 복원된다 (2026-07-24 사용자 보고 — 브라우저 백 경로 누락).
  useEffect(() => {
    if (showSetup) return;
    try { window.sessionStorage.setItem('aos-ingame', '1'); } catch { /* noop */ }
    return () => {
      try { window.sessionStorage.removeItem('aos-ingame'); } catch { /* noop */ }
    };
  }, [showSetup]);
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
  // booting 해제도 여기서 — F5 자동 재입장 성공 시 셋업을 거치지 않고 곧장 보드/대기실로
  useEffect(() => {
    if (!isOnline || !netRoom) return;
    if (netRoom.status === 'playing') {
      setShowSetup(false);
      setBooting(false);
    } else if (netRoom.status === 'waiting') {
      setShowSetup(true);
      setSetupTab('online');
      setBooting(false);
    } else {
      // finished 등 그 외 상태(호스트가 닫은 방에 재입장 — DB 삭제가 실패하면 finished로
      // 잔존): 진행할 화면이 없으므로 셋업으로. 안 하면 booting이 안 풀려 로딩 교착.
      setShowSetup(true);
      setBooting(false);
    }
  }, [isOnline, netRoom, netRoom?.status]);

  // 온라인 세션이 끝나면(승계 거절·강퇴 등 netStore.leaveRoom 직접 호출로 offline 전환) 셋업
  // 화면으로 복귀 — 안 하면 게임 중 나갔을 때 stale 오프라인 보드에 갇힌다. UI의 handleLeaveRoom은
  // 자체적으로 setShowSetup(true)를 하므로, 이 효과는 그 외 경로(팝업 나가기·강퇴)를 보완한다.
  const wasOnlineRef = useRef(false);
  useEffect(() => {
    if (isOnline) {
      wasOnlineRef.current = true;
      return;
    }
    if (wasOnlineRef.current) {
      wasOnlineRef.current = false;
      setShowSetup(true);
      setSetupTab('online');
    }
  }, [isOnline]);

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

  // 인원 변경: 인원을 늘리며 새로 드러나는 좌석은 기본 BOT (기본 정책 "1번만 사람" 유지 —
  // 사람으로 두면 모르고 시작 시 의도치 않은 핫시트가 됨. 줄일 때는 잘려나가므로 무처리)
  const selectPlayerCount = (n: number) => {
    if (n > playerCount) {
      setAiPlayerIndexes(prev => {
        const next = new Set(prev);
        const romanNumerals = ['', 'II', 'III', 'IV', 'V', 'VI'];
        const newNames = [...playerNames];
        for (let i = playerCount; i < n; i++) {
          if (next.has(i)) continue;
          next.add(i);
          const suffix = romanNumerals[next.size - 1] || `${next.size}`;
          newNames[i] = next.size === 1 ? '컴퓨터-기차' : `컴퓨터-기차${suffix}`;
        }
        setPlayerNames(newNames);
        return next;
      });
    }
    setPlayerCount(n);
  };

  // 게임 시작
  const handleStartGame = () => {
    const aiPlayers = Array.from(aiPlayerIndexes).map(index => ({
      playerIndex: index,
      name: playerNames[index],
    }));
    initGame(mapId, playerNames.slice(0, playerCount), aiPlayers, { randomizeStartOrder: true });
    setShowSetup(false);
  };

  // 게임 리셋 — 의도적 새 시작이므로 F5 복원 마킹·이어하기 배너 해제
  const handleResetGame = () => {
    try { window.sessionStorage.removeItem('aos-ingame'); } catch { /* noop */ }
    setResumeAvailable(false);
    resetGame();
    setShowSetup(true);
  };

  // 맵 페이지로 돌아가기 (온라인이면 방도 나감) — 의도적 이탈이므로 F5 복원 마킹 해제
  const handleBack = () => {
    try { window.sessionStorage.removeItem('aos-ingame'); } catch { /* noop */ }
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

  // 부팅(복원 판정) 중 — 셋업 화면을 먼저 그렸다가 보드로 튀는 깜빡임 방지.
  // showSetup이 이미 false면(복원 완료) 아래 게임 화면으로 바로 내려간다.
  if (booting && showSetup) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass-card px-8 py-6 rounded-2xl flex items-center gap-3">
          <span className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" aria-hidden />
          <span className="text-sm text-foreground-secondary">게임 복원 중…</span>
        </div>
      </div>
    );
  }

  // 셋업 화면
  if (showSetup) {
    return (
      <motion.div
        className="min-h-screen bg-background flex items-start justify-center p-4 md:py-12"
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

            {/* 진행 중 게임 이어하기 — 나갔다 재입장한 경우에만 표시 (새 게임 시작하면 덮어씀) */}
            {resumeAvailable && (
              <div className="mb-6 rounded-xl border border-accent/40 bg-accent/5 p-4 relative">
                <button
                  onClick={() => {
                    // X = 저장된 게임 삭제 — 기억해둘 것 없이 게임 자체를 지운다
                    // (resetGame이 미시작 상태로 갈아끼워 gameStarted=false → 배너·F5 복원 모두 소멸)
                    resetGame();
                    setResumeAvailable(false);
                  }}
                  className="absolute top-2 right-2 p-1 text-foreground-secondary hover:text-foreground hover:bg-foreground/10 rounded transition-colors"
                  title="저장된 게임 삭제"
                  aria-label="저장된 게임 삭제"
                >
                  <X size={14} />
                </button>
                <div className="text-sm font-semibold text-foreground mb-1 pr-6">
                  진행 중인 게임이 있습니다
                </div>
                <p className="text-xs text-foreground-secondary mb-3">
                  {currentTurn}턴 · {activePlayers.length}인 — 이어서 하거나, X를 누르면
                  저장된 게임이 삭제됩니다. 새 게임을 시작해도 기존 게임은 사라집니다.
                </p>
                <button
                  onClick={() => { setResumeAvailable(false); setShowSetup(false); }}
                  className="btn-primary w-full py-2 text-sm"
                >
                  이어하기
                </button>
              </div>
            )}

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
                    {[...supportedPlayers].sort((a, b) => a - b).map((n) => (
                      <button
                        key={n}
                        onClick={() => selectPlayerCount(n)}
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
                    {mapConfig.turnsByPlayers?.[playerCount] ?? (mapConfig.maxTurns || TURNS_BY_PLAYER_COUNT[playerCount])}턴 진행
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
                              : 'bg-yellow-500/20 text-yellow-600 border border-yellow-500/30'
                          }`}
                        >
                          {isAI ? (
                            <Bot size={16} />
                          ) : (
                            <Crown size={16} fill={CROWN_GOLD} strokeWidth={1.8} style={{ color: CROWN_INK }} />
                          )}
                          {isAI ? 'BOT' : '사람'}
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
                <li>• {mapConfig.turnsByPlayers?.[playerCount] ?? (mapConfig.maxTurns || TURNS_BY_PLAYER_COUNT[playerCount])}턴 동안 진행</li>
                <li>• 시작: ${getMapProfile(mapId).startingCash ?? 10}, 2주 발행</li>
                <li>• 매 턴 10단계 진행</li>
                <li>• 최종 승점으로 승자 결정</li>
                {aiPlayerIndexes.size > 0 && (
                  <li className="text-blue-400">• BOT과 대전 ({aiPlayerIndexes.size}명의 BOT 플레이어)</li>
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

        {/* 대기실: 호스트 연결 끊김 → 승계/나가기 팝업 (게스트) */}
        <HostTakeoverDialog />
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

      {/* 건설 실패 사유 등 화면 상단 토스트 (로컬 UI, 스냅샷 미동기화) */}
      <Toaster />

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
              onClick={() => setExitConfirm('back')}
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

            {/* 터보 스위치 — 봇/연출 딜레이 축소 (방장 전용 변경, 게스트는 상태 표시) */}
            <TurboSwitch />

            {/* 도움말 (규칙/단계/특수행동/맵 특수룰) — 온라인·오프라인 공통 */}
            <button
              onClick={() => setShowHelp(true)}
              className="p-1.5 sm:p-2 hover:bg-foreground/10 rounded-lg transition-colors"
              title="게임 도움말"
              aria-label="게임 도움말"
            >
              <HelpCircle size={18} className="text-foreground-secondary sm:w-5 sm:h-5" />
            </button>

            {isOnline ? (
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 text-xs font-semibold text-accent tracking-widest">
                  {netRoom?.code}
                </span>
                <button
                  onClick={() => setExitConfirm('leave')}
                  className="p-1.5 sm:p-2 hover:bg-foreground/10 rounded-lg transition-colors"
                  title="방 나가기"
                  aria-label="방 나가기"
                >
                  <X size={18} className="text-foreground-secondary sm:w-5 sm:h-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setExitConfirm('reset')}
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
          {/* 온라인: 호스트 연결 끊김 안내 (재접속 대기 → 6초 후 승계 여부 팝업) */}
          {hostAbsent && (
            <div className="mb-3 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-500 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              호스트 연결이 끊겼습니다 — 재접속을 기다리는 중 (잠시 후 이어받기 여부를 묻습니다)
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
              {actingPlayerState.isAI && ' (BOT 진행 중…)'}
            </div>
          )}
          {/* lg(데스크톱): 패널 320px 고정 + 지도 가변(나머지 전부) — 넓은 화면일수록 지도 최대.
              md(태블릿): 12-그리드 유지(패널 토글). */}
          <div className="relative">
          <div className={`grid grid-cols-1 md:grid-cols-12 lg:grid-cols-[minmax(0,1fr)_340px] ${isLandscape ? 'gap-2' : 'gap-6'}`}>
            {/* 왼쪽: 게임 보드 + 물품 디스플레이 */}
            <div className={`
              relative
              col-span-1
              ${isPanelCollapsed ? 'md:col-span-12' : 'md:col-span-8'}
              lg:col-span-1
              ${isLandscape ? 'space-y-2' : 'space-y-4'}
            `}>
              {/* 보드 래퍼(relative): 채팅 버튼을 보드 우측 하단에 호버링 (온라인 전용) */}
              <div className="relative">
                <GameBoard />
                <GameChat />
                {/* 온라인: 내 차례가 아니면 보드 클릭 차단 (호스트 검증의 UX 보강 — 최종 방어는
                    applyGameIntent). 채팅·줌/신도시 버튼(z-30, 로컬 UI)은 GameBoard의
                    motion.div(transform=스태킹 컨텍스트) 밖 형제 레이어라 오버레이(z-20) 위에서
                    계속 사용 가능. 오버레이는 보드 래퍼 안에만 — 컬럼 전체를 덮으면 물품
                    디스플레이의 가로 스크롤까지 막힌다(디스플레이는 생산 모드 = 본인 로컬 UI라
                    관전자에겐 원래 클릭될 요소가 없어 덮을 필요 없음). */}
                {isOnline && !canInteract && <div className="absolute inset-0 z-20" aria-hidden />}
              </div>
              {/* 물품 성장이 없는 맵(St. Lucia)은 물품 디스플레이가 무의미 → 숨김 */}
              {/* 물품 디스플레이 — 성장 생략 맵·슬롯 0칸 맵(달: 주사위→도시 직접 성장)은 숨김 */}
              {!isLandscape && !mapConfig.rules.skipGoodsGrowth
                && mapConfig.columnMapping.some((c) => c.rowCount > 0)
                && <GoodsDisplayPanel />}
            </div>

            {/* 오른쪽: 패널들 (Desktop: always visible, Tablet: collapsible, Mobile: hidden) */}
            <AnimatePresence mode="wait">
              {!isPanelCollapsed && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  className="hidden md:block md:col-span-4 lg:col-span-1 md:sticky md:top-20 md:self-start md:max-h-[calc(100vh-6rem)] md:overflow-y-auto md:pr-1"
                >
                  {/* 온라인 차단: 오버레이 대신 내용만 pointer-events-none — 스크롤 컨테이너
                      (부모)는 살아 있어 상대 차례에도 패널을 스크롤해 볼 수 있다 (사용자 피드백) */}
                  <div className={`space-y-4 ${isOnline && !canInteract ? 'pointer-events-none' : ''}`}>
                    {renderPanelContent()}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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

      {/* 인게임 규칙/도움말 오버레이 */}
      <HelpOverlay open={showHelp} onClose={() => setShowHelp(false)} mapId={mapId} />

      {/* 디버그 패널 */}
      <DebugPanel />

      {/* 대륙횡단 연결 팝업 (Western US) */}
      <TranscontinentalModal />
      {/* 파산 알림 (사람·봇 공통, 온라인 스냅샷으로 전원 동일하게 표시) */}
      <BankruptcyModal />

      {/* 단계 전환 1초 멈춤 오버레이 */}
      <PhaseTransition />

      {/* 호스트: 이탈한 게스트를 AI로 전환할지 확인 (10초 유예 후 표시) */}
      <ConfirmDialog
        open={netMode === 'host' && disconnectedSeat !== null}
        title="플레이어 연결 끊김"
        message={`${disconnectedSeat?.name}님의 연결이 끊겼습니다. 이 자리를 BOT으로 전환해 게임을 계속할까요? 기다리면 재접속 시 자동으로 복귀합니다. (BOT 전환 후에는 이번 게임에서 되돌릴 수 없어요)`}
        confirmLabel="BOT으로 전환"
        cancelLabel="계속 기다리기"
        onConfirm={() => {
          if (disconnectedSeat) void convertSeatToAI(disconnectedSeat.seat);
        }}
        onCancel={dismissDisconnectPrompt}
      />

      {/* 게임 이탈 확인 — 헤더의 뒤로/리셋(오프라인)/방 나가기(온라인) 실수 클릭 방지 */}
      <ConfirmDialog
        open={exitConfirm !== null}
        title={
          exitConfirm === 'leave' ? '방 나가기' : exitConfirm === 'back' ? '게임 나가기' : '게임 리셋'
        }
        message={
          exitConfirm === 'leave'
            ? '방에서 나갈까요? 게임 화면을 떠나 설정 화면으로 돌아갑니다.'
            : exitConfirm === 'back'
            ? isOnline
              ? '맵 목록으로 나갈까요? 온라인 방에서도 나가게 됩니다.'
              : '맵 목록으로 나갈까요? 진행 상황은 저장되어 다시 들어오면 이어할 수 있습니다.'
            : '게임을 리셋할까요? 진행 중인 게임이 사라지며 되돌릴 수 없습니다.'
        }
        confirmLabel={exitConfirm === 'reset' ? '리셋' : '나가기'}
        cancelLabel="계속 플레이"
        onConfirm={() => {
          const mode = exitConfirm;
          setExitConfirm(null);
          if (mode === 'leave') handleLeaveRoom();
          else if (mode === 'back') handleBack();
          else if (mode === 'reset') handleResetGame();
        }}
        onCancel={() => setExitConfirm(null)}
      />

      {/* 게임 중: 호스트 연결 끊김 → 승계/게임 나가기 팝업 (게스트) */}
      <HostTakeoverDialog />
    </div>
  );
}
