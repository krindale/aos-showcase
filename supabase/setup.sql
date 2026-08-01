-- ============================================================
-- Age of Steam 온라인 멀티플레이 — Supabase 초기 설정 (Phase 0)
-- 실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
-- 여러 번 실행해도 안전(idempotent)하게 작성됨.
-- ============================================================

-- 방 테이블: 방 목록·좌석·최신 게임 스냅샷(재접속/호스트 승계용)
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,           -- 6자리 초대 코드 (혼동 문자 I/O/0/1 제외)
  title text,                          -- 공개방 목록 표시용
  is_public boolean not null default false,
  map_id text not null,
  status text not null default 'waiting'
    check (status in ('waiting', 'playing', 'finished')),
  seats jsonb not null default '[]',   -- [{seat, name, kind:'human'|'ai', clientId|null}]
  host_client_id text,                 -- 호스트 승계 시 갱신
  snapshot jsonb,                      -- 최신 게임 스냅샷
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 프로젝트 생성 시 "Automatically expose new tables"를 껐으므로 명시적 grant 필요
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.rooms to anon, authenticated;

-- RLS: uid 기반 (S1 3단계 적용 완료, 2026-08-01)
--
-- ⚠️ **전제: Supabase 대시보드 > Authentication > Anonymous sign-ins 활성화.**
--    클라이언트(supabaseTransport.ensureAuth)가 signInAnonymously로 세션을 얻어야
--    authenticated 롤이 된다. 이게 꺼져 있으면 아래 정책에 전부 걸려 온라인이 죽는다.
--
-- 적용 전에는 전부 허용형(using(true))이었고, 그래서 남의 방 스냅샷·좌석·호스트를
-- 누구나 조작할 수 있었다.
alter table public.rooms enable row level security;

-- SELECT: 공개·대기 방 + 내가 참가한 방만 (S1b 2단계, 2026-08-01 적용)
--
-- 이전엔 using(true)라 누구나 모든 방의 코드·스냅샷·좌석 clientId를 읽었다.
-- 이제 두 갈래만 허용한다:
--   ① 공개·대기 중인 방 — 공개방 목록이 동작해야 하고, 애초에 "코드를 몰라도 들어가는" 방이다.
--      status='waiting'으로 한정하므로 **진행 중 게임 스냅샷은 이 경로로 새지 않는다**.
--   ② 내가 참가자인 방 — join_room RPC로 코드를 제시해야 참가자가 된다.
--
-- ⚠️ to anon을 남기는 이유: 클라이언트의 listPublicRooms는 ensureAuth를 부르지 않아
--    로그인 전에도 목록을 조회한다. authenticated 전용으로 하면 공개방 목록이 죽는다.
--    anon은 auth.uid()가 null이라 ②를 통과할 수 없으므로 공개방만 본다.
--
-- 남는 노출(설계상 수용): **공개·대기 방의 코드**는 여전히 읽힌다. 그 방들은 원래
-- 코드 없이도 들어가는 방이라 실익이 없다. 비공개 방 코드와 진행 중 스냅샷은 막힌다.
drop policy if exists "rooms_select" on public.rooms;
create policy "rooms_select" on public.rooms
  for select to anon, authenticated
  using (
    (is_public and status = 'waiting')
    or (auth.uid() is not null and auth.uid() = any(participant_uids))
  );

-- INSERT: 로그인한 사용자만, 반드시 **자기 uid로만** 방을 만들 수 있다
drop policy if exists "rooms_insert" on public.rooms;
create policy "rooms_insert" on public.rooms
  for insert to authenticated
  with check (
    auth.uid() is not null
    and host_uid = auth.uid()
    and participant_uids @> array[auth.uid()]
  );

-- UPDATE: 그 방의 참가자만.
-- ⚠️ host_uid = auth.uid()로 조이면 **호스트 승계가 불가능해진다** — 승계는 게스트가
--    방 행을 update해 호스트를 자기로 바꾸는 동작이기 때문이다. participant_uids로 판정한다.
--    (참가자 등록은 호스트가 claimSeat 처리 때 해 준다 — netStore.handleClaimSeat)
-- with check로 참가자 목록이 줄어들지 않게 막는다(남을 방에서 밀어내지 못하도록).
drop policy if exists "rooms_update" on public.rooms;
create policy "rooms_update" on public.rooms
  for update to authenticated
  using (auth.uid() = any(participant_uids))
  with check (participant_uids @> array[auth.uid()]);

