'use client';

import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';

/**
 * Western US: 서부↔동부 시작도시가 막 연결된 순간을 알리는 팝업.
 * - 보드 전체 최초 연결 보너스 수령자($4/$2 income)를 표시
 * - 자기 철도로 서↔동을 이은 플레이어의 "한 줄 연속 건설" 규칙 해제를 안내
 * 게임 흐름을 막지 않는 비차단 모달 — 닫으면 transcontinentalEvent가 초기화된다.
 */
export default function TranscontinentalModal() {
  const event = useGameStore((s) => s.transcontinentalEvent);
  const dismiss = useGameStore((s) => s.dismissTranscontinental);

  // 이미 닫은 이벤트 key는 다시 열지 않는다 — 온라인에서 호스트가 클리어하지 않은 이벤트가
  // 매 스냅샷마다 재전파돼 "건설할 때마다 팝업" 이 뜨던 버그 방지 (deliveryIncomeEvent와 동일 가드).
  const seenKeyRef = useRef<number | null>(null);

  const open =
    !!event &&
    event.key !== seenKeyRef.current &&
    (event.bonusRecipients.length > 0 || event.unlockedPlayers.length > 0);

  const handleDismiss = () => {
    if (event) seenKeyRef.current = event.key;
    dismiss();
  };

  return (
    <AnimatePresence>
      {open && event && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleDismiss}
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
              animate={{ scale: 1, rotate: [0, -12, 12, 0] }}
              transition={{ delay: 0.1, duration: 0.6 }}
            >
              🌉
            </motion.div>

            <h2 className="text-2xl font-bold text-gradient mb-1">대륙횡단 철도 완성!</h2>
            <p className="text-sm text-foreground-secondary mb-5">
              서부 ↔ 동부 시작 도시가 연결되었습니다.
            </p>

            {/* 보너스 수령자 */}
            {event.bonusRecipients.length > 0 && (
              <div className="mb-4">
                <div className="text-xs uppercase tracking-wide text-accent/80 mb-2">
                  연결 보너스 (즉시 수입 +)
                </div>
                <div className="space-y-2">
                  {event.bonusRecipients.map((r) => (
                    <div
                      key={r.playerId}
                      className="flex items-center justify-between glass rounded-lg px-4 py-2"
                    >
                      <span className="font-semibold text-foreground">{r.name}</span>
                      <span className="font-bold text-steam-green">+{r.amount} 수입</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 연속성 해제 안내 */}
            <div className="glass rounded-lg px-4 py-3 mb-5 text-left">
              <div className="text-sm font-semibold text-accent mb-1">
                🚧 연속 건설 규칙 해제
              </div>
              <p className="text-xs text-foreground-secondary leading-relaxed">
                {event.unlockedPlayers.length > 0 ? (
                  <>
                    <span className="text-foreground font-medium">
                      {event.unlockedPlayers.map((u) => u.name).join(', ')}
                    </span>
                    {' '}님은 이제 자기 철도와 떨어진 곳에도 새 트랙을 시작할 수 있습니다.
                  </>
                ) : (
                  <>
                    대륙횡단을 달성한 철도는 더 이상 한 줄로 이어 건설할 필요가 없습니다.
                    네트워크와 떨어진 곳에서도 새 트랙을 시작할 수 있습니다.
                  </>
                )}
              </p>
            </div>

            <button onClick={handleDismiss} className="btn-primary w-full">
              확인
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
