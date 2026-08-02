# Age of Steam — Premium Showcase

19세기 철도 산업의 황금기를 배경으로 한 전략 보드게임 **Age of Steam**의 프리미엄 비주얼 쇼케이스 웹사이트입니다.
단순한 매뉴얼을 넘어, **룰북을 완전히 구현한 플레이어블 게임**과 **정교한 AI 대전 · 실시간 온라인 멀티플레이**를 갖춘 모던 웹 애플리케이션입니다.

![Age of Steam](https://img.shields.io/badge/Board%20Game-Age%20of%20Steam-c04a2b)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.4-38bdf8)
![Framer Motion](https://img.shields.io/badge/Framer%20Motion-12-ff0055)
![Supabase](https://img.shields.io/badge/Supabase-Realtime-3ecf8e)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![PWA](https://img.shields.io/badge/PWA-offline-5a0fc8)

**라이브 데모 → https://krindale.github.io/aos-showcase/**

---

## 목차

- [주요 특징](#주요-특징)
- [게임 플레이](#게임-플레이)
- [플레이 가능한 맵](#플레이-가능한-맵)
- [AI 시스템](#ai-시스템)
- [온라인 멀티플레이](#온라인-멀티플레이)
- [아키텍처 하이라이트](#아키텍처-하이라이트)
- [페이지 구성](#페이지-구성)
- [기술 스택](#기술-스택)
- [시작하기](#시작하기)
- [프로젝트 구조](#프로젝트-구조)
- [테스트와 품질](#테스트와-품질)
- [디자인 시스템](#디자인-시스템)
- [문서](#문서)
- [게임 정보](#게임-정보)

## 주요 특징

- **완전한 플레이어블 게임** — 7개 맵을 룰북 그대로 플레이. 10단계 턴 시퀀스, 트랙 건설·물품 배송·주식·경매·도시화까지 빠짐없이 구현
- **정교한 AI 대전 상대** — 화물 기반 동적 전략 + A\* 경로 탐색으로 실시간 최적 경로를 계산하고, 모든 결정을 **ΔVP(예상 승점 증분)** 단위로 평가하는 자체 AI 엔진
- **실시간 온라인 멀티플레이** — Supabase Realtime 기반 **호스트 권위** 동기화. 방 코드 초대·F5 재접속·호스트 승계·게임 중 채팅·공개방/빠른 매칭
- **PWA · 오프라인** — 서비스 워커로 오프라인 플레이 및 게임 상태 자동 저장, 홈 화면 설치 지원
- **반응형 UI** — 모바일 바텀 시트 · 태블릿 접이식 패널 · 데스크톱 3분기, 핀치 줌/팬 제스처
- **크림 페이퍼 + 버밀리언 디자인** — 에디토리얼 감성의 페이퍼 서피스 라이트 테마, Space Grotesk × IBM Plex Sans KR
- **스크롤 애니메이션** — Framer Motion 기반 뷰포트 진입 연출과 SVG 다이어그램

## 게임 플레이

`/game/<맵>`에서 룰북을 충실히 재현한 게임을 사람 또는 AI와 플레이할 수 있습니다.

**턴 시퀀스 (10단계)**
`주식 발행 → 순서 경매 → 행동 선택 → 트랙 건설 → 물품 이동 → 수입 수집 → 비용 지불 → 수입 감소 → 물품 성장 → 턴 마커 전진`

**구현된 핵심 메커니즘**

- **트랙 건설** — 단순/복합(교차·공존) 트랙, 방향 전환, 지형별 비용(평지·강·산), 턴당 건설 제한(3개, Engineer 4개)
- **마을 가닥(스퍼) 모델** — 마을은 원→변 가닥으로 연결하는 실제 건설물로 정확히 모델링
- **경매 & 7가지 특수 행동** — First Move · First Build · Engineer · Locomotive · Urbanization · Production · Turn Order
- **링크 기반 수입** — 물품이 지나는 완성 링크마다 소유자 수입 +1, 타사 철도 이용 시 소유자에게 귀속
- **주식 · 파산 · 도시화 · 물품 성장(주사위)** — 룰북 정산 로직 그대로
- **실행 취소 / 선택 취소** — 단계 전환 전까지 사람 플레이어의 행동을 되돌리기

## 플레이 가능한 맵

각 맵은 고유한 특수 규칙을 상속 override로 구현합니다 (맵별 세팅·비용·배달·AI 전략).

| 맵 | 인원 | 턴 | 특징 |
|----|:---:|:---:|------|
| **Tutorial** | 2인 | — | 입문용 기본 맵 |
| **Rust Belt** | 5인 | 7턴 | 미국 북동부 (기본 맵) |
| **Korea** | 4인 | 8턴 | 동적 도시 색상 · 수원 직결 링크 |
| **Western U.S.** | 6인 | 6턴 | 대륙횡단 철도 · 마을 큐브 · 동서 배달 보너스 |
| **Southern U.S.** | 6인 | 6턴 | 면화 운송 · 4대 항구 · 4턴 남북전쟁 |
| **Germany** | 4인 | 8턴 | 외국 터미널 · 헥스 고정비용 · 도시 직결 |
| **St. Lucia** | 2인 | 8턴 | 헥스 큐브 배달 · 교대 선공권 |
| **Barbados** | 솔로 | 10턴 | 준비 중 |

## AI 시스템

단순한 규칙 기반을 넘어, **화물 기반 동적 전략**으로 실시간 최적 경로를 탐색하는 객체 지향 AI 엔진입니다.

- **ΔVP 통일 의사결정** — 모든 Phase(발행·경매·행동·건설·수송)의 선택을 예상 승점 증분으로 환산해 비교
  VP 공식: `수입 × 3 + 완성 링크 트랙 구간 × 1 − 발행 주식 × 3`
- **A\* 경로 탐색** — 지형 비용·상대 트랙 회피·자사 트랙 우대를 반영한 최적 경로 계산
- **맵별 전략 다형성** — `MapProfile` override로 맵마다 다른 income 원천·경로 선택·엔진 정책 주입 (코드에 맵 분기 하드코딩 없음)
- **밸런싱 하니스** — 맵별 전체 게임 시뮬레이션을 **100시드**로 측정하고 베이스라인 표와 비교해 회귀 판정
- **인게임 디버거** — 브라우저 콘솔에서 AI의 생각을 실시간 추적 (`debugAI` · `getAIReport` · `debugStrategy` · `debugPaths`) + 카테고리별 로그 토글

> 상세 알고리즘·맵별 구현·밸런싱 이력은 [`docs/ai-system.md`](docs/ai-system.md) 참조.

## 온라인 멀티플레이

Supabase Realtime을 전송 계층으로 쓰는 **호스트 권위(host-authoritative)** 아키텍처입니다.

```
게스트 intent 전송 → 호스트가 검증·실행(랜덤·AI 포함) → 압축 스냅샷 브로드캐스트 → 전원 확정
```

- **호스트 권위** — 방장 클라이언트만 게임 로직을 실제 실행하고, 결과를 gzip 압축 스냅샷으로 전파해 디싱크를 원천 차단 (랜덤 시드화 불필요)
- **낙관적 반영(optimistic)** — 게스트 자기 행동은 즉시 로컬 반영(체감 지연 0), 호스트 스냅샷 도착 시 확정/교정
- **견고한 세션** — F5 자동 재입장, 호스트 이탈 시 승계, 방 코드 초대, 공개방 목록·빠른 매칭, 게임 중 플로팅 채팅
- **단방향 의존** — `gameStore`는 네트워크를 모른다 (`net → store` 단방향). 자체 서버로 교체 시 `net`만 교체
- **비용 친화적** — 친구 규모는 Supabase Free 티어로 $0. 미설정 배포(포크)는 온라인 탭이 자동으로 숨겨짐

> 종합 설계·비용·Phase 체크리스트는 [`docs/online-multiplayer-plan.md`](docs/online-multiplayer-plan.md) 참조.

## 아키텍처 하이라이트

- **맵 프로파일 다형성** (`src/maps/`) — `mapId === 'x'` 문자열 분기 대신 `MapProfile` 추상 베이스 + 서브클래스 override. 새 맵은 프로파일만 추가
- **Zustand slice 아키텍처** (`src/store/`) — 액션 인터페이스는 한곳에 유지하고 구현만 도메인별 slice(UI·경매·건설·이동·정산·물품성장)로 분산
- **단방향 의존** — `net → store`, `maps → types`. 저수준 모듈이 고수준을 모르게 유지
- **PWA + 백그라운드 안전 타이머** — 숨김 탭 setTimeout 스로틀을 회피하는 Web Worker 기반 `safeTimers`로 봇 진행·스냅샷 전송이 멈추지 않음
- **정적 배포 최적화** — Next.js Static Export + WebP 맵 이미지(맵당 ~200KB)로 GitHub Pages에 경량 배포

## 페이지 구성

| 페이지 | 경로 | 설명 |
|--------|------|------|
| **랜딩** | `/` | Hero · 핵심 경험 카드 · "왜 명작인가" 에디토리얼 · CTA 밴드 |
| **게임** | `/game/<맵>` | 인터랙티브 플레이어블 게임 (맵별 SSG, AI/온라인 지원) |
| **게임플레이** | `/gameplay` | 9단계 턴 타임라인 아코디언 + SVG 애니메이션 다이어그램 |
| **특수 행동** | `/actions` | 7가지 특수 행동 카드 (3D 플립) |
| **맵 갤러리** | `/maps` | 8개 맵 카드 그리드 (난이도 배지 + 플레이 버튼) |

## 기술 스택

```
Framework:    Next.js 14 (App Router, Static Export)
Styling:      Tailwind CSS 3.4
Animation:    Framer Motion 12  (GSAP 3.14 설치됨, 현재 미사용)
State:        Zustand 5  (slice 아키텍처)
Online:       Supabase Realtime  (호스트 권위 동기화)
PWA:          Service Worker  (오프라인 · 게임 상태 저장)
Icons:        Lucide React
Language:     TypeScript 5
Testing:      Vitest 4  (단위/통합 테스트)
Deployment:   GitHub Pages  (Static Export, basePath /aos-showcase)
```

## 시작하기

### 필수 조건

- Node.js 18+
- npm

### 설치 및 실행

```bash
# 저장소 클론
git clone https://github.com/krindale/aos-showcase.git
cd aos-showcase

# 의존성 설치
npm install

# 개발 서버 실행 → http://localhost:3000
npm run dev
```

### npm 스크립트

| 스크립트 | 설명 |
|----------|------|
| `npm run dev` | 개발 서버 (http://localhost:3000) |
| `npm run build` | 프로덕션 빌드 → `out/` 정적 파일 생성 |
| `npm run lint` | ESLint 검사 |
| `npm run test:unit` | Vitest watch 모드 |
| `npx vitest run` | 전체 단위/통합 테스트 1회 실행 |

> **온라인 멀티플레이(선택)**: `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 설정하면 온라인 탭이 활성화됩니다. 미설정 시 자동으로 숨겨지며 로컬 싱글/AI 플레이는 정상 동작합니다.

## 프로젝트 구조

```
aos_showcase/
├── src/
│   ├── app/                # Next.js App Router 페이지 (랜딩·게임·갤러리)
│   │   └── game/[mapId]/   #   동적 게임 라우트 (맵별 SSG)
│   ├── ai/                 # AI 엔진 (ΔVP 의사결정·A* 경로탐색·맵별 전략·디버거)
│   ├── maps/               # 맵 프로파일 (다형성 — 맵별 규칙을 상속 override)
│   ├── net/                # 온라인 멀티 (Supabase Realtime + 호스트 권위)
│   ├── store/              # Zustand 게임 상태 (도메인별 slice)
│   ├── components/         # UI 컴포넌트 (게임보드·패널·랜딩 섹션·온라인 로비)
│   ├── hooks/              # 반응형 훅 (미디어쿼리·방향·터치 제스처)
│   ├── utils/              # 게임 엔진 규칙·헥스 기하·맵 데이터
│   └── types/              # 전역 타입 정의
├── public/                 # PWA 매니페스트·서비스워커·맵 이미지(WebP)
├── docs/                   # 상세 문서 (아래 "문서" 참조)
└── .github/workflows/      # GitHub Pages 자동 배포
```

## 테스트와 품질

- **Vitest 단위/통합 테스트** — 게임 엔진 규칙·트랙 건설·정산·AI 전략을 단위 검증
- **AI 전체 게임 시뮬레이션** — 각 맵을 실제 `gameStore`로 헤드리스 완주시켜 파산율·재정 건전성·승점 분포 측정
- **100시드 베이스라인 회귀 게이트** — 다인 맵은 편차가 커 100시드로 측정하고, AI 로직 변경 시 베이스라인 표와 비교해 회귀/개선을 판정 (`평균 VP ≥ 베이스라인 − 1`)

```bash
npx vitest run                       # 전체
npx vitest run src/ai/__tests__/     # AI 시뮬레이션
npx vitest run src/store/__tests__/  # 스토어/엔진
```

## 디자인 시스템

**"크림 페이퍼 + 버밀리언"** — 에디토리얼 감성의 페이퍼 서피스 라이트 테마.

| 용도 | 색상 | HEX |
|------|------|-----|
| 페이지 배경 | 크림 | `#efece4` |
| 카드 / 패널 | 페이퍼 화이트 | `#faf8f3` |
| 텍스트 (잉크) | 딥 브라운블랙 | `#1c1b18` |
| 악센트 | 버밀리언 | `#c04a2b` |
| 긍정 / 수입 | 딥그린 | `#2f6b4f` |

- **폰트**: Space Grotesk (제목/숫자) · IBM Plex Sans KR (본문)
- 이전 다크+골드+글래스모피즘 디자인은 `backup/design-dark-gold` 브랜치에 백업

## 문서

프로젝트 상세 문서는 [`docs/`](docs/)에 있습니다.

| 문서 | 내용 |
|------|------|
| [`CLAUDE.md`](CLAUDE.md) | 개발 가이드 (아키텍처·컨벤션·현재 동작) + Age of Steam 룰북 전문 |
| [`docs/ai-system.md`](docs/ai-system.md) | AI 시스템 (의사결정 알고리즘·맵별 구현·밸런싱) |
| [`docs/hex-geometry.md`](docs/hex-geometry.md) | 헥스 그리드 기하 (엣지 번호·odd-r 공식) |
| [`docs/online-multiplayer-plan.md`](docs/online-multiplayer-plan.md) | 온라인 멀티 설계·비용·체크리스트 |
| [`docs/issue-log.md`](docs/issue-log.md) | 버그·이슈 수정 이력 |

## 게임 정보

**Age of Steam**은 Martin Wallace가 디자인한 철도 경영 전략 보드게임입니다.

- **플레이어**: 1–6인
- **플레이 시간**: 약 120분
- **출시**: 2002년
- **BGG**: [Age of Steam](https://boardgamegeek.com/boardgame/4098/age-steam)

## 라이선스

이 프로젝트는 팬메이드 쇼케이스입니다. Age of Steam은 Martin Wallace와 Eagle-Gryphon Games의 상표입니다.

---

Built with Next.js · Tailwind CSS · Framer Motion
