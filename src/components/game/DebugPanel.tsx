'use client';

import { useGameStore } from '@/store/gameStore';
import { getNeighborHex, getOppositeEdge, hexCoordsEqual } from '@/utils/hexGrid';
import { useState } from 'react';

interface TrackConnection {
  from: { col: number; row: number };
  to: { col: number; row: number };
  fromEdge: number;
  toEdge: number;
  isConnected: boolean;
}

export default function DebugPanel() {
  const { board, currentPlayer, ui } = useGameStore();
  const [isOpen, setIsOpen] = useState(false);

  // 디버그 버튼/패널 숨김 (우측 하단 빨간 버튼 비표시)
  const DEBUG_PANEL_ENABLED = false;
  if (!DEBUG_PANEL_ENABLED) {
    return null;
  }

  // 트랙 연결 분석
  const analyzeConnections = (): TrackConnection[] => {
    const connections: TrackConnection[] = [];

    for (const track of board.trackTiles) {
      for (const edge of track.edges) {
        const neighbor = getNeighborHex(track.coord, edge);
        const neighborTrack = board.trackTiles.find(t =>
          hexCoordsEqual(t.coord, neighbor)
        );

        if (neighborTrack) {
          const expectedEdge = getOppositeEdge(edge);
          const isConnected = neighborTrack.edges.includes(expectedEdge);

          // 중복 방지: 작은 좌표가 from이 되도록
          const key1 = `${track.coord.col},${track.coord.row}`;
          const key2 = `${neighbor.col},${neighbor.row}`;
          if (key1 < key2) {
            connections.push({
              from: track.coord,
              to: neighbor,
              fromEdge: edge,
              toEdge: expectedEdge,
              isConnected,
            });
          }
        }
      }
    }

    return connections;
  };

  // 도시-트랙 연결 분석
  const analyzeCityConnections = () => {
    const cityConnections: { city: string; coord: { col: number; row: number }; connectedTracks: { coord: { col: number; row: number }; edge: number }[] }[] = [];

    for (const city of board.cities) {
      const connectedTracks: { coord: { col: number; row: number }; edge: number }[] = [];

      for (let edge = 0; edge < 6; edge++) {
        const neighbor = getNeighborHex(city.coord, edge);
        const neighborTrack = board.trackTiles.find(t =>
          hexCoordsEqual(t.coord, neighbor) && t.owner !== null
        );

        if (neighborTrack) {
          const entryEdge = getOppositeEdge(edge);
          if (neighborTrack.edges.includes(entryEdge)) {
            connectedTracks.push({ coord: neighbor, edge: entryEdge });
          }
        }
      }

      if (connectedTracks.length > 0) {
        cityConnections.push({
          city: city.name,
          coord: city.coord,
          connectedTracks,
        });
      }
    }

    return cityConnections;
  };

  const connections = analyzeConnections();
  const cityConnections = analyzeCityConnections();
  const disconnectedCount = connections.filter(c => !c.isConnected).length;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-red-600 text-white px-3 py-1 rounded text-sm z-50"
      >
        Debug ({disconnectedCount} 연결 끊김)
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-[60vh] bg-background-secondary border border-foreground/20 rounded-lg shadow-lg z-50 overflow-hidden">
      <div className="flex items-center justify-between p-2 border-b border-foreground/10 bg-background-tertiary">
        <span className="text-sm font-bold text-accent">🔍 Debug Panel</span>
        <button
          onClick={() => setIsOpen(false)}
          className="text-foreground-secondary hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <div className="p-3 overflow-y-auto max-h-[calc(60vh-40px)] text-xs space-y-4">
        {/* 현재 상태 */}
        <div>
          <h3 className="font-bold text-foreground mb-1">📊 현재 상태</h3>
          <div className="text-foreground-secondary">
            <div>현재 플레이어: {currentPlayer}</div>
            <div>선택된 큐브: {ui.selectedCube ? `${ui.selectedCube.cityId} - ${ui.selectedCube.cubeIndex}` : '없음'}</div>
            <div>빌드 모드: {ui.buildMode}</div>
          </div>
        </div>

        {/* 트랙 목록 */}
        <div>
          <h3 className="font-bold text-foreground mb-1">🛤️ 트랙 목록 ({board.trackTiles.length}개)</h3>
          <div className="space-y-1">
            {board.trackTiles.map((track, i) => (
              <div key={i} className="flex items-center gap-2 text-foreground-secondary">
                <span className="font-mono">({track.coord.col},{track.coord.row})</span>
                <span className="text-accent">edges: [{track.edges.join(', ')}]</span>
                <span className={track.owner ? 'text-green-400' : 'text-red-400'}>
                  {track.owner || 'unowned'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 도시-트랙 연결 */}
        <div>
          <h3 className="font-bold text-foreground mb-1">🏙️ 도시-트랙 연결</h3>
          <div className="space-y-1">
            {cityConnections.map((cc, i) => (
              <div key={i} className="text-foreground-secondary">
                <span className="font-bold">{cc.city}</span>
                <span className="text-foreground-muted"> ({cc.coord.col},{cc.coord.row})</span>
                {cc.connectedTracks.length > 0 ? (
                  <span className="text-green-400">
                    {' → '}
                    {cc.connectedTracks.map((t) =>
                      `(${t.coord.col},${t.coord.row}) edge${t.edge}`
                    ).join(', ')}
                  </span>
                ) : (
                  <span className="text-red-400"> 연결 없음</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 트랙 간 연결 */}
        <div>
          <h3 className="font-bold text-foreground mb-1">🔗 트랙 간 연결</h3>
          {connections.length === 0 ? (
            <div className="text-foreground-muted">인접한 트랙 없음</div>
          ) : (
            <div className="space-y-1">
              {connections.map((conn, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-1 ${conn.isConnected ? 'text-green-400' : 'text-red-400'}`}
                >
                  <span className="font-mono">
                    ({conn.from.col},{conn.from.row})
                  </span>
                  <span>edge{conn.fromEdge}</span>
                  <span>{conn.isConnected ? '↔' : '✗'}</span>
                  <span>edge{conn.toEdge}</span>
                  <span className="font-mono">
                    ({conn.to.col},{conn.to.row})
                  </span>
                  {!conn.isConnected && (
                    <span className="text-yellow-400 ml-1">(끊김!)</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 경고 */}
        {disconnectedCount > 0 && (
          <div className="bg-red-900/30 border border-red-500/50 rounded p-2">
            <div className="text-red-400 font-bold">⚠️ {disconnectedCount}개 연결 끊김 감지!</div>
            <div className="text-red-300/80 text-xs mt-1">
              인접한 트랙들이 있지만 edges가 맞지 않아 물품 이동이 불가합니다.
              트랙은 동일한 소스에서 연속으로 건설해야 합니다.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
