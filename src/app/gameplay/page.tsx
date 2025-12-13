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
  Home
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

                  <button className="flex items-center gap-2 text-accent hover:gap-3 transition-all">
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
    </div>
  );
}
