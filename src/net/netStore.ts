/**
 * 온라인 세션 스토어 (Phase 1 스텝 2)
 *
 * 역할별 동작:
 * - 호스트: gameStore 변화 구독 → 스냅샷(압축) 브로드캐스트 + rooms.snapshot 저장(재접속용),
 *   게스트 intent 수신 → applyGameIntent로 기존 액션 재실행, 로비 좌석 배정(claimSeat).
 * - 게스트: installGuestGuard로 커밋 액션 차단(intent 전송), 스냅샷 수신 → setState 반영.
 *
 * gameStore는 net을 모른다 — 의존 방향은 netStore → (intents/snapshotCodec) → gameStore 단방향.
 */
import { create } from 'zustand';
import { getTransport, getClientId } from './index';
import type {
  ChatMessage,
  IntentMessage,
  RoomConnection,
  RoomEvents,
  RoomInfo,
  RoomSeat,
  SnapshotMessage,
} from './types';
import { decodeSnapshot, encodeSnapshot, extractSyncedState } from './snapshotCodec';
import {
  applyGameIntent,
  installGuestGuard,
  removeGuestGuard,
  type GameIntentPayload,
} from './intents';
import { useGameStore } from '@/store/gameStore';

export type NetMode = 'offline' | 'host' | 'guest';

export interface NetStore {
  mode: NetMode;
  room: RoomInfo | null;
  /** 내 좌석(=playerIndex). null = 아직 미배정(관전 상태) */
  mySeat: number | null;
  presentClientIds: string[];
  chat: ChatMessage[];
  connected: boolean;
  busy: boolean;
  error: string | null;
  /** 마지막 브로드캐스트 스냅샷 압축 크기 (계측·게이트 확인용) */
  lastSnapshotBytes: number;

