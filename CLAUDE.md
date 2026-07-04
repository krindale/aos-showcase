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
│       ├── BottomSheet.tsx     # 모바일용 드래그 바텀 시트 (반응형)
│       └── CollapsiblePanel.tsx    # 태블릿용 접이식 사이드 패널 (반응형)
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
    └── testHelpers.ts          # 단위 테스트 헬퍼 함수

public/
├── manifest.json               # PWA 매니페스트
├── sw.js                       # Service Worker (오프라인 캐시)
├── icons/                      # PWA 아이콘
└── maps/                       # 맵 이미지

docs/
├── ai-strategy.md              # AI 전략 알고리즘 심층 가이드
├── ai-auction-baseline-100seed.md  # ★ AI 다인 맵 성능 베이스라인(100시드) — 로직 변경 시 비교 기준(VP·파산·선공/승자 분포)
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
- **⚠️ 타이머는 전부 `src/utils/safeTimers.ts`(safeTimeout/safeInterval)**: 크롬은 숨김 탭의
  setTimeout을 최소 1초로 스로틀 → 봇 진행·스냅샷 전송이 3~4배 느려지거나 멈춘다(실측). Web Worker
  타이머라 스로틀 없음, vitest/SSR에선 setTimeout 폴백. 봇 행동 간격 ≈1.5초(debounce 150 +
  `AI_TURN_DELAY` 1350). 넷/게임 진행/이동 정산 타이머 전부 이걸 쓸 것.
- **마지막 플레이어 확인 딜레이**(`AI_ACTION_VIEW_DELAY` 1200, gameStore): 봇/사람이 **단계의
  마지막 플레이어** 행동으로 넘어갈 때만 그 결과를 화면에 잠시 보여준 뒤 진행(중간 봇은 즉시).
  스냅샷 쪽도 `PHASE_CHANGE_HOLD` 1200으로 단계 전환 스냅샷을 홀드해 게스트도 동일하게 본다.
- **게스트 이동 애니메이션 동기화**(`netMovingCube`, snapshotCodec): `ui.movingCube`를 스냅샷에
  승격해 게스트도 호스트와 같은 화물 이동 애니메이션을 본다(정산은 호스트 타이머 전용, 게스트
  completeCubeMove는 noop). 이동 시작 스냅샷이 도착하면 게스트 로컬 안내(골드 점선/선택/목적지)도 정리.
- **⚠️ 새 커밋 액션 추가 시**: gameStore에 게임 상태를 바꾸는 액션을 추가하면
  `intents.ts`의 `INTENT_SPECS`에도 등록해야 온라인에서 동작한다 (게스트가 로컬 실행해버려
  디싱크). 커밋이 로컬 ui 선택값을 읽으면 `captureUi`에 그 필드를 지정 — **can계열 검증이
  읽는 ui 필드까지 전부** (placeNewCity가 selectedNewCityTile만 보내고 canPlaceNewCity가
  요구하는 urbanizationMode를 빠뜨려 "게스트 도시화가 계속 사라지는" 실버그가 났었다:
  호스트 거부 → 정정 스냅샷이 낙관 배치를 되돌림). 호스트는 주입한 ui 키를 실행 후 원값으로
  **복원**한다 — 안 하면 거부 후에도 게스트 선택이 호스트 화면에 남는다(코드리뷰 수정).
- **함정 기록**: ① 경매 입찰 차례는 `currentPlayer`가 진실 — `auction.currentBidder`는 갱신
  안 되는 레거시 필드(검증에 쓰면 정상 입찰 거부). ② intent는 멱등성 id로 중복 실행 차단(채널
  재조인 재전송 대비). ③ clientId는 sessionStorage(탭별) — F5 좌석 자동 복원 + 한 PC 두 탭 가능.
  ④ 수송 정산은 호스트 GameBoard의 1000ms `safeTimeout`(completeCubeMove) — 게스트에선 guestNoop.
  ⑤ 호스트 승계 직후(6초 경계) 옛 호스트 복귀 = 이중 호스트 경합 → `onRoom`에서 방 메타의
  hostClientId가 내가 아니면 게스트로 강등(코드리뷰 수정). ⑥ 채널 구독이 SUBSCRIBED도 에러도
  못 받으면 입장이 무한 대기 → 15초 타임아웃(코드리뷰 수정).
- **채팅**(`GameChat.tsx`): 게임 보드 우측 하단 sticky 호버링(보드가 화면보다 길면 뷰포트 하단에
  따라붙음), 닫혀 있을 때 새 메시지 도착 시 Web Audio로 "딩동" 알림음(외부 파일 없음). 목록
  스크롤은 컨테이너 내부만 — scrollIntoView는 페이지 전체를 끌어당겨 금지.
- **배포**: `.env.local`(로컬) / deploy.yml env(배포)에 NEXT_PUBLIC_SUPABASE_URL·ANON_KEY.
  anon(publishable) key는 번들 공개 전제, 접근 제어는 RLS(`supabase/setup.sql`).
  미설정 배포(포크)는 온라인 탭이 자동으로 숨음(`isNetConfigured`).
- **검증**: `npx vitest run src/net/__tests__/` (코덱/가드/검증/좌석·승계 규칙 27개) +
  두 브라우저 탭 E2E(방 생성→입장→시작→건설/수송/경매/도시화 왕복→F5 재접속→호스트 승계).

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

**배달 큐브 주머니 반환 + 생산 기회 보장 (2026-07-03, 실플레이 룰북 버그 수정)**
- **주머니 반환 (룰북 V)**: "이동 완료 후 큐브는 미사용 물품 주머니로 반환" — `completeCubeMove`가
  반환 없이 큐브를 소멸시켜 주머니가 게임 진행에 따라 고갈됐다(생산·Berlin 보너스·한국 도시화 보충이
  어긋남). 일반 배달·마을 큐브·트랙 큐브 모두 `ui.movingCube` → `completeCubeMove` 경로라 이 한 곳에서
  `goodsDisplay.bag`에 반환. 100시드 영향: Korea +0.7 VP·Germany −0.85(게이트 내), Rust/Western 불변.
- **생산(Production) 기회 보장 (룰북 IX)**: goodsGrowth 진입 시 `currentPlayer`가 무조건
  `playerOrder[0]`이라, 생산 선택자가 경매 1등이 아니면 ProductionPanel(= currentPlayer가 선택자일
  때만 렌더)이 안 떠 **모든 맵에서 생산이 통째로 스킵**됐다(독일 실플레이에서 발견). `nextPhase`의
  goodsGrowth 진입에서 사람(비AI) 생산 선택자를 currentPlayer로 설정 — goodsGrowth는 AI 스케줄러
  대상이 아니므로(PLAYER_ACTION_PHASES 제외) AI 선택자는 기존대로 둔다.
- 회귀 테스트: `src/store/__tests__/productionAndBagReturn.test.ts` (5개 맵 × 생산 진입 + 주머니 반환).

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

**AI 실행 흐름 (실제 게임)**

```
initGame/resetGame → scheduleAICheck(get) → 150ms debounce →
  isCurrentPlayerAI? → executeAITurn → getAIDecision →
  1000ms setTimeout → 결정 실행 → nextPhase → scheduleAICheck → ...
```

주의: 단위 테스트와 실제 게임(`executeAITurn`)은 다른 실행 경로를 사용하므로, AI 자동 진행 관련 수정은 `executeAITurn` 경로를 사용하는 통합 테스트(fake timers)로 검증해야 합니다. `initGame`/`resetGame` 등 상태 변경 함수 끝에는 반드시 `scheduleAICheck(get)` 호출이 있어야 첫 AI 플레이어의 페이즈가 자동 실행됩니다.

AI는 **객체 지향 아키텍처**로 설계되어 있으며, 각 AI 플레이어는 독립적인 인스턴스로 관리됩니다. 단순한 규칙 기반을 넘어 **화물 기반 동적 전략**을 사용하여 실시간으로 최적의 경로를 탐색합니다.

#### AI 핵심 클래스

- **`AIPlayer`**: 개별 AI 플레이어의 생명주기와 전략 상태를 관리합니다. `decide(state)` 메서드를 통해 현재 단계에 맞는 결정을 내립니다.
- **`AIPlayerManager`**: 모든 AI 플레이어 인스턴스를 관리하는 싱글톤 클래스입니다.
- **`AIDebugger`**: AI의 의사결정 과정을 추적하고 분석 리포트를 생성합니다.

#### ΔVP 중심 의사결정 (2026-06 재설계)

모든 Phase의 결정 기준을 **예상 VP 증분(ΔVP)** 단위로 통일했습니다. VP 공식(룰북): `income × 3 + 완성 링크의 트랙 구간 × 1 - 발행 주식 × 3`

