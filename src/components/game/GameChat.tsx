'use client';

/**
 * 게임 중 채팅 (Phase 3) — 온라인 모드 전용 플로팅 위젯.
 * 접힘: 게임 보드 우측 하단 호버링 버튼 + 안 읽음 배지 / 펼침: 메시지 목록 + 입력.
 * 채팅은 휘발성(broadcast, DB 저장 안 함) — 재접속 시 이전 대화는 복원되지 않는다(의도).
 * GamePageClient의 보드 래퍼(relative) 안에 absolute로 배치 — z-30이라 차례 차단
 * 오버레이(z-20, 같은 스태킹 컨텍스트)보다 위에 있어 상대 차례에도 채팅 가능.
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
  const listRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevChatLenRef = useRef(chat.length);

  useEffect(() => {
    if (open) {
      setSeenCount(chat.length);
      // ⚠️ scrollIntoView 금지 — 페이지 전체가 딸려 스크롤된다(사용자 피드백).
      // 메시지 목록 컨테이너 내부만 맨 아래로.
      const list = listRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    }
  }, [open, chat.length]);

  // 채팅창이 닫혀 있을 때 새 메시지 도착 → 짧은 "딩동" 알림음 (사용자 요청).
  // 외부 오디오 파일 없이 Web Audio로 생성. 닫힌 상태에선 내가 보낼 수 없으므로
  // 길이 증가 = 상대 메시지. 오토플레이 정책으로 첫 상호작용 전엔 조용히 무시될 수 있음.
  useEffect(() => {
    const prev = prevChatLenRef.current;
    prevChatLenRef.current = chat.length;
    if (open || chat.length <= prev) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.01); // 은은한 볼륨
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t); // A5 → D6 두 음 상승 "딩동"
      osc.frequency.setValueAtTime(1174.66, t + 0.09);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.4);
    } catch {
      // 오디오 미지원/차단 환경 — 알림음만 생략 (배지는 그대로)
    }
  }, [chat.length, open]);

  if (mode === 'offline') return null;

  const unread = Math.max(0, chat.length - seenCount);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendChat(text);
    setInput('');
  };

  return (
    // 게임 보드 우측 하단 호버링 (사용자 피드백) — 보드가 화면보다 길면 sticky로
    // 뷰포트 하단에 따라붙고(줌 버튼의 sticky top 패턴의 하단판), 보드 끝에 도달하면 멈춘다.
    // 바깥 레이어는 pointer-events-none이라 보드 클릭을 가리지 않는다.
    <div className="absolute inset-0 z-30 pointer-events-none flex flex-col items-end justify-end">
      <div className="sticky bottom-3 pointer-events-auto mr-3 mb-3 flex flex-col items-end">
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
            <div ref={listRef} className="h-48 overflow-y-auto p-2 space-y-1">
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
    </div>
  );
}
