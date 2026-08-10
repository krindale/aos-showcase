// 트랙이 나갈 방향 후보는 항상 "화면에 있는 칸"이어야 한다 (2026-08-10 리뷰)
//
// getExitDirections가 호수만 거르고 맵 밖 이웃은 그대로 반환하면, 가장자리 헥스에서
// 화면에 없는 칸이 후보로 찍힌다. 그 헥스가 기존 트랙 겹침 필터까지 겹치면 남은 후보가
// 전부 맵 밖이 되어 "노란 칸이 하나도 없는" 상태가 되고, 사용자에겐 무반응으로 보인다.
// isValidBuildTarget은 이미 같은 기준으로 맵 밖을 거른다 — 판정이 일치해야 한다.

import { describe, it, expect } from 'vitest';
import { getMapData } from '@/utils/mapRegistry';
import { getExitDirections, getBuildableNeighbors, hexCoordsEqual } from '@/utils/hexGrid';
import { BoardState, HexCoord } from '@/types/game';

const MAPS = ['southern-england', 'rust-belt', 'moon'] as const;

describe('나갈 방향 후보는 맵 안에만 있다', () => {
  for (const mapId of MAPS) {
    it(`${mapId} — 모든 도시 시작점에서 맵 밖 방향이 후보로 나오지 않는다`, () => {
      const board: BoardState = getMapData(mapId).createBoardState();
      const onMap = (c: HexCoord) =>
        board.hexTiles.some(h => hexCoordsEqual(h.coord, c)) ||
        board.cities.some(x => hexCoordsEqual(x.coord, c));

      const offMap: string[] = [];
      let checked = 0;

      for (const city of board.cities) {
        for (const n of getBuildableNeighbors(city.coord, board, 'player1', true)) {
          for (const d of getExitDirections(n.coord, n.targetEdge, board)) {
            checked++;
            if (!onMap(d.neighborCoord)) {
              offMap.push(`${city.id} → (${n.coord.col},${n.coord.row}) → (${d.neighborCoord.col},${d.neighborCoord.row})`);
            }
          }
        }
      }

      expect(checked).toBeGreaterThan(0); // 전제 확인: 실제로 후보를 훑었다
      expect(offMap).toEqual([]);
    });
  }

  it('달(moon)은 랩 어라운드라 가장자리에서도 후보가 살아 있다 — 맵 밖 제외에 휩쓸리지 않는다', () => {
    const board: BoardState = getMapData('moon').createBoardState();
    // 랩 변을 가진 헥스에서 시작해도 나갈 방향이 남아야 한다 (반대편 좌표로 이어지므로)
    const wrapHex = board.hexTiles.find(h =>
      (board.wrapEdges ?? []).some(w =>
        hexCoordsEqual(w.a.coord, h.coord) || hexCoordsEqual(w.b.coord, h.coord)
      )
    );
    expect(wrapHex).toBeDefined();
    const dirs = getExitDirections(wrapHex!.coord, 0, board);
    expect(dirs.length).toBeGreaterThan(0);
  });
});
