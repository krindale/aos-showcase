'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Train } from 'lucide-react';

/** 공식 룰북 PDF — 퍼블리셔가 공식 사이트에서 안내하는 공개 구글 드라이브 배포본 */
export const RULEBOOK_URL =
  'https://drive.google.com/file/d/1FC5evRrUeT1gc33DLSJzed03TX6fgiiS/view';

const navItems = [
  { href: '/', label: '홈', external: false },
  { href: '/gameplay', label: '게임플레이', external: false },
  { href: '/actions', label: '특수 액션', external: false },
  { href: '/maps', label: '맵', external: false },
  // 계산기 메뉴 자리를 공식 룰북 링크로 교체 (2026-07-04 — /calculator 페이지 자체는 유지)
  { href: RULEBOOK_URL, label: '룰북', external: true },
] as const;

/** 버밀리언 사각 + 흰 열차(lucide Train) 로고 마크 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex flex-none items-center justify-center rounded-lg bg-accent"
      style={{ width: size, height: size }}
    >
      <Train color="#fffdf8" size={size * 0.62} strokeWidth={2.2} aria-hidden />
    </div>
  );
}

export default function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  // trailingSlash: true라 pathname이 '/gameplay/'처럼 나옴 — 끝 슬래시를 떼고 비교 (루트는 '/' 유지)
  const activePath = pathname.replace(/\/+$/, '') || '/';

  return (
    <header className="sticky top-0 z-50 border-b border-glass-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-[66px] max-w-[1200px] items-center justify-between px-[clamp(18px,5vw,56px)]">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-[11px]">
          <LogoMark />
          <div className="leading-[1.05]">
            <div className="font-display text-base font-semibold tracking-tight text-foreground">
              Age of Steam
            </div>
            <div className="mt-px text-[10px] tracking-wide text-foreground-muted">
              철도 경영 전략 게임
            </div>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const isActive = !item.external && activePath === item.href;
            const className = `relative rounded-lg px-[15px] py-[9px] text-sm font-medium transition-colors ${
              isActive
                ? 'text-foreground'
                : 'text-foreground-secondary hover:bg-glass-hover hover:text-foreground'
            }`;
            if (item.external) {
              // 외부(구글 드라이브) 이동임을 아이콘으로 알린다 — 내부 메뉴와 똑같아 보이면
              // 사이트를 벗어나는지 예측할 수 없다
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${className} inline-flex items-center gap-1.5`}
                >
                  {item.label}
                  <ExternalLink className="h-[13px] w-[13px]" aria-hidden />
                  <span className="sr-only">(새 탭에서 열림)</span>
                </a>
              );
            }
            return (
              <Link key={item.href} href={item.href} className={className}>
                {item.label}
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute bottom-[2px] left-[15px] right-[15px] h-[2px] rounded-full bg-accent"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </Link>
            );
          })}
          {/* 히어로 1차 CTA와 같은 목적지(/maps)로 통일 — 라벨이 "튜토리얼"이면
              맵 갤러리의 튜토리얼 카드와 용어가 충돌한다 */}
          <Link
            href="/maps"
            className="ml-2 rounded-[10px] bg-accent px-4 py-2 text-sm font-bold text-[#fffdf8] shadow-glow transition-colors hover:bg-accent-light"
          >
            플레이
          </Link>
        </nav>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen((v) => !v)}
          aria-label="메뉴"
          className="flex h-[42px] w-[42px] flex-col items-center justify-center gap-1 rounded-[10px] border border-[#ddd6c8] bg-background-secondary md:hidden"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block h-[2px] w-[17px] rounded-full bg-foreground transition-transform"
            />
          ))}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-glass-border bg-background/95 md:hidden"
          >
            <div className="px-[clamp(18px,5vw,56px)] pb-4 pt-2">
              {navItems.map((item) => {
                const isActive = !item.external && activePath === item.href;
                const className = `block border-l-2 px-3 py-[13px] text-base font-medium transition-colors ${
                  isActive
                    ? 'border-accent text-accent'
                    : 'border-glass-border text-foreground-secondary hover:text-foreground'
                }`;
                if (item.external) {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`${className} flex items-center gap-1.5`}
                    >
                      {item.label}
                      <ExternalLink className="h-[13px] w-[13px]" aria-hidden />
                      <span className="sr-only">(새 탭에서 열림)</span>
                    </a>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={className}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/maps"
                onClick={() => setIsMobileMenuOpen(false)}
                className="mt-3 block rounded-xl bg-accent px-4 py-3 text-center text-base font-bold text-[#fffdf8]"
              >
                플레이
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