-- DELETE: 호스트만, 그리고 끝난 방만.
-- 기존엔 status='finished'이기만 하면 누구나 지울 수 있었고, update로 status를
-- finished로 바꾼 뒤 삭제하는 우회도 가능했다(그 우회는 위 update 정책이 함께 막는다).
drop policy if exists "rooms_delete_finished" on public.rooms;
create policy "rooms_delete_finished" on public.rooms
  for delete to authenticated
  using (status = 'finished' and auth.uid() = host_uid);

-- updated_at 자동 갱신 (search_path 고정 — Supabase 보안 어드바이저 권고)
create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rooms_updated_at on public.rooms;
create trigger rooms_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

-- 공개방 목록 실시간 갱신용 (Phase 4, postgres_changes 구독)
do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object then null; -- 이미 추가돼 있으면 무시
end;
$$;

-- 대시보드 자동 RLS 헬퍼(rls_auto_enable, SECURITY DEFINER)의 API 노출 차단
-- (이벤트 트리거는 owner 권한으로 돌므로 anon execute 회수해도 동작 불변 — 어드바이저 권고)
do $$
begin
  revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
exception
  when undefined_function then null; -- 자동 RLS 설정을 안 쓴 프로젝트면 무시
end;
$$;

-- ============================================================
-- S2: Realtime private channel 정책 (2026-08-01)
--
-- 채널 이름이 방 코드라, 코드를 알면 누구나 채널에 들어와 게임·채팅을 도청하고
-- 위조 intent·스냅샷을 보낼 수 있었다. 앱 레벨 발신자 검증(SnapshotMessage.from,
-- 좌석 소유 확인)은 payload를 믿는 구조라 위조를 막지 못한다 — 이게 그 본체다.
--
-- 채널 이름 규칙: supabaseTransport의 `room:${room.code}` → realtime.topic()이 그 문자열.
-- 참가자가 되는 유일한 경로는 join_room RPC(코드 제시)다.
--
-- ⚠️ 이 정책만으로는 아무것도 바뀌지 않는다. private이 강제되려면 **둘 다** 필요하다:
--    ① 클라이언트 채널 config에 private: true  (배포)
--    ② 대시보드 > Realtime Settings > "Allow public access" **끄기**
--    순서를 지킬 것 — ②를 먼저 하면 아직 public으로 붙는 배포본이 통신을 잃는다.
--
-- 실측(2026-08-01): 익명 로그인 사용자도 authenticated 롤이라 이 정책을 통과한다.
--   비참가자는 "Unauthorized: You do not have permissions to read from this Channel topic".
-- ============================================================
drop policy if exists "room participants can receive" on realtime.messages;
create policy "room participants can receive"
on realtime.messages
for select
to authenticated
using (
  exists (
    select 1
      from public.rooms r
     where 'room:' || r.code = (select realtime.topic())
       and auth.uid() = any(r.participant_uids)
       and realtime.messages.extension in ('broadcast', 'presence')
  )
);

drop policy if exists "room participants can send" on realtime.messages;
create policy "room participants can send"
on realtime.messages
for insert
to authenticated
with check (
  exists (
    select 1
      from public.rooms r
     where 'room:' || r.code = (select realtime.topic())
       and auth.uid() = any(r.participant_uids)
       and realtime.messages.extension in ('broadcast', 'presence')
  )
);

