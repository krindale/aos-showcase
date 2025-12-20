/**
 * Phase별 결정 수집기
 *
 * 각 게임 Phase에서 AI의 결정 과정을 분석합니다.
 */

import { GameState, PlayerId, GAME_CONSTANTS, SpecialAction, CubeColor } from '@/types/game';
import {
  PhaseDecisionReport,
  IssueSharesDecision,
  AuctionDecisionAnalysis,
  SelectActionAnalysis,
  BuildTrackAnalysis,
  MoveGoodsAnalysis,
  TrackCandidate,
  MoveGoodsCandidate,
} from '../types';
import { getCurrentRoute } from '../../strategy/state';
import { getNextTargetRoute } from '../../strategy/selector';
import {
  evaluateTrackForRoute,
  analyzeDeliveryOpportunities,
  getConnectedCities,
} from '../../strategy/analyzer';
import { evaluateTrackPosition } from '../../evaluator';
import {
  getBuildableNeighbors,
  getExitDirections,
  hexCoordsEqual,
} from '@/utils/hexGrid';
import {
  isValidConnectionPoint,
  validateFirstTrackRule,
  validateTrackConnection,
  playerHasTrack,
} from '@/utils/trackValidation';

/**
 * Phase별 결정 수집
 */
export function collectPhaseDecision(
  state: GameState,
  playerId: PlayerId
): PhaseDecisionReport | undefined {
  const { currentPhase } = state;

  const report: PhaseDecisionReport = {
    phase: currentPhase,
    playerId,
  };

  switch (currentPhase) {
    case 'issueShares':
      report.issueShares = collectIssueSharesDecision(state, playerId);
      break;
    case 'determinePlayerOrder':
      report.auction = collectAuctionDecision(state, playerId);
      break;
    case 'selectActions':
      report.selectAction = collectSelectActionDecision(state, playerId);
      break;
    case 'buildTrack':
      report.buildTrack = collectBuildTrackDecision(state, playerId);
      break;
    case 'moveGoods':
      report.moveGoods = collectMoveGoodsDecision(state, playerId);
      break;
    default:
      return undefined;
  }

  return report;
}

/**
 * 주식 발행 결정 수집
 */
function collectIssueSharesDecision(
  state: GameState,
  playerId: PlayerId
): IssueSharesDecision {
  const player = state.players[playerId];

  const currentCash = player?.cash ?? 0;
  const currentShares = player?.issuedShares ?? 2;
  const engineLevel = player?.engineLevel ?? 1;

  // 동적 전략: 기본 트랙 건설 비용
  const requiredCash = 9;
  const expectedExpenses = currentShares + engineLevel;
  const shortage = Math.max(0, requiredCash + expectedExpenses - currentCash);

  // 보수적으로 최대 2주 발행
  const maxStrategicShares = 2;

  const sharesNeeded = Math.ceil(shortage / GAME_CONSTANTS.SHARE_VALUE);
  const sharesDecided = Math.min(sharesNeeded, Math.max(0, 10 - currentShares), maxStrategicShares);

  return {
    currentCash,
    requiredCash,
    expectedExpenses,
    shortage,
    sharesDecided,
    maxStrategicShares,
    currentShares,
  };
}

/**
 * 경매 결정 수집
 */
function collectAuctionDecision(
  state: GameState,
  playerId: PlayerId
): AuctionDecisionAnalysis {
  const player = state.players[playerId];
  const { auction } = state;

  const currentBid = auction?.highestBid ?? 0;
  const currentCash = player?.cash ?? 0;
  const maxBid = Math.floor(currentCash * 0.3);
  const cashRatio = currentCash > 0 ? currentBid / currentCash : 0;

  // Turn Order 행동을 선택했는지 확인
  const turnOrderPassAvailable = player?.selectedAction === 'turnOrder';

  let decision: 'bid' | 'pass' | 'skip' | 'complete' = 'pass';
  let bidAmount: number | undefined;

  // 경매가 없거나 마지막 플레이어
  const playerIds = Object.keys(state.players) as PlayerId[];
  const remainingPlayers = playerIds.filter(pid => !auction?.passedPlayers.includes(pid));

  if (!auction) {
    decision = 'complete';
  } else if (remainingPlayers.length <= 1) {
    decision = 'complete';
  } else if (currentBid >= maxBid) {
    decision = 'pass';
  } else if (turnOrderPassAvailable && currentBid >= maxBid * 0.5) {
    decision = 'skip';
  } else {
    decision = 'bid';
    bidAmount = currentBid + 1;
  }

  return {
    currentBid,
    maxBid,
    cashRatio,
    turnOrderPassAvailable,
    decision,
    bidAmount,
  };
}

