'use client';

import { useRef, useState } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  Gavel,
  Zap,
  Building2,
  Train,
  Package,
  Coins,
  Play,
  ChevronRight,
  ChevronDown,
  Mountain,
  Waves,
  Home,
  X,
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  RefreshCw,
  Banknote,
  Clock,
  ArrowRight,
  Minus,
  CircleDollarSign,
} from 'lucide-react';

// 4개 카테고리 + 10개 하위 단계
const turnCategories = [
  {
    id: 'preparation',
    title: '준비 단계',
    titleEn: 'Preparation',
    color: 'steam-purple',
    icon: RefreshCw,
    phases: [
      {
        step: 1,
        title: '주식 발행',
        titleEn: 'Issue Shares',
        description: '자금이 필요하면 주식을 발행하여 $5를 받습니다. 단, 게임 종료 시 주식 1주당 -3 승점입니다.',
        icon: Banknote,
        color: 'steam-green',
      },
      {
        step: 2,
        title: '플레이어 순서 결정',
        titleEn: 'Determine Player Order',
        description: '이번 턴의 순서를 결정하기 위해 경매를 진행합니다. 높은 금액을 입찰하면 선턴을 가져갑니다.',
        icon: Gavel,
        color: 'steam-purple',
      },
      {
        step: 3,
        title: '행동 선택',
        titleEn: 'Select Actions',
        description: '7가지 특수 행동 중 하나를 선택합니다. 각 행동은 한 명만 선택할 수 있습니다.',
        icon: Zap,
        color: 'steam-blue',
      },
    ],
  },
  {
    id: 'action',
    title: '행동 단계',
    titleEn: 'Action',
    color: 'accent',
    icon: Train,
    phases: [
      {
        step: 4,
        title: '트랙 건설',
        titleEn: 'Build Track',
        description: '최대 3개의 트랙 타일을 건설합니다. 지형에 따라 비용이 달라집니다. 또한 이 단계에서 1회에 한해 엔진 업그레이드가 가능합니다.',
        icon: Train,
        color: 'accent',
      },
      {
        step: 5,
        title: '물품 운송',
        titleEn: 'Move Goods',
        description: '기관차 레벨만큼의 링크를 이동하여 물품을 목적지로 운송합니다. 운송 시 수입이 증가합니다.',
        icon: Package,
        color: 'steam-yellow',
      },
    ],
  },
  {
    id: 'settlement',
    title: '정산 단계',
    titleEn: 'Settlement',
    color: 'steam-green',
    icon: Coins,
    phases: [
      {
        step: 6,
        title: '수입 수집',
        titleEn: 'Collect Income',
        description: '수입 트랙에 표시된 금액만큼 돈을 받습니다.',
        icon: TrendingUp,
        color: 'steam-green',
      },
      {
        step: 7,
        title: '비용 지불',
        titleEn: 'Pay Expenses',
        description: '발행한 주식 수 + 기관차 레벨만큼 비용을 지불합니다. 돈이 부족하면 수입이 감소합니다.',
        icon: DollarSign,
        color: 'steam-red',
      },
      {
        step: 8,
        title: '수입 감소',
        titleEn: 'Income Reduction',
        description: '수입 트랙의 위치에 따라 수입이 자동으로 감소합니다. 높은 수입일수록 더 많이 감소합니다.',
        icon: TrendingDown,
        color: 'steam-red',
      },
    ],
  },
  {
    id: 'turnEnd',
    title: '턴 종료 단계',
    titleEn: 'Turn End',
    color: 'steam-blue',
    icon: Clock,
    phases: [
      {
        step: 9,
        title: '물품 보충',
        titleEn: 'Goods Growth',
        description: '주사위를 굴려 새로운 물품 큐브가 도시에 배치됩니다.',
        icon: Package,
        color: 'steam-yellow',
      },
      {
        step: 10,
        title: '턴 마커 전진',
        titleEn: 'Advance Turn Marker',
        description: '턴 마커를 전진시키고, 마지막 턴이면 게임이 종료됩니다.',
        icon: ArrowRight,
        color: 'steam-blue',
      },
    ],
  },
];

// 모든 단계를 평탄화 (애니메이션 인덱스용)
const allPhases = turnCategories.flatMap(cat => cat.phases);

// 트랙 건설 비용 (매뉴얼 기준)
const trackCosts = {
  // 배치 비용 (Placing)
  placing: {
    simple: { plain: 2, river: 3, mountain: 4 },      // 단순 트랙
    coexist: { plain: 3, river: 4, mountain: 5 },     // 복합 공존
    crossing: { plain: 4, river: 5, mountain: 6 },    // 복합 교차
    town: { base: 1, perTrack: 1 },                   // 마을: $1 + 연결트랙당 $1
  },
  // 교체 비용 (Replacing)
  replacing: {
    toCrossing: 3,    // 단순 → 복합 교차
    inTown: 3,        // 마을 내 교체
    other: 2,         // 기타 모든 교체
  },
  // 방향 전환 비용 (Redirecting)
  redirecting: 2,
};

// 시뮬레이터용 선택 항목
const trackTypes = [
  { id: 'simple', name: '단순 트랙', icon: Train, color: 'steam-green' },
  { id: 'coexist', name: '복합 공존', icon: Train, color: 'steam-blue' },
  { id: 'crossing', name: '복합 교차', icon: Train, color: 'steam-purple' },
  { id: 'town', name: '마을 트랙', icon: Home, color: 'steam-yellow' },
];

const terrainOptions = [
  { id: 'plain', name: '평지', icon: Home, color: 'steam-green' },
  { id: 'river', name: '강', icon: Waves, color: 'steam-blue' },
  { id: 'mountain', name: '산', icon: Mountain, color: 'steam-red' },
];

