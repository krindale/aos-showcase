'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { TRACK_REPLACE_COSTS } from '@/types/game';
import { X, RotateCw } from 'lucide-react';

// 엣지 방향 이름
const EDGE_NAMES: Record<number, string> = {
  0: '오른쪽',
  1: '오른쪽 아래',
  2: '왼쪽 아래',
  3: '왼쪽',
  4: '왼쪽 위',
  5: '오른쪽 위',
};

export default function RedirectTrackPanel() {
  const {
    ui,
    players,
    currentPlayer,
    redirectTrack,
    hideRedirectSelection,
  } = useGameStore();

  const selection = ui.redirectTrackSelection;
  if (!selection) return null;

  const player = players[currentPlayer];
  const cost = TRACK_REPLACE_COSTS.redirect;
  const canAfford = player.cash >= cost;

  const handleRedirect = (newEdge: number) => {
    if (!canAfford) return;
    const success = redirectTrack(selection.coord, newEdge);
    if (success) {
      // 성공 시 자동으로 UI가 닫힘
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={hideRedirectSelection}
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
            <div className="flex items-center gap-2">
              <RotateCw size={20} className="text-accent" />
              <h3 className="text-lg font-semibold text-foreground">
                트랙 방향 전환
              </h3>
            </div>
            <button
              onClick={hideRedirectSelection}
              className="p-1 rounded hover:bg-foreground/10 transition-colors"
            >
              <X size={20} className="text-foreground-secondary" />
            </button>
          </div>

          {/* 설명 */}
          <p className="text-sm text-foreground-secondary mb-4">
            미완성 트랙의 방향을 변경합니다.
            <br />
            비용: <span className="text-accent font-medium">${cost}</span>
            <span className="mx-2">|</span>
            현재 현금: <span className={canAfford ? 'text-accent' : 'text-red-400'}>${player.cash}</span>
          </p>

          {/* 현재 상태 */}
          <div className="mb-4 p-3 bg-background/50 rounded-lg">
            <div className="text-xs text-foreground-secondary mb-1">현재 방향</div>
            <div className="text-sm text-foreground">
              <span className="font-medium">{EDGE_NAMES[selection.connectedEdge]}</span>
              <span className="mx-2 text-foreground-secondary">↔</span>
              <span className="font-medium">{EDGE_NAMES[selection.currentOpenEdge]}</span>
            </div>
          </div>

          {/* 방향 선택 */}
          <div className="space-y-2">
            <div className="text-xs text-foreground-secondary mb-2">새 방향 선택</div>
            {selection.availableEdges.map((edge) => (
              <button
                key={edge}
                onClick={() => handleRedirect(edge)}
                disabled={!canAfford}
                className={`w-full p-3 rounded-lg border transition-all flex items-center justify-between ${
                  canAfford
                    ? edge === selection.currentOpenEdge
                      ? 'bg-accent/20 border-accent hover:bg-accent/30'
                      : 'bg-background/50 border-foreground/20 hover:border-accent hover:bg-accent/10'
                    : 'bg-background/30 border-foreground/10 opacity-50 cursor-not-allowed'
                }`}
              >
                <span className="font-medium text-foreground">
                  {EDGE_NAMES[edge]}
                </span>
                {edge === selection.currentOpenEdge && (
                  <span className="text-xs text-accent">(현재)</span>
                )}
              </button>
            ))}
          </div>

          {!canAfford && (
            <p className="mt-4 text-sm text-red-400 text-center">
              현금이 부족합니다
            </p>
          )}

          {/* 취소 버튼 */}
          <button
            onClick={hideRedirectSelection}
            className="w-full mt-4 py-2 rounded-lg text-sm text-foreground-secondary hover:bg-foreground/10 transition-colors"
          >
            취소
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
