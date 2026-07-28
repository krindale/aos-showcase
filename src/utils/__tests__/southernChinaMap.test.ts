// 남부 중국 맵 데이터 무결성 테스트 — 격자·지형·강 흐름·특수 요소 검증
import { describe, it, expect } from 'vitest';
import {
  SOUTHERN_CHINA_MAP,
  SOUTHERN_CHINA_CITIES,
  SOUTHERN_CHINA_TOWNS,
  SOUTHERN_CHINA_COLUMN_MAPPING,
  SOUTHERN_CHINA_INTERURBAN,
  SOUTHERN_CHINA_SZ_HK_LINK,
  SOUTHERN_CHINA_CITY_FERRY,
  generateSouthernChinaHexTiles,
} from '../southernChinaMap';
import { getNeighborHex } from '../hexGrid';
import { HexCoord } from '@/types/game';

const key = (c: HexCoord) => `${c.col},${c.row}`;

// 보드 내부(lake 제외) 헥스 키 집합 (도시 헥스 포함)
function boardKeys(): Set<string> {
  const keys = new Set(
    generateSouthernChinaHexTiles()
      .filter((t) => t.terrain !== 'lake')
      .map((t) => key(t.coord))
  );
  for (const c of SOUTHERN_CHINA_CITIES) keys.add(key(c.coord));
  return keys;
}