/**
 * 행동 선택 결정 수집
 */
function collectSelectActionDecision(
  state: GameState,
  playerId: PlayerId
): SelectActionAnalysis {
  const player = state.players[playerId];

  const engineLevel = player?.engineLevel ?? 1;
  const minEngineLevel = 2; // 동적 전략: 기본 엔진 레벨 요구치
  const currentCash = player?.cash ?? 0;
  const trackCount = state.board.trackTiles.filter(t => t.owner === playerId).length;

  // 사용 가능한 행동 (이미 선택된 행동 제외)
  const allActions: SpecialAction[] = [
    'firstMove', 'firstBuild', 'engineer', 'locomotive',
    'urbanization', 'production', 'turnOrder'
  ];
  const usedActions = Object.values(state.players)
    .filter(p => p.selectedAction)
    .map(p => p.selectedAction!);
  const availableActions = allActions.filter(a => !usedActions.includes(a));

  // 동적 전략에서는 선호 행동 없음
  const preferredByStrategy: SpecialAction[] = [];

  // 결정 로직
  let selectedAction: SpecialAction = 'firstBuild';
  let selectionReason = '';

  // 엔진 레벨 부족시 locomotive 우선
  if (engineLevel < minEngineLevel && availableActions.includes('locomotive')) {
    selectedAction = 'locomotive';
    selectionReason = `엔진 레벨 부족 (${engineLevel} < ${minEngineLevel})`;
  }
  // 폴백: 기본 우선순위
  else {
    const fallbackOrder: SpecialAction[] = [
      'firstBuild', 'locomotive', 'engineer', 'firstMove',
      'urbanization', 'production', 'turnOrder'
    ];
    for (const action of fallbackOrder) {
      if (!availableActions.includes(action)) continue;
      if (action === 'locomotive' && engineLevel >= 3) continue;
      if (action === 'engineer' && currentCash < 6) continue;

      selectedAction = action;
      selectionReason = '기본 우선순위';
      break;
    }
  }

  return {
    availableActions,
    preferredByStrategy,
    engineLevel,
    minEngineLevel,
    trackCount,
    currentCash,
    selectedAction,
    selectionReason,
  };
}

/**
 * 트랙 건설 결정 수집
 */
