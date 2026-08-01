'use client';

/**
 * 온라인 멀티 로비 (Phase 1 스텝 3)
 * - 방 없음: 방 만들기(인원/좌석 구성) + 코드 입장 폼
 * - 대기실: 방 코드 공유, 좌석 현황(착석/빈자리/AI), 채팅, 호스트 시작 버튼
 * 게임 시작 후 화면 전환은 GamePageClient가 room.status === 'playing'을 보고 처리.
 */
import { useEffect, useRef, useState } from 'react';
import { isNetConfigured } from '@/net';
import { useNetStore } from '@/net/netStore';
import { uniqueSeatName, buildRoomSeats } from '@/net/roomLogic';
import { getMapData } from '@/utils/mapRegistry';
import { getMapProfile } from '@/maps/getMapProfile';
import { maps } from '@/data/mapCatalog';
import {
  ArrowLeftRight, Bot, Check, Copy, Crown, Globe, Loader2, LogOut, Pencil, Play, RefreshCw, Route, Send, Star, User, UserX, Wifi, WifiOff, X, Zap,
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

/**
 * 방을 만들 때 고를 수 있는 맵 — 온라인은 URL의 맵에 묶이지 않는다.
 * (히어로 CTA가 기본 맵으로 보내도 여기서 바꿀 수 있어야 한다는 요구)
 * 기준은 mapCatalog의 playable 맵 하나로 통일 — /online 방 만들기 화면(ONLINE_MAPS)과
 * 같은 소스라야 새 맵 추가 시 두 화면의 목록이 어긋나지 않는다 (2026-07-29 코드리뷰).
 */
const CREATABLE_MAPS: { id: string; name: string; players: number[] }[] = maps
  .filter((m) => m.playable)
  .map((m) => {
    const profile = getMapProfile(m.slug);
    return {
      id: m.slug,
      name: mapNameOf(m.slug),
      players: [...profile.supportedPlayers].sort((a, b) => a - b),
    };
  });

interface OnlineLobbyProps {
  mapId: string;
  supportedPlayers: number[];
}

export default function OnlineLobby({ mapId, supportedPlayers }: OnlineLobbyProps) {
  const {
    mode, room, mySeat, presentClientIds, chat, busy, error,
    publicRooms, publicRoomsLoading,
    hostRoom, joinRoom, leaveRoom, sendChat, updateSeats, kickSeat, unbanUser, startOnlineGame,
    refreshPublicRooms, quickMatch, renameSeat,
    moveGuideAllowed, setMoveGuideAllowed,
  } = useNetStore();

  // 대기실 본인 이름 편집
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const [myName, setMyName] = useState('기차-하나');
  const [joinCode, setJoinCode] = useState('');
  // 대기실 "방 나가기" 확인 (실수 클릭 방지 — 방장이 나가면 방이 닫힘)
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  // 방 만들기용 맵 — URL의 맵으로 시작하되 로비에서 바꿀 수 있다.
  // 방을 만들면 GamePageClient가 room.mapId와 URL이 다른 걸 감지해 그 맵 페이지로 옮겨준다.
  const [createMapId, setCreateMapId] = useState(mapId);
  const createMapPlayers =
    CREATABLE_MAPS.find((m) => m.id === createMapId)?.players ?? supportedPlayers;
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

  // 맵을 바꾸면 인원도 그 맵이 지원하는 값으로 맞춘다 (예: 3인 전용 몬트리올 ← 5인 독일)
  useEffect(() => {
    setPlayerCount((prev) => (createMapPlayers.includes(prev) ? prev : createMapPlayers[0]));
    setAiSeats(new Set());
  }, [createMapId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 공개방 목록: 로비 폼이 보이는 동안 8초 폴링 (Phase 4)
  useEffect(() => {
    if (room || !isNetConfigured()) return;
    void refreshPublicRooms();
    const timer = setInterval(() => void refreshPublicRooms(), 8000);
    return () => clearInterval(timer);
  }, [room, refreshPublicRooms]);

  /* 랜딩의 "빈 방에 바로 참가하기" CTA(?mode=online&quick=1) — 진입하자마자 빠른 매칭 1회.
     빈 방이 없으면 netStore가 안내 메시지를 세우고 그대로 로비에 머문다(방 만들기로 이어짐).
     쿼리는 즉시 지워 새로고침/뒤로가기에서 다시 매칭되지 않게 한다. */
  const quickTried = useRef(false);
  useEffect(() => {
    if (quickTried.current || room || !isNetConfigured()) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('quick') !== '1') return;
    quickTried.current = true;
    params.delete('quick');
    const qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    void handleQuickMatch();
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const seats = buildRoomSeats(playerCount, myName, aiSeats);
    void hostRoom({
      mapId: createMapId,
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

  const startEditName = (currentName: string) => {
    setNameDraft(currentName);
    setNameError(null);
    setEditingName(true);
  };
  const submitName = async () => {
    const res = await renameSeat(nameDraft);
    if (res.ok) {
      setEditingName(false);
      setNameError(null);
    } else {
      setNameError(res.reason ?? '변경에 실패했어요');
    }
  };

  // 방 설정: 화물 이동 가이드 토글 (방 만들기 폼 + 대기실 방장 공용).
  // off로 시작한 게임은 참가자 전원이 게임 중에도 켤 수 없다 (GameState.moveGuideAllowed 잠김).
  const moveGuideToggle = (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground flex items-center gap-1">
          <Route size={12} className="text-foreground-secondary" /> 운송 가이드
        </div>
        <p className="text-[10px] text-foreground-secondary leading-snug">
          화물 선택 시 배달 가능 도시·최적 경로 표시 — 끄면 게임 중 아무도 켤 수 없어요
        </p>
      </div>
      <button
        onClick={() => setMoveGuideAllowed(!moveGuideAllowed)}
        className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
          moveGuideAllowed
            ? 'bg-positive/15 text-positive'
            : 'bg-background-tertiary text-foreground-secondary hover:bg-foreground/10'
        }`}
        title={moveGuideAllowed ? '가이드 허용 (각자 게임 중 on/off 가능)' : '가이드 금지 (게임 중 변경 불가)'}
      >
        {moveGuideAllowed ? '허용' : '금지'}
      </button>
    </div>
  );

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
                {isMe && editingName && room.status === 'waiting' ? (
                  /* 본인 이름 편집 (대기실 한정) — 트림 저장·중복 거부는 renameSeat가 처리 */
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <input
                        value={nameDraft}
                        onChange={(e) => { setNameDraft(e.target.value); setNameError(null); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submitName();
                          else if (e.key === 'Escape') { setEditingName(false); setNameError(null); }
                        }}
                        autoFocus
                        maxLength={20}
                        placeholder="이름"
                        className="flex-1 min-w-0 px-2 py-0.5 text-sm rounded border border-accent bg-background text-foreground focus:outline-none"
                      />
                      <button onClick={() => void submitName()} className="p-1 rounded text-positive hover:bg-foreground/10" aria-label="이름 저장">
                        <Check size={14} />
                      </button>
                      <button onClick={() => { setEditingName(false); setNameError(null); }} className="p-1 rounded text-foreground-muted hover:bg-foreground/10" aria-label="편집 취소">
                        <X size={14} />
                      </button>
                    </div>
                    {nameError && <p className="text-[11px] text-red-500 mt-0.5 truncate">{nameError}</p>}
                  </div>
                ) : (
                  <span className="text-sm text-foreground flex-1 truncate flex items-center gap-1">
                    <span className="truncate">{seat.name}</span>
                    {isMe && <span className="text-accent text-xs flex-shrink-0">(나)</span>}
                    {isMe && room.status === 'waiting' && (
                      <button
                        onClick={() => startEditName(seat.name)}
                        className="p-0.5 flex-shrink-0 text-foreground-muted hover:text-accent"
                        title="이름 변경"
                        aria-label="이름 변경"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                  </span>
                )}
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
                        // 좌석 비우기 + 차단(O4) — 좌석만 비우면 코드를 다시 입력해
                        // 그대로 다시 들어왔다. 아래 "차단된 참가자" 목록에서 바로 해제할 수 있다.
                        onClick={() => void kickSeat(seat.seat)}
                        className="p-1 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20"
                        title="이 게스트를 내보내고 재입장을 차단합니다"
                        aria-label="게스트 내보내고 차단"
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

        {/* 차단된 참가자 (O4) — 호스트에게만, 차단이 있을 때만 나타난다.
            평소엔 섹션 자체가 없어 대기실이 지저분해지지 않고, 내보낸 직후에만 보인다. */}
        {isHost && (room.banned?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-foreground/10 bg-background-secondary p-2">
            <div className="flex items-center gap-1.5 px-1 pb-1.5 text-[11px] font-semibold text-foreground-muted">
              <UserX size={12} />
              차단된 참가자 {room.banned?.length}명
            </div>
            <div className="space-y-1">
              {room.banned?.map((b) => (
                <div
                  key={b.uid}
                  className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs"
                >
                  <span className="truncate text-foreground-secondary">{b.name}</span>
                  <button
                    onClick={() => void unbanUser(b.uid)}
                    className="flex-none rounded px-2 py-0.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/10"
                    title={`${b.name}의 차단을 해제해 다시 입장할 수 있게 합니다`}
                  >
                    해제
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
              className="flex-1 px-3 py-2 bg-transparent text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            />
            <button onClick={handleSendChat} className="px-3 text-foreground-secondary hover:text-accent">
              <Send size={14} />
            </button>
          </div>
        </div>

        {/* 방 설정 (방장 전용, 시작 전) — 게스트에겐 미표시 (room 동기화 없음, 게임 시작 후
            스냅샷·헤더 스위치 잠김으로 전달) */}
        {isHost && room.status === 'waiting' && (
          <div className="p-3 rounded-lg border border-foreground/10 bg-background-secondary">
            {moveGuideToggle}
          </div>
        )}

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
        {/* 지도 선택 — 온라인 방은 URL의 맵에 묶이지 않는다 */}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground-secondary">지도</span>
          <select
            value={createMapId}
            onChange={(e) => setCreateMapId(e.target.value)}
            className="w-full rounded-lg border border-foreground/10 bg-background-secondary px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
          >
            {CREATABLE_MAPS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.players.join('·')}인)
              </option>
            ))}
          </select>
        </label>
        {createMapPlayers.length > 1 && (
          <div className="flex gap-2">
            {createMapPlayers.map((n) => (
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
        {moveGuideToggle}
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