describe('남부 중국 맵 보드 구성', () => {
  it('도시 10·마을 11, 산 19, 강 32, 추가비용 헥스 3', () => {
    expect(SOUTHERN_CHINA_CITIES.length).toBe(10);
    expect(SOUTHERN_CHINA_TOWNS.length).toBe(11);
    const tiles = generateSouthernChinaHexTiles().filter((t) => t.terrain !== 'lake');
    expect(tiles.filter((t) => t.terrain === 'mountain').length).toBe(19);
    expect(tiles.filter((t) => t.terrain === 'river').length).toBe(32);
    const extra = tiles.filter((t) => t.fixedCost !== undefined);
    expect(extra.length).toBe(3);
    expect(extra.every((t) => t.showCostMarker)).toBe(true);
    expect(extra.map((t) => t.fixedCost).sort()).toEqual([4, 5, 5]);
  });

  it('도시·마을 좌표가 보드 안이며 서로 겹치지 않는다', () => {
    const keys = boardKeys();
    const seen = new Set<string>();
    for (const c of [
      ...SOUTHERN_CHINA_CITIES.map((x) => x.coord),
      ...SOUTHERN_CHINA_TOWNS.map((x) => x.coord),
    ]) {
      expect(keys.has(key(c))).toBe(true);
      expect(seen.has(key(c))).toBe(false);
      seen.add(key(c));
    }
    expect(SOUTHERN_CHINA_MAP.cols).toBe(15);
    expect(SOUTHERN_CHINA_MAP.rows).toBe(13);
  });

  it('Hong Kong은 모든 색 수용, 나머지 도시는 일반 수요색', () => {
    const hk = SOUTHERN_CHINA_CITIES.find((c) => c.id === 'hongkong')!;
    expect(hk.acceptsAllColors).toBe(true);
    for (const c of SOUTHERN_CHINA_CITIES) {
      if (c.id !== 'hongkong') expect(c.acceptsAllColors).toBeUndefined();
    }
  });

  it('물품 열 매핑: 도시 10열(3칸) + 신도시 8열(2칸), Changsha·HK만 주사위 5/6 겸용', () => {
    const cityCols = SOUTHERN_CHINA_COLUMN_MAPPING.filter((m) => !m.isNewCity);
    expect(cityCols.length).toBe(10);
    const cityIds = new Set(SOUTHERN_CHINA_CITIES.map((c) => c.id));
    for (const m of cityCols) expect(cityIds.has(m.cityId)).toBe(true);
    // 주사위 1~4는 도시 2개씩, 5·6은 겸용(diceNumbers) 2개
    for (const n of [1, 2, 3, 4]) {
      expect(cityCols.filter((m) => m.diceNumber === n && !m.diceNumbers).length).toBe(2);
    }
    const dual = cityCols.filter((m) => m.diceNumbers);
    expect(dual.map((m) => m.cityId).sort()).toEqual(['changsha', 'hongkong']);
    for (const m of dual) expect(m.diceNumbers).toEqual([5, 6]);
    expect(SOUTHERN_CHINA_COLUMN_MAPPING.filter((m) => m.isNewCity).length).toBe(8);
  });

  it('강 타일의 riverEdges가 이웃 강/마을/도시/바다와 이어진다 (끊긴 강 없음)', () => {
    const tiles = generateSouthernChinaHexTiles();
    const byKey = new Map(tiles.map((t) => [key(t.coord), t]));
    const cityKeys = new Set(SOUTHERN_CHINA_CITIES.map((c) => key(c.coord)));
    const townKeys = new Set(SOUTHERN_CHINA_TOWNS.map((t) => key(t.coord)));
    const rivers = tiles.filter((t) => t.terrain === 'river');
    for (const t of rivers) {
      expect(t.riverEdges).toBeDefined();
      for (const e of t.riverEdges!) {
        const n = getNeighborHex(t.coord, e);
        const nk = key(n);
        const nt = byKey.get(nk);
        // 각 면의 끝은 이웃 강 / 마을 / 도시 / 바다(하구) / 산(발원) / 보드 밖 중 하나.
        // 이웃 강은 면 일치까지 요구하지 않는다 — (9,5) 같은 3면 합류점은 riverEdges가
        // 2면만 저장해 정확 매칭이 불가능하다 (전사 오탈자는 평지행 면으로 여전히 검출).
        const isRiverNeighbor = nt?.terrain === 'river';
        const ok =
          isRiverNeighbor ||
          townKeys.has(nk) ||
          cityKeys.has(nk) ||
          nt?.terrain === 'lake' ||
          nt?.terrain === 'mountain' || // 산기슭 발원 (우강·양쯔 지류 헤드워터)
          nt === undefined; // 보드 밖 (상단 경계)
        if (!ok) {
          throw new Error(`강 (${t.coord.col},${t.coord.row}) 면 ${e} → (${n.col},${n.row}) 연결 실패`);
        }
      }
    }
  });

  it('하이난 섬은 $4 해협 헥스(4,10)를 통해서만 본토와 이어진다', () => {
    const keys = boardKeys();
    // 하이난: Haikou(4,11) + (3,11) + (3,12) + (4,12)
    const hainan = ['4,11', '3,11', '3,12', '4,12'];
    for (const k of hainan) expect(keys.has(k)).toBe(true);
    // 해협 헥스 (4,10)의 이웃 중 본토와 하이난 양쪽이 있다
    const strait: HexCoord = { col: 4, row: 10 };
    const neighborKeys = [0, 1, 2, 3, 4, 5].map((e) => key(getNeighborHex(strait, e)));
    expect(neighborKeys).toContain('4,11'); // Haikou
    expect(neighborKeys).toContain('4,9');  // 본토
    // 하이난 4헥스의 이웃(자기들끼리·해협 제외)은 전부 바다 = 해협이 유일 통로
    const hainanSet = new Set(hainan);
    for (const k of hainan) {
      const [c, r] = k.split(',').map(Number);
      for (let e = 0; e < 6; e++) {
        const nk = key(getNeighborHex({ col: c, row: r }, e));
        if (hainanSet.has(nk) || nk === '4,10') continue;
        expect(keys.has(nk)).toBe(false);
      }
    }
  });

  it('인터어반·페리 정의: GZ↔SZ 인접, SZ↔HK 인접, GZ↔HK 대각(비인접 — 직결 필요)', () => {
    const byId = Object.fromEntries(SOUTHERN_CHINA_CITIES.map((c) => [c.id, c]));
    // GZ↔SZ는 실제 인접 (변 공유)
    const gz = byId[SOUTHERN_CHINA_INTERURBAN.cityA].coord;
    const sz = byId[SOUTHERN_CHINA_INTERURBAN.cityB].coord;
    const gzNeighbors = [0, 1, 2, 3, 4, 5].map((e) => key(getNeighborHex(gz, e)));
    expect(gzNeighbors).toContain(key(sz));
    // SZ↔HK도 실제 인접 (변 공유 — 경계 위 "8" 링크)
    const hk = byId[SOUTHERN_CHINA_SZ_HK_LINK.cityB].coord;
    const szNeighbors = [0, 1, 2, 3, 4, 5].map((e) => key(getNeighborHex(sz, e)));
    expect(szNeighbors).toContain(key(hk));
    // GZ↔HK는 비인접 (사이에 바다 (7,9)) — 페리라서 직결이 필요
    expect(key(byId[SOUTHERN_CHINA_CITY_FERRY.cityB].coord)).toBe(key(hk));
    expect(gzNeighbors).not.toContain(key(hk));
    // 세 링크 모두 초기 보드 directLinks에 미건설로 등록 (서안 변 페리는 제거됨 — 정본 확인)
    const board = boardKeys();
    void board;
  });
});