**핵심 모듈**:
- **`strategy/vp.ts`**: ΔVP 환산기 (순수 함수). income +1 = +3VP, 완성 트랙 = +1VP(미완성 = 0VP), 주식 = -3VP, 현금 한계가치 λ=0.5 (스윕 측정으로 확정). 모든 튜닝 상수가 이 파일 상단에 집중.
  - `deliveryDeltaVP`: 배달 가치 (내 링크 income VP + 잔여 턴 현금흐름 − 상대 링크 페널티, N인 정규화)
  - `engineUpgradeDeltaVP`: 해금 배달 가치 × 실현확률 − 매턴 비용. 비관 시나리오 1턴 생존 시뮬레이션으로 파산 위험은 -∞ 차단
  - `estimateRouteVP`: 경로의 기대 ΔVP. **완성 불가능한 경로(시간/자금/엔진 상한)는 -∞로 원천 배제** → 산발 건설 차단. 건설 슬롯 기회비용으로 트랙VP 절반 인정
  - `incomeMarginalVP`: 수입 감소 구간(11+) 경계에서 한계가치 체감 (큰 맵 대비)
- **`strategy/mapConfig.ts`**: 엔진 상한·턴 수·턴당 건설 수·income 원천(MapAIConfig.incomeSources)을 맵 오버라이드 테이블로 주입. **AI 코드에 "tutorial이면 3" 같은 맵 분기 금지** — 새 맵 추가 시 이 테이블만 갱신
- **`strategy/turnPlan.ts`**: 턴 시작(issueShares)에 계획(목표 경로, A* fullPath, 필요 트랙/비용/현금) 수립, Phase 간 공유. 게임 리셋 시 `clearTurnPlans()` (AIPlayerManager에서 호출)

**맵 프로파일 다형성 (`src/maps/`, 2026-06)**: `mapId === 'st-lucia'` 같은 코드 전반의 문자열 분기를
없애기 위해, 맵별로 달라지는 동작(세팅·규칙·AI설정·**경로 선택 전략**)을 `MapProfile` 추상 베이스 +
서브클래스 override로 표현한다. `getMapProfile(mapId)`로 인스턴스를 얻어 다형 메서드 호출.
- `MapProfile.incomeSources` = `'cityCubes'`(표준: 출발 도시 큐브) | `'trackCubes'`(St.Lucia: 트랙 위 헥스큐브).
  analyzer는 이 목록으로 배달 기회를 생성하고, `estimateRouteVP`는 경로상 트랙 큐브 중 도착 도시 색까지
  income 원천으로 합산 — **맵 이름 하드코딩 없이** income 평가 일반화 (튜토리얼은 트랙 큐브 없어 영향 0)
- `selectTargetRoute`/`selectTopRoutes` = 헥스큐브 맵의 경로 선택을 `StLuciaMapProfile`이 override
  (기존 selector의 `hexCubeSetup` 우회 분기를 다형성으로 대체)
- 의존 방향 단방향: `maps/`는 `types/game`만 의존(저수준), AI 전략·게임 엔진이 `maps/`를 의존

**Phase별 결정**:
- `issueShares`: TurnPlan.cashNeeded 부족분만 발행. **현금 15 이상이면 계획 발행 안 함**(자금 충분), 15 미만일 때만. 생존 발행(파산 방지) 절대 우선, 마지막 턴 생존 외 발행 금지, **턴당 2주 캡**(다인 cityCubes는 생존 발행 포함 하드캡). 누적 상한(MAX_TOTAL_SHARES)은 폐지
- `auction`: **절실함 기반**(ΔVP) — 1등 가치 = (내 최선 행동 ΔVP − 차선 행동 ΔVP). `firstSeatBidCeiling`로 달러 환산(절실 미만이면 양보 $0~1, 절실하면 $2~3 바닥). 절실할 때만 적극 입찰 → 평범한 턴은 모두 양보해 경매 규칙상 순서가 자연 순환. `rankActionsByDeltaVP`(selectAction)를 재사용(turnOrder 행동 제외). 건설 예산·운영비 절대 침범 금지(파산 방지 안전판). St.Lucia 교대 선공권은 매턴 비용 구조라 바닥 없는 보수 환산(`floor(절실함/λ)`)
- `selectAction`: 행동별 ΔVP 랭킹 (engineer=완성 가능/조기화/다음 경로 착공, locomotive=해금 배달 가치, firstMove/firstBuild=경합 감지 기반, **turnOrder=`evaluateTurnOrder` 순서 탈환 가치**=내 순번이 뒤일수록↑·꼴찌 최대). 순서 고착을 사람처럼 Turn Order 행동으로 자연 해소
- `buildTrack`: 경로 커밋 + 결정론적 경로 추적(`tryDirectPathBuild`). 후보 경로(목표 → 상위 우선순위 → 네트워크 확장)를 순서대로 시도, 전부 실패 시 skip (미완성 트랙 = 0VP). **건설 차례에 이전 경로 재평가**(`resolveTurnRoute`): 다인 cityCubes에서 턴 시작에 잡은 경로가 다른 플레이어 건설로 막혔으면(`estimateRouteVP().completable=false`) 고집하지 않고 재평가 — 막힌 경로에 미완성 트랙 흩뿌림 차단
- `moveGoods`: 배달 vs 엔진 업그레이드 vs 스킵을 동일 ΔVP 단위로 비교. 상대만 이득인 배달(ΔVP≤0)은 스킵

**확장성 (큰 맵 대비)**:
- 정밀 평가(A* 포함)는 사전 점수 상위 K=8개만 — 결정당 A* 호출이 맵 크기와 무관하게 O(K)
- 상대 평가는 opponents 배열 순회 + 1/(N-1) 정규화 (2인 가정 없음)
- cap/가중치는 보드 상태(매칭 큐브 수, 남은 턴)에서 유도

**VP 회귀 베이스라인** (fullGameSimulation.test.ts, 고정 시드 20개):
- 재설계 전 3.80 → 재설계 후 **9.30** (accurateVP 평균), 완성 트랙 비율 80%→84%, 파산 0건 유지
- 각 변경은 `평균 VP ≥ 베이스라인 - 1` 게이트를 통과해야 함. 단계별 이력은 테스트 파일 주석 참조

#### AI 디버깅 시스템

개발 모드에서 브라우저 콘솔을 통해 AI의 생각을 실시간으로 훔쳐볼 수 있습니다.

```javascript
// 주요 사용법 (브라우저 콘솔)
debugAI(state, "player2");       // 특정 플레이어의 모든 결정 분석
getAIReport();                   // 현재 게임 상태에 대한 종합 AI 리포트
debugStrategy("player2");       // 현재 전략 및 경로 분석 상세
debugPaths("player2");          // 최적 경로 탐색 결과 시각화
```

#### 로그 카테고리별 On/Off 토글

`window.DEBUG_CONFIG` 또는 헬퍼 함수를 통해 로그 출력을 제어할 수 있습니다.

| 카테고리 | 설명 | 기본값 |
| :--- | :--- | :---: |
| `preparation` | issueShares, auction, selectActions | OFF |
| `trackBuilding` | 트랙 건설 결정 및 후보 평가 | ON |
| `goodsMovement` | 물품 운송 결정 | OFF |
| `turnEnd` | 정산/수입감소/턴 종료 | OFF |
| `verbose` | 경로 탐색, 연결 확인 등 상세 로그 | OFF |
| `aiEvaluation` | AI 평가(트랙 점수/전략 평가 등) | ON |

```javascript
// 콘솔 헬퍼 함수
showDebugConfig();                   // 현재 설정 상태 확인
setDebug("trackBuilding", true);     // 특정 카테고리 on/off
setAllDebug(true);                   // 모든 로그 on/off
```

#### 종합 액션 로깅 (logAction)

위 토글과 **별개로**, 모든 게임 액션을 `logAction`(debugConfig.ts)이 **토글과 무관하게 항상**
구조화 JSON 한 줄로 기록한다. 출력: `[game:<sessionId>] {"t":"buildTrack","c":"trackBuilding",...}`.
- 게임 시작/리셋 시 짧은 세션ID 부여(`newLogSession`) — 여러 게임이 섞여도 prefix로 구분
- `category`("c" 필드)는 끄는 스위치가 아니라 `:3999`에서 grep 필터링할 분류 라벨
- `level:'error'`면 `console.error`로 출력 (오류만 추출 가능)
- GamePageClient의 콘솔 미러가 이 줄을 localhost:3999로 전송 → 로그만으로 게임 진행/오류 추적

**디버깅 워크플로우(중요)**: 개발 서버 실행 중에는 화면 묘사 대신 **항상 :3999 로그 서버에서 로그를 확인**하며
원인을 추적한다(예: "AI가 철도를 이상하게 건설" → `"c":"trackBuilding"` grep). 로그는 **메모리 버퍼**라
**로그 서버를 죽이거나 재시작하면 이전 게임 로그가 전부 사라진다 — 절대 재시작 금지**, 읽기만 할 것.
버퍼에 없는 이전 로그는 브라우저 DevTools 콘솔에 원본이 남아있어(미러는 orig 출력 후 전송) 새로고침 전이면 복구 가능.

#### AI 트랙 건설 로직 (상세)

