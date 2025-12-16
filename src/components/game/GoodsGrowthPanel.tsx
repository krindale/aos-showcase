'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { CUBE_COLORS, CubeColor } from '@/types/game';
import { RUST_BELT_COLUMN_MAPPING } from '@/utils/rustBeltMap';
import DiceRoller from './DiceRoller';
import { Sparkles, Package, Check, ArrowRight } from 'lucide-react';

export default function GoodsGrowthPanel() {
  const {
    players,
    goodsDisplay,
    board,
    phaseState,
    growGoods,
    nextPhase,
  } = useGameStore();

  const [diceResults, setDiceResults] = useState<number[]>([]);
  const [growthApplied, setGrowthApplied] = useState(false);

  // Production 행동을 선택한 플레이어
  const productionPlayer = Object.values(players).find(
    (p) => p.selectedAction === 'production'
  );

  // 주사위 수 (플레이어 수) - 탈락하지 않은 활성 플레이어 수
  const activePlayers = Object.values(players).filter(p => !p.eliminated);
  const diceCount = activePlayers.length;

  // 열별 큐브 수 계산
  const getColumnCubes = (columnId: string): (CubeColor | null)[] => {
    const columnIndex = RUST_BELT_COLUMN_MAPPING.findIndex(m => m.columnId === columnId);
    if (columnIndex === -1) return [];

    const startIndex = RUST_BELT_COLUMN_MAPPING.slice(0, columnIndex).reduce(
      (sum, m) => sum + m.rowCount,
      0
    );
    const mapping = RUST_BELT_COLUMN_MAPPING[columnIndex];
    return goodsDisplay.slots.slice(startIndex, startIndex + mapping.rowCount);
  };

  // 주사위 결과에 따른 이동할 큐브 계산
  const calculateGrowthResults = () => {
    if (diceResults.length === 0) return [];

    const results: { columnId: string; cityName: string; count: number; cubes: CubeColor[] }[] = [];

    // 주사위 결과 카운트
    const diceCountMap: Record<number, number> = {};
    diceResults.forEach(d => {
      diceCountMap[d] = (diceCountMap[d] || 0) + 1;
    });

    // 각 열별로 이동할 큐브 계산
    for (const [diceValue, count] of Object.entries(diceCountMap)) {
      const columnId = diceValue;
      const mapping = RUST_BELT_COLUMN_MAPPING.find(m => m.columnId === columnId);

      if (mapping) {
        const columnCubes = getColumnCubes(columnId).filter(c => c !== null) as CubeColor[];
        const cubesToMove = columnCubes.slice(0, count);

        const city = board.cities.find(c => c.id === mapping.cityId);

        if (cubesToMove.length > 0 && city) {
          results.push({
            columnId,
            cityName: city.name,
            count: cubesToMove.length,
            cubes: cubesToMove,
          });
        }
      }
    }

    return results;
  };

  // 주사위 굴리기 핸들러
  const handleDiceRoll = (results: number[]) => {
    setDiceResults(results);
    setGrowthApplied(false);
  };

  // 물품 성장 적용
  const handleApplyGrowth = () => {
    if (diceResults.length === 0) return;
    growGoods(diceResults);
    setGrowthApplied(true);
  };

  // 다음 단계로 이동
  const handleNextPhase = () => {
    nextPhase();
  };

  const growthResults = calculateGrowthResults();

  return (
    <div className="space-y-4">
      {/* Production 행동 안내 */}
      {productionPlayer && !phaseState.productionUsed && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg bg-purple-500/20 border border-purple-500/30"
        >
          <div className="flex items-center gap-2 text-purple-400">
            <Package size={16} />
            <span className="text-sm font-medium">
              {productionPlayer.name}의 Production 효과
            </span>
          </div>
          <p className="text-xs text-purple-300 mt-1">
            주머니에서 큐브 2개를 물품 디스플레이 빈 칸에 추가합니다.
          </p>
        </motion.div>
      )}

      {/* 주사위 굴리기 */}
      <div className="p-4 rounded-lg bg-background/50 border border-foreground/10">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-accent" />
          <h4 className="font-medium text-foreground">물품 성장</h4>
        </div>

        <DiceRoller
          diceCount={diceCount}
          onRoll={handleDiceRoll}
          disabled={growthApplied}
        />
      </div>

      {/* 결과 미리보기 */}
      <AnimatePresence>
        {diceResults.length > 0 && !growthApplied && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 rounded-lg bg-accent/10 border border-accent/30"
          >
            <h4 className="text-sm font-medium text-accent mb-3">이동 예정</h4>

            {growthResults.length > 0 ? (
              <div className="space-y-2">
                {growthResults.map((result, index) => (
                  <motion.div
                    key={result.columnId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center justify-between p-2 rounded bg-background/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground-secondary">
                        열 {result.columnId}
                      </span>
                      <ArrowRight size={14} className="text-foreground-muted" />
                      <span className="text-sm font-medium text-foreground">
                        {result.cityName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {result.cubes.map((cube, i) => (
                        <div
                          key={i}
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: CUBE_COLORS[cube] }}
                        />
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground-secondary">
                이동할 물품이 없습니다.
              </p>
            )}

            <button
              onClick={handleApplyGrowth}
              className="w-full mt-4 py-2 rounded-lg text-sm font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2"
            >
              <Check size={16} />
              물품 성장 적용
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 완료 */}
      {growthApplied && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 rounded-lg bg-green-500/20 border border-green-500/30"
        >
          <div className="flex items-center gap-2 text-green-400 mb-3">
            <Check size={18} />
            <span className="font-medium">물품 성장 완료!</span>
          </div>

          {growthResults.length > 0 && (
            <div className="text-sm text-green-300 mb-3">
              {growthResults.map(r => `${r.cityName}에 ${r.count}개`).join(', ')} 추가됨
            </div>
          )}

          <button
            onClick={handleNextPhase}
            className="w-full py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-500 transition-colors flex items-center justify-center gap-2"
          >
            다음 단계로
            <ArrowRight size={16} />
          </button>
        </motion.div>
      )}

      {/* 건너뛰기 */}
      {!growthApplied && diceResults.length === 0 && (
        <button
          onClick={handleNextPhase}
          className="w-full py-2 rounded-lg text-xs text-foreground-secondary hover:text-foreground hover:bg-background/30 transition-colors"
        >
          물품 성장 건너뛰기
        </button>
      )}
    </div>
  );
}
