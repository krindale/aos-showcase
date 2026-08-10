import { describe, it, expect } from 'vitest';
import { isEndpointOfIncompleteSection, canRedirectTrack, getRedirectTargetHexes } from '@/utils/trackValidation';
import { getNeighborHex, getOppositeEdge } from '@/utils/hexGrid';
import { BoardState, HexCoord } from '@/types/game';

/**
 * 마을은 이 엔진에서 **가닥(spur)이 있는 변**으로만 연결된다. 미완성 구간의 끝점 판정이
 * 마을을 가닥 없이도 "연결됨"으로 세면, 한쪽이 도시·다른 쪽이 마을인 트랙은 양끝이 막힌
 * 것으로 잡혀 openEdge가 사라진다 → 방향 전환이 조용히 거부되는데(redirectTrack은
 * connectedEdge=null이면 false) 표시 게이트는 끝점을 안 보므로 노란 칸은 그대로 뜬다.
 * 결과: "노란 칸을 눌러도 아무 반응이 없다" (사용자 제보 2026-08-10, Southern England).
 */

const CITY: HexCoord = { col: 7, row: 7 };
const TRACK: HexCoord = { col: 7, row: 8 };

/** TRACK 타일이 한쪽은 도시, 다른 쪽은 마을을 향하는 최소 보드 */
const makeBoard = (opts: { spur: boolean; owner: string | null }): BoardState => {
  // 도시를 향한 변과 그 반대편(마을)
  let cityEdge = 0;
  for (let e = 0; e < 6; e++) {
    const nb = getNeighborHex(TRACK, e);
    if (nb.col === CITY.col && nb.row === CITY.row) { cityEdge = e; break; }
  }
  const townEdge = (cityEdge + 3) % 6;
  const townCoord = getNeighborHex(TRACK, townEdge);

  return {
    hexTiles: [
      { coord: TRACK, terrain: 'plain' },
      { coord: townCoord, terrain: 'plain' },
      ...[0, 1, 2, 3, 4, 5]
        .map(e => getNeighborHex(TRACK, e))
        .filter(c => !(c.col === CITY.col && c.row === CITY.row))
        .map(coord => ({ coord, terrain: 'plain' })),
    ],
    cities: [{ id: 'NC', coord: CITY, color: 'red', cubes: [] }],
    towns: [{ id: 'OX', coord: townCoord, newCityColor: null, cubes: [] }],
    townSpurs: opts.spur
      ? [{ id: 's1', townCoord, edge: getOppositeEdge(townEdge), owner: 'player1', builtTurn: 1 }]
      : [],
    trackTiles: [
      { id: 't1', coord: TRACK, edges: [cityEdge, townEdge], trackType: 'simple', owner: opts.owner, builtTurn: 1 },
    ],
    blockedEdges: [],
  } as unknown as BoardState;
};

describe('미완성 구간 끝점 판정 — 마을은 가닥이 있어야 "연결"이다', () => {
  it('가닥 없는 마을 쪽 변은 열린 변이다 → 끝점으로 인정되어 방향 전환이 가능하다', () => {
    const board = makeBoard({ spur: false, owner: 'player1' });
    const r = isEndpointOfIncompleteSection(TRACK, board, 'P');
    expect(r.isEndpoint).toBe(true);
    expect(r.connectedEdge).not.toBeNull(); // 도시 쪽 변이 유지된다
    expect(r.openEdge).not.toBeNull();      // 마을 쪽 변이 열려 있다
  });

  it('주인 없는 트랙도 마찬가지 — 표시(노란 칸)와 커밋 게이트가 일치해야 한다', () => {
    const board = makeBoard({ spur: false, owner: null });
    // 표시: 방향 전환 후보가 뜬다
    expect(canRedirectTrack(TRACK, board, 'player1')).toBe(true);
    expect(getRedirectTargetHexes(TRACK, board, 'player1').length).toBeGreaterThan(0);
    // 커밋: redirectTrack이 요구하는 connectedEdge가 실제로 나와야 한다 (null이면 조용히 거부)
    expect(isEndpointOfIncompleteSection(TRACK, board, 'P').connectedEdge).not.toBeNull();
  });

  it('마을에 가닥이 있으면 양끝이 연결이라 끝점이 아니다 (기존 동작 유지)', () => {
    const board = makeBoard({ spur: true, owner: 'player1' });
    expect(isEndpointOfIncompleteSection(TRACK, board, 'P').isEndpoint).toBe(false);
  });
});
