// 소유권 회계 정합 — "혼합 소유 링크가 회계에서 증발하던" 버그의 회귀 가드
//
// 배경: 같은 "완성 링크"를 두 함수가 다른 기준으로 판정한다.
//   · isTrackPartOfCompletedLink (hexGrid) = 소유권 무시, 물리적 연결만 본다
//   · findCompletedLinks (hexGrid)         = 모든 타일이 동일 owner여야 링크 성립
// 내 타일이 국유화/미소유/타인 타일과 섞인 채 물리적으로 정거장↔정거장을 이으면
//   ① isTrackPartOfCompletedLink = true  → countUnfinishedSections가 "완성됐다"고 제외
//   ② findCompletedLinks         = 링크 없음 → 완성 링크로도 안 셈
// → 디스크 0개, 국유화 대상 아님, 완성 링크 마커 없음. 트랙이 회계에서 통째로 증발한다.
//
// 사용자 실측(2026-07-29, 남부 중국): "주인 없는 철도를 도시에서 새 타일로 이었는데
// 내 철도로 카운트가 안 되고 디스크 제외(국유화)할 철도 목록에도 안 떴다".

import { describe, it, expect } from 'vitest';
import { useGameStore, createInitialGameState } from '@/store/gameStore';
import {
  countOwnershipUnits,
  countUnfinishedSections,
  describeOwnershipUnits,
} from '@/store/helpers/nationalization';
import { releaseUnextendedTrack } from '@/store/helpers/boardRules';
import { isTrackPartOfCompletedLink, findCompletedLinks, hexCoordsEqual } from '@/utils/hexGrid';
import { findAllCompletedLinks, calculateTrackScore } from '@/utils/trackValidation';
import { BoardState, TrackTile, TownSpur, PlayerId } from '@/types/game';

const P1: PlayerId = 'player1';
const P2: PlayerId = 'player2';

let seq = 0;
function tile(
  col: number, row: number, edges: [number, number],
  owner: PlayerId | null = P1, builtTurn = 1
): TrackTile {
  return { id: `oa${seq++}`, coord: { col, row }, edges, owner, trackType: 'simple', builtTurn };
}
/** 국유화 트랙 = 중립(누구나 이동·수입 0·수정 불가). 남부 중국 디스크 초과 해소의 산물. */
function nationalizedTile(col: number, row: number, edges: [number, number]): TrackTile {
  return {
    ...tile(col, row, edges, null),
    isGovernment: true,
    isNationalized: true,
  };
}
function spur(col: number, row: number, edge: number, owner: PlayerId | null = P1): TownSpur {
  return { id: `os${seq++}`, townCoord: { col, row }, edge, owner };
}

/**
 * 남부 중국 L1 노선을 2타일로 축약해 사용한다:
 *   Nanning(3,8) —[(4,8)]— [(5,8)] —가닥— Wuzhou(5,7)
 * (4,8)은 항상 내 트랙. (5,8)의 소유자만 바꿔가며 회계를 검증한다.
 */
function boardWithMixedLink(secondTile: TrackTile): BoardState {
  const s = createInitialGameState('southern-china', ['A', 'B', 'C', 'D'], []);
  const trackTiles: TrackTile[] = [tile(4, 8, [3, 0]), secondTile];
  const townSpurs: TownSpur[] = [spur(5, 7, 2)]; // Wuzhou ← (5,8)
  return { ...s.board, trackTiles, townSpurs };
}

