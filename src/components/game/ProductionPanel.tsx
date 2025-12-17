'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { CUBE_COLORS } from '@/types/game';
import { Package, X, Check } from 'lucide-react';

export default function ProductionPanel() {
  const {
    ui,
    currentPhase,
    players,
    currentPlayer,
    phaseState,
    goodsDisplay,
    startProduction,
    confirmProduction,
    cancelProduction,
    getEmptySlots,
  } = useGameStore();

  const player = players[currentPlayer];

  // Production 행동을 선택한 플레이어인지 확인
  const hasProduction = player.selectedAction === 'production';

  // 물품 성장 단계가 아니거나 Production 행동이 없으면 렌더링하지 않음
  if (currentPhase !== 'goodsGrowth' || !hasProduction || phaseState.productionUsed) {
    return null;
  }

  // 빈 슬롯 확인
  const emptySlots = getEmptySlots();
  const hasEmptySlots = emptySlots.length > 0;

  // Production 모드가 아니면 시작 버튼만 표시
  if (!ui.productionMode) {
    return (
      <div className="glass-card p-4 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-accent" />
            <h3 className="text-sm font-semibold text-foreground">생산 (Production)</h3>
          </div>
          <span className="text-xs text-foreground-secondary">
            주머니: {goodsDisplay.bag.length}개
          </span>
        </div>
        <p className="text-xs text-foreground-secondary mb-3">
          물품 디스플레이의 빈 칸 2개에 큐브를 배치합니다.
        </p>
        {!hasEmptySlots ? (
          <p className="text-xs text-yellow-400">
            빈 칸이 없습니다. 물품 성장 후에 빈 칸이 생깁니다.
          </p>
        ) : goodsDisplay.bag.length === 0 ? (
          <p className="text-xs text-yellow-400">
            주머니에 큐브가 없습니다.
          </p>
        ) : (
          <button
            onClick={startProduction}
            className="w-full btn-primary py-2 rounded-lg text-sm font-medium"
          >
            생산 시작
          </button>
        )}
      </div>
    );
  }

  // Production 모드: 슬롯 선택 UI
  const cubesNeeded = ui.productionCubes.length;
  const cubesSelected = ui.selectedProductionSlots.length;
  const canConfirm = cubesSelected === cubesNeeded;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={cancelProduction}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-background-secondary rounded-xl border border-accent/30 p-6 max-w-md w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Package size={20} className="text-accent" />
              <h3 className="text-lg font-semibold text-foreground">
                생산 (Production)
              </h3>
            </div>
            <button
              onClick={cancelProduction}
              className="p-1 rounded hover:bg-foreground/10 transition-colors"
            >
              <X size={20} className="text-foreground-secondary" />
            </button>
          </div>

          {/* 뽑힌 큐브 표시 */}
          <div className="mb-4 p-3 bg-background/50 rounded-lg">
            <div className="text-xs text-foreground-secondary mb-2">
              주머니에서 뽑힌 큐브:
            </div>
            <div className="flex gap-3 justify-center">
              {ui.productionCubes.map((color, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: i * 0.2, type: 'spring', stiffness: 300 }}
                  className="flex flex-col items-center"
                >
                  <div
                    className="w-10 h-10 rounded shadow-lg border-2 border-white/30"
                    style={{ backgroundColor: CUBE_COLORS[color] }}
                  />
                  <span className="text-xs text-foreground-secondary mt-1">
                    {color === 'red' ? '빨강' :
                     color === 'blue' ? '파랑' :
                     color === 'yellow' ? '노랑' :
                     color === 'purple' ? '보라' : '검정'}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* 진행 상태 */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-foreground-secondary">선택 진행:</span>
              <span className={`font-medium ${canConfirm ? 'text-green-400' : 'text-accent'}`}>
                {cubesSelected} / {cubesNeeded}
              </span>
            </div>
            <div className="w-full bg-background/50 rounded-full h-2">
              <motion.div
                className="bg-accent h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(cubesSelected / cubesNeeded) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          {/* 안내 메시지 */}
          <p className="text-sm text-foreground-secondary mb-4 text-center">
            {canConfirm
              ? '모든 슬롯을 선택했습니다. 확인을 눌러 배치하세요.'
              : `물품 디스플레이에서 빈 칸 ${cubesNeeded - cubesSelected}개를 더 선택하세요.`}
          </p>

          {/* 선택된 슬롯 정보 */}
          {ui.selectedProductionSlots.length > 0 && (
            <div className="mb-4 p-2 bg-accent/10 rounded-lg border border-accent/30">
              <div className="text-xs text-foreground-secondary mb-1">선택된 슬롯:</div>
              <div className="flex gap-2 flex-wrap">
                {ui.selectedProductionSlots.map((slotIndex, i) => {
                  const column = slotIndex < 36
                    ? Math.floor(slotIndex / 6) + 1
                    : ['A', 'B', 'C', 'D'][Math.floor((slotIndex - 36) / 4)];
                  const row = slotIndex < 36
                    ? (slotIndex % 6) + 1
                    : ((slotIndex - 36) % 4) + 1;

                  return (
                    <span
                      key={slotIndex}
                      className="px-2 py-1 bg-accent/20 rounded text-xs text-accent"
                    >
                      열 {column} - {row}행 →{' '}
                      <span
                        className="inline-block w-3 h-3 rounded"
                        style={{ backgroundColor: CUBE_COLORS[ui.productionCubes[i]] }}
                      />
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* 버튼 */}
          <div className="flex gap-3">
            <button
              onClick={cancelProduction}
              className="flex-1 py-2 rounded-lg text-sm text-foreground-secondary hover:bg-foreground/10 transition-colors border border-foreground/20"
            >
              취소
            </button>
            <button
              onClick={() => confirmProduction()}
              disabled={!canConfirm}
              className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                canConfirm
                  ? 'btn-primary'
                  : 'bg-foreground/10 text-foreground-secondary cursor-not-allowed'
              }`}
            >
              <Check size={16} />
              확인
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
