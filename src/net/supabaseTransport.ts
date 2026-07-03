/**
 * NetTransport의 Supabase 구현 (Phase 0)
 *
 * - 방 영속화: rooms 테이블 (스냅샷 저장 → 재접속/호스트 승계)
 * - 실시간: 방 코드당 Realtime 채널 1개, broadcast 이벤트 intent/snapshot/chat
 * - presence: 접속자 추적 (키 = clientId)
 */
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';
import type {
  ChatMessage,
  IntentMessage,
  NetTransport,
  RoomConnection,
  RoomEvents,
  RoomInfo,
  RoomSeat,
  RoomStatus,
  SnapshotMessage,
} from './types';

// 혼동 문자(I, O, 0, 1) 제외 — 구두로 불러줘도 헷갈리지 않는 방 코드
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const UNIQUE_VIOLATION = '23505'; // 방 코드 충돌 → 재생성

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

const CLIENT_ID_KEY = 'aos-net-client-id';

/** 브라우저별 고정 ID — 재접속 시 같은 사람으로 식별 (Phase 2 전제) */
export function getClientId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = window.localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

/** rooms 테이블 행 (snake_case) ↔ RoomInfo (camelCase) 매핑 */
interface RoomRow {
  id: string;
  code: string;
  title: string | null;
  is_public: boolean;
  map_id: string;
  status: RoomStatus;
  seats: RoomSeat[];
  host_client_id: string | null;
  snapshot: unknown | null;
  updated_at: string;
}

function rowToRoomInfo(row: RoomRow): RoomInfo {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    isPublic: row.is_public,
    mapId: row.map_id,
    status: row.status,
    seats: row.seats,
    hostClientId: row.host_client_id,
    snapshot: row.snapshot,
    updatedAt: row.updated_at,
  };
}

export class SupabaseTransport implements NetTransport {
  private readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    // 인증 미사용(익명) — 세션 저장 비활성화로 localStorage 오염 방지
    this.client = createClient(url, anonKey, { auth: { persistSession: false } });
  }

  async createRoom(
    opts: { mapId: string; title?: string; isPublic?: boolean; seats: RoomSeat[] },
    events: RoomEvents
  ): Promise<RoomConnection> {
    const clientId = getClientId();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRoomCode();
      const { data, error } = await this.client
        .from('rooms')
        .insert({
          code,
          title: opts.title ?? null,
          is_public: opts.isPublic ?? false,
          map_id: opts.mapId,
          seats: opts.seats,
          host_client_id: clientId,
        })
        .select()
        .single();
      if (!error) return this.connect(rowToRoomInfo(data as RoomRow), clientId, events);
      if (error.code !== UNIQUE_VIOLATION) {
        throw new Error(`방 생성 실패: ${error.message}`);
      }
    }
    throw new Error('방 코드 생성 충돌이 반복됨 — 잠시 후 다시 시도하세요');
  }

  async joinRoom(code: string, events: RoomEvents): Promise<RoomConnection> {
    const room = await this.fetchRoom(code);
    if (!room) throw new Error(`방을 찾을 수 없음: ${code}`);
    return this.connect(room, getClientId(), events);
  }

  async fetchRoom(code: string): Promise<RoomInfo | null> {
    const { data, error } = await this.client
      .from('rooms')
      .select()
      .eq('code', code.trim().toUpperCase())
      .maybeSingle();
    if (error) throw new Error(`방 조회 실패: ${error.message}`);
    return data ? rowToRoomInfo(data as RoomRow) : null;
  }

  async listPublicRooms(): Promise<RoomInfo[]> {
    const { data, error } = await this.client
      .from('rooms')
      .select()
      .eq('is_public', true)
      .eq('status', 'waiting')
      .order('created_at', { ascending: true });
    if (error) throw new Error(`공개방 목록 조회 실패: ${error.message}`);
    return (data as RoomRow[]).map(rowToRoomInfo);
  }

  /** 채널 구독 완료까지 대기 후 연결 객체 반환 */
  private connect(room: RoomInfo, clientId: string, events: RoomEvents): Promise<RoomConnection> {
    const channel = this.client.channel(`room:${room.code}`, {
      config: {
        presence: { key: clientId },
        broadcast: { self: false }, // 자기 메시지는 자기에게 안 옴 (types.ts RoomEvents 주석 참조)
      },
    });

    channel
      .on('broadcast', { event: 'intent' }, ({ payload }) =>
        events.onIntent?.(payload as IntentMessage)
      )
      .on('broadcast', { event: 'snapshot' }, ({ payload }) =>
        events.onSnapshot?.(payload as SnapshotMessage)
      )
      .on('broadcast', { event: 'chat' }, ({ payload }) =>
        events.onChat?.(payload as ChatMessage)
      )
      .on('presence', { event: 'sync' }, () =>
        events.onPresence?.(Object.keys(channel.presenceState()))
      );

    return new Promise((resolve, reject) => {
      channel.subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ joinedAt: Date.now() });
          resolve(new SupabaseRoomConnection(this.client, channel, room, clientId));
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(new Error(`채널 연결 실패(${status})${err ? `: ${err.message}` : ''}`));
        }
        // 'CLOSED'는 leave()로 정상 종료된 경우 — 무시
      });
    });
  }
}

class SupabaseRoomConnection implements RoomConnection {
  private _room: RoomInfo;

  constructor(
    private readonly client: SupabaseClient,
    private readonly channel: RealtimeChannel,
    room: RoomInfo,
    public readonly clientId: string
  ) {
    this._room = room;
  }

  get room(): RoomInfo {
    return this._room;
  }

  async sendIntent(intent: Omit<IntentMessage, 'clientId'>): Promise<void> {
    await this.broadcast('intent', { ...intent, clientId: this.clientId });
  }

  async broadcastSnapshot(snapshot: SnapshotMessage): Promise<void> {
    await this.broadcast('snapshot', snapshot);
  }

  async sendChat(name: string, text: string): Promise<void> {
    const msg: ChatMessage = { clientId: this.clientId, name, text, at: Date.now() };
    await this.broadcast('chat', msg);
  }

  async updateRoom(
    patch: Partial<Pick<RoomInfo, 'status' | 'seats' | 'snapshot' | 'hostClientId' | 'title' | 'isPublic'>>
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.seats !== undefined) row.seats = patch.seats;
    if (patch.snapshot !== undefined) row.snapshot = patch.snapshot;
    if (patch.hostClientId !== undefined) row.host_client_id = patch.hostClientId;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.isPublic !== undefined) row.is_public = patch.isPublic;

    const { error } = await this.client.from('rooms').update(row).eq('id', this._room.id);
    if (error) throw new Error(`방 갱신 실패: ${error.message}`);
    this._room = { ...this._room, ...patch };
  }

  async leave(): Promise<void> {
    await this.client.removeChannel(this.channel);
  }

  private async broadcast(event: string, payload: unknown): Promise<void> {
    const result = await this.channel.send({ type: 'broadcast', event, payload });
    if (result !== 'ok') throw new Error(`메시지 전송 실패(${event}): ${result}`);
  }
}
