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
import { assignSeatForClaim, isHostAbsent, pickHostSuccessor } from './roomLogic';
import { useGameStore } from '@/store/gameStore';
import { scheduleAICheck } from '@/store/helpers/aiScheduler';
import { safeInterval, safeTimeout } from '@/utils/safeTimers';

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
  /** 공개방 목록 (Phase 4 — refreshPublicRooms로 갱신) */
  publicRooms: RoomInfo[];
  publicRoomsLoading: boolean;
  /** 호스트 전용: 게임 중 이탈이 확인된 게스트 좌석 (10초 유예 후) — AI 전환 확인 다이얼로그용 */
  disconnectedSeat: { seat: number; name: string } | null;

  /** 방 생성 (호스트). seats의 seat 0이 호스트 좌석 — clientId는 자동 주입 */
  hostRoom: (opts: {
    mapId: string;
    title?: string;
    isPublic?: boolean;
    seats: RoomSeat[];
  }) => Promise<void>;
  /** 공개방 목록 갱신 (Phase 4) */
  refreshPublicRooms: () => Promise<void>;
  /** 빠른 매칭 (Phase 5): 빈자리 있는 공개방에 순서대로 입장 시도, 성공 여부 반환 */
  quickMatch: (name: string) => Promise<boolean>;
  /** 방 코드로 입장 (게스트 / 새로고침한 호스트 복귀). 좌석은 호스트가 배정해 room 브로드캐스트로 통지 */
  joinRoom: (code: string, name: string) => Promise<void>;
  /** 같은 탭 새로고침 후 마지막 방으로 자동 재입장 (성공 여부 반환) */
  autoRejoin: () => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  sendChat: (text: string) => void;
  /** 호스트 전용: 로비에서 좌석 구성 변경 (사람↔AI 등) */
  updateSeats: (seats: RoomSeat[]) => Promise<void>;
  /** 호스트 전용: 게임 시작 — initGame + status 'playing' */
  startOnlineGame: () => Promise<void>;
  /** 호스트 전용: 이탈한 게스트 좌석을 AI로 전환 (players.isAI + seats.kind — 게임 계속) */
  convertSeatToAI: (seat: number) => Promise<void>;
  /** 호스트 전용: 이탈 좌석 AI 전환 다이얼로그 닫기 (그 좌석은 이번 게임에 다시 묻지 않음) */
  dismissDisconnectPrompt: () => void;
}

// ---- 모듈 레벨 연결/루프 상태 (직렬화 불가 객체는 store 밖에) ----
let connection: RoomConnection | null = null;
/**
 * 연결 세대 — 재입장/나가기로 버려진 옛 채널의 이벤트(늦게 도착하는 CLOSED·presence 등)를
 * 무시하기 위한 토큰. 이게 없으면 "옛 채널 CLOSED → 끊김 오인 → 재연결 → 또 CLOSED" 순환으로
 * 연결이 계속 갈아엎어지며 스냅샷이 유실된다 (실측: 게스트 화면 멈춤의 원인).
 */
let connectionGen = 0;
let unsubscribeStore: (() => void) | null = null;
// 모든 넷 타이머는 safeTimeout/safeInterval(취소 함수 반환) — 창이 백그라운드로 가려져도
// 크롬 타이머 스로틀 없이 스냅샷 전송·재연결·하트비트가 계속 돈다
let broadcastTimer: (() => void) | null = null;
let takeoverTimer: (() => void) | null = null;
let disconnectTimer: (() => void) | null = null;
let reconnectTimer: (() => void) | null = null;
let reconnectAttempts = 0;
/** 호스트 대기실 하트비트 — 목록의 유령 방 필터(updated_at 2분) 기준 신호 */
let heartbeatTimer: (() => void) | null = null;
const HEARTBEAT_INTERVAL = 45_000;

function stopHeartbeat(): void {
  heartbeatTimer?.();
  heartbeatTimer = null;
}

function startWaitingHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = safeInterval(() => {
    const conn = connection;
    if (!conn || conn.room.status !== 'waiting') return stopHeartbeat();
    conn.touchRoom().catch((e) => console.warn('[net] 하트비트 실패:', e));
  }, HEARTBEAT_INTERVAL);
}
/** AI 전환을 물었다가 거절한 좌석 — 이번 게임엔 다시 묻지 않음 (leaveRoom/게임시작 시 초기화) */
let dismissedDisconnectSeats = new Set<number>();
let rev = 0;
let lastSyncedJson = '';
let lastAppliedRev = 0;
/** 마지막으로 전송한 스냅샷 페이로드 — 5초 keepalive 재전송용 (유실된 게스트 치유) */
let lastSnapshotPayload: SnapshotMessage | null = null;
let snapshotKeepaliveTimer: (() => void) | null = null;
/** 스냅샷 keepalive 주기 (ms) — 채널 출렁임으로 브로드캐스트를 놓친 게스트를 자동 치유 */
const SNAPSHOT_KEEPALIVE = 5_000;

/** 스냅샷 브로드캐스트 debounce (ms) — 액션 연쇄(정산 등)를 묶되 게스트 체감 지연 최소화 */
const BROADCAST_DEBOUNCE = 120;
/**
 * 단계 전환 홀드 (ms): currentPhase가 바뀌는 스냅샷은 직전 스냅샷 이후 최소 이 시간이
 * 지나야 내보낸다 — 누가(사람/봇) 단계를 넘겼든, 다른 참가자 화면에 "마지막 플레이어의
 * 행동"이 최소 이 시간만큼 머문다 (2026-07-04 피드백). 봇은 엔진 딜레이로 이미 간격이
 * 벌어져 있어 추가 대기가 거의 없다(누적 방지).
 */
const PHASE_CHANGE_HOLD = 1200;
let lastBroadcastAt = 0;
let lastBroadcastPhase: string | null = null;
/** 호스트 이탈 감지 후 승계까지 대기 (ms) — presence 플랩(짧은 끊김) 오탐 방지 */
const HOST_TAKEOVER_DELAY = 6000;

function seatOf(room: RoomInfo | null, clientId: string): number | null {
  const seat = room?.seats.find((s) => s.clientId === clientId);
  return seat ? seat.seat : null;
}

/** 조건이 참이 될 때까지 폴링 대기 (빠른 매칭의 좌석 배정 응답 대기용) */
async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return cond();
}

// ---- 자동 재입장 (같은 탭 새로고침 시 방 복귀 — sessionStorage) ----
const LAST_ROOM_KEY = 'aos-net-last-room';

function saveLastRoom(code: string, name: string): void {
  try {
    window.sessionStorage.setItem(LAST_ROOM_KEY, JSON.stringify({ code, name }));
  } catch {
    /* storage 불가 환경 — 자동 재입장만 포기 */
  }
}

function clearLastRoom(): void {
  try {
    window.sessionStorage.removeItem(LAST_ROOM_KEY);
  } catch {
    /* noop */
  }
}

