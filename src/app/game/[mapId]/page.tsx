import GamePageClient from './GamePageClient';

// 정적 내보내기를 위한 맵 ID 목록
export function generateStaticParams() {
  return [
    { mapId: 'tutorial' },
  ];
}

interface GamePageProps {
  params: Promise<{
    mapId: string;
  }>;
}

export default async function GamePage({ params }: GamePageProps) {
  const { mapId } = await params;
  return <GamePageClient mapId={mapId} />;
}
