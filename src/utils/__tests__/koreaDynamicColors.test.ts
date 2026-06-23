/**
 * 한국 동적 도시 색상 헬퍼(cityAcceptsCube) 단위 검증.
 * - 동적 맵: 도시 수요색 = 현재 놓인 큐브색 (빈 도시는 수요 없음)
 * - 비-동적 맵: 기존 city.color 동작 보존 (회귀 게이트)
 * + 한국 보드 데이터 무결성(직결 링크·동적 플래그·도시/마을 수).
 */
import { describe, it, expect } from 'vitest';
import { cityAcceptsCube } from '@/utils/hexGrid';
import { createKoreaBoardState, KOREA_CITIES, KOREA_TOWNS } from '@/utils/koreaMap';
import type { BoardState, City } from '@/types/game';

function makeCity(over: Partial<City>): City {
  return { id: 'c', name: 'c', coord: { col: 0, row: 0 }, color: 'red', cubes: [], ...over };
}

describe('cityAcceptsCube — 동적/고정 색상', () => {
  const dynamicBoard = { dynamicCityColors: true } as BoardState;
  const fixedBoard = { dynamicCityColors: false } as BoardState;

  it('동적 맵: cubes에 해당 색이 있으면 수용(목적지/통과불가), 없으면 거부', () => {
    const city = makeCity({ color: 'red', cubes: ['blue', 'yellow'] });
    // 고정색은 red지만 동적 맵에서는 무시 — 실제 큐브색(blue/yellow)만 수용
    expect(cityAcceptsCube(city, 'blue', dynamicBoard)).toBe(true);
    expect(cityAcceptsCube(city, 'yellow', dynamicBoard)).toBe(true);
    expect(cityAcceptsCube(city, 'red', dynamicBoard)).toBe(false);
  });

  it('동적 맵: 빈 도시는 어떤 색도 수용 안 함 (수요 없음)', () => {
    const empty = makeCity({ color: 'red', cubes: [] });
    expect(cityAcceptsCube(empty, 'red', dynamicBoard)).toBe(false);
    expect(cityAcceptsCube(empty, 'blue', dynamicBoard)).toBe(false);
  });

  it('비-동적 맵: 기존 city.color 동작 보존 (회귀)', () => {
    const city = makeCity({ color: 'red', cubes: ['blue'] });
    expect(cityAcceptsCube(city, 'red', fixedBoard)).toBe(true);   // 고정색 매칭
    expect(cityAcceptsCube(city, 'blue', fixedBoard)).toBe(false); // 큐브는 무관
  });
});

describe('Korea 보드 데이터 무결성', () => {
  const board = createKoreaBoardState();

  it('동적 색상 플래그가 설정된다', () => {
    expect(board.dynamicCityColors).toBe(true);
  });

  it('도시 14 / 마을 16', () => {
    expect(KOREA_CITIES).toHaveLength(14);
    expect(KOREA_TOWNS).toHaveLength(16);
  });

  it('수원-서울 / 수원-인천 직결 링크 2개', () => {
    const links = board.directLinks ?? [];
    expect(links).toHaveLength(2);
    const pairs = links.map(l => [l.cityA, l.cityB].sort().join('-')).sort();
    expect(pairs).toEqual(['incheon-suwon', 'seoul-suwon']);
    expect(links.every(l => l.cost === 2 && l.owner === null)).toBe(true);
  });

  it('직결 링크 도시쌍은 odd-r 규칙으로 실제 인접 (사이 헥스 없음)', () => {
    const byId = Object.fromEntries(KOREA_CITIES.map(c => [c.id, c.coord]));
    // odd-r 이웃: row 홀짝에 따라 6방향
    const neighbors = (col: number, row: number) => {
      const odd = row % 2 === 1;
      return odd
        ? [[col+1,row],[col+1,row+1],[col,row+1],[col-1,row],[col,row-1],[col+1,row-1]]
        : [[col+1,row],[col,row+1],[col-1,row+1],[col-1,row],[col-1,row-1],[col,row-1]];
    };
    for (const l of board.directLinks ?? []) {
      const a = byId[l.cityA], b = byId[l.cityB];
      const adj = neighbors(a.col, a.row).some(([c, r]) => c === b.col && r === b.row);
      expect(adj, `${l.cityA}-${l.cityB} 인접`).toBe(true);
    }
  });
});
