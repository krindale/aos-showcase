// 남부 중국: 소유 디스크 4개 + 국유화 트랙 테스트
// 디스크 카운트(링크+구간+직결) · 국유화 대상 필터 · nationalizeLink 흐름 · 미완성 구간 1개 제한
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, createInitialGameState } from '@/store/gameStore';
import {
  countOwnershipUnits,
  countUnfinishedSections,
  eligibleNationalizationTargets,
  checkDiscLimitAfterBuild,
} from '@/store/helpers/nationalization';
import { TrackTile, TownSpur, PlayerId } from '@/types/game';

const P1: PlayerId = 'player1';

let seq = 0;
function tile(
  col: number, row: number, edges: [number, number],
  owner: PlayerId | null = P1, builtTurn = 1
): TrackTile {
  return { id: `t${seq++}`, coord: { col, row }, edges, owner, trackType: 'simple', builtTurn };
}
function spur(col: number, row: number, edge: number, owner: PlayerId | null = P1): TownSpur {
  return { id: `s${seq++}`, townCoord: { col, row }, edge, owner };
}

/**
 * 완성 링크 5개(전부 player1, 1턴 건설)를 조작 배치:
 *  L1: Nanning(3,8)—(4,8)—(5,8)—Wuzhou   L2: Guangzhou(7,8)—(6,8)—Wuzhou
 *  L3: Shenzhen(8,8)—(9,8)—HongKong      L4: Chongqing(1,0)—(1,1)—(1,2)—Guiyang
 *  L5: Xiamen(11,6)—(10,6)—(9,6)—(9,5)—Ganzhou
 */
function setupWithFiveLinks(currentTurn = 2) {
  const s = createInitialGameState('southern-china', ['A', 'B', 'C', 'D'], []);
  const trackTiles: TrackTile[] = [
    tile(4, 8, [3, 0]), tile(5, 8, [3, 5]),          // L1
    tile(6, 8, [0, 4]),                               // L2
    tile(9, 8, [3, 2]),                               // L3
    tile(1, 1, [4, 2]), tile(1, 2, [5, 1]),           // L4
    tile(10, 6, [3, 0]), tile(9, 6, [0, 5]), tile(9, 5, [2, 4]), // L5
  ];
  const townSpurs: TownSpur[] = [
    spur(5, 7, 2), // Wuzhou ← L1 (5,8)
    spur(5, 7, 1), // Wuzhou ← L2 (6,8)
    spur(9, 4, 1), // Ganzhou ← L5 (9,5)
  ];
  useGameStore.setState({
    ...s,
    currentTurn,
    currentPhase: 'buildTrack',
    currentPlayer: P1,
    board: { ...s.board, trackTiles, townSpurs },
  });
  return useGameStore.getState();
}

describe('디스크 카운트', () => {
  beforeEach(() => { setupWithFiveLinks(); });

  it('완성 링크 5개 = 소유 단위 5 (미완성 구간 0)', () => {
    const { board } = useGameStore.getState();
    expect(countUnfinishedSections(board, P1)).toBe(0);
    expect(countOwnershipUnits(board, P1)).toBe(5);
    expect(countOwnershipUnits(board, 'player2')).toBe(0);
  });

  it('미완성 구간·직결 링크도 단위로 계산', () => {
    const { board } = useGameStore.getState();
    // (3,6) 평지에 매달린 타일 하나 (Nanning 쪽에서 뻗다 만 구간)
    const withDangling = {
      ...board,
      trackTiles: [...board.trackTiles, tile(3, 6, [0, 3])],
      directLinks: [{ cityA: 'guangzhou', cityB: 'shenzhen', cost: 8, owner: P1 }],
    };
    expect(countUnfinishedSections(withDangling, P1)).toBe(1);
    expect(countOwnershipUnits(withDangling, P1)).toBe(7); // 5링크 + 1구간 + 1직결
  });

  it('checkDiscLimitAfterBuild: 상한 4 초과 → 대기, 상한 내/미사용 맵 → null', () => {
    const state = useGameStore.getState();
    expect(checkDiscLimitAfterBuild(state, P1, 4)).toEqual({ playerId: P1 });
    expect(checkDiscLimitAfterBuild(state, P1, 5)).toBeNull();
    expect(checkDiscLimitAfterBuild(state, P1, null)).toBeNull();
  });
});

