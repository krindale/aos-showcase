/**
 * Phase IV: 트랙 건설 전략
 *
 * AI가 선택한 전략의 목표 경로를 향해 트랙을 건설합니다.
 */

import { GameState, PlayerId, HexCoord, GAME_CONSTANTS, TRACK_REPLACE_COSTS } from '@/types/game';
import { evaluateTrackPosition } from '../evaluator';
import {
  isValidConnectionPoint,
  validateFirstTrackRule,
  validateTrackConnection,
  playerHasTrack,
} from '@/utils/trackValidation';
import { getBuildableNeighbors, getExitDirections, hexCoordsEqual, getNeighborHex, hexDistance, findAllConnectedHexes } from '@/utils/hexGrid';
import { getSelectedStrategy, hasSelectedStrategy } from '../strategy/state';
import { getNextTargetRoute, reevaluateStrategy, findNextTargetRoute } from '../strategy/selector';
import {
  evaluateTrackForRoute,
  getIntermediateCities,
  getConnectedCities,
  findAvailableCityEdges,
  findBestEdgeToCity,
  isRouteComplete,
} from '../strategy/analyzer';
import type { DeliveryRoute } from '../strategy/types';

export type TrackBuildDecision =
  | { action: 'build'; coord: HexCoord; edges: [number, number] }
  | { action: 'buildComplex'; coord: HexCoord; edges: [number, number]; trackType: 'crossing' | 'coexist' }
  | { action: 'skip' }; // 건설 스킵

interface BuildCandidate {
  coord: HexCoord;
  edges: [number, number];
  score: number;
  cost: number;
  routeScore: number;  // 전략 경로 점수
  intention: string;   // 건설 의도
  isComplexTrack?: boolean;  // 복합 트랙 여부
  trackType?: 'crossing' | 'coexist';  // 복합 트랙 타입
}

/**
 * 트랙 건설 결정
 *
 * 전략:
 * 1. 건설 가능한 모든 위치 탐색
 * 2. 각 위치의 전략적 가치 평가 (기본 + 경로 점수)
 * 3. 비용 대비 가치가 높은 위치 선택
 * 4. 현금이 부족하면 건설 스킵
 *
 * @param state 게임 상태
 * @param playerId AI 플레이어 ID
 * @returns 건설 결정
 */
