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
│   └── calculator/
│       └── page.tsx            # 계산기 (트랙 비용, 승점, 수입 시뮬레이터)
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
│   │   ├── moveGoods.ts        # Phase V: 물품 이동 (긴 링크 우선 + 가로채기 방어)
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
│       ├── rustBeltSimulation.test.ts    # Rust Belt 5인 AI 동기식 전체게임 러너 + 베이스라인
│       ├── germanySimulation.test.ts     # Germany 4인 AI 동기식 전체게임 러너(8턴) + 베이스라인
│       ├── westernUsSimulation.test.ts   # Western US 6인 AI 동기식 전체게임 러너(6턴) + 베이스라인
│       ├── southernUsSimulation.test.ts  # Southern US 6인 AI 동기식 전체게임 러너(6턴) + 면화 불변식 + 베이스라인
│       ├── koreaSimulation.test.ts       # Korea 4인 AI 동기식 전체게임 러너(8턴) + 베이스라인
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
│       └── KoreaMapProfile.ts     # Korea override (동적색은 board플래그/도시화 디스플레이보충/no-growth/큐브수)
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
│       ├── MoveCubeOverlay.tsx # 화물 이동·AI 건설 중 보드 미니맵 (모든 맵, 우측 하단 fit)
│       ├── PhaseTransition.tsx # 단계 전환 안내 팝업 (마지막 플레이어 행동 확인용, pointer-events-none 순수 안내)
│       ├── OnlineLobby.tsx     # 온라인 로비/대기실 (방 만들기·코드 입장·좌석·공개방·빠른매칭)
│       ├── GameChat.tsx        # 게임 중 플로팅 채팅 (보드 우측 하단 sticky, 닫힘 시 알림음)
│       ├── BottomSheet.tsx     # 모바일용 드래그 바텀 시트 (반응형)
│       └── CollapsiblePanel.tsx    # 태블릿용 접이식 사이드 패널 (반응형)
│
├── net/                        # 온라인 멀티 (Supabase Realtime + 호스트 권위) — gameStore와 단방향(net→store)
│   ├── types.ts                # 전송 계층 인터페이스 (RoomInfo·IntentMessage·SnapshotMessage·NetTransport)
│   ├── supabaseTransport.ts    # Supabase 구현 (채널·rooms 테이블·presence·하트비트·방 폐쇄)
│   ├── snapshotCodec.ts        # 게임 상태 gzip+base64 인코딩 (ui/aiExecution 제외, movingCube 승격)
│   ├── intents.ts              # 커밋 액션 카탈로그(INTENT_SPECS)+게스트 몽키패치 가드+호스트 검증
│   ├── netStore.ts             # 세션 오케스트레이션 (호스트 루프·스냅샷 적용·재연결·승계·좌석)
│   ├── roomLogic.ts            # 좌석 배정·호스트 승계 순수 규칙 (단위 테스트 대상)
│   ├── index.ts                # 엔트리 (getTransport·getClientId·isNetConfigured)
│   └── __tests__/              # 코덱/가드/검증/좌석·승계 규칙 27개
│
├── hooks/                      # 반응형 UI 커스텀 훅
│   ├── useMediaQuery.ts        # 미디어 쿼리 브레이크포인트 감지
│   ├── useOrientation.ts       # 가로/세로 방향 감지
│   └── useTouchGestures.ts     # 터치 제스처 (핀치 줌, 팬)
│
├── store/                      # 상태 관리 (2026-07-03 slice 분리 — 전부 "코드 그대로 이동", 로직 무변경)
│   ├── gameStore.ts            # 오케스트레이션 허브 (1,480줄): GameStore 인터페이스(계약)·initGame/resetGame·
│   │                           #   executeAITurn·issueShare·selectAction·nextPhase/endTurn·undoLastAction·
│   │                           #   placeNewCity·addLog·persist 설정 + slice 합성(...createXxxSlice(set, get))
│   ├── helpers/                # 모듈 레벨 헬퍼 (set/get 클로저 밖 순수 함수)
│   │   ├── undo.ts             # 실행 취소 스냅샷 스택(undoSnapshots 싱글턴)·captureUndo·getUndoLabel
│   │   ├── boardRules.ts       # crossesBlockedEdge·findMissingTownSpurs·releaseUnextendedTrack·removeIncompleteNewTracks
│   │   ├── setup.ts            # createInitialGameState·drawBalancedCubes·TUTORIAL_GAME_CONFIG·AIPlayerConfig
│   │   ├── transcontinental.ts # computeTranscontinental (Western US 대륙횡단 감지)
│   │   └── aiScheduler.ts      # AI 실행 락·컨텍스트 검증·scheduleAICheck (150ms debounce)
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
    ├── rustBeltMap.ts          # Rust Belt 맵 데이터 정의 (5인 전용, flat-top 전치, 좌표 0-base)
    ├── germanyMap.ts           # Germany 맵 데이터 정의 (4인 전용, flat-top 전치, 터미널/고정비용/직결)
    ├── westernUsMap.ts         # Western US 맵 데이터 정의 (6인 전용, pointy-top 네이티브, 마을큐브/지형fixedCost/동서region)
    ├── southernUsMap.ts        # Southern US 맵 데이터 정의 (6인 전용, flat-top 전치, 면화/4대 항구/애팔래치아)
    ├── koreaMap.ts             # Korea 맵 데이터 정의 (4인 전용, flat-top 전치, 동적색 플래그/산fixedCost/수원 직결)
    ├── mapRegistry.ts          # 맵 룰 분리 레지스트리 (MapRuleConfig·columnMapping·boardDisplayScale 등)
    ├── debugConfig.ts          # 디버그 설정 (로그 카테고리 토글 + logAction 종합 액션 로깅)
    ├── pwaUtils.ts             # Service Worker 등록/관리 유틸리티
    ├── safeTimers.ts           # Web Worker 기반 타이머 (백그라운드 탭 스로틀 회피, Worker 불가 시 setTimeout 폴백)
    └── testHelpers.ts          # 단위 테스트 헬퍼 함수

