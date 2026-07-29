'use client';

/**
 * 친구와 온라인 플레이 — 방 만들기 전용 화면 (랜딩 히어로 1차 CTA의 목적지)
 *
 * 게임 화면 안의 셋업 탭(OnlineLobby)을 재사용하지 않고 따로 둔 이유:
 * 랜딩에서 온 방문자에게는 "지도를 고르고 방을 연다"만 보여야 하는데, 셋업 탭은
 * 로컬 게임 설정·대기실·채팅까지 한 화면에 얹혀 있어 맥락이 섞인다.
 *
 * 범위는 **방을 만들거나 코드로 들어가는 지점까지**다. 방이 생기면 곧바로
 * /game/<맵>/으로 넘겨 기존 대기실(좌석 승계·호스트 승계·F5 재접속이 얽힌 검증된 화면)에 맡긴다.
 *
 * 레이아웃: 왼쪽 맵 캐러셀 + 오른쪽 설정 = 스크롤 없이 한 화면.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, ChevronLeft, ChevronRight, Globe, Loader2, User, Users, Zap } from 'lucide-react';
import { isNetConfigured } from '@/net';
import { useNetStore } from '@/net/netStore';
import { buildRoomSeats } from '@/net/roomLogic';
import { getMapProfile } from '@/maps/getMapProfile';
import { basePath, DIFF_COLOR, maps, thumbOf } from '@/data/mapCatalog';
import { useEnterMotion } from '@/hooks/useEnterMotion';

/** 온라인으로 열 수 있는 맵 = 플레이 가능한 맵 (미구현 맵 제외) */
const ONLINE_MAPS = maps
  .filter((m) => m.playable)
  .map((m) => {
    const profile = getMapProfile(m.slug);
    const players = [...profile.supportedPlayers].sort((a, b) => a - b);
    const turns = Array.from(
      new Set(
        profile.turnsByPlayers
          ? players.map((n) => profile.turnsByPlayers![n] ?? profile.maxTurns)
          : [profile.maxTurns]
      )
    ).sort((a, b) => a - b);
    return { ...m, players, turnLabel: `${turns.join('·')}턴` };
  });

const COUNT = ONLINE_MAPS.length;
const wrap = (i: number) => (i + COUNT) % COUNT;

