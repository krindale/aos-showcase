'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useShallow } from 'zustand/react/shallow';
import { HEX_SIZE, hexToPixel } from '@/utils/hexGrid';
import { CUBE_COLORS, CubeColor, HexCoord, PLAYER_COLORS } from '@/types/game';
import { GAME_ACCENT, GAME_INK, GAME_PAPER, isRecentUndoLog } from './uiEffects';

/**
 * 보드 위 인플레이스 펄스 레이어 (표시 전용) — GameBoard의 줌 <g> 안에서 렌더된다.
 * - 건설 펄스: 게임 로그(트랙/복합/방향 전환/마을 가닥 건설)에서 좌표를 읽어
 *   그 자리에 소유자 색 링을 띄운다. 로그 기반이라 교체형 건설도 잡히고,
 *   실행 취소는 건설 로그가 없어 자연히 제외된다.
 * - 큐브 펄스: 도시/마을 큐브 수 증가 시 "+n" 배지 (성장·생산·도시화 보충 공통).
 *   신도시처럼 새로 등장한 id도 첫 관측에서 펄스, 실행 취소 복원은 억제.
 * 무거운 GameBoard 본체와 분리된 memo 자식이라 펄스 수명주기가
 * 전체 보드 리렌더를 유발하지 않는다.
 */

type Pulse = { x: number; y: number; color: string; k: string };
/** 큐브 유입 펄스 — 색상별 증가량을 세로 스택 배지로 표시 */
type CubePulse = { x: number; y: number; items: { color: CubeColor; n: number }[]; k: string };

const BUILD_LOG_RE = /^(트랙 건설|복합 트랙 건설|마을 가닥 건설|트랙 방향 전환)/;
const COORD_RE = /\((\d+),\s*(\d+)\)/;
const TTL_MS = 2600;

/** 배치 단위로 추가하고, 그 배치만 TTL 뒤 제거 (전체 배열 타이머 재시작 없음) */
function usePulseList<T extends { k: string }>(): [T[], (batch: T[]) => void, () => void] {
  const [pulses, setPulses] = useState<T[]>([]);
  const add = useCallback((batch: T[]) => {
    if (batch.length === 0) return;
    setPulses((p) => [...p, ...batch]);
    const keys = new Set(batch.map((b) => b.k));
    setTimeout(() => setPulses((p) => p.filter((x) => !keys.has(x.k))), TTL_MS);
  }, []);
  const clear = useCallback(() => setPulses([]), []);
  return [pulses, add, clear];
}

/** 확산 링 (건설/큐브 펄스 공용) */
function RingPulse({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <motion.circle
      cx={x}
      cy={y}
      fill="none"
      stroke={color}
      initial={{ r: HEX_SIZE * 0.55, opacity: 0.95, strokeWidth: 7 }}
      animate={{ r: HEX_SIZE * 1.6, opacity: 0, strokeWidth: 2 }}
      transition={{ duration: 1.1, ease: 'easeOut', repeat: 1 }}
    />
  );
}

