// Southern England 보드 무결성 테스트
// 시트 전사(색상 자동 검출 + 오버레이 시각 검증)의 회귀 가드:
// 개수·좌표·지형 분포와, 이미지에서 눈으로 확인한 인접 관계(강 끝점·도시 연결)를
// 엔진의 odd-r 이웃 계산(getNeighborHex)으로 박제한다.

import { describe, it, expect } from 'vitest';
import {
  SOUTHERN_ENGLAND_MAP,
  SOUTHERN_ENGLAND_CITIES,
  SOUTHERN_ENGLAND_TOWNS,
  SOUTHERN_ENGLAND_COLUMN_MAPPING,
  generateSouthernEnglandHexTiles,
} from '../southernEnglandMap';
import { getNeighborHex } from '../hexGrid';
import { HexCoord } from '@/types/game';

const tiles = generateSouthernEnglandHexTiles();
const terrainAt = (col: number, row: number) =>
  tiles.find(t => t.coord.col === col && t.coord.row === row)?.terrain;

function isNeighbor(a: HexCoord, b: HexCoord): boolean {
  for (let e = 0; e < 6; e++) {
    const n = getNeighborHex(a, e);
    if (n.col === b.col && n.row === b.row) return true;
  }
  return false;
}

describe('Southern England 보드 무결성', () => {
  it('그리드/개수: 11×18, 도시 12, 마을 15, 산 24, 강 10, 바다 29', () => {
    expect(SOUTHERN_ENGLAND_MAP.cols).toBe(11);
    expect(SOUTHERN_ENGLAND_MAP.rows).toBe(18);
    expect(SOUTHERN_ENGLAND_CITIES).toHaveLength(12);
    expect(SOUTHERN_ENGLAND_TOWNS).toHaveLength(15);
    // 도시 헥스 12개는 hexTiles에서 제외 → 198 − 12 = 186
    expect(tiles).toHaveLength(11 * 18 - 12);
    expect(tiles.filter(t => t.terrain === 'mountain')).toHaveLength(24);
    expect(tiles.filter(t => t.terrain === 'river')).toHaveLength(10);
    expect(tiles.filter(t => t.terrain === 'lake')).toHaveLength(29);
  });

  it('도시/마을 좌표가 서로 겹치지 않고 그리드 안에 있다', () => {
    const seen = new Set<string>();
    for (const s of [...SOUTHERN_ENGLAND_CITIES, ...SOUTHERN_ENGLAND_TOWNS]) {
      const key = `${s.coord.col},${s.coord.row}`;
      expect(seen.has(key), `중복 좌표: ${key}`).toBe(false);
      seen.add(key);
      expect(s.coord.col).toBeGreaterThanOrEqual(0);
      expect(s.coord.col).toBeLessThan(11);
      expect(s.coord.row).toBeGreaterThanOrEqual(0);
      expect(s.coord.row).toBeLessThan(18);
    }
    // 마을 헥스는 평지(지형 추가비용 없음 — 룰북: 마을 배치는 지형비 미적용)
    for (const t of SOUTHERN_ENGLAND_TOWNS) {
      expect(terrainAt(t.coord.col, t.coord.row), t.id).toBe('plain');
    }
  });

  it('물품 디스플레이: 12개 도시 열(라이트/다크 1~6) + 신도시 7열(B 제외) = 50칸', () => {
    const cityCols = SOUTHERN_ENGLAND_COLUMN_MAPPING.filter(m => !m.isNewCity);
    const newCols = SOUTHERN_ENGLAND_COLUMN_MAPPING.filter(m => m.isNewCity);
    expect(cityCols).toHaveLength(12);
    expect(newCols.map(m => m.columnId).sort()).toEqual(['A', 'C', 'D', 'E', 'F', 'G', 'H']);
    // 주사위 번호 1~6이 도시 열에 정확히 2개씩 (라이트+다크)
    for (let d = 1; d <= 6; d++) {
      expect(cityCols.filter(m => m.diceNumber === d), `주사위 ${d}`).toHaveLength(2);
    }
    expect(SOUTHERN_ENGLAND_COLUMN_MAPPING.reduce((s, m) => s + m.rowCount, 0)).toBe(50);
  });

  it('강 끝점 인접(시트 시각 검증 박제): 트렌트 NE↔Nottingham, 세번 Shrewsbury↔해협, 템스 Oxford↔London', () => {
    // 트렌트: North East(0,13) — (1,12) — (1,11) — Nottingham(2,10)
    expect(isNeighbor({ col: 1, row: 12 }, { col: 0, row: 13 })).toBe(true);
    expect(isNeighbor({ col: 1, row: 12 }, { col: 1, row: 11 })).toBe(true);
    expect(isNeighbor({ col: 1, row: 11 }, { col: 2, row: 10 })).toBe(true);
    // 세번: Shrewsbury(2,5) — (3,5) — (4,5) — (5,5) — (6,5)
    expect(isNeighbor({ col: 3, row: 5 }, { col: 2, row: 5 })).toBe(true);
    expect(isNeighbor({ col: 3, row: 5 }, { col: 4, row: 5 })).toBe(true);
    expect(isNeighbor({ col: 4, row: 5 }, { col: 5, row: 5 })).toBe(true);
    expect(isNeighbor({ col: 5, row: 5 }, { col: 6, row: 5 })).toBe(true);
    // 템스: Oxford(6,9) — (7,10) — (6,11) — (7,12) — (7,13) — London(7,14)
    expect(isNeighbor({ col: 7, row: 10 }, { col: 6, row: 9 })).toBe(true);
    expect(isNeighbor({ col: 7, row: 10 }, { col: 6, row: 11 })).toBe(true);
    expect(isNeighbor({ col: 6, row: 11 }, { col: 7, row: 12 })).toBe(true);
    expect(isNeighbor({ col: 7, row: 12 }, { col: 7, row: 13 })).toBe(true);
    expect(isNeighbor({ col: 7, row: 13 }, { col: 7, row: 14 })).toBe(true);
  });

  it('플레이 가능 영역(비바다)이 하나로 연결돼 있다 — 전사 오류(고립 헥스) 가드', () => {
    const playable = new Set<string>();
    for (const t of tiles) if (t.terrain !== 'lake') playable.add(`${t.coord.col},${t.coord.row}`);
    for (const c of SOUTHERN_ENGLAND_CITIES) playable.add(`${c.coord.col},${c.coord.row}`);

    const start = `${SOUTHERN_ENGLAND_CITIES[0].coord.col},${SOUTHERN_ENGLAND_CITIES[0].coord.row}`;
    const visited = new Set<string>([start]);
    const queue: HexCoord[] = [SOUTHERN_ENGLAND_CITIES[0].coord];
    while (queue.length > 0) {
      const cur = queue.pop()!;
      for (let e = 0; e < 6; e++) {
        const n = getNeighborHex(cur, e);
        const key = `${n.col},${n.row}`;
        if (playable.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push(n);
        }
      }
    }
    const missing = Array.from(playable).filter(k => !visited.has(k));
    expect(missing, `고립 헥스: ${missing.join(' / ')}`).toHaveLength(0);
  });
});
