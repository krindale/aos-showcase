'use client';

// 세로로 긴 맵(독일/세인트루시아)에서, 화물 이동·AI 철도 건설 동안 전체 맵을 우측에
// 작게(fit) 띄워 진행을 한눈에 보여주는 오버레이. 왼쪽 메인 지도는 그대로 두고 우측
// 컨트롤 패널 영역만 살짝 가린다. 실제 진행/완료는 메인 GameBoard·엔진이 담당, 여기선 표시만.

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '@/store/gameStore';
import { getMapData } from '@/utils/mapRegistry';
import { calculateBoardDimensions } from '@/utils/hexGrid';
import GameBoard from './GameBoard';

export default function MoveCubeOverlay() {
  const { movingCube, currentPhase, currentPlayer, players, mapId } = useGameStore(
    useShallow((s) => ({
      movingCube: s.ui.movingCube,
      currentPhase: s.currentPhase,
      currentPlayer: s.currentPlayer,
      players: s.players,
      mapId: s.mapId,
    }))
  );

  // 가로가 세로보다 넓은 맵(Rust Belt·서부미국 등)은 한눈에 들어와 오버레이가 불필요.
  // 세로로 긴 맵(독일/세인트루시아)에서만 띄운다.
  const isTallMap = useMemo(() => {
    const m = getMapData(mapId);
    const dims = calculateBoardDimensions(m.cols, m.rows, m.startCol, undefined, m.orientation === 'flat');
    return dims.height > dims.width;
  }, [mapId]);

  // 표시 조건: 화물 이동 중(사람·AI 모두) 또는 AI 차례의 철도 건설 중.
  // (사람 철도 건설은 메인 보드에서 직접 클릭하므로 우측 팝업이 컨트롤을 가리지 않게 제외)
  const isAITurn = players[currentPlayer]?.isAI ?? false;
  const showForMove = !!movingCube;
  const showForBuild = currentPhase === 'buildTrack' && isAITurn;
  const show = isTallMap && (showForMove || showForBuild);
  const label = showForMove ? '🚂 물품 이동 중…' : '🛤️ AI 철도 건설 중…';

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.2 }}
          className="fixed top-20 right-3 z-40 w-[clamp(280px,30vw,440px)] max-h-[82vh] rounded-2xl border border-accent/40 shadow-2xl overflow-hidden bg-background-secondary"
        >
          <div className="px-3 py-1.5 bg-accent/15 border-b border-accent/30 text-center">
            <span className="text-accent text-xs md:text-sm font-medium">{label}</span>
          </div>
          <GameBoard fitOverlay />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
