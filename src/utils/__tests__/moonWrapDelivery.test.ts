/**
 * 달 랩 어라운드 배달 회귀 테스트 (2026-08-08 사용자 리포트)
 *
 * 리포트: 우측면(east)이 밤일 때 Serenitatis(2,10)의 화물이 맵 끝 랩 연결
 * (1,10)↔(9,6)을 건너 반대편으로 이송돼야 하는데, 운송 가이드도 안 나오고 이송도 안 됐다.
 *
 * 원인: 같은 두 헥스가 **랩 변 두 쌍**(33번: (9,6)변5↔(1,10)변2 / 34번: (9,6)변0↔(1,10)변3)
 * 으로 이중 인접하는데, 좌표→변 역산(getConnectingEdge)이 "처음 만나는 변"을 돌려줘
 * 실제 트랙이 쓰는 변과 다른 변으로 진입 판정 → 경로 DFS가 랩 너머에서 죽었다.
 * 수정: getConnectingEdge가 이중 인접 시 실제 트랙이 놓인 변 쌍을 선택 +
 * getEdgeBetweenHexes(AI 건설용)는 최소 랩 번호 쌍으로 양방향 일관 선택.
 */

import { describe, it, expect } from 'vitest';
import { getMapData } from '@/utils/mapRegistry';
import {
  findReachableDestinations,
  findRouteOptions,
  hexCoordsEqual,
  getOppositeEdge,
} from '@/utils/hexGrid';
import { getEdgeBetweenHexes } from '@/ai/strategy/analyzer';
import type { BoardState, HexCoord, TrackTile, PlayerId } from '@/types/game';

const P1: PlayerId = 'player1';

// 데이터 좌표 (moonMap toData 기준): serenitatis=(2,10), 랩 쌍 33/34 = (9,6)↔(1,10), nubium=(8,7)
const SEREN: HexCoord = { col: 2, row: 10 };
const WRAP_A: HexCoord = { col: 1, row: 10 }; // 화면 (8,2) — serenitatis 바로 위
const WRAP_B: HexCoord = { col: 9, row: 6 };  // 화면 (4,10) — 반대편 아래 끝
const NUBIUM: HexCoord = { col: 8, row: 7 };

/** wrapNumber(33 또는 34)의 매칭된 변 쌍으로 랩 횡단 링크(serenitatis↔nubium)를 놓는다 */
function makeBoardWithWrapLink(wrapNumber: number): BoardState {
  const board = getMapData('moon').createBoardState();

  // 픽스처 자기 검증 — 좌표 가정이 맵 데이터와 어긋나면 테스트 자체가 무효
  expect(board.cities.find(c => c.id === 'serenitatis')!.coord).toEqual(SEREN);
  expect(board.cities.find(c => c.id === 'nubium')!.coord).toEqual(NUBIUM);
  const wrap = (board.wrapEdges ?? []).find(w => w.number === wrapNumber)!;
  expect(wrap).toBeDefined();
  const sideA = hexCoordsEqual(wrap.a.coord, WRAP_A) ? wrap.a : wrap.b;
  const sideB = hexCoordsEqual(wrap.a.coord, WRAP_A) ? wrap.b : wrap.a;
  expect(sideA.coord).toEqual(WRAP_A);
  expect(sideB.coord).toEqual(WRAP_B);

  const eA1 = getEdgeBetweenHexes(WRAP_A, SEREN);  // 일반 인접
  const eB2 = getEdgeBetweenHexes(WRAP_B, NUBIUM); // 일반 인접
  expect(eA1).toBeGreaterThanOrEqual(0);
  expect(eB2).toBeGreaterThanOrEqual(0);

  const tiles: TrackTile[] = [
    { id: 'wrapA', coord: WRAP_A, edges: [eA1, sideA.edge] as [number, number], owner: P1, trackType: 'simple' },
    { id: 'wrapB', coord: WRAP_B, edges: [sideB.edge, eB2] as [number, number], owner: P1, trackType: 'simple' },
  ];
  board.trackTiles.push(...tiles);
  return board;
}

describe.each([33, 34])('달 랩 어라운드 배달 — 랩 %i번 변 쌍', (wrapNumber) => {
  it('우측면(east)이 밤이어도 낮쪽 노랑 도시로 랩을 건너 배달 가능하다', () => {
    const board = makeBoardWithWrapLink(wrapNumber);
    board.nightSide = 'east'; // 사용자 상황: 우측면 밤 (serenitatis 밤, nubium 낮)

    const reachable = findReachableDestinations(SEREN, board, P1, 3, 'yellow');
    expect(reachable.some(d => hexCoordsEqual(d.coord, NUBIUM))).toBe(true);

    const options = findRouteOptions(SEREN, NUBIUM, board, P1, 3, 'yellow');
    expect(options.length).toBeGreaterThan(0);
  });

  it('반대 방향(west가 밤 = serenitatis 낮)으로도 랩을 건너 배달 가능하다', () => {
    const board = makeBoardWithWrapLink(wrapNumber);
    board.nightSide = 'west';
    const reachable = findReachableDestinations(NUBIUM, board, P1, 3, 'purple');
    expect(reachable.some(d => hexCoordsEqual(d.coord, SEREN))).toBe(true);
  });
});

describe('getEdgeBetweenHexes — 랩 이중 인접의 양방향 일관성 (AI 건설 어긋남 방지)', () => {
  it('(1,10)↔(9,6) 양방향 호출이 같은 랩 번호 쌍(반대변 관계)을 고른다', () => {
    const board = getMapData('moon').createBoardState();
    const ab = getEdgeBetweenHexes(WRAP_A, WRAP_B, board);
    const ba = getEdgeBetweenHexes(WRAP_B, WRAP_A, board);
    expect(ab).toBeGreaterThanOrEqual(0);
    expect(ba).toBe(getOppositeEdge(ab)); // 어긋나면 봇이 서로 다른 변으로 타일을 깔아 링크 불성립
  });
});
