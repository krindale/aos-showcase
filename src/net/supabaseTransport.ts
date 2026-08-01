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
  BannedEntry,
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
  /** S1a — 구 스키마/미활성 환경에선 없을 수 있어 optional */
  participant_uids?: string[] | null;
  host_uid?: string | null;
  banned?: BannedEntry[] | null;
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
    // ?? null 인 이유: public_rooms 뷰에는 snapshot 컬럼이 **없어서**(목록에 게임 상태를
    // 싣지 않으려고 일부러 뺐다) 이 매핑이 undefined를 만든다. RoomInfo.snapshot의 타입은
    // `unknown | null`이라 그대로 두면 타입이 거짓말을 한다(리뷰 스텝2).
    snapshot: row.snapshot ?? null,
    updatedAt: row.updated_at,
    participantUids: row.participant_uids ?? [],
    hostUid: row.host_uid ?? null,
    banned: row.banned ?? [],
  };
}

export class SupabaseTransport implements NetTransport {
  private readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    // 익명 로그인(S1a, 2026-08-01) — 세션을 **유지해야** 한다.
    // persistSession:false면 새로고침마다 uid가 바뀌어 "내가 만든 방"을 잃는다.
    // localStorage를 쓰지만 저장되는 건 익명 세션 토큰뿐이다.
    this.client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    /*
     * ⚠️ private 채널(S2)을 쓰지만 realtime.setAuth()를 **직접 부르지 않는다** —
     * supabase-js가 이미 두 경로로 처리하기 때문이다(v2.110 소스 확인):
     *   ① createClient가 realtime에 accessToken 콜백(_getAccessToken = 현재 세션 토큰)을
     *      주입하고, RealtimeClient.connect()가 "if (this.accessToken && !this._authPromise)"
     *      로 스스로 setAuth를 부른다.
     *   ② SupabaseClient._handleTokenChanged가 TOKEN_REFRESHED/SIGNED_IN마다
     *      realtime.setAuth(token)을 부른다 → 장시간 게임 중 토큰 만료도 커버된다.
     * realtime-js는 그 지점에 "avoiding race conditions with SupabaseClient's immediate
     * setAuth call"이라 적어 뒀다 — 수동 호출을 끼우면 경합 요소만 늘고, 무인자
     * setAuth()는 명시 토큰 모드를 콜백 모드로 되돌리는 부작용까지 있다.
     * 실측(2026-08-01): setAuth 수동 호출 없이 참가자 SUBSCRIBED / 비참가자 Unauthorized.
     */
  }

  /**
   * 익명 로그인 보장 — RLS가 auth.uid()로 참가자/호스트를 구분하기 위한 기반.
   *
   * ⚠️ **실패해도 던지지 않는다.** 현재 RLS는 아직 anon을 허용하는 상태라, 로그인이
   * 안 돼도 온라인은 정상 동작해야 한다. Supabase 대시보드에서 Anonymous sign-ins가
   * 꺼져 있으면 여기서 실패하는데, 그걸 치명적으로 다루면 기능이 통째로 죽는다.
   * 정책을 uid 기반으로 교체하는 3단계에서 비로소 필수가 된다.
   */
  private async ensureAuth(): Promise<string | null> {
    try {
      const { data: sessionData } = await this.client.auth.getSession();
      if (sessionData.session?.user?.id) return sessionData.session.user.id;

      const { data, error } = await this.client.auth.signInAnonymously();
      if (error) {
        console.warn(
          '[net] 익명 로그인 실패 — anon 권한으로 계속합니다. ' +
            'Supabase 대시보드 > Authentication > Anonymous sign-ins가 꺼져 있는지 확인하세요.',
          error.message
        );
        return null;
      }
      return data.user?.id ?? null;
    } catch (e) {
      console.warn('[net] 익명 로그인 중 예외 — anon 권한으로 계속합니다.', e);
      return null;
    }
  }

  async createRoom(
    opts: { mapId: string; title?: string; isPublic?: boolean; seats: RoomSeat[] },
    events: RoomEvents
  ): Promise<RoomConnection> {
    const clientId = getClientId();
    const uid = await this.ensureAuth();
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
          // uid가 null이면(익명 로그인 미활성) 컬럼도 비운다 — 지금은 정책이 anon을
          // 허용하므로 무해하고, 활성화된 뒤 만든 방부터 채워진다.
          ...(uid ? { host_uid: uid, participant_uids: [uid] } : {}),
        })
        .select()
        .single();
      if (!error) return this.connect(rowToRoomInfo(data as RoomRow), clientId, events, uid);
      if (error.code !== UNIQUE_VIOLATION) {
        throw new Error(`방 생성 실패: ${error.message}`);
      }
    }
    throw new Error('방 코드 생성 충돌이 반복됨 — 잠시 후 다시 시도하세요');
  }

  async joinRoom(code: string, events: RoomEvents): Promise<RoomConnection> {
    const uid = await this.ensureAuth();

    /*
     * 입장은 join_room RPC 한 번으로 끝낸다(S1b) — 이 RPC가 세 가지를 원자적으로 한다:
     *   ① 코드로 방 조회(security definer라 rooms_select를 조여도 동작)
     *   ② 차단 확인 — 거부 시 "이 방에서 입장이 제한되었습니다."를 그대로 던진다(O4)
     *   ③ **participant_uids에 등록**
     *
     * ③이 왜 여기 있어야 하는가(S2의 전제): Realtime private channel 정책을 "그 방의
     * 참가자만 입장"으로 걸면, 채널에 들어가 claimSeat을 보내야 참가자가 되는 기존 흐름은
     * **참가자여야 들어가는데 들어가야 참가자가 되는** 고리에 빠진다. 코드를 제시하면
     * 참가자로 만들어 주는 이 RPC가 그 고리를 끊는다.
     *
     * 차단 확인을 채널 생성 **전에** 두는 것도 그대로 지켜진다 — 붙은 뒤 leave()로 되돌리면
     * 같은 이름 채널이 subscribe된 채 남아 다음 시도에서
     * "cannot add `presence` callbacks ... after `subscribe()`"로 깨진다(실사용 확인).
     */
    const { data, error } = await this.client.rpc('join_room', { p_code: code });
    if (error) {
      // RPC가 raise한 메시지(차단·없는 방)를 그대로 올려 보낸다 — netStore의 catch가 화면에 띄운다
      throw new Error(error.message);
    }
    // returns public.rooms 이므로 단일 행이 온다(PostgREST가 객체로 준다)
    const row = (Array.isArray(data) ? data[0] : data) as RoomRow | null;
    if (!row) throw new Error(`방을 찾을 수 없음: ${code}`);

    return this.connect(rowToRoomInfo(row), getClientId(), events, uid);
  }

  /**
   * ⚠️ 입장 경로에서는 더 이상 쓰지 않는다(S1b) — joinRoom이 join_room RPC를 쓴다.
   * rooms를 직접 읽으므로 **rooms_select를 조이면 참가자 아닌 사람에겐 null이 된다**.
   * 남겨 둔 이유는 NetTransport 인터페이스의 일부이고 디버깅·점검에 쓸 수 있어서다.
   * 새 코드에서 "코드로 방 찾기"가 필요하면 RPC 쪽을 쓸 것.
   */
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
    // rooms가 아니라 public_rooms 뷰를 읽는다(S1b) — 뷰는 **snapshot을 빼고** 공개·대기 중인
    // 방만 노출한다. rooms_select를 조인 뒤에도 목록이 살아 있어야 하고, 진행 중 게임
    // 스냅샷이 목록 조회만으로 통째로 새어 나가면 안 된다.
    const { data, error } = await this.client
      .from('public_rooms')
      .select()
      .gte('updated_at', freshAfter)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`공개방 목록 조회 실패: ${error.message}`);
    return (data as RoomRow[]).map(rowToRoomInfo);
  }

  /** 채널 구독 완료까지 대기 후 연결 객체 반환 */
  private connect(
    room: RoomInfo,
    clientId: string,
    events: RoomEvents,
    uid: string | null = null
  ): Promise<RoomConnection> {
    // room 브로드캐스트 핸들러에서 참조할 연결 객체 (구독 완료 시 할당)
    let conn: SupabaseRoomConnection | null = null;
    const channel = this.client.channel(`room:${room.code}`, {
      config: {
        presence: { key: clientId },
        broadcast: { self: false }, // 자기 메시지는 자기에게 안 옴 (types.ts RoomEvents 주석 참조)
        /*
         * private 채널(S2) — realtime.messages RLS가 "이 방의 participant_uids에 있는 uid"만
         * 통과시킨다. 이게 없으면 채널 이름(=방 코드)을 아는 누구나 들어와 게임·채팅을
         * 도청하고 위조 intent·스냅샷을 보낼 수 있다. 앱 레벨 발신자 검증(from/좌석 확인)은
         * payload를 믿는 구조라 위조를 못 막는다 — 이게 그 본체다.
         *
         * 참가자가 되는 유일한 경로는 join_room RPC(코드 제시) — 채널에 들어가야 참가자가
         * 되던 고리를 그 RPC가 끊는다.
         *
         * 실측(2026-08-01): 익명 로그인 사용자도 authenticated 롤이라 정책을 통과한다.
         * 비참가자는 "Unauthorized: You do not have permissions to read from this Channel topic".
         */
        private: true,
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
            conn = new SupabaseRoomConnection(this.client, channel, room, clientId, uid);
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
    public readonly clientId: string,
    /** 익명 로그인 uid — 미활성이면 null. claimSeat에 실어 호스트가 participant_uids에 등록한다 */
    public readonly uid: string | null = null
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
    // 발신자를 transport가 채운다(sendIntent와 같은 방식) — 호출부가 잊어버릴 수 없게.
    // 게스트는 이 값으로 "정말 호스트가 보낸 스냅샷인지" 거른다.
    await this.broadcast('snapshot', { ...snapshot, from: this.clientId });
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
    patch: Partial<Pick<RoomInfo, 'status' | 'seats' | 'snapshot' | 'hostClientId' | 'title' | 'isPublic' | 'participantUids' | 'hostUid' | 'banned'>>
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.seats !== undefined) row.seats = patch.seats;
    if (patch.snapshot !== undefined) row.snapshot = patch.snapshot;
    if (patch.hostClientId !== undefined) row.host_client_id = patch.hostClientId;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.isPublic !== undefined) row.is_public = patch.isPublic;
    if (patch.participantUids !== undefined) row.participant_uids = patch.participantUids;
    if (patch.hostUid !== undefined) row.host_uid = patch.hostUid;
    if (patch.banned !== undefined) row.banned = patch.banned;

    const { error } = await this.client.from('rooms').update(row).eq('id', this._room.id);
    if (error) throw new Error(`방 갱신 실패: ${error.message}`);
    this._room = { ...this._room, ...patch };
  }

  async upsertRoom(
    patch: Partial<Pick<RoomInfo, 'status' | 'seats' | 'snapshot' | 'hostClientId' | 'title' | 'isPublic' | 'participantUids' | 'hostUid' | 'banned'>>
  ): Promise<void> {
    // updateRoom과 달리 방 전체를 id 기준 upsert — 방장이 나가며 closeRoom으로 삭제한 방을
    // 승계자가 그대로 되살린다(같은 id·code 유지). 있으면 update, 없으면 insert.
    this._room = { ...this._room, ...patch };
    const r = this._room;
    const row = {
      id: r.id,
      code: r.code,
      title: r.title,
      is_public: r.isPublic,
      map_id: r.mapId,
      status: r.status,
      seats: r.seats,
      host_client_id: r.hostClientId,
      snapshot: r.snapshot ?? null,
      // ⚠️ 이 둘을 빠뜨리면 안 된다(리뷰 스텝2 발견). upsert가 insert로 떨어지는 경우
      // — 방장이 closeRoom으로 지운 방을 승계자가 되살릴 때 — participant_uids가
      // 기본값 '{}'로 들어가 **아무도 그 방을 update할 수 없게 된다**(3단계 정책 기준).
      // 즉 되살린 방이 그 자리에서 죽는다.
      host_uid: r.hostUid ?? null,
      participant_uids: r.participantUids ?? [],
      banned: r.banned ?? [],
    };
    const { error } = await this.client.from('rooms').upsert(row);
    if (error) throw new Error(`방 복원(upsert) 실패: ${error.message}`);
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
