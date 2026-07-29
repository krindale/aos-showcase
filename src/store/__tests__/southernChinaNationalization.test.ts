// 남부 중국: 소유 디스크 4개 + 국유화 트랙 테스트
// 디스크 카운트(링크+구간+직결) · 국유화 대상 필터 · nationalizeLink 흐름 · 미완성 구간 1개 제한
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, createInitialGameState } from '@/store/gameStore';
import {
  countOwnershipUnits,
  countUnfinishedSections,
  eligibleNationalizationTargets,
  checkDiscLimitAfterBuild,
  releaseUnfinishedOwnership,
} from '@/store/helpers/nationalization';
import { resolveBotNationalization } from '@/store/slices/buildSlice';
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

  it('스토어 buildDirectLink()로 상한을 넘기면 nationalizationPending이 선다', () => {
    // 실제 구매 경로(buildDirectLink → afterBuildDiscCheck)의 통합 회귀 —
    // 기존 테스트는 합성 보드로 카운트 헬퍼만 검증해 이 경로를 덮지 못했다.
    setupWithFiveLinks(2);
    const s = useGameStore.getState();
    // L4(Chongqing↔Guiyang)의 타일 2개를 빼서 완성 링크 4개 = 상한 도달 상태로 만든다
    const trackTiles = s.board.trackTiles.filter(
      (t) => !(t.coord.col === 1 && (t.coord.row === 1 || t.coord.row === 2))
    );
    useGameStore.setState({
      board: { ...s.board, trackTiles },
      players: { ...s.players, [P1]: { ...s.players[P1], cash: 50, isAI: false } },
      nationalizationPending: null,
    });
    expect(countOwnershipUnits(useGameStore.getState().board, P1)).toBe(4);

    // $8 직결 링크 구매 → 5단위 초과 → 국유화 대기
    expect(useGameStore.getState().buildDirectLink('guangzhou', 'shenzhen')).toBe(true);
    const after = useGameStore.getState();
    expect(countOwnershipUnits(after.board, P1)).toBe(5);
    expect(after.nationalizationPending?.playerId).toBe(P1);
    // 이번 턴 산 직결은 국유화 대상에서 빠지고 기존 링크만 후보가 된다
    const targets = eligibleNationalizationTargets(after.board, P1, after.currentTurn);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.some((l) => l.id.startsWith('direct-'))).toBe(false);
  });

  // ⚠️ **알려진 한계(현재 동작 박제, 2026-07-29)** — 고치지 않기로 한 엣지 케이스.
  // 이 맵은 미완성 구간이 1개로 제한(unfinishedSectionLimit)돼 있어 실전에서 이 조합이
  // 성립하기 어렵다는 판단(사용자). 훗날 상한을 100% 강제하려면 이 테스트가 먼저 실패한다 —
  // 그때 ① 후보가 0일 때만 "당턴 제외"를 푸는 폴백 국유화, 또는 ② 5번째 단위를 만드는 건설의
  // 사전 차단 중 하나를 택하고 이 테스트를 그 기대값으로 갱신할 것.
  it('[알려진 한계] 당턴 링크뿐이라 국유화 대상이 0이면 5단위가 조용히 굳는다', () => {
    // 직결 구매에는 사전 게이트가 있어 "5번째 직결"은 막히지만, buildTrack/복합/가닥에는
    // 게이트가 없다 → 직결을 4번째로 산 뒤 트랙으로 5번째 링크를 완성하면 통과된다.
    // 그 시점 내 링크가 전부 당턴 건설이면 국유화 대상이 0이라 대기도 서지 않고,
    // 안전망(releaseUnfinishedOwnership)은 미완성 구간만 풀어 직결·완성 링크를 못 건드린다.
    // (사용자가 실제로 목격한 "디스크 5개"는 이것이 아니라 혼합 소유 링크의 회계 증발이었을
    //  가능성이 높다 — 그쪽은 isTrackInOwnedCompletedLink 도입으로 수정됨.)
    setupWithFiveLinks(1); // 모든 타일 builtTurn=1 = 당턴 → 국유화 대상 0
    const s = useGameStore.getState();
    // L5(Xiamen↔Ganzhou) 제거 → 완성 링크 4개, 여기에 당턴 구매 직결 1개 = 5단위
    const trackTiles = s.board.trackTiles.filter(
      (t) => !((t.coord.col === 10 && t.coord.row === 6) ||
               (t.coord.col === 9 && t.coord.row === 6) ||
               (t.coord.col === 9 && t.coord.row === 5))
    );
    const board = {
      ...s.board,
      trackTiles,
      directLinks: (s.board.directLinks ?? []).map((d) =>
        d.cityA === 'guangzhou' && d.cityB === 'hongkong'
          ? { ...d, owner: P1, builtTurn: 1 }
          : d
      ),
    };

    expect(countOwnershipUnits(board, P1)).toBe(5);            // 상한 4를 넘겼는데
    expect(eligibleNationalizationTargets(board, P1, 1)).toHaveLength(0); // 국유화 대상이 없고
    expect(checkDiscLimitAfterBuild({ board, currentTurn: 1 }, P1, 4)).toBeNull(); // 대기도 안 서고
    expect(releaseUnfinishedOwnership(board, P1, 4)).toBeNull(); // 안전망도 못 푼다 → 5단위 고착
  });

  it('직결 링크(인터어반)도 국유화 대상 — 중립화·재구매 불가·페리 VP 회수', () => {
    setupWithFiveLinks(2);
    // 인터어반을 이전 턴에 구매한 상태로 만든다 (당턴 건설은 대상 제외)
    useGameStore.setState((s) => ({
      board: {
        ...s.board,
        directLinks: (s.board.directLinks ?? []).map((d) =>
          d.cityA === 'guangzhou' && d.cityB === 'shenzhen'
            ? { ...d, owner: P1, builtTurn: 1 }
            : d
        ),
      },
      players: { ...s.players, [P1]: { ...s.players[P1], ferriesBuilt: 1 } },
      nationalizationPending: { playerId: P1 },
    }));

    const before = useGameStore.getState();
    const target = eligibleNationalizationTargets(before.board, P1, 2)
      .find((l) => l.id.startsWith('direct-'))!;
    expect(target).toBeDefined();
    const cashBefore = before.players[P1].cash;

    useGameStore.getState().nationalizeLink(P1, target.id);

    const after = useGameStore.getState();
    const dl = after.board.directLinks!.find((d) => d.cityA === 'guangzhou' && d.cityB === 'shenzhen')!;
    expect(dl.owner).toBeNull();
    expect(dl.isNationalized).toBe(true);
    expect(after.players[P1].supportTokens).toBe(1);   // 보상 토큰
    expect(after.players[P1].cash).toBe(cashBefore + 1); // 직결 = 1구간 보상
    expect(after.players[P1].ferriesBuilt).toBe(0);     // 종료 1 VP 회수
    // 국유화된 직결은 재구매 불가
    useGameStore.setState({ currentPhase: 'buildTrack', currentPlayer: P1 });
    expect(useGameStore.getState().buildDirectLink('guangzhou', 'shenzhen')).toBe(false);
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

describe('국유화 대상 소진 — 초과가 굳지 않는다 (사람 경로 교착 방지)', () => {
  /**
   * 리뷰 S7 회귀 가드. 사람이 국유화를 한 번 한 뒤에도 초과인데 **남은 대상이 전부 당턴
   * 건설**이면 checkDiscLimitAfterBuild가 null을 돌려 대기가 풀린다 — 그때 안전망이 없으면
   * 5단위가 굳어 이후 건설이 영영 막히고, PhasePanel은 선택 버튼도 '다음 단계로'도 없는
   * 교착이 된다(같은 구멍의 봇 버전은 S5에서 수정).
   */
  it('국유화 후 대상이 소진돼도 소유 단위가 상한(4) 이내로 복원된다', () => {
    // 완성 링크 5개 중 4개는 당턴(=국유화 불가), 1개만 이전 턴(=유일한 대상)
    const s = createInitialGameState('southern-china', ['A', 'B', 'C', 'D'], []);
    const trackTiles: TrackTile[] = [
      tile(4, 8, [3, 0], P1, 1), tile(5, 8, [3, 5], P1, 1),          // L1 (이전 턴 = 대상)
      tile(6, 8, [0, 4], P1, 2),                                      // L2 (당턴)
      tile(9, 8, [3, 2], P1, 2),                                      // L3 (당턴)
      tile(1, 1, [4, 2], P1, 2), tile(1, 2, [5, 1], P1, 2),           // L4 (당턴)
      tile(10, 6, [3, 0], P1, 2), tile(9, 6, [0, 5], P1, 2), tile(9, 5, [2, 4], P1, 2), // L5 (당턴)
    ];
    const townSpurs: TownSpur[] = [spur(5, 7, 2), spur(5, 7, 1), spur(9, 4, 1)];
    // 미완성 구간 1개 추가 — 안전망이 해제할 대상(무보상)
    trackTiles.push(tile(2, 5, [0, 3], P1, 2));
    useGameStore.setState({
      ...s, currentTurn: 2, currentPhase: 'buildTrack', currentPlayer: P1,
      board: { ...s.board, trackTiles, townSpurs },
    });

    const before = countOwnershipUnits(useGameStore.getState().board, P1);
    expect(before).toBeGreaterThan(4); // 전제: 초과 상태

    const targets = eligibleNationalizationTargets(useGameStore.getState().board, P1, 2);
    expect(targets.length).toBe(1); // 전제: 이전 턴 링크 1개만 대상

    useGameStore.setState({ nationalizationPending: { playerId: P1 } });
    useGameStore.getState().nationalizeLink(P1, targets[0].id);

    const after = useGameStore.getState();
    expect(after.nationalizationPending).toBeNull();          // 대기 해제
    expect(countOwnershipUnits(after.board, P1)).toBeLessThanOrEqual(4); // 불변식 복원
  });
});

describe('대기 중 봇 전환 — 자동 해소 (온라인 이탈·호스트 승계 교착 방지)', () => {
  /**
   * 리뷰 F2 회귀 가드. 봇 자동 해소는 원래 **건설 직후**(afterBuildDiscCheck)에만 돌았다.
   * 온라인에서 대기 중인 사람이 이탈해 봇으로 전환되면(netStore가 isAI=true로 바꾼다)
   * 그 시점엔 이미 지나간 뒤라 대기가 영원히 남는다 — 봇은 선택 UI가 없어 건설도 못 하고,
   * nextPhase는 buildTrack에서 대기를 보고 보류(상태 무변경)하면서도 끝에서 항상
   * scheduleAICheck를 부르므로 **결정 ↔ 보류 무한루프**가 된다.
   * resolveBotNationalization을 AI 턴 진입에서도 호출해 끊는다.
   */
  it('사람이 봇으로 전환되면 AI 진입 시 대기가 자동 해소된다', () => {
    setupWithFiveLinks(2);
    useGameStore.setState({ nationalizationPending: { playerId: P1 } });
    expect(countOwnershipUnits(useGameStore.getState().board, P1)).toBe(5); // 전제: 초과

    // 이탈 → 봇 전환 (netStore.convertSeatToBot / promoteToHost가 하는 것과 동일한 상태 변경)
    useGameStore.setState((s) => ({
      players: { ...s.players, [P1]: { ...s.players[P1], isAI: true } },
    }));

    const resolved = resolveBotNationalization(
      useGameStore.setState as never,
      useGameStore.getState as never
    );

    expect(resolved).toBe(true);
    const after = useGameStore.getState();
    expect(after.nationalizationPending).toBeNull();                     // 교착 해제
    expect(countOwnershipUnits(after.board, P1)).toBeLessThanOrEqual(4); // 불변식 복원
    // 봇은 타일 수 최소 링크부터 국유화 → 보상 토큰 1개
    expect(after.players[P1].supportTokens).toBe(1);
  });

  it('사람 차례(비봇)에는 손대지 않는다 — 선택권은 사람에게', () => {
    setupWithFiveLinks(2);
    useGameStore.setState({ nationalizationPending: { playerId: P1 } });

    const resolved = resolveBotNationalization(
      useGameStore.setState as never,
      useGameStore.getState as never
    );

    expect(resolved).toBe(false);
    expect(useGameStore.getState().nationalizationPending).toEqual({ playerId: P1 });
    expect(countOwnershipUnits(useGameStore.getState().board, P1)).toBe(5); // 그대로 초과 유지
  });
});

describe('국유화와 실행 취소(undo) — 대기 상태도 함께 되돌아간다', () => {
  /**
   * 사용자 발견 버그의 회귀 가드. `nationalizationPending`이 undo 스냅샷에 없으면 양방향으로
   * 어긋난다 — ① 국유화를 취소하면 링크는 복구되는데(=다시 디스크 초과) 대기가 안 서서
   * 하이라이트도 게이트도 없는 초과 상태가 굳고, ② 초과를 유발한 건설을 취소하면 초과가
   * 아닌데 대기만 남아 '다음 단계로'가 막힌다.
   */
  it('국유화를 취소하면 링크가 복구되고 대기(하이라이트 조건)도 다시 선다', () => {
    setupWithFiveLinks(2);
    const before = countOwnershipUnits(useGameStore.getState().board, P1);
    expect(before).toBe(5); // 전제: 디스크 초과

    const targets = eligibleNationalizationTargets(useGameStore.getState().board, P1, 2);
    expect(targets.length).toBeGreaterThan(0);
    useGameStore.setState({ nationalizationPending: { playerId: P1 } });
    useGameStore.getState().nationalizeLink(P1, targets[0].id);

    // 국유화 직후: 한도 이내 + 대기 해제
    expect(countOwnershipUnits(useGameStore.getState().board, P1)).toBe(4);
    expect(useGameStore.getState().nationalizationPending).toBeNull();

    useGameStore.getState().undoLastAction();

    // 취소 후: 링크가 내 것으로 복구되었으므로 **다시 초과 = 대기도 복원**되어야 한다
    const after = useGameStore.getState();
    expect(countOwnershipUnits(after.board, P1)).toBe(5);
    expect(after.nationalizationPending).toEqual({ playerId: P1 });
    // 보드에서 다시 고를 후보가 있어야 함 (하이라이트 = 이 목록이 소스)
    expect(eligibleNationalizationTargets(after.board, P1, 2).length).toBeGreaterThan(0);
  });

  it('국유화 보상(토큰·현금)도 취소로 되돌아간다', () => {
    setupWithFiveLinks(2);
    const cashBefore = useGameStore.getState().players[P1].cash;
    const tokensBefore = useGameStore.getState().players[P1].supportTokens ?? 0;

    const targets = eligibleNationalizationTargets(useGameStore.getState().board, P1, 2);
    useGameStore.setState({ nationalizationPending: { playerId: P1 } });
    useGameStore.getState().nationalizeLink(P1, targets[0].id);
    expect(useGameStore.getState().players[P1].supportTokens).toBe(tokensBefore + 1);

    useGameStore.getState().undoLastAction();
    const p = useGameStore.getState().players[P1];
    expect(p.cash).toBe(cashBefore);
    expect(p.supportTokens ?? 0).toBe(tokensBefore);
  });
});