public/
├── manifest.json               # PWA 매니페스트
├── sw.js                       # Service Worker (오프라인 캐시)
├── icons/                      # PWA 아이콘
└── maps/                       # 맵 이미지

docs/
├── ai-system.md                # AI 시스템 상세 (의사결정 알고리즘·Phase별 결정·맵별 구현/밸런싱 이력·디버깅)
├── game-rules.md               # Age of Steam 룰북 전문 (구성품·진행 순서·비용표·맵별 규칙)
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
설명 + 플레이 버튼(`/game/<slug>/`). 튜토리얼 포함 8개 맵, Barbados만 "준비 중".

**맵 이미지는 WebP** (`public/maps/*.webp`, 폭 1600·q84, 맵당 ~200KB). 새 맵 추가 시 원본을
`cwebp -q 84`(필요 시 폭 1600 다운스케일)로 변환해 넣을 것 — `unoptimized: true`(static export)라
Next가 압축을 안 하므로 원본 대용량 PNG를 그대로 받으면 갤러리가 무거워진다 (PNG 기준 맵당 1~5MB).
게임 보드는 SVG 렌더라 이 이미지와 무관(갤러리 표시용일 뿐).

7개 맵 갤러리:
- **Rust Belt** (기본) - 미국 북동부
- **Korea** (플레이 가능) - 한반도, 동적 도시 색상, 4인 8턴 (도시 수요색=현재 큐브색·수원 직결 링크·신도시 회색)
- **Western U.S.** (플레이 가능) - 대륙횡단 철도, 6인 6턴 (마을 큐브·동서 배달 보너스·대륙횡단 연결 보너스)
- **Southern U.S.** (플레이 가능) - 면화 운송, 6인 6턴 (마을 면화→4대 항구 배달·Atlanta 호황·4턴 남북전쟁 수입감소 2배)
- **Germany** (플레이 가능) - 외국 터미널·헥스 고정비용·도시 직결, 4인 8턴
- **Barbados** - 솔로 게임
- **St. Lucia** - 2인 전용

## 온라인 멀티플레이 (`src/net/`, 2026-07-04)

