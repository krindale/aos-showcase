/**
 * AI 동적 경로 선택 로직
 *
 * 정적 시나리오 대신 실제 화물 배치를 기반으로 최적 배달 경로를 동적으로 선택
 */

import { GameState, PlayerId, CubeColor, HexCoord } from '@/types/game';
import { DeliveryRoute, DeliveryOpportunity } from './types';
import {
  analyzeDeliveryOpportunities,
  getConnectedCities,
  breakRouteIntoSegments,
  getRouteProgress,
  isRouteComplete,
  findOptimalPathAvoidingOpponent,
  findStopById,
  getMainNetworkStopIds,
} from './analyzer';
import { hexDistance, hexCoordsEqual } from '@/utils/hexGrid';
import { getCurrentRoute, getCurrentRouteState, setCurrentRoute, clearCurrentRoutes, getHomeBase, setHomeBase, hasHomeBases } from './state';
import { estimateRouteVP, deliveryDeltaVP } from './vp';
import { getMapAIConfig } from './mapConfig';
import { getMapProfile } from '@/maps/getMapProfile';
import { debugLog } from '@/utils/debugConfig';

/**
 * 정밀 평가(A* 포함) 대상 후보 수 상한
 * 큰 맵에서 기회 조합이 폭발해도 결정당 A* 호출이 O(K)로 유지되도록 가지치기
 */
const PRECISE_EVAL_TOP_K = 8;

/**
 * 영역 편향 가중치 — 경로의 출발 도시가 내 거점에서 멀수록 ΔVP를 깎는다(다인 cityCubes).
 * 각 AI가 자기 영역에 머물러 충돌(boxed-out)을 줄이는 강도. hexDistance(0~15) × 이 값.
 */
const AREA_BIAS_WEIGHT = 1.0;

/** 혼잡 회피 — 출발 지역 근처(거리 < CROWD_RADIUS)에 있는 다른 플레이어 '명 수'만큼 그 경로의
 *  우선순위(점수)를 낮춘다. 가까운 유저가 많을수록 그 지역 점수↓ (거리 가중 없이 카운트, 사용자 지침). */
const CROWD_RADIUS = 5;
const CROWD_WEIGHT = 3.0;

/** 거점 farthest-first의 화면 좌우(row) 분산 가중 — 같은 row에 거점이 몰리지 않게.
 *  측정: W=1 −7.4 / W=3 −3.2(정점). */
const ROW_SPREAD_W = 3.0;

/** 동적색 맵(Korea) 경로 겹침 페널티 — 완전 차단(-Infinity) 대신 감점으로 완화.
 *  Korea는 고립 거점(부산)이 경로 겹침을 안 당해 독점하고 중앙 거점 플레이어는 완전 차단이
 *  누적돼 경로가 고갈된다(player2 승률 74%). 감점으로 바꾸면 중앙 플레이어도 차선 경로를 써
 *  승률 분포가 균등해진다. 다른 cityCubes 맵은 완전 차단 유지(Rust Belt 도시금지 핵심 보존). */
const DYNAMIC_MAP_OVERLAP_PENALTY = 6;

/** 구역(aiHomeBaseGroup)이 목표치를 채웠을 때의 페널티 — minDist/rowGap/cubes 점수를
 *  압도해 구역 간 인원을 사실상 강제로 고르게 분산시킨다(단일 구역만 남으면 페널티 무시하고
 *  그 구역에서 고름 — 배정 자체가 막히지는 않는다). */
const GROUP_OVERFLOW_PENALTY = 1000;

/**
 * 거점(home base) 할당 — 게임 시작 시 1회. 큐브 많은 도시를 farthest-first로 분산 배정
 * (첫 거점=큐브 최다, 이후=기존 거점들에서 최소거리 + row분산 + 큐브수가 최대인 도시).
 * 6구획 그리드 명시 분할은 빈곤 구획 거점이 생겨 악화(-7.54)였음 — 큐브 분포에 적응적인
 * farthest가 사실상 더 나은 '구획 분할'(서로 가장 먼 큐브 도시 5개)이라 최적(-2.28).
 * ⚠️ `noDemand` 도시(달 Moon Base)는 후보에서 제외 — 배달 목적지가 될 수 없는 도시를
 * "거점"으로 잡으면 경로 점수의 방향성 기준으로 무의미하다(달만 해당, 다른 맵엔 noDemand 도시
 * 없음 — 2026-07-21 확인). 맵별 구역 균형(`aiHomeBaseGroup`, 기본 null=구역 없음)은 달의
 * 동/서 반구 몰림(4인 중 2명이 같은 반구에 겹쳐 그 둘만 파산율 4~5배)을 완화한다.
 */
