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

-- RLS: 시작은 허용형 (친구 규모 — 방 코드를 아는 사람만 방을 찾는 모델).
-- 인증이 없어 요청자를 구분할 수 없으므로 "참가자만/호스트만" 정책은 현재 불가능.
-- 강화가 필요해지면 익명 로그인(anonymous sign-in) 도입 후 auth.uid() 기반으로 교체.
alter table public.rooms enable row level security;

drop policy if exists "rooms_select" on public.rooms;
create policy "rooms_select" on public.rooms
  for select to anon, authenticated using (true);

drop policy if exists "rooms_insert" on public.rooms;
create policy "rooms_insert" on public.rooms
  for insert to anon, authenticated with check (true);

drop policy if exists "rooms_update" on public.rooms;
create policy "rooms_update" on public.rooms
  for update to anon, authenticated using (true) with check (true);

-- 종료된 방 정리용 (finished만 삭제 허용)
drop policy if exists "rooms_delete_finished" on public.rooms;
create policy "rooms_delete_finished" on public.rooms
  for delete to anon, authenticated using (status = 'finished');

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
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