- `tryDirectPathBuild` (buildTrack.ts): A* 최적 경로(상대 트랙 회피, 자사 트랙 0.1 우대)를 따라
  frontier(출발지에서 연속된 자사 트랙 끝) 다음 칸에 정확한 엣지로 건설
- **첫 트랙 방향(2026-06-18)**: 자사 트랙이 없을 때 경로가 `마을→도시` 방향이면 source/target을
  교환해 **도시 끝에서부터** 건설한다. 첫 트랙은 도시 인접만 허용되므로(정규 룰), 마을 쪽부터
  깔면 `validateFirstTrackRule` 실패로 skip된다 (St. Lucia 1턴 도시화 후 건설 안 되던 버그)
- 엣지 비호환/실패 좌표는 avoidCoords에 넣어 최대 3회 재탐색
- 상대 단순 트랙 위 복합 트랙(교차/공존) 건설 처리 포함
- 점수 기반 후보 평가 시스템(evaluateTrackForRoute 매직넘버 체계)은 2026-06 재설계에서 제거됨
  — evaluateTrackForRoute는 콘솔 AI 디버거(debugAI, debug/collectors) 용도로만 잔존 (analyzer.ts)
- 참고: docs/ai-strategy.md는 재설계 이전 문서로 일부 구식 (점수 체계 부분)

#### St. Lucia 맵 구현 (2026-06-12, feature/st-lucia-map)

공식 맵 PDF(`maps/aos-st_lucia.pdf`) 픽셀 측정으로 재구성한 2인 전용 8턴 맵.

- **맵 데이터** (`src/utils/stLuciaMap.ts`): 도시 0(도시화로만 생성), 마을 11, 산 10, 강 9.
  원본은 flat-top 보드 — 데이터는 전치 좌표로 저장(인접 동형, 게임 로직 무변경),
  렌더만 `orientation: 'flat'`으로 기하 함수들이 전치 (`hexToPixel` 등의 `flat` 파라미터)
- **맵 룰 분리** (`src/utils/mapRegistry.ts`의 MapRuleConfig): `skipGoodsGrowth`,
  `alternateTurnOrder`(경매 대신 교대 선공권 $5), `firstSeatCost`, `disabledActions`
  (production/turnOrder), `hexCubeSetup`(헥스 위 큐브 38개, 마을 제외),
  `forceFirstTurnUrbanization`(AI가 1턴에 무조건 도시화 — 아래 첫 트랙 규칙의 전제).
  **게임 엔진에 mapId 분기 금지** — 플래그만
- **첫 트랙은 도시 인접만** (정규 룰, BGG 디자이너 Ted Alspach 공식 답변): St. Lucia는
  시작 도시 0개라 **1턴엔 Urbanization을 선택해 도시를 만든 플레이어만 (그 도시 인접) 건설** 가능.
  도시화 못한 플레이어는 1턴 건설 불가(룰상 정상, 의도된 불이익). 2턴부터 도시 존재 → 정상.
  → AI는 `forceFirstTurnUrbanization && currentTurn===1`이면 `selectAction`에서 도시화 강제.
  (구 `townsAnchorFirstTrack`/`allowTownAnchor` 마을 앵커 허용은 룰 위반이라 **제거됨**)
- **트랙 큐브 배달**: 트랙 위 큐브를 미완성 링크여도 같은 색 도시로 배달 (`findTrackCubeDeliveries`).
  수입은 시작 구간(미완성이어도) 소유자 +1 **그리고** 이후 경유하는 완성 링크마다 일반 규칙대로
  소유자 +1 (예: 구간→마을→도시 = +2). UI는 `selectCube('track:<id>')` 컨벤션
- 튜토리얼(경매/물품성장 O)과 St. Lucia(선공권/헥스큐브 O) **양쪽 헤드리스 완주 검증 필수**

#### St. Lucia AI 수익 개선 (2026-06, feature/st-lucia-ai-income)

헥스큐브 맵에서 AI의 income/VP가 음수에 머무는 문제를 라이브 플레이 분석으로 단계 개선.
**모두 trackCubes 맵(St.Lucia) 한정 — tutorial VP 회귀 게이트 보존.**

- **트랙 큐브 배달 경로 (`findTrackCubeDeliveries`, hexGrid.ts)**: 트랙 위 큐브를 같은 색 도시로
  배달, 다른 색 도시는 통과, **엔진 레벨(링크 수) 제한**, 자기 철도 우선 경로.
  분기 탐색의 visited를 **전역 → per-path(복사)** 로 수정 — 공유 허브를 한 경로가 먼저 지나도
  다른 경로(내 트랙만으로 가는 최적 경로)가 막히지 않게 함 (income 8.0→9.6의 핵심 버그).
  엔진 초과로 닿는 도시도 `reason:'engine-exceeded'`+`requiredEngine`으로 로그 노출.
- **route-aware 마을 가닥 (`tryDirectPathBuild`/`hasPendingFreeSpur`, buildTrack.ts)**: 경로가
  마을을 지날 때 들어온 변 가닥을 먼저 짓고 다음 타일로 진행. 3/3 마지막 타일이 마을에 새 변을
  연결하면 빌드 페이즈가 끝나기 전 무료 가닥(0카운트)으로 같은 턴에 메움(현금 가드로 루프 차단).
- **엔진 타이밍 정책 (moveGoods/selectAction)**: front-load(초반 수송 1개 포기로 엔진 3) →
  T4 이후 move-round 엔진업 금지(엔진은 Locomotive 액션으로만) → T6+ 엔진 4 floor는
  "4링크+ 배달 가능한 깊은 큐브가 있을 때만"(얕은 게임 비용 낭비 차단).
  단 front-load는 **파산 확정이 아닌 경우에만** — 치명적 디폴트 가드(`engineUpgradeShortfall.bankrupt`)가
  T1 저현금(cash $3~8·income 0) front-load를 차단하며, 측정상 개선(파산 18→15, VP −23→−19)이라 정책 확정.
- **도시화 가치 (`evaluateUrbanizationForTrackCubes`, selectAction)**: 도시화 가치를 "아직 도시
  없는 색의 큐브 수"(배달 목적지 확충)로 산정 + **도시 수 체감(decay)** (도시 2개→×0.7, 3개→×0.4,
  4개+→×0.3) — 도시가 충분하면 도시화 남발 대신 라인 확장·깊은 배달 우선.
- **깊은 배달 보상 (selector)**: depthBonus(매칭색 도시에서 먼 큐브 우선)로 긴 체인 유도.
- **후반 파산 차단 (issueShares)**: 마지막 2턴(T7-8) 건설 목적 발행 금지(배달 회수 턴 부족 → 순수 빚).
  생존 발행은 유지.
- **화물 클릭 경로 하이라이트 (selectCube/GameBoard)**: 트랙 큐브 클릭 시 도달 가능 도시 중
  최적 경로(상대 철도 적은→링크 긴 순)를 `ui.movePath`에 설정 → 골드 점선 표시.
- **측정 하니스 (`stLuciaSimulation.test.ts`)**: St.Lucia 2 AI 동기식 전체게임 러너 +
  수익/건설 깔때기(배달·미배달·건설·도시화·완주턴) + 진단 지표(배달 깊이/체인 지원/최고 엔진).
  베이스라인 측정(통과) + 목표 게이트(skip). 누적 결과(20시드): VP −21.8→**+3.8**, income→10.8,
  파산 17→7. tutorial VP 회귀 불변.

#### Rust Belt 5인 AI income 개선 (2026-06-22, VP −5.09→+4.13 첫 양수)

5인 cityCubes 맵 AI를 income ~0.6·파산 4.4/5에서 **VP +4.13·income 8.59·파산 1.50·전원완주(20/20)**로
개선(20시드). 모두 **다인(activePlayers>=3) cityCubes 한정** — tutorial(2인)/St.Lucia(trackCubes) 회귀
게이트(VP 9.x, 파산 0/20) 보존. 측정 `rustBeltSimulation.test.ts` — ⚠️ **5인은 편차가 −45~+73로 극심
→ 반드시 20시드 이상으로 측정**(8시드는 노이즈로 결론이 뒤집힌다, 실제로 ②·혼잡거리가중을 오판했음).

**핵심 메커니즘 (효자 순, 전부 사용자 직관):**
- **★ 거점분산 (selector.assignHomeBases + AREA_BIAS_WEIGHT)**: 게임 시작 시 큐브 많은 도시를
  farthest-first로 각 AI에 분산 배정(서로 가장 멀리 + row 분산), 경로 점수에서 거점 먼 출발지를 감점해
  자기 영역에 머무름(boxed-out 충돌 완화). 6구획 그리드 명시분할은 빈곤구획 거점으로 악화(−7.54) → farthest가 최적.
- **★ 도시 금지 (selector.allScoredOpps)**: 경로의 출발/도착 도시가 **다른 활성 플레이어 currentRoute의
  from/to와 겹치면 score=−Infinity**. 순차 결정이라 앞 AI가 잡은 도시를 뒤 AI가 회피 → 매 턴 경로 겹침을
  직접 차단(3명이 같은 화물에 몰리던 문제 해결). 전부 금지 시 opportunities[0] fallback(빈 위험 없음).
