import type { Metadata } from "next";
import "./globals.css";
import SiteShell from "@/components/SiteShell";
import { ServiceWorkerRegistration } from "./service-worker-registration";

// Use basePath for production (GitHub Pages) deployment
const basePath = process.env.NODE_ENV === 'production' ? '/aos-showcase' : '';

export const metadata: Metadata = {
  title: "Age of Steam | 철도왕의 시대",
  description: "19세기 철도 산업의 황금기를 배경으로 한 전략 보드게임. 트랙을 건설하고, 물품을 운송하며, 철도왕이 되어보세요.",
  keywords: ["Age of Steam", "보드게임", "철도", "전략", "Martin Wallace"],
  authors: [{ name: "Age of Steam Showcase" }],
  manifest: `${basePath}/manifest.json`,
  openGraph: {
    title: "Age of Steam | 철도왕의 시대",
    description: "19세기 철도 산업의 황금기를 배경으로 한 전략 보드게임",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* 웹폰트는 <link>로 — CSS @import는 globals.css를 다 파싱한 뒤에야 요청이 시작돼
            로딩이 눈에 띄게 늦다. 그동안 display=swap이 OS 폴백으로 렌더하는데, 그 폴백이
            맥은 Apple SD Gothic Neo(좁음)·윈도우는 맑은 고딕(넓음)이라 같은 문장의 폭이
            달라져 윈도우에서만 줄바꿈이 생겼다 (2026-07-29 사용자 보고: 게임 화면 텍스트가
            2줄로 깨지고 글꼴 모양도 맥과 다르게 보임 = 웹폰트 미적용 상태).
            preconnect로 gstatic 핸드셰이크를 미리 열어 폰트 도착을 앞당긴다. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
        />
        <meta name="theme-color" content="#f7f5f0" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Age of Steam" />
      </head>
      <body className="antialiased min-h-screen flex flex-col">
        {/* Register serviceWorker for PWA support */}
        <ServiceWorkerRegistration />
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
