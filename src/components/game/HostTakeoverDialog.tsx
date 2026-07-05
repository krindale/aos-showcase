'use client';

/**
 * 호스트 연결 끊김 → 승계 여부를 묻는 모달 (게스트 전용).
 * netStore.hostTakeoverPrompt가 세팅되면(6초 유예 후) 뜬다. 대기실/게임 중 공통.
 * - 후계자(canTakeover): [이어받기] + [나가기]
 * - 비후계자: "다른 참가자가 이어받는 중…" 안내 + [나가기]
 * 백드롭 클릭으로 닫히지 않는다(실수 나가기 방지) — 호스트가 복귀하면 netStore가
 * 팝업을 자동으로 닫고(null) 그대로 계속 진행한다.
 */
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Loader2, LogOut } from 'lucide-react';
import { useNetStore } from '@/net/netStore';
import { CROWN_GOLD, CROWN_INK } from './uiEffects';

export default function HostTakeoverDialog() {
  const prompt = useNetStore((s) => s.hostTakeoverPrompt);
  const accept = useNetStore((s) => s.acceptHostTakeover);
  const decline = useNetStore((s) => s.declineHostTakeover);

  // 팝업이 떠 있는 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!prompt) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [prompt]);

  const inGame = prompt?.status === 'playing';
  const canTakeover = prompt?.canTakeover ?? false;
  const title = inGame ? '방장 연결 끊김' : '방장이 나갔습니다';
  const message = canTakeover
    ? inGame
      ? '게임 중 방장의 연결이 끊겼습니다. 호스트를 이어받아 게임을 계속할까요? 나가면 이 게임에서 빠집니다.'
      : '방장이 대기실을 떠났습니다. 방장을 이어받아 방을 유지할까요? 나가면 온라인 초기 화면으로 돌아갑니다.'
    : inGame
      ? '게임 중 방장의 연결이 끊겼습니다. 다른 참가자가 호스트를 이어받는 중입니다. 기다리거나 게임에서 나갈 수 있어요.'
      : '방장이 대기실을 떠났습니다. 다른 참가자가 방장을 이어받는 중입니다. 기다리거나 나갈 수 있어요.';
  const leaveLabel = inGame ? '게임 나가기' : '나가기';

  return (
    <AnimatePresence>
      {prompt && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="glass-card relative max-w-sm w-full p-6"
            initial={{ scale: 0.9, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            role="alertdialog"
            aria-modal="true"
          >
            <h3 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {title}
            </h3>
            <p className="text-sm text-foreground-secondary leading-relaxed mb-5">{message}</p>
            <div className="flex gap-2">
              <button
                onClick={() => void decline()}
                className="btn-secondary flex-1 flex items-center justify-center gap-1"
                aria-label={leaveLabel}
              >
                <LogOut size={15} /> {leaveLabel}
              </button>
              {canTakeover ? (
                <button
                  onClick={() => void accept()}
                  className="btn-primary flex-1 flex items-center justify-center gap-1"
                  aria-label={inGame ? '호스트 이어받아 계속' : '방장 되기'}
                >
                  <Crown size={15} fill={CROWN_GOLD} strokeWidth={1.8} style={{ color: CROWN_INK }} />
                  {inGame ? (
                    <span className="text-center leading-tight">이어받아<br />계속</span>
                  ) : (
                    '방장 되기'
                  )}
                </button>
              ) : (
                <div className="btn-secondary flex-1 flex items-center justify-center gap-1 opacity-70 cursor-default">
                  <Loader2 size={15} className="animate-spin" /> 이어받는 중…
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