export function decideBuildTrack(state: GameState, playerId: PlayerId): TrackBuildDecision {
  const player = state.players[playerId];
  if (!player) return { action: 'skip' };

  // 이미 이번 턴 트랙 건설 완료 확인
  if (state.phaseState.builtTracksThisTurn >= state.phaseState.maxTracksThisTurn) {
    console.log(`[AI 트랙] ${player.name}: 이번 턴 건설 완료`);
    return { action: 'skip' };
  }

  // 현금이 최소 비용보다 적으면 스킵
  if (player.cash < GAME_CONSTANTS.PLAIN_TRACK_COST) {
    console.log(`[AI 트랙] ${player.name}: 현금 부족 ($${player.cash})`);
    return { action: 'skip' };
  }

  // 현금이 충분한지 및 전략 업데이트
  reevaluateStrategy(state, playerId);

  // 순수 함수로 경로 탐색 먼저 시도
  const routeResult = findNextTargetRoute(state, playerId);
  let targetRoute = routeResult.route;

  // 재평가 필요시에만 getNextTargetRoute 호출 (전략 변경 포함)
  if (!targetRoute && routeResult.needsStrategyReeval) {
    targetRoute = getNextTargetRoute(state, playerId);
  }

  // [핵심 추가] 이미 배달이 가능한 상태인지 확인 (타사 선로 포함)
  if (targetRoute) {
    const isAlreadyConnected = isRouteComplete(state, targetRoute);
    const playerTracks = state.board.trackTiles.filter(t => t.owner === playerId);

    // 이 경로 상에 내 트랙이 하나도 없고 + 타사가 이미 연결했다면 목표 전환
    // (analyzer.ts와 싱크를 맞춤: 내 트랙이 하나라도 있다면 타사 선로가 있어도 끝까지 지음)
    const hasOwnTrackForThisRoute = playerTracks.length > 0; // 단순화된 체크, evaluateTrackForRoute의 로직과 유사하게 작동하도록 유도

    if (isAlreadyConnected && !hasOwnTrackForThisRoute) {
      console.log(`[AI 트랙] ${player.name}: 목표 경로(${targetRoute.from}→${targetRoute.to})가 타인에 의해 이미 연결됨 - 신규 목표 탐색`);

      // 즉시 다음 목표 탐색 (이미 연결된 경로는 selector에서 제외될 것임)
      targetRoute = getNextTargetRoute(state, playerId);

      if (!targetRoute) {
        // 배달 경로가 없으면 네트워크 확장을 시도
        targetRoute = findNetworkExpansionTarget(state, playerId);
      }

      if (!targetRoute) {
        console.log(`[AI 트랙] ${player.name}: 추가 가능한 목표 없음 - 건설 종료`);
        return { action: 'skip' };
      }
    }
  }

  const strategy = getSelectedStrategy(playerId);
  const strategyName = strategy?.nameKo ?? '없음';

  // 목표 경로가 여전히 없으면(드문 경우) 스킵
  if (!targetRoute) {
    console.log(`[AI 트랙] ${player.name}: 목표 없음 - 건설 스킵`);
    return { action: 'skip' };
  }

  // 건설 가능한 후보 탐색
  const candidates = findBuildCandidates(state, playerId, targetRoute);

  if (candidates.length === 0) {
    console.log(`[AI 트랙] ${player.name}: 건설 가능한 위치 없음`);
    return { action: 'skip' };
  }

  // 전략 경로 점수 계산 및 필터링
  const validCandidates = candidates.filter(c => {
    // 이미 타사 선로를 포함하여 연결이 완성된 경우 해당 경로로의 건설 점수를 삭감하거나 처리
    // 이는 findBuildCandidates 내부에서도 고려되지만, 여기서 최종 점수와 함께 판단
    return true;
  });

  if (validCandidates.length === 0) {
    console.log(`[AI 트랙] ${player.name}: 유효한 건설 후보 없음`);
    return { action: 'skip' };
  }

  // 총점 (기본 점수 + 경로 점수 × 2) 기준으로 정렬
  validCandidates.sort((a, b) => {
    const aTotalScore = a.score + a.routeScore * 2;
    const bTotalScore = b.score + b.routeScore * 2;
    const aValue = aTotalScore / Math.max(a.cost, 1);
    const bValue = bTotalScore / Math.max(b.cost, 1);
    return bValue - aValue;
  });

  // 최선의 후보 선택
  const best = validCandidates[0];
  const bestTotalScore = best.score + best.routeScore * 2;

  // [Refinement] 점수가 조금 낮더라도 (예: -40점 Trap) 완주를 위해 임계값 완화
  // 최적 경로상에 있거나 내 트랙 근처라면 끈기 있게 건설함
  const skipThreshold = -100;
  if (bestTotalScore < skipThreshold || best.routeScore < -500) {
    console.log(`[AI 트랙] ${player.name}: 건설 점수 낮음 (총점=${bestTotalScore.toFixed(1)}, 경로점수=${best.routeScore.toFixed(1)}) - 건설 건너뜀`);
    return { action: 'skip' };
  }

  // 현금이 충분한지 최종 확인
  if (player.cash < best.cost) {
    // 더 저렴한 옵션 찾기
    const affordable = validCandidates.filter(c => c.cost <= player.cash);
    if (affordable.length === 0) {
      console.log(`[AI 트랙] ${player.name}: 현금 부족 (최선 $${best.cost}, 보유 $${player.cash})`);
      return { action: 'skip' };
    }
    const cheapBest = affordable[0];
    const cheapTotalScore = cheapBest.score + cheapBest.routeScore * 2;

    if (cheapTotalScore < 0 || cheapBest.routeScore < -500) {
      return { action: 'skip' };
    }

    const typeInfo = cheapBest.isComplexTrack ? ` [${cheapBest.trackType}]` : '';
    console.log(`[AI 트랙] ${player.name}: 건설 (${cheapBest.coord.col},${cheapBest.coord.row}) edges=[${cheapBest.edges}] $${cheapBest.cost}${typeInfo} (전략=${strategyName})`);

    if (cheapBest.isComplexTrack && cheapBest.trackType) {
      return { action: 'buildComplex', coord: cheapBest.coord, edges: cheapBest.edges, trackType: cheapBest.trackType };
    }
    return { action: 'build', coord: cheapBest.coord, edges: cheapBest.edges };
  }

  const routeInfo = targetRoute ? `${targetRoute.from}→${targetRoute.to}` : '없음';
  const typeInfo = best.isComplexTrack ? ` [${best.trackType}]` : '';
  console.log(`[AI 트랙] ${player.name}: 건설 (${best.coord.col},${best.coord.row}) edges=[${best.edges}] $${best.cost}${typeInfo} 총점=${bestTotalScore.toFixed(1)} [의도: ${best.intention}] (전략=${strategyName}, 경로=${routeInfo})`);

  if (best.isComplexTrack && best.trackType) {
    return { action: 'buildComplex', coord: best.coord, edges: best.edges, trackType: best.trackType };
  }
  return { action: 'build', coord: best.coord, edges: best.edges };
}

