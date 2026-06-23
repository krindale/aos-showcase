'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { CUBE_COLORS, CubeColor, GoodsColumnMapping } from '@/types/game';
import { getMapData } from '@/utils/mapRegistry';
import { Package, Plus } from 'lucide-react';

// 큐브 렌더링 컴포넌트
function CubeSlot({
  color,
  globalIndex,
  columnLabel,
  rowIndex,
  isProductionMode,
  isSelected,
  selectionOrder,
  previewColor,
  onSelect,
}: {
  color: CubeColor | null;
  globalIndex: number;
  columnLabel: string;
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
        ? `${color} 큐브 (열 ${columnLabel}, ${rowIndex + 1}번)`
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
  label,
  cityName,
  isNewCity,
}: {
  label: string;
  cityName: string;
  isNewCity: boolean;
}) {
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
        {label}
      </div>
      <div className="text-[10px] truncate" title={cityName}>
        {cityName}
      </div>
    </div>
  );
}

export default function GoodsDisplayPanel() {
  const { mapId, board, goodsDisplay, ui, selectProductionSlot } = useGameStore();

  const columns = getMapData(mapId).columnMapping;

  const isProductionMode = ui.productionMode;
  const selectedSlots = ui.selectedProductionSlots;
  const productionCubes = ui.productionCubes;

  // 열별 헤더 라벨: 주사위 열은 주사위 번호, 신규 도시 열은 columnId
  const columnLabel = (m: GoodsColumnMapping): string =>
    m.isNewCity ? m.columnId : String(m.diceNumber ?? m.columnId);

  // 열이 가리키는 도시 이름 (신규 도시 / 미사용 마을 열 처리)
  const columnCityName = (m: GoodsColumnMapping): string => {
    if (m.isNewCity) return `New City ${m.columnId}`;
    if (!m.cityId) return '—';
    return board.cities.find(c => c.id === m.cityId)?.name || m.cityId;
  };

  // 열의 시작 인덱스 계산 (앞 열들의 rowCount 누적)
  const startIndexOf = (columnIndex: number): number =>
    columns.slice(0, columnIndex).reduce((sum, m) => sum + m.rowCount, 0);

  // 남은 큐브 수 계산
  const totalSlots = goodsDisplay.slots.length;
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
          <span>디스플레이: {remainingCubes}/{totalSlots}</span>
          <span>주머니: {bagCubes}</span>
        </div>
      </div>

      {/* 물품 그리드 */}
      <div className="p-3 overflow-x-auto">
        <div className="flex gap-1 justify-center min-w-min">
          {columns.map((m, columnIndex) => {
            const startIndex = startIndexOf(columnIndex);
            const slots = goodsDisplay.slots.slice(startIndex, startIndex + m.rowCount);
            const label = columnLabel(m);

            return (
              <div
                key={m.columnId}
                className={`
                  flex flex-col
                  ${m.isNewCity ? 'bg-accent/5 rounded p-1' : 'p-1'}
                `}
              >
                <ColumnHeader label={label} cityName={columnCityName(m)} isNewCity={m.isNewCity} />

                {/* 큐브 슬롯들 (위에서 아래로) */}
                <div className="flex flex-col gap-1">
                  {slots.map((color, rowIndex) => {
                    const globalIndex = startIndex + rowIndex;
                    const isSelected = selectedSlots.includes(globalIndex);
                    const selectionOrder = selectedSlots.indexOf(globalIndex);
                    const previewColor = isSelected ? productionCubes[selectionOrder] : null;

                    return (
                      <CubeSlot
                        key={`${m.columnId}-${rowIndex}`}
                        color={color}
                        globalIndex={globalIndex}
                        columnLabel={label}
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
