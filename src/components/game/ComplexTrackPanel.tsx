'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { HexCoord, TRACK_REPLACE_COSTS } from '@/types/game';
import { hexCoordsEqual } from '@/utils/hexGrid';
import { X, ArrowRightLeft, Layers } from 'lucide-react';

interface ComplexTrackPanelProps {
  coord: HexCoord;
  newEdges: [number, number];
  onClose: () => void;
  onComplete: () => void;
}

export default function ComplexTrackPanel({
  coord,
  newEdges,
  onClose,
  onComplete,
}: ComplexTrackPanelProps) {
  const {
    board,
    players,
    currentPlayer,
    buildComplexTrack,
    canBuildComplexTrack,
  } = useGameStore();

  const player = players[currentPlayer];
  const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));

  if (!existingTrack) {
    return null;
  }

  const canBuildCrossing = canBuildComplexTrack(coord, newEdges, 'crossing');
  const canBuildCoexist = canBuildComplexTrack(coord, newEdges, 'coexist');

  const crossingCost = TRACK_REPLACE_COSTS.simpleToCrossing;
  const coexistCost = TRACK_REPLACE_COSTS.default;

  const handleBuildCrossing = () => {
    if (canBuildCrossing && player.cash >= crossingCost) {
      const success = buildComplexTrack(coord, newEdges, 'crossing');
      if (success) {
        onComplete();
      }
    }
  };

  const handleBuildCoexist = () => {
    if (canBuildCoexist && player.cash >= coexistCost) {
      const success = buildComplexTrack(coord, newEdges, 'coexist');
      if (success) {
        onComplete();
      }
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-background-secondary rounded-xl border border-accent/30 p-6 max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">
              복합 트랙 건설
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-foreground/10 transition-colors"
            >
              <X size={20} className="text-foreground-secondary" />
            </button>
          </div>

          {/* 설명 */}
          <p className="text-sm text-foreground-secondary mb-4">
            기존 트랙 위에 새로운 트랙을 추가합니다.
            <br />
            현재 현금: <span className="text-accent font-medium">${player.cash}</span>
          </p>

          {/* 옵션 */}
          <div className="space-y-3">
            {/* 교차 (Crossing) */}
            <button
              onClick={handleBuildCrossing}
              disabled={!canBuildCrossing || player.cash < crossingCost}
              className={`w-full p-4 rounded-lg border transition-all flex items-start gap-3 ${
                canBuildCrossing && player.cash >= crossingCost
                  ? 'bg-background/50 border-foreground/20 hover:border-accent hover:bg-accent/10'
                  : 'bg-background/30 border-foreground/10 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="p-2 rounded-lg bg-accent/20">
                <ArrowRightLeft size={24} className="text-accent" />
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">교차 (Crossing)</span>
                  <span className="text-sm text-accent">${crossingCost}</span>
                </div>
                <p className="text-xs text-foreground-secondary mt-1">
                  두 트랙이 다리로 교차합니다. 서로 연결되지 않습니다.
                </p>
              </div>
            </button>

            {/* 공존 (Coexist) */}
            <button
              onClick={handleBuildCoexist}
              disabled={!canBuildCoexist || player.cash < coexistCost}
              className={`w-full p-4 rounded-lg border transition-all flex items-start gap-3 ${
                canBuildCoexist && player.cash >= coexistCost
                  ? 'bg-background/50 border-foreground/20 hover:border-accent hover:bg-accent/10'
                  : 'bg-background/30 border-foreground/10 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Layers size={24} className="text-blue-400" />
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">공존 (Coexist)</span>
                  <span className="text-sm text-accent">${coexistCost}</span>
                </div>
                <p className="text-xs text-foreground-secondary mt-1">
                  두 트랙이 같은 헥스에 공존합니다. 다리 없이 나란히.
                </p>
              </div>
            </button>
          </div>

          {/* 취소 버튼 */}
          <button
            onClick={onClose}
            className="w-full mt-4 py-2 rounded-lg text-sm text-foreground-secondary hover:bg-foreground/10 transition-colors"
          >
            취소
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
