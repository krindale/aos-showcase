'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { CUBE_COLORS, CubeColor, GOODS_DISPLAY_CONFIG, GoodsColumnId } from '@/types/game';
import { TUTORIAL_COLUMN_MAPPING, TUTORIAL_CITIES } from '@/utils/tutorialMap';
import { Package, Plus } from 'lucide-react';

// 열 정보 조회 헬퍼 함수
function getColumnInfo(columnId: GoodsColumnId): { label: string; cityName: string; isNewCity: boolean } {
  const mapping = TUTORIAL_COLUMN_MAPPING.find(m => m.columnId === columnId);
  if (!mapping) {
    return { label: columnId, cityName: '?', isNewCity: false };
  }

  // 기존 도시인 경우 도시 이름 조회
  if (!mapping.isNewCity) {
    const city = TUTORIAL_CITIES.find(c => c.id === mapping.cityId);
    return {
      label: columnId,
      cityName: city?.name || mapping.cityId,
      isNewCity: false,
    };
  }

  // 신규 도시인 경우
  return {
    label: columnId,
    cityName: `New City ${columnId}`,
    isNewCity: true,
  };
}

// 큐브 렌더링 컴포넌트
function CubeSlot({
  color,
  globalIndex,
  columnIndex,
  rowIndex,
  isProductionMode,
  isSelected,
  selectionOrder,
  previewColor,
  onSelect,
}: {
  color: CubeColor | null;
  globalIndex: number;
  columnIndex: number;
  rowIndex: number;
  isProductionMode: boolean;
  isSelected: boolean;
  selectionOrder: number;
  previewColor: CubeColor | null;
  onSelect: () => void;
}) {
  const isEmpty = color === null;
  const isClickable = isProductionMode && isEmpty;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: globalIndex * 0.01 }}
      onClick={() => isClickable && onSelect()}
      className={`
        w-6 h-6 rounded-sm border relative
        flex items-center justify-center
        ${color
          ? 'border-transparent shadow-md'
          : isSelected
          ? 'border-accent border-2 bg-accent/20'
          : isClickable
          ? 'border-accent/50 border-dashed bg-accent/10 cursor-pointer hover:border-accent hover:bg-accent/20 transition-colors'
          : 'border-foreground/20 border-dashed bg-background/30'
        }
      `}
      style={color ? { backgroundColor: CUBE_COLORS[color] } : undefined}
      title={color
        ? `${color} 큐브 (열 ${GOODS_DISPLAY_CONFIG.COLUMNS[columnIndex]}, ${rowIndex + 1}번)`
        : isSelected
        ? `선택됨 (${selectionOrder + 1}번)`
        : `빈 칸`
      }
    >
      {/* Production 모드에서 선택 가능 표시 */}
      {isClickable && !isSelected && (
        <Plus size={12} className="text-accent/70" />
      )}

      {/* 선택된 슬롯 - 미리보기 큐브 표시 */}
      {isSelected && previewColor && (
        <div
          className="w-4 h-4 rounded-sm border border-white/50 animate-pulse"
          style={{ backgroundColor: CUBE_COLORS[previewColor] }}
        />
      )}

      {/* 선택 순서 표시 */}
      {isSelected && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-accent rounded-full flex items-center justify-center">
          <span className="text-[9px] font-bold text-background">{selectionOrder + 1}</span>
        </div>
      )}
    </motion.div>
  );
}

// 열 헤더 컴포넌트
function ColumnHeader({
  columnId,
  isNewCity
}: {
  columnId: GoodsColumnId;
  isNewCity: boolean;
}) {
  const info = getColumnInfo(columnId);

  return (
    <div className={`
      text-center pb-1 border-b mb-2
      ${isNewCity
        ? 'border-accent/30 text-accent'
        : 'border-foreground/20 text-foreground-secondary'
      }
    `}>
      <div className={`
        text-sm font-bold
        ${isNewCity ? 'text-accent' : 'text-foreground'}
      `}>
        {info.label}
      </div>
      <div className="text-[10px] truncate" title={info.cityName}>
        {info.cityName}
      </div>
    </div>
  );
}

export default function GoodsDisplayPanel() {
  const { goodsDisplay, ui, selectProductionSlot } = useGameStore();

  const isProductionMode = ui.productionMode;
  const selectedSlots = ui.selectedProductionSlots;
  const productionCubes = ui.productionCubes;

  // 슬롯을 열별로 분할
  const getColumnSlots = (columnIndex: number): (CubeColor | null)[] => {
    const rowCount = GOODS_DISPLAY_CONFIG.ROWS_PER_COLUMN[columnIndex];
    let startIndex = 0;

    for (let i = 0; i < columnIndex; i++) {
      startIndex += GOODS_DISPLAY_CONFIG.ROWS_PER_COLUMN[i];
    }

    return goodsDisplay.slots.slice(startIndex, startIndex + rowCount);
  };

  // 열의 시작 인덱스 계산
  const getColumnStartIndex = (columnIndex: number): number => {
    let startIndex = 0;
    for (let i = 0; i < columnIndex; i++) {
      startIndex += GOODS_DISPLAY_CONFIG.ROWS_PER_COLUMN[i];
    }
    return startIndex;
  };

  // 남은 큐브 수 계산
  const remainingCubes = goodsDisplay.slots.filter(s => s !== null).length;
  const bagCubes = goodsDisplay.bag.length;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-xl border border-foreground/20 bg-background-secondary overflow-hidden"
    >
      {/* 헤더 */}
      <div className="px-4 py-2 bg-background-tertiary border-b border-foreground/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-accent" />
          <h3 className="font-semibold text-foreground text-sm">물품 디스플레이</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-foreground-secondary">
          <span>디스플레이: {remainingCubes}/52</span>
          <span>주머니: {bagCubes}</span>
        </div>
      </div>

      {/* 물품 그리드 */}
      <div className="p-3">
        <div className="flex gap-1">
          {GOODS_DISPLAY_CONFIG.COLUMNS.map((columnId, columnIndex) => {
            const slots = getColumnSlots(columnIndex);
            const isNewCity = columnIndex >= 6; // A, B, C, D는 신규 도시

            return (
              <div
                key={columnId}
                className={`
                  flex flex-col
                  ${isNewCity ? 'bg-accent/5 rounded p-1' : 'p-1'}
                `}
              >
                <ColumnHeader columnId={columnId} isNewCity={isNewCity} />

                {/* 큐브 슬롯들 (위에서 아래로) */}
                <div className="flex flex-col gap-1">
                  {slots.map((color, rowIndex) => {
                    const startIndex = getColumnStartIndex(columnIndex);
                    const globalIndex = startIndex + rowIndex;
                    const isSelected = selectedSlots.includes(globalIndex);
                    const selectionOrder = selectedSlots.indexOf(globalIndex);
                    const previewColor = isSelected ? productionCubes[selectionOrder] : null;

                    return (
                      <CubeSlot
                        key={`${columnId}-${rowIndex}`}
                        color={color}
                        globalIndex={globalIndex}
                        columnIndex={columnIndex}
                        rowIndex={rowIndex}
                        isProductionMode={isProductionMode}
                        isSelected={isSelected}
                        selectionOrder={selectionOrder}
                        previewColor={previewColor}
                        onSelect={() => selectProductionSlot(globalIndex)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 범례 */}
      <div className="px-4 py-2 bg-background-tertiary border-t border-foreground/10">
        <div className="flex flex-wrap gap-2 text-[10px]">
          {Object.entries(CUBE_COLORS).map(([color, hex]) => (
            <div key={color} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: hex }}
              />
              <span className="text-foreground-secondary capitalize">{color}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
