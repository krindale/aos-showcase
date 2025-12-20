/**
 * 콘솔 출력 포맷터
 *
 * AIDebugReport를 가독성 높은 콘솔 출력으로 변환합니다.
 */

import {
  AIDebugReport,
  StrategyAnalysisReport,
  PhaseDecisionReport,
  PathAnalysisReport,
  TrackEvaluationReport,
} from '../types';

/**
 * 전체 리포트를 콘솔 문자열로 포맷팅
 */
export function formatConsole(report: AIDebugReport): string {
  const lines: string[] = [];

  // 헤더
  lines.push('');
  lines.push('═'.repeat(70));
  lines.push(`[AI DEBUG] Turn ${report.gameState.turn} | Phase: ${report.gameState.phase} | Player: ${report.gameState.currentPlayer}`);
  lines.push(`  Cash: $${report.gameState.playerCash} | Income: ${report.gameState.playerIncome} | Shares: ${report.gameState.playerShares} | Engine: ${report.gameState.playerEngineLevel}`);
  lines.push('═'.repeat(70));

  // 전략 분석
  lines.push(...formatStrategySection(report.strategyAnalysis));

  // Phase 결정
  if (report.phaseDecision) {
    lines.push(...formatPhaseDecisionSection(report.phaseDecision));
  }

  // 경로 분석
  lines.push(...formatPathSection(report.pathAnalysis));

  // 트랙 평가 (buildTrack phase만)
  if (report.trackEvaluations && report.trackEvaluations.length > 0) {
    lines.push(...formatTrackEvaluationSection(report.trackEvaluations));
  }

  lines.push('═'.repeat(70));
  lines.push('');

  return lines.join('\n');
}

/**
 * 전략 분석 섹션 포맷팅
 */
function formatStrategySection(analysis: StrategyAnalysisReport): string[] {
  const lines: string[] = [];

  lines.push('');
  lines.push('[전략 분석]');
  lines.push('─'.repeat(50));

  // 현재 전략
  if (analysis.currentStrategy) {
    lines.push(`현재 전략: ${analysis.currentStrategy.nameKo} (${analysis.currentStrategy.name})`);
    if (analysis.currentStrategy.targetRoutes.length > 0) {
      const routes = analysis.currentStrategy.targetRoutes
        .map(r => `${r.from}→${r.to}`)
        .join(', ');
      lines.push(`  목표 경로: ${routes}`);
    }
    lines.push(`  실현 가능성: ${analysis.feasibility.score.toFixed(1)}/100`);

    if (analysis.feasibility.blockedRoutes.length > 0) {
      lines.push(`  ⚠️ 차단된 경로: ${analysis.feasibility.blockedRoutes.join(', ')}`);
    }
    if (analysis.feasibility.noGoodsRoutes.length > 0) {
      lines.push(`  ⚠️ 물품 없는 경로: ${analysis.feasibility.noGoodsRoutes.join(', ')}`);
    }
  } else {
    lines.push('❌ 전략 없음');
  }

  // 시나리오 비교 테이블
  lines.push('');
  lines.push('시나리오 점수 비교:');
  lines.push('  ┌' + '─'.repeat(68) + '┐');
  lines.push('  │ 시나리오         │ 기본  │ 조정  │ 총점  │ 물품 │ 자금 │ 엔진 │ 차단 │');
  lines.push('  ├' + '─'.repeat(68) + '┤');

  for (const scenario of analysis.scenarioScores) {
    const isSelected = analysis.currentStrategy?.name === scenario.scenarioName;
    const prefix = isSelected ? '> ' : '  ';

    const name = scenario.scenarioNameKo.padEnd(14);
    const base = scenario.baseScore.toFixed(0).padStart(5);
    const adj = (scenario.adjustmentScore >= 0 ? '+' : '') + scenario.adjustmentScore.toString().padStart(4);
    const total = scenario.totalScore.toFixed(0).padStart(5);
    const cubes = scenario.matchingCubes.toString().padStart(3);
    const cash = scenario.cashFeasible ? '  O ' : '  X ';
    const engine = scenario.engineFeasible ? '  O ' : '  X ';
    const blocked = scenario.blockedRouteCount.toString().padStart(3);

    lines.push(`  │${prefix}${name} │ ${base} │ ${adj} │ ${total} │ ${cubes}  │${cash}│${engine}│ ${blocked}  │`);
  }
  lines.push('  └' + '─'.repeat(68) + '┘');

  // 상대 분석
  lines.push('');
  lines.push('상대 분석:');
  lines.push(`  트랙 수: ${analysis.opponentAnalysis.trackCount}`);
  lines.push(`  연결된 도시: ${analysis.opponentAnalysis.connectedCities.join(', ') || '없음'}`);
  lines.push(`  목표 추정 도시: ${analysis.opponentAnalysis.targetCities.join(', ') || '없음'}`);

  return lines;
}

/**
 * Phase 결정 섹션 포맷팅
 */
