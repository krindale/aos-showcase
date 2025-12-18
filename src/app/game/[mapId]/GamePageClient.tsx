'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useGameStore, TUTORIAL_GAME_CONFIG } from '@/store/gameStore';
import GameBoard from '@/components/game/GameBoard';
import PlayerPanel from '@/components/game/PlayerPanel';
import PhasePanel from '@/components/game/PhasePanel';
import TurnTrack from '@/components/game/TurnTrack';
import GoodsDisplayPanel from '@/components/game/GoodsDisplayPanel';
import ComplexTrackPanel from '@/components/game/ComplexTrackPanel';
import RedirectTrackPanel from '@/components/game/RedirectTrackPanel';
import UrbanizationPanel from '@/components/game/UrbanizationPanel';
import ProductionPanel from '@/components/game/ProductionPanel';
import DebugPanel from '@/components/game/DebugPanel';
import { calculateTrackScore } from '@/utils/trackValidation';
import { ArrowLeft, RotateCcw, Users, Zap, X, Bot } from 'lucide-react';
import {
  PLAYER_COLOR_ORDER,
  PLAYER_COLORS,
  TURNS_BY_PLAYER_COUNT,
  ACTION_INFO,
} from '@/types/game';
import { TUTORIAL_MAP } from '@/utils/tutorialMap';

interface GamePageClientProps {
  mapId: string;
}

// 기본 플레이어 이름 생성 (튜토리얼은 AI 포함)
const DEFAULT_NAMES = ['기차-하나', '컴퓨터-기차', '기차-셋', '기차-넷', '기차-다섯', '기차-여섯'];

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

  // 맵 설정 (현재는 Tutorial만 지원)
  const mapConfig = TUTORIAL_MAP;
  const supportedPlayers = mapConfig.supportedPlayers;

  const [showSetup, setShowSetup] = useState(true);
  const [playerCount, setPlayerCount] = useState(supportedPlayers[0]);
  const [playerNames, setPlayerNames] = useState<string[]>(DEFAULT_NAMES);
  // 튜토리얼 맵에서 플레이어 2는 기본적으로 AI
  const [aiPlayerIndexes, setAiPlayerIndexes] = useState<Set<number>>(
    mapId === 'tutorial' ? new Set([1]) : new Set()
  );

  const {
    initGame,
    resetGame,
    currentTurn,
    currentPhase,
    players,
    activePlayers,
    maxTurns,
    winner,
    board,
    ui,
    hideComplexTrackSelection,
    resetBuildMode,
  } = useGameStore();

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

  // 맵 페이지로 돌아가기
  const handleBack = () => {
    router.push('/maps');
  };

  // 셋업 화면
  if (showSetup) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <div className="glass-card p-8 rounded-2xl relative">
            <button
              onClick={() => router.back()}
              className="absolute top-4 right-4 p-2 text-foreground-secondary hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors"
              title="닫기"
            >
              <X size={20} />
            </button>

            <h1 className="text-3xl font-bold text-foreground mb-2">
              Age of Steam
            </h1>
            <p className="text-foreground-secondary mb-8">
              {mapConfig.name} - {playerCount}인 게임
            </p>

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
                    {mapId === 'tutorial' ? TUTORIAL_GAME_CONFIG.maxTurns : TURNS_BY_PLAYER_COUNT[playerCount]}턴 진행
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
                <li>• {mapId === 'tutorial' ? TUTORIAL_GAME_CONFIG.maxTurns : TURNS_BY_PLAYER_COUNT[playerCount]}턴 동안 진행</li>
                <li>• 시작: $10, 2주 발행</li>
                <li>• 매 턴 10단계 진행</li>
                <li>• 최종 승점으로 승자 결정</li>
                {aiPlayerIndexes.size > 0 && (
                  <li className="text-blue-400">• AI와 대전 ({aiPlayerIndexes.size}명의 AI 플레이어)</li>
                )}
              </ul>
            </div>
          </div>
        </motion.div>
      </div>
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
                onClick={handleResetGame}
                className="flex-1 btn-secondary py-3 rounded-xl flex items-center justify-center gap-2"
              >
                <RotateCcw size={18} />
                다시 하기
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

  // 메인 게임 화면
  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-foreground/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-foreground/10 rounded-lg transition-colors"
            >
              <ArrowLeft size={20} className="text-foreground-secondary" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-foreground">Age of Steam</h1>
              <p className="text-xs text-foreground-secondary">Rust Belt</p>
            </div>
          </div>

          <TurnTrack
            currentTurn={currentTurn}
            maxTurns={maxTurns}
            currentPhase={currentPhase}
          />

          <button
            onClick={handleResetGame}
            className="p-2 hover:bg-foreground/10 rounded-lg transition-colors"
            title="게임 리셋"
          >
            <RotateCcw size={20} className="text-foreground-secondary" />
          </button>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 왼쪽: 게임 보드 + 물품 디스플레이 */}
            <div className="lg:col-span-8 space-y-4">
              <GameBoard />
              <GoodsDisplayPanel />
            </div>

            {/* 오른쪽: 패널들 */}
            <div className="lg:col-span-4 space-y-4">
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
                      return (
                        <div
                          key={pid}
                          className="flex items-center gap-2 px-2 py-1 rounded bg-accent/10 border border-accent/20"
                        >
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: PLAYER_COLORS[player.color] }}
                          />
                          <span className="text-xs text-foreground">{player.name}</span>
                          <span className="text-xs font-medium text-accent">
                            {ACTION_INFO[action].name}
                          </span>
                        </div>
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

              {/* 플레이어 패널 (동적 렌더링) */}
              {activePlayers.map(playerId => (
                <PlayerPanel key={playerId} playerId={playerId} />
              ))}
            </div>
          </div>
        </div>
      </main>

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
    </div>
  );
}