/**
 * 건설 가능한 모든 후보 위치 탐색
 */
function findBuildCandidates(
  state: GameState,
  playerId: PlayerId,
  targetRoute: DeliveryRoute | null
): BuildCandidate[] {
  const { board } = state;
  const candidates: BuildCandidate[] = [];

  const hasExistingTrack = playerHasTrack(board, playerId);

  if (!hasExistingTrack) {
    // 첫 트랙: 목표 경로의 출발지 도시에서 시작
    // targetRoute가 있으면 해당 출발지 도시에서만, 없으면 모든 도시에서
    let startCities = board.cities;

    if (targetRoute) {
      const fromCity = board.cities.find(c => c.id === targetRoute.from);
      if (fromCity) {
        startCities = [fromCity];
        console.log(`[AI 트랙] 첫 트랙: ${targetRoute.from} 도시에서 시작`);
      }
    }

    for (const city of startCities) {
      const neighbors = getBuildableNeighbors(city.coord, board, playerId);

      for (const neighbor of neighbors) {
        const exitDirs = getExitDirections(neighbor.coord, neighbor.targetEdge, board);

        for (const exitDir of exitDirs) {
          const edges: [number, number] = [neighbor.targetEdge, exitDir.exitEdge];

          if (!validateFirstTrackRule(neighbor.coord, edges, board)) continue;

          const cost = getTerrainCost(neighbor.coord, board);
          const score = evaluateTrackPosition(state, neighbor.coord, playerId);

          // 전략 경로 점수 계산 (엣지 방향 포함)
          let routeScore = 0;
          let intention = '';
          if (targetRoute) {
            const result = evaluateTrackForRoute(neighbor.coord, targetRoute, board, playerId, edges);
            routeScore = result.score;
            intention = result.intention;
          }

          candidates.push({
            coord: neighbor.coord,
            edges,
            score,
            cost,
            routeScore,
            intention,
          });
        }
      }
    }
  } else {
    // 후속 트랙: 플레이어 소유 트랙의 끝에서만 확장
    // 도시는 connectionPoints에서 제외 - 트랙 좌표만 사용
    // 이렇게 해야 AI가 기존 트랙에서 연속적으로 확장함
    // [Strict Sequential] 출발 도시에서부터만 시작/확장하도록 강제
    const connectionPoints: HexCoord[] = [];

    if (targetRoute) {
      const sourceCity = board.cities.find(c => c.id === targetRoute.from);
      if (sourceCity) {
        // 출발 도시와 연결된 모든 헥스(도시/트랙) 찾기
        const connectedSet = findAllConnectedHexes(sourceCity.coord, board, playerId);
        const connectedHexes = Array.from(connectedSet);

        // 연결된 헥스 중 '트랙'들만 연결점으로 추가 (확장의 시작점)
        for (const coord of connectedHexes) {
          const isTrack = board.trackTiles.some(t => hexCoordsEqual(t.coord, coord) && t.owner === playerId);
          if (isTrack) {
            connectionPoints.push(coord);
          }
        }

        // 만약 출발 도시와 연결된 내 트랙이 하나도 없다면, 도시 자체가 유일한 시작점
        if (connectionPoints.length === 0) {
          console.log(`[AI 트랙] 출발 도시 ${targetRoute.from}와 연결된 트랙 없음 - 도시에서 시작`);
          connectionPoints.push(sourceCity.coord);
        } else {
          console.log(`[AI 트랙] 출발 도시 ${targetRoute.from}와 연결된 망에서 확장 (후보지 ${connectionPoints.length}개)`);
        }
      }
    } else {
      // 목적지가 없는 일반 건설 시에만 기존처럼 모든 트랙을 후보로 사용
      for (const track of board.trackTiles) {
        if (track.owner === playerId) {
          connectionPoints.push(track.coord);
        }
      }
    }

    for (const point of connectionPoints) {
      if (!isValidConnectionPoint(point, board, playerId)) continue;

      const neighbors = getBuildableNeighbors(point, board, playerId);

      for (const neighbor of neighbors) {
        const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighbor.coord));
        if (existingTrack) continue;

        const exitDirs = getExitDirections(neighbor.coord, neighbor.targetEdge, board);

        for (const exitDir of exitDirs) {
          const edges: [number, number] = [neighbor.targetEdge, exitDir.exitEdge];

          if (!validateTrackConnection(neighbor.coord, edges, board, playerId)) continue;

          const cost = getTerrainCost(neighbor.coord, board);
          const score = evaluateTrackPosition(state, neighbor.coord, playerId);

          // 전략 경로 점수 계산 (엣지 방향 포함)
          let routeScore = 0;
          let intention = '';
          if (targetRoute) {
            const result = evaluateTrackForRoute(neighbor.coord, targetRoute, board, playerId, edges);
            routeScore = result.score;
            intention = result.intention;
          }

          // 중복 제거
          const isDuplicate = candidates.some(
            c => hexCoordsEqual(c.coord, neighbor.coord) &&
              c.edges[0] === edges[0] && c.edges[1] === edges[1]
          );
          if (!isDuplicate) {
            candidates.push({
              coord: neighbor.coord,
              edges,
              score,
              cost,
              routeScore,
              intention,
            });
          }
        }
      }
    }

    // 기존 트랙에서 후보가 없으면 경로상 모든 도시에서 새 경로 시작 시도
    if (candidates.length === 0 && targetRoute) {
      console.log(`[AI 트랙] 기존 트랙에서 확장 불가 - 엣지 기반 대체 경로 탐색`);

      // 연결된 도시 확인
      const connectedCities = getConnectedCities(state, playerId);

      // ====== 핵심 수정: 연결된 도시가 있는데 후보가 없으면 엣지 기반 대체 경로 탐색 ======
      if (connectedCities.length > 0) {
        // 목표 도시의 사용 가능한 엣지 찾기
        const targetCity = board.cities.find(c => c.id === targetRoute.to);
        if (targetCity) {
          const availableEdges = findAvailableCityEdges(targetCity.coord, board, playerId);
          console.log(`[AI 트랙] 목표 도시 ${targetRoute.to}의 사용 가능한 엣지: [${availableEdges.join(', ')}]`);

          if (availableEdges.length > 0) {
            // AI의 현재 위치 찾기 (마지막 트랙 끝 또는 연결된 도시)
            const playerTracks = board.trackTiles.filter(t => t.owner === playerId);
            let currentPos: HexCoord | null = null;

            // 마지막 트랙의 열린 끝점 찾기
            for (const track of playerTracks) {
              for (const edge of track.edges) {
                const neighbor = getNeighborHex(track.coord, edge);
                const isCity = board.cities.some(c => hexCoordsEqual(c.coord, neighbor));
                const oppositeEdge = (edge + 3) % 6;
                const connectedTrack = playerTracks.find(
                  t => hexCoordsEqual(t.coord, neighbor) && t.edges.includes(oppositeEdge)
                );

                // 도시에 연결되어 있지 않고, 다른 트랙에도 연결되지 않은 끝
                if (!isCity && !connectedTrack) {
                  currentPos = track.coord;
                  break;
                }
              }
              if (currentPos) break;
            }

            // 열린 끝점이 없으면 연결된 도시에서 시작
            if (!currentPos) {
              const startCity = board.cities.find(c => connectedCities.includes(c.id));
              if (startCity) {
                currentPos = startCity.coord;
              }
            }

            if (currentPos) {
              // 남은 트랙 수
              const remainingTracks = state.phaseState.maxTracksThisTurn - state.phaseState.builtTracksThisTurn;

              // 최적 엣지와 경로 찾기
              const bestEdgeResult = findBestEdgeToCity(
                currentPos,
                targetCity.coord,
                availableEdges,
                board,
                playerId,
                remainingTracks
              );

              if (bestEdgeResult && bestEdgeResult.path.length > 1) {
                console.log(`[AI 트랙] 대체 경로 발견: edge ${bestEdgeResult.edge}, 경로 길이=${bestEdgeResult.path.length}`);

                // 경로의 첫 번째 헥스 (현재 위치 다음)를 후보로 추가
                const nextHexIndex = bestEdgeResult.path.findIndex(p => !hexCoordsEqual(p, currentPos!));
                if (nextHexIndex >= 0) {
                  const nextHex = bestEdgeResult.path[nextHexIndex];

                  // 이미 트랙이 있는 곳은 제외
                  const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, nextHex));
                  if (!existingTrack) {
                    // 현재 위치에서 다음 헥스로 가는 엣지 찾기
                    for (let edge = 0; edge < 6; edge++) {
                      const neighbor = getNeighborHex(currentPos, edge);
                      if (hexCoordsEqual(neighbor, nextHex)) {
                        const targetEdge = (edge + 3) % 6; // 다음 헥스에서 현재 위치를 향하는 엣지

                        const exitDirs = getExitDirections(nextHex, targetEdge, board);

                        for (const exitDir of exitDirs) {
                          const edges: [number, number] = [targetEdge, exitDir.exitEdge];

                          // 연결 검증
                          if (!validateTrackConnection(nextHex, edges, board, playerId)) continue;

                          const cost = getTerrainCost(nextHex, board);
                          const score = evaluateTrackPosition(state, nextHex, playerId);
                          const { score: routeScore, intention } = evaluateTrackForRoute(nextHex, targetRoute, board, playerId, edges);

                          // 대체 경로 보너스
                          const alternativePathBonus = 100;

                          candidates.push({
                            coord: nextHex,
                            edges,
                            score: score + alternativePathBonus,
                            cost,
                            routeScore: routeScore + 50, // 대체 경로 점수 보너스
                            intention: `대체 경로 확장 (${intention})`,
                          });

                          console.log(`[AI 트랙] 대체 경로 후보 추가: (${nextHex.col},${nextHex.row}) edges=[${edges}]`);
                        }
                        break;
                      }
                    }
                  }
                }
              }
            }
          } else {
            console.log(`[AI 트랙] 목표 도시 ${targetRoute.to}에 접근 가능한 엣지 없음`);
          }
        }
      }

      // ====== 기존 Fallback 로직 (연결된 도시에서만 시작 - 안전장치) ======
      if (candidates.length === 0) {
        // 목표 경로의 출발/도착 도시 + 중간 도시 모두 고려
        const intermediateCities = getIntermediateCities(targetRoute, board);
        const allRouteCities = [targetRoute.from, ...intermediateCities, targetRoute.to];

        // 연결된 도시에서만 시작 허용 (안전장치: 연결 안 된 트랙 건설 방지)
        const sortedCities = allRouteCities.filter(cityId => connectedCities.includes(cityId));

        // 연결된 도시가 있는데 경로상에 없으면 연결된 도시 추가
        if (sortedCities.length === 0 && connectedCities.length > 0) {
          sortedCities.push(...connectedCities);
        }

        // 트랙이 있는데 연결된 도시가 없으면 건설 스킵 (비정상 상태)
        if (sortedCities.length === 0 && hasExistingTrack) {
          console.log(`[AI 트랙] 연결된 도시 없음 - 건설 스킵 (안전장치)`);
          return candidates; // 빈 후보 반환
        }

        console.log(`[AI 트랙] Fallback - 연결된 도시에서만 시작: [${sortedCities.join(', ')}]`);

        for (const cityId of sortedCities) {
          const city = board.cities.find(c => c.id === cityId);
          if (!city) continue;

          const neighbors = getBuildableNeighbors(city.coord, board, playerId);

          for (const neighbor of neighbors) {
            // 이미 트랙이 있는 곳은 제외
            const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighbor.coord));
            if (existingTrack) continue;

            const exitDirs = getExitDirections(neighbor.coord, neighbor.targetEdge, board);

            for (const exitDir of exitDirs) {
              const edges: [number, number] = [neighbor.targetEdge, exitDir.exitEdge];

              if (!validateFirstTrackRule(neighbor.coord, edges, board)) continue;

              const cost = getTerrainCost(neighbor.coord, board);
              const score = evaluateTrackPosition(state, neighbor.coord, playerId);
              const { score: routeScore, intention } = evaluateTrackForRoute(neighbor.coord, targetRoute, board, playerId, edges);

              // 동적 임계값으로 경로와 무관한 후보 제외
              const minScore = calculateMinFallbackScore(state, playerId, connectedCities);
              if (routeScore < minScore) {
                continue;
              }

              // 연결된 도시에서 시작하면 보너스
              const connectionBonus = connectedCities.includes(cityId) ? 50 : 0;

              // 중복 제거
              const isDuplicate = candidates.some(
                c => hexCoordsEqual(c.coord, neighbor.coord) &&
                  c.edges[0] === edges[0] && c.edges[1] === edges[1]
              );
              if (!isDuplicate) {
                candidates.push({
                  coord: neighbor.coord,
                  edges,
                  score: score + connectionBonus,
                  cost,
                  routeScore,
                  intention: `Fallback 건설 (${intention})`,
                });
              }
            }
          }
        }
      }
    }
  }

  // ===== 복합 트랙 후보 탐색 =====
  // 상대 트랙이 있는 헥스 중 복합 트랙으로 건설 가능한 곳 찾기
  const complexCandidates = findComplexTrackCandidates(state, playerId, targetRoute);
  candidates.push(...complexCandidates);

  return candidates;
}

