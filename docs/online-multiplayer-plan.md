# 온라인 멀티플레이 종합 계획 — Supabase Realtime (2026-07-03 확정)

> 사용자 확정 사항: 백엔드 = **Supabase Realtime**, 동기화 = **호스트 권위(Host Authority)**,
> 기능 순서 = ① 방 코드 초대 → ② 재접속 → ③ 채팅 → ④ 공개방 목록 → ⑤ 빠른 매칭.
> 사용자가 제안한 아키텍처(2026-07-03 메시지)를 기준으로 채택하되, §4의 조정·보완 5가지를 반영.
> `@supabase/supabase-js` 설치 승인·완료(2026-07-03). 구 버전 문서(방식 비교표)는 git 이력 참조.

## 1. 아키텍처 (확정)

```text
                  GitHub Pages (정적 배포 유지)
                        │
                Next.js (Static Export)
                        │
                 Zustand(gameStore) ←― 게임 규칙·AI·persist 전부 기존 그대로
                        │
         ┌──────────────┴──────────────┐
     게임 규칙                    Net Layer (src/net/ — gameStore는 net을 모름)
                                       │
                               Supabase Realtime + rooms 테이블
                                       │
          ┌────────────────────────────┼────────────────────────────┐
      Player A (Host)            Player B (Guest)             Player C (Guest)
```

**진행 루프**: 게스트 클릭 → Intent 생성·전송 → 호스트 수신 → 기존 gameStore 액션으로
검증·실행(랜덤·AI 포함 전부 호스트에서만) → Snapshot 생성 → rooms에 저장 + 전원 브로드캐스트
→ 각자 `setState`로 화면 갱신.

- **왜 호스트 권위인가**: 전원이 각자 계산하면 조금만 달라져도 디싱크(A는 돈 20, B는 돈 17).
  호스트만 계산하면 원천 차단 — 결정론(랜덤 시드화)도 불필요해진다.
- **Supabase는 게임 규칙을 모른다**: 메시지 전달, 스냅샷 저장(재접속), 채팅 전달, 방 목록 제공만.
- **Intent** = "하고 싶은 행동" 요청(예: `{type:'buildTrack', coord, edges}`). 아직 실행된 것이
  아니며 호스트가 기존 액션 안의 검증(canBuildTrack, 경매 검증 등)으로 판정 — **추가 룰 코드 없음**.
- **Snapshot** = 게임 전체 상태 JSON. persist 포맷 재사용 (§4-④의 크기 보완 적용).
- **AI는 호스트에서 실행**: 기존 `scheduleAICheck` 경로 그대로. 게스트는 "AI 생각 중" 표시만.
- **승격 경로**: 나중에 치팅 방어가 필요해지면 `src/net/`만 자체 WebSocket 서버 구현으로 교체.
  gameStore는 거의 무수정 — 이 분리가 이 구조의 최대 자산.

**이 구조의 최대 장점** — 기존 자산 보존: 게임 규칙·AI·persist(→Snapshot)·로그·테스트 전부
그대로. 새로 만드는 것은 게임이 아니라 온라인 기능뿐.

## 2. 비용 분석 (2026-07 요금 실측)

| | Free | Pro ($25/월) |
|---|---|---|
| Realtime 동시 접속 | 200 (피크) | 500 포함, 초과 $10/1000 |
| Realtime 메시지 | 200만/월 (최대 256KB/개) | 500만 포함, 초과 $2.50/100만 |
| DB | 500MB | 8GB |
| Egress(전송량) | 5GB/월 | 250GB 포함 |
| 비활성 일시정지 | **1주 미사용 시 자동 정지** (대시보드에서 수동 재개) | 없음 |

**이 게임의 사용량 추정**:
- 동시 접속 200 = 6인 게임 33판 동시 진행 — 친구 규모에선 도달 불가.
- 메시지: 행동당 (intent 1 + 스냅샷 × 수신자 수). 6인 8턴 ≈ 행동 500개 → **게임당 3~5천 메시지**
  → 무료 한도로 월 ~400게임.
