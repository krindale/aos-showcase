/**
 * 백그라운드 탭 스로틀을 안 받는 타이머 (2026-07-04)
 *
 * 크롬은 숨김 탭의 setTimeout/setInterval을 최소 1초(잠금 5분 후엔 1분)로 묶는다.
 * 게임 진행(봇 파이프라인·스냅샷 전송)이 타이머 체인이라, 호스트 창이 다른 창 뒤로
 * 가려지는 순간 전체 게임이 3~4배 느려지거나 멈추다시피 했다 (실측: 봇 케이던스
 * 1.2초 → 3~4초). Web Worker의 타이머는 페이지 가시성 스로틀을 받지 않으므로
 * 워커에서 재우고 메시지로 깨운다.
 *
 * Worker가 없는 환경(vitest/node, SSR)은 자동으로 일반 setTimeout 폴백 —
 * 테스트의 fake timers도 그대로 동작한다.
 */

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, () => void>();

function getWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (!worker) {
    try {
      const src = 'onmessage=function(e){var d=e.data;setTimeout(function(){postMessage(d.id)},d.ms)}';
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
      worker.onmessage = (e: MessageEvent<number>) => {
        const cb = pending.get(e.data);
        pending.delete(e.data);
        cb?.();
      };
    } catch {
      worker = null; // CSP 등으로 blob worker 불가 — setTimeout 폴백
    }
  }
  return worker;
}

/** setTimeout 대체 — 취소 함수를 반환한다 */
export function safeTimeout(cb: () => void, ms: number): () => void {
  const w = getWorker();
  if (!w) {
    const t = setTimeout(cb, ms);
    return () => clearTimeout(t);
  }
  const id = ++seq;
  pending.set(id, cb);
  w.postMessage({ id, ms });
  return () => {
    pending.delete(id);
  };
}

/** setInterval 대체 — 취소 함수를 반환한다 (safeTimeout 재귀) */
export function safeInterval(cb: () => void, ms: number): () => void {
  let stopped = false;
  let cancel: () => void = () => {};
  const loop = () => {
    if (stopped) return;
    cancel = safeTimeout(() => {
      if (stopped) return;
      cb();
      loop();
    }, ms);
  };
  loop();
  return () => {
    stopped = true;
    cancel();
  };
}