/**
 * 복합 트랙 후보 탐색
 *
 * 상대 트랙이 있는 헥스에서 교차(crossing) 또는 공존(coexist) 트랙을 건설할 수 있는지 확인
 */
function findComplexTrackCandidates(
  state: GameState,
  playerId: PlayerId,
  targetRoute: DeliveryRoute | null
): BuildCandidate[] {
  const candidates: BuildCandidate[] = [];
  const { board } = state;

  // 플레이어 소유 트랙의 끝점(미완성 구간) 찾기
  let playerTrackEnds = findPlayerTrackEnds(state, playerId);

  // [Strict Sequential] 출발 도시와 연결된 끝점만 사용
  if (targetRoute) {
    const sourceCity = board.cities.find(c => c.id === targetRoute.from);
    if (sourceCity) {
      const connectedSet = findAllConnectedHexes(sourceCity.coord, board, playerId);
      playerTrackEnds = playerTrackEnds.filter(end =>
        Array.from(connectedSet).some(conn => hexCoordsEqual(conn, end.coord))
      );

      // 만약 출발지 망에 끝점이 없다면(도시만 있는 경우 등), 도시를 가상 끝점으로 추가 고려해야 할 수도 있지만
      // findPossibleComplexEdges 내부 로직상 트랙 끝점이 필요하므로 일단 필터링만 유지
    }
  }

  // 상대 트랙 중 단순 트랙인 것만 탐색
  for (const track of board.trackTiles) {
    // 내 트랙이면 스킵
    if (track.owner === playerId) continue;
    // 이미 복합 트랙이면 스킵
    if (track.trackType !== 'simple') continue;

    // 이 헥스가 내 트랙에서 연결 가능한지 확인
    const possibleEdgePairs = findPossibleComplexEdges(
      track.coord,
      track.edges,
      board,
      playerId,
      playerTrackEnds
    );

    for (const { edges: newEdges, trackType } of possibleEdgePairs) {
      // 복합 트랙 건설 가능 여부 확인
      if (!canBuildComplexTrackForAI(state, track.coord, newEdges, playerId)) continue;

      // 비용 계산
      const cost = trackType === 'crossing'
        ? TRACK_REPLACE_COSTS.simpleToCrossing
        : TRACK_REPLACE_COSTS.default;

      const score = evaluateTrackPosition(state, track.coord, playerId);

      // 전략 경로 점수 계산
      let routeScore = 0;
      let intention = '일반 네트워크 확장';
      if (targetRoute) {
        const result = evaluateTrackForRoute(track.coord, targetRoute, board, playerId, newEdges);
        routeScore = result.score;
        intention = result.intention;
      }

      // 복합 트랙은 기본적으로 보너스 점수 (경로를 막힘없이 이어갈 수 있으므로)
      const complexBonus = 30;

      candidates.push({
        coord: track.coord,
        edges: newEdges,
        score: score + complexBonus,
        cost,
        routeScore,
        intention: `복합 트랙(${trackType}) 이용 - ${intention}`,
        isComplexTrack: true,
        trackType,
      });

      console.log(`[AI 트랙] 복합 트랙 후보: (${track.coord.col},${track.coord.row}) edges=[${newEdges}] ${trackType} $${cost}`);
    }
  }

  return candidates;
}

