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
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Bot, Check, Globe, Loader2, User, Users, Zap } from 'lucide-react';
import { isNetConfigured, type RoomSeat } from '@/net';
import { useNetStore } from '@/net/netStore';
import { uniqueSeatName } from '@/net/roomLogic';
import { getMapProfile } from '@/maps/getMapProfile';
import { basePath, DIFF_COLOR, maps, thumbOf } from '@/data/mapCatalog';
import { useEnterMotion } from '@/hooks/useEnterMotion';

/** 온라인으로 열 수 있는 맵 = 플레이 가능한 맵 (미구현 맵 제외) */
const ONLINE_MAPS = maps
  .filter((m) => m.playable)
  .map((m) => {
    const profile = getMapProfile(m.slug);
    return {
      ...m,
      players: [...profile.supportedPlayers].sort((a, b) => a - b),
    };
  });

export default function OnlinePlayPage() {
  const router = useRouter();
  const { enter } = useEnterMotion();
  const { mode, room, busy, error, hostRoom, joinRoom } = useNetStore();

  const [mapSlug, setMapSlug] = useState(ONLINE_MAPS[0].slug);
  const [myName, setMyName] = useState('기차-하나');
  const [roomTitle, setRoomTitle] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [aiSeats, setAiSeats] = useState<Set<number>>(new Set());

  const selected = ONLINE_MAPS.find((m) => m.slug === mapSlug) ?? ONLINE_MAPS[0];
  const [playerCount, setPlayerCount] = useState(selected.players[0]);

  // 맵을 바꾸면 인원·좌석 구성을 그 맵 기준으로 되돌린다 (3인 전용 몬트리올 ← 5인 독일 등)
  useEffect(() => {
    setPlayerCount((prev) => (selected.players.includes(prev) ? prev : selected.players[0]));
    setAiSeats(new Set());
  }, [mapSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // 방이 만들어졌거나 입장했으면 그 맵의 게임 페이지(대기실)로 넘긴다
  useEffect(() => {
    if (room) router.push(`/game/${room.mapId}/`);
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
    // 좌석을 순차로 쌓으며 빈 사람 자리엔 겹치지 않는 기본 이름을 부여 (OnlineLobby와 같은 규칙)
    const seats: RoomSeat[] = [];
    for (let i = 0; i < playerCount; i++) {
      if (i === 0) {
        seats.push({ seat: 0, name: myName.trim() || '호스트', kind: 'human', clientId: null });
      } else if (aiSeats.has(i)) {
        seats.push({
          seat: i,
          name: `컴퓨터-기차${['', '', 'II', 'III', 'IV', 'V'][i] ?? ''}`,
          kind: 'ai',
          clientId: null,
        });
      } else {
        seats.push({ seat: i, name: uniqueSeatName(undefined, seats, i), kind: 'human', clientId: null });
      }
    }
    void hostRoom({
      mapId: mapSlug,
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

  return (
    <div className="mx-auto max-w-[1100px] px-[clamp(18px,5vw,56px)] pb-[clamp(48px,7vw,90px)] pt-[clamp(36px,6vw,72px)]">
      <motion.div {...enter({ y: 14, ease: 'easeOut' })}>
        <div className="mb-3 font-display text-xs font-medium tracking-[0.16em] text-accent">
          ONLINE / 친구와 함께
        </div>
        <h1 className="mb-[14px] text-[clamp(28px,5vw,52px)] font-bold leading-[1.06] tracking-[-0.04em]">
          방을 만들고 코드를 보내세요
        </h1>
        <p className="max-w-[620px] text-base leading-[1.8] text-foreground-secondary">
          설치도 가입도 없습니다. 지도를 고르고 방을 열면 여섯 자리 코드가 나옵니다 — 그걸
          친구에게 보내면 끝입니다. 자리가 남으면 봇으로 채워 바로 시작할 수 있습니다.
        </p>
      </motion.div>

      {/* ① 지도 고르기 */}
      <section className="mt-[clamp(30px,4vw,52px)]">
        <h2 className="mb-4 flex items-baseline gap-2 text-[19px] font-bold tracking-[-0.02em]">
          <span className="font-display text-sm text-accent">01</span> 지도 고르기
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ONLINE_MAPS.map((m) => {
            const active = m.slug === mapSlug;
            const thumb = thumbOf(m.image);
            return (
              <button
                key={m.slug}
                type="button"
                onClick={() => setMapSlug(m.slug)}
                aria-pressed={active}
                className={`glass-card overflow-hidden text-left transition-all ${
                  active
                    ? 'border-accent ring-2 ring-accent'
                    : 'hover:-translate-y-0.5 hover:border-[#d9d1c1]'
                }`}
              >
                <div className="relative aspect-[16/10] w-full bg-[#E9E2CB]">
                  {thumb && (
                    <Image
                      src={`${basePath}${thumb}`}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover"
                    />
                  )}
                  {active && (
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[#fffdf8]">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  )}
                  <span
                    className="absolute left-2 top-2 rounded-full px-2 py-[3px] text-[10px] font-semibold text-[#fffdf8]"
                    style={{ background: DIFF_COLOR[m.diff] }}
                  >
                    {m.diff}
                  </span>
                </div>
                <div className="px-3 py-[10px]">
                  <div className="truncate text-sm font-bold text-foreground">{m.nameKo}</div>
                  <div className="mt-[2px] font-display text-[11px] text-foreground-muted">
                    {m.players.join('·')}인
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ② 자리 구성 */}
      <section className="mt-[clamp(30px,4vw,48px)] grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <h2 className="mb-4 flex items-baseline gap-2 text-[19px] font-bold tracking-[-0.02em]">
            <span className="font-display text-sm text-accent">02</span> 자리 정하기
          </h2>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-foreground-secondary">내 이름</span>
            <input
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              maxLength={12}
              className="w-full max-w-[320px] rounded-lg border border-[#ddd6c8] bg-background-secondary px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
            />
          </label>

          {selected.players.length > 1 && (
            <div className="mb-4">
              <span className="mb-1 block text-xs font-medium text-foreground-secondary">인원</span>
              <div className="flex gap-2">
                {selected.players.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPlayerCount(n)}
                    className={`rounded-lg px-4 py-[7px] text-sm font-semibold transition-colors ${
                      playerCount === n
                        ? 'bg-accent text-[#fffdf8]'
                        : 'bg-background-secondary text-foreground-secondary hover:bg-background-tertiary'
                    }`}
                  >
                    {n}인
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="mb-1 block text-xs font-medium text-foreground-secondary">
              자리 (사람 ↔ 봇)
            </span>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: playerCount }, (_, i) => {
                const isMe = i === 0;
                const isBot = aiSeats.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={isMe}
                    onClick={() => toggleAiSeat(i)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-[7px] text-sm transition-colors ${
                      isMe
                        ? 'cursor-default border-accent bg-accent/10 font-semibold text-accent'
                        : isBot
                          ? 'border-[#ddd6c8] bg-background-tertiary text-foreground-secondary'
                          : 'border-[#ddd6c8] bg-background-secondary text-foreground'
                    }`}
                  >
                    {isMe ? <User size={13} /> : isBot ? <Bot size={13} /> : <Users size={13} />}
                    {isMe ? `${myName.trim() || '나'} (나)` : isBot ? '봇' : '친구 자리'}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-foreground-muted">
              친구 자리는 코드로 들어온 사람이 채웁니다. 남은 자리는 대기실에서도 봇으로 바꿀 수 있어요.
            </p>
          </div>
        </div>

        {/* ③ 방 열기 */}
        <div className="glass-card h-fit p-5">
          <h2 className="mb-4 flex items-baseline gap-2 text-[19px] font-bold tracking-[-0.02em]">
            <span className="font-display text-sm text-accent">03</span> 방 열기
          </h2>

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

          <div className="my-4 flex items-center gap-3 text-[11px] text-foreground-muted">
            <span className="h-px flex-1 bg-[#e6e1d6]" /> 이미 코드가 있다면{' '}
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
        </div>
      </section>
    </div>
  );
}
