'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useMyPlayerId } from '@/hooks/useMyPlayerId';

/**
 * 파산(Phase VII) 알림 팝업 — 사람이든 봇이든 파산하는 순간 전원에게 뜬다.
 *
 * 온라인 동기화: `bankruptcyEvent`는 스냅샷에 실려 게스트에게도 그대로 도착하므로
 * 호스트/게스트가 같은 팝업을 본다. 스토어를 되돌리는 dismiss 액션은 두지 않는다 —
 * 게스트가 닫아도 다음 스냅샷이 이벤트를 다시 덮어써 팝업이 되살아나기 때문.
 * 대신 "이미 본 key"를 로컬 ref로 기억해 다시 열지 않는다.
 *
 * F5/재접속 stale 방지: 마운트 시점에 이미 존재하던 이벤트는 "본 것"으로 간주해 건너뛴다
 * (deliveryIncomeEvent와 동일한 "최초 관측 key 스킵" 가드). 파산이 실제로 일어나는
 * 순간엔 이미 마운트돼 있으므로 알림은 정상적으로 뜬다.
 */
export default function BankruptcyModal() {
  const event = useGameStore((s) => s.bankruptcyEvent);
  const players = useGameStore((s) => s.players);
  const myPlayerId = useMyPlayerId();

  const seenKeyRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    // 마운트 직후 1회: 그 시점의 이벤트는 과거 것 → 표시하지 않고 본 것으로 처리
    if (!initializedRef.current) {
      initializedRef.current = true;
      seenKeyRef.current = event?.key ?? null;
      return;
    }
    if (event && event.key !== seenKeyRef.current) {
      seenKeyRef.current = event.key;
      setOpenKey(event.key);
    }
  }, [event]);

  const open = !!event && openKey === event.key && event.players.length > 0;
  // 내가 파산 당사자인지 (온라인 좌석 기준, 오프라인은 myPlayerId=null이라 항상 false)
  const iAmBankrupt = !!event && myPlayerId !== null && event.players.some((p) => p.id === myPlayerId);

  return (
    <AnimatePresence>
      {open && event && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpenKey(null)}
        >
          <motion.div
            className="glass-card relative max-w-md w-full p-8 text-center border border-accent/40"
            initial={{ scale: 0.85, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              className="text-6xl mb-3"
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: [0, -10, 10, 0] }}
              transition={{ delay: 0.1, duration: 0.6 }}
            >
              💥
            </motion.div>

            <h2 className="text-2xl font-bold text-accent mb-1">
              {event.players.length > 1 ? '파산 발생!' : `${event.players[0].name} 파산!`}
            </h2>
            <p className="text-sm text-foreground-secondary mb-5">
              {event.turn}턴 비용 지불에서 수입이 0 아래로 떨어졌습니다.
            </p>

            <div className="space-y-2 mb-5">
              {event.players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between glass rounded-lg px-4 py-2"
                >
                  <span className="font-semibold text-foreground">
                    {p.name}
                    {players[p.id]?.isAI ? ' (BOT)' : ''}
                  </span>
                  <span className="text-xs font-bold text-accent">탈락</span>
                </div>
              ))}
            </div>

            <div className="glass rounded-lg px-4 py-3 mb-5 text-left">
              <p className="text-xs text-foreground-secondary leading-relaxed">
                파산한 철도는 <span className="text-foreground font-medium">공용 노선</span>이 되어
                누구나 지날 수 있지만, 그 구간 수송으로는 아무도 수입을 받지 못합니다. 파산한
                플레이어는 이후 차례에서 제외됩니다.
              </p>
            </div>

            {iAmBankrupt && (
              <div className="rounded-lg px-4 py-3 mb-5 bg-accent/10 border border-accent/30 text-left">
                <p className="text-xs text-foreground leading-relaxed">
                  회원님은 파산하여 게임에서 탈락했습니다. 남은 게임은{' '}
                  <span className="font-semibold">관전</span>하실 수 있고, 채팅도 그대로 사용할 수
                  있습니다.
                </p>
              </div>
            )}

            <button onClick={() => setOpenKey(null)} className="btn-primary w-full">
              확인
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
