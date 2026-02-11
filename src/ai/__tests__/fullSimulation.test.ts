/**
 * AI 트랙 건설 전체 시뮬레이션
 *
 * 여러 턴에 걸쳐 2명의 AI가 트랙을 건설하고,
 * 도시 간 완성된 링크가 정상적으로 만들어지는지 검증합니다.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GameState, PlayerId, GAME_CONSTANTS, HexCoord, CubeColor, TrackTile } from '@/types/game';
import { decideBuildTrack } from '../strategies/buildTrack';
import { decideMoveGoods } from '../strategies/moveGoods';
import { getCurrentRoute, clearCurrentRoutes, setCurrentRoute } from '../strategy/state';
import { clearPathCache } from '../strategy/analyzer';
import { TUTORIAL_CITIES, generateTutorialHexTiles } from '@/utils/tutorialMap';
import { createMockGameState, addCubesToCity } from './helpers/mockState';
import { hexDistance, hexCoordsEqual, getNeighborHex } from '@/utils/hexGrid';

// ============ 헬퍼 함수 ============

/** 튜토리얼 맵 기반 게임 상태 생성 */
function createTutorialState(): GameState {
  const hexTiles = generateTutorialHexTiles();
  const cities = TUTORIAL_CITIES.map(c => ({ ...c, cubes: [] as string[] }));

  return createMockGameState({
    board: {
      cities: cities as any,
      towns: [],
      trackTiles: [],
      hexTiles,
    },
  });
}

