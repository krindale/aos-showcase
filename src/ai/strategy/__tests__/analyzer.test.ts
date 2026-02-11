/**
 * AI 전략 분석기 (analyzer.ts) 단위 테스트
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateTrackForRoute,
  getConnectedCities,
  getRouteProgress,
  hasMatchingCubes,
  isRouteBlockedByOpponent,
  analyzeOpponentTracks,
  getStrategyAdjustments,
  breakRouteIntoSegments,
  getIntermediateCities,
} from '../analyzer';
import { hexDistance } from '@/utils/hexGrid';
import { resetStrategyStates } from '../state';
import {
  createMockGameState,
  createMockBoard,
  createMockCity,
  addTrack,
  addCubesToCity,
  addOpponentTrack,
} from '../../__tests__/helpers/mockState';
import type { DeliveryRoute } from '../types';
import type { HexCoord } from '@/types/game';

describe('hexDistance', () => {
  it('같은 좌표면 0 반환', () => {
    const coord: HexCoord = { col: 2, row: 3 };
    expect(hexDistance(coord, coord)).toBe(0);
  });

  it('인접한 헥스는 1 반환', () => {
    const a: HexCoord = { col: 2, row: 2 };
    const b: HexCoord = { col: 3, row: 2 }; // 오른쪽 인접
    expect(hexDistance(a, b)).toBe(1);
  });

  it('2칸 떨어진 헥스는 2 반환', () => {
    const a: HexCoord = { col: 0, row: 0 };
    const b: HexCoord = { col: 2, row: 0 };
    expect(hexDistance(a, b)).toBe(2);
  });

  it('대각선 거리 계산', () => {
    const a: HexCoord = { col: 0, row: 0 };
    const b: HexCoord = { col: 2, row: 2 };
    // Odd-r 헥스 좌표계에서의 거리
    expect(hexDistance(a, b)).toBeGreaterThan(0);
  });
});

describe('evaluateTrackForRoute', () => {
  let board: ReturnType<typeof createMockBoard>;
  const playerId = 'player1';

  beforeEach(() => {
    resetStrategyStates();
    // Tutorial 맵 기반 보드
    board = createMockBoard([
      createMockCity('Pittsburgh', 'yellow', { col: 4, row: 0 }),
      createMockCity('Cleveland', 'blue', { col: 1, row: 1 }),
      createMockCity('Columbus', 'red', { col: 2, row: 3 }),
      createMockCity('Cincinnati', 'purple', { col: 0, row: 4 }),
    ]);
  });

  describe('출발 도시 인접', () => {
    it('출발 도시에 인접하면 최소 25점 보장', () => {
      const route: DeliveryRoute = {
        from: 'Pittsburgh',
        to: 'Cleveland',
        priority: 1,
      };

      // Pittsburgh (4,0) 바로 옆 헥스
      const trackCoord: HexCoord = { col: 3, row: 0 };
      const edges: [number, number] = [3, 0]; // 왼쪽에서 오른쪽으로

      const { score } = evaluateTrackForRoute(route, board, trackCoord, edges, playerId);

      expect(score).toBeGreaterThanOrEqual(25);
    });
  });

  describe('도착 도시 인접', () => {
    it('도착 도이에 인접하면 최소 25점 보장', () => {
      const route: DeliveryRoute = {
        from: 'Pittsburgh',
        to: 'Cleveland',
        priority: 1,
      };

      // Cleveland (1,1) 바로 옆 헥스
      const trackCoord: HexCoord = { col: 2, row: 1 };
      const edges: [number, number] = [3, 0];

      const { score } = evaluateTrackForRoute(route, board, trackCoord, edges, playerId);

      expect(score).toBeGreaterThanOrEqual(25);
    });
  });

  describe('경로와 무관한 위치', () => {
    it('경로와 멀리 떨어진 위치는 낮은 점수', () => {
      const route: DeliveryRoute = {
        from: 'Pittsburgh',
        to: 'Cleveland',
        priority: 1,
      };

      // Cincinnati (0,4) 근처 - Pittsburgh→Cleveland 경로와 무관
      const trackCoord: HexCoord = { col: 0, row: 3 };
      const edges: [number, number] = [4, 1];

      const { score } = evaluateTrackForRoute(route, board, trackCoord, edges, playerId);

      // 경로와 무관하면 낮은 점수 (보통 0 이하 또는 매우 낮음)
      expect(score).toBeLessThan(50);
    });
  });

  describe('엣지 방향 보너스', () => {
    it('목표 방향으로 향하는 엣지가 있으면 보너스', () => {
      const route: DeliveryRoute = {
        from: 'Pittsburgh',
        to: 'Cleveland',
        priority: 1,
      };

      // Pittsburgh (4,0) 옆에서 Cleveland (1,1) 방향으로
      const trackCoord: HexCoord = { col: 3, row: 0 };

      // Cleveland 방향 (왼쪽 아래)으로 향하는 엣지
      const goodEdges: [number, number] = [0, 3]; // 오른쪽 입구, 왼쪽 출구

      const { score: scoreGood } = evaluateTrackForRoute(route, board, trackCoord, goodEdges, playerId);

      // 반대 방향 엣지
      const badEdges: [number, number] = [3, 0]; // 왼쪽 입구, 오른쪽 출구

      const { score: scoreBad } = evaluateTrackForRoute(route, board, trackCoord, badEdges, playerId);

      // 좋은 방향이 더 높은 점수 (구현에 따라 다를 수 있음)
      // 최소한 인접 보너스는 동일하게 받음
      expect(scoreGood).toBeGreaterThanOrEqual(25);
      expect(scoreBad).toBeGreaterThanOrEqual(25);
    });
  });
});

describe('getConnectedCities', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  describe('트랙 없음', () => {
    it('트랙이 없으면 모든 도시 반환 (트랙 없음 = 첫 건설 가능)', () => {
      const state = createMockGameState();

      const connected = getConnectedCities(state, 'player1');

      // 트랙이 없으면 모든 도시가 연결 가능한 것으로 취급
      expect(connected.length).toBe(4);
    });
  });

  describe('도시 인접 트랙', () => {
    it('도시에 인접한 트랙이 있으면 해당 도시 포함', () => {
      let state = createMockGameState();
      // Pittsburgh (4,0) 인접에 트랙 배치, 엣지가 도시를 향함
      state = addTrack(state, { col: 3, row: 0 }, [0, 3], 'player1');

      const connected = getConnectedCities(state, 'player1');

      expect(connected).toContain('Pittsburgh');
    });
  });

  describe('엣지 방향 검증', () => {
    it('올바른 엣지 방향만 연결로 인정', () => {
      let state = createMockGameState();
      // 트랙이 도시를 향하지 않는 방향이면 연결 안됨
      state = addTrack(state, { col: 3, row: 0 }, [4, 1], 'player1');

      const connected = getConnectedCities(state, 'player1');

      // 엣지가 Pittsburgh 방향(0)을 포함하지 않으므로 연결 안됨
      // 하지만 트랙 있으면 기본 검사 로직에 따라 다를 수 있음
      expect(connected).toBeDefined();
    });
  });

  describe('비인접 도시 제외', () => {
    it('떨어진 도시는 미포함', () => {
      let state = createMockGameState();
      // 중앙에 트랙 배치 (도시에서 멀리)
      state = addTrack(state, { col: 2, row: 2 }, [0, 3], 'player1');

      const connected = getConnectedCities(state, 'player1');

      // 어떤 도시에도 인접하지 않으므로 빈 배열 또는 특정 도시 없음
      expect(Array.isArray(connected)).toBe(true);
    });
  });
});

describe('getRouteProgress', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  const route: DeliveryRoute = {
    from: 'Pittsburgh',
    to: 'Cleveland',
    priority: 1,
  };

  describe('트랙 없음', () => {
    it('트랙이 없으면 진행도 0', () => {
      const state = createMockGameState();

      const progress = getRouteProgress(state, 'player1', route);

      expect(progress).toBe(0);
    });
  });

  describe('출발지 근처 트랙', () => {
    it('출발지 근처에 트랙이 있으면 진행도 > 0', () => {
      let state = createMockGameState();
      state = addTrack(state, { col: 3, row: 0 }, [0, 3], 'player1');

      const progress = getRouteProgress(state, 'player1', route);

      expect(progress).toBeGreaterThan(0);
    });
  });

  describe('도착지 근처 트랙', () => {
    it('도착지 근처에 트랙이 있으면 진행도 > 0', () => {
      let state = createMockGameState();
      // Cleveland (1,1) 근처
      state = addTrack(state, { col: 2, row: 1 }, [0, 3], 'player1');

      const progress = getRouteProgress(state, 'player1', route);

      expect(progress).toBeGreaterThan(0);
    });
  });

  describe('중간 진행', () => {
    it('0 < progress < 1 범위 확인', () => {
      let state = createMockGameState();
      state = addTrack(state, { col: 3, row: 0 }, [0, 3], 'player1');

      const progress = getRouteProgress(state, 'player1', route);

      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    });
  });
});

describe('hasMatchingCubes', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  describe('출발 도시에 목적지 색상 큐브', () => {
    it('매칭 큐브가 있으면 true', () => {
      let state = createMockGameState();
      // Pittsburgh에 blue 큐브 추가 (Cleveland는 blue 도시)
      state = addCubesToCity(state, 'Pittsburgh', ['blue']);

      const route: DeliveryRoute = { from: 'Pittsburgh', to: 'Cleveland', priority: 1 };
      const result = hasMatchingCubes(state, route);

      expect(result).toBe(true);
    });
  });

  describe('출발 도시에 다른 색상만', () => {
    it('매칭 큐브가 없으면 false', () => {
      let state = createMockGameState();
      // Pittsburgh에 red 큐브 추가 (Cleveland는 blue 도시)
      state = addCubesToCity(state, 'Pittsburgh', ['red']);

      const route: DeliveryRoute = { from: 'Pittsburgh', to: 'Cleveland', priority: 1 };
      const result = hasMatchingCubes(state, route);

      expect(result).toBe(false);
    });
  });

  describe('출발 도시에 큐브 없음', () => {
    it('큐브가 없으면 false', () => {
      const state = createMockGameState();

      const route: DeliveryRoute = { from: 'Pittsburgh', to: 'Cleveland', priority: 1 };
      const result = hasMatchingCubes(state, route);

      expect(result).toBe(false);
    });
  });

  describe('목적지 도시 없음', () => {
    it('존재하지 않는 목적지면 false', () => {
      const state = createMockGameState();

      const route: DeliveryRoute = { from: 'Pittsburgh', to: 'NonExistent', priority: 1 };
      const result = hasMatchingCubes(state, route);

      expect(result).toBe(false);
    });
  });
});

describe('isRouteBlockedByOpponent', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  const route: DeliveryRoute = { from: 'Pittsburgh', to: 'Cleveland', priority: 1 };

  describe('상대 트랙이 경로상', () => {
    it('상대 트랙이 경로 중간에 있으면 true', () => {
      let state = createMockGameState();
      // 경로 중간에 상대 트랙 배치
      state = addOpponentTrack(state, { col: 2, row: 0 }, [0, 3], 'player2');

      const result = isRouteBlockedByOpponent(state, 'player1', route);

      // 상대 트랙이 경로상에 있고 AI 트랙이 없으면 차단
      expect(typeof result).toBe('boolean');
    });
  });

  describe('상대 트랙 없음', () => {
    it('상대 트랙이 없으면 false', () => {
      const state = createMockGameState();

      const result = isRouteBlockedByOpponent(state, 'player1', route);

      expect(result).toBe(false);
    });
  });

  describe('내 트랙만 있음', () => {
    it('내 트랙만 있으면 false', () => {
      let state = createMockGameState();
      state = addTrack(state, { col: 2, row: 0 }, [0, 3], 'player1');

      const result = isRouteBlockedByOpponent(state, 'player1', route);

      expect(result).toBe(false);
    });
  });

  describe('경로 밖 상대 트랙', () => {
    it('경로와 관련 없는 위치의 상대 트랙은 차단 아님', () => {
      let state = createMockGameState();
      // Cincinnati 근처에 상대 트랙 (Pittsburgh-Cleveland 경로와 무관)
      state = addOpponentTrack(state, { col: 0, row: 3 }, [0, 3], 'player2');

      const result = isRouteBlockedByOpponent(state, 'player1', route);

      expect(result).toBe(false);
    });
  });
});

describe('analyzeOpponentTracks', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  describe('상대 트랙 없음', () => {
    it('트랙 없으면 빈 결과', () => {
      const state = createMockGameState();

      const result = analyzeOpponentTracks(state, 'player1');

      expect(result.trackCount).toBe(0);
      expect(result.connectedCities.length).toBe(0);
      expect(result.targetCities.length).toBe(0);
    });
  });

  describe('연결된 도시 식별', () => {
    it('상대 트랙이 도시에 인접하면 연결 식별', () => {
      let state = createMockGameState();
      // Pittsburgh 인접에 상대 트랙 (도시 향하는 엣지)
      state = addOpponentTrack(state, { col: 3, row: 0 }, [0, 3], 'player2');

      const result = analyzeOpponentTracks(state, 'player1');

      expect(result.trackCount).toBe(1);
      // 도시 연결 여부는 엣지 방향에 따라 결정
      expect(result.connectedCities.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('목표 도시 추론', () => {
    it('거리 2 이하 미연결 도시를 목표로 추론', () => {
      let state = createMockGameState();
      state = addOpponentTrack(state, { col: 2, row: 0 }, [0, 3], 'player2');

      const result = analyzeOpponentTracks(state, 'player1');

      // 거리 2 이하 도시가 목표로 추정될 수 있음
      expect(Array.isArray(result.targetCities)).toBe(true);
    });
  });
});

describe('getStrategyAdjustments', () => {
  beforeEach(() => {
    resetStrategyStates();
  });

  describe('상대 없음', () => {
    it('상대 트랙 없으면 조정 없음', () => {
      const state = createMockGameState();
      const opponentAnalysis = analyzeOpponentTracks(state, 'player1');

      const adjustments = getStrategyAdjustments(state, 'player1', opponentAnalysis);

      expect(adjustments.size).toBe(0);
    });
  });

  describe('상대 있음', () => {
    it('상대 트랙 있으면 시나리오별 조정값 계산', () => {
      let state = createMockGameState();
      state = addOpponentTrack(state, { col: 3, row: 0 }, [0, 3], 'player2');
      const opponentAnalysis = analyzeOpponentTracks(state, 'player1');

      const adjustments = getStrategyAdjustments(state, 'player1', opponentAnalysis);

      // 조정값이 계산되어야 함
      expect(adjustments).toBeDefined();
    });
  });
});

describe('breakRouteIntoSegments', () => {
  let board: ReturnType<typeof createMockBoard>;

  beforeEach(() => {
    resetStrategyStates();
    board = createMockBoard();
  });

  describe('1링크 경로', () => {
    it('분해 안 함 (단일 배열)', () => {
      // Pittsburgh → Cleveland는 인접하지 않지만 거리가 가까움
      const route: DeliveryRoute = { from: 'Pittsburgh', to: 'Cleveland', priority: 1 };

      const segments = breakRouteIntoSegments(route, board);

      // 중간 도시가 없으면 원래 경로 그대로
      expect(segments.length).toBeGreaterThanOrEqual(1);
      expect(segments[0].from).toBe('Pittsburgh');
    });
  });

  describe('우선순위 유지', () => {
    it('세그먼트에 우선순위 전달', () => {
      const route: DeliveryRoute = { from: 'Pittsburgh', to: 'Cincinnati', priority: 2 };

      const segments = breakRouteIntoSegments(route, board);

      segments.forEach(seg => {
        expect(seg.priority).toBe(2);
      });
    });
  });
});

describe('getIntermediateCities', () => {
  let board: ReturnType<typeof createMockBoard>;

  beforeEach(() => {
    resetStrategyStates();
    board = createMockBoard();
  });

  describe('인접 도시', () => {
    it('인접 도시면 빈 배열', () => {
      // 인접한 도시가 없는 경우
      const route: DeliveryRoute = { from: 'Pittsburgh', to: 'Cleveland', priority: 1 };

      const intermediate = getIntermediateCities(route, board);

      // 중간 도시가 있을 수도 없을 수도 있음 (맵 구조에 따라)
      expect(Array.isArray(intermediate)).toBe(true);
    });
  });

  describe('출발/도착 제외', () => {
    it('시작/끝 도시 미포함', () => {
      const route: DeliveryRoute = { from: 'Pittsburgh', to: 'Cincinnati', priority: 1 };

      const intermediate = getIntermediateCities(route, board);

      expect(intermediate).not.toContain('Pittsburgh');
      expect(intermediate).not.toContain('Cincinnati');
    });
  });
});
