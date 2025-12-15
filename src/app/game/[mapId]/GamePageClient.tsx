'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
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
import { ArrowLeft, RotateCcw, Users } from 'lucide-react';
import {
  PLAYER_COLOR_ORDER,
  PLAYER_COLORS,
  TURNS_BY_PLAYER_COUNT
} from '@/types/game';
import { RUST_BELT_MAP } from '@/utils/rustBeltMap';

interface GamePageClientProps {
  mapId: string;
}

// 기본 플레이어 이름 생성
const DEFAULT_NAMES = ['기차-하나', '기차-둘', '기차-셋', '기차-넷', '기차-다섯', '기차-여섯'];

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

  // 맵 설정 (현재는 Rust Belt만 지원)
  const mapConfig = RUST_BELT_MAP;
  const supportedPlayers = mapConfig.supportedPlayers;

  const [showSetup, setShowSetup] = useState(true);
  const [playerCount, setPlayerCount] = useState(supportedPlayers[0]);
  const [playerNames, setPlayerNames] = useState<string[]>(DEFAULT_NAMES);

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

  // 게임 시작
  const handleStartGame = () => {
    initGame(mapId, playerNames.slice(0, playerCount));
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
          <div className="glass-card p-8 rounded-2xl">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-foreground-secondary hover:text-foreground mb-6 transition-colors"
            >
              <ArrowLeft size={20} />
              <span>맵 선택으로 돌아가기</span>
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
                    {TURNS_BY_PLAYER_COUNT[playerCount]}턴 진행
                  </p>
                </div>
              )}

              {/* 플레이어 이름 입력 */}
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {Array.from({ length: playerCount }).map((_, index) => {
                  const color = PLAYER_COLOR_ORDER[index];
                  const colorName = COLOR_NAMES[color];
                  const colorHex = PLAYER_COLORS[color];

                  return (
                    <div key={index}>
                      <label className="flex items-center gap-2 text-sm text-foreground-secondary mb-1">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: colorHex }}
                        />
                        플레이어 {index + 1} ({colorName})
                      </label>
                      <input
                        type="text"
                        value={playerNames[index]}
                        onChange={(e) => updatePlayerName(index, e.target.value)}
                        className="w-full px-4 py-2 bg-background-secondary rounded-lg border border-foreground/10 text-foreground focus:border-accent focus:outline-none"
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
              <h3 className="text-sm font-semibold text-accent mb-2">게임 규칙</h3>
              <ul className="text-xs text-foreground-secondary space-y-1">
                <li>• {TURNS_BY_PLAYER_COUNT[playerCount]}턴 동안 진행</li>
                <li>• 시작: $10, 2주 발행</li>
                <li>• 매 턴 10단계 진행</li>
                <li>• 최종 승점으로 승자 결정</li>
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