- **★ 분리 산발 금지 (buildTrack candidateRoutes)**: 출발·도착 둘 다 내 connectedCities에 없는 경로는
  skip(내 트랙 있을 때만, 첫 건설 예외) → 분리된 새 도시 시작 = 미완성 공용화 산발 차단, 한 덩어리 성장.
- **혼잡 회피 (selector)**: 출발지 근처(거리<5) 다른 플레이어 '명 수'만큼 점수 차감(거리가중 아닌 카운트).
- **교차 트랙 배달 버그 수정 (hexGrid checkConnectionToCity/getConnectedNeighbors)**: 교차트랙
  secondaryEdges를 무시해 완성링크 오판→소유권 제거→공용철도 이동차단(보라화물 미배달)을 수정. `crossingDelivery.test.ts`.
- **도시화 placement (AIPlayer.decideUrbanizationPlacement)**: 목표 경로/내 철도에 연결된 마을 우선
  (배달 가능 도시화). 연결성을 큐브 보너스보다 우선.

**기존 유효 정책 (유지):** 장거리 경로 지속(완성 가능 경로 고수, completable 필수)·1턴완성 우선
(vp lateCompletionPenalty, timeFeasible 2턴)·마을·도시 경유 income(A* −1.5 보너스, links=실제 경유 수)·
엔진정책(T4 front-load 엔진3, T5+ Locomotive로만 엔진4).

**시행착오 교훈**: ②"경로 전환차단"(흩뿌림 방지)은 −5 악화 — 흩뿌림(1타일)이 skip보다 income 유리.
"분리 산발 금지"는 메모리에 −17 악화 기록이 있었으나 **도시금지로 분산된 뒤엔 +1.2 개선** — 악화 기록도
선행조건(여기선 분산)이 바뀌면 뒤집힌다, 막다른길을 영구 배제 말 것.

남은 작업: income 천장(목표 20) 향해 "도시화한 도시로 즉시 배달 + 1턴완성 결합", Engineer 4칸 건설을
완성 판정에 반영. (`getConnectedCities` 트랙0 빈배열은 의도된 동작으로 확정 — 전 도시 반환 시
연결성 보너스가 무의미해짐, analyzer.ts 주석 참조)

#### Germany 맵 구현 (2026-06-22, feature/germany-map)

공식 맵 PNG(`public/maps/germany.png`)를 색상 자동검출 + 테두리 자기상관 격자 피팅으로 추출한
**4인 전용 8턴** 맵. 도시 13 + 외국 터미널 6 + 마을 14.

- **flat-top 보드 (중요)**: 헥스가 flat-top(평평한 윗변)이다. St.Lucia/Rust Belt와 동일하게
  **전치 저장(데이터 col=화면세로, row=화면가로) + `orientation:'flat'` 렌더**. 데이터 그리드 15×13.
  ⚠️ 헥스 방향은 **테두리 자기상관**(가로/세로 주기 비 ≈0.86=flat, 1.155=pointy)이나 헥스 크롭으로
  확정할 것 — pointy로 오판하면 격자가 2배 부풀려져 "전혀 다른 맵"이 된다(실제 겪음).
- **맵 데이터** (`src/utils/germanyMap.ts`): 빈 외곽은 `lake`+`hideLakeHexes`로 안 그려 국경 윤곽 표현.
  빈 상단 2칸은 col −2 평행이동으로 제거(odd-r 인접 무변경). 도시 주사위번호(=화면 표시+물품성장)는
  원본대로: 1 München·Zürich / 2 Nürnberg·Stuttgart / 3 Essen·Düsseldorf / 4 Oldenburg·Wien /
  5 Hannover·Dresden / 6 Königsberg·Breslau.
- **외국 터미널 6** (`City.isTerminal`): 셋업때 무작위 큐브1로 수용색 결정(통과 불가·생산 안 함·
  배달 출발 아님). gameStore 셋업 분기 + hexGrid 3개 DFS에 통과금지 + columnMapping에서 제외 +
  analyzer `analyzeDeliveryOpportunities` 제외.
- **헥스 고정비용** (`HexTile.fixedCost` €6~€12): 지형 기본비용 대신 사용. gameStore `buildTrack` +
  analyzer 비용 2곳(`getTerrainCost`/`getTerrainBuildCost`). GameBoard에 박스+숫자로 표시(도시 번호 원과 통일).
- **Engineer 절반 비용** (`MapProfile.engineerHalfCost` + `phaseState.engineerHalfUsed`, 빌더마다 리셋).
- **미완성 링크 금지** (`MapProfile.requireCompleteLinks`): AI buildTrack 첫 착공 시 이번 턴 슬롯으로
  완성 가능한 경로만(`countMissingTrackHexes` 게이트).
- **Berlin 매 턴 무작위 물품 1개** (`MapProfile.bonusCityCubeId='berlin'` + growGoods).
- **도시 직결 링크** (`BoardState.directLinks`/`DirectLink`, Essen↔Düsseldorf $2): 두 도시가 직접
  인접(변 공유)이라 사이 헥스가 없어 일반 트랙으로 못 이음 → `buildDirectLink` 액션(건설1카운트),
  `getConnectedNeighbors`에 직결을 도시 이웃으로(이동/완성/배달 자동 반영), `completeCubeMove` 직결구간
  income+1, GameBoard 골드점선+$2원 클릭건설. **AI는 직결 미사용(사람 전용)**. 룰북: "$2, 흰색 원 소유 마커".
- **측정** (`germanySimulation.test.ts`, 20시드): VP +14.88, income 11.2, 파산~1명/4, 8턴완주.
  tutorial/St.Lucia/Rust Belt VP 회귀 게이트 보존. 남은 작업: AI 직결 활용·파산률 밸런싱·강 표현 연속성.

**후속 수정/실측 검증 (2026-06-22, 플레이 피드백 반영):**
- **미완성 링크 금지 강제(엔진)**: AI 첫착공 게이트뿐 아니라, 각 플레이어 트랙 건설 종료(buildTrack
  단계 전환) 시 `removeIncompleteNewTracks`로 이번 턴 신설 미완성 트랙 제거+비용 환불(딸린 마을 가닥도).
  AI·사람 모두 보드에 미완성 트랙이 안 남는다(requireCompleteLinks 맵 한정).
- **★ 완성 링크 판정 근본 버그 수정(모든 맵)**: `checkConnectionToCity`가 마을을 가닥(spur) 없이
  닿기만 해도 연결로 오판 → dangling 트랙이 완성으로 잘못 판정됐다. 미도시화 마을은 **진입 변에
  townSpur가 있을 때만** 연결 인정으로 수정(도시는 모든 변). 회귀 없음(186 테스트 통과).
- **Engineer 절반비용**: 평지($2)에 낭비 말고 `cost > PLAIN_TRACK_COST`인 비싼 헥스에 우선 적용.
- **직결 링크 클릭**: 도시 위 레이어로 + 투명 히트영역(도시 헥스에 클릭 가로채이던 것 수정). `germanyDirectLink.test.ts`.
- **Berlin 시작 큐브 2개** (룰북 "each other City" = 2) + 매 턴 물품성장 보너스 1개(`bonusCityCubeId`, `growGoods` 안 `[Berlin 보너스]` 로그). `germanyBerlin.test.ts`.
- **도시 주사위번호 원본대로**(columnMapping.diceNumber): 화면 표시+물품성장 결정. 1 München·Zürich…6 Königsberg·Breslau.
- **도시 큰 라벨**: 번호 있으면 번호, 없으면 city.id, 단 터미널/Berlin(풀네임)은 생략(GameBoard 전역).
- **액션 UI**: 독일 Engineer 설명을 "트랙 1개 절반 비용"으로 표시(engineerHalfCost).

**UI 공통 개선:**
- **Production 패널**: 전체화면 모달이 물품 디스플레이를 가려 배치 불가하던 것 → 우하단 고정 패널로(디스플레이 직접 클릭).
- **이동/AI건설 미니 오버레이** (`MoveCubeOverlay`): 세로로 긴 맵(독일/세인트루시아)에서만, 화물 이동·AI 철도건설 중
  전체 맵을 **우측에 작게**(fit) 띄워 진행을 보여줌. 왼쪽 메인 지도는 안 가림. 가로 넓은 맵(Rust Belt 등)은
  종횡비(`calculateBoardDimensions` height>width) 자동 판정으로 끔. GameBoard `fitOverlay` prop(비인터랙티브 fit).

#### Western US 맵 구현 (2026-06-22, feature/western-us-map)

공식 맵 PNG(`public/maps/western-us.png`, 3368×2382)를 색상 검출 + 헥스 내부 라벨링(면적 ~33020px) +
행/열 클러스터링으로 추출한 **6인 전용 6턴** 맵. 도시 12 + 마을 20.

