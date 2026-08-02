'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { CITY_COLORS, NewCityTileId } from '@/types/game';
import { X, Building2 } from 'lucide-react';
import { NewCityTilesModal } from './NewCityTilesModal';

/**
 * 도시화 UI. **두 변형으로 나뉜다** — 화면 전체를 덮어야 하는 부분(타일 선택 모달·배치 안내
 * 배너)이 우측 패널/모바일 바텀시트 **안에서** 렌더되면 안 되기 때문이다:
 * 그 조상들이 transform(framer-motion)·contain을 걸고 있어 `position: fixed`의 기준이
 * 뷰포트가 아니라 그 패널 박스가 되고, overflow까지 걸려 패널 안에 갇힌다.
 * - `variant="panel"`  : "도시화 시작" 카드 (우측 패널/바텀시트 안에서 렌더)
 * - `variant="overlay"`: 타일 선택 모달 + 배치 안내 배너 (GamePageClient 최상위에서 1회 렌더)
 */
export default function UrbanizationPanel({
  variant = 'panel',
}: {
  variant?: 'panel' | 'overlay';
} = {}) {
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

  // 도시화 모드가 아니면 버튼만 표시 (패널 안 카드 — 오버레이 변형은 이 상태에서 할 일이 없다)
  if (!ui.urbanizationMode) {
    if (variant === 'overlay') return null;
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

  // 여기부터는 화면 전체 기준으로 떠야 하는 fixed 영역 — 패널 변형은 렌더하지 않는다
  // (패널 안에서 렌더하면 조상의 transform 때문에 패널 박스 안에 갇힌다)
  if (variant === 'panel') return null;

  // 타일 선택 완료: 전체 화면 모달을 접고 보드 클릭을 막지 않는 플로팅 배너로 전환
  // (모달을 띄운 채로는 마을 클릭이 모달 배경에 먹혀 도시화가 취소되는 문제)
  if (ui.selectedNewCityTile) {
    const selectedTile = newCityTiles.find(t => t.id === ui.selectedNewCityTile);
    return (
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        // ⚠️ `left-1/2 -translate-x-1/2`로 가운데 정렬하면 안 된다 — translate는 그린 뒤의
        // 시각 이동이라 레이아웃 폭에는 영향이 없어서, shrink-to-fit 폭의 상한이
        // "뷰포트 − left" = 화면의 절반으로 묶인다. 좁은 모바일(400px)에서는 그 절반 안에
        // 아바타+텍스트+버튼 2개가 들어가느라 안내 문구가 **한 글자씩 세로로** 쪼개졌다.
        // inset-x + mx-auto + w-fit이면 가용 폭은 화면 전체(여백 제외)이면서 가운데 정렬된다.
        className="fixed top-20 inset-x-3 z-40 mx-auto w-fit max-w-[calc(100vw-1.5rem)] glass-card rounded-xl px-3 py-2.5 md:px-4 md:py-3 flex items-center gap-2 md:gap-3 shadow-xl border border-accent/30"
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
