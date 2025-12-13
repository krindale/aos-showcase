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
  Mountain,
  TreePine,
  Waves,
  Home,
  X,
  Users
} from 'lucide-react';

const turnPhases = [
  {
    step: 1,
    title: '물품 생산',
    titleEn: 'Goods Production',
    description: '생산 차트에 따라 새로운 물품 큐브가 도시에 배치됩니다.',
    icon: Package,
    color: 'steam-yellow',
  },
  {
    step: 2,
    title: '턴 순서 경매',
    titleEn: 'Turn Order Auction',
    description: '이번 턴의 순서를 결정하기 위해 경매를 진행합니다. 선턴은 장단점이 있습니다.',
    icon: Gavel,
    color: 'steam-purple',
  },
  {
    step: 3,
    title: '특수 행동 선택',
    titleEn: 'Select Actions',
    description: '7가지 특수 행동 중 하나를 선택합니다. 같은 행동은 중복 선택이 불가능합니다.',
    icon: Zap,
    color: 'steam-blue',
  },
  {
    step: 4,
    title: '트랙 건설',
    titleEn: 'Build Track',
    description: '최대 3개의 트랙 타일을 건설합니다. 지형에 따라 비용이 달라집니다.',
    icon: Train,
    color: 'accent',
  },
  {
    step: 5,
    title: '물품 운송',
    titleEn: 'Move Goods',
    description: '기관차 레벨만큼의 링크를 이동하여 물품을 목적지로 운송합니다.',
    icon: Package,
    color: 'steam-green',
  },
  {
    step: 6,
    title: '수입 & 비용',
    titleEn: 'Income & Expenses',
    description: '수입 트랙에서 수입을 얻고, 운영 비용과 주식 이자를 지불합니다.',
    icon: Coins,
    color: 'steam-yellow',
  },
];

const terrainTypes = [
  { name: '평지', cost: 2, icon: Home, color: 'bg-steam-green/20 text-steam-green' },
  { name: '마을', cost: 3, icon: Building2, color: 'bg-steam-blue/20 text-steam-blue' },
  { name: '산', cost: 4, icon: Mountain, color: 'bg-steam-red/20 text-steam-red' },
  { name: '숲', cost: 3, icon: TreePine, color: 'bg-steam-green/30 text-steam-green' },
  { name: '강', cost: 3, icon: Waves, color: 'bg-steam-blue/30 text-steam-blue' },
  { name: '도시', cost: 5, icon: Building2, color: 'bg-steam-purple/20 text-steam-purple' },
];