describe('혼합 소유 링크가 회계에서 증발하지 않는다', () => {
  it('내 타일 + 국유화 트랙으로 물리 완성된 노선 — 내 타일은 미완성 구간으로 세어진다', () => {
    const board = boardWithMixedLink(nationalizedTile(5, 8, [3, 5]));

    // 전제: 물리적으로는 Nanning↔Wuzhou가 이어져 있다(소유권 무시 판정)
    expect(isTrackPartOfCompletedLink({ col: 4, row: 8 }, board)).toBe(true);
    // 전제: 그러나 소유자 단일 링크는 성립하지 않는다 (중립 타일이 껴 있음)
    expect(findCompletedLinks(board).filter(l => l.owner === P1)).toHaveLength(0);

    // 내 트랙은 완성 링크가 아니므로 "미완성 구간 1개"로 디스크를 써야 한다.
    // (버그 시점: 물리 완성이라는 이유로 구간에서도 제외돼 0개였다)
    expect(countUnfinishedSections(board, P1)).toBe(1);
    expect(countOwnershipUnits(board, P1)).toBe(1);
  });

  it('내 타일 + 미소유(주인 없는) 트랙으로 물리 완성된 노선도 동일', () => {
    const board = boardWithMixedLink(tile(5, 8, [3, 5], null));

    expect(isTrackPartOfCompletedLink({ col: 4, row: 8 }, board)).toBe(true);
    expect(findCompletedLinks(board).filter(l => l.owner === P1)).toHaveLength(0);

    expect(countUnfinishedSections(board, P1)).toBe(1);
    expect(countOwnershipUnits(board, P1)).toBe(1);
  });

  it('내 타일 + 상대 타일로 물리 완성된 노선 — 양쪽 모두 구간 1개씩', () => {
    const board = boardWithMixedLink(tile(5, 8, [3, 5], P2));

    expect(findCompletedLinks(board)).toHaveLength(0);
    expect(countUnfinishedSections(board, P1)).toBe(1);
    expect(countUnfinishedSections(board, P2)).toBe(1);
  });

  it('전부 내 소유로 완성되면 완성 링크 1개 · 미완성 구간 0 (기존 동작 불변)', () => {
    const board = boardWithMixedLink(tile(5, 8, [3, 5], P1));

    expect(findCompletedLinks(board).filter(l => l.owner === P1)).toHaveLength(1);
    expect(countUnfinishedSections(board, P1)).toBe(0);
    expect(countOwnershipUnits(board, P1)).toBe(1);
  });
});

describe('releaseUnextendedTrack도 소유자 기준으로 판정한다', () => {
  it('중립 타일에 기대 물리 완성된 내 미완성 구간은 미연장 시 소유가 해제된다', () => {
    // 룰 IV: 미완성 구간을 자기 턴에 연장하지 않으면 소유 디스크가 제거된다.
    // 내 구간이 중립 트랙에 기대 "물리적으로만" 완성돼 있으면, 그건 여전히 내 미완성
    // 구간이므로 해제 대상이어야 한다 (버그 시점: 완성으로 오인해 영구 유지).
    const board = boardWithMixedLink(nationalizedTile(5, 8, [3, 5]));
    // 이번 턴(=3)에 연장하지 않은 구간
    const { board: after, released } = releaseUnextendedTrack(board, 3, P1);

    expect(released).toBe(1);
    expect(after.trackTiles.find(t => t.coord.col === 4 && t.coord.row === 8)?.owner).toBeNull();
  });

  it('이번 턴 연장한 구간은 유지된다 (기존 동작 불변)', () => {
    const board = boardWithMixedLink(nationalizedTile(5, 8, [3, 5]));
    const withFresh: BoardState = {
      ...board,
      trackTiles: board.trackTiles.map(t =>
        t.coord.col === 4 && t.coord.row === 8 ? { ...t, builtTurn: 3 } : t
      ),
    };
    const { released } = releaseUnextendedTrack(withFresh, 3, P1);
    expect(released).toBe(0);
  });

  it('내 소유로 온전히 완성된 링크는 미연장이어도 해제되지 않는다 (소유권 영구)', () => {
    const board = boardWithMixedLink(tile(5, 8, [3, 5], P1));
    const { released } = releaseUnextendedTrack(board, 3, P1);
    expect(released).toBe(0);
  });
});

/**
 * 마을 가닥으로 미소유 구간을 "완성"시키면 그 구간을 인수한다 (룰 IV).
 * 인수가 없으면 미소유 완성 링크 = 룰상 존재할 수 없는 상태가 되어 수입·VP·디스크가
 * 모두 0인 채 영구히 굳는다 (완성이라 findClaimableSectionKeys도 releaseUnextendedTrack도
 * 손대지 못함). 튜토리얼 맵엔 마을이 없어 St. Lucia 기하를 쓴다
 * (townHubModel.test.ts와 동일: 마을 BI(4,3) — 동쪽 이웃 (5,3)).
 */
