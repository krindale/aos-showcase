# CLAUDE.MD - Age of Steam Showcase

이 프로젝트에 대한 Claude Code 가이드입니다.

## 프로젝트 개요

Age of Steam 보드게임의 프리미엄 비주얼 쇼케이스 웹사이트입니다.
텍스트 중심 매뉴얼이 아닌, 시각적 임팩트와 애니메이션 중심의 모던 웹 애플리케이션입니다.

## 일반 수칙

- **언어**: 모든 과정 설명, 메모리 기록, 그리고 **생각(Thought Process)**은 반드시 **한글**로 작성해야 합니다.
- **라이브러리**: 새로운 라이브러리를 추가하거나 기존 라이브러리를 삭제할 때는 반드시 **사용자에게 먼저 이야기(승인 요청)**해야 합니다. 임의로 추가/삭제하지 마십시오.


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

### 컬러 팔레트

```typescript
// tailwind.config.ts에서 정의됨
colors: {
  background: {
    DEFAULT: '#0a0a0f',    // 메인 배경
    secondary: '#12121a',  // 보조 배경
    tertiary: '#1a1a24',   // 3차 배경
  },
  foreground: {
    DEFAULT: '#f5f5f5',    // 메인 텍스트
    secondary: '#a0a0a0',  // 보조 텍스트
    muted: '#6b6b6b',      // 흐린 텍스트
  },
  accent: {
    DEFAULT: '#d4a853',    // 골드 악센트
    light: '#e6c77a',      // 밝은 골드
    dark: '#b8923e',       // 어두운 골드/브론즈
  },
  steam: {
    red: '#e63946',
    blue: '#457b9d',
    green: '#2a9d8f',
    purple: '#7b2cbf',
    yellow: '#f4a261',
  },
}
```

### 유틸리티 클래스

```css
/* globals.css에서 정의됨 */
.text-gradient     /* 골드 그라디언트 텍스트 */
.glass            /* 글래스모피즘 배경 */
.glass-card       /* 글래스 카드 */
.glow-text        /* 골드 글로우 텍스트 */
.glow-border      /* 골드 글로우 테두리 */
.btn-primary      /* 골드 그라디언트 버튼 */
.btn-secondary    /* 골드 아웃라인 버튼 */
.card-hover       /* 호버 시 상승 효과 */
.hex-pattern      /* 헥스 패턴 배경 */
.snap-section     /* 스크롤 스냅 정렬 (html에 scroll-snap-type: y proximity) */
```

## 프로젝트 구조

