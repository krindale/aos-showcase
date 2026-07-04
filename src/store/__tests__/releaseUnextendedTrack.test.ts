/** 미완성 트랙 소유권 해제(룰 IV) — "이번 턴에 연장 안 한 미완성 구간은 소유 디스크 제거" */
import { describe, it, expect } from 'vitest';
import { releaseUnextendedTrack } from '@/store/helpers/boardRules';
import type { BoardState } from '@/types/game';

function makeBoard(overrides: Partial<BoardState> = {}): BoardState {
  return {
    cities: [
      { id: 'P', name: 'P', coord: { col: 0, row: 0 }, color: 'red', cubes: [] },
      { id: 'C', name: 'C', coord: { col: 4, row: 0 }, color: 'blue', cubes: [] },
    ],
    towns: [],
    hexTiles: [],
    townSpurs: [],
    trackTiles: [],
    ...overrides,
  } as unknown as BoardState;
}

describe('releaseUnextendedTrack', () => {
  it('지난 턴에 깐 미완성 구간(도시 한쪽만 연결)은 이번 턴 미연장 시 공용화', () => {
    const board = makeBoard({
      trackTiles: [
        // P(0,0) 동쪽으로 한 칸 — 동쪽 끝 dangling = 미완성
        { id: 't1', coord: { col: 1, row: 0 }, edges: [3, 0], owner: 'player1', trackType: 'simple', builtTurn: 1 },
      ] as never,
    });
    const { board: out, released } = releaseUnextendedTrack(board, 2);
    expect(released).toBe(1);
    expect(out.trackTiles[0].owner).toBeNull();
  });

  it('이번 턴에 깐(연장한) 미완성 구간은 유지', () => {
    const board = makeBoard({
      trackTiles: [
        { id: 't1', coord: { col: 1, row: 0 }, edges: [3, 0], owner: 'player1', trackType: 'simple', builtTurn: 2 },
      ] as never,
    });
    const { released } = releaseUnextendedTrack(board, 2);
    expect(released).toBe(0);
  });

  it('완성 링크(P↔C)는 미연장이어도 영구 소유 유지', () => {
    const board = makeBoard({
      trackTiles: [
        { id: 't1', coord: { col: 1, row: 0 }, edges: [3, 0], owner: 'player1', trackType: 'simple', builtTurn: 1 },
        { id: 't2', coord: { col: 2, row: 0 }, edges: [3, 0], owner: 'player1', trackType: 'simple', builtTurn: 1 },
        { id: 't3', coord: { col: 3, row: 0 }, edges: [3, 0], owner: 'player1', trackType: 'simple', builtTurn: 1 },
      ] as never,
    });
    const { released } = releaseUnextendedTrack(board, 2);
    expect(released).toBe(0);
  });

  it('가닥 없는 마을에 닿기만 한 구간은 미완성 → 공용화 (완성 오판 방지)', () => {
    const board = makeBoard({
      towns: [{ id: 'tw', name: 'tw', coord: { col: 2, row: 0 }, newCityColor: null }] as never,
      trackTiles: [
        { id: 't1', coord: { col: 1, row: 0 }, edges: [3, 0], owner: 'player1', trackType: 'simple', builtTurn: 1 },
      ] as never,
    });
    const { released } = releaseUnextendedTrack(board, 2);
    expect(released).toBe(1);
  });

  it('구간 단위 판정 — 한 덩어리 중 한 타일이라도 이번 턴 연장이면 구간 전체 유지', () => {
    const board = makeBoard({
      trackTiles: [
        { id: 't1', coord: { col: 1, row: 0 }, edges: [3, 0], owner: 'player1', trackType: 'simple', builtTurn: 1 },
        { id: 't2', coord: { col: 2, row: 0 }, edges: [3, 0], owner: 'player1', trackType: 'simple', builtTurn: 2 },
      ] as never,
    });
    const { released } = releaseUnextendedTrack(board, 2);
    expect(released).toBe(0);
  });

  it('builtTurn이 없는(구버전 저장) 미완성 타일도 공용화 대상', () => {
    const board = makeBoard({
      trackTiles: [
        { id: 't1', coord: { col: 1, row: 0 }, edges: [3, 0], owner: 'player1', trackType: 'simple' },
      ] as never,
    });
    const { released } = releaseUnextendedTrack(board, 2);
    expect(released).toBe(1);
  });

  it('ownerId 필터: 그 플레이어 구간만 해제 — 아직 건설 안 한 다른 플레이어 구간은 유지', () => {
    const board = makeBoard({
      trackTiles: [
        { id: 't1', coord: { col: 1, row: 0 }, edges: [3, 0], owner: 'player1', trackType: 'simple', builtTurn: 1 },
        // player2의 미완성 구간 (C 서쪽 dangling) — p1 건설 종료 시점엔 건드리면 안 됨
        { id: 't2', coord: { col: 3, row: 0 }, edges: [0, 3], owner: 'player2', trackType: 'simple', builtTurn: 1 },
      ] as never,
    });
    const { board: out, released } = releaseUnextendedTrack(board, 2, 'player1' as never);
    expect(released).toBe(1);
    expect(out.trackTiles.find(t => t.id === 't1')!.owner).toBeNull();
    expect(out.trackTiles.find(t => t.id === 't2')!.owner).toBe('player2');
  });
});
