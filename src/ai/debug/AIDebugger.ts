/**
 * AI 디버거 클래스
 *
 * AI의 전략 및 결정 과정을 분석하고 출력합니다.
 */

import { GameState, PlayerId } from '@/types/game';
import {
  AIDebugReport,
  StrategyAnalysisReport,
  PhaseDecisionReport,
  PathAnalysisReport,
  TrackEvaluationReport,
  GameStateSummary,
  OutputFormat,
} from './types';
import { DeliveryRoute } from '../strategy/types';

// 수집기
import { collectStrategyAnalysis } from './collectors/strategyCollector';
import { collectPhaseDecision } from './collectors/phaseCollectors';
import { collectPathAnalysis } from './collectors/pathCollector';
import { collectTrackEvaluations } from './collectors/trackCollector';

// 포맷터
import { formatConsole } from './formatters/consoleFormatter';

/**
 * AI 디버거 싱글톤 클래스
 */
export class AIDebugger {
  private static instance: AIDebugger | null = null;

  private constructor() {
    // 싱글톤
  }

  /**
   * 싱글톤 인스턴스 반환
   */
  static getInstance(): AIDebugger {
    if (!AIDebugger.instance) {
      AIDebugger.instance = new AIDebugger();
    }
    return AIDebugger.instance;
  }

  /**
   * 전체 AI 분석 리포트 생성
   */
  analyze(state: GameState, playerId: PlayerId): AIDebugReport {
    const player = state.players[playerId];

    // 게임 상태 요약
    const gameState: GameStateSummary = {
      turn: state.currentTurn,
      phase: state.currentPhase,
      currentPlayer: state.currentPlayer,
      playerCash: player?.cash ?? 0,
      playerIncome: player?.income ?? 0,
      playerShares: player?.issuedShares ?? 2,
      playerEngineLevel: player?.engineLevel ?? 1,
    };

    // 전략 분석
    const strategyAnalysis = this.analyzeStrategy(state, playerId);

    // Phase별 결정 분석
    const phaseDecision = this.analyzePhaseDecision(state, playerId);

    // 경로 분석
    const pathAnalysis = this.analyzePaths(state, playerId);

    // 트랙 평가 (buildTrack phase에서만)
    let trackEvaluations: TrackEvaluationReport[] | undefined;
    if (state.currentPhase === 'buildTrack' && phaseDecision?.buildTrack?.targetRoute) {
      const candidates = phaseDecision.buildTrack.candidates.slice(0, 5).map(c => ({
        coord: c.coord,
        edges: c.edges,
      }));
      if (candidates.length > 0) {
        trackEvaluations = collectTrackEvaluations(
          state,
          playerId,
          candidates,
          phaseDecision.buildTrack.targetRoute
        );
      }
    }

    return {
      timestamp: Date.now(),
      gameState,
      strategyAnalysis,
      phaseDecision,
      pathAnalysis,
      trackEvaluations,
    };
  }

  /**
   * 전략 분석만 실행
   */
  analyzeStrategy(state: GameState, playerId: PlayerId): StrategyAnalysisReport {
    return collectStrategyAnalysis(state, playerId);
  }

  /**
   * 현재 Phase 결정 분석
   */
  analyzePhaseDecision(state: GameState, playerId: PlayerId): PhaseDecisionReport | undefined {
    return collectPhaseDecision(state, playerId);
  }

  /**
   * 경로 분석
   */
  analyzePaths(state: GameState, playerId: PlayerId): PathAnalysisReport {
    return collectPathAnalysis(state, playerId);
  }

  /**
   * 특정 트랙 후보들의 평가
   */
  analyzeTrackCandidates(
    state: GameState,
    playerId: PlayerId,
    candidates: { coord: { col: number; row: number }; edges: [number, number] }[],
    targetRoute: DeliveryRoute
  ): TrackEvaluationReport[] {
    return collectTrackEvaluations(state, playerId, candidates, targetRoute);
  }

  /**
   * 포맷팅된 출력 문자열 반환
   */
  print(report: AIDebugReport, format: OutputFormat = 'console'): string {
    switch (format) {
      case 'console':
        return formatConsole(report);
      case 'json':
        return JSON.stringify(report, null, 2);
      case 'html':
        // TODO: HTML 포맷터 구현
        return formatConsole(report);
      default:
        return formatConsole(report);
    }
  }

  /**
   * 콘솔에 직접 출력
   */
  log(state: GameState, playerId: PlayerId): void {
    const report = this.analyze(state, playerId);
    console.log(this.print(report, 'console'));
  }

  /**
   * 전략 분석만 콘솔에 출력
   */
  logStrategy(state: GameState, playerId: PlayerId): void {
    const analysis = this.analyzeStrategy(state, playerId);
    const lines: string[] = [];

    lines.push('');
    lines.push('═'.repeat(50));
    lines.push('[전략 분석]');
    lines.push('═'.repeat(50));

    if (analysis.currentStrategy) {
      lines.push(`현재 전략: ${analysis.currentStrategy.nameKo}`);
      lines.push(`실현 가능성: ${analysis.feasibility.score.toFixed(1)}/100`);
    }

    lines.push('');
    lines.push('시나리오 점수:');
    for (const s of analysis.scenarioScores) {
      const marker = analysis.currentStrategy?.name === s.scenarioName ? '>' : ' ';
      lines.push(`  ${marker} ${s.scenarioNameKo}: ${s.totalScore.toFixed(0)}`);
    }

    console.log(lines.join('\n'));
  }

  /**
   * 경로 분석만 콘솔에 출력
   */
  logPaths(state: GameState, playerId: PlayerId): void {
    const analysis = this.analyzePaths(state, playerId);
    const lines: string[] = [];

    lines.push('');
    lines.push('═'.repeat(50));
    lines.push('[경로 분석]');
    lines.push('═'.repeat(50));

    lines.push(`연결된 도시: ${analysis.connectedCities.join(', ') || '없음'}`);
    lines.push(`트랙 수: ${analysis.playerTrackCount}`);

    for (const route of analysis.targetRoutes) {
      const progress = (route.progress * 100).toFixed(0);
      lines.push(`  ${route.from}→${route.to}: ${progress}% ${route.isComplete ? '✅' : ''}`);
    }

    console.log(lines.join('\n'));
  }
}

// 싱글톤 인스턴스 export
export const aiDebugger = AIDebugger.getInstance();

/**
 * 편의 함수: AI 분석 콘솔 출력
 */
export function debugAI(state: GameState, playerId: PlayerId): void {
  aiDebugger.log(state, playerId);
}

/**
 * 편의 함수: AI 분석 리포트 반환
 */
export function getAIReport(state: GameState, playerId: PlayerId): AIDebugReport {
  return aiDebugger.analyze(state, playerId);
}

/**
 * 편의 함수: 전략 분석만 출력
 */
export function debugStrategy(state: GameState, playerId: PlayerId): void {
  aiDebugger.logStrategy(state, playerId);
}

/**
 * 편의 함수: 경로 분석만 출력
 */
export function debugPaths(state: GameState, playerId: PlayerId): void {
  aiDebugger.logPaths(state, playerId);
}