/**
 * 플레이어 트랙의 끝점 (미완성 구간) 찾기
 */
function findPlayerTrackEnds(
  state: GameState,
  playerId: PlayerId
): { coord: HexCoord; openEdge: number }[] {
  const ends: { coord: HexCoord; openEdge: number }[] = [];
  const { board } = state;

  for (const track of board.trackTiles) {
    if (track.owner !== playerId) continue;

    // 각 엣지가 다른 트랙, 도시, 마을에 연결되어 있는지 확인
    for (const edge of track.edges) {
      const neighbor = getNeighborHex(track.coord, edge);

      // 이웃 헥스에 도시가 있으면 연결됨
      const isCity = board.cities.some(c => hexCoordsEqual(c.coord, neighbor));
      if (isCity) continue;

      // 이웃 헥스에 마을이 있으면 연결됨
      const isTown = board.towns.some(t => hexCoordsEqual(t.coord, neighbor));
      if (isTown) continue;

      // 이웃 헥스에 연결된 트랙이 있으면 연결됨
      const oppositeEdge = (edge + 3) % 6;
      const neighborTrack = board.trackTiles.find(
        t => hexCoordsEqual(t.coord, neighbor) && t.edges.includes(oppositeEdge)
      );
      if (neighborTrack) continue;

      // 연결되지 않은 엣지 = 열린 끝점
      ends.push({ coord: track.coord, openEdge: edge });
    }
  }

  return ends;
}

