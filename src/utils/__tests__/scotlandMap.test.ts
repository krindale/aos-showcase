// Scotland 보드 데이터 무결성 테스트 — 전사 검증 (시트: maps/scotland-v2.pdf)
// 격자 9열×8행(전치), 도시 6·마을 8·산 9(산+강 $5 3곳)·강 평지 10·바다 23.

import { describe, it, expect } from 'vitest';
import {
  SCOTLAND_MAP,
  SCOTLAND_CITIES,
  SCOTLAND_TOWNS,
  SCOTLAND_COLUMN_MAPPING,
  SCOTLAND_DIRECT_LINKS,
  generateScotlandHexTiles,
  createScotlandBoardState,
} from '../scotlandMap';
import { getNeighborHex, hexCoordsEqual } from '../hexGrid';

const key = (c: { col: number; row: number }) => `${c.col},${c.row}`;

describe('Scotland 보드 무결성', () => {
  const tiles = generateScotlandHexTiles();
  const tileByKey = new Map(tiles.map(t => [key(t.coord), t]));

  it('격자: 9×8 = 72칸 = 도시 6 + 지형 타일 66', () => {
    expect(SCOTLAND_MAP.cols).toBe(9);
    expect(SCOTLAND_MAP.rows).toBe(8);
    expect(SCOTLAND_CITIES).toHaveLength(6);
    expect(tiles).toHaveLength(72 - 6);
  });

  it('지형 구성: 바다 23 · 산 9(그중 $5 산+강 3) · 강 평지 10', () => {
    const lakes = tiles.filter(t => t.terrain === 'lake');
    const mountains = tiles.filter(t => t.terrain === 'mountain');
    const rivers = tiles.filter(t => t.terrain === 'river');
    const mtnRivers = mountains.filter(t => t.riverEdges);
    expect(lakes).toHaveLength(23);
    expect(mountains).toHaveLength(9);
    expect(rivers).toHaveLength(10);
    expect(mtnRivers).toHaveLength(3);
    // 산+강 = fixedCost 5 (룰북: "A Mountain tile with a river costs $5").
    // 비용 표시는 헥스 위 원 숫자가 아니라 범례 "강+산" 항목 (showCostMarker 미사용)
    for (const t of mtnRivers) {
      expect(t.fixedCost).toBe(5);
      expect(t.showCostMarker).toBeUndefined();
    }
    // 산+강 외에는 fixedCost 없음
    expect(tiles.filter(t => t.fixedCost !== undefined)).toHaveLength(3);
  });

  it('도시·마을 좌표: 격자 안·중복 없음·바다/도시 겹침 없음', () => {
    const seen = new Set<string>();
    for (const s of [...SCOTLAND_CITIES.map(c => c.coord), ...SCOTLAND_TOWNS.map(t => t.coord)]) {
      expect(s.col).toBeGreaterThanOrEqual(0);
      expect(s.col).toBeLessThan(SCOTLAND_MAP.cols);
      expect(s.row).toBeGreaterThanOrEqual(0);
      expect(s.row).toBeLessThan(SCOTLAND_MAP.rows);
      expect(seen.has(key(s))).toBe(false);
      seen.add(key(s));
    }
    // 마을은 평지 타일 위 (바다/산/강 아님)
    for (const t of SCOTLAND_TOWNS) {
      expect(tileByKey.get(key(t.coord))?.terrain).toBe('plain');
    }
    // 도시 헥스에는 지형 타일이 없다
    for (const c of SCOTLAND_CITIES) {
      expect(tileByKey.has(key(c.coord))).toBe(false);
    }
  });

  it('Ayr↔Glasgow는 인접, 페리 양끝(ST↔UL·BF↔AY)은 비인접', () => {
    const coordOf = (id: string) =>
      SCOTLAND_CITIES.find(c => c.id === id)?.coord ?? SCOTLAND_TOWNS.find(t => t.id === id)!.coord;
    const adjacent = (a: { col: number; row: number }, b: { col: number; row: number }) =>
      Array.from({ length: 6 }, (_, e) => getNeighborHex(a, e)).some(n => hexCoordsEqual(n, b));
    expect(adjacent(coordOf('AY'), coordOf('glasgow'))).toBe(true);
    expect(adjacent(coordOf('ST'), coordOf('UL'))).toBe(false);
    expect(adjacent(coordOf('BF'), coordOf('AY'))).toBe(false);
  });

  it('본토 연결성: 섬(Stornoway·Belfast) 2칸 제외 전 육지가 한 덩어리', () => {
    const land = new Set(
      tiles.filter(t => t.terrain !== 'lake').map(t => key(t.coord))
    );
    SCOTLAND_CITIES.forEach(c => land.add(key(c.coord)));
    const islands = new Set([key({ col: 1, row: 0 }), key({ col: 8, row: 0 })]); // ST·BF

    // 본토 아무 칸(Glasgow)에서 BFS
    const start = key({ col: 6, row: 2 });
    const visited = new Set([start]);
    const queue = [{ col: 6, row: 2 }];
    while (queue.length) {
      const cur = queue.shift()!;
      for (let e = 0; e < 6; e++) {
        const nb = getNeighborHex(cur, e);
        const k = key(nb);
        if (land.has(k) && !visited.has(k)) { visited.add(k); queue.push(nb); }
      }
    }
    // 본토 = 육지 전체 − 섬 2칸
    expect(visited.size).toBe(land.size - islands.size);
    islands.forEach(k => expect(visited.has(k)).toBe(false));
  });

  it('물품 디스플레이: 도시 6열(주사위 1~6 유일) + 신도시 8열 = 34칸', () => {
    const cityCols = SCOTLAND_COLUMN_MAPPING.filter(m => !m.isNewCity);
    const newCols = SCOTLAND_COLUMN_MAPPING.filter(m => m.isNewCity);
    expect(cityCols).toHaveLength(6);
    expect(newCols).toHaveLength(8);
    expect(new Set(cityCols.map(m => m.diceNumber)).size).toBe(6);
    expect(SCOTLAND_COLUMN_MAPPING.reduce((s, m) => s + m.rowCount, 0)).toBe(34);
    // 열의 도시 id는 실제 도시와 일치
    const cityIds = new Set(SCOTLAND_CITIES.map(c => c.id));
    cityCols.forEach(m => expect(cityIds.has(m.cityId)).toBe(true));
  });

  it('직결 링크: 페리 $6×2(requiresCities) + Ayr↔Glasgow $2, 보드 상태에 포함', () => {
    expect(SCOTLAND_DIRECT_LINKS).toHaveLength(3);
    const ferries = SCOTLAND_DIRECT_LINKS.filter(d => d.cost === 6);
    expect(ferries).toHaveLength(2);
    SCOTLAND_DIRECT_LINKS.forEach(d => {
      expect(d.owner).toBeNull();
      expect(d.requiresCities).toBe(true);
    });
    const board = createScotlandBoardState();
    expect(board.directLinks).toHaveLength(3);
    // 얕은 복사 검증 — 원본 상수 오염 방지
    board.directLinks![0].owner = 'player1';
    expect(SCOTLAND_DIRECT_LINKS[0].owner).toBeNull();
  });

  it('강 edges: 모든 강(산+강 포함)이 유효한 면 번호 쌍을 가진다', () => {
    for (const t of tiles) {
      if (!t.riverEdges) continue;
      const [a, b] = t.riverEdges;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(6);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(6);
      expect(a).not.toBe(b);
    }
  });
});
