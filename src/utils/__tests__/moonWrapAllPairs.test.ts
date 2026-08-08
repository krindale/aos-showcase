/**
 * 달 랩 어라운드 전수 검사 — 37쌍 전체의 횡단 연결성 (2026-08-08)
 *
 * (2,10) 사용자 리포트로 랩 33/34의 이중 인접 버그를 고친 뒤, "다른 테두리 연결은
 * 정상인가"를 전수로 박제한다. 각 랩 변 쌍마다 매칭된 타일 두 장을 놓고:
 *   ① getNeighborHex: 랩 변의 이웃 = 반대편 헥스
 *   ② getConnectedNeighbors: 트랙 진입(entry) 후 랩 너머 이웃 인식 (경로 DFS의 이웃 단계)
 *   ③ getConnectingEdge(트랙 인지): 반환 변의 반대변이 상대 타일에 실존 (DFS 진입변 정합
 *      — 이중 인접 헥스에서 "처음 만나는 변"을 돌려주던 버그의 직접 회귀)
 * 을 양방향으로 확인한다. 추가로 랩 인접 전 쌍의 getEdgeBetweenHexes 양방향 일관성
 * (봇이 어긋난 변으로 타일을 깔지 않게)도 전수 확인.
 */

import { describe, it, expect } from 'vitest';
import { getMapData } from '@/utils/mapRegistry';
import {
  getNeighborHex,
  getConnectedNeighbors,
  getConnectingEdge,
  getOppositeEdge,
  hexCoordsEqual,
  hexToKey,
} from '@/utils/hexGrid';
import { getEdgeBetweenHexes } from '@/ai/strategy/analyzer';
import type { BoardState, HexCoord, TrackTile, PlayerId, WrapEdge } from '@/types/game';

const P1: PlayerId = 'player1';

/** 이 헥스의 랩 변 집합 (한 헥스에 랩 변이 최대 3개까지 있다 — 모서리) */
function wrapEdgesOf(board: BoardState, coord: HexCoord): Set<number> {
  const set = new Set<number>();
  for (const w of board.wrapEdges ?? []) {
    if (hexCoordsEqual(w.a.coord, coord)) set.add(w.a.edge);
    if (hexCoordsEqual(w.b.coord, coord)) set.add(w.b.edge);
  }
  return set;
}

/** 랩 변이 아닌 아무 변 하나 (테스트 타일의 반대쪽 출구 — 진입변으로만 쓰므로 행선지는 무관) */
function pickNonWrapEdge(board: BoardState, coord: HexCoord, exclude: number): number {
  const wraps = wrapEdgesOf(board, coord);
  for (let e = 0; e < 6; e++) {
    if (e !== exclude && !wraps.has(e)) return e;
  }
  throw new Error(`비랩 변 없음: ${hexToKey(coord)}`);
}

/** 한 방향 검사: side(타일 있는 쪽) → other 로 랩을 건너는 연결이 경로 계층에서 성립하는가 */
function assertCrossing(
  board: BoardState,
  side: WrapEdge['a'],
  other: WrapEdge['a'],
  wrapNumber: number,
) {
  // ① 기하: 랩 변의 이웃 = 반대편 헥스, 진입변 = 반대변 (점대칭 불변식)
  const nb = getNeighborHex(side.coord, side.edge, board);
  expect(nb, `랩 ${wrapNumber}: ${hexToKey(side.coord)} 변 ${side.edge}의 이웃`).toEqual(other.coord);
  expect(getOppositeEdge(side.edge), `랩 ${wrapNumber}: 반대변 불변식`).toBe(other.edge);

  // 타일 2장: 각 쪽 [비랩 변, 랩 변] — 매칭된 쌍
  const eSide = pickNonWrapEdge(board, side.coord, side.edge);
  const eOther = pickNonWrapEdge(board, other.coord, other.edge);
  const tiles: TrackTile[] = [
    { id: `s-${wrapNumber}`, coord: side.coord, edges: [eSide, side.edge] as [number, number], owner: P1, trackType: 'simple' },
    { id: `o-${wrapNumber}`, coord: other.coord, edges: [other.edge, eOther] as [number, number], owner: P1, trackType: 'simple' },
  ];
  const b2: BoardState = { ...board, trackTiles: [...board.trackTiles, ...tiles] };

  // ② 이웃 단계: side 타일에 비랩 변으로 진입했을 때 랩 너머 other가 이웃으로 인식되는가
  const neighbors = getConnectedNeighbors(side.coord, b2, P1, new Set(), eSide, false);
  expect(
    neighbors.some(n => hexCoordsEqual(n, other.coord)),
    `랩 ${wrapNumber}: ${hexToKey(side.coord)}→${hexToKey(other.coord)} 이웃 인식`,
  ).toBe(true);

  // ③ DFS 진입변 정합: getConnectingEdge가 고른 변의 반대변이 상대 타일에 실존해야
  //    다음 스텝의 출구 계산이 산다 (이중 인접 헥스의 "처음 만나는 변" 버그 회귀)
  const e = getConnectingEdge(side.coord, other.coord, b2);
  expect(e, `랩 ${wrapNumber}: getConnectingEdge`).not.toBeNull();
  const otherTile = b2.trackTiles.find(t => t.id === `o-${wrapNumber}`)!;
  expect(
    otherTile.edges.includes(getOppositeEdge(e!)),
    `랩 ${wrapNumber}: 진입변 ${getOppositeEdge(e!)}이 상대 타일 변 ${JSON.stringify(otherTile.edges)}에 있어야 함`,
  ).toBe(true);
}

describe('달 랩 어라운드 37쌍 전수 — 경로 계층 횡단 연결성', () => {
  const board = getMapData('moon').createBoardState();
  const wraps = board.wrapEdges ?? [];

  it('랩 변 정의가 37쌍 존재한다', () => {
    expect(wraps).toHaveLength(37);
  });

  for (const w of getMapData('moon').createBoardState().wrapEdges ?? []) {
    it(`랩 ${w.number}번: ${hexToKey(w.a.coord)}(변${w.a.edge}) ↔ ${hexToKey(w.b.coord)}(변${w.b.edge}) 양방향`, () => {
      const fresh = getMapData('moon').createBoardState();
      assertCrossing(fresh, w.a, w.b, w.number);
      assertCrossing(fresh, w.b, w.a, w.number);
    });
  }

  it('랩으로 인접한 모든 헥스 쌍에서 getEdgeBetweenHexes 양방향이 일관된다 (봇 건설 어긋남 방지)', () => {
    const pairKeys = new Set<string>();
    for (const w of wraps) {
      const key = [hexToKey(w.a.coord), hexToKey(w.b.coord)].sort().join('|');
      if (pairKeys.has(key)) continue;
      pairKeys.add(key);
      const ab = getEdgeBetweenHexes(w.a.coord, w.b.coord, board);
      const ba = getEdgeBetweenHexes(w.b.coord, w.a.coord, board);
      expect(ab, `${key} a→b`).toBeGreaterThanOrEqual(0);
      expect(ba, `${key} b→a (반대변이어야 봇 타일이 맞물린다)`).toBe(getOppositeEdge(ab));
    }
  });
});