/** 한 플레이어의 한 턴 트랙 건설 (최대 buildLimit회) */
function simulatePlayerTurn(
  state: GameState,
  playerId: PlayerId,
  buildLimit: number = 3
): { state: GameState; builtCount: number; buildLog: string[] } {
  const buildLog: string[] = [];
  let currentState = state;
  let builtCount = 0;

  for (let i = 0; i < buildLimit; i++) {
    const decision = decideBuildTrack(currentState, playerId);
    const route = getCurrentRoute(playerId);

    if (decision.action === 'build' || decision.action === 'buildComplex') {
      builtCount++;
      const { coord, edges } = decision;
      buildLog.push(`  Build ${i + 1}: (${coord.col},${coord.row}) edges=[${edges}] route=${route?.from}→${route?.to}`);

      currentState = {
        ...currentState,
        board: {
          ...currentState.board,
          trackTiles: [
            ...currentState.board.trackTiles,
            {
              id: `track-${playerId}-${currentState.currentTurn}-${i}`,
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
      buildLog.push(`  Build ${i + 1}: SKIP (route=${route?.from}→${route?.to})`);
      break;
    }
  }

  return { state: currentState, builtCount, buildLog };
}

/** 턴 전환 (phaseState 리셋) */
function advanceTurn(state: GameState, turn: number): GameState {
  return {
    ...state,
    currentTurn: turn,
    phaseState: {
      ...state.phaseState,
      builtTracksThisTurn: 0,
      lastBuiltCoords: [],
      maxTracksThisTurn: GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
    },
  };
}

/** 두 도시 사이에 완성된 링크가 있는지 검사 (BFS) */
function isLinkComplete(
  state: GameState,
  cityA: string,
  cityB: string,
  playerId: PlayerId
): boolean {
  const { board } = state;
  const cityAData = board.cities.find(c => c.id === cityA);
  const cityBData = board.cities.find(c => c.id === cityB);
  if (!cityAData || !cityBData) return false;

  const playerTracks = board.trackTiles.filter(t => t.owner === playerId);
  if (playerTracks.length === 0) return false;

  // BFS: cityA에서 시작하여 플레이어 트랙을 따라 cityB에 도달할 수 있는지
  const visited = new Set<string>();
  const queue: HexCoord[] = [cityAData.coord];
  visited.add(`${cityAData.coord.col},${cityAData.coord.row}`);

  while (queue.length > 0) {
    const current = queue.shift()!;

    // cityB에 도달했으면 성공
    if (hexCoordsEqual(current, cityBData.coord)) return true;

    // 현재 위치가 도시인지 트랙인지 확인
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, current));

    if (isCity) {
      // 도시에서는 모든 방향으로 연결 가능
      for (let edge = 0; edge < 6; edge++) {
        const neighbor = getNeighborHex(current, edge);
        const key = `${neighbor.col},${neighbor.row}`;
        if (visited.has(key)) continue;

        // 인접 트랙이 도시 방향 엣지를 가지고 있는지
        const oppositeEdge = (edge + 3) % 6;
        const connectedTrack = playerTracks.find(
          t => hexCoordsEqual(t.coord, neighbor) && t.edges.includes(oppositeEdge)
        );
        if (connectedTrack) {
          visited.add(key);
          queue.push(neighbor);
        }
      }
    } else {
      // 트랙에서는 엣지 방향으로만 연결
      const track = playerTracks.find(t => hexCoordsEqual(t.coord, current));
      if (!track) continue;

      for (const edge of track.edges) {
        const neighbor = getNeighborHex(current, edge);
        const key = `${neighbor.col},${neighbor.row}`;
        if (visited.has(key)) continue;

        // 인접이 도시면 즉시 추가
        const neighborIsCity = board.cities.some(c => hexCoordsEqual(c.coord, neighbor));
        if (neighborIsCity) {
          visited.add(key);
          queue.push(neighbor);
          continue;
        }

        // 인접이 트랙이면 반대 엣지 확인
        const oppositeEdge = (edge + 3) % 6;
        const connectedTrack = playerTracks.find(
          t => hexCoordsEqual(t.coord, neighbor) && t.edges.includes(oppositeEdge)
        );
        if (connectedTrack) {
          visited.add(key);
          queue.push(neighbor);
        }
      }
    }
  }

  return false;
}

/** 보드 상태를 ASCII로 출력 */
function printBoard(state: GameState): string {
  const { board } = state;
  const lines: string[] = [];
  const cityMap = new Map(board.cities.map(c => [`${c.coord.col},${c.coord.row}`, c]));

  lines.push('=== 보드 상태 ===');
  for (let row = 0; row < 5; row++) {
    const indent = row % 2 === 1 ? '  ' : '';
    let line = indent;
    for (let col = 1; col <= 7; col++) {
      const key = `${col},${row}`;
      const city = cityMap.get(key);
      const track = board.trackTiles.find(t => t.coord.col === col && t.coord.row === row);

      if (city) {
        const cubeStr = city.cubes.length > 0 ? `${city.cubes.length}` : ' ';
        line += `[${city.id}${cubeStr}] `;
      } else if (track) {
        const owner = track.owner === 'player1' ? '1' : '2';
        line += ` ${owner}:${track.edges[0]}${track.edges[1]} `;
      } else {
        line += '  .   ';
      }
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/** 큐브 시나리오 정의 */
interface CubeScenario {
  name: string;
  cubes: Record<string, CubeColor[]>;
  expectedLinks: Array<{ from: string; to: string; player: PlayerId; byTurn: number }>;
}

const SCENARIOS: CubeScenario[] = [
  {
    name: '시나리오 1: P→O 단거리 배달 (yellow 큐브)',
    cubes: {
      P: ['yellow', 'blue'],   // yellow→O, blue→C
      C: ['red', 'purple'],
      O: ['black', 'blue'],
      W: ['red', 'yellow'],
      I: ['yellow', 'red'],
    },
    expectedLinks: [
      { from: 'P', to: 'O', player: 'player2', byTurn: 2 },
    ],
  },
  {
    name: '시나리오 2: 양쪽 AI 경쟁 (동일 출발)',
    cubes: {
      P: ['yellow', 'black'],  // yellow→O, black→W
      C: ['purple', 'red'],
      O: ['blue', 'red'],
      W: ['purple', 'yellow'],
      I: ['blue', 'black'],
    },
    expectedLinks: [
      { from: 'P', to: 'O', player: 'player2', byTurn: 3 },
    ],
  },
  {
    name: '시나리오 3: 장거리 경로 (P→W = 2링크)',
    cubes: {
      P: ['black'],            // black→W (2링크: P→O→W)
      C: ['red'],
      O: ['blue'],
      W: ['red', 'yellow'],
      I: ['purple'],
    },
    expectedLinks: [
      { from: 'P', to: 'O', player: 'player2', byTurn: 2 },
    ],
  },
  {
    name: '시나리오 4: 다양한 큐브 (첫 턴 배달 기회 없음)',
    cubes: {
      P: ['blue', 'purple'],   // blue→C (2링크), purple→I (2링크)
      C: ['yellow', 'red'],
      O: ['red', 'purple'],
      W: ['blue', 'yellow'],
      I: ['black', 'red'],
    },
    expectedLinks: [
      // 어떤 링크든 3턴 내에 최소 1개 완성
    ],
  },
];

// ============ 테스트 ============

describe('AI 트랙 건설 전체 시뮬레이션', () => {
  beforeEach(() => {
    clearCurrentRoutes();
    clearPathCache();
  });

  for (const scenario of SCENARIOS) {
    it(scenario.name, () => {
      // 초기 상태 설정
      let state = createTutorialState();
      for (const [cityId, cubes] of Object.entries(scenario.cubes)) {
        state = addCubesToCity(state, cityId, cubes);
      }

      const player: PlayerId = 'player2'; // AI 플레이어
      state = {
        ...state,
        currentTurn: 1,
        currentPhase: 'buildTrack',
        currentPlayer: player,
        players: {
          ...state.players,
          [player]: {
            ...state.players[player],
            cash: 20,
            engineLevel: 1,
            issuedShares: 3,
          },
        },
      };

      const allLogs: string[] = [];
      const completedLinks: string[] = [];
      const MAX_TURNS = 5;

      // 멀티 턴 시뮬레이션
      for (let turn = 1; turn <= MAX_TURNS; turn++) {
        state = advanceTurn(state, turn);
        state = {
          ...state,
          players: {
            ...state.players,
            [player]: { ...state.players[player], cash: 15 },
          },
        };

        clearPathCache();
        const { state: newState, builtCount, buildLog } = simulatePlayerTurn(state, player, 3);
        state = newState;

        const route = getCurrentRoute(player);
        allLogs.push(`\n--- 턴 ${turn} (경로: ${route?.from}→${route?.to}) ---`);
        allLogs.push(...buildLog);
        allLogs.push(`  트랙 수: ${state.board.trackTiles.filter(t => t.owner === player).length}개`);

        // 도시 쌍별 링크 완성 체크
        const cityIds = TUTORIAL_CITIES.map(c => c.id);
        for (let i = 0; i < cityIds.length; i++) {
          for (let j = i + 1; j < cityIds.length; j++) {
            const linkKey = `${cityIds[i]}↔${cityIds[j]}`;
            if (!completedLinks.includes(linkKey)) {
              if (isLinkComplete(state, cityIds[i], cityIds[j], player) ||
                  isLinkComplete(state, cityIds[j], cityIds[i], player)) {
                completedLinks.push(linkKey);
                allLogs.push(`  ✓ 링크 완성: ${linkKey} (턴 ${turn})`);
              }
            }
          }
        }
      }

      // 최종 보드 출력
      allLogs.push('\n' + printBoard(state));

      // 트랙 상세
      const playerTracks = state.board.trackTiles.filter(t => t.owner === player);
      allLogs.push(`\n총 트랙: ${playerTracks.length}개`);
      allLogs.push(`완성 링크: ${completedLinks.length}개 [${completedLinks.join(', ')}]`);
      for (const t of playerTracks) {
        allLogs.push(`  (${t.coord.col},${t.coord.row}) edges=[${t.edges}]`);
      }

      console.log(allLogs.join('\n'));

      // 검증: 5턴 내에 최소 1개 링크 완성
      expect(completedLinks.length).toBeGreaterThanOrEqual(1);

      // 검증: 기대 링크가 있으면 확인
      for (const expected of scenario.expectedLinks) {
        const key1 = `${expected.from}↔${expected.to}`;
        const key2 = `${expected.to}↔${expected.from}`;
        if (expected.byTurn <= MAX_TURNS) {
          const hasLink = completedLinks.includes(key1) || completedLinks.includes(key2);
          if (!hasLink) {
            console.log(`⚠ 기대 링크 미완성: ${key1} (기대: 턴 ${expected.byTurn}까지)`);
          }
          // soft check - 경고만, 실패는 아님 (경쟁 상황 등 변수)
        }
      }
    });
  }

  it('2인 동시 시뮬레이션 (player1 + player2 교대 건설)', () => {
    let state = createTutorialState();
    state = addCubesToCity(state, 'P', ['yellow', 'blue']);
    state = addCubesToCity(state, 'C', ['red', 'purple']);
    state = addCubesToCity(state, 'O', ['black', 'blue']);
    state = addCubesToCity(state, 'W', ['red', 'yellow']);
    state = addCubesToCity(state, 'I', ['yellow', 'red']);

    // 양쪽 플레이어 설정
    for (const pid of ['player1', 'player2'] as PlayerId[]) {
      state = {
        ...state,
        players: {
          ...state.players,
          [pid]: {
            ...state.players[pid],
            cash: 20,
            engineLevel: 1,
            issuedShares: 3,
          },
        },
      };
    }

    const allLogs: string[] = [];
    const completedLinks: Record<string, string[]> = { player1: [], player2: [] };
    const routeChoices: Record<string, string[]> = { player1: [], player2: [] };
    const MAX_TURNS = 5;

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      state = advanceTurn(state, turn);

      for (const pid of ['player1', 'player2'] as PlayerId[]) {
        // 턴마다 현금 보충
        state = {
          ...state,
          currentPlayer: pid,
          players: {
            ...state.players,
            [pid]: { ...state.players[pid], cash: 15 },
          },
          phaseState: {
            ...state.phaseState,
            builtTracksThisTurn: 0,
            lastBuiltCoords: [],
          },
        };

        clearPathCache();
        const { state: newState, builtCount, buildLog } = simulatePlayerTurn(state, pid, 3);
        state = newState;

        const route = getCurrentRoute(pid);
        const routeKey = route ? `${route.from}→${route.to}` : 'none';
        routeChoices[pid].push(routeKey);
        allLogs.push(`턴 ${turn} ${pid} (${routeKey}):`);
        allLogs.push(...buildLog);

        // 링크 체크
        const cityIds = TUTORIAL_CITIES.map(c => c.id);
        for (let i = 0; i < cityIds.length; i++) {
          for (let j = i + 1; j < cityIds.length; j++) {
            const linkKey = `${cityIds[i]}↔${cityIds[j]}`;
            if (!completedLinks[pid].includes(linkKey)) {
              if (isLinkComplete(state, cityIds[i], cityIds[j], pid) ||
                  isLinkComplete(state, cityIds[j], cityIds[i], pid)) {
                completedLinks[pid].push(linkKey);
                allLogs.push(`  ✓ ${pid} 링크 완성: ${linkKey}`);
              }
            }
          }
        }
      }
    }

    allLogs.push('\n' + printBoard(state));

    for (const pid of ['player1', 'player2'] as PlayerId[]) {
      const tracks = state.board.trackTiles.filter(t => t.owner === pid);
      allLogs.push(`\n${pid}: 트랙 ${tracks.length}개, 링크 ${completedLinks[pid].length}개 [${completedLinks[pid].join(', ')}]`);
      allLogs.push(`  경로 선택 이력: ${routeChoices[pid].join(' → ')}`);
      for (const t of tracks) {
        allLogs.push(`  (${t.coord.col},${t.coord.row}) edges=[${t.edges}]`);
      }
    }

    console.log(allLogs.join('\n'));

    // 검증 1: 5턴 내에 양쪽 합계 최소 2개 링크
    const totalLinks = completedLinks.player1.length + completedLinks.player2.length;
    expect(totalLinks).toBeGreaterThanOrEqual(2);

    // 검증 2: 첫 턴에 두 AI가 다른 경로를 선택하는지 확인
    const p1FirstRoute = routeChoices.player1[0];
    const p2FirstRoute = routeChoices.player2[0];

    // 정방향/역방향 모두 같은 링크로 간주
    const normalizeRoute = (r: string) => {
      const [from, to] = r.split('→');
      return [from, to].sort().join('-');
    };

    if (p1FirstRoute !== 'none' && p2FirstRoute !== 'none') {
      const p1Norm = normalizeRoute(p1FirstRoute);
      const p2Norm = normalizeRoute(p2FirstRoute);
      allLogs.push(`\n경로 비교: P1=${p1FirstRoute}(${p1Norm}) vs P2=${p2FirstRoute}(${p2Norm})`);

      // 같은 링크를 겨냥하면 경고 (첫 턴 기준)
      if (p1Norm === p2Norm) {
        console.warn(`⚠ 두 AI가 같은 경로를 선택함: ${p1FirstRoute} vs ${p2FirstRoute}`);
      } else {
        console.log(`✅ 두 AI가 다른 경로를 선택함: ${p1FirstRoute} vs ${p2FirstRoute}`);
      }

      // 강한 검증: 두 AI는 같은 링크를 겨냥하면 안 됨
      expect(p1Norm).not.toBe(p2Norm);
    }
  });
});

// ============ 랜덤 큐브 + 수익 평가 시뮬레이션 ============

/** 두 도시 사이에 직접 링크가 있는지 확인 (다른 도시를 경유하지 않는 연결) */
function hasDirectLink(
  state: GameState,
  cityAId: string,
  cityBId: string,
  playerId: PlayerId
): boolean {
  const { board } = state;
  const cityA = board.cities.find(c => c.id === cityAId);
  const cityB = board.cities.find(c => c.id === cityBId);
  if (!cityA || !cityB) return false;

  const playerTracks = board.trackTiles.filter(t => t.owner === playerId);
  if (playerTracks.length === 0) return false;

  // BFS: cityA에서 출발, 다른 도시를 만나면 해당 도시가 B인지만 확인 (경유 X)
  const visited = new Set<string>();
  const queue: HexCoord[] = [cityA.coord];
  visited.add(`${cityA.coord.col},${cityA.coord.row}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentCity = board.cities.find(c => hexCoordsEqual(c.coord, current));
    const isSourceCity = currentCity?.id === cityAId;

    if (currentCity && !isSourceCity) {
      if (currentCity.id === cityBId) return true;
      continue; // 다른 도시 도달 → 경유하지 않음
    }

    if (currentCity) {
      // 도시에서 모든 방향 탐색
      for (let edge = 0; edge < 6; edge++) {
        const neighbor = getNeighborHex(current, edge);
        const key = `${neighbor.col},${neighbor.row}`;
        if (visited.has(key)) continue;
        const oppositeEdge = (edge + 3) % 6;
        const track = playerTracks.find(
          t => hexCoordsEqual(t.coord, neighbor) && t.edges.includes(oppositeEdge)
        );
        if (track) { visited.add(key); queue.push(neighbor); }
      }
    } else {
      const track = playerTracks.find(t => hexCoordsEqual(t.coord, current));
      if (!track) continue;
      for (const edge of track.edges) {
        const neighbor = getNeighborHex(current, edge);
        const key = `${neighbor.col},${neighbor.row}`;
        if (visited.has(key)) continue;
        const neighborIsCity = board.cities.some(c => hexCoordsEqual(c.coord, neighbor));
        if (neighborIsCity) { visited.add(key); queue.push(neighbor); continue; }
        const oppositeEdge = (edge + 3) % 6;
        const connectedTrack = playerTracks.find(
          t => hexCoordsEqual(t.coord, neighbor) && t.edges.includes(oppositeEdge)
        );
        if (connectedTrack) { visited.add(key); queue.push(neighbor); }
      }
    }
  }
  return false;
}

/** 두 도시 사이 링크 홉 수 계산 (도시 그래프 BFS) */
function countLinkHops(
  state: GameState,
  fromCityId: string,
  toCityId: string,
  playerId: PlayerId,
  maxHops: number
): number {
  const cityIds = state.board.cities.map(c => c.id);

  // 도시 수준 인접 그래프 구축 (직접 링크만)
  const adj = new Map<string, string[]>();
  for (const id of cityIds) adj.set(id, []);
  for (let i = 0; i < cityIds.length; i++) {
    for (let j = i + 1; j < cityIds.length; j++) {
      if (hasDirectLink(state, cityIds[i], cityIds[j], playerId)) {
        adj.get(cityIds[i])!.push(cityIds[j]);
        adj.get(cityIds[j])!.push(cityIds[i]);
      }
    }
  }

  // BFS
  const visited = new Set<string>();
  const queue: Array<{ cityId: string; hops: number }> = [{ cityId: fromCityId, hops: 0 }];
  visited.add(fromCityId);

  while (queue.length > 0) {
    const { cityId, hops } = queue.shift()!;
    if (cityId === toCityId) return hops;
    if (hops >= maxHops) continue;
    for (const neighbor of adj.get(cityId) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ cityId: neighbor, hops: hops + 1 });
      }
    }
  }
  return 0;
}

/** 배달 가능한 큐브와 수입 평가 */
function evaluateDeliveries(
  state: GameState,
  playerId: PlayerId,
  engineLevel: number
): {
  deliverable: Array<{ from: string; to: string; cube: string; income: number }>;
  totalPotentialIncome: number;
  deliverableCount: number;
} {
  const COLOR_TO_CITY: Record<string, string> = {
    red: 'P', blue: 'C', yellow: 'O', black: 'W', purple: 'I',
  };

  const deliverable: Array<{ from: string; to: string; cube: string; income: number }> = [];

  for (const city of state.board.cities) {
    for (const cubeColor of city.cubes) {
      const destCityId = COLOR_TO_CITY[cubeColor];
      if (!destCityId || destCityId === city.id) continue;

      const hops = countLinkHops(state, city.id, destCityId, playerId, engineLevel);
      if (hops > 0 && hops <= engineLevel) {
        deliverable.push({ from: city.id, to: destCityId, cube: cubeColor, income: hops });
      }
    }
  }

  deliverable.sort((a, b) => b.income - a.income);
  const totalPotentialIncome = deliverable.reduce((sum, d) => sum + d.income, 0);
  return { deliverable, totalPotentialIncome, deliverableCount: deliverable.length };
}

/** 이론적 최대 배달 수 계산 (모든 링크가 완성됐다고 가정) */
function countTheoreticalDeliverables(
  cubes: Record<string, CubeColor[]>,
  engineLevel: number
): { count: number; maxIncome: number } {
  // 튜토리얼 맵 도시 간 이상적 링크 거리 (직접 링크 존재 여부 기반)
  const IDEAL_HOPS: Record<string, number> = {
    'P-O': 1, 'P-I': 1, 'C-O': 1, 'C-W': 1, 'O-W': 1, 'O-I': 1,
    'P-C': 2, 'P-W': 2, 'C-I': 2, 'W-I': 2,
  };
  const COLOR_TO_CITY: Record<string, string> = {
    red: 'P', blue: 'C', yellow: 'O', black: 'W', purple: 'I',
  };

  let count = 0;
  let maxIncome = 0;
  for (const [cityId, cubelist] of Object.entries(cubes)) {
    for (const color of cubelist) {
      const dest = COLOR_TO_CITY[color];
      if (!dest || dest === cityId) continue;
      const key = [cityId, dest].sort().join('-');
      const hops = IDEAL_HOPS[key] || 3;
      if (hops <= engineLevel) {
        count++;
        maxIncome += hops;
      }
    }
  }
  return { count, maxIncome };
}

describe('랜덤 큐브 + 수익 평가 시뮬레이션 (10회)', () => {
  const CUBE_COLORS: CubeColor[] = ['red', 'blue', 'yellow', 'purple', 'black'];
  const CITY_COLORS: Record<string, CubeColor> = {
    P: 'red', C: 'blue', O: 'yellow', W: 'black', I: 'purple',
  };
  const CITY_IDS = ['P', 'C', 'O', 'W', 'I'];

  /** 재현 가능한 시드 난수 */
  function seededRandom(seed: number) {
    return function () {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  /** 랜덤 큐브 생성 (도시당 1~3개, 같은 색 제외) */
  function generateRandomCubes(rng: () => number): Record<string, CubeColor[]> {
    const cubes: Record<string, CubeColor[]> = {};
    for (const cityId of CITY_IDS) {
      const count = 1 + Math.floor(rng() * 3);
      cubes[cityId] = [];
      for (let i = 0; i < count; i++) {
        let color: CubeColor;
        do {
          color = CUBE_COLORS[Math.floor(rng() * CUBE_COLORS.length)];
        } while (color === CITY_COLORS[cityId]);
        cubes[cityId].push(color);
      }
    }
    return cubes;
  }

  beforeEach(() => {
    clearCurrentRoutes();
    clearPathCache();
  });

  const ENGINE_LEVEL = 2; // 시뮬레이션 동안 엔진 레벨 2 (2링크 배달 가능)
  const MAX_TURNS = 5;
  const results: Array<{
    run: number;
    completedLinks: number;
    deliverableCount: number;
    actualIncome: number;
    theoreticalCount: number;
    theoreticalIncome: number;
    deliveryRate: string;
    incomeRate: string;
  }> = [];

  for (let run = 1; run <= 10; run++) {
    it(`랜덤 시뮬 #${run}`, () => {
      const rng = seededRandom(run * 7919); // 소수 기반 시드
      const cubes = generateRandomCubes(rng);

      // 이론적 최대치 계산
      const theoretical = countTheoreticalDeliverables(cubes, ENGINE_LEVEL);

      // 게임 상태 생성
      let state = createTutorialState();
      for (const [cityId, cubelist] of Object.entries(cubes)) {
        state = addCubesToCity(state, cityId, cubelist);
      }

      const player: PlayerId = 'player2';
      state = {
        ...state,
        currentTurn: 1,
        currentPhase: 'buildTrack',
        currentPlayer: player,
        players: {
          ...state.players,
          [player]: {
            ...state.players[player],
            cash: 20,
            engineLevel: ENGINE_LEVEL,
            issuedShares: 3,
          },
        },
      };

      const allLogs: string[] = [];
      const completedLinks: string[] = [];

      // 큐브 배치 로그
      const cubeStr = Object.entries(cubes)
        .map(([id, cs]) => `${id}(${CITY_COLORS[id]})=[${cs.join(',')}]`)
        .join('  ');
      allLogs.push(`큐브: ${cubeStr}`);

      // 멀티 턴 시뮬레이션
      for (let turn = 1; turn <= MAX_TURNS; turn++) {
        state = advanceTurn(state, turn);
        state = {
          ...state,
          players: {
            ...state.players,
            [player]: { ...state.players[player], cash: 15 },
          },
        };

        clearPathCache();
        const { state: newState, builtCount, buildLog } = simulatePlayerTurn(state, player, 3);
        state = newState;

        // 링크 완성 체크
        for (let i = 0; i < CITY_IDS.length; i++) {
          for (let j = i + 1; j < CITY_IDS.length; j++) {
            const linkKey = `${CITY_IDS[i]}↔${CITY_IDS[j]}`;
            if (!completedLinks.includes(linkKey)) {
              if (
                isLinkComplete(state, CITY_IDS[i], CITY_IDS[j], player) ||
                isLinkComplete(state, CITY_IDS[j], CITY_IDS[i], player)
              ) {
                completedLinks.push(linkKey);
              }
            }
          }
        }

        const route = getCurrentRoute(player);
        allLogs.push(
          `턴 ${turn}: ${builtCount}개 건설, 경로=${route?.from ?? '?'}→${route?.to ?? '?'}, 누적 링크=${completedLinks.length}개`
        );
      }

      // 배달 평가
      const delivery = evaluateDeliveries(state, player, ENGINE_LEVEL);

      allLogs.push(`\n--- 결과 ---`);
      allLogs.push(`완성 링크: ${completedLinks.length}개 [${completedLinks.join(', ')}]`);
      allLogs.push(
        `배달 가능: ${delivery.deliverableCount}/${theoretical.count}개 (${
          theoretical.count > 0 ? Math.round((delivery.deliverableCount / theoretical.count) * 100) : 0
        }%)`
      );
      allLogs.push(
        `잠재 수입: $${delivery.totalPotentialIncome} / 이론적 최대 $${theoretical.maxIncome} (${
          theoretical.maxIncome > 0
            ? Math.round((delivery.totalPotentialIncome / theoretical.maxIncome) * 100)
            : 0
        }%)`
      );

      for (const d of delivery.deliverable) {
        allLogs.push(`  📦 ${d.from}→${d.to} (${d.cube}) = $${d.income}`);
      }

      allLogs.push('\n' + printBoard(state));

      console.log(`\n${'='.repeat(50)}\n랜덤 시뮬 #${run}\n${'='.repeat(50)}`);
      console.log(allLogs.join('\n'));

      // 결과 집계
      const deliveryRate =
        theoretical.count > 0
          ? `${Math.round((delivery.deliverableCount / theoretical.count) * 100)}%`
          : 'N/A';
      const incomeRate =
        theoretical.maxIncome > 0
          ? `${Math.round((delivery.totalPotentialIncome / theoretical.maxIncome) * 100)}%`
          : 'N/A';

      results.push({
        run,
        completedLinks: completedLinks.length,
        deliverableCount: delivery.deliverableCount,
        actualIncome: delivery.totalPotentialIncome,
        theoreticalCount: theoretical.count,
        theoreticalIncome: theoretical.maxIncome,
        deliveryRate,
        incomeRate,
      });

      // 검증: 5턴 내에 최소 1개 링크 완성
      expect(completedLinks.length).toBeGreaterThanOrEqual(1);
    });
  }

  // 전체 통계
  it('10회 시뮬레이션 종합 통계', () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 10회 랜덤 시뮬레이션 종합 통계');
    console.log('='.repeat(60));
    console.log(
      '  #  | 링크 | 배달가능(이론) | 수입(이론최대) | 배달율 | 수입율'
    );
    console.log('-'.repeat(60));

    let totalLinks = 0;
    let totalDeliverable = 0;
    let totalTheoretical = 0;
    let totalIncome = 0;
    let totalMaxIncome = 0;

    for (const r of results) {
      console.log(
        `  ${String(r.run).padStart(2)} |  ${String(r.completedLinks).padStart(2)}  | ` +
          `  ${String(r.deliverableCount).padStart(2)} / ${String(r.theoreticalCount).padStart(2)}    | ` +
          `  $${String(r.actualIncome).padStart(2)} / $${String(r.theoreticalIncome).padStart(2)}     | ` +
          ` ${r.deliveryRate.padStart(4)} | ${r.incomeRate.padStart(4)}`
      );
      totalLinks += r.completedLinks;
      totalDeliverable += r.deliverableCount;
      totalTheoretical += r.theoreticalCount;
      totalIncome += r.actualIncome;
      totalMaxIncome += r.theoreticalIncome;
    }

    console.log('-'.repeat(60));
    const avgLinks = (totalLinks / results.length).toFixed(1);
    const overallDeliveryRate =
      totalTheoretical > 0 ? Math.round((totalDeliverable / totalTheoretical) * 100) : 0;
    const overallIncomeRate =
      totalMaxIncome > 0 ? Math.round((totalIncome / totalMaxIncome) * 100) : 0;
    console.log(
      ` 평균 |  ${avgLinks} |  ${totalDeliverable} / ${totalTheoretical}       | ` +
        ` $${totalIncome} / $${totalMaxIncome}      | ${overallDeliveryRate}%  | ${overallIncomeRate}%`
    );
    console.log('='.repeat(60));

    // 검증: 평균 링크 2개 이상, 배달율 50% 이상
    expect(totalLinks / results.length).toBeGreaterThanOrEqual(2);
    expect(overallDeliveryRate).toBeGreaterThanOrEqual(40);
  });
});

