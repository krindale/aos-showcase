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
import {
  addBan,
  assignSeatForClaim,
  isBanned,
  isHostAbsent,
  pickHostSuccessor,
  removeBan,
  renameSeat as renameSeatRule,
  uniqueSeatName,
} from './roomLogic';
import { useGameStore } from '@/store/gameStore';
import { scheduleAICheck } from '@/store/helpers/aiScheduler';
import { clearUndo } from '@/store/helpers/undo';
import { safeInterval, safeTimeout } from '@/utils/safeTimers';
import { turboDelay, setTurboAllowed } from '@/utils/turboMode';

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
  /**
   * 게스트 전용: 호스트 연결이 끊겨 승계 여부를 물어야 하는 상태 (6초 유예 후 표시).
   * - status: 대기실('waiting') / 게임 중('playing') — 문구·동작 분기
   * - canTakeover: 내가 결정론적 후계자면 true(이어받기 버튼), 아니면 대기 안내
   * 호스트 복귀·승계 완료 시 자동으로 null (팝업 닫힘 → 계속 진행).
   */
  hostTakeoverPrompt: { status: 'waiting' | 'playing'; canTakeover: boolean } | null;

  /**
   * 방 설정: 화물 이동 가이드 허용 (호스트 로컬 — 방 만들기/대기실에서 토글, 기본 true).
   * startOnlineGame이 GameState.moveGuideAllowed로 주입해 스냅샷으로 전원 동기화한다.
   * rooms 테이블/RoomInfo에는 싣지 않으므로(스키마 무변경) 대기실 게스트에겐 안 보이고,
   * 게임 시작 후 스냅샷·헤더 스위치 잠김으로 알게 된다.
   */
  moveGuideAllowed: boolean;
  setMoveGuideAllowed: (allowed: boolean) => void;

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
  /** 방 코드로 입장 (게스트 / 새로고침한 호스트 복귀). 좌석은 호스트가 배정해 room 브로드캐스트로 통지.
   *  reconnect=true(순단 자동 재연결)면 offline 전환(leaveRoom)을 거치지 않고 같은 방에 조용히 재부착한다
   *  — 안 그러면 mode가 잠깐 offline이 돼 화면이 셋업으로 튕기고(F5 깜빡임) 좌석이 관전으로 풀린다. */
  joinRoom: (code: string, name: string, reconnect?: boolean) => Promise<void>;
  /** 같은 탭 새로고침 후 마지막 방으로 자동 재입장 (성공 여부 반환) */
  autoRejoin: () => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  sendChat: (text: string) => void;
  /** 호스트 전용: 로비에서 좌석 구성 변경 (사람↔AI 등) */
  updateSeats: (seats: RoomSeat[]) => Promise<void>;
  /**
   * 호스트 전용: 게스트를 내보내고 **차단**한다 (O4, 대기실 한정).
   * 좌석 비우기 + banned 등록 + participant_uids 제거를 한 번에 —
   * participant에서 빠지면 RLS update 권한도 함께 회수된다.
   * 좌석에 uid가 없으면(익명 로그인 이전 데이터) 차단 없이 내보내기만 한다.
   */
  kickSeat: (seat: number) => Promise<void>;
  /** 호스트 전용: 차단 해제 — 다시 입장할 수 있게 된다 */
  unbanUser: (uid: string) => Promise<void>;
  /**
   * 대기실에서 본인 좌석 이름 변경 (트림 저장, 중복 이름 거부).
   * 호스트는 직접 반영, 게스트는 intent로 호스트에 요청 → 스냅샷/room 통지로 확정.
   * 반환: { ok } — 로컬 선검사 실패(빈 이름/중복) 시 ok:false + reason.
   */
  renameSeat: (name: string) => Promise<{ ok: boolean; reason?: string }>;
  /** 호스트 전용: 게임 시작 — initGame + status 'playing' */
  startOnlineGame: () => Promise<void>;
  /** 호스트 전용: 이탈한 게스트 좌석을 AI로 전환 (players.isAI + seats.kind — 게임 계속) */
  convertSeatToAI: (seat: number) => Promise<void>;
  /** 호스트 전용: 이탈 좌석 AI 전환 다이얼로그 닫기 (그 좌석은 이번 게임에 다시 묻지 않음) */
  dismissDisconnectPrompt: () => void;
  /** 게스트: 호스트 승계 팝업에서 "이어받기" 선택 (후계자만 유효) */
  acceptHostTakeover: () => Promise<void>;
  /** 게스트: 호스트 승계 팝업에서 "나가기/게임 종료" 선택 → 방을 떠나 온라인 초기 화면으로 */
  declineHostTakeover: () => Promise<void>;
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
/**
 * O3 계측: 게스트가 스냅샷을 놓친 누적 횟수(rev가 1 초과로 점프한 합).
 * keepalive(작업1)가 실제로 게스트를 몇 번이나 구제하는지 가늠하기 위한 것 —
 * netStore 상태로 노출하지 않고 모듈 지역 변수 + console.warn으로만 남긴다.
 * lastAppliedRev를 0으로 되돌리는 지점(방 재입장·나가기·이중호스트 강등)마다 함께 리셋.
 */