function formatPhaseDecisionSection(decision: PhaseDecisionReport): string[] {
  const lines: string[] = [];

  lines.push('');
  lines.push(`[Phase 결정: ${decision.phase}]`);
  lines.push('─'.repeat(50));

  // Issue Shares
  if (decision.issueShares) {
    const d = decision.issueShares;
    lines.push(`현재 현금: $${d.currentCash}`);
    lines.push(`필요 자금: $${d.requiredCash}`);
    lines.push(`예상 비용: $${d.expectedExpenses} (주식 ${d.currentShares}장 + 엔진)`);
    lines.push(`부족액: $${d.shortage}`);
    lines.push(`결정: ${d.sharesDecided}주 발행 (최대 전략 허용: ${d.maxStrategicShares}주)`);
  }

  // Auction
  if (decision.auction) {
    const d = decision.auction;
    lines.push(`현재 입찰가: $${d.currentBid}`);
    lines.push(`최대 입찰 한도: $${d.maxBid} (현금의 30%)`);
    lines.push(`Turn Order 패스: ${d.turnOrderPassAvailable ? '사용 가능' : '없음'}`);
    lines.push(`결정: ${d.decision}${d.bidAmount ? ` ($${d.bidAmount})` : ''}`);
  }

  // Select Actions
  if (decision.selectAction) {
    const d = decision.selectAction;
    lines.push(`엔진 레벨: ${d.engineLevel} (최소 요구: ${d.minEngineLevel})`);
    lines.push(`현재 현금: $${d.currentCash}`);
    lines.push(`트랙 수: ${d.trackCount}`);
    lines.push(`사용 가능 행동: ${d.availableActions.join(', ')}`);
    lines.push(`전략 선호: ${d.preferredByStrategy.join(', ')}`);
    lines.push(`결정: ${d.selectedAction} (${d.selectionReason})`);
  }

  // Build Track
  if (decision.buildTrack) {
    const d = decision.buildTrack;
    lines.push(`목표 경로: ${d.targetRoute ? `${d.targetRoute.from} → ${d.targetRoute.to}` : '없음'}`);
    lines.push(`건설 진행: ${d.tracksBuiltThisTurn}/${d.maxTracks}`);
    lines.push(`현재 현금: $${d.currentCash}`);

    if (d.skipReason) {
      lines.push(`스킵: ${d.skipReason}`);
    } else if (d.candidates.length > 0) {
      lines.push('');
      lines.push('건설 후보 (상위 5개):');
      lines.push('  ┌' + '─'.repeat(56) + '┐');
      lines.push('  │ 위치      │ 엣지   │ 기본  │ 경로  │ 총점  │ 비용 │ 가치  │');
      lines.push('  ├' + '─'.repeat(56) + '┤');

      const top5 = d.candidates.slice(0, 5);
      for (const c of top5) {
        const isSelected = d.selectedCandidate &&
          c.coord.col === d.selectedCandidate.coord.col &&
          c.coord.row === d.selectedCandidate.coord.row;
        const prefix = isSelected ? '> ' : '  ';

        const pos = `(${c.coord.col},${c.coord.row})`.padEnd(8);
        const edges = `[${c.edges.join(',')}]`.padEnd(6);
        const base = c.baseScore.toFixed(0).padStart(5);
        const route = c.routeScore.toFixed(0).padStart(5);
        const total = c.totalScore.toFixed(0).padStart(5);
        const cost = `$${c.cost}`.padStart(4);
        const value = c.valueRatio.toFixed(1).padStart(5);

        lines.push(`  │${prefix}${pos} │ ${edges} │ ${base} │ ${route} │ ${total} │ ${cost} │ ${value} │`);
      }
      lines.push('  └' + '─'.repeat(56) + '┘');

      if (d.selectedCandidate) {
        lines.push(`선택: (${d.selectedCandidate.coord.col},${d.selectedCandidate.coord.row}) edges=[${d.selectedCandidate.edges.join(',')}]`);
      }
    }
  }

  // Move Goods
  if (decision.moveGoods) {
    const d = decision.moveGoods;
    lines.push(`라운드: ${d.round}/2`);
    lines.push(`엔진 레벨: ${d.engineLevel} 링크`);

    if (d.skipReason) {
      lines.push(`스킵: ${d.skipReason}`);
    } else if (d.engineUpgrade) {
      lines.push('결정: 엔진 업그레이드');
    } else if (d.candidates.length > 0) {
      lines.push('');
      lines.push('이동 후보 (상위 5개):');
      lines.push('  ┌' + '─'.repeat(60) + '┐');
      lines.push('  │ 출발 │ 도착 │ 색상   │ 링크 │ 기본 │ 경로 │ 트랙 │ 총점 │');
      lines.push('  ├' + '─'.repeat(60) + '┤');

      const top5 = d.candidates.slice(0, 5);
      for (const c of top5) {
        const isSelected = d.selectedMove &&
          c.sourceCityId === d.selectedMove.sourceCityId &&
          c.destinationCityId === d.selectedMove.destinationCityId;
        const prefix = isSelected ? '> ' : '  ';

        const src = c.sourceCityId.padEnd(4);
        const dst = c.destinationCityId.padEnd(4);
        const color = c.cubeColor.padEnd(6);
        const links = c.linksCount.toString().padStart(4);
        const base = c.baseScore.toFixed(0).padStart(4);
        const route = c.routeBonus.toFixed(0).padStart(4);
        const track = c.ownTrackBonus.toFixed(0).padStart(4);
        const total = c.totalScore.toFixed(0).padStart(4);

        lines.push(`  │${prefix}${src} │ ${dst} │ ${color} │ ${links} │ ${base} │ ${route} │ ${track} │ ${total} │`);
      }
      lines.push('  └' + '─'.repeat(60) + '┘');

      if (d.selectedMove) {
        lines.push(`선택: ${d.selectedMove.sourceCityId} → ${d.selectedMove.destinationCityId} (${d.selectedMove.cubeColor})`);
      }
    }
  }

  return lines;
}

