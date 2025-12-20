'use client';

/**
 * AI 디버그 모달 컴포넌트
 *
 * AI 전략 분석, Phase 결정, 경로 분석을 시각적으로 표시합니다.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Activity, Target, Route, Hammer, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { getAIReport } from '@/ai/debug';
import type { AIDebugReport, ScenarioScore, TargetRouteAnalysis } from '@/ai/debug';
import type { PlayerId } from '@/types/game';

interface AIDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerId: PlayerId;
}

type TabType = 'strategy' | 'phase' | 'path' | 'track';

export default function AIDebugModal({ isOpen, onClose, playerId }: AIDebugModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('strategy');
  const [report, setReport] = useState<AIDebugReport | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    scenarios: true,
    opponent: false,
    candidates: true,
  });

  const currentTurn = useGameStore((state) => state.currentTurn);
  const currentPhase = useGameStore((state) => state.currentPhase);

  const refreshReport = useCallback(() => {
    if (isOpen) {
      const fullState = useGameStore.getState();
      const newReport = getAIReport(fullState, playerId);
      setReport(newReport);
    }
  }, [isOpen, playerId]);

  useEffect(() => {
    refreshReport();
  }, [refreshReport, currentPhase, currentTurn]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (!isOpen) return null;

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'strategy', label: '전략', icon: <Activity size={16} /> },
    { id: 'phase', label: 'Phase', icon: <Target size={16} /> },
    { id: 'path', label: '경로', icon: <Route size={16} /> },
    { id: 'track', label: '트랙', icon: <Hammer size={16} /> },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-background-secondary border border-accent/30 rounded-xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-accent/20 bg-background-tertiary">
            <div className="flex items-center gap-3">
              <Activity className="text-accent" size={24} />
              <div>
                <h2 className="text-lg font-bold text-foreground">AI 디버거</h2>
                <p className="text-xs text-foreground-secondary">
                  Turn {currentTurn} | {currentPhase} | {playerId}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={refreshReport}
                className="p-2 hover:bg-accent/20 rounded-lg transition-colors"
                title="새로고침"
              >
                <RefreshCw size={18} className="text-accent" />
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
              >
                <X size={18} className="text-foreground-secondary" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-accent/20 bg-background-tertiary/50">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-accent border-b-2 border-accent bg-accent/10'
                    : 'text-foreground-secondary hover:text-foreground hover:bg-accent/5'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto max-h-[calc(85vh-140px)]">
            {!report ? (
              <div className="text-center text-foreground-secondary py-8">
                로딩 중...
              </div>
            ) : (
              <>
                {activeTab === 'strategy' && (
                  <StrategyTab
                    report={report}
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                  />
                )}
                {activeTab === 'phase' && <PhaseTab report={report} />}
                {activeTab === 'path' && <PathTab report={report} />}
                {activeTab === 'track' && <TrackTab report={report} />}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// 전략 탭
function StrategyTab({
  report,
  expandedSections,
  toggleSection
}: {
  report: AIDebugReport;
  expandedSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
}) {
  const { strategyAnalysis } = report;
  const currentStrategy = strategyAnalysis.currentStrategy;

  return (
    <div className="space-y-4">
      {/* 현재 전략 */}
      <div className="bg-background-tertiary rounded-lg p-4">
        <h3 className="text-accent font-bold mb-3">현재 전략</h3>
        {currentStrategy ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <InfoCard label="전략명" value={currentStrategy.nameKo} />
              <InfoCard
                label="목표 경로"
                value={currentStrategy.targetRoutes.length > 0
                  ? currentStrategy.targetRoutes.map(r => `${r.from}→${r.to}`).join(', ')
                  : '없음'
                }
              />
            </div>
          </div>
        ) : (
          <p className="text-foreground-secondary">전략 없음</p>
        )}

        {/* 실현 가능성 */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-foreground-secondary">실현 가능성</span>
            <span className="text-accent font-bold">
              {strategyAnalysis.feasibility.score.toFixed(1)}/100
            </span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent-dark to-accent"
              style={{ width: `${strategyAnalysis.feasibility.score}%` }}
            />
          </div>
          {strategyAnalysis.feasibility.blockedRoutes.length > 0 && (
            <p className="text-xs text-red-400 mt-2">
              ⚠️ 차단된 경로: {strategyAnalysis.feasibility.blockedRoutes.join(', ')}
            </p>
          )}
        </div>
      </div>

      {/* 시나리오 점수 */}
      <CollapsibleSection
        title="시나리오 점수 비교"
        isOpen={expandedSections.scenarios}
        onToggle={() => toggleSection('scenarios')}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-accent/20">
                <th className="text-left py-2 px-2 text-foreground-secondary">시나리오</th>
                <th className="text-right py-2 px-2 text-foreground-secondary">기본</th>
                <th className="text-right py-2 px-2 text-foreground-secondary">조정</th>
                <th className="text-right py-2 px-2 text-foreground-secondary">총점</th>
                <th className="text-center py-2 px-2 text-foreground-secondary">물품</th>
                <th className="text-center py-2 px-2 text-foreground-secondary">자금</th>
                <th className="text-center py-2 px-2 text-foreground-secondary">엔진</th>
              </tr>
            </thead>
            <tbody>
              {strategyAnalysis.scenarioScores.map((score: ScenarioScore) => {
                const isSelected = currentStrategy?.name === score.scenarioName;
                return (
                  <tr
                    key={score.scenarioName}
                    className={`border-b border-accent/10 ${isSelected ? 'bg-accent/20' : ''}`}
                  >
                    <td className="py-2 px-2">
                      {isSelected && <span className="text-accent mr-1">▶</span>}
                      {score.scenarioNameKo}
                    </td>
                    <td className="text-right py-2 px-2">{score.baseScore.toFixed(0)}</td>
                    <td className="text-right py-2 px-2">
                      <span className={score.adjustmentScore >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {score.adjustmentScore >= 0 ? '+' : ''}{score.adjustmentScore}
                      </span>
                    </td>
                    <td className="text-right py-2 px-2 font-bold text-accent">
                      {score.totalScore.toFixed(0)}
                    </td>
                    <td className="text-center py-2 px-2">{score.matchingCubes}</td>
                    <td className="text-center py-2 px-2">
                      {score.cashFeasible ? '✅' : '❌'}
                    </td>
                    <td className="text-center py-2 px-2">
                      {score.engineFeasible ? '✅' : '❌'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {/* 상대 분석 */}
      <CollapsibleSection
        title="상대 분석"
        isOpen={expandedSections.opponent}
        onToggle={() => toggleSection('opponent')}
      >
        <div className="grid grid-cols-2 gap-4">
          <InfoCard
            label="상대 트랙 수"
            value={strategyAnalysis.opponentAnalysis.trackCount.toString()}
          />
          <InfoCard
            label="연결된 도시"
            value={strategyAnalysis.opponentAnalysis.connectedCities.join(', ') || '없음'}
          />
          <div className="col-span-2">
            <InfoCard
              label="목표 추정 도시"
              value={strategyAnalysis.opponentAnalysis.targetCities.join(', ') || '없음'}
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}

// Phase 탭
function PhaseTab({ report }: { report: AIDebugReport }) {
  const { phaseDecision } = report;

  if (!phaseDecision) {
    return <div className="text-foreground-secondary text-center py-8">현재 Phase 정보 없음</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-background-tertiary rounded-lg p-4">
        <h3 className="text-accent font-bold mb-3">Phase: {phaseDecision.phase}</h3>

        {/* Issue Shares */}
        {phaseDecision.issueShares && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoCard label="현재 현금" value={`$${phaseDecision.issueShares.currentCash}`} />
            <InfoCard label="필요 자금" value={`$${phaseDecision.issueShares.requiredCash}`} />
            <InfoCard label="부족액" value={`$${phaseDecision.issueShares.shortage}`} />
            <InfoCard
              label="발행 결정"
              value={`${phaseDecision.issueShares.sharesDecided}주`}
              highlight
            />
          </div>
        )}

        {/* Auction */}
        {phaseDecision.auction && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoCard label="현재 입찰가" value={`$${phaseDecision.auction.currentBid}`} />
            <InfoCard label="최대 입찰 한도" value={`$${phaseDecision.auction.maxBid}`} />
            <InfoCard
              label="Turn Order 패스"
              value={phaseDecision.auction.turnOrderPassAvailable ? '가능' : '없음'}
            />
            <InfoCard
              label="결정"
              value={phaseDecision.auction.decision}
              highlight
            />
          </div>
        )}

        {/* Select Action */}
        {phaseDecision.selectAction && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InfoCard label="엔진 레벨" value={`${phaseDecision.selectAction.engineLevel}`} />
              <InfoCard label="현재 현금" value={`$${phaseDecision.selectAction.currentCash}`} />
              <InfoCard label="트랙 수" value={phaseDecision.selectAction.trackCount.toString()} />
              <InfoCard
                label="선택 행동"
                value={phaseDecision.selectAction.selectedAction}
                highlight
              />
            </div>
            <div className="text-sm">
              <p className="text-foreground-secondary">
                사용 가능: {phaseDecision.selectAction.availableActions.join(', ')}
              </p>
              <p className="text-foreground-secondary">
                전략 선호: {phaseDecision.selectAction.preferredByStrategy.join(', ')}
              </p>
              <p className="text-accent mt-2">
                선택 이유: {phaseDecision.selectAction.selectionReason}
              </p>
            </div>
          </div>
        )}

        {/* Build Track */}
        {phaseDecision.buildTrack && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InfoCard
                label="목표 경로"
                value={phaseDecision.buildTrack.targetRoute
                  ? `${phaseDecision.buildTrack.targetRoute.from} → ${phaseDecision.buildTrack.targetRoute.to}`
                  : '없음'
                }
              />
              <InfoCard
                label="건설 진행"
                value={`${phaseDecision.buildTrack.tracksBuiltThisTurn}/${phaseDecision.buildTrack.maxTracks}`}
              />
              <InfoCard label="현재 현금" value={`$${phaseDecision.buildTrack.currentCash}`} />
              {phaseDecision.buildTrack.skipReason && (
                <InfoCard label="스킵" value={phaseDecision.buildTrack.skipReason} />
              )}
            </div>

            {phaseDecision.buildTrack.candidates.length > 0 && (
              <div className="overflow-x-auto">
                <p className="text-sm text-foreground-secondary mb-2">건설 후보 (상위 5개):</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-accent/20">
                      <th className="text-left py-2 px-2">위치</th>
                      <th className="text-left py-2 px-2">엣지</th>
                      <th className="text-right py-2 px-2">기본</th>
                      <th className="text-right py-2 px-2">경로</th>
                      <th className="text-right py-2 px-2">총점</th>
                      <th className="text-right py-2 px-2">비용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phaseDecision.buildTrack.candidates.slice(0, 5).map((c, i) => {
                      const isSelected = phaseDecision.buildTrack?.selectedCandidate &&
                        c.coord.col === phaseDecision.buildTrack.selectedCandidate.coord.col &&
                        c.coord.row === phaseDecision.buildTrack.selectedCandidate.coord.row;
                      return (
                        <tr
                          key={i}
                          className={`border-b border-accent/10 ${isSelected ? 'bg-accent/20' : ''}`}
                        >
                          <td className="py-2 px-2">
                            {isSelected && <span className="text-accent mr-1">▶</span>}
                            ({c.coord.col},{c.coord.row})
                          </td>
                          <td className="py-2 px-2">[{c.edges.join(',')}]</td>
                          <td className="text-right py-2 px-2">{c.baseScore.toFixed(0)}</td>
                          <td className="text-right py-2 px-2">{c.routeScore.toFixed(0)}</td>
                          <td className="text-right py-2 px-2 font-bold text-accent">
                            {c.totalScore.toFixed(0)}
                          </td>
                          <td className="text-right py-2 px-2">${c.cost}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Move Goods */}
        {phaseDecision.moveGoods && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <InfoCard label="라운드" value={`${phaseDecision.moveGoods.round}/2`} />
              <InfoCard label="엔진 레벨" value={`${phaseDecision.moveGoods.engineLevel} 링크`} />
              {phaseDecision.moveGoods.engineUpgrade && (
                <InfoCard label="결정" value="엔진 업그레이드" highlight />
              )}
              {phaseDecision.moveGoods.skipReason && (
                <InfoCard label="스킵" value={phaseDecision.moveGoods.skipReason} />
              )}
            </div>

            {phaseDecision.moveGoods.candidates.length > 0 && (
              <div className="overflow-x-auto">
                <p className="text-sm text-foreground-secondary mb-2">이동 후보 (상위 5개):</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-accent/20">
                      <th className="text-left py-2 px-2">출발</th>
                      <th className="text-left py-2 px-2">도착</th>
                      <th className="text-left py-2 px-2">색상</th>
                      <th className="text-right py-2 px-2">링크</th>
                      <th className="text-right py-2 px-2">총점</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phaseDecision.moveGoods.candidates.slice(0, 5).map((c, i) => {
                      const isSelected = phaseDecision.moveGoods?.selectedMove &&
                        c.sourceCityId === phaseDecision.moveGoods.selectedMove.sourceCityId &&
                        c.destinationCityId === phaseDecision.moveGoods.selectedMove.destinationCityId;
                      return (
                        <tr
                          key={i}
                          className={`border-b border-accent/10 ${isSelected ? 'bg-accent/20' : ''}`}
                        >
                          <td className="py-2 px-2">
                            {isSelected && <span className="text-accent mr-1">▶</span>}
                            {c.sourceCityId}
                          </td>
                          <td className="py-2 px-2">{c.destinationCityId}</td>
                          <td className="py-2 px-2">{c.cubeColor}</td>
                          <td className="text-right py-2 px-2">{c.linksCount}</td>
                          <td className="text-right py-2 px-2 font-bold text-accent">
                            {c.totalScore.toFixed(0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 경로 탭
function PathTab({ report }: { report: AIDebugReport }) {
  const { pathAnalysis } = report;

  return (
    <div className="space-y-4">
      <div className="bg-background-tertiary rounded-lg p-4">
        <h3 className="text-accent font-bold mb-3">경로 분석</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <InfoCard
            label="연결된 도시"
            value={pathAnalysis.connectedCities.join(', ') || '없음'}
          />
          <InfoCard label="플레이어 트랙 수" value={pathAnalysis.playerTrackCount.toString()} />
        </div>
      </div>

      {pathAnalysis.targetRoutes.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-foreground-secondary">목표 경로</h4>
          {pathAnalysis.targetRoutes.map((route: TargetRouteAnalysis, i: number) => (
            <div key={i} className="bg-background-tertiary rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold">
                  {route.from} → {route.to}
                  <span className="text-accent ml-2">(P{route.priority})</span>
                </span>
                <div className="flex gap-2">
                  {route.isComplete && (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                      ✅ 완성
                    </span>
                  )}
                  {route.isBlocked && (
                    <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">
                      ⚠️ 차단
                    </span>
                  )}
                  {route.hasMatchingCubes ? (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
                      물품 O
                    </span>
                  ) : (
                    <span className="text-xs bg-gray-500/20 text-gray-400 px-2 py-1 rounded">
                      물품 X
                    </span>
                  )}
                </div>
              </div>

              {/* 진행률 */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-foreground-secondary">진행률</span>
                  <span className="text-accent">{(route.progress * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-accent-dark to-accent"
                    style={{ width: `${route.progress * 100}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-foreground-secondary">경로 비용: </span>
                  <span className="text-accent">${route.pathCost}</span>
                </div>
                {route.intermediateCities.length > 0 && (
                  <div>
                    <span className="text-foreground-secondary">경유: </span>
                    <span>{route.intermediateCities.join(' → ')}</span>
                  </div>
                )}
              </div>

              {route.optimalPath.length > 0 && (
                <div className="mt-2 text-xs text-foreground-muted">
                  경로: {route.optimalPath.map(c => `(${c.col},${c.row})`).join(' → ')}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-foreground-secondary text-center py-8">목표 경로 없음</div>
      )}
    </div>
  );
}

// 트랙 탭
function TrackTab({ report }: { report: AIDebugReport }) {
  const { trackEvaluations } = report;

  if (!trackEvaluations || trackEvaluations.length === 0) {
    return (
      <div className="text-foreground-secondary text-center py-8">
        트랙 평가 정보 없음 (buildTrack 단계에서만 표시)
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-bold text-foreground-secondary">트랙 평가 상세 (상위 3개)</h4>
      {trackEvaluations.slice(0, 3).map((eval_, i) => (
        <div key={i} className="bg-background-tertiary rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold">
              ({eval_.coord.col},{eval_.coord.row})
              <span className="text-foreground-secondary ml-2">
                edges=[{eval_.edges.join(',')}]
              </span>
            </span>
            <span className="text-accent">
              {eval_.targetRoute.from} → {eval_.targetRoute.to}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <InfoCard
              label="경로상 위치"
              value={eval_.isOnOptimalPath ? `${eval_.positionOnPath}번째` : '경로 외'}
            />
            <InfoCard label="다음 건설 위치" value={`${eval_.nextBuildPosition}번째`} />
            <InfoCard label="지형 비용" value={`$${eval_.terrainCost}`} />
            <InfoCard label="가치 비율" value={eval_.valueRatio.toFixed(2)} highlight />
          </div>

          <div className="text-sm">
            <p className="text-foreground-secondary mb-2">점수 분해:</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <ScoreItem label="경로상 보너스" value={eval_.scores.onPathBonus} />
              <ScoreItem label="다음 건설 보너스" value={eval_.scores.nextBuildBonus} />
              <ScoreItem label="위치 보너스" value={eval_.scores.positionBonus} />
              <ScoreItem label="다음 방향 엣지" value={eval_.scores.edgeTowardsNextBonus} />
              <ScoreItem label="이전 방향 엣지" value={eval_.scores.edgeFromPrevBonus} />
              <ScoreItem label="잘못된 방향" value={eval_.scores.wrongDirectionPenalty} />
              <ScoreItem label="인접 도시 보너스" value={eval_.scores.adjacentCityBonus} />
            </div>
            <div className="mt-3 pt-2 border-t border-accent/20 flex gap-4">
              <span>총 경로 점수: <span className="text-accent font-bold">{eval_.totalRouteScore}</span></span>
              <span>기본 위치 점수: <span className="text-accent">{eval_.basePositionScore}</span></span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// 유틸리티 컴포넌트
function InfoCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-background/50 rounded-lg p-3">
      <p className="text-xs text-foreground-secondary mb-1">{label}</p>
      <p className={`font-bold ${highlight ? 'text-accent' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background-tertiary rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-accent/10 transition-colors"
      >
        <span className="font-bold text-foreground">{title}</span>
        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 pt-0">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScoreItem({ label, value }: { label: string; value: number }) {
  const color = value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-foreground-secondary';
  const prefix = value > 0 ? '+' : '';
  return (
    <div className="flex justify-between bg-background/30 px-2 py-1 rounded">
      <span className="text-foreground-secondary">{label}</span>
      <span className={color}>{prefix}{value}</span>
    </div>
  );
}
