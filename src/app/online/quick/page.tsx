'use client';

/**
 * 빈 방에 바로 참가 — 빠른 매칭 전용 화면 (랜딩 히어로 보조 CTA의 목적지)
 *
 * /online(방 만들기)과 나눠 둔 이유: 여기 온 사람의 관심사는 "지금 낄 수 있는 방이 있나"
 * 하나뿐이라, 지도·인원·좌석 같은 방 만들기 선택지를 보여줄 이유가 없다.
 *
 * 방에 들어가면 곧바로 /game/<맵>/으로 넘겨 기존 대기실에 맡긴다.
 *
 * 레이아웃은 /online과 짝을 맞춘다 — 왼쪽이 고르는 영역(방 목록), 오른쪽이 액션 카드.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, RefreshCw, Users, Zap } from 'lucide-react';
import { isNetConfigured } from '@/net';
import { useNetStore } from '@/net/netStore';
import { getMapData } from '@/utils/mapRegistry';
import { useEnterMotion } from '@/hooks/useEnterMotion';

function mapNameOf(mapId: string): string {
  try {
    return getMapData(mapId).name;
  } catch {
    return mapId;
  }
}

export default function QuickJoinPage() {
  const router = useRouter();
  const { enter } = useEnterMotion();
  const {
    room, error, publicRooms, publicRoomsLoading,
    refreshPublicRooms, quickMatch, joinRoom,
  } = useNetStore();

  const [myName, setMyName] = useState('게스트');
  const [matching, setMatching] = useState(false);

  // 공개방 목록 8초 폴링 (로비와 같은 주기)
  useEffect(() => {
    if (room || !isNetConfigured()) return;
    void refreshPublicRooms();
    const timer = setInterval(() => void refreshPublicRooms(), 8000);
    return () => clearInterval(timer);
  }, [room, refreshPublicRooms]);

  // 자리를 잡았으면 그 방의 맵 페이지(대기실)로.
  // 게임 화면의 '나가기'가 맵 갤러리 대신 여기로 되돌아오도록 출발지를 남긴다.
  useEffect(() => {
    if (!room) return;
    try { window.sessionStorage.setItem('aos-back-to', '/online/quick/'); } catch { /* noop */ }
    router.push(`/game/${room.mapId}/`);
  }, [room, router]);

  const handleQuickMatch = async () => {
    setMatching(true);
    await quickMatch(myName.trim() || '게스트');
    setMatching(false);
  };

  if (!isNetConfigured()) {
    return (
      <div className="mx-auto max-w-[720px] px-[clamp(18px,5vw,56px)] py-[clamp(48px,8vw,96px)]">
        <h1 className="mb-3 text-[clamp(26px,4vw,40px)] font-bold tracking-[-0.03em]">빠른 참가</h1>
        <p className="text-foreground-secondary">
          이 배포에는 온라인 기능이 설정되어 있지 않습니다 (Supabase 환경변수 없음).
        </p>
      </div>
    );
  }

  // 빈 사람 자리가 남은 대기방만 = 실제로 낄 수 있는 방
  const joinable = publicRooms.filter((r) => r.seats.some((s) => s.kind === 'human' && !s.clientId));

  return (
    <div className="mx-auto max-w-[1180px] px-[clamp(18px,5vw,56px)] pb-[clamp(36px,5vw,64px)] pt-[clamp(24px,4vw,48px)]">
      <motion.div {...enter({ y: 12, ease: 'easeOut' })} className="mb-[clamp(18px,3vw,32px)]">
        <div className="mb-2 font-display text-xs font-medium tracking-[0.16em] text-accent">
          QUICK JOIN / 바로 참가
        </div>
        <h1 className="text-[clamp(26px,4.2vw,44px)] font-bold leading-[1.08] tracking-[-0.04em]">
          기다리는 방에 그냥 앉으세요
        </h1>
      </motion.div>

      <div className="grid gap-[clamp(20px,3vw,40px)] lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── 왼쪽: 지금 열려 있는 방 ── */}
        <section aria-label="열려 있는 방">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-baseline gap-2 text-[19px] font-bold tracking-[-0.02em]">
              <span className="font-display text-sm text-accent">01</span> 지금 열려 있는 방
              <span className="font-display text-sm font-medium text-foreground-muted">
                {joinable.length}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => void refreshPublicRooms()}
              aria-label="공개방 목록 새로고침"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-foreground-secondary transition-colors hover:text-accent"
            >
              <RefreshCw size={13} className={publicRoomsLoading ? 'animate-spin' : ''} /> 새로고침
            </button>
          </div>

          {/* 방 수가 폴링으로 계속 바뀌므로 높이를 고정해 아래가 밀리지 않게 한다 */}
          <div className="h-[clamp(300px,42vh,420px)] overflow-y-auto pr-1">
            {joinable.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-[16px] border border-dashed border-[#ddd6c8] px-5 text-center">
                <p className="text-[15px] font-medium text-foreground">
                  지금은 기다리는 방이 없습니다
                </p>
                <p className="mt-1.5 text-sm text-foreground-secondary">
                  새 방이 열리면 여기에 바로 나타납니다. 직접 열면 친구를 코드로 부를 수 있어요.
                </p>
                <Link href="/online/" className="btn-primary mt-5 inline-block">
                  내가 방을 열기 →
                </Link>
              </div>
            ) : (
              <ul className="space-y-2">
                {joinable.map((r) => {
                  const seated = r.seats.filter((s) => s.clientId || s.kind === 'ai').length;
                  return (
                    <li key={r.code}>
                      <button
                        type="button"
                        onClick={() => void joinRoom(r.code, myName.trim() || '게스트')}
                        className="glass-card flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:border-accent"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {r.title || `${mapNameOf(r.mapId)} 방`}
                          </span>
                          <span className="mt-[2px] block font-display text-xs text-foreground-muted">
                            {mapNameOf(r.mapId)}
                          </span>
                        </span>
                        <span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-background-tertiary px-3 py-1 font-display text-xs text-foreground-secondary">
                          <Users size={12} /> {seated}/{r.seats.length}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* ── 오른쪽: 참가 액션 ── */}
        <section className="glass-card h-fit p-5" aria-label="참가 설정">
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-foreground-secondary">내 이름</span>
            <input
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              maxLength={12}
              className="w-full rounded-lg border border-[#ddd6c8] bg-background-secondary px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
            />
          </label>

          <button
            type="button"
            onClick={handleQuickMatch}
            disabled={matching}
            className="btn-primary w-full disabled:opacity-60"
          >
            {matching ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 size={15} className="animate-spin" /> 빈 방 찾는 중…
              </span>
            ) : (
              <span className="inline-flex items-center justify-center gap-2">
                <Zap size={15} /> 빈 방에 바로 참가
              </span>
            )}
          </button>
          <p className="mt-2 text-xs leading-[1.6] text-foreground-muted">
            자리가 남은 방에 자동으로 들어갑니다. 왼쪽 목록에서 직접 골라도 됩니다.
          </p>

          {error && <p className="mt-3 text-sm text-accent">{error}</p>}

          <div className="my-4 flex items-center gap-3 text-[11px] text-foreground-muted">
            <span className="h-px flex-1 bg-[#e6e1d6]" /> 원하는 지도가 있다면{' '}
            <span className="h-px flex-1 bg-[#e6e1d6]" />
          </div>

          <Link href="/online/" className="btn-secondary block w-full text-center">
            지도 고르고 방 만들기 →
          </Link>
        </section>
      </div>
    </div>
  );
}
