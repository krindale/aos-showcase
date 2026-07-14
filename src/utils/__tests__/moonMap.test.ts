// 달 맵 데이터 무결성 테스트 — 전치 변환·랩 매핑·보드 구성 검증
import { describe, it, expect } from 'vitest';
import {
  MOON_MAP,
  MOON_CITIES,
  MOON_TOWNS,
  MOON_CITY_DICE,
  MOON_WRAP_EDGES,
  generateMoonHexTiles,
  getMoonSide,
} from '../moonMap';
import { getNeighborHex } from '../hexGrid';
import { HexCoord } from '@/types/game';

const key = (c: HexCoord) => `${c.col},${c.row}`;

// 보드 내부(lake 제외) 헥스 키 집합 (도시 헥스 포함)
function boardKeys(): Set<string> {
  const keys = new Set(
    generateMoonHexTiles()
      .filter((t) => t.terrain !== 'lake')
      .map((t) => key(t.coord))
  );
  for (const c of MOON_CITIES) keys.add(key(c.coord));
  return keys;
}

describe('달 맵 보드 구성', () => {
  it('보드 헥스 107개 (도시 7 포함), 산 28개', () => {
    const tiles = generateMoonHexTiles();
    const board = tiles.filter((t) => t.terrain !== 'lake');
    // 도시 7개는 hexTiles에서 제외되므로 100 + 7 = 107
    expect(board.length + MOON_CITIES.length).toBe(107);
    expect(board.filter((t) => t.terrain === 'mountain').length).toBe(28);
    // 크레이터(평지)는 전부 $3
    for (const t of board) {
      expect(t.fixedCost).toBe(t.terrain === 'mountain' ? 4 : 3);
    }
  });

  it('도시·마을 좌표가 보드 안이며 서로 겹치지 않는다', () => {
    const keys = boardKeys();
    const seen = new Set<string>();
    for (const c of [...MOON_CITIES.map((x) => x.coord), ...MOON_TOWNS.map((x) => x.coord)]) {
      expect(keys.has(key(c))).toBe(true);
      expect(seen.has(key(c))).toBe(false);
      seen.add(key(c));
    }
    // 그리드 범위
    expect(MOON_MAP.cols).toBe(10);
    expect(MOON_MAP.rows).toBe(16);
  });

  it('Moon Base는 무수요(noDemand) 중앙 도시, 나머지 6개 도시는 서/동 3:3', () => {
    const moonBase = MOON_CITIES.find((c) => c.id === 'moonBase')!;
    expect(moonBase.noDemand).toBe(true);
    expect(getMoonSide(moonBase.coord)).toBeNull(); // 중앙 열

    const sides = MOON_CITIES.filter((c) => c.id !== 'moonBase').map((c) => getMoonSide(c.coord));
    expect(sides.filter((s) => s === 'west').length).toBe(3);
    expect(sides.filter((s) => s === 'east').length).toBe(3);
    // 마을도 전부 한쪽에 속한다 (중앙 열 없음 — 신규 도시의 밤낮 판정)
    for (const t of MOON_TOWNS) expect(getMoonSide(t.coord)).not.toBeNull();
  });

  it('성장 주사위 번호: 서/동 각 반쪽에 1/2·3/4·5/6이 하나씩', () => {
    const byId = Object.fromEntries(MOON_CITIES.map((c) => [c.id, c]));
    for (const side of ['west', 'east'] as const) {
      const diceOnSide = Object.entries(MOON_CITY_DICE)
        .filter(([id]) => getMoonSide(byId[id].coord) === side)
        .map(([, dice]) => dice)
        .sort((a, b) => a[0] - b[0]);
      expect(diceOnSide).toEqual([[1, 2], [3, 4], [5, 6]]);
    }
  });
});

describe('달 맵 랩 어라운드 데이터', () => {
  it('37쌍이며 번호 1~37이 정확히 한 번씩', () => {
    expect(MOON_WRAP_EDGES.length).toBe(37);
    const numbers = MOON_WRAP_EDGES.map((w) => w.number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 37 }, (_, i) => i + 1));
  });

  it('모든 랩 변은 실제 보드 외곽 변이다 (헥스는 보드 안, 그 변 이웃은 보드 밖)', () => {
    const keys = boardKeys();
    for (const w of MOON_WRAP_EDGES) {
      for (const side of [w.a, w.b]) {
        expect(keys.has(key(side.coord))).toBe(true);
        const neighbor = getNeighborHex(side.coord, side.edge);
        expect(keys.has(key(neighbor))).toBe(false);
      }
    }
  });

  it('한 변은 최대 하나의 랩에만 속한다 (74변 전부 서로 다름)', () => {
    const seen = new Set<string>();
    for (const w of MOON_WRAP_EDGES) {
      for (const side of [w.a, w.b]) {
        const k = `${key(side.coord)}:${side.edge}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
    expect(seen.size).toBe(74);
  });

  it('랩 쌍은 보드 180° 점대칭 (시트 실측 관계 재검증)', () => {
    // 데이터 좌표 점대칭: col ↔ 9-col... 화면 대칭식을 데이터로 환산해 검증한다.
    // 화면: (c,r) ↔ (12-c, 짝c: 12-r / 홀c: 11-r), 변 e ↔ (e+3)%6
    // 데이터: col=r-1, row=c+2 → row ↔ 16-row, col ↔ (row 짝: 11-col... 직접 화면으로 되돌려 검증)
    const toScreen = (c: HexCoord) => ({ sc: c.row - 2, sr: c.col + 1 });
    const DATA_TO_SCREEN_EDGE = [3, 2, 1, 0, 5, 4]; // 대합 매핑(자기 역원)
    for (const w of MOON_WRAP_EDGES) {
      const A = toScreen(w.a.coord);
      const B = toScreen(w.b.coord);
      expect(B.sc).toBe(12 - A.sc);
      expect(B.sr).toBe(A.sc % 2 === 0 ? 12 - A.sr : 11 - A.sr);
      const ea = DATA_TO_SCREEN_EDGE[w.a.edge];
      const eb = DATA_TO_SCREEN_EDGE[w.b.edge];
      expect(eb).toBe((ea + 3) % 6);
    }
  });
});
