/**
 * 병렬 중복 부설의 메커니즘 — 2026-07-28 사용자 스크린샷/로그 (Rust Belt Duluth↔Minneapolis)
 *
 * 실제 게임 로그:
 *   T1 ①② 목표 minneapolis→duluth : 건설 (2,2)[5,3], (1,2)[0,3] → 링크 완성
 *   T1 ③  목표 duluth→chicago
 *          (2,2) 엣지 비호환 → 회피 1/3
 *          (1,2) 엣지 비호환 → 회피 2/3
 *          건설 (0,1),(1,1) → 같은 두 도시를 잇는 **병렬 노선**
 *
 * 이 테스트는 그 원인을 박제한다 — 엣지 판정이나 A*의 버그가 아니라,
 * **마을 우대(preferTowns)가 경로를 틀어 기존 트랙의 변과 어긋나게 만드는** 상호작용이다.
 * (A*는 헥스 단위라 진입/진출 변을 모른 채 내 트랙을 비용 0.1로 우대해 고른다.)
 *
 * ⚠️ "병렬 부설을 막는" 수정은 100시드에서 맵별로 효과가 갈려 기각됐다
 *    (Rust Belt +1.20·China +1.89 vs Korea −1.63·Montréal −3.48) —
 *    병렬 노선도 룰상 별개의 완성 링크라 수입원이 되기 때문. 근거:
 *    docs/ai-auction-baseline-100seed.md 2026-07-28 기각 실험 3.
 */
import { describe, it, expect } from 'vitest';
import { createRustBeltBoardState } from '@/utils/rustBeltMap';
import { getEdgeBetweenHexes, findOptimalPathAvoidingOpponent } from '@/ai/strategy/analyzer';
import type { BoardState, HexCoord, TrackTile } from '@/types/game';

const DULUTH: HexCoord = { col: 0, row: 2 };
const MINNEAPOLIS: HexCoord = { col: 2, row: 1 };
const H12: HexCoord = { col: 1, row: 2 };
const H22: HexCoord = { col: 2, row: 2 };

/** 실제 게임이 T1에 깐 minneapolis→duluth 링크 */
function boardWithLink(): BoardState {
  const base = createRustBeltBoardState();
  const trackTiles: TrackTile[] = [
    { id: 't22', coord: H22, edges: [5, 3], owner: 'player1', trackType: 'simple', builtTurn: 1 },
    { id: 't12', coord: H12, edges: [0, 3], owner: 'player1', trackType: 'simple', builtTurn: 1 },
  ];
  return { ...base, trackTiles };
}

describe('Duluth↔Minneapolis 병렬 중복 부설의 원인', () => {
  const board = createRustBeltBoardState();

  it('실제로 깐 edges가 그 경로의 두 변과 정확히 일치한다 (판정 자체는 정상)', () => {
    const e22_toMinneapolis = getEdgeBetweenHexes(H22, MINNEAPOLIS, board);
    const e22_to12 = getEdgeBetweenHexes(H22, H12, board);
    const e12_to22 = getEdgeBetweenHexes(H12, H22, board);
    const e12_toDuluth = getEdgeBetweenHexes(H12, DULUTH, board);
    expect([e22_toMinneapolis, e22_to12].sort()).toEqual([3, 5]); // 로그의 (2,2) edges[5,3]
    expect([e12_to22, e12_toDuluth].sort()).toEqual([0, 3]);      // 로그의 (1,2) edges[0,3]
  });

  it('역방향 통과도 두 변이 모두 있다 — 되짚어 가는 것 자체는 막히지 않는다', () => {
    const b = boardWithLink();
    const path = [DULUTH, H12, H22, MINNEAPOLIS];
    for (let i = 1; i < path.length - 1; i++) {
      const here = path[i];
      const track = b.trackTiles.find(t => t.coord.col === here.col && t.coord.row === here.row)!;
      const toPrev = getEdgeBetweenHexes(here, path[i - 1], board);
      const toNext = getEdgeBetweenHexes(here, path[i + 1], board);
      expect(track.edges.includes(toPrev)).toBe(true);
      expect(track.edges.includes(toNext)).toBe(true);
    }
  });

  it('★ 원인: 마을 우대가 켜지면 A* 경로가 Minneapolis를 건너뛰어 기존 트랙의 변과 어긋난다', () => {
    const b = boardWithLink();
    const chicago = b.cities.find(c => c.id === 'chicago')!;

    const plain = findOptimalPathAvoidingOpponent(DULUTH, chicago.coord, b, 'player1', undefined, false);
    const towns = findOptimalPathAvoidingOpponent(DULUTH, chicago.coord, b, 'player1', undefined, true);

    // 둘 다 기존 트랙 (1,2)·(2,2)는 재사용한다 (비용 0.1 우대가 작동)
    for (const p of [plain, towns]) {
      expect(p.some(c => c.col === 1 && c.row === 2)).toBe(true);
      expect(p.some(c => c.col === 2 && c.row === 2)).toBe(true);
    }

    // 차이는 (2,2) **다음**이다:
    const after22 = (p: HexCoord[]) => {
      const i = p.findIndex(c => c.col === 2 && c.row === 2);
      return p[i + 1];
    };
    // 마을 우대 OFF → Minneapolis(2,1)로 이어져 기존 트랙의 변([5,3])과 일치
    expect(after22(plain)).toEqual(MINNEAPOLIS);
    // 마을 우대 ON → Minneapolis를 건너뛴다 → 그 변이 트랙에 없어 "엣지 비호환" → 회피 → 병렬 부설
    expect(after22(towns)).not.toEqual(MINNEAPOLIS);

    const t22 = b.trackTiles.find(t => t.id === 't22')!;
    const edgeToDetour = getEdgeBetweenHexes(H22, after22(towns), board);
    expect(t22.edges.includes(edgeToDetour)).toBe(false); // 비호환 확정
  });
});
