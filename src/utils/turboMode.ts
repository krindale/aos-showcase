/**
 * 터보 모드 — 브라우저 테스트/검증용 게임 연출 딜레이 축소.
 *
 * `localStorage['aos-turbo'] === '1'` 이면 게임 진행을 막는 연출 딜레이(봇 행동 간격·
 * 마지막 플레이어 확인 홀드·스냅샷 홀드·수송 정산 애니메이션·AI 스케줄러 debounce)를
 * 상한 50ms로 줄인다. **게임 로직은 무변경** — 모든 코드가 기존과 같은 비동기 경로를
 * 타고(0으로 만들지 않아 분기 동일), 속도만 빨라진다.
 *
 * 켜기: 콘솔에서 `localStorage.setItem('aos-turbo','1')` 후 게임 시작 (끄기: removeItem).
 * Playwright E2E는 addInitScript로 자동 주입. VITEST 분기(별도 값)는 그대로 우선한다.
 *
 * ⚠️ 온라인에서는 호스트가 켜면 봇 진행·스냅샷 전송이 빨라져 게스트도 빠른 진행을 본다
 * (디싱크 없음 — 어차피 호스트 권위). 실사용 기본값은 플래그 없음 = 기존 속도 그대로.
 */

/**
 * 터보 설정 권한 게이트 — 온라인 게스트는 터보 설정 자체가 금지다(방장 전용).
 * netStore가 모드 전환 시 세팅한다(guest → false). 기본 true(오프라인/호스트).
 * turboMode가 netStore를 import하면 순환(netStore → turboMode)이라 setter 주입 방식.
 */
let turboAllowed = true;
export function setTurboAllowed(allowed: boolean): void {
  turboAllowed = allowed;
}

/** 터보 모드 여부 (SSR/워커 등 window 없는 환경은 항상 false, 게스트는 항상 false) */
export function isTurboMode(): boolean {
  try {
    if (typeof window === 'undefined' || !turboAllowed) return false;
    // URL로도 토글 가능: ?turbo=1 켜기 / ?turbo=0 끄기 (localStorage에 저장돼 유지)
    const q = new URLSearchParams(window.location.search).get('turbo');
    if (q === '1') window.localStorage?.setItem('aos-turbo', '1');
    else if (q === '0') window.localStorage?.removeItem('aos-turbo');
    return window.localStorage?.getItem('aos-turbo') === '1';
  } catch {
    return false; // localStorage 접근 불가(프라이빗 모드 등) — 안전하게 꺼짐
  }
}

/** 연출 딜레이(ms)에 터보 상한 적용 — 터보면 min(ms, 50), 아니면 원값 그대로 */
export function turboDelay(ms: number): number {
  return isTurboMode() ? Math.min(ms, 50) : ms;
}