- **⚠️ 진짜 병목은 egress**: 스냅샷이 크면(logs 포함 시 수십~수백 KB) 게임당 수백 MB → 5GB가
  금방 참. §4-④의 보완(logs 제외 + 압축)으로 압축 후 ~10KB면 게임당 ~25MB → 월 ~200게임.
- DB: 방당 스냅샷 1개(수십 KB) + 종료 방 정리 → 500MB 충분.

**결론: 친구 규모(동시 수 판 이하)는 $0.** 유일한 불편은 1주 미접속 시 프로젝트 자동 정지
(플레이 전 대시보드에서 재개). 이게 싫거나 공개 서비스로 키우면 그때 Pro $25/월 — 그 외
초과 과금은 사실상 발생하지 않는다.

## 3. 보안 원칙

- 브라우저에 들어가는 것: **Supabase URL + anon key뿐** (anon key는 공개 전제로 설계된 키).
- **Service Role Key는 절대 클라이언트/저장소에 넣지 않는다** (RLS를 우회하는 관리자 키).
- anon key가 공개되므로 접근 제어는 RLS가 담당 — §5의 현실적 전략 참조.

> **⚠️ 2026-08-01 갱신 — 아래 §4-②의 "인증 없이는 구현 불가"는 해소됐다.**
> 익명 로그인(anonymous sign-in)을 도입해 **uid 기반 RLS가 실제로 적용됐다**(S1). 그 위에
> Realtime private channel까지 걸어(S2) 방 코드를 알아도 참가자가 아니면 채널에 들어올 수 없다.
> 현재 상태·정책 전문은 `supabase/setup.sql`, 운영 관점 요약은 CLAUDE.md "보안 (S1~S4 완료)".
> 남은 한계는 **호스트가 클라이언트라는 것**(호스트 본인의 조작은 막지 못함 — 설계상 수용,
> 필요 시 net 계층만 자체 서버로 교체).

## 4. 제안 아키텍처 대비 조정·보완 5가지 (분석 결론)

사용자 제안(호스트 권위·net 분리·persist 재사용·AI 호스트 실행·승격 경로)은 그대로 채택.
아래 5가지만 조정·보완한다.

### ① "1단계: Math.random 제거" → 불필요 (일정 단축)
호스트 권위에서는 **랜덤이 호스트에서만 실행**되고 결과가 스냅샷으로 전파되므로 디싱크가
원천적으로 없다 — 시드화는 락스텝(전원 로컬 실행) 모델에서만 필요. 2026-07-03 grep 실측:
게임플레이 랜덤은 `setup.ts` 선공 동전던지기·`tutorialMap.ts` 셔플·`DiceRoller`뿐이고,
ID 생성 랜덤(`buildSlice` 등)은 호스트에서만 생성돼 무해. **이 작업은 로드맵에서 제외.**

### ② RLS "방 참가자만 읽기 / Host만 수정" → 인증 없이는 구현 불가
anon key만 쓰면 모든 클라이언트가 Supabase 입장에서 **동일한 익명 사용자** — RLS가 "이 요청이
참가자인지/호스트인지" 구분할 방법이 없다. 현실적 전략:
- **시작(Phase 1)**: 허용형 RLS(anon select/insert/update 허용). 방 코드를 아는 사람만 방을
  찾는 모델 — 친구 규모에서 수용. 이론상 타인이 rooms를 긁을 수 있음을 인지하고 시작.
- **강화 경로(선택, 후순위)**: Supabase **익명 로그인(anonymous sign-in)** 도입 →
  `auth.uid()`를 seats/host에 저장 → "참가자만 select, 호스트만 snapshot update" 정책이
  비로소 가능. MAU 카운트되지만 무료 5만이라 무관.