```
src/
├── app/                        # Next.js App Router 페이지
│   ├── page.tsx                # 랜딩 페이지 (/, HeroSection + GameBoardPreview + FeatureCards)
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
│   │   ├── analyzer.ts         # A* 경로 탐색, evaluateTrackForRoute, getConnectedCities
│   │   ├── selector.ts         # 화물 기반 동적 전략 선택 (getNextTargetRoute)
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
│       └── helpers/
│           └── mockState.ts    # 테스트용 Mock 데이터 헬퍼
│
├── components/                 # UI 컴포넌트
│   ├── Navigation.tsx          # 글래스모피즘 네비게이션 바
│   ├── Footer.tsx              # 푸터 (링크, 소셜)
│   ├── HeroSection.tsx         # 풀스크린 히어로 + 패럴랙스
│   ├── GameBoardPreview.tsx    # 헥스 그리드 인터랙티브 프리뷰
│   ├── FeatureCards.tsx        # 피처 카드 + 숫자 카운트업
│   ├── OfflineIndicator.tsx    # 오프라인/동기화 상태 표시 (PWA)
│   └── game/                   # 게임 UI 컴포넌트 (16개)
│       ├── GameBoard.tsx       # 헥스 그리드 게임보드 (SVG)
│       ├── PlayerPanel.tsx     # 플레이어 정보 패널 (AI 표시 포함)
│       ├── PhasePanel.tsx      # 현재 단계 표시 (AI 생각 중 상태)
│       ├── AuctionPanel.tsx    # 경매 UI
│       ├── UrbanizationPanel.tsx   # 도시화 UI
│       ├── ProductionPanel.tsx     # 생산 UI
│       ├── GoodsGrowthPanel.tsx    # 물품 성장 UI
│       ├── GoodsDisplayPanel.tsx   # 물품 디스플레이 UI
│       ├── ComplexTrackPanel.tsx   # 복합 트랙 선택 UI
│       ├── RedirectTrackPanel.tsx  # 트랙 방향 전환 UI
│       ├── TurnTrack.tsx       # 턴 트랙 UI
│       ├── DiceRoller.tsx      # 주사위 굴리기 UI
│       ├── DebugPanel.tsx      # 디버그 패널 UI
│       ├── AIDebugModal.tsx    # AI 디버그 모달
│       ├── BottomSheet.tsx     # 모바일용 드래그 바텀 시트 (반응형)
│       └── CollapsiblePanel.tsx    # 태블릿용 접이식 사이드 패널 (반응형)
│
├── hooks/                      # 반응형 UI 커스텀 훅
│   ├── useMediaQuery.ts        # 미디어 쿼리 브레이크포인트 감지
│   ├── useOrientation.ts       # 가로/세로 방향 감지
│   └── useTouchGestures.ts     # 터치 제스처 (핀치 줌, 팬)
│
├── store/                      # 상태 관리
│   ├── gameStore.ts            # Zustand 게임 상태 관리 (AI 턴 실행 포함)
│   └── __tests__/
│       ├── payExpenses.test.ts # 비용 지불/파산 로직 테스트
│       └── trackBuilding.test.ts   # 트랙 건설 메커니즘 store 레벨 테스트 (방향 전환, 교차/공존, UI 플로우)
│
├── types/
│   └── game.ts                 # 전역 타입 (PlayerId, GamePhase, BoardState 등)
│
└── utils/                      # 핵심 비즈니스 로직 유틸리티
    ├── gameLogic.ts            # 게임 엔진 규칙 (수입 계산, 물품 이동)
    ├── hexGrid.ts              # 헥스 그리드 기하학 (Axial/Offset, A*, BFS)
    ├── trackValidation.ts      # 트랙 건설 및 연결성 검증
    ├── tutorialMap.ts          # 튜토리얼 맵 데이터 정의
    ├── debugConfig.ts          # 디버그 설정 유틸리티 (로그 카테고리 토글)
    ├── pwaUtils.ts             # Service Worker 등록/관리 유틸리티
    └── testHelpers.ts          # 단위 테스트 헬퍼 함수

public/
├── manifest.json               # PWA 매니페스트
├── sw.js                       # Service Worker (오프라인 캐시)
├── icons/                      # PWA 아이콘
└── maps/                       # 맵 이미지

docs/
├── ai-strategy.md              # AI 전략 알고리즘 심층 가이드
└── presentation-script.md      # 프레젠테이션 스크립트
```

## 주요 컴포넌트

### Navigation
- 스크롤 시 글래스모피즘 효과 적용
- 모바일 메뉴 지원
- Framer Motion layoutId로 활성 탭 인디케이터

### HeroSection
- 패럴랙스 스크롤 효과 (useScroll, useTransform)
- 파티클 애니메이션 배경
- 스탯 카드 (플레이어 수, 맵 수, 플레이 시간)

### GameBoardPreview
- 헥스 그리드 시각화
- 호버 인터랙션
- 기능 설명 카드

### FeatureCards
- 4개 핵심 기능 카드
- 호버 시 그라디언트 배경
- AnimatedCounter 컴포넌트 (숫자 카운트업)

### ActionCard (actions/page.tsx)
- 3D 플립 카드 효과
- preserve-3d, backface-visibility 사용
- 앞면: 아이콘, 제목, 설명
- 뒷면: 상세 효과, 전략 팁

