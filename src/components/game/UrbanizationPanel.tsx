'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { CITY_COLORS, NewCityTileId } from '@/types/game';
import { X, Building2 } from 'lucide-react';
import { NewCityTilesModal } from './NewCityTilesModal';

export default function UrbanizationPanel() {
  const {
    ui,
    newCityTiles,
    players,
    currentPlayer,
    currentPhase,
    mapId,
    selectNewCityTile,
    exitUrbanizationMode,
  } = useGameStore();

  const player = players[currentPlayer];

  // Urbanization 행동을 선택한 플레이어인지 확인
  const hasUrbanization = player.selectedAction === 'urbanization';

  // 트랙 건설 단계가 아니거나 도시화 행동이 없으면 렌더링하지 않음
  if (currentPhase !== 'buildTrack' || !hasUrbanization) {
    return null;
  }

  // 사용 가능한 타일 목록
  const availableTiles = newCityTiles.filter(tile => !tile.used);

  // 도시화 모드가 아니면 버튼만 표시
  if (!ui.urbanizationMode) {
    return (
      <div className="glass-card p-4 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-accent" />
            <h3 className="text-sm font-semibold text-foreground">도시화</h3>
          </div>
          <span className="text-xs text-foreground-secondary">
            {availableTiles.length}개 타일 남음
          </span>
        </div>
        <p className="text-xs text-foreground-secondary mb-3">
          트랙 건설 전에 마을에 신규 도시를 배치할 수 있습니다.
        </p>
        <button
          onClick={() => useGameStore.getState().enterUrbanizationMode()}
          disabled={availableTiles.length === 0}
          className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
            availableTiles.length > 0
              ? 'btn-primary'
              : 'bg-foreground/10 text-foreground-secondary cursor-not-allowed'
          }`}
        >
          도시화 시작
        </button>
      </div>
    );
  }

  // 타일 선택 완료: 전체 화면 모달을 접고 보드 클릭을 막지 않는 플로팅 배너로 전환
  // (모달을 띄운 채로는 마을 클릭이 모달 배경에 먹혀 도시화가 취소되는 문제)
  if (ui.selectedNewCityTile) {
    const selectedTile = newCityTiles.find(t => t.id === ui.selectedNewCityTile);
    return (
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-20 left-1/2 -translate-x-1/2 z-40 glass-card rounded-xl px-4 py-3 flex items-center gap-3 shadow-xl border border-accent/30"
      >
        {selectedTile && (
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: CITY_COLORS[selectedTile.color] }}
          >
            <span className="text-white font-bold">{selectedTile.id}</span>
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">
            {ui.selectedNewCityTile} 타일 선택됨
          </div>
          <div className="text-xs text-foreground-secondary">
            파란 테두리의 마을을 클릭해 배치하세요
          </div>
        </div>
        <button
          onClick={() => useGameStore.getState().enterUrbanizationMode()}
          className="text-xs px-2 py-1 rounded-lg text-foreground-secondary hover:bg-foreground/10 transition-colors shrink-0"
        >
          다시 선택
        </button>
        <button
          onClick={exitUrbanizationMode}
          className="p-1 rounded hover:bg-foreground/10 transition-colors shrink-0"
        >
          <X size={16} className="text-foreground-secondary" />
        </button>
      </motion.div>
    );
  }

  // 도시화 모드: 타일 선택 (신도시 확인 모달과 동일한 공통 NewCityTilesModal 재사용)
  return (
    <NewCityTilesModal
      open={ui.urbanizationMode}
      tiles={newCityTiles}
      mapId={mapId}
      mode="select"
      selectedTileId={ui.selectedNewCityTile}
      onSelect={(id) => selectNewCityTile(id as NewCityTileId)}
      onClose={exitUrbanizationMode}
    />
  );
}
