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
}

/** 게스트 → 호스트: "하고 싶은 행동" 요청. type/payload는 Phase 1에서 store 액션 기반 union으로 구체화 */
export interface IntentMessage {
  clientId: string;
  seat: number;
  type: string;
  payload?: unknown;
}

/** 호스트 → 전원: 확정된 게임 상태 */
export interface SnapshotMessage {
  rev: number; // 단조 증가 리비전 — 역순 도착 스냅샷 무시용
  state: unknown; // persist 포맷 재사용 (Phase 1에서 logs 제외 + 압축 예정)
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
}

export interface RoomConnection {
  readonly room: RoomInfo;
  readonly clientId: string;
  sendIntent(intent: Omit<IntentMessage, 'clientId'>): Promise<void>;
  broadcastSnapshot(snapshot: SnapshotMessage): Promise<void>;
  sendChat(name: string, text: string): Promise<void>;
  /** 호스트 전용: rooms 행 갱신 (스냅샷 저장, 좌석/상태 변경, 호스트 승계) */
  updateRoom(
    patch: Partial<Pick<RoomInfo, 'status' | 'seats' | 'snapshot' | 'hostClientId' | 'title' | 'isPublic'>>
  ): Promise<void>;
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
