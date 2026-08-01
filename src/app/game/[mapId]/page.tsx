import type { Metadata } from 'next';
import GamePageClient from './GamePageClient';

// 게임 화면은 검색 색인 대상이 아니다 — 플레이 상태가 URL에 담기지 않아 색인해도
// 검색 결과로서 의미가 없고, 크롤러가 정적 셸만 긁어간다.
// robots.txt(public/)는 서브패스 배포에서 크롤러가 읽지 않으므로, 실제 방어는 이 meta다.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// 정적 내보내기를 위한 맵 ID 목록
export function generateStaticParams() {
  return [
    { mapId: 'tutorial' },
    { mapId: 'st-lucia' },
    { mapId: 'rust-belt' },
    { mapId: 'germany' },
    { mapId: 'western-us' },
    { mapId: 'southern-us' },
    { mapId: 'korea' },
    { mapId: 'montreal' },
    { mapId: 'moon' },
    { mapId: 'southern-china' },
  ];
}

interface GamePageProps {
  params: {
    mapId: string;
  };
}

export default function GamePage({ params }: GamePageProps) {
  return <GamePageClient mapId={params.mapId} />;
}
