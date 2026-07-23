'use client';

/**
 * 온라인 멀티 로비 (Phase 1 스텝 3)
 * - 방 없음: 방 만들기(인원/좌석 구성) + 코드 입장 폼
 * - 대기실: 방 코드 공유, 좌석 현황(착석/빈자리/AI), 채팅, 호스트 시작 버튼
 * 게임 시작 후 화면 전환은 GamePageClient가 room.status === 'playing'을 보고 처리.
 */
import { useEffect, useRef, useState } from 'react';
import { isNetConfigured } from '@/net';
import type { RoomSeat } from '@/net';
import { useNetStore } from '@/net/netStore';
import { uniqueSeatName } from '@/net/roomLogic';
import { getMapData } from '@/utils/mapRegistry';
import {
  ArrowLeftRight, Bot, Check, Copy, Crown, Globe, Loader2, LogOut, Play, RefreshCw, Send, Star, User, UserX, Wifi, WifiOff, Zap,
} from 'lucide-react';
import { CROWN_GOLD, CROWN_INK } from './uiEffects';
import { ChatSenderIcon } from './ChatSenderIcon';
import ConfirmDialog from './ConfirmDialog';

function mapNameOf(mapId: string): string {
  try {
    return getMapData(mapId).name;
  } catch {
    return mapId;
  }
}

interface OnlineLobbyProps {
  mapId: string;
  supportedPlayers: number[];
}

