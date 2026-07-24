'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useToastStore } from '@/store/toastStore';
import { useNetStore } from '@/net/netStore';
import { isTurboMode } from '@/utils/turboMode';

/**
 * 터보 모드 스위치 (게임 헤더, ? 도움말 좌측) — 봇 딜레이·연출 홀드를 50ms로 축소.
 *
 * - 실제 딜레이 축소 = 방장 로컬 localStorage('aos-turbo', turboDelay가 타이머 생성마다 읽음)
 * - 표시/알림 = gameStore.turboMode (스냅샷으로 게스트까지 동기화)
 * - 권한: 방장 전용 — 게스트는 disabled 스위치로 상태만 보고, 변경 시 전원 토스트 알림
 *   (게스트가 localStorage를 직접 켜도 setTurboAllowed 게이트가 무효화)
 */
export default function TurboSwitch() {
  const turboOn = useGameStore((s) => s.turboMode ?? false);
  const showToast = useToastStore((s) => s.showToast);
  const netMode = useNetStore((s) => s.mode);
  const amIHost = netMode === 'offline' || netMode === 'host';

  // 마운트 시 방장 localStorage 값을 표시 상태로 동기화 (새로고침/이전 세션 잔존 대비)
  useEffect(() => {
    if (amIHost && isTurboMode() !== (useGameStore.getState().turboMode ?? false)) {
      useGameStore.setState({ turboMode: isTurboMode() });
    }
  }, [amIHost]);

  // 터보 변경 토스트 — 방장/게스트 공통 (최초 관측은 스킵: 입장 시점 상태는 알림 아님)
  const seenRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (seenRef.current === null) { seenRef.current = turboOn; return; }
    if (seenRef.current !== turboOn) {
      seenRef.current = turboOn;
      showToast(
        turboOn ? '터보 모드 켜짐 — 봇 진행이 빨라집니다' : '터보 모드 꺼짐 — 원래 속도로 진행합니다',
        'info'
      );
    }
  }, [turboOn, showToast]);

  const toggle = () => {
    if (!amIHost) return;
    const next = !turboOn;
    try {
      if (next) window.localStorage.setItem('aos-turbo', '1');
      else window.localStorage.removeItem('aos-turbo');
    } catch { /* localStorage 불가 환경 무시 */ }
    useGameStore.setState({ turboMode: next }); // 스냅샷으로 게스트에도 전파
  };

  return (
    <button
      role="switch"
      aria-checked={turboOn}
      aria-label="터보 모드"
      onClick={toggle}
      disabled={!amIHost}
      title={amIHost
        ? '터보: 봇 딜레이·연출 홀드를 50ms로 축소 (게임 로직 무변경, 테스트용)'
        : '터보 모드는 방장만 변경할 수 있습니다'}
      className="flex items-center gap-1.5 p-1.5 sm:p-2 rounded-lg hover:bg-foreground/10 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="text-[11px] font-semibold text-foreground-secondary hidden sm:inline">터보</span>
      {/* 스위치 트랙 + 노브 */}
      <span
        className={`relative inline-block w-8 h-[18px] rounded-full transition-colors ${
          turboOn ? 'bg-accent' : 'bg-foreground/25'
        }`}
      >
        <span
          className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${
            turboOn ? 'translate-x-[14px]' : ''
          }`}
        />
      </span>
    </button>
  );
}
