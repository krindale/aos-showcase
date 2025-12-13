'use client';

import { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Crown,
  Gauge,
  UserPlus,
  Building2,
  Factory,
  Train,
  Package,
  Info
} from 'lucide-react';

const actions = [
  {
    id: 1,
    code: '1st',
    title: '선턴권',
    titleEn: 'First Move',
    icon: Crown,
    color: 'steam-yellow',
    bgGradient: 'from-steam-yellow/20 via-steam-yellow/5 to-transparent',
    description: '다음 턴 경매에서 자동으로 1순위가 됩니다.',
    details: [
      '경매 비용 없이 선턴 확보',
      '전략적 우위 선점',
      '다음 턴 특수 행동 우선권',
    ],
    tip: '중요한 특수 행동을 확보하거나 트랙 건설 우선권이 필요할 때 유용합니다.',
  },
  {
    id: 2,
    code: 'ENG',
    title: '기관차 업그레이드',
    titleEn: 'Engineer',
    icon: Gauge,
    color: 'steam-red',
    bgGradient: 'from-steam-red/20 via-steam-red/5 to-transparent',
    description: '기관차 레벨을 2단계 올립니다.',
    details: [
      '기관차 레벨 +2',
      '물품 운송 거리 증가',
      '수입 잠재력 상승',
    ],
    tip: '장거리 운송이 필요하거나 경쟁자보다 먼저 높은 레벨에 도달하고 싶을 때 선택하세요.',
  },
  {
    id: 3,
    code: 'LOC',
    title: '기관사 고용',
    titleEn: 'Locomotive',
    icon: UserPlus,
    color: 'steam-blue',
    bgGradient: 'from-steam-blue/20 via-steam-blue/5 to-transparent',
    description: '기관차 레벨을 1단계 올리고, 물품 이동을 먼저 합니다.',
    details: [
      '기관차 레벨 +1',
      '물품 이동 우선권',
      '전략적 운송 타이밍',
    ],
    tip: '특정 물품을 먼저 확보해야 할 때 선택하세요. 경쟁이 치열한 노선에서 유리합니다.',
  },
  {
    id: 4,
    code: 'URB',
    title: '도시화',
    titleEn: 'Urbanization',
    icon: Building2,
    color: 'steam-purple',
    bgGradient: 'from-steam-purple/20 via-steam-purple/5 to-transparent',
    description: '마을을 새로운 도시로 업그레이드합니다.',
    details: [
      '마을 → 도시 변환',
      '새로운 연결 포인트',
      '물품 수요 생성',
    ],
    tip: '새로운 물품 목적지가 필요하거나 네트워크 확장이 필요할 때 선택하세요.',
  },
  {
    id: 5,
    code: 'PRO',
    title: '생산',
    titleEn: 'Production',
    icon: Factory,
    color: 'steam-green',
    bgGradient: 'from-steam-green/20 via-steam-green/5 to-transparent',
    description: '생산 차트에서 물품 큐브 2개를 즉시 생산합니다.',
    details: [
      '물품 큐브 2개 즉시 생산',
      '운송 기회 증가',
      '전략적 물품 배치',
    ],
    tip: '운송할 물품이 부족하거나 특정 색상의 물품이 필요할 때 유용합니다.',
  },
  {
    id: 6,
    code: 'TRK',
    title: '트랙 추가',
    titleEn: 'Track',
    icon: Train,
    color: 'accent',
    bgGradient: 'from-accent/20 via-accent/5 to-transparent',
    description: '이번 턴에 트랙을 1개 더 건설할 수 있습니다.',
    details: [
      '추가 트랙 건설권',
      '총 4개 트랙 가능',
      '네트워크 확장 가속',
    ],
    tip: '긴 노선을 빠르게 완성하거나 경쟁자를 차단해야 할 때 선택하세요.',
  },
  {
    id: 7,
    code: 'PRD',
    title: '생산 조절',
    titleEn: 'Production',
    icon: Package,
    color: 'steam-yellow',
    bgGradient: 'from-steam-yellow/20 via-steam-yellow/5 to-transparent',
    description: '도시에서 물품 큐브 1개를 생산하거나 제거합니다.',
    details: [
      '물품 큐브 추가/제거',
      '시장 조절',
      '전략적 물품 관리',
    ],
    tip: '특정 색상의 물품을 조절하여 자신에게 유리한 상황을 만들 때 사용합니다.',
  },
];

