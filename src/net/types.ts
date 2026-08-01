/**
 * 온라인 멀티플레이 전송 계층 타입 (Phase 0)
 *
 * 설계 원칙: gameStore는 net을 모른다 — 게임 코드는 이 인터페이스만 보고 통신하며,
 * Supabase 구현(supabaseTransport)을 나중에 자체 서버로 교체해도 게임 코드는 불변.
 */

export type SeatKind = 'human' | 'ai';

export interface RoomSeat {
  seat: number; // 0-base 좌석 번호 = 플레이어 순번
  name: string;
  kind: SeatKind;
  clientId: string | null; // 착석한 클라이언트 (AI·빈자리는 null)
}

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomInfo {
  id: string;
  code: string; // 6자리 초대 코드
  title: string | null; // 공개방 목록 표시용
  isPublic: boolean;
  mapId: string;
  status: RoomStatus;
  seats: RoomSeat[];
  hostClientId: string | null;
  snapshot: unknown | null; // 최신 게임 스냅샷 (재접속·호스트 승계용)
  updatedAt: string;
  /**
   * 이 방에 앉은 적 있는 사용자들의 auth.uid (S1a).
   * RLS의 update 정책이 이 배열로 참가자를 판정할 예정이라, **호스트 승계자도 권한을 유지**한다
   * (host_uid만으로 조이면 승계 자체가 불가능해진다 — 승계는 게스트가 방 행을 쓰는 동작이므로).
   * 익명 로그인이 꺼져 있으면 비어 있을 수 있다(정책 교체 전까지는 무해).
   */
  participantUids?: string[];
}

/** 게스트 → 호스트: "하고 싶은 행동" 요청. type/payload는 Phase 1에서 store 액션 기반 union으로 구체화 */
export interface IntentMessage {
  /** 멱등성 키 — 채널 재조인 시 push 재전송 등으로 같은 intent가 중복 도착해도 1회만 실행 */
  id: string;
  clientId: string;
  seat: number;
  type: string;
  payload?: unknown;
}

/** 호스트 → 전원: 확정된 게임 상태 (snapshotCodec으로 gzip+base64 압축) */
export interface SnapshotMessage {
  rev: number; // 단조 증가 리비전 — 역순 도착 스냅샷 무시용
  z: string; // encodeSnapshot 결과 (gzip+base64)
  /**
   * 발신 clientId — transport가 채운다. 게스트는 이 값이 room.hostClientId와
   * 일치할 때만 스냅샷을 적용한다(netStore.onSnapshot).
   *
   * 없으면 왜 문제인가: 채널에 들어온 아무나 높은 rev로 스냅샷을 쏘면 전 게스트의
   * 게임 상태가 통째로 오염된다(rev 가드는 순서만 볼 뿐 발신자를 안 본다).
   *
   * optional인 이유: rooms 테이블에 영속된 스냅샷(재접속·승계 시 DB에서 직접 읽는 경로)은
   * 브로드캐스트가 아니라 발신자가 없다. 그 경로는 DB 접근 통제(S1 RLS)가 지킨다.
   * ⚠️ 완전한 위조 방어는 Realtime private channel + authorization(S1)이다 —
   *    payload의 clientId는 결국 클라이언트가 쓰는 값이라 이 검사만으로는 못 막는다.
   */
  from?: string;
}

export interface ChatMessage {
  clientId: string;
  name: string;
  text: string;
  at: number;
}

/**
 * 수신 이벤트 콜백. 주의: broadcast는 self=false — 자기가 보낸 메시지는 자기에게
 * 다시 오지 않는다 (채팅은 보낸 쪽에서 로컬로 즉시 append할 것).
 */
export interface RoomEvents {
  onIntent?: (msg: IntentMessage) => void; // 호스트만 관심
  onSnapshot?: (msg: SnapshotMessage) => void; // 게스트만 관심
  onChat?: (msg: ChatMessage) => void;
  onPresence?: (clientIds: string[]) => void; // 접속자 변화 (이탈 감지·호스트 승계)
  onRoom?: (room: RoomInfo) => void; // 방 메타 변경 (좌석 배정·상태 전환 — 호스트가 broadcastRoom)
  /** 내 채널 연결 상태 변화 (순단/재접속) — false면 netStore가 자동 재연결 시도 */
  onConnectionState?: (connected: boolean) => void;
}

export interface RoomConnection {
  readonly room: RoomInfo;
  readonly clientId: string;
  /**
   * 익명 로그인 uid (S1a) — 미활성/실패면 null.
   * clientId(sessionStorage, 탭별 = 좌석 식별)와는 **다른 축**이다:
   * uid는 auth 세션(localStorage, 브라우저 공유)이라 DB 접근 권한 판정에 쓰인다.
   * 한 PC 두 탭은 clientId가 달라 서로 다른 플레이어지만 uid는 같다 — 같은 사람이므로 정상.
   */
  readonly uid: string | null;
  /** clientId는 transport가 채운다. id(멱등성 키)는 재전송을 위해 호출자가 줄 수 있고 없으면 생성 */
  sendIntent(intent: Omit<IntentMessage, 'clientId' | 'id'> & { id?: string }): Promise<void>;
  broadcastSnapshot(snapshot: SnapshotMessage): Promise<void>;
  /** 호스트 전용: 방 메타(좌석/상태) 변경을 전원에게 통지 — 보통 updateRoom 직후 호출 */
  broadcastRoom(): Promise<void>;
  sendChat(name: string, text: string): Promise<void>;
  /** 호스트 전용: rooms 행 갱신 (스냅샷 저장, 좌석/상태 변경, 호스트 승계) */
  updateRoom(
    patch: Partial<Pick<RoomInfo, 'status' | 'seats' | 'snapshot' | 'hostClientId' | 'title' | 'isPublic' | 'participantUids'>>
  ): Promise<void>;
  /** 호스트 전용: 방 전체를 id 기준 upsert — 승계자가 삭제된 방을 되살릴 때 (updateRoom과 달리 insert 가능) */
  upsertRoom(
    patch: Partial<Pick<RoomInfo, 'status' | 'seats' | 'snapshot' | 'hostClientId' | 'title' | 'isPublic' | 'participantUids'>>
  ): Promise<void>;
  /** 호스트 전용: 대기실 하트비트 — updated_at만 갱신 (공개방 목록의 유령 방 필터 기준) */
  touchRoom(): Promise<void>;
  /** 호스트 전용: 방 폐쇄 — finished 처리 후 행 삭제 시도 (대기실을 명시적으로 나갈 때) */
  closeRoom(): Promise<void>;
  leave(): Promise<void>;
}

export interface NetTransport {
  createRoom(
    opts: { mapId: string; title?: string; isPublic?: boolean; seats: RoomSeat[] },
    events: RoomEvents
  ): Promise<RoomConnection>;
  joinRoom(code: string, events: RoomEvents): Promise<RoomConnection>;
  /** 채널 연결 없이 방 정보만 조회 (재접속 시 스냅샷 선확인 등) */
  fetchRoom(code: string): Promise<RoomInfo | null>;
  /** Phase 4: 공개방 목록 (waiting 상태만) */
  listPublicRooms(): Promise<RoomInfo[]>;
}
