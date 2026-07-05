'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { GamePhase, PHASE_INFO, ACTION_INFO } from '@/types/game';
import { getMapProfile } from '@/maps/getMapProfile';
import { PHASE_ICONS, ACTIONS, ACTION_ICONS } from './PhasePanel';

/**
 * 인게임 규칙/도움말 오버레이 — 게임 진행 중 언제든 규칙을 확인.
 * 규칙 콘텐츠(PHASE_INFO·ACTION_INFO·MapProfile.specialRules)와 모달 패턴(ConfirmDialog)을
 * 재활용한 순수 로컬 UI. 스토어를 읽기만 하므로 온라인 스냅샷과 무관(Toaster와 동일).
 * currentPhase를 강조해 "지금 이 단계"를 알려주는 컨텍스트 도움말.
 */

// 게임 진행 순서(I~X). gameOver는 실제 턴 단계가 아니라 제외.
const TURN_PHASES = (Object.keys(PHASE_INFO) as GamePhase[]).filter((p) => p !== 'gameOver');

export default function HelpOverlay({
  open,
  onClose,
  mapId,
}: {
  open: boolean;
  onClose: () => void;
  mapId: string;
}) {
  const currentPhase = useGameStore((s) => s.currentPhase);
  const specialRules = getMapProfile(mapId).specialRules;

  // 오버레이가 떠 있는 동안 배경 스크롤 잠금 + ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const activePhaseInfo = currentPhase !== 'gameOver' ? PHASE_INFO[currentPhase] : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="glass-card relative w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            initial={{ scale: 0.94, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="게임 도움말"
          >
            {/* 헤더 (고정) */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-glass-border shrink-0">
              <h2 className="text-xl font-bold text-gradient">게임 도움말</h2>
              <button
                onClick={onClose}
                className="p-1.5 text-foreground-secondary hover:text-foreground hover:bg-foreground/10 rounded-lg transition-colors"
                aria-label="도움말 닫기"
              >
                <X size={20} />
              </button>
            </div>

            {/* 본문 (스크롤) */}
            <div className="overflow-y-auto px-6 py-5">
            {/* 1. 지금 이 단계 */}
            {activePhaseInfo && (
              <section className="mb-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-2">
                  지금 이 단계
                </h3>
                <div className="flex items-start gap-3 rounded-xl border-2 border-accent/50 bg-accent/5 p-3">
                  <span className="text-accent mt-0.5">{PHASE_ICONS[currentPhase]}</span>
                  <div>
                    <div className="text-sm font-bold text-foreground">{activePhaseInfo.name}</div>
                    <div className="text-xs text-foreground-secondary leading-relaxed mt-0.5">
                      {activePhaseInfo.description}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* 2. 한 턴의 흐름 (10단계) */}
            <section className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-2">
                한 턴의 흐름 · 10단계
              </h3>
              <ul className="space-y-1.5">
                {TURN_PHASES.map((phase) => {
                  const info = PHASE_INFO[phase];
                  const isCurrent = phase === currentPhase;
                  return (
                    <li
                      key={phase}
                      className={`flex items-start gap-3 rounded-lg p-2.5 transition-colors ${
                        isCurrent
                          ? 'bg-accent/10 border border-accent/30'
                          : 'border border-transparent'
                      }`}
                    >
                      <span className={isCurrent ? 'text-accent mt-0.5' : 'text-foreground-secondary mt-0.5'}>
                        {PHASE_ICONS[phase]}
                      </span>
                      <div className="min-w-0">
                        <div className={`text-sm font-semibold ${isCurrent ? 'text-accent' : 'text-foreground'}`}>
                          {info.name}
                        </div>
                        <div className="text-xs text-foreground-secondary leading-relaxed">
                          {info.description}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* 3. 특수 행동 (7) */}
            <section className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-2">
                특수 행동 · 7가지 (턴마다 1개, 각 1명)
              </h3>
              <ul className="grid sm:grid-cols-2 gap-1.5">
                {ACTIONS.map((action) => {
                  const info = ACTION_INFO[action];
                  const Icon = ACTION_ICONS[action];
                  return (
                    <li key={action} className="rounded-lg bg-background-tertiary/60 p-2.5">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-accent shrink-0" />
                        <div className="text-sm font-semibold text-foreground">{info.name}</div>
                      </div>
                      <div className="text-xs text-foreground-secondary leading-relaxed mt-0.5">
                        {info.description}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* 4. 이 맵의 특수룰 (있을 때만) */}
            {specialRules.length > 0 && (
              <section className="mb-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-2">
                  이 맵의 특수룰
                </h3>
                <ul className="space-y-2.5">
                  {specialRules.map((rule, i) => (
                    <li key={i} className="border-l-2 border-accent/40 pl-3">
                      <div className="text-sm font-semibold text-foreground">{rule.title}</div>
                      <div className="text-xs text-foreground-secondary leading-relaxed mt-0.5">
                        {rule.detail}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 5. 승점 계산 */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-2">
                승점 계산
              </h3>
              <div className="rounded-xl bg-background-tertiary/60 p-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground-secondary">수입 × 3</span>
                  <span className="font-semibold text-positive">+</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground-secondary">완성 링크의 트랙 구간 × 1</span>
                  <span className="font-semibold text-positive">+</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground-secondary">발행 주식 × 3</span>
                  <span className="font-semibold text-accent">−</span>
                </div>
                <p className="text-xs text-foreground-muted leading-relaxed pt-1.5 border-t border-glass-border">
                  현금은 승점에 포함되지 않습니다. 가장 높은 승점이 승리(동점 가능).
                </p>
              </div>
            </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