export function assignHomeBases(state: GameState): void {
  const { board } = state;
  const profile = getMapProfile(state.mapId);
  const cubeCities = board.cities
    .filter(c => c.cubes.length > 0 && !c.noDemand)
    .sort((a, b) => b.cubes.length - a.cubes.length);
  if (cubeCities.length === 0) return;

  const groupOf = (c: typeof cubeCities[0]) => profile.aiHomeBaseGroup(c);
  const groupCount = new Map<string, number>();
  const groups = new Set(cubeCities.map(groupOf).filter((g): g is string => g !== null));
  const targetPerGroup = groups.size > 0 ? Math.ceil(state.activePlayers.length / groups.size) : Infinity;

  // 거점 픽 순서 = activePlayers(player-index 고정). 인위적 셔플 없음 — player별 성적으로
  // 편향을 측정·진단하기 위해 고정 유지(셔플하면 player별 통계가 평준화돼 측정 불가).
  const assigned: { id: string; coord: typeof cubeCities[0]['coord'] }[] = [];
  for (const pid of state.activePlayers) {
    let best = null as null | (typeof cubeCities)[0];
    if (assigned.length === 0) {
      best = cubeCities[0];
    } else {
      let bestScore = -Infinity;
      for (const c of cubeCities) {
        if (assigned.some(a => a.id === c.id)) continue;
        const group = groupOf(c);
        const overflowPenalty = (group !== null && (groupCount.get(group) ?? 0) >= targetPerGroup)
          ? GROUP_OVERFLOW_PENALTY : 0;
        const minDist = Math.min(...assigned.map(a => hexDistance(a.coord, c.coord)));
        const minRowGap = Math.min(...assigned.map(a => Math.abs(a.coord.row - c.coord.row)));
        const score = minDist + minRowGap * ROW_SPREAD_W + c.cubes.length * 0.5 - overflowPenalty;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (!best) best = cubeCities.find(c => !assigned.some(a => a.id === c.id)) ?? cubeCities[0];
    }
    setHomeBase(pid, best.id);
    const g = groupOf(best);
    if (g !== null) groupCount.set(g, (groupCount.get(g) ?? 0) + 1);
    assigned.push({ id: best.id, coord: best.coord });
  }
}

/**
 * 사전 점수 (싼 휴리스틱) — 정밀 평가 대상을 추리는 용도
 * 가까울수록, 연결된 도시에서 시작할수록, 엔진 내 거리일수록 우선
 */
function preliminaryScore(
  opp: DeliveryOpportunity,
  engineLevel: number,
  connectedCities: string[],
  myTracks?: { coord: HexCoord }[],
): number {
  let score = -hexDistance(opp.sourceCoord, opp.targetCoord);
  if (connectedCities.includes(opp.sourceCityId)) score += 10;
  // 마을/트랙 큐브 출발('town:'/'track:')은 connectedCities(도시 id)에 안 들어가 +10을 못 받는다.
  // 내 트랙에 인접(픽업 가능)하면 도시 출발처럼 우대 — 안 그러면 마을 큐브 경로가 상위 K에서 밀려
  // 정밀 평가조차 못 받아 영원히 안 잡힌다(Western US 마을 큐브 배달 사장 방지).
  else if (opp.sourceCityId.includes(':') && myTracks?.some(t => hexDistance(t.coord, opp.sourceCoord) <= 1)) {
    score += 10;
  }
  if (opp.distance <= engineLevel) score += 5;
  return score;
}

/**
 * VP 최적 경로 점수 — estimateRouteVP(기대 ΔVP)를 그대로 사용
 * 완성 불가능한 경로는 -Infinity로 원천 배제 (산발 건설 차단)
 */
function scoreOpportunity(
  opp: DeliveryOpportunity,
  state: GameState,
  playerId: PlayerId,
): number {
  const estimate = estimateRouteVP(state, playerId, opp);
  return estimate.deltaVP;
}

/**
 * 게임 시작 시 또는 턴 시작 시 최적 경로 탐색
 *
 * 정적 시나리오 대신 현재 화물 배치를 분석하여 최적 배달 경로 반환
 */
export function getNextTargetRoute(
  state: GameState,
  playerId: PlayerId
): DeliveryRoute | null {
  // 맵 프로파일에 위임 — 표준 맵(도시 큐브)과 헥스큐브 맵(St. Lucia)은
  // selectTargetRoute override로 분기 (if(hexCubeSetup) 분기를 다형성으로 대체)
  return getMapProfile(state.mapId).selectTargetRoute(state, playerId);
}

/**
 * 표준 맵(도시 큐브 배달)의 경로 선택 — StandardMapProfile.selectTargetRoute가 호출
 */
export function selectStandardRoute(
  state: GameState,
  playerId: PlayerId
): DeliveryRoute | null {
  const player = state.players[playerId];
  if (!player) return null;

  // 1. 현재 물품 배치 기반 모든 배달 기회 분석
  const allOpportunities = analyzeDeliveryOpportunities(state);

  // 1.1 이미 완벽히 연결된 경로는 제외 (본인의 선로로 완성된 경우만 제외하도록 하여 미완성 경로 재건축 유도)
  const opportunities = allOpportunities.filter(opp => {
    const route: DeliveryRoute = { from: opp.sourceCityId, to: opp.targetCityId, priority: 1 };
    return !isRouteComplete(state, route, playerId);
  });

  if (opportunities.length === 0) {
    if (allOpportunities.length > 0) {
      debugLog.trackBuilding(`[AI 경로] ${player.name}: 모든 배달 기회가 이미 연결되어 있음`);
    } else {
      debugLog.trackBuilding(`[AI 경로] ${player.name}: 배달 가능한 화물 없음`);
    }
    return findNetworkExpansionTarget(state, playerId);
  }

  // 경로 지속(장거리 완성 대책): 지난 턴에 착수한 미완성 경로가 아직 "완성 가능"하면
  // 새 화물로 갈아타지 말고 그 경로를 끝까지 짓는다. 4-5링크 장거리 경로는 여러 턴이
  // 걸리는데, 매턴 갈아타면 미완성 트랙이 공용화되어 배달(수입)로 이어지지 못한다.
  const prevRoute = getCurrentRoute(playerId);
  if (prevRoute) {
    const prog = getRouteProgress(state, playerId, prevRoute);
    // 진행 중이고 "완성 가능한" 경로면 갈아타지 말고 고수 (완성 불가 경로는 갈아타기 허용 —
    // 무조건 고수는 완성 불가 경로를 끝까지 고집해 오히려 income↓ 측정).
    if (prog > 0 && prog < 1 && !isRouteComplete(state, prevRoute, playerId)) {
      const prevOpp = allOpportunities.find(o => o.sourceCityId === prevRoute.from && o.targetCityId === prevRoute.to);
      if (prevOpp && estimateRouteVP(state, playerId, prevOpp).completable) {
        debugLog.trackBuilding(`[AI 경로] ${player.name}: 진행 중 경로 ${prevRoute.from}→${prevRoute.to} 완성까지 고수`);
        return prevRoute;
      }
    }
  }

  // 2. 연결된 도시 확인
  const connectedCities = getConnectedCities(state, playerId);
  const playerTracks = state.board.trackTiles.filter(t => t.owner === playerId);

  // 3. 가치 기반 정렬 — 사전 점수로 상위 K개만 정밀 평가(A* 포함), ΔVP로 최종 정렬
  const isFirstTurn = state.currentTurn === 1;
  const config = getMapAIConfig(state);

  // 영역 분할(다인 cityCubes): 게임 시작 시 거점 할당, 이후 경로 점수에 거점 거리 편향
  const areaMulti = state.activePlayers.length >= 3 && !config.incomeSources.includes('trackCubes');
  if (areaMulti && !hasHomeBases()) assignHomeBases(state);
  const homeCity = areaMulti
    ? state.board.cities.find(c => c.id === getHomeBase(playerId)) ?? null
    : null;

  const preciseTargets = [...opportunities]
    .sort((a, b) =>
      preliminaryScore(b, player.engineLevel, connectedCities, playerTracks) -
      preliminaryScore(a, player.engineLevel, connectedCities, playerTracks)
    )
    .slice(0, PRECISE_EVAL_TOP_K);

  const allScoredOpps = preciseTargets.map(opp => {
    let score = scoreOpportunity(opp, state, playerId);
    // 내 거점에서 먼 출발 도시의 경로는 깎아 자기 영역에 머물게 (충돌/boxed-out 완화)
    // 단 동적색 맵(Korea)은 거점 묶기를 끈다 — 거점 가치 차이(부산 고립 우위 + 평양 고립으로
    // 인한 긴 건설→현금난)가 승부를 좌우하던 것을 무력화. 각 플레이어가 거점에 묶이지 않고
    // 가까운 좋은 경로를 자유 선택해 승률 분포가 균등해진다(부산/평양 거점 운빨 제거).
    if (homeCity && score > -Infinity && !state.board.dynamicCityColors) {
      score -= hexDistance(opp.sourceCoord, homeCity.coord) * AREA_BIAS_WEIGHT;
    }
    // ★ 혼잡 회피: 출발 지역 근처에 있는 다른 플레이어 '명 수'만큼 그 경로 우선순위를 낮춘다
    //   (가까운 유저 많을수록 그 지역 점수↓, 거리 가중 없음 — 사용자 지침). 다인 cityCubes만.
    if (areaMulti && score > -Infinity) {
      let nearby = 0;
      for (const oid of state.activePlayers) {
        if (oid === playerId) continue;
        const refs: HexCoord[] = [];
        const oh = state.board.cities.find(c => c.id === getHomeBase(oid));
        if (oh) refs.push(oh.coord);
        const orr = getCurrentRoute(oid);
        if (orr) {
          const oc = state.board.cities.find(c => c.id === orr.from);
          if (oc) refs.push(oc.coord);
        }
        if (refs.some(rc => hexDistance(opp.sourceCoord, rc) < CROWD_RADIUS)) nearby++;
      }
      score -= nearby * CROWD_WEIGHT;
    }
    // ★ 타 플레이어가 이미 잡은 경로의 도시를 출발/도착으로 쓰는 경로 금지 (사용자 지침, 매 턴) —
    //   순차 결정에서 앞 AI가 쓴 도시를 피해 각자 다른 도시에서 시작/도착하게 분산. 이번 세션 최대
    //   효과(VP −2.28→+2.95, 첫 양수). 전부 금지 시 하단 opportunities[0] fallback (빈 위험 없음).
    if (areaMulti && score > -Infinity) {
      // 단일 허브 맵(달) 완화 훅: "도시 하나만 공유"는 차단 대신 감점 (기본 null = 기존 동작).
      // 완전 차단은 허브 출발 기회가 몰린 맵에서 뒷순번의 top-K 후보를 전멸시켜 fallback이
      // 겹침·평가를 무시한 경로를 커밋하게 했다(2026-07-21 달 30시드 계측). 정확히 같은
      // 연결(from-to 쌍, 방향 무시)은 훅과 무관하게 완전 차단 유지 — 중복 부설 경쟁 방지.
      const sharedCityPenalty = getMapProfile(state.mapId).aiRouteOverlapSharedCityPenalty;
      for (const oid of state.activePlayers) {
        if (oid === playerId) continue;
        const orr = getCurrentRoute(oid);
        if (!orr) continue;
        const sharesCity = orr.from === opp.sourceCityId || orr.to === opp.sourceCityId ||
                           orr.from === opp.targetCityId || orr.to === opp.targetCityId;
        if (!sharesCity) continue;
        const sameLink = (orr.from === opp.sourceCityId && orr.to === opp.targetCityId) ||
                         (orr.from === opp.targetCityId && orr.to === opp.sourceCityId);
        if (sharedCityPenalty !== null && !sameLink) {
          score -= sharedCityPenalty;
        // 동적색 맵(Korea)은 완전 차단 대신 감점 — 중앙 거점 플레이어의 경로 고갈을 막아
        // 승률 분포를 균등화(부산 고립 거점 독점 완화). 그 외 맵은 완전 차단 유지.
        } else if (state.board.dynamicCityColors) { score -= DYNAMIC_MAP_OVERLAP_PENALTY; }
        else { score = -Infinity; break; }
      }
    }
    return { opp, score };
  });
  // -Infinity(완성 불가능)를 정렬 전에 제거 — (-Inf) - (-Inf) = NaN 비교로 정렬이 깨지는 것 방지
  const scoredOpps = allScoredOpps.filter(s => s.score > -Infinity);
  scoredOpps.sort((a, b) => b.score - a.score);

  // 상위 5개 후보 로그
  const opponents = state.activePlayers.filter(id => id !== playerId);
  const oppRoutes = opponents.map(id => ({ id, route: getCurrentRoute(id) }));
  debugLog.trackBuilding(`[AI 경로선택] ${player.name} Turn ${state.currentTurn}: 상대 경로=${oppRoutes.map(r => r.route ? `${r.id}:${r.route.from}→${r.route.to}` : `${r.id}:없음`).join(', ')} (완성 불가 제외 ${allScoredOpps.length - scoredOpps.length}건)`);
  for (const { opp, score } of scoredOpps.slice(0, 5)) {
    debugLog.trackBuilding(`  ${opp.sourceCityId}→${opp.targetCityId} (${opp.cubeColor}, 거리${opp.distance}) ΔVP=${score.toFixed(1)}`);
  }

  const viableOpps = scoredOpps.map(s => s.opp);

  // 4. 도달 가능 경로 필터
  // 첫 턴: 엔진 레벨까지만 허용 (이번 턴 즉시 배달 가능한 경로만)
  // 이후: 엔진 상한까지 (estimateRouteVP가 엔진 상한 초과 경로를 이미 배제)
  const maxDistance = isFirstTurn
    ? player.engineLevel
    : config.engineMax;

  const reachableOpportunities = viableOpps.filter(opp => {
    return opp.distance <= maxDistance;
  });

  if (reachableOpportunities.length === 0) {
    debugLog.trackBuilding(`[AI 경로] ${player.name}: 엔진 레벨(${player.engineLevel}) 내 도달 가능 경로 없음`);
    // 가장 가치 높은 기회 선택 (엔진 업그레이드 필요)
    const best = viableOpps[0] ?? opportunities[0];
    const route: DeliveryRoute = {
      from: best.sourceCityId,
      to: best.targetCityId,
      priority: 1,
    };
    debugLog.trackBuilding(`[AI 경로] ${player.name}: ${best.sourceCityId}→${best.targetCityId} (${best.cubeColor} 화물, 거리 ${best.distance}, 엔진 업그레이드 필요)`);
    setCurrentRoute(playerId, route);
    return route;
  }

  // 5. 연결된 도시에서 시작하는 경로 우선
  for (const opp of reachableOpportunities) {
    if (connectedCities.includes(opp.sourceCityId)) {
      const route: DeliveryRoute = {
        from: opp.sourceCityId,
        to: opp.targetCityId,
        priority: 1,
      };

      // 다중 링크 경로인 경우 세그먼트로 분해
      const segments = breakRouteIntoSegments(route, state.board);
      if (segments.length > 1) {
        // 정방향: 연결된 도시에서 시작하는 미완성 세그먼트
        for (const segment of segments) {
          const segmentProgress = getRouteProgress(state, playerId, segment);
          if (segmentProgress < 1.0 && connectedCities.includes(segment.from)) {
            segment.overallTo = route.to; // 전체 경로의 최종 목적지 보존
            debugLog.trackBuilding(`[AI 경로] ${player.name}: ${segment.from}→${segment.to} (${opp.cubeColor} 화물, 세그먼트, 최종→${route.to})`);
            setCurrentRoute(playerId, segment);
            return segment;
          }
        }
      }

      debugLog.trackBuilding(`[AI 경로] ${player.name}: ${opp.sourceCityId}→${opp.targetCityId} (${opp.cubeColor} 화물, 거리 ${opp.distance})`);
      setCurrentRoute(playerId, route);
      return route;
    }
  }

  // 6. 연결된 도시가 없는 경우 (첫 트랙 건설 또는 새 경로)
  // 가장 가까운 경로 선택
  const best = reachableOpportunities[0];
  const route: DeliveryRoute = {
    from: best.sourceCityId,
    to: best.targetCityId,
    priority: 1,
  };

  // 다중 링크 경로 분해
  const segments = breakRouteIntoSegments(route, state.board);
  if (segments.length > 1) {
    // 첫 트랙이면 첫 번째 세그먼트 반환
    if (playerTracks.length === 0) {
      segments[0].overallTo = route.to; // 전체 경로의 최종 목적지 보존
      debugLog.trackBuilding(`[AI 경로] ${player.name}: ${segments[0].from}→${segments[0].to} (${best.cubeColor} 화물, 첫 세그먼트, 최종→${route.to})`);
      setCurrentRoute(playerId, segments[0]);
      return segments[0];
    }

    // 미완성 세그먼트 중 첫 번째
    for (const segment of segments) {
      const segmentProgress = getRouteProgress(state, playerId, segment);
      if (segmentProgress < 1.0) {
        segment.overallTo = route.to; // 전체 경로의 최종 목적지 보존
        debugLog.trackBuilding(`[AI 경로] ${player.name}: ${segment.from}→${segment.to} (${best.cubeColor} 화물, 미완성 세그먼트, 최종→${route.to})`);
        setCurrentRoute(playerId, segment);
        return segment;
      }
    }
  }

  debugLog.trackBuilding(`[AI 경로] ${player.name}: ${best.sourceCityId}→${best.targetCityId} (${best.cubeColor} 화물, 거리 ${best.distance})`);
  setCurrentRoute(playerId, route);
  return route;
}

/**
 * 배달 기회가 없을 때 네트워크 확장 타겟 찾기
 *
 * 가장 가까운 도시를 향해 트랙 확장
 */
function findNetworkExpansionTarget(
  state: GameState,
  playerId: PlayerId
): DeliveryRoute | null {
  const { board } = state;
  const player = state.players[playerId];
  if (!player) return null;

  const connectedCities = getConnectedCities(state, playerId);

  // 연결되지 않은 도시 중 가장 가까운 것 선택
  const unconnectedCities = board.cities.filter(
    city => !connectedCities.includes(city.id)
  );

  if (unconnectedCities.length === 0) {
    debugLog.trackBuilding(`[AI 경로] ${player.name}: 모든 도시 연결됨, 네트워크 확장 불필요`);
    return null;
  }

  // 플레이어 트랙과 가장 가까운 미연결 도시 찾기
  const playerTracks = board.trackTiles.filter(t => t.owner === playerId);

  // 거리 < 2(변을 공유하는 인접 도시)는 사이 헥스가 없어 일반 트랙으로 이을 수 없다
  // (직결 링크는 사람 전용) — 목표로 잡으면 건설이 항상 실패한다. buildTrack.ts의
  // findNetworkExpansionTarget과 동일한 필터 (코드리뷰: 한쪽만 고쳐져 있던 것 통일).
  if (playerTracks.length === 0) {
    // 첫 트랙: 아무 도시에서 시작
    const firstCity = board.cities[0];
    const buildable = unconnectedCities.filter(c => hexDistance(firstCity.coord, c.coord) >= 2);
    if (buildable.length === 0) return null;
    const nearestCity = buildable.reduce((nearest, city) => {
      const dist = hexDistance(firstCity.coord, city.coord);
      const nearestDist = hexDistance(firstCity.coord, nearest.coord);
      return dist < nearestDist ? city : nearest;
    }, buildable[0]);

    const route: DeliveryRoute = {
      from: firstCity.id,
      to: nearestCity.id,
      priority: 2,
    };
    debugLog.trackBuilding(`[AI 경로] ${player.name}: 네트워크 확장 ${route.from}→${route.to}`);
    setCurrentRoute(playerId, route);
    return route;
  }

  // 가장 가까운 연결된 도시(출발지) 찾기 — 출발지와 인접(거리<2)한 목적지는 건설 불가라 제외
  const nearestConnected = board.cities.find(c => connectedCities.includes(c.id));
  if (!nearestConnected) return null;

  // 현재 트랙에서 가장 가까운 (건설 가능한) 미연결 도시 찾기
  let nearestCity: typeof unconnectedCities[number] | null = null;
  let minDistance = Infinity;

  for (const city of unconnectedCities) {
    if (hexDistance(nearestConnected.coord, city.coord) < 2) continue; // 인접 도시: 사이 헥스 없음
    for (const track of playerTracks) {
      const dist = hexDistance(track.coord, city.coord);
      if (dist < minDistance) {
        minDistance = dist;
        nearestCity = city;
      }
    }
  }
  if (!nearestCity) return null;

  const route: DeliveryRoute = {
    from: nearestConnected.id,
    to: nearestCity.id,
    priority: 2,
  };
  debugLog.trackBuilding(`[AI 경로] ${player.name}: 네트워크 확장 ${route.from}→${route.to}`);
  setCurrentRoute(playerId, route);
  return route;
}

/**
 * 전략 재평가 (매 턴 호출)
 *
 * 단순화: 현재 경로가 아직 유효한지만 확인하고, 필요시 새 경로 탐색
 */
export function reevaluateStrategy(
  state: GameState,
  playerId: PlayerId
): void {
  const currentRoute = getCurrentRoute(playerId);
  const player = state.players[playerId];
  if (!player) return;

  // 현재 경로가 없으면 새 경로 탐색
  if (!currentRoute) {
    getNextTargetRoute(state, playerId);
    return;
  }

  // 현재 경로가 완성되었으면 새 경로 탐색
  const progress = getRouteProgress(state, playerId, currentRoute);
  if (progress >= 1.0) {
    debugLog.trackBuilding(`[AI 경로] ${player.name}: 경로 ${currentRoute.from}→${currentRoute.to} 완성됨, 새 경로 탐색`);
    getNextTargetRoute(state, playerId);
    return;
  }

  // 현재 경로에 화물이 없어졌으면 새 경로 탐색
  // 세그먼트인 경우 전체 경로의 최종 목적지도 확인
  const opportunities = analyzeDeliveryOpportunities(state);
  const finalTo = currentRoute.overallTo || currentRoute.to;
  const hasMatchingCargo = opportunities.some(
    opp => opp.sourceCityId === currentRoute.from &&
      (opp.targetCityId === currentRoute.to || opp.targetCityId === finalTo)
  );

  if (!hasMatchingCargo) {
    // 투자 이력이 2개 이상이면 경로 유지 (물품 성장 대기)
    const routeState = getCurrentRouteState(playerId);
    const investedCount = routeState?.investedTrackCount ?? 0;

    if (investedCount >= 2) {
      debugLog.trackBuilding(`[AI 경로] ${player.name}: 경로 ${currentRoute.from}→${currentRoute.to} (최종→${finalTo})에 화물 없지만 투자 이력(${investedCount})으로 유지`);
      return; // 경로 유지
    }

    debugLog.trackBuilding(`[AI 경로] ${player.name}: 경로 ${currentRoute.from}→${currentRoute.to} (최종→${finalTo})에 화물 없음, 새 경로 탐색`);
    getNextTargetRoute(state, playerId);
    return;
  }

  // 현재 경로 유지
  debugLog.trackBuilding(`[AI 경로] ${player.name}: 현재 경로 ${currentRoute.from}→${currentRoute.to} 유지 (진행도: ${(progress * 100).toFixed(0)}%)`);
}

/**
 * 초기 전략 선택 (게임 시작 시) - 호환성 유지용
 *
 * @deprecated getNextTargetRoute 사용 권장
 */
export function selectInitialStrategy(
  state: GameState,
  playerId: PlayerId
): { name: string; nameKo: string; targetRoutes: DeliveryRoute[] } {
  const route = getNextTargetRoute(state, playerId);

  return {
    name: 'dynamic_cargo_based',
    nameKo: '화물 기반 동적 전략',
    targetRoutes: route ? [route] : [],
  };
}

/**
 * 순수 함수: 다음 목표 경로 탐색 (전략 변경 없음) - 호환성 유지용
 */
export function findNextTargetRoute(
  state: GameState,
  playerId: PlayerId
): { route: DeliveryRoute | null; needsStrategyReeval: boolean; reason?: string } {
  const route = getNextTargetRoute(state, playerId);

  if (route) {
    return { route, needsStrategyReeval: false };
  }

  return { route: null, needsStrategyReeval: true, reason: 'no_cargo_opportunities' };
}

/**
 * 경로 우선순위 조정 - 호환성 유지용 (no-op)
 */
export function adjustRoutePriorities(
  _state: GameState,
  _playerId: PlayerId,
  _strategy: { targetRoutes: DeliveryRoute[] }
): void {
  // 동적 전략에서는 매번 새로 계산하므로 조정 불필요
  void _state; void _playerId; void _strategy;
}

/**
 * 전략 상태 초기화
 */
export function resetStrategyState(): void {
  clearCurrentRoutes();
}

/**
 * 상위 N개 우선순위 경로 반환
 *
 * 경로 실패 시 대체 경로 탐색에 사용
 */
export function getTopPriorityRoutes(
  state: GameState,
  playerId: PlayerId,
  count: number = 5
): DeliveryRoute[] {
  // 맵 프로파일에 위임 (표준 vs 헥스큐브 다형성)
  return getMapProfile(state.mapId).selectTopRoutes(state, playerId, count);
}

/**
 * 표준 맵의 상위 우선순위 경로 후보 — StandardMapProfile.selectTopRoutes가 호출
 */
export function selectStandardTopRoutes(
  state: GameState,
  playerId: PlayerId,
  count: number = 5
): DeliveryRoute[] {
  const player = state.players[playerId];
  if (!player) return [];

  const allOpportunities = analyzeDeliveryOpportunities(state);
  const connectedCities = getConnectedCities(state, playerId);
  const playerTracks = state.board.trackTiles.filter(t => t.owner === playerId);

  // 사전 점수 상위 K개만 정밀 평가 (큰 맵 가지치기)
  const preciseTargets = [...allOpportunities]
    .sort((a, b) =>
      preliminaryScore(b, player.engineLevel, connectedCities, playerTracks) -
      preliminaryScore(a, player.engineLevel, connectedCities, playerTracks)
    )
    .slice(0, PRECISE_EVAL_TOP_K);

  const scored = preciseTargets.map(opp => {
    const route: DeliveryRoute = { from: opp.sourceCityId, to: opp.targetCityId, priority: 1 };

    if (isRouteComplete(state, route, playerId)) {
      return { route, score: -Infinity };
    }

    const score = scoreOpportunity(opp, state, playerId);
    return { route, score };
  });

  return scored
    .filter(s => s.score > -Infinity)
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(s => s.route);
}


// ============================================================
// 헥스 큐브 맵 (St. Lucia) 전용 경로 선택
// ============================================================

/**
 * 헥스 큐브 맵의 건설 경로 선택
 *
 * 전략: stop(도시/마을) 쌍을 잇는 경로를 평가해 한 경로를 고른다.
 *  맵 income 원천(헥스 큐브 수집 → 같은색 도시 배달)을 반영:
 *   · 경로상 수집될 큐브 중 **같은색 도시로 배달 가능한 것**은 실제 배달 ΔVP(deliveryDeltaVP)로 평가 — 실현 income.
 *   · 배달처(같은색 도시)가 아직 없는 큐브는 수집 유도 휴리스틱(×3)으로 — 도시화 전 네트워크/재료 확보.
 *  (구현은 "배달 가능 큐브만 ΔVP로 업그레이드 + 나머지는 기존 수집 휴리스틱 보존" 하이브리드:
 *   도시화 전 초반엔 큐브 수집·네트워크 구축을 그대로 유도해 자금난·파산을 피하고,
 *   도시가 생기면 그 색 큐브 배달 경로를 ΔVP로 강하게 우선해 실제 수입을 만든다.)
 */
export function getHexCubeMapRoute(
  state: GameState,
  playerId: PlayerId
): DeliveryRoute | null {
  const { board } = state;
  const player = state.players[playerId];
  if (!player) return null;
  const config = getMapAIConfig(state);

  // stop 목록: 도시 + 도시화 안 된 마을
  const stops: { id: string; coord: { col: number; row: number }; isCity: boolean }[] = [
    ...board.cities.map(c => ({ id: c.id, coord: c.coord, isCity: true })),
    ...board.towns.filter(t => !t.newCityColor).map(t => ({ id: t.id, coord: t.coord, isCity: false })),
  ];
  if (stops.length < 2) return null;

  const connectedCities = getConnectedCities(state, playerId);
  const myTracks = board.trackTiles.filter(t => t.owner === playerId || t.secondaryOwner === playerId);
  const hasNetwork = myTracks.length > 0;
  const oppTracks = board.trackTiles.filter(t =>
    (t.owner !== null && t.owner !== playerId) || (t.secondaryOwner != null && t.secondaryOwner !== playerId));

  // 상대가 "지금 노리는" 화물 회피 — 상대의 현재 목표 경로(A* 경로) 위 좌표 집합.
  // 두 AI가 같은 큐브를 동시에 노리면 한쪽이 굶으므로, 상대 타겟 경로의 큐브는 경합으로 처리해 분담.
  const oppPathKeys = new Set<string>();
  for (const oppId of state.activePlayers) {
    if (oppId === playerId) continue;
    const oppRoute = getCurrentRoute(oppId);
    if (!oppRoute) continue;
    const f = findStopById(board, oppRoute.from);
    const t = findStopById(board, oppRoute.to);
    if (!f || !t) continue;
    for (const c of findOptimalPathAvoidingOpponent(f.coord, t.coord, board, oppId)) {
      oppPathKeys.add(`${c.col},${c.row}`);
    }
  }

  // ★ 메인 라인(가장 큰 연결 컴포넌트)에서만 확장 — 도시별 토막 금지, 하나의 라인을 계속 이어 짓는다.
  const networkStopIds = getMainNetworkStopIds(board, playerId) ?? new Set<string>(connectedCities);

  // 후보 쌍: 거리 1~6
  type Cand = { from: typeof stops[0]; to: typeof stops[0]; prelim: number };
  const candidates: Cand[] = [];
  for (const from of stops) {
    // 네트워크가 있으면 from은 반드시 내 연결망 frontier여야 함 — 분산된 토막 건설 차단
    if (hasNetwork && !networkStopIds.has(from.id)) continue;
    for (const to of stops) {
      if (from.id === to.id) continue;
      const d = hexDistance(from.coord, to.coord);
      if (d < 1 || d > 6) continue; // 깊은 체인 허용 (엔진 성장 전제)
      // 이미 내 트랙으로 완성된 경로는 제외
      if (isRouteComplete(state, { from: from.id, to: to.id, priority: 1 }, playerId)) continue;

      // 깊은 확장 선호: 짧은 경로 페널티 대신, 먼 stop으로 뻗어 하나의 긴 철도를 만든다.
      let prelim = d;                                     // 멀수록(깊을수록) 우선
      if (to.isCity || from.isCity) prelim += 4;          // 배달 목적지 연결
      if (networkStopIds.has(from.id)) prelim += 6;       // 내 연결망에서 확장 (강하게)
      candidates.push({ from, to, prelim });
    }
  }
  if (candidates.length === 0) return null;

  // 사전 점수 상위 K개만 A*로 정밀 평가 (경로상 헥스 큐브 수)
  candidates.sort((a, b) => b.prelim - a.prelim);
  const K = 8;
  let best: { route: DeliveryRoute; score: number } | null = null;

  for (const cand of candidates.slice(0, K)) {
    // preferTowns: 경로가 마을을 경유하도록 — 화물이 마을(링크 경계)을 여러 개 지나 4-5링크 배달
    const path = findOptimalPathAvoidingOpponent(cand.from.coord, cand.to.coord, board, playerId, undefined, true);
    if (path.length < 2) continue;

    // 이 경로/내 연결망이 닿는 도시 색 = 수집 큐브를 배달할 수 있는 목적지 색 집합
    const reachableColors = new Set<CubeColor>();
    for (const s of [cand.from, cand.to]) {
      if (s.isCity) { const c = board.cities.find(cc => cc.id === s.id); if (c) reachableColors.add(c.color); }
    }
    for (const cid of connectedCities) {
      const c = board.cities.find(cc => cc.id === cid); if (c) reachableColors.add(c.color);
    }

    let deliverable = 0; // 같은색 도시로 배달 가능한 수집 큐브 (실현 income)
    let potential = 0;   // 배달처 미정 수집 큐브 (수집 유도)
    let unbuilt = 0;
    let contested = 0;   // 상대 트랙에 가까운(경합) 큐브 — 뺏길 위험 → 분산 유도
    let depthBonus = 0;  // 큐브 배달 깊이(매칭색 도시까지 거리) — 깊을수록 4-5링크 배달 → 강하게 우대
    for (const coord of path) {
      const hex = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
      if (hex?.cube) {
        if (reachableColors.has(hex.cube)) {
          deliverable++;
          // ★ 사용자 핵심: 매칭색 도시에서 "멀리 떨어진" 큐브를 노려야 4-5링크 배달이 나온다.
          // 큐브→가장 가까운 매칭색 도시 거리(링크 근사, engineMax로 캡)를 깊이로 환산해 가산.
          let minMatchCityDist = Infinity;
          for (const c of board.cities) {
            if (c.color === hex.cube) minMatchCityDist = Math.min(minMatchCityDist, hexDistance(coord, c.coord));
          }
          if (minMatchCityDist < Infinity) depthBonus += Math.min(minMatchCityDist, config.engineMax);
        } else potential++;
        // 경합 판정: 상대 트랙이 가깝거나(이미 지음), 상대의 현재 목표 경로 위에 있으면(지금 노림)
        // → 뺏길 위험 → 분산 유도. 같은 큐브 두고 싸우다 한쪽이 굶는 것을 방지.
        const onOppPath = oppPathKeys.has(`${coord.col},${coord.row}`);
        if (onOppPath || oppTracks.some(t => hexDistance(t.coord, coord) <= 2)) contested++;
      }
      const hasTrack = board.trackTiles.some(t => hexCoordsEqual(t.coord, coord));
      const isCityHex = board.cities.some(c => hexCoordsEqual(c.coord, coord));
      if (!hasTrack && !isCityHex) unbuilt++;
    }
    if (unbuilt === 0) continue; // 지을 게 없음

    // 배달 가능 큐브 1개당 실제 배달 ΔVP (수집→같은색 도시). cubes×3의 '3'을 실제 income 가치로 대체.
    const links = Math.max(1, Math.min(hexDistance(cand.from.coord, cand.to.coord), config.engineMax));
    const perDeliveryVP = Math.max(0, deliveryDeltaVP(state, playerId, links, 0));

    // 수익(income) 최우선: 실제 같은색 도시로 배달 가능한 큐브를 강하게 우대.
    // 배달처가 없는 큐브(potential) 수집은 income으로 실현 안 되므로 약하게만(수집 유도 정도).
    // 목적지가 도시(배달처)면 큰 보너스 — 그래야 수집 큐브가 실제 income이 된다.
    const endsAtCity = cand.to.isCity || cand.from.isCity;
    const routeDist = hexDistance(cand.from.coord, cand.to.coord);
    const score =
      deliverable * perDeliveryVP * 2                        // 실현 income 최우선 (가중 ↑)
      + depthBonus * 3.5                                     // ★ 깊은 큐브(매칭색 도시에서 먼) 우선 = 4-5링크 배달 (강화)
      + routeDist * 2                                        // 라인 연장 — 멀리 뻗어 체인을 길게(4-5링크 깊이)
      + potential * 0.75                                     // 배달처 미정 큐브 = 약한 수집 유도
      + (endsAtCity ? 6 : 0)                                 // 배달 목적지(도시) 연결 = income 실현 전제
      + (deliverable > 0 && endsAtCity ? 4 : 0)              // 수집+배달처 동시 = 완결 배달 경로 보너스
      + (networkStopIds.has(cand.from.id) ? 8 : 0)           // 내 연결망에서 확장 (하나의 철도)
      - contested * 2                                        // 상대와 경합하는 큐브 회피 → 비경합 큐브로 분산
      - unbuilt * 0.25;                                      // 건설 부담은 가볍게

    if (!best || score > best.score) {
      best = { route: { from: cand.from.id, to: cand.to.id, priority: 1 }, score };
    }
  }

  if (best) {
    debugLog.trackBuilding(`[AI 경로/헥스큐브] ${player.name}: ${best.route.from}→${best.route.to} (점수 ${best.score})`);
    return best.route;
  }
  return null;
}