export default function OnlineLobby({ mapId, supportedPlayers }: OnlineLobbyProps) {
  const {
    mode, room, mySeat, presentClientIds, chat, busy, error,
    publicRooms, publicRoomsLoading,
    hostRoom, joinRoom, leaveRoom, sendChat, updateSeats, startOnlineGame,
    refreshPublicRooms, quickMatch,
  } = useNetStore();

  const [myName, setMyName] = useState('기차-하나');
  const [joinCode, setJoinCode] = useState('');
  // 대기실 "방 나가기" 확인 (실수 클릭 방지 — 방장이 나가면 방이 닫힘)
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [playerCount, setPlayerCount] = useState(supportedPlayers[0]);
  // 방 만들기 좌석 구성: seat 0 = 나(호스트), 나머지 기본 = 친구 자리(사람)
  const [aiSeats, setAiSeats] = useState<Set<number>>(new Set());
  const [isPublic, setIsPublic] = useState(true);
  const [roomTitle, setRoomTitle] = useState('');
  const [matching, setMatching] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);
  const chatListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // scrollIntoView 금지 — 페이지 전체가 딸려 스크롤됨 (GameChat과 동일 이슈, 리뷰 스텝4)
    const list = chatListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chat.length]);

  // 공개방 목록: 로비 폼이 보이는 동안 8초 폴링 (Phase 4)
  useEffect(() => {
    if (room || !isNetConfigured()) return;
    void refreshPublicRooms();
    const timer = setInterval(() => void refreshPublicRooms(), 8000);
    return () => clearInterval(timer);
  }, [room, refreshPublicRooms]);

  if (!isNetConfigured()) {
    return (
      <div className="p-4 rounded-lg bg-background-tertiary text-sm text-foreground-secondary">
        온라인 기능이 설정되지 않은 배포입니다 (Supabase 환경변수 없음).
      </div>
    );
  }

  const toggleAiSeat = (seat: number) => {
    setAiSeats((prev) => {
      const next = new Set(prev);
      if (next.has(seat)) next.delete(seat);
      else next.add(seat);
      return next;
    });
  };

  const handleCreate = () => {
    // 좌석을 순차로 쌓으며 빈 사람 좌석엔 겹치지 않는 기본 이름(기차-하나/둘/…)을 부여한다.
    // 실제 참가자가 들어오면 assignSeatForClaim(uniqueSeatName)이 그 사람 이름으로 교체.
    const seats: RoomSeat[] = [];
    for (let i = 0; i < playerCount; i++) {
      if (i === 0) {
        seats.push({ seat: 0, name: myName.trim() || '호스트', kind: 'human', clientId: null });
      } else if (aiSeats.has(i)) {
        seats.push({ seat: i, name: `컴퓨터-기차${['', '', 'II', 'III', 'IV', 'V'][i] ?? ''}`, kind: 'ai', clientId: null });
      } else {
        seats.push({ seat: i, name: uniqueSeatName(undefined, seats, i), kind: 'human', clientId: null });
      }
    }
    void hostRoom({
      mapId,
      seats,
      isPublic,
      title: isPublic ? roomTitle.trim() || `${myName.trim() || '호스트'}의 방` : undefined,
    });
  };

  const handleQuickMatch = async () => {
    setMatching(true);
    await quickMatch(myName.trim() || '게스트');
    setMatching(false);
  };

  const handleJoin = () => {
    if (!joinCode.trim()) return;
    void joinRoom(joinCode.trim().toUpperCase(), myName.trim() || '게스트');
  };

  const handleCopy = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 미지원 — 코드가 화면에 있으므로 무시 */
    }
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChat(chatInput);
    setChatInput('');
  };

  // ---------- 대기실 ----------
  if (room) {
    // 시작 조건: AI 좌석이거나, 착석자가 실제 접속 중 (나갔다 안 돌아온 좌석은 미준비)
    const allReady = room.seats.every(
      (s) => s.kind === 'ai' || (s.clientId && presentClientIds.includes(s.clientId))
    );
    const isHost = mode === 'host';

    return (
      <div className="space-y-4">
        {/* 방 코드 */}
        <div className="p-4 rounded-xl bg-background-tertiary text-center">
          <div className="text-xs text-foreground-secondary mb-1">방 코드 — 친구에게 공유하세요</div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl font-bold tracking-[0.3em] text-accent font-display">{room.code}</span>
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg hover:bg-foreground/10 text-foreground-secondary"
              title="코드 복사"
            >
              {copied ? <Check size={16} className="text-positive" /> : <Copy size={16} />}
            </button>
          </div>
          <div className="mt-1 text-xs text-foreground-muted flex items-center justify-center gap-1">
            <Wifi size={12} /> 접속 {presentClientIds.length}명
          </div>
        </div>

        {/* 좌석 현황 */}
        <div className="space-y-2">
          {room.seats.map((seat) => {
            const online = seat.clientId ? presentClientIds.includes(seat.clientId) : false;
            const isMe = seat.seat === mySeat;
            return (
              <div
                key={seat.seat}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                  isMe ? 'border-accent bg-accent/5' : 'border-foreground/10 bg-background-secondary'
                }`}
              >
                {/* 정체성 아이콘(이름 앞): 나=왕관 / 호스트=별 / 봇 / 다른 사람=사람 */}
                {isMe ? (
                  <Crown size={16} fill={CROWN_GOLD} strokeWidth={1.8} style={{ color: CROWN_INK }} className="flex-shrink-0" aria-label="나" />
                ) : seat.clientId != null && seat.clientId === room.hostClientId ? (
                  <Star size={15} fill={CROWN_GOLD} strokeWidth={1.8} style={{ color: CROWN_INK }} className="flex-shrink-0" aria-label="호스트" />
                ) : seat.kind === 'ai' ? (
                  <Bot size={15} className="flex-shrink-0 text-steam-blue" aria-label="BOT" />
                ) : (
                  <User size={15} fill="currentColor" className="flex-shrink-0" style={{ color: CROWN_INK }} aria-label="사람" />
                )}
                <span className="text-sm text-foreground flex-1 truncate">
                  {seat.name}
                  {isMe && <span className="text-accent text-xs ml-1">(나)</span>}
                </span>
                {/* 호스트 태그: 내가 호스트여도 표시 */}
                {seat.clientId != null && seat.clientId === room.hostClientId && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full bg-yellow-500/15 text-yellow-600" title="호스트">
                    <Star size={12} fill={CROWN_GOLD} strokeWidth={1.8} style={{ color: CROWN_INK }} /> 호스트
                  </span>
                )}
                {seat.kind === 'ai' ? (
                  <>
                    {/* 호스트: BOT 자리를 사람 자리로 되돌림 (빈자리 = 참가 대기, 대기실 한정) */}
                    {isHost && room.status === 'waiting' && (
                      <button
                        onClick={() => {
                          void updateSeats(
                            room.seats.map((s) =>
                              s.seat === seat.seat
                                ? {
                                    ...s,
                                    kind: 'human' as const,
                                    clientId: null,
                                    name: uniqueSeatName(undefined, room.seats, s.seat),
                                  }
                                : s
                            )
                          );
                        }}
                        className="flex items-center gap-0.5 px-1.5 py-1 rounded-full bg-background-tertiary text-foreground-secondary hover:bg-foreground/10"
                        title="사람 자리로 전환 (참가 대기)"
                        aria-label="사람 자리로 전환"
                      >
                        <ArrowLeftRight size={13} /> <User size={14} fill="currentColor" />
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {seat.clientId ? (
                      <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                        online ? 'bg-positive/15 text-positive' : 'bg-foreground/10 text-foreground-muted'
                      }`}>
                        {online ? <Wifi size={11} /> : <WifiOff size={11} />} {online ? '접속' : '끊김'}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-foreground/10 text-foreground-muted">
                        대기 중…
                      </span>
                    )}
                    {/* 호스트: 접속 중인 게스트 내보내기 (본인/방장 좌석 제외, 대기실 한정) */}
                    {isHost && room.status === 'waiting' && online && !isMe && seat.clientId !== room.hostClientId && (
                      <button
                        onClick={() => {
                          void updateSeats(
                            room.seats.map((s) =>
                              s.seat === seat.seat
                                ? { ...s, clientId: null, name: uniqueSeatName(undefined, room.seats, s.seat) }
                                : s
                            )
                          );
                        }}
                        className="p-1 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20"
                        title="이 게스트를 방에서 내보내기"
                        aria-label="게스트 내보내기"
                      >
                        <UserX size={14} />
                      </button>
                    )}
                    {/* 호스트: 빈자리·나간 자리(끊김)를 봇으로 전환 (대기실 한정) */}
                    {isHost && !online && room.status === 'waiting' && (
                      <button
                        onClick={() => {
                          void updateSeats(
                            room.seats.map((s) =>
                              s.seat === seat.seat
                                ? { ...s, kind: 'ai' as const, name: `컴퓨터-기차${s.seat}`, clientId: null }
                                : s
                            )
                          );
                        }}
                        className="flex items-center gap-0.5 px-1.5 py-1 rounded-full bg-background-tertiary text-foreground-secondary hover:bg-foreground/10"
                        title="BOT으로 전환"
                        aria-label="BOT으로 전환"
                      >
                        <ArrowLeftRight size={13} /> <Bot size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* 채팅 */}
        <div className="rounded-lg border border-foreground/10 bg-background-secondary">
          <div ref={chatListRef} className="max-h-32 overflow-y-auto p-2 space-y-1">
            {chat.length === 0 && (
              <div className="text-xs text-foreground-muted text-center py-2">대기실 채팅</div>
            )}
            {chat.map((m, i) => (
              <div key={`${m.at}-${i}`} className="text-xs text-foreground break-words leading-relaxed">
                <ChatSenderIcon clientId={m.clientId} />
                <span className="font-semibold text-foreground-secondary">{m.name}</span>{' '}{m.text}
              </div>
            ))}
          </div>
          <div className="flex border-t border-foreground/10">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSendChat()}
              placeholder="메시지…"
              className="flex-1 px-3 py-2 bg-transparent text-sm text-foreground focus:outline-none"
            />
            <button onClick={handleSendChat} className="px-3 text-foreground-secondary hover:text-accent">
              <Send size={14} />
            </button>
          </div>
        </div>

        {/* 시작/나가기 */}
        {isHost ? (
          <button
            onClick={() => void startOnlineGame()}
            disabled={!allReady}
            className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 ${
              allReady ? 'btn-primary' : 'bg-background-tertiary text-foreground-muted cursor-not-allowed'
            }`}
          >
            <Play size={16} />
            {allReady ? '게임 시작' : '모든 자리가 차야 시작할 수 있어요 (빈자리는 BOT으로 전환 가능)'}
          </button>
        ) : (
          <div className="w-full py-3 rounded-xl bg-background-tertiary text-center text-sm text-foreground-secondary flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            호스트가 시작하기를 기다리는 중…
          </div>
        )}
        <button
          onClick={() => setLeaveConfirm(true)}
          className="w-full py-2 rounded-lg text-sm text-foreground-secondary hover:bg-foreground/5 flex items-center justify-center gap-1"
        >
          <LogOut size={13} /> 방 나가기
        </button>

        <ConfirmDialog
          open={leaveConfirm}
          title="방 나가기"
          message={
            isHost
              ? '방을 나갈까요? 방장이 나가면 방이 닫혀 참가자들도 함께 나가게 됩니다.'
              : '방을 나갈까요? 다시 들어오려면 방 코드로 재입장해야 합니다.'
          }
          confirmLabel="나가기"
          cancelLabel="계속 대기"
          onConfirm={() => {
            setLeaveConfirm(false);
            void leaveRoom();
          }}
          onCancel={() => setLeaveConfirm(false)}
        />
      </div>
    );
  }

  // ---------- 방 만들기 / 입장 폼 ----------
  return (
    <div className="space-y-5">
      {/* 내 이름 */}
      <div>
        <label className="flex items-center gap-2 text-sm text-foreground-secondary mb-2">
          <Crown size={16} fill={CROWN_GOLD} strokeWidth={1.8} style={{ color: CROWN_INK }} /> 내 이름
        </label>
        <input
          value={myName}
          onChange={(e) => setMyName(e.target.value)}
          className="w-full px-4 py-2 bg-background-secondary rounded-lg border border-foreground/10 text-foreground focus:border-accent focus:outline-none"
          placeholder="이름"
        />
      </div>

      {/* 방 만들기 */}
      <div className="p-4 rounded-xl border border-foreground/10 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">방 만들기</span>
          <button
            onClick={() => setIsPublic((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
              isPublic
                ? 'bg-positive/15 text-positive'
                : 'bg-background-tertiary text-foreground-secondary hover:bg-foreground/10'
            }`}
            title={isPublic ? '공개방 (목록에 노출)' : '비공개 (코드로만 입장)'}
          >
            <Globe size={11} /> {isPublic ? '공개' : '비공개'}
          </button>
        </div>
        {isPublic && (
          <input
            value={roomTitle}
            onChange={(e) => setRoomTitle(e.target.value)}
            placeholder={`방 제목 (기본: ${myName.trim() || '호스트'}의 방)`}
            className="w-full px-3 py-2 bg-background-secondary rounded-lg border border-foreground/10 text-sm text-foreground focus:border-accent focus:outline-none"
          />
        )}
        {supportedPlayers.length > 1 && (
          <div className="flex gap-2">
            {[...supportedPlayers].sort((a, b) => a - b).map((n) => (
              <button
                key={n}
                onClick={() => setPlayerCount(n)}
                className={`flex-1 py-1.5 px-2 rounded-lg text-sm font-semibold transition-colors ${
                  playerCount === n
                    ? 'bg-accent text-background'
                    : 'bg-background-secondary text-foreground-secondary hover:bg-background-tertiary'
                }`}
              >
                {n}인
              </button>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          {Array.from({ length: playerCount }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {i === 0 ? (
                <span className="text-foreground flex items-center gap-1">
                  <Crown size={16} fill={CROWN_GOLD} strokeWidth={1.8} style={{ color: CROWN_INK }} aria-label="나" />
                  {myName.trim() || '호스트'} <span className="text-accent">(나 · 호스트)</span>
                </span>
              ) : (
                <>
                  <span className="text-foreground-secondary flex-1">자리 {i + 1}</span>
                  <button
                    onClick={() => toggleAiSeat(i)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors ${
                      aiSeats.has(i)
                        ? 'bg-blue-500/15 text-blue-500'
                        : 'bg-background-tertiary text-foreground-secondary hover:bg-foreground/10'
                    }`}
                  >
                    {aiSeats.has(i) ? <Bot size={14} /> : <User size={14} fill="currentColor" />} {aiSeats.has(i) ? 'BOT' : '친구 자리'}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={handleCreate}
          disabled={busy}
          className="w-full btn-primary py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
        >
          {busy ? '만드는 중…' : '방 만들기 (코드 발급)'}
        </button>
      </div>

      {/* 코드 입장 */}
      <div className="p-4 rounded-xl border border-foreground/10 space-y-3">
        <div className="text-sm font-semibold text-foreground">코드로 입장</div>
        <div className="flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="방 코드 (예: 7XK2QP)"
            maxLength={6}
            className="flex-1 px-4 py-2 bg-background-secondary rounded-lg border border-foreground/10 text-foreground tracking-widest uppercase focus:border-accent focus:outline-none"
          />
          <button
            onClick={handleJoin}
            disabled={busy || joinCode.trim().length < 6}
            className="btn-secondary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
          >
            {busy ? '입장 중…' : '입장'}
          </button>
        </div>
      </div>

      {/* 공개방 목록 + 빠른 매칭 (Phase 4·5) */}
      <div className="p-4 rounded-xl border border-foreground/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground flex items-center gap-1">
            <Globe size={14} className="text-foreground-secondary" /> 공개방
          </div>
          <button
            onClick={() => void refreshPublicRooms()}
            className="p-1.5 rounded-lg hover:bg-foreground/10 text-foreground-secondary"
            title="목록 새로고침"
            aria-label="공개방 목록 새로고침"
          >
            <RefreshCw size={13} className={publicRoomsLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        <button
          onClick={() => void handleQuickMatch()}
          disabled={busy || matching}
          className="w-full btn-secondary py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Zap size={14} className="text-accent" />
          {matching ? '빈 공개방 찾는 중…' : '빠른 매칭 (빈 공개방 자동 참가)'}
        </button>

        {publicRooms.length === 0 ? (
          <div className="text-xs text-foreground-muted text-center py-2">
            대기 중인 공개방이 없습니다
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {publicRooms.map((r) => {
              const humanSeated = r.seats.filter((s) => s.kind === 'human' && s.clientId).length;
              const aiCount = r.seats.filter((s) => s.kind === 'ai').length;
              const full = !r.seats.some((s) => s.kind === 'human' && !s.clientId);
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background-secondary border border-foreground/10"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate">
                      {r.title || r.code}
                    </div>
                    <div className="text-[10px] text-foreground-secondary">
                      {mapNameOf(r.mapId)} · {humanSeated + aiCount}/{r.seats.length}명
                      {aiCount > 0 && ` (AI ${aiCount})`}
                    </div>
                  </div>
                  <button
                    onClick={() => void joinRoom(r.code, myName.trim() || '게스트')}
                    disabled={busy || full}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {full ? '만석' : '입장'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
          {error}
        </div>
      )}
    </div>
  );
}