export default function GameplayPage() {
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['preparation']);
  const [activePhase, setActivePhase] = useState(0); // 전체 10개 중 인덱스
  const [selectedTrackType, setSelectedTrackType] = useState<string>('simple');
  const [selectedTerrain, setSelectedTerrain] = useState<string>('plain');
  const [townConnections, setTownConnections] = useState<number>(2);
  const [animationPhase, setAnimationPhase] = useState<number | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isHeroInView = useInView(heroRef, { once: true });
  const isTimelineInView = useInView(timelineRef, { once: true, margin: '-100px' });
  const isTrackInView = useInView(trackRef, { once: true, margin: '-100px' });

  // 비용 계산
  const calculateCost = () => {
    if (selectedTrackType === 'town') {
      return trackCosts.placing.town.base + (trackCosts.placing.town.perTrack * townConnections);
    }
    const trackType = trackCosts.placing[selectedTrackType as keyof typeof trackCosts.placing];
    if (typeof trackType === 'object' && 'plain' in trackType) {
      return trackType[selectedTerrain as keyof typeof trackType] as number;
    }
    return 0;
  };
  const totalCost = calculateCost();

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  // 현재 선택된 단계의 전체 인덱스로 카테고리 및 단계 찾기
  const findPhaseInfo = (globalIndex: number) => {
    let count = 0;
    for (const cat of turnCategories) {
      for (const phase of cat.phases) {
        if (count === globalIndex) {
          return { category: cat, phase };
        }
        count++;
      }
    }
    return { category: turnCategories[0], phase: turnCategories[0].phases[0] };
  };

  const { category: activeCategory, phase: activePhaseData } = findPhaseInfo(activePhase);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section
        ref={heroRef}
        className="snap-section relative pt-32 pb-20 overflow-hidden hex-pattern"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background-secondary to-background" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <span className="text-accent text-sm tracking-widest uppercase mb-4 block">
              How to Play
            </span>
            <h1 className="font-display text-5xl md:text-6xl font-bold text-foreground mb-6">
              게임 <span className="text-gradient">플레이</span> 가이드
            </h1>
            <p className="text-foreground-secondary max-w-2xl mx-auto text-lg">
              Age of Steam의 턴 구조와 핵심 메커니즘을 알아보세요.
              <br />
              <span className="text-accent">4개 카테고리</span>, <span className="text-accent">10단계</span>로 구성된 턴 시퀀스를 시각적으로 안내합니다.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Turn Sequence Timeline - 4 Categories */}
      <section ref={timelineRef} className="snap-section py-24 relative" id="turn">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isTimelineInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <span className="text-accent text-sm tracking-widest uppercase mb-4 block">
              Turn Sequence
            </span>
            <h2 className="font-display text-4xl font-bold text-foreground mb-4">
              턴 진행 순서
            </h2>
            <p className="text-foreground-secondary max-w-xl mx-auto">
              각 턴은 <span className="text-accent font-semibold">4개 카테고리</span>, <span className="text-accent font-semibold">10단계</span>로 구성됩니다.
              <br />카테고리를 펼쳐 세부 단계를 확인하세요.
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Timeline with Categories */}
            <div className="space-y-4">
              {turnCategories.map((category, catIndex) => (
                <motion.div
                  key={category.id}
                  initial={{ opacity: 0, x: -30 }}
                  animate={isTimelineInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: catIndex * 0.1 }}
                >
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className={`w-full text-left p-4 rounded-xl transition-all duration-300
                      ${expandedCategories.includes(category.id) ? 'glass-card' : 'hover:bg-glass'}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-${category.color}/20`}>
                        <category.icon className={`w-6 h-6 text-${category.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-${category.color} text-sm font-medium`}>
                            {category.titleEn}
                          </span>
                          <span className="text-foreground-muted text-xs">
                            ({category.phases.length}단계)
                          </span>
                        </div>
                        <h3 className="font-display text-lg font-semibold text-foreground">
                          {category.title}
                        </h3>
                      </div>
                      <ChevronDown
                        className={`w-5 h-5 transition-transform text-foreground-secondary ${
                          expandedCategories.includes(category.id) ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {/* Phases within Category */}
                  <AnimatePresence>
                    {expandedCategories.includes(category.id) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="pl-6 pt-2 space-y-2">
                          {category.phases.map((phase) => {
                            const globalIndex = allPhases.findIndex(p => p.step === phase.step);
                            return (
                              <button
                                key={phase.step}
                                onClick={() => setActivePhase(globalIndex)}
                                className={`w-full text-left p-3 rounded-lg transition-all duration-300 flex items-center gap-3
                                  ${activePhase === globalIndex
                                    ? `bg-${phase.color}/10 border border-${phase.color}/30`
                                    : 'hover:bg-glass'
                                  }`}
                              >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center
                                  ${activePhase === globalIndex ? `bg-${phase.color}/20` : 'bg-glass'}`}>
                                  <phase.icon
                                    className={`w-4 h-4 ${
                                      activePhase === globalIndex ? `text-${phase.color}` : 'text-foreground-secondary'
                                    }`}
                                  />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-accent text-xs font-medium">
                                      Step {phase.step}
                                    </span>
                                    <ChevronRight
                                      className={`w-3 h-3 transition-transform ${
                                        activePhase === globalIndex ? 'rotate-90 text-accent' : 'text-foreground-muted'
                                      }`}
                                    />
                                  </div>
                                  <span className="text-sm font-medium text-foreground">
                                    {phase.title}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>

            {/* Detail Panel */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={isTimelineInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="lg:sticky lg:top-32"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={activePhase}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="glass-card p-8 rounded-2xl"
                >
                  {/* Category Badge */}
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-${activeCategory.color}/10 mb-4`}>
                    <activeCategory.icon className={`w-4 h-4 text-${activeCategory.color}`} />
                    <span className={`text-${activeCategory.color} text-sm font-medium`}>
                      {activeCategory.title}
                    </span>
                  </div>

                  <div className={`w-16 h-16 rounded-2xl bg-${activePhaseData.color}/10
                    flex items-center justify-center mb-6`}>
                    <activePhaseData.icon className={`w-8 h-8 text-${activePhaseData.color}`} />
                  </div>

                  <div className="text-accent text-sm mb-2">
                    Step {activePhaseData.step} · {activePhaseData.titleEn}
                  </div>
                  <h3 className="font-display text-2xl font-bold text-foreground mb-4">
                    {activePhaseData.title}
                  </h3>
                  <p className="text-foreground-secondary leading-relaxed mb-6">
                    {activePhaseData.description}
                  </p>

                  <button
                    onClick={() => setAnimationPhase(activePhase)}
                    className="flex items-center gap-2 text-accent hover:gap-3 transition-all"
                  >
                    <Play className="w-4 h-4" />
                    <span className="text-sm font-medium">애니메이션 보기</span>
                  </button>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Track Building Demo */}
      <section
        ref={trackRef}
        className="snap-section py-24 bg-background-secondary relative"
        id="track"
      >
        <div className="absolute inset-0 hex-pattern opacity-30" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isTrackInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <span className="text-accent text-sm tracking-widest uppercase mb-4 block">
              Track Building Costs
            </span>
            <h2 className="font-display text-4xl font-bold text-foreground mb-4">
              트랙 건설 비용표
            </h2>
            <p className="text-foreground-secondary max-w-xl mx-auto">
              트랙 유형과 지형에 따른 건설 비용을 확인하세요.
            </p>
          </motion.div>

          {/* 비용표 3개 카드 */}
          <div className="grid lg:grid-cols-3 gap-6 mb-12">
            {/* 배치 비용 (Placing) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isTrackInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="glass-card p-6 rounded-2xl"
            >
              <h3 className="font-display text-lg font-semibold text-accent mb-4 flex items-center gap-2">
                <Train className="w-5 h-5" />
                배치 비용 (Placing)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-glass-border">
                      <th className="text-left py-2 text-foreground-secondary font-normal">타일 유형</th>
                      <th className="text-center py-2 text-steam-green">평지</th>
                      <th className="text-center py-2 text-steam-blue">강</th>
                      <th className="text-center py-2 text-steam-red">산</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-glass-border/50">
                      <td className="py-2 text-foreground">단순 트랙</td>
                      <td className="text-center text-foreground font-bold">$2</td>
                      <td className="text-center text-foreground font-bold">$3</td>
                      <td className="text-center text-foreground font-bold">$4</td>
                    </tr>
                    <tr className="border-b border-glass-border/50">
                      <td className="py-2 text-foreground">복합 공존</td>
                      <td className="text-center text-foreground font-bold">$3</td>
                      <td className="text-center text-foreground font-bold">$4</td>
                      <td className="text-center text-foreground font-bold">$5</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-foreground">복합 교차</td>
                      <td className="text-center text-foreground font-bold">$4</td>
                      <td className="text-center text-foreground font-bold">$5</td>
                      <td className="text-center text-foreground font-bold">$6</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-steam-yellow/10 border border-steam-yellow/30">
                <div className="flex items-center gap-2 text-steam-yellow text-sm font-medium mb-1">
                  <Home className="w-4 h-4" />
                  마을 트랙
                </div>
                <div className="text-foreground-secondary text-xs">
                  $1 (기본) + 연결 트랙당 $1
                </div>
                <div className="text-foreground-muted text-xs mt-1">
                  예: 3방향 연결 = $1 + $3 = $4
                </div>
              </div>
            </motion.div>

            {/* 교체 비용 (Replacing) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isTrackInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="glass-card p-6 rounded-2xl"
            >
              <h3 className="font-display text-lg font-semibold text-steam-blue mb-4 flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                교체 비용 (Replacing)
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-glass">
                  <span className="text-foreground text-sm">단순 → 복합 교차</span>
                  <span className="text-accent font-bold">$3</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-glass">
                  <span className="text-foreground text-sm">마을 내 교체</span>
                  <span className="text-accent font-bold">$3</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-glass">
                  <span className="text-foreground text-sm">기타 모든 교체</span>
                  <span className="text-accent font-bold">$2</span>
                </div>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-steam-purple/10 border border-steam-purple/30 text-xs text-foreground-secondary">
                <span className="text-steam-purple font-medium">참고:</span> 교체 시 지형 비용 추가 없음
              </div>
            </motion.div>

            {/* 방향 전환 비용 (Redirecting) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isTrackInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="glass-card p-6 rounded-2xl"
            >
              <h3 className="font-display text-lg font-semibold text-steam-purple mb-4 flex items-center gap-2">
                <ArrowRight className="w-5 h-5" />
                방향 전환 (Redirecting)
              </h3>
              <div className="flex items-center justify-between p-4 rounded-lg bg-glass mb-4">
                <span className="text-foreground">모든 방향 전환</span>
                <span className="text-accent font-bold text-xl">$2</span>
              </div>
              <div className="space-y-2 text-xs text-foreground-secondary">
                <p>• 미완성 트랙 구간 끝에서만 가능</p>
                <p>• 소유권이 있거나 미소유 상태여야 함</p>
                <p>• 마을의 트랙은 방향 전환 불가</p>
              </div>
            </motion.div>
          </div>

          {/* 비용 계산기 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isTrackInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="glass-card p-8 rounded-2xl"
          >
            <h3 className="font-display text-xl font-semibold text-foreground mb-6 text-center">
              비용 계산기
            </h3>

            <div className="grid md:grid-cols-3 gap-8 items-center">
              {/* 트랙 유형 선택 */}
              <div>
                <label className="text-foreground-secondary text-sm mb-3 block">트랙 유형</label>
                <div className="grid grid-cols-2 gap-2">
                  {trackTypes.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => setSelectedTrackType(track.id)}
                      className={`p-3 rounded-lg text-sm transition-all ${
                        selectedTrackType === track.id
                          ? `bg-${track.color}/20 border-2 border-${track.color} text-${track.color}`
                          : 'bg-glass border-2 border-transparent text-foreground-secondary hover:border-glass-border'
                      }`}
                    >
                      {track.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 지형 선택 (마을이 아닐 때만) */}
              <div>
                {selectedTrackType !== 'town' ? (
                  <>
                    <label className="text-foreground-secondary text-sm mb-3 block">지형</label>
                    <div className="flex gap-2">
                      {terrainOptions.map((terrain) => (
                        <button
                          key={terrain.id}
                          onClick={() => setSelectedTerrain(terrain.id)}
                          className={`flex-1 p-3 rounded-lg text-sm transition-all flex flex-col items-center gap-1 ${
                            selectedTerrain === terrain.id
                              ? `bg-${terrain.color}/20 border-2 border-${terrain.color} text-${terrain.color}`
                              : 'bg-glass border-2 border-transparent text-foreground-secondary hover:border-glass-border'
                          }`}
                        >
                          <terrain.icon className="w-5 h-5" />
                          {terrain.name}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <label className="text-foreground-secondary text-sm mb-3 block">연결 트랙 수</label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4].map((num) => (
                        <button
                          key={num}
                          onClick={() => setTownConnections(num)}
                          className={`flex-1 p-3 rounded-lg text-sm font-bold transition-all ${
                            townConnections === num
                              ? 'bg-steam-yellow/20 border-2 border-steam-yellow text-steam-yellow'
                              : 'bg-glass border-2 border-transparent text-foreground-secondary hover:border-glass-border'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* 결과 */}
              <div className="text-center">
                <motion.div
                  key={totalCost}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                >
                  <div className="counter-number text-5xl md:text-6xl">
                    ${totalCost}
                  </div>
                  <div className="text-foreground-secondary mt-2 text-sm">
                    {selectedTrackType === 'town'
                      ? `$1 + $${townConnections} (${townConnections}연결)`
                      : `${trackTypes.find(t => t.id === selectedTrackType)?.name} + ${terrainOptions.find(t => t.id === selectedTerrain)?.name}`
                    }
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Goods Delivery Section */}
      <section className="snap-section py-24 relative" id="goods">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <span className="text-accent text-sm tracking-widest uppercase mb-4 block">
              Goods Delivery
            </span>
            <h2 className="font-display text-4xl font-bold text-foreground mb-4">
              물품 운송 시스템
            </h2>
            <p className="text-foreground-secondary max-w-xl mx-auto">
              색상이 일치하는 도시로 물품을 운송하여 수입을 얻으세요.
              기관차 레벨이 높을수록 더 멀리 운송할 수 있습니다.
            </p>
          </motion.div>

          {/* Delivery Animation Demo */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="glass-card p-8 md:p-12 rounded-2xl"
          >
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              {/* Start City */}
              <div className="text-center">
                <div className="w-20 h-20 rounded-2xl bg-steam-blue/20 flex items-center justify-center mx-auto mb-4">
                  <Building2 className="w-10 h-10 text-steam-blue" />
                </div>
                <div className="text-foreground font-medium">출발 도시</div>
                <div className="text-foreground-muted text-sm">물품 픽업</div>
              </div>

              {/* Track Path */}
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-2 bg-accent/20 rounded-full relative overflow-hidden">
                  <motion.div
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-accent to-transparent"
                  />
                </div>
                <motion.div
                  animate={{ x: [0, 10, 0] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="w-8 h-8 rounded-lg bg-steam-yellow flex items-center justify-center"
                >
                  <Package className="w-4 h-4 text-background" />
                </motion.div>
                <div className="flex-1 h-2 bg-accent/20 rounded-full relative overflow-hidden">
                  <motion.div
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear', delay: 0.5 }}
                    className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-accent to-transparent"
                  />
                </div>
              </div>

              {/* End City */}
              <div className="text-center">
                <div className="w-20 h-20 rounded-2xl bg-steam-yellow/20 flex items-center justify-center mx-auto mb-4">
                  <Building2 className="w-10 h-10 text-steam-yellow" />
                </div>
                <div className="text-foreground font-medium">목적지</div>
                <div className="text-foreground-muted text-sm">수입 +1</div>
              </div>
            </div>

            {/* Info Cards */}
            <div className="grid md:grid-cols-3 gap-4 mt-12">
              {[
                { title: '기관차 레벨', value: '1-6', desc: '이동 가능한 링크 수' },
                { title: '수입 증가', value: '+1', desc: '링크당 수입 증가' },
                { title: '타인 트랙', value: '사용가능', desc: '소유자에게 수입 발생' },
              ].map((info, index) => (
                <motion.div
                  key={info.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.4 + index * 0.1 }}
                  className="bg-glass rounded-xl p-6 text-center"
                >
                  <div className="counter-number text-3xl mb-2">{info.value}</div>
                  <div className="text-foreground font-medium text-sm">
                    {info.title}
                  </div>
                  <div className="text-foreground-muted text-xs">{info.desc}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Animation Modal */}
      <AnimatePresence>
        {animationPhase !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setAnimationPhase(null)}
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-background/90 backdrop-blur-sm"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative glass-card p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            >
              {/* Close Button */}
              <button
                onClick={() => setAnimationPhase(null)}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-glass-hover transition-colors"
              >
                <X className="w-5 h-5 text-foreground-secondary hover:text-foreground" />
              </button>

              {/* Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-12 h-12 rounded-xl bg-${allPhases[animationPhase].color}/20 flex items-center justify-center`}>
                  {(() => {
                    const Icon = allPhases[animationPhase].icon;
                    return <Icon className={`w-6 h-6 text-${allPhases[animationPhase].color}`} />;
                  })()}
                </div>
                <div>
                  <div className="text-accent text-sm">Step {allPhases[animationPhase].step}</div>
                  <h3 className="font-display text-xl font-bold text-foreground">
                    {allPhases[animationPhase].title}
                  </h3>
                </div>
              </div>

              {/* Animation Area */}
              <div className="bg-background-secondary rounded-xl p-8 mb-6 min-h-[300px] flex items-center justify-center relative overflow-hidden">

                {/* Phase 1: Issue Shares - 주식 발행 */}
                {animationPhase === 0 && (
                  <div className="flex flex-col items-center gap-5 w-full">
                    {/* 주식 카드들 */}
                    <div className="flex justify-center gap-4">
                      {[1, 2, 3].map((shareNum) => (
                        <motion.div
                          key={shareNum}
                          initial={{ opacity: 0, y: -50, rotateY: 180 }}
                          animate={{
                            opacity: shareNum <= 2 ? 1 : 0.3,
                            y: 0,
                            rotateY: 0,
                            scale: shareNum <= 2 ? 1 : 0.9,
                          }}
                          transition={{ delay: shareNum * 0.3, duration: 0.5, type: 'spring' }}
                          className={`w-20 h-28 rounded-xl flex flex-col items-center justify-center shadow-lg ${
                            shareNum <= 2
                              ? 'bg-gradient-to-br from-steam-green/30 to-steam-green/10 border-2 border-steam-green'
                              : 'bg-glass border border-glass-border'
                          }`}
                        >
                          <CircleDollarSign className={`w-8 h-8 ${shareNum <= 2 ? 'text-steam-green' : 'text-foreground-muted'}`} />
                          <span className={`text-xs mt-2 ${shareNum <= 2 ? 'text-steam-green' : 'text-foreground-muted'}`}>
                            주식 {shareNum}
                          </span>
                        </motion.div>
                      ))}
                    </div>

                    {/* 돈 수령 */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 1.5, type: 'spring' }}
                      className="flex items-center gap-4"
                    >
                      <div className="flex gap-1">
                        {[1, 2].map((coin) => (
                          <motion.div
                            key={coin}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1.5 + coin * 0.2 }}
                            className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shadow-lg"
                          >
                            <span className="text-background font-bold text-sm">$5</span>
                          </motion.div>
                        ))}
                      </div>
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 2.2 }}
                        className="text-steam-green font-bold text-xl"
                      >
                        +$10 획득!
                      </motion.span>
                    </motion.div>

                    {/* 비용 지불 안내 */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 2.8 }}
                      className="flex items-center gap-3 p-3 rounded-lg bg-steam-purple/10 border border-steam-purple/30"
                    >
                      <DollarSign className="w-5 h-5 text-steam-purple" />
                      <div className="text-sm">
                        <span className="text-steam-purple font-medium">비용 지불:</span>
                        <span className="text-foreground-secondary"> 매 턴 주식 1주당 </span>
                        <span className="text-steam-red font-bold">-$1</span>
                        <span className="text-foreground-secondary"> 지불</span>
                      </div>
                    </motion.div>

                    {/* 경고 메시지 */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 3.3 }}
                      className="text-center p-3 rounded-lg bg-steam-red/10 border border-steam-red/30"
                    >
                      <span className="text-steam-red text-sm">⚠️ 주식 1주당 게임 종료 시 -3 승점</span>
                    </motion.div>
                  </div>
                )}

                {/* Phase 2: Turn Order Auction - 경매장 */}
                {animationPhase === 1 && (
                  <div className="w-full">
                    {/* 경매 타이틀 */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center mb-6"
                    >
                      <span className="text-accent text-sm tracking-wider">턴 순서 경매</span>
                    </motion.div>

                    {/* 경매 진행 과정 */}
                    <div className="flex justify-center gap-6 mb-8">
                      {[
                        { player: 'P1', bid: '$3', passOrder: 2, color: 'steam-blue' },
                        { player: 'P2', bid: '$5', passOrder: null, color: 'steam-green' },
                        { player: 'P3', bid: '$2', passOrder: 1, color: 'steam-red' },
                      ].map((p, pIndex) => (
                        <motion.div
                          key={p.player}
                          initial={{ y: 30, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: pIndex * 0.15 }}
                          className="text-center relative"
                        >
                          {/* 입찰 말풍선 */}
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.8 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ delay: 0.5 + pIndex * 0.3 }}
                            className={`px-3 py-1 rounded-full mb-3 ${p.passOrder === null ? 'bg-accent text-background' : 'bg-glass'} text-sm font-bold`}
                          >
                            {p.bid}
                          </motion.div>

                          {/* 플레이어 아바타 */}
                          <motion.div
                            animate={p.passOrder === null ? {
                              scale: [1, 1.1, 1],
                              boxShadow: ['0 0 0px rgba(245,158,11,0)', '0 0 20px rgba(245,158,11,0.5)', '0 0 0px rgba(245,158,11,0)']
                            } : {}}
                            transition={{ delay: 3.5, duration: 1, repeat: Infinity }}
                            className={`w-12 h-12 rounded-full bg-${p.color}/20 border-2 ${p.passOrder === null ? 'border-accent' : `border-${p.color}/50`} flex items-center justify-center mx-auto mb-2 relative`}
                          >
                            <Users className={`w-6 h-6 ${p.passOrder === null ? 'text-accent' : `text-${p.color}`}`} />
                            {p.passOrder === null && (
                              <motion.div
                                initial={{ scale: 0, y: 10 }}
                                animate={{ scale: 1, y: 0 }}
                                transition={{ delay: 3.5, type: 'spring' }}
                                className="absolute -top-4 text-lg"
                              >
                                👑
                              </motion.div>
                            )}
                            {p.passOrder !== null && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 1.5 + (p.passOrder - 1) * 0.5 }}
                                className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-steam-red text-background text-xs font-bold flex items-center justify-center"
                              >
                                ✗
                              </motion.div>
                            )}
                          </motion.div>
                          <div className={`text-sm font-medium ${p.passOrder === null ? 'text-accent' : 'text-foreground'}`}>{p.player}</div>
                        </motion.div>
                      ))}
                    </div>

                    {/* 순서 결정 결과 */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 2.5 }}
                      className="bg-glass rounded-xl p-4"
                    >
                      <div className="text-foreground-secondary text-xs mb-3 text-center">새로운 플레이어 순서</div>
                      <div className="flex justify-center items-center gap-3">
                        {[
                          { player: 'P2', label: '1st', color: 'steam-green', reason: '최고 입찰 $5', final: true },
                          { player: 'P1', label: '2nd', color: 'steam-blue', reason: '두 번째 포기', final: false },
                          { player: 'P3', label: '3rd', color: 'steam-red', reason: '첫 번째 포기', final: false },
                        ].map((p, i) => (
                          <motion.div
                            key={p.player}
                            initial={{ opacity: 0, x: i === 0 ? 50 : i === 2 ? -50 : 0, y: i === 1 ? 30 : 0 }}
                            animate={{ opacity: 1, x: 0, y: 0 }}
                            transition={{ delay: 3 + i * 0.3, type: 'spring' }}
                            className="text-center"
                          >
                            <div className={`w-10 h-10 rounded-full bg-${p.color}/20 border-2 ${p.final ? 'border-accent' : `border-${p.color}/50`} flex items-center justify-center mx-auto mb-1`}>
                              <span className={`text-sm font-bold ${p.final ? 'text-accent' : `text-${p.color}`}`}>{p.player.slice(1)}</span>
                            </div>
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 3.5 + i * 0.2 }}
                              className={`text-xs font-bold ${p.final ? 'text-accent' : 'text-foreground-secondary'}`}
                            >
                              {p.label}
                            </motion.div>
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 4 + i * 0.2 }}
                              className="text-[10px] text-foreground-muted mt-1"
                            >
                              {p.reason}
                            </motion.div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>

                    {/* 비용 안내 */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 4.5 }}
                      className="text-center mt-4 text-xs text-foreground-muted"
                    >
                      첫 포기자: 무료 | 나머지: 입찰액의 절반(올림) 지불 | 최종 2인: 전액 지불
                    </motion.div>
                  </div>
                )}

                {/* Phase 3: Action Selection - 7개 행동 카드 */}
                {animationPhase === 2 && (
                  <div className="w-full flex flex-col items-center">
                    {/* 상단 4개 - 카드 15% 확대, 아이콘/텍스트 2배 */}
                    <div className="flex justify-center gap-4 mb-4">
                      {[
                        { name: '선이동', icon: '➡️', color: 'steam-green' },
                        { name: '선건설', icon: '🔨', color: 'steam-blue' },
                        { name: '엔지니어', icon: '👷', color: 'accent' },
                        { name: '기관차', icon: '🚂', color: 'steam-red' },
                      ].map((action, i) => (
                        <motion.div
                          key={action.name}
                          initial={{ opacity: 0, y: 30, rotateY: 180 }}
                          animate={{ opacity: 1, y: 0, rotateY: 0 }}
                          transition={{ delay: i * 0.1, duration: 0.4 }}
                          className={`w-[74px] h-[110px] rounded-xl bg-glass border-2 border-${action.color}/50 flex flex-col items-center justify-center shadow-lg hover:scale-105 transition-transform`}
                        >
                          <span className="text-4xl mb-2">{action.icon}</span>
                          <span className="text-sm text-foreground-secondary text-center px-1 font-medium">{action.name}</span>
                        </motion.div>
                      ))}
                    </div>
                    {/* 하단 3개 - 카드 15% 확대, 아이콘/텍스트 2배 */}
                    <div className="flex justify-center gap-4">
                      {[
                        { name: '도시화', icon: '🏙️', color: 'steam-purple' },
                        { name: '생산', icon: '📦', color: 'steam-yellow' },
                        { name: '턴순서', icon: '🔄', color: 'steam-blue' },
                      ].map((action, i) => (
                        <motion.div
                          key={action.name}
                          initial={{ opacity: 0, y: 30, rotateY: 180 }}
                          animate={{ opacity: 1, y: 0, rotateY: 0 }}
                          transition={{ delay: 0.4 + i * 0.1, duration: 0.4 }}
                          className={`w-[74px] h-[110px] rounded-xl bg-glass border-2 border-${action.color}/50 flex flex-col items-center justify-center shadow-lg hover:scale-105 transition-transform`}
                        >
                          <span className="text-4xl mb-2">{action.icon}</span>
                          <span className="text-sm text-foreground-secondary text-center px-1 font-medium">{action.name}</span>
                        </motion.div>
                      ))}
                    </div>

                    {/* 안내 메시지 */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1 }}
                      className="text-center mt-6 p-3 rounded-lg bg-accent/10 border border-accent/30"
                    >
                      <span className="text-accent font-bold">7가지</span>
                      <span className="text-foreground-secondary"> 특수 행동 중 하나를 선택하세요</span>
                    </motion.div>
                  </div>
                )}

                {/* Phase 4: Track Building */}
                {animationPhase === 3 && (
                  <div className="flex flex-col items-center gap-4 w-full">
                    {/* 트랙 건설 애니메이션 - 1.5배 확대 */}
                    <div className="flex items-center gap-3 mb-4">
                      {/* 도시 A */}
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-[72px] h-[72px] rounded-xl bg-steam-blue/30 border-2 border-steam-blue flex items-center justify-center relative"
                      >
                        <Building2 className="w-9 h-9 text-steam-blue" />
                        <span className="absolute -bottom-5 text-xs text-foreground-secondary font-medium">A</span>
                      </motion.div>

                      {/* 트랙 세그먼트들: 평지, 산, 평지 - 1.5배 확대 */}
                      {[
                        { terrain: '평지', cost: 2, color: 'steam-green' },
                        { terrain: '산', cost: 4, color: 'steam-red' },
                        { terrain: '평지', cost: 2, color: 'steam-green' },
                      ].map((track, i) => (
                        <motion.div
                          key={i}
                          initial={{ scaleX: 0, opacity: 0 }}
                          animate={{ scaleX: 1, opacity: 1 }}
                          transition={{ delay: 0.3 + i * 0.4, duration: 0.4, type: 'spring' }}
                          className="relative"
                        >
                          <div className={`w-[84px] h-4 bg-${track.color}/50 rounded-full border-2 border-${track.color}`} />
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 + i * 0.4 }}
                            className="absolute -top-9 left-7 -translate-x-1/2 flex flex-col items-center"
                          >
                            <span className={`text-[10px] text-${track.color}`}>{track.terrain}</span>
                            <span className="text-steam-red text-xs font-bold">-${track.cost}</span>
                          </motion.div>
                        </motion.div>
                      ))}

                      {/* 도시 B */}
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2 }}
                        className="w-[72px] h-[72px] rounded-xl bg-steam-yellow/30 border-2 border-steam-yellow flex items-center justify-center relative"
                      >
                        <Building2 className="w-9 h-9 text-steam-yellow" />
                        <span className="absolute -bottom-5 text-xs text-foreground-secondary font-medium">B</span>
                      </motion.div>
                    </div>

                    {/* 가격표 - 가로 나열 */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.8 }}
                      className="bg-glass rounded-xl p-3"
                    >
                      <div className="text-accent text-xs font-medium mb-2 text-center">트랙 건설 비용</div>
                      <div className="flex items-center justify-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <span className="text-steam-green">🟢</span>
                          <span className="text-foreground font-bold">$2</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-steam-blue">🔵</span>
                          <span className="text-foreground font-bold">$3</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-steam-red">🔴</span>
                          <span className="text-foreground font-bold">$4</span>
                        </div>
                        <div className="border-l border-glass-border pl-4">
                          <div className="flex items-center gap-1">
                            <span className="text-steam-purple">🏘️</span>
                            <span className="text-foreground font-bold">$1+연결$1</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>

                    {/* 결과 */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 2.5 }}
                      className="flex items-center gap-3 p-2 rounded-lg bg-accent/10 border border-accent/30"
                    >
                      <Train className="w-4 h-4 text-accent" />
                      <span className="text-foreground-secondary text-xs">노선 완료!</span>
                      <span className="text-steam-red font-bold text-sm">-$8</span>
                      <span className="text-foreground-muted text-[10px]">(평지+산+평지)</span>
                    </motion.div>

                    {/* 엔진 업그레이드 옵션 */}
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 2.8 }}
                      className="flex items-center gap-4 p-3 rounded-xl bg-steam-green/10 border border-steam-green/30"
                    >
                      <div className="flex items-center gap-2">
                        <Train className="w-5 h-5 text-steam-green" />
                        <span className="text-foreground-secondary text-sm">엔진 업그레이드</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-bold">Lv.1</span>
                        <motion.span
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 3.2, type: 'spring' }}
                          className="text-steam-green"
                        >
                          →
                        </motion.span>
                        <motion.span
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 3.5, type: 'spring' }}
                          className="text-steam-green font-bold"
                        >
                          Lv.2
                        </motion.span>
                      </div>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 3.8 }}
                        className="text-[10px] text-foreground-muted ml-auto"
                      >
                        (1회/턴)
                      </motion.div>
                    </motion.div>
                  </div>
                )}

                {/* Phase 5: Move Goods */}
                {animationPhase === 4 && (
                  <div className="flex flex-col items-center gap-4 w-full py-4">
                    {/* 도시들과 링크 */}
                    <div className="flex items-center justify-center gap-0">
                      {[
                        { name: '출발', color: 'steam-blue', type: 'city' },
                        { name: '링크1', color: 'accent', type: 'link' },
                        { name: '마을', color: 'steam-purple', type: 'town' },
                        { name: '링크2', color: 'accent', type: 'link' },
                        { name: '중간', color: 'steam-green', type: 'city' },
                        { name: '링크3', color: 'accent', type: 'link' },
                        { name: '도착', color: 'steam-yellow', type: 'city', isDestination: true },
                      ].map((node, i) => (
                        <div key={i} className="flex items-center">
                          {node.type === 'link' ? (
                            <div className="w-12 h-3 bg-accent/30 rounded-full relative">
                              <motion.div
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: 1 }}
                                transition={{ delay: 0.2 + i * 0.1, duration: 0.3 }}
                                className="absolute inset-0 bg-accent/50 rounded-full origin-left"
                              />
                            </div>
                          ) : node.type === 'town' ? (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: 0.1 + i * 0.1, type: 'spring' }}
                              className="text-center"
                            >
                              <div className={`w-10 h-10 rounded-lg bg-${node.color}/20 border-2 border-${node.color}/50 flex items-center justify-center`}>
                                <Home className={`w-5 h-5 text-${node.color}`} />
                              </div>
                              <span className="text-[10px] text-foreground-muted mt-1 block">{node.name}</span>
                            </motion.div>
                          ) : (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: 0.1 + i * 0.1, type: 'spring' }}
                              className="text-center"
                            >
                              <motion.div
                                animate={node.isDestination ? {
                                  boxShadow: ['0 0 0px rgba(234,179,8,0)', '0 0 15px rgba(234,179,8,0.5)', '0 0 0px rgba(234,179,8,0)']
                                } : {}}
                                transition={{ duration: 1.5, repeat: Infinity, delay: 3 }}
                                className={`w-12 h-12 rounded-xl bg-${node.color}/30 border-2 border-${node.color} flex items-center justify-center`}
                              >
                                <Building2 className={`w-6 h-6 text-${node.color}`} />
                              </motion.div>
                              <span className="text-[10px] text-foreground-secondary mt-1 block">{node.name}</span>
                            </motion.div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* 기차 이동 애니메이션 */}
                    <div className="relative w-full max-w-md h-12">
                      <motion.div
                        initial={{ left: '0%' }}
                        animate={{ left: ['0%', '30%', '50%', '85%'] }}
                        transition={{
                          duration: 4,
                          times: [0, 0.33, 0.55, 1],
                          ease: 'easeInOut',
                          repeat: Infinity,
                          repeatDelay: 1.5,
                        }}
                        className="absolute top-1/2 -translate-y-1/2 flex items-center"
                      >
                        <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shadow-lg">
                          <Train className="w-5 h-5 text-background" />
                        </div>
                        <motion.div className="w-7 h-7 rounded bg-steam-yellow shadow-lg flex items-center justify-center ml-1">
                          <Package className="w-4 h-4 text-background" />
                        </motion.div>
                      </motion.div>
                    </div>

                    {/* 수입 표시 */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -10] }}
                      transition={{ delay: 4, duration: 1.5, repeat: Infinity, repeatDelay: 4 }}
                      className="text-steam-green font-bold text-lg"
                    >
                      +3 수입 (3링크)
                    </motion.div>

                    {/* 설명 */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1 }}
                      className="text-center text-xs text-foreground-muted"
                    >
                      기관차 레벨 = 이동 가능한 최대 링크 수
                    </motion.div>
                  </div>
                )}

                {/* Phase 6: Collect Income */}
                {animationPhase === 5 && (
                  <div className="flex flex-col items-center gap-6 w-full">
                    {/* 수입 트랙 */}
                    <div className="w-full max-w-sm">
                      <div className="flex justify-between text-xs text-foreground-secondary mb-2">
                        <span>수입 트랙</span>
                        <span>현재: $8</span>
                      </div>
                      <div className="h-6 bg-glass rounded-full relative overflow-hidden">
                        {[...Array(11)].map((_, i) => (
                          <div
                            key={i}
                            className="absolute top-0 bottom-0 w-px bg-glass-border"
                            style={{ left: `${i * 10}%` }}
                          />
                        ))}
                        <motion.div
                          initial={{ left: '0%' }}
                          animate={{ left: '80%' }}
                          transition={{ delay: 0.5, duration: 1.5, type: 'spring' }}
                          className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-steam-green shadow-lg"
                          style={{ marginLeft: '-10px' }}
                        />
                      </div>
                    </div>

                    {/* 코인 수령 */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 2 }}
                      className="flex items-center gap-4"
                    >
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((coin) => (
                          <motion.div
                            key={coin}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 2 + coin * 0.15, type: 'spring' }}
                            className="w-10 h-10 rounded-full bg-steam-green flex items-center justify-center shadow-lg"
                          >
                            <Coins className="w-5 h-5 text-background" />
                          </motion.div>
                        ))}
                      </div>
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 2.8 }}
                        className="text-steam-green font-bold text-xl"
                      >
                        +$8 수입!
                      </motion.span>
                    </motion.div>
                  </div>
                )}

                {/* Phase 7: Pay Expenses */}
                {animationPhase === 6 && (
                  <div className="flex flex-col items-center gap-6 w-full">
                    {/* 비용 계산 */}
                    <div className="flex items-center gap-4">
                      {/* 주식 비용 */}
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-center p-4 rounded-xl bg-steam-purple/10 border border-steam-purple/30"
                      >
                        <CircleDollarSign className="w-8 h-8 text-steam-purple mx-auto mb-2" />
                        <div className="text-sm text-foreground-secondary">주식 2주</div>
                        <div className="text-steam-red font-bold">-$2</div>
                      </motion.div>

                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-2xl text-foreground-muted"
                      >
                        +
                      </motion.span>

                      {/* 기관차 비용 */}
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-center p-4 rounded-xl bg-accent/10 border border-accent/30"
                      >
                        <Train className="w-8 h-8 text-accent mx-auto mb-2" />
                        <div className="text-sm text-foreground-secondary">기관차 Lv.3</div>
                        <div className="text-steam-red font-bold">-$3</div>
                      </motion.div>

                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="text-2xl text-foreground-muted"
                      >
                        =
                      </motion.span>

                      {/* 총 비용 */}
                      <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.9, type: 'spring' }}
                        className="text-center p-4 rounded-xl bg-steam-red/10 border border-steam-red/30"
                      >
                        <Minus className="w-8 h-8 text-steam-red mx-auto mb-2" />
                        <div className="text-sm text-foreground-secondary">총 비용</div>
                        <div className="text-steam-red font-bold text-xl">-$5</div>
                      </motion.div>
                    </div>

                    {/* 지불 애니메이션 */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.5 }}
                      className="flex gap-2"
                    >
                      {[1, 2, 3, 4, 5].map((coin) => (
                        <motion.div
                          key={coin}
                          initial={{ opacity: 1, y: 0 }}
                          animate={{ opacity: 0, y: 30 }}
                          transition={{ delay: 1.5 + coin * 0.1, duration: 0.3 }}
                          className="w-8 h-8 rounded-full bg-steam-red flex items-center justify-center"
                        >
                          <span className="text-background text-xs font-bold">$1</span>
                        </motion.div>
                      ))}
                    </motion.div>
                  </div>
                )}

                {/* Phase 8: Income Reduction */}
                {animationPhase === 7 && (
                  <div className="flex flex-col items-center gap-6 w-full">
                    {/* 수입 감소 표 */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {[
                        { range: '50+', reduction: '-10' },
                        { range: '41-49', reduction: '-8' },
                        { range: '31-40', reduction: '-6' },
                        { range: '21-30', reduction: '-4' },
                        { range: '11-20', reduction: '-2' },
                        { range: '0-10', reduction: '0' },
                      ].map((row, i) => (
                        <motion.div
                          key={row.range}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className={`flex justify-between p-2 rounded ${
                            row.range === '21-30' ? 'bg-steam-red/20 border border-steam-red/50' : 'bg-glass'
                          }`}
                        >
                          <span className="text-foreground-secondary">{row.range}</span>
                          <span className={row.reduction === '0' ? 'text-foreground-muted' : 'text-steam-red font-bold'}>
                            {row.reduction}
                          </span>
                        </motion.div>
                      ))}
                    </div>

                    {/* 수입 트랙 변화 */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1 }}
                      className="flex items-center gap-4"
                    >
                      <div className="text-center">
                        <div className="text-foreground-secondary text-sm">현재 수입</div>
                        <div className="text-accent font-bold text-2xl">$25</div>
                      </div>
                      <motion.div
                        animate={{ x: [0, 5, 0] }}
                        transition={{ duration: 0.5, repeat: 3 }}
                      >
                        <TrendingDown className="w-8 h-8 text-steam-red" />
                      </motion.div>
                      <div className="text-center">
                        <div className="text-foreground-secondary text-sm">감소 후</div>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 2 }}
                          className="text-steam-yellow font-bold text-2xl"
                        >
                          $21
                        </motion.div>
                      </div>
                    </motion.div>
                  </div>
                )}

                {/* Phase 9: Goods Growth (물품 보충) */}
                {animationPhase === 8 && (
                  <div className="flex flex-col items-center gap-6 w-full">
                    {/* 주사위 굴림 애니메이션 */}
                    <div className="flex flex-col items-center gap-3">
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-foreground-secondary text-sm"
                      >
                        🎲 주사위 굴리기
                      </motion.div>
                      <div className="flex gap-4">
                        {[
                          { final: 3, rolls: [1, 4, 6, 2, 5, 3] },
                          { final: 5, rolls: [2, 6, 1, 4, 3, 5] },
                          { final: 2, rolls: [5, 3, 6, 1, 4, 2] },
                        ].map((dice, i) => (
                          <motion.div
                            key={i}
                            initial={{ y: -80, rotate: 0, opacity: 0 }}
                            animate={{
                              y: [null, 0, -15, 0, -8, 0, -3, 0],
                              rotate: [0, 180, 360, 540, 720, 900, 1080],
                              opacity: 1,
                            }}
                            transition={{
                              delay: i * 0.15,
                              duration: 1.2,
                              times: [0, 0.3, 0.45, 0.55, 0.7, 0.8, 0.9, 1],
                              ease: 'easeOut',
                            }}
                            className="w-14 h-14 rounded-xl bg-gradient-to-br from-accent/40 to-accent/20 border-2 border-accent flex items-center justify-center shadow-xl relative overflow-hidden"
                          >
                            {/* 주사위 눈 변화 */}
                            <motion.span
                              initial={{ opacity: 0 }}
                              animate={{
                                opacity: [0, 1, 1, 1, 1, 1, 1],
                              }}
                              transition={{ delay: i * 0.15, duration: 1.2 }}
                              className="text-2xl font-bold text-accent"
                            >
                              {dice.final}
                            </motion.span>
                            {/* 반짝임 효과 */}
                            <motion.div
                              initial={{ x: '-100%', opacity: 0 }}
                              animate={{ x: '200%', opacity: [0, 0.8, 0] }}
                              transition={{ delay: 1.3 + i * 0.1, duration: 0.5 }}
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                            />
                          </motion.div>
                        ))}
                      </div>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 1.5 }}
                        className="text-accent font-bold"
                      >
                        결과: 3, 5, 2
                      </motion.div>
                    </div>

                    {/* 도시에 물품 배치 */}
                    <div className="flex justify-center gap-6">
                      {[
                        { name: '도시 3', color: 'steam-red', cubes: 2 },
                        { name: '도시 5', color: 'steam-blue', cubes: 1 },
                        { name: '도시 2', color: 'steam-yellow', cubes: 1 },
                      ].map((city, cityIndex) => (
                        <motion.div
                          key={city.name}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 2 + cityIndex * 0.2 }}
                          className="text-center"
                        >
                          <div className={`w-14 h-14 rounded-xl bg-${city.color}/20 border-2 border-${city.color}/50 flex items-center justify-center mx-auto mb-2`}>
                            <Building2 className={`w-7 h-7 text-${city.color}`} />
                          </div>
                          <span className="text-foreground-secondary text-xs">{city.name}</span>
                          <div className="flex justify-center gap-1 mt-2">
                            {Array.from({ length: city.cubes }).map((_, cubeIndex) => (
                              <motion.div
                                key={cubeIndex}
                                initial={{ scale: 0, y: -15 }}
                                animate={{ scale: 1, y: 0 }}
                                transition={{
                                  delay: 2.5 + cityIndex * 0.2 + cubeIndex * 0.1,
                                  type: 'spring',
                                }}
                                className={`w-5 h-5 rounded bg-${city.color} shadow-lg`}
                              />
                            ))}
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 3.5 }}
                      className="text-accent text-sm font-medium"
                    >
                      ✨ 4개 물품 보충 완료
                    </motion.div>
                  </div>
                )}

                {/* Phase 10: Advance Turn Marker */}
                {animationPhase === 9 && (
                  <div className="flex flex-col items-center gap-6 w-full">
                    {/* 턴 트랙 */}
                    <div className="w-full max-w-md">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-foreground-secondary text-sm">턴 트랙</span>
                        <span className="text-accent text-sm">5인 게임: 7턴</span>
                      </div>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5, 6, 7].map((turn) => (
                          <motion.div
                            key={turn}
                            className={`flex-1 h-12 rounded-lg flex items-center justify-center font-bold ${
                              turn <= 4 ? 'bg-glass-hover text-foreground-muted' :
                              turn === 5 ? 'bg-accent text-background' :
                              'bg-glass text-foreground-secondary'
                            }`}
                          >
                            {turn}
                          </motion.div>
                        ))}
                      </div>

                      {/* 마커 이동 */}
                      <motion.div
                        initial={{ left: 'calc(50% - 20px)' }}
                        animate={{ left: 'calc(64.3% - 20px)' }}
                        transition={{ delay: 1, duration: 1, type: 'spring' }}
                        className="relative"
                      >
                        <motion.div
                          className="absolute -top-3 w-10 h-10 rounded-full bg-steam-yellow flex items-center justify-center shadow-lg"
                        >
                          <Clock className="w-5 h-5 text-background" />
                        </motion.div>
                      </motion.div>
                    </div>

                    {/* 턴 진행 메시지 */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 2 }}
                      className="text-center p-4 rounded-xl bg-accent/10 border border-accent/30"
                    >
                      <div className="text-accent font-bold text-lg">턴 5 → 턴 6</div>
                      <div className="text-foreground-secondary text-sm mt-1">
                        다음 턴을 시작합니다!
                      </div>
                    </motion.div>

                    {/* 게임 종료 조건 */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 2.5 }}
                      className="text-foreground-muted text-xs text-center"
                    >
                      7턴이 끝나면 게임 종료 → 승점 계산
                    </motion.div>
                  </div>
                )}
              </div>

              {/* Description */}
              <p className="text-foreground-secondary text-sm leading-relaxed">
                {allPhases[animationPhase].description}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
