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
import { getBuildableNeighbors } from '@/utils/hexGrid';
import { PlayerId, HexCoord } from '@/types/game';

describe('트랙 건설 메커니즘', () => {
  beforeEach(() => {
    useGameStore.getState().initGame('tutorial', ['Player1', 'Player2']);
    useGameStore.setState({
      currentPhase: 'buildTrack',
      currentPlayer: 'player1',
    });
  });

  /** 헬퍼: 단순 트랙 직접 배치 (검증 우회) */
  function placeTrack(coord: HexCoord, edges: [number, number], owner: PlayerId) {
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
    placeTrack({ col: 3, row: 1 }, [2, 5], owner); // O쪽 edge2, (4,0)쪽 edge5
    placeTrack({ col: 4, row: 0 }, [2, 0], owner); // (3,1)쪽 edge2, C쪽 edge0
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
    placeTrack({ col: 1, row: 1 }, [4, 0], owner); // P쪽 edge4, (2,1)쪽 edge0
    placeTrack({ col: 2, row: 1 }, [3, 0], owner); // (1,1)쪽 edge3, (3,1)쪽 edge0
  }

  // ===== 1. 트랙 방향 전환 (Redirection) =====

  describe('트랙 방향 전환 (Redirection)', () => {
    it('미완성 자기 트랙이 getBuildableNeighbors에 포함됨 (allowReplace=true)', () => {
      // P(1,0) → (2,0)[3,0] 미완성 트랙
      placeTrack({ col: 2, row: 0 }, [3, 0], 'player1');
      const state = useGameStore.getState();

      // allowReplace=true: 내 미완성 트랙 포함
      const neighbors = getBuildableNeighbors(
        { col: 1, row: 0 }, state.board, 'player1', true
      );
      const hasTrack = neighbors.some(n => n.coord.col === 2 && n.coord.row === 0);
      expect(hasTrack).toBe(true);
    });

    it('미완성 자기 트랙을 buildTrack으로 방향 전환', () => {
      placeTrack({ col: 2, row: 0 }, [3, 0], 'player1');
      const store = useGameStore;

      // [3,0] → [3,1] 로 방향 전환 (E→SE)
      expect(store.getState().canBuildTrack({ col: 2, row: 0 }, [3, 1])).toBe(true);

      const success = store.getState().buildTrack({ col: 2, row: 0 }, [3, 1]);
      expect(success).toBe(true);

      const track = store.getState().board.trackTiles.find(
        t => t.coord.col === 2 && t.coord.row === 0
      );
      expect(track!.edges).toEqual([3, 1]);
      expect(track!.owner).toBe('player1');
    });

    it('완성된 링크 트랙은 방향 전환 불가', () => {
      buildCompletedLink('player1');
      const store = useGameStore;

      // 완성된 링크 (3,1)의 방향 전환 시도
      expect(store.getState().canBuildTrack({ col: 3, row: 1 }, [2, 0])).toBe(false);
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
      placeTrack({ col: 2, row: 0 }, [3, 0], 'player1');
      placeTrack({ col: 3, row: 0 }, [3, 0], 'player1');

      // (4,0)에서 edge 3(W)→(3,0) 연결 가능.
      // 교차 엣지: [3, 1] — edge 3 연결 (3,0) player1, edge 1 → (4,1)
      // 기존 [2,0] vs 새 [3,1]: 3≠2,3≠0,1≠2,1≠0 → 겹침 없음 ✓
      const canBuild = store.getState().canBuildComplexTrack(
        { col: 4, row: 0 }, [3, 1], 'crossing'
      );
      expect(canBuild).toBe(true);

      const success = store.getState().buildComplexTrack(
        { col: 4, row: 0 }, [3, 1], 'crossing'
      );
      expect(success).toBe(true);

      const track = store.getState().board.trackTiles.find(
        t => t.coord.col === 4 && t.coord.row === 0
      );
      expect(track!.trackType).toBe('crossing');
      expect(track!.edges).toEqual([2, 0]);         // 기존 경로 유지
      expect(track!.secondaryEdges).toEqual([3, 1]); // 새 경로 추가
      expect(track!.secondaryOwner).toBe('player1');
    });

    it('상대 트랙 위에 교차 건설 가능', () => {
      // player2 트랙: (2,0) [3, 0] (P→E 방향)
      placeTrack({ col: 2, row: 0 }, [3, 0], 'player2');

      // player1 접근: P(1,0) → (1,1)[4,5]
      // (1,1) odd: edge4(NW)=(1,0)=P ✓, edge5(NE)=(2,0) ← player2 트랙 쪽
      placeTrack({ col: 1, row: 1 }, [4, 5], 'player1');

      // 교차: (2,0)에 새 엣지 [2,5]
      // (1,1) edge5 → (2,0), entry at (2,0) = (5+3)%6 = edge 2
      // 기존 [3,0] vs 새 [2,5]: 2≠3,2≠0,5≠3,5≠0 → 겹침 없음 ✓
      // 연결: edge 2 → (2,0) even, SW = (1,1) player1 트랙 edge 5 = (5+3)%6=2의 반대=5 ✓
      const canBuild = useGameStore.getState().canBuildComplexTrack(
        { col: 2, row: 0 }, [2, 5], 'crossing'
      );
      expect(canBuild).toBe(true);
    });

    it('자기 트랙이 getBuildableNeighbors에 교차 후보로 포함됨', () => {
      buildCompletedLink('player1');
      const state = useGameStore.getState();

      // O(3,2)에서 이웃 조회 → (3,1)은 player1 완성 링크 → 교차 후보
      const neighbors = getBuildableNeighbors(
        { col: 3, row: 2 }, state.board, 'player1', false
      );
      const has31 = neighbors.some(n => n.coord.col === 3 && n.coord.row === 1);
      expect(has31).toBe(true);
    });

    it('복합 트랙 위에 추가 교차 불가', () => {
      buildCompletedLink('player1');
      placeTrack({ col: 2, row: 0 }, [3, 0], 'player1');
      placeTrack({ col: 3, row: 0 }, [3, 0], 'player1');

      const store = useGameStore;
      store.getState().buildComplexTrack({ col: 4, row: 0 }, [3, 1], 'crossing');

      // 이미 복합 → 추가 교차 불가
      expect(store.getState().canBuildComplexTrack(
        { col: 4, row: 0 }, [4, 5], 'crossing'
      )).toBe(false);
    });

    it('엣지가 겹치면 교차 불가', () => {
      buildCompletedLink('player1');

      // (4,0) edges [2, 0] vs 새 [0, 4]: edge 0 겹침
      expect(useGameStore.getState().canBuildComplexTrack(
        { col: 4, row: 0 }, [0, 4], 'crossing'
      )).toBe(false);
    });
  });

  // ===== 3. UI 플로우 통합 =====

  describe('UI 플로우 (selectSourceHex → selectTargetHex → selectExitDirection)', () => {
    it('selectSourceHex에서 미완성 트랙이 buildableNeighbors에 포함됨', () => {
      placeTrack({ col: 2, row: 0 }, [3, 0], 'player1');

      const store = useGameStore;
      store.getState().selectSourceHex({ col: 1, row: 0 }); // P 도시

      const ui = store.getState().ui;
      expect(ui.buildMode).toBe('source_selected');
      expect(ui.buildableNeighbors.some(
        n => n.coord.col === 2 && n.coord.row === 0
      )).toBe(true);
    });

    it('selectSourceHex에서 자기 완성 링크 트랙이 교차 후보로 포함됨', () => {
      buildCompletedLink('player1');

      const store = useGameStore;
      store.getState().selectSourceHex({ col: 3, row: 2 }); // O 도시

      const ui = store.getState().ui;
      expect(ui.buildableNeighbors.some(
        n => n.coord.col === 3 && n.coord.row === 1
      )).toBe(true);
    });

    it('기존 트랙 헥스 선택 시 겹치는 엣지가 exitDirections에서 제외됨', () => {
      buildCompletedLink('player1');
      buildApproachTrack('player1');

      const store = useGameStore;
      // (2,1)에서 출발 → (3,1) 트랙 선택
      store.getState().selectSourceHex({ col: 2, row: 1 });
      store.getState().selectTargetHex({ col: 3, row: 1 });

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
      store.getState().selectSourceHex({ col: 2, row: 1 });
      store.getState().selectTargetHex({ col: 3, row: 1 });

      const ui = store.getState().ui;
      expect(ui.exitDirections.length).toBeGreaterThan(0);

      // 비겹침 엣지 선택 → 기존 단순 트랙이므로 ComplexTrackPanel 표시
      const exitEdge = ui.exitDirections[0].exitEdge;
      store.getState().selectExitDirection(exitEdge);

      const afterUi = store.getState().ui;
      expect(afterUi.complexTrackSelection).not.toBeNull();
    });
  });
});
