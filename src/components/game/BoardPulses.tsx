'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useShallow } from 'zustand/react/shallow';
import { HEX_SIZE, hexToPixel } from '@/utils/hexGrid';
import { CITY_COLORS, CUBE_COLORS, CubeColor, HexCoord, PLAYER_COLORS } from '@/types/game';
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
/** 수송 정산 수익 펄스 — 도착 도시 위에 "플레이어 디스크 이름 +n" 세로 스택 */
type IncomePulse = { x: number; y: number; rows: { name: string; color: string; amount: number }[]; k: string };
/** 신도시 배치 펄스 — 배치 헥스 위 도시색 확산 링 + "신도시!" 라벨 (placeNewCity의 newCityEvent) */
type NewCityPulse = { x: number; y: number; cityColor: string; playerName: string; playerColor: string; tileId: string; k: string };

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

/**
 * 떠오르는 스택(큐브 유입·수익)의 방향 — 기본은 위(-1)지만, 헥스 위쪽에 스택이 들어갈
 * 공간이 없으면(가장자리 도시) 아래(+1)로 뒤집어 viewBox에 잘리지 않게 한다.
 * viewBox는 콘텐츠에 자동으로 맞춰져 여백이 30뿐이므로, 스택이 위로 100px 넘게
 * 올라가는 경우(2줄 이상) 가장자리에서 반드시 잘린다.
 */
function stackDir(y: number, rows: number, viewTop: number): 1 | -1 {
  const needed = HEX_SIZE * 1.15 + (rows - 1) * 20 + 20; // 최상단 행 + 글자 높이 여유
  return y - needed < viewTop ? 1 : -1;
}

