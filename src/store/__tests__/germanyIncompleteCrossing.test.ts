import { describe, it, expect } from 'vitest';
import {
  hasIncompleteNewTracks,
  removeIncompleteNewTracks,
} from '@/store/helpers/boardRules';
import { getNeighborHex } from '@/utils/hexGrid';
import type { BoardState, City, TrackTile } from '@/types/game';

/**
 * 독일 미완성 링크 제거 × 교차(crossing) 회귀 테스트.
 *
 * 2026-07-24 독일 봇 게임 실측: 미완성 신설 트랙 제거($5 환불)가 돌았는데 같은 턴에
 * 상대 트랙 위에 얹은 교차(secondary)는 보드에 그대로 남았다. 원인 — 검출(owner·builtTurn)과
 * 완성 판정(primary edges) 모두 primary 기준이라 secondary 추가분이 통째로 빠짐.
 * 수정 — secondaryBuiltTurn 기록 + secondary 완성판정 + 타일 삭제 대신 단순 트랙 복원 + 교체비 환불.
 */
describe('독일 미완성 제거: 이번 턴 교차(secondary) 되돌림', () => {
  const CROSS = { col: 5, row: 5 };
  const C = getNeighborHex(CROSS, 3);
  const D = getNeighborHex(CROSS, 0);
  const TURN = 2;

  const city = (id: string, coord: { col: number; row: number }): City =>
    ({ id, name: id, coord, color: 'red', cubes: [] }) as unknown as City;

  /** 상대(player2)의 완성 링크 C—CROSS—D 위에, 내(player1)가 이번 턴 미완성 교차를 얹은 보드 */
  const makeBoard = (): BoardState =>
    ({
      // 상대 primary는 양끝이 도시라 완성 링크. 내 secondary(1-5)는 어느 도시에도 안 닿음(미완성).
      cities: [city('c', C), city('d', D)],
      towns: [],
      hexTiles: [{ coord: CROSS, terrain: 'plain' }],
      trackTiles: [
        {
          id: 'x1',
          coord: CROSS,
          edges: [3, 0],
          owner: 'player2',
          builtTurn: 1,
          trackType: 'crossing',
          secondaryEdges: [1, 5],
          secondaryOwner: 'player1',
          secondaryBuiltTurn: TURN,
        } as TrackTile,
      ],
      townSpurs: [],
    }) as unknown as BoardState;

  it('이번 턴 미완성 교차가 검출된다 (hasIncompleteNewTracks)', () => {
    expect(hasIncompleteNewTracks(makeBoard(), TURN, 'player1')).toBe(true);
    // 원소유자(상대)에겐 미완성 아님 — primary는 완성 링크
    expect(hasIncompleteNewTracks(makeBoard(), TURN, 'player2')).toBe(false);
  });

  it('제거 시 타일을 지우지 않고 단순 트랙으로 복원 + 교체비($3) 환불', () => {
    const { board, refund } = removeIncompleteNewTracks(makeBoard(), TURN, 'player1');
    const t = board.trackTiles.find(x => x.coord.col === CROSS.col && x.coord.row === CROSS.row)!;
    expect(t).toBeTruthy();                 // 원 타일 보존 (상대 트랙 삭제 금지)
    expect(t.owner).toBe('player2');        // 원소유자 유지
    expect(t.trackType).toBe('simple');     // 교차 되돌림
    expect(t.secondaryEdges).toBeUndefined();
    expect(t.secondaryOwner).toBeUndefined();
    expect(refund).toBe(3);                 // crossing 교체비 환불
  });

  it('지난 턴에 얹은 교차는 건드리지 않는다', () => {
    const b = makeBoard();
    (b.trackTiles[0] as TrackTile).secondaryBuiltTurn = TURN - 1;
    expect(hasIncompleteNewTracks(b, TURN, 'player1')).toBe(false);
    const { board, refund } = removeIncompleteNewTracks(b, TURN, 'player1');
    expect(board.trackTiles[0].secondaryOwner).toBe('player1'); // 그대로
    expect(refund).toBe(0);
  });

  it('마을 가닥: 딸린 타일이 제거되면 고아 가닥도 제거 + 환불 (죽은 조건 교정)', () => {
    // 마을 T — (가닥 e0) — 타일 X(미완성, 이번 턴) 구조: 타일이 제거되면 가닥도 제거돼야 한다
    const T = { col: 3, row: 3 };
    const X = getNeighborHex(T, 0);
    const b = {
      cities: [],
      towns: [{ id: 't1', coord: T, newCityColor: null, cubes: [] }],
      hexTiles: [{ coord: X, terrain: 'plain' }],
      trackTiles: [
        { id: 'x2', coord: X, edges: [3, 0], owner: 'player1', builtTurn: TURN, trackType: 'simple' } as TrackTile,
      ],
      townSpurs: [{ id: 's1', townCoord: T, edge: 0, owner: 'player1', builtTurn: TURN }],
    } as unknown as BoardState;

    expect(hasIncompleteNewTracks(b, TURN, 'player1')).toBe(true);
    const { board, refund } = removeIncompleteNewTracks(b, TURN, 'player1', 1);
    expect(board.trackTiles).toHaveLength(0);       // 미완성 타일 제거
    expect(board.townSpurs).toHaveLength(0);        // 고아 가닥도 제거 ❌ 수정 전: 남았음
    expect(refund).toBe(2 + 1);                     // 평지 타일 $2 + 가닥 $1
  });

  it('마을 가닥: 변 너머 구간이 완성 링크면 가닥 유지', () => {
    // 도시 CD — 타일 X — 마을 T (가닥) : X는 완성 링크(도시↔마을) → 가닥 유지
    const T = { col: 3, row: 3 };
    const X = getNeighborHex(T, 0);
    const CD = getNeighborHex(X, 0);
    const b = {
      cities: [city('cd', CD)],
      towns: [{ id: 't1', coord: T, newCityColor: null, cubes: [] }],
      hexTiles: [{ coord: X, terrain: 'plain' }],
      trackTiles: [
        { id: 'x3', coord: X, edges: [3, 0], owner: 'player1', builtTurn: TURN, trackType: 'simple' } as TrackTile,
      ],
      townSpurs: [{ id: 's1', townCoord: T, edge: 0, owner: 'player1', builtTurn: TURN }],
    } as unknown as BoardState;

    expect(hasIncompleteNewTracks(b, TURN, 'player1')).toBe(false);
    const { board, refund } = removeIncompleteNewTracks(b, TURN, 'player1', 1);
    expect(board.townSpurs).toHaveLength(1);
    expect(board.trackTiles).toHaveLength(1);
    expect(refund).toBe(0);
  });

  it('secondary가 완성 링크면 제거 대상이 아니다', () => {
    const b = makeBoard();
    // secondary 양끝(1,5 방향 이웃)에도 도시를 놓아 완성 링크로 만든다
    const A = getNeighborHex(CROSS, 1);
    const B = getNeighborHex(CROSS, 5);
    b.cities.push(city('a', A), city('b', B));
    expect(hasIncompleteNewTracks(b, TURN, 'player1')).toBe(false);
  });
});
