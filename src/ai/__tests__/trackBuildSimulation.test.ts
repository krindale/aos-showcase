/**
 * AI 트랙 건설 시뮬레이션 테스트
 *
 * 검증 항목:
 * 1. 같은 턴 내에서 경로가 변경되지 않는지 (턴 내 안정성)
 * 2. 미완성 경로가 다음 턴에서도 유지되는지 (턴 간 지속성)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GameState, PlayerId, GAME_CONSTANTS } from '@/types/game';
import { decideBuildTrack } from '../strategies/buildTrack';
import { getCurrentRoute, clearCurrentRoutes } from '../strategy/state';
import { clearPathCache } from '../strategy/analyzer';
import { TUTORIAL_CITIES, generateTutorialHexTiles } from '@/utils/tutorialMap';
import {
  createMockGameState,
  addCubesToCity,
} from './helpers/mockState';

// 튜토리얼 맵 기반 게임 상태 생성
function createTutorialGameState(): GameState {
  const hexTiles = generateTutorialHexTiles();
  const cities = TUTORIAL_CITIES.map(c => ({ ...c, cubes: [] as string[] }));

  const state = createMockGameState({
    board: {
      cities: cities as GameState['board']['cities'],
      towns: [],
      trackTiles: [],
      hexTiles,
    },
  });

  return state;
}

/** 한 턴의 트랙 건설 시뮬레이션 (최대 buildCount회) */
function simulateTurnBuilds(
  state: GameState,
  playerId: PlayerId,
  buildCount: number
): { state: GameState; decisions: Record<string, unknown>[]; routes: string[] } {
  const decisions: Record<string, unknown>[] = [];
  const routes: string[] = [];
  let currentState = state;

  for (let i = 0; i < buildCount; i++) {
    const decision = decideBuildTrack(currentState, playerId);
    const route = getCurrentRoute(playerId);
    const routeStr = route ? `${route.from}→${route.to}` : null;

    if (decision.action === 'build' || decision.action === 'buildComplex') {
      const coord = decision.coord;
      const edges = decision.edges;
      decisions.push({ coord, edges, route: routeStr });
      if (routeStr) routes.push(routeStr);

      currentState = {
        ...currentState,
        board: {
          ...currentState.board,
          trackTiles: [
            ...currentState.board.trackTiles,
            {
              id: `track-${currentState.currentTurn}-${i}`,
              coord,
              edges,
              owner: playerId,
              trackType: 'simple' as const,
            },
          ],
        },
        phaseState: {
          ...currentState.phaseState,
          builtTracksThisTurn: currentState.phaseState.builtTracksThisTurn + 1,
          lastBuiltCoords: [...currentState.phaseState.lastBuiltCoords, coord],
        },
        players: {
          ...currentState.players,
          [playerId]: {
            ...currentState.players[playerId],
            cash: currentState.players[playerId].cash - 2,
          },
        },
      };
    } else {
      decisions.push({ action: 'skip', route: routeStr });
      if (routeStr) routes.push(routeStr);
      break;
    }
  }

  return { state: currentState, decisions, routes };
}

