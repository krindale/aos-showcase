'use client';

/**
 * 게임 중 채팅 (Phase 3) — 온라인 모드 전용 플로팅 위젯.
 * 접힘: 좌하단 버튼 + 안 읽음 배지 / 펼침: 메시지 목록 + 입력.
 * 채팅은 휘발성(broadcast, DB 저장 안 함) — 재접속 시 이전 대화는 복원되지 않는다(의도).
 * 차례 차단 오버레이(grid 내부) 밖의 fixed 요소라 상대 차례에도 채팅 가능.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNetStore } from '@/net/netStore';
import { MessageCircle, Send, X } from 'lucide-react';

export default function GameChat() {
  const mode = useNetStore((s) => s.mode);
  const chat = useNetStore((s) => s.chat);
  const sendChat = useNetStore((s) => s.sendChat);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [seenCount, setSeenCount] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setSeenCount(chat.length);
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, chat.length]);

  if (mode === 'offline') return null;

  const unread = Math.max(0, chat.length - seenCount);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendChat(text);
    setInput('');
  };

  return (
    // 좌하단에서 30px 안쪽(우측)으로 — 가장자리에 붙으면 눈에 안 띔 (사용자 피드백)
    <div className="fixed bottom-4 left-[46px] z-40">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="mb-2 w-72 rounded-xl border border-foreground/10 bg-background-secondary shadow-lg overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2 bg-background-tertiary border-b border-foreground/10">
              <span className="text-xs font-semibold text-foreground">채팅</span>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-foreground/10 text-foreground-secondary"
                aria-label="채팅 닫기"
              >
                <X size={13} />
              </button>
            </div>
            <div className="h-48 overflow-y-auto p-2 space-y-1">
              {chat.length === 0 && (
                <div className="text-xs text-foreground-muted text-center py-4">
                  아직 메시지가 없습니다
                </div>
              )}
              {chat.map((m, i) => (
                <div key={`${m.at}-${i}`} className="text-xs text-foreground break-words">
                  <span className="font-semibold text-foreground-secondary">{m.name}</span>{' '}
                  {m.text}
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div className="flex border-t border-foreground/10">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="메시지…"
                className="flex-1 px-3 py-2 bg-transparent text-xs text-foreground focus:outline-none"
              />
              <button
                onClick={handleSend}
                className="px-3 text-foreground-secondary hover:text-accent"
                aria-label="전송"
              >
                <Send size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-11 h-11 rounded-full bg-accent text-background shadow-lg flex items-center justify-center hover:bg-accent-light transition-colors"
        aria-label="채팅 열기"
      >
        <MessageCircle size={18} />
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