/**
 * 상대 트랙에 복합 트랙으로 연결 가능한 엣지 조합 찾기
 */
function findPossibleComplexEdges(
  coord: HexCoord,
  existingEdges: [number, number],
  board: { trackTiles: { coord: HexCoord; edges: [number, number]; owner: PlayerId | null }[]; cities: { coord: HexCoord }[]; towns: { coord: HexCoord }[] },
  playerId: PlayerId,
  playerTrackEnds: { coord: HexCoord; openEdge: number }[]
): { edges: [number, number]; trackType: 'crossing' | 'coexist' }[] {
  const results: { edges: [number, number]; trackType: 'crossing' | 'coexist' }[] = [];

  // 사용 가능한 엣지 (기존 트랙이 사용하지 않는 엣지)
  const availableEdges = [0, 1, 2, 3, 4, 5].filter(
    e => e !== existingEdges[0] && e !== existingEdges[1]
  );

  // 이 헥스와 인접한 내 트랙 또는 도시 찾기
  const connectableEdges: number[] = [];

  for (const edge of availableEdges) {
    const neighbor = getNeighborHex(coord, edge);

    // 이웃이 도시인지 확인
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, neighbor));
    if (isCity) {
      connectableEdges.push(edge);
      continue;
    }

    // 이웃이 내 트랙의 열린 끝점인지 확인
    const oppositeEdge = (edge + 3) % 6;
    const isMyTrackEnd = playerTrackEnds.some(
      end => hexCoordsEqual(end.coord, neighbor) && end.openEdge === oppositeEdge
    );
    if (isMyTrackEnd) {
      connectableEdges.push(edge);
    }
  }

  // 연결 가능한 엣지 조합 생성
  for (let i = 0; i < connectableEdges.length; i++) {
    for (let j = i + 1; j < connectableEdges.length; j++) {
      const newEdges: [number, number] = [connectableEdges[i], connectableEdges[j]];

      // 교차인지 공존인지 판단
      const trackType = determineComplexTrackType(existingEdges, newEdges);
      results.push({ edges: newEdges, trackType });
    }

    // 단일 연결도 고려 (출구 엣지는 아무거나)
    for (const exitEdge of availableEdges) {
      if (exitEdge === connectableEdges[i]) continue;

      const newEdges: [number, number] = [connectableEdges[i], exitEdge];

      const trackType = determineComplexTrackType(existingEdges, newEdges);
      results.push({ edges: newEdges, trackType });
    }
  }

  return results;
}