function collectBuildTrackDecision(
  state: GameState,
  playerId: PlayerId
): BuildTrackAnalysis {
  const player = state.players[playerId];
  const { phaseState } = state;

  const tracksBuiltThisTurn = phaseState.builtTracksThisTurn ?? 0;
  const maxTracks = phaseState.maxTracksThisTurn ?? 3;
  const currentCash = player?.cash ?? 0;

  // 목표 경로 찾기
  const targetRoute = getNextTargetRoute(state, playerId);

  // 건설 불가 상황
  if (tracksBuiltThisTurn >= maxTracks) {
    return {
      targetRoute,
      tracksBuiltThisTurn,
      maxTracks,
      currentCash,
      candidates: [],
      selectedCandidate: null,
      skipReason: '이번 턴 건설 완료',
    };
  }

  if (currentCash < GAME_CONSTANTS.PLAIN_TRACK_COST) {
    return {
      targetRoute,
      tracksBuiltThisTurn,
      maxTracks,
      currentCash,
      candidates: [],
      selectedCandidate: null,
      skipReason: `현금 부족 ($${currentCash})`,
    };
  }

  // 건설 후보 탐색
  const candidates = collectBuildCandidates(state, playerId, targetRoute);

  // 점수 정렬
  candidates.sort((a, b) => {
    const aValue = a.totalScore / Math.max(a.cost, 1);
    const bValue = b.totalScore / Math.max(b.cost, 1);
    return bValue - aValue;
  });

  // 최선 후보 선택
  let selectedCandidate: { coord: { col: number; row: number }; edges: [number, number] } | null = null;
  let skipReason: string | undefined;

  if (candidates.length === 0) {
    skipReason = '건설 가능한 위치 없음';
  } else {
    const affordable = candidates.filter(c => c.cost <= currentCash);
    if (affordable.length === 0) {
      skipReason = `현금 부족 (최저 $${candidates[0].cost}, 보유 $${currentCash})`;
    } else {
      const best = affordable[0];
      selectedCandidate = { coord: best.coord, edges: best.edges };
    }
  }

  return {
    targetRoute,
    tracksBuiltThisTurn,
    maxTracks,
    currentCash,
    candidates: candidates.slice(0, 10), // 상위 10개만
    selectedCandidate,
    skipReason,
  };
}

/**
 * 건설 후보 수집 (점수 포함)
 */
function collectBuildCandidates(
  state: GameState,
  playerId: PlayerId,
  targetRoute: { from: string; to: string; priority: number } | null
): TrackCandidate[] {
  const { board } = state;
  const candidates: TrackCandidate[] = [];
  const hasExistingTrack = playerHasTrack(board, playerId);

  const getTerrainCost = (coord: { col: number; row: number }): number => {
    const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
    if (!hexTile) return GAME_CONSTANTS.PLAIN_TRACK_COST;
    switch (hexTile.terrain) {
      case 'river': return GAME_CONSTANTS.RIVER_TRACK_COST;
      case 'mountain': return GAME_CONSTANTS.MOUNTAIN_TRACK_COST;
      default: return GAME_CONSTANTS.PLAIN_TRACK_COST;
    }
  };

  const processNeighbor = (
    neighbor: { coord: { col: number; row: number }; targetEdge: number },
    isFirstTrack: boolean
  ) => {
    const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighbor.coord));
    if (existingTrack) return;

    const exitDirs = getExitDirections(neighbor.coord, neighbor.targetEdge, board);

    for (const exitDir of exitDirs) {
      const edges: [number, number] = [neighbor.targetEdge, exitDir.exitEdge];

      if (isFirstTrack) {
        if (!validateFirstTrackRule(neighbor.coord, edges, board)) continue;
      } else {
        if (!validateTrackConnection(neighbor.coord, edges, board, playerId)) continue;
      }

      const cost = getTerrainCost(neighbor.coord);
      const baseScore = evaluateTrackPosition(state, neighbor.coord, playerId);

      let routeScore = 0;
      if (targetRoute) {
        routeScore = evaluateTrackForRoute(neighbor.coord, targetRoute, board, playerId, edges);
      }

      const totalScore = baseScore + routeScore * 2;
      const valueRatio = totalScore / Math.max(cost, 1);

      // 중복 제거
      const isDuplicate = candidates.some(
        c => hexCoordsEqual(c.coord, neighbor.coord) &&
             c.edges[0] === edges[0] && c.edges[1] === edges[1]
      );

      if (!isDuplicate) {
        candidates.push({
          coord: neighbor.coord,
          edges,
          baseScore,
          routeScore,
          totalScore,
          cost,
          valueRatio,
        });
      }
    }
  };

  if (!hasExistingTrack) {
    // 첫 트랙
    let startCities = board.cities;
    if (targetRoute) {
      const fromCity = board.cities.find(c => c.id === targetRoute.from);
      if (fromCity) startCities = [fromCity];
    }

    for (const city of startCities) {
      const neighbors = getBuildableNeighbors(city.coord, board, playerId);
      for (const neighbor of neighbors) {
        processNeighbor(neighbor, true);
      }
    }
  } else {
    // 후속 트랙
    const connectionPoints = board.trackTiles
      .filter(t => t.owner === playerId)
      .map(t => t.coord);

    for (const point of connectionPoints) {
      if (!isValidConnectionPoint(point, board, playerId)) continue;
      const neighbors = getBuildableNeighbors(point, board, playerId);
      for (const neighbor of neighbors) {
        processNeighbor(neighbor, false);
      }
    }
  }

  return candidates;
}

