/**
 * 트랙 건설 메커니즘 단위 테스트
 *
 * 시뮬레이션(fullGameSimulation)은 AI 코드 경로만 테스트하므로
 * 다음 UI/게임 메커니즘을 놓칩니다:
 *
 * 1. AI는 store.buildTrack()을 직접 호출 — selectSourceHex/selectTargetHex 미경유
 * 2. getBuildableNeighbors의 allowReplace 플래그가 UI에서만 사용됨
 * 3. 복합 트랙(교차/공존) 건설의 UI 플로우가 별도 경로임
 *
 * 이 테스트는 위 시나리오를 store 레벨에서 검증합니다:
 * - 미완성 트랙 방향 전환 (Redirection)
 * - 자기/상대 트랙 위 교차/공존 건설
 * - UI 플로우 통합 (selectSourceHex → selectTargetHex → selectExitDirection)
 *
 * 튜토리얼 맵 도시 좌표:
 *   P(red)=(1,0)  C(blue)=(5,0)  O(yellow)=(3,2)  W(black)=(5,3)  I(purple)=(1,4)
 *
 * Odd-r offset 이웃 (CLAUDE.md 참조):
 *   Even row: E(+1,0) SE(0,+1) SW(-1,+1) W(-1,0) NW(-1,-1) NE(0,-1)
 *   Odd row:  E(+1,0) SE(+1,+1) SW(0,+1) W(-1,0) NW(0,-1)  NE(+1,-1)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../gameStore';
import { getBuildableNeighbors, isValidBuildTargetWithReplace } from '@/utils/hexGrid';
import { getRedirectTargetHexes } from '@/utils/trackValidation';
import { PlayerId, HexCoord } from '@/types/game';

describe('트랙 건설 메커니즘', () => {
  beforeEach(() => {
    useGameStore.getState().initGame('tutorial', ['Player1', 'Player2']);
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
    });
  });

  /** 헬퍼: 단순 트랙 직접 배치 (검증 우회) — owner null = 미소유(디스크 제거된) 트랙 */
  function placeTrack(
    coord: HexCoord,
    edges: [number, number],
    owner: PlayerId | null,
    isGovernment = false
  ) {
    const state = useGameStore.getState();
    useGameStore.setState({
      board: {
        ...state.board,
        trackTiles: [
          ...state.board.trackTiles,
          {
            id: `track-${coord.col}-${coord.row}`,
            coord,
            edges,
            owner,
            trackType: 'simple' as const,
            ...(isGovernment ? { isGovernment: true } : {}),
          },
        ],
      },
    });
  }

  /**
   * 완성된 링크 건설: O(3,2) → (3,1)[2,5] → (4,0)[2,0] → C(5,0)
   *
   * 경로 검증:
   *   O(3,2) even, edge5(NE)=(3,1) ✓ → (3,1) entry=edge2
   *   (3,1) odd,  edge5(NE)=(4,0) ✓ → (4,0) entry=edge2
   *   (4,0) even, edge0(E) =(5,0)=C ✓
   */
  function buildCompletedLink(owner: PlayerId) {
    placeTrack({ col: 2, row: 1 }, [2, 5], owner); // O쪽 edge2, (4,0)쪽 edge5
    placeTrack({ col: 3, row: 0 }, [2, 0], owner); // (3,1)쪽 edge2, C쪽 edge0
  }

  /**
   * 접근 트랙 건설: P(1,0) → (1,1)[4,0] → (2,1)[3,0]
   *
   * 경로 검증:
   *   P(1,0) even, edge1(SE)=(1,1) ✓ → (1,1) entry=edge4
   *   (1,1) odd,  edge0(E) =(2,1) ✓ → (2,1) entry=edge3
   *   (2,1) odd,  edge0(E) =(3,1) ✓ → (3,1) entry=edge3
   */
  function buildApproachTrack(owner: PlayerId) {
    placeTrack({ col: 0, row: 1 }, [4, 0], owner); // P쪽 edge4, (2,1)쪽 edge0
    placeTrack({ col: 1, row: 1 }, [3, 0], owner); // (1,1)쪽 edge3, (3,1)쪽 edge0
  }

  // ===== 1. 트랙 방향 전환 (Redirection) =====

  describe('트랙 방향 전환 (Redirection)', () => {
    it('미완성 자기 트랙이 getBuildableNeighbors에 포함됨 (allowReplace=true)', () => {
      // P(1,0) → (2,0)[3,0] 미완성 트랙
      placeTrack({ col: 1, row: 0 }, [3, 0], 'player1');
      const state = useGameStore.getState();

      // allowReplace=true: 내 미완성 트랙 포함
      const neighbors = getBuildableNeighbors(
        { col: 0, row: 0 }, state.board, 'player1', true
      );
      const hasTrack = neighbors.some(n => n.coord.col === 1 && n.coord.row === 0);
      expect(hasTrack).toBe(true);
    });

    it('미완성 자기 트랙을 buildTrack으로 방향 전환', () => {
      placeTrack({ col: 1, row: 0 }, [3, 0], 'player1');
      const store = useGameStore;

      // [3,0] → [3,1] 로 방향 전환 (E→SE)
      expect(store.getState().canBuildTrack({ col: 1, row: 0 }, [3, 1])).toBe(true);

      const success = store.getState().buildTrack({ col: 1, row: 0 }, [3, 1]);
      expect(success).toBe(true);

      const track = store.getState().board.trackTiles.find(
        t => t.coord.col === 1 && t.coord.row === 0
      );
      expect(track!.edges).toEqual([3, 1]);
      expect(track!.owner).toBe('player1');
    });

    it('완성된 링크 트랙은 방향 전환 불가', () => {
      buildCompletedLink('player1');
      const store = useGameStore;

      // 완성된 링크 (3,1)의 방향 전환 시도
      expect(store.getState().canBuildTrack({ col: 2, row: 1 }, [2, 0])).toBe(false);
    });
  });

  // ===== 2. 복합 트랙 건설 (Crossing/Coexist) =====

  describe('복합 트랙 건설 (Crossing/Coexist)', () => {
    it('자기 완성 링크 트랙 위에 교차 건설 가능', () => {
      buildCompletedLink('player1');
      const store = useGameStore;

      // (4,0) edges [2,0] 위에 교차 [4,1] (겹침 없음)
      // 연결성: edge 4 (NW,even)=(3,-1) 맵밖, edge 1 (SE,even)=(4,1)
      // → 도시나 기존 트랙 연결 필요. (4,0) edge 1 → (4,1) 비어있음.
      // 하지만 edge 4 → (3,-1) 맵밖. 둘 다 연결 안 됨.
      // 대신 [5,1] 시도: edge 5 (NE,even)=(4,-1) 맵밖, edge 1=(4,1) 비어있음.
      // 맵밖이면 안 되니... (4,0)의 이웃 중 도시: edge 0→C(5,0)=도시!
      // 하지만 edge 0은 기존에 사용 중. 겹치지 않는 엣지로 도시 연결 필요.
      // (4,0) edge 3(W,even)=(3,0): 이곳에 player1 트랙을 놓자.

      // P(1,0) → (2,0)[3,0] → (3,0)[3,0] player1 체인
      placeTrack({ col: 1, row: 0 }, [3, 0], 'player1');
      placeTrack({ col: 2, row: 0 }, [3, 0], 'player1');

      // (4,0)에서 edge 3(W)→(3,0) 연결 가능.
      // 교차 엣지: [3, 1] — edge 3 연결 (3,0) player1, edge 1 → (4,1)
      // 기존 [2,0] vs 새 [3,1]: 3≠2,3≠0,1≠2,1≠0 → 겹침 없음 ✓
      const canBuild = store.getState().canBuildComplexTrack(
        { col: 3, row: 0 }, [3, 1], 'crossing'
      );
      expect(canBuild).toBe(true);

      const success = store.getState().buildComplexTrack(
        { col: 3, row: 0 }, [3, 1], 'crossing'
      );
      expect(success).toBe(true);

      const track = store.getState().board.trackTiles.find(
        t => t.coord.col === 3 && t.coord.row === 0
      );
      expect(track!.trackType).toBe('crossing');
      expect(track!.edges).toEqual([2, 0]);         // 기존 경로 유지
      expect(track!.secondaryEdges).toEqual([3, 1]); // 새 경로 추가
      expect(track!.secondaryOwner).toBe('player1');
    });

    it('상대 트랙 위에 교차 건설 가능', () => {
      // player2 트랙: (2,0) [3, 0] (P→E 방향)
      placeTrack({ col: 1, row: 0 }, [3, 0], 'player2');

      // player1 접근: P(1,0) → (1,1)[4,5]
      // (1,1) odd: edge4(NW)=(1,0)=P ✓, edge5(NE)=(2,0) ← player2 트랙 쪽
      placeTrack({ col: 0, row: 1 }, [4, 5], 'player1');

      // 교차: (2,0)에 새 엣지 [2,5]
      // (1,1) edge5 → (2,0), entry at (2,0) = (5+3)%6 = edge 2
      // 기존 [3,0] vs 새 [2,5]: 2≠3,2≠0,5≠3,5≠0 → 겹침 없음 ✓
      // 연결: edge 2 → (2,0) even, SW = (1,1) player1 트랙 edge 5 = (5+3)%6=2의 반대=5 ✓
      const canBuild = useGameStore.getState().canBuildComplexTrack(
        { col: 1, row: 0 }, [2, 5], 'crossing'
      );
      expect(canBuild).toBe(true);
    });

    it('정부 트랙(isGovernment) 위에도 표준 룰대로 교차 건설 가능 — 정부 링크 유지 (Montréal)', () => {
      // 바로 위 '상대 트랙 위에 교차 건설 가능'과 동일한 기하 — 대상만 정부 트랙(owner null).
      // 원본 룰: 정부 링크 = "unused colour의 중립 링크" — 표준 룰의 복합 교체(원 트랙 보존)가
      // 그대로 적용된다. (방향전환은 canRedirectTrack에서 금지 유지)
      const state = useGameStore.getState();
      useGameStore.setState({
        board: {
          ...state.board,
          trackTiles: [
            ...state.board.trackTiles,
            {
              id: 'gov-track-test',
              coord: { col: 1, row: 0 },
              edges: [3, 0] as [number, number],
              owner: null,
              trackType: 'simple' as const,
              isGovernment: true,
            },
          ],
        },
      });
      placeTrack({ col: 0, row: 1 }, [4, 5], 'player1');

      const canBuild = useGameStore.getState().canBuildComplexTrack(
        { col: 1, row: 0 }, [2, 5], 'crossing'
      );
      expect(canBuild).toBe(true);
    });

    it('자기 트랙이 getBuildableNeighbors에 교차 후보로 포함됨', () => {
      buildCompletedLink('player1');
      const state = useGameStore.getState();

      // O(3,2)에서 이웃 조회 → (3,1)은 player1 완성 링크 → 교차 후보
      const neighbors = getBuildableNeighbors(
        { col: 2, row: 2 }, state.board, 'player1', false
      );
      const has31 = neighbors.some(n => n.coord.col === 2 && n.coord.row === 1);
      expect(has31).toBe(true);
    });

    it('복합 트랙 위에 추가 교차 불가', () => {
      buildCompletedLink('player1');
      placeTrack({ col: 1, row: 0 }, [3, 0], 'player1');
      placeTrack({ col: 2, row: 0 }, [3, 0], 'player1');

      const store = useGameStore;
      store.getState().buildComplexTrack({ col: 3, row: 0 }, [3, 1], 'crossing');

      // 이미 복합 → 추가 교차 불가
      expect(store.getState().canBuildComplexTrack(
        { col: 3, row: 0 }, [4, 5], 'crossing'
      )).toBe(false);
    });

    it('엣지가 겹치면 교차 불가', () => {
      buildCompletedLink('player1');

      // (4,0) edges [2, 0] vs 새 [0, 4]: edge 0 겹침
      expect(useGameStore.getState().canBuildComplexTrack(
        { col: 3, row: 0 }, [0, 4], 'crossing'
      )).toBe(false);
    });
  });

  // ===== 3. UI 플로우 통합 =====

  describe('UI 플로우 (selectSourceHex → selectTargetHex → selectExitDirection)', () => {
    it('selectSourceHex에서 미완성 트랙이 buildableNeighbors에 포함됨', () => {
      placeTrack({ col: 1, row: 0 }, [3, 0], 'player1');

      const store = useGameStore;
      store.getState().selectSourceHex({ col: 0, row: 0 }); // P 도시

      const ui = store.getState().ui;
      expect(ui.buildMode).toBe('source_selected');
      expect(ui.buildableNeighbors.some(
        n => n.coord.col === 1 && n.coord.row === 0
      )).toBe(true);
    });

    it('selectSourceHex에서 자기 완성 링크 트랙이 교차 후보로 포함됨', () => {
      buildCompletedLink('player1');

      const store = useGameStore;
      store.getState().selectSourceHex({ col: 2, row: 2 }); // O 도시

      const ui = store.getState().ui;
      expect(ui.buildableNeighbors.some(
        n => n.coord.col === 2 && n.coord.row === 1
      )).toBe(true);
    });

    it('기존 트랙 헥스 선택 시 겹치는 엣지가 exitDirections에서 제외됨', () => {
      buildCompletedLink('player1');
      buildApproachTrack('player1');

      const store = useGameStore;
      // (2,1)에서 출발 → (3,1) 트랙 선택
      store.getState().selectSourceHex({ col: 1, row: 1 });
      store.getState().selectTargetHex({ col: 2, row: 1 });

      const ui = store.getState().ui;
      expect(ui.buildMode).toBe('target_selected');

      const exitEdges = ui.exitDirections.map(d => d.exitEdge);
      // (3,1) 기존 edges [2, 5] 와 진입 edge 3 이 모두 제외됨
      expect(exitEdges).not.toContain(2);
      expect(exitEdges).not.toContain(5);
      expect(exitEdges).not.toContain(3); // 진입 엣지도 제외
    });

    it('기존 트랙에서 비겹침 엣지 선택 시 ComplexTrackPanel 표시', () => {
      buildCompletedLink('player1');
      buildApproachTrack('player1');

      const store = useGameStore;
      // (2,1)에서 출발 → (3,1) 선택
      store.getState().selectSourceHex({ col: 1, row: 1 });
      store.getState().selectTargetHex({ col: 2, row: 1 });

      const ui = store.getState().ui;
      expect(ui.exitDirections.length).toBeGreaterThan(0);

      // 비겹침 엣지 선택 → 기존 단순 트랙이므로 ComplexTrackPanel 표시
      const exitEdge = ui.exitDirections[0].exitEdge;
      store.getState().selectExitDirection(exitEdge);

      const afterUi = store.getState().ui;
      expect(afterUi.complexTrackSelection).not.toBeNull();
    });
  });

  // ===== 4. 룰북 소유권: 연장 인수 · 방향 전환 무소유 (2026-07-21 룰 정합 수정) =====
  //
  // 룰(IV): "다른 플레이어가 미소유 미완성 구간을 연장하면 소유권 주장 가능.
  //          방향 전환만으로는 연장으로 인정되지 않는다."

  describe('룰북 소유권 (연장 인수 / 방향 전환 무소유)', () => {
    it('미소유 미완성 구간을 새 타일로 연장하면 그 구간 소유권을 인수한다', () => {
      // 미소유 구간: O 도시에 닿은 타일 1개, (3,0) 방향으로 열림 (buildCompletedLink 앞쪽 절반)
      placeTrack({ col: 2, row: 1 }, [2, 5], null);
      const store = useGameStore;

      // player1 첫 트랙: C 도시에 edge0으로 닿으면서 edge2가 미소유 타일과 맞물림
      expect(store.getState().canBuildTrack({ col: 3, row: 0 }, [2, 0])).toBe(true);
      expect(store.getState().buildTrack({ col: 3, row: 0 }, [2, 0])).toBe(true);

      // 미소유였던 타일의 소유권이 player1로 넘어옴
      const claimed = store.getState().board.trackTiles.find(
        t => t.coord.col === 2 && t.coord.row === 1
      );
      expect(claimed!.owner).toBe('player1');
      // 새 타일도 내 것
      const mine = store.getState().board.trackTiles.find(
        t => t.coord.col === 3 && t.coord.row === 0
      );
      expect(mine!.owner).toBe('player1');
    });

    it('방향 전환(전용 액션)만으로는 미소유 트랙의 소유권을 얻지 못한다', () => {
      // 미소유 미완성 타일: O 도시 연결(edge2 쪽), (3,0) 방향(edge5)으로 열림
      placeTrack({ col: 2, row: 1 }, [2, 5], null);
      const store = useGameStore;

      const info = store.getState();
      void info;
      // 열린 edge5를 다른 방향으로 전환 (어느 유효 방향이든)
      const ok = store.getState().selectTrackToRedirect({ col: 2, row: 1 });
      expect(ok).toBe(true);
      const sel = store.getState().ui.redirectTrackSelection!;
      expect(sel.availableEdges.length).toBeGreaterThan(0);
      const newEdge = sel.availableEdges.find(e => e !== sel.currentOpenEdge) ?? sel.availableEdges[0];
      expect(store.getState().redirectTrack({ col: 2, row: 1 }, newEdge)).toBe(true);

      // 소유권은 여전히 없음 (룰: 방향 전환은 연장이 아님)
      const track = store.getState().board.trackTiles.find(
        t => t.coord.col === 2 && t.coord.row === 1
      );
      expect(track!.owner).toBeNull();
    });

    it('방향 전환으로 도시 방향을 선택할 수 있다 (자기 미완성 구간 → 도시로 완성)', () => {
      // player1 미완성 구간: O→(2,1)→(3,0), (3,0)의 열린 변은 edge1 (도시 C는 edge0 방향)
      placeTrack({ col: 2, row: 1 }, [2, 5], 'player1');
      placeTrack({ col: 3, row: 0 }, [2, 1], 'player1');
      const store = useGameStore;

      expect(store.getState().selectTrackToRedirect({ col: 3, row: 0 })).toBe(true);
      const sel = store.getState().ui.redirectTrackSelection!;
      // 도시(C) 방향 edge0이 선택지에 포함되어야 한다 (룰북에 도시 금지 조항 없음)
      expect(sel.availableEdges).toContain(0);

      // 도시로 방향 전환 → 링크 완성, 소유권은 원래대로 내 것
      expect(store.getState().redirectTrack({ col: 3, row: 0 }, 0)).toBe(true);
      const track = store.getState().board.trackTiles.find(
        t => t.coord.col === 3 && t.coord.row === 0
      );
      expect(track!.edges).toEqual([2, 0]);
      expect(track!.owner).toBe('player1');
    });

    it('일반 건설 플로우로 미소유 트랙을 타깃 삼아 방향 전환할 수 있다 (소유권 무변경)', () => {
      // 내 트랙 방향 전환과 동일한 경로: 인접 연결점 소스 → 트랙을 타깃으로 → 새 방향 커밋.
      // (과거엔 isValidBuildTargetWithReplace가 "내 소유"만 인정해 미소유는 이 플로우에서 제외)
      placeTrack({ col: 2, row: 1 }, [2, 5], null);
      const store = useGameStore;

      // 미소유 simple 트랙이 교체(방향 전환) 타깃으로 인정된다
      expect(isValidBuildTargetWithReplace({ col: 2, row: 1 }, store.getState().board, 'player1')).toBe(true);

      // buildTrack 경유 방향 전환: [2,5] → [2,1] (O 도시 연결 변 유지, 열린 변만 변경)
      expect(store.getState().canBuildTrack({ col: 2, row: 1 }, [2, 1])).toBe(true);
      expect(store.getState().buildTrack({ col: 2, row: 1 }, [2, 1])).toBe(true);

      const track = store.getState().board.trackTiles.find(
        t => t.coord.col === 2 && t.coord.row === 1
      );
      expect(track!.edges).toEqual([2, 1]);
      expect(track!.owner).toBeNull(); // 방향 전환은 소유권 무변경 (룰 IV)
    });

    it('UI 흐름: 미소유 트랙을 소스로 선택하면 연장 타깃이 하이라이트된다', () => {
      // (실플레이 버그: store 검증만 열리고 getBuildableNeighbors가 미소유 소스에 []를 돌려줘
      //  소스 클릭은 되는데 노란 타깃이 0개 — UI에서 연장이 계속 불가능했다)
      placeTrack({ col: 2, row: 1 }, [2, 5], null);
      const store = useGameStore;

      store.getState().selectSourceHex({ col: 2, row: 1 });
      const ui = store.getState().ui;
      expect(ui.buildMode).toBe('source_selected');
      expect(ui.buildableNeighbors.length).toBeGreaterThan(0);
      // 열린 변(edge5) 방향의 (3,0)이 연장 후보에 포함
      expect(ui.buildableNeighbors.some(n => n.coord.col === 3 && n.coord.row === 0)).toBe(true);
    });

    it('트랙 소스 선택 시 방향 전환 방향도 노란 하이라이트에 포함 + 클릭 한 번에 전환', () => {
      // 사용자 UX: 미완성 트랙 클릭 → 갈 수 있는 방향 전부 노랑 (연장 + 방향 전환, 버튼 없음)
      placeTrack({ col: 2, row: 1 }, [2, 5], null);
      const store = useGameStore;

      store.getState().selectSourceHex({ col: 2, row: 1 });
      const ui = store.getState().ui;

      // 방향 전환 타깃(현재 변 2·5 제외한 유효 방향)이 하이라이트에 포함된다
      const redirectTargets = getRedirectTargetHexes(
        { col: 2, row: 1 }, store.getState().board, 'player1'
      );
      expect(redirectTargets.length).toBeGreaterThan(0);
      for (const rt of redirectTargets) {
        expect(ui.highlightedHexes.some(h => h.col === rt.coord.col && h.row === rt.coord.row)).toBe(true);
      }
      // 연장 후보와 방향 전환 후보는 서로소 (클릭 판정이 겹치지 않음)
      for (const rt of redirectTargets) {
        expect(ui.buildableNeighbors.some(n => n.coord.col === rt.coord.col && n.coord.row === rt.coord.row)).toBe(false);
      }

      // 노란 방향 전환 칸 클릭 = 즉시 전환 (GameBoard가 같은 헬퍼로 edge를 찾아 redirectTrack 호출)
      const rt = redirectTargets[0];
      expect(store.getState().redirectTrack({ col: 2, row: 1 }, rt.edge)).toBe(true);
      const track = store.getState().board.trackTiles.find(
        t => t.coord.col === 2 && t.coord.row === 1
      );
      expect(track!.edges).toEqual([2, rt.edge]);
      expect(track!.owner).toBeNull(); // 소유권 무변경
    });

    it('내 트랙이 0개여도 미소유 구간 인수 연장은 첫 트랙 규칙(도시 인접) 예외로 허용된다', () => {
      // 실플레이 버그 재현(2026-07-22 브라우저 검증): 내 트랙이 전부 미소유로 풀린 뒤
      // 도시에서 떨어진 미소유 구간 끝에 이어 지으면 "첫 트랙 = 도시 인접" 규칙에 걸려 거부됐다.
      // 미소유 체인: O 도시 → (2,1) → (3,0), 열린 끝 (3,0)의 edge1 너머 (3,1)은 도시 비인접.
      placeTrack({ col: 2, row: 1 }, [2, 5], null);
      placeTrack({ col: 3, row: 0 }, [2, 1], null);
      const store = useGameStore;

      // player1 트랙 0개 + (3,1)은 도시 인접 아님 → 예전엔 false, 이제 인수 연장으로 true
      expect(store.getState().board.trackTiles.some(t => t.owner === 'player1')).toBe(false);
      expect(store.getState().canBuildTrack({ col: 3, row: 1 }, [4, 1])).toBe(true);
      expect(store.getState().buildTrack({ col: 3, row: 1 }, [4, 1])).toBe(true);

      // 미소유 체인 전체가 인수됨
      const owners = ['2,1', '3,0', '3,1'].map(k => {
        const [c, r] = k.split(',').map(Number);
        return store.getState().board.trackTiles.find(t => t.coord.col === c && t.coord.row === r)!.owner;
      });
      expect(owners).toEqual(['player1', 'player1', 'player1']);
    });

    it('소스 선택 상태에서 방향 전환을 커밋하면 하이라이트·선택 UI가 전부 초기화된다', () => {
      // 실플레이 버그(2026-07-22): redirectTrack이 buildMode만 idle로 되돌리고
      // highlightedHexes/sourceHex를 남겨 방향 전환 후에도 노란 칸이 화면에 잔존했다.
      placeTrack({ col: 2, row: 1 }, [2, 5], null);
      const store = useGameStore;

      store.getState().selectSourceHex({ col: 2, row: 1 });
      expect(store.getState().ui.highlightedHexes.length).toBeGreaterThan(0);

      const rt = getRedirectTargetHexes({ col: 2, row: 1 }, store.getState().board, 'player1')[0];
      expect(store.getState().redirectTrack({ col: 2, row: 1 }, rt.edge)).toBe(true);

      const ui = store.getState().ui;
      expect(ui.buildMode).toBe('idle');
      expect(ui.highlightedHexes).toEqual([]);
      expect(ui.buildableNeighbors).toEqual([]);
      expect(ui.sourceHex).toBeNull();
    });

    it('정부 트랙(중립)은 연장해도 인수되지 않는다', () => {
      // 정부 트랙(미소유·isGovernment): O 도시 연결, (3,0) 방향으로 열림
      placeTrack({ col: 2, row: 1 }, [2, 5], null, true);
      const store = useGameStore;

      // 새 타일이 물리적으로 맞물려도 (연결성은 C 도시 인접으로 충족)
      expect(store.getState().buildTrack({ col: 3, row: 0 }, [2, 0])).toBe(true);

      // 정부 트랙은 중립 유지
      const gov = store.getState().board.trackTiles.find(
        t => t.coord.col === 2 && t.coord.row === 1
      );
      expect(gov!.owner).toBeNull();
    });
  });
});
