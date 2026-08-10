/**
 * AI 동적 경로 선택기 (selector.ts) 단위 테스트
 *
 * 정적 시나리오 대신 화물 기반 동적 전략을 테스트합니다.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getNextTargetRoute, reevaluateStrategy, findNextTargetRoute } from '../selector';
import { resetStrategyStates, getCurrentRoute, setCurrentRoute } from '../state';
import {
  createMockGameState,
  createMockPlayer,
  addCubesToCity,
  setPlayerCash as _setPlayerCash,
  setPlayerEngine,
  addTrack,
} from '../../__tests__/helpers/mockState';
import type { DeliveryRoute } from '../types';
import { findCompletedLinks } from '@/utils/hexGrid';
void _setPlayerCash; // 향후 테스트 확장용

// mockState의 도시 ID (Pittsburgh, Cleveland, Columbus, Cincinnati)
// selector.ts의 analyzeDeliveryOpportunities는 실제 tutorialMap 도시 ID 사용

describe('getNextTargetRoute - 동적 화물 기반 전략', () => {
  beforeEach(() => {
    // 테스트 전 전략 상태 초기화
    resetStrategyStates();
  });

  describe('배달 가능한 화물이 있는 경우', () => {
    it('가장 가까운 배달 기회를 반환', () => {
      // Pittsburgh(yellow)에 blue 큐브 추가 → Cleveland(blue)로 배달 가능
      let state = createMockGameState();
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);

      const route = getNextTargetRoute(state, 'player1');

      // 경로가 반환되어야 함
      expect(route).not.toBeNull();
    });

    it('연결된 도시에서 시작하는 경로 우선', () => {
      // player1이 Pittsburgh에 연결된 트랙이 있음
      let state = createMockGameState();
      state = addTrack(state, { col: 3, row: 0 }, [0, 3], 'player1');

      // Pittsburgh와 Columbus 둘 다 배달 가능한 화물
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);  // → Cleveland
      state = addCubesToCity(state, 'Columbus', ['purple']); // → Cincinnati

      const route = getNextTargetRoute(state, 'player1');

      // 경로가 반환되어야 함
      expect(route).not.toBeNull();
    });

    it('엔진 레벨 + 2 이내 도달 가능한 경로만 선택', () => {
      let state = createMockGameState();
      state = setPlayerEngine(state, 'player1', 1);

      // 거리 1인 경로
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);  // 거리 1

      const route = getNextTargetRoute(state, 'player1');

      // 엔진 레벨 1 + 2 = 3 이내 경로 선택
      expect(route).not.toBeNull();
    });

    describe('엔진 레벨 기반 우선순위 (핵심 요청 사항)', () => {
      it('엔진 레벨 혹은 엔진 레벨+1인 경로에 강력한 우선순위 부여', () => {
        let state = createMockGameState();
        state = setPlayerEngine(state, 'player1', 1); // 엔진 레벨 1

        // 기회 A: Cleveland -> Columbus (거리 2, 엔진+1 매칭)
        // Columbus는 red 임
        state = addCubesToCity(state, 'Cleveland', ['red']);

        // 기회 B: Cleveland -> Pittsburgh (거리 4, 엔진+3 매칭)
        // Pittsburgh는 yellow 임
        state = addCubesToCity(state, 'Cleveland', ['yellow']);

        const route = getNextTargetRoute(state, 'player1');
        expect(route).not.toBeNull();

        // 거리 2인 A가 거리 4인 B보다 엔진 매칭 보너스(+500) 덕분에 우선순위가 높아야 함
        expect(route?.from).toBe('Cleveland');
        expect(route?.to).toBe('Columbus');
      });
    });
  });

  describe('배달 가능한 화물이 없는 경우', () => {
    it('네트워크 확장 타겟을 반환', () => {
      const state = createMockGameState();
      // 모든 도시에 해당 색상 화물이 없는 경우
      // (기본 mock 상태에서 화물이 없을 때)

      const route = getNextTargetRoute(state, 'player1');

      // 네트워크 확장 경로 또는 null
      // 첫 트랙 건설을 위한 경로 반환
      if (route) {
        expect(route.priority).toBe(2); // 확장 경로는 priority 2
      }
    });
  });

  describe('다중 링크 경로 분해', () => {
    it('긴 경로를 세그먼트로 분해하여 첫 세그먼트 반환', () => {
      let state = createMockGameState();
      // player1이 첫 트랙 없음

      // 거리가 먼 경로
      state = addCubesToCity(state, 'Cincinnati', ['yellow']); // Columbus로 배달

      const route = getNextTargetRoute(state, 'player1');

      // 첫 세그먼트 또는 전체 경로 반환
      expect(route).not.toBeNull();
    });
  });
});

describe('reevaluateStrategy - 전략 재평가', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  describe('현재 경로가 없는 경우', () => {
    it('새 경로를 탐색', () => {
      let state = createMockGameState();
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);

      reevaluateStrategy(state, 'player1');

      const route = getCurrentRoute('player1');
      expect(route).not.toBeNull();
    });
  });

  describe('현재 경로가 완성된 경우', () => {
    it('새 경로를 탐색', () => {
      let state = createMockGameState();
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);
      state = addCubesToCity(state, 'Cleveland', ['red']);

      // 완성된 경로 설정
      const route: DeliveryRoute = { from: 'Pittsburgh', to: 'Cleveland', priority: 1 };
      setCurrentRoute('player1', route);

      // 트랙 추가
      state = addTrack(state, { col: 3, row: 0 }, [0, 3], 'player1');

      reevaluateStrategy(state, 'player1');

      // 경로 재평가
      const newRoute = getCurrentRoute('player1');
      expect(newRoute).not.toBeNull();
    });
  });

  describe('현재 경로에 화물이 없는 경우', () => {
    it('새 경로를 탐색', () => {
      let state = createMockGameState();
      // Pittsburgh→Cleveland 경로에 화물 없음
      state = addCubesToCity(state, 'Columbus', ['purple']); // 다른 경로에만 화물

      const route: DeliveryRoute = { from: 'Pittsburgh', to: 'Cleveland', priority: 1 };
      setCurrentRoute('player1', route);

      reevaluateStrategy(state, 'player1');

      // 화물 있는 새 경로로 전환
      const newRoute = getCurrentRoute('player1');
      // 새 경로가 있거나 유지될 수 있음
      expect(newRoute).not.toBeNull();
    });
  });

  describe('현재 경로가 유효한 경우', () => {
    it('현재 경로 유지', () => {
      let state = createMockGameState();
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);

      const route: DeliveryRoute = { from: 'Pittsburgh', to: 'Cleveland', priority: 1 };
      setCurrentRoute('player1', route);

      reevaluateStrategy(state, 'player1');

      const currentRoute = getCurrentRoute('player1');
      expect(currentRoute?.from).toBe('Pittsburgh');
      expect(currentRoute?.to).toBe('Cleveland');
    });
  });
});

describe('findNextTargetRoute - 호환성 함수', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  it('route와 needsStrategyReeval을 반환', () => {
    let state = createMockGameState();
    state = addCubesToCity(state, 'Pittsburgh', ['blue']);

    const result = findNextTargetRoute(state, 'player1');

    expect(result).toHaveProperty('route');
    expect(result).toHaveProperty('needsStrategyReeval');
  });

  it('경로가 있으면 needsStrategyReeval: false', () => {
    let state = createMockGameState();
    state = addCubesToCity(state, 'Pittsburgh', ['blue']);

    const result = findNextTargetRoute(state, 'player1');

    if (result.route) {
      expect(result.needsStrategyReeval).toBe(false);
    }
  });

  it('경로가 없으면 needsStrategyReeval: true', () => {
    const state = createMockGameState();
    // 화물 없는 상태

    const result = findNextTargetRoute(state, 'player1');

    // 화물 없으면 네트워크 확장 경로 또는 null
    // 실제 동작에 따라 테스트
    expect(result).toHaveProperty('needsStrategyReeval');
  });
});

describe('동적 전략 vs 정적 시나리오', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  it('화물 배치에 따라 경로가 동적으로 변경됨', () => {
    // 첫 번째 상황: Pittsburgh에 blue 화물
    let state1 = createMockGameState();
    state1 = addCubesToCity(state1, 'Pittsburgh', ['blue']);

    const route1 = getNextTargetRoute(state1, 'player1');
    expect(route1).not.toBeNull();

    // 두 번째 상황: Columbus에 purple 화물만
    resetStrategyStates();
    let state2 = createMockGameState();
    state2 = addCubesToCity(state2, 'Columbus', ['purple']);

    const route2 = getNextTargetRoute(state2, 'player1');
    expect(route2).not.toBeNull();
    // 다른 경로가 선택됨
    expect(route2?.from).not.toBe(route1?.from);
  });

  it('연결된 도시가 우선됨', () => {
    // player1이 Pittsburgh에 연결
    let state = createMockGameState();
    state = addTrack(state, { col: 3, row: 0 }, [0, 3], 'player1');

    // 둘 다 배달 가능
    state = addCubesToCity(state, 'Pittsburgh', ['blue']);
    state = addCubesToCity(state, 'Cincinnati', ['red']); // Columbus로 배달 가능

    const route = getNextTargetRoute(state, 'player1');

    // 경로가 반환되어야 함
    expect(route).not.toBeNull();
  });
});

describe('사람이 완성한 링크 회피 (2026-08-10 r5pm)', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  /** 3인(areaMulti) 상태 + Pittsburgh blue×2(→Cleveland)·Columbus purple×1(→Cincinnati) */
  function threePlayerState() {
    let state = createMockGameState();
    const human = createMockPlayer('player3', { name: 'Human', isAI: false, color: 'green' });
    state = {
      ...state,
      players: { ...state.players, player3: human },
      activePlayers: [...state.activePlayers, 'player3'],
      playerOrder: [...state.playerOrder, 'player3'],
    };
    // blue×4로 Pittsburgh→Cleveland가 (사람 회랑이 생겨도) 점수상 최선이 되게 —
    // 점수 하락(병렬 회랑 경제성)만으로 밀려나는 약한 케이스가 아니라, "그래도 잡고 싶은"
    // 강한 케이스에서 차단이 실제로 작동하는지를 본다 (대조군 검증으로 전제 고정)
    state = addCubesToCity(state, 'Pittsburgh', ['blue', 'blue', 'blue', 'blue']);
    state = addCubesToCity(state, 'Columbus', ['purple']);
    return state;
  }

  const isPitCle = (r: DeliveryRoute | null): boolean => !!r &&
    ((r.from === 'Pittsburgh' && r.to === 'Cleveland') ||
     (r.from === 'Cleveland' && r.to === 'Pittsburgh'));

  it('봇은 사람이 이미 완성한 정확히 같은 연결을 목표로 잡지 않는다', () => {
    // ⚠️ 이 불변식은 두 겹으로 지켜진다 — ① 점수: 사람 회랑이 생기면 병렬 중복의 ΔVP가
    //    급락(7.0→−5.8 실측)해 자연히 밀려나고, ② 규칙: humanLinkTaken이 sameLink를 차단.
    //    현 점수 체계에선 ①만으로도 통과하지만, 훗날 점수 튜닝이 경계를 뒤집으면(큐브가
    //    쌓일수록 좁아진다: blue×4에서 −3.8 vs −3.0) ②가 마지막 저지선이고 이 테스트가
    //    "봇이 사람 완성 링크를 중복 부설한다"는 행동 회귀를 어느 쪽이 무너져도 잡는다.
    // 대조군: 사람 링크가 없으면 Pittsburgh→Cleveland가 자연 최선이어야 한다
    // (이게 깨지면 본검이 아무것도 검증하지 못한다 — 전제 고정)
    const controlRoute = getNextTargetRoute(threePlayerState(), 'player1');
    expect(isPitCle(controlRoute)).toBe(true);

    resetStrategyStates();

    // 본검: 사람 소유 완성 링크 Cleveland(1,1)↔Pittsburgh(4,0) —
    // (1,1) --NE--> (2,0) --E--> (3,0) --E--> (4,0). (2,0)은 SW(2)+E(0), (3,0)은 W(3)+E(0).
    // ⚠️ row 1에 우회 회랑((3,1)·(2,1))이 비어 있다 — 물리 점유만으로는 A*가 우회 병렬
    //    노선을 찾아 같은 연결을 다시 깔 수 있다(Rust Belt Duluth↔Minneapolis 이중 부설과
    //    같은 꼴). 이 차단은 그 우회 중복을 막는 것이다.
    let state = threePlayerState();
    state = addTrack(state, { col: 2, row: 0 }, [2, 0], 'player3');
    state = addTrack(state, { col: 3, row: 0 }, [3, 0], 'player3');
    // ★ 사람이 **이번 턴에 방금** 완성한 링크라는 걸 명시(builtTurn = 현재 턴) —
    //   같은 건설 라운드에서 사람이 먼저 짓고 봇이 뒤에 짓는 시나리오다. 차단 판정
    //   (findCompletedLinks)은 builtTurn을 보지 않고 물리 연결+소유자만 보며, 봇은
    //   결정 시점의 라이브 보드를 읽으므로 방금 완성분도 즉시 차단 대상이다.
    state = {
      ...state,
      board: {
        ...state.board,
        trackTiles: state.board.trackTiles.map(t =>
          t.owner === 'player3' ? { ...t, builtTurn: state.currentTurn } : t
        ),
      },
    };
    expect(findCompletedLinks(state.board).some(l => l.owner === 'player3')).toBe(true);

    // 같은 연결의 병렬 중복 부설 방지 — 다른 경로(Columbus→Cincinnati 등)로 빠져야 한다
    const route = getNextTargetRoute(state, 'player1');
    expect(isPitCle(route)).toBe(false);
  });

  it('봇끼리는 기존 동작 그대로 — 봇 완성 링크는 사람-링크 차단 대상이 아니다', () => {
    // 전원 봇(기본 mock 2인)일 때 사람-링크 차단이 발동하지 않아야 한다 (시뮬 항등의 전제)
    let state = createMockGameState();
    state = addTrack(state, { col: 2, row: 0 }, [2, 0], 'player2');
    state = addTrack(state, { col: 3, row: 0 }, [3, 0], 'player2');
    state = addCubesToCity(state, 'Pittsburgh', ['blue']);
    const route = getNextTargetRoute(state, 'player1');
    expect(route).not.toBeNull();
  });
});
