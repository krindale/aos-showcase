# CLAUDE.md - Age of Steam Showcase

이 프로젝트에 대한 Claude Code 가이드입니다.

## 프로젝트 개요

Age of Steam 보드게임의 프리미엄 비주얼 쇼케이스 웹사이트입니다.
텍스트 중심 매뉴얼이 아닌, 시각적 임팩트와 애니메이션 중심의 모던 웹 애플리케이션입니다.

## 기술 스택

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS 3.4
- **Animation**: Framer Motion 11
- **Icons**: Lucide React
- **Language**: TypeScript
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
```

## 프로젝트 구조

```
src/
├── app/
│   ├── page.tsx           # 랜딩 페이지 (/, HeroSection + GameBoardPreview + FeatureCards)
│   ├── layout.tsx         # 루트 레이아웃 (Navigation + Footer 포함)
│   ├── globals.css        # 글로벌 스타일, 유틸리티 클래스
│   ├── gameplay/
│   │   └── page.tsx       # 게임플레이 페이지 (턴 시퀀스, 트랙 건설)
│   ├── actions/
│   │   └── page.tsx       # 특수 행동 페이지 (7개 3D 플립 카드)
│   ├── maps/
│   │   └── page.tsx       # 맵 갤러리 (6개 맵 슬라이더)
│   └── calculator/
│       └── page.tsx       # 계산기 (트랙 비용, 승점, 수입)
└── components/
    ├── Navigation.tsx     # 글래스모피즘 네비게이션 바
    ├── Footer.tsx         # 푸터 (링크, 소셜)
    ├── HeroSection.tsx    # 풀스크린 히어로 + 패럴랙스
    ├── GameBoardPreview.tsx # 헥스 그리드 인터랙티브 프리뷰
    └── FeatureCards.tsx   # 피처 카드 + 숫자 카운트업
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

### MapsPage
- 풀스크린 슬라이더
- AnimatePresence로 전환 효과
- 맵 정보 오버레이

### CalculatorPage
- 3개 탭: 트랙 비용, 승점 계산, 수입 시뮬레이터
- 인터랙티브 슬라이더
- 실시간 계산 결과

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

- [ ] Three.js로 3D 게임보드 구현
- [ ] GSAP ScrollTrigger 고급 애니메이션
- [ ] i18n 다국어 지원
- [ ] 다크/라이트 모드 토글
- [ ] PWA 지원

## 참고 링크

- **라이브 사이트**: https://krindale.github.io/aos-showcase/
- **GitHub**: https://github.com/krindale/aos-showcase
- **BoardGameGeek**: https://boardgamegeek.com/boardgame/4098/age-steam
