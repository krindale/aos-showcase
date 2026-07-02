'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const features = [
  {
    n: '01',
    t: '선로 건설',
    d: '지형에 맞춰 선로 타일을 놓아 도시를 잇습니다. 평지·강·산악마다 비용이 달라 노선 설계가 곧 전략이 됩니다.',
  },
  {
    n: '02',
    t: '상품 배송',
    d: '큐브와 같은 색의 도시까지 상품을 옮깁니다. 거쳐 간 링크 수만큼 소득이 오릅니다.',
  },
  {
    n: '03',
    t: '주식과 자금',
    d: '주식을 발행해 초기 자금을 마련하지만, 그만큼 매 턴 갚아야 할 비용이 늘어납니다.',
  },
  {
    n: '04',
    t: '턴 순서 경매',
    d: '매 라운드 행동 순서를 돈으로 입찰합니다. 먼저 움직일 권리에 값을 매기세요.',
  },
] as const;

export default function FeatureCards() {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section
      ref={ref}
      className="mx-auto max-w-[1200px] px-[clamp(18px,5vw,56px)] py-[clamp(58px,8vw,108px)]"
    >
      <div className="mb-4 font-display text-xs font-medium tracking-[0.16em] text-accent">
        01 / 핵심 경험
      </div>
      <h2 className="mb-[46px] text-[clamp(28px,5vw,52px)] font-bold leading-[1.1] tracking-[-0.035em]">
        네 개의 톱니가 맞물리는 엔진
      </h2>
      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feat, i) => (
          <motion.div
            key={feat.n}
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="glass-card card-hover px-[26px] pb-8 pt-[30px]"
          >
            <div className="font-display text-[15px] font-semibold tracking-wide text-accent">
              {feat.n}
            </div>
            <h3 className="mb-3 mt-4 text-[22px] font-bold tracking-[-0.02em] text-foreground">
              {feat.t}
            </h3>
            <p className="text-[14.5px] leading-[1.78] text-foreground-secondary">{feat.d}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
