import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../gameStore';
import { getBuildableNeighbors, findTrackCubeDeliveries, getConnectedNeighbors, findCompletedLinks } from '@/utils/hexGrid';
import { playerConnectsToTown } from '@/utils/trackValidation';
import { TrackTile, TownSpur, City } from '@/types/game';

// 마을 가닥(스퍼) 모델:
// - 마을 헥스 안에는 트랙 "타일"이 아니라 "가닥(원→변)"이 존재
// - 노선이 마을에 연결될 때 가닥이 함께 건설된다
// - 가닥은 비용($1)만 발생하고 턴당 건설 카운트에는 포함하지 않는다 (룰북: 카운트 단위는 헥스 트랙 타일)
// - 첫 트랙은 도시에 인접해야 한다 (St. Lucia는 도시화한 도시 인접에만 — 테스트는 도시를 주입해 시작점 확보)
// - 이동/배달/완성 링크는 가닥이 있는 변으로만
describe('마을 가닥(스퍼) 모델', () => {
  const track = (id: string, col: number, row: number, edges: [number, number], owner: 'player1' | 'player2', cube?: string): TrackTile => ({
    id, coord: { col, row }, edges, owner, trackType: 'simple',
    ...(cube ? { cube: cube as TrackTile['cube'] } : {}),
  });
  const spur = (id: string, col: number, row: number, edge: number, owner: 'player1' | 'player2'): TownSpur => ({
    id, townCoord: { col, row }, edge, owner,
  });
  // 첫 트랙 시작점 확보용 도시 (St. Lucia는 시작 도시 0개라 테스트에서 주입)
  const city = (id: string, col: number, row: number): City => ({
    id, name: id, coord: { col, row }, color: 'red', cubes: [],
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
      board: { ...s0.board, trackTiles: [track('t1', 5, 3, [3, 0], 'player1')] },
    });
    expect(useGameStore.getState().canBuildTrack({ col: 4, row: 3 }, [0, 3])).toBe(false);
  });

  it('마을 변에 닿는 건설: 가닥 자동 생성 안 함 — 타일만 1카운트 (미연결)', () => {
    const s0 = useGameStore.getState();
    // 첫 트랙: 도시 C(4,1)에 인접한 (5,2)에 [1,4] — edge 4(NW)가 도시에, edge 1(SE)이 마을 BI(5,3)에 닿음
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3 },
      board: { ...s0.board, cities: [...s0.board.cities, city('C', 3, 1)], trackTiles: [] },
    });
    const ok = useGameStore.getState().buildTrack({ col: 4, row: 2 }, [1, 4]);
    expect(ok).toBe(true);
    const f = useGameStore.getState();
    expect(f.phaseState.builtTracksThisTurn).toBe(1); // 타일만 (가닥 자동 생성 없음)
    expect((f.board.townSpurs ?? []).length).toBe(0); // 가닥 미생성 = 마을 미연결
    expect(f.players.player1.cash).toBe(20 - 2); // 평지 $2만 (가닥 비용 없음)
    expect(playerConnectsToTown({ col: 4, row: 3 }, f.board, 'player1')).toBe(false); // 미연결
    // 마을 클릭(buildTownSpur)으로 별도 연결 가능
    expect(useGameStore.getState().canBuildTownSpur({ col: 4, row: 3 })).toBe(true);
  });

  it('잔여 카운트가 1뿐이면 마을 진입을 못 해 타일만 건설된다 (미연결)', () => {
    const s0 = useGameStore.getState();
    // 도시 C(6,2)에 인접한 (6,3)에 [3,4] — edge 4(NW)가 도시에, edge 3(W)이 마을 BI(5,3)에 닿음
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 2, maxTracksThisTurn: 3 }, // 잔여 1뿐
      board: { ...s0.board, cities: [...s0.board.cities, city('C', 5, 2)], trackTiles: [] },
    });
    expect(useGameStore.getState().canBuildTrack({ col: 5, row: 3 }, [3, 4])).toBe(true);
    const ok = useGameStore.getState().buildTrack({ col: 5, row: 3 }, [3, 4]);
    expect(ok).toBe(true);
    const f = useGameStore.getState();
    expect(f.phaseState.builtTracksThisTurn).toBe(3); // 타일 1만 (마을 진입 슬롯 부족 → 미연결)
    expect((f.board.townSpurs ?? []).length).toBe(0); // 가닥 미건설
    expect(f.players.player1.cash).toBe(20 - 4); // 지형 비용만 (가닥 $1 없음)
    expect(playerConnectsToTown({ col: 4, row: 3 }, f.board, 'player1')).toBe(false); // 미연결
  });

  it('미연결 마을은 buildTownSpur로 연결 완성 (마을 첫 진입 1카운트 + $1)', () => {
    const s0 = useGameStore.getState();
    // 지난 턴 카운트 부족으로 타일만 지어진 상태 재현: (6,3) [3,0] — edge 3이 마을 BI(5,3) 변에 닿음
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3 },
      board: { ...s0.board, trackTiles: [track('t1', 5, 3, [3, 0], 'player1')], townSpurs: [] },
    });
    expect(useGameStore.getState().canBuildTownSpur({ col: 4, row: 3 })).toBe(true);
    const ok = useGameStore.getState().buildTownSpur({ col: 4, row: 3 });
    expect(ok).toBe(true);
    const f = useGameStore.getState();
    expect(f.phaseState.builtTracksThisTurn).toBe(1); // 마을 첫 진입 1카운트
    expect((f.board.townSpurs ?? []).length).toBe(1);
    // 룰북 IV: 마을 $1(턴 첫 변경 1회) + 연결 트랙당 $1 → 가닥 1개 = $2
    // (2026-08-02 기본료 복원 전에는 $1만 청구해 룰북의 "가장 싼 마을 타일 $2"와 어긋났다)
    expect(f.players.player1.cash).toBe(20 - 2);
    expect(playerConnectsToTown({ col: 4, row: 3 }, f.board, 'player1')).toBe(true); // 연결 완성
    // 빠진 가닥이 더 없으므로 재건설 불가
    expect(useGameStore.getState().canBuildTownSpur({ col: 4, row: 3 })).toBe(false);
  });

  it('첫 트랙: 도시를 시작점으로 선택할 수 있다 (마을은 시작점 아님)', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      board: { ...s0.board, cities: [...s0.board.cities, city('C', 4, 3)], trackTiles: [], townSpurs: [] },
    });
    // 도시는 시작점
    useGameStore.getState().selectSourceHex({ col: 4, row: 3 });
    const ui = useGameStore.getState().ui;
    expect(ui.buildMode).toBe('source_selected');
    expect(ui.buildableNeighbors.length).toBeGreaterThan(0);
  });

  it('첫 트랙: 가닥 없는 마을은 시작점으로 선택할 수 없다 (도시 인접만 허용)', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      board: { ...s0.board, cities: [], trackTiles: [], townSpurs: [] },
    });
    useGameStore.getState().selectSourceHex({ col: 4, row: 3 }); // 마을 BI — 트랙/가닥/도시 없음
    expect(useGameStore.getState().ui.buildMode).not.toBe('source_selected');
  });

  it('실행 취소: 트랙 건설을 되돌리면 보드/현금/카운트가 복원된다', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3 },
      board: { ...s0.board, cities: [...s0.board.cities, city('C', 3, 1)], trackTiles: [], townSpurs: [] },
    });
    expect(useGameStore.getState().buildTrack({ col: 4, row: 2 }, [1, 4])).toBe(true); // 타일+가닥
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
      board: { ...s0.board, cities: [...s0.board.cities, city('C', 3, 1)], trackTiles: [], townSpurs: [] },
    });
    useGameStore.getState().buildTrack({ col: 4, row: 2 }, [1, 4]);
    expect(useGameStore.getState().undoCount).toBeGreaterThan(0);
    useGameStore.getState().nextPhase();
    expect(useGameStore.getState().undoCount).toBe(0);
  });

  it('카운트 소진 시 마을 첫 진입 buildTownSpur는 거부된다 (마을 진입도 1카운트)', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 3, maxTracksThisTurn: 3 }, // 카운트 소진
      board: { ...s0.board, trackTiles: [track('t1', 5, 3, [3, 0], 'player1')], townSpurs: [] },
    });
    // 마을 BI 첫 진입은 1카운트 필요 → 소진 상태라 거부
    expect(useGameStore.getState().canBuildTownSpur({ col: 4, row: 3 })).toBe(false);
    expect(useGameStore.getState().buildTownSpur({ col: 4, row: 3 })).toBe(false);
  });

  it('현금이 부족하면 buildTownSpur는 거부된다', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 0 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3 },
      board: { ...s0.board, trackTiles: [track('t1', 5, 3, [3, 0], 'player1')], townSpurs: [] },
    });
    expect(useGameStore.getState().canBuildTownSpur({ col: 4, row: 3 })).toBe(false);
  });

  it('이번 턴 한 마을에 가닥 2개를 한 번에 연결 = 카운트 1 (타일 1개 변경)', () => {
    const s0 = useGameStore.getState();
    // 마을 BI(5,3) 양쪽: (4,3) 동쪽 변·(6,3) 서쪽 변이 모두 마을에 닿음, 가닥 없음(미연결)
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      currentTurn: 1,
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3 },
      board: {
        ...s0.board,
        trackTiles: [track('t-w', 3, 3, [0, 3], 'player1'), track('t-e', 5, 3, [3, 0], 'player1')],
        townSpurs: [],
      },
    });
    const ok = useGameStore.getState().buildTownSpur({ col: 4, row: 3 });
    expect(ok).toBe(true);
    const f = useGameStore.getState();
    expect(f.phaseState.builtTracksThisTurn).toBe(1); // 가닥 2개여도 타일 1개 변경 = 카운트 1
    expect((f.board.townSpurs ?? []).length).toBe(2); // 가닥은 2개 연결
    // 룰북 IV: 마을 $1(1회) + 가닥당 $1 × 2 = $3 — 출구 2개짜리 마을 타일 비용과 일치.
    // 기본료는 가닥 수와 무관하게 한 번만 붙는다(같은 마을·같은 턴).
    expect(f.players.player1.cash).toBe(20 - 3);
  });

  it('카운트 3(소진)이어도 같은 턴 이미 연결한 마을은 추가 가닥 연결 가능 (0카운트)', () => {
    const s0 = useGameStore.getState();
    // 마을 BI(5,3): 이번 턴(turn 1) 서쪽(edge3) 가닥 이미 연결됨. (6,3)이 동쪽 변에 닿음(미연결).
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      currentTurn: 1,
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 3, maxTracksThisTurn: 3 }, // 카운트 소진
      board: {
        ...s0.board,
        trackTiles: [track('t-a', 3, 3, [0, 3], 'player1'), track('t-b', 5, 3, [3, 0], 'player1')],
        townSpurs: [{ id: 'sp-a', townCoord: { col: 4, row: 3 }, edge: 3, owner: 'player1', builtTurn: 1 }],
      },
    });
    // 카운트 3이지만 이번 턴 이미 변경한 마을 → 추가 가닥 0카운트 → 가능해야 함
    expect(useGameStore.getState().canBuildTownSpur({ col: 4, row: 3 })).toBe(true);
    const ok = useGameStore.getState().buildTownSpur({ col: 4, row: 3 });
    expect(ok).toBe(true);
    expect(useGameStore.getState().phaseState.builtTracksThisTurn).toBe(3); // 0카운트 (변화 없음)
    expect((useGameStore.getState().board.townSpurs ?? []).length).toBe(2); // 가닥 2개
  });

  it('지난 턴 가닥 있는 마을에 이번 턴 가닥 추가 = 카운트 1 (이번 턴 첫 변경)', () => {
    const s0 = useGameStore.getState();
    // 마을 BI(5,3): 지난 턴(turn 0) 동쪽 가닥 1개. 이번 턴(turn 1) (4,3)이 마을 변에 닿아 미연결
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
      currentTurn: 1,
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3 },
      board: {
        ...s0.board,
        trackTiles: [track('t-w', 3, 3, [0, 3], 'player1')],
        townSpurs: [{ id: 'sp-prev', townCoord: { col: 4, row: 3 }, edge: 0, owner: 'player1', builtTurn: 0 }],
      },
    });
    const ok = useGameStore.getState().buildTownSpur({ col: 4, row: 3 });
    expect(ok).toBe(true);
    const f = useGameStore.getState();
    expect(f.phaseState.builtTracksThisTurn).toBe(1); // 지난 턴 가닥과 무관, 이번 턴 첫 변경 = 카운트 1
  });

  it('가닥이 있는 마을에서 6방향으로 새 노선을 시작할 수 있다', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      board: {
        ...s0.board,
        trackTiles: [track('t1', 5, 3, [3, 0], 'player1')],
        townSpurs: [spur('sp1', 4, 3, 0, 'player1')], // 마을 동쪽 변 가닥
      },
    });
    const s = useGameStore.getState();
    const neighbors = getBuildableNeighbors({ col: 4, row: 3 }, s.board, 'player1', true);
    expect(neighbors.length).toBeGreaterThanOrEqual(3);
  });

  it('이동: 가닥이 있는 변으로만 마을을 통과한다', () => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      board: {
        ...s0.board,
        trackTiles: [
          track('t-e', 5, 3, [3, 0], 'player1'),
          track('t-w', 3, 3, [0, 3], 'player1'),
        ],
        // 동쪽 변(0)에만 가닥 — 서쪽(3)은 가닥 없음
        townSpurs: [spur('sp1', 4, 3, 0, 'player1')],
      },
    });
    const s = useGameStore.getState();
    const fromTown = getConnectedNeighbors({ col: 4, row: 3 }, s.board, 'player1');
    expect(fromTown.length).toBe(1); // 동쪽만

    // 서쪽 가닥 추가 → 양쪽 통과
    useGameStore.setState({
      board: { ...s.board, townSpurs: [spur('sp1', 4, 3, 0, 'player1'), spur('sp2', 4, 3, 3, 'player1')] },
    });
    const both = getConnectedNeighbors({ col: 4, row: 3 }, useGameStore.getState().board, 'player1');
    expect(both.length).toBe(2);
  });

  it('완성 링크: 마을 도달 변에 가닥이 있어야 링크가 완성된다', () => {
    const s0 = useGameStore.getState();
    const base = {
      ...s0.board,
      cities: [{ id: 'D', name: 'D', coord: { col: 6, row: 3 }, color: 'red' as const, cubes: [] }],
      trackTiles: [track('t-e', 5, 3, [3, 0], 'player1')], // 도시 D(7,3) ↔ 마을 BI(5,3) 사이 타일
    };
    // 가닥 없음 → 미완성
    useGameStore.setState({ board: { ...base, townSpurs: [] } });
    expect(findCompletedLinks(useGameStore.getState().board).length).toBe(0);
    // 가닥 추가 → 완성
    useGameStore.setState({ board: { ...base, townSpurs: [spur('sp1', 4, 3, 0, 'player1')] } });
    expect(findCompletedLinks(useGameStore.getState().board).length).toBe(1);
  });

  it('트랙 큐브 배달 수입: 시작 구간 +1, 마을 경유 후 완성 링크도 각각 +1 (룰북: 링크당 수입)', () => {
    const s0 = useGameStore.getState();
    // 트랙 큐브 (6,3) → 마을 BI(5,3) → (4,3) → 도시 D(3,3): 시작 구간 1 + 완성 링크 1 = 수입 +2
    useGameStore.setState({
      currentPhase: 'moveGoods',
      currentPlayer: 'player1',
      // 시작 구간 + 마을 경유 = 2링크이므로 엔진 레벨 2 필요 (엔진 = 이동 가능 링크 수)
      players: { ...s0.players, player1: { ...s0.players.player1, engineLevel: 2 } },
      phaseState: { ...s0.phaseState, moveGoodsRound: 1, playerMoves: { ...s0.phaseState.playerMoves, player1: false, player2: false } },
      board: {
        ...s0.board,
        cities: [{ id: 'D', name: 'D', coord: { col: 2, row: 3 }, color: 'red' as const, cubes: [] }],
        trackTiles: [
          track('t-cube', 5, 3, [3, 0], 'player1', 'red'),
          track('t-mid', 3, 3, [0, 3], 'player1'),
        ],
        townSpurs: [spur('sp1', 4, 3, 0, 'player1'), spur('sp2', 4, 3, 3, 'player1')],
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
        cities: [{ id: 'D', name: 'D', coord: { col: 2, row: 3 }, color: 'red' as const, cubes: [] }],
        trackTiles: [
          track('t-cube', 5, 3, [3, 0], 'player1', 'red'),
          track('t-mid', 3, 3, [0, 3], 'player1'),
        ],
        townSpurs: [spur('sp1', 4, 3, 0, 'player1'), spur('sp2', 4, 3, 3, 'player1')],
      },
    });
    const deliveries = findTrackCubeDeliveries(useGameStore.getState().board, 't-cube');
    expect(deliveries.map(d => d.city.id)).toContain('D');

    // 서쪽 가닥 제거 → 배달 불가
    const s = useGameStore.getState();
    useGameStore.setState({
      board: { ...s.board, townSpurs: [spur('sp1', 4, 3, 0, 'player1')] },
    });
    const blocked = findTrackCubeDeliveries(useGameStore.getState().board, 't-cube');
    expect(blocked.map(d => d.city.id)).not.toContain('D');
  });

  // ── 같은 도시로 가는 분기-합류 경로에서의 경로 선택 (자기 철도 우선 > 긴 루트) ──
  // 분기-합류 보드: 큐브 t-cube(4,4)에서 두 갈래로 갈라져 도시 D(3,3)에서 합류
  //   · 짧은 경로: 큐브 → t-s(3,4) → D                  (트랙만 경유, linkCount 1)
  //   · 긴 경로:   큐브 → t-b(4,3) → 마을 M(4,2) → t-f(3,2) → D (마을 경유, linkCount 2 = 수입 ↑)
  // (좌표 검산 odd-r: t-cube(4,4) e3(W)→(3,4)·e5(NE)→(4,3); t-s(3,4) e5(NE)→D(3,3);
  //  t-b(4,3) e4(NW)→M(4,2); M(4,2) 가닥 e1(SE) 진입·e3(W)→t-f(3,2); t-f e1(SE)→D(3,3))
  const branchMergeBoard = (tbOwner: 'player1' | 'player2') => {
    const s0 = useGameStore.getState();
    useGameStore.setState({
      board: {
        ...s0.board,
        cities: [city('D', 2, 3)],
        towns: [{ id: 'M', coord: { col: 3, row: 2 }, newCityColor: null, cubes: [] }],
        trackTiles: [
          track('t-cube', 3, 4, [3, 5], 'player1', 'red'),
          track('t-s', 2, 4, [0, 5], 'player1'),       // 짧은 경로: 큐브 ↔ D
          track('t-b', 3, 3, [2, 4], tbOwner),         // 긴 경로: 큐브 ↔ 마을 M
          track('t-f', 2, 2, [0, 1], 'player1'),       // 긴 경로: 마을 M ↔ D
        ],
        townSpurs: [spur('m-in', 3, 2, 1, 'player1'), spur('m-out', 3, 2, 3, 'player1')],
      },
    });
    return useGameStore.getState().board;
  };

  it('트랙 큐브 배달: 같은 도시로 가는 두 경로 중 자기 철도만으로 가장 긴(수입 큰) 루트를 고른다', () => {
    const board = branchMergeBoard('player1');
    const toD = findTrackCubeDeliveries(board, 't-cube', Infinity, 'player1').filter(d => d.city.id === 'D');
    expect(toD).toHaveLength(1);
    expect(toD[0].oppLinks).toBe(0);   // 두 경로 모두 자기 철도
    expect(toD[0].linkCount).toBe(2);  // 짧은(1)이 아니라 긴(2) 루트 선택
    expect(toD[0].pathCoords.some(c => c.col === 3 && c.row === 2)).toBe(true); // 마을 M(3,2) 경유 확인
  });

  it('트랙 큐브 배달: 긴 경로가 상대 철도를 경유하면, 짧아도 자기 철도만의 경로를 우선한다', () => {
    const board = branchMergeBoard('player2'); // 긴 경로 t-b를 상대 소유로 → oppLinks 1
    const toD = findTrackCubeDeliveries(board, 't-cube', Infinity, 'player1').filter(d => d.city.id === 'D');
    expect(toD).toHaveLength(1);
    expect(toD[0].oppLinks).toBe(0);   // 자기 철도만인 짧은 경로
    expect(toD[0].linkCount).toBe(1);  // 길이보다 자기 철도 우선
  });

  it('트랙 큐브 배달: 엔진 레벨이 부족하면 긴 경로를 배제하고 짧은 경로로 배달한다', () => {
    const board = branchMergeBoard('player1');
    const toD = findTrackCubeDeliveries(board, 't-cube', 1, 'player1').filter(d => d.city.id === 'D'); // 엔진 1
    expect(toD).toHaveLength(1);
    expect(toD[0].linkCount).toBe(1);  // 긴 경로(linkCount 2)는 엔진 초과 → 짧은 경로만
  });
});