> **✅ 2026-08-01 완료 — 이 "강화 경로"를 실제로 밟았다.**
> - `rooms.host_uid` / `participant_uids` 추가, 클라이언트 `ensureAuth`(`signInAnonymously`,
>   `persistSession:true`). 정책이 전부 `to authenticated`라 **익명 로그인이 꺼지면 온라인이 전면 중단**된다.
> - 정책: select = (공개·대기) OR 참가자 / insert = 내 uid로만 / **update = 참가자만** / delete = 호스트+finished.
>   ⚠️ update를 `host_uid = auth.uid()`로 조이면 **호스트 승계가 영원히 불가능해진다**(승계는 게스트가
>   방 행을 쓰는 동작) — 이 문서가 "호스트만 수정"으로 적었던 것이 실제로는 함정이었다.
> - `join_room(code)` RPC(security definer)가 코드 조회+차단 확인+참가자 등록을 원자적으로 처리.
>   private channel이 "참가자만 입장"이면 *채널에 들어가야 참가자가 되는* 고리가 생기는데, 이 RPC가 끊는다.
> - `public_rooms` 뷰(공개·대기만, snapshot 제외, `security_invoker=on`)로 목록 조회를 분리.
> - 순서 규칙(실측): **코드 → 배포 → DB**. 반대로 하면 배포 전까지 온라인이 죽는다.