Supabase Realtime + **호스트 권위** 동기화. 종합 설계·비용·조정 내역은
[`docs/online-multiplayer-plan.md`](docs/online-multiplayer-plan.md) 참조. Phase 0~5 완료:
방 코드 초대·재접속(F5 자동 재입장/호스트 승계)·게임 중 채팅·공개방 목록·빠른 매칭.

- **구조**: 방장 클라이언트만 gameStore를 진짜로 실행(랜덤·AI 포함). 게스트는 intent만 보내고
  호스트가 기존 액션으로 검증·실행 후 압축 스냅샷(persist 포맷, logs 30개·ui 제외, gzip+base64)을
  브로드캐스트 + rooms 테이블에 저장(재접속·승계용). **gameStore는 net을 모른다** — 의존은
  net → store 단방향 (자체 서버로 갈아탈 땐 net만 교체).
- **파일**: `types.ts`(인터페이스) `supabaseTransport.ts`(채널·rooms·presence)
  `snapshotCodec.ts` `intents.ts`(커밋 액션 카탈로그+게스트 몽키패치 가드+호스트 검증)
  `netStore.ts`(세션 오케스트레이션) `roomLogic.ts`(좌석 배정·승계 순수 규칙).
  UI: `OnlineLobby.tsx`(로비/대기실) `GameChat.tsx`(플로팅 채팅), GamePageClient 통합.
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
- **비용/티어**: 친구 규모(동시 수 판 이하)는 **$0**. Free 티어 동시접속 200·메시지 200만/월·
  egress 5GB. 유일한 불편은 **1주 미접속 시 프로젝트 자동 정지**(대시보드에서 수동 재개) — 공개
  서비스로 키우면 Pro $25/월.
- **보안**: 브라우저에 들어가는 건 URL + anon(publishable) key뿐(공개 전제 키). **Service Role
  Key는 절대 클라이언트/저장소에 넣지 않는다**(RLS 우회 관리자 키). anon만 쓰면 모든 클라이언트가
  Supabase 입장에서 동일 익명 사용자라 "참가자/호스트 구분" RLS는 불가 → 시작은 허용형 RLS(방
  코드를 아는 사람만 찾는 모델, 친구 규모 수용). 강화는 익명 로그인 도입 시(후순위).
- **알려진 한계(설계상 수용)**: ① 치팅 방어 없음(호스트가 클라이언트 — 친구용) — 필요 시 net만
  자체 서버로 교체해 서버 권위 승격. ② 게스트로 온라인 플레이 시 로컬 싱글 저장(persist)이 스냅샷에
  덮임. ③ 공개방 인원 수는 presence 미반영(나간 좌석도 착석 집계 가능). ④ 종료(finished) 방 자동
  정리 미구현(수동 SQL).
- **배포**: `.env.local`(로컬) / deploy.yml env(배포)에 NEXT_PUBLIC_SUPABASE_URL·ANON_KEY.
  미설정 배포(포크)는 온라인 탭이 자동으로 숨음(`isNetConfigured`). DB 스키마·RLS·grant는
  `supabase/setup.sql`(Supabase MCP `apply_migration`으로 적용). 공개방 목록은 8초 폴링(+수동
  새로고침), 대기실 45초 하트비트(touchRoom)로 유령 방 필터(updated_at 2분).
- **검증**: `npx vitest run src/net/__tests__/` (코덱/가드/검증/좌석·승계 규칙 27개) +
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

**수입 계산 (링크 기반)**
- 물품이 지나가는 각 철도 링크(도시/마을 → 도시/마을)마다 해당 링크 소유자 수입 +1
- 트랙 타일 수가 아닌 링크 수로 계산

**경매 시스템**
- `placeBid()`: 입찰
- `passBid()`: 포기 (탈락)
- `skipBid()`: Turn Order 패스 (탈락 없이 다음 입찰자로)
- `lastActedPlayer`: 마지막 행동 플레이어 추적