describe('마을 가닥 건설도 미소유 구간을 인수한다', () => {
  const TOWN = { col: 4, row: 3 };   // 마을 BI
  const TILE = { col: 5, row: 3 };   // 마을 동쪽 이웃 (odd row: E = +1,0)
  const CITY = { col: 6, row: 3 };   // TILE의 동쪽에 주입하는 도시

  /** withCity=false면 반대편이 허공이라 가닥을 놔도 링크가 완성되지 않는다. */
  function setupUnownedTileAtTown(owner: PlayerId | null, withCity = true) {
    useGameStore.getState().initGame('st-lucia', ['Human', 'AI-2'], [{ playerIndex: 1, name: 'AI-2' }]);
    const s0 = useGameStore.getState();
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: P1,
      players: { ...s0.players, player1: { ...s0.players.player1, cash: 20 } },
      phaseState: { ...s0.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3 },
      board: {
        ...s0.board,
        cities: withCity
          ? [...s0.board.cities, { id: 'C', name: 'C', coord: CITY, color: 'red' as const, cubes: [] }]
          : s0.board.cities,
        // edges [3,0]: edge3(W)=마을 쪽, edge0(E)=도시 쪽
        trackTiles: [{
          id: 'unowned-1', coord: TILE, edges: [3, 0] as [number, number],
          owner, trackType: 'simple' as const, builtTurn: 1,
        }],
        townSpurs: [],
      },
    });
  }

  it('가닥으로 미소유 구간을 완성하면 그 구간이 내 소유가 된다', () => {
    setupUnownedTileAtTown(null);
    // 전제: 가닥이 없어 아직 미완성 (마을 쪽이 안 이어짐)
    expect(isTrackPartOfCompletedLink(TILE, useGameStore.getState().board)).toBe(false);

    // 마을(4,3)의 edge0(E) = TILE 방향 가닥
    expect(useGameStore.getState().buildTownSpur(TOWN, 0)).toBe(true);

    const f = useGameStore.getState();
    expect(isTrackPartOfCompletedLink(TILE, f.board)).toBe(true);
    expect(f.board.trackTiles.find(t => t.coord.col === TILE.col && t.coord.row === TILE.row)?.owner)
      .toBe(P1);
    // 인수 결과가 실제 소유 링크로 잡힌다 (수입·VP·디스크의 근거)
    expect(findCompletedLinks(f.board).filter(l => l.owner === P1)).toHaveLength(1);
  });

  it('가닥을 놔도 구간이 미완성이면 인수하지 않는다', () => {
    setupUnownedTileAtTown(null, false); // 반대편에 도시 없음
    expect(useGameStore.getState().buildTownSpur(TOWN, 0)).toBe(true);

    const f = useGameStore.getState();
    expect(isTrackPartOfCompletedLink(TILE, f.board)).toBe(false);
    // 미완성인 채 인수하면 builtTurn이 과거라 같은 턴 끝 releaseUnextendedTrack이 도로 푼다
    expect(f.board.trackTiles.find(t => t.coord.col === TILE.col && t.coord.row === TILE.row)?.owner)
      .toBeNull();
  });

  it('상대 소유 구간은 가닥으로 이어도 인수되지 않는다', () => {
    setupUnownedTileAtTown(P2);
    expect(useGameStore.getState().buildTownSpur(TOWN, 0)).toBe(true);

    const f = useGameStore.getState();
    expect(f.board.trackTiles.find(t => t.coord.col === TILE.col && t.coord.row === TILE.row)?.owner)
      .toBe(P2);
  });

  it('국유화/정부 트랙(중립)은 가닥으로 이어도 인수되지 않는다', () => {
    setupUnownedTileAtTown(null);
    const s = useGameStore.getState();
    useGameStore.setState({
      board: {
        ...s.board,
        trackTiles: s.board.trackTiles.map(t => ({ ...t, isGovernment: true, isNationalized: true })),
      },
    });
    expect(useGameStore.getState().buildTownSpur(TOWN, 0)).toBe(true);

    const f = useGameStore.getState();
    expect(f.board.trackTiles.find(t => t.coord.col === TILE.col && t.coord.row === TILE.row)?.owner)
      .toBeNull();
  });

  it('주변에 미소유 트랙이 없으면 아무 것도 인수하지 않는다 (no-op 회귀 가드)', () => {
    setupUnownedTileAtTown(P1); // 이미 내 트랙
    const before = useGameStore.getState().board.trackTiles.map(t => t.owner);
    expect(useGameStore.getState().buildTownSpur(TOWN, 0)).toBe(true);
    expect(useGameStore.getState().board.trackTiles.map(t => t.owner)).toEqual(before);
  });
});