### ③ 디렉터리 구조 → 이 프로젝트 실정에 맞게 조정
제안의 `pages/` → 이 프로젝트는 **App Router**(`src/app/`). 제안의 `src/game/gameStore.ts`
이동 → **하지 않는다**(방금 PR #18로 `src/store/` slice 구조를 확정 — 재이동은 무의미한 churn).
net 분리 원칙은 그대로:

```
src/
├── net/                    # 신설 — 네트워크 코드 전부 여기(게임 코드와 완전 분리)
│   ├── types.ts            #   RoomInfo/RoomSeat/IntentMessage/SnapshotMessage/ChatMessage
│   │                       #   + NetTransport/RoomConnection 인터페이스 (교체 지점)
│   ├── supabaseTransport.ts#   Supabase 구현 (채널·rooms 테이블·presence)
│   └── index.ts            #   env에서 transport 생성 (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)
├── store/                  # 기존 유지 (gameStore + slices)
│   └── slices/             #   Phase 1에서 게스트 가드만 추가
├── app/
│   ├── lobby/              # 신설 — 방 만들기/코드 입장/공개방 목록(Phase 4)
│   └── game/[mapId]/       # 기존 — 대기실·좌석 배정·차례 알림 확장
└── types/game.ts           # PlayerIntent union 추가
```

### ④ "Snapshot은 persist 그대로 보내면 된다" → 두 가지 보완
- **logs 제외 + 압축**: logs 포함 전체 JSON은 수십~수백 KB — egress 병목(§2)이자 무료 티어
  메시지 크기 한도(256KB) 위험. 로그 줄은 소형 `log` 이벤트로 별도 전파하고, 스냅샷은
  `CompressionStream`(gzip→base64)으로 압축. Phase 1 게이트에서 실측(목표 ≤20KB).
- **rev(단조 증가 리비전) 필드**: 브로드캐스트 역순 도착 시 옛 스냅샷 무시용.

### ⑤ 게스트 수신 시 persist 함정
게스트가 스냅샷을 `setState`로 반영할 때 기존 persist `merge` 콜백의 **1회성 상태 초기화**
(transcontinentalEvent·incomeReductions·aiExecution — CLAUDE.md persist 섹션)를 재사용해야
"옛 모달/배지 부활" 버그를 피한다. 호스트 스냅샷 생성 시에도 동일 필드 제외.

## 5. DB 스키마 + Realtime 설계

```sql
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,          -- 6자리 방 코드 (혼동 문자 I/O/0/1 제외)
  title text,                          -- 공개방 목록 표시용
  is_public boolean not null default false,
  map_id text not null,
  status text not null default 'waiting'
    check (status in ('waiting','playing','finished')),
  seats jsonb not null default '[]',   -- [{seat, name, kind:'human'|'ai', clientId|null}]
  host_client_id text,                 -- 호스트 승계 시 갱신
  snapshot jsonb,                       -- 최신 스냅샷 (재접속·승계용)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RLS: 시작은 허용형(§4-②), 강화는 익명 로그인 도입 시
-- Realtime: alter publication supabase_realtime add table rooms (공개방 목록 실시간 갱신용)
```

- **채널** = 방 코드당 1개 (`room:<code>`). broadcast 이벤트: `intent` / `snapshot` / `log` / `chat`.
- **presence** = 접속자 추적(키 = clientId) — 이탈 감지·호스트 승계·"연결 끊김" 표시.
- **clientId** = localStorage에 고정 저장한 UUID — 재접속 시 같은 사람으로 식별(Phase 2 전제).

## 6. 단계별 개발 플랜

> **진행 상태 (2026-07-04): Phase 0~5 전부 구현·게이트 통과.** 각 Phase는 커밋 단위로
> feature/online-multiplayer에 푸시됨. 구현 중 확정된 조정:
> - 공개방 목록 실시간 갱신은 postgres_changes 대신 **8초 폴링 + 수동 새로고침** (단순·저부하).
> - 빠른 매칭의 좌석 경합 RPC는 **불필요** — 좌석 배정 자체를 호스트가 처리(claimSeat intent)해
>   원자성이 이미 보장. 매칭 실패(만석/호스트 오프라인)는 4초 타임아웃 후 다음 방 시도.
> - clientId는 **sessionStorage**(탭별): 같은 탭 F5 재접속은 좌석 자동 복원, 한 PC 두 탭 플레이 가능.
>   탭을 닫은 재접속은 "끊긴 좌석 이어받기"(이름 일치 우선)로 처리.
> - intent에 **멱등성 id** — 채널 재조인 재전송에도 중복 실행 차단.
> - 경매 차례 검증은 currentPlayer 기준 (auction.currentBidder는 갱신 안 되는 레거시 필드).
> - 남은 알려진 한계: ① 치팅 방어 없음(설계상 수용), ② 게스트로 온라인 플레이 시 로컬 싱글
>   저장(persist)이 스냅샷으로 덮임, ③ 공개방 목록의 인원 수는 presence를 몰라 나간 좌석도
>   착석으로 집계될 수 있음, ④ 종료(finished) 방 자동 정리 미구현(수동 SQL).

사용자 제안 7단계와의 매핑. 각 Phase = 커밋 단위 + 게이트. 순수 작업일 총 2~3주.

| 제안 단계 | 본 플랜 | 비고 |
|---|---|---|
| 1. gameStore 정리 (Math.random 제거·Intent 타입) | Phase 0 (Intent 타입만) | Math.random 제거는 불필요(§4-①) |
| 2. Supabase 연결 | Phase 0 | |
| 3. Host Authority | Phase 1 전반 | |
| 4. Lobby (방 생성·코드 입장) | Phase 1 후반 | 방 목록만 Phase 4로 |
| 5. 재접속 | Phase 2 | + 호스트 승계 |
| 6. 채팅 | Phase 3 | |
| 7. 공개방·빠른 입장 | Phase 4·5 | |

### Phase 0. 기반 (~1일)
- [x] `@supabase/supabase-js` 설치 (2026-07-03 승인·완료)
- [x] 사용자: Supabase 프로젝트 생성(Seoul 리전, Data API ON/자동노출 OFF/자동RLS ON) →
      URL + publishable key 수령 (2026-07-03)
- [x] `.env.local` 생성 (+ `.env.local.example` 템플릿). GitHub Actions 배포 env 주입은 Phase 1에서
- [x] `supabase/setup.sql` 작성 — 자동노출 OFF에 맞춰 명시적 grant 포함.
      **적용 완료(2026-07-04, Supabase MCP `apply_migration`)** + 어드바이저 하드닝
      (set_updated_at search_path 고정, rls_auto_enable API 노출 차단). 허용형 RLS 경고 2건은
      §4-② 근거로 의도적 수용
- [x] `src/net/` 골격 (types + supabaseTransport + index) — 방 생성/입장/broadcast/presence/updateRoom
- [x] 검증용 `/net-test` 페이지 (Phase 1 로비 생기면 제거)
- [ ] `types/game.ts`에 `PlayerIntent` union → Phase 1의 게스트 가드 작업과 함께 진행으로 이동
- [x] **게이트 통과 (2026-07-04)**: 두 브라우저 탭 `/net-test`로 방 생성(코드 발급·rooms insert)
      → 코드 입장(rooms select·채널 구독) → 채팅 양방향 왕복 + intent 핑 수신 + presence 확인.
      같은 브라우저 두 탭은 localStorage clientId를 공유해 presence가 1명으로 집계됨(실기기 간에는
      기기별 ID — 정상 동작)

### Phase 1. ★ 친구 초대 — 방 코드 (1.5~2주, 최대 덩어리)
- **호스트 루프**: `onIntent → 기존 store 액션 호출 → 스냅샷(logs 제외+압축, rev 증가)
  브로드캐스트 + rooms.snapshot 갱신`.
- **게스트 가드**: store 액션 최상단 일괄 가드 — 게스트는 로컬 실행 차단, intent만 전송.
  ⚠️ 최대 함정: 애니메이션 완료 콜백(`completeCubeMove`)·단축키 등 우회 경로.
- **undo**: 자기 차례 + 호스트 확정(브로드캐스트) 전까지만 허용 — 단순안.
- **로비/대기실 UI**: 방 만들기(코드 발급)/코드 입장/좌석 배정(사람·AI 혼합), `initGame`은
  호스트만. 차례 알림("당신 차례"), 상대 행동 로그(기존 logs 재사용), 연결 상태 표시
  (`OfflineIndicator` 확장).
- **게이트**: 두 브라우저로 튜토리얼 완주 + 기존 vitest 전체 통과(오프라인 싱글 모드 회귀 없음)
  + 스냅샷 크기 실측(압축 후 ≤20KB).

### Phase 2. 재접속 + 호스트 승계 (2~3일)
- 새로고침/끊김 → 방 코드 재입장 → rooms의 최신 스냅샷 복원 (clientId로 내 좌석 식별).
- presence로 호스트 이탈 감지 → 남은 첫 플레이어가 호스트 롤 인수(host_client_id 갱신,
  스냅샷에서 이어 실행). 이탈자 좌석은 재접속 대기.
- **게이트**: 게임 중 호스트 강제 종료 → 게스트가 승계해 완주.

### Phase 3. 채팅 (1일)
- broadcast `chat` 이벤트(휘발성, DB 저장 안 함 — 무료 티어 절약) + 게임 로그 패널에 채팅 탭.
- **게이트**: 3인 방 실시간 수신 + 재접속 시 채팅 비복원(명시된 동작).

### Phase 4. 공개방 목록 (1~2일)
- 방 생성 시 `is_public` + `title`. 로비에 목록(제목·맵·인원 n/max) — select +
  postgres_changes 구독으로 실시간 갱신.
- **게이트**: 방 생성/만석/게임시작/종료가 목록에 실시간 반영.

### Phase 5. 빠른 매칭 (1일)
- "빠른 시작" → `is_public and status='waiting' and 빈자리>0` 중 가장 오래된 방 자동 입장.
- 좌석 경합은 **원자적 좌석 점유 RPC**(조건부 update)로 해결 — 실패 시 다음 방 시도.
- **게이트**: 두 클라이언트 동시 빠른매칭 → 같은 좌석 중복 배정 없음.

## 7. 리스크

- **게스트 로컬 변조 경로**(Phase 1 최대 함정): store 액션 최상단 일괄 가드로 차단.
- **스냅샷 크기 → egress**: logs 제외 + 압축, Phase 1 게이트에서 실측 (§4-④).
- **무료 티어 일시정지**: 1주 미사용 시 정지 — 플레이 전 대시보드 재개 필요(또는 Pro).
- **치팅 방어 없음**: 호스트가 클라이언트라 조작 가능 — 친구용이므로 수용. 필요해지면
  net 교체로 서버 권위 승격 (§1).
- **RLS 허용형의 노출**: 방 코드 모델의 한계(§4-②) — 강화는 익명 로그인 도입 시.

## 8. 상태 동기화 모델 — Snapshot · 로그 · Undo (구현 확정, 2026-07-05)

> "Snapshot에는 현재 상태만, History는 별도 저장" 이라는 일반론과 **이 프로젝트의 실제 구현이
> 어디서 갈라지는지**를 못박아 둔다. §4-④·§5에 흩어진 스냅샷 얘기를 여기로 종합.

### 8-1. Snapshot = 현재 상태 + 최근 로그 30개 (순수 상태 아님)

교과서적 Snapshot은 "현재 상태만"이지만, 이 프로젝트의 스냅샷은 **`state.logs`의 최근 30개를
같이 실어 보낸다** (게스트 로그 패널이 재접속·중간 합류 후에도 직전 흐름을 보여주기 위함).

- **인코딩**: `src/net/snapshotCodec.ts` — `extractSyncedState()`가 persist 포맷(전체 GameState)에서
  ① 함수(zustand 액션) ② 로컬 전용 키(`ui`·`aiExecution`)를 빼고, ③ `logs`는 최근
  `RECENT_LOGS = 30`개만 남긴 뒤, `encodeSnapshot()`이 `JSON → gzip(CompressionStream) → base64`로
  압축한다(실측 압축 후 ~2KB, Realtime 256KB 한도/무료 egress 대비).
- **`ui.movingCube`만 예외 승격**: 화물 이동 애니메이션을 게스트도 보도록 `netMovingCube`로 승격
  (정산 `completeCubeMove`는 여전히 호스트 타이머 전용, 게스트는 guestNoop).
- **전파·영속**: `src/net/netStore.ts:185-207` `broadcastSnapshotNow()` — `rev`(단조 증가) 붙여
  ① 전원 broadcast + ② `rooms.snapshot`에 저장(재접속·호스트 승계용). `rev`로 역순 도착을 무시
  (`netStore.ts:256` `msg.rev <= lastAppliedRev` 드롭). ui만 바뀐 변화는 전송 생략.
- **게스트 적용**(`applySnapshotAsGuest`, `netStore.ts:255~`): `decodeSnapshot` 후 `setState`.
  이때 persist `merge`와 같은 원칙으로 1회성 상태(`transcontinentalEvent`·`incomeReductions`·
  `aiExecution`)를 안전값으로 초기화 — "옛 모달/배지 부활" 방지.

**요지**: 스냅샷은 "현재 상태 + 꼬리 로그 30개"다. 순수 현재 상태만은 아니지만, 전체 History도
아니다 — 30개 넘어가면 앞부분은 스냅샷에 실리지 않는다.

### 8-2. "로그"는 두 종류이고 서로 완전히 별개다 (혼동 주의)

| | `state.logs` (GameState 필드) | `logAction` (`utils/debugConfig.ts`) |
|---|---|---|
| 정체 | **인게임 이벤트 로그** | **개발/디버깅용 콘솔 로그** |
| 생성 | `addLog`(`gameStore.ts:1552`) + 각 액션이 append | `logAction(category, type, payload)` 직접 호출 |
| 형태 | `{turn, phase, player, action, timestamp}` 배열 | `[game:<sessionId>] {"t":...,"c":...}` 한 줄 JSON |
| 저장 | **persist(localStorage)에 게임 전체 누적** | **저장 안 됨** — 콘솔→:3999 서버로만 출력 |
| 온라인 전파 | **스냅샷에 최근 30개만** | 전파 안 됨 (게임 상태 아님) |
| 용도 | UI 로그 패널, 재접속 후 흐름 표시 | AI/버그 추적(:3999에서 `"c":"trackBuilding"` grep) |

→ 흔한 오해: **`logAction`을 "History의 시작"으로 보는 것**. `logAction`은 게임 상태의 일부가
아니라 저장·동기화되지 않는 디버그 스트림이다. 실제로 저장·전파되는 History 성격 데이터는
`state.logs`(그마저 온라인은 30개로 잘림)뿐이다.

### 8-3. 별도 History / 리플레이 시스템은 미구현 (의도적)

- **영구 액션 히스토리 DB 없음**: `rooms.snapshot`은 **최신 1건만** 덮어쓴다(재접속·승계용).
  과거 스냅샷·수 목록을 쌓아두지 않는다.
- **리플레이(기보 재생) 없음**: "1턴부터 되감기" 재생 기능은 없다.
- **로컬 persist에는 전체 `state.logs`가 쌓이지만**(그 판 한정, localStorage `age-of-steam-game`),
  이건 UI 표시용이지 리플레이 엔진이 아니다. 게스트로 온라인 플레이하면 이 로컬 저장은 스냅샷에
  덮인다(§6 알려진 한계 ②).
- **확장한다면**: `logAction`의 구조화 JSON(이미 `sessionId`+turn+player+payload 보유)을 별도
  append-only 스토어(파일/테이블)로 흘려보내면 기보·리플레이의 토대가 된다 — 지금은 콘솔로만
  나가므로 "수집기"만 붙이면 됨. 온라인이라면 `log` 소형 이벤트를 채널로 별도 전파(§4-④가
  열어둔 설계)하거나 rooms에 로그 테이블을 추가.

### 8-4. Undo는 "스냅샷 여러 개" 방식 (역계산 아님)

- **모델**: 확정 행동마다 `captureUndo(state, label)`로 전체 상태 스냅샷을 `undoSnapshots`
  스택(`store/helpers/undo.ts`, **모듈 싱글턴**)에 push. `undoLastAction`은 pop해서 복원 —
  액션 역연산이 아니라 스냅샷 되돌리기다. `nextPhase`마다 스택 초기화(사람 전용).
- **온라인 함정**(CLAUDE.md·§6 참조): `undoCount`는 persist/스냅샷 동기화 **상태**지만 실제 스택은
  **호스트 메모리**에만 있다. F5·호스트 승계 시 스택은 비고 count만 남아 "눌러도 안 되돌아가는"
  팬텀 취소가 되므로 persist `merge`·`promoteToHost`에서 `undoCount:0` 리셋. 게스트 undo는
  intent만 보내고 호스트 스냅샷이 와야 반영(로컬 즉시 아님).

### 8-5. 코드 지도 (한눈에)

```
현재 상태 ── src/store/gameStore.ts (GameState, persist: age-of-steam-game)
   │           └ state.logs[]  ← addLog / 각 액션이 append (전체 누적)
   │
스냅샷 ──── src/net/snapshotCodec.ts  extractSyncedState → encodeSnapshot(gzip+base64)
   │           · 제외: 함수 · ui · aiExecution
   │           · logs: 최근 30개(RECENT_LOGS)만
   │           · netMovingCube: ui.movingCube 승격
   │
전파·영속 ── src/net/netStore.ts  broadcastSnapshotNow (rev++, broadcast + rooms.snapshot 1건 덮기)
   │
Undo ────── src/store/helpers/undo.ts  undoSnapshots 스택(모듈 싱글턴, 호스트 메모리)
   │
디버그 로그 ─ src/utils/debugConfig.ts  logAction → 콘솔/:3999 (저장·전파 안 함, 게임 상태 아님)
```