- **pointy-top 네이티브 (중요)**: Rust Belt/Germany(flat-top 전치)와 달리 **전치 없이 그대로 저장**,
  `orientation:'pointy'`(기본). ⚠️ 원본은 **even-r 오프셋**(짝수행 우측 시프트)인데 엔진은 odd-r →
  추출 시 `engine_row = data_row + 1`로 패리티 정렬(맨 위 row 0은 비어 lake). 유효 좌표 col 0~13, row 1~13.
  헥스 방향은 **바운딩박스 가로/세로 비**로 확정(H>W=pointy) — 육안만으로 판단 말 것(실제로 오판했음).
- **맵 데이터** (`src/utils/westernUsMap.ts`): 서부 시작도시(Seattle/SanFrancisco/LosAngeles, region:'west'),
  동부 시작도시(Duluth/Minneapolis/DesMoines/StLouis/Memphis/Vicksburg/NewOrleans, region:'east'),
  중앙 비시작(SaltLakeCity/Denver, region 없음 — 트랙 시작 불가). 미시시피 강 6칸·우하단 늪·좌중앙 산악.
- **특수룰은 전부 `WesternUsMapProfile` getter로 주입** (mapId 분기 없음):
  - **마을 큐브** (`townCubeCounts` 모든 마을 1) + **시작 현금 $20** (`startingCash`) — gameStore 셋업 분기.
  - **지형 비용** 늪/강 $4·산 $5 — Germany처럼 헥스 `fixedCost`로 주입(모든 비용 헬퍼가 자동 적용, swamp 지형 추가).
  - **동↔서 배달 +$1** (`regionDeliveryBonus`) — completeCubeMove income 정산 + AI(moveGoods/vp) ΔVP 가산.
  - **마을 큐브 배달** (`incomeSources`에 `'townCubes'`): 마을을 도시처럼 출발점으로 `selectCube('town:<id>')`
    컨벤션(St.Lucia `track:` 패턴 모방), 일반 'move' 액션으로 실행. AI는 moveGoods 마을 후보 + vp 경로상 마을큐브 가산.
  - **시작 도시 제한** (`startingCitiesOnly`/`isStartingCity`): 첫 트랙은 서부/동부 시작도시 인접만
    (Denver/SLC/신도시 제외). `validateFirstTrackRule(allowedCityIds)` + AI tryDirectPathBuild 시작도시 끝 앵커.
  - **연속성 강제** (`requireContiguousUntilTranscontinental`): 대륙횡단 전까지 새 트랙은 내 네트워크에 연속
    (`validateTrackConnection(requireNetwork)` — 내 네트워크 안 닿은 도시 시작 금지). `PlayerState.transcontinental`로 해제.
  - **대륙횡단 연결 보너스** (`transcontinentalBonus`): 서부↔동부 시작도시 최초 연결(완성 링크 BFS) 시 1회
    income 보너스(1철도+$4/2철도각+$2), `computeTranscontinental`(gameStore). 건설/가닥 후 `applyTranscontinental` 호출.
  - **도시화 특례** (`newCityRegion`): KansasCity→east, SanDiego/Portland→west (배달/대륙횡단 판정). 단 신도시는 시작도시 아님.
- **측정** (`westernUsSimulation.test.ts`, 12시드): VP ~10.2, income ~9.0, 건설 ~59/배달 ~36/도시화 6, 파산 ~1.7명/6, 6턴완주.
  tutorial/St.Lucia/Rust Belt/Germany VP 회귀 게이트 보존. 남은 작업: 파산률↓·AI 대륙횡단 적극 활용·도시 region 표식 UI.

#### Korea 맵 구현 (2026-06-23, feature/korea-map)

Age of Steam 확장맵 3 — 한국 (Martin Wallace 2004 / James Mathias 아트 2018). 공식 맵 시트
(`maps/korea-v2.1.pdf` → `out/maps/korea.png`, 2381×3367)를 색상검출 + 테두리 자기상관 격자 피팅
(피치 row 174 / col 200, 홀수 row 아래로 +100)으로 추출한 **4인 전용 8턴** 맵. 도시 14 + 마을 16.

- **flat-top 보드**: Germany/Rust Belt/St.Lucia와 동일하게 **전치 저장**(데이터 col=화면세로 0~16,
  row=화면가로 0~13) + `orientation:'flat'` 렌더. ⚠️ 가로/세로 피치 비 0.866 = flat 확정(pointy로 오판
  말 것). 검증: SUWON{col5,row4}이 odd-r 규칙으로 INCHEON{col4,row3}=NW·SEOUL{col4,row5}=SW에 인접.
- **★ 동적 도시 색상 (시그니처, 모든 맵에 영향 없는 헬퍼)**: 도시는 고정색이 없고 **수요색 = 현재 놓인
  큐브색**. 빈 도시는 수요 없음(통과 가능), 같은 색 큐브 있는 도시는 통과 불가(거기서 배달 종료).
  - `BoardState.dynamicCityColors` 플래그(`createKoreaBoardState`가 set) + `cityAcceptsCube(city, color,
    board)` 헬퍼(hexGrid.ts) = `board.dynamicCityColors ? city.cubes.includes(color) : city.color===color`.
    **비-한국 맵은 정확히 기존 `city.color===color` 동작** → 회귀 게이트 보존(핵심).
  - 치환 지점: hexGrid 배달 경로탐색 4곳(blocker/목적지/stop) + analyzer 2곳(findDestinationCities/경로유효).
    **`moveGoods`(gameStore)는 목적지 재검증 없음** — 경로탐색이 보증하므로 정산 코드 무변경.
  - 렌더: GameBoard는 동적 맵 도시를 회색 헥스로 그리고 수요색은 하단 큐브로 표현(신도시도 회색).
- **셋업**: 평양 4 / 부산·인천 3 / 나머지 2 (`cityCubeCounts`).
- **수원 직결 링크**: 수원-서울 $2, 수원-인천 $2 (Germany `directLinks` 인프라 재사용 — 추가 엔진 코드 0).
- **도시화 디스플레이 보충** (`urbanizeFromDisplayCount=2`): 신도시 칸(A~H)의 큐브 2개를 신도시에 놓고
  빈 칸을 주머니에서 보충 (gameStore `placeNewCity`). 신도시 수요색이 이 큐브로 결정. 도시화 취소 시
  복원 위해 `UndoSnapshot`에 `goodsDisplay` 추가.
- **평양·수원 no-growth** (`noGrowthCityIds` + columnMapping 제외): 물품 성장 단계에서 새 물품 안 받음.
- **측정** (`koreaSimulation.test.ts`, 8시드): VP 23.38, income ~12, 건설 44/배달 41/도시화 8,
  파산 0.88명/4, 8턴완주(8/8). tutorial/St.Lucia/Rust Belt/Germany/Western US VP 회귀 게이트 보존.
  동적색 단위검증 `koreaDynamicColors.test.ts`(cityAcceptsCube + 직결 인접성).
- **동적색 함정(코드리뷰 발견)**: 배달 실행(hexGrid/analyzer)뿐 아니라 **AI 경로 평가**(vp.ts
  estimateRouteVP, buildTrack.ts resolveTurnRoute)도 도시 수요색을 봐야 한다. 처음엔 이 둘이
  `targetCity.color`(고정 placeholder)로 비교해 한국 경로를 오판(VP 13.75) → `cityAcceptsCube`로
  통일 후 VP 23.38. 새 동적색 맵 추가 시 "도시색 매칭" 전 지점을 cityAcceptsCube로. 남은 작업: 범례 위치 미세조정.

#### AI 순서 순환 + 도시화/경로 정밀화 (2026-06-24, feature/ai-urbanization-blocked-edges)

다인 맵에서 순서 고착(특정 player-index 독식)·엉뚱한 도시화·막힌 변 통과 경로를 개선.
**측정은 모두 100시드** ([`docs/ai-auction-baseline-100seed.md`](docs/ai-auction-baseline-100seed.md) 표와 비교).

- **경매 절실함 입찰 (auction.ts + vp.ts)**: ΔVP 직접환산 → **절실함(최선−차선 행동 ΔVP)** 기반으로 재설계.
  상수는 vp.ts 상단 집중: `DESPERATION_BID_THRESHOLD`(1.5 미만이면 양보)·`FIRST_SEAT_BID_FLOOR/CAP`($2~3)·
  `DESPERATION_BID_SAT`(2.5). "절실할 때만 적극, 평범하면 양보" → 경매 규칙상 순서 자연 순환.
- **Turn Order 행동 전략화 (selectAction.ts `evaluateTurnOrder`)**: 룰북 정식 행동(무료 패스 1회)을
  사람처럼 — 뒷순번일수록 가치↑. 단 `TURN_ORDER_SEAT_VP=0.1`(**거의 끔이 최적**, 100시드 전구간 스윕 결론:
  0.3~0.4는 작동하나 VP 악화+독식 재현, 0.1이 단조편향 해소+VP 최고). 잔존 편향은 경매 순서/거점이 원인.
- **건설 차례 경로 재평가 (buildTrack.ts `resolveTurnRoute`)**: 위 Phase별 결정 참조 — 인터랙션 게임에서
  남의 건설을 100% 예측 못 하니 내 차례에 현재 보드로 completable 재확인.
