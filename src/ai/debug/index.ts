/**
 * AI 디버거 엔트리포인트
 *
 * AI 전략 분석 및 디버깅 도구의 메인 엔트리포인트입니다.
 * 개발 모드에서 브라우저 콘솔을 통해 AI 분석에 접근할 수 있습니다.
 */

// 메인 디버거 클래스 및 편의 함수
export {
  AIDebugger,
  aiDebugger,
  debugAI,
  getAIReport,
  debugStrategy,
  debugPaths,
} from './AIDebugger';

// 타입 정의
export type {
  // 전략 분석
  ScenarioScore,
  StrategyFeasibility,
  OpponentAnalysisReport,
  StrategyHistoryEntry,
  StrategyAnalysisReport,

  // Phase별 결정
  IssueSharesDecision,
  AuctionDecisionAnalysis,
  SelectActionAnalysis,
  TrackCandidate,
  BuildTrackAnalysis,
  MoveGoodsCandidate,
  MoveGoodsAnalysis,
  PhaseDecisionReport,

  // 경로 분석
  TargetRouteAnalysis,
  PathAnalysisReport,

  // 트랙 평가
  TrackScoreBreakdown,
  TrackEvaluationReport,

  // 전체 리포트
  GameStateSummary,
  AIDebugReport,
  OutputFormat,
} from './types';

// 수집기
export { collectStrategyAnalysis } from './collectors/strategyCollector';
export { collectPhaseDecision } from './collectors/phaseCollectors';
export { collectPathAnalysis } from './collectors/pathCollector';
export {
  collectTrackEvaluation,
  collectTrackEvaluations,
} from './collectors/trackCollector';

// 포맷터
export { formatConsole } from './formatters/consoleFormatter';

// 개발 모드에서 window 객체에 노출
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  import('./AIDebugger').then(({ aiDebugger, debugAI, getAIReport, debugStrategy, debugPaths }) => {
    (window as unknown as Record<string, unknown>).aiDebugger = aiDebugger;
    (window as unknown as Record<string, unknown>).debugAI = debugAI;
    (window as unknown as Record<string, unknown>).getAIReport = getAIReport;
    (window as unknown as Record<string, unknown>).debugStrategy = debugStrategy;
    (window as unknown as Record<string, unknown>).debugPaths = debugPaths;

    console.log(
      '%c[AI Debugger] 개발 모드에서 AI 디버거가 활성화되었습니다.',
      'color: #d4a853; font-weight: bold;'
    );
    console.log(
      '%c사용법: debugAI(useGameStore.getState(), "player2")',
      'color: #a0a0a0;'
    );
    console.log(
      '%c로그 설정: showDebugConfig() / setDebug("aiEvaluation", true|false)',
      'color: #a0a0a0;'
    );
  });
}