export default function GameplayPage() {
  const [activePhase, setActivePhase] = useState(0);
  const [selectedTerrain, setSelectedTerrain] = useState<number[]>([]);
  const [animationPhase, setAnimationPhase] = useState<number | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isHeroInView = useInView(heroRef, { once: true });
  const isTimelineInView = useInView(timelineRef, { once: true, margin: '-100px' });
  const isTrackInView = useInView(trackRef, { once: true, margin: '-100px' });

  const totalCost = selectedTerrain.reduce((sum, idx) => sum + terrainTypes[idx].cost, 0);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative pt-32 pb-20 overflow-hidden hex-pattern"
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
              전략적 의사결정의 모든 단계를 시각적으로 안내합니다.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Turn Sequence Timeline */}
      <section ref={timelineRef} className="py-24 relative" id="turn">
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
              각 턴은 6단계로 구성됩니다. 단계를 클릭하여 자세한 내용을 확인하세요.
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Timeline */}
            <div className="space-y-4">
              {turnPhases.map((phase, index) => (
                <motion.div
                  key={phase.step}
                  initial={{ opacity: 0, x: -30 }}
                  animate={isTimelineInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <button
                    onClick={() => setActivePhase(index)}
                    className={`w-full text-left p-4 rounded-xl transition-all duration-300 ${
                      activePhase === index
                        ? 'glass-card glow-border'
                        : 'hover:bg-glass'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center
                          ${activePhase === index ? `bg-${phase.color}/20` : 'bg-glass'}`}
                      >
                        <phase.icon
                          className={`w-6 h-6 ${
                            activePhase === index ? `text-${phase.color}` : 'text-foreground-secondary'
                          }`}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-accent text-sm font-medium">
                            Step {phase.step}
                          </span>
                          <ChevronRight
                            className={`w-4 h-4 transition-transform ${
                              activePhase === index ? 'rotate-90 text-accent' : 'text-foreground-muted'
                            }`}
                          />
                        </div>
                        <h3 className="font-display text-lg font-semibold text-foreground">
                          {phase.title}
                        </h3>
                      </div>
                    </div>
                  </button>
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
                  <div className={`w-16 h-16 rounded-2xl bg-${turnPhases[activePhase].color}/10
                    flex items-center justify-center mb-6`}>
                    {(() => {
                      const Icon = turnPhases[activePhase].icon;
                      return <Icon className={`w-8 h-8 text-${turnPhases[activePhase].color}`} />;
                    })()}
                  </div>

                  <div className="text-accent text-sm mb-2">
                    {turnPhases[activePhase].titleEn}
                  </div>
                  <h3 className="font-display text-2xl font-bold text-foreground mb-4">
                    {turnPhases[activePhase].title}
                  </h3>
                  <p className="text-foreground-secondary leading-relaxed mb-6">
                    {turnPhases[activePhase].description}
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
        className="py-24 bg-background-secondary relative"
        id="track"
      >
        <div className="absolute inset-0 hex-pattern opacity-30" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isTrackInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <span className="text-accent text-sm tracking-widest uppercase mb-4 block">
              Track Building
            </span>
            <h2 className="font-display text-4xl font-bold text-foreground mb-4">
              트랙 건설 시뮬레이터
            </h2>
            <p className="text-foreground-secondary max-w-xl mx-auto">
              지형 타일을 선택하여 트랙 건설 비용을 계산해보세요.
              최대 3개까지 선택할 수 있습니다.
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Terrain Selection */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={isTrackInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="glass-card p-8 rounded-2xl">
                <h3 className="font-display text-xl font-semibold text-foreground mb-6">
                  지형 선택 (최대 3개)
                </h3>

                <div className="grid grid-cols-3 gap-4 mb-8">
                  {terrainTypes.map((terrain, index) => (
                    <motion.button
                      key={terrain.name}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        if (selectedTerrain.includes(index)) {
                          setSelectedTerrain(selectedTerrain.filter((i) => i !== index));
                        } else if (selectedTerrain.length < 3) {
                          setSelectedTerrain([...selectedTerrain, index]);
                        }
                      }}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        selectedTerrain.includes(index)
                          ? 'border-accent bg-accent/10'
                          : 'border-glass-border hover:border-accent/50'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg ${terrain.color}
                        flex items-center justify-center mx-auto mb-2`}>
                        <terrain.icon className="w-5 h-5" />
                      </div>
                      <div className="text-sm font-medium text-foreground">
                        {terrain.name}
                      </div>
                      <div className="text-xs text-accent">${terrain.cost}</div>
                    </motion.button>
                  ))}
                </div>

                {/* Selected */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-foreground-secondary text-sm">선택된 지형:</span>
                  <div className="flex gap-2">
                    {selectedTerrain.length === 0 ? (
                      <span className="text-foreground-muted text-sm">없음</span>
                    ) : (
                      selectedTerrain.map((idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 rounded bg-accent/10 text-accent text-sm"
                        >
                          {terrainTypes[idx].name}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setSelectedTerrain([])}
                  className="text-sm text-foreground-muted hover:text-accent transition-colors"
                >
                  선택 초기화
                </button>
              </div>
            </motion.div>

            {/* Cost Calculation */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={isTrackInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <div className="glass-card p-8 rounded-2xl text-center">
                <h3 className="font-display text-xl font-semibold text-foreground mb-8">
                  건설 비용 계산
                </h3>

                <motion.div
                  key={totalCost}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mb-8"
                >
                  <div className="counter-number text-6xl md:text-7xl">
                    ${totalCost}
                  </div>
                  <div className="text-foreground-secondary mt-2">
                    총 건설 비용
                  </div>
                </motion.div>

                <div className="space-y-3 text-left">
                  {selectedTerrain.length > 0 ? (
                    selectedTerrain.map((idx, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-2 border-b border-glass-border"
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded ${terrainTypes[idx].color}
                            flex items-center justify-center`}>
                            {(() => {
                              const Icon = terrainTypes[idx].icon;
                              return <Icon className="w-3 h-3" />;
                            })()}
                          </div>
                          <span className="text-foreground">
                            {terrainTypes[idx].name}
                          </span>
                        </div>
                        <span className="text-accent font-medium">
                          ${terrainTypes[idx].cost}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-foreground-muted">
                      지형을 선택하면 비용이 표시됩니다
                    </div>
                  )}
                </div>

                {selectedTerrain.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-6 p-4 rounded-xl bg-accent/10 text-sm text-foreground-secondary"
                  >
                    <span className="text-accent font-medium">Tip:</span> 부채 없이
                    건설하려면 충분한 현금이 필요합니다!
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Goods Delivery Section */}
      <section className="py-24 relative" id="goods">
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
                { title: '수입 증가', value: '+1', desc: '운송 완료 시' },
                { title: '링크 사용료', value: '$1', desc: '타인 트랙 이용 시' },
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
                <div className={`w-12 h-12 rounded-xl bg-${turnPhases[animationPhase].color}/20 flex items-center justify-center`}>
                  {(() => {
                    const Icon = turnPhases[animationPhase].icon;
                    return <Icon className={`w-6 h-6 text-${turnPhases[animationPhase].color}`} />;
                  })()}
                </div>
                <div>
                  <div className="text-accent text-sm">Step {turnPhases[animationPhase].step}</div>
                  <h3 className="font-display text-xl font-bold text-foreground">
                    {turnPhases[animationPhase].title}
                  </h3>
                </div>
              </div>

              {/* Animation Area */}
              <div className="bg-background-secondary rounded-xl p-8 mb-6 min-h-[300px] flex items-center justify-center relative">
                {/* Phase 1: Goods Production - 도시 미니 보드 + 주사위 + 큐브 생성 */}
                {animationPhase === 0 && (
                  <div className="flex flex-col items-center gap-6 w-full">
                    {/* 주사위 굴림 효과 */}
                    <motion.div
                      initial={{ rotate: 0, scale: 0 }}
                      animate={{ rotate: 360, scale: 1 }}
                      transition={{ duration: 0.8, type: 'spring' }}
                      className="w-14 h-14 rounded-xl bg-accent/30 border-2 border-accent flex items-center justify-center shadow-lg"
                    >
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className="text-2xl font-bold text-accent"
                      >
                        4
                      </motion.span>
                    </motion.div>

                    {/* 3개 도시 그리드 */}
                    <div className="flex justify-center gap-8">
                      {[
                        { name: '런던', color: 'steam-red', cubes: 2 },
                        { name: '버밍엄', color: 'steam-blue', cubes: 1 },
                        { name: '맨체스터', color: 'steam-yellow', cubes: 2 },
                      ].map((city, cityIndex) => (
                        <motion.div
                          key={city.name}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 + cityIndex * 0.2 }}
                          className="text-center"
                        >
                          <div className={`w-16 h-16 rounded-xl bg-${city.color}/20 border-2 border-${city.color}/50 flex items-center justify-center mx-auto mb-2 relative`}>
                            <Building2 className={`w-8 h-8 text-${city.color}`} />
                            {/* 글로우 효과 */}
                            <motion.div
                              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                              transition={{ duration: 2, repeat: Infinity, delay: cityIndex * 0.3 }}
                              className={`absolute inset-0 rounded-xl bg-${city.color}/20 blur-md`}
                            />
                          </div>
                          <span className="text-foreground-secondary text-xs">{city.name}</span>
                          {/* 큐브 생성 */}
                          <div className="flex justify-center gap-1 mt-2">
                            {Array.from({ length: city.cubes }).map((_, cubeIndex) => (
                              <motion.div
                                key={cubeIndex}
                                initial={{ scale: 0, y: -20 }}
                                animate={{ scale: 1, y: 0 }}
                                transition={{
                                  delay: 1.2 + cityIndex * 0.3 + cubeIndex * 0.15,
                                  type: 'spring',
                                  stiffness: 500,
                                  damping: 15,
                                }}
                                className={`w-6 h-6 rounded bg-${city.color} shadow-lg`}
                              />
                            ))}
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    {/* 생산 완료 메시지 */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 2.5 }}
                      className="text-accent text-sm font-medium"
                    >
                      ✨ 5개 물품 생산 완료
                    </motion.div>
                  </div>
                )}

                {/* Phase 2: Turn Order Auction - 경매장 + 입찰 말풍선 시퀀스 */}
                {animationPhase === 1 && (
                  <div className="w-full">
                    {/* 경매대 배경 */}
                    <div className="relative mb-8">
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        className="h-1 bg-accent/30 rounded-full mb-6"
                      />
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full">
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="text-accent text-xs tracking-wider"
                        >
                          경매
                        </motion.div>
                      </div>
                    </div>

                    {/* 플레이어들 + 입찰 */}
                    <div className="flex justify-center gap-8 mb-6">
                      {[
                        { player: 'P1', bids: ['$2', '$3'], color: 'steam-blue', winner: false },
                        { player: 'P2', bids: ['$3', '$5'], color: 'steam-green', winner: true },
                        { player: 'P3', bids: ['$4'], color: 'steam-red', winner: false },
                      ].map((p, pIndex) => (
                        <motion.div
                          key={p.player}
                          initial={{ y: 30, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: pIndex * 0.15 }}
                          className="text-center relative"
                        >
                          {/* 플레이어 아바타 */}
                          <motion.div
                            animate={p.winner ? {
                              scale: [1, 1.1, 1],
                              boxShadow: ['0 0 0px rgba(245,158,11,0)', '0 0 20px rgba(245,158,11,0.5)', '0 0 0px rgba(245,158,11,0)']
                            } : {}}
                            transition={{ delay: 2.5, duration: 1, repeat: Infinity }}
                            className={`w-14 h-14 rounded-full bg-${p.color}/20 border-2 ${p.winner ? 'border-accent' : `border-${p.color}/50`} flex items-center justify-center mx-auto mb-2 relative`}
                          >
                            <Users className={`w-7 h-7 ${p.winner ? 'text-accent' : `text-${p.color}`}`} />
                            {/* 왕관 표시 (승자) */}
                            {p.winner && (
                              <motion.div
                                initial={{ scale: 0, y: 10 }}
                                animate={{ scale: 1, y: 0 }}
                                transition={{ delay: 2.8, type: 'spring' }}
                                className="absolute -top-4 text-xl"
                              >
                                👑
                              </motion.div>
                            )}
                          </motion.div>
                          <div className={`text-sm font-medium ${p.winner ? 'text-accent' : 'text-foreground'}`}>{p.player}</div>

                          {/* 입찰 말풍선 */}
                          <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
                            {p.bids.map((bid, bidIndex) => (
                              <motion.div
                                key={bidIndex}
                                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                                animate={{ opacity: [0, 1, 1, 0.3], y: [20, 0, 0, -10], scale: [0.8, 1, 1, 0.9] }}
                                transition={{
                                  delay: 0.5 + pIndex * 0.3 + bidIndex * 0.8,
                                  duration: 1.5,
                                }}
                                className={`px-3 py-1 rounded-full ${bidIndex === p.bids.length - 1 && p.winner ? 'bg-accent text-background' : 'bg-glass'} text-sm font-bold whitespace-nowrap`}
                              >
                                {bid}
                              </motion.div>
                            ))}
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    {/* 결과 */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 2.5 }}
                      className="text-center p-3 rounded-lg bg-accent/10 border border-accent/30"
                    >
                      <span className="text-accent font-bold">P2</span>
                      <span className="text-foreground-secondary">가 </span>
                      <span className="text-accent font-bold">$5</span>
                      <span className="text-foreground-secondary">로 선턴 획득!</span>
                    </motion.div>
                  </div>
                )}

                {/* Phase 3: Action Selection - 부채꼴 카드 팬 + 선택 애니메이션 */}
                {animationPhase === 2 && (
                  <div className="relative w-full h-[200px] flex items-center justify-center">
                    {['건설', '기관차', '도시화', '생산', '엔지니어', '턴 순서', '이동'].map((action, i) => {
                      const isSelected = i === 2;
                      const totalCards = 7;
                      const fanAngle = 8;
                      const rotation = (i - (totalCards - 1) / 2) * fanAngle;

                      return (
                        <motion.div
                          key={action}
                          initial={{
                            rotateY: 180,
                            opacity: 0,
                            rotate: 0,
                            y: 50,
                            x: 0,
                          }}
                          animate={{
                            rotateY: 0,
                            opacity: isSelected ? 1 : [1, 1, 1, 0.4],
                            rotate: isSelected ? 0 : rotation,
                            y: isSelected ? -30 : 0,
                            x: isSelected ? 0 : (i - 3) * 50,
                            scale: isSelected ? 1.2 : [1, 1, 1, 0.9],
                            zIndex: isSelected ? 10 : 1,
                          }}
                          transition={{
                            delay: i * 0.1,
                            duration: 0.5,
                            opacity: { delay: isSelected ? 0 : 2, duration: 0.5 },
                            y: { delay: isSelected ? 1.5 : 0, duration: 0.4, type: 'spring' },
                            scale: { delay: isSelected ? 1.5 : 2, duration: 0.3 },
                          }}
                          className={`absolute w-20 h-28 rounded-xl flex flex-col items-center justify-center text-sm font-medium shadow-lg ${
                            isSelected
                              ? 'bg-accent text-background ring-4 ring-accent/50'
                              : 'bg-glass-hover text-foreground-secondary border border-glass-border'
                          }`}
                          style={{ transformOrigin: 'bottom center' }}
                        >
                          <span className="text-2xl mb-1">
                            {['🔨', '🚂', '🏙️', '📦', '👷', '🔄', '➡️'][i]}
                          </span>
                          {action}
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: 2 }}
                              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-steam-green flex items-center justify-center"
                            >
                              <span className="text-white text-xs">✓</span>
                            </motion.div>
                          )}
                        </motion.div>
                      );
                    })}

                    {/* 선택 완료 메시지 */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 2.5 }}
                      className="absolute bottom-0 text-accent text-sm font-medium"
                    >
                      도시화 행동 선택 완료
                    </motion.div>
                  </div>
                )}

                {/* Phase 4: Track Building - 헥스 그리드 + 순차 트랙 배치 */}
                {animationPhase === 3 && (
                  <div className="flex flex-col items-center gap-4 w-full">
                    {/* 헥스 그리드 (도시 A - 트랙들 - 도시 B) */}
                    <div className="flex items-center gap-2">
                      {/* 도시 A */}
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-14 h-14 rounded-xl bg-steam-blue/30 border-2 border-steam-blue flex items-center justify-center relative"
                      >
                        <Building2 className="w-7 h-7 text-steam-blue" />
                        <span className="absolute -bottom-5 text-xs text-foreground-secondary">런던</span>
                      </motion.div>

                      {/* 트랙 세그먼트들 */}
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          initial={{ scaleX: 0, opacity: 0 }}
                          animate={{ scaleX: 1, opacity: 1 }}
                          transition={{ delay: 0.5 + i * 0.5, duration: 0.4, type: 'spring' }}
                          className="relative"
                        >
                          {/* 트랙 */}
                          <div className="w-16 h-3 bg-accent rounded-full relative">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: '100%' }}
                              transition={{ delay: 0.5 + i * 0.5, duration: 0.3 }}
                              className="h-full bg-accent/50 rounded-full"
                            />
                            {/* 레일 디테일 */}
                            <div className="absolute inset-0 flex justify-between items-center px-1">
                              {[...Array(4)].map((_, j) => (
                                <div key={j} className="w-0.5 h-full bg-background/30" />
                              ))}
                            </div>
                          </div>

                          {/* 비용 팝업 */}
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.7 + i * 0.5 }}
                            className="absolute -top-6 left-1/2 -translate-x-1/2 text-steam-red text-xs font-bold"
                          >
                            -${i === 1 ? 3 : 2}
                          </motion.div>
                        </motion.div>
                      ))}

                      {/* 도시 B */}
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2 }}
                        className="w-14 h-14 rounded-xl bg-steam-green/30 border-2 border-steam-green flex items-center justify-center relative"
                      >
                        <Building2 className="w-7 h-7 text-steam-green" />
                        <span className="absolute -bottom-5 text-xs text-foreground-secondary">버밍엄</span>
                      </motion.div>
                    </div>

                    {/* 연결 완료 효과 */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 2.5 }}
                      className="flex items-center gap-3 mt-4 p-3 rounded-lg bg-accent/10 border border-accent/30"
                    >
                      <Train className="w-5 h-5 text-accent" />
                      <span className="text-foreground-secondary text-sm">노선 연결 완료!</span>
                      <span className="text-steam-red font-bold">-$7</span>
                    </motion.div>
                  </div>
                )}

                {/* Phase 5: Goods Movement - 기관차 + 큐브 이동 (잘림 수정됨) */}
                {animationPhase === 4 && (
                  <div className="flex flex-col items-center gap-4 w-full py-4">
                    {/* 경로 시각화 */}
                    <div className="flex items-center w-full max-w-lg relative">
                      {/* 출발 도시 */}
                      <div className="text-center z-10">
                        <div className="w-14 h-14 rounded-xl bg-steam-blue/30 border-2 border-steam-blue flex items-center justify-center">
                          <Building2 className="w-7 h-7 text-steam-blue" />
                        </div>
                        <span className="text-foreground-secondary text-xs mt-1 block">출발</span>
                      </div>

                      {/* 트랙 세그먼트들 */}
                      <div className="flex-1 flex items-center relative mx-2">
                        {/* 트랙 배경 */}
                        <div className="w-full h-3 bg-accent/20 rounded-full relative">
                          {/* 링크 구분선 */}
                          {[1, 2].map((i) => (
                            <div
                              key={i}
                              className="absolute top-0 bottom-0 w-0.5 bg-background"
                              style={{ left: `${i * 33.33}%` }}
                            />
                          ))}

                          {/* 링크 번호 */}
                          {[1, 2, 3].map((linkNum) => (
                            <motion.div
                              key={linkNum}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: linkNum * 0.5 }}
                              className="absolute -top-5 text-xs text-foreground-secondary"
                              style={{ left: `${(linkNum - 1) * 33.33 + 16}%` }}
                            >
                              링크{linkNum}
                            </motion.div>
                          ))}
                        </div>

                        {/* 기관차 + 큐브 이동 */}
                        <motion.div
                          initial={{ left: '0%' }}
                          animate={{ left: ['0%', '33%', '66%', '100%'] }}
                          transition={{
                            duration: 3,
                            times: [0, 0.33, 0.66, 1],
                            ease: 'easeInOut',
                            repeat: Infinity,
                            repeatDelay: 1,
                          }}
                          className="absolute top-1/2 -translate-y-1/2 flex items-center"
                          style={{ marginLeft: '-20px' }}
                        >
                          {/* 기관차 */}
                          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shadow-lg">
                            <Train className="w-5 h-5 text-background" />
                          </div>
                          {/* 큐브 */}
                          <motion.div
                            className="w-7 h-7 rounded bg-steam-yellow shadow-lg flex items-center justify-center ml-1"
                          >
                            <Package className="w-4 h-4 text-background" />
                          </motion.div>
                        </motion.div>
                      </div>

                      {/* 도착 도시 */}
                      <div className="text-center z-10">
                        <motion.div
                          animate={{
                            boxShadow: ['0 0 0px rgba(234,179,8,0)', '0 0 15px rgba(234,179,8,0.5)', '0 0 0px rgba(234,179,8,0)']
                          }}
                          transition={{ duration: 1.5, repeat: Infinity, delay: 3 }}
                          className="w-14 h-14 rounded-xl bg-steam-yellow/30 border-2 border-steam-yellow flex items-center justify-center"
                        >
                          <Building2 className="w-7 h-7 text-steam-yellow" />
                        </motion.div>
                        <span className="text-foreground-secondary text-xs mt-1 block">도착</span>
                      </div>
                    </div>

                    {/* 수입 표시 */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -10] }}
                      transition={{ delay: 3, duration: 1.5, repeat: Infinity, repeatDelay: 2.5 }}
                      className="text-steam-green font-bold text-lg"
                    >
                      +$3 수입 (3링크)
                    </motion.div>
                  </div>
                )}

                {/* Phase 6: Income & Expenses - 수입 트랙 + 코인 스택 애니메이션 */}
                {animationPhase === 5 && (
                  <div className="flex flex-col items-center gap-6 w-full">
                    {/* 수입 트랙 */}
                    <div className="w-full max-w-sm">
                      <div className="flex justify-between text-xs text-foreground-secondary mb-2">
                        <span>수입 트랙</span>
                        <span>$0 → $10</span>
                      </div>
                      <div className="h-6 bg-glass rounded-full relative overflow-hidden">
                        {/* 트랙 눈금 */}
                        {[...Array(11)].map((_, i) => (
                          <div
                            key={i}
                            className="absolute top-0 bottom-0 w-px bg-glass-border"
                            style={{ left: `${i * 10}%` }}
                          />
                        ))}
                        {/* 마커 이동 */}
                        <motion.div
                          initial={{ left: '50%' }}
                          animate={{ left: '80%' }}
                          transition={{ delay: 0.5, duration: 1.5, type: 'spring' }}
                          className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-accent shadow-lg"
                          style={{ marginLeft: '-10px' }}
                        />
                      </div>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 2 }}
                        className="text-right text-sm text-accent mt-1"
                      >
                        수입 레벨: $8
                      </motion.div>
                    </div>

                    {/* 코인 영역 */}
                    <div className="flex items-center gap-8">
                      {/* 수입 코인 스택 */}
                      <div className="text-center">
                        <div className="relative h-20 w-16 flex items-end justify-center">
                          {[...Array(4)].map((_, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, y: -30 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.5 + i * 0.2, type: 'spring' }}
                              className="absolute w-10 h-10 rounded-full bg-steam-green border-2 border-steam-green/50 flex items-center justify-center shadow-lg"
                              style={{ bottom: i * 8 }}
                            >
                              <Coins className="w-5 h-5 text-background" />
                            </motion.div>
                          ))}
                        </div>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 1.5 }}
                          className="text-steam-green font-bold mt-2"
                        >
                          +$8
                        </motion.div>
                        <span className="text-foreground-secondary text-xs">수입</span>
                      </div>

                      {/* 마이너스 */}
                      <motion.span
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 1.8 }}
                        className="text-2xl text-foreground-secondary"
                      >
                        −
                      </motion.span>

                      {/* 비용 코인 스택 */}
                      <div className="text-center">
                        <div className="relative h-20 w-16 flex items-end justify-center">
                          {[...Array(2)].map((_, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 1, y: 0 }}
                              animate={{ opacity: [1, 1, 0.3], y: [0, 0, 20] }}
                              transition={{ delay: 2 + i * 0.15, duration: 0.5 }}
                              className="absolute w-10 h-10 rounded-full bg-steam-red border-2 border-steam-red/50 flex items-center justify-center shadow-lg"
                              style={{ bottom: i * 8 }}
                            >
                              <Coins className="w-5 h-5 text-background" />
                            </motion.div>
                          ))}
                        </div>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 2 }}
                          className="text-steam-red font-bold mt-2"
                        >
                          -$3
                        </motion.div>
                        <span className="text-foreground-secondary text-xs">비용</span>
                      </div>

                      {/* 등호 */}
                      <motion.span
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 2.5 }}
                        className="text-2xl text-foreground-secondary"
                      >
                        =
                      </motion.span>

                      {/* 최종 결과 */}
                      <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 3, type: 'spring' }}
                        className="text-center p-4 rounded-xl bg-accent/20 border border-accent"
                      >
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ delay: 3.5, duration: 0.5 }}
                          className="text-3xl font-bold text-accent"
                        >
                          +$5
                        </motion.div>
                        <span className="text-foreground-secondary text-xs">순이익</span>
                      </motion.div>
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <p className="text-foreground-secondary text-sm leading-relaxed">
                {turnPhases[animationPhase].description}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