**7가지 특수 행동**
- First Move, First Build, Engineer, Locomotive, Urbanization, Production, Turn Order

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
- **생산(Production) 기회 보장 (룰북 IX)**: goodsGrowth 진입 시 사람(비AI) 생산 선택자를
  `currentPlayer`로 설정 — ProductionPanel이 currentPlayer가 선택자일 때만 렌더되기 때문. 이 경우
  `currentPlayer`가 사람이라 `runAIAutoPhase`는 no-op → 사람이 직접 주사위/생산을 진행한다. 반면
  **생산 선택자가 없거나 봇이면 `currentPlayer`가 봇이 되어 `runAIAutoPhase`가 주사위를 자동으로
  굴려 통과**한다(위 "봇 자동 단계 진행" 참조). 봇 생산 선택자의 실제 주머니 뽑기는 여전히 미구현.
- 회귀 테스트: `src/store/__tests__/productionAndBagReturn.test.ts` (5개 맵 × 생산 진입 + 주머니 반환).
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

**봇 자동 단계 진행(`runAIAutoPhase`)**: 봇은 "결정"이 필요한 행동 5단계(`PLAYER_ACTION_PHASES` = issueShares·determinePlayerOrder·selectActions·buildTrack·moveGoods)만 `executeAITurn`으로 진행하고, 결정이 필요 없어 원래 사람이 '진행'/'주사위' 버튼으로 넘기던 **정산·물품성장 단계(`AI_AUTO_ADVANCE_PHASES` = collectIncome·payExpenses·incomeReduction·goodsGrowth·advanceTurn)는 `currentPlayer`가 봇이면 `runAIAutoPhase`로 자동 통과**한다 (`scheduleAICheck`의 두 번째 분기). 정산은 자동 `nextPhase`, goodsGrowth는 **봇이 주사위를 자동으로 굴려**(활성 플레이어 수만큼 1~6) `growGoods` 후 진행. 사람이 `currentPlayer`면 no-op이라 사람 차례 정산은 '진행' 버튼 수동 유지. 온라인에서 끊긴 게스트를 봇 전환했을 때 이 단계들에서 진행 주체가 사라져 교착되던 것을 자동화한 것(오프라인 봇 게임도 동일 적용 — 봇이 경매 1등인 턴의 정산/물품성장이 자동으로 넘어감). ⚠️ **`runAIAutoPhase`는 `executeAITurn`과 함께 `intents.ts`에 `guestNoop`으로 등록** — 게스트에서 돌면 봇 자동화가 로컬 실행돼 디싱크(AI는 호스트에서만).

**항상 지킬 규칙 (함정)**:
- **맵 분기 금지**: `mapId === 'x'` 하드코딩 대신 `MapProfile` override / `mapConfig` 테이블. 새 맵은 프로파일만 추가.
- **다인 맵 측정은 100시드**: 8/20시드는 편차가 커 결론이 뒤집힌다. 변경 전/후 비교 기준은 [docs/ai-auction-baseline-100seed.md](docs/ai-auction-baseline-100seed.md). 회귀 의심 시 `git stash`로 직전 코드를 같은 환경에서 재측정해 비교.
- **동적색/특수 큐브는 `cityAcceptsCube`(hexGrid) 한 곳으로** — 배달 경로탐색뿐 아니라 AI 경로 평가(`vp.ts`/`buildTrack.ts`)도 이 헬퍼로 도시 수요색을 봐야 한다.
- **기각 실험도 선행조건이 바뀌면 뒤집힌다** — 막다른 길을 영구 배제하지 말 것(악화 기록은 당시 조건 한정).
- **주식 보존 법칙**: 투자(발행)를 줄이는 방향은 대체로 역효과 — income 레버만 건드린다.

**디버깅**: 개발 서버 실행 중엔 화면 묘사 대신 **:3999 로그 서버**에서 `logAction` JSON을 확인하며 추적(예: `"c":"trackBuilding"` grep). ⚠️ 로그는 메모리 버퍼라 **로그 서버 재시작 금지**(이전 게임 로그 소실), 읽기만. 콘솔 헬퍼 `debugAI`/`getAIReport`/`setDebug`.