- **도시화 색/위치 정밀화 (AIPlayer.ts `decideUrbanizationPlacement`)**:
  - 타일 색 = "내 철도에서 픽업 가능한(≤3) 화물색" 중 **그 색 목적지가 멀거나 없는 색** 우선
    (`colorScore` = cargo×2 + 목적지거리보너스). 가까이 같은 색 도시 있으면 목적지 중복 → 후순위.
  - 한국(동적색+`urbanizeFromDisplayCount`>0)은 신도시 수요색이 tile.color가 아니라 **그 타일 칸(A~H)에서
    옮겨올 디스플레이 큐브**로 정해짐 → `expectedColorsOf`가 columnMapping+goodsDisplay로 예상 수요색 산출.
  - 마을 위치 = **이번 턴 연결 가능 범위(남은 건설 슬롯 수) 안의 마을만** 후보, 가까울수록 가점.
    범위 밖이면 도시화 보류(`return null`) — 엉뚱한 먼 곳에 안 만든다.
- **blockedEdges 경로 회피 (hexGrid.ts `isBlockedEdge` + analyzer.ts)**: 건설 불가 경계 변(한국 산맥)을
  A* 경로탐색 2곳(`findOptimalPath`/`findOptimalPathAvoidingOpponent`)에서 원천 회피 — 막힌 변 통과 경로를
  짜면 건설 단계에서 거부돼 슬롯 낭비. **`isBlockedEdge`는 게임 엔진(gameStore `crossesBlockedEdge`)과
  공유**(코드리뷰에서 gameStore의 중복 `isBlockedEdgePair` 제거하고 hexGrid 함수로 통일).
- **Korea 거점/경로겹침 보정 (selector.ts)**: 동적색 맵은 ① 거점 묶기(AREA_BIAS) 끔(부산 고립우위/평양
  현금난 운빨 제거), ② 경로 겹침을 완전차단(-∞) 대신 **감점**(`DYNAMIC_MAP_OVERLAP_PENALTY=6`) — 중앙 거점
  플레이어 경로 고갈 방지로 승률 분포 균등화. **다른 cityCubes 맵은 완전차단 유지**(Rust Belt 도시금지 핵심 보존).

#### Western US AI 골고루 개선 (2026-06-25, feature/western-us-village-cube)

서부 미국 6인에서 "1·2·3등이 player-index로 고착"(앞3 VP ~30 vs 뒤3 ~0)을 해결. 진짜 원인은
경매 순번·거점이 아니라 **일부 AI가 첫 턴에 완성 불가능한 먼 경로에 미완성 트랙을 깔아 파산**하거나,
**자기 도시 화물 소진 후 갇혀 정체**하는 것이었다(1게임 추적으로 규명). 측정은 모두 100시드.

- **★ 마을 큐브 배달 목표 (핵심 해결, analyzer.ts `analyzeDeliveryOpportunities`)**: Western US는
  townCubes 맵인데 그동안 배달 목표를 **도시 큐브만** 생성하고 **마을 큐브를 무시**해, AI가 "우연히
  마을을 지나면 배달"할 뿐 마을 큐브를 노려 확장하지 못했다(도시 화물 소진 후 정체→파산). → townCubes
  맵에 마을 큐브 배달 기회(`town:<id>` 출발) 추가 + `findStopById`가 `town:`/`track:` prefix를 strip +
  `preliminaryScore`가 내 트랙 인접 마을 출발을 도시처럼 우대(안 그러면 상위 K 추림에서 도시 경로에
  밀려 사장). **갇혀 정체하던 뒤 순번이 중간 마을 큐브 배달로 income을 벌어 살아남** (p5 VP 0→8,
  VP 격차 30→16, 평균 VP 14.3→15.1, 붕괴 player 없음). 경매 보너스(제로섬)와 달리 전체 파이를 키운다.
- **완성트랙 7 목표 (vp.ts + `MapProfile.targetCompletedTracks`=7)**: 완성트랙 < 7이면 트랙 건설 VP를
  기회비용 없이 정상(1.0) 인정(기본 0.5) → 경로 완성을 적극 추구해 완성트랙·income 동반 상승. Western 전용.
- **대륙횡단 활용 (vp.ts `estimateRouteVP` transcontinentalVP)**: 내 네트워크가 한쪽(서/동) 시작도시를
  연결했고 경로 목적지가 반대쪽 시작도시면 대륙횡단 달성 → income +$4(영구)=큰 VP 가산. 0.4→0.9명/게임.
- **첫 착공 완성 게이트 (buildTrack.ts `gateCompletable`)**: 다인 맵 첫 착공 시 completable=false 경로
  (먼 대륙횡단 등)는 미완성 트랙 안 깔고 skip → "전 재산 쏟아 income 0으로 죽는 나선" 차단(파산
  0.79→0.34, Rust Belt도 9.8→11.7 동반 개선). banScatter(연속성 룰)와 별개의 AI 휴리스틱.
- **First Move/Build 강화 (selectAction.ts)**: 뒤 순번일수록 선수송/선건설 가치↑(rank 가중). 단 순서
  액션은 1명만 선택+실질행동 기회비용이라 제로섬(player간 재분배)에 그침 — 마을 큐브가 진짜 해결.
- **★ 경매 1번 입찰 보너스 (Western US 전용, `MapProfile.firstSeatRankBidBonus`)**: 4·5위 +1, 6위 +2로
  뒤 순번 입찰 상한을 올려 1번을 더 따 순서 순환(승자 분포 균등화). **cityCubes 맵(Rust/Germany)엔 절대
  적용 불가** — 마을 큐브가 없어 뒤 순번이 1번 사느라 건설예산 소진→붕괴(전 맵 적용 시 Rust VP 11.7→3.5,
  파산 2배). Western만 마을 큐브가 이 부작용을 상쇄하므로 override로 켠다. 골고루↑ vs 평균 VP −1.6 트레이드오프.
- **시뮬 진단 지표 (전 다인 시뮬 *Simulation.test.ts, 상시)**: turnOrder 행동 선택·경매 입찰 발생 횟수·
  1번 획득 방식(byBid 입찰로/byYield 양보로)·순번 1~N위 점유 분포. Western은 추가로 **1게임 턴별 프로세스
  추적**(player별 매 턴 경로/건설좌표 + skip 시 게이트 이유: 완성/연결/completable). player-index 편향
  진단의 핵심 도구 — "누가 1번 먹나·왜 정체하나"를 수치로 추적.

#### 도시화 계획 통합 + 건설 dangling 수정 (2026-07-02, 사용자 피드백 "생각 없는 도시화·엉망 건설")

- **`src/ai/strategies/urbanization.ts` (planUrbanization)**: 도시화의 배치 마을·타일 색·ΔVP·연결 경로를
  한 번에 계산 — selectAction(행동 가치)·AIPlayer(배치 + 신도시행 경로 `setCurrentRoute` 커밋)가 같은
  계획을 공유. 구 방식은 가치가 배치와 무관(타일색만, min(9,n*3))해 **매 턴 도시화 남발** + 신도시
  36% 미연결이었다. 정적 색 맵은 "그 색 수요 도시가 이미 가까우면 중복 목적지" 신선도 검사로 가치 floor.
- **★ 동적색 맵(한국)은 반드시 예외** (`dynamicCityColors` 분기): 수요 = 현재 큐브(소모성)라 신선도
  검사가 성립 안 함 — 걸면 도시화 말살로 **VP 20.7→3.7 붕괴**(100시드 실측). 연결 커밋·배치 제한도
  한국엔 해로움 → 동적맵은 가치만 화물량 기반, 배치·커밋은 레거시 유지 (결과 22.11로 개선).
- **건설 dangling/좀비 수정 (buildTrack.ts)**: ① 중간 슬롯 신규 착공에도 completable 게이트(커밋 경로는
  제외) — 잔여 현금으로 완성 불가한 경로에 착공해 영구 dangling 남기던 것 차단. ② 네트워크 확장 목표에서
  인접 도시(거리<2, 사이 헥스 없음=건설 불가) 제외 — 이를 목표로 잡아 매턴 전체 스킵하던 좀비 차단.
  ③ 도시화 직후에 한해 기회 목록에 없는 커밋 경로 유지(!opp) — 상시 유지로 넓히면 VP 하락(실측).
- 측정: [`docs/ai-auction-baseline-100seed.md`](docs/ai-auction-baseline-100seed.md) 2026-07-02 표.
  **측정 드리프트 주의** — 회귀 의심 시 `git stash`로 직전 코드를 같은 환경에서 재측정해 비교할 것
  (Rust 문서값 12.40이 같은 날 실측 11.89였다).

#### 파산 원인 수정 (2026-07-02b, 사용자 목표 "연명 말고 철도·수송 income으로 파산 0.3")

파산자별 턴 궤적(income/cash/건설/배달) 수집 진단으로 사망 메커니즘을 규명하고 income 레버만 수정.
결과(100시드): 파산 Rust 0.79→**0.33**·Germany 0.41→**0.30**·Korea 0.98→**0.53**·Western 0.46→0.50,
**VP 동반 급등**(Rust 11.3→17.7, Korea 22.1→26.0, Germany 23.2→26.6 — 데드락이 income도 억누르고 있었다).

