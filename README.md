# Age of Steam - Premium Showcase

19세기 철도 산업의 황금기를 배경으로 한 전략 보드게임 **Age of Steam**의 프리미엄 비주얼 쇼케이스 웹사이트입니다.

![Age of Steam](https://img.shields.io/badge/Board%20Game-Age%20of%20Steam-d4a853)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.4-38bdf8)
![Framer Motion](https://img.shields.io/badge/Framer%20Motion-11-ff0055)

## 라이브 데모

**https://krindale.github.io/aos-showcase/**

## 주요 특징

- **다크 테마** - 증기기관 시대의 산업적 느낌
- **골드/브론즈 악센트** - 고급스러운 디자인
- **Glassmorphism** - 모던한 반투명 효과
- **스크롤 애니메이션** - Framer Motion 기반
- **반응형 디자인** - 모바일/데스크톱 최적화

## 페이지 구성

| 페이지 | 경로 | 설명 |
|--------|------|------|
| **랜딩** | `/` | Hero 섹션, 게임보드 프리뷰, 피처 카드, 스탯 카운터 |
| **게임플레이** | `/gameplay` | 턴 시퀀스 타임라인, 트랙 건설 시뮬레이터 |
| **특수 행동** | `/actions` | 7가지 특수 행동 카드 (3D 플립) |
| **맵 갤러리** | `/maps` | 6개 맵 슬라이더 |
| **계산기** | `/calculator` | 트랙 비용, 승점, 수입 계산기 |

## 기술 스택

```
Framework:    Next.js 14 (App Router)
Styling:      Tailwind CSS
Animation:    Framer Motion
Icons:        Lucide React
Language:     TypeScript
Deployment:   GitHub Pages
```

## 시작하기

### 필수 조건

- Node.js 18+
- npm 또는 yarn

### 설치

```bash
# 저장소 클론
git clone https://github.com/krindale/aos-showcase.git
cd aos-showcase

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

브라우저에서 http://localhost:3000 접속

### 빌드

```bash
# 프로덕션 빌드
npm run build

# 빌드 결과 확인
ls out/
```

## 프로젝트 구조

```
aos_showcase/
├── src/
│   ├── app/
│   │   ├── page.tsx              # 랜딩 페이지
│   │   ├── layout.tsx            # 루트 레이아웃
│   │   ├── globals.css           # 글로벌 스타일
│   │   ├── gameplay/page.tsx     # 게임플레이 페이지
│   │   ├── actions/page.tsx      # 특수 행동 페이지
│   │   ├── maps/page.tsx         # 맵 갤러리 페이지
│   │   └── calculator/page.tsx   # 계산기 페이지
│   └── components/
│       ├── Navigation.tsx        # 네비게이션 바
│       ├── Footer.tsx            # 푸터
│       ├── HeroSection.tsx       # 히어로 섹션
│       ├── GameBoardPreview.tsx  # 게임보드 프리뷰
│       └── FeatureCards.tsx      # 피처 카드
├── tailwind.config.ts            # Tailwind 설정
├── next.config.mjs               # Next.js 설정
└── .github/workflows/deploy.yml  # GitHub Actions
```

## 컬러 팔레트

| 용도 | 색상 | HEX |
|------|------|-----|
| 배경 | 다크 | `#0a0a0f` |
| 배경 (보조) | 다크 그레이 | `#12121a` |
| 텍스트 | 라이트 | `#f5f5f5` |
| 악센트 | 골드 | `#d4a853` |
| 악센트 (밝음) | 라이트 골드 | `#e6c77a` |
| 악센트 (어두움) | 브론즈 | `#b8923e` |

## 게임 정보

**Age of Steam**은 Martin Wallace가 디자인한 철도 경영 전략 보드게임입니다.

- **플레이어**: 3-6인
- **플레이 시간**: 120-180분
- **출시**: 2002년
- **BGG**: [Age of Steam](https://boardgamegeek.com/boardgame/4098/age-steam)

## 라이선스

이 프로젝트는 팬메이드 쇼케이스입니다. Age of Steam은 Martin Wallace와 Eagle-Gryphon Games의 상표입니다.

---

Built with Next.js & Tailwind CSS
