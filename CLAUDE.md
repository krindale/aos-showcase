# CLAUDE.MD - Age of Steam Showcase

이 프로젝트에 대한 Claude Code 가이드입니다.

## 프로젝트 개요

Age of Steam 보드게임의 프리미엄 비주얼 쇼케이스 웹사이트입니다.
텍스트 중심 매뉴얼이 아닌, 시각적 임팩트와 애니메이션 중심의 모던 웹 애플리케이션입니다.

## 일반 수칙

- **언어**: 모든 과정 설명, 메모리 기록, 그리고 **생각(Thought Process)**은 반드시 **한글**로 작성해야 합니다.
- **라이브러리**: 새로운 라이브러리를 추가하거나 기존 라이브러리를 삭제할 때는 반드시 **사용자에게 먼저 이야기(승인 요청)**해야 합니다. 임의로 추가/삭제하지 마십시오.
- **코드리뷰 방식**: 코드리뷰는 병렬 에이전트 fan-out이 아니라 **순차(스텝바이스텝)**로 진행합니다.
  ① 리뷰 체크리스트(스텝 목록)를 먼저 만들고, ② 한 번에 한 스텝씩 수행하며, ③ 각 스텝이 끝날
  때마다 결과(통과/발견 사항)를 기록하고 **관련 사항을 즉시 커밋·푸시**합니다 — 토큰이 중간에
  소진되어도 git 이력만으로 다른 PC에서 이어갈 수 있어야 합니다.
