import GamePageClient from './GamePageClient';

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
