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

  it('잔여 카운트가 1뿐이면 마을 방향 타일만 건설된다 (가닥 없음 = 미연결)', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 2, maxTracksThisTurn: 3 },
      board: { ...s0.board, trackTiles: [] },
    });
    // (6,3)의 edge 3(W) 이웃 = 마을 BI(5,3) — 타일은 허용, 가닥은 카운트 부족으로 미건설
    expect(useGameStore.getState().canBuildTrack({ col: 6, row: 3 }, [3, 0])).toBe(true);
    const ok = useGameStore.getState().buildTrack({ col: 6, row: 3 }, [3, 0]);
    expect(ok).toBe(true);
    const f = useGameStore.getState();
    expect(f.phaseState.builtTracksThisTurn).toBe(3); // 타일 1만 카운트
    expect((f.board.townSpurs ?? []).length).toBe(0); // 가닥 없음
    expect(f.players.player1.cash).toBe(20 - 4); // 산 $4만 (가닥 $1 없음)
    expect(playerConnectsToTown({ col: 5, row: 3 }, f.board, 'player1')).toBe(false); // 미연결
  });

  it('미연결 타일은 다음 턴 buildTownSpur로 연결을 완성한다 (1카운트 + $1)', () => {
    const s0 = useGameStore.getState();
    // 지난 턴 카운트 부족으로 타일만 지어진 상태 재현: (6,3) [3,0] — edge 3이 마을 BI(5,3) 변에 닿음
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3 },
      board: { ...s0.board, trackTiles: [track('t1', 6, 3, [3, 0], 'player1')], townSpurs: [] },
    });
    expect(useGameStore.getState().canBuildTownSpur({ col: 5, row: 3 })).toBe(true);
    const ok = useGameStore.getState().buildTownSpur({ col: 5, row: 3 });
    expect(ok).toBe(true);
    const f = useGameStore.getState();
    expect(f.phaseState.builtTracksThisTurn).toBe(1); // 가닥 1카운트
    expect((f.board.townSpurs ?? []).length).toBe(1);
    expect(f.players.player1.cash).toBe(20 - 1); // 가닥 $1
    expect(playerConnectsToTown({ col: 5, row: 3 }, f.board, 'player1')).toBe(true); // 연결 완성
    // 빠진 가닥이 더 없으므로 재건설 불가
    expect(useGameStore.getState().canBuildTownSpur({ col: 5, row: 3 })).toBe(false);
  });

  it('첫 트랙: 가닥 없는 마을도 시작점으로 선택할 수 있다 (마을 앵커 맵)', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      board: { ...s0.board, trackTiles: [], townSpurs: [] },
    });
    useGameStore.getState().selectSourceHex({ col: 5, row: 3 }); // 마을 BI — 트랙/가닥 없음
    const ui = useGameStore.getState().ui;
    expect(ui.buildMode).toBe('source_selected');
    expect(ui.buildableNeighbors.length).toBeGreaterThan(0);
  });

  it('실행 취소: 트랙 건설을 되돌리면 보드/현금/카운트가 복원된다', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3 },
      board: { ...s0.board, trackTiles: [], townSpurs: [] },
    });
    expect(useGameStore.getState().buildTrack({ col: 5, row: 2 }, [1, 4])).toBe(true); // 타일+가닥
    expect(useGameStore.getState().undoCount).toBeGreaterThan(0);

    useGameStore.getState().undoLastAction();
    const f = useGameStore.getState();
    expect(f.board.trackTiles.length).toBe(0);
    expect((f.board.townSpurs ?? []).length).toBe(0);
    expect(f.players.player1.cash).toBe(20);
    expect(f.phaseState.builtTracksThisTurn).toBe(0);
    expect(f.undoCount).toBe(0);
  });

  it('실행 취소: nextPhase 후에는 되돌릴 수 없다 (행동 확정)', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3 },
      board: { ...s0.board, trackTiles: [], townSpurs: [] },
    });
    useGameStore.getState().buildTrack({ col: 5, row: 2 }, [1, 4]);
    expect(useGameStore.getState().undoCount).toBeGreaterThan(0);
    useGameStore.getState().nextPhase();
    expect(useGameStore.getState().undoCount).toBe(0);
  });

  it('카운트 소진 시 buildTownSpur도 거부된다', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 3, maxTracksThisTurn: 3 },
      board: { ...s0.board, trackTiles: [track('t1', 6, 3, [3, 0], 'player1')], townSpurs: [] },
    });
    expect(useGameStore.getState().canBuildTownSpur({ col: 5, row: 3 })).toBe(false);
    expect(useGameStore.getState().buildTownSpur({ col: 5, row: 3 })).toBe(false);
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

  it('트랙 큐브 배달 수입: 시작 구간 +1, 마을 경유 후 완성 링크도 각각 +1 (룰북: 링크당 수입)', () => {
    const s0 = useGameStore.getState();
    // 트랙 큐브 (6,3) → 마을 BI(5,3) → (4,3) → 도시 D(3,3): 시작 구간 1 + 완성 링크 1 = 수입 +2
    useGameStore.setState({
      currentPhase: 'moveGoods',
      currentPlayer: 'player1',
      phaseState: { ...s0.phaseState, moveGoodsRound: 1, playerMoves: { ...s0.phaseState.playerMoves, player1: false, player2: false } },
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
    const incomeBefore = useGameStore.getState().players.player1.income;
    expect(useGameStore.getState().moveTrackCube('t-cube', 'D')).toBe(true);
    useGameStore.getState().completeCubeMove();
    const incomeAfter = useGameStore.getState().players.player1.income;
    expect(incomeAfter - incomeBefore).toBe(2); // 시작 구간 1 + 마을→도시 완성 링크 1
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