describe('국유화 대상과 실행', () => {
  it('이번 턴 건설 타일이 낀 링크는 대상에서 제외', () => {
    setupWithFiveLinks(1); // 모든 타일 builtTurn=1 = 이번 턴
    const state = useGameStore.getState();
    expect(eligibleNationalizationTargets(state.board, P1, 1).length).toBe(0);
    setupWithFiveLinks(2); // 다음 턴이 되면 전부 대상
    const s2 = useGameStore.getState();
    expect(eligibleNationalizationTargets(s2.board, P1, 2).length).toBe(5);
  });

  it('nationalizeLink: 타일·가닥 중립화 + 보상(토큰 1·구간당 $1) + 대기 해제', () => {
    setupWithFiveLinks(2);
    useGameStore.setState({ nationalizationPending: { playerId: P1 } });
    const before = useGameStore.getState();
    const cashBefore = before.players[P1].cash;
    // L1 (Nanning↔Wuzhou, 2구간)을 국유화
    const target = eligibleNationalizationTargets(before.board, P1, 2).find((l) =>
      l.trackTiles.some((c) => c.col === 4 && c.row === 8)
    )!;
    useGameStore.getState().nationalizeLink(P1, target.id);

    const after = useGameStore.getState();
    const t48 = after.board.trackTiles.find((t) => t.coord.col === 4 && t.coord.row === 8)!;
    const t58 = after.board.trackTiles.find((t) => t.coord.col === 5 && t.coord.row === 8)!;
    expect(t48.owner).toBeNull();
    expect(t48.isGovernment).toBe(true);
    expect(t48.isNationalized).toBe(true);
    expect(t58.owner).toBeNull();
    // L1 쪽 Wuzhou 가닥(edge 2)만 중립화, L2 쪽(edge 1)은 유지
    const sp2 = after.board.townSpurs!.find((sp) => sp.townCoord.col === 5 && sp.edge === 2)!;
    const sp1 = after.board.townSpurs!.find((sp) => sp.townCoord.col === 5 && sp.edge === 1)!;
    expect(sp2.owner).toBeNull();
    expect(sp1.owner).toBe(P1);
    // 보상
    expect(after.players[P1].supportTokens).toBe(1);
    expect(after.players[P1].cash).toBe(cashBefore + 2);
    // 5 → 4단위로 상한 충족 → 대기 해제
    expect(after.nationalizationPending).toBeNull();
    expect(countOwnershipUnits(after.board, P1)).toBe(4);
  });

  it('대기 없는 상태/남의 링크면 no-op', () => {
    setupWithFiveLinks(2);
    const state = useGameStore.getState();
    const target = eligibleNationalizationTargets(state.board, P1, 2)[0];
    useGameStore.getState().nationalizeLink(P1, target.id); // pending 없음
    expect(useGameStore.getState().players[P1].supportTokens ?? 0).toBe(0);
    useGameStore.setState({ nationalizationPending: { playerId: 'player2' } });
    useGameStore.getState().nationalizeLink(P1, target.id); // 남의 대기
    expect(useGameStore.getState().players[P1].supportTokens ?? 0).toBe(0);
  });
});

describe('미완성 구간 동시 1개 제한', () => {
  it('구간 보유 중 도시에서 새 구간 착공 금지 / 기존 구간 연장·즉시 완성은 허용', () => {
    const s = createInitialGameState('southern-china', ['A', 'B', 'C', 'D'], []);
    // Nanning(3,8) 동쪽 (4,8)에 매달린 미완성 구간 1개
    useGameStore.setState({
      ...s,
      currentPhase: 'buildTrack',
      currentPlayer: P1,
      board: { ...s.board, trackTiles: [tile(4, 8, [3, 0], P1, 1)] },
    });
    const store = useGameStore.getState();
    expect(countUnfinishedSections(useGameStore.getState().board, P1)).toBe(1);
    // ① 기존 구간 연장 (5,8)[3,5] — 허용 (Wuzhou 방향)
    expect(store.canBuildTrack({ col: 5, row: 8 }, [3, 5])).toBe(true);
    // ② Guangzhou(7,8) 옆 (6,8)에서 새 구간 착공 [0,3] — 구간 2개가 되므로 금지
    //    ((6,8)의 W(3)변은 (5,8) 빈 헥스 = 정거장 아님 → 즉시 완성도 아님)
    expect(store.canBuildTrack({ col: 6, row: 8 }, [0, 3])).toBe(false);
    // ③ 같은 위치라도 양끝이 정거장(Guangzhou E, Wuzhou NW)인 즉시 완성 타일 [0,4] — 허용
    expect(store.canBuildTrack({ col: 6, row: 8 }, [0, 4])).toBe(true);
  });
});
