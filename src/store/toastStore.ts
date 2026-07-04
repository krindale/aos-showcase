// 화면 상단 토스트 — 게임 상태와 무관한 순수 로컬 UI 피드백이라 gameStore(스냅샷 동기화)와
// 분리한다. 온라인에서 방장 토스트가 게스트에게 새지 않는다.

import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  kind: 'error' | 'info';
}

interface ToastStore {
  toasts: Toast[];
  showToast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
}

let seq = 0;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  showToast: (text, kind = 'error') => {
    // 같은 문구가 이미 떠 있으면 중복 방지(연타 스팸 억제)
    if (get().toasts.some((t) => t.text === text)) return;
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }].slice(-3) }));
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
