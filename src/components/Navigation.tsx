'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Train } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Home', labelKo: '홈' },
  { href: '/gameplay', label: 'Gameplay', labelKo: '게임플레이' },
  { href: '/actions', label: 'Actions', labelKo: '특수 행동' },
  { href: '/maps', label: 'Maps', labelKo: '맵' },
  { href: '/calculator', label: 'Calculator', labelKo: '계산기' },
] as const;

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  // 스크롤 이벤트 throttle (requestAnimationFrame 사용)
  const handleScroll = useCallback(() => {
    lastScrollY.current = window.scrollY;

    if (!ticking.current) {
      requestAnimationFrame(() => {
        setIsScrolled(lastScrollY.current > 50);
        ticking.current = false;
      });
      ticking.current = true;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-background/80 backdrop-blur-lg border-b border-glass-border shadow-lg'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.6 }}
                className="relative"
              >
                <Train className="w-8 h-8 text-accent" />
                <div className="absolute inset-0 bg-accent/20 blur-xl rounded-full" />
              </motion.div>
              <div className="flex flex-col">
                <span className="font-display text-xl font-bold text-gradient">
                  Age of Steam
                </span>
                <span className="text-xs text-foreground-secondary tracking-widest">
                  BOARD GAME
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="relative px-4 py-2 group"
                  >
                    <span
                      className={`text-sm font-medium transition-colors duration-300 ${
                        isActive
                          ? 'text-accent'
                          : 'text-foreground-secondary hover:text-foreground'
                      }`}
                    >
                      {item.label}
                    </span>
                    {/* Active indicator */}
                    {isActive && (
                      <motion.div
                        layoutId="activeNav"
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-accent rounded-full"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    {/* Hover effect */}
                    <span className="absolute inset-0 rounded-lg bg-accent/0 group-hover:bg-accent/5 transition-colors duration-300" />
                  </Link>
                );
              })}
            </div>

            {/* CTA Button - Desktop */}
            <div className="hidden md:block">
              <Link href="/game/tutorial">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="btn-primary text-sm px-6 py-2.5"
                >
                  시작하기
                </motion.button>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-foreground-secondary hover:text-accent transition-colors"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 md:hidden"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-background/95 backdrop-blur-lg"
              onClick={() => setIsMobileMenuOpen(false)}
            />

            {/* Menu Content */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="relative pt-24 px-6"
            >
              <div className="flex flex-col gap-2">
                {navItems.map((item, index) => {
                  const isActive = pathname === item.href;
                  return (
                    <motion.div
                      key={item.href}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center justify-between py-4 px-4 rounded-xl transition-all ${
                          isActive
                            ? 'bg-accent/10 border border-accent/30'
                            : 'hover:bg-glass'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span
                            className={`text-lg font-medium ${
                              isActive ? 'text-accent' : 'text-foreground'
                            }`}
                          >
                            {item.label}
                          </span>
                          <span className="text-sm text-foreground-muted">
                            {item.labelKo}
                          </span>
                        </div>
                        {isActive && (
                          <div className="w-2 h-2 bg-accent rounded-full" />
                        )}
                      </Link>
                    </motion.div>
                  );
                })}
              </div>

              {/* Mobile CTA */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-8"
              >
                <Link href="/game/tutorial" onClick={() => setIsMobileMenuOpen(false)}>
                  <button className="btn-primary w-full text-lg py-4">
                    게임 시작하기
                  </button>
                </Link>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
