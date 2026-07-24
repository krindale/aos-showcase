// 교차/공존(complex) 트랙에서 "화물이 실제로 지나는 트랙"의 소유자 판정 회귀 테스트.
//
// 버그(2026-07-23 사용자 보고): 상대 트랙 위에 내가 crossing을 깔면 그 타일은
// owner=상대 / secondaryOwner=나 가 된다. 내 secondary 트랙으로 화물을 옮겼는데도
// getPathLinkOwners(미리보기 findRouteOptions + 정산 completeCubeMove 공통)가
// track.owner(=상대)만 집어 수입이 상대에게 갔다.
import { describe, it, expect } from 'vitest';
import { getPathLinkOwners, getNeighborHex, trackOwnerForEntry } from '@/utils/hexGrid';
import type { BoardState, City, TrackTile } from '@/types/game';

const CROSS = { col: 5, row: 5 };
// 교차 타일의 두 독립 트랙: primary [3,0] (상대), secondary [1,5] (나)
const A = getNeighborHex(CROSS, 1); // secondary 트랙의 한쪽 끝 방향
const B = getNeighborHex(CROSS, 5); // secondary 트랙의 반대쪽 끝 방향
const C = getNeighborHex(CROSS, 3); // primary 트랙의 한쪽 끝 방향
const D = getNeighborHex(CROSS, 0); // primary 트랙의 반대쪽 끝 방향

const city = (id: string, coord: { col: number; row: number }): City =>
  ({ id, name: id, coord, color: 'red', cubes: [] }) as unknown as City;

const crossTile: TrackTile = {
  coord: CROSS,
  edges: [3, 0],
  owner: 'player2',            // 기존(상대) 트랙
  secondaryEdges: [1, 5],
  secondaryOwner: 'player1',   // 내가 그 위에 깐 crossing
} as unknown as TrackTile;

const board = {
  cities: [city('a', A), city('b', B), city('c', C), city('d', D)],
  towns: [],
  trackTiles: [crossTile],
  hexTiles: [],
} as unknown as BoardState;

describe('교차 트랙 소유자 판정 (getPathLinkOwners)', () => {
  it('내 secondary 트랙(crossing)을 지나면 수입은 나(secondaryOwner)에게', () => {
    // A → 교차헥스 → B : secondaryEdges[1,5]를 타는 경로 = 내 트랙
    const owners = getPathLinkOwners([A, CROSS, B], board);
    expect(owners).toEqual(['player1']); // ❌ 수정 전엔 'player2'(primary owner)였다
  });

  it('상대 primary 트랙을 지나면 수입은 상대(owner)에게', () => {
    // C → 교차헥스 → D : edges[3,0]을 타는 경로 = 상대 트랙
    const owners = getPathLinkOwners([C, CROSS, D], board);
    expect(owners).toEqual(['player2']);
  });

  it('trackOwnerForEntry: 들어온 edge로 primary/secondary를 구분한다', () => {
    expect(trackOwnerForEntry(crossTile, 1)).toBe('player1'); // secondaryEdges
    expect(trackOwnerForEntry(crossTile, 5)).toBe('player1'); // secondaryEdges
    expect(trackOwnerForEntry(crossTile, 3)).toBe('player2'); // edges
    expect(trackOwnerForEntry(crossTile, 0)).toBe('player2'); // edges
  });

  it('교차가 아닌 단순 트랙은 기존과 동일하게 owner를 쓴다 (무영향)', () => {
    const simple = { coord: CROSS, edges: [1, 5], owner: 'player3' } as unknown as TrackTile;
    const simpleBoard = { ...board, trackTiles: [simple] } as unknown as BoardState;
    expect(getPathLinkOwners([A, CROSS, B], simpleBoard)).toEqual(['player3']);
    expect(trackOwnerForEntry(simple, 1)).toBe('player3');
  });
});