/**
 * 복합 타일(교차/공존)의 보조 경로로 완성한 링크도 VP에 잡혀야 한다.
 * 수정 전: findAllCompletedLinks/isCompletedLink가 primary edges만 추적해 보조 경로로 이어진
 * 링크를 통째로 놓쳤다 → 수입은 정상 지급되는데(getPathLinkOwners) **VP만 0**이었다.
 * 룰북 "완성된 철도 링크의 각 트랙 구간당 +1점" — 복합 타일의 두 트랙은 독립된 구간이다.
 */
describe('복합 보조 경로로 완성한 링크의 VP', () => {
  const C1 = { col: 4, row: 2 };
  const TILE = { col: 5, row: 2 };
  const C2 = { col: 6, row: 2 };

  /** C1 —[타일]— C2 한 줄. 타일의 기본 경로는 상대, 보조 경로는 나.
   *  교차(crossing)와 공존(coexist)은 trackType만 다르고 두 번째 경로를 똑같이
   *  secondaryEdges/secondaryOwner에 담으므로(비용·렌더만 갈림) 판정 경로가 동일하다. */
  function boardWithSecondaryLink(kind: 'crossing' | 'coexist'): BoardState {
    const b = boardWithCrossingLink();
    return {
      ...b,
      trackTiles: b.trackTiles.map(t => ({ ...t, trackType: kind })),
    };
  }

  function boardWithCrossingLink(): BoardState {
    const s = createInitialGameState('st-lucia', ['A', 'B'], []);
    return {
      ...s.board,
      cities: [
        { id: 'C1', name: 'C1', coord: C1, color: 'red' as const, cubes: [] },
        { id: 'C2', name: 'C2', coord: C2, color: 'blue' as const, cubes: [] },
      ],
      towns: [],
      townSpurs: [],
      trackTiles: [{
        id: 'cx-1', coord: TILE,
        edges: [1, 4] as [number, number], owner: P2,          // 상대의 기본 경로
        trackType: 'crossing' as const,
        secondaryEdges: [3, 0] as [number, number], secondaryOwner: P1, // 내 보조 경로 = C1↔C2
        builtTurn: 1,
      }],
    };
  }

  it('보조 경로로 두 도시를 이으면 내 완성 링크로 잡히고 VP 1점이 된다', () => {
    const board = boardWithCrossingLink();
    const links = findAllCompletedLinks(board, P1);

    expect(links).toHaveLength(1);
    expect(calculateTrackScore(board, P1)).toBe(1);
  });

  it('공존(coexist)도 교차와 동일하게 인정된다 (trackType은 비용·렌더만 가름)', () => {
    for (const kind of ['crossing', 'coexist'] as const) {
      const board = boardWithSecondaryLink(kind);
      expect(findAllCompletedLinks(board, P1)).toHaveLength(1);
      expect(calculateTrackScore(board, P1)).toBe(1);
    }
  });

  it('같은 타일의 기본 경로 주인은 그 링크로 점수를 받지 못한다 (자기 경로가 미완성)', () => {
    const board = boardWithCrossingLink();
    // 상대의 기본 경로 [1,4]는 어느 정거장에도 닿지 않는다
    expect(calculateTrackScore(board, P2)).toBe(0);
  });

  it('출발 정거장으로 되돌아오는 순환은 링크가 아니다 (룰: 자기 자신 연결 불가)', () => {
    // 리뷰 R3 회귀 가드: 순환 감지를 (헥스+경로종류) 단위로 바꾸면서 "출발점 재방문" 보호가
    // 사라져, 도시가 자기 자신에게 이어진 고리가 완성 링크로 잡히던 문제.
    // C1(4,2)을 나갔다가 곧바로 되돌아오는 2타일 고리:
    //   C1 -E(0)-> (5,2) -NW(4)-> (4,1) -SW(2)-> C1
    //   (4,2) even: E=(5,2), NE=(4,1) / (5,2) even: W=C1, NW=(4,1) / (4,1) odd: SE=(5,2), SW=C1
    const s = createInitialGameState('st-lucia', ['A', 'B'], []);
    const board: BoardState = {
      ...s.board,
      cities: [{ id: 'C1', name: 'C1', coord: C1, color: 'red' as const, cubes: [] }],
      towns: [],
      townSpurs: [],
      trackTiles: [
        { id: 'loop-a', coord: { col: 5, row: 2 }, edges: [3, 4] as [number, number],
          owner: P1, trackType: 'simple' as const, builtTurn: 1 },   // W=C1, NW=(4,1)
        { id: 'loop-b', coord: { col: 4, row: 1 }, edges: [1, 2] as [number, number],
          owner: P1, trackType: 'simple' as const, builtTurn: 1 },   // SE=(5,2), SW=C1
      ],
    };

    // 물리적으로는 이어져 있지만 링크로 인정하면 안 된다
    const links = findAllCompletedLinks(board, P1);
    expect(links.filter(l => hexCoordsEqual(l.from, l.to))).toHaveLength(0);
    expect(calculateTrackScore(board, P1)).toBe(0);
  });

  it('기본·보조가 각각 다른 링크를 완성하면 두 구간 모두 점수에 들어간다', () => {
    // 같은 헥스라도 독립된 두 트랙이므로 좌표 단위로 합치면 안 된다.
    const s = createInitialGameState('st-lucia', ['A', 'B'], []);
    const board: BoardState = {
      ...s.board,
      cities: [
        { id: 'C1', name: 'C1', coord: C1, color: 'red' as const, cubes: [] },
        { id: 'C2', name: 'C2', coord: C2, color: 'blue' as const, cubes: [] },
        // (5,2) even row: NW(-1,-1)=(4,1), SE(0,+1)=(5,3)
        { id: 'C3', name: 'C3', coord: { col: 4, row: 1 }, color: 'red' as const, cubes: [] },
        { id: 'C4', name: 'C4', coord: { col: 5, row: 3 }, color: 'blue' as const, cubes: [] },
      ],
      towns: [],
      townSpurs: [],
      trackTiles: [{
        id: 'cx-2', coord: TILE,
        edges: [4, 1] as [number, number], owner: P1,           // C3↔C4 (내 기본)
        trackType: 'crossing' as const,
        secondaryEdges: [3, 0] as [number, number], secondaryOwner: P1, // C1↔C2 (내 보조)
        builtTurn: 1,
      }],
    };

    expect(findAllCompletedLinks(board, P1)).toHaveLength(2);
    expect(calculateTrackScore(board, P1)).toBe(2); // 좌표 단위로 세면 1이 되어버린다
  });
});