function BoardPulsesInner({ isFlat }: { isFlat: boolean }) {
  const { logs, cities, towns } = useGameStore(
    useShallow((s) => ({ logs: s.logs, cities: s.board.cities, towns: s.board.towns }))
  );
  const [buildPulses, addBuild, clearBuild] = usePulseList<Pulse>();
  const [cubePulses, addCube, clearCube] = usePulseList<CubePulse>();
  const seenLogsRef = useRef(logs.length); // 마운트 시점 이전 로그는 재생하지 않음
  const cubeCountsRef = useRef<Record<string, Partial<Record<CubeColor, number>>> | null>(null);

  // 건설 이벤트 → 로그 기반 펄스
  useEffect(() => {
    if (logs.length < seenLogsRef.current) {
      // 새 게임(로그 리셋)
      seenLogsRef.current = logs.length;
      clearBuild();
      clearCube();
      return;
    }
    const start = seenLogsRef.current;
    const fresh = logs.slice(start);
    seenLogsRef.current = logs.length;
    if (fresh.length === 0) return;

    // 실행 취소 → 되돌린 타일 위에 링이 남지 않게 표시 중인 펄스 제거
    if (fresh.some((l) => l.action.startsWith('↩'))) {
      clearBuild();
      clearCube();
    }

    const players = useGameStore.getState().players;
    const batch: Pulse[] = [];
    fresh.forEach((log, i) => {
      if (!BUILD_LOG_RE.test(log.action)) return;
      const m = log.action.match(COORD_RE);
      if (!m) return;
      const { x, y } = hexToPixel(Number(m[1]), Number(m[2]), undefined, undefined, undefined, isFlat);
      batch.push({
        x,
        y,
        color: PLAYER_COLORS[players[log.player]?.color] ?? GAME_ACCENT,
        k: `b-${start + i}`,
      });
    });
    addBuild(batch);
  }, [logs, isFlat, addBuild, clearBuild, clearCube]);

  // 큐브 유입 → 색상별 "+n" 세로 스택 펄스
  useEffect(() => {
    const first = cubeCountsRef.current === null;
    const undoNow = isRecentUndoLog(useGameStore.getState().logs);
    const counts: Record<string, Partial<Record<CubeColor, number>>> = {};
    const batch: CubePulse[] = [];
    const collect = (id: string, coord: HexCoord, cubes: CubeColor[]) => {
      const colorCounts: Partial<Record<CubeColor, number>> = {};
      cubes.forEach((c) => {
        colorCounts[c] = (colorCounts[c] ?? 0) + 1;
      });
      counts[id] = colorCounts;
      if (first) return;
      const prev = cubeCountsRef.current![id] ?? {}; // 새 id(도시화 신도시)는 빈 맵 → 보충분 펄스
      const items: { color: CubeColor; n: number }[] = [];
      (Object.keys(colorCounts) as CubeColor[]).forEach((color) => {
        const gained = (colorCounts[color] ?? 0) - (prev[color] ?? 0);
        if (gained > 0) items.push({ color, n: gained });
      });
      if (items.length > 0 && !undoNow) {
        const { x, y } = hexToPixel(coord.col, coord.row, undefined, undefined, undefined, isFlat);
        batch.push({ x, y, items, k: `c-${id}-${Date.now()}` });
      }
    };
    cities.forEach((c) => collect(`city:${c.id}`, c.coord, c.cubes));
    towns.forEach((t) => collect(`town:${t.id}`, t.coord, t.cubes));
    cubeCountsRef.current = counts;
    addCube(batch);
  }, [cities, towns, isFlat, addCube]);

  return (
    <g style={{ pointerEvents: 'none' }}>
      {buildPulses.map((p) => (
        <g key={p.k}>
          <RingPulse x={p.x} y={p.y} color={p.color} />
          <motion.circle
            cx={p.x}
            cy={p.y}
            r={HEX_SIZE * 0.55}
            fill={p.color}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </g>
      ))}
      {cubePulses.map((p) => (
        <g key={p.k}>
          {/* 색상별 "+" + 실제 화물 큐브 — 검은 +기호 뒤에 늘어난 개수만큼 큐브색 사각형,
              세로 스택으로 살짝 떠오르며 사라짐 (텍스트 +n 대신 실물 큐브 표현) */}
          {p.items.map((item, i) => {
            const cubeSize = 11;
            const gap = 3;
            const plusW = 12;
            const rowW = plusW + item.n * (cubeSize + gap) - gap;
            const startX = p.x - rowW / 2;
            // 기존 +n 텍스트와 동일한 모션 패턴(요소별 x/y 모션 값) — motion.g transform은
            // SVG에서 미동작해 안 보였음. 텍스트 baseline 기준이라 rect는 -12로 광학 정렬.
            const yFrom = p.y - HEX_SIZE * 0.9 - i * 20;
            const yTo = p.y - HEX_SIZE * 1.15 - i * 20;
            const rowTransition = { duration: 2.0, times: [0, 0.15, 0.75, 1], delay: i * 0.15, ease: 'easeOut' as const };
            return (
              <g key={item.color}>
                <motion.text
                  x={startX}
                  textAnchor="start"
                  fill={GAME_INK}
                  stroke={GAME_PAPER}
                  strokeWidth={3.5}
                  strokeLinejoin="round"
                  style={{ paintOrder: 'stroke' }}
                  fontSize={17}
                  fontWeight={800}
                  fontFamily="system-ui, sans-serif"
                  initial={{ opacity: 0, y: yFrom }}
                  animate={{ opacity: [0, 1, 1, 0], y: yTo }}
                  transition={rowTransition}
                >
                  +
                </motion.text>
                {Array.from({ length: item.n }).map((_, j) => (
                  <motion.rect
                    key={j}
                    x={startX + plusW + j * (cubeSize + gap)}
                    width={cubeSize}
                    height={cubeSize}
                    rx={2}
                    fill={CUBE_COLORS[item.color]}
                    stroke={GAME_PAPER}
                    strokeWidth={1.5}
                    initial={{ opacity: 0, y: yFrom - 12 }}
                    animate={{ opacity: [0, 1, 1, 0], y: yTo - 12 }}
                    transition={rowTransition}
                  />
                ))}
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}

/** memo — 부모(GameBoard)의 잦은 리렌더에서 분리. isFlat만 prop이라 사실상 자체 구독으로만 갱신 */
const BoardPulses = memo(BoardPulsesInner);
export default BoardPulses;
