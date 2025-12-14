'use client';

import { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Truck,
  Hammer,
  Wrench,
  Train,
  Building2,
  Factory,
  RotateCcw,
  Info
} from 'lucide-react';

// 룰북 기준 정확한 7가지 특수 행동
const actions = [
  {
    id: 1,
    code: '1st',
    title: '선이동',
    titleEn: 'First Move',
    icon: Truck,
    color: 'steam-green',
    bgGradient: 'from-steam-green/20 via-steam-green/5 to-transparent',
    description: '물품 이동 단계에서 플레이어 순서와 관계없이 먼저 물품을 이동합니다.',
    phase: 'Move Goods 단계',
    details: [
      '두 라운드 모두 먼저 물품 이동',
      '플레이어 순서 무시',
      '중요한 물품 선점 가능',
    ],
    tip: '경쟁이 치열한 물품을 먼저 운송해야 할 때 선택하세요. 다른 플레이어보다 먼저 수입을 확보할 수 있습니다.',
  },
  {
    id: 2,
    code: '2nd',
    title: '선건설',
    titleEn: 'First Build',
    icon: Hammer,
    color: 'steam-blue',
    bgGradient: 'from-steam-blue/20 via-steam-blue/5 to-transparent',
    description: '트랙 건설 단계에서 플레이어 순서와 관계없이 먼저 트랙을 건설합니다.',
    phase: 'Build Track 단계',
    details: [
      '1번 플레이어보다 먼저 건설',
      '핵심 루트 선점',
      '상대 차단 전략',
    ],
    tip: '중요한 연결 지점을 먼저 확보하거나 상대의 확장을 차단해야 할 때 유용합니다.',
  },
  {
    id: 3,
    code: 'ENG',
    title: '엔지니어',
    titleEn: 'Engineer',
    icon: Wrench,
    color: 'accent',
    bgGradient: 'from-accent/20 via-accent/5 to-transparent',
    description: '이번 턴에 트랙 타일을 3개 대신 4개까지 건설할 수 있습니다.',
    phase: 'Build Track 단계',
    details: [
      '트랙 타일 4개 건설 가능',
      '빠른 네트워크 확장',
      '긴 노선 한 턴에 완성',
    ],
    tip: '긴 노선을 빠르게 완성하거나 대규모 확장이 필요할 때 선택하세요.',
  },
  {
    id: 4,
    code: 'LOC',
    title: '기관차',
    titleEn: 'Locomotive',
    icon: Train,
    color: 'steam-red',
    bgGradient: 'from-steam-red/20 via-steam-red/5 to-transparent',
    description: '즉시 엔진 트랙에서 디스크를 1링크 위로 이동합니다. (최대 6링크)',
    phase: '즉시 적용',
    details: [
      '기관차 레벨 +1 (즉시)',
      '물품 운송 거리 증가',
      '최대 6링크까지 가능',
    ],
    tip: '장거리 운송이 필요하거나 경쟁자보다 먼저 높은 기관차 레벨에 도달하고 싶을 때 선택하세요.',
  },
  {
    id: 5,
    code: 'URB',
    title: '도시화',
    titleEn: 'Urbanization',
    icon: Building2,
    color: 'steam-purple',
    bgGradient: 'from-steam-purple/20 via-steam-purple/5 to-transparent',
    description: '트랙 건설 전에 마을 헥스에 신규 도시 타일을 배치합니다.',
    phase: 'Build Track 단계',
    details: [
      '마을 → 신규 도시 변환',
      '새로운 물품 목적지 생성',
      '배치는 무료, 트랙 3개 건설 가능',
    ],
    tip: '새로운 물품 목적지가 필요하거나 네트워크의 허브를 만들고 싶을 때 선택하세요.',
  },
  {
    id: 6,
    code: 'PRO',
    title: '생산',
    titleEn: 'Production',
    icon: Factory,
    color: 'steam-yellow',
    bgGradient: 'from-steam-yellow/20 via-steam-yellow/5 to-transparent',
    description: '물품 보충 단계 시작 시, 주머니에서 큐브 2개를 뽑아 물품 디스플레이 빈 칸에 배치합니다.',
    phase: 'Goods Growth 단계',
    details: [
      '물품 큐브 2개 추가 배치',
      '물품 디스플레이 빈 칸에 배치',
      '첫 턴에는 빈 칸이 없어 무의미',
    ],
    tip: '운송할 물품이 부족하거나 특정 도시에 물품을 추가하고 싶을 때 유용합니다.',
  },
  {
    id: 7,
    code: 'T/O',
    title: '턴 순서',
    titleEn: 'Turn Order',
    icon: RotateCcw,
    color: 'steam-blue',
    bgGradient: 'from-steam-blue/20 via-steam-blue/5 to-transparent',
    description: '다음 플레이어 순서 결정 경매에서 "패스"를 1회 선언하여 입찰 없이 경매에 남을 수 있습니다.',
    phase: 'Determine Player Order 단계',
    details: [
      '경매에서 패스 1회 가능',
      '입찰 없이 경매 유지',
      '비용 절약하며 순서 경쟁',
    ],
    tip: '현금이 부족하지만 좋은 순서를 원할 때, 또는 상대의 입찰을 관망하고 싶을 때 선택하세요.',
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
        className="relative w-full h-[420px] cursor-pointer preserve-3d"
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
            <div className="flex items-start justify-between mb-4">
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
              <h3 className="font-display text-2xl font-bold text-foreground mb-1">
                {action.title}
              </h3>
              <p className="text-accent text-sm mb-2">{action.titleEn}</p>

              {/* Phase Badge */}
              <div className="inline-block px-2 py-1 rounded bg-glass text-foreground-muted text-xs mb-3">
                {action.phase}
              </div>

              <p className="text-foreground-secondary leading-relaxed text-sm">
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
            <div className="flex items-center gap-3 mb-4">
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
              플레이어 순서대로 7가지 특수 행동 중 하나를 선택합니다.
              <br />
              각 행동은 한 명만 선택할 수 있으며, 선턴 플레이어가 유리합니다.
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
                    <span>플레이어 순서대로 행동을 선택합니다. 선턴 플레이어가 유리합니다.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">•</span>
                    <span>이미 선택된 행동은 이번 턴에 다른 플레이어가 선택할 수 없습니다.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">•</span>
                    <span>Locomotive 행동만 즉시 적용되고, 나머지는 해당 단계에서 효과가 발동합니다.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">•</span>
                    <span>Production 행동은 첫 턴에는 물품 디스플레이에 빈 칸이 없어 선택해도 의미가 없습니다.</span>
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>

          {/* Action Timing Summary */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-8 glass-card p-8 rounded-2xl"
          >
            <h3 className="font-display text-xl font-semibold text-foreground mb-6">
              행동 적용 시점
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-steam-red/10 border border-steam-red/30">
                <div className="text-steam-red font-bold text-sm mb-2">즉시</div>
                <div className="text-foreground-secondary text-sm">Locomotive</div>
              </div>
              <div className="p-4 rounded-xl bg-accent/10 border border-accent/30">
                <div className="text-accent font-bold text-sm mb-2">Build Track 단계</div>
                <div className="text-foreground-secondary text-sm">First Build, Engineer, Urbanization</div>
              </div>
              <div className="p-4 rounded-xl bg-steam-green/10 border border-steam-green/30">
                <div className="text-steam-green font-bold text-sm mb-2">Move Goods 단계</div>
                <div className="text-foreground-secondary text-sm">First Move</div>
              </div>
              <div className="p-4 rounded-xl bg-steam-purple/10 border border-steam-purple/30">
                <div className="text-steam-purple font-bold text-sm mb-2">기타 단계</div>
                <div className="text-foreground-secondary text-sm">Production (Goods Growth), Turn Order (경매)</div>
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