describe('디스크 사용량 내역 (UI 표시용)', () => {
  it('describeOwnershipUnits의 내역 합이 countOwnershipUnits와 일치한다 (미러 가드)', () => {
    const board = boardWithMixedLink(nationalizedTile(5, 8, [3, 5]));
    const withDirect: BoardState = {
      ...board,
      directLinks: [{ cityA: 'guangzhou', cityB: 'shenzhen', cost: 8, owner: P1 }],
    };
    const d = describeOwnershipUnits(withDirect, P1);

    expect(d.completed + d.sections + d.directs).toBe(d.total);
    expect(d.total).toBe(countOwnershipUnits(withDirect, P1));
    expect(d.directs).toBe(1);  // $8 직결 링크가 내역에 잡힌다
    expect(d.sections).toBe(1); // 국유화 트랙에 기댄 내 구간
  });

  it('상한이 없는 맵(튜토리얼)에서도 내역 계산이 안전하다', () => {
    useGameStore.getState().initGame('tutorial', ['P1', 'P2']);
    const d = describeOwnershipUnits(useGameStore.getState().board, P1);
    expect(d).toEqual({ completed: 0, sections: 0, directs: 0, total: 0 });
  });
});

describe('스토어 통합: 디스크 상한 판정이 혼합 소유 구간을 포함한다', () => {
  it('국유화 트랙에 기댄 내 구간도 디스크를 소모한다', () => {
    const s = createInitialGameState('southern-china', ['A', 'B', 'C', 'D'], []);
    const board = boardWithMixedLink(nationalizedTile(5, 8, [3, 5]));
    useGameStore.setState({
      ...s,
      currentTurn: 2,
      currentPhase: 'buildTrack',
      currentPlayer: P1,
      board,
    });
    expect(countOwnershipUnits(useGameStore.getState().board, P1)).toBe(1);
  });
});
