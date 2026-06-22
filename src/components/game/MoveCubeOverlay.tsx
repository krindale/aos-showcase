'use client';

// 화물 이동 애니메이션 동안, 전체 맵을 화면에 꽉 차게(fit) 보여주는 오버레이.
// 큰 맵(독일/Rust Belt)은 한눈에 안 들어와 화물이 어디로 가는지 보기 어렵다 →
// 이동 중(ui.movingCube)에만 잠깐 전체 맵을 축소해 띄워 이동 경로를 크게 보여준다.
// 실제 애니메이션 완료(completeCubeMove)는 메인 GameBoard가 담당하고, 여기선 표시만 한다.

import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import GameBoard from './GameBoard';

export default function MoveCubeOverlay() {
  const movingCube = useGameStore((s) => s.ui.movingCube);

  return (
    <AnimatePresence>
      {movingCube && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-6 md:p-12"
        >
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-accent/20 border border-accent/40">
            <span className="text-accent text-xs md:text-sm font-medium">🚂 물품 이동 중…</span>
          </div>
          <GameBoard fitOverlay />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