- **★ 예비금 데드락 해제 (buildTrack.ts, 다인 한정)**: 적자 플레이어는 예비금(지출−income)이 현금보다
  커져 $10을 쥐고도 $3 타일을 영원히 못 짓는 좀비가 됐다(SKIP 연속→생존발행 15주→사망이 지배 패턴).
  이번 턴 잔여 슬롯으로 경로를 완성할 수 있고 출발지에 배달 화물이 있으면(=배달 income으로 회수)
  예비금 전액 면제. 부분 완화(생존 하한)는 오히려 악화 — 완성 도박이 보류보다 기대값이 높다(30시드).
- **엔진업 치명적 디폴트 가드 (moveGoods.ts)**: `engineUpgradeDeltaVP`(vp.ts)에 파산 가드가 있지만
  **front-load 지름길(return 5)이 우회** — T1에 건설로 현금을 소진한 플레이어가 배달 대신 엔진업을
  골라 그 턴 지출을 못 내고 즉사했다. 엔진업 후 shortage로 income이 음수가 되는 상황이면 -∞.
- **기각된 시도 (30시드 악화 실측 — 재시도 금지 아님, 선행조건 변화 시 재검)**: ① 광범위 엔진업
  재정 게이트(여력 $4 미만 금지)는 Rust 회복 경로(저현금 front-load→엔진3→장거리 income)를 차단해
  24→31 악화. ② 완성불가 계획의 주식 발행 차단은 22→28 악화 — **주식 보존 법칙 재확인**(막힌 계획의
  발행 현금도 건설 차례의 경로 전환에 쓰인다). ③ 파산 진단은 파산자 턴 궤적 수집이 가장 효율적
  (임시 하니스: issueShares 스냅샷 + 건설/배달/엔진업 카운트 + SKIP 플래그).
- 잔여 파산(Korea 0.53·Western 0.50)은 boxed-out income 정체(건설 많고 배달 저조) — income 천장 작업 축.

#### Southern US 맵 구현 (2026-07-03, 면화 운송 6인)

사용자 제공 디자인 이미지(2000×1435)를 색상 자동검출 + 격자 피팅으로 추출한 **6인 전용 6턴** 맵.
도시 12 + 마을 14 + 산 15 + 강 11 (Tennessee/Alabama/Chattahoochee/Savannah).

- **flat-top 보드**: Germany/Korea처럼 **전치 저장**(데이터 col=화면세로 0~10, row=화면가로 0~16) +
  `orientation:'flat'` 렌더. 화면 짝수 열이 아래로 반 칸 밀린 배열이라 odd-r 패리티를 맞추기 위해
  **row = 화면열 + 1** (Western US row 0 기법) — row 0은 비어 lake, `trimLeftHexes: 1`로 가림.
  확정 근거: 도시 헥스 바운딩 120×104(=2R×√3R, flat) + 격자 피치 x108/y61.2(=1.5R/√3R/2, R≈71).
- **★ 면화(흰 큐브) 시스템 (시그니처)**: `CubeColor`에 'white' 추가 (CityColor와 분리 —
  도시색은 여전히 5색). 셋업 시 모든 마을에 면화 1개(`MapProfile.townFixedCube`, 주머니에서 안 뽑음).
  - **4대 항구 배달 종료**: `BoardState.cottonPorts`(charleston/savannah/mobile/neworleans) +
    `cityAcceptsCube`에 white 분기 — 흰 큐브는 항구에서만 수용, 다른 도시는 통과. 이 헬퍼 한 곳으로
    경로탐색(hexGrid)·AI(analyzer/vp/buildTrack) 전체에 전파 (Korea 동적색과 같은 패턴).
  - **+1 보너스 수입**: `MapProfile.cubeDeliveryBonus(color)` — completeCubeMove(엔진) +
    moveGoods.ts/vp.ts(AI ΔVP) 세 곳 모두 regionDeliveryBonus 옆에 가산.
  - **배달 후 게임에서 제거**: `MapProfile.deliveredCubeLeavesGame(color)` — completeCubeMove의
    주머니 반환을 건너뜀 (시뮬 테스트가 "주머니/디스플레이에 white 없음" 불변식으로 검증).
  - **도시화 시 면화 이동**: `MapProfile.urbanizationMovesTownCubes` — placeNewCity가 마을 큐브를
    신규 도시 위로 옮김 (다른 맵은 기존대로 제거).
- **Atlanta 호황**: Germany Berlin의 `bonusCityCubeId` 재사용 + **`bonusCityCubeMaxTurn=4`**
  (1~4턴만 물품 성장마다 주머니에서 1개 — 남북전쟁 전 호황).
- **4턴 남북전쟁**: `MapProfile.incomeReductionMultiplier(turn)` — applyIncomeReduction에서
  룰 테이블 감소량에 배수 적용 (Southern: turn===4 → 2배).
- **도시 초기 큐브**: Atlanta 4 / 항구 3 / 나머지 1 (`cityCubeCounts` — 기본 2를 쓰는 도시가 없어 전부 명시).
- **AI**: `incomeSources: ['cityCubes','townCubes']` — Western의 마을 큐브 배달 인프라('town:<id>')를
  그대로 타서 면화 목표 생성·클릭 배달이 추가 코드 없이 동작. 흰 큐브 목적지는 cityAcceptsCube로 항구 자동.
