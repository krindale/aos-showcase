'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Train, Github, ExternalLink } from 'lucide-react';

const footerLinks = [
  {
    title: '페이지',
    links: [
      { label: '홈', href: '/' },
      { label: '게임플레이', href: '/gameplay' },
      { label: '특수 행동', href: '/actions' },
      { label: '맵', href: '/maps' },
      { label: '계산기', href: '/calculator' },
    ],
  },
  {
    title: '게임 정보',
    links: [
      { label: '트랙 건설', href: '/gameplay#track' },
      { label: '물품 운송', href: '/gameplay#goods' },
      { label: '경제 시스템', href: '/gameplay#economy' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative bg-background-secondary border-t border-glass-border">
      {/* Decorative gradient */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-6">
              <Train className="w-8 h-8 text-accent" />
              <div className="flex flex-col">
                <span className="font-display text-xl font-bold text-gradient">
                  Age of Steam
                </span>
                <span className="text-xs text-foreground-secondary tracking-widest">
                  BOARD GAME SHOWCASE
                </span>
              </div>
            </Link>
            <p className="text-foreground-secondary text-sm leading-relaxed max-w-md mb-6">
              19세기 철도 산업의 황금기를 배경으로 한 전략 보드게임입니다.
              트랙을 건설하고, 물품을 운송하며, 철도왕이 되어보세요.
            </p>
            <div className="flex items-center gap-4">
              <motion.a
                href="https://boardgamegeek.com/boardgame/4098/age-steam"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-lg bg-glass hover:bg-glass-hover transition-colors"
              >
                <ExternalLink className="w-5 h-5 text-foreground-secondary hover:text-accent transition-colors" />
              </motion.a>
              <motion.a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-lg bg-glass hover:bg-glass-hover transition-colors"
              >
                <Github className="w-5 h-5 text-foreground-secondary hover:text-accent transition-colors" />
              </motion.a>
            </div>
          </div>

          {/* Links */}
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h3 className="font-display text-sm font-semibold text-accent mb-4 tracking-wider">
                {section.title}
              </h3>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-foreground-secondary text-sm hover:text-foreground transition-colors link-underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-glass-border">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-foreground-muted text-sm">
              © 2024 Age of Steam Showcase. Fan-made project.
            </p>
            <div className="flex items-center gap-2 text-foreground-muted text-sm">
              <span>Designed by</span>
              <span className="text-accent">Martin Wallace</span>
            </div>
          </div>
        </div>
      </div>

      {/* Steam effect at bottom */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-accent/5 blur-3xl rounded-full pointer-events-none" />
    </footer>
  );
}
