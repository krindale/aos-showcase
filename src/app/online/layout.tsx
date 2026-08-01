import type { Metadata } from 'next';

/**
 * /online·/online/quick 세그먼트 레이아웃 — **메타데이터 전용**.
 *
 * 두 페이지 모두 'use client'라 페이지 파일에서 metadata를 export할 수 없다
 * (Next.js는 서버 컴포넌트에서만 metadata를 읽는다). 그래서 색인 차단만을 위해
 * 이 레이아웃을 둔다 — 렌더는 children을 그대로 통과시키므로 DOM에 영향이 없다.
 *
 * 왜 noindex인가: 방 코드·좌석이 오가는 화면이라 검색에 잡힐 이유가 없다.
 * robots.txt(public/)는 서브패스 배포에서 크롤러가 읽지 않으므로 이 meta가 실제 방어다.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OnlineLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
