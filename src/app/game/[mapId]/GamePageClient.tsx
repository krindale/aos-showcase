'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import GameBoard from '@/components/game/GameBoard';
import PlayerPanel from '@/components/game/PlayerPanel';
import PhasePanel from '@/components/game/PhasePanel';
import TurnTrack from '@/components/game/TurnTrack';
import { ArrowLeft, RotateCcw } from 'lucide-react';

interface GamePageClientProps {
  mapId: string;
}

export default function GamePageClient({ mapId }: GamePageClientProps) {
  const router = useRouter();

  const [showSetup, setShowSetup] = useState(true);
  const [player1Name, setPlayer1Name] = useState('Player 1');
  const [player2Name, setPlayer2Name] = useState('Player 2');

  const {
    initGame,
    resetGame,
    currentTurn,
    currentPhase,
    players,
    maxTurns,
    winner,
  } = useGameStore();

  // 게임 시작
  const handleStartGame = () => {
    initGame(mapId, player1Name, player2Name);
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
              Rust Belt - 2인 게임
            </p>

            <div className="space-y-6">
              <div>
                <label className="block text-sm text-foreground-secondary mb-2">
                  플레이어 1 (주황)
                </label>
                <input
                  type="text"
                  value={player1Name}
                  onChange={(e) => setPlayer1Name(e.target.value)}
                  className="w-full px-4 py-3 bg-background-secondary rounded-lg border border-foreground/10 text-foreground focus:border-accent focus:outline-none"
                  placeholder="이름 입력"
                />
              </div>

              <div>
                <label className="block text-sm text-foreground-secondary mb-2">
                  플레이어 2 (파랑)
                </label>
                <input
                  type="text"
                  value={player2Name}
                  onChange={(e) => setPlayer2Name(e.target.value)}
                  className="w-full px-4 py-3 bg-background-secondary rounded-lg border border-foreground/10 text-foreground focus:border-accent focus:outline-none"
                  placeholder="이름 입력"
                />
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
                <li>• 8턴 동안 진행</li>
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
    const player1Score = players.player1.income * 3 - players.player1.issuedShares * 3;
    const player2Score = players.player2.income * 3 - players.player2.issuedShares * 3;
    const winnerId = player1Score > player2Score ? 'player1' : player2Score > player1Score ? 'player2' : null;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <div className="glass-card p-8 rounded-2xl text-center">
            <h1 className="text-4xl font-bold text-accent mb-4">
              게임 종료!
            </h1>

            <div className="space-y-4 my-8">
              <div className={`p-4 rounded-lg ${winnerId === 'player1' ? 'bg-accent/20 ring-2 ring-accent' : 'bg-background-secondary'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{players.player1.name}</span>
                  <span className="text-2xl font-bold text-foreground">{player1Score} VP</span>
                </div>
                <div className="text-sm text-foreground-secondary mt-1">
                  수입 {players.player1.income} × 3 - 주식 {players.player1.issuedShares} × 3
                </div>
              </div>

              <div className={`p-4 rounded-lg ${winnerId === 'player2' ? 'bg-accent/20 ring-2 ring-accent' : 'bg-background-secondary'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{players.player2.name}</span>
                  <span className="text-2xl font-bold text-foreground">{player2Score} VP</span>
                </div>
                <div className="text-sm text-foreground-secondary mt-1">
                  수입 {players.player2.income} × 3 - 주식 {players.player2.issuedShares} × 3
                </div>
              </div>
            </div>

            {winnerId && (
              <p className="text-xl text-foreground mb-6">
                <span className="text-accent font-bold">{players[winnerId].name}</span> 승리!
              </p>
            )}
            {!winnerId && (
              <p className="text-xl text-foreground mb-6">무승부!</p>
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
            {/* 왼쪽: 게임 보드 */}
            <div className="lg:col-span-8">
              <GameBoard />
            </div>

            {/* 오른쪽: 패널들 */}
            <div className="lg:col-span-4 space-y-4">
              {/* 현재 단계 */}
              <PhasePanel />

              {/* 플레이어 패널 */}
              <PlayerPanel playerId="player1" />
              <PlayerPanel playerId="player2" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