export default function OnlinePlayPage() {
  const router = useRouter();
  const { enter, reduce } = useEnterMotion();
  const { mode, room, busy, error, hostRoom, joinRoom } = useNetStore();

  // 캐러셀 — index와 방향(dir: 슬라이드 애니메이션이 어느 쪽에서 들어올지)
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(0);
  const selected = ONLINE_MAPS[index];

  const [myName, setMyName] = useState('기차-하나');
  const [roomTitle, setRoomTitle] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [aiSeats, setAiSeats] = useState<Set<number>>(new Set());
  const [playerCount, setPlayerCount] = useState(ONLINE_MAPS[0].players[0]);

  const go = (delta: number) => {
    setDir(delta);
    setIndex((i) => wrap(i + delta));
  };

  const jumpTo = (target: number) => {
    if (target === index) return;
    setDir(target > index ? 1 : -1);
    setIndex(target);
  };

  // 맵을 바꾸면 인원·좌석 구성을 그 맵 기준으로 되돌린다 (3인 전용 몬트리올 ← 5인 독일 등)
  useEffect(() => {
    setPlayerCount((prev) => (selected.players.includes(prev) ? prev : selected.players[0]));
    setAiSeats(new Set());
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // 좌우 화살표 키로도 넘긴다 (입력 중일 땐 제외)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 방이 만들어졌거나 입장했으면 그 맵의 게임 페이지(대기실)로 넘긴다.
  // 게임 화면의 '나가기'가 맵 갤러리 대신 여기로 되돌아오도록 출발지를 남긴다.
  useEffect(() => {
    if (!room) return;
    try { window.sessionStorage.setItem('aos-back-to', '/online/'); } catch { /* noop */ }
    router.push(`/game/${room.mapId}/`);
  }, [room, router]);

  const toggleAiSeat = (seat: number) => {
    setAiSeats((prev) => {
      const next = new Set(prev);
      if (next.has(seat)) next.delete(seat);
      else next.add(seat);
      return next;
    });
  };

  const handleCreate = () => {
    // 좌석 구성은 OnlineLobby와 공유하는 buildRoomSeats 한 곳으로 (규칙 어긋남 방지)
    const seats = buildRoomSeats(playerCount, myName, aiSeats);
    void hostRoom({
      mapId: selected.slug,
      seats,
      isPublic,
      title: isPublic ? roomTitle.trim() || `${myName.trim() || '호스트'}의 방` : undefined,
    });
  };

  const handleJoin = () => {
    if (!joinCode.trim()) return;
    void joinRoom(joinCode.trim().toUpperCase(), myName.trim() || '게스트');
  };

  if (!isNetConfigured()) {
    return (
      <div className="mx-auto max-w-[720px] px-[clamp(18px,5vw,56px)] py-[clamp(48px,8vw,96px)]">
        <h1 className="mb-3 text-[clamp(26px,4vw,40px)] font-bold tracking-[-0.03em]">
          온라인 플레이
        </h1>
        <p className="text-foreground-secondary">
          이 배포에는 온라인 기능이 설정되어 있지 않습니다 (Supabase 환경변수 없음).{' '}
          <Link href="/maps" className="text-accent underline underline-offset-4">
            봇과 하는 게임
          </Link>
          은 그대로 즐길 수 있습니다.
        </p>
      </div>
    );
  }

  const connecting = busy || mode !== 'offline';
  const prev = ONLINE_MAPS[wrap(index - 1)];
  const next = ONLINE_MAPS[wrap(index + 1)];

  return (
    <div className="mx-auto max-w-[1180px] px-[clamp(18px,5vw,56px)] pb-[clamp(36px,5vw,64px)] pt-[clamp(24px,4vw,48px)]">
      <motion.div {...enter({ y: 12, ease: 'easeOut' })} className="mb-[clamp(18px,3vw,32px)]">
        <div className="mb-2 font-display text-xs font-medium tracking-[0.16em] text-accent">
          ONLINE / 친구와 함께
        </div>
        <h1 className="text-[clamp(26px,4.2vw,44px)] font-bold leading-[1.08] tracking-[-0.04em]">
          지도를 고르고 방을 여세요
        </h1>
      </motion.div>

      <div className="grid gap-[clamp(20px,3vw,40px)] lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── 왼쪽: 맵 캐러셀 ── */}
        <section aria-label="지도 고르기">
          <div className="relative flex items-stretch justify-center gap-2 sm:gap-3">
            {/* 이전 맵 — 살짝 걸쳐 보이게 */}
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={`이전 지도 (${prev.nameKo})`}
              className="relative hidden w-[52px] flex-none self-stretch overflow-hidden rounded-l-[16px] opacity-45 transition-opacity hover:opacity-80 sm:block"
            >
              <MapThumb map={prev} className="scale-110" />
            </button>

            {/* 현재 맵 */}
            <div className="relative min-w-0 flex-1">
              <AnimatePresence initial={false} custom={dir} mode="popLayout">
                <motion.div
                  key={selected.slug}
                  custom={dir}
                  initial={reduce ? false : { opacity: 0, x: dir > 0 ? 70 : -70 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir > 0 ? -70 : 70 }}
                  transition={{ duration: reduce ? 0 : 0.26, ease: 'easeOut' }}
                  drag={reduce ? false : 'x'}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.16}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -60) go(1);
                    else if (info.offset.x > 60) go(-1);
                  }}
                  className="glass-card cursor-grab overflow-hidden active:cursor-grabbing"
                >
                  <div className="relative aspect-[16/10] w-full bg-[#E9E2CB]">
                    <MapThumb map={selected} priority />
                    <span
                      className="absolute left-3 top-3 rounded-full px-[10px] py-1 text-[11px] font-semibold text-[#fffdf8]"
                      style={{ background: DIFF_COLOR[selected.diff] }}
                    >
                      {selected.diff}
                    </span>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* 화살표 — 이미지 위에 겹쳐 */}
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="이전 지도"
                className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#ddd6c8] bg-background-secondary/90 text-foreground shadow-glass backdrop-blur-sm transition-colors hover:border-accent hover:text-accent"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="다음 지도"
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#ddd6c8] bg-background-secondary/90 text-foreground shadow-glass backdrop-blur-sm transition-colors hover:border-accent hover:text-accent"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* 다음 맵 */}
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={`다음 지도 (${next.nameKo})`}
              className="relative hidden w-[52px] flex-none self-stretch overflow-hidden rounded-r-[16px] opacity-45 transition-opacity hover:opacity-80 sm:block"
            >
              <MapThumb map={next} className="scale-110" />
            </button>
          </div>

          {/* 선택된 맵 정보 */}
          <div className="mt-4 min-h-[104px] px-1 sm:px-[60px]">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[clamp(20px,2.6vw,27px)] font-bold tracking-[-0.02em] text-foreground">
                {selected.nameKo}
              </h2>
              <span className="font-display text-sm text-foreground-muted">{selected.name}</span>
              <span className="font-display text-sm font-medium text-accent">
                {selected.players.join('·')}인 · {selected.turnLabel}
              </span>
            </div>
            <p className="mt-2 text-[14.5px] leading-[1.7] text-foreground-secondary">
              {selected.description}
            </p>
          </div>

          {/* 점 인디케이터 */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-[7px]">
            {ONLINE_MAPS.map((m, i) => (
              <button
                key={m.slug}
                type="button"
                onClick={() => jumpTo(i)}
                aria-label={m.nameKo}
                aria-current={i === index}
                className={`h-[7px] rounded-full transition-all ${
                  i === index ? 'w-[22px] bg-accent' : 'w-[7px] bg-[#d9d1c1] hover:bg-[#c9c1b1]'
                }`}
              />
            ))}
          </div>
        </section>

        {/* ── 오른쪽: 자리 + 방 열기 ── */}
        <section className="glass-card h-fit p-5" aria-label="방 설정">
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-foreground-secondary">내 이름</span>
            <input
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              maxLength={12}
              className="w-full rounded-lg border border-[#ddd6c8] bg-background-secondary px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
            />
          </label>

          {/* 인원 칸은 맵을 넘길 때마다 사라지지 않게 항상 자리를 차지한다 —
              고정 인원 맵(몬트리올 3인 등)은 선택지 대신 그 인원을 그대로 보여준다 */}
          <div className="mb-4">
            <span className="mb-1 block text-xs font-medium text-foreground-secondary">인원</span>
            <div className="flex gap-2">
              {selected.players.length > 1 ? (
                selected.players.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPlayerCount(n)}
                    className={`flex-1 rounded-lg py-[7px] text-sm font-semibold transition-colors ${
                      playerCount === n
                        ? 'bg-accent text-[#fffdf8]'
                        : 'bg-background-secondary text-foreground-secondary hover:bg-background-tertiary'
                    }`}
                  >
                    {n}인
                  </button>
                ))
              ) : (
                <span className="flex-1 rounded-lg bg-accent py-[7px] text-center text-sm font-semibold text-[#fffdf8]">
                  {selected.players[0]}인
                </span>
              )}
            </div>
          </div>

          <div className="mb-4">
            <span className="mb-1 block text-xs font-medium text-foreground-secondary">
              자리 (눌러서 봇으로)
            </span>
            {/* 2인~6인 사이를 오갈 때 줄 수가 바뀌어 아래가 밀리므로 두 줄 높이(6인 실측 66px)를 확보 */}
            <div className="flex min-h-[66px] flex-wrap content-start gap-[6px]">
              {Array.from({ length: playerCount }, (_, i) => {
                const isMe = i === 0;
                const isBot = aiSeats.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={isMe}
                    onClick={() => toggleAiSeat(i)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-[9px] py-[6px] text-xs transition-colors ${
                      isMe
                        ? 'cursor-default border-accent bg-accent/10 font-semibold text-accent'
                        : isBot
                          ? 'border-[#ddd6c8] bg-background-tertiary text-foreground-secondary'
                          : 'border-[#ddd6c8] bg-background-secondary text-foreground'
                    }`}
                  >
                    {isMe ? <User size={12} /> : isBot ? <Bot size={12} /> : <Users size={12} />}
                    {isMe ? '나' : isBot ? '봇' : '친구'}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPublic((v) => !v)}
            className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              isPublic
                ? 'bg-positive/15 text-positive'
                : 'bg-background-tertiary text-foreground-secondary'
            }`}
          >
            <Globe size={12} /> {isPublic ? '공개방 (목록에 노출)' : '비공개 (코드로만)'}
          </button>

          {isPublic && (
            <input
              value={roomTitle}
              onChange={(e) => setRoomTitle(e.target.value)}
              placeholder={`방 제목 (기본: ${myName.trim() || '호스트'}의 방)`}
              className="mb-3 w-full rounded-lg border border-[#ddd6c8] bg-background-secondary px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
            />
          )}

          <button
            type="button"
            onClick={handleCreate}
            disabled={connecting}
            className="btn-primary w-full disabled:opacity-60"
          >
            {connecting ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 size={15} className="animate-spin" /> 방 만드는 중…
              </span>
            ) : (
              `${selected.nameKo} 방 만들기`
            )}
          </button>

          <div className="my-3 flex items-center gap-3 text-[11px] text-foreground-muted">
            <span className="h-px flex-1 bg-[#e6e1d6]" /> 코드가 있다면{' '}
            <span className="h-px flex-1 bg-[#e6e1d6]" />
          </div>

          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleJoin()}
              placeholder="방 코드"
              maxLength={8}
              className="min-w-0 flex-1 rounded-lg border border-[#ddd6c8] bg-background-secondary px-3 py-2 font-display text-sm tracking-widest text-foreground focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleJoin}
              disabled={connecting || !joinCode.trim()}
              className="btn-secondary px-4 py-2 text-sm disabled:opacity-50"
            >
              입장
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-accent">{error}</p>}

          <Link
            href="/online/quick/"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            <Zap size={14} /> 상대가 없다면 빈 방에 바로 참가 →
          </Link>
        </section>
      </div>
    </div>
  );
}

/** 캐러셀 이미지 — 카드용 축소본(thumb)만 쓴다. 원본 1600px은 /maps 라이트박스 전용 */
function MapThumb({
  map,
  className = '',
  priority = false,
}: {
  map: { image: string | null; nameKo: string };
  className?: string;
  priority?: boolean;
}) {
  const thumb = thumbOf(map.image);
  if (!thumb) return <div className="h-full w-full bg-[#E9E2CB]" />;
  return (
    <Image
      src={`${basePath}${thumb}`}
      alt={`${map.nameKo} 지도`}
      fill
      priority={priority}
      sizes="(max-width: 1024px) 100vw, 640px"
      className={`object-cover ${className}`}
    />
  );
}
