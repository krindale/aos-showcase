/**
 * AI 트랙 건설 시뮬레이션 테스트
 *
 * 턴 1→턴 2에서 경로가 바뀌어 트랙이 산발적으로 건설되는 문제 재현 및 분석
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GameState, PlayerId, GAME_CONSTANTS, HexCoord } from '@/types/game';
import { decideBuildTrack } from '../strategies/buildTrack';
import { getCurrentRoute, clearCurrentRoutes } from '../strategy/state';
import { clearPathCache } from '../strategy/analyzer';
import { TUTORIAL_CITIES, generateTutorialHexTiles } from '@/utils/tutorialMap';
import {
  createMockGameState,
  createMockPlayer,
  addCubesToCity,
} from './helpers/mockState';

// 튜토리얼 맵 기반 게임 상태 생성
function createTutorialGameState(): GameState {
  const hexTiles = generateTutorialHexTiles();
  const cities = TUTORIAL_CITIES.map(c => ({ ...c, cubes: [] as string[] }));

  const state = createMockGameState({
    board: {
      cities: cities as any,
      towns: [],
      trackTiles: [],
      hexTiles,
    },
  });

  return state;
}

describe('AI 트랙 건설 경로 안정성 시뮬레이션', () => {
  beforeEach(() => {
    clearCurrentRoutes();
    clearPathCache();
  });

  it('턴 1→턴 2 경로 변경 여부 확인', () => {
    let state = createTutorialGameState();

    // Pittsburgh에 blue 큐브, Cleveland에 red 큐브 배치
    state = addCubesToCity(state, 'P', ['blue', 'yellow']);
    state = addCubesToCity(state, 'C', ['red', 'purple']);
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

    console.log('\n=== 턴 1: 트랙 건설 시뮬레이션 ===');
    console.log('도시 큐브:', state.board.cities.map(c => `${c.id}:[${c.cubes}]`).join(', '));

    // 턴 1: 3번 건설
    const turn1Decisions: any[] = [];
    for (let i = 0; i < 3; i++) {
      const decision = decideBuildTrack(state, playerId);
      const route = getCurrentRoute(playerId);
      console.log(`  건설 ${i + 1}: action=${decision.action}, route=${route?.from}→${route?.to}`);

      if (decision.action === 'build' || decision.action === 'buildComplex') {
        const coord = decision.coord;
        const edges = decision.edges;
        console.log(`    좌표=(${coord.col},${coord.row}), edges=[${edges}]`);
        turn1Decisions.push({ coord, edges, route: route ? `${route.from}→${route.to}` : null });

        // 트랙을 실제로 보드에 추가
        state = {
          ...state,
          board: {
            ...state.board,
            trackTiles: [
              ...state.board.trackTiles,
              {
                id: `track-t1-${i}`,
                coord,
                edges,
                owner: playerId,
                trackType: 'simple' as const,
              },
            ],
          },
          phaseState: {
            ...state.phaseState,
            builtTracksThisTurn: state.phaseState.builtTracksThisTurn + 1,
            lastBuiltCoords: [...state.phaseState.lastBuiltCoords, coord],
          },
          players: {
            ...state.players,
            [playerId]: {
              ...state.players[playerId],
              cash: state.players[playerId].cash - 2,
            },
          },
        };
      } else {
        console.log(`    건설 스킵!`);
        turn1Decisions.push({ action: 'skip' });
        break;
      }
    }

    const turn1Route = getCurrentRoute(playerId);
    console.log(`\n턴 1 최종 경로: ${turn1Route?.from}→${turn1Route?.to}`);
    console.log(`턴 1 건설된 트랙: ${state.board.trackTiles.length}개`);
    state.board.trackTiles.forEach(t => {
      console.log(`  (${t.coord.col},${t.coord.row}) edges=[${t.edges}] owner=${t.owner}`);
    });

    // === 턴 2로 전환 ===
    console.log('\n=== 턴 2: 트랙 건설 시뮬레이션 ===');

    // 물품 성장 시뮬레이션: Columbus에 새 큐브 추가
    state = addCubesToCity(state, 'O', ['red']);
    state = addCubesToCity(state, 'W', ['blue']);

    // 턴 2 상태로 업데이트
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
          cash: 9, // 턴 1 후 남은 현금
        },
      },
    };

    console.log('도시 큐브 (물품 성장 후):', state.board.cities.map(c => `${c.id}:[${c.cubes}]`).join(', '));

    // 턴 2: 3번 건설
    const turn2Decisions: any[] = [];
    for (let i = 0; i < 3; i++) {
      const decision = decideBuildTrack(state, playerId);
      const route = getCurrentRoute(playerId);
      console.log(`  건설 ${i + 1}: action=${decision.action}, route=${route?.from}→${route?.to}`);

      if (decision.action === 'build' || decision.action === 'buildComplex') {
        const coord = decision.coord;
        const edges = decision.edges;
        console.log(`    좌표=(${coord.col},${coord.row}), edges=[${edges}]`);
        turn2Decisions.push({ coord, edges, route: route ? `${route.from}→${route.to}` : null });

        state = {
          ...state,
          board: {
            ...state.board,
            trackTiles: [
              ...state.board.trackTiles,
              {
                id: `track-t2-${i}`,
                coord,
                edges,
                owner: playerId,
                trackType: 'simple' as const,
              },
            ],
          },
          phaseState: {
            ...state.phaseState,
            builtTracksThisTurn: state.phaseState.builtTracksThisTurn + 1,
            lastBuiltCoords: [...state.phaseState.lastBuiltCoords, coord],
          },
          players: {
            ...state.players,
            [playerId]: {
              ...state.players[playerId],
              cash: state.players[playerId].cash - 2,
            },
          },
        };
      } else {
        console.log(`    건설 스킵!`);
        turn2Decisions.push({ action: 'skip' });
        break;
      }
    }

    const turn2Route = getCurrentRoute(playerId);
    console.log(`\n턴 2 최종 경로: ${turn2Route?.from}→${turn2Route?.to}`);
    console.log(`총 건설된 트랙: ${state.board.trackTiles.length}개`);
    state.board.trackTiles.forEach(t => {
      console.log(`  (${t.coord.col},${t.coord.row}) edges=[${t.edges}] owner=${t.owner}`);
    });

    // 검증: 턴 1과 턴 2의 경로가 같은지 확인
    const turn1Routes = turn1Decisions.filter(d => d.route).map(d => d.route);
    const turn2Routes = turn2Decisions.filter(d => d.route).map(d => d.route);

    console.log(`\n=== 경로 비교 ===`);
    console.log(`턴 1 경로: ${[...new Set(turn1Routes)].join(', ')}`);
    console.log(`턴 2 경로: ${[...new Set(turn2Routes)].join(', ')}`);

    const routeChanged = turn1Routes.length > 0 && turn2Routes.length > 0 &&
      turn1Routes[0] !== turn2Routes[0];
    console.log(`경로 변경됨: ${routeChanged}`);

    // 트랙 연속성 확인: 턴 2 트랙이 턴 1 트랙과 연결되어 있는지
    if (turn1Decisions.length > 0 && turn2Decisions.length > 0) {
      const t1Last = turn1Decisions[turn1Decisions.length - 1];
      const t2First = turn2Decisions[0];
      if (t1Last.coord && t2First.coord) {
        const dx = Math.abs(t1Last.coord.col - t2First.coord.col);
        const dy = Math.abs(t1Last.coord.row - t2First.coord.row);
        const isAdjacent = dx <= 1 && dy <= 1 && (dx + dy) <= 2;
        console.log(`턴 1 마지막 트랙 (${t1Last.coord.col},${t1Last.coord.row}) → 턴 2 첫 트랙 (${t2First.coord.col},${t2First.coord.row}): 인접=${isAdjacent}`);
      }
    }

    // 이 테스트는 문제를 재현하는 것이 목적 - 경로 변경이 발생하는지 관찰
    expect(state.board.trackTiles.length).toBeGreaterThan(0);
  });
});
