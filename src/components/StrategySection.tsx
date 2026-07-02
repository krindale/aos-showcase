'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';

/* 룰북·실전에서 뽑은 여섯 가지 승리 원칙 */
const strategies = [
  {
    n: '01',
    t: '주식은 빚이다',
    d: '주식 1장은 매 턴 $1의 비용이고 게임 종료 시 −3점입니다. 계획에 필요한 만큼만, 최대한 늦게 발행하세요.',
  },
  {
    n: '02',
    t: '기관차가 사정거리다',
    d: '배송 거리는 기관차 레벨이 정합니다. 초반의 업그레이드 한 번이 중반 이후의 긴 배송과 큰 소득을 좌우합니다.',
  },
  {
    n: '03',
    t: '도시화로 판을 바꿔라',
    d: '마을에 새 도시를 세우면 갈 곳 없던 화물의 목적지가 생기고, 그 도시는 내 노선의 허브가 됩니다. 내 선로가 닿는 마을에, 보드에 목적지가 부족한 색을 고르는 것이 요령입니다.',
  },
  {
    n: '04',
    t: '경매는 절실할 때만',
    d: '순서가 결정적인 턴에만 지갑을 여세요. 평범한 턴의 양보는 손해가 아니라, 다음 승부처를 위한 저축입니다.',
  },
  {
    n: '05',
    t: '남의 선로도 내 무기',
    d: '화물이 상대 링크를 지나면 소득은 상대의 것. 반대로 내 링크를 지나게 만들면 남의 배송으로도 내가 성장합니다.',
  },
  {
    n: '06',
    t: '선로보다 화물이 먼저다',
    d: '노선을 정하기 전에 보드 위의 큐브부터 읽으세요. 어떤 화물을 어느 도시로 나를지가 정해지면, 깔아야 할 선로는 저절로 정해집니다.',
  },
] as const;

export default function StrategySection() {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <>
      {/* 승리의 감각 — 전략 원칙 */}
      <section
        ref={ref}
        className="mx-auto max-w-[1200px] px-[clamp(18px,5vw,56px)] py-[clamp(58px,8vw,108px)]"
      >
        <div className="mb-4 font-display text-xs font-medium tracking-[0.16em] text-accent">
          02 / 승리의 감각
        </div>
        <h2 className="mb-[46px] text-[clamp(28px,5vw,52px)] font-bold leading-[1.1] tracking-[-0.035em]">
          철도왕들이 지키는 여섯 가지 원칙
        </h2>
        <div className="grid grid-cols-1 gap-x-[clamp(24px,4vw,56px)] md:grid-cols-2">
          {strategies.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: i * 0.06 }}
              className="grid grid-cols-[64px_1fr] items-start gap-[clamp(12px,2vw,22px)] border-t border-glass-border py-6"
            >
              <div className="text-right font-display text-[clamp(30px,4vw,44px)] font-semibold leading-[0.9] tracking-[-0.02em] text-[#d9d1c1]">
                {s.n}
              </div>
              <div>
                <h3 className="text-lg font-bold tracking-[-0.02em] text-foreground">{s.t}</h3>
                <p className="mt-2 text-[14.5px] leading-[1.75] text-foreground-secondary">
                  {s.d}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 마무리 — 플레이 유도 밴드 */}
      <section className="mx-auto max-w-[1200px] px-[clamp(18px,5vw,56px)] pb-[clamp(48px,7vw,92px)]">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-[22px] bg-accent p-[clamp(34px,5vw,58px)] shadow-glow-lg">
          <div>
            <h2 className="mb-2 text-[clamp(24px,3.6vw,38px)] font-bold tracking-[-0.03em] text-[#fffdf8]">
              이제 보드에서 만나요
            </h2>
            <p className="max-w-[470px] text-base leading-[1.6] text-[#f6ddd3]">
              튜토리얼부터 한국·독일·서부 미국까지 — 설치 없이 브라우저에서 AI와
              바로 플레이할 수 있습니다.
            </p>
          </div>
          <Link href="/maps">
            <button className="whitespace-nowrap rounded-xl bg-foreground px-[30px] py-4 font-bold text-[#fffdf8] transition-colors hover:bg-black">
              맵 골라 플레이하기 →
            </button>
          </Link>
        </div>
      </section>
    </>
  );
}
