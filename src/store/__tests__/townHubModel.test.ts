import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../gameStore';
import { getBuildableNeighbors, findTrackCubeDeliveries, getConnectedNeighbors, findCompletedLinks } from '@/utils/hexGrid';
import { playerConnectsToTown } from '@/utils/trackValidation';
import { TrackTile, TownSpur } from '@/types/game';

// 마을 가닥(스퍼) 모델:
// - 마을 헥스 안에는 트랙 "타일"이 아니라 "가닥(원→변)"이 존재
// - 노선이 마을에 연결될 때 가닥이 함께 건설되며, 가닥도 건설 1회로 카운트 (+$1)
// - 연결된 노선이 3개면 마을 안 가닥도 3개
// - 이동/배달/완성 링크는 가닥이 있는 변으로만
describe('마을 가닥(스퍼) 모델', () => {
  const track = (id: string, col: number, row: number, edges: [number, number], owner: 'player1' | 'player2', cube?: string): TrackTile => ({
    id, coord: { col, row }, edges, owner, trackType: 'simple',
    ...(cube ? { cube: cube as TrackTile['cube'] } : {}),
  });
  const spur = (id: string, col: number, row: number, edge: number, owner: 'player1' | 'player2'): TownSpur => ({
    id, townCoord: { col, row }, edge, owner,
  });

  beforeEach(() => {
    useGameStore.getState().initGame('st-lucia', ['Human', 'AI-2'], [{ playerIndex: 1, name: 'AI-2' }]);
  });

  it('마을 헥스에는 트랙 타일을 배치할 수 없다', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      board: { ...s0.board, trackTiles: [track('t1', 6, 3, [3, 0], 'player1')] },
    });
    expect(useGameStore.getState().canBuildTrack({ col: 5, row: 3 }, [0, 3])).toBe(false);
  });

  it('마을 변에 닿는 건설은 가닥이 함께 건설된다 (카운트 2, 비용 +$1)', () => {
    const s0 = useGameStore.getState();
    // 첫 트랙: 마을 BI(5,3) 북서쪽 (5,2)에 [1,4] — edge 1(SE)이 마을 변에 닿음 (townsAnchorFirstTrack)
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3 },
      board: { ...s0.board, trackTiles: [] },
    });
    const ok = useGameStore.getState().buildTrack({ col: 5, row: 2 }, [1, 4]);
    expect(ok).toBe(true);
    const f = useGameStore.getState();
    expect(f.phaseState.builtTracksThisTurn).toBe(2); // 타일 1 + 가닥 1
    expect((f.board.townSpurs ?? []).length).toBe(1);
    expect(f.players.player1.cash).toBe(20 - 2 - 1); // 평지 $2 + 가닥 $1
    expect(playerConnectsToTown({ col: 5, row: 3 }, f.board, 'player1')).toBe(true);
  });

  it('잔여 카운트가 1뿐이면 마을 연결 건설(2 필요)은 거부된다', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 2, maxTracksThisTurn: 3 },
      board: { ...s0.board, trackTiles: [] },
    });
    expect(useGameStore.getState().canBuildTrack({ col: 6, row: 3 }, [3, 0])).toBe(false);
  });

  it('가닥이 있는 마을에서 6방향으로 새 노선을 시작할 수 있다', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      board: {
        ...s0.board,
        trackTiles: [track('t1', 6, 3, [3, 0], 'player1')],
        townSpurs: [spur('sp1', 5, 3, 0, 'player1')], // 마을 동쪽 변 가닥
      },
    });
    const s = useGameStore.getState();
    const neighbors = getBuildableNeighbors({ col: 5, row: 3 }, s.board, 'player1', true);
    expect(neighbors.length).toBeGreaterThanOrEqual(3);
  });

  it('이동: 가닥이 있는 변으로만 마을을 통과한다', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      board: {
        ...s0.board,
        trackTiles: [
          track('t-e', 6, 3, [3, 0], 'player1'),
          track('t-w', 4, 3, [0, 3], 'player1'),
        ],
        // 동쪽 변(0)에만 가닥 — 서쪽(3)은 가닥 없음
        townSpurs: [spur('sp1', 5, 3, 0, 'player1')],
      },
    });
    const s = useGameStore.getState();
    const fromTown = getConnectedNeighbors({ col: 5, row: 3 }, s.board, 'player1');
    expect(fromTown.length).toBe(1); // 동쪽만

    // 서쪽 가닥 추가 → 양쪽 통과
    useGameStore.setState({
      board: { ...s.board, townSpurs: [spur('sp1', 5, 3, 0, 'player1'), spur('sp2', 5, 3, 3, 'player1')] },
    });
    const both = getConnectedNeighbors({ col: 5, row: 3 }, useGameStore.getState().board, 'player1');
    expect(both.length).toBe(2);
  });

  it('완성 링크: 마을 도달 변에 가닥이 있어야 링크가 완성된다', () => {
    const s0 = useGameStore.getState();
    const base = {
      ...s0.board,
      cities: [{ id: 'D', name: 'D', coord: { col: 7, row: 3 }, color: 'red' as const, cubes: [] }],
      trackTiles: [track('t-e', 6, 3, [3, 0], 'player1')], // 도시 D(7,3) ↔ 마을 BI(5,3) 사이 타일
    };
    // 가닥 없음 → 미완성
    useGameStore.setState({ board: { ...base, townSpurs: [] } });
    expect(findCompletedLinks(useGameStore.getState().board).length).toBe(0);
    // 가닥 추가 → 완성
    useGameStore.setState({ board: { ...base, townSpurs: [spur('sp1', 5, 3, 0, 'player1')] } });
    expect(findCompletedLinks(useGameStore.getState().board).length).toBe(1);
  });

  it('트랙 큐브 배달: 가닥이 있는 변으로 마을을 경유해 도시로 배달한다', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      board: {
        ...s0.board,
        cities: [{ id: 'D', name: 'D', coord: { col: 3, row: 3 }, color: 'red' as const, cubes: [] }],
        trackTiles: [
          track('t-cube', 6, 3, [3, 0], 'player1', 'red'),
          track('t-mid', 4, 3, [0, 3], 'player1'),
        ],
        townSpurs: [spur('sp1', 5, 3, 0, 'player1'), spur('sp2', 5, 3, 3, 'player1')],
      },
    });
    const deliveries = findTrackCubeDeliveries(useGameStore.getState().board, 't-cube');
    expect(deliveries.map(d => d.city.id)).toContain('D');

    // 서쪽 가닥 제거 → 배달 불가
    const s = useGameStore.getState();
    useGameStore.setState({
      board: { ...s.board, townSpurs: [spur('sp1', 5, 3, 0, 'player1')] },
    });
    const blocked = findTrackCubeDeliveries(useGameStore.getState().board, 't-cube');
    expect(blocked.map(d => d.city.id)).not.toContain('D');
  });
});
