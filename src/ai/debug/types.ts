/**
 * AI 디버거 타입 정의
 *
 * 전략 분석, Phase별 결정, 경로/트랙 평가를 위한 타입들
 */

import { GamePhase, PlayerId, HexCoord, CubeColor, SpecialAction } from '@/types/game';
import { DeliveryRoute } from '../strategy/types';

// ============================================================================
// 전략 분석 타입
// ============================================================================

/**
 * 시나리오 점수 상세
 */
export interface ScenarioScore {
  scenarioName: string;
  scenarioNameKo: string;
  baseScore: number;
  adjustmentScore: number;  // 상대 분석 조정
  totalScore: number;
  matchingCubes: number;
  cashFeasible: boolean;
  engineFeasible: boolean;
  blockedRouteCount: number;
}

/**
 * 전략 실현 가능성
 */
export interface StrategyFeasibility {
  score: number;  // 0-100
  blockedRoutes: string[];
  noGoodsRoutes: string[];
  cashShortage: number;
}

/**
 * 상대 분석 결과
 */
export interface OpponentAnalysisReport {
  opponentId: PlayerId;
  trackCount: number;
  connectedCities: string[];
  targetCities: string[];
  cityDistances: { cityId: string; distance: number }[];
}

/**
 * 전략 변경 이력
 */
export interface StrategyHistoryEntry {
  turn: number;
  fromStrategy: string;
  toStrategy: string;
  reason: string;
}

/**
 * 전략 분석 리포트
 */
export interface StrategyAnalysisReport {
  playerId: PlayerId;
  playerName: string;
  currentStrategy: {
    name: string;
    nameKo: string;
    targetRoutes: DeliveryRoute[];
  } | null;

  scenarioScores: ScenarioScore[];  // 동적 전략에서는 빈 배열
  feasibility: StrategyFeasibility;
  opponentAnalysis: OpponentAnalysisReport;
  strategyHistory: StrategyHistoryEntry[];
}

// ============================================================================
// Phase별 결정 타입
// ============================================================================

/**
 * 주식 발행 결정 분석
 */
export interface IssueSharesDecision {
  currentCash: number;
  requiredCash: number;
  expectedExpenses: number;
  shortage: number;
  sharesDecided: number;
  maxStrategicShares: number;
  currentShares: number;
}

/**
 * 경매 결정 분석
 */
export interface AuctionDecisionAnalysis {
  currentBid: number;
  maxBid: number;
  cashRatio: number;
  turnOrderPassAvailable: boolean;
  decision: 'bid' | 'pass' | 'skip' | 'complete';
  bidAmount?: number;
}

/**
 * 행동 선택 분석
 */
export interface SelectActionAnalysis {
  availableActions: SpecialAction[];
  preferredByStrategy: SpecialAction[];
  engineLevel: number;
  minEngineLevel: number;
  trackCount: number;
  currentCash: number;
  selectedAction: SpecialAction;
  selectionReason: string;
}

/**
 * 트랙 건설 후보
 */
export interface TrackCandidate {
  coord: HexCoord;
  edges: [number, number];
  baseScore: number;
  routeScore: number;
  totalScore: number;
  cost: number;
  valueRatio: number;  // totalScore / cost
}

/**
 * 트랙 건설 결정 분석
 */
export interface BuildTrackAnalysis {
  targetRoute: DeliveryRoute | null;
  tracksBuiltThisTurn: number;
  maxTracks: number;
  currentCash: number;
  candidates: TrackCandidate[];
  selectedCandidate: {
    coord: HexCoord;
    edges: [number, number];
  } | null;
  skipReason?: string;
}

/**
 * 물품 이동 후보
 */
export interface MoveGoodsCandidate {
  sourceCityId: string;
  sourceCityName: string;
  destinationCityId: string;
  destinationCityName: string;
  cubeColor: CubeColor;
  cubeIndex: number;
  linksCount: number;
  baseScore: number;
  routeBonus: number;
  ownTrackBonus: number;
  totalScore: number;
}

/**
 * 물품 이동 결정 분석
 */
export interface MoveGoodsAnalysis {
  round: number;  // 1 or 2
  engineLevel: number;
  candidates: MoveGoodsCandidate[];
  selectedMove: {
    sourceCityId: string;
    destinationCityId: string;
    cubeColor: CubeColor;
  } | null;
  engineUpgrade: boolean;
  skipReason?: string;
}

/**
 * Phase별 결정 리포트
 */
export interface PhaseDecisionReport {
  phase: GamePhase;
  playerId: PlayerId;
  issueShares?: IssueSharesDecision;
  auction?: AuctionDecisionAnalysis;
  selectAction?: SelectActionAnalysis;
  buildTrack?: BuildTrackAnalysis;
  moveGoods?: MoveGoodsAnalysis;
}

// ============================================================================
// 경로 분석 타입
// ============================================================================

/**
 * 목표 경로 분석
 */
export interface TargetRouteAnalysis {
  from: string;
  to: string;
  priority: number;
  progress: number;  // 0-1
  isComplete: boolean;
  hasMatchingCubes: boolean;
  isBlocked: boolean;
  optimalPath: HexCoord[];
  pathCost: number;
  intermediateCities: string[];
}

/**
 * 경로 분석 리포트
 */
export interface PathAnalysisReport {
  playerId: PlayerId;
  targetRoutes: TargetRouteAnalysis[];
  connectedCities: string[];
  playerTrackCount: number;
}

// ============================================================================
// 트랙 평가 타입
// ============================================================================

/**
 * 트랙 평가 점수 분해
 */
export interface TrackScoreBreakdown {
  onPathBonus: number;           // +100 if on optimal path
  nextBuildBonus: number;        // +50 if next build position
  positionBonus: number;         // +30/+10 for near positions
  edgeTowardsNextBonus: number;  // +80 if edge towards next
  edgeFromPrevBonus: number;     // +40 if edge from prev
  wrongDirectionPenalty: number; // -50 if wrong direction
  adjacentCityBonus: number;     // +25 if adjacent to city
}

/**
 * 트랙 평가 상세 리포트
 */
export interface TrackEvaluationReport {
  coord: HexCoord;
  edges: [number, number];
  targetRoute: DeliveryRoute;

  // 경로상 위치 정보
  isOnOptimalPath: boolean;
  positionOnPath: number;  // -1 if not on path
  lastConnectedPosition: number;
  nextBuildPosition: number;

  // 점수 분해
  scores: TrackScoreBreakdown;

  totalRouteScore: number;
  basePositionScore: number;
  terrainCost: number;
  valueRatio: number;
}

// ============================================================================
// 전체 디버그 리포트
// ============================================================================

/**
 * 게임 상태 요약
 */
export interface GameStateSummary {
  turn: number;
  phase: GamePhase;
  currentPlayer: PlayerId;
  playerCash: number;
  playerIncome: number;
  playerShares: number;
  playerEngineLevel: number;
}

/**
 * 전체 AI 디버그 리포트
 */
export interface AIDebugReport {
  timestamp: number;
  gameState: GameStateSummary;
  strategyAnalysis: StrategyAnalysisReport;
  phaseDecision?: PhaseDecisionReport;
  pathAnalysis: PathAnalysisReport;
  trackEvaluations?: TrackEvaluationReport[];
}

// ============================================================================
// 출력 포맷 타입
// ============================================================================

export type OutputFormat = 'console' | 'json' | 'html';