**게임 엔진 메커니즘 (현재 동작)**:
- **마을 가닥(스퍼) 모델**: 마을 헥스엔 타일 배치 불가 — 원→변 가닥(`buildTownSpur`)으로 연결. 타일 1개=1카운트, 가닥은 그 마을을 이번 턴 처음 변경할 때만 1카운트(가닥 개수 무관). 이동/완성/배달 판정은 가닥 있는 변으로만.
- **건설 제한**: 턴당 3개(Engineer 4). 모든 건설 경로(buildTrack/복합/방향전환/마을가닥)가 `builtTracksThisTurn` 카운트 검사.
- **실행/선택 취소**: `undoLastAction`(확정 행동 스냅샷 복원, `nextPhase`마다 초기화·사람 전용) / `cancelSelection`(커밋 전 UI 선택만). 새 커밋 액션 추가 시 검증 통과 직후 `captureUndo(state, label)` + set에 `undoCount` 포함.

**상세 — 의사결정 알고리즘 전문·Phase별 결정·맵별 구현 및 밸런싱 이력·디버깅 시스템·기각 실험 기록**: [docs/ai-system.md](docs/ai-system.md)

## 빌드 & 배포

### 개발 서버
```bash
npm run dev
```

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
- `src/ai/__tests__/rustBeltSimulation.test.ts` - Rust Belt 5인 AI 동기식 전체게임 러너 + 베이스라인
- `src/ai/__tests__/germanySimulation.test.ts` - Germany 4인 AI 동기식 전체게임 러너(8턴) + 베이스라인
- `src/ai/__tests__/westernUsSimulation.test.ts` - Western US 6인 AI 동기식 전체게임 러너(6턴) + 베이스라인
- `src/ai/__tests__/southernUsSimulation.test.ts` - Southern US 6인 AI 동기식 전체게임 러너(6턴) + 면화 불변식 + 베이스라인
- `src/ai/__tests__/koreaSimulation.test.ts` - Korea 4인 AI 동기식 전체게임 러너(8턴) + 베이스라인
- **다인 맵 시뮬은 모두 100시드로 측정** (8/20시드는 편차가 커 노이즈). 변경 전/후 비교 기준 수치는
  [`docs/ai-auction-baseline-100seed.md`](ai-auction-baseline-100seed.md)에 표로 저장 — AI 로직 변경 시 이 표와 비교해 회귀/개선 판정
- `src/utils/__tests__/koreaDynamicColors.test.ts` - 동적 도시 색상(cityAcceptsCube) + 한국 보드 무결성(직결 인접) 단위 테스트
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

## 게임 규칙 & 헥스 기하 (레퍼런스)

정적 레퍼런스라 별도 문서로 분리(항상 로드 불필요, 필요할 때 참조).

- **Age of Steam 룰북 전문** — 구성품·게임 설정·진행 순서(10단계)·트랙 건설 비용표·승점 계산·맵별 추가 규칙(Western/Southern/Germany/Barbados/St.Lucia): [docs/game-rules.md](docs/game-rules.md)
- **헥스 그리드 기하** — 포인티탑 엣지 번호·직선 트랙 반대편 엣지·odd-r offset 이웃 계산 공식·0-base 좌표: [docs/hex-geometry.md](docs/hex-geometry.md)

## 참고 링크

- **라이브 사이트**: https://krindale.github.io/aos-showcase/
- **GitHub**: https://github.com/krindale/aos-showcase
- **BoardGameGeek**: https://boardgamegeek.com/boardgame/4098/age-steam
- **룰북**: Age of Steam Deluxe Edition Rulebook


### 트러블슈팅 로그

#### 브라우저 도구 429 Too Many Requests 오류
- **증상**: `browser_subagent` 도구 실행 시 지속적인 429 오류 발생하며 브라우저 실행 불가.
- **원인**: 로컬 서버(`curl` 테스트 결과 200 OK)가 아닌, 에이전트 도구 시스템의 네트워크 요청 빈도 제한(Rate Limiting)에 걸린 것으로 추정됨.
- **해결책**:
    1. `browser_subagent` 사용을 일시 중단하고 충분한 대기 시간(Cool-down)을 가짐.
    2. Playwright 등 로컬 브라우저 구동 방식을 대안으로 사용 (현재는 사용자 요청으로 사용 금지됨).
