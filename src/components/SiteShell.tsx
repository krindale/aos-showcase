'use client';

import { usePathname } from 'next/navigation';
import Navigation from './Navigation';
import Footer from './Footer';

/**
 * 전역 크롬(상단 네비게이션 + 푸터)을 라우트별로 조건부 렌더한다.
 * 게임 화면(/game/*)은 자체 헤더(뒤로가기·턴트랙 등)를 가진 풀스크린 앱이라
 * 전역 fixed 네비게이션이 겹쳐 보이므로 숨긴다 (플레이어 설정 화면 포함).
 */
export default function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isGameRoute = pathname?.startsWith('/game');

  return (
    <>
      {!isGameRoute && <Navigation />}
      <main className="flex-1">{children}</main>
      {!isGameRoute && <Footer />}
    </>
  );
}
