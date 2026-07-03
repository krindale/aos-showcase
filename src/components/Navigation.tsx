'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Train } from 'lucide-react';

const navItems = [
  { href: '/', label: '홈' },
  { href: '/gameplay', label: '게임플레이' },
  { href: '/actions', label: '특수 액션' },
  { href: '/maps', label: '맵' },
  { href: '/calculator', label: '계산기' },
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
            const isActive = activePath === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative rounded-lg px-[15px] py-[9px] text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-foreground'
                    : 'text-foreground-secondary hover:bg-glass-hover hover:text-foreground'
                }`}
              >
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
          <Link
            href="/game/tutorial/"
            className="ml-2 rounded-[10px] bg-accent px-4 py-2 text-sm font-bold text-[#fffdf8] shadow-glow transition-colors hover:bg-accent-light"
          >
            튜토리얼
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
                const isActive = activePath === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`block border-l-2 px-3 py-[13px] text-base font-medium transition-colors ${
                      isActive
                        ? 'border-accent text-accent'
                        : 'border-glass-border text-foreground-secondary hover:text-foreground'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/game/tutorial/"
                onClick={() => setIsMobileMenuOpen(false)}
                className="mt-3 block rounded-xl bg-accent px-4 py-3 text-center text-base font-bold text-[#fffdf8]"
              >
                튜토리얼
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
