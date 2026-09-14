'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { NewCityTilesModal } from './NewCityTilesModal';

/**
 * 보드 HUD의 "신도시" 버튼 + 남은 신규 도시 타일 확인 모달(view 모드).
 * 열림 상태를 **여기서** 쥔다 — GameBoard의 useState였을 땐 버튼을 누를 때마다 보드 SVG 전체가
 * 리렌더됐다(2026-09-14 깜빡임 조사). 모달은 body 포털이라 HUD 레이어(z-30) 안에서 렌더해도
 * 바텀시트(z-40) 아래에 깔리지 않는다.
 */
export default function NewCityInfoButton() {
  const [open, setOpen] = useState(false);
  const newCityTiles = useGameStore((s) => s.newCityTiles);
  const mapId = useGameStore((s) => s.mapId);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="pointer-events-auto glass-card flex items-center gap-1.5 px-3 py-2 rounded-lg shadow-lg text-sm font-medium text-foreground hover:bg-accent/20 transition-colors"
        title="남은 신규 도시 타일 확인"
        aria-label="남은 신규 도시 타일 확인"
      >
        <Building2 className="w-4 h-4 text-accent" />
        신도시
      </button>
      <NewCityTilesModal
        open={open}
        tiles={newCityTiles}
        mapId={mapId}
        mode="view"
        onClose={() => setOpen(false)}
      />
    </>
  );
}