-- ============================================================
-- 오래된 방 자동 정리 — 상태별 조건 (2026-08-01 개정)
-- pg_cron이 Supabase 서버에서 1시간마다 자동 실행 (접속자 없어도 돎).
-- updated_at은 게임 중 스냅샷 저장·대기실 하트비트마다 갱신되므로 "마지막 활동 시각".
--
-- ⚠️ 왜 정리가 필요한가: 호스트가 **"나가기" 버튼**으로 나가면 closeRoom이 방을 즉시
-- 지우지만, **탭을 닫거나 새로고침하면 그 코드가 안 돈다**(F5 자동 재입장이 그 위에 서
-- 있어 새로고침을 방 폐쇄로 처리할 수도 없다). 그래서 버려진 방이 계속 쌓인다 —
-- 목록에서는 updated_at 2분 필터로 안 보이지만 행과 스냅샷(최대 256KB)은 남는다.
--
-- waiting 30분: 대기실 하트비트가 45초 주기라 30분 무활동이면 아무도 안 붙어 있는 게
--   확실하고, 그 방은 되살릴 이유가 없다.
-- playing/finished 6시간: 게임 중 방은 재접속(F5·호스트 승계) 여지를 남긴다.
-- ============================================================
create extension if not exists pg_cron;

-- security definer + search_path 고정: 소유자(postgres) 권한으로 RLS 무관하게 삭제 (어드바이저 권고)
create or replace function public.cleanup_stale_rooms()
returns void language sql
security definer
set search_path = ''
as $$
  delete from public.rooms
  where updated_at < now() - case
    when status = 'waiting' then interval '30 minutes'
    else interval '6 hours'
  end;
$$;

-- SECURITY DEFINER 함수는 public 스키마에 있으면 /rest/v1/rpc/<name>으로 자동 노출된다 —
-- 안 막으면 누구나 호출해 임의 시점에 방을 강제 삭제할 수 있다(2026-08-01 실제로 열려 있었음).
revoke execute on function public.cleanup_stale_rooms() from anon, authenticated, public;

-- 1시간마다. 이 행 수(수십)에서는 seq scan이어도 마이크로초라 부하가 사실상 없고,
-- 누적이 최대 1시간으로 묶인다. 같은 이름 재등록 시 갱신(pg_cron 1.6 upsert).
-- updated_at 인덱스는 일부러 안 만든다 — 이 규모에선 쓰기 비용만 는다(수천 행대가 되면 재검토).
select cron.schedule(
  'cleanup-stale-rooms',
  '0 * * * *',
  $$ select public.cleanup_stale_rooms(); $$
);

-- ============================================================
-- S3: 서버측 제약 — 클라이언트 캡은 우회 가능하다 (2026-08-01)
--
-- 이름 12자·방제 20자 같은 제한은 UI에만 있어, anon 키로 REST를 직접 때리면
-- 수 MB짜리 방제나 스냅샷을 넣어 DB와 공개방 목록을 오염시킬 수 있다.
-- 값은 UI 캡보다 넉넉하다 — "정상 사용의 상한"이 아니라 "명백한 남용의 하한"이 목적이라
-- UI 문구를 조금 손볼 때마다 제약이 깨지지 않는다. NULL은 3값 논리로 통과한다.
-- ============================================================
alter table public.rooms drop constraint if exists rooms_code_format;
alter table public.rooms add constraint rooms_code_format
  check (code ~ '^[A-Z2-9]{6,8}$');

alter table public.rooms drop constraint if exists rooms_title_len;
alter table public.rooms add constraint rooms_title_len
  check (length(title) <= 60);

alter table public.rooms drop constraint if exists rooms_map_id_len;
alter table public.rooms add constraint rooms_map_id_len
  check (length(map_id) <= 40);

-- 좌석: 배열이어야 하고 최대 인원(6인 맵)+여유. 원소별 이름 길이는 전체 바이트로 갈음
-- (jsonb 원소를 하나씩 검사하는 표현식은 비싸고, 남용 차단엔 총량이면 충분).
alter table public.rooms drop constraint if exists rooms_seats_shape;
alter table public.rooms add constraint rooms_seats_shape
  check (
    jsonb_typeof(seats) = 'array'
    and jsonb_array_length(seats) <= 8
    and pg_column_size(seats) <= 8192
  );

-- 스냅샷 실측 최대 약 4.9KB(gzip+base64). 256KB = Realtime 메시지 한도와 같은 자리수로,
-- 정상의 50배 여유를 두면서 수 MB 투입은 막는다.
alter table public.rooms drop constraint if exists rooms_snapshot_size;
alter table public.rooms add constraint rooms_snapshot_size
  check (pg_column_size(snapshot) <= 262144);