- **브라우저 테스트**: Claude가 **임의로** 브라우저를 열어 게임을 실행·조작·캡처하지 않습니다.
  사용자가 명시적으로 지시했을 때만 합니다 → [⛔ 브라우저 테스트는 사용자가 시킬 때만](#-브라우저-테스트는-사용자가-시킬-때만)
- **⛔ 브랜치 삭제 금지**: 작업 브랜치는 **절대 임의로 삭제하지 않습니다**. PR을 머지할 때도
  `gh pr merge --delete-branch`를 쓰지 말고 브랜치를 남겨 두십시오(`gh pr merge --merge`만).
  로컬 `git branch -d/-D`, 원격 `git push origin --delete`도 마찬가지 — **사용자가 명시적으로
  "브랜치 지워"라고 했을 때만** 합니다. 머지 후에도 브랜치는 그 작업의 이력·비교 기준(A/B 측정,
  되돌리기 지점)으로 쓰입니다. (2026-07-29 실제 제지: PR #59 머지 때 지시 없이 `--delete-branch`를
  붙여 삭제했고, 머지 커밋의 부모로 복구해야 했습니다.)


## 기술 스택

- **Framework**: Next.js 14 (App Router, Static Export)
- **Styling**: Tailwind CSS 3.4
- **Animation**: Framer Motion 12 (GSAP 3.14 + @gsap/react 설치됨, 현재 미사용)
- **State**: Zustand 5
- **Icons**: Lucide React
- **Language**: TypeScript
- **Test**: Vitest 4 (단위 테스트)
- **PWA**: Service Worker (`public/sw.js`), 오프라인 모드, 게임 상태 저장
- **Deployment**: GitHub Pages (Static Export)

## 디자인 시스템

**"크림 페이퍼 + 버밀리언" (2026-07 리뉴얼)** — 사용자가 Claude 아티팩트로 만든 디자인
(`claude-design/Age of Steam Website Design/`)을 원본 스펙으로 재구성. 이전 다크+골드+글래스모피즘
디자인은 **`backup/design-dark-gold` 브랜치에 백업**되어 있음.
폰트: display = Space Grotesk(제목/숫자), body = IBM Plex Sans KR (globals.css @import,
`--font-display`/`--font-body` 변수).

### 컬러 팔레트

```typescript
// tailwind.config.ts에서 정의됨
colors: {
  background: {
    DEFAULT: '#f7f5f0',    // 페이지 배경 (크림)
    secondary: '#ffffff',  // 카드/패널
    tertiary: '#efeae1',   // 밴드/호버
  },
  foreground: {
    DEFAULT: '#1c1b18',    // 잉크
    secondary: '#6e6a61',  // 보조 텍스트
    muted: '#8a857c',      // 흐린 텍스트
  },
  accent: {
    DEFAULT: '#c04a2b',    // 버밀리언
    light: '#d65a39',      // 호버
    dark: '#a03a22',
  },
  positive: '#2f6b4f',     // 수입/긍정 (딥그린)
  steam: { red, blue, green, purple, yellow },  // 게임 연출용 고정색
  glass: {                 // 페이퍼 서피스 (토큰명은 구 글래스 시절 유지)
    DEFAULT: 'rgba(255,255,255,0.7)',
    border: '#e6e1d6',     // 구조 보더 (카드 보더는 #ebe6dc)
    hover: '#ece7dd',
  },
}
```

### 유틸리티 클래스

```css
/* globals.css에서 정의됨 — 클래스명은 구 디자인 시절 그대로, 스타일만 페이퍼로 교체됨 */
.text-gradient     /* 버밀리언 그라디언트 텍스트 */
.glass            /* 반투명 페이퍼 배경 */
.glass-card       /* 흰 페이퍼 카드 (border #ebe6dc + soft shadow, radius 18px) */
.glow-text        /* (no-op — 글로우 제거됨) */
.glow-border      /* soft paper shadow */
.btn-primary      /* 버밀리언 버튼 (radius 12px) */
.btn-secondary    /* 흰 배경 아웃라인 버튼 */
.card-hover       /* 호버 시 상승 효과 */
.hex-pattern      /* 도트 그리드 배경 (구 헥스 패턴 대체, 클래스명 유지) */
.rail-dash        /* SVG 점선 레일 흐름 애니메이션 (aosDash) */
.snap-section     /* 스크롤 스냅 정렬 (html에 scroll-snap-type: y proximity) */
```

## 프로젝트 구조

```
src/
├── app/                        # Next.js App Router 페이지
│   ├── page.tsx                # 랜딩 페이지 (/, HeroSection + FeatureCards + EditorialSection + CtaBand)
│   ├── layout.tsx              # 루트 레이아웃 (Navigation + Footer + ServiceWorkerRegistration + OfflineIndicator)
│   ├── globals.css             # 글로벌 스타일, 유틸리티 클래스
│   ├── error.tsx               # 라우트 에러 바운더리
│   ├── global-error.tsx        # 전역 에러 바운더리
│   ├── service-worker-registration.tsx  # SW 등록 클라이언트 컴포넌트
│   ├── game/
│   │   └── [mapId]/            # 동적 라우트 (tutorial, rust-belt 등)
│   │       ├── page.tsx        # 서버 컴포넌트 (SSG)
│   │       └── GamePageClient.tsx  # 게임 클라이언트 컴포넌트
│   ├── gameplay/
│   │   └── page.tsx            # 게임플레이 페이지 (턴 시퀀스, 트랙 건설)
│   ├── actions/
│   │   └── page.tsx            # 특수 행동 페이지 (7개 3D 플립 카드)
│   ├── maps/
│   │   └── page.tsx            # 맵 갤러리 (7개 맵 슬라이더)
│   ├── calculator/
│   │   └── page.tsx            # 계산기 (트랙 비용, 승점, 수입 시뮬레이터)
│   └── sfx/
│       └── page.tsx            # 효과음 미리듣기 (숨은 라우트 — SFX_CATALOG 순회 카드+재생 버튼, 게이트 무시 previewSfx)
│
├── ai/                         # AI 엔진 시스템 (객체 지향 아키텍처)
│   ├── index.ts                # AI 메인 엔트리포인트 (bridge)
│   ├── AIPlayer.ts             # 개별 AI 플레이어 클래스 (decide → Phase별 분기)
│   ├── AIPlayerManager.ts      # AI 인스턴스 관리 싱글톤
│   ├── evaluator.ts            # 게임 상태 평가 (비용 계산, 트랙 카운트 등)
│   │
│   ├── strategy/               # 고수준 전략 분석 및 경로 탐색
│   │   ├── types.ts            # DeliveryRoute, DeliveryOpportunity 타입
│   │   ├── scenarios.ts        # 시나리오 정의
│   │   ├── analyzer.ts         # A* 경로 탐색, 트랙 큐브 배달 기회 생성, getConnectedCities
│   │   ├── selector.ts         # 화물 기반 동적 전략 선택 (getNextTargetRoute, 헥스큐브 맵 경로)
│   │   ├── vp.ts               # ΔVP 환산기 (순수 함수, 튜닝 상수 집중)
│   │   ├── mapConfig.ts        # 맵별 AI 설정 오버라이드 (엔진 상한·턴 수·건설 수·income 원천)
│   │   ├── turnPlan.ts         # 턴 시작 계획 수립 (목표 경로/필요 트랙/현금), Phase 간 공유
│   │   ├── state.ts            # 전략 상태 관리 (currentTargetRoutes Map)
│   │   └── __tests__/          # 전략 단위 테스트
│   │       ├── analyzer.test.ts
│   │       └── selector.test.ts
│   │
│   ├── strategies/             # 하위 수준 Phase별 결정 로직
│   │   ├── issueShares.ts      # Phase I: 주식 발행 (파산 방지 포함)
│   │   ├── auction.ts          # Phase II: 경매 입찰
│   │   ├── selectAction.ts     # Phase III: 행동 선택 (7가지)
│   │   ├── buildTrack.ts       # Phase IV: 트랙 건설 (3단계 대체 경로 탐색)
│   │   ├── moveGoods.ts        # Phase V: 물품 이동 (findRouteOptions 디폴트 공유 + 가로채기 방어)
│   │   └── __tests__/
│   │       └── buildTrack.test.ts
│   │
│   ├── debug/                  # AI 디버깅 및 분석 도구
│   │   ├── index.ts            # 디버거 엔트리포인트 (window.debugAI 노출)
│   │   ├── AIDebugger.ts       # 메인 디버거 로직
│   │   ├── types.ts            # 디버그 타입 정의
│   │   ├── collectors/         # 데이터 수집기
│   │   │   ├── pathCollector.ts
│   │   │   ├── phaseCollectors.ts
│   │   │   ├── strategyCollector.ts
│   │   │   └── trackCollector.ts
│   │   └── formatters/
│   │       └── consoleFormatter.ts
│   │
│   └── __tests__/              # AI 통합 테스트
│       ├── trackBuildSimulation.test.ts  # 턴 간 트랙 건설 시뮬레이션
│       ├── fullSimulation.test.ts        # 2 AI 멀티턴 트랙 건설/링크 완성 시뮬레이션
│       ├── fullGameSimulation.test.ts    # 실제 gameStore 구동 전체 게임 시뮬레이션 (파산율/재정 검증)
│       ├── stLuciaSimulation.test.ts     # St.Lucia 2 AI 동기식 전체게임 러너 + 수익/건설 깔때기 측정
│       ├── rustBeltSimulation.test.ts    # Rust Belt 4인(디폴트) AI 동기식 전체게임 러너(8턴) + 베이스라인
│       ├── germanySimulation.test.ts     # Germany 5인(디폴트) AI 동기식 전체게임 러너(7턴) + 베이스라인
│       ├── westernUsSimulation.test.ts   # Western US 5인(디폴트) AI 동기식 전체게임 러너(7턴) + 베이스라인
│       ├── southernUsSimulation.test.ts  # Southern US 6인 AI 동기식 전체게임 러너(6턴) + 면화 불변식 + 베이스라인
│       ├── koreaSimulation.test.ts       # Korea 4인 AI 동기식 전체게임 러너(8턴) + 베이스라인
│       ├── montrealSimulation.test.ts    # Montréal 3인 AI 동기식 러너(9턴) + 특수룰 불변식(정부링크/마스터네트워크/DGEL)
│       ├── moonSimulation.test.ts        # Moon 4인 AI 동기식 러너(8턴) + 달 불변식(밤낮 교대/건설 상한/Moon Base 무배달)
│       ├── southernChinaSimulation.test.ts # Southern China 4인 AI 동기식 러너(8턴) + 불변식(디스크≤4/HK 폐쇄 후 배달 0)
│       └── helpers/
│           └── mockState.ts    # 테스트용 Mock 데이터 헬퍼
│
├── maps/                       # 맵 프로파일 (다형성 — 맵별 동작을 mapId 분기 대신 상속 override로)
│   ├── MapId.ts                # 맵 식별자 enum (문자열 분기 제거, 라우트/저장 호환)
│   ├── MapProfile.ts           # 추상 베이스 (세팅·규칙·AI설정·경로전략·specialRules 안내문, 기본=표준 맵)
│   ├── getMapProfile.ts        # mapId → MapProfile 인스턴스 팩토리 (캐싱)
│   └── profiles/
│       ├── StandardMapProfile.ts   # 룰북 기본 맵 (튜토리얼 = engineMax 3 override)
│       ├── StLuciaMapProfile.ts    # St.Lucia override (헥스큐브 income/규칙/경로전략)
│       ├── RustBeltMapProfile.ts   # Rust Belt override (Pittsburgh/Wheeling 큐브 3)
│       ├── GermanyMapProfile.ts    # Germany override (Engineer 절반/미완성금지/Berlin보너스/큐브수)
│       ├── WesternUsMapProfile.ts  # Western US override (마을큐브/$20시작/시작도시제한/연속성/동서보너스/대륙횡단)
│       ├── SouthernUsMapProfile.ts # Southern US override (면화/항구/Atlanta 호황/남북전쟁 수입감소 2배)
│       ├── KoreaMapProfile.ts     # Korea override (동적색은 board플래그/도시화 디스플레이보충/no-growth/큐브수)
│       ├── MontrealMapProfile.ts  # Montréal override (정부 링크/마스터 네트워크/DGEL/경매 트윅/Repopulation/신도시 큐브)
│       ├── MoonMapProfile.ts      # Moon override (건설2·Engineer3/Moon Base 네트워크 시드/밤낮/저중력/주사위 성장/신도시 A·B·E·F)
│       └── SouthernChinaMapProfile.ts # Southern China override (디스크4+국유화/지지 토큰/Gain Support/HK 폐쇄/인터어반·페리)
│
├── components/                 # UI 컴포넌트
│   ├── Navigation.tsx          # 글래스모피즘 네비게이션 바
│   ├── SiteShell.tsx           # 전역 크롬 조건부 렌더 (게임 화면 /game/* 에선 Navigation/Footer 숨김)
│   ├── Footer.tsx              # 푸터 (링크, 소셜)
│   ├── HeroSection.tsx         # 히어로 (도트 그리드 + 스탯 바)
│   ├── EditorialSection.tsx    # 랜딩 "왜 명작인가" 밴드 + 배송 원리 SVG
│   ├── CtaBand.tsx             # 랜딩 하단 버밀리언 CTA 밴드
│   ├── FeatureCards.tsx        # 핵심 경험 4카드
│   ├── OfflineIndicator.tsx    # 오프라인/동기화 상태 표시 (PWA)
│   └── game/                   # 게임 UI 컴포넌트
│       ├── GameBoard.tsx       # 헥스 그리드 게임보드 본체 (store 구독·useMemo 캐시·클릭 핸들러·줌/좌표)
│       ├── board/              # GameBoard 렌더 레이어 분리 (2026-07-03, 코드 그대로 이동 + props 주입)
│       │   ├── boardGeometry.ts    # 순수 기하/스타일 헬퍼 (shadeColor·nameBandPoints·큐브 스펙 등)
│       │   ├── BoardTracks.tsx     # 트랙 타일·소유 마커·완성 링크 마커·끊김 경고
│       │   ├── BoardTowns.tsx      # 마을 디스크·가닥·큐브·도시화 하이라이트
│       │   ├── BoardCities.tsx     # 도시 헥스·라벨·큐브·직결 링크
│       │   └── BoardOverlays.tsx   # 미리보기·트랙 위 큐브·이동 경로/큐브·외곽선·경계변·터미널 테두리
│       │   # ⚠️ SVG는 렌더 순서 = z-order: GameBoard 합성 순서(배경→Towns→Tracks→Cities→Overlays→Pulses→좌표) 유지
│       ├── ConfirmDialog.tsx   # 디자인 시스템 확인 모달 (window.confirm 대체 — 네이티브 다이얼로그 사용 금지:
│       │                       #   자동화/E2E를 블로킹하고 디자인과 부조화. 스크롤락·백드롭 취소 내장)
│       ├── PlayerPanel.tsx     # 플레이어 정보 패널 (AI 표시 포함)
│       ├── PhasePanel.tsx      # 현재 단계 표시 (AI 생각 중 상태)
│       ├── AuctionPanel.tsx    # 경매 UI
│       ├── TurnOrderOfferPanel.tsx  # 교대 선공권 제안 UI ($5 선공/거부, St.Lucia)
│       ├── UrbanizationPanel.tsx   # 도시화 UI
│       ├── ProductionPanel.tsx     # 생산 UI
│       ├── GoodsGrowthPanel.tsx    # 물품 성장 UI
│       ├── GoodsDisplayPanel.tsx   # 물품 디스플레이 UI
│       ├── ComplexTrackPanel.tsx   # 복합 트랙 선택 UI
│       ├── RedirectTrackPanel.tsx  # 트랙 방향 전환 UI
│       ├── TurnTrack.tsx       # 턴 트랙 UI
│       ├── DiceRoller.tsx      # 주사위 굴리기 UI (1회 굴린 뒤 버튼 숨김 — 재굴림 방지)
│       ├── DebugPanel.tsx      # 디버그 패널 UI
│       ├── TranscontinentalModal.tsx  # 대륙횡단 연결 팝업 (Western US: 보너스 수령자·연속성 해제 안내)
│       ├── MoveCubeOverlay.tsx # 화물 이동·건설 관전·신도시 배치 중 보드 미니맵 (모든 맵, 우측 하단 fit). 표시: 화물 이동(전원), 봇/온라인 타인 차례 건설(관전), 내 도시화 마을 고르기, 신도시 배치 직후 플래시(전원, newCityEvent 3.5초). 이동 중엔 헤더에 "출발→도착 (N링크)" 경로 표시
│       ├── GameSettingsDialog.tsx  # 게임 설정 창 (줌 옆 ⚙, z-30 HUD 레이어 = 관전 중에도 열림) — 운송 가이드/운송 확인/효과음/좌표 스위치 (gameSettingsStore, 전부 로컬 개인 설정)
│       ├── TransportConfirmDialog.tsx  # 화물 운송 확인 창 (기본 on) — 목적지 클릭 시 "출발→도착·링크별 수익 귀속(getPathLinkOwners 미러)" 확인 후 커밋. GameBoard가 selectDestinationCity를 래핑해 인터셉트(봇·경로 선택 모드는 통과)
│       ├── Toaster.tsx         # 화면 상단 토스트 렌더러 (toastStore 구독, safeTimeout 자동 사라짐)
│       ├── PhaseTransition.tsx # 단계 전환 안내 팝업 (마지막 플레이어 행동 확인용, pointer-events-none 순수 안내)
│       ├── OnlineLobby.tsx     # 온라인 로비/대기실 (방 만들기·코드 입장·좌석·공개방·빠른매칭). 기본 공개방, 좌석 정체성 아이콘(나=왕관/호스트=별/봇/사람), 호스트가 좌석 bot↔사람 전환·게스트 강퇴, 빈 좌석 기본 이름 기차-N
│       ├── GameChat.tsx        # 게임 중 플로팅 채팅 (보드 우측 하단 sticky, 닫힘 시 알림음)
│       ├── ChatSenderIcon.tsx  # 채팅 발신자 아이콘 (나=왕관/호스트=별/그외=사람) — clientId·room.hostClientId로 판정, 대기실·인게임 채팅 공용
│       ├── HostTakeoverDialog.tsx  # 호스트 연결 끊김 → 승계 여부 팝업 (게스트, 대기실/게임 중 공통). 후계자만 이어받기, 유예/응답 대기 중 호스트 복귀 시 자동 닫힘
│       ├── BottomSheet.tsx     # 모바일용 드래그 바텀 시트 (반응형)
│       ├── HelpOverlay.tsx     # 인게임 규칙/도움말 오버레이 (헤더 ? 버튼 → 현재 단계 강조 + 10단계 흐름·특수행동 7종·맵 특수룰·승점 공식). 콘텐츠는 PHASE_INFO/ACTION_INFO/MapProfile.specialRules 재활용, ConfirmDialog 패턴+ESC 닫기. 특수행동은 맵별 보정 — `MapProfile.actionDescription`이 있으면 그 설명으로 대체("이 맵 변경" 배지), `disabledActions`면 취소선+"사용 불가"(예: 독일 Engineer, St.Lucia Production/Turn Order). 순수 로컬 UI(스토어 읽기 전용) — 스냅샷/intents 무관
│       └── CollapsiblePanel.tsx    # 태블릿용 접이식 사이드 패널 (반응형)
│
├── net/                        # 온라인 멀티 (Supabase Realtime + 호스트 권위) — gameStore와 단방향(net→store)
│   ├── types.ts                # 전송 계층 인터페이스 (RoomInfo·IntentMessage·SnapshotMessage·NetTransport)
│   ├── supabaseTransport.ts    # Supabase 구현 (채널·rooms 테이블·presence·하트비트·방 폐쇄). room 브로드캐스트 수신 시 conn.room 캐시를 syncRoom으로 갱신(안 하면 입장 시점 status에 박제 → 승계 오작동)
│   ├── snapshotCodec.ts        # 게임 상태 gzip+base64 인코딩 (ui/aiExecution 제외, movingCube 승격)
│   ├── intents.ts              # 커밋 액션 카탈로그(INTENT_SPECS)+게스트 몽키패치 가드+호스트 검증
│   ├── netStore.ts             # 세션 오케스트레이션 (호스트 루프·스냅샷 적용·재연결·승계·좌석)
│   ├── roomLogic.ts            # 좌석 배정·호스트 승계 순수 규칙 (단위 테스트 대상)
│   ├── index.ts                # 엔트리 (getTransport·getClientId·isNetConfigured)
│   └── __tests__/              # 코덱/가드/검증/좌석·승계 규칙 30개
│
├── hooks/                      # 반응형 UI 커스텀 훅
│   ├── useMediaQuery.ts        # 미디어 쿼리 브레이크포인트 감지
│   ├── useOrientation.ts       # 가로/세로 방향 감지
│   ├── useTouchGestures.ts     # 터치 제스처 (핀치 줌, 팬)
│   └── useMyPlayerId.ts        # 내 좌석 플레이어 판정 (offline=null, online=activePlayers[mySeat]) + isMyPlayer 헬퍼 — 왕관 표시용, PhasePanel 좌석 매핑과 동일
│
├── store/                      # 상태 관리 (2026-07-03 slice 분리 — 전부 "코드 그대로 이동", 로직 무변경)
│   ├── gameStore.ts            # 오케스트레이션 허브 (1,480줄): GameStore 인터페이스(계약)·initGame/resetGame·
│   │                           #   executeAITurn·issueShare·selectAction·nextPhase/endTurn·undoLastAction·
│   │                           #   placeNewCity·addLog·persist 설정 + slice 합성(...createXxxSlice(set, get))
│   ├── toastStore.ts           # 화면 상단 토스트(별도 zustand — gameStore와 분리, 스냅샷 미동기화 = 로컬 UI)
│   ├── gameSettingsStore.ts    # 게임 개인 설정(별도 zustand, localStorage) — 운송 가이드(기본 on)/운송 확인 창(기본 on)/효과음(기본 on)/좌표(세션). 방 설정 GameState.moveGuideAllowed=false면 가이드는 개인 설정 무관 강제 off(잠김)
│   ├── helpers/                # 모듈 레벨 헬퍼 (set/get 클로저 밖 순수 함수)
│   │   ├── undo.ts             # 실행 취소 스냅샷 스택(undoSnapshots 싱글턴)·captureUndo·getUndoLabel
│   │   ├── boardRules.ts       # crossesBlockedEdge·findMissingTownSpurs·releaseUnextendedTrack·removeIncompleteNewTracks·hasIncompleteNewTracks
│   │   ├── buildReason.ts      # getBuildBlockReason (건설 실패 사유 한 줄 — canBuildTrack 미러, 토스트용)
│   │   ├── setup.ts            # createInitialGameState·drawBalancedCubes·TUTORIAL_GAME_CONFIG·AIPlayerConfig
│   │   ├── transcontinental.ts # computeTranscontinental (Western US 대륙횡단 감지)
│   │   ├── aiScheduler.ts      # AI 실행 락·컨텍스트 검증·scheduleAICheck (150ms debounce)
│   │   └── governmentBuildAI.ts # Montréal 봇: 정부 링크 자동 건설 + Repopulation 배치 휴리스틱
│   ├── slices/                 # 도메인별 액션 구현 (인터페이스 정의는 gameStore에 유지, Pick으로 참조)
│   │   ├── uiSlice.ts          # UI 선택/건설 플로우 24액션 (selectHex·selectCube·건설 상태기계·도시화 모드·큐브 애니)
│   │   ├── auctionSlice.ts     # 경매 5액션 (placeBid·passBid·skipBid·resolveAuction·respondTurnOrderOffer)
│   │   ├── buildSlice.ts       # Phase IV 건설 10액션 (buildTrack·복합·마을 가닥·직결·redirectTrack·대륙횡단 적용)
│   │   ├── moveSlice.ts        # Phase V 이동 4액션 (moveGoods·upgradeEngine·moveTrackCube·completeCubeMove)
│   │   ├── settlementSlice.ts  # Phase VI-VIII 정산 3액션 (collectIncome·payExpenses·applyIncomeReduction)
│   │   └── goodsGrowthSlice.ts # Phase IX 물품 성장 + 생산 6액션 (growGoods·Production 5종)
│   └── __tests__/
│       ├── payExpenses.test.ts # 비용 지불/파산 로직 테스트
│       └── trackBuilding.test.ts   # 트랙 건설 메커니즘 store 레벨 테스트 (방향 전환, 교차/공존, UI 플로우)
│
├── types/
│   └── game.ts                 # 전역 타입 (PlayerId, GamePhase, BoardState 등)
│
└── utils/                      # 핵심 비즈니스 로직 유틸리티
    ├── gameLogic.ts            # 게임 엔진 규칙 (수입 계산, 물품 이동)
    ├── hexGrid.ts              # 헥스 그리드 기하학 (Axial/Offset, A*, BFS, 트랙 큐브 배달 탐색)
    ├── trackValidation.ts      # 트랙 건설 및 연결성 검증
    ├── tutorialMap.ts          # 튜토리얼 맵 데이터 정의 (좌표 0-base)
    ├── stLuciaMap.ts           # St. Lucia 맵 데이터 정의 (2인 전용, 헥스큐브, 좌표 0-base)
    ├── rustBeltMap.ts          # Rust Belt 맵 데이터 정의 (4~5인·디폴트 4인, flat-top 전치, 좌표 0-base)
    ├── germanyMap.ts           # Germany 맵 데이터 정의 (5~6인·디폴트 5인, flat-top 전치, 터미널/고정비용/직결)
    ├── westernUsMap.ts         # Western US 맵 데이터 정의 (5~6인·디폴트 5인, pointy-top 네이티브, 마을큐브/지형fixedCost/동서region)
    ├── southernUsMap.ts        # Southern US 맵 데이터 정의 (6인 전용, flat-top 전치, 면화/4대 항구/애팔래치아)
    ├── koreaMap.ts             # Korea 맵 데이터 정의 (4인 전용, flat-top 전치, 동적색 플래그/산fixedCost/수원 직결)
    ├── montrealMap.ts          # Montréal Métro 맵 데이터 정의 (3인 전용 9턴, flat-top 전치, 언덕$3/도로$4/물$6·Parc 밀봉)
    ├── moonMap.ts              # Moon(달) 맵 데이터 정의 (4인 전용 8턴, flat-top 전치, 크레이터$3/산$4, 랩 어라운드 37쌍)
    ├── southernChinaMap.ts     # Southern China 맵 데이터 정의 (4~5인·디폴트 4인, pointy-top 네이티브, 추가비용 헥스/인터어반·페리)
    ├── mapRegistry.ts          # 맵 룰 분리 레지스트리 (MapRuleConfig·columnMapping·boardDisplayScale 등)
    ├── debugConfig.ts          # 디버그 설정 (로그 카테고리 토글 + logAction 종합 액션 로깅)
    ├── pwaUtils.ts             # Service Worker 등록/관리 유틸리티
    ├── safeTimers.ts           # Web Worker 기반 타이머 (백그라운드 탭 스로틀 회피, Worker 불가 시 setTimeout 폴백)
    ├── sfx.ts                  # 게임 액션 효과음 (Web Audio 합성, 파일/라이브러리 0개) — SFX_CATALOG 16종 레시피
    │                           #   + playSfx(터보 무음·설정 게이트·150ms 스로틀·오디오 미지원 무해화). 미리듣기 = /sfx 숨은 라우트.
    │                           #   화물 이동은 도착 정산 income만(출발음은 이중이라 제거 — 사용자 피드백).
    │                           #   ⚠️ 이벤트 관측 재생은 참조 비교 금지(게스트 스냅샷 재적용마다 객체가 새로 생겨 반복 재생)
    │                           #   — key 필드나 내용 키로 비교(GoodsGrowthPanel growthKey 참조).
    │                           #   봇/원격의 store 액션 소리(경매·주식)는 호스트만 들림(관측 기반인 건설/수입/신도시/성장은 전원).
    └── testHelpers.ts          # 단위 테스트 헬퍼 함수

public/
├── manifest.json               # PWA 매니페스트
├── sw.js                       # Service Worker (오프라인 캐시)
├── icons/                      # PWA 아이콘
└── maps/                       # 맵 이미지

docs/
├── ai-system.md                # AI 시스템 상세 (의사결정 알고리즘·Phase별 결정·맵별 구현/밸런싱 이력·디버깅)
├── hex-geometry.md             # 헥스 그리드 기하 (엣지 번호·odd-r 이웃 공식·0-base 좌표)
├── ai-auction-baseline-100seed.md  # ★ AI 다인 맵 성능 베이스라인(100시드) — 로직 변경 시 비교 기준(VP·파산·선공/승자 분포)
├── online-multiplayer-plan.md  # 온라인 멀티 종합 설계·비용·Phase 체크리스트
├── issue-log.md                # ★ 버그·이슈 수정 이력 (CLAUDE.md는 현재 동작만, 수정 이력은 여기)
└── presentation-script.md      # 프레젠테이션 스크립트
```

## 주요 컴포넌트

### Navigation
- 스티키 헤더 (66px, 크림 블러 + 하단 보더), 로고 마크(`LogoMark` export — Footer 공용)
- 데스크톱: 5개 한글 메뉴 + 버밀리언 "플레이" CTA(/maps), Framer Motion layoutId 활성 언더라인
- 모바일: 42px 햄버거 → 접이식 메뉴 (border-left 리스트)

### HeroSection (랜딩)
- 도트 그리드 배경(.hex-pattern) + 우상단 버밀리언 라디얼 틴트(bg-hero-gradient)
- MARTIN WALLACE · 2002 배지, 초대형 Space Grotesk 타이틀("Steam"만 버밀리언)
- 하단 스탯 바 (1–6 플레이어 / 120분 / 7 맵 / 2002, border-left 구분)

### FeatureCards / EditorialSection / CtaBand (랜딩)
- FeatureCards: "01 / 핵심 경험" — 페이퍼 카드 4개 (선로 건설/상품 배송/주식과 자금/턴 순서 경매)
- EditorialSection: "왜 명작인가" 밴드(#efeae1) + 상품 배송 원리 SVG(점선 레일 .rail-dash 애니메이션)
- CtaBand: 버밀리언 라운드 밴드 → 계산기 유도
- (구 GameBoardPreview 인터랙티브 헥스 프리뷰는 리뉴얼에서 제거 — backup/design-dark-gold에 있음)

### GameplayPage
- 9단계 턴 타임라인 아코디언 — 각 단계 클릭 시 SMIL SVG 애니메이션 다이어그램 카드
  (주식 발행 → 상품 생산, 디자인 원본 포트. 룰북 10단계 중 '턴 마커 전진'은 생략된 디자인)
- 하단 "기억해야 할 세 가지 톱니" 코어 메커닉 3카드

### ActionsPage
- 7개 특수 액션 페이퍼 카드 (lucide 아이콘 + 영문 병기 + TIP 푸터), 3열 그리드

### CalculatorPage
스테퍼(±버튼) 기반 3카드 계산기 — 전부 룰북 공식:
1. **선로 건설 비용**: 평지 $2 / 강 $3 / 산 $4 / 복합 추가비 / 마을($1+트랙당 $1)
2. **현금 흐름**: 소득 − (주식+기관차) = 순이익, 음수면 파산 경고
3. **예상 점수**: 소득×3 + 완성 링크 트랙 구간×1 − 주식×3

### MapsPage
페이퍼 카드 그리드 (3열). 카드 = 맵 이미지(16:10) + 난이도 배지(입문/표준/중급/고급) +
설명 + 플레이 버튼(`/game/<slug>/`). 튜토리얼 포함 11개 맵, Barbados만 "준비 중".

**맵 이미지는 WebP** (`public/maps/*.webp`, 폭 1600·q84, 맵당 ~200KB). 새 맵 추가 시 원본을
`cwebp -q 84`(필요 시 폭 1600 다운스케일)로 변환해 넣을 것 — `unoptimized: true`(static export)라
Next가 압축을 안 하므로 원본 대용량 PNG를 그대로 받으면 갤러리가 무거워진다 (PNG 기준 맵당 1~5MB).
게임 보드는 SVG 렌더라 이 이미지와 무관(갤러리 표시용일 뿐).

10개 맵 갤러리 (다인원 지원 맵은 `supportedPlayers[0]`=디폴트 인원, 인원별 턴 수는 맵 데이터
`turnsByPlayers`(룰북 턴 트랙 3인10/4인8/5인7/6인6)를 setup·게임 셋업 UI가 조회 — 고정 인원 맵은 미지정=maxTurns 항등):
- **Rust Belt** (기본) - 미국 북동부, 4~5인(디폴트 4인 8턴/5인 7턴)
- **Korea** (플레이 가능) - 한반도, 동적 도시 색상, 4인 8턴 (도시 수요색=현재 큐브색·수원 직결 링크·신도시 회색)
- **Western U.S.** (플레이 가능) - 대륙횡단 철도, 5~6인(디폴트 5인 7턴/6인 6턴) (마을 큐브·동서 배달 보너스·대륙횡단 연결 보너스)
- **Southern U.S.** (플레이 가능) - 면화 운송, 6인 6턴 (마을 면화→4대 항구 배달·Atlanta 호황·4턴 남북전쟁 수입감소 2배)
- **Germany** (플레이 가능) - 외국 터미널·헥스 고정비용·도시 직결, 5~6인(디폴트 5인 7턴/6인 6턴)
- **Montréal Métro** (플레이 가능) - 몬트리올 지하철, 3인 9턴 (정부 링크·마스터 네트워크·DGEL·Repopulation)
- **The Moon** (플레이 가능) - 달 표면, 4인 8턴 (밤낮 교대·랩 어라운드·Moon Base 네트워크·건설 2개 제한·저중력)
- **Southern China** (플레이 가능) - 홍콩·주강 삼각주, 4~5인(디폴트 4인 8턴/5인 7턴) (디스크 4개+국유화·지지 토큰·Gain Support·HK 전색 수용/마지막 2턴 폐쇄·인터어반/페리)
- **Barbados** - 솔로 게임
- **St. Lucia** - 2인 전용

## 온라인 멀티플레이 (`src/net/`, 2026-07-04)

Supabase Realtime + **호스트 권위** 동기화. 종합 설계·비용·조정 내역은
[`docs/online-multiplayer-plan.md`](docs/online-multiplayer-plan.md) 참조. Phase 0~5 완료:
방 코드 초대·재접속(F5 자동 재입장/호스트 승계 팝업)·게임 중 채팅·공개방 목록·빠른 매칭.

- **구조**: 방장 클라이언트만 gameStore를 진짜로 실행(랜덤·AI 포함). 게스트는 intent만 보내고
  호스트가 기존 액션으로 검증·실행 후 압축 스냅샷(persist 포맷, logs 30개·ui 제외, gzip+base64)을
  브로드캐스트 + rooms 테이블에 저장(재접속·승계용). **gameStore는 net을 모른다** — 의존은
  net → store 단방향 (자체 서버로 갈아탈 땐 net만 교체).
- **파일**: `types.ts`(인터페이스) `supabaseTransport.ts`(채널·rooms·presence)
  `snapshotCodec.ts` `intents.ts`(커밋 액션 카탈로그+게스트 몽키패치 가드+호스트 검증)
  `netStore.ts`(세션 오케스트레이션) `roomLogic.ts`(좌석 배정·승계 순수 규칙).
  UI: `OnlineLobby.tsx`(로비/대기실) `GameChat.tsx`·`ChatSenderIcon.tsx`(채팅) `HostTakeoverDialog.tsx`(승계 팝업), GamePageClient 통합.
- **호스트 승계(팝업 방식)**: 호스트가 presence에서 사라지면 6초 유예(플랩 오탐 방지) 후, 게스트에게
  `netStore.hostTakeoverPrompt`로 승계 여부를 **물어본다**(자동 승계 아님). 결정론적 후계자
  (`pickHostSuccessor`, 접속 중 최소 좌석)만 "이어받기" 버튼, 비후계자는 대기 안내 + 나가기.
  유예 중이든 팝업 표시 후든 **호스트 복귀 시 팝업 자동 닫힘(계속 진행)**. 대기실/게임 중 공통.
  - **게임 중 승계**(`promoteToHost`, wasPlaying): 끊긴 옛 호스트를 곧바로 봇으로 전환(게임 상태
    `isAI`=true + 좌석 `kind:'ai'`)해 그 자리를 기다리지 않고 게임을 잇는다. `startHostLoop` 뒤에
    `isAI`를 바꿔야 구독이 스냅샷을 내보낸다.
  - **대기실 승계**: 옛 호스트 좌석을 비워(clientId=null, 기차-N) 새 참가 대기로 둔다.
  - **거절/강퇴 → 셋업 복귀**: `declineHostTakeover`·강퇴 감지는 `leaveRoom`을 직접 호출하므로
    (UI `handleLeaveRoom`과 달리 showSetup 리셋 없음), GamePageClient가 `isOnline` false 전환을
    감지해 셋업(온라인 탭)으로 되돌린다(`wasOnlineRef`). 안 하면 stale 오프라인 보드에 갇힘.
  - **강퇴**: 호스트가 대기실에서 게스트 좌석을 비우면(updateSeats), 게스트는 `onRoom`에서
    "착석→해제"를 감지해 방을 나가고 "방장이 내보냈습니다" 안내.
  - **⚠️ 스테일 방지**: 승계가 `conn.room.status`를 브로드캐스트하므로, 전송 계층은 room 수신 시
    `syncRoom`으로 캐시를 갱신해야 한다(대기실 입장→게임 시작 후 승계가 대기실로 튕기던 버그 수정).
- **낙관적 반영(optimistic)**: 게스트 자기 액션은 즉시 로컬 실행(체감 지연 0) + intent 전송,
  호스트 스냅샷이 도착하면 통째로 덮어 확정/교정(거부 시 호스트가 정본 강제 재전송). 로컬 검증이
  false면 전송 생략. `INTENT_SPECS`의 `optimistic` 플래그 — 이동 애니메이션이 얽힌 커밋은 제외.
- **⚠️ 넷·게임 진행·이동 정산 타이머는 전부 `src/utils/safeTimers.ts`(safeTimeout/safeInterval)**:
  크롬은 숨김 탭의 setTimeout을 최소 1초로 스로틀 → 봇 진행·스냅샷 전송이 느려지거나 멈춘다. Web
  Worker 타이머라 스로틀 없음(vitest/SSR은 setTimeout 폴백). 봇 행동 간격 ≈1.5초(scheduleAICheck
  debounce 150 + `AI_TURN_DELAY` 1350). 새 타이머 추가 시 raw setTimeout 쓰지 말 것.
- **마지막 플레이어 확인 딜레이**(`AI_ACTION_VIEW_DELAY` 1200, gameStore + 스냅샷 `PHASE_CHANGE_HOLD`
  1200, netStore): 봇/사람이 **단계의 마지막 플레이어** 행동으로 넘어갈 때만 결과를 잠시 보여준 뒤
  진행(중간 봇은 즉시). 스냅샷 쪽 홀드로 게스트도 동일하게 본다.
- **게스트 이동 애니메이션 동기화**(`netMovingCube`, snapshotCodec): `ui.movingCube`를 스냅샷에
  승격해 게스트도 호스트와 같은 화물 이동 애니메이션을 본다. 정산(completeCubeMove)은 호스트 타이머
  전용(게스트는 guestNoop). 이동 시작 스냅샷 도착 시 게스트 로컬 안내(골드 점선/선택/목적지)도 정리.
- **버튼 조작 권한(UI 게이팅)**: "아무나 눌러도 넘어가는" 혼란을 없애려 화면 버튼을 두 부류로 나눈다.
  ① **공통 진행/정산 단계**(수입·비용·수입감소·물품성장·턴마커)의 '진행'/'주사위'는 **방장(offline·host)만**
  — 게스트는 대기 안내(`PhasePanel` `amIHost`, `GoodsGrowthPanel`은 게스트 early-return). ② **개인 결정 단계**
  (주식·행동선택·건설·이동·경매 입찰)는 **차례 플레이어 좌석만** 버튼 표시(`PhasePanel` `isMyTurn` /
  `AuctionPanel` `isMyBid`, 아니면 관전 안내). 좌석 판정은 `netStore.mode`/`mySeat`→`activePlayers[mySeat]`
  (undo 게이팅과 동일 매핑), **오프라인은 `myPlayerId=null`이라 항상 true → 동작 무변경**. 호스트 권위
  검증(차례/거부)은 그대로라 이건 **혼란 방지용 표시 계층**일 뿐 — 안 걸어도 게임은 정상이나 비차례
  게스트가 눌러 optimistic 반영 후 호스트가 거부·되돌리는 깜빡임이 생긴다.
- **게스트 취소(undo)는 호스트 왕복 + 팬텀 방지**: `undoLastAction`은 게스트에선 intent만 보내고
  실제 되돌리기는 호스트 스냅샷이 와야 반영된다(로컬 즉시 반영 아님). `PhasePanel`이 '취소 중…' 대기
  표시 → 스냅샷으로 `undoCount` 바뀌면 해제, 3.5초 미반영 시 '다시 취소' 안내. ⚠️ `undoCount`는
  persist/스냅샷 동기화 **상태**지만 취소 스택(`undoSnapshots`)은 호스트 메모리 모듈 싱글턴이라, 전체
  재로드(F5·모바일 탭 복원 등)·호스트 승계 시 스택은 비고 count만 남아 **팬텀 취소**(눌러도 안 되돌아감)가
  된다 → persist `merge`·`promoteToHost`에서 `undoCount:0` 리셋(reconnect-as-host는 원래부터 리셋).
- **정산 단계 "플레이 중" HUD 억제**: 정산 단계(수입·비용·수입감소·턴마커)는 방장이 '진행'으로 넘기는데,
  보드 HUD가 `currentPlayer`(=playerOrder[0], 게스트일 수 있음)를 "○○ 플레이 중"으로 띄우면 방장은
  "남 차례네"로 오해해 서로 대기하는 착시가 난다. `GameBoard`는 **사람 currentPlayer인 정산 단계에선
  HUD를 숨긴다**(봇이면 자동 진행 표시로 유지). `HUD_SUPPRESSED_PHASES` 가드.
- **물품성장 결과 게스트 동기화**(`goodsGrowthEvent`): 방장이 굴린 주사위와 도시별 추가 큐브를
  `growGoods`가 `GameState.goodsGrowthEvent`로 남겨 스냅샷 동기화 → 게스트도 `GoodsGrowthPanel`에서
  동일하게 본다. `goodsGrowth` 진입(`nextPhase`) 시 null 리셋(직전 턴 stale 방지).
- **⚠️ 새 커밋 액션 추가 시**: gameStore에 게임 상태를 바꾸는 액션을 추가하면
  `intents.ts`의 `INTENT_SPECS`에도 등록해야 온라인에서 동작한다 (게스트가 로컬 실행해버려
  디싱크). 커밋이 로컬 ui 선택값을 읽으면 `captureUi`에 그 필드를 지정 — **can계열 검증이
  읽는 ui 필드까지 전부**(예: placeNewCity는 selectedNewCityTile뿐 아니라 canPlaceNewCity가
  요구하는 urbanizationMode까지). 호스트는 주입한 ui 키를 실행 후 원값으로 **복원**한다.
  AI가 호스트에서만 돌아야 하는 자동 진행 액션(`executeAITurn`·`runAIAutoPhase`)은
  `guestNoop: true`로 등록 — 안 하면 게스트가 봇 로직을 로컬 실행해 intent 스팸·디싱크.
- **함정 기록**: ① 경매 입찰 차례는 `currentPlayer`가 진실 — `auction.currentBidder`는 갱신
  안 되는 레거시 필드(검증에 쓰면 정상 입찰 거부). ② intent는 멱등성 id로 중복 실행 차단(채널
  재조인 재전송 대비). ③ clientId는 sessionStorage(탭별) — F5 좌석 자동 복원 + 한 PC 두 탭 가능.
  ④ 수송 정산은 호스트 GameBoard의 1000ms `safeTimeout`(completeCubeMove) — 게스트에선 guestNoop.
  ⑤ 호스트 승계 직후(6초 경계) 옛 호스트 복귀 = 이중 호스트 경합 → `onRoom`에서 방 메타의
  hostClientId가 내가 아니면 게스트로 강등. ⑥ 채널 구독이 SUBSCRIBED도 에러도 못 받으면 입장이
  무한 대기 → 15초 타임아웃으로 방지.
- **채팅**(`GameChat.tsx`): 게임 보드 우측 하단 sticky 호버링, 닫혀 있을 때 새 메시지 도착 시
  Web Audio "딩동" 알림음(외부 파일 없음). 목록 스크롤은 컨테이너 내부만(scrollIntoView는 페이지
  전체를 끌어당겨 금지 — 로비 채팅도 동일).
- **왜 호스트 권위인가**: 전원이 각자 계산하면 조금만 달라져도 디싱크 → 호스트만 계산하고
  결과를 스냅샷으로 전파해 원천 차단. **랜덤 시드화도 불필요**(랜덤·AI가 호스트에서만 실행).
  Supabase는 게임 규칙을 모르고 메시지 전달·스냅샷 저장·채팅·방 목록만 한다.
- **스냅샷 세부**: persist 포맷 재사용하되 **logs 최근 30개만 + gzip 압축**(egress·256KB 한도 대비,
  압축 후 ~2KB). **rev(단조 증가)** 로 역순 도착 무시. 게스트 적용 시 persist `merge`의 1회성 상태
  초기화(transcontinentalEvent·incomeReductions·aiExecution)를 재사용해 "옛 모달/배지 부활" 방지.
  ⚠️ **로그는 두 종류**: `state.logs`(인게임 로그, persist 누적·스냅샷 30개 전파)와 `logAction`
  (:3999 콘솔 전용, 저장·전파 안 함)는 별개다. 전체 History·리플레이 저장은 미구현(스냅샷은 최신
  1건만 rooms에 덮음). 상태 동기화 모델(Snapshot/로그/Undo) 종합은
  [`docs/online-multiplayer-plan.md` §8](docs/online-multiplayer-plan.md) 참조.
- **비용/티어**: 친구 규모(동시 수 판 이하)는 **$0**. Free 티어 동시접속 200·메시지 200만/월·
  egress 5GB. 유일한 불편은 **1주 미접속 시 프로젝트 자동 정지**(대시보드에서 수동 재개) — 공개
  서비스로 키우면 Pro $25/월.
- **보안**: 브라우저에 들어가는 건 URL + anon(publishable) key뿐(공개 전제 키). **Service Role
  Key는 절대 클라이언트/저장소에 넣지 않는다**(RLS 우회 관리자 키). anon만 쓰면 모든 클라이언트가
  Supabase 입장에서 동일 익명 사용자라 "참가자/호스트 구분" RLS는 불가 → 시작은 허용형 RLS(방
  코드를 아는 사람만 찾는 모델, 친구 규모 수용). 강화는 익명 로그인 도입 시(후순위).
- **알려진 한계(설계상 수용)**: ① 치팅 방어 없음(호스트가 클라이언트 — 친구용) — 필요 시 net만
  자체 서버로 교체해 서버 권위 승격. ② 게스트로 온라인 플레이 시 로컬 싱글 저장(persist)이 스냅샷에
  덮임. ③ 공개방 인원 수는 presence 미반영(나간 좌석도 착석 집계 가능).
- **배포**: `.env.local`(로컬) / deploy.yml env(배포)에 NEXT_PUBLIC_SUPABASE_URL·ANON_KEY.
  미설정 배포(포크)는 온라인 탭이 자동으로 숨음(`isNetConfigured`). DB 스키마·RLS·grant는
  `supabase/setup.sql`(Supabase MCP `apply_migration`으로 적용). 공개방 목록은 8초 폴링(+수동
  새로고침), 대기실 45초 하트비트(touchRoom)로 유령 방 필터(updated_at 2분).
- **방 자동 정리(pg_cron)**: `setup.sql`이 `cleanup_stale_rooms()`(security definer + search_path
  고정) + pg_cron 스케줄을 등록 — `updated_at`(스냅샷 저장·하트비트마다 갱신 = 마지막 활동)이
  6시간 지난 waiting/playing/finished 방을 하루 2회(UTC 05:00·17:00 = KST 14:00·02:00) 자동 삭제.
  활성 게임은 최신이라 대상 아님. 접속자 없어도 서버에서 돎(수동 SQL 정리 불필요).
- **검증**: `npx vitest run src/net/__tests__/` (코덱/가드/검증/좌석·승계 규칙 30개) +
  두 브라우저 탭 E2E(방 생성→입장→시작→건설/수송/경매/도시화 왕복→F5 재접속→호스트 승계).
- **종합 설계·비용·Phase 체크리스트**: [`docs/online-multiplayer-plan.md`](docs/online-multiplayer-plan.md),
  **과거 이슈 수정 이력**: [`docs/issue-log.md`](docs/issue-log.md).

## 반응형 UI & PWA

### 반응형 UI
- `src/hooks/useMediaQuery.ts`로 브레이크포인트 감지 (모바일/태블릿/데스크톱 분기)
- `src/hooks/useOrientation.ts`로 가로/세로 방향 감지
- `src/hooks/useTouchGestures.ts`로 게임보드 핀치 줌/팬 제스처 지원
- 모바일: `BottomSheet` (드래그 가능한 바텀 시트)로 게임 컨트롤 표시
- 태블릿: `CollapsiblePanel` (접이식 사이드 패널)로 패널 표시

### PWA
- `public/manifest.json` + `public/sw.js` (Service Worker, 오프라인 캐시)
- `src/utils/pwaUtils.ts`: SW 등록/해제/업데이트 유틸리티
- `src/app/service-worker-registration.tsx`: 루트 레이아웃에서 SW 등록
- `src/components/OfflineIndicator.tsx`: 오프라인/동기화 상태 표시
- GitHub Pages 배포를 위해 manifest와 SW 경로에 basePath(`/aos-showcase`) 적용됨

## 플레이어블 게임 (`/game`)

2인 튜토리얼 게임을 플레이할 수 있는 인터랙티브 게임 페이지입니다.

### 게임 단계 (10 Phases)
1. **Issue Shares** - 주식 발행 ($5/주)
2. **Determine Player Order** - 경매로 플레이어 순서 결정
3. **Select Actions** - 7가지 특수 행동 중 선택
4. **Build Track** - 트랙 건설 (최대 3개, Engineer 선택 시 4개)
5. **Move Goods** - 물품 이동 (2라운드)
6. **Collect Income** - 수입 수집
7. **Pay Expenses** - 비용 지불 (주식 + 엔진 레벨)
8. **Income Reduction** - 수입 감소
9. **Goods Growth** - 물품 성장 (주사위)
10. **Advance Turn Marker** - 턴 마커 전진

### 주요 게임 로직

**첫 턴 플레이어 순서 (실제 게임 = 무작위, 시뮬 = 고정)**
- 룰북은 첫 플레이어를 주사위로 정한다. 실제 게임 진입점(오프라인 `initGame`·온라인 호스트
  `startOnlineGame`·`resetGame`)은 `createInitialGameState(..., { randomizeStartOrder: true })`로
  **좌석(`activePlayers`)은 유지하고 `playerOrder`만 Fisher-Yates 셔플**한다. 2턴부터는 경매(Phase II).
- ⚠️ **시뮬레이션/단위 테스트는 옵션 미전달 → player-index 고정 순서 유지**. 순서를 섞으면 player별
  편향(AI 100시드 베이스라인)을 측정할 수 없으므로 랜덤화는 실제 게임 진입점에서만 켠다. 좌석은 불변이라
  온라인 `mySeat` 매핑·호스트 스냅샷 전파에 안전. 교대 선공권 맵(St. Lucia)은 기존 첫 두 명 스왑 유지.

**수입 계산 (링크 기반)**
- 물품이 지나가는 각 철도 링크(도시/마을 → 도시/마을)마다 해당 링크 소유자 수입 +1
- 트랙 타일 수가 아닌 링크 수로 계산

**경매 시스템**
- `placeBid()`: 입찰
- `passBid()`: 포기 (탈락)
- `skipBid()`: Turn Order 패스 (탈락 없이 다음 입찰자로)
- `lastActedPlayer`: 마지막 행동 플레이어 추적

**7가지 특수 행동 (+ 맵 전용 추가 행동)**
- First Move, First Build, Engineer, Locomotive, Urbanization, Production, Turn Order
- 맵 전용 추가 행동은 `MapProfile.extraActions`로 선언 — 행동 그리드·AI 후보·도움말이 `actionsForMap(mapId)`(기본 7 + extra)를 순회한다 (Moon: Low Gravitation 8번째). `SpecialAction` 유니온에 값을 추가할 땐 `ACTION_INFO`·`ACTION_SHORT`·`ACTION_ICONS`(Record 3종)와 AI `allActions`/`TIE_BREAK_ORDER`/`evaluateActionDeltaVP` switch도 함께 채울 것.

**Turn Order 특수행동 (효과는 "다음 턴" 경매)**
- 다른 행동과 달리 phase III에서 고른 turnOrder의 효과는 **다음 턴** phase II(경매)의 무탈락 패스 1회다.
  `selectedAction`은 턴 롤오버 때 지워지므로 그대로 판정하면 표준 맵에선 패스가 절대 안 뜬다 → `resetPlayerActions`가
  롤오버 시 "직전 턴에 turnOrder를 골랐는지"를 `PlayerState.turnOrderPassAvailable`로 넘겨받아 다음 턴
  경매에서 판정한다(사람 `AuctionPanel` `canUseTurnOrderPass` · AI `strategies/auction.ts` 공통).
- 패스 사용 플래그(`turnOrderPassUsed`) 세팅은 **`skipBid` 액션 내부에서 중앙 처리**(+권한 가드) — AI·테스트도
  `skipBid`를 직접 호출하므로 외부(패널/호스트 intent)에서만 세우면 봇이 매 라운드 무한 스킵한다. 롤오버 때
  `turnOrderPassUsed`도 리셋. St.Lucia(교대 선공권)는 경매/skipBid를 안 써 turnOrderPassAvailable이 무해.
- **패스 ≠ 포기 (2026-07-25 룰북 정합)**: 패스는 `droppedOutPlayers`(포기 전용)에 안 들어가고 경매에 남는다.
  종료 판정·차례 진행은 `advanceAuctionTurn`(auctionSlice) **한 곳** — 미포기 1명 남을 때까지 계속, 차례는
  순서대로 예외 없이(최고입찰자 건너뛰기·자동 통과·액션별 종료 휴리스틱 금지). 최고입찰자도 자기 차례에
  입찰(자기 최고가 위로) or 포기를 직접 선택하므로 **승자 = 미포기 유일 잔존자**(highestBidder로 단정 금지 —
  resolveAuction·AuctionPanel·TurnTrack 공통). 승자는 자기 입찰액 전액 지불(무입찰 승자 $0). 회귀:
  `src/store/__tests__/auctionTurnOrderPass.test.ts` 9종. 이력: [docs/issue-log.md](docs/issue-log.md).

**엔진 업그레이드 (수송 단계, 턴당 1회 — 룰북)**
- 룰: Move Goods는 2라운드. **두 번의 수송(물품 이동) 기회 중 1번**을 물품 이동 대신 엔진 트랙 1칸
  업그레이드에 쓸 수 있다 (Locomotive 행동과는 별개 — 그건 행동 선택 단계의 즉시 +1).
- 구현: `phaseState.engineUpgradedThisTurn`(Record<PlayerId, boolean>)으로 **2라운드를 통틀어 1회만**
  보장. `playerMoves`(라운드별 이동)는 라운드2 전환 시 리셋되므로, 그것만 보면 라운드1·2 둘 다
  엔진업되는 버그가 났다 → 별도 턴 단위 플래그 필요. `upgradeEngine`이 이 플래그를 체크·설정하고,
  라운드2 전환 땐 **유지**(턴당 1회 보장), 새 Move Goods 단계 진입·새 턴엔 **리셋**.
- AI도 동일: `moveGoods.ts`의 `evaluateEngineUpgradeOption`이 이미 엔진업한 턴이면 `-Infinity`를 반환
  (없으면 AI가 라운드2에 또 엔진업을 결정→store가 거부→같은 결정 반복으로 정체).
- ⚠️ persist 주의: 이 필드는 `PhaseState` 필수이나 `upgradeEngine`에서 `?.`(optional)로 읽어 배포 전
  저장본(필드 없음) rehydrate에도 안전. 단 그 저장본의 "진행 중 라운드2"는 1회 재현 가능(다음 턴 정상).

**배달 큐브 주머니 반환 + 생산 기회 보장 (룰북 V·IX)**
- **주머니 반환 (룰북 V)**: 이동 완료 후 큐브는 `completeCubeMove`가 `goodsDisplay.bag`으로 반환
  (일반 배달·마을 큐브·트랙 큐브 모두 `ui.movingCube` → `completeCubeMove` 경로라 이 한 곳). ⚠️ 반환을
  빠뜨리면 주머니가 고갈돼 생산·Berlin 보너스·한국 도시화 보충이 어긋난다.
- **생산(Production)은 주사위 전에 강제 (룰북 IX: 생산 → 주사위)**: goodsGrowth 진입 시 사람(비AI)
  생산 선택자가 **배치 가능**(빈 칸 + 주머니 큐브)하면 `currentPlayer`로 잡아 ProductionPanel(그 사람만)에서
  배치하게 하고, **그가 배치를 끝낼(`productionUsed=true`) 때까지 GoodsGrowthPanel의 주사위·건너뛰기를
  잠근다**(온라인에선 방장이 게스트 생산 전에 굴려 스킵하던 버그). 방어로 `growGoods`도 사람 홀더 미완료면
  no-op. **배치 불가**(만석/빈 주머니)면 진입 시 `productionUsed` **자동 완료**(스킵 아님 — 물리적으로 배치
  불가, 주사위 잠금 교착 방지). 선택자가 없거나 봇이면 잠금 없이 통과. **봇 생산은 growGoods 초입의 applyBotProduction이 자동 배치**(주머니에서 min(2,빈칸,주머니)개 — 달은 낮쪽+Moon Base 연결 열 우선, 2026-07-21 구현. 전 맵 공통 병목 해소로 100시드 VP 전반 상승).
  ⚠️ `ProductionPanel`은 **홀더 본인 좌석에만** 렌더(방장이 게스트 생산 대신 조작 방지). `startProduction`은
  `min(2, 빈칸, 주머니)` 뽑기(빈 칸보다 많이 뽑아 확정 불가하던 스턱 방지).
- 회귀 테스트: `src/store/__tests__/productionAndBagReturn.test.ts` (맵별 진입 currentPlayer·자동완료 분기,
  growGoods 차단/진행, 주머니 반환).
- 이전 버그 이력은 [`docs/issue-log.md`](docs/issue-log.md).

### 게임 상태 관리 (Zustand)

```typescript
// src/store/gameStore.ts
interface GameStore {
  // 게임 상태
  currentTurn: number;
  currentPhase: GamePhase;
  players: Record<PlayerId, PlayerState>;
  board: BoardState;
  auction: AuctionState | null;
  aiExecution: AIExecutionQueue;  // AI 실행 상태 { pending, executionId } (구 isAIThinking 대체)

  // 주요 함수 (구현은 slices/에 분산 — 아래 slice 아키텍처 참조)
  placeBid, passBid, skipBid, resolveAuction,
  selectAction, buildTrack, completeCubeMove,
  nextPhase, resetGame, executeAITurn, ...
}
```

**slice 아키텍처 (2026-07-03, gameStore 4,832 → 1,480줄)**: 액션 **인터페이스는 전부
`GameStore`(gameStore.ts)에 유지**하고, 구현만 도메인별 `slices/` 6파일로 분산한다.
- 패턴: `createXxxSlice(set, get): XxxSlice`에서 `XxxSlice = Pick<GameStore, '액션'...>` —
  반환 타입을 Pick으로 명시하면 액션 파라미터가 contextual typing으로 자동 추론된다.
  gameStore 본문에서 `...createXxxSlice(set, get),`로 합성 (spread가 각 액션의 유일한 제공자).
- **순환 방지**: slice/helpers에서 gameStore는 반드시 `import type { GameStore }` (type-only).
  런타임 값은 helpers(undo·aiScheduler 등)나 utils에서 가져온다.
- **새 액션 추가 시**: ① GameStore 인터페이스에 선언(gameStore.ts), ② 해당 도메인 slice에 구현
  + Pick 목록에 이름 추가. 어느 slice에도 안 맞는 오케스트레이션(단계 전환·라이프사이클)만 gameStore 본문에.
- gameStore 잔류(의도적): 인터페이스·initGame/resetGame·executeAITurn·issueShare·selectAction·
  nextPhase/endTurn·undoLastAction·placeNewCity·addLog·persist. **nextPhase는 분리 금지** —
  모든 단계 전환·persist·AI 스케줄과 얽힌 코어라 허브에 남긴다.
- 검증 이력: 분리는 전부 "코드 그대로 이동"으로, origin/main 대비 본문 기계 비교 62/62 IDENTICAL
  (PR #18). 이동 시 undo 스냅샷 스택(`helpers/undo.ts`의 `undoSnapshots`)은 ES 모듈 싱글턴이라
  slice·gameStore가 같은 인스턴스를 공유한다.

**persist + 1회성 상태 (중요)**: 스토어는 `persist`(localStorage, name `age-of-steam-game`)로
게임을 새로고침 후에도 이어가게 한다. 따라서 **새 게임마다 비워야 하는 1회성/실행 상태는 두 곳을
모두 챙겨야 한다** — ① `createInitialGameState`에 초기값(`initGame`/`resetGame`이 적용), ②
persist `merge` 콜백에서 rehydrate 직후 초기화(새로고침 복원 시 잔존 방지). 현재 대상:
`transcontinentalEvent`(대륙횡단 모달), `incomeReductions`(수입감소 배지), `aiExecution`(pending 박제).
새 transient 필드 추가 시 이 둘을 빠뜨리면 "새로고침하면 옛 모달/배지가 다시 뜸" 버그가 난다.

### AI 시스템 (`src/ai/`)

AI는 객체 지향 아키텍처(`AIPlayer`/`AIPlayerManager`/`AIDebugger`) + **화물 기반 동적 전략**이다.
모든 Phase 결정은 **ΔVP(예상 VP 증분)** 단위로 통일 — VP 공식: `income×3 + 완성 링크 트랙 구간×1 − 발행 주식×3`.

**핵심 모듈**: `strategy/vp.ts`(ΔVP 환산기 — 모든 튜닝 상수 집중) · `strategy/mapConfig.ts`(맵별 AI 오버라이드 테이블) · `strategy/turnPlan.ts`(턴 시작 계획, Phase 간 공유) · `maps/*MapProfile`(맵별 동작 다형성).

**실행 흐름**: `initGame/resetGame → scheduleAICheck → 150ms debounce → executeAITurn → getAIDecision → 1000ms → 결정 실행 → nextPhase → …`. ⚠️ 상태 변경 함수 끝에 `scheduleAICheck(get)`이 없으면 첫 AI 페이즈가 자동 실행되지 않는다. **단위 테스트와 실제 게임은 실행 경로가 다르므로**, 자동 진행 관련 수정은 `executeAITurn` 경로를 쓰는 통합 테스트(fake timers)로 검증할 것.

**봇 자동 단계 진행(`runAIAutoPhase`)**: 봇은 "결정"이 필요한 행동 5단계(`PLAYER_ACTION_PHASES` = issueShares·determinePlayerOrder·selectActions·buildTrack·moveGoods)만 `executeAITurn`으로 진행하고, 결정이 필요 없어 원래 사람이 '진행'/'주사위' 버튼으로 넘기던 **정산·물품성장 단계(`AI_AUTO_ADVANCE_PHASES` = collectIncome·payExpenses·incomeReduction·goodsGrowth·advanceTurn)는 `currentPlayer`가 봇이면 `runAIAutoPhase`로 자동 통과**한다 (`scheduleAICheck`의 두 번째 분기). 정산은 자동 `nextPhase`, goodsGrowth는 **봇이 주사위를 자동으로 굴려**(활성 플레이어 수만큼 1~6) `growGoods` 후 진행. ⚠️ goodsGrowth만은 즉시 넘기지 않고 **성장 결과(주사위/도시별 추가 큐브)를 `AI_ACTION_VIEW_DELAY`(1.2초, VITEST=0)만큼 보여준 뒤 `nextPhase`** — 봇이 순식간에 넘겨 "그냥 넘어감"으로 보이던 문제 보정. 이때 `GoodsGrowthPanel`은 봇 `currentPlayer`면(`currentIsBot`) 사람용 주사위 UI 대신 게스트 관전 뷰(`goodsGrowthEvent` 결과 표시)를 렌더한다. 사람이 `currentPlayer`면 no-op이라 사람 차례 정산은 '진행' 버튼 수동 유지. 온라인에서 끊긴 게스트를 봇 전환했을 때 이 단계들에서 진행 주체가 사라져 교착되던 것을 자동화한 것(오프라인 봇 게임도 동일 적용 — 봇이 경매 1등인 턴의 정산/물품성장이 자동으로 넘어감). ⚠️ **`runAIAutoPhase`는 `executeAITurn`과 함께 `intents.ts`에 `guestNoop`으로 등록** — 게스트에서 돌면 봇 자동화가 로컬 실행돼 디싱크(AI는 호스트에서만).

**항상 지킬 규칙 (함정)**:
- **맵 분기 금지**: `mapId === 'x'` 하드코딩 대신 `MapProfile` override / `mapConfig` 테이블. 새 맵은 프로파일만 추가.
- **A\*는 헥스 단위 — "내 트랙 재사용"을 변까지 보장하지 않는다**: `findOptimalPathAvoidingOpponent`는 내 트랙을 비용 0.1로 우대해 경로에 넣지만, 진입/진출 **변**이 맞는지는 모른다. 마을 우대(`preferTowns`, 3인+ 맵 기본 on)로 경로가 틀어지면 그 변이 실제로는 안 맞아 `tryDirectPathBuild`에서 "엣지 비호환"이 난다. 이때 **회피 재탐색을 시키면 A*가 옆 빈 헥스로 우회로를 만들어 같은 두 정거장을 잇는 병렬 중복 노선**이 깔린다(사용자 스크린샷: Rust Belt Duluth↔Minneapolis 이중 부설). 그래서 막힌 게 **내 트랙**이면 회피 대신 **출발점을 내 네트워크가 닿은 정거장 중 목표에 가장 가까운 곳으로 옮겨** 재탐색한다 — 이미 이어진 구간은 건너뛰고 미연결 지점부터 짓는 것(1회 한정 `sourceMoved`, 목표에 더 가까울 때만). 100시드 Rust Belt VP 44.58→46.42·파산 0.08→0.03. ⚠️ **"그 목표를 포기"로 고치면 안 된다** — 건설 기회까지 잃어 Montréal −3.49·Korea −1.63. 기각 실험(방향 전환·A* 미소유 우대 포함) 상세는 [docs/ai-auction-baseline-100seed.md](docs/ai-auction-baseline-100seed.md) 2026-07-28.
- **다인 맵 측정은 100시드**(최소): 8/20시드는 편차가 커 결론이 뒤집힌다. ⚠️ **100시드도 1 VP 미만의 차이는 판별 못 한다** — VP 표준편차가 20 이상이라 400관측의 표준오차가 ±1.15다. 시뮬 출력의 표준오차를 보고 비교하려는 차이보다 크면 `AOS_SEEDS=300`으로 다시 잴 것. 또 **VP만 보고 판정하지 말 것** — 파산·income은 분산이 작아 방향이 먼저 드러난다(지지 토큰 반납은 VP만 보고 기각했다가 파산 지표로 뒤집혔다, 2026-07-27c). 변경 전/후 비교 기준은 [docs/ai-auction-baseline-100seed.md](docs/ai-auction-baseline-100seed.md). 회귀 의심 시 `git stash`로 직전 코드를 같은 환경에서 재측정해 비교.
- **동적색/특수 큐브는 `cityAcceptsCube`(hexGrid) 한 곳으로** — 배달 경로탐색뿐 아니라 AI 경로 평가(`vp.ts`/`buildTrack.ts`)도 이 헬퍼로 도시 수요색을 봐야 한다.
- **기각 실험도 선행조건이 바뀌면 뒤집힌다** — 막다른 길을 영구 배제하지 말 것(악화 기록은 당시 조건 한정).
- **주식 보존 법칙**: 투자(발행)를 줄이는 방향은 대체로 역효과 — income 레버만 건드린다.

**디버깅**: 개발 서버 실행 중엔 화면 묘사 대신 **:3999 로그 서버**에서 `logAction` JSON을 확인하며 추적(예: `"c":"trackBuilding"` grep). ⚠️ 로그는 메모리 버퍼라 **로그 서버 재시작 금지**(이전 게임 로그 소실), 읽기만. 콘솔 헬퍼 `debugAI`/`getAIReport`/`setDebug`.

**게임 엔진 메커니즘 (현재 동작)**:
- **마을 가닥(스퍼) 모델**: 마을 헥스엔 타일 배치 불가 — 원→변 가닥(`buildTownSpur`)으로 연결. 타일 1개=1카운트, 가닥은 그 마을을 이번 턴 처음 변경할 때만 1카운트(가닥 개수 무관). 이동/완성/배달 판정은 가닥 있는 변으로만.
- **건설 제한**: 턴당 3개(Engineer 4). 모든 건설 경로(buildTrack/복합/방향전환/마을가닥)가 `builtTracksThisTurn` 카운트 검사.
- **독일 Engineer 절반 할인(`engineerHalfCost`)**: 룰북은 "트랙 1개를 절반 비용(올림)"이고 **지형·비용 하한 조건이 없다**(평지 $2도 $1). 타일을 하나씩 커밋하는 구조라 플레이어 선택 대신 **이번 빌더 턴 최고가 타일 1개**가 절반이 되도록 매 건설마다 차액을 정산한다 — `helpers/engineerDiscount.ts`의 `applyEngineerDiscount`(청구 `buildSlice` + 토스트 추정 `buildReason` 공유, 미러 금지). 총액은 건설 순서와 무관하게 `정가합 − floor(최고가/2)`. 상태는 `PhaseState.engineerMaxTileCost`/`engineerDiscountGiven`(빌더마다 리셋). 독일은 트랙 상한이 **3개**(Engineer라도 4개 아님).
- **건설 비용 안내(`MapProfile.buildCostHint`)**: 지형 비용을 바꾸는 맵(fixedCost 주입)은 반드시 override — 안 하면 `PhasePanel`이 표준값($2/$3/$4)을 띄워 실제 청구액과 어긋난다 (서부 늪·강 $4·산 $5, 한국 산 $3, 독일 숫자 헥스 $6~$12).
- **독일 미완성 링크 금지 UI 가드**: 독일(`requireCompleteLinks`)은 완성 링크만 건설 가능 — 이번 턴 미완성 신설 트랙은 단계 전환 시 `removeIncompleteNewTracks`가 삭제·환불한다. 모르고 넘어가 트랙이 사라지는 걸 막으려 `PhasePanel`이 사람 차례 buildTrack에서 미완성 트랙이 있으면(`hasIncompleteNewTracks`) '다음 단계로'를 **비활성 + 경고**한다. 이번 턴 트랙만 대상이라 undo로 해소 가능(교착 없음). **봇 게이트(2026-07-22, DI)**: 봇도 `MapProfile.aiRouteBuildGate`(독일 override)로 **이번 턴 잔여 슬롯·현금으로 경로 전체를 완성 못 하면 착공/계속 금지** — 과거 인라인 게이트(첫 슬롯만·현금 미검사)가 놓치던 "슬롯은 되는데 숫자 헥스 $6~12 현금 부족으로 2/3만 짓고 삭제" 반복(사용자 관찰)을 차단. 게이트는 **경로 전체가 아니라 첫 미완성 링크 단위**(P→마을→C는 이번 턴 P→마을 링크만 완성하는 분할 건설이 합법 — 경로 전체 기준은 VP −0.89 실측)이고 마을 가닥 카운트·비용 포함. 100시드: 건설 72.8→63.8/게임(헛건설 −9), VP 43.21·파산 0.17(허용 내). **맵 전용 AI 알고리즘은 이렇게 MapProfile 메서드 훅(DI)으로 주입** — `aiRouteBuildGate`(건설 게이트)·`aiExtraActionVP`(추가 행동 평가식, 달 저중력이 여기로 이관)·`aiDeliveryTimingFactor`·`selectTargetRoute` 등. 공유 AI 코드에 인라인 맵 분기 금지(룰 패밀리 플래그 구동 일반 로직만 예외 — masterNetwork 앵커 보충처럼 2개 이상 맵 공유 시).
- **실행/선택 취소**: `undoLastAction`(확정 행동 스냅샷 복원, `nextPhase`마다 초기화·사람 전용) / `cancelSelection`(커밋 전 UI 선택만). 새 커밋 액션 추가 시 검증 통과 직후 `captureUndo(state, label)` + set에 `undoCount` 포함.
- **Montréal Métro 특수룰 (3인 9턴, 2026-07-13)**: ① **정부 링크** — 새 GamePhase `governmentLink`(매 라운드 주식 발행 전). 관리자는 셋업 순번 로테이션(`GameState.governmentControllers[(턴-1)%3]`), 무료 중립 링크 1개(타일≤3, 미완성은 단계 전환 시 자동 제거 — `removeIncompleteGovernmentTracks`). 정부 트랙 = `TrackTile.isGovernment + owner:null`(누구나 이동, 수입 0, 방향전환 금지 — 단 복합 교차/공존 추가는 표준 교체 룰대로 허용, 원 정부 트랙 보존. 원본 룰에 교차 금지 조항 없음), 정부 마을 가닥 = `TownSpur.owner:null`. 봇 관리자는 `helpers/governmentBuildAI.runGovernmentBuildAI`(AUTO_ADVANCE 경유). ② **마스터 네트워크** — 모든 건설 타일은 기존 네트워크(아무 트랙/트랙 닿은 정거장)에 닿아야 함(`touchesMasterNetwork`, 첫 정부 링크만 예외). ③ **DGEL**(`PlayerState.dgel`) — Locomotive가 일반 엔진 대신 정부 전용 엔진 +1(상한 4). 이동 탐색(`findReachableDestinations`/`findAllPaths`)에 `govExtra` 파라미터: 총 링크 ≤ 엔진+DGEL, 비정부 링크 ≤ 엔진. 비용 지불에 합산(payExpenses·AI 생존계획 포함). ④ **경매 트윅** — 무입찰 패스 2인 이상이면 `PlayerState.actionBanned`(그 턴 행동 선택 불가, 롤오버 리셋). ⑤ **Repopulation** — production 선택 즉시 주머니에서 3개 뽑아(`phaseState.repopulationCubes`) 1개를 도시에 배치(`placeRepopulationCube`, intents 등록). 배치 전엔 selectActions가 진행되지 않음. ⑥ 신도시 타일마다 셋업 큐브 1개(`NewCityTile.setupCube` — placeNewCity 때 함께 배치), 물품 성장 생략, Atwater는 빨강+파랑 겸용(`City.extraColor` — cityAcceptsCube 한 곳에서 판정). ⚠️ 배달 경로 선택(`findLongestPath`)은 "내 링크 수 → 총 링크 수" 순 — 총 링크만 보면 수입 0인 정부 링크 우회를 선호한다. ⚠️ **AI는 마스터 네트워크를 알아야 한다**: 첫 건설은 네트워크에 닿은 정거장(`stationInMasterNetwork`, trackValidation)에서만 시작 가능 — `tryDirectPathBuild`가 그 끝점으로 스왑하고, `decideBuildTrack`이 네트워크 앵커 배달 기회를 **ΔVP순 상위 5개**로 후보에 보충한다(도시 배열 순서로 넣으면 저가치 장거리가 고가치 직행을 밀어내 봇이 미완성 괴물 경로를 착공 — 2026-07-14 실전 버그, 정렬+순서 수정, 이후 중복 부설 방지까지 누적해 100시드 VP −1.49→+0.55·파산 1.02) (이걸 빼면 봇이 한 타일도 못 깔고 턴 스킵 — 2026-07-14 실버그, 수정으로 20시드 VP -21→-2). 사람 관리자가 정부 링크를 안 짓고 넘어가면 ConfirmDialog로 확인. **시각(원본 시트 재현)**: 물=`sea` 지형(전체 파랑 채움, `TerrainType`에 추가), 도로=`GameMapData.roads` 폴리라인(검정+노란 점선, 도로 헥스는 평지와 동일 초록), 비용 숫자는 원본에 인쇄된 3곳만(`HexTile.showCostMarker` — legend 맵에서도 도로 위 레이어로 표시), $5 헥스 사선 분할(`HexTile.landWedgeWest`), 도시 숫자 박스=초기 화물 수(columnMapping.diceNumber 재사용, 성장 없어 주사위 무관), 신도시 타일 화물은 실제 도시처럼 헥스 위에 렌더(NewCityTileHex cube prop), 정부 관리 로테이션 표시(PhasePanel 배지 + TurnTrack 헤더 순서 우측 "정부 링크 건설" 텍스트·이번→다음 관리자 색 원), **정부 관련은 전부 다크 그레이 #4E4D46**(트랙 레일·가닥 내부·완성 링크 중립 마커·배지 — 순검정은 톤 부조화로 기각), 물품 디스플레이 0칸(setup.ts — rowCount 합 0 허용, 52칸 폴백은 columnMapping 자체가 없을 때만).
- **Moon(달) 특수룰 (3~4인 8턴 — 정본: rules/AOSD Exp Vol V Draft Rules v03.pdf Moon 섹션, 2026-07-21 개정)**: ① **랩 어라운드** — 외곽 같은 번호(1~37) 두 변 연결. `BoardState.wrapEdges` + `getNeighborHex(coord, edge, board?)` 랩 조회(WeakMap 캐시). **랩 쌍이 보드 점대칭이라 "반대변=(e+3)%6" 불변식 유지**(moonMap.test 검증). 경로탐색·건설검증·boardRules 이웃 계산에 board 전달(렌더 외곽선은 의도적 미전달). ② **Landing hex(Moon Base)** — 색·수요 없는 중앙 도시(`City.noDemand`) + 셋업 화물 **인원×2개**(`MapProfile.perPlayerCityCubes`) + **네트워크 시드**: `masterNetwork`+`masterNetworkSeedCityId('moonBase')`. ③ **밤/낮** — `BoardState.nightSide`('west' 시작·홀수턴 west), 밤쪽 도시=검은 도시(`isNightCity`, 타색 큐브는 통과도 불가 `cityBlocksTransit`). 턴 롤오버 2곳 교대. 렌더: 반투명 어둠 + **🌙 밤 / ☀️ 낮 배지**(양쪽 대칭, `sideBadgePos`) + 밤 도시는 **원래 색의 어두운 필터**(`shadeColor(-62)`) — 순검정 대신 원래 수요색을 식별해 다음 턴을 계획하게(2026-07-21 사용자 피드백). ④ **건설 2개**(Engineer 3, `buildsPerTurn`+`maxTracksForBuilder`) + **마을 가닥 \$2**(`MapProfile.townSpurCost` — 공식 "마을 \$2+트랙당\$1"의 스퍼 근사, buildSlice 5곳 프로파일화). ⑤ **저중력(lowGravitation) = 8번째 SpecialAction** — `MapProfile.extraActions`로 달만 노출(행동 그리드·AI 후보·도움말이 `actionsForMap`=기본7+extra 순회, gameStore.selectAction 방어). 효과(2026-07-22 타인 철도 전 맵 개방 후 재정의): 경로 확장은 전 맵 공통이 되어 소멸, **빌린 링크 1개의 수입을 내가 가져옴**(`applyLowGravitation`, moveSlice)만 잔존 — 공식 "as if it were his own link … also gains the income"에 오히려 더 충실. `findRouteOptions`의 `lowGravCredit` 파라미터가 이 이전을 경로 수치(ownLinks+1/oppLinks−1)에 반영해 평가=정산 일치. 사람 UI(uiSlice)·AI(moveGoods) 동일 배선. **Production은 표준 기능 유지**(디스플레이 사용으로 유효). ⑥ **물품 성장** — **디스플레이 사용**(도시 6열×3 + 신도시 A~D×2 = 26칸, `displayLabel` "1/2" 헤더), 주사위 인원×2(`growthDicePerPlayer`), **실제 도시 6개**는 도시 인쇄 번호(`cityGrowthDice`) 일치 시, **신도시 A~D**는 도시화 전엔 인쇄 번호가 없으므로 **표준 diceNumber 방식**(다른 맵 신도시 열과 동일 관례, `MOON_COLUMN_MAPPING`에 1~4 부여)으로 각각 성장 판정 — 두 경로 모두 **낮쪽+Moon Base 완성링크 연결**(`citiesConnectedToSeed` BFS) 도시만 **자기 열 위에서부터** 받음, 미달분은 디스플레이 잔류. 신규 도시 **A·B·C·D**만(공식 "검은 신도시 제거" — 이 구현 색 기준 E~H 제거, `availableNewCityTiles`). ⚠️ **버그 이력(2026-07-21h, 사용자 발견)**: 신도시 diceNumber가 누락돼 있었고 달의 `growGoods`가 표준 성장 루프로 폴스루하지 않아 **신도시는 도시화해도 영구히 화물을 못 받았다**(셋업 큐브도 0개라 도시화가 화물 관점에서 완전히 죽은 액션). `goodsGrowthSlice.ts`에 신도시 전용 성장 루프 추가로 수정 — VP −11.53→−8.61(+2.92, 세션 최대 단일 개선). 시뮬: `moonSimulation.test.ts` 100시드 게이트. ⚠️ **UI 버그 이력(2026-07-21i, 사용자 발견)**: GoodsGrowthPanel의 "이동 예정" 미리보기가 표준 "주사위 눈=열 번호" 계산만 해서 실제 도시(columnId가 문자열이라 매치 불가)·신도시(isNewCity로 아예 제외)를 놓쳐 늘 "이동할 물품이 없습니다"만 표시했고, `DiceRoller`의 "열 N: X개" 요약도 이 가정에 기반해 무관한 숫자를 보여줬다(실제 성장은 정상 동작 — UI만 부정확). `GoodsGrowthPanel.calculateGrowthResults`에 달 전용 분기(growGoods 판정을 그대로 미러링) 추가 + `DiceRoller`에 `showColumnTally` prop(달만 false)으로 수정. ⑦ **AI의 특수룰 활용(2026-07-21)**: 봇도 랩 지름길을 계획(analyzer/buildTrack/selectAction/urbanization의 이웃·`getEdgeBetweenHexes`에 board 전달)하고, 저중력을 실제로 쓰며(선호 평가 `2.0+0.12×상대 완성링크`, cap 2.5 — 2026-07-22 타인 철도 개방 후 효과는 수입 이전만), **밤낮을 계획에 반영**한다 — `cityEverAcceptsCube`(계획 전용: 원래색=낮 턴/검은색=밤 턴 수용 인정. **이동 실행·목적지 표시는 반드시 현재 상태의 `cityAcceptsCube`**)를 AI 계획 계층(analyzer/vp/buildTrack/urbanization)에만 적용하고, `vp.ts`는 격턴 배달 페널티(`deliverableTurns` 절반)를 건다. 랩 번호 박스는 외곽선에 밀착시켜 변 접선 방향으로 회전(원본 시트 레이아웃).
- **달 AI 재무 튜닝 (2026-07-21b)**: 달 봇은 매 턴 적자(income +2/턴 vs 비용 +2.3/턴)로 발행 캡을 매 턴 채워 주식 14.7 = **VP −44**였다. 달은 크레이터 \$3·건설 2개 제한이라 주식 1주(\$5)로 1.67타일뿐 → **3턴 이후 차입은 회수 불가**. 달 전용 MapProfile 훅 3종(다른 맵은 기본값 = 기존 동작 항등): ① `aiNoBuildIssueLastTurns=5` — 후반 5턴(T4~8) **계획** 발행 금지(생존 발행은 허용, issueShares.ts). 최대 기여 ② `aiPlanExpensesNetOfIncome` — turnPlan.cashNeeded의 운영비를 income으로 상계해 "발행→expenses↑→cashNeeded↑→또 발행" 자기증폭 차단 ③ `aiDeliveryTimingFactor` — 검은 큐브 우대(밤쪽 도시가 매 턴 열려 있어 타이밍에 안 묶임)·목적지가 밤인 경로 소폭 할인. **⚠️ 타이밍 계수는 반드시 `perDeliveryVP`에 곱할 것** — `deliverableTurns`에 곱하면 `expectedDeliveries = min(deliverableTurns, matchingCubes)`의 큐브 병목에 묻혀 무효(실측 VP 변화 0.03). 이후 추가 3종: ④ 반구 포트폴리오(타이밍 계수 안에서 내 완성 링크가 커버한 반구 ×0.75/미커버 ×1.4 — 한쪽에 몰린 링크가 밤에 통째로 노는 문제, 스킵의 41%) ⑤ `aiEngineUpgradeCap=3` — **엔진업 결정만** 제한하고 경로 평가(engineMax)는 그대로(engineMax 축소는 긴 경로 −∞ 배제로 기각된 것과 구분) ⑥ `aiSkipHopelessSurvivalIssue` — 최대 발행으로도 파산 회피 불가면 생존 발행 포기(필요 주수 = ceil((부족분−income)/4), 주 실효 보전액 \$4). ⑦ 건설 예비금 면제의 배달 판정을 `cityAcceptsCube`(현재 상태)로 교정 — 계획용 `cityEverAcceptsCube`로 판정하면 목적지가 밤이라 이번 턴 배달 불가인데도 "배달로 회수"로 오판해 비용 지불용 현금을 건설에 헐어 수입컷/파산(파산 턴 건설지출 \$4.4 실측). 밤낮 없는 맵은 두 판정이 동치라 전 맵 불변. 최종 VP −21.49→**−11.49**·파산 1.78→1.50·주식 14.7→12.1. **기각**: 엔진 front-load 끄기(VP −19.6·파산 2.07로 악화 — 짧은 링크는 "엔진이 낮아서" 생긴 결과였음), 후반 6턴 금지(VP는 높으나 파산 원복), Locomotive까지 엔진 상한(4링크 배달 차단), 생존 발행 \$4 정확 메움(주식 증가로 악화), 수송 스킵 문턱 완화(자발적 스킵은 income 0짜리라 봇 판단이 옳았음). 상세·기각 근거는 [docs/ai-auction-baseline-100seed.md](docs/ai-auction-baseline-100seed.md).
- **달 "성장 연결 가치" 실험 기각 (2026-07-21)**: 파라미터 튜닝이 국소 최적(VP −11.49·파산 1.50)에 도달한 뒤, 달 성장 룰("낮쪽+Moon Base 완성링크 연결 도시만 성장")의 "경로 완성 = 미래 화물 공급 해금" 가치를 `aiRouteExtraVP` 가산 훅(선례: `transcontinentalVP`와 동일 계열, 기본 0=항등)으로 넣는 실험(계획: [docs/moon-growth-link-plan.md](docs/moon-growth-link-plan.md)) — **전 지점 기각**. 최소 자극(VP_PER_CUBE 0.5×MY_SHARE 0.25)조차 VP −11.63으로 악화, 보너스 크기와 단조 비례해 더 악화(1.0×0.4 → −11.82). 원인: `estimateRouteVP`의 `matchingCubes`가 이미 "현재 큐브"를 정확히 보는데 "미래 성장 큐브" 가치를 얹으면 즉시 income을 내는 경로보다 지금은 빈약해도 "언젠가 자랄" 경로를 과대평가 — 그 성장은 실제 발생 시 별도 경로평가 턴이 다시 잡아내므로(성장발생턴 이미 5.8/8) 이중 계상에 가깝다. `citiesConnectedToSeed` 이동(hexGrid.ts, export)·훅 배관(기본 0)은 유지 — 다른 축이 재사용 가능. 상세: [docs/ai-auction-baseline-100seed.md](docs/ai-auction-baseline-100seed.md).
- **달 경로 겹침 완화 — 스나이핑·순번 편향 해소 (2026-07-21i)**: player3 열세(VP −23·승률 5%)의 뿌리는 selector의 경로 겹침 완전 차단(-Infinity)이 **Moon Base 단일 허브와 상성 최악**이라는 것 — 초반 기회가 전부 moonBase 출발이라 앞 순번이 잡는 순간 뒷순번의 평가 후보 top-8이 전멸하고, fallback(`viableOpps[0] ?? opportunities[0]`)이 **겹침·ΔVP 평가를 무시한 경로를 커밋**해 정면 충돌(T1에 3·4번이 같은 moonBase→imbrium)·스나이핑(30시드 20.2건/게임)·재탐색 강요로 이어졌다. 수정: `MapProfile.aiRouteOverlapSharedCityPenalty`(기본 null=완전 차단 항등, selector.ts) — 달은 **0**: "도시 하나만 공유"는 무감점 허용(moonBase 화물 인원×2 = 출발지 공유가 정상), **정확히 같은 연결(from-to 쌍, 방향 무시)만 차단 유지**. 스윕 0/3/6/10 = −3.94/−6.28/−6.40/−7.53(단조), sameLink 차단까지 풀면 −4.47 악화(차단 실기여). **VP −8.61→−3.94·파산 1.34→0.87·player3 −23→−12.5·승자 분포 25/34/21/20**, 타 맵 6개 100시드 수치 정확 일치(항등). 상세: [docs/ai-auction-baseline-100seed.md](docs/ai-auction-baseline-100seed.md).
- **Southern China 특수룰 (4~5인·디폴트 4인 8턴 — 정본: rules/southern-china-rules-pt1/2.pdf, 2026-07-27)**: ① **소유 디스크 4개** — 디스크 1개 = 완성 링크/미완성 구간/구매한 직결 링크(`helpers/nationalization.countOwnershipUnits`). 건설로 초과하면 `GameState.nationalizationPending`이 서고 기존 완성 링크 하나를 **국유화**(`nationalizeLink` — 사람은 PhasePanel 목록 또는 **보드에서 깜빡이는 후보 철도 직접 클릭**, 봇은 `resolveBotNationalization`이 타일 수 최소 링크 즉시 자동 해소 — 호출처 둘: 건설 직후(`afterBuildDiscCheck`) + **AI 턴 진입**(대기 중 사람이 봇으로 전환된 경우. 안 하면 nextPhase 보류 ↔ scheduleAICheck 무한루프))할 때까지 buildTrack 진행이 막힌다. 국유화 트랙 = `{owner:null, isGovernment:true, isNationalized:true}` — **Montréal 중립 기계 재사용**(누구나 이동·수입 0·VP 0·수정 금지), isNationalized는 HK 경유 금지·렌더 구분 마커. 보상 = 지지 토큰 1 + 구간당 $1, 당턴 건설/완성 링크는 대상 제외(`eligibleNationalizationTargets`). ② **미완성 구간 동시 1개**(`unfinishedSectionLimit`) — canBuildTrack가 "내 미완성 구간에 안 이어지고 양끝이 정거장도 아닌 새 타일"을 거부(buildReason 미러). ③ **Engineer·Locomotive 미사용** + 신규 8번째 행동 **Gain Support**(`gainSupport`, 선택 즉시 `PlayerState.supportTokens`+1). ④ **지지 토큰**: 미사용 1개 = 종료 3 VP(`playerBonusVP` — calculateVictoryPoints 4번째 인자), 반납(`spendSupportToken`, 내 차례 한정) → 'build' 이번 턴 건설 4개(maxTracksForBuilder) / 'loco' 수송 양 라운드 실효 엔진 +1(`effectiveEngineLevel` — 이동 탐색만, **payExpenses엔 미포함**). 롤오버 시 효과 플래그만 리셋(토큰은 유지). **봇도 'loco'를 반납한다**(`strategies/supportToken.shouldSpendSupportForLoco` — gameStore의 AI moveGoods 진입에서 판정, 반납 후 재결정해 늘어난 엔진을 경로에 반영). 이 맵은 Locomotive가 없어 토큰이 **유지비 안 붙는 1회용 엔진**이라, 300시드에서 **VP 동률(16.81→16.84)에 파산 20% 감소(0.46→0.37)**. 판정은 **증분** ΔVP `(엔진+1 최선 배달)−(현재 엔진 최선 배달)` > 3+6이며, 총 ΔVP로 재면 과대평가돼 역효과(−4.31 실측). **'build'(건설 4개) 반납은 미구현** — VP −2.16으로 명백한 손해. ⚠️ 이 항목은 100시드에서 '전 변형 기각'으로 잘못 결론냈다가 300시드 재측정으로 뒤집힌 건이다(기각 근거였던 베이스라인 17.68이 노이즈로 0.87 부풀려진 값이었음) — **1 VP 미만 차이는 100시드로 판별 불가(표준오차 ±1.15)**, 근거표·방법론 교훈: [docs/ai-auction-baseline-100seed.md](docs/ai-auction-baseline-100seed.md) 2026-07-27c. ⑤ **Hong Kong**(acceptsAllColors) — 모든 색 수용(`cityAcceptsCube` 한 곳), **마지막 2턴 폐쇄**(`allAcceptCityClosedLastTurns` → 롤오버가 `board.allAcceptClosed` 설정), **국유화 링크 경유 배달 금지**(findAllPaths·findReachableDestinations의 acceptsAllColors×govLinks 가드). ⑥ **인터어반(GZ↔SZ)·SZ↔HK 링크·페리(GZ↔HK)** = $8 구매식 직결 링크 3개(buildDirectLink + `interurbanFerryRule`: 플레이어당 턴 1개·`ferriesBuilt`+1=종료 1 VP). GZ↔HK는 비인접이라 시각은 면 앵커 직선(`DirectLink.faces` — GZ SE면↔HK W면, GameBoard가 정적 정의에서 보충해 구 저장본도 표시). 인접 쌍(GZ↔SZ·SZ↔HK)은 공유 변 위 반투명 점선 원 "8"(이름 밴드 안 가림), 링크 선은 도시 아래 레이어. (구) 서안 (6,9)↔HK 변 페리는 사용자 확인으로 제거 — 구매식 변 인접 기계(`board.ferryEdges`+`buildFerryEdge`+getNeighborHex, "(e+3)%6" 불변식)는 무해하게 잔존. ⑦ 추가비용 헥스 $4/$5 = fixedCost+showCostMarker. "복합 전 단순 선행" 룰은 **구조적으로 충족** — 이 엔진의 복합(교차/공존)은 항상 기존 단순 트랙 위 교체라 빈 헥스 복합 배치가 원래 불가(canBuildComplexTrack 기존 트랙 필수). southernChinaRules.test에 회귀 가드 박제(훗날 빈 헥스 복합 배치를 허용하게 되면 이 제약을 상기). ⚠️ **A* 정거장→정거장 직행 금지(전 맵 공유 수정)**: SZ(8,8)·HK(8,9)처럼 인접 도시 쌍은 0타일 링크가 불가능한데 A*가 [SZ→HK] 0타일 경로를 반환해 봇 전원이 "지을 게 없는 목표"에 몇 턴씩 갇혔다(홍콩 배달 0·VP −2.79). 건설된 직결 링크만 예외(`canStepStationToStation`, analyzer 두 A* 공통) — 수정 후 VP +14.26·파산 0.57·HK 배달 5.2/게임. **봇 직결 구매 구현(2026-07-27b)**: `evaluateDirectLinkPurchase`(strategies/buildTrack) — 동적색 맵 제외·고가는 HK 끝점만·1타일 대안 비교·현금 버퍼 6 (China 14.30/HK 배달 8.0·Germany +0.26·Korea 항등, 튜닝 이력은 baseline 문서). 직결 링크도 국유화 대상(중립 직결 = owner null+isNationalized·재구매 불가·HK행 정부 취급).
- **봇 Production 실행 (전 맵 공통, 2026-07-21)**: `goodsGrowthSlice.applyBotProduction` — growGoods 초입에서 봇 홀더가 주머니에서 `min(2, 빈칸, 주머니)`개를 디스플레이 빈 칸에 자동 배치(룰북 IX: 생산 → 주사위). 달(`cityDiceGrowth`)은 **낮쪽 + Moon Base 연결 도시 열을 우선** 채워 이번 성장에 실제로 나갈 칸부터 보충한다. 사람 홀더는 기존 ProductionPanel 흐름 유지. ⚠️ 오랫동안 "봇 생산 미구현"이 **전 맵 공통 병목**이었음이 100시드로 확인됨(구현 후 전 맵 VP 상승, 하락 맵 없음 — docs/ai-auction-baseline-100seed.md 2026-07-21 표).
- **⚠️ 소유권 회계 vs 물리적 연결성 (2026-07-29, 섞어 쓰면 트랙이 회계에서 증발)**: 같은 "완성 링크"를 두 함수가 **다른 기준**으로 판정한다 — `isTrackPartOfCompletedLink`(hexGrid)는 **소유권을 안 보고** 물리적 연결만 보며(secondary도 추적), `findCompletedLinks`는 **모든 타일이 동일 owner**여야 링크를 만든다(primary만 추적). 내 타일이 국유화/미소유/타인 타일과 섞인 채 정거장↔정거장을 이으면 그 틈으로 빠진다: 물리적으로 완성이라 미완성 구간에서 빠지는데 소유자가 섞여 완성 링크도 아니다 → **디스크 0·국유화 대상 아님·마커 없음·VP 0**, 게다가 인수도 해제도 대상이 아니라 되돌릴 수 없다(사용자 실측, 남부 중국). **소유권 회계(디스크 단위·미연장 해제·구간 인수)는 반드시 `isTrackInOwnedCompletedLink`/`buildOwnedLinkTileIndex`(hexGrid)로 판정**하고, 건설 연결성·경로 탐색 같은 **물리 판정에만** `isTrackPartOfCompletedLink`를 쓴다. 타일마다 `findCompletedLinks`를 부르면 O(n²)이니 인덱스를 한 번 만들어 넘길 것. 인수(`findClaimableSectionKeys`)는 `buildTrack`뿐 아니라 `buildTownSpur`·`buildComplexTrack`에서도 돌며, **완성된 구간만** 가져온다(미완성 인수는 builtTurn이 과거라 그 턴 끝 `releaseUnextendedTrack`이 도로 풀고, builtTurn을 현재 턴으로 덮으면 독일 `getIncompleteNewTracks`가 삭제+환불한다). **복합 보조 경로(secondary) 링크는 2026-07-29c에 전 계층이 인식하도록 수정됨** — 완성 링크 판정은 **좌표가 아니라 (좌표+경로종류 P/S)** 단위다. `CompletedLink.trackPaths`가 그 정보를 싣고, `traceLinkFromTrack`/`isCompletedLink`는 진입 변이 속한 경로로만 통과하며 **그 경로의 소유자**를 본다(타일 단위 `owner` 비교 금지 — 복합은 기본/보조 주인이 다를 수 있다). `calculateTrackScore`도 (헥스+경로종류)로 세고(룰북 "각 트랙 구간당 +1점" — 복합의 두 트랙은 독립 구간), `buildOwnedLinkTileIndex` 키·보드 소유 마커·`eligibleNationalizationTargets`·`applyNationalization`(보조 링크는 **secondaryOwner만** 중립화 — 타일 전체를 정부 트랙으로 만들면 기본 경로 주인의 철도를 뺏는다)이 모두 같은 기준을 쓴다. **전 맵 100시드 개선(9/9, Rust Belt +1.60)** — 봇이 교차/공존으로 완성한 링크의 소유권을 매 턴 잃던 것이 룰대로 유지된 결과. 이력: [docs/issue-log.md](docs/issue-log.md).
- **국유화 후보는 `nationalizationTargets` 한 곳에서** (표시·판정·봇 공용, 미러 금지) — 룰상 당턴 건설/완성 링크는 국유화 대상이 아니지만 그 때문에 후보가 0이 되면 디스크 상한(불변식)을 지킬 방법이 사라진다(대기도 안 서고 안전망은 미완성 구간만 푼다 → 5단위 고착). **후보가 하나도 없을 때만** 당턴 제외를 푸는 폴백이 들어 있다.
- **미완성 트랙 소유권 (룰북 IV, 2026-07-21 정합화)**: ① **연장 인수** — 미소유 미완성 트랙(턴에 연장 안 해 디스크 빠진 것)은 연결점으로 인정되며, 새 타일로 이어 지으면 `findClaimableSectionKeys`(boardRules)가 그 구간 전체 소유권을 건설자에게 이전. 정부 트랙(중립)·완성 링크 소속(파산 해제분)·Western US 연속성 중(requireNetwork)은 제외. ② **방향 전환은 소유권 무변경** — "방향 전환만으로는 연장으로 인정되지 않는다"에 따라 `redirectTrack`·`buildTrack` 기존 타일 경로 모두 owner/builtTurn 유지(과거엔 소유권을 넘겨줬음 — 룰 위반이라 제거). ③ 방향 전환 **도시 방향 허용**(룰북에 금지 조항 없음), 이웃 판정 = 타 플레이어·정부 트랙 직접 연결 금지 / 내·미소유 트랙·맵 내 빈 헥스 허용. `getRedirectableEdges`는 currentPlayer를 받는다. **AI도 인수를 계획한다(2026-07-22)**: 경로 위 미소유 타일이 **변 일치로 그대로 재사용 가능**하면 건설 불요·비용 0으로 취급(`isReusableUnownedOnPath`, analyzer — vp.estimateRouteVP·turnPlan·buildTrack 예비금 면제가 공유, 미러 금지). buildTrack frontier 체인도 인수 가능 미소유 타일을 통과(`getClaimableUnownedTrackAt`)하고, AI측 첫 트랙 규칙에도 인수 연장 예외를 미러. **가산 보너스 금지** — 비용 절감으로만 반영해 이중 계상을 피한다(달 성장 가치 기각 교훈). 변 불일치 미소유 타일·A* 비용 우대는 미구현(2단계 후보). **전 맵 100시드 게이트 통과(2026-07-22)**: 7개 맵 전부 채택(VP 하락 −1·파산 증가 +0.1 기준 충족) — Rust Belt 18.71→20.12·Southern US 13.44→14.63·Montréal 0.55→2.31 등 6개 맵 개선, Moon만 −3.94→−4.48 소폭 하락(노이즈 범위). 상세: [docs/ai-auction-baseline-100seed.md](docs/ai-auction-baseline-100seed.md). **UX(노란 칸 통합)**: 미완성 트랙(내 것/미소유) 클릭 = 연장 타깃 + 방향 전환 방향이 전부 노란 하이라이트(`getRedirectTargetHexes` — uiSlice 하이라이트와 GameBoard 클릭 판정이 공유, 연장 후보와 서로소), 방향 전환 칸은 클릭 한 번에 즉시 커밋. 내 트랙 0개여도 인수 연장은 첫 트랙 규칙(도시 인접) 예외(`touchesClaimableUnownedTrack` — buildReason 미러 동기화). 이력: [docs/issue-log.md](docs/issue-log.md).
- **타인 철도 이용 화물 운송 (룰북 V 정합, 2026-07-22)**: 이동 경로가 **타인 소유 완성 링크도 이용**(개수 무제한, 엔진 한도 내) — 수입은 링크 소유자에게(정산은 원래부터 링크 소유자별 +1이라 무수정, 탐색 계층만 개방). 정책은 **`hexGrid.findRouteOptions` 한 곳**(사람 UI·AI 공유): ① 본인 철도 우선 게이트 — 타인 경유 경로는 내 수입(정산 미러 `getPathLinkOwners` 기준)이 본인-철도-최선을 **넘을 때만** 노출, **동률·미만이면 숨김**(2026-07-28 사용자 지시 — 내 수입이 같은데 남의 철도를 끼면 상대에게 수입만 헌납하는 선택지라 디폴트는 물론 경로 선택 목록에도 두지 않는다. 2026-07-26엔 "합법 경로 보존" 취지로 동률을 노출했었으나, 그때 실제로 고친 버그는 공존 헥스 2회 통과 `pathVisitKey`였고 동률 노출은 곁들인 완화라 되돌려도 그 버그는 재발하지 않는다); 본인 철도로 도달 불가한 목적지는 무조건 노출(사람 쪽 큐브 단위 게이트 `gateMixedByCubeBest`도 동일 원칙 — 목적지 통째 숨김 금지). **경로 탐색 visited는 트랙 헥스에 한해 (헥스+진입 트랙 P/S) 단위**(`pathVisitKey`) — 교차/공존 타일의 독립된 두 트랙을 한 경로가 각각 한 번씩 지나는 합법 경로(한국 실전 3링크)를 헥스 단위 visited가 차단하던 버그 수정(2026-07-26, findAllPaths·findReachableDestinations. `findTrackCubeDeliveries`는 미적용 — 후속) ② 디폴트([0]) = 내 수입 최대 → **최저 VP 주인**(`calculateVictoryPoints`, 선두 견제) → 빌린 링크 최소 ③ 같은 빌린-소유자 집합은 대표 1개(dedupe). ④ **목적지 간** 골드 점선(`ui.movePath`) 선택도 같은 기준 — 내 수입 최대 → **빌린 링크 최소** → 총 링크 최대 (uiSlice 도시·마을 큐브. oppLinks를 빠뜨리면 내 수입 동률일 때 "총 링크가 긴 쪽"이 이겨, 본인 철도로 갈 수 있는데도 남의 철도를 낀 더 먼 목적지를 추천한다 — 2026-07-28 사용자 보고로 수정). `findLongestPath` tie-break = 내 링크↓ → 타인 링크↓ → 총 링크↓. **UI**: 후보 1개면 목적지 클릭 즉시 수송(기존 UX), 여러 개면 경로 선택 모드(`ui.routeChoice`) — 빌린 구간을 소유자 마커 색으로 분절 렌더(BoardOverlays)·선택은 굵게, 경로 클릭/PhasePanel 카드로 전환, 목적지 재클릭·'이 경로로 수송'으로 확정, `selectRouteOption`/`confirmRouteChoice` 액션. **봇은 선택 UI 없이 디폴트 즉시 커밋**(uiSlice `selectDestinationCity`의 isAI 우회 — AI 결정 `decideMoveGoods`가 같은 findRouteOptions 디폴트로 평가하므로 일치). ⚠️ **AI 결정과 실행(uiSlice) 탐색이 어긋나면 목적지가 reachable에 없어 AI 락 미해제로 멈춘다** — 마을 큐브 분기에서 실제 발생해 수정(도시·마을 분기 모두 개방 유지할 것). 온라인: 선택 경로는 `startCubeAnimation` args로 전달(추가 intent 불요), `routeOptions`/`routeChoice`는 로컬 UI(스냅샷 미동기 — netStore 적용 시 정리). St.Lucia 트랙 큐브 탐색은 원래 소유자 필터가 없었고, 픽커/AI 평가만 정산 미러(`TrackCubeDelivery.ownIncome/oppIncome`)로 통일(VP −15.25→−4.80 — "St.Lucia 파탄"의 상당 부분이 수입 귀속 근사 오류였음). **100시드 전 맵 대폭 개선**(포지티브섬 — 전원 income↑·파산↓, 달 최대 +22): [docs/ai-auction-baseline-100seed.md](docs/ai-auction-baseline-100seed.md) 2026-07-22b. 설계·스텝 이력: [docs/opponent-rail-plan.md](docs/opponent-rail-plan.md).
- **신도시 배치 연출(`newCityEvent`)**: `placeNewCity`가 좌표·타일·색·배치자·key를 남김 → 스냅샷으로 전원 동기화. `BoardPulses`가 도시색 대형 링+“신도시 X 건설!” 펄스, `MoveCubeOverlay`가 3.5초 미니맵 플래시. 재생 중복은 "key 최초 관측 스킵" 가드, undo 복원은 `isRecentUndoLog` 억제. ⚠️ persist merge 리셋 목록 금지(deliveryIncomeEvent와 동일). ⚠️ 플래시 숨김 타이머는 flash 상태 기준 별도 effect — 관측 effect cleanup에 걸면 스냅샷마다 참조가 바뀌어 타이머만 취소되고 팝업이 영구히 남는다(실전 버그).
- **운송 가이드 on/off(`moveGuideAllowed` + gameSettingsStore)**: 가이드 = 목적지 골드 링(BoardCities `showMoveGuide`) + 최적 경로 점선(GameBoard가 movePath 게이팅). **표시만** 게이팅 — 목적지 클릭·수송·경로 선택 모드(routeChoice)·이동 애니메이션·Repopulation 골드 링은 불변. 실효 = 방 설정(`GameState.moveGuideAllowed`, 온라인 방장이 로비에서 설정→`startOnlineGame` 주입→스냅샷 동기화, false면 전원 잠김) AND 개인 토글(⚙ 설정 창). 오프라인은 방 설정 항상 true.
- **수송 도착지 수익 펄스**: 정산(`completeCubeMove`)이 `GameState.deliveryIncomeEvent`(도착지 좌표·플레이어별 수입 증가·key)를 남기고, `BoardPulses`가 도착 도시 위에 "플레이어 디스크+이름 +n" 스택 펄스(큐브 유입 펄스와 동일 모션)로 표시. 스냅샷에 실려 게스트도 봄 — ⚠️ **persist merge 리셋 목록에 넣지 말 것**(게스트 적용 경로가 merge를 재사용해 넣으면 게스트 표시가 죽음). 재생 중복은 컴포넌트의 "key 최초 관측 스킵" 가드가 방지, 실행 취소 복원은 `isRecentUndoLog`로 억제.
- **건설 실패 사유 토스트**: 조용히 실패하던 건설(현금 부족·제한 도달 등)을 상단 토스트로 안내. `helpers/buildReason.getBuildBlockReason`가 `canBuildTrack` 검사 순서를 미러해 첫 실패 사유를 돌려주고(현금은 canBuildTrack이 안 보므로 마지막에 추정), `toastStore`(gameStore와 분리 = 스냅샷 미동기화)로 띄운다. **트리거는 사람 클릭 UI 경로에만**(`uiSlice.selectExitDirection` 커밋 실패 + `selectSourceHex` 제한 도달) — AI/게스트-거부엔 안 뜬다. ⚠️ `canBuildTrack` 규칙 바꾸면 `getBuildBlockReason` 순서·조건도 함께 맞출 것.

**상세 — 의사결정 알고리즘 전문·Phase별 결정·맵별 구현 및 밸런싱 이력·디버깅 시스템·기각 실험 기록**: [docs/ai-system.md](docs/ai-system.md)

## 빌드 & 배포

### 개발 서버
```bash
npm run dev                  # :3000 앱
node scripts/log-server.mjs  # :3999 로그 서버 — 앱과 항상 함께 띄운다
```
**⚠️ 로컬 서버를 띄울 땐 로그 서버(:3999)도 반드시 같이 띄울 것.** 게임 진행/버그 추적은
화면 묘사가 아니라 `logAction` JSON으로 하는데, 로그 서버가 꺼져 있으면 브라우저가 보낸 로그가
그대로 유실돼 "재현했는데 로그가 없다"가 된다(실제로 그래서 진단이 한 번 헛돌았다).
로그는 `logs/game-mirror.log` 파일에도 쌓이므로 서버 재시작 후에도 파일 로그는 남는다.

**⚠️ store 로직(slice/hexGrid 등)을 고쳤는데 화면 동작이 그대로면 HMR을 의심할 것** — zustand
store는 HMR로 slice 함수가 갈아끼워지지 않아 **옛 로직이 계속 돈다**(미리보기는 바뀌었는데 정산은
옛 코드가 도는 식). `.next` 삭제 + dev 재시작 + 브라우저 강력 새로고침으로 강제 반영.
스테일 감지 가드: `gameStore.ts`의 `STORE_CODE_VERSION` — **store/slice/helpers 로직 수정 시 +1**
하면 dev 콘솔에 `[HMR] 버전 불일치` 경고가 뜬다(버전을 안 올려도 모듈 재평가 경고는 뜸).
강력 새로고침하면 사라진다.

### ⛔ 브라우저 테스트는 사용자가 시킬 때만

**Claude는 임의로 브라우저를 열어 게임을 실행·조작·캡처하지 않는다.**
사용자가 **"브라우저로 테스트해봐 / 브라우저로 확인해봐"라고 명시적으로 지시한 경우에만** 한다.

- 대상: Claude in Chrome(`mcp__claude-in-chrome__*`) 전부, Playwright/Puppeteer 등 로컬
  브라우저 구동, `window.__GAME_STORE__` 직접 조작, 캡처를 위한 게임 진행.
- **"화면 캡처해서 보여줘" 정도로 자의적으로 판단해 시작하지 말 것** (2026-07-28 실제 제지).
  기본 대응은 ① 무엇을 어떻게 확인하면 되는지 안내, ② 코드/테스트로 근거 제시.
  실물 확인이 필요하면 **사용자가 직접** 한다.
- 이유(실제 사고): ⓐ 저장된 게임(localStorage `age-of-steam-game`)을 덮어써 **사용자가
  진행 중이던 판이 날아간다**, ⓑ store 액션을 직접 호출하다 인자를 틀려(예: `issueShare`는
  `(playerId, amount)`인데 amount 누락) 현금이 `NaN`이 되는 등 **상태를 오염**시킨다,
  ⓒ 클릭→확인 왕복이 세션 시간의 대부분을 먹는데 얻는 정보는 적다.
- 화면 동작 검증의 기본은 **Vitest 단위/통합 테스트**. UI 렌더 자체가 대상이면 코드 검토와
  구조 설명으로 갈음한다.
- **지시를 받아 실제로 할 때**: ⓐ 시작 전 저장 게임을 백업하거나 사용자에게 덮어씀을 먼저
  알린다, ⓑ store 직접 호출 대신 **UI 클릭 경로**를 쓴다(앱 로직을 정상 경유), ⓒ 터보 모드
  (`localStorage 'aos-turbo'` 또는 `?turbo=1`, `src/utils/turboMode.ts` — 봇 딜레이·홀드·
  debounce 50ms 상한, 게임 로직 무변경)를 켜고 끝나면 원복, ⓓ 왕복을 줄여 한 호출에 시나리오
  구간을 묶는다.

### 프로덕션 빌드
```bash
npm run build
# 결과: out/ 디렉토리에 정적 파일 생성
```

### 테스트 실행

**단위 테스트 (Vitest)** — `npm run test:unit` 은 watch 모드이므로 1회 실행은 `npx vitest run` 사용
```bash
npx vitest run                       # 모든 단위 테스트 실행
npx vitest run src/ai/__tests__/     # AI 테스트만 실행
npx vitest run src/store/__tests__/  # Store 테스트만 실행
npx vitest run src/ai/__tests__/fullGameSimulation.test.ts -t "스트레스"      # 스트레스 테스트만
npx vitest run src/ai/__tests__/fullGameSimulation.test.ts -t "executeAITurn" # executeAITurn 경로 테스트
```

테스트 파일:
- `src/ai/__tests__/trackBuildSimulation.test.ts` - AI 트랙 건설 시뮬레이션
- `src/ai/__tests__/fullSimulation.test.ts` - 2 AI 멀티턴 트랙 건설/링크 완성 시뮬레이션
- `src/ai/__tests__/fullGameSimulation.test.ts` - 실제 gameStore 구동 전체 게임 시뮬레이션 (파산율 0%, 재정 건전성, 랜덤 시드 스트레스 테스트)
- `src/ai/__tests__/stLuciaSimulation.test.ts` - St.Lucia 2 AI 동기식 전체게임 러너 + 수익/건설 깔때기 측정 (income/VP 베이스라인 + 목표 게이트)
- `src/ai/__tests__/rustBeltSimulation.test.ts` - Rust Belt 4인(디폴트) AI 동기식 전체게임 러너(8턴) + 베이스라인
- `src/ai/__tests__/germanySimulation.test.ts` - Germany 5인(디폴트) AI 동기식 전체게임 러너(7턴) + 베이스라인
- `src/ai/__tests__/westernUsSimulation.test.ts` - Western US 5인(디폴트) AI 동기식 전체게임 러너(7턴) + 베이스라인
- `src/ai/__tests__/southernUsSimulation.test.ts` - Southern US 6인 AI 동기식 전체게임 러너(6턴) + 면화 불변식 + 베이스라인
- `src/ai/__tests__/koreaSimulation.test.ts` - Korea 4인 AI 동기식 전체게임 러너(8턴) + 베이스라인
- **다인 맵 시뮬은 모두 100시드로 측정** (8/20시드는 편차가 커 노이즈). 변경 전/후 비교 기준 수치는
  [`docs/ai-auction-baseline-100seed.md`](ai-auction-baseline-100seed.md)에 표로 저장 — AI 로직 변경 시 이 표와 비교해 회귀/개선 판정
- `src/utils/__tests__/koreaDynamicColors.test.ts` - 동적 도시 색상(cityAcceptsCube) + 한국 보드 무결성(직결 인접) 단위 테스트
- `src/utils/__tests__/moonMap.test.ts` - 달 보드 무결성(107헥스·산 28·랩 37쌍 상호성/점대칭·서동 3:3) 단위 테스트
- `src/store/__tests__/moonRules.test.ts` - 달 특수룰 store 테스트(셋업 3/4인·밤낮 수요·통과 차단·네트워크 시드·저중력 경로 확장/수입 이전·디스플레이 성장·밤낮 교대)
- `src/ai/strategy/__tests__/analyzer.test.ts` - A* 경로 탐색 테스트
- `src/ai/strategy/__tests__/selector.test.ts` - 전략 선택 테스트
- `src/ai/strategies/__tests__/buildTrack.test.ts` - 트랙 건설 전략 테스트
- `src/store/__tests__/payExpenses.test.ts` - 비용 지불/파산 테스트
- `src/store/__tests__/trackBuilding.test.ts` - 트랙 건설 메커니즘 store 레벨 테스트 (방향 전환, 교차/공존, UI 플로우)
- `src/ai/__tests__/helpers/mockState.ts` - AI 테스트용 Mock 헬퍼
- `src/utils/testHelpers.ts` - 공용 테스트 헬퍼

> **참고**: Playwright E2E 테스트(`tests/game-phases.spec.ts`)와 `/test-game` 커맨드는 제거되었습니다. 현재 테스트는 Vitest 단위/통합 테스트만 사용합니다.

### GitHub Pages 배포
- `.github/workflows/deploy.yml` 자동 배포 설정됨
- `main` 브랜치 푸시 시 자동 배포
- basePath: `/aos-showcase`

## 코드 컨벤션

### 컴포넌트 패턴
```typescript
'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

export default function ComponentName() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section ref={ref}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        {/* 내용 */}
      </motion.div>
    </section>
  );
}
```

### 애니메이션 패턴
- `useInView`로 뷰포트 진입 감지
- `initial`, `animate`, `transition` 속성 사용
- `AnimatePresence`로 언마운트 애니메이션

### Tailwind 클래스 순서
1. 레이아웃 (flex, grid)
2. 크기 (w, h)
3. 간격 (p, m, gap)
4. 배경/테두리
5. 텍스트
6. 상태 (hover, focus)
7. 애니메이션

## 게임 규칙 & 헥스 기하

- **헥스 그리드 기하** — 포인티탑 엣지 번호·직선 트랙 반대편 엣지·odd-r offset 이웃 계산 공식·0-base 좌표(정적 레퍼런스, 별도 문서): [docs/hex-geometry.md](docs/hex-geometry.md)

## Age of Steam 룰북 (Deluxe Edition 전문)

---

### 게임 구성품 (Game Pieces)

- 3개 양면 게임 보드 (Double-Sided Game Boards)
- 3개 디스플레이 보드 (Display Boards)
- 8개 마을 디스크 (Town disks - 흰색)
- 136개 트랙 타일 (Track tiles)
- 8개 신규 도시 타일 (New City tiles: 빨강 1, 파랑 1, 보라 1, 노랑 1, 검정 4)
- 110개 물품 큐브 (Goods cubes: 빨강 20, 파랑 20, 보라 20, 노랑 20, 검정 16, 흰색 14)
- 180개 트랙 소유 디스크 / 플레이어 디스크 (6색 × 25개: 파랑, 초록, 노랑, 분홍, 회색, 주황)
- 돈 (Money: $1×40, $5×40, $25×10)
- 1개 턴 트랙 마커 (Turn Track marker)
- 6개 주사위 (Dice)
- 1개 천 주머니 (Cloth Bag)

---

### 게임 설정 (Setting Up the Game)

1. 게임 보드를 펼친다 (예: Rust Belt 맵)
2. 보드 옆에 배치: 디스플레이 보드, 돈, 트랙 타일, 마을 디스크 8개, 신규 도시 타일, 주사위
3. 턴 트랙 마커를 턴 트랙의 "start" 원에 배치
4. 빨강, 파랑, 보라, 노랑, 검정 물품 큐브를 주머니에 넣음 (흰색은 Southern US 확장용)
5. 물품 디스플레이에 큐브 배치: 왼쪽 위부터 오른쪽으로, 위에서 아래로 총 52개 큐브 배치

#### 맵 설정 (Map Setup) - Rust Belt 기준

- Pittsburgh에 물품 큐브 3개 무작위 배치
- Wheeling에 물품 큐브 3개 무작위 배치
- 나머지 도시에는 각각 물품 큐브 2개씩 무작위 배치

#### 플레이어 설정 (Player Setup)

1. 각 플레이어는 색상을 선택하고 해당 색상의 둥근 나무 디스크 25개를 가져감
2. 각 플레이어는 엔진 트랙(Engine Track)의 "1 link" 칸에 디스크 배치
3. 각 플레이어는 수입 트랙(Income Track)의 "0" 칸에 디스크 배치
4. 주사위 3개를 굴려 높은 순서대로 플레이어 순서 트랙에 디스크 배치
5. 각 플레이어는 발행 주식 트랙(Issued Shares Track)의 첫 번째 칸(2 shares)에 디스크를 놓고 $10 받음
6. 각 플레이어는 선택한 행동 디스플레이 근처에 다섯 번째 디스크를 배치
7. 나머지 20개 디스크는 트랙 소유 디스크(Track Ownership Disks)로 보관

---

### 게임 종료 및 승리 (Ending/Winning the Game)

- 게임은 마지막 턴이 완료되면 종료
- 턴 수는 플레이어 수에 따라 결정됨 (턴 트랙에 표시)
- 예: 5인 게임은 7턴째 종료
- **가장 많은 승점(Victory Points)을 가진 플레이어가 승리**

---

### 게임 진행 순서 (Sequence of Play)

```
I.   Issue Shares (주식 발행)
II.  Determine Player Order (플레이어 순서 결정)
III. Select Actions (행동 선택)
IV.  Build Track (트랙 건설)
V.   Move Goods (물품 이동)
VI.  Collect Income (수입 수집)
VII. Pay Expenses (비용 지불)
VIII.Income Reduction (수입 감소)
IX.  Goods Growth (물품 성장)
X.   Advance Turn Marker (턴 마커 전진)
```

---

### I. 주식 발행 (Issue Shares)

- 플레이어는 두 가지 방법으로 돈을 받음: 철도 수입, 주식 발행
- 주식 1주 발행 시 즉시 $5 받고, 발행 주식 트랙에서 디스크 1칸 전진
- 한 턴에 여러 주 발행 가능 (각각 $5)
- 트랙이 허용하는 것보다 더 많은 주식 발행 불가
- 플레이어 순서대로 주식 발행 (1번 → 2번 → ...)
- 시작 시 받은 2주 외에 추가 발행 의무 없음

---

### II. 플레이어 순서 결정 (Determine Player Order)

1. 플레이어 순서 트랙의 디스크를 위로 밀어 올림
2. 1번 플레이어부터 새 순서를 위해 입찰 시작
3. 1번 플레이어는 $1 이상 입찰하거나, 입찰을 포기하고 마지막 위치로 이동
4. Turn Order 행동을 선택한 플레이어는 한 번 "pass" 가능
5. $0 입찰 불가
6. 나머지 플레이어는 이전 입찰보다 높은 금액을 입찰하거나 포기
7. 한 명만 남을 때까지 입찰 계속

**비용 지불:**
- 첫 번째로 포기한 플레이어: 마지막 위치, 비용 없음
- 마지막 두 플레이어: 각자 입찰 금액 전액 지불
- 나머지 플레이어: 입찰 금액의 절반 (올림) 지불

---

### III. 행동 선택 (Select Actions)

7가지 특수 행동이 있으며, 플레이어 순서대로 선택. 각 행동은 한 명만 선택 가능.

#### 1. First Move (먼저 이동)
- Move Goods 단계에서 구현
- 플레이어 순서와 관계없이 두 라운드 모두에서 먼저 물품 이동

#### 2. First Build (먼저 건설)
- Build Track 단계에서 구현
- 플레이어 순서와 관계없이 먼저 트랙 건설

#### 3. Engineer (엔지니어)
- Build Track 단계에서 구현
- 3개 대신 4개 트랙 타일 배치 가능

#### 4. Locomotive (기관차)
- 즉시 구현
- 엔진 트랙에서 디스크를 1 링크 위로 이동 (최대 6 링크)

#### 5. Urbanization (도시화)
- Build Track 단계에서 구현
- 트랙 건설 전에 마을(Town)에 신규 도시 타일 배치

#### 6. Production (생산)
- Goods Growth 단계에서 구현
- 주머니에서 물품 큐브 2개를 뽑아 물품 디스플레이의 빈 칸에 배치 (칸당 1개)
- 첫 턴에는 빈 칸이 없어 무의미

#### 7. Turn Order (턴 순서 패스)
- Determine Player Order 단계에서 구현
- 다음 플레이어 순서 결정 시 입찰 없이 한 번 "pass" 가능

---

### IV. 트랙 건설 (Build Track)

#### 게임 보드 (The Gameboard)
- 헥스 맵으로 구성
- 헥스 모양의 트랙 타일을 배치하여 도시와 마을을 연결하는 철도 링크 건설
- 일부 헥스에는 산과 강이 있어 트랙 타일 배치 비용 증가
- 오대호(Great Lakes)에는 헥스가 없어 트랙 타일 배치 불가

#### 트랙 타일 (The Track Tiles)
- 트랙 타일에는 트랙을 나타내는 선이 있음
- 대부분은 단순한 직선 또는 곡선 트랙

**단순 트랙 (Simple Track):**
- 직선 (Straight): 48개
- 급커브 (Acute Curve): 7개
- 완만한 커브 (Gentle Curve): 55개

**복합 교차 트랙 (Complex Crossing):**
- 두 개의 독립적인 트랙이 다리로 교차
- Gentle & Straight: 4개
- Two Gentle: 3개
- Two Straight: 4개

**복합 공존 트랙 (Complex Coexist):**
- 두 개의 독립적인 트랙이 다리 없이 공존
- Gentle Curves: 1개
- Left Gentle & Acute: 1개
- Right Gentle & Acute: 1개
- Straight & Acute: 1개

**전용 마을 트랙 (Dedicated Town Track):**
- 마을이 인쇄된 트랙 타일, 마을이 있는 헥스에만 배치 가능
- One Exit: 3개
- Three Exit Left: 2개
- Three Exit Right: 2개
- Three Exit, same half: 2개
- Three Exit, "Star": 2개

#### 마을에 트랙 배치
- 단순 또는 복합 트랙을 마을 헥스에 배치할 때, 마을 카운터(흰색 나무 디스크)를 트랙 타일 중앙에 배치
- 마을은 해당 마을로 들어오는 모든 트랙을 연결

#### 신규 도시 타일 (New City Tiles)
- 8개 제공 (A, B, C, D, E, F, G, H)
- Urbanization 행동을 선택한 플레이어가 배치
- 마을이 있는 헥스에만 배치 가능

#### 트랙 건설 규칙 (Building Track)

1. 플레이어 순서대로 트랙 건설
2. 최대 3개 트랙 타일 배치 (또는 교체) 가능
3. Engineer 행동 선택 시 최대 4개
4. First Build 행동 선택 시 1번 플레이어보다 먼저 건설

**첫 트랙 타일:**
- 게임 시작 시 각 플레이어의 첫 트랙 타일은 도시에 인접해야 함
- 트랙의 한쪽 끝이 도시에 연결되어야 함
- 도시 헥스에는 트랙이 표시되지 않지만, 모든 헥스 변에서 다른 모든 헥스 변으로 연결된 것으로 간주

**이후 트랙:**
- 플레이어가 건설하는 모든 트랙은 궁극적으로 해당 플레이어의 트랙을 통해 도시에 연결되어야 함

**마을에 트랙 배치:**
- 단순 및 복합 트랙 타일 모두 마을 헥스에 배치 가능
- 전용 마을 트랙 타일이거나, 마을 디스크를 올려놓아야 함

**참고:** 철도의 모든 트랙이 연결될 필요는 없음 - 분리된 링크와 구간 가능

#### 제한 사항 (Restrictions)

- 트랙이 그리드 밖으로 나가거나 오대호로 들어가도록 건설 불가
- 다른 플레이어의 트랙에 직접 연결되도록 건설 불가
- 도시 헥스에 트랙 타일 배치 불가

#### 완성된 철도 링크와 미완성 트랙 구간

**완성된 철도 링크 (Completed Railroad Link):**
- 도시 또는 마을을 다른 도시 또는 마을에 연결하는 트랙 타일 그룹
- 도시/마을이 자기 자신에게 직접 연결될 수 없음

**미완성 트랙 구간 (Unfinished Track Section):**
- 도시/마을을 다른 도시/마을에 연결하지 않는 트랙 타일 또는 그룹

#### 트랙 소유권 (Track Ownership)

- 트랙은 건설한 플레이어가 소유
- 트랙 소유 디스크를 완성된 링크 또는 미완성 구간에 배치하여 소유권 표시

**미완성 트랙 구간:**
- 플레이어가 자신의 턴에 추가 트랙 타일로 연장하지 않으면, 소유 디스크 제거되고 미소유 상태가 됨
- 다른 플레이어가 미소유 미완성 구간을 연장하면 소유권 주장 가능
- 방향 전환(Redirection)만으로는 연장으로 인정되지 않음

**완성된 철도 링크:**
- 소유권 유지를 위해 연장할 필요 없음, 소유권은 영구적

#### 트랙 교체 (Replacing Track)

- 교차, 공존, 방향 전환, 마을 진입 목적으로 트랙 타일을 다른 것으로 교체 가능
- 교체 시 지형 특성 무시 (비용 증가 없음)
- 다른 플레이어 소유 트랙 수정 불가
- 단, 다른 플레이어의 기존 트랙을 유지하면서 교체 가능
- 추가되는 새 트랙은 교체하는 플레이어에게 연결되어야 함

**교차 (Crossing):**
- 단순 트랙을 교차 트랙 타일로 교체 가능
- 두 개의 독립적인 트랙이 다리로 교차
- 기존 트랙 유지, 새 트랙은 배치 플레이어의 기존 트랙 또는 도시에 연결

**공존 (Coexisting):**
- 단순 트랙을 공존 트랙 타일로 교체 가능
- 두 개의 독립적인 트랙, 다리 없음
- 기존 트랙 유지, 새 트랙은 배치 플레이어의 기존 트랙 또는 도시에 연결

**방향 전환 (Redirection):**
- 미완성 트랙 구간 끝의 트랙 타일을 다른 것으로 방향 전환 가능
- 소유권이 있거나 미소유 상태여야 함
- 복합 트랙은 다른 플레이어 소유 트랙이 유지되도록 방향 전환해야 함
- 다른 플레이어에 의해 "막힘" 또는 "어려움"을 겪은 플레이어가 일반적으로 사용
- 마을의 트랙은 방향 전환 불가, 단 업그레이드로 더 많은 연결 허용 가능

**마을 진입 (Entering a Town):**
- 마을의 트랙 타일을 다른 것으로 교체 가능
- 기존 트랙 유지 필수

#### 신규 도시 타일 배치 (Placing New City Tiles)

- Urbanization 행동을 선택한 플레이어가 Build Track 단계에서 배치
- 아무 마을 헥스에나 배치 가능
- 배치는 무료, 여전히 3개 트랙 건설 가능
- 해당 헥스에 기존 트랙 타일이 있으면 제거
- 신규 도시 위에 신규 도시 배치 불가

#### 트랙 건설 비용 (Track Building Costs)

**배치 (Placing):**

| 타일 유형 | 평지 | 강 | 산 |
|----------|------|-----|-----|
| 단순 트랙 (Simple) | $2 | $3 | $4 |
| 복합 공존 (Complex Coexist) | $3 | $4 | $5 |
| 복합 교차 (Complex Crossing) | $4 | $5 | $6 |
| 마을 | $1 + 마을로 연결되는 트랙당 $1 |

- 지형 추가 비용은 해당 지형에 첫 타일 배치 시에만 발생, 교체/방향 전환 시에는 발생 안 함
- 가장 저렴한 마을 타일: 출구 1개 전용 마을 타일 = $2
- 가장 비싼 마을 타일: 마을 디스크가 있는 복합 트랙 = $5

**교체 (Replacing):**

| 교체 유형 | 비용 |
|----------|------|
| 단순 → 복합 교차 | $3 |
| 마을 내 교체 | $3 |
| 기타 모든 교체 | $2 |

**방향 전환 (Redirecting):**
- 모든 방향 전환: $2

---

### V. 물품 이동 (Move Goods)

1. 플레이어 순서대로 각 플레이어가 물품 큐브 1개 이동
2. 두 번째 라운드에서 다시 플레이어 순서대로 물품 큐브 1개씩 이동
3. First Move 행동 선택 시 두 라운드 모두에서 1번 플레이어보다 먼저 이동

#### 이동 규칙

- 물품은 완성된 철도 링크를 따라 이동해야 함
- **물품은 같은 색상의 도시에 도착하면 이동 종료**
- 각 도시/마을은 한 번만 방문 가능
- 같은 색상 도시에 들어가면 즉시 이동 멈춤
- **플레이어의 엔진 트랙 디스크가 허용하는 링크 수보다 많이 이동 불가**
- 이동 완료 후 큐브는 미사용 물품 주머니로 반환

#### 수입 계산

- **물품이 지나가는 각 완성된 철도 링크마다 해당 링크 소유자의 수입이 1 증가**
- 수입 트랙에서 즉시 디스크 이동
- 플레이어의 철도 수입은 단일 트랙에 기록되며, 이전 턴의 수입이 누적됨
- **다른 플레이어의 철도 사용 가능 - 해당 링크 소유자가 수입 증가를 받음**
- 수입 감소는 파산(Pay Expenses) 또는 시장 위축(Income Reduction)으로만 발생

#### 엔진 레벨 업그레이드

- 두 번의 물품 이동 기회 중 하나에서, 물품 이동 대신 엔진 트랙에서 디스크를 1 링크 위로 이동 가능
- 최대 6 링크

#### 예시

> Pete(노랑)가 1번 플레이어지만 Dave(파랑)가 First Move를 선택했으므로 Dave가 먼저 이동.
> Dave는 물품 이동 대신 엔진 트랙에서 1 링크에서 2 링크로 디스크 이동.
> Pete는 Evansville의 파랑 물품 큐브를 자신의 완성된 철도 링크를 통해 Cincinnati로 이동.
> Pete의 수입 트랙 디스크가 1 상승.
>
> 두 번째 라운드에서 Dave는 Cincinnati의 파랑 큐브를 2 링크 이동:
> 첫 번째 링크: Cincinnati → Indianapolis (마을)
> 두 번째 링크: Indianapolis → Evansville
> Dave의 수입 트랙 디스크가 2 상승.

---

### VI. 수입 수집 (Collect Income)

- 플레이어는 수입 트랙에 표시된 수입을 받음

---

### VII. 비용 지불 (Pay Expenses)

- 비용 = 발행한 주식 수(Issued Shares Track) × $1 + 기관차 링크 수(Engine Track) × $1
- 현금으로 비용 지불
- 현금 부족 시 부족한 금액만큼 수입 감소 (수입 트랙에서 디스크 이동)
- 수입이 $0 미만이 되면 **게임에서 탈락 (파산)**
  - 미완성 트랙 구간의 모든 트랙 소유 디스크 제거
  - 완성된 철도 링크 위로 물품 이동 시 수입 받지 못함
  - 모든 디스플레이에서 디스크 제거

---

### VIII. 수입 감소 (Income Reduction)

| 수입 범위 | 감소량 |
|----------|--------|
| 50 이상 | -10 |
| 41-49 | -8 |
| 31-40 | -6 |
| 21-30 | -4 |
| 11-20 | -2 |
| 0-10 | 0 |

---

### IX. 물품 성장 (Goods Growth)

1. Production 행동을 선택한 플레이어가 먼저 주머니에서 물품 큐브 2개를 뽑아 물품 디스플레이의 빈 칸에 배치
2. 게임 시작 시 플레이어 수만큼 주사위 굴림
3. 물품 디스플레이의 각 열에 대해, 해당 열 번호와 일치하는 주사위 결과 수만큼 물품 큐브를 위에서 아래로 가져와 해당 도시에 배치
4. 신규 도시 타일이 맵에 있으면 물품 배치, 맵에 없으면 배치 안 함
5. 도시 열의 물품 수보다 더 많은 주사위가 나오면 초과분은 무시

---

### X. 턴 마커 전진 (Advance Turn Marker)

- 턴 트랙에서 턴 마커 전진
- 마지막 턴(예: 5인 게임의 7턴) 후 승점 계산으로 진행
- 마지막 턴이 아니면 Issue Shares 단계로 돌아가 새 턴 시작

---

### 승점 계산 (Victory Point Computations)

- **수입 트랙 위치 × 3점**
- **완성된 철도 링크의 각 트랙 구간당 +1점** (트랙 타일 사이, 도시/마을 사이의 구분으로 계산)
- **발행한 주식 수 × -3점**
- 돈은 게임 종료 시 가치 없음 (도구일 뿐)

**가장 많은 승점을 가진 플레이어가 승리. 동점 가능.**

---

### 플레이어 색상

```typescript
const PLAYER_COLORS = {
  yellow: '#f0c040',  // 노란색
  blue: '#4080c0',    // 파란색
  green: '#40a060',   // 초록색
  red: '#e05050',     // 빨간색
  pink: '#e080a0',    // 분홍색
  gray: '#808080',    // 회색
  orange: '#f08030',  // 주황색
};
```

### 도시 색상 (물품 색상)

```typescript
const CITY_COLORS = {
  red: '#c41e3a',     // 빨강 도시
  blue: '#1e5aa8',    // 파랑 도시
  yellow: '#d4a017',  // 노랑 도시
  purple: '#6b3fa0',  // 보라 도시
  black: '#2d2d2d',   // 검정 도시
};
```

---

### 추가 맵 규칙 (Additional Map Rules)

#### Western U.S.

**설정:**
- 모든 도시에 물품 큐브 2개, 각 마을에 1개 배치
- 마을이 도시화되면 해당 물품은 주머니로 반환
- 각 플레이어는 $20, 2주 발행으로 시작 (추가 $10은 개인 재산)

**물품 이동:**
- 마을의 물품도 도시의 물품처럼 이동 가능 (보충 안 됨)
- 동부 도시에서 서부 도시로 (또는 반대로) 물품 이동 시 $1 보너스
- 동부 도시: Duluth, Minneapolis, Des Moines, St. Louis, Memphis, Vicksburg, New Orleans (Kansas City 도시화 시 동부)
- 서부 도시: Seattle, San Francisco, Los Angeles (Portland, San Diego 도시화 시 서부)

**트랙 건설:**
- 시작 서부/동부 도시에서 시작해야 함 (Denver, Salt Lake City, 신규 도시화 도시 제외)
- 늪과 강: $4, 산: $5
- 서부-동부 도시 연결 전까지 철도의 모든 트랙은 연속적이어야 함

**대륙횡단 철도:**
- 서부 시작 도시와 동부 시작 도시가 연결되면 대륙횡단 철도 실현
- 1개 철도로 연결: 해당 철도 수입 즉시 +$4
- 2개 철도로 연결: 각 철도 수입 즉시 +$2
- 3개 이상: 연결 트랙 배치 플레이어가 2개 철도 선택하여 각 +$2

**승리:** 동점 불가. 동점 시 순서: 현금 > 트랙 수 > 주사위

#### Southern U.S.

**역사적 배경:** 남부는 농업 사회, 면화가 주요 화물. 4턴에 남북전쟁 발생, Atlanta 파괴.

**설정:**
- 모든 마을에 흰색 큐브(면화) 배치
- Atlanta: 물품 큐브 4개, Charleston/Savannah/Mobile/New Orleans: 각 3개, 기타 도시: 각 1개

**행동:** 면화가 있는 마을이 도시화되면 면화 큐브는 신규 도시에 배치

**물품 이동:**
- 면화 큐브는 4대 항구(Charleston, Savannah, Mobile, New Orleans) 중 하나에 도착하면 이동 종료
- 면화 큐브는 추가 보너스 +1 수입 제공
- 배달 후 면화 큐브는 게임에서 제거

**물품 성장:** 1-4턴에 Atlanta는 매 턴 물품 큐브 1개 추가 (주머니에서 직접)

**수입 감소:** 4턴에 수입 감소 2배

#### Germany

**녹색 헥스:** 외국 터미널. 물품 생산 안 함, 통과 불가, 각각 한 종류의 물품만 수용.

**설정:**
- 모든 도시에 물품 큐브 2개 (Königsberg: 3개, Wien: 4개)
- 녹색 헥스의 흰색 칸에 물품 큐브 1개 배치 (수용할 물품 유형)

**행동:** Engineer 행동 변경 - 트랙 1개를 절반 비용(올림)으로 배치

**트랙 건설:**
- 미완성 트랙 구간 건설 불가, 완성된 링크만 건설 가능
- 사각형 숫자 = 해당 헥스에 단순 트랙 배치 비용
- Köln/Düsseldorf와 Essen/Dortmund 사이 직접 링크 가능: $2, 흰색 원에 소유 마커

**물품 성장:** Berlin은 항상 물품 큐브 1개 추가 (주머니에서)

#### Barbados (솔로 게임)

**설정:**
- 보라 큐브, 신규 도시 E/F/G/H 제거
- 물품 디스플레이 상단 행(1-6, A-D)에 큐브 배치 (A에 빨강, B에 파랑 나오면 교체)
- 각 노랑 도시에 큐브 1개 배치 (쉬운 모드: 2개)

**주식 발행:** 턴당 1주만 발행 가능
**플레이어 순서:** 이 단계 생략
**행동 선택:** Engineer, Locomotive, Urbanization, Production만 가능. 선택 시 마커 배치, 4개 모두 선택 후 마커 제거. 매 턴 1개 행동 선택 필수.
**물품 성장:** 매 턴 주사위 2개
**게임 종료:** 10턴 완료 후, 현금으로 모든 주식을 $5에 환매. 환매 불가 시 패배. 남은 돈 = 최종 점수.

#### St. Lucia (2인 전용)

**설정:** 각 평지 녹색 헥스와 강 헥스에 큐브 1개 무작위 배치

**플레이어 순서:** Issue Shares 전에 진행. 경매 대신 번갈아가며 진행. 먼저 가는 플레이어는 $5 지불. 거부 시 상대방이 $5 지불 옵션. 둘 다 거부 시 무료로 먼저 진행.

**행동 선택:** Production 불가. Turn Order는 다음 플레이어 순서 단계에서 1번으로 간주 (여전히 $5 필요).

**트랙 건설 및 물품 이동:** 트랙 건설 시 해당 헥스의 큐브를 트랙 위에 배치. 해당 큐브는 이제 배달 가능 (완성된 링크가 아니어도). 미완성 링크도 소유자에게 보너스 수입 1 제공.

**물품 성장:** 이 단계 생략
**게임 종료:** 8턴 완료 후

#### Montréal Métro (3인 전용, Michael Webb 2007)

**용어:** Station=도시, Stop=마을, Passenger=화물, 마스터 네트워크=보드 위 모든 트랙의 총합.

**설정:** 도시별 표기 수만큼 화물 배치 (Berri-UQAM 6 ~ Henri-Bourassa 3), 신규 도시 타일 8개에 화물 1개씩. 물품 디스플레이 미사용. 중립색 마커 9개 = 정부 트랙용. 9라운드.

**정부 링크:** 매 라운드 주식 발행 전, 정부 관리 플레이어(셋업 순번 1st→2nd→3rd 로테이션)가 중립 링크 1개를 무료 건설 (타일 최대 3, 미완성 금지, 마스터 네트워크 연속 — 첫 링크만 예외, Berri-UQAM 포함 권장). 정부 링크는 누구나 이용하나 수입 없음.

**마스터 네트워크:** 보드 위 모든 트랙(정부 포함)의 총합은 항상 연속이어야 한다.

**행동 변경:** Locomotive = 정부 전용 엔진(DGEL) +1 (배달 때 DGEL만큼 정부 링크 추가 이용, 비용에 합산, 올리는 유일한 방법 — 일반 엔진은 수송 기회 교환으로만). Production → Repopulation = 선택 즉시 주머니에서 3개 뽑아 1개를 맵에 배치.

**경매:** 무입찰 패스 2인 이상이면 그들은 이번 라운드 특수 행동 선택 불가.

**건설 비용:** 평지 $2 / 언덕 $3 / 도로 $4 / 물 $6 (Jean-Drapeau 우측 1곳만 $5). Parc Mont-Royal 3헥스(굵은 외곽선) 관통 불가.

**물품 성장:** 이 단계 없음
**비용:** 주식 + 일반 엔진 + DGEL
**게임 종료:** 9라운드 완료 후

---

## 참고 링크

- **라이브 사이트**: https://krindale.github.io/aos-showcase/
- **GitHub**: https://github.com/krindale/aos-showcase
- **BoardGameGeek**: https://boardgamegeek.com/boardgame/4098/age-steam
- **룰북**: Age of Steam Deluxe Edition Rulebook


### 트러블슈팅 로그

#### 브라우저 도구 429 Too Many Requests 오류 (참고 — 지금은 브라우저 사용 자체가 제한됨)
- **증상**: `browser_subagent` 도구 실행 시 지속적인 429 오류 발생하며 브라우저 실행 불가.
- **원인**: 로컬 서버(`curl` 테스트 결과 200 OK)가 아닌, 에이전트 도구 시스템의 네트워크 요청 빈도 제한(Rate Limiting)에 걸린 것으로 추정됨.
- **해결책**: 대기(Cool-down) 후 재시도. ⚠️ 단 브라우저 구동은 **사용자가 명시적으로 지시한
  경우에만** 한다 → [⛔ 브라우저 테스트는 사용자가 시킬 때만](#-브라우저-테스트는-사용자가-시킬-때만)