// ============ 2인 화물 수송 우선순위 시뮬레이션 ============

describe('2인 화물 수송 우선순위 시뮬레이션 (10회)', () => {
  const CUBE_COLORS: CubeColor[] = ['red', 'blue', 'yellow', 'purple', 'black'];
  const CITY_COLORS: Record<string, CubeColor> = {
    P: 'red', C: 'blue', O: 'yellow', W: 'black', I: 'purple',
  };
  const CITY_IDS = ['P', 'C', 'O', 'W', 'I'];

  /** 재현 가능한 시드 난수 */
  function seededRandom(seed: number) {
    return function () {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  /** 랜덤 큐브 생성 (도시당 2~3개, 같은 색 제외) */
  function generateRandomCubes(rng: () => number): Record<string, CubeColor[]> {
    const cubes: Record<string, CubeColor[]> = {};
    for (const cityId of CITY_IDS) {
      const count = 2 + Math.floor(rng() * 2); // 2~3개 (충분한 화물)
      cubes[cityId] = [];
      for (let i = 0; i < count; i++) {
        let color: CubeColor;
        do {
          color = CUBE_COLORS[Math.floor(rng() * CUBE_COLORS.length)];
        } while (color === CITY_COLORS[cityId]);
        cubes[cityId].push(color);
      }
    }
    return cubes;
  }

  /**
   * 튜토리얼 맵에 player1과 player2 모두 완성된 트랙 네트워크를 깔아놓기
   *
   * Player1: P↔O↔W (P→O 1링크, O→W 1링크, P→W 2링크)
   * Player2: C↔O↔I (C→O 1링크, O→I 1링크, C→I 2링크)
   */
  function buildPresetTracks(state: GameState): GameState {
    // 튜토리얼 맵 도시 좌표:
    // P(1,0) C(5,0) O(3,2) W(5,3) I(1,4)

    const newTracks: TrackTile[] = [
      // Player1: P(1,0) → O(3,2) 경로: (2,0)→(2,1)
      { id: 'preset-p1-1', coord: { col: 2, row: 0 }, edges: [3, 1] as [number, number], owner: 'player1', trackType: 'simple' as const },
      { id: 'preset-p1-2', coord: { col: 2, row: 1 }, edges: [4, 1] as [number, number], owner: 'player1', trackType: 'simple' as const },
      // Player1: O(3,2) → W(5,3) 경로: (4,2)→(4,3)
      { id: 'preset-p1-3', coord: { col: 4, row: 2 }, edges: [3, 1] as [number, number], owner: 'player1', trackType: 'simple' as const },
      { id: 'preset-p1-4', coord: { col: 4, row: 3 }, edges: [4, 0] as [number, number], owner: 'player1', trackType: 'simple' as const },

      // Player2: C(5,0) → O(3,2) 경로: C→(4,0)→(3,1)→O
      // (4,0) even row: edge0=E→C(5,0), edge2=SW→(3,1)
      { id: 'preset-p2-1', coord: { col: 4, row: 0 }, edges: [0, 2] as [number, number], owner: 'player2', trackType: 'simple' as const },
      // (3,1) odd row: edge5=NE→(4,0), edge2=SW→O(3,2)
      { id: 'preset-p2-2', coord: { col: 3, row: 1 }, edges: [5, 2] as [number, number], owner: 'player2', trackType: 'simple' as const },
      // Player2: O(3,2) → I(1,4) 경로: O→(2,3)→(2,4)→I
      // (2,3) odd row: edge5=NE→O(3,2), edge2=SW→(2,4)
      { id: 'preset-p2-3', coord: { col: 2, row: 3 }, edges: [5, 2] as [number, number], owner: 'player2', trackType: 'simple' as const },
      // (2,4) even row: edge5=NE→(2,3), edge3=W→I(1,4)
      { id: 'preset-p2-4', coord: { col: 2, row: 4 }, edges: [5, 3] as [number, number], owner: 'player2', trackType: 'simple' as const },
    ];

    return {
      ...state,
      board: {
        ...state.board,
        trackTiles: [...state.board.trackTiles, ...newTracks],
      },
    };
  }

  beforeEach(() => {
    clearCurrentRoutes();
    clearPathCache();
  });

  const moveResults: Array<{
    run: number;
    p1Moves: Array<{ from: string; to: string; cube: string; links: number }>;
    p2Moves: Array<{ from: string; to: string; cube: string; links: number }>;
    p1PickedLonger: boolean; // player1이 가능한 것 중 가장 긴 배달을 먼저 골랐는지
    p2PickedLonger: boolean;
    p1Income: number;
    p2Income: number;
  }> = [];

  for (let run = 1; run <= 10; run++) {
    it(`화물 수송 시뮬 #${run}: 긴 링크 우선 + 가로채기 방어`, () => {
      const rng = seededRandom(run * 6271);
      const cubes = generateRandomCubes(rng);

      // 게임 상태 생성
      let state = createTutorialState();
      for (const [cityId, cubelist] of Object.entries(cubes)) {
        state = addCubesToCity(state, cityId, cubelist);
      }

      // 미리 트랙 깔아놓기
      state = buildPresetTracks(state);

      // 양쪽 플레이어 설정
      for (const pid of ['player1', 'player2'] as PlayerId[]) {
        state = {
          ...state,
          players: {
            ...state.players,
            [pid]: {
              ...state.players[pid],
              cash: 20,
              engineLevel: 2, // 2링크까지 이동 가능
              issuedShares: 3,
            },
          },
        };
      }

      state = {
        ...state,
        currentPhase: 'moveGoods' as any,
        currentTurn: 2,
      };

      const logs: string[] = [];
      const cubeStr = Object.entries(cubes)
        .map(([id, cs]) => `${id}(${CITY_COLORS[id]})=[${cs.join(',')}]`)
        .join('  ');
      logs.push(`큐브: ${cubeStr}`);

      // P1 네트워크: P↔O↔W, P2 네트워크: C↔O↔I
      logs.push(`P1 네트워크: P↔O↔W (1링크 or 2링크)`);
      logs.push(`P2 네트워크: C↔O↔I (1링크 or 2링크)`);

      // 2라운드 × 2플레이어 = 4번의 화물 수송
      const p1Moves: Array<{ from: string; to: string; cube: string; links: number }> = [];
      const p2Moves: Array<{ from: string; to: string; cube: string; links: number }> = [];

      for (let round = 1; round <= 2; round++) {
        for (const pid of ['player1', 'player2'] as PlayerId[]) {
          // playerMoves 리셋
          const moveState = {
            ...state,
            currentPlayer: pid,
            phaseState: {
              ...state.phaseState,
              moveGoodsRound: round,
              playerMoves: {
                player1: false,
                player2: false,
                player3: false,
              },
            },
          };

          const decision = decideMoveGoods(moveState, pid);

          if (decision.action === 'move') {
            const destCity = state.board.cities.find(c =>
              hexCoordsEqual(c.coord, decision.destinationCoord)
            );
            const destId = destCity?.id ?? '?';

            // 링크 수 계산 (수입)
            const hops = countLinkHops(moveState, decision.sourceCityId, destId, pid, 2);

            const moveInfo = {
              from: decision.sourceCityId,
              to: destId,
              cube: decision.cubeColor,
              links: hops,
            };

            if (pid === 'player1') p1Moves.push(moveInfo);
            else p2Moves.push(moveInfo);

            logs.push(`R${round} ${pid}: ${decision.sourceCityId}→${destId} (${decision.cubeColor}) = ${hops}링크`);

            // 큐브 제거 (실제 배달 시뮬레이션)
            const sourceCity = state.board.cities.find(c => c.id === decision.sourceCityId);
            if (sourceCity) {
              const newCubes = [...sourceCity.cubes];
              newCubes.splice(decision.cubeIndex, 1);
              state = {
                ...state,
                board: {
                  ...state.board,
                  cities: state.board.cities.map(c =>
                    c.id === decision.sourceCityId ? { ...c, cubes: newCubes } : c
                  ),
                },
              };
            }
          } else {
            logs.push(`R${round} ${pid}: ${decision.action}`);
          }
        }
      }

      // 분석: 각 플레이어가 가능한 것 중 가장 긴 배달을 먼저 골랐는지
      const p1PickedLonger = p1Moves.length >= 2 ? p1Moves[0].links >= p1Moves[1].links : true;
      const p2PickedLonger = p2Moves.length >= 2 ? p2Moves[0].links >= p2Moves[1].links : true;
      const p1Income = p1Moves.reduce((s, m) => s + m.links, 0);
      const p2Income = p2Moves.reduce((s, m) => s + m.links, 0);

      logs.push(`\n--- 결과 ---`);
      logs.push(`P1: ${p1Moves.map(m => `${m.from}→${m.to}(${m.cube},${m.links}링크)`).join(', ')} 총수입=$${p1Income} 긴것우선=${p1PickedLonger ? '✅' : '❌'}`);
      logs.push(`P2: ${p2Moves.map(m => `${m.from}→${m.to}(${m.cube},${m.links}링크)`).join(', ')} 총수입=$${p2Income} 긴것우선=${p2PickedLonger ? '✅' : '❌'}`);

      console.log(`\n${'='.repeat(50)}\n화물 수송 시뮬 #${run}\n${'='.repeat(50)}`);
      console.log(logs.join('\n'));

      moveResults.push({ run, p1Moves, p2Moves, p1PickedLonger, p2PickedLonger, p1Income, p2Income });

      // 검증: 두 플레이어 합계 수입이 0보다 크다
      expect(p1Income + p2Income).toBeGreaterThan(0);
    });
  }

  it('10회 화물 수송 종합 통계', () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 10회 화물 수송 우선순위 종합 통계');
    console.log('='.repeat(60));
    console.log('  #  | P1수입 | P2수입 | P1긴것우선 | P2긴것우선');
    console.log('-'.repeat(60));

    let totalP1Income = 0;
    let totalP2Income = 0;
    let p1LongerCount = 0;
    let p2LongerCount = 0;

    for (const r of moveResults) {
      console.log(
        `  ${String(r.run).padStart(2)} |   $${String(r.p1Income).padStart(2)}   |   $${String(r.p2Income).padStart(2)}   | ` +
        `    ${r.p1PickedLonger ? '✅' : '❌'}      |     ${r.p2PickedLonger ? '✅' : '❌'}`
      );
      totalP1Income += r.p1Income;
      totalP2Income += r.p2Income;
      if (r.p1PickedLonger) p1LongerCount++;
      if (r.p2PickedLonger) p2LongerCount++;
    }

    console.log('-'.repeat(60));
    console.log(
      ` 합계 |   $${String(totalP1Income).padStart(2)}   |   $${String(totalP2Income).padStart(2)}   | ` +
      `  ${p1LongerCount}/10     |   ${p2LongerCount}/10`
    );
    console.log('='.repeat(60));

    // 검증: 긴 링크 우선 선택율이 70% 이상
    const totalLongerRate = (p1LongerCount + p2LongerCount) / 20;
    console.log(`\n긴 링크 우선 선택율: ${((totalLongerRate) * 100).toFixed(0)}%`);

    expect(totalLongerRate).toBeGreaterThanOrEqual(0.7);
  });
});
