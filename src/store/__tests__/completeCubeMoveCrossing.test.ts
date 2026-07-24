import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { createInitialGameState } from '@/store/helpers/setup';
import { getNeighborHex } from '@/utils/hexGrid';
import type { PlayerId, TrackTile, MovingCubeContext } from '@/types/game';

/**
 * 실정산 경로(completeCubeMove)의 교차(crossing) 소유자 귀속 회귀 테스트.
 *
 * 2026-07-24 발견: trackOwnerForEntry 수정이 레거시 moveGoods 정산에만 들어가고
 * 실제 게임이 쓰는 completeCubeMove에는 빠져 있었다 — 미리보기(getPathLinkOwners)는
 * 맞는데 실수입은 crossing의 primary owner(상대)에게 가던 "가이드는 맞는데 수익은
 * 저놈한테" 증상의 진짜 원인 (당시 HMR로 오진).
 */
describe('completeCubeMove: 교차 트랙 수입 귀속 (실정산 경로)', () => {
  const ME: PlayerId = 'player1';
  const OPP: PlayerId = 'player2';

  // 교차 헥스와 인접 좌표 (tutorial 맵 좌표계 재사용 — 보드 자체는 테스트용으로 덮어씀)
  const CROSS = { col: 5, row: 5 };
  const A = getNeighborHex(CROSS, 1); // 내 secondary 트랙의 한쪽 끝
  const B = getNeighborHex(CROSS, 5); // 반대쪽 끝

  beforeEach(() => {
    const s = createInitialGameState('rust-belt', ['나', '상대'], []);
    // 보드를 최소 구성으로 덮어씀: 도시 a(A)—교차(CROSS)—도시 b(B), 교차 타일은
    // primary [3,0]=상대 / secondary [1,5]=나
    const crossTile = {
      id: 'x1',
      coord: CROSS,
      edges: [3, 0] as [number, number],
      owner: OPP,
      trackType: 'crossing',
      secondaryEdges: [1, 5] as [number, number],
      secondaryOwner: ME,
    } as TrackTile;
    s.board = {
      ...s.board,
      cities: [
        { id: 'a', name: 'a', coord: A, color: 'red', cubes: [] },
        { id: 'b', name: 'b', coord: B, color: 'blue', cubes: [] },
      ],
      towns: [],
      trackTiles: [crossTile],
    };
    s.currentPhase = 'moveGoods';
    s.currentPlayer = ME;
    useGameStore.setState(s);
  });

  const settle = (path: { col: number; row: number }[]) => {
    useGameStore.setState({
      ui: {
        ...useGameStore.getState().ui,
        movingCube: {
          path,
          color: 'blue',
          progress: 0,
          context: { playerId: ME, phase: 'moveGoods' } as MovingCubeContext,
        },
      } as never,
    });
    useGameStore.getState().completeCubeMove();
  };

  it('내 secondary(crossing)를 지나면 수입은 나에게 (상대 owner 아님)', () => {
    const before = {
      me: useGameStore.getState().players[ME].income,
      opp: useGameStore.getState().players[OPP].income,
    };
    // a(A) → 교차(CROSS, 내 secondary edges 1-5) → b(B)
    settle([A, CROSS, B]);
    const after = useGameStore.getState().players;
    expect(after[ME].income).toBe(before.me + 1);   // ❌ 수정 전: 상대에게 +1
    expect(after[OPP].income).toBe(before.opp);
  });

  it('상대 primary를 지나면 수입은 상대에게 (기존 동작 유지)', () => {
    const C = getNeighborHex(CROSS, 3);
    const D = getNeighborHex(CROSS, 0);
    useGameStore.setState({
      board: {
        ...useGameStore.getState().board,
        cities: [
          { id: 'c', name: 'c', coord: C, color: 'red', cubes: [] },
          { id: 'd', name: 'd', coord: D, color: 'blue', cubes: [] },
        ],
      } as never,
    });
    const before = {
      me: useGameStore.getState().players[ME].income,
      opp: useGameStore.getState().players[OPP].income,
    };
    settle([C, CROSS, D]);
    const after = useGameStore.getState().players;
    expect(after[OPP].income).toBe(before.opp + 1);
    expect(after[ME].income).toBe(before.me);
  });
});