### CalculatorPage
3개 탭으로 구성된 게임 계산기:

**1. 트랙 비용 계산기**
- 작업 유형: 배치(Placing), 교체(Replacing), 방향 전환(Redirecting)
- 트랙 유형: 단순, 복합 공존, 복합 교차, 마을 트랙
- 지형: 평지, 강, 산
- 최대 4개 트랙 추가 (Engineer 행동 시)

**2. 승점 계산기** (메뉴얼 기준)
- 수입 트랙 위치 × 3점
- 완성된 링크의 트랙 타일 × 1점
- 발행 주식 수 × -3점

**3. 수입 시뮬레이터** (Phase VI~VIII)
- VI. 수입 수집: 수입 트랙 위치 = 받는 금액
- VII. 비용 지불: 기관차 레벨 + 발행 주식
- VIII. 수입 감소: 테이블 기반 (50+: -10, 41-49: -8, ...)
- 현금 부족 시 수입 감소, 파산 경고

### MapsPage
풀스크린 슬라이더 (AnimatePresence 전환 효과, 맵 정보 오버레이)

7개 맵 갤러리:
- **Rust Belt** (기본) - 미국 북동부
- **Korea** - 한반도, 동적 도시 색상
- **Western U.S.** - 대륙횡단 철도
- **Southern U.S.** - 면화 운송
- **Germany** - 녹색 외국 터미널
- **Barbados** - 솔로 게임
- **St. Lucia** - 2인 전용

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
  isAIThinking: boolean;  // AI 턴 진행 중 여부

  // 주요 함수
  placeBid, passBid, skipBid, resolveAuction,
  selectAction, buildTrack, completeCubeMove,
  nextPhase, resetGame, executeAITurn, ...
}
```

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
- **`strategy/mapConfig.ts`**: 엔진 상한·턴 수·턴당 건설 수를 맵 오버라이드 테이블로 주입. **AI 코드에 "tutorial이면 3" 같은 맵 분기 금지** — 새 맵 추가 시 이 테이블만 갱신
- **`strategy/turnPlan.ts`**: 턴 시작(issueShares)에 계획(목표 경로, A* fullPath, 필요 트랙/비용/현금) 수립, Phase 간 공유. 게임 리셋 시 `clearTurnPlans()` (AIPlayerManager에서 호출)

**Phase별 결정**:
- `issueShares`: TurnPlan.cashNeeded 부족분만 발행. 생존 발행(파산 방지) 절대 우선, 마지막 턴 생존 외 발행 금지, 턴당 2주/총 5주 상한
- `auction`: 1등 순서의 가치(경합배달 + 경합건설 + 행동선점)를 λ로 달러 환산한 입찰 상한. 경합 없으면 일찍 포기 (첫 포기 무료 규칙 활용). 건설 예산 절대 침범 금지
- `selectAction`: 행동별 ΔVP 랭킹 (engineer=완성 가능/조기화/다음 경로 착공, locomotive=해금 배달 가치, firstMove/firstBuild=경합 감지 기반)
- `buildTrack`: 경로 커밋 + 결정론적 경로 추적(`tryDirectPathBuild`). 후보 경로(목표 → 상위 우선순위 → 네트워크 확장)를 순서대로 시도, 전부 실패 시 skip (미완성 트랙 = 0VP)
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

```javascript
// 콘솔 헬퍼 함수
showDebugConfig();                   // 현재 설정 상태 확인
setDebug("trackBuilding", true);     // 특정 카테고리 on/off
setAllDebug(true);                   // 모든 로그 on/off
```

#### AI 트랙 건설 로직 (상세)

- `tryDirectPathBuild` (buildTrack.ts): A* 최적 경로(상대 트랙 회피, 자사 트랙 0.1 우대)를 따라
  frontier(출발지에서 연속된 자사 트랙 끝) 다음 칸에 정확한 엣지로 건설
- 엣지 비호환/실패 좌표는 avoidCoords에 넣어 최대 3회 재탐색
- 상대 단순 트랙 위 복합 트랙(교차/공존) 건설 처리 포함
- 점수 기반 후보 평가 시스템(evaluateTrackForRoute 매직넘버 체계)은 2026-06 재설계에서 제거됨
  — evaluateTrackForRoute는 AI 디버그 모달 표시 용도로만 잔존 (analyzer.ts)
- 참고: docs/ai-strategy.md는 재설계 이전 문서로 일부 구식 (점수 체계 부분)

#### St. Lucia 맵 구현 (2026-06-12, feature/st-lucia-map)

공식 맵 PDF(`maps/aos-st_lucia.pdf`) 픽셀 측정으로 재구성한 2인 전용 8턴 맵.

- **맵 데이터** (`src/utils/stLuciaMap.ts`): 도시 0(도시화로만 생성), 마을 11, 산 10, 강 9.
  원본은 flat-top 보드 — 데이터는 전치 좌표로 저장(인접 동형, 게임 로직 무변경),
  렌더만 `orientation: 'flat'`으로 기하 함수들이 전치 (`hexToPixel` 등의 `flat` 파라미터)
- **맵 룰 분리** (`src/utils/mapRegistry.ts`의 MapRuleConfig): `skipGoodsGrowth`,
  `alternateTurnOrder`(경매 대신 교대 선공권 $5), `firstSeatCost`, `disabledActions`
  (production/turnOrder), `hexCubeSetup`(헥스 위 큐브 38개, 마을 제외),
  `townsAnchorFirstTrack`(도시 0 맵의 첫 트랙 마을 앵커 — 건설 검증과 UI 시작점 선택
  `isValidConnectionPoint`/`getBuildableNeighbors`의 `allowTownAnchor` 파라미터 모두 지원).
  **게임 엔진에 mapId 분기 금지** — 플래그만
- **트랙 큐브 배달**: 트랙 위 큐브를 미완성 링크여도 같은 색 도시로 배달 (`findTrackCubeDeliveries`).
  수입은 시작 구간(미완성이어도) 소유자 +1 **그리고** 이후 경유하는 완성 링크마다 일반 규칙대로
  소유자 +1 (예: 구간→마을→도시 = +2). UI는 `selectCube('track:<id>')` 컨벤션
- 튜토리얼(경매/물품성장 O)과 St. Lucia(선공권/헥스큐브 O) **양쪽 헤드리스 완주 검증 필수**

#### 마을 가닥(스퍼) 모델 (2026-06-12 재설계, 모든 맵 공통)

마을 = 헥스 안의 원. **마을 헥스에는 트랙 타일을 배치할 수 없다** (도시처럼).
노선이 마을에 연결되려면 **원→변 가닥(TownSpur)** 이 있어야 하며, 가닥은 실제 건설물이다.

- `TownSpur { townCoord, edge, owner }` — `board.townSpurs`
- 트랙이 마을 변에 닿게 지어지면 가닥이 **자동 동시 건설**: 건설 카운트 +1, 비용 +$1
  (마을 연결 = 타일 1 + 가닥 1 = 카운트 2)
- **잔여 카운트 부족 시 타일만 건설** (마을 미연결) — 다음 턴에 마을 클릭(`buildTownSpur`,
  1카운트 + $1)으로 가닥을 완성해 연결. UI는 완성 가능한 마을에 주황 점선 테두리 표시,
  AI는 `decideBuildTrack` 최우선 단계에서 미연결 가닥부터 완성
- 연결된 노선 수 = 마을 안 가닥 수 (화면의 철길 토막 수 = 건설 카운트 일치)
- 이동/배달/완성 링크 판정 모두 **가닥이 있는 변으로만** 마을 통과/도달 인정
- 내 가닥이 있는 마을 = 내 네트워크 → 6방향 어디로든 새 노선 시작 가능
- 도시화 시 해당 마을의 가닥 제거 (도시는 모든 변 연결)
- **도시화된 마을(`town.newCityColor !== null`)은 모든 마을 판정에서 제외** — towns 배열에
  남아 있으므로 `t.newCityColor === null` 조건 필수 (빠뜨리면 도시 연결에 가닥을 요구하는 버그)
- 핵심 테스트: `src/store/__tests__/townHubModel.test.ts` (7 케이스),
  `buildLimitByLog.test.ts` (게임 로그 기반 턴당 건설 제한 검증)

#### 건설 제한 시스템

- 턴당 3개(Engineer 4개) — `builtTracksThisTurn`/`maxTracksThisTurn`
- 모든 건설 경로(buildTrack/buildComplexTrack/redirectTrack/buildTownSpur)가 카운트 검사,
  buildTrack에는 canBuildTrack과 별개의 최종 하드 가드 (`[제한 위반 차단]` 콘솔 박제)
- 카운트 검사는 **타일 1개 기준** — 마을 가닥은 잔여 카운트만큼만 함께 건설 (마을 가닥 모델 참조)
- 게임 로그에 `[N/max]` 카운트 병기, 이번 턴 건설 트랙에 흰 점선 링 표시
- 디버깅: dev 모드에서 브라우저 콘솔 로그를 localhost:3999로 미러링하는 코드가
  GamePageClient에 있음 (수신 서버는 별도 실행 필요 — 없어도 무해, fetch 실패 무시)

#### 실행 취소 / 선택 취소 (2026-06-13)

사람 플레이어의 행동을 **다음 단계로 넘어가기 전까지** 되돌리는 두 층위의 취소:

- **선택 취소** (`cancelSelection`): 커밋 전 UI 선택만 초기화 — 건설 출발지/방향,
  큐브 선택, 복합/방향전환 패널, 도시화 모드. 진행 중 큐브 애니메이션(`movingCube`)은 보존
- **실행 취소** (`undoLastAction` + `undoCount`): 확정 행동의 스냅샷 복원.
  대상: 주식 발행, 행동 선택(locomotive 즉시 엔진업 포함 복원), buildTrack/복합/방향전환/
  마을 가닥/도시화. 스냅샷(`board`/`players`/`phaseState`/`newCityTiles`/`logs`)은
  gameStore 모듈 레벨 스택에 보관(비영속), **`nextPhase`마다 초기화** = 단계/차례 전환 시 확정
- `captureUndo`는 AI 차례면 저장 안 함 (사람 전용). 취소 내역은 게임 로그에 `↩ 취소: ...`
- 새 커밋 액션을 추가하면 검증 통과 직후 `captureUndo(state, label)` + set에
  `undoCount: undoSnapshots.length` 포함할 것
- UI: PhasePanel에 단계별 버튼 (`getUndoLabel()`로 취소 대상 표시)
- 테스트: `townHubModel.test.ts`의 실행 취소 케이스 3건

#### 알려진 이슈 (미해결)

- **`getConnectedCities` 트랙 없음 시 반환값**: 트랙이 0개일 때 빈 배열 반환 (테스트에서 4를 기대하는 기존 실패 1건)
- ~~턴 내 대체 경로 탐색 시 경로 변경~~ → 2026-06 재설계에서 해결 (모든 경로 전환 시 `setCurrentRoute` 동기화 + 경로 커밋)

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

- [ ] **Rust Belt 맵 3-6인 플레이어블** (다음 큰 작업) — 공식 맵 PDF 픽셀 측정으로 데이터 추출,
  다인 경매/순서/물품성장 헤드리스 검증, AI 다인 밸런스(VP 베이스라인 신규 측정).
  맵 레지스트리/가닥 모델/AI N인 정규화 인프라는 준비됨
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
