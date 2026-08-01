'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2 } from 'lucide-react';
import { NewCityTileHex } from './NewCityTileHex';
import { NewCityTile } from '@/types/game';

/**
 * 신규 도시 타일 모달 (화면 중앙) — 두 용도를 하나로 통일.
 * - mode="view":   신도시 버튼 → 남은 타일 확인 전용 (클릭 없음)
 * - mode="select": 도시화 시작 → 타일 선택(클릭) 후 마을 배치
 */
export function NewCityTilesModal({
  open,
  tiles,
  mapId,
  mode,
  selectedTileId,
  onSelect,
  onClose,
}: {
  open: boolean;
  tiles: NewCityTile[];
  mapId: string;
  mode: 'view' | 'select';
  selectedTileId?: string | null;
  /** select 모드에서 타일 클릭 시 */
  onSelect?: (id: string) => void;
  onClose: () => void;
}) {
  // view = 남은 타일만, select = 전체(사용된 건 비활성)
  const shown = mode === 'view' ? tiles.filter((t) => !t.used) : tiles;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-xl rounded-2xl border border-foreground/10 bg-background-secondary p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-accent" />
                <h3 className="text-base font-bold text-foreground">
                  {mode === 'select' ? '신규 도시 선택' : '남은 신규 도시'}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-foreground-secondary transition-colors hover:bg-foreground/10"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mb-4 text-xs text-foreground-secondary">
              {mode === 'select'
                ? '타일을 선택한 뒤, 맵에서 파란 테두리의 마을을 클릭해 배치하세요.'
                : '아직 배치되지 않은 신규 도시 타일입니다.'}
              {shown.some((t) => !t.used && t.setupCube) &&
                ' 타일 위 화물은 도시화 시 신규 도시에 함께 배치됩니다.'}
            </p>

            {/* 타일 그리드 */}
            {shown.length > 0 ? (
              <div className="grid grid-cols-4 gap-x-6 gap-y-6">
                {shown.map((tile) => {
                  const isSelected = selectedTileId === tile.id;
                  const isUsed = tile.used;
                  const inner = (
                    <>
                      {/* Montréal: 셋업 화물(setupCube)은 실제 도시 위 화물과 동일하게 헥스에 올려 렌더.
                          크기 118 = 보드 헥스 1:1 (viewBox 폭) — 화물이 실제 크기로 보인다. */}
                      <NewCityTileHex
                        colorKey={tile.color}
                        id={tile.id}
                        mapId={mapId}
                        size={118}
                        cube={!isUsed ? tile.setupCube : undefined}
                      />
                      {isUsed && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60">
                          <X size={28} className="text-foreground/50" />
                        </div>
                      )}
                    </>
                  );

                  if (mode === 'select') {
                    return (
                      <button
                        key={tile.id}
                        onClick={() => !isUsed && onSelect?.(tile.id)}
                        disabled={isUsed}
                        className={`relative flex items-center justify-center rounded-xl p-1 transition-[background-color,opacity,box-shadow] ${
                          isUsed
                            ? 'cursor-not-allowed opacity-50'
                            : isSelected
                            ? 'ring-2 ring-accent'
                            : 'hover:bg-foreground/5'
                        }`}
                      >
                        {inner}
                      </button>
                    );
                  }
                  return (
                    <div key={tile.id} className="relative flex items-center justify-center p-1">
                      {inner}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-foreground-secondary">
                남은 신규 도시 타일이 없습니다
              </div>
            )}

            {/* 하단 버튼 */}
            <button
              onClick={onClose}
              className="mt-5 w-full rounded-lg py-2.5 text-sm font-medium text-foreground-secondary transition-colors hover:bg-foreground/10"
            >
              {mode === 'select' ? '취소' : '닫기'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
