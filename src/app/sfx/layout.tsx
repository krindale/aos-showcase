import type { Metadata } from 'next';

/**
 * /sfx 세그먼트 레이아웃 — **메타데이터 전용** (렌더는 children 통과).
 *
 * 페이지가 'use client'라 metadata를 거기서 export할 수 없어 이 레이아웃에 둔다.
 * /sfx는 네비게이션에 노출하지 않는 검수용 숨은 라우트이므로 색인에서 제외한다.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SfxLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