/**
 * 물품 이동 결정 수집
 */
function collectMoveGoodsDecision(
  state: GameState,
  playerId: PlayerId
): MoveGoodsAnalysis {
  const player = state.players[playerId];
  const engineLevel = player?.engineLevel ?? 1;

  // 라운드 계산 (간단히)
  const round = state.phaseState.moveGoodsRound ?? 1;

  const candidates = collectMoveGoodsCandidates(state, playerId);

  // 점수 정렬
  candidates.sort((a, b) => b.totalScore - a.totalScore);

  let selectedMove: { sourceCityId: string; destinationCityId: string; cubeColor: CubeColor } | null = null;
  let engineUpgrade = false;
  let skipReason: string | undefined;

  if (candidates.length === 0) {
    if (engineLevel < 6) {
      engineUpgrade = true;
    } else {
      skipReason = '이동 가능한 물품 없음';
    }
  } else {
    const best = candidates[0];
    selectedMove = {
      sourceCityId: best.sourceCityId,
      destinationCityId: best.destinationCityId,
      cubeColor: best.cubeColor,
    };
  }

  return {
    round,
    engineLevel,
    candidates: candidates.slice(0, 10), // 상위 10개만
    selectedMove,
    engineUpgrade,
    skipReason,
  };
}

/**
 * 물품 이동 후보 수집
 */
function collectMoveGoodsCandidates(
  state: GameState,
  playerId: PlayerId
): MoveGoodsCandidate[] {
  const { board } = state;
  const player = state.players[playerId];
  const engineLevel = player?.engineLevel ?? 1;
  const currentRoute = getCurrentRoute(playerId);

  const opportunities = analyzeDeliveryOpportunities(state);
  const candidates: MoveGoodsCandidate[] = [];

  const connectedCities = getConnectedCities(state, playerId);
  const playerTracks = board.trackTiles.filter(t => t.owner === playerId);

  for (const opp of opportunities) {
    // 출발 도시에서 시작 가능한지 확인
    if (!connectedCities.includes(opp.sourceCityId) && playerTracks.length > 0) continue;

    // 거리가 엔진 레벨 이내인지 확인 (간단히)
    if (opp.distance > engineLevel) continue;

    const linksCount = opp.distance;
    const baseScore = linksCount * 3;

    // 현재 목표 경로와 일치하면 보너스
    let routeBonus = 0;
    if (currentRoute) {
      if (opp.sourceCityId === currentRoute.from && opp.targetCityId === currentRoute.to) {
        routeBonus = 30;
      } else if (opp.sourceCityId === currentRoute.from || opp.targetCityId === currentRoute.to) {
        routeBonus = 15;
      }
    }

    // 자기 트랙 보너스 (간단히)
    const ownTrackBonus = playerTracks.length > 0 ? baseScore : 0;

    const totalScore = baseScore + routeBonus + ownTrackBonus;

    const sourceCity = board.cities.find(c => c.id === opp.sourceCityId);
    const destCity = board.cities.find(c => c.id === opp.targetCityId);

    candidates.push({
      sourceCityId: opp.sourceCityId,
      sourceCityName: sourceCity?.id ?? opp.sourceCityId,
      destinationCityId: opp.targetCityId,
      destinationCityName: destCity?.id ?? opp.targetCityId,
      cubeColor: opp.cubeColor,
      cubeIndex: opp.cubeIndex,
      linksCount,
      baseScore,
      routeBonus,
      ownTrackBonus,
      totalScore,
    });
  }

  return candidates;
}
