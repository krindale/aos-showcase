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

/**
 * 탭별 고정 ID — sessionStorage라 같은 탭 새로고침(F5)에는 유지되어 좌석 자동 복원,
 * 같은 브라우저의 다른 탭은 다른 사람으로 식별(한 PC 두 탭 테스트/플레이 가능).
 * 탭을 닫았다 새로 연 재접속은 좌석 이어받기(Phase 2, 끊긴 좌석 재배정)로 처리.
 */
export function getClientId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = window.sessionStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(CLIENT_ID_KEY, id);
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
    // 유령 방 필터: 호스트가 대기실에서 45초마다 하트비트(touchRoom)로 updated_at을 갱신하므로
    // 2분 넘게 갱신이 없는 waiting 방 = 호스트가 죽은 방 → 목록·빠른매칭에서 제외
    const freshAfter = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data, error } = await this.client
      .from('rooms')
      .select()
      .eq('is_public', true)
      .eq('status', 'waiting')
      .gte('updated_at', freshAfter)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`공개방 목록 조회 실패: ${error.message}`);
    return (data as RoomRow[]).map(rowToRoomInfo);
  }

  /** 채널 구독 완료까지 대기 후 연결 객체 반환 */
  private connect(room: RoomInfo, clientId: string, events: RoomEvents): Promise<RoomConnection> {
    // room 브로드캐스트 핸들러에서 참조할 연결 객체 (구독 완료 시 할당)
    let conn: SupabaseRoomConnection | null = null;
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
      .on('broadcast', { event: 'room' }, ({ payload }) => {
        const r = payload as RoomInfo;
        conn?.syncRoom(r); // 연결 캐시도 최신 방 메타로 (승계 시 stale status 방지)
        events.onRoom?.(r);
      })
      .on('presence', { event: 'sync' }, () =>
        events.onPresence?.(Object.keys(channel.presenceState()))
      );

    return new Promise((resolve, reject) => {
      let resolved = false;
      // SUBSCRIBED도 에러도 안 오는 경우(예: 구독 전 CLOSED) 무한 대기 방지 — 리뷰 발견
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          void this.client.removeChannel(channel);
          reject(new Error('채널 연결 시간 초과(15s) — 네트워크 상태를 확인하세요'));
        }
      }, 15_000);
      channel.subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          // 최초 구독 + 순단 후 자동 재조인 양쪽에서 호출됨
          await channel.track({ joinedAt: Date.now() });
          events.onConnectionState?.(true);
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            conn = new SupabaseRoomConnection(this.client, channel, room, clientId);
            resolve(conn);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            reject(new Error(`채널 연결 실패(${status})${err ? `: ${err.message}` : ''}`));
          } else {
            console.warn(`[net] 채널 연결 끊김 (${status})`);
            events.onConnectionState?.(false);
          }
        } else if (status === 'CLOSED' && resolved) {
          // leave()로 정상 종료됐거나 서버가 닫음 — netStore가 세션 상태로 재연결 여부 판단
          events.onConnectionState?.(false);
        }
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

  /**
   * 수신한 방 메타를 연결 캐시에 반영 (updateRoom을 거치지 않은 외부 갱신 동기화).
   * 안 하면 conn.room이 입장 시점 값에 박제돼, 대기실에서 입장→게임 시작 후 호스트 승계 시
   * 오래된 status('waiting')로 브로드캐스트돼 게임 중에도 대기실로 튕긴다.
   * broadcastRoom은 snapshot을 null로 보내므로 기존 캐시 snapshot은 유지한다.
   */
  syncRoom(room: RoomInfo): void {
    this._room = { ...room, snapshot: room.snapshot ?? this._room.snapshot };
  }

  async sendIntent(intent: Omit<IntentMessage, 'clientId' | 'id'> & { id?: string }): Promise<void> {
    const msg: IntentMessage = { ...intent, id: intent.id ?? crypto.randomUUID(), clientId: this.clientId };
    console.log(`[net] intent 전송: ${msg.type} (seat ${msg.seat}, ${msg.id.slice(0, 8)})`);
    await this.broadcast('intent', msg);
  }

  async broadcastSnapshot(snapshot: SnapshotMessage): Promise<void> {
    await this.broadcast('snapshot', snapshot);
  }

  async broadcastRoom(): Promise<void> {
    // snapshot(압축 게임 상태 ~2KB+)은 방 메타 통지에 불필요 — 수신측(onRoom)은
    // seats/status만 쓰므로 제외해 대역폭 절약 (리뷰 발견)
    await this.broadcast('room', { ...this._room, snapshot: null });
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

  async touchRoom(): Promise<void> {
    // 같은 값으로 update해도 트리거가 updated_at을 갱신한다 (대기실 생존 신호)
    const { error } = await this.client
      .from('rooms')
      .update({ status: this._room.status })
      .eq('id', this._room.id);
    if (error) throw new Error(`하트비트 실패: ${error.message}`);
  }

  async closeRoom(): Promise<void> {
    // RLS가 finished만 삭제 허용 — finished 처리 후 삭제 시도 (삭제 실패해도 목록에선 빠짐)
    await this.client.from('rooms').update({ status: 'finished' }).eq('id', this._room.id);
    await this.client.from('rooms').delete().eq('id', this._room.id);
    this._room = { ...this._room, status: 'finished' };
  }

  async leave(): Promise<void> {
    await this.client.removeChannel(this.channel);
  }

  private async broadcast(event: string, payload: unknown): Promise<void> {
    // 순단/종료된 채널에 push하면 phoenix가 throw("before joining") — 크래시 대신 드롭.
    // 연결 복구는 onConnectionState(false) → netStore의 자동 재연결이 담당하고,
    // 스냅샷은 rooms 테이블에도 저장되므로 재연결 시 최신 상태로 복원된다.
    if (this.channel.state !== 'joined') {
      console.warn(`[net] 채널 미연결(${this.channel.state}) — ${event} 전송 건너뜀`);
      return;
    }
    const result = await this.channel.send({ type: 'broadcast', event, payload });
    if (result !== 'ok') throw new Error(`메시지 전송 실패(${event}): ${result}`);
  }
}
