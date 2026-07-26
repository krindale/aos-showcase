'use client';

// 모든 맵에서, 화물 이동·AI 철도 건설 동안 전체 맵을 우측에 작게(fit) 띄워 진행을
// 한눈에 보여주는 오버레이. 왼쪽 메인 지도는 그대로 두고 우측 컨트롤 패널 영역만 살짝
// 가린다. 실제 진행/완료는 메인 GameBoard·엔진이 담당, 여기선 표시만.

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '@/store/gameStore';
import { hexCoordsEqual } from '@/utils/hexGrid';
import { GameState, HexCoord } from '@/types/game';
import { safeTimeout } from '@/utils/safeTimers';
import { isRecentUndoLog } from './uiEffects';
import { useMyPlayerId } from '@/hooks/useMyPlayerId';
import GameBoard from './GameBoard';

/** 신도시 배치 팝업 유지 시간 — BoardPulses 신도시 펄스(~2.6초)를 다 보여주고 닫히게 */
const NEW_CITY_FLASH_MS = 3500;

export default function MoveCubeOverlay() {
  const { movingCube, urbanizationMode, newCityEvent, currentPhase, currentPlayer, players, cities, towns } = useGameStore(
    useShallow((s) => ({
      movingCube: s.ui.movingCube,
      urbanizationMode: s.ui.urbanizationMode,
      newCityEvent: s.newCityEvent,
      currentPhase: s.currentPhase,
      currentPlayer: s.currentPlayer,
      players: s.players,
      cities: s.board.cities,
      towns: s.board.towns,
    }))
  );

  // 신도시 배치 순간 잠시 미니맵을 띄우는 플래시 상태 — newCityEvent(스냅샷 동기화)의
  // key 변화를 관측해 전원(호스트·게스트, 사람·봇 배치 공통)이 같은 팝업을 본다.
  // "key 최초 관측 스킵" 가드로 새로고침 rehydrate/스냅샷 재적용 재생을 방지 (BoardPulses와 동일).
  const [newCityFlash, setNewCityFlash] = useState<NonNullable<GameState['newCityEvent']> | null>(null);
  const newCityKeyRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const first = newCityKeyRef.current === undefined;
    const prevKey = newCityKeyRef.current;
    newCityKeyRef.current = newCityEvent?.key ?? null;
    if (first || !newCityEvent || newCityEvent.key === prevKey) return;
    if (isRecentUndoLog(useGameStore.getState().logs)) return; // 실행 취소 복원은 재생하지 않음
    setNewCityFlash(newCityEvent);
  }, [newCityEvent]);
  // 숨김 타이머는 flash 상태 기준 별도 effect — 관측 effect의 cleanup으로 걸면 스냅샷마다
  // newCityEvent 참조가 바뀔 때(같은 key) 재실행 cleanup이 타이머만 취소하고 재예약은
  // 안 해서(같은 key 조기 return) 팝업이 영구히 남는 버그가 있었다 (실전 발견).
  useEffect(() => {
    if (!newCityFlash) return;
    return safeTimeout(() => setNewCityFlash(null), NEW_CITY_FLASH_MS);
  }, [newCityFlash]);

  // 표시 조건: 화물 이동 중(사람·AI 모두 — movingCube가 스냅샷에 실려 전원 동일), 철도 건설 관전
  // (봇 차례 + 온라인에서 다른 사람 차례 — 남의 건설 진행을 미니맵으로 봄), 사람 신도시 배치 중
  // (도시화 모드 — 어느 마을에 놓을지 전체 맵을 보며 고르게. AI 도시화는 buildTrack 조건에 포함),
  // 또는 신도시 배치 직후 플래시(전원 — 배치 위치의 펄스를 미니맵으로 보여줌).
  // (자기 자신의 철도 건설은 메인 보드에서 직접 클릭하므로 우측 팝업이 컨트롤을 가리지 않게 제외.
  //  오프라인 핫시트는 myPlayerId=null — 사람 차례는 항상 조작자 본인 화면이라 봇 차례만 표시)
  const myPlayerId = useMyPlayerId();
  const isAITurn = players[currentPlayer]?.isAI ?? false;
  const isOthersTurn = myPlayerId !== null && currentPlayer !== myPlayerId;
  const showForMove = !!movingCube;
  const showForBuild = currentPhase === 'buildTrack' && (isAITurn || isOthersTurn);
  const showForUrbanize = currentPhase === 'buildTrack' && urbanizationMode && !isAITurn;
  const show = showForMove || showForBuild || showForUrbanize || !!newCityFlash;

  // 화물 이동 경로 요약: "출발 → 도착 (N링크)". 정거장(도시/마을)만 세어 링크수 = 정거장-1.
  // path[0]=출발, path[last]=도착. 도시는 이름, 마을은 "마을"(도시화되면 "신도시"), 트랙 위 시작
  // (St.Lucia 트랙큐브)은 정거장이 아니라 "트랙".
  const stopLabel = (coord: HexCoord): string | null => {
    const city = cities.find((c) => hexCoordsEqual(c.coord, coord));
    if (city) return city.name;
    const town = towns.find((t) => hexCoordsEqual(t.coord, coord));
    if (town) return town.newCityColor ? '신도시' : '마을';
    return null; // 트랙 헥스 등 비-정거장
  };
  const path = movingCube?.path ?? [];
  const isStop = (coord: HexCoord) => stopLabel(coord) !== null;
  const stopCount = path.filter(isStop).length;
  const linkCount = Math.max(1, stopCount - 1);
  const fromLabel = path.length ? (stopLabel(path[0]) ?? '트랙') : '';
  const toLabel = path.length ? (stopLabel(path[path.length - 1]) ?? '') : '';
  const hasRoute = showForMove && !!fromLabel && !!toLabel;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-4 right-3 z-40 w-[clamp(280px,30vw,440px)] max-h-[70vh] rounded-2xl border border-accent/40 shadow-2xl overflow-hidden bg-background-secondary"
        >
          <div className="px-3 py-1.5 bg-accent/15 border-b border-accent/30 text-center">
            {hasRoute ? (
              <span className="text-accent text-xs md:text-sm font-medium">
                🚂 {fromLabel} <span className="opacity-60">→</span> {toLabel}{' '}
                <span className="opacity-70">({linkCount}링크)</span>
              </span>
            ) : (
              <span className="text-accent text-xs md:text-sm font-medium">
                {newCityFlash
                  ? `🏙️ ${players[newCityFlash.player]?.name ?? newCityFlash.player} — 신도시 ${newCityFlash.tileId} 건설!`
                  : showForMove
                  ? '🚂 물품 이동 중…'
                  : showForUrbanize
                  ? '🏙️ 신도시 배치 중 — 마을을 클릭하세요'
                  : isAITurn
                  ? '🛤️ BOT 철도 건설 중…'
                  : `🛤️ ${players[currentPlayer]?.name ?? ''} 철도 건설 중…`}
              </span>
            )}
          </div>
          <GameBoard fitOverlay />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
