import GamePageClient from './GamePageClient';

// 정적 내보내기를 위한 맵 ID 목록
export function generateStaticParams() {
  return [
    { mapId: 'rust-belt' },
    { mapId: 'tutorial' },
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
