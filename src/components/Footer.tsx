'use client';

import { Github, ExternalLink } from 'lucide-react';
import { LogoMark } from './Navigation';

export default function Footer() {
  return (
    <footer className="border-t border-glass-border bg-background-tertiary">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-[18px] px-[clamp(18px,5vw,56px)] py-10">
        <div className="flex items-center gap-[11px]">
          <LogoMark size={24} />
          <span className="font-display text-[13.5px] font-medium text-[#54504a]">
            Age of Steam · 디자인 Martin Wallace
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-foreground-muted">
            팬이 제작한 비공식 컴패니언 사이트입니다.
          </span>
          <a
            href="https://boardgamegeek.com/boardgame/4098/age-steam"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="BoardGameGeek"
            className="text-foreground-muted transition-colors hover:text-accent"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href="https://github.com/krindale/aos-showcase"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="text-foreground-muted transition-colors hover:text-accent"
          >
            <Github className="h-4 w-4" />
          </a>
        </div>
      </div>
    </footer>
  );
}