/**
 * 두 트랙이 교차(crossing)인지 공존(coexist)인지 판단
 *
 * 교차: 두 트랙이 헥스 중앙을 지나며 실제로 교차
 * 공존: 두 트랙이 헥스 가장자리를 따라 교차하지 않음
 */
function determineComplexTrackType(
  existingEdges: [number, number],
  newEdges: [number, number]
): 'crossing' | 'coexist' {
  // 단순화된 교차 판단: 반대편 엣지끼리 연결되면 교차 가능성 높음
  const existingDiff = Math.abs(existingEdges[0] - existingEdges[1]);
  const newDiff = Math.abs(newEdges[0] - newEdges[1]);

  // 직선(반대편 연결, diff=3)과 직선이 만나면 교차
  if ((existingDiff === 3 || existingDiff === 3) && (newDiff === 3 || newDiff === 3)) {
    return 'crossing';
  }

  // 그 외에는 공존
  return 'coexist';
}

/**
 * AI용 복합 트랙 건설 가능 여부 확인
 *
 * gameStore.ts의 canBuildComplexTrack과 유사하지만, 특정 플레이어 기준으로 검증
 */
function canBuildComplexTrackForAI(
  state: GameState,
  coord: HexCoord,
  newEdges: [number, number],
  playerId: PlayerId
): boolean {
  const { board } = state;

  // 기존 트랙이 있어야 함
  const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
  if (!existingTrack) return false;

  // 기존 트랙이 단순 트랙이어야 함
  if (existingTrack.trackType !== 'simple') return false;

  // 새 경로가 기존 경로와 겹치지 않아야 함
  const existingEdges = existingTrack.edges;
  if (
    newEdges[0] === existingEdges[0] ||
    newEdges[0] === existingEdges[1] ||
    newEdges[1] === existingEdges[0] ||
    newEdges[1] === existingEdges[1]
  ) {
    return false;
  }

  // 연결성 검증: 새 경로가 플레이어의 기존 트랙/도시에 연결되어야 함
  if (!validateTrackConnection(coord, newEdges, board, playerId)) {
    return false;
  }

  return true;
}

