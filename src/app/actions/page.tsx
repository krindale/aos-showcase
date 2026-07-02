'use client';

import { motion } from 'framer-motion';
import {
  FastForward,
  Flag,
  Rows4,
  Train,
  Building2,
  Boxes,
  ListOrdered,
  type LucideIcon,
} from 'lucide-react';

/* 룰북 기준 7가지 특수 액션 — 설명·구현 단계·상세·팁은 구 웹페이지 콘텐츠 계승 */
const specialActions: {
  n: number;
  t: string;
  en: string;
  d: string;
  phase: string;
  details: string[];
  tip: string;
  icon: LucideIcon;
}[] = [
  {
    n: 1,
    t: '먼저 이동',
    en: 'First Move',
    d: '물품 이동 단계에서 플레이어 순서와 관계없이 먼저 물품을 이동합니다.',
    phase: 'Move Goods 단계',
    details: ['두 라운드 모두 먼저 물품 이동', '플레이어 순서 무시', '중요한 물품 선점 가능'],
    tip: '경쟁이 치열한 물품을 먼저 운송해야 할 때 선택하세요. 다른 플레이어보다 먼저 수입을 확보할 수 있습니다.',
    icon: FastForward,
  },
  {
    n: 2,
    t: '먼저 건설',
    en: 'First Build',
    d: '트랙 건설 단계에서 플레이어 순서와 관계없이 먼저 트랙을 건설합니다.',
    phase: 'Build Track 단계',
    details: ['1번 플레이어보다 먼저 건설', '핵심 루트 선점', '상대 차단 전략'],
    tip: '중요한 연결 지점을 먼저 확보하거나 상대의 확장을 차단해야 할 때 유용합니다.',
    icon: Flag,
  },
  {
    n: 3,
    t: '기관사',
    en: 'Engineer',
    d: '이번 턴에 트랙 타일을 3개 대신 4개까지 건설할 수 있습니다.',
    phase: 'Build Track 단계',
    details: ['트랙 타일 4개 건설 가능', '빠른 네트워크 확장', '긴 노선 한 턴에 완성'],
    tip: '긴 노선을 빠르게 완성하거나 대규모 확장이 필요할 때 선택하세요.',
    icon: Rows4,
  },
  {
    n: 4,
    t: '기관차',
    en: 'Locomotive',
    d: '즉시 엔진 트랙에서 디스크를 1링크 위로 이동합니다 (최대 6링크).',
    phase: '즉시 적용',
    details: ['기관차 레벨 +1 (즉시)', '물품 운송 거리 증가', '최대 6링크까지 가능'],
    tip: '장거리 운송이 필요하거나 경쟁자보다 먼저 높은 기관차 레벨에 도달하고 싶을 때 선택하세요.',
    icon: Train,
  },
  {
    n: 5,
    t: '도시화',
    en: 'Urbanization',
    d: '트랙 건설 전에 마을 헥스에 신규 도시 타일을 배치합니다.',
    phase: 'Build Track 단계',
    details: ['마을 → 신규 도시 변환', '새로운 물품 목적지 생성', '배치는 무료, 트랙 3개 건설 가능'],
    tip: '새로운 물품 목적지가 필요하거나 네트워크의 허브를 만들고 싶을 때 선택하세요.',
    icon: Building2,
  },
  {
    n: 6,
    t: '생산',
    en: 'Production',
    d: '물품 성장 단계 시작 시, 주머니에서 큐브 2개를 뽑아 물품 디스플레이 빈 칸에 배치합니다.',
    phase: 'Goods Growth 단계',
    details: ['물품 큐브 2개 추가 배치', '물품 디스플레이 빈 칸에 배치', '첫 턴에는 빈 칸이 없어 무의미'],
    tip: '운송할 물품이 부족하거나 특정 도시에 물품을 추가하고 싶을 때 유용합니다.',
    icon: Boxes,
  },
  {
    n: 7,
    t: '순서 패스',
    en: 'Turn Order Pass',
    d: '다음 플레이어 순서 결정 경매에서 입찰 없이 "패스"를 1회 선언할 수 있습니다.',
    phase: 'Determine Player Order 단계',
    details: ['경매에서 패스 1회 가능', '입찰 없이 경매 유지', '비용 절약하며 순서 경쟁'],
    tip: '현금이 부족하지만 좋은 순서를 원할 때, 또는 상대의 입찰을 관망하고 싶을 때 선택하세요.',
    icon: ListOrdered,
  },
];

export default function ActionsPage() {
  return (
    <div>
      {/* 헤더 */}
      <section className="mx-auto max-w-[1200px] px-[clamp(18px,5vw,56px)] pb-[clamp(30px,4vw,48px)] pt-[clamp(48px,7vw,92px)]">
        <div className="mb-4 font-display text-xs font-medium tracking-[0.16em] text-accent">
          SPECIAL ACTIONS / 특수 액션
        </div>
        <h1 className="mb-[18px] text-[clamp(30px,6vw,60px)] font-bold leading-[1.04] tracking-[-0.04em]">
          일곱 장의 카드, 일곱 가지 전략
        </h1>
        <p className="max-w-[620px] text-base leading-[1.8] text-foreground-secondary">
          매 라운드 각 플레이어는 단 하나의 특수 액션만 가져갈 수 있습니다. 남이
          집으면 나는 못 씁니다 — 무엇을 양보할지가 곧 실력입니다.
        </p>
      </section>

      {/* 카드 그리드 */}
      <section className="mx-auto max-w-[1200px] px-[clamp(18px,5vw,56px)] pb-[clamp(48px,7vw,90px)]">
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 lg:grid-cols-3">
          {specialActions.map((act, i) => {
            const Icon = act.icon;
            return (
              <motion.div
                key={act.n}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="glass-card relative flex flex-col p-7 transition-colors hover:border-accent"
              >
                <div className="absolute right-5 top-[18px] font-display text-[13px] font-semibold text-[#d9d1c1]">
                  0{act.n}
                </div>
                <div className="mb-4 flex items-center gap-[14px]">
                  <div className="flex h-12 w-12 flex-none items-center justify-center rounded-[13px] bg-accent/10">
                    <Icon className="h-[26px] w-[26px] text-accent" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold leading-[1.1] tracking-[-0.02em] text-foreground">
                      {act.t}
                    </h3>
                    <div className="mt-[3px] font-display text-xs tracking-wide text-[#a39d91]">
                      {act.en}
                    </div>
                  </div>
                </div>

                {/* 구현 단계 배지 */}
                <div className="mb-3 inline-flex w-fit items-center gap-[6px] rounded-full bg-background-tertiary px-[10px] py-1 font-display text-[11px] font-medium text-foreground-secondary">
                  <span className="h-[5px] w-[5px] rounded-full bg-accent" />
                  {act.phase}
                </div>

                <p className="mb-4 text-[14.5px] leading-[1.7] text-[#54504a]">{act.d}</p>

                {/* 효과 상세 */}
                <ul className="mb-4 space-y-[6px]">
                  {act.details.map((detail) => (
                    <li key={detail} className="flex gap-2 text-[13.5px] leading-[1.6] text-foreground-secondary">
                      <span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-[#c9c1b1]" />
                      {detail}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex gap-[10px] border-t border-[#ebe6dc] pt-[14px]">
                  <span className="mt-[2px] flex-none font-display text-[10px] font-semibold tracking-[0.1em] text-accent">
                    TIP
                  </span>
                  <span className="text-[13.5px] leading-[1.6] text-foreground-secondary">
                    {act.tip}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
