/** 교차 트랙 통과 배달 버그 재현 — cincinnati→(9,12)→(8,11)교차→(7,11)교차→C(보라) */
import { describe, it, expect } from 'vitest';
import { findReachableDestinations, getConnectedNeighbors, isTrackPartOfCompletedLink } from '@/utils/hexGrid';
import type { BoardState } from '@/types/game';

function makeBoard(): BoardState {
  return {
    cities: [
      { id: 'cincinnati', name: 'Cincinnati', coord: { col: 8, row: 12 }, color: 'blue', cubes: ['purple'] },
      { id: 'C', name: 'New City C', coord: { col: 6, row: 11 }, color: 'purple', cubes: [] },
    ],
    towns: [],
    hexTiles: [],
    townSpurs: [],
    trackTiles: [
      // === 경로 핵심 ===
      { id: 't1', coord: { col: 9, row: 12 }, edges: [4, 3], owner: 'player1', trackType: 'simple' },
      { id: 't2', coord: { col: 8, row: 11 }, edges: [2, 5], owner: 'player5', trackType: 'crossing', secondaryEdges: [3, 1], secondaryOwner: 'player1' },
      { id: 't3', coord: { col: 7, row: 11 }, edges: [1, 5], owner: 'player4', trackType: 'crossing', secondaryEdges: [3, 0], secondaryOwner: 'player1' },
      // === 주변 player1 트랙 ===
      { id: 't4', coord: { col: 6, row: 10 }, edges: [4, 1], owner: 'player1', trackType: 'simple' },
      { id: 't5', coord: { col: 8, row: 13 }, edges: [4, 1], owner: 'player1', trackType: 'simple' },
      { id: 't6', coord: { col: 7, row: 13 }, edges: [5, 4], owner: 'player1', trackType: 'simple' },
      // === 주변 상대 트랙 (cincinnati 인접 포함) ===
      { id: 't7', coord: { col: 7, row: 12 }, edges: [0, 3], owner: 'player5', trackType: 'simple' },
      { id: 't8', coord: { col: 6, row: 12 }, edges: [0, 3], owner: 'player5', trackType: 'simple' },
      { id: 't9', coord: { col: 9, row: 10 }, edges: [2, 5], owner: 'player5', trackType: 'simple' },
      { id: 't10', coord: { col: 7, row: 10 }, edges: [0, 2], owner: 'player4', trackType: 'simple' },
    ],
  } as unknown as BoardState;
}

describe('교차 트랙 통과 배달', () => {
  it('★ (9,12)는 교차 2개를 secondary로 거쳐 C와 cincinnati를 잇는 완성 링크의 일부여야 함 (소유권 제거 방지)', () => {
    const board = makeBoard();
    // 버그: checkConnectionToCity가 교차 secondaryEdges를 무시해 (9,12)를 미완성으로 오판 → 소유권 제거
    expect(isTrackPartOfCompletedLink({ col: 9, row: 12 }, board)).toBe(true);
  });

  it('★ 공용화(owner=null)된 (9,12)도 통과 가능해야 함 (파산 공용 철도/현재 게임 복구)', () => {
    const board = makeBoard();
    const t = board.trackTiles.find(x => x.coord.col === 9 && x.coord.row === 12)!;
    (t as { owner: string | null }).owner = null; // 이전 버그로 이미 공용화된 상태 시뮬레이션
    const reachable = findReachableDestinations({ col: 8, row: 12 }, board, 'player1', 4, 'purple' as never);
    expect(reachable.map(c => c.id)).toContain('C');
  });

  it('cincinnati 보라 큐브가 교차 2개를 secondary로 통과해 C(보라)에 도달해야 함', () => {
    const board = makeBoard();
    const reachable = findReachableDestinations({ col: 8, row: 12 }, board, 'player1', 4, 'purple' as never);
    console.log('도달 가능 도시:', reachable.map(c => c.id));
    expect(reachable.map(c => c.id)).toContain('C');
  });

  it('[단계별] cincinnati→(9,12) 이웃 인정', () => {
    const board = makeBoard();
    const nb = getConnectedNeighbors({ col: 8, row: 12 }, board, 'player1', new Set(), undefined);
    console.log('cincinnati 이웃:', nb.map(c => `(${c.col},${c.row})`));
    expect(nb.some(c => c.col === 9 && c.row === 12)).toBe(true);
  });

  it('[단계별] (9,12)→(8,11)교차 이웃 인정 (entry edge 3로 진입)', () => {
    const board = makeBoard();
    const nb = getConnectedNeighbors({ col: 9, row: 12 }, board, 'player1', new Set(['8,12']), 3);
    console.log('(9,12) 이웃 [entry=3]:', nb.map(c => `(${c.col},${c.row})`));
    expect(nb.some(c => c.col === 8 && c.row === 11)).toBe(true);
  });

  it('[단계별] (8,11)교차→(7,11)교차 이웃 인정 (entry edge 1)', () => {
    const board = makeBoard();
    const nb = getConnectedNeighbors({ col: 8, row: 11 }, board, 'player1', new Set(['9,12']), 1);
    console.log('(8,11) 이웃 [entry=1]:', nb.map(c => `(${c.col},${c.row})`));
    expect(nb.some(c => c.col === 7 && c.row === 11)).toBe(true);
  });

  it('[단계별] (7,11)교차→C 이웃 인정 (entry edge 0)', () => {
    const board = makeBoard();
    const nb = getConnectedNeighbors({ col: 7, row: 11 }, board, 'player1', new Set(['8,11']), 0);
    console.log('(7,11) 이웃 [entry=0]:', nb.map(c => `(${c.col},${c.row})`));
    expect(nb.some(c => c.col === 6 && c.row === 11)).toBe(true);
  });
});
