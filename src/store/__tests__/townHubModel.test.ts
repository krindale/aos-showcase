import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../gameStore';
import { getBuildableNeighbors, findTrackCubeDeliveries, getConnectedNeighbors } from '@/utils/hexGrid';
import { validateTrackConnection, playerConnectsToTown } from '@/utils/trackValidation';
import { TrackTile } from '@/types/game';

// 마을 허브 모델: 마을은 도시처럼 "타일 없는 연결점"
// - 마을 헥스에는 트랙 타일을 배치할 수 없다
// - 인접 타일이 마을 변에 닿으면 진입(연결)으로 인정
// - 진입한 플레이어는 마을의 6방향 어디로든 새 트랙을 시작할 수 있다
// - 이동/배달은 마을을 경유(허브)할 수 있다
describe('마을 허브 모델', () => {
  const track = (id: string, col: number, row: number, edges: [number, number], owner: 'player1' | 'player2', cube?: string): TrackTile => ({
    id, coord: { col, row }, edges, owner, trackType: 'simple',
    ...(cube ? { cube: cube as TrackTile['cube'] } : {}),
  });

  beforeEach(() => {
    useGameStore.getState().initGame('st-lucia', ['Human', 'AI-2'], [{ playerIndex: 1, name: 'AI-2' }]);
  });

  it('마을 헥스에는 트랙을 배치할 수 없다', () => {
    const s0 = useGameStore.getState();
    // BI(5,3) 마을 헥스에 직접 배치 시도 — 인접 (6,3)에 내 트랙이 있어 연결은 충족돼도 배치 불가
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      board: { ...s0.board, trackTiles: [track('t1', 6, 3, [3, 0], 'player1')] },
    });
    expect(useGameStore.getState().canBuildTrack({ col: 5, row: 3 }, [0, 3])).toBe(false);
  });

  it('마을에 진입한 플레이어는 마을에서 6방향으로 새 트랙을 시작할 수 있다', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      board: { ...s0.board, trackTiles: [track('t1', 6, 3, [3, 0], 'player1')] },
    });
    const s = useGameStore.getState();
    const town = { col: 5, row: 3 };

    expect(playerConnectsToTown(town, s.board, 'player1')).toBe(true);

    const neighbors = getBuildableNeighbors(town, s.board, 'player1', true);
    expect(neighbors.length).toBeGreaterThanOrEqual(3);
    // 마을 헥스 자신은 후보가 아니어야 함
    expect(neighbors.every(n => !(n.coord.col === 5 && n.coord.row === 3))).toBe(true);

    // 3번째 방향(서쪽 이웃)에 건설: 마을 변에 닿는 엣지 → 연결 인정 + 실제 건설 성공
    expect(validateTrackConnection({ col: 4, row: 3 }, [0, 3], s.board, 'player1')).toBe(true);
    expect(useGameStore.getState().buildTrack({ col: 4, row: 3 }, [0, 3])).toBe(true);
  });

  it('트랙 큐브는 마을을 경유해 같은 색 도시로 배달할 수 있다', () => {
    const s0 = useGameStore.getState();
    // 구조: [큐브 트랙 (6,3)] - [마을 BI(5,3)] - [트랙 (4,3)] - [red 도시 (3,3)]
    useGameStore.setState({
      board: {
        ...s0.board,
        cities: [{ id: 'D', name: 'New City D', coord: { col: 3, row: 3 }, color: 'red', cubes: [] }],
        trackTiles: [
          track('t-cube', 6, 3, [3, 0], 'player1', 'red'),
          track('t-mid', 4, 3, [0, 3], 'player1'),
        ],
      },
    });
    const s = useGameStore.getState();
    const deliveries = findTrackCubeDeliveries(s.board, 't-cube');
    expect(deliveries.map(d => d.city.id)).toContain('D');
    const d = deliveries.find(x => x.city.id === 'D')!;
    // 경로에 마을 헥스(5,3)가 포함
    expect(d.pathCoords.some(c => c.col === 5 && c.row === 3)).toBe(true);
    // 구간 소유자 = 큐브가 있는 구간(마을 도달 전)의 소유자
    expect(d.sectionOwner).toBe('player1');
  });

  it('이동 경로 탐색이 타일 없는 마을을 허브로 통과한다', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      board: {
        ...s0.board,
        cities: [
          { id: 'A', name: 'A', coord: { col: 7, row: 3 }, color: 'red', cubes: [] },
          { id: 'D', name: 'D', coord: { col: 3, row: 3 }, color: 'red', cubes: [] },
        ],
        trackTiles: [
          track('t-e', 6, 3, [3, 0], 'player1'),
          track('t-w', 4, 3, [0, 3], 'player1'),
        ],
      },
    });
    const s = useGameStore.getState();
    // 마을(5,3)에서 양쪽 트랙이 이웃으로 잡혀야 함 (마을 헥스에 타일 없음)
    const fromTown = getConnectedNeighbors({ col: 5, row: 3 }, s.board, 'player1');
    expect(fromTown.length).toBe(2);
    // 트랙(6,3)에서 마을 방향이 이웃으로 잡혀야 함
    const fromTrack = getConnectedNeighbors({ col: 6, row: 3 }, s.board, 'player1', new Set(), 0);
    expect(fromTrack.some(c => c.col === 5 && c.row === 3)).toBe(true);
  });
});