function ActionCard({ action, index }: { action: typeof actions[0]; index: number }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="perspective-1000"
    >
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 100 }}
        className="relative w-full h-[400px] cursor-pointer preserve-3d"
        onClick={() => setIsFlipped(!isFlipped)}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 glass-card p-6 rounded-2xl backface-hidden"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${action.bgGradient} opacity-50`} />

          <div className="relative h-full flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className={`w-14 h-14 rounded-2xl bg-${action.color}/20
                flex items-center justify-center`}>
                <action.icon className={`w-7 h-7 text-${action.color}`} />
              </div>
              <div className={`px-3 py-1 rounded-full bg-${action.color}/20
                text-${action.color} text-sm font-bold`}>
                {action.code}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1">
              <h3 className="font-display text-2xl font-bold text-foreground mb-2">
                {action.title}
              </h3>
              <p className="text-accent text-sm mb-4">{action.titleEn}</p>
              <p className="text-foreground-secondary leading-relaxed">
                {action.description}
              </p>
            </div>

            {/* Flip Indicator */}
            <div className="flex items-center justify-center gap-2 text-foreground-muted text-sm">
              <Info className="w-4 h-4" />
              <span>클릭하여 상세 정보 보기</span>
            </div>
          </div>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 glass-card p-6 rounded-2xl backface-hidden"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${action.bgGradient}`} />

          <div className="relative h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 rounded-xl bg-${action.color}/20
                flex items-center justify-center`}>
                <action.icon className={`w-5 h-5 text-${action.color}`} />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-foreground">
                  {action.title}
                </h3>
                <p className="text-accent text-xs">{action.titleEn}</p>
              </div>
            </div>

            {/* Details */}
            <div className="flex-1 space-y-4">
              <div>
                <h4 className="text-foreground text-sm font-semibold mb-2">
                  효과
                </h4>
                <ul className="space-y-2">
                  {action.details.map((detail, i) => (
                    <li key={i} className="flex items-center gap-2 text-foreground-secondary text-sm">
                      <div className={`w-1.5 h-1.5 rounded-full bg-${action.color}`} />
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>

              <div className={`p-4 rounded-xl bg-${action.color}/10`}>
                <h4 className={`text-${action.color} text-sm font-semibold mb-1`}>
                  전략 팁
                </h4>
                <p className="text-foreground-secondary text-sm">
                  {action.tip}
                </p>
              </div>
            </div>

            {/* Flip Back */}
            <div className="flex items-center justify-center gap-2 text-foreground-muted text-sm">
              <Info className="w-4 h-4" />
              <span>클릭하여 뒤집기</span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function ActionsPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const isHeroInView = useInView(heroRef, { once: true });

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
              Special Actions
            </span>
            <h1 className="font-display text-5xl md:text-6xl font-bold text-foreground mb-6">
              7가지 <span className="text-gradient">특수 행동</span>
            </h1>
            <p className="text-foreground-secondary max-w-2xl mx-auto text-lg">
              매 턴 경매 후, 각 플레이어는 7가지 특수 행동 중 하나를 선택합니다.
              이미 선택된 행동은 다른 플레이어가 선택할 수 없습니다.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Action Cards Grid */}
      <section className="py-24 relative">
        <div className="absolute inset-0 hex-pattern opacity-30" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {actions.map((action, index) => (
              <ActionCard key={action.id} action={action} index={index} />
            ))}
          </div>

          {/* Info Box */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mt-16 glass-card p-8 rounded-2xl"
          >
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center flex-shrink-0">
                <Info className="w-7 h-7 text-accent" />
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold text-foreground mb-3">
                  행동 선택 규칙
                </h3>
                <ul className="space-y-2 text-foreground-secondary">
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">•</span>
                    <span>턴 순서대로 행동을 선택합니다. 선턴 플레이어가 유리합니다.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">•</span>
                    <span>이미 선택된 행동은 이번 턴에 다른 플레이어가 선택할 수 없습니다.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">•</span>
                    <span>연속으로 같은 행동을 선택할 수 없습니다 (맵에 따라 다름).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">•</span>
                    <span>행동은 트랙 건설 단계 전에 효과가 적용됩니다.</span>
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CSS for 3D flip */}
      <style jsx global>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        .preserve-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
      `}</style>
    </div>
  );
}