export function getLastRoom(): { code: string; name: string } | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_ROOM_KEY);
    return raw ? (JSON.parse(raw) as { code: string; name: string }) : null;
  } catch {
    return null;
  }
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
      lastSnapshotPayload = { rev, z };
      lastBroadcastAt = Date.now();
      lastBroadcastPhase = (synced as { currentPhase?: string }).currentPhase ?? null;
      await conn.broadcastSnapshot(lastSnapshotPayload);
      console.log(`[net] 스냅샷 전송 rev=${rev} (압축 ${bytes}B)`);
      await conn.updateRoom({ snapshot: { rev, z } }); // 재접속·호스트 승계용 영속화
    } catch (e) {
      console.warn('[net] 스냅샷 전송 실패:', e);
    }
  };

  const scheduleBroadcast = (): void => {
    // 단계가 바뀌는 스냅샷은 직전 스냅샷 후 PHASE_CHANGE_HOLD가 지나도록 홀드
    const phaseNow = (useGameStore.getState() as unknown as { currentPhase: string }).currentPhase;
    const phaseChanged = lastBroadcastPhase !== null && phaseNow !== lastBroadcastPhase;
    const elapsed = Date.now() - lastBroadcastAt;
    const wanted = phaseChanged
      ? Math.max(BROADCAST_DEBOUNCE, PHASE_CHANGE_HOLD - elapsed)
      : BROADCAST_DEBOUNCE;

    if (broadcastTimer !== null) {
      if (!phaseChanged) return; // 이미 대기 중 — 그대로 묶어 전송
      broadcastTimer(); // 단계 전환이 끼었으면 홀드 시간으로 재설정
    }
    broadcastTimer = safeTimeout(() => {
      broadcastTimer = null;
      void broadcastSnapshotNow();
    }, wanted);
  };

  const startHostLoop = (): void => {
    stopHostLoop();
    // ⚠️ rev는 여기서 리셋하지 않는다 — 호스트 복귀/승계는 이어받은 rev로 계속해야
    // 게스트의 단조 증가 가드에 안 걸린다 (rev=0 리셋 → 게스트가 전부 드롭 → 영구 멈춤 실버그).
    // 새 방은 hostRoom이 rev=0을 명시적으로 설정한다.
    lastSyncedJson = '';
    lastSnapshotPayload = null;
    unsubscribeStore = useGameStore.subscribe(scheduleBroadcast);
    // keepalive: 채널 출렁임으로 브로드캐스트를 놓친 게스트를 위해 최신 스냅샷을 주기 재전송.
    // 이미 최신인 게스트는 rev 가드로 무시(no-op) — 상태가 안 바뀌어도 멈춘 게스트가 5초 내 치유된다
    snapshotKeepaliveTimer = safeInterval(() => {
      const conn = connection;
      if (!conn || !lastSnapshotPayload || get().mode !== 'host') return;
      conn.broadcastSnapshot(lastSnapshotPayload).catch(() => {});
    }, SNAPSHOT_KEEPALIVE);
  };

  const stopHostLoop = (): void => {
    unsubscribeStore?.();
    unsubscribeStore = null;
    broadcastTimer?.();
    broadcastTimer = null;
    snapshotKeepaliveTimer?.();
    snapshotKeepaliveTimer = null;
  };

  // ---- 게스트: 스냅샷 적용 ----
  const applySnapshotAsGuest = async (msg: SnapshotMessage): Promise<void> => {
    if (msg.rev <= lastAppliedRev) return; // 역순 도착 무시
    lastAppliedRev = msg.rev;
    const state = await decodeSnapshot(msg.z);
    if (lastAppliedRev !== msg.rev) return; // 디코딩 중 더 새 스냅샷이 적용됨
    // 이동 애니메이션 상태(netMovingCube)는 ui.movingCube로 주입 — 게스트도 호스트와
    // 같은 화물 이동 애니메이션을 본다 (정산은 게스트 completeCubeMove가 noop이라 안전)
    const { netMovingCube, ...gameState } = state as { netMovingCube?: unknown } & Record<string, unknown>;
    useGameStore.setState({
      ...gameState,
      ui: { ...useGameStore.getState().ui, movingCube: netMovingCube ?? null },
      // 로컬 전용 필드는 항상 안전값으로 (persist merge와 같은 원칙).
      // undoCount는 스냅샷 값 유지 — 게스트 취소 버튼 표시용 (되돌리기는 인텐트로 호스트가 실행)
      aiExecution: { pending: false, executionId: 0 },
    } as never);
  };

  // ---- 호스트: 좌석 배정 (대기실 입장 + 게임 중 끊긴 좌석 이어받기) ----
  const handleClaimSeat = async (msg: IntentMessage): Promise<void> => {
    const conn = connection;
    const { room, presentClientIds } = get();
    if (!conn || !room) return;

    try {
      const name = (msg.payload as { name?: string } | undefined)?.name;
      const newSeats = assignSeatForClaim(room.seats, room.status, presentClientIds, msg.clientId, name);
      if (newSeats && newSeats !== room.seats) {
        await conn.updateRoom({ seats: newSeats });
      }
      // 배정 불가(만석)여도 현재 좌석 상태는 재통지 — 게스트는 관전 상태로 남음
      await conn.broadcastRoom();
      set({ room: conn.room, mySeat: seatOf(conn.room, conn.clientId) });
    } catch (e) {
      console.warn('[net] 좌석 배정 처리 실패:', e);
    }
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
  // 각 연결마다 세대 토큰을 캡처 — 현재 세대가 아니면(버려진 채널) 모든 이벤트 무시
  const makeEvents = (): RoomEvents => {
    const gen = ++connectionGen;
    const stale = () => gen !== connectionGen;
    return {
    onIntent: (msg) => {
      if (stale()) return;
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
      if (!result.ok) {
        // 게스트가 낙관적으로 로컬 반영했을 수 있으므로 현재(정본) 상태를 강제 재전송해 교정
        lastSyncedJson = '';
        scheduleBroadcast();
      }
    },
    onSnapshot: (msg) => {
      if (stale()) return;
      if (get().mode !== 'guest') return;
      void applySnapshotAsGuest(msg);
    },
    onChat: (msg) => {
      if (stale()) return;
      set((s) => ({ chat: [...s.chat, msg].slice(-100) }));
    },
    onPresence: (clientIds) => {
      if (stale()) return;
      set({ presentClientIds: clientIds });
      checkHostTakeover();
      checkGuestDisconnect();
    },
    onRoom: (room) => {
      if (stale()) return;
      set({ room, mySeat: seatOf(room, getClientId()) });
      checkHostTakeover(); // 승계 완료/호스트 교체 통지 반영
      checkGuestDisconnect();
    },
    onConnectionState: (connected) => {
      if (stale()) return; // 버려진 옛 채널의 늦은 CLOSED — 재연결 오작동 방지 (핵심)
      set({ connected });
      if (connected) {
        reconnectAttempts = 0;
        reconnectTimer?.(); reconnectTimer = null;
        return;
      }
      scheduleReconnect();
    },
    };
  };

  // ---- 순단 자동 재연결 (채널이 끊기면 방 코드로 다시 붙는다 — 호스트는 복귀, 게스트는 재입장) ----
  const RECONNECT_DELAY = 5_000;
  const MAX_RECONNECT_ATTEMPTS = 5;

  const scheduleReconnect = (): void => {
    const { mode, room, mySeat } = get();
    if (mode === 'offline' || !room || reconnectTimer !== null) return;
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      set({ error: '서버 연결이 끊겼습니다 — 새로고침하면 다시 접속합니다.' });
      return;
    }
    const code = room.code;
    const name = (mySeat !== null && room.seats[mySeat]?.name) || getLastRoom()?.name || '플레이어';
    reconnectAttempts += 1;
    console.log(`[net] ${RECONNECT_DELAY / 1000}초 후 재연결 시도 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}): ${code}`);
    reconnectTimer = safeTimeout(async () => {
      reconnectTimer = null;
      if (get().connected || get().mode === 'offline') return; // 자동 재조인으로 이미 복구됨
      await get().joinRoom(code, name);
      if (!get().connected) scheduleReconnect(); // 실패 — 다음 시도 예약
    }, RECONNECT_DELAY);
  };

  // ---- 호스트: 게스트 이탈 감지 → AI 전환 제안 (10초 유예 — 새로고침 재접속 오탐 방지) ----
  const GUEST_DISCONNECT_GRACE = 10_000;

  const findOfflineGuestSeat = () => {
    const { room, presentClientIds } = get();
    return room?.seats.find(
      (s) =>
        s.kind === 'human' &&
        s.clientId &&
        s.clientId !== getClientId() &&
        !presentClientIds.includes(s.clientId) &&
        !dismissedDisconnectSeats.has(s.seat)
    );
  };

  const checkGuestDisconnect = (): void => {
    const { mode, room, disconnectedSeat } = get();
    if (mode !== 'host' || !room || room.status !== 'playing') {
      disconnectTimer?.(); disconnectTimer = null;
      if (disconnectedSeat) set({ disconnectedSeat: null });
      return;
    }
    const offline = findOfflineGuestSeat();
    if (!offline) {
      // 전원 복귀 — 유예 타이머/다이얼로그 해제
      disconnectTimer?.(); disconnectTimer = null;
      if (disconnectedSeat) set({ disconnectedSeat: null });
      return;
    }
    if (disconnectedSeat || disconnectTimer !== null) return; // 이미 묻는 중/대기 중
    disconnectTimer = safeTimeout(() => {
      disconnectTimer = null;
      const still = findOfflineGuestSeat();
      if (get().mode === 'host' && still) {
        console.log(`[net] 게스트 이탈 확인: ${still.name} (seat ${still.seat}) — AI 전환 제안`);
        set({ disconnectedSeat: { seat: still.seat, name: still.name } });
      }
    }, GUEST_DISCONNECT_GRACE);
  };

  // ---- 호스트 승계 (Phase 2) ----
  const cancelTakeover = (): void => {
    if (takeoverTimer !== null) {
      takeoverTimer();
      takeoverTimer = null;
    }
  };

  /** 게스트: 호스트 이탈 감지 → 결정론적 후계자(접속 중 가장 빠른 좌석)가 6초 후 승계 */
  const checkHostTakeover = (): void => {
    const { mode, room, presentClientIds } = get();
    if (mode !== 'guest' || !room || room.status !== 'playing') return cancelTakeover();
    if (!isHostAbsent(room.hostClientId, presentClientIds)) return cancelTakeover();
    if (pickHostSuccessor(room.seats, presentClientIds) !== getClientId()) return cancelTakeover();
    if (takeoverTimer !== null) return; // 이미 대기 중
    console.log(`[net] 호스트 이탈 감지 — ${HOST_TAKEOVER_DELAY / 1000}초 후 승계 시도`);
    takeoverTimer = safeTimeout(() => {
      takeoverTimer = null;
      void promoteToHost();
    }, HOST_TAKEOVER_DELAY);
  };

  const promoteToHost = async (): Promise<void> => {
    const conn = connection;
    const { mode, room, presentClientIds } = get();
    if (!conn || mode !== 'guest' || !room) return;
    if (!isHostAbsent(room.hostClientId, presentClientIds)) return; // 호스트 복귀 — 승계 취소
    console.log('[net] 호스트 승계 실행 — 이 클라이언트가 게임 엔진을 이어받음');
    removeGuestGuard();
    rev = lastAppliedRev; // 스냅샷 리비전 연속성 (게스트들의 역순 가드 통과)
    set({ mode: 'host' });
    startHostLoop();
    try {
      await conn.updateRoom({ hostClientId: conn.clientId });
      await conn.broadcastRoom();
      set({ room: conn.room });
    } catch (e) {
      console.warn('[net] 승계 중 방 갱신 실패:', e);
    }
    // 이어받은 시점이 AI 차례면 즉시 재가동 (AI 인스턴스는 getAIDecision이 지연 등록)
    scheduleAICheck(useGameStore.getState);
  };

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
    publicRooms: [],
    publicRoomsLoading: false,
    disconnectedSeat: null,

    convertSeatToAI: async (seat) => {
      const conn = connection;
      const { mode, room } = get();
      if (!conn || mode !== 'host' || !room) return;
      const seatInfo = room.seats.find((s) => s.seat === seat);
      if (!seatInfo || seatInfo.kind === 'ai') return;

      // ① 게임 상태: 해당 플레이어를 AI로 (스냅샷으로 전원에 전파)
      const playerId = useGameStore.getState().activePlayers[seat];
      if (playerId) {
        useGameStore.setState((s) => ({
          players: {
            ...s.players,
            [playerId]: { ...s.players[playerId], isAI: true },
          },
          logs: [
            ...s.logs,
            {
              turn: s.currentTurn,
              phase: s.currentPhase,
              player: playerId,
              action: `[시스템] ${s.players[playerId]?.name} 연결 끊김 — BOT으로 전환`,
              timestamp: Date.now(),
            },
          ],
        }) as never);
      }
      // ② 방 좌석: AI로 (재입장 좌석 이어받기 대상에서 제외)
      const seats = room.seats.map((s) =>
        s.seat === seat ? { ...s, kind: 'ai' as const, clientId: null } : s
      );
      try {
        await conn.updateRoom({ seats });
        await conn.broadcastRoom();
      } catch (e) {
        console.warn('[net] AI 전환 방 갱신 실패:', e);
      }
      set({ room: conn.room, disconnectedSeat: null });
      // 전환한 좌석이 지금 차례면 AI가 즉시 이어서 진행
      scheduleAICheck(useGameStore.getState);
    },

    dismissDisconnectPrompt: () => {
      const seat = get().disconnectedSeat?.seat;
      if (seat !== undefined) dismissedDisconnectSeats.add(seat);
      set({ disconnectedSeat: null });
    },

    refreshPublicRooms: async () => {
      set({ publicRoomsLoading: true });
      try {
        const rooms = await getTransport().listPublicRooms();
        set({ publicRooms: rooms, publicRoomsLoading: false });
      } catch (e) {
        set({
          publicRoomsLoading: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },

    quickMatch: async (name) => {
      set({ error: null });
      let rooms: RoomInfo[] = [];
      try {
        rooms = await getTransport().listPublicRooms();
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
        return false;
      }
      // 빈 human 좌석이 있는 대기실만 후보 (오래된 순 = listPublicRooms 정렬)
      const candidates = rooms.filter((r) =>
        r.seats.some((s) => s.kind === 'human' && !s.clientId)
      );
      for (const r of candidates) {
        await get().joinRoom(r.code, name);
        if (get().mode === 'offline') continue; // 입장 실패 (방 소멸 등)
        // 호스트의 좌석 배정 응답 대기 — 경합으로 만석이거나 호스트 오프라인이면 다음 방
        const seated = await waitFor(() => get().mySeat !== null, 4000);
        if (seated) return true;
        await get().leaveRoom();
      }
      set({ error: '빈자리가 있는 공개방이 없습니다 — 방을 만들어 보세요!' });
      return false;
    },

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
        rev = 0; // 새 방 — 리비전 처음부터
        startHostLoop();
        startWaitingHeartbeat(); // 공개방 목록 유령 방 필터용 생존 신호
        saveLastRoom(conn.room.code, seats[0]?.name ?? '호스트');
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
        const snap = conn.room.snapshot as { rev?: number; z?: string } | null;

        // ── 호스트 복귀 (같은 탭 새로고침): 내가 아직 이 방의 호스트면 엔진을 다시 이어받는다
        if (conn.room.hostClientId === conn.clientId) {
          if (snap?.z) {
            const state = await decodeSnapshot(snap.z);
            // 진행 중이던 이동 애니메이션도 복원 — GameBoard 타이머가 정산을 이어서 실행
            const { netMovingCube, ...gameState } = state as { netMovingCube?: unknown } & Record<string, unknown>;
            useGameStore.setState({
              ...gameState,
              ui: { ...useGameStore.getState().ui, movingCube: netMovingCube ?? null },
              aiExecution: { pending: false, executionId: 0 },
              undoCount: 0,
            } as never);
          }
          rev = snap?.rev ?? 0; // 리비전 연속성
          set({
            mode: 'host',
            room: conn.room,
            mySeat: seatOf(conn.room, conn.clientId),
            connected: true,
            busy: false,
            chat: [],
          });
          startHostLoop();
          if (conn.room.status === 'waiting') startWaitingHeartbeat();
          saveLastRoom(conn.room.code, name);
          await conn.broadcastRoom(); // 호스트 복귀 통지 (게스트들의 승계 타이머 취소)
          scheduleAICheck(useGameStore.getState);
          return;
        }

        // ── 게스트 입장/재입장
        set({
          mode: 'guest',
          room: conn.room,
          mySeat: seatOf(conn.room, conn.clientId),
          connected: true,
          busy: false,
          chat: [],
        });
        // 커밋 차단 가드 — 이후 이 클라이언트의 커밋 액션은 전부 intent로.
        // 채널 출렁임으로 유실될 수 있어 같은 멱등 id로 2.5초 뒤 1회 재전송 (호스트가 중복 무시)
        installGuestGuard((type, payload: GameIntentPayload) => {
          const seat = get().mySeat;
          if (seat === null) return; // 미배정(관전) — 커밋 불가
          const id = crypto.randomUUID();
          const sendOnce = () =>
            connection?.sendIntent({ id, seat, type, payload }).catch((e) => {
              console.warn(`[net] 인텐트 전송 실패 (${type}):`, e);
            });
          sendOnce();
          const genAtSend = connectionGen;
          safeTimeout(() => {
            if (connectionGen === genAtSend && get().mode === 'guest') sendOnce();
          }, 2_500);
        });
        saveLastRoom(conn.room.code, name);
        // 좌석 요청 (대기실 입장·재입장·게임 중 끊긴 좌석 이어받기 — 호스트가 배정).
        // 유실 대비 동일 id로 1회 재전송
        const claimId = crypto.randomUUID();
        await conn.sendIntent({ id: claimId, seat: -1, type: 'claimSeat', payload: { name } });
        safeTimeout(() => {
          if (get().mode === 'guest' && get().mySeat === null) {
            void conn.sendIntent({ id: claimId, seat: -1, type: 'claimSeat', payload: { name } }).catch(() => {});
          }
        }, 2_500);
        // 게임 중 입장(재접속): 방에 저장된 최신 스냅샷 즉시 복원
        if (conn.room.status === 'playing' && snap?.z) {
          await applySnapshotAsGuest({ rev: snap.rev ?? 1, z: snap.z });
        }
      } catch (e) {
        removeGuestGuard();
        set({ busy: false, error: e instanceof Error ? e.message : String(e) });
      }
    },

    autoRejoin: async () => {
      if (get().mode !== 'offline' || get().busy) return false;
      const last = getLastRoom();
      if (!last) return false;
      console.log(`[net] 자동 재입장 시도: ${last.code}`);
      await get().joinRoom(last.code, last.name);
      const ok = get().mode !== 'offline';
      if (!ok) clearLastRoom(); // 방이 사라졌으면 더 시도하지 않음
      return ok;
    },

    leaveRoom: async () => {
      // 호스트가 대기실을 명시적으로 떠나면 방 자체를 폐쇄 (목록의 유령 방 방지)
      const { mode, room } = get();
      if (mode === 'host' && room?.status === 'waiting' && connection) {
        await connection.closeRoom().catch((e) => console.warn('[net] 방 폐쇄 실패:', e));
      }
      connectionGen++; // 이 연결의 이후 이벤트(늦은 CLOSED 등) 전부 무시
      removeGuestGuard();
      stopHostLoop();
      stopHeartbeat();
      cancelTakeover();
      clearLastRoom();
      disconnectTimer?.(); disconnectTimer = null;
      reconnectTimer?.(); reconnectTimer = null;
      reconnectAttempts = 0;
      dismissedDisconnectSeats = new Set();
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
        disconnectedSeat: null,
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
      conn.sendChat(name, trimmed).catch((e) => console.warn('[net] 채팅 전송 실패:', e));
    },

    updateSeats: async (seats) => {
      const conn = connection;
      if (!conn || get().mode !== 'host') return;
      try {
        await conn.updateRoom({ seats });
        await conn.broadcastRoom();
        set({ room: conn.room });
      } catch (e) {
        console.warn('[net] 좌석 갱신 실패:', e);
      }
    },

    startOnlineGame: async () => {
      const conn = connection;
      const { room, mode } = get();
      if (!conn || mode !== 'host' || !room || room.status !== 'waiting') return;
      dismissedDisconnectSeats = new Set(); // 새 게임 — 이탈 프롬프트 기록 초기화
      const seats = room.seats;
      const names = seats.map((s) => s.name);
      const aiPlayers = seats
        .filter((s) => s.kind === 'ai')
        .map((s) => ({ playerIndex: s.seat, name: s.name }));
      useGameStore.getState().initGame(room.mapId, names, aiPlayers);
      try {
        await conn.updateRoom({ status: 'playing' });
        await conn.broadcastRoom();
        set({ room: conn.room });
      } catch (e) {
        console.warn('[net] 게임 시작 상태 전파 실패:', e);
      }
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

// 디버깅용: 전역에 노출 (__GAME_STORE__와 동일 패턴)
if (typeof window !== 'undefined') {
  (window as unknown as { __NET_STORE__: typeof useNetStore }).__NET_STORE__ = useNetStore;
}
