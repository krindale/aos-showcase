'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, useInView, useSpring, useTransform } from 'framer-motion';
import {
  Wrench,
  Truck,
  Coins,
  Users,
  Clock,
  Map,
  TrendingUp,
  Award,
  X
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';

const features = [
  {
    icon: Wrench,
    title: '트랙 건설',
    description: '다양한 지형에 철도 트랙을 건설하고 도시를 연결하세요. 전략적인 노선 계획이 승리의 핵심입니다.',
    color: 'steam-blue',
    gradient: 'from-steam-blue/20 to-transparent',
    details: {
      rules: [
        '트랙 타일을 육각형 칸에 배치합니다',
        '도시와 도시를 연결해야 운송이 가능합니다',
        '산악 지형은 추가 비용이 듭니다',
      ],
      tips: '초반에는 짧은 경로 위주로 건설하고, 후반에 네트워크를 확장하세요.',
    },
  },
  {
    icon: Truck,
    title: '물품 운송',
    description: '도시에서 생산된 물품을 목적지까지 운송하여 수입을 얻으세요. 효율적인 경로가 더 많은 이익을 가져옵니다.',
    color: 'steam-green',
    gradient: 'from-steam-green/20 to-transparent',
    details: {
      rules: [
        '물품 큐브를 해당 색상의 도시로 운송합니다',
        '운송 거리에 따라 수입이 달라집니다',
        '엔진 레벨만큼의 링크를 사용할 수 있습니다',
      ],
      tips: '가능하면 긴 경로를 통해 운송하여 수입을 극대화하세요.',
    },
  },
  {
    icon: Coins,
    title: '경제 경영',
    description: '주식을 발행하고 부채를 관리하세요. 현명한 재정 운용이 장기적인 성공을 보장합니다.',
    color: 'steam-yellow',
    gradient: 'from-steam-yellow/20 to-transparent',
    details: {
      rules: [
        '주식 발행으로 $5를 얻지만 매 턴 $1 배당금을 지불합니다',
        '수입 트랙에서 현재 위치만큼 돈을 받습니다',
        '파산하면 게임에서 탈락합니다',
      ],
      tips: '초반 주식은 필수지만, 중반 이후에는 발행을 자제하세요.',
    },
  },
  {
    icon: TrendingUp,
    title: '경매 시스템',
    description: '턴 순서와 특수 행동을 두고 경쟁하세요. 적절한 투자와 타이밍이 게임의 흐름을 바꿉니다.',
    color: 'steam-purple',
    gradient: 'from-steam-purple/20 to-transparent',
    details: {
      rules: [
        '가장 높은 금액을 제시한 플레이어가 첫 번째 턴을 가집니다',
        '특수 행동 타일을 경매로 획득합니다',
        '턴 순서가 빠를수록 좋은 기회를 잡을 수 있습니다',
      ],
      tips: '핵심 특수 행동이 필요할 때만 공격적으로 입찰하세요.',
    },
  },
];

const stats = [
  { icon: Users, value: 6, suffix: '인', label: '최대 플레이어' },
  { icon: Clock, value: 180, suffix: '분', label: '게임 시간' },
  { icon: Map, value: 6, suffix: '+', label: '확장 맵' },
  { icon: Award, value: 2002, suffix: '', label: '출시 연도' },
];

function AnimatedCounter({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const spring = useSpring(0, { mass: 0.8, stiffness: 75, damping: 15 });
  const display = useTransform(spring, (current) =>
    Math.round(current).toLocaleString()
  );
  const [displayValue, setDisplayValue] = useState('0');

  useEffect(() => {
    if (isInView) {
      spring.set(value);
    }
  }, [isInView, spring, value]);

  useEffect(() => {
    return display.on('change', (latest) => {
      setDisplayValue(latest);
    });
  }, [display]);

  return (
    <span ref={ref} className="counter-number text-4xl md:text-5xl">
      {displayValue}
      {suffix}
    </span>
  );
}

export default function FeatureCards() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const [selectedFeature, setSelectedFeature] = useState<typeof features[0] | null>(null);

  return (
    <section ref={ref} className="py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] bg-accent/5 rounded-full blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-accent text-sm tracking-widest uppercase mb-4 block">
            Core Mechanics
          </span>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-6">
            게임의 핵심 요소
          </h2>
          <p className="text-foreground-secondary max-w-2xl mx-auto text-lg">
            Age of Steam은 트랙 건설, 물품 운송, 경제 경영의
            완벽한 조화를 이루는 전략 게임입니다
          </p>
        </motion.div>

        {/* Feature Cards Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-24">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.1 * index }}
              className="group cursor-pointer"
              onClick={() => setSelectedFeature(feature)}
            >
              <div className="glass-card p-8 h-full card-hover relative overflow-hidden">
                {/* Gradient Background */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                />

                <div className="relative z-10">
                  {/* Icon */}
                  <div
                    className={`w-14 h-14 rounded-2xl bg-${feature.color}/10
                      flex items-center justify-center mb-6
                      group-hover:scale-110 transition-transform duration-300`}
                  >
                    <feature.icon className={`w-7 h-7 text-${feature.color}`} />
                  </div>

                  {/* Content */}
                  <h3 className="font-display text-xl font-semibold text-foreground mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-foreground-secondary leading-relaxed">
                    {feature.description}
                  </p>

                  {/* Hover Arrow */}
                  <div className="mt-6 flex items-center gap-2 text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-sm font-medium">자세히 보기</span>
                    <motion.span
                      initial={{ x: 0 }}
                      whileHover={{ x: 5 }}
                      className="inline-block"
                    >
                      →
                    </motion.span>
                  </div>
                </div>

                {/* Decorative corner */}
                <div
                  className={`absolute top-0 right-0 w-20 h-20 bg-${feature.color}/5
                    blur-2xl rounded-full transform translate-x-1/2 -translate-y-1/2`}
                />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="glass-card p-8 md:p-12 rounded-3xl"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={isInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
                className="text-center"
              >
                <stat.icon className="w-8 h-8 text-accent mx-auto mb-4" />
                <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                <p className="text-foreground-secondary text-sm mt-2">
                  {stat.label}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Feature Detail Modal */}
      <AnimatePresence>
        {selectedFeature && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedFeature(null)}
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative glass-card p-8 max-w-lg w-full max-h-[80vh] overflow-y-auto"
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedFeature(null)}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-glass-hover transition-colors"
              >
                <X className="w-5 h-5 text-foreground-secondary hover:text-foreground" />
              </button>

              {/* Icon */}
              <div
                className={`w-16 h-16 rounded-2xl bg-${selectedFeature.color}/10
                  flex items-center justify-center mb-6`}
              >
                <selectedFeature.icon className={`w-8 h-8 text-${selectedFeature.color}`} />
              </div>

              {/* Title */}
              <h3 className="font-display text-2xl font-bold text-foreground mb-4">
                {selectedFeature.title}
              </h3>

              {/* Description */}
              <p className="text-foreground-secondary leading-relaxed mb-6">
                {selectedFeature.description}
              </p>

              {/* Rules */}
              <div className="mb-6">
                <h4 className="text-accent text-sm font-semibold tracking-wider uppercase mb-3">
                  규칙
                </h4>
                <ul className="space-y-2">
                  {selectedFeature.details.rules.map((rule, i) => (
                    <li key={i} className="flex items-start gap-3 text-foreground-secondary text-sm">
                      <span className="text-accent mt-0.5">•</span>
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Tips */}
              <div className="p-4 rounded-xl bg-accent/10 border border-accent/20">
                <h4 className="text-accent text-sm font-semibold mb-2">전략 팁</h4>
                <p className="text-foreground-secondary text-sm leading-relaxed">
                  {selectedFeature.details.tips}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
