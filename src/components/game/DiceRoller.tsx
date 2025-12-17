'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from 'lucide-react';

interface DiceRollerProps {
  diceCount: number;
  onRoll: (results: number[]) => void;
  disabled?: boolean;
}

const DICE_ICONS = {
  1: Dice1,
  2: Dice2,
  3: Dice3,
  4: Dice4,
  5: Dice5,
  6: Dice6,
};

export default function DiceRoller({ diceCount, onRoll, disabled = false }: DiceRollerProps) {
  const [results, setResults] = useState<number[]>([]);
  const [isRolling, setIsRolling] = useState(false);

  const rollDice = () => {
    if (disabled || isRolling) return;

    setIsRolling(true);

    // 굴리는 애니메이션 효과
    let rollCount = 0;
    const maxRolls = 10;
    const rollInterval = setInterval(() => {
      const tempResults = Array(diceCount)
        .fill(0)
        .map(() => Math.floor(Math.random() * 6) + 1);
      setResults(tempResults);
      rollCount++;

      if (rollCount >= maxRolls) {
        clearInterval(rollInterval);
        // 최종 결과
        const finalResults = Array(diceCount)
          .fill(0)
          .map(() => Math.floor(Math.random() * 6) + 1);
        setResults(finalResults);
        setIsRolling(false);
        onRoll(finalResults);
      }
    }, 100);
  };

  return (
    <div className="space-y-4">
      {/* 주사위 표시 */}
      <div className="flex items-center justify-center gap-4">
        <AnimatePresence mode="wait">
          {results.length > 0 ? (
            results.map((value, index) => {
              const DiceIcon = DICE_ICONS[value as keyof typeof DICE_ICONS];
              return (
                <motion.div
                  key={`dice-${index}-${isRolling ? 'rolling' : 'done'}`}
                  initial={{ scale: 0.8, opacity: 0.5 }}
                  animate={{
                    scale: 1,
                    opacity: 1,
                  }}
                  transition={{
                    duration: 0.15,
                  }}
                  className={`p-3 rounded-xl ${
                    isRolling
                      ? 'bg-accent/30 border-accent'
                      : 'bg-background/70 border-foreground/20'
                  } border-2`}
                >
                  <DiceIcon
                    size={48}
                    className={isRolling ? 'text-accent' : 'text-foreground'}
                  />
                </motion.div>
              );
            })
          ) : (
            Array(diceCount)
              .fill(0)
              .map((_, index) => (
                <motion.div
                  key={`placeholder-${index}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-3 rounded-xl bg-background/30 border-2 border-dashed border-foreground/20"
                >
                  <div className="w-12 h-12 flex items-center justify-center text-foreground-secondary">
                    ?
                  </div>
                </motion.div>
              ))
          )}
        </AnimatePresence>
      </div>

      {/* 결과 표시 */}
      {results.length > 0 && !isRolling && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <p className="text-sm text-foreground-secondary">
            결과: {results.join(', ')}
          </p>
          <p className="text-xs text-foreground-muted mt-1">
            {results.reduce((acc, val) => {
              const counts: Record<number, number> = acc;
              counts[val] = (counts[val] || 0) + 1;
              return counts;
            }, {} as Record<number, number>) &&
              Object.entries(
                results.reduce((acc, val) => {
                  acc[val] = (acc[val] || 0) + 1;
                  return acc;
                }, {} as Record<number, number>)
              )
                .map(([num, count]) => `열 ${num}: ${count}개`)
                .join(', ')}
          </p>
        </motion.div>
      )}

      {/* 굴리기 버튼 */}
      <button
        onClick={rollDice}
        disabled={disabled || isRolling}
        className={`w-full py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
          disabled || isRolling
            ? 'bg-foreground/10 text-foreground-secondary cursor-not-allowed'
            : 'bg-accent text-background hover:bg-accent-light'
        }`}
      >
        {isRolling ? (
          <>
            🎲 굴리는 중...
          </>
        ) : results.length > 0 ? (
          '다시 굴리기'
        ) : (
          <>🎲 주사위 굴리기</>
        )}
      </button>
    </div>
  );
}
