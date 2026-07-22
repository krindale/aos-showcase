/**
 * 미소유 미완성 트랙 재사용(인수 연장, 룰 IV) — AI 계획 판정 단위 테스트
 *
 * isReusableUnownedOnPath: 경로 위 미소유 타일을 "그대로(변 일치) 재사용"할 수 있는지.
 * vp.estimateRouteVP · turnPlan.computeTurnPlan · buildTrack 예비금 면제가 공유하는 판정이다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { isReusableUnownedOnPath, getClaimableUnownedTrackAt } from '../analyzer';
import { HexCoord, PlayerId } from '@/types/game';

describe('미소유 트랙 재사용 판정 (AI 계획)', () => {
  beforeEach(() => {
    useGameStore.getState().initGame('tutorial', ['Player1', 'Player2']);
  });

  function placeTrack(
    coord: HexCoord,
    edges: [number, number],
    owner: PlayerId | null,
    isGovernment = false
  ) {
    const state = useGameStore.getState();
    useGameStore.setState({
      board: {
        ...state.board,
        trackTiles: [
          ...state.board.trackTiles,
          {
            id: `track-${coord.col}-${coord.row}`,
            coord,
            edges,
            owner,
            trackType: 'simple' as const,
            ...(isGovernment ? { isGovernment: true } : {}),
          },
        ],
      },
    });
  }

  // 튜토리얼 odd-r: (2,1) odd row — edge2(SW)=(2,2)=O 도시, edge5(NE)=(3,0), edge4(NW)=(2,0)
  const PATH_ALIGNED: HexCoord[] = [
    { col: 2, row: 2 }, // O 도시
    { col: 2, row: 1 }, // 미소유 타일 [2,5]
    { col: 3, row: 0 }, // edge5 방향
  ];

  it('변이 경로와 정확히 일치하는 미소유 타일 = 재사용 가능', () => {
    placeTrack({ col: 2, row: 1 }, [2, 5], null);
    const board = useGameStore.getState().board;
    expect(isReusableUnownedOnPath(board, PATH_ALIGNED, 1)).toBe(true);
  });

  it('변이 어긋나면 재사용 불가', () => {
    placeTrack({ col: 2, row: 1 }, [2, 5], null);
    const board = useGameStore.getState().board;
    const pathMisaligned: HexCoord[] = [
      { col: 2, row: 2 },
      { col: 2, row: 1 },
      { col: 2, row: 0 }, // edge4 방향 — 타일 edges [2,5]에 없음
    ];
    expect(isReusableUnownedOnPath(board, pathMisaligned, 1)).toBe(false);
  });

  it('소유자 있는 트랙·정부 트랙은 인수 대상이 아니다', () => {
    placeTrack({ col: 2, row: 1 }, [2, 5], 'player2');
    let board = useGameStore.getState().board;
    expect(getClaimableUnownedTrackAt(board, { col: 2, row: 1 })).toBeNull();
    expect(isReusableUnownedOnPath(board, PATH_ALIGNED, 1)).toBe(false);

    // 정부 트랙(미소유·isGovernment)으로 교체
    useGameStore.setState({
      board: {
        ...board,
        trackTiles: board.trackTiles.map(t =>
          t.coord.col === 2 && t.coord.row === 1
            ? { ...t, owner: null, isGovernment: true }
            : t
        ),
      },
    });
    board = useGameStore.getState().board;
    expect(getClaimableUnownedTrackAt(board, { col: 2, row: 1 })).toBeNull();
  });

  it('경로 양 끝(출발/도착 위치)은 재사용 판정 대상이 아니다', () => {
    placeTrack({ col: 2, row: 1 }, [2, 5], null);
    const board = useGameStore.getState().board;
    expect(isReusableUnownedOnPath(board, PATH_ALIGNED, 0)).toBe(false);
    expect(isReusableUnownedOnPath(board, PATH_ALIGNED, 2)).toBe(false);
  });
});