-- ============================================================
-- S4: 방 생성 남용 방지 (2026-08-01)
--
-- rooms_insert는 with check (true) — 무제한이라 스크립트로 공개방 목록을 마비시킬 수 있다.
-- uid당 제한이 이상적이지만 익명 로그인(S1) 전에는 요청자를 구분할 수 없고, IP는
-- PostgREST 경유라 신뢰성 있게 얻을 수 없다. 그래서 "정상 사용이라면 절대 닿지 않는
-- 총량"을 상한으로 둔다 — 1분에 방 20개는 명백한 남용이다.
-- S1에서 익명 로그인이 들어오면 여기에 uid별 조건을 덧붙여 촘촘하게 만든다.
-- ============================================================
create or replace function public.enforce_room_creation_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from public.rooms
  where created_at > now() - interval '1 minute';

  if recent_count >= 20 then
    raise exception '방 생성이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists rooms_rate_limit on public.rooms;
create trigger rooms_rate_limit
  before insert on public.rooms
  for each row execute function public.enforce_room_creation_rate_limit();

-- ============================================================
-- S1a: 인증 주체(auth.uid) 컬럼 — 정책은 아직 걸지 않는다 (2026-08-01)
--
-- 순서가 중요하다. RLS를 uid 기반으로 바꾸는 순간 익명 로그인을 하지 않는 배포본은
-- 전부 접근 불가가 되므로(온라인 전면 중단), 아래 순서를 지켜야 한다:
--   ① 컬럼 추가 (nullable — 기존 코드에 영향 0)          ← 이 블록
--   ② 클라이언트가 익명 로그인 + 컬럼을 채우도록 수정 → **배포**
--   ③ 그 뒤에 RLS 정책 교체                              ← supabase/rls-stage3.sql
--
-- participant_uids가 왜 필요한가: update를 host_uid = auth.uid()로만 조이면
-- **호스트 승계가 불가능해진다**(승계 = 게스트가 방 행을 써서 호스트를 자기로 바꾸는 동작).
-- 그래서 "이 방의 참가자"를 따로 들고 참가자면 쓸 수 있게 한다.
-- ============================================================
alter table public.rooms add column if not exists host_uid uuid;
alter table public.rooms add column if not exists participant_uids uuid[] not null default '{}';

create index if not exists rooms_participant_uids_idx
  on public.rooms using gin (participant_uids);

comment on column public.rooms.host_uid is
  '방을 만든 익명 사용자의 auth.uid. 호스트 승계 시 갱신된다. (S1a, 2026-08-01)';
comment on column public.rooms.participant_uids is
  '이 방에 앉은 적 있는 사용자들의 auth.uid. update 정책이 이 배열로 참가자를 판정하므로 '
  '호스트 승계자도 권한을 유지한다. clientId(좌석 식별, 탭별)와는 별개 축이다.';

-- ============================================================
-- O4: 강퇴 실효화 — 방별 차단 목록 (2026-08-01)
--
-- 지금까지 강퇴는 좌석의 clientId를 비우는 것뿐이라, 내보낸 사람이 방 코드를 다시
-- 입력하면 assignSeatForClaim이 빈자리에 그대로 배정했다(차단 장치가 아예 없었다).
--
-- uuid[]가 아니라 jsonb인 이유: UI에 "누구를 차단했는지" 보여주려면 이름이 필요한데,
-- 이미 나간 사람이라 좌석에서 복원할 수 없다 → [{"uid","name","at"}] 형태로 함께 저장.
-- 강퇴 시 participant_uids에서도 빼므로 RLS update 권한이 함께 회수된다.
--
-- ⚠️ 한계(설계상 수용): 시크릿 창·다른 브라우저는 새 익명 uid라 우회된다. 로그인 없는
--    서비스의 구조적 한계이고, 목표는 "내보낸 사람이 그대로 다시 들어오는 것" 방지다.
--    clientId로 막으면 sessionStorage라 탭만 새로 열어도 뚫려 아예 무의미하다.
-- ============================================================
alter table public.rooms add column if not exists banned jsonb not null default '[]';

alter table public.rooms drop constraint if exists rooms_banned_shape;
alter table public.rooms add constraint rooms_banned_shape
  check (
    jsonb_typeof(banned) = 'array'
    and jsonb_array_length(banned) <= 50
    and pg_column_size(banned) <= 8192
  );

