'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { CITY_COLORS, NewCityTileId } from '@/types/game';
import { X, Building2, MapPin } from 'lucide-react';

export default function UrbanizationPanel() {
  const {
    ui,
    newCityTiles,
    players,
    currentPlayer,
    currentPhase,
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
          className={`w-full py-2 rounded-lg text-sm font-medium transition-all ${
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

  // 도시화 모드: 타일 선택 패널
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={exitUrbanizationMode}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-background-secondary rounded-xl border border-accent/30 p-6 max-w-lg w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 size={20} className="text-accent" />
              <h3 className="text-lg font-semibold text-foreground">
                신규 도시 타일 선택
              </h3>
            </div>
            <button
              onClick={exitUrbanizationMode}
              className="p-1 rounded hover:bg-foreground/10 transition-colors"
            >
              <X size={20} className="text-foreground-secondary" />
            </button>
          </div>

          {/* 설명 */}
          <p className="text-sm text-foreground-secondary mb-4">
            신규 도시 타일을 선택한 후, 맵에서 마을(흰색 디스크)을 클릭하세요.
          </p>

          {/* 타일 그리드 */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {newCityTiles.map((tile) => {
              const isSelected = ui.selectedNewCityTile === tile.id;
              const isUsed = tile.used;

              return (
                <button
                  key={tile.id}
                  onClick={() => !isUsed && selectNewCityTile(tile.id as NewCityTileId)}
                  disabled={isUsed}
                  className={`relative p-3 rounded-lg border-2 transition-all ${
                    isUsed
                      ? 'bg-background/30 border-foreground/10 opacity-40 cursor-not-allowed'
                      : isSelected
                      ? 'bg-accent/20 border-accent'
                      : 'bg-background/50 border-foreground/20 hover:border-accent/50 hover:bg-accent/10'
                  }`}
                >
                  {/* 도시 색상 원 */}
                  <div
                    className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center"
                    style={{ backgroundColor: CITY_COLORS[tile.color] }}
                  >
                    <span className="text-white font-bold text-lg">{tile.id}</span>
                  </div>

                  {/* 타일 색상 레이블 */}
                  <div className="text-xs text-center text-foreground-secondary capitalize">
                    {tile.color === 'black' ? '검정' :
                     tile.color === 'red' ? '빨강' :
                     tile.color === 'blue' ? '파랑' :
                     tile.color === 'yellow' ? '노랑' : '보라'}
                  </div>

                  {/* 사용됨 표시 */}
                  {isUsed && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <X size={32} className="text-foreground/50" />
                    </div>
                  )}

                  {/* 선택됨 표시 */}
                  {isSelected && !isUsed && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-accent rounded-full flex items-center justify-center">
                      <MapPin size={12} className="text-background" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* 선택된 타일 정보 */}
          {ui.selectedNewCityTile && (
            <div className="p-3 bg-accent/10 rounded-lg border border-accent/30 mb-4">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-accent" />
                <span className="text-sm text-foreground">
                  <span className="font-medium text-accent">{ui.selectedNewCityTile}</span> 타일 선택됨
                </span>
              </div>
              <p className="text-xs text-foreground-secondary mt-1">
                맵에서 배치할 마을을 클릭하세요.
              </p>
            </div>
          )}

          {/* 취소 버튼 */}
          <button
            onClick={exitUrbanizationMode}
            className="w-full py-2 rounded-lg text-sm text-foreground-secondary hover:bg-foreground/10 transition-colors"
          >
            취소
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