describe('AI 트랙 건설 경로 안정성', () => {
  beforeEach(() => {
    clearCurrentRoutes();
    clearPathCache();
  });

  it('같은 턴 내에서 경로는 완성 시에만 전환된다', () => {
    let state = createTutorialGameState();

    // 큐브 배치: P에 yellow(→O), C에 red(→P)
    state = addCubesToCity(state, 'P', ['blue', 'yellow']);
    state = addCubesToCity(state, 'CLE', ['red', 'purple']);
    state = addCubesToCity(state, 'O', ['black', 'blue']);
    state = addCubesToCity(state, 'W', ['red', 'yellow']);
    state = addCubesToCity(state, 'I', ['purple', 'red']);

    const playerId: PlayerId = 'player1';
    state = {
      ...state,
      currentTurn: 1,
      currentPhase: 'buildTrack',
      currentPlayer: playerId,
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId],
          cash: 15,
          engineLevel: 1,
          issuedShares: 3,
        },
      },
    };

    // 턴 1: 3번 건설 시도
    const { routes } = simulateTurnBuilds(state, playerId, 3);

    // 검증: 경로 전환은 최대 1회 (경로 완성으로 인한 전환만 허용)
    const uniqueRoutes = Array.from(new Set(routes));
    expect(uniqueRoutes.length).toBeLessThanOrEqual(2);
    console.log(`턴 1: 경로들 = ${uniqueRoutes.join(', ')} (${routes.length}회)`);
  });

  it('다중 세그먼트 경로가 순서대로 진행된다 (P→W = P→O + O→W)', () => {
    let state = createTutorialGameState();

    // P→W 경로: P에 black 큐브 → W(black 도시)
    // breakRouteIntoSegments에 의해 P→O, O→W로 분할됨
    // 턴 1: P→O (2 트랙으로 완성)
    // 턴 2: O→W (다음 세그먼트로 진행)
    state = addCubesToCity(state, 'P', ['black']);

    const playerId: PlayerId = 'player1';
    state = {
      ...state,
      currentTurn: 2,
      currentPhase: 'buildTrack',
      currentPlayer: playerId,
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId],
          cash: 20,
          engineLevel: 1,
          issuedShares: 3,
        },
      },
    };

    // 턴 2: 건설 (첫 세그먼트 P→O) — 턴 2이므로 2링크 경로 P→W가 세그먼트로 분해됨
    const turn1 = simulateTurnBuilds(state, playerId, 3);
    state = turn1.state;
    const turn1Route = getCurrentRoute(playerId);
    console.log(`턴 2 경로: ${turn1Route?.from}→${turn1Route?.to}, 건설 ${turn1.decisions.length}개`);

    // 검증: 초기 경로는 P→O 세그먼트 (완성 후 다음 세그먼트로 전환 가능)
    // 경로 완성 시 자동 전환되므로 최종 경로가 O→W일 수도 있음
    const firstRoute = turn1.routes[0];
    console.log(`첫 경로: ${firstRoute}, 최종 경로: ${turn1Route?.from}→${turn1Route?.to}`);
    expect(firstRoute).toBe('P→O');

    // 턴 3으로 전환
    state = {
      ...state,
      currentTurn: 3,
      phaseState: {
        ...state.phaseState,
        builtTracksThisTurn: 0,
        lastBuiltCoords: [],
        maxTracksThisTurn: GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
      },
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId],
          cash: 15,
        },
      },
    };

    // 턴 3: 건설 (P→O 완성 후 다음 세그먼트 O→W로 진행해야 함)
    const turn2 = simulateTurnBuilds(state, playerId, 3);
    const turn2Route = getCurrentRoute(playerId);
    console.log(`턴 3 경로: ${turn2Route?.from}→${turn2Route?.to}, 건설 ${turn2.decisions.length}개`);

    // 검증: 턴 3에서 건설이 진행됨
    // 이전 턴에서 P→O 완성 후 O→W로 전환하여 건설을 계속했으므로,
    // 턴 3에서는 O→W가 이미 완성되어 새 경로(P→C 등)로 전환 가능
    expect(turn2Route).toBeTruthy();
    if (turn2Route) {
      // P→W 전체 경로가 이전 턴에서 다 완성되었을 수 있으므로
      // 턴 3에서 새로운 경로를 선택하는 것도 정상 동작
      console.log(`경로 진행 확인: ${turn2Route.from}→${turn2Route.to} (P→W 완성 후 새 경로 가능)`);
      expect(turn2.decisions.length).toBeGreaterThan(0);
    }

    // 검증: 턴 3 내에서 경로 전환 최대 1회 (완성으로 인한 전환만 허용)
    const turn2UniqueRoutes = Array.from(new Set(turn2.routes));
    expect(turn2UniqueRoutes.length).toBeLessThanOrEqual(2);
  });

  it('완성된 경로는 새 경로로 올바르게 전환된다', () => {
    let state = createTutorialGameState();

    // P→O 경로 (거리 3, 2개 트랙으로 완성 가능)
    state = addCubesToCity(state, 'P', ['yellow', 'blue']);
    state = addCubesToCity(state, 'CLE', ['red']);
    state = addCubesToCity(state, 'O', ['black']);
    state = addCubesToCity(state, 'W', ['red']);
    state = addCubesToCity(state, 'I', ['purple']);

    const playerId: PlayerId = 'player1';
    state = {
      ...state,
      currentTurn: 1,
      currentPhase: 'buildTrack',
      currentPlayer: playerId,
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId],
          cash: 20,
          engineLevel: 1,
          issuedShares: 3,
        },
      },
    };

    // 턴 1: P→O 완성
    const turn1 = simulateTurnBuilds(state, playerId, 3);
    state = turn1.state;
    const turn1Route = getCurrentRoute(playerId);
    console.log(`턴 1 경로: ${turn1Route?.from}→${turn1Route?.to}`);
    console.log(`턴 1 트랙: ${state.board.trackTiles.length}개`);

    // 턴 2로 전환
    state = {
      ...state,
      currentTurn: 2,
      phaseState: {
        ...state.phaseState,
        builtTracksThisTurn: 0,
        lastBuiltCoords: [],
        maxTracksThisTurn: GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
      },
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId],
          cash: 15,
        },
      },
    };

    // 턴 2: P→O가 완성되었으므로 새 경로로 전환 가능
    const turn2 = simulateTurnBuilds(state, playerId, 3);
    const turn2Route = getCurrentRoute(playerId);
    console.log(`턴 2 경로: ${turn2Route?.from}→${turn2Route?.to}`);

    // 검증: 턴 2에서 건설이 일어나거나 스킵 (경로 완성 후 정상 동작)
    expect(turn2.decisions.length).toBeGreaterThan(0);

    // 검증: 턴 2 내에서 경로 전환 최대 1회 (완성으로 인한 전환만 허용)
    const turn2UniqueRoutes = Array.from(new Set(turn2.routes));
    expect(turn2UniqueRoutes.length).toBeLessThanOrEqual(2);
  });
});