  /** 방 생성 (호스트). seats의 seat 0이 호스트 좌석 — clientId는 자동 주입 */
  hostRoom: (opts: {
    mapId: string;
    title?: string;
    isPublic?: boolean;
    seats: RoomSeat[];
  }) => Promise<void>;
  /** 방 코드로 입장 (게스트). 좌석은 호스트가 배정해 room 브로드캐스트로 통지 */
  joinRoom: (code: string, name: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  sendChat: (text: string) => void;
  /** 호스트 전용: 로비에서 좌석 구성 변경 (사람↔AI 등) */
  updateSeats: (seats: RoomSeat[]) => Promise<void>;
  /** 호스트 전용: 게임 시작 — initGame + status 'playing' */
  startOnlineGame: () => Promise<void>;
}

// ---- 모듈 레벨 연결/루프 상태 (직렬화 불가 객체는 store 밖에) ----
let connection: RoomConnection | null = null;
let unsubscribeStore: (() => void) | null = null;
let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
let rev = 0;
let lastSyncedJson = '';
let lastAppliedRev = 0;

/** 스냅샷 브로드캐스트 debounce (ms) — 액션 연쇄(정산 등)를 한 번에 묶는다 */
const BROADCAST_DEBOUNCE = 300;

function seatOf(room: RoomInfo | null, clientId: string): number | null {
  const seat = room?.seats.find((s) => s.clientId === clientId);
  return seat ? seat.seat : null;
}

export const useNetStore = create<NetStore>()((set, get) => {
  // ---- 호스트: 스냅샷 브로드캐스트 루프 ----
  const broadcastSnapshotNow = async (): Promise<void> => {
    const conn = connection;
    if (!conn || get().mode !== 'host') return;
    const synced = extractSyncedState(
      useGameStore.getState() as unknown as Record<string, unknown>
    );
    const json = JSON.stringify(synced);
    if (json === lastSyncedJson) return; // ui만 바뀐 경우 등 — 전송 생략
    lastSyncedJson = json;
    rev += 1;
    try {
      const { z, bytes } = await encodeSnapshot(synced);
      set({ lastSnapshotBytes: bytes });
      await conn.broadcastSnapshot({ rev, z });
      await conn.updateRoom({ snapshot: { rev, z } }); // 재접속·호스트 승계용 영속화
    } catch (e) {
      console.warn('[net] 스냅샷 전송 실패:', e);
    }
  };

  const scheduleBroadcast = (): void => {
    if (broadcastTimer !== null) return;
    broadcastTimer = setTimeout(() => {
      broadcastTimer = null;
      void broadcastSnapshotNow();
    }, BROADCAST_DEBOUNCE);
  };

  const startHostLoop = (): void => {
    stopHostLoop();
    rev = 0;
    lastSyncedJson = '';
    unsubscribeStore = useGameStore.subscribe(scheduleBroadcast);
  };

  const stopHostLoop = (): void => {
    unsubscribeStore?.();
    unsubscribeStore = null;
    if (broadcastTimer !== null) {
      clearTimeout(broadcastTimer);
      broadcastTimer = null;
    }
  };

  // ---- 게스트: 스냅샷 적용 ----
  const applySnapshotAsGuest = async (msg: SnapshotMessage): Promise<void> => {
    if (msg.rev <= lastAppliedRev) return; // 역순 도착 무시
    lastAppliedRev = msg.rev;
    const state = await decodeSnapshot(msg.z);
    if (lastAppliedRev !== msg.rev) return; // 디코딩 중 더 새 스냅샷이 적용됨
    useGameStore.setState({
      ...state,
      // 로컬 전용 필드는 항상 안전값으로 (persist merge와 같은 원칙)
      aiExecution: { pending: false, executionId: 0 },
      undoCount: 0,
    } as never);
  };

  // ---- 호스트: 로비 좌석 배정 ----
  const handleClaimSeat = async (msg: IntentMessage): Promise<void> => {
    const conn = connection;
    const room = get().room;
    if (!conn || !room) return;

    let seats = room.seats;
    const existing = seats.find((s) => s.clientId === msg.clientId);
    if (!existing) {
      if (room.status !== 'waiting') return; // 게임 중 신규 입장은 관전만 (Phase 2에서 재접속 좌석 복원)
      const open = seats.find((s) => s.kind === 'human' && !s.clientId);
      if (!open) {
        // 만석 — 현재 좌석 상태만 재통지 (게스트는 관전 상태로 남음)
        await conn.broadcastRoom();
        return;
      }
      const name = (msg.payload as { name?: string } | undefined)?.name;
      seats = seats.map((s) =>
        s.seat === open.seat ? { ...s, clientId: msg.clientId, name: name?.trim() || s.name } : s
      );
      await conn.updateRoom({ seats });
    }
    await conn.broadcastRoom();
    set({ room: conn.room, mySeat: seatOf(conn.room, conn.clientId) });
  };

  // 처리한 intent id 캐시 — 채널 재조인 시 push 재전송 등 중복 도착을 1회만 실행 (멱등성)
  const seenIntentIds: string[] = [];
  const isDuplicateIntent = (id: string | undefined): boolean => {
    if (!id) return false; // 구버전 메시지 — 통과
    if (seenIntentIds.includes(id)) return true;
    seenIntentIds.push(id);
    if (seenIntentIds.length > 300) seenIntentIds.splice(0, 100);
    return false;
  };

  // ---- 공통 이벤트 배선 ----
  const makeEvents = (): RoomEvents => ({
    onIntent: (msg) => {
      if (get().mode !== 'host') return;
      if (isDuplicateIntent(msg.id)) {
        console.warn(`[net] 중복 인텐트 무시: ${msg.type} (${msg.id?.slice(0, 8)})`);
        return;
      }
      if (msg.type === 'claimSeat') {
        void handleClaimSeat(msg);
        return;
      }
      if (get().room?.status !== 'playing') return; // 게임 전 게임 인텐트 무시
      const result = applyGameIntent(msg);
      console.log(`[net] 인텐트 ${result.ok ? '적용' : '거부'}: ${msg.type} (seat ${msg.seat})${result.ok ? '' : ` — ${result.reason}`}`);
    },
    onSnapshot: (msg) => {
      if (get().mode !== 'guest') return;
      void applySnapshotAsGuest(msg);
    },
    onChat: (msg) => set((s) => ({ chat: [...s.chat, msg].slice(-100) })),
    onPresence: (clientIds) => set({ presentClientIds: clientIds }),
    onRoom: (room) => {
      set({ room, mySeat: seatOf(room, getClientId()) });
    },
  });

  return {
    mode: 'offline',
    room: null,
    mySeat: null,
    presentClientIds: [],
    chat: [],
    connected: false,
    busy: false,
    error: null,
    lastSnapshotBytes: 0,

    hostRoom: async (opts) => {
      if (get().mode !== 'offline') await get().leaveRoom();
      set({ busy: true, error: null });
      try {
        const clientId = getClientId();
        // 호스트 = seat 0 (방 생성자 관례)
        const seats = opts.seats.map((s) =>
          s.seat === 0 ? { ...s, kind: 'human' as const, clientId } : s
        );
        const conn = await getTransport().createRoom({ ...opts, seats }, makeEvents());
        connection = conn;
        set({
          mode: 'host',
          room: conn.room,
          mySeat: 0,
          connected: true,
          busy: false,
          chat: [],
          presentClientIds: [clientId],
        });
        startHostLoop();
      } catch (e) {
        set({ busy: false, error: e instanceof Error ? e.message : String(e) });
      }
    },

    joinRoom: async (code, name) => {
      if (get().mode !== 'offline') await get().leaveRoom();
      set({ busy: true, error: null });
      try {
        const conn = await getTransport().joinRoom(code, makeEvents());
        connection = conn;
        lastAppliedRev = 0;
        set({
          mode: 'guest',
          room: conn.room,
          mySeat: seatOf(conn.room, conn.clientId),
          connected: true,
          busy: false,
          chat: [],
        });
        // 커밋 차단 가드 — 이후 이 클라이언트의 커밋 액션은 전부 intent로
        installGuestGuard((type, payload: GameIntentPayload) => {
          const seat = get().mySeat;
          if (seat === null) return; // 미배정(관전) — 커밋 불가
          void connection?.sendIntent({ seat, type, payload });
        });
        // 좌석 요청 (이미 배정돼 있으면 호스트가 좌석 상태만 재통지 — 재입장 겸용)
        await conn.sendIntent({ seat: -1, type: 'claimSeat', payload: { name } });
        // 게임 중 입장(재접속): 방에 저장된 최신 스냅샷 즉시 복원
        const snap = conn.room.snapshot as { rev?: number; z?: string } | null;
        if (conn.room.status === 'playing' && snap?.z) {
          await applySnapshotAsGuest({ rev: snap.rev ?? 1, z: snap.z });
        }
      } catch (e) {
        removeGuestGuard();
        set({ busy: false, error: e instanceof Error ? e.message : String(e) });
      }
    },

    leaveRoom: async () => {
      removeGuestGuard();
      stopHostLoop();
      const conn = connection;
      connection = null;
      lastAppliedRev = 0;
      set({
        mode: 'offline',
        room: null,
        mySeat: null,
        presentClientIds: [],
        chat: [],
        connected: false,
        error: null,
      });
      try {
        await conn?.leave();
      } catch {
        /* 이미 끊긴 채널 — 무시 */
      }
    },

    sendChat: (text) => {
      const trimmed = text.trim();
      const conn = connection;
      if (!trimmed || !conn) return;
      const { room, mySeat } = get();
      const name = (mySeat !== null && room?.seats[mySeat]?.name) || '관전자';
      const msg: ChatMessage = { clientId: conn.clientId, name, text: trimmed, at: Date.now() };
      // broadcast self=false — 내 메시지는 로컬에 직접 추가
      set((s) => ({ chat: [...s.chat, msg].slice(-100) }));
      void conn.sendChat(name, trimmed);
    },

    updateSeats: async (seats) => {
      const conn = connection;
      if (!conn || get().mode !== 'host') return;
      await conn.updateRoom({ seats });
      await conn.broadcastRoom();
      set({ room: conn.room });
    },

    startOnlineGame: async () => {
      const conn = connection;
      const { room, mode } = get();
      if (!conn || mode !== 'host' || !room || room.status !== 'waiting') return;
      const seats = room.seats;
      const names = seats.map((s) => s.name);
      const aiPlayers = seats
        .filter((s) => s.kind === 'ai')
        .map((s) => ({ playerIndex: s.seat, name: s.name }));
      useGameStore.getState().initGame(room.mapId, names, aiPlayers);
      await conn.updateRoom({ status: 'playing' });
      await conn.broadcastRoom();
      set({ room: conn.room });
    },
  };
});

/** 내 playerId (게임 중) — UI 차례 게이팅용. offline이면 null(핫시트 = 전원 로컬) */
export function getMyPlayerId(): string | null {
  const { mode, mySeat } = useNetStore.getState();
  if (mode === 'offline' || mySeat === null) return null;
  const active = useGameStore.getState().activePlayers;
  return active[mySeat] ?? null;
}