comment on column public.rooms.banned is
  '방장이 내보낸 참가자 목록 [{uid, name, at}]. 재입장 차단용(O4, 2026-08-01). '
  'participant_uids에서도 함께 제거하므로 RLS update 권한도 같이 회수된다.';

-- ============================================================
-- S1b: 코드 입장 RPC + 공개방 목록 뷰 (2026-08-01)
--
-- ① rooms_select가 using(true)면 누구나 REST로 모든 방의 코드·스냅샷·좌석 clientId를
--    읽는다 — 비공개 방 코드가 노출되면 초대 없이 입장할 수 있다.
-- ② S2(Realtime private channel)에는 닭과 달걀 문제가 있다: 정책을 "그 방의 참가자만
--    채널 입장"으로 걸어야 하는데, 게스트는 채널에 들어가 claimSeat을 보내야 참가자가 된다.
--    **참가자여야 들어가는데, 들어가야 참가자가 된다.**
--    → 코드를 제시하면 참가자로 등록해 주는 join_room이 그 고리를 끊는다.
-- ============================================================
create or replace function public.join_room(p_code text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rooms;
  u uuid := auth.uid();
begin
  if u is null then
    raise exception '로그인이 필요합니다' using errcode = '28000';
  end if;

  select * into r from public.rooms where code = upper(btrim(p_code));
  if not found then
    raise exception '방을 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  -- 차단된 사람은 참가자로 등록하지 않는다(O4). 클라이언트가 이 메시지를 그대로 보여준다.
  if exists (
    select 1 from jsonb_array_elements(r.banned) b
    where (b->>'uid')::uuid = u
  ) then
    raise exception '이 방에서 입장이 제한되었습니다.' using errcode = '42501';
  end if;

  -- 참가자 등록(멱등) — 이게 있어야 RLS update 권한과 Realtime 채널 입장이 열린다
  if not (u = any(r.participant_uids)) then
    update public.rooms
       set participant_uids = participant_uids || u
     where id = r.id
    returning * into r;
  end if;

  return r;
end;
$$;

-- 익명 로그인 사용자(authenticated)만. anon은 제외 — 로그인 없이는 참가자가 될 수 없다.
revoke execute on function public.join_room(text) from public, anon;
grant execute on function public.join_room(text) to authenticated;

-- 공개방 목록 뷰 — **snapshot을 뺀다**(목록 조회만으로 진행 중 게임이 새어 나가지 않게).
-- 공개방은 "코드를 몰라도 들어가는" 방이므로 code 노출은 의도된 것이다.
--
-- ⚠️ security_invoker = on 필수: 기본값(definer 뷰)이면 뷰가 **소유자 권한으로 rooms를
--    읽어** RLS를 우회한다. 뷰 정의를 잘못 고치는 순간 구멍이 되고 어드바이저도 ERROR로
--    잡는다(2026-08-01 리뷰에서 발견). 통제는 뷰가 아니라 rooms_select 정책 한 곳에 모은다
--    → 정책을 조일 때 "공개·대기 중인 방"을 읽을 수 있게 예외를 두어야 이 뷰가 동작한다.
create or replace view public.public_rooms
  with (security_invoker = on)
  as
  select id, code, title, is_public, map_id, status, seats,
         host_client_id, updated_at, created_at
    from public.rooms
   where is_public = true
     and status = 'waiting';

grant select on public.public_rooms to anon, authenticated;

-- SECURITY DEFINER 함수의 REST RPC 노출 차단 (어드바이저 권고)
-- Supabase는 public 스키마 함수를 /rest/v1/rpc/<name>으로 자동 노출한다. 아래 둘은
-- 내부용(pg_cron·트리거)인데 소유자 권한으로 돌기 때문에, 노출된 채로 두면
-- anon이 cleanup_stale_rooms()를 직접 호출해 방을 임의 시점에 강제 삭제할 수 있다.
-- EXECUTE를 회수해도 동작은 불변 — 트리거와 cron은 호출자 권한을 보지 않는다.
revoke execute on function public.cleanup_stale_rooms() from anon, authenticated, public;
revoke execute on function public.enforce_room_creation_rate_limit() from anon, authenticated, public;
