// 마을이 "노란 건설 후보"로 보이는지 (2026-08-10 제보)
//
// 마을은 타일을 놓는 곳이 아니라 가닥으로 잇는 곳이라 getBuildableNeighbors에서 빠진다.
// 그래서 시작점을 골라도 마을에는 아무 표시가 없었고, 안내는 "노란색 헥스를 클릭"이라
// 사용자는 마을로 노선을 잇는 방법을 화면에서 찾을 수 없었다. 마을 연결도 건설 카운트와
// 비용을 쓰는 엄연한 건설이므로 같은 후보로 표시되어야 한다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { getNeighborHex, hexCoordsEqual, getOppositeEdge } from '@/utils/hexGrid';
import { HexCoord } from '@/types/game';

const OXFORD: HexCoord = { col: 6, row: 9 };
const TRACK: HexCoord = { col: 7, row: 8 };

/** TRACK에 Oxford를 향한 미완성 트랙 한 장을 놓는다 (owner 지정) */
function setup(owner: 'player1' | null) {
  useGameStore.getState().initGame('southern-england', ['P1', 'P2', 'P3', 'P4', 'P5'], []);
  const s0 = useGameStore.getState();

  // TRACK에서 Oxford를 향하는 변과, 그 반대편 변으로 뻗은 트랙
  let townEdge = -1;
  for (let e = 0; e < 6; e++) {
    if (hexCoordsEqual(getNeighborHex(TRACK, e, s0.board), OXFORD)) { townEdge = e; break; }
  }
  expect(townEdge).toBeGreaterThanOrEqual(0); // 보드 전제 확인: (7,8)은 Oxford와 인접

  useGameStore.setState({
    currentTurn: 4,
    currentPhase: 'buildTrack',
    currentPlayer: 'player1',
    playerOrder: ['player1', 'player2', 'player3', 'player4', 'player5'],
    players: { ...s0.players, player1: { ...s0.players.player1, cash: 11, selectedAction: null } },
    phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3, lastBuiltCoords: [] },
    board: {
      ...s0.board,
      trackTiles: [{
        id: 'tr-78', coord: TRACK, edges: [townEdge, (townEdge + 3) % 6],
        owner, trackType: 'simple' as const, builtTurn: 3,
      }],
      townSpurs: [],
    },
  });
  return townEdge;
}

describe('마을 가닥 후보의 노란 칸 표시', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); });

  it('내 트랙을 시작점으로 고르면 인접 마을이 건설 후보(노란 칸)로 뜬다', () => {
    setup('player1');
    useGameStore.getState().selectSourceHex(TRACK);
    const { highlightedHexes } = useGameStore.getState().ui;
    expect(highlightedHexes.some(h => hexCoordsEqual(h, OXFORD))).toBe(true);
  });

  it('주인 없는 미완성 트랙에서도 마을이 후보로 뜬다 (룰 IV 인수 연장)', () => {
    setup(null);
    useGameStore.getState().selectSourceHex(TRACK);
    const { highlightedHexes } = useGameStore.getState().ui;
    expect(highlightedHexes.some(h => hexCoordsEqual(h, OXFORD))).toBe(true);
  });

  it('후보로 뜬 마을은 실제로 가닥이 지어진다 — 표시와 커밋이 일치한다', () => {
    const townEdge = setup('player1');
    const spurEdge = getOppositeEdge(townEdge);
    useGameStore.getState().selectSourceHex(TRACK);

    expect(useGameStore.getState().canBuildTownSpur(OXFORD, spurEdge)).toBe(true);
    expect(useGameStore.getState().buildTownSpur(OXFORD, spurEdge)).toBe(true);

    const spurs = useGameStore.getState().board.townSpurs ?? [];
    expect(spurs.some(sp => hexCoordsEqual(sp.townCoord, OXFORD) && sp.edge === spurEdge)).toBe(true);
    // 룰북 IV: 마을 $1 + 가닥 $1 = $2 (현금 11 → 9)
    expect(useGameStore.getState().players.player1.cash).toBe(9);
  });

  it('edge 지정은 그 변 하나만 짓는다 — 같은 마을의 다른 미연결 변은 건드리지 않는다', () => {
    const townEdge = setup('player1');
    const s = useGameStore.getState();

    // 마을의 **다른** 변에 주인 없는 미완성 트랙을 하나 더 붙인다.
    // (edge 생략 호출은 이런 변까지 한 번에 짓는다 — 그래서 방향을 고른 클릭은 edge 지정이어야 한다)
    const otherEdge = [0, 1, 2, 3, 4, 5].find(e => e !== getOppositeEdge(townEdge))!;
    const otherCoord = getNeighborHex(OXFORD, otherEdge, s.board);
    useGameStore.setState({
      board: {
        ...s.board,
        trackTiles: [...s.board.trackTiles, {
          id: 'tr-other', coord: otherCoord,
          edges: [getOppositeEdge(otherEdge), (getOppositeEdge(otherEdge) + 3) % 6],
          owner: null, trackType: 'simple' as const, builtTurn: 3,
        }],
      },
    });

    // edge 생략은 두 변을 모두 짓는다 (마을 클릭 = "이 마을 연결" 의도)
    expect(useGameStore.getState().canBuildTownSpur(OXFORD)).toBe(true);

    // edge 지정은 고른 변 하나만
    useGameStore.getState().buildTownSpur(OXFORD, getOppositeEdge(townEdge));
    const spurs = useGameStore.getState().board.townSpurs ?? [];
    expect(spurs).toHaveLength(1);
    expect(spurs[0].edge).toBe(getOppositeEdge(townEdge));
    expect(useGameStore.getState().players.player1.cash).toBe(9); // $2 (기본료 $1 + 가닥 $1)
  });

  it('이미 가닥이 있는 변이면 후보로 뜨지 않는다 (중복 표시 방지)', () => {
    const townEdge = setup('player1');
    const spurEdge = getOppositeEdge(townEdge);
    useGameStore.getState().buildTownSpur(OXFORD, spurEdge);
    useGameStore.getState().selectSourceHex(TRACK);
    const { highlightedHexes } = useGameStore.getState().ui;
    expect(highlightedHexes.some(h => hexCoordsEqual(h, OXFORD))).toBe(false);
  });
});
