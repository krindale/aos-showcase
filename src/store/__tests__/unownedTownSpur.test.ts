import { describe, it, expect } from 'vitest';
import { findMissingTownSpurs } from '../helpers/boardRules';
import { isValidConnectionPoint } from '@/utils/trackValidation';
import { getBuildableNeighbors, getNeighborHex, getOppositeEdge } from '@/utils/hexGrid';
import { BoardState, HexCoord } from '@/types/game';

/**
 * 룰 IV: "다른 플레이어가 미소유 미완성 구간을 연장하면 소유권 주장 가능".
 * 그 연장이 **마을 가닥**인 경우(미소유 트랙이 마을 변에 닿아 끊겨 있음)에도 성립해야 한다.
 *
 * 실제 제보(Southern England, 턴 4): 주인 없는 미완성 트랙이 Oxford 마을 변에서 끊겨 있는데
 * 마을을 클릭해도, 그 트랙을 시작점으로 잡아도 아무 반응이 없었다.
 */

const TOWN: HexCoord = { col: 6, row: 9 };
const SPUR_EDGE = 0;

/** 마을 TOWN 옆(SPUR_EDGE 방향)에 마을 쪽으로 끊긴 트랙 1장만 있는 최소 보드 */
const boardWithNeighborTrack = (owner: string | null): BoardState => {
  const nb = getNeighborHex(TOWN, SPUR_EDGE);
  const facing = getOppositeEdge(SPUR_EDGE);
  return {
    hexTiles: [
      { coord: TOWN, terrain: 'plain' },
      { coord: nb, terrain: 'plain' },
      // 트랙의 반대쪽 끝이 뻗어 나가는 빈 헥스 (연장 후보가 생기도록)
      { coord: getNeighborHex(nb, (facing + 3) % 6), terrain: 'plain' },
    ],
    cities: [],
    towns: [{ id: 'OX', coord: TOWN, newCityColor: null, cubes: [] }],
    townSpurs: [],
    trackTiles: [
      {
        id: 't1',
        coord: nb,
        edges: [facing, (facing + 3) % 6],
        trackType: 'simple',
        owner,
        builtTurn: 1,
      },
    ],
  } as unknown as BoardState;
};

describe('미소유 미완성 트랙 → 마을 가닥으로 링크 완성 (룰 IV 인수 연장)', () => {
  it('내 트랙이 마을 변에 닿아 있으면 가닥 후보가 나온다 (기존 동작)', () => {
    const board = boardWithNeighborTrack('player1');
    expect(findMissingTownSpurs(TOWN, board, 'player1')).toHaveLength(1);
  });

  it('주인 없는(미소유) 트랙도 연결점·연장 시작점으로는 인정된다', () => {
    const board = boardWithNeighborTrack(null);
    const trackCoord = board.trackTiles[0].coord;
    // 트랙 자체는 클릭 가능한 연결점이고, 빈 헥스 쪽으로는 연장도 가능하다
    expect(isValidConnectionPoint(trackCoord, board, 'player1')).toBe(true);
    expect(getBuildableNeighbors(trackCoord, board, 'player1', true).length).toBeGreaterThan(0);
  });

  it('주인 없는 트랙이 마을 변에 닿아 있어도 가닥 후보가 나와야 한다', () => {
    const board = boardWithNeighborTrack(null);
    expect(findMissingTownSpurs(TOWN, board, 'player1')).toHaveLength(1);
  });

  it('상대 소유 트랙이 닿은 변은 여전히 가닥 후보가 아니다', () => {
    const board = boardWithNeighborTrack('player2');
    expect(findMissingTownSpurs(TOWN, board, 'player1')).toHaveLength(0);
  });
});