function BoardPulsesInner({ isFlat, viewTop }: { isFlat: boolean; viewTop: number }) {
  const { logs, cities, towns, deliveryEvent, newCityEvent } = useGameStore(
    useShallow((s) => ({ logs: s.logs, cities: s.board.cities, towns: s.board.towns, deliveryEvent: s.deliveryIncomeEvent, newCityEvent: s.newCityEvent }))
  );
  const [buildPulses, addBuild, clearBuild] = usePulseList<Pulse>();
  const [cubePulses, addCube, clearCube] = usePulseList<CubePulse>();
  const [incomePulses, addIncome] = usePulseList<IncomePulse>();
  const [newCityPulses, addNewCity] = usePulseList<NewCityPulse>();
  const seenLogsRef = useRef(logs.length); // 마운트 시점 이전 로그는 재생하지 않음
  const cubeCountsRef = useRef<Record<string, Partial<Record<CubeColor, number>>> | null>(null);
  // undefined = 미관측(마운트 직후) — 첫 관측은 기록만 하고 재생하지 않음 (rehydrate/스냅샷 재적용 중복 방지)
  const incomeKeyRef = useRef<number | null | undefined>(undefined);
  const newCityKeyRef = useRef<string | null | undefined>(undefined);

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

  // 수송 정산 → 도착 도시 위 "누가 수입 +몇" 펄스 (completeCubeMove가 남긴 deliveryIncomeEvent)
  useEffect(() => {
    const first = incomeKeyRef.current === undefined;
    const prevKey = incomeKeyRef.current;
    incomeKeyRef.current = deliveryEvent?.key ?? null;
    if (first || !deliveryEvent || deliveryEvent.key === prevKey) return;
    if (isRecentUndoLog(useGameStore.getState().logs)) return; // 실행 취소 복원은 재생하지 않음
    const players = useGameStore.getState().players;
    const { x, y } = hexToPixel(deliveryEvent.dest.col, deliveryEvent.dest.row, undefined, undefined, undefined, isFlat);
    addIncome([{
      x,
      y,
      k: `i-${deliveryEvent.key}`,
      rows: deliveryEvent.gains.map((g) => ({
        name: players[g.player]?.name ?? g.player,
        color: PLAYER_COLORS[players[g.player]?.color] ?? GAME_ACCENT,
        amount: g.amount,
      })),
    }]);
  }, [deliveryEvent, isFlat, addIncome]);

  // 신도시 배치 → 배치 헥스 위 도시색 확산 링 + "신도시!" 라벨 (deliveryIncomeEvent와 동일 가드)
  useEffect(() => {
    const first = newCityKeyRef.current === undefined;
    const prevKey = newCityKeyRef.current;
    newCityKeyRef.current = newCityEvent?.key ?? null;
    if (first || !newCityEvent || newCityEvent.key === prevKey) return;
    if (isRecentUndoLog(useGameStore.getState().logs)) return; // 실행 취소 복원은 재생하지 않음
    const players = useGameStore.getState().players;
    const placer = players[newCityEvent.player];
    const { x, y } = hexToPixel(newCityEvent.coord.col, newCityEvent.coord.row, undefined, undefined, undefined, isFlat);
    addNewCity([{
      x,
      y,
      cityColor: CITY_COLORS[newCityEvent.color] ?? GAME_ACCENT,
      playerName: placer?.name ?? newCityEvent.player,
      playerColor: PLAYER_COLORS[placer?.color] ?? GAME_ACCENT,
      tileId: newCityEvent.tileId,
      k: `nc-${newCityEvent.key}`,
    }]);
  }, [newCityEvent, isFlat, addNewCity]);

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
            const dir = stackDir(p.y, p.items.length, viewTop);
            const yFrom = p.y + dir * (HEX_SIZE * 0.9 + i * 20);
            const yTo = p.y + dir * (HEX_SIZE * 1.15 + i * 20);
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
      {incomePulses.map((p) => (
        <g key={p.k}>
          {/* 플레이어별 "디스크 이름 +n" — 큐브 유입 펄스와 동일 모션(세로 스택, 떠오르며 사라짐).
              행 폭은 글자폭 근사(한글 ~13px/그외 ~8px)로 중앙 정렬 — 오차는 광학상 무해 */}
          {p.rows.map((row, i) => {
            const label = `${row.name} +${row.amount}`;
            const textW = Array.from(label).reduce((w, ch) => w + (ch.charCodeAt(0) > 0x7f ? 13 : 8), 0);
            const disc = 12;
            const gap = 5;
            const rowW = disc + gap + textW;
            const startX = p.x - rowW / 2;
            const dir = stackDir(p.y, p.rows.length, viewTop);
            const yFrom = p.y + dir * (HEX_SIZE * 0.9 + i * 20);
            const yTo = p.y + dir * (HEX_SIZE * 1.15 + i * 20);
            const rowTransition = { duration: 2.0, times: [0, 0.15, 0.75, 1], delay: i * 0.15, ease: 'easeOut' as const };
            return (
              <g key={row.name + i}>
                {/* 소유자 색 디스크 — motion.g transform은 SVG 미동작이라 rect(rx=반지름)로 원 표현,
                    텍스트 baseline 기준 광학 정렬(-11) */}
                <motion.rect
                  x={startX}
                  width={disc}
                  height={disc}
                  rx={disc / 2}
                  fill={row.color}
                  stroke={GAME_PAPER}
                  strokeWidth={1.5}
                  initial={{ opacity: 0, y: yFrom - 11 }}
                  animate={{ opacity: [0, 1, 1, 0], y: yTo - 11 }}
                  transition={rowTransition}
                />
                <motion.text
                  x={startX + disc + gap}
                  textAnchor="start"
                  fill={GAME_INK}
                  stroke={GAME_PAPER}
                  strokeWidth={3.5}
                  strokeLinejoin="round"
                  style={{ paintOrder: 'stroke' }}
                  fontSize={14}
                  fontWeight={800}
                  fontFamily="system-ui, sans-serif"
                  initial={{ opacity: 0, y: yFrom }}
                  animate={{ opacity: [0, 1, 1, 0], y: yTo }}
                  transition={rowTransition}
                >
                  {label}
                </motion.text>
              </g>
            );
          })}
        </g>
      ))}
      {newCityPulses.map((p) => {
        // 라벨 2행: "🏙️ 신도시 X 건설!" / "배치자 이름" — 헥스 위(가장자리는 아래)로 떠오름
        const rows = [`\u{1F3D9}️ 신도시 ${p.tileId} 건설!`, p.playerName];
        const dir = stackDir(p.y, rows.length, viewTop);
        const rowTransition = { duration: 2.2, times: [0, 0.12, 0.8, 1] as number[], ease: 'easeOut' as const };
        return (
          <g key={p.k}>
            {/* 도시색 확산 링 2겹(교차 반복) — 건설 링보다 크고 오래가 한눈에 띈다 */}
            <motion.circle
              cx={p.x} cy={p.y} fill="none" stroke={p.cityColor}
              initial={{ r: HEX_SIZE * 0.6, opacity: 1, strokeWidth: 9 }}
              animate={{ r: HEX_SIZE * 2.2, opacity: 0, strokeWidth: 2 }}
              transition={{ duration: 1.2, ease: 'easeOut', repeat: 1 }}
            />
            <motion.circle
              cx={p.x} cy={p.y} fill="none" stroke={GAME_ACCENT}
              initial={{ r: HEX_SIZE * 0.6, opacity: 0.9, strokeWidth: 5 }}
              animate={{ r: HEX_SIZE * 1.7, opacity: 0, strokeWidth: 1.5 }}
              transition={{ duration: 1.2, ease: 'easeOut', repeat: 1, delay: 0.25 }}
            />
            <motion.circle
              cx={p.x} cy={p.y} r={HEX_SIZE * 0.6} fill={p.cityColor}
              initial={{ opacity: 0.45 }} animate={{ opacity: 0 }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
            />
            {rows.map((label, i) => {
              const yFrom = p.y + dir * (HEX_SIZE * 0.9 + i * 21);
              const yTo = p.y + dir * (HEX_SIZE * 1.2 + i * 21);
              return (
                <motion.text
                  key={i}
                  x={p.x}
                  textAnchor="middle"
                  fill={i === 0 ? GAME_INK : p.playerColor}
                  stroke={GAME_PAPER}
                  strokeWidth={3.5}
                  strokeLinejoin="round"
                  style={{ paintOrder: 'stroke' }}
                  fontSize={i === 0 ? 16 : 13}
                  fontWeight={800}
                  fontFamily="system-ui, sans-serif"
                  initial={{ opacity: 0, y: yFrom }}
                  animate={{ opacity: [0, 1, 1, 0], y: yTo }}
                  transition={{ ...rowTransition, delay: i * 0.15 }}
                >
                  {label}
                </motion.text>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/** memo — 부모(GameBoard)의 잦은 리렌더에서 분리. isFlat만 prop이라 사실상 자체 구독으로만 갱신 */
const BoardPulses = memo(BoardPulsesInner);
export default BoardPulses;
