// 방향 전환으로 완성되는 링크의 소유 정규화 (claimCompletedLinkAfterRedirect) 회귀 테스트
//
// 실전 버그 (2026-08-04, southern-england game:ij8v): 미소유 타일 (2,9)를 방향 전환(기존 타일
// 재교체 경로)으로 내 미완성 구간 (3,9)와 이어 Coventry↔Nottingham 링크를 물리적으로 완성 →
// 룰상 "방향 전환은 인수 없음"이라 (2,9)가 미소유로 남아 소유 혼합 링크가 됐고, 소유자 인식
// 완성 판정(findCompletedLinks)에 안 잡혀 다음 차례말 releaseUnextendedTrack이 내 (3,9)까지
// 해제 → 둘 다 "미소유 완성 링크"로 영구 동결(인수도 해제도 불가).
//
// 수정: 방향 전환/기존 타일 교체로 물리 링크가 완성되고 링크 소유자가 {행위자, 미소유}뿐이면
// 미소유 타일을 행위자에게 귀속한다. 미완성이면 룰 원문대로 인수 없음(항등).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { releaseUnextendedTrack } from '@/store/helpers/boardRules';

const at = (col: number, row: number) => (t: { coord: { col: number; row: number } }) =>
  t.coord.col === col && t.coord.row === row;

/** 실전 로그 상태 재현: 미소유 (2,9)[2,5](봇 건설→해제→사용자 undo로 전환 취소된 상태) +
 *  내 (4,8)·Coventry 가닥·(3,9) 트랙 (T3 건설, 인수 실패로 (2,9)는 미소유 그대로) */
function setupMixedBoard() {
  useGameStore.getState().initGame('southern-england', ['P1', 'P2', 'P3', 'P4', 'P5'], []);
  const s0 = useGameStore.getState();
  useGameStore.setState({
    currentTurn: 4,
    currentPhase: 'buildTrack',
    currentPlayer: 'player1',
    playerOrder: ['player1', 'player2', 'player3', 'player4', 'player5'],
    players: { ...s0.players, player1: { ...s0.players.player1, cash: 60, selectedAction: null } },
    phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3, lastBuiltCoords: [] },
    board: {
      ...s0.board,
      trackTiles: [
        { id: 'unowned-29', coord: { col: 2, row: 9 }, edges: [2, 5], owner: null, trackType: 'simple' as const, builtTurn: 1 },
        { id: 'p1-48', coord: { col: 4, row: 8 }, edges: [4, 1], owner: 'player1' as const, trackType: 'simple' as const, builtTurn: 3 },
        { id: 'p1-39', coord: { col: 3, row: 9 }, edges: [0, 3], owner: 'player1' as const, trackType: 'simple' as const, builtTurn: 3 },
      ],
      townSpurs: [
        { id: 'sp1', townCoord: { col: 4, row: 9 }, edge: 4, owner: 'player1' as const, builtTurn: 3 },
        { id: 'sp2', townCoord: { col: 4, row: 9 }, edge: 3, owner: 'player1' as const, builtTurn: 3 },
      ],
    },
  });
}

describe('방향 전환 완성 링크 소유 정규화', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); });

  it('기존 타일 교체(buildTrack 경로)로 링크 완성 → 미소유 타일이 행위자에게 귀속되고 해제되지 않는다', () => {
    setupMixedBoard();
    // 실전 T4 액션: (2,9)를 [2,0]으로 재교체 → Coventry(4,9)↔Nottingham(2,10) 물리 완성
    const ok = useGameStore.getState().buildTrack({ col: 2, row: 9 }, [2, 0]);
    expect(ok).toBe(true);

    const b = useGameStore.getState().board;
    expect(b.trackTiles.find(at(2, 9))!.owner).toBe('player1'); // 귀속됨
    expect(b.trackTiles.find(at(3, 9))!.owner).toBe('player1');

    // 차례말/턴말 해제에서 더 이상 풀리지 않는다 (소유 단일 완성 링크)
    const rel = releaseUnextendedTrack(b, 4, 'player1');
    expect(rel.released).toBe(0);
    const rel5 = releaseUnextendedTrack(b, 5);
    expect(rel5.released).toBe(0);
  });

  it('redirectTrack 경로로 링크 완성 → 동일하게 귀속된다', () => {
    setupMixedBoard();
    const ok = useGameStore.getState().redirectTrack({ col: 2, row: 9 }, 0);
    expect(ok).toBe(true);
    const b = useGameStore.getState().board;
    expect(b.trackTiles.find(at(2, 9))!.owner).toBe('player1');
    expect(releaseUnextendedTrack(b, 4, 'player1').released).toBe(0);
  });

  it('링크가 완성되지 않는 방향 전환은 인수 없음 (룰 원문 유지)', () => {
    setupMixedBoard();
    // (3,9)를 제거해 서쪽이 끊긴 상태로 — (2,9)를 [2,0]으로 돌려도 링크 미완성
    const s = useGameStore.getState();
    useGameStore.setState({
      board: { ...s.board, trackTiles: s.board.trackTiles.filter(t => !at(3, 9)(t)) },
    });
    const ok = useGameStore.getState().redirectTrack({ col: 2, row: 9 }, 0);
    expect(ok).toBe(true);
    // 미완성이므로 미소유 그대로 (방향 전환 ≠ 연장)
    expect(useGameStore.getState().board.trackTiles.find(at(2, 9))!.owner).toBeNull();
  });

  it('T3 실전 순서(전환 undo 후 새 타일 건설)에서도 새 타일 인수 경로는 기존 동작 유지', () => {
    // 새 타일 연장 인수(findClaimableSectionKeys)의 회귀 확인: (2,9)가 [2,0]으로 이미 전환돼
    // 있으면 (3,9) 신설이 변 맞물림으로 즉시 인수한다 (기존 동작).
    useGameStore.getState().initGame('southern-england', ['P1', 'P2', 'P3', 'P4', 'P5'], []);
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentTurn: 3,
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      playerOrder: ['player1', 'player2', 'player3', 'player4', 'player5'],
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 60, selectedAction: null } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3, lastBuiltCoords: [] },
      board: {
        ...s0.board,
        trackTiles: [
          { id: 'unowned-29', coord: { col: 2, row: 9 }, edges: [2, 0], owner: null, trackType: 'simple' as const, builtTurn: 1 },
          { id: 'p1-48', coord: { col: 4, row: 8 }, edges: [4, 1], owner: 'player1' as const, trackType: 'simple' as const, builtTurn: 3 },
        ],
        townSpurs: [
          { id: 'sp1', townCoord: { col: 4, row: 9 }, edge: 4, owner: 'player1' as const, builtTurn: 3 },
          { id: 'sp2', townCoord: { col: 4, row: 9 }, edge: 3, owner: 'player1' as const, builtTurn: 3 },
        ],
      },
    });
    expect(useGameStore.getState().buildTrack({ col: 3, row: 9 }, [0, 3])).toBe(true);
    expect(useGameStore.getState().board.trackTiles.find(at(2, 9))!.owner).toBe('player1');
  });
});
