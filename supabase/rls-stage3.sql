-- ============================================================
-- S1 3단계: RLS 정책 교체 (uid 기반)  ⛔ 아직 적용하지 말 것
--
-- ⚠️ **적용 전제 — 하나라도 빠지면 온라인이 통째로 죽는다:**
--   1. 익명 로그인 클라이언트(S1a)가 **배포되어** 있을 것
--      (현재 배포본은 persistSession:false라 로그인을 안 한다 → authenticated 정책에 전부 걸림)
--   2. Supabase 대시보드 > Authentication > Providers > **Anonymous sign-ins 활성화**
--   3. 적용 직후 두 브라우저로 E2E 확인: 방 생성 → 코드 입장 → 게임 시작 →
--      건설/수송 → F5 재접속 → **호스트 승계**(가장 깨지기 쉬운 경로)
--
-- 되돌리기: 이 파일 맨 아래 [ROLLBACK] 블록을 실행하면 허용형으로 즉시 복귀한다.
--          문제가 생기면 원인을 찾기 전에 먼저 되돌릴 것 — 진행 중인 게임이 인질이 된다.
--
-- 적용: Supabase MCP apply_migration 또는 대시보드 SQL Editor.
-- ============================================================

-- ── INSERT: 로그인한 사용자만 방을 만들 수 있다 ──────────────
-- host_uid/participant_uids를 자기 uid로 채우도록 강제해, 남의 uid로 방을 만들 수 없게 한다.
-- (S4 rate limit 트리거는 그대로 함께 동작한다)
drop policy if exists "rooms_insert" on public.rooms;
create policy "rooms_insert" on public.rooms
  for insert to authenticated
  with check (
    auth.uid() is not null
    and host_uid = auth.uid()
    and participant_uids @> array[auth.uid()]
  );

-- ── UPDATE: 그 방의 참가자만 ────────────────────────────────
-- ⚠️ host_uid = auth.uid()로 조이면 **호스트 승계가 불가능해진다** — 승계는 게스트가
--    방 행을 update해서 host_client_id/host_uid를 자기로 바꾸는 동작이기 때문이다.
--    그래서 participant_uids(호스트가 claimSeat 때 등록해 둔 목록)로 판정한다.
-- with check에서 참가자 목록이 **줄어들지 않게** 막는다(@>) — 남을 방에서 밀어내지 못하도록.
drop policy if exists "rooms_update" on public.rooms;
create policy "rooms_update" on public.rooms
  for update to authenticated
  using (auth.uid() = any(participant_uids))
  with check (participant_uids @> array[auth.uid()]);

-- ── DELETE: 호스트만, 그리고 끝난 방만 ──────────────────────
-- 기존엔 status='finished'이기만 하면 **누구나** 지울 수 있었다.
-- (update로 status를 finished로 바꾼 뒤 삭제하는 우회도 위 update 정책으로 함께 막힌다)
drop policy if exists "rooms_delete_finished" on public.rooms;
create policy "rooms_delete_finished" on public.rooms
  for delete to authenticated
  using (status = 'finished' and auth.uid() = host_uid);

-- ── SELECT: 아직 열어 둔다 (S1b에서 처리) ───────────────────
-- 지금 조이면 "코드로 방 찾기"와 "공개방 목록"이 함께 죽는다. 둘 다 security definer RPC로
-- 옮겨야 하고 클라이언트(fetchRoom/listPublicRooms)도 같이 바꿔야 해서 범위가 커진다.
-- 남는 노출: 비공개 방 코드 열람, 진행 중 스냅샷 훔쳐보기, seats의 clientId 수집.
-- → 파괴적 조작(update/delete)을 먼저 막는 것이 우선순위상 맞다. S1b에서 다음을 할 것:
--     · 목록용 뷰(공개방 + 민감 컬럼 제외)
--     · get_room_by_code(code) security definer RPC — 정확 일치만, 테이블 스캔 불가
--     · 참가자는 자기 방 전체를 읽을 수 있게

-- ============================================================
-- [ROLLBACK] 문제 발생 시 이 블록만 실행하면 허용형으로 즉시 복귀
-- ============================================================
-- drop policy if exists "rooms_insert" on public.rooms;
-- create policy "rooms_insert" on public.rooms
--   for insert to anon, authenticated with check (true);
--
-- drop policy if exists "rooms_update" on public.rooms;
-- create policy "rooms_update" on public.rooms
--   for update to anon, authenticated using (true) with check (true);
--
-- drop policy if exists "rooms_delete_finished" on public.rooms;
-- create policy "rooms_delete_finished" on public.rooms
--   for delete to anon, authenticated using (status = 'finished');