/**
 * 경로 분석 섹션 포맷팅
 */
function formatPathSection(analysis: PathAnalysisReport): string[] {
  const lines: string[] = [];

  lines.push('');
  lines.push('[경로 분석]');
  lines.push('─'.repeat(50));

  lines.push(`연결된 도시: ${analysis.connectedCities.join(', ') || '없음'}`);
  lines.push(`플레이어 트랙 수: ${analysis.playerTrackCount}`);

  if (analysis.targetRoutes.length > 0) {
    lines.push('');
    lines.push('목표 경로:');

    for (const route of analysis.targetRoutes) {
      const status: string[] = [];
      if (route.isComplete) status.push('✅완성');
      if (route.hasMatchingCubes) status.push('물품O');
      else status.push('물품X');
      if (route.isBlocked) status.push('⚠️차단');

      const progress = (route.progress * 100).toFixed(0);
      const path = route.optimalPath.map(c => `(${c.col},${c.row})`).join(' → ');

      lines.push(`  ${route.from} → ${route.to} (P${route.priority})`);
      lines.push(`    진행: ${progress}% | ${status.join(' | ')}`);
      lines.push(`    비용: $${route.pathCost}`);
      if (route.intermediateCities.length > 0) {
        lines.push(`    경유: ${route.intermediateCities.join(' → ')}`);
      }
      lines.push(`    경로: ${path}`);
    }
  }

  return lines;
}

/**
 * 트랙 평가 섹션 포맷팅
 */
function formatTrackEvaluationSection(evaluations: TrackEvaluationReport[]): string[] {
  const lines: string[] = [];

  lines.push('');
  lines.push('[트랙 평가 상세]');
  lines.push('─'.repeat(50));

  // 상위 3개만 상세 표시
  const top3 = evaluations.slice(0, 3);

  for (const eval_ of top3) {
    lines.push(`위치: (${eval_.coord.col},${eval_.coord.row}) edges=[${eval_.edges.join(',')}]`);
    lines.push(`  목표 경로: ${eval_.targetRoute.from} → ${eval_.targetRoute.to}`);
    lines.push(`  경로상 위치: ${eval_.isOnOptimalPath ? `${eval_.positionOnPath}번째` : '경로 외'}`);
    lines.push(`  다음 건설 위치: ${eval_.nextBuildPosition}번째`);
    lines.push('');
    lines.push('  점수 분해:');
    lines.push(`    onPathBonus:           ${formatScore(eval_.scores.onPathBonus)}`);
    lines.push(`    nextBuildBonus:        ${formatScore(eval_.scores.nextBuildBonus)}`);
    lines.push(`    positionBonus:         ${formatScore(eval_.scores.positionBonus)}`);
    lines.push(`    edgeTowardsNextBonus:  ${formatScore(eval_.scores.edgeTowardsNextBonus)}`);
    lines.push(`    edgeFromPrevBonus:     ${formatScore(eval_.scores.edgeFromPrevBonus)}`);
    lines.push(`    wrongDirectionPenalty: ${formatScore(eval_.scores.wrongDirectionPenalty)}`);
    lines.push(`    adjacentCityBonus:     ${formatScore(eval_.scores.adjacentCityBonus)}`);
    lines.push('    ─'.repeat(20));
    lines.push(`    총 경로 점수: ${eval_.totalRouteScore}`);
    lines.push(`    기본 위치 점수: ${eval_.basePositionScore}`);
    lines.push(`    지형 비용: $${eval_.terrainCost}`);
    lines.push(`    가치 비율: ${eval_.valueRatio.toFixed(2)}`);
    lines.push('');
  }

  return lines;
}

/**
 * 점수 포맷팅 헬퍼
 */
function formatScore(score: number): string {
  if (score > 0) return `+${score}`;
  if (score < 0) return `${score}`;
  return '0';
}
