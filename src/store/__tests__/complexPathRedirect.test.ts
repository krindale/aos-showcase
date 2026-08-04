// 복합 타일 경로 단위 방향 전환 회귀 테스트 (2026-08-04, 영국 맵 실전 발견)
//
// 룰 IV: "복합 트랙은 다른 플레이어 소유 트랙이 유지되도록 방향 전환해야 한다" — 복합 타일도
// 경로(P/S) 단위로 방향 전환이 가능해야 한다. 기존 canRedirectTrack은 복합 타일을 통째로
// 거부해, 공존 위의 미소유 기본 경로를 전환할 수 없었다 (실전: (6,8) 공존 — 미소유 [1,3] +
// player2 보조 [0,4]에서 미소유 경로 전환 불가).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { canRedirectTrack, pickRedirectPath, getRedirectableEdges } from '@/utils/trackValidation';

const at = (col: number, row: number) => (t: { coord: { col: number; row: number } }) =>
  t.coord.col === col && t.coord.row === row;

/** 실전 상태: (6,8) 공존 — 기본 [1,3] 미소유(SE는 Oxford 마을 방향), 보조 [0,4] player2 */
function setupCoexist(primaryOwner: 'player2' | null, secondaryOwner: 'player2' | null) {
  useGameStore.getState().initGame('southern-england', ['P1', 'P2', 'P3', 'P4', 'P5'], []);
  const s0 = useGameStore.getState();
  useGameStore.setState({
    currentTurn: 5,
    currentPhase: 'buildTrack',
    currentPlayer: 'player1',
    playerOrder: ['player1', 'player2', 'player3', 'player4', 'player5'],
    players: { ...s0.players, player1: { ...s0.players.player1, cash: 60, selectedAction: null } },
    phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3, lastBuiltCoords: [] },
    board: {
      ...s0.board,
      trackTiles: [
        {
          id: 'cx-68', coord: { col: 6, row: 8 }, edges: [1, 3], owner: primaryOwner,
          trackType: 'coexist' as const, builtTurn: 4,
          secondaryEdges: [0, 4], secondaryOwner, secondaryBuiltTurn: 5,
        },
        // 보조 경로 S-전환 테스트용: 보조 4변(NW)과 맞물리는 이웃 미소유 트랙
        { id: 'nb-57', coord: { col: 5, row: 7 }, edges: [1, 3], owner: null, trackType: 'simple' as const, builtTurn: 1 },
      ],
      townSpurs: [],
    },
  });
}

describe('복합 타일 경로 단위 방향 전환', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); });

  it('공존 위 미소유 기본 경로: 전환 가능 + 기본 변만 바뀌고 보조는 유지', () => {
    setupCoexist(null, 'player2');
    const b = useGameStore.getState().board;

    // 이전엔 복합 타일이라 통째로 거부되던 판정
    expect(canRedirectTrack({ col: 6, row: 8 }, b, 'player1')).toBe(true);
    expect(pickRedirectPath({ col: 6, row: 8 }, b, 'player1')).toBe('P');

    // 새 방향 후보에 보조 경로 변(0·4)은 없어야 한다
    const info = getRedirectableEdges({ col: 6, row: 8 }, b, 'player1', 'P')!;
    expect(info.availableEdges).not.toContain(0);
    expect(info.availableEdges).not.toContain(4);

    const target = info.availableEdges.find(e => e !== 3)!; // 현 방향(3) 외 아무 후보
    expect(useGameStore.getState().redirectTrack({ col: 6, row: 8 }, target)).toBe(true);

    const tile = useGameStore.getState().board.trackTiles.find(at(6, 8))!;
    expect(tile.edges.sort()).toEqual([1, target].sort()); // 기본: 연결변 1 유지 + 새 방향
    expect(tile.secondaryEdges).toEqual([0, 4]);           // 보조 경로 불변 (룰: 타 경로 유지)
    expect(tile.secondaryOwner).toBe('player2');
    expect(tile.owner).toBeNull();                          // 방향 전환 ≠ 인수 (미완성)
  });

  it('기본이 타인 소유면 보조(미소유) 경로가 선택되고 보조 변만 바뀐다', () => {
    setupCoexist('player2', null);
    const b = useGameStore.getState().board;

    expect(pickRedirectPath({ col: 6, row: 8 }, b, 'player1')).toBe('S');
    const info = getRedirectableEdges({ col: 6, row: 8 }, b, 'player1', 'S')!;
    // 기본 경로 변(1·3)은 후보에서 제외
    expect(info.availableEdges).not.toContain(1);
    expect(info.availableEdges).not.toContain(3);

    const target = info.availableEdges.find(e => e !== 0)!;
    expect(useGameStore.getState().redirectTrack({ col: 6, row: 8 }, target)).toBe(true);

    const tile = useGameStore.getState().board.trackTiles.find(at(6, 8))!;
    expect(tile.edges).toEqual([1, 3]);                     // 기본(타인) 경로 불변
    expect(tile.owner).toBe('player2');
    expect(tile.secondaryEdges!.sort()).toEqual([4, target].sort()); // 보조: 연결변 4 유지
  });

  it('두 경로 모두 타인 소유면 전환 불가', () => {
    setupCoexist('player2', 'player2');
    const b = useGameStore.getState().board;
    expect(canRedirectTrack({ col: 6, row: 8 }, b, 'player1')).toBe(false);
  });
});
