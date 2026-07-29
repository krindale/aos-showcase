'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import HeroBoardVignette from './HeroBoardVignette';
import { RULEBOOK_URL } from './Navigation';
import { useEnterMotion } from '@/hooks/useEnterMotion';

/* 온라인 로비 직행 — 기본 맵 셋업 화면을 ?mode=online으로 열면 온라인 탭이 선택된다
   (GamePageClient의 setupTab 초기값이 이 쿼리를 읽는다). 맵은 로비에서 방을 만들 때 정해지므로
   기본 맵(rust-belt)으로 보낸다. */
const ONLINE_ENTRY = '/game/rust-belt/?mode=online';

/* ⚠️ '수록 맵' 수는 src/app/maps/page.tsx의 maps 배열 길이와 맞춰야 한다.
   (맵 데이터를 여기서 import하면 홈 번들에 맵 프로파일 전체가 딸려오므로 숫자만 둔다) */
const stats = [
  { v: '1–6', l: '플레이어' },
  { v: '120분', l: '플레이 시간' },
  { v: '11', l: '수록 맵' },
  { v: '2002', l: '최초 출시' },
] as const;

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
              혼자 온 방문자가 상대를 기다리지 않도록 봇 게임을 바로 옆에 나란히 둔다.
              Link 안에 button을 넣으면 <a><button> 중첩이라 유효하지 않은 마크업이 된다. */}
          <div className="mt-[38px] flex flex-wrap items-center gap-3">
            <Link href={ONLINE_ENTRY} className="btn-primary inline-block">
              친구와 온라인 플레이 →
            </Link>
            <Link href="/maps" className="btn-secondary inline-block">
              봇과 바로 시작
            </Link>
          </div>
          <div className="mt-[18px] flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px]">
            <Link
              href="/gameplay"
              className="font-medium text-foreground-secondary underline-offset-4 transition-colors hover:text-accent hover:underline"
            >
              게임 살펴보기
            </Link>
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