let skippedSnapshotCount = 0;
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
  // ---- 호스트: 스냅샷 keepalive 재예약 ----
  // 채널 출렁임으로 브로드캐스트를 놓친 게스트를 치유하려고 마지막 스냅샷을 주기 재전송한다.
  // ⚠️ 5초 고정 interval에 "최근에 실전송했으면 스킵" 조건만 얹으면 경계에서 공백이 최대
  // 10초로 벌어진다(예: 4.9초 전 실전송 → 이번 tick 스킵 → 다음 tick까지 또 5초).
  // 대신 **실제 전송이 일어날 때마다(정상 브로드캐스트든 keepalive 자신이든) 이 타이머를
  // 다시 SNAPSHOT_KEEPALIVE 뒤로 예약**한다 — "마지막 전송으로부터 5초"가 항상 유지되므로
  // 공백 상한이 정확히 SNAPSHOT_KEEPALIVE(5초)로 고정된다.
  const scheduleSnapshotKeepalive = (): void => {
    snapshotKeepaliveTimer?.();
    snapshotKeepaliveTimer = safeTimeout(() => {
      const conn = connection;
      if (!conn || !lastSnapshotPayload || get().mode !== 'host') {
        snapshotKeepaliveTimer = null;
        return; // 호스트 아니게 됐거나 아직 보낼 스냅샷이 없음 — 재예약 없이 종료(stopHostLoop가 정리)
      }
      conn.broadcastSnapshot(lastSnapshotPayload).catch(() => {});
      scheduleSnapshotKeepalive(); // keepalive 자신도 "전송"이므로 다음 5초를 다시 예약
    }, SNAPSHOT_KEEPALIVE);
  };

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
      scheduleSnapshotKeepalive(); // 방금 실전송했으니 keepalive 카운트다운 리셋 (작업1)
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
      ? Math.max(BROADCAST_DEBOUNCE, turboDelay(PHASE_CHANGE_HOLD) - elapsed)
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
    // 이미 최신인 게스트는 rev 가드로 무시(no-op) — 상태가 안 바뀌어도 멈춘 게스트가 5초 내 치유된다.
    // (실제 예약/재예약은 scheduleSnapshotKeepalive — 매 실전송마다 카운트다운이 리셋된다)
    scheduleSnapshotKeepalive();
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
    if (msg.rev <= lastAppliedRev) return; // 역순 도착 무시(keepalive 재전송도 여기 걸림 — 유실 아님)
    // O3 계측: rev가 1 초과로 점프했다 = 그 사이 스냅샷을 놓친 것(keepalive가 없었다면
    // 게스트가 그만큼 멈춰 있었을 횟수). 판단 자료용 — 별도 상태 노출 없이 콘솔에만 남긴다.
    if (msg.rev > lastAppliedRev + 1) {
      const missed = msg.rev - lastAppliedRev - 1;
      skippedSnapshotCount += missed;
      console.warn(
        `[net] 스냅샷 유실 감지: rev ${lastAppliedRev} → ${msg.rev} (이번 ${missed}개, 누적 ${skippedSnapshotCount})`
      );
    }
    lastAppliedRev = msg.rev;
    const state = await decodeSnapshot(msg.z);
    if (lastAppliedRev !== msg.rev) return; // 디코딩 중 더 새 스냅샷이 적용됨
    // 이동 애니메이션 상태(netMovingCube)는 ui.movingCube로 주입 — 게스트도 호스트와
    // 같은 화물 이동 애니메이션을 본다 (정산은 게스트 completeCubeMove가 noop이라 안전)
    const { netMovingCube, ...gameState } = state as { netMovingCube?: unknown } & Record<string, unknown>;
    const curUi = useGameStore.getState().ui;
    useGameStore.setState({
      ...gameState,
      ui: {
        ...curUi,
        movingCube: netMovingCube ?? null,
        // 이동이 시작되면(mc 도착) 게스트 로컬의 화물 안내(골드 점선/선택/목적지 하이라이트)를
        // 함께 정리 — 실행은 호스트가 하므로 안 지우면 이동 후에도 가이드가 남는다 (피드백)
        ...(netMovingCube
          ? { selectedCube: null, reachableDestinations: [], movePath: [], routeOptions: [], routeChoice: null }
          : {}),
      },
      // 로컬 전용 필드는 항상 안전값으로 (persist merge와 같은 원칙).
      // undoCount는 스냅샷 값 유지 — 게스트 취소 버튼 표시용 (되돌리기는 인텐트로 호스트가 실행)
      aiExecution: { pending: false, executionId: 0 },
      // undefined 값 필드는 JSON 직렬화에서 키가 드롭돼 얕은 병합으로 못 지운다 — 명시 동기화.
      // (게스트가 직전에 몬트리올을 플레이했으면 스테일 3인 배열이 비몬트리올 방에 잔존)
      governmentControllers: (gameState as { governmentControllers?: unknown }).governmentControllers,
    } as never);
  };

  // ---- 호스트: 좌석 배정 (대기실 입장 + 게임 중 끊긴 좌석 이어받기) ----
  const handleClaimSeat = async (msg: IntentMessage): Promise<void> => {
    const conn = connection;
    const { room, presentClientIds } = get();
    if (!conn || !room) return;

    try {
      const payload = msg.payload as { name?: string; uid?: string | null } | undefined;
      const name = payload?.name;

      // 차단된 사람의 재입장 거부(O4) — 좌석을 비우는 것만으로는 코드를 다시 입력하면
      // 그대로 들어왔다. 응답을 아예 안 보내면 게스트가 "좌석 대기 중"으로 멈추므로,
      // 좌석은 그대로 둔 채 room만 재통지해 게스트가 관전 상태임을 알게 한다.
      if (isBanned(room.banned, payload?.uid ?? null)) {
        console.warn(`[net] 차단된 사용자의 입장 시도 거부: ${payload?.uid?.slice(0, 8)}`);
        await conn.broadcastRoom();
        return;
      }

      const newSeats = assignSeatForClaim(
        room.seats,
        room.status,
        presentClientIds,
        msg.clientId,
        name,
        payload?.uid ?? null
      );

      // 게스트의 auth.uid를 방의 참가자 목록에 등록(S1a) — 게스트는 (정책 교체 후)
      // 방 행을 직접 쓸 수 없으므로 호스트가 대신 넣어 준다. 이게 있어야 나중에
      // **호스트 승계자가 update 권한을 갖는다**(host_uid만으로 조이면 승계가 막힌다).
      const guestUid = payload?.uid;
      const known = room.participantUids ?? [];
      const needsUid = !!guestUid && !known.includes(guestUid);

      const patch: Parameters<typeof conn.updateRoom>[0] = {};
      if (newSeats && newSeats !== room.seats) patch.seats = newSeats;
      if (needsUid) patch.participantUids = [...known, guestUid as string];
      if (Object.keys(patch).length > 0) {
        await conn.updateRoom(patch);
      }
      // 배정 불가(만석)여도 현재 좌석 상태는 재통지 — 게스트는 관전 상태로 남음
      await conn.broadcastRoom();
      set({ room: conn.room, mySeat: seatOf(conn.room, conn.clientId) });
    } catch (e) {
      console.warn('[net] 좌석 배정 처리 실패:', e);
    }
  };

  // ---- 호스트: 게스트의 이름 변경 요청 처리 (renameSeat intent) ----
  const handleRename = async (msg: IntentMessage): Promise<void> => {
    const conn = connection;
    const { room } = get();
    if (!conn || !room) return;
    const seat = seatOf(room, msg.clientId);
    if (seat === null) return; // 발신자가 좌석 없음(관전) — 무시
    const name = (msg.payload as { name?: string } | undefined)?.name ?? '';
    try {
      const next = renameSeatRule(room.seats, seat, name); // 트림·중복 검사(호스트 권위)
      if (!next) return; // 빈 이름/중복 — 조용히 거부 (게스트 화면은 기존 이름 유지)
      await conn.updateRoom({ seats: next });
      await conn.broadcastRoom();
      set({ room: conn.room });
    } catch (e) {
      console.warn('[net] 이름 변경 처리 실패:', e);
    }
  };

  // ---- 게스트 커밋 가드 설치 (intent 전송 + 유실 대비 동일 멱등 id 1회 재전송) ----
  // joinRoom(게스트 입장)과 이중 호스트 강등 양쪽에서 사용
  const installGuardWithResend = (): void => {
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
      if (msg.type === 'renameSeat') {
        void handleRename(msg);
        return;
      }
      if (get().room?.status !== 'playing') return; // 게임 전 게임 인텐트 무시
      // 좌석 소유권 검증 — 인텐트의 seat이 정말 그 발신자의 좌석인가.
      // applyGameIntent는 msg.seat으로 차례를 보므로, 이 검사가 없으면 발신자가
      // seats에서 남의 좌석 번호를 읽어 그 사람인 척 행동할 수 있다(좌석 위장).
      const seatOwner = get().room?.seats.find((s) => s.seat === msg.seat)?.clientId;
      if (seatOwner !== msg.clientId) {
        console.warn(
          `[net] 좌석 위장 인텐트 거부: ${msg.type} seat=${msg.seat} ` +
            `발신 ${msg.clientId?.slice(0, 8)} ≠ 착석 ${seatOwner?.slice(0, 8) ?? '(빈자리)'}`
        );
        // 아래 !result.ok와 같은 교정이 여기서도 필요하다 — 게스트는 자기 액션을
        // 낙관적으로 로컬 반영한 뒤 intent를 보내므로, 거부만 하고 끝내면 그 화면이
        // 잘못된 상태로 굳는다. 위장이 아니라 좌석 정보가 일시적으로 어긋난
        // 정상 게스트(호스트가 좌석 재배정 중)도 이 경로를 탈 수 있다.
        lastSyncedJson = '';
        scheduleBroadcast();
        return;
      }
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
      // 발신자 검증 — 스냅샷은 **호스트만** 보낼 수 있다. rev 가드는 순서만 보므로,
      // 이게 없으면 채널에 들어온 아무나 높은 rev를 쏴서 전 게스트 상태를 덮어쓸 수 있다.
      // from이 없는 건 구버전 호스트이거나 DB 영속본 경로라 통과시킨다(하위호환).
      // ⚠️ payload의 clientId는 클라이언트가 쓰는 값이라 위조 가능 — 진짜 방어는
      //    Realtime private channel + authorization(S1). 이건 그 전까지의 즉효약이다.
      const hostId = get().room?.hostClientId;
      if (msg.from && hostId && msg.from !== hostId) {
        console.warn(`[net] 호스트가 아닌 발신자의 스냅샷 무시: ${msg.from.slice(0, 8)} (호스트 ${hostId.slice(0, 8)})`);
        return;
      }
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
      // 이중 호스트 방지 (리뷰 발견): 내가 host인데 방 메타가 다른 호스트를 가리키면 —
      // 승계 완료 직후(6초 경계) 옛 호스트가 복귀한 경우 — 게스트로 강등한다.
      // (broadcast self=false라 내 broadcastRoom은 나에게 안 옴 = 이 통지는 항상 타인 발신)
      if (get().mode === 'host' && room.hostClientId && room.hostClientId !== getClientId()) {
        console.warn('[net] 다른 클라이언트가 호스트 — 게스트로 강등 (이중 호스트 방지)');
        stopHostLoop();
        stopHeartbeat();
        lastAppliedRev = 0; // 새 호스트의 첫 스냅샷부터 수용 (호스트 권위 = 승계자가 정본)
        skippedSnapshotCount = 0; // rev 시퀀스가 새로 시작 — O3 누적치도 함께 리셋
        installGuardWithResend();
        set({ mode: 'guest' });
      }
      // 게스트가 착석 상태였는데 좌석에서 사라짐 = 방장이 내보냄 → 방을 나가고 안내
      const prevSeat = get().mySeat;
      const newSeat = seatOf(room, getClientId());
      if (get().mode === 'guest' && prevSeat !== null && newSeat === null) {
        console.log('[net] 방장이 좌석에서 내보냄 — 방을 나갑니다');
        void get()
          .leaveRoom()
          .then(() => set({ error: '방장이 방에서 내보냈습니다.' }));
        return;
      }
      set({ room, mySeat: newSeat });
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
      await get().joinRoom(code, name, true); // reconnect: offline 전환 없이 조용히 재부착
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

  /** 승계 유예 타이머 + 표시 중이던 팝업을 함께 정리 (호스트 복귀·비게스트화 시) */
  const clearTakeoverPrompt = (): void => {
    cancelTakeover();
    if (get().hostTakeoverPrompt) set({ hostTakeoverPrompt: null });
  };

  /**
   * 게스트: 호스트 이탈 감지 → 6초 유예(짧은 끊김 플랩 오탐 방지) 후 승계 여부를 **묻는다**.
   * 자동 승계하지 않고 사용자에게 "이어받기 / 나가기"를 물어보는 팝업(hostTakeoverPrompt)을 띄운다.
   * 대기실(waiting)·게임 중(playing) 공통. 유예 중이든 팝업 표시 후든 호스트가 복귀하면
   * 팝업/타이머를 취소하고 그대로 계속 진행한다. 결정론적 후계자만 canTakeover=true.
   */
  const checkHostTakeover = (): void => {
    const { mode, room, presentClientIds, hostTakeoverPrompt } = get();
    if (mode !== 'guest' || !room || (room.status !== 'playing' && room.status !== 'waiting')) {
      return clearTakeoverPrompt();
    }
    if (!isHostAbsent(room.hostClientId, presentClientIds)) return clearTakeoverPrompt(); // 호스트 복귀

    const status = room.status; // 'waiting' | 'playing'
    const canTakeover = pickHostSuccessor(room.seats, presentClientIds) === getClientId();
    if (hostTakeoverPrompt) {
      // 이미 표시 중 — 후계자 자격/상태 변화만 갱신 (예: 앞 후계자가 나가 내가 후계자가 됨)
      if (hostTakeoverPrompt.canTakeover !== canTakeover || hostTakeoverPrompt.status !== status) {
        set({ hostTakeoverPrompt: { status, canTakeover } });
      }
      return;
    }
    if (takeoverTimer !== null) return; // 유예 대기 중
    console.log(`[net] 호스트 이탈 감지 — ${HOST_TAKEOVER_DELAY / 1000}초 후 승계 여부를 묻습니다`);
    takeoverTimer = safeTimeout(() => {
      takeoverTimer = null;
      const s = get();
      const r = s.room;
      if (s.mode !== 'guest' || !r) return;
      const st = r.status;
      if (st !== 'playing' && st !== 'waiting') return;
      if (!isHostAbsent(r.hostClientId, s.presentClientIds)) return; // 그새 복귀
      const can = pickHostSuccessor(r.seats, s.presentClientIds) === getClientId();
      set({ hostTakeoverPrompt: { status: st, canTakeover: can } });
    }, HOST_TAKEOVER_DELAY);
  };

  const promoteToHost = async (): Promise<void> => {
    const conn = connection;
    const { mode, room, presentClientIds } = get();
    if (!conn || mode !== 'guest' || !room) return;
    if (!isHostAbsent(room.hostClientId, presentClientIds)) return; // 호스트 복귀 — 승계 취소
    const wasPlaying = room.status === 'playing';
    const oldHostClientId = room.hostClientId;
    const oldHostSeat =
      oldHostClientId != null
        ? room.seats.find((s) => s.clientId === oldHostClientId)?.seat ?? null
        : null;
    console.log('[net] 호스트 승계 실행 — 이 클라이언트가 방/게임 엔진을 이어받음');
    removeGuestGuard();
    // 실행 취소 스택(undoSnapshots)은 옛 호스트 메모리에만 있었으므로 승계한 클라이언트엔 없다.
    // 물려받은 undoCount를 그대로 두면 "버튼은 뜨는데 눌러도 안 되돌아가는" 팬텀 취소가 된다
    // (undoLastAction이 pop→undefined). 승계 시점 취소 이력은 포기하고 0으로 맞춘다.
    clearUndo();
    useGameStore.setState({ undoCount: 0 } as never);
    rev = lastAppliedRev; // 스냅샷 리비전 연속성 (게스트들의 역순 가드 통과)
    set({ mode: 'host', hostTakeoverPrompt: null });
    startHostLoop();

    // 게임 중 승계: 끊긴 옛 호스트를 곧바로 봇으로 전환해 그 자리를 기다리지 않고 게임을 잇는다.
    // (게임 상태 isAI는 스냅샷으로, 좌석 kind는 아래 updateRoom으로 전원에 전파. startHostLoop
    //  이후에 바꿔야 구독이 이 변경을 잡아 스냅샷을 내보낸다.)
    if (wasPlaying && oldHostSeat !== null) {
      const playerId = useGameStore.getState().activePlayers[oldHostSeat];
      if (playerId) {
        useGameStore.setState((s) => ({
          players: { ...s.players, [playerId]: { ...s.players[playerId], isAI: true } },
          logs: [
            ...s.logs,
            {
              turn: s.currentTurn,
              phase: s.currentPhase,
              player: playerId,
              action: `[시스템] ${s.players[playerId]?.name} 호스트 연결 끊김 — BOT으로 전환`,
              timestamp: Date.now(),
            },
          ],
        }) as never);
      }
    }

    try {
      // 좌석 갱신: 대기실=옛 호스트 좌석 비움(참가 대기) / 게임 중=옛 호스트 좌석을 봇으로 전환.
      const newSeats = oldHostClientId
        ? room.seats.map((s) =>
            s.clientId === oldHostClientId
              ? wasPlaying
                ? { ...s, kind: 'ai' as const, clientId: null }
                : { ...s, clientId: null }
              : s
          )
        : null;
      // upsertRoom(‌update-or-insert): 대기실 방장이 "방 나가기"로 나가면 closeRoom이 방을
      // DB에서 지운다. 승계자가 updateRoom(UPDATE)만 하면 삭제된 행을 못 살려 공개방 목록·
      // 재입장에서 방이 사라진다 → id 기준 upsert로 방을 그대로 되살린다.
      // hostUid도 **함께** 넘긴다(리뷰 스텝2 발견) — 3단계 delete 정책이
      // auth.uid() = host_uid라, 이게 옛 호스트 값으로 남으면 승계자가 방을 닫지 못한다.
      // 승계자를 participant_uids에도 보강한다(claimSeat 때 등록됐어야 하지만, 익명 로그인이
      // 늦게 켜진 방이면 비어 있을 수 있다 — 그 경우 자기 자신조차 update 권한을 잃는다).
      const myUid = conn.uid;
      const knownUids = conn.room.participantUids ?? [];
      const uidPatch = myUid
        ? {
            hostUid: myUid,
            ...(knownUids.includes(myUid) ? {} : { participantUids: [...knownUids, myUid] }),
          }
        : {};
      await conn.upsertRoom(
        newSeats
          ? { hostClientId: conn.clientId, seats: newSeats, ...uidPatch }
          : { hostClientId: conn.clientId, ...uidPatch }
      );
      await conn.broadcastRoom();
      set({ room: conn.room });
    } catch (e) {
      console.warn('[net] 승계 중 방 갱신 실패:', e);
    }
    if (conn.room.status === 'waiting') startWaitingHeartbeat(); // 대기실 승계 — 생존 신호 재개
    // 게임 중이면 이어받은 시점이 AI 차례일 때 즉시 재가동 (AI 인스턴스는 getAIDecision이 지연 등록)
    if (wasPlaying) scheduleAICheck(useGameStore.getState);
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
    hostTakeoverPrompt: null,
    moveGuideAllowed: true,

    setMoveGuideAllowed: (allowed) => set({ moveGuideAllowed: allowed }),

    acceptHostTakeover: async () => {
      const prompt = get().hostTakeoverPrompt;
      if (!prompt?.canTakeover) return; // 후계자만 이어받을 수 있음 (다중 호스트 방지)
      cancelTakeover();
      set({ hostTakeoverPrompt: null });
      await promoteToHost();
    },

    declineHostTakeover: async () => {
      cancelTakeover();
      set({ hostTakeoverPrompt: null });
      await get().leaveRoom(); // 온라인 초기 화면으로 (게임 중이면 이 게임에서 빠짐)
    },

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

    joinRoom: async (code, name, reconnect = false) => {
      if (get().mode !== 'offline') {
        if (reconnect) {
          // 순단 재연결: offline으로 전환하지 않고(화면 튕김·좌석 관전 고착 방지) 옛 채널만 조용히 정리.
          // connectionGen++로 버려진 채널의 늦은 이벤트를 무시하고, 새 makeEvents가 새 세대를 연다.
          connectionGen++;
          removeGuestGuard();
          const old = connection;
          connection = null;
          old?.leave().catch(() => { /* 이미 끊긴 채널 */ });
        } else {
          await get().leaveRoom();
        }
      }
      set({ busy: true, error: null });
      try {
        const conn = await getTransport().joinRoom(code, makeEvents());
        connection = conn;
        lastAppliedRev = 0;
        skippedSnapshotCount = 0; // 새 방 입장 — O3 누적치 리셋
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
        installGuardWithResend();
        saveLastRoom(conn.room.code, name);
        // 좌석 요청 (대기실 입장·재입장·게임 중 끊긴 좌석 이어받기 — 호스트가 배정).
        // 유실 대비 동일 id로 1회 재전송
        const claimId = crypto.randomUUID();
        await conn.sendIntent({ id: claimId, seat: -1, type: 'claimSeat', payload: { name, uid: conn.uid } });
        safeTimeout(() => {
          if (get().mode === 'guest' && get().mySeat === null) {
            void conn.sendIntent({ id: claimId, seat: -1, type: 'claimSeat', payload: { name, uid: conn.uid } }).catch(() => {});
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
      // 호스트가 대기실을 명시적으로 떠나면 방 자체를 폐쇄 (목록의 유령 방 방지).
      // 남은 사람이 승계하면 promoteToHost가 방을 DB에 다시 만든다(upsertRoom) — 아무도
      // 이어받지 않으면 방이 DB에 남지 않아 깔끔하다.
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
      skippedSnapshotCount = 0; // 방을 나감 — O3 누적치 리셋
      set({
        mode: 'offline',
        room: null,
        mySeat: null,
        presentClientIds: [],
        chat: [],
        connected: false,
        error: null,
        disconnectedSeat: null,
        hostTakeoverPrompt: null,
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

    kickSeat: async (seat) => {
      const conn = connection;
      const room = get().room;
      if (!conn || !room || get().mode !== 'host') return;
      const target = room.seats.find((s) => s.seat === seat);
      if (!target || target.seat === 0) return; // 방장 좌석은 대상 아님

      // 좌석 비우기 — 기존 내보내기와 같은 동작(게스트가 onRoom에서 감지해 나간다)
      const seats = room.seats.map((s) =>
        s.seat === seat
          ? { ...s, clientId: null, uid: null, name: uniqueSeatName(undefined, room.seats, s.seat) }
          : s
      );

      // uid를 아는 경우에만 차단까지. 모르면(익명 로그인 이전 데이터) 내보내기만 하고
      // 조용히 넘어간다 — 막을 근거가 없는데 막힌 척하면 목록만 지저분해진다.
      const uid = target.uid ?? null;
      const patch: Parameters<typeof conn.updateRoom>[0] = { seats };
      if (uid) {
        patch.banned = addBan(room.banned, uid, target.name, Date.now());
        // participant에서 빼면 RLS update 권한도 함께 회수된다 — 차단이 곧 쓰기 권한 박탈
        patch.participantUids = (room.participantUids ?? []).filter((u) => u !== uid);
      }

      try {
        await conn.updateRoom(patch);
        await conn.broadcastRoom();
        set({ room: conn.room });
      } catch (e) {
        console.warn('[net] 내보내기 실패:', e);
      }
    },

    unbanUser: async (uid) => {
      const conn = connection;
      const room = get().room;
      if (!conn || !room || get().mode !== 'host') return;
      try {
        await conn.updateRoom({ banned: removeBan(room.banned, uid) });
        await conn.broadcastRoom();
        set({ room: conn.room });
      } catch (e) {
        console.warn('[net] 차단 해제 실패:', e);
      }
    },

    renameSeat: async (name) => {
      const { mode, room, mySeat } = get();
      if (!room || mySeat === null) return { ok: false, reason: '좌석이 없어요' };
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, reason: '이름을 입력하세요' };
      // 로컬 선검사(중복) — 최종 권위는 호스트(handleRename의 renameSeatRule)
      if (room.seats.some((s) => s.seat !== mySeat && s.name === trimmed)) {
        return { ok: false, reason: '이미 같은 이름이 있어요' };
      }
      const conn = connection;
      if (!conn) return { ok: false, reason: '연결이 없어요' };
      if (mode === 'host') {
        const next = renameSeatRule(room.seats, mySeat, trimmed);
        if (!next) return { ok: false, reason: '이미 같은 이름이 있어요' };
        try {
          await conn.updateRoom({ seats: next });
          await conn.broadcastRoom();
          set({ room: conn.room });
        } catch (e) {
          console.warn('[net] 이름 변경 실패:', e);
          return { ok: false, reason: '변경에 실패했어요' };
        }
        return { ok: true };
      }
      // 게스트: 호스트에 요청 → room 통지로 확정 (호스트가 트림·중복 재검증)
      try {
        await conn.sendIntent({ type: 'renameSeat', seat: mySeat, payload: { name: trimmed } });
      } catch (e) {
        console.warn('[net] 이름 변경 요청 실패:', e);
        return { ok: false, reason: '요청 전송에 실패했어요' };
      }
      return { ok: true };
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
      // 좌석은 유지, 첫 턴 순서만 무작위 (호스트 권위 → 스냅샷으로 게스트에 전파)
      useGameStore.getState().initGame(room.mapId, names, aiPlayers, { randomizeStartOrder: true });
      // 방 설정: 이동 가이드 허용 여부 주입 — 스냅샷으로 게스트까지 동기화 (false면 전원 잠김)
      useGameStore.setState({ moveGuideAllowed: get().moveGuideAllowed });
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

// 터보 설정 권한: 온라인 게스트는 설정 자체 금지(방장 전용) — 모드 전환마다 게이트 갱신.
// (버튼 숨김은 UI일 뿐이고, localStorage/?turbo=1 직접 세팅도 여기서 무효화된다)
useNetStore.subscribe((s) => setTurboAllowed(s.mode !== 'guest'));

// 디버깅용: 전역에 노출 (__GAME_STORE__와 동일 패턴)
if (typeof window !== 'undefined') {
  (window as unknown as { __NET_STORE__: typeof useNetStore }).__NET_STORE__ = useNetStore;
}