- **측정** (`southernUsSimulation.test.ts`, 100시드): 아래 표. 다른 맵 회귀 게이트 보존.
- **주의**: 면화는 `CUBE_COLORS.white`가 밝은 색이라 보드 렌더에서 흰 큐브만 어두운 테두리(#8a857c)로 구분.

#### 마을 가닥(스퍼) 모델 (2026-06-12 재설계, 모든 맵 공통)

마을 = 헥스 안의 원. **마을 헥스에는 트랙 타일을 배치할 수 없다** (도시처럼).
노선이 마을에 연결되려면 **원→변 가닥(TownSpur)** 이 있어야 하며, 가닥은 실제 건설물이다.

- `TownSpur { townCoord, edge, owner }` — `board.townSpurs`
- **카운트 규칙 (2026-06-18 확정)**: 일반 헥스 타일 1개 = +1카운트. **가닥은 타일 건설 시
  자동 생성되지 않는다** — 타일은 항상 1카운트만 소모하므로 수익을 위해 한 턴에 타일을 온전히
  3개(Engineer 4개) 깔 수 있다. 마을에 닿는 타일은 미연결 상태로 둔다.
- **마을 가닥은 마을 클릭(`buildTownSpur`)으로만 별도 건설** — 그 마을의 빠진 가닥 전부를 한 번에 연결.
  **카운트 = 이번 턴에 그 마을 타일을 처음 변경하면 1**(가닥 개수 무관 — `builtTurn === currentTurn`),
  지난 턴 가닥은 무관, 같은 턴에 그 마을을 또 연결하면 0카운트. 비용 가닥당 $1. 같은 턴 잔여나 다음 턴에.
  UI는 완성 가능한 마을에 주황 점선 테두리. (예: 신도시→마을 트랙을 타일 3개로 깔고, 마을 연결은 다음 턴)
- **AI는 타일 우선** (`decideBuildTrack`): 타일 건설을 먼저 시도하고, 더 못 깔 때만 미연결 마을을
  `buildSpur`로 연결. → 신도시에서 타일을 최대한 짓고 마을 연결은 후순위.
- **도시화(`placeNewCity`)는 건설 카운트와 무관** — 마을→도시 전환 시 그 마을 가닥만 제거, `builtTracksThisTurn` 불변.
- 연결된 노선 수 = 마을 안 가닥 수 (화면 토막 수). 가닥이 2개여도 마을 진입 카운트는 1.
- 이동/배달/완성 링크 판정 모두 **가닥이 있는 변으로만** 마을 통과/도달 인정
- 내 가닥이 있는 마을 = 내 네트워크 → 6방향 어디로든 새 노선 시작 가능
- 도시화 시 해당 마을의 가닥 제거 (도시는 모든 변 연결)
- **도시화된 마을(`town.newCityColor !== null`)은 모든 마을 판정에서 제외** — towns 배열에
  남아 있으므로 `t.newCityColor === null` 조건 필수 (빠뜨리면 도시 연결에 가닥을 요구하는 버그)
- 핵심 테스트: `src/store/__tests__/townHubModel.test.ts` (15 케이스 — 가닥 카운트/첫 트랙 도시 앵커),
  `buildLimitByLog.test.ts` (게임 로그 기반 턴당 건설 제한 검증 — St. Lucia 1턴 도시화 선점자만 건설)

#### 건설 제한 시스템

- 턴당 3개(Engineer 4개) — `builtTracksThisTurn`/`maxTracksThisTurn`
- 모든 건설 경로(buildTrack/buildComplexTrack/redirectTrack/buildTownSpur)가 카운트 검사,
  buildTrack에는 canBuildTrack과 별개의 최종 하드 가드 (`[제한 위반 차단]` 콘솔 박제)
- 카운트 검사는 **타일 1개 기준** — 마을 가닥은 잔여 카운트만큼만 함께 건설 (마을 가닥 모델 참조)
- 게임 로그에 `[N/max]` 카운트 병기, 이번 턴 건설 트랙에 흰 점선 링 표시
- 디버깅: dev 모드에서 브라우저 콘솔 로그를 localhost:3999로 미러링하는 코드가
  GamePageClient에 있음 (수신 서버는 별도 실행 필요 — 없어도 무해, fetch 실패 무시)

#### 미완성 트랙 소유 마커 해제 타이밍 (룰 IV, 2026-07-04)

- 룰북: "미완성 트랙 구간을 자기 턴에 연장 안 하면 소유 디스크가 제거돼 미소유(공용)가 된다."
  → `releaseUnextendedTrack`(boardRules)이 **각 플레이어의 건설 차례가 끝날 때**(nextPhase의
  buildTrack 차례 전환) 그 플레이어(ownerId)의 이번 턴 미연장 미완성 구간을 owner null로.
  턴 종료의 전체 대상 해제는 안전망으로 유지. (기존엔 턴 전체 종료 때만 해제 → 마커가 그 턴
  내내 남던 것을 룰북 타이밍으로 수정)
- **구간 단위 판정**: 연결된 같은-소유자 구간에 이번 턴(`builtTurn===currentTurn`) 타일이 하나라도
  있으면 유지(점진 건설이 매 턴 끊기지 않게). 완성 링크는 영구 소유라 대상 아님.
- **⚠️ trackCubes 맵(St.Lucia)은 제외**: 미완성 구간 소유 자체가 수입원(트랙 큐브 보너스)인데
  AI가 이 타이밍에 미적응이라 즉시 해제 시 붕괴(20시드 VP 추가 악화). `incomeSources`에
  `trackCubes` 있으면 skip. 테스트 `store/__tests__/releaseUnextendedTrack.test.ts`(7케이스).

#### 실행 취소 / 선택 취소 (2026-06-13)

사람 플레이어의 행동을 **다음 단계로 넘어가기 전까지** 되돌리는 두 층위의 취소:

- **선택 취소** (`cancelSelection`): 커밋 전 UI 선택만 초기화 — 건설 출발지/방향,
  큐브 선택, 복합/방향전환 패널, 도시화 모드. 진행 중 큐브 애니메이션(`movingCube`)은 보존
- **실행 취소** (`undoLastAction` + `undoCount`): 확정 행동의 스냅샷 복원.
  대상: 주식 발행, 행동 선택(locomotive 즉시 엔진업 포함 복원), buildTrack/복합/방향전환/
  마을 가닥/도시화. 스냅샷(`board`/`players`/`phaseState`/`newCityTiles`/`goodsDisplay`/`logs`)은
  `store/helpers/undo.ts`의 모듈 레벨 스택 `undoSnapshots`에 보관(비영속, ES 모듈 싱글턴이라
  slice/gameStore가 공유), **`nextPhase`마다 초기화** = 단계/차례 전환 시 확정
- `captureUndo`는 AI 차례면 저장 안 함 (사람 전용). 취소 내역은 게임 로그에 `↩ 취소: ...`
- 새 커밋 액션을 추가하면 검증 통과 직후 `captureUndo(state, label)` + set에
  `undoCount: undoSnapshots.length` 포함할 것 (둘 다 `../helpers/undo`에서 임포트)
- UI: PhasePanel에 단계별 버튼 (`getUndoLabel()`로 취소 대상 표시)
- 테스트: `townHubModel.test.ts`의 실행 취소 케이스 3건

#### 알려진 이슈 (미해결)

- 현재 없음 (2026-07-03 기준). PR #14 코드리뷰 잔여 이슈 5건은 전부 종결 — 처리 내역과 기각 실험
  기록은 [`docs/ai-auction-baseline-100seed.md`](docs/ai-auction-baseline-100seed.md)의 2026-07-03
  섹션 참조. 특히 **"도시화 계획 null이면 필러 선택 차단" 수정은 실측 기각**(Germany −1.88 게이트
  위반) — 계획 null 필러 도시화는 건설 후 배치 재시도가 성공하는 회복 경로이므로 재수정 금지.

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

## 향후 개선 사항

- [x] **Rust Belt 5인 플레이어블** — flat-top 데이터 추출, 다인 엔진/AI 밸런스(VP +4.13)
- [x] **Germany 맵 4인 플레이어블** — 외국 터미널·헥스 고정비용·도시 직결·Engineer 절반·Berlin 보너스 (8턴)
- [x] **Western U.S. 맵 6인 플레이어블** — pointy-top 추출, 마을 큐브·$20 시작·늪/산 비용·동서 배달 보너스·시작도시 제한·연속성·대륙횡단 보너스 (6턴)
- [x] **Korea 맵 4인 플레이어블** — flat-top 추출, 동적 도시 색상·수원 직결 링크·도시화 디스플레이 보충·평양/수원 no-growth (8턴)
- [x] **Southern U.S. 맵 6인 플레이어블** — 사용자 디자인 이미지 추출(flat-top 전치), 면화(흰 큐브)→4대 항구 배달·Atlanta 1~4턴 보너스·4턴 수입감소 2배 (6턴)
- [ ] Western/Germany/Rust Belt AI 추가 밸런싱 (파산률↓, AI 대륙횡단·직결 링크 활용)
- [ ] Three.js로 3D 게임보드 구현
- [ ] GSAP ScrollTrigger 고급 애니메이션 (라이브러리는 설치됨, 미적용)
- [ ] i18n 다국어 지원
- [ ] 다크/라이트 모드 토글
- [x] PWA 지원 (오프라인 모드, 서비스 워커, 게임 상태 저장)
- [x] 반응형 UI (모바일/태블릿/데스크톱 — hooks, BottomSheet, CollapsiblePanel)

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

---

### 포인티탑 헥스 가장자리 번호 (getEdgeMidpoint 코드 기준)

⚠️ **중요**: SVG 좌표계에서 y+는 아래 방향입니다!

```
        Edge 5    Edge 4
    (UPPER-RIGHT) (UPPER-LEFT)
           \      /
            \    /
    Edge 0 ──────── Edge 3
    (RIGHT)         (LEFT)
            /    \
           /      \
        Edge 1    Edge 2
    (LOWER-RIGHT) (LOWER-LEFT)
```

- Edge 0: 오른쪽 (RIGHT / E)
- Edge 1: 오른쪽 아래 (LOWER-RIGHT / SE) ← 이전 문서 틀림!
- Edge 2: 왼쪽 아래 (LOWER-LEFT / SW) ← 이전 문서 틀림!
- Edge 3: 왼쪽 (LEFT / W)
- Edge 4: 왼쪽 위 (UPPER-LEFT / NW) ← 이전 문서 틀림!
- Edge 5: 오른쪽 위 (UPPER-RIGHT / NE) ← 이전 문서 틀림!

**직선 트랙 (반대편 엣지):**
- [3, 0]: 좌↔우 (수평)
- [4, 1]: 좌상↔우하 (NW↔SE)
- [5, 2]: 우상↔좌하 (NE↔SW)

### 좌표 0-base (2026-06, feature/st-lucia-ai-income)

맵 데이터 좌표를 0-base로 통일했다 — 맵 데이터(stLucia/tutorial)의 col을 −1 이동,
`DEFAULT_START_COL = 0`. **게임 로직은 불변** (odd-r 인접은 row의 홀짝만 사용하므로 col 평행이동에
무영향). 화면/로그 좌표가 (0,0)부터 표시된다. 프리셋 트랙 좌표를 쓰는 테스트는 col −1 재정렬 필요.

### Odd-r Offset 이웃 계산 공식

```
Even row (row % 2 == 0):
  Edge 0 (E/RIGHT):       (col+1, row)
  Edge 1 (SE/LOWER-RIGHT): (col,   row+1)  ← 주의: (col+1, row+1) 아님!
  Edge 2 (SW/LOWER-LEFT):  (col-1, row+1)
  Edge 3 (W/LEFT):        (col-1, row)
  Edge 4 (NW/UPPER-LEFT):  (col-1, row-1)
  Edge 5 (NE/UPPER-RIGHT): (col,   row-1)

Odd row (row % 2 == 1):
  Edge 0 (E/RIGHT):       (col+1, row)
  Edge 1 (SE/LOWER-RIGHT): (col+1, row+1)
  Edge 2 (SW/LOWER-LEFT):  (col,   row+1)
  Edge 3 (W/LEFT):        (col-1, row)
  Edge 4 (NW/UPPER-LEFT):  (col,   row-1)
  Edge 5 (NE/UPPER-RIGHT): (col+1, row-1)
```

**연결 규칙**: A 헥스의 edge X와 B 헥스의 edge (X+3)%6이 양쪽 모두 있어야 연결됨

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