/**
 * 동적 폴백 임계값 계산
 *
 * 상황에 따라 유연한 임계값을 반환하여 과도한 필터링 방지
 */
export function calculateMinFallbackScore(
  state: GameState,
  playerId: PlayerId,
  connectedCities: string[]
): number {
  const playerTracks = state.board.trackTiles.filter(t => t.owner === playerId);

  // 첫 트랙은 거의 모두 허용
  if (playerTracks.length === 0) return 10;

  // 연결된 도시에서 시작하면 관대
  if (connectedCities.length > 0) return 15;

  // 기본 임계값 (50 → 20)
  return 20;
}

/**
 * 물품이 없을 때 네트워크 확장 목표 찾기
 *
 * 연결된 도시에서 가장 가까운 미연결 도시를 찾아 경로 생성
 */
export function findNetworkExpansionTarget(
  state: GameState,
  playerId: PlayerId
): DeliveryRoute | null {
  const connectedCities = getConnectedCities(state, playerId);
  const { board } = state;

  // 연결 안 된 도시 찾기
  const unconnectedCities = board.cities.filter(
    c => !connectedCities.includes(c.id)
  );

  if (unconnectedCities.length === 0) return null;

  // 연결된 도시가 없으면 (첫 트랙) 임의 도시 선택
  if (connectedCities.length === 0) {
    const firstCity = board.cities[0];
    const nearestUnconnected = unconnectedCities.reduce((nearest, city) => {
      const dist = hexDistance(firstCity.coord, city.coord);
      const nearestDist = hexDistance(firstCity.coord, nearest.coord);
      return dist < nearestDist ? city : nearest;
    });

    console.log(`[AI 트랙] 네트워크 확장: ${firstCity.id} → ${nearestUnconnected.id} (첫 트랙)`);
    return { from: firstCity.id, to: nearestUnconnected.id, priority: 3 };
  }

  // 연결된 도시에서 가장 가까운 미연결 도시 찾기
  let bestTarget: { from: string; to: string; distance: number } | null = null;

  for (const connectedId of connectedCities) {
    const connectedCity = board.cities.find(c => c.id === connectedId);
    if (!connectedCity) continue;

    for (const unconnected of unconnectedCities) {
      const distance = hexDistance(connectedCity.coord, unconnected.coord);
      if (!bestTarget || distance < bestTarget.distance) {
        bestTarget = { from: connectedId, to: unconnected.id, distance };
      }
    }
  }

  if (bestTarget) {
    console.log(`[AI 트랙] 네트워크 확장: ${bestTarget.from} → ${bestTarget.to}`);
    return { from: bestTarget.from, to: bestTarget.to, priority: 3 };
  }

  return null;
}

/**
 * 지형에 따른 건설 비용
 */
function getTerrainCost(coord: HexCoord, board: { hexTiles: { coord: HexCoord; terrain: string }[] }): number {
  const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
  if (!hexTile) return GAME_CONSTANTS.PLAIN_TRACK_COST;

  switch (hexTile.terrain) {
    case 'river':
      return GAME_CONSTANTS.RIVER_TRACK_COST;
    case 'mountain':
      return GAME_CONSTANTS.MOUNTAIN_TRACK_COST;
    default:
      return GAME_CONSTANTS.PLAIN_TRACK_COST;
  }
}
