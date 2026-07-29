'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ExternalLink, Zap } from 'lucide-react';
import HeroBoardVignette from './HeroBoardVignette';
import { RULEBOOK_URL } from './Navigation';
import { useEnterMotion } from '@/hooks/useEnterMotion';
import { maps } from '@/data/mapCatalog';

/* 온라인 진입은 각각 전용 화면 — 게임 화면의 셋업 탭을 재사용하지 않는다.
   두 화면 모두 "방에 들어가는 지점"까지만 담당하고, 방이 생기면 /game/<맵>/의 대기실로 넘긴다. */
const ONLINE_ENTRY = '/online/';
const QUICK_JOIN_ENTRY = '/online/quick/';

/* '수록 맵' 수는 mapCatalog에서 파생 — 맵을 추가/삭제해도 자동으로 맞는다(수동 동기화 불필요).
   mapCatalog는 순수 데이터 배열(맵 프로파일 import 없음)이라 홈 번들 영향은 미미하다. */
const stats = [
  { v: '1–6', l: '플레이어' },
  { v: '120분', l: '플레이 시간' },
  { v: String(maps.length), l: '수록 맵' },
  { v: '2002', l: '최초 출시' },
];

export default function HeroSection() {
  const { enter } = useEnterMotion();

  return (
    <section className="hex-pattern relative overflow-hidden border-b border-glass-border">
      {/* 우상단 버밀리언 라디얼 틴트 */}
      <div className="absolute inset-0 bg-hero-gradient" />

      <div className="hero-compact relative mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-[clamp(32px,4vw,56px)] px-[clamp(18px,5vw,56px)] pb-[clamp(46px,7vw,84px)] pt-[clamp(58px,9vw,126px)] lg:grid-cols-[minmax(0,1fr)_clamp(320px,34vw,420px)]">
        <motion.div {...enter({ y: 14, ease: 'easeOut' })}>
          {/* Badge */}
          <div className="mb-[30px] inline-flex items-center gap-[9px] rounded-full border border-[#ddd6c8] bg-[#fffdf8] px-[13px] py-[6px] font-display text-[11px] font-medium tracking-[0.14em] text-foreground-secondary">
            <span className="h-[6px] w-[6px] rounded-full bg-accent" />
            MARTIN WALLACE · 2002
          </div>

          <h1 className="hero-title text-[clamp(54px,12vw,150px)] text-foreground">
            Age of
            <br />
            <span className="text-accent">Steam</span>
          </h1>

          <p className="mt-7 text-[clamp(21px,3.4vw,40px)] font-bold tracking-[-0.03em] text-foreground">
            증기와 강철로 대륙을 잇다
          </p>
          <p className="mt-4 max-w-[558px] text-[clamp(15px,1.6vw,18px)] leading-[1.78] text-foreground-secondary">
            선로를 깔고, 도시를 잇고, 상품을 실어 나르세요. 주식과 자금, 그리고
            입찰의 수싸움 속에서 가장 번창한 철도 제국을 세우는 사람이 승리합니다.
          </p>

          {/* 이 사이트의 강점은 설치 없이 브라우저에서 되는 온라인 대전 — 1차 CTA로 둔다.
              (봇 게임 진입은 상단 "게임 플레이" 버튼이 담당)
              Link 안에 button을 넣으면 <a><button> 중첩이라 유효하지 않은 마크업이 된다. */}
          <div className="mt-[38px] flex flex-wrap items-center gap-3">
            <Link href={ONLINE_ENTRY} className="btn-primary inline-block">
              친구와 온라인 플레이 →
            </Link>
            <Link href="/gameplay" className="btn-secondary inline-block">
              How to Play
            </Link>
          </div>
          {/* 방을 만들 상대가 없어도 바로 낄 수 있는 경로 — 로비 진입 즉시 빠른 매칭 1회 */}
          <div className="mt-[14px]">
            <Link
              href={QUICK_JOIN_ENTRY}
              className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-accent underline-offset-4 transition-colors hover:underline"
            >
              <Zap className="h-[15px] w-[15px]" aria-hidden />
              또는 빈 방에 바로 참가하기 →
            </Link>
          </div>
          <div className="mt-[18px] flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px]">
            <a
              href={RULEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-foreground-secondary underline-offset-4 transition-colors hover:text-accent hover:underline"
            >
              공식 룰북 (PDF)
              <ExternalLink className="h-[13px] w-[13px]" aria-hidden />
              <span className="sr-only">(새 탭에서 열림)</span>
            </a>
          </div>
        </motion.div>

        {/* 타이틀 우측 — 움직이는 게임 샘플 (모바일에선 숨김) */}
        <motion.div
          {...enter({ y: 14, ease: 'easeOut', delay: 0.12 })}
          className="hidden lg:block"
        >
          <HeroBoardVignette />
        </motion.div>
      </div>

      {/* STAT BAR */}
      <div className="relative border-t border-glass-border bg-[rgba(255,253,248,0.6)]">
        <div className="mx-auto grid max-w-[1200px] grid-cols-2 px-[clamp(18px,5vw,56px)] md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.l} className="border-l border-glass-border px-4 py-[26px]">
              <div className="counter-number text-[clamp(30px,4vw,44px)] leading-none">
                {stat.v}
              </div>
              <div className="mt-[9px] text-[12.5px] text-foreground-muted">{stat.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
