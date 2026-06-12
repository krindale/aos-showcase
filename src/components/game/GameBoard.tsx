'use client';

import { useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { useShallow } from 'zustand/react/shallow';
import { useTouchGestures } from '@/hooks/useTouchGestures';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  hexToPixel,
  getHexPoints,
  getTrackPath,
  getRailroadTies,
  getEdgeMidpoint,
  calculateBoardDimensions,
  hexCoordsEqual,
  getNeighborHex,
  getOppositeEdge,
  HEX_SIZE,
  findCompletedLinks,
  getMovementPathSVG,
  getAnimationPoints,
} from '@/utils/hexGrid';
import { getMapData } from '@/utils/mapRegistry';
import { CITY_COLORS, CUBE_COLORS, PLAYER_COLORS, HexCoord, PlayerId } from '@/types/game';

export default function GameBoard() {
  // Zustand selector 최적화: useShallow로 불필요한 리렌더링 방지
  const {
    board,
    currentPhase,
    currentPlayer,
    players,
    ui,
  } = useGameStore(
    useShallow((state) => ({
      board: state.board,
      currentPhase: state.currentPhase,
      currentPlayer: state.currentPlayer,
      players: state.players,
      ui: state.ui,
    }))
  );
  const mapId = useGameStore((state) => state.mapId);
  // 맵 데이터(그리드 크기/지형 색): mapRegistry에서 주입 — 튜토리얼 하드코딩 금지
  const mapData = useMemo(() => getMapData(mapId), [mapId]);
  const terrainColors = mapData.colors.terrain;
  // flat-top 맵(St. Lucia): 모든 렌더 기하를 전치 — 데이터/게임 로직은 pointy-top 그대로 (인접 동형)
  const isFlat = mapData.orientation === 'flat';

  // Actions (참조가 변하지 않으므로 별도 selector)
  const {
    selectCube,
    selectSourceHex,
    selectTargetHex,
    selectExitDirection,
    updateTrackPreview,
    resetBuildMode,
    selectDestinationCity,
    completeCubeMove,
    canRedirect,
    selectTrackToRedirect,
    canPlaceNewCity,
    placeNewCity,
  } = useGameStore();

  const { width: boardWidth, height: boardHeight } = useMemo(
    () => calculateBoardDimensions(mapData.cols, mapData.rows, undefined, undefined, isFlat),
    [mapData, isFlat]
  );

  // 터치 제스처 (핀치 줌, 팬) 지원
  const {
    scale,
    position,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useTouchGestures({
    minScale: 0.5,
    maxScale: 3.0,
  });

  // 모바일/태블릿 감지 (줌 컨트롤 표시용)
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');

  // 완성된 링크 계산 (소유 마커 표시용)
  const completedLinks = useMemo(
    () => findCompletedLinks(board),
    [board]
  );

  // 완성된 링크에 포함된 트랙인지 확인
  const isTrackInCompletedLink = useCallback(
    (coord: HexCoord) => {
      return completedLinks.some(link =>
        link.trackTiles.some(t => hexCoordsEqual(t, coord))
      );
    },
    [completedLinks]
  );

  // 큐브 이동 애니메이션 처리 - 1초 후 완료
  useEffect(() => {
    if (!ui.movingCube) return;

    // 애니메이션 완료 후 처리 (1초)
    const timeout = setTimeout(() => {
      completeCubeMove();
    }, 1000);

    return () => clearTimeout(timeout);
  }, [ui.movingCube, completeCubeMove]);

  // 끊어진 트랙 연결 감지
  const disconnectedConnections = useMemo(() => {
    const disconnected: { from: HexCoord; to: HexCoord; fromEdge: number; toEdge: number }[] = [];

    // 각 플레이어별로 소유한 엣지를 수집하여 연결 체크
    for (const track of board.trackTiles) {
      // 플레이어별 소유 엣지 목록: [{ owner, edges }]
      const ownerEdgePairs: { owner: PlayerId | null; edges: number[] }[] = [];

      // 기본 경로
      if (track.owner) {
        ownerEdgePairs.push({ owner: track.owner, edges: [...track.edges] });
      }

      // 보조 경로 (복합 트랙)
      if (track.secondaryOwner && track.secondaryEdges) {
        ownerEdgePairs.push({ owner: track.secondaryOwner, edges: [...track.secondaryEdges] });
      }

      for (const { owner, edges } of ownerEdgePairs) {
        if (!owner) continue;

        for (const edge of edges) {
          const neighbor = getNeighborHex(track.coord, edge);
          const neighborTrack = board.trackTiles.find(t =>
            hexCoordsEqual(t.coord, neighbor)
          );

          if (neighborTrack) {
            // 이웃 트랙에서 같은 소유자의 엣지 수집
            const neighborPlayerEdges: number[] = [];
            if (neighborTrack.owner === owner) {
              neighborPlayerEdges.push(...neighborTrack.edges);
            }
            if (neighborTrack.secondaryOwner === owner && neighborTrack.secondaryEdges) {
              neighborPlayerEdges.push(...neighborTrack.secondaryEdges);
            }

            // 같은 소유자가 아니면 스킵 (별도 철도)
            if (neighborPlayerEdges.length === 0) continue;

            const expectedEdge = getOppositeEdge(edge);
            const isConnected = neighborPlayerEdges.includes(expectedEdge);

            if (!isConnected) {
              // 중복 방지: 한 방향만 추가
              const key1 = `${track.coord.col},${track.coord.row}`;
              const key2 = `${neighbor.col},${neighbor.row}`;
              if (key1 < key2) {
                disconnected.push({
                  from: track.coord,
                  to: neighbor,
                  fromEdge: edge,
                  toEdge: expectedEdge,
                });
              }
            }
          }
        }
      }
    }

    return disconnected;
  }, [board.trackTiles]);

  // 트랙 경로 계산 캐시 (SVG 경로 계산은 비용이 큼)
  const trackPathCache = useMemo(() => {
    const cache = new Map<string, {
      pathData: string;
      ties: { x: number; y: number; angle: number }[];
      secondaryPathData: string | null;
      secondaryTies: { x: number; y: number; angle: number }[];
    }>();

    for (const tile of board.trackTiles) {
      const { x, y } = hexToPixel(tile.coord.col, tile.coord.row, undefined, undefined, undefined, isFlat);
      const pathData = getTrackPath(x, y, tile.edges[0], tile.edges[1], HEX_SIZE - 2, isFlat);
      const ties = getRailroadTies(x, y, tile.edges[0], tile.edges[1], HEX_SIZE - 2, 6, isFlat);

      const hasSecondary = tile.trackType !== 'simple' && tile.secondaryEdges;
      const secondaryPathData = hasSecondary
        ? getTrackPath(x, y, tile.secondaryEdges![0], tile.secondaryEdges![1], HEX_SIZE - 2, isFlat)
        : null;
      const secondaryTies = hasSecondary
        ? getRailroadTies(x, y, tile.secondaryEdges![0], tile.secondaryEdges![1], HEX_SIZE - 2, 6, isFlat)
        : [];

      cache.set(tile.id, { pathData, ties, secondaryPathData, secondaryTies });
    }

    return cache;
  }, [board.trackTiles, isFlat]);

  // 헥스가 유효한 연결점인지 확인 (도시 또는 현재 플레이어의 트랙)
  const isValidConnectionPoint = useCallback(
    (coord: HexCoord) => {
      const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
      if (isCity) return true;

      const playerTrack = board.trackTiles.find(
        t => hexCoordsEqual(t.coord, coord) && (t.owner === currentPlayer || t.secondaryOwner === currentPlayer)
      );
      return !!playerTrack;
    },
    [board.cities, board.trackTiles, currentPlayer]
  );

  // 헥스가 하이라이트된 건설 대상인지 확인 (source_selected 모드)
  const isBuildableTarget = useCallback(
    (coord: HexCoord) => {
      return ui.buildableNeighbors.some(n => hexCoordsEqual(n.coord, coord));
    },
    [ui.buildableNeighbors]
  );

  // 헥스 좌표에서 해당하는 출구 엣지 찾기 (target_selected 모드)
  const getExitEdgeForCoord = useCallback(
    (coord: HexCoord): number | null => {
      const exitDir = ui.exitDirections.find(d => hexCoordsEqual(d.neighborCoord, coord));
      return exitDir ? exitDir.exitEdge : null;
    },
    [ui.exitDirections]
  );

  // 헥스 클릭 핸들러
  const handleHexClick = useCallback(
    (coord: HexCoord) => {
      if (currentPhase === 'buildTrack') {
        if (ui.buildMode === 'idle') {
          // 유효한 연결점(도시 또는 기존 트랙) 클릭 → 선택
          if (isValidConnectionPoint(coord)) {
            selectSourceHex(coord);
          }
        } else if (ui.buildMode === 'source_selected') {
          // 같은 헥스 클릭 → 선택 취소
          if (ui.sourceHex && hexCoordsEqual(coord, ui.sourceHex)) {
            resetBuildMode();
            return;
          }

          // 하이라이트된 헥스 클릭 → 대상 헥스 선택 (나가는 방향 UI 표시)
          if (isBuildableTarget(coord)) {
            selectTargetHex(coord);
            return;
          }

          // 다른 유효한 연결점 클릭 → 새로운 선택
          if (isValidConnectionPoint(coord)) {
            selectSourceHex(coord);
          }
        } else if (ui.buildMode === 'target_selected') {
          // 같은 대상 헥스 클릭 → source_selected로 돌아가기
          if (ui.targetHex && hexCoordsEqual(coord, ui.targetHex)) {
            // sourceHex로 돌아가기
            if (ui.sourceHex) {
              selectSourceHex(ui.sourceHex);
            } else {
              resetBuildMode();
            }
            return;
          }

          // 출구 방향 클릭 → 트랙 건설
          const exitEdge = getExitEdgeForCoord(coord);
          if (exitEdge !== null) {
            selectExitDirection(exitEdge);
            return;
          }

          // 다른 유효한 연결점 클릭 → 새로운 선택
          if (isValidConnectionPoint(coord)) {
            selectSourceHex(coord);
          }
        }
      }
    },
    [currentPhase, ui.buildMode, ui.sourceHex, ui.targetHex, isValidConnectionPoint, isBuildableTarget, getExitEdgeForCoord, selectSourceHex, selectTargetHex, selectExitDirection, resetBuildMode]
  );

  // 헥스 호버 핸들러
  const handleHexHover = useCallback(
    (coord: HexCoord) => {
      if (currentPhase === 'buildTrack' && (ui.buildMode === 'source_selected' || ui.buildMode === 'target_selected')) {
        updateTrackPreview(coord);
      }
    },
    [currentPhase, ui.buildMode, updateTrackPreview]
  );

  // 큐브 클릭 핸들러
  const handleCubeClick = useCallback(
    (cityId: string, cubeIndex: number) => {
      if (currentPhase === 'moveGoods') {
        selectCube(cityId, cubeIndex);
      }
    },
    [currentPhase, selectCube]
  );

  // 헥스 렌더링 여부 확인
  const shouldRenderHex = (col: number, row: number) => {
    // 도시 헥스는 별도 렌더링
    const isCity = board.cities.some(
      (c) => c.coord.col === col && c.coord.row === row
    );
    // 마을 헥스도 별도 렌더링
    const isTown = board.towns.some(
      (t) => t.coord.col === col && t.coord.row === row
    );
    return !isCity && !isTown;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="rounded-xl overflow-hidden border border-foreground/10"
      style={{
        backgroundColor: mapData.colors.background,
        contain: 'layout style paint', // Performance optimization
        transform: 'translateZ(0)', // GPU acceleration
      }}
    >
      {/* 보드 헤더 */}
      <div className="px-4 py-3 bg-background-secondary/50 border-b border-foreground/10">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground-secondary">
            {currentPhase === 'buildTrack' && ui.urbanizationMode && '파란색 테두리의 마을을 클릭하여 신규 도시를 배치하세요'}
            {currentPhase === 'buildTrack' && !ui.urbanizationMode && ui.buildMode === 'idle' && '도시/기존 트랙 클릭 → 이어 짓기, Shift+클릭 → 방향 전환'}
            {currentPhase === 'buildTrack' && !ui.urbanizationMode && ui.buildMode === 'source_selected' && '노란색 헥스를 클릭하여 트랙을 건설하세요'}
            {currentPhase === 'buildTrack' && !ui.urbanizationMode && ui.buildMode === 'target_selected' && '트랙이 나갈 방향을 클릭하세요 (곡선/직선 선택)'}
            {currentPhase === 'buildTrack' && !ui.urbanizationMode && ui.buildMode === 'redirect_selected' && '방향 전환 패널에서 새 방향을 선택하세요'}
            {currentPhase === 'moveGoods' && !ui.selectedCube && !ui.movingCube && '물품 큐브를 클릭하세요'}
            {currentPhase === 'moveGoods' && ui.selectedCube && '금색 테두리의 목적지 도시를 클릭하세요'}
            {currentPhase === 'moveGoods' && ui.movingCube && '물품 이동 중...'}
            {currentPhase !== 'buildTrack' && currentPhase !== 'moveGoods' && 'Tutorial'}
          </span>
          <span className="text-xs text-accent">
            {players[currentPlayer].name}의 차례
          </span>
        </div>
      </div>

      {/* SVG 보드 */}
      <svg
        width="100%"
        viewBox={`0 0 ${boardWidth} ${boardHeight}`}
        className="block"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          touchAction: 'none',
          willChange: 'transform', // Optimize for transforms
        }}
        shapeRendering="optimizeSpeed" // Prioritize speed over quality for hex grid
      >
        <g
          transform={`translate(${position.x}, ${position.y}) scale(${scale})`}
          style={{
            transformOrigin: 'center',
            willChange: 'transform', // GPU acceleration for zoom/pan
          }}
        >
        {/* 배경 헥스 그리드 */}
        {[...Array(mapData.rows)].map((_, row) =>
          [...Array(mapData.cols - mapData.startCol)].map((_, colIndex) => {
            const col = colIndex + mapData.startCol;
            const { x, y } = hexToPixel(col, row, undefined, undefined, undefined, isFlat);

            if (!shouldRenderHex(col, row)) return null;

            const coord = { col, row };
            const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
            const terrain = hexTile?.terrain ?? 'plain';
            const isLake = terrain === 'lake';

            // 섬 맵(St. Lucia): 바다 헥스를 그리지 않아 섬 윤곽 표시
            if (isLake && mapData.hideLakeHexes) return null;
            const isSourceSelected = ui.sourceHex && hexCoordsEqual(ui.sourceHex, coord);
            const isHighlighted = ui.highlightedHexes.some(h => hexCoordsEqual(h, coord));
            const hasPlayerTrack = board.trackTiles.some(
              t => hexCoordsEqual(t.coord, coord) && (t.owner === currentPlayer || t.secondaryOwner === currentPlayer)
            );

            // 클릭 가능 여부: 트랙 건설 단계에서 하이라이트되거나 플레이어 트랙이 있는 경우
            const isClickable = !isLake && currentPhase === 'buildTrack' && (isHighlighted || hasPlayerTrack);

            return (
              <g key={`hex-${col}-${row}`}>
                <polygon
                  points={getHexPoints(x, y, HEX_SIZE - 2, isFlat)}
                  fill={
                    isHighlighted
                      ? 'rgba(212, 168, 83, 0.3)' // 건설 가능 헥스 하이라이트
                      : terrain === 'river'
                      ? terrainColors.plain // 강 헥스: 평지색 + 아래 강줄기 곡선 오버레이
                      : terrainColors[terrain] ?? terrainColors.plain
                  }
                  stroke={
                    isSourceSelected
                      ? '#ffffff'
                      : isHighlighted
                      ? '#d4a853'
                      : hasPlayerTrack && currentPhase === 'buildTrack'
                      ? '#88aa88'
                      : isLake
                      ? '#3A6A7A'
                      : '#2D4A2D'
                  }
                  strokeWidth={isSourceSelected ? 3 : isHighlighted ? 3 : 2}
                  className={
                    isClickable
                      ? 'cursor-pointer hover:opacity-80 transition-opacity'
                      : ''
                  }
                  onClick={() => isClickable && handleHexClick(coord)}
                  onMouseEnter={() => handleHexHover(coord)}
                />
                {/* 강 헥스: 평지 위로 흐르는 강줄기 (공식 맵 스타일) */}
                {terrain === 'river' && !isHighlighted && (
                  <path
                    d={`M ${x - HEX_SIZE * 0.85} ${y - HEX_SIZE * 0.25} Q ${x - HEX_SIZE * 0.3} ${y + HEX_SIZE * 0.3}, ${x + HEX_SIZE * 0.1} ${y} T ${x + HEX_SIZE * 0.85} ${y + HEX_SIZE * 0.2}`}
                    fill="none"
                    stroke={terrainColors.river}
                    strokeWidth="11"
                    strokeLinecap="round"
                    opacity="0.95"
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                {/* 헥스 위 물품 큐브 (St. Lucia 셋업) */}
                {hexTile?.cube && (
                  <rect
                    x={x - 5}
                    y={y - 5}
                    width="10"
                    height="10"
                    fill={CUBE_COLORS[hexTile.cube]}
                    stroke="rgba(0,0,0,0.4)"
                    strokeWidth="1"
                    rx="1.5"
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })
        )}

        {/* 트랙 타일 */}
        {board.trackTiles.map((tile) => {
          const { x, y } = hexToPixel(tile.coord.col, tile.coord.row, undefined, undefined, undefined, isFlat);
          // 캐시에서 경로 데이터 가져오기 (계산 비용 절감)
          const cached = trackPathCache.get(tile.id);
          const pathData = cached?.pathData ?? '';
          const ties = cached?.ties ?? [];
          const ownerColor = tile.owner ? PLAYER_COLORS[players[tile.owner].color] : '#888';

          // 복합 트랙인 경우 두 번째 경로도 렌더링
          const hasSecondary = tile.trackType !== 'simple' && tile.secondaryEdges;
          const secondaryPathData = cached?.secondaryPathData ?? null;
          const secondaryTies = cached?.secondaryTies ?? [];
          const secondaryOwnerColor = hasSecondary && tile.secondaryOwner
            ? PLAYER_COLORS[players[tile.secondaryOwner].color]
            : '#888';

          // 방향 전환 가능 여부 확인
          const isRedirectable = currentPhase === 'buildTrack' && canRedirect(tile.coord);
          const isTrackClickable = currentPhase === 'buildTrack' && (
            tile.owner === currentPlayer || isRedirectable
          );

          // 트랙 클릭 핸들러 (연결점 선택 우선, 방향 전환은 Shift+클릭)
          const handleTrackClick = (e: React.MouseEvent) => {
            if (!isTrackClickable) return;

            // 플레이어의 자신의 트랙은 먼저 연결점으로 선택 (이어 짓기용)
            // Shift+클릭일 때만 방향 전환
            if (tile.owner === currentPlayer) {
              if (e.shiftKey && isRedirectable && ui.buildMode === 'idle') {
                // Shift+클릭: 방향 전환 모드
                selectTrackToRedirect(tile.coord);
              } else {
                // 일반 클릭: 연결점으로 선택 (이어 짓기)
                handleHexClick(tile.coord);
              }
              return;
            }

            // 소유자가 없는 방향 전환 가능 트랙
            if (isRedirectable && ui.buildMode === 'idle') {
              selectTrackToRedirect(tile.coord);
            }
          };

          return (
            <g key={tile.id}>
              {/* 방향 전환 가능한 트랙 배경 하이라이트 */}
              {isRedirectable && ui.buildMode === 'idle' && (
                <circle
                  cx={x}
                  cy={y}
                  r={HEX_SIZE - 8}
                  fill="rgba(255, 165, 0, 0.15)"
                  stroke="#ffa500"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                  className="cursor-pointer"
                  onClick={(e) => handleTrackClick(e)}
                />
              )}

              {/* 첫 번째 레일 (기본) */}
              <path
                d={pathData}
                fill="none"
                stroke="#3A3A32"
                strokeWidth="12"
                strokeLinecap="round"
                shapeRendering="geometricPrecision"
                className={isTrackClickable ? 'cursor-pointer' : ''}
                onClick={(e) => handleTrackClick(e)}
                style={{ pointerEvents: isTrackClickable ? 'auto' : 'none' }}
              />
              <path
                d={pathData}
                fill="none"
                stroke={terrainColors.plain}
                strokeWidth="6"
                strokeLinecap="round"
                shapeRendering="geometricPrecision"
                className={isTrackClickable ? 'cursor-pointer' : ''}
                onClick={(e) => handleTrackClick(e)}
                style={{ pointerEvents: isTrackClickable ? 'auto' : 'none' }}
              />
              {/* 첫 번째 침목 */}
              {ties.map((tie, i) => (
                <line
                  key={`tie-${tile.id}-${i}`}
                  x1={tie.x - 8 * Math.cos((tie.angle + 90) * Math.PI / 180)}
                  y1={tie.y - 8 * Math.sin((tie.angle + 90) * Math.PI / 180)}
                  x2={tie.x + 8 * Math.cos((tie.angle + 90) * Math.PI / 180)}
                  y2={tie.y + 8 * Math.sin((tie.angle + 90) * Math.PI / 180)}
                  stroke="#4A4A42"
                  strokeWidth="3"
                  strokeLinecap="round"
                  shapeRendering="crispEdges"
                  style={{ pointerEvents: 'none' }}
                />
              ))}

              {/* 복합 트랙: 두 번째 레일 */}
              {hasSecondary && secondaryPathData && (
                <>
                  {/* 교차(crossing)인 경우 다리 효과 표시 */}
                  {tile.trackType === 'crossing' && (
                    <path
                      d={secondaryPathData}
                      fill="none"
                      stroke="#2A2A22"
                      strokeWidth="16"
                      strokeLinecap="round"
                      shapeRendering="geometricPrecision"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                  <path
                    d={secondaryPathData}
                    fill="none"
                    stroke="#3A3A32"
                    strokeWidth="12"
                    strokeLinecap="round"
                    shapeRendering="geometricPrecision"
                    style={{ pointerEvents: 'none' }}
                  />
                  <path
                    d={secondaryPathData}
                    fill="none"
                    stroke={terrainColors.plain}
                    strokeWidth="6"
                    strokeLinecap="round"
                    shapeRendering="geometricPrecision"
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* 두 번째 침목 */}
                  {secondaryTies.map((tie, i) => (
                    <line
                      key={`tie2-${tile.id}-${i}`}
                      x1={tie.x - 8 * Math.cos((tie.angle + 90) * Math.PI / 180)}
                      y1={tie.y - 8 * Math.sin((tie.angle + 90) * Math.PI / 180)}
                      x2={tie.x + 8 * Math.cos((tie.angle + 90) * Math.PI / 180)}
                      y2={tie.y + 8 * Math.sin((tie.angle + 90) * Math.PI / 180)}
                      stroke="#4A4A42"
                      strokeWidth="3"
                      strokeLinecap="round"
                      shapeRendering="crispEdges"
                      style={{ pointerEvents: 'none' }}
                    />
                  ))}
                </>
              )}

              {/* 소유자 마커 - 미완성 트랙(완성된 링크에 포함되지 않은 트랙)에만 표시 */}
              {!isTrackInCompletedLink(tile.coord) && (
                <circle
                  cx={x}
                  cy={y}
                  r="7"
                  fill={ownerColor}
                  stroke={isRedirectable && ui.buildMode === 'idle' ? '#ffa500' : '#1a1a1a'}
                  strokeWidth={isRedirectable && ui.buildMode === 'idle' ? 2 : 1.5}
                  className={isTrackClickable ? 'cursor-pointer' : ''}
                  onClick={(e) => handleTrackClick(e)}
                  style={{ pointerEvents: isTrackClickable ? 'auto' : 'none' }}
                />
              )}
              {/* 복합 트랙: 두 번째 소유자 마커 (미완성 트랙에만) */}
              {!isTrackInCompletedLink(tile.coord) && hasSecondary && tile.secondaryOwner && (
                <circle
                  cx={x + 10}
                  cy={y - 10}
                  r="5"
                  fill={secondaryOwnerColor}
                  stroke="#1a1a1a"
                  strokeWidth="1"
                />
              )}
              {/* 트랙 위 물품 큐브 (St. Lucia — 클릭하면 배달 출발지 선택) */}
              {tile.cube && (
                <rect
                  x={x - 6}
                  y={y - 18}
                  width="12"
                  height="12"
                  fill={CUBE_COLORS[tile.cube]}
                  stroke={
                    ui.selectedCube?.cityId === `track:${tile.id}`
                      ? '#ffffff'
                      : 'rgba(0,0,0,0.4)'
                  }
                  strokeWidth={ui.selectedCube?.cityId === `track:${tile.id}` ? 2.5 : 1}
                  rx="2"
                  className={currentPhase === 'moveGoods' ? 'cursor-pointer hover:opacity-80' : ''}
                  onClick={(e) => {
                    if (currentPhase !== 'moveGoods') return;
                    e.stopPropagation();
                    selectCube(`track:${tile.id}`, 0);
                  }}
                />
              )}
            </g>
          );
        })}

        {/* 완성된 링크 소유 마커 - 링크 중앙에 하나만 표시 */}
        {completedLinks.map((link) => {
          const ownerColor = PLAYER_COLORS[players[link.owner].color];
          // centerPosition은 pointy 기준 좌표 — flat 맵에서도 맞도록 중간 타일에서 재계산
          const midTile = link.trackTiles[Math.floor(link.trackTiles.length / 2)];
          const center = midTile
            ? hexToPixel(midTile.col, midTile.row, undefined, undefined, undefined, isFlat)
            : link.centerPosition;
          return (
            <circle
              key={link.id}
              cx={center.x}
              cy={center.y}
              r="8"
              fill={ownerColor}
              stroke="#1a1a1a"
              strokeWidth="2"
              style={{ pointerEvents: 'none' }}
            />
          );
        })}

        {/* 끊어진 트랙 연결 경고 표시 */}
        {disconnectedConnections.map((conn, index) => {
          const { x: x1, y: y1 } = hexToPixel(conn.from.col, conn.from.row, undefined, undefined, undefined, isFlat);
          const { x: x2, y: y2 } = hexToPixel(conn.to.col, conn.to.row, undefined, undefined, undefined, isFlat);

          // 두 트랙 중간 지점
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          return (
            <g key={`disconn-${index}`} style={{ pointerEvents: 'none' }}>
              {/* 끊어진 연결 표시 - 빨간색 X */}
              <circle
                cx={midX}
                cy={midY}
                r="12"
                fill="rgba(220, 38, 38, 0.8)"
                stroke="#fff"
                strokeWidth="2"
              />
              <text
                x={midX}
                y={midY + 4}
                textAnchor="middle"
                fontSize="14"
                fontWeight="bold"
                fill="#fff"
              >
                ✗
              </text>
              {/* 호버 시 정보 표시 */}
              <title>
                트랙 연결 끊김: ({conn.from.col},{conn.from.row}) edge{conn.fromEdge} ↔ ({conn.to.col},{conn.to.row}) edge{conn.toEdge}
              </title>
            </g>
          );
        })}

        {/* 마을 (Town) - 흰색 디스크 */}
        {board.towns.map((town) => {
          const { x, y } = hexToPixel(town.coord.col, town.coord.row, undefined, undefined, undefined, isFlat);
          const isUrbanized = town.newCityColor !== null;
          // 도시화된 마을은 cities 배열에 추가되어 도시로 렌더링됨 — 여기서 또 그리면 중복
          if (isUrbanized) return null;
          const townColor = '#ffffff';
          const isSourceSelected = ui.sourceHex && hexCoordsEqual(ui.sourceHex, town.coord);
          const isTownClickable = currentPhase === 'buildTrack' && !ui.urbanizationMode;

          // 도시화 가능 여부 확인
          const canUrbanize = ui.urbanizationMode && ui.selectedNewCityTile && !isUrbanized;
          const isUrbanizationClickable = canPlaceNewCity(town.coord);

          // 마을 헥스 자체에 깔린 트랙 (마을 디스크 아래 트랙 타일)
          const townTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, town.coord));
          const townTrackCache = townTrack ? trackPathCache.get(townTrack.id) : undefined;

          // 마을 클릭 핸들러
          const handleTownClick = () => {
            // 도시화 모드인 경우
            if (ui.urbanizationMode && isUrbanizationClickable) {
              placeNewCity(town.coord);
              return;
            }
            // 일반 트랙 건설 모드인 경우
            if (currentPhase === 'buildTrack' && !ui.urbanizationMode) {
              handleHexClick(town.coord);
            }
          };

          return (
            <g key={`town-${town.id}`}>
              {/* 마을 배경 헥스 */}
              <polygon
                points={getHexPoints(x, y, HEX_SIZE - 2, isFlat)}
                fill={terrainColors.plain}
                stroke={
                  isUrbanizationClickable
                    ? '#3B82F6'  // 도시화 가능: 파란색 테두리
                    : isSourceSelected
                    ? '#ffffff'
                    : '#3D5A3D'
                }
                strokeWidth={isUrbanizationClickable ? 4 : isSourceSelected ? 3 : 2}
                className={(isTownClickable || isUrbanizationClickable) ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}
                onClick={handleTownClick}
              />

              {/* 마을 헥스 위 트랙 타일 (마을 디스크 아래 깔린 철길) */}
              {townTrack && townTrackCache && (
                <g style={{ pointerEvents: 'none' }}>
                  <path d={townTrackCache.pathData} fill="none" stroke="#3A3A32" strokeWidth="12" strokeLinecap="round" shapeRendering="geometricPrecision" />
                  <path d={townTrackCache.pathData} fill="none" stroke={terrainColors.plain} strokeWidth="6" strokeLinecap="round" shapeRendering="geometricPrecision" />
                  {townTrackCache.ties.map((tie, i) => (
                    <line
                      key={`town-tie-${town.id}-${i}`}
                      x1={tie.x - 8 * Math.cos((tie.angle + 90) * Math.PI / 180)}
                      y1={tie.y - 8 * Math.sin((tie.angle + 90) * Math.PI / 180)}
                      x2={tie.x + 8 * Math.cos((tie.angle + 90) * Math.PI / 180)}
                      y2={tie.y + 8 * Math.sin((tie.angle + 90) * Math.PI / 180)}
                      stroke="#4A4A42"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  ))}
                </g>
              )}
              {/* 도시화 가능 표시 - 글로우 효과 */}
              {canUrbanize && !isUrbanized && (
                <circle
                  cx={x}
                  cy={y}
                  r={HEX_SIZE - 6}
                  fill="rgba(59, 130, 246, 0.15)"
                  stroke="#3B82F6"
                  strokeWidth="2"
                  strokeDasharray="6 3"
                  className="cursor-pointer"
                  onClick={handleTownClick}
                />
              )}

              {/* 마을 디스크 (흰색 원) */}
              <circle
                cx={x}
                cy={y}
                r="22"
                fill={townColor}
                stroke={
                  isUrbanizationClickable
                    ? '#3B82F6'
                    : isUrbanized
                    ? 'rgba(255,255,255,0.5)'
                    : 'rgba(0,0,0,0.3)'
                }
                strokeWidth={isUrbanizationClickable ? 4 : 3}
                className={(isTownClickable || isUrbanizationClickable) ? 'cursor-pointer' : ''}
                onClick={handleTownClick}
              />

              {/* 마을 이름 라벨 (공식 맵처럼 헥스 상단에 표시) */}
              <text
                x={x}
                y={y - 28}
                textAnchor="middle"
                fill="#1a1a1a"
                fontSize="13"
                fontWeight="700"
                fontFamily="system-ui, sans-serif"
                stroke="rgba(255,255,255,0.75)"
                strokeWidth="3"
                paintOrder="stroke"
                style={{ pointerEvents: 'none' }}
              >
                {mapData.townNames?.[town.id] ?? town.id}
              </text>
              {/* 도시화된 경우 원 안에 신규 도시 ID 표시 */}
              {isUrbanized && (
                <text
                  x={x}
                  y={y + 6}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="18"
                  fontWeight="bold"
                  fontFamily="system-ui, sans-serif"
                  style={{ pointerEvents: 'none' }}
                >
                  {town.newCityColor ? town.id : ''}
                </text>
              )}

              {/* 마을 위 물품 큐브 (도시화 전에만) */}
              {!isUrbanized && town.cubes.length > 0 && (
                <g>
                  {town.cubes.map((cubeColor, i) => {
                    const cubeX = x - ((town.cubes.length - 1) * 14) / 2 + i * 14;
                    const cubeY = y + 32;

                    return (
                      <rect
                        key={`town-cube-${town.id}-${i}`}
                        x={cubeX - 4}
                        y={cubeY - 4}
                        width="8"
                        height="8"
                        fill={CUBE_COLORS[cubeColor]}
                        stroke="rgba(0,0,0,0.3)"
                        strokeWidth="1"
                        rx="1"
                      />
                    );
                  })}
                </g>
              )}
            </g>
          );
        })}

        {/* 도시 */}
        {board.cities.map((city) => {
          const { x, y } = hexToPixel(city.coord.col, city.coord.row, undefined, undefined, undefined, isFlat);
          const cityColor = CITY_COLORS[city.color];
          const isSourceSelected = ui.sourceHex && hexCoordsEqual(ui.sourceHex, city.coord);
          const isCityClickable = currentPhase === 'buildTrack';
          const isReachableDestination = ui.reachableDestinations.some(
            d => hexCoordsEqual(d, city.coord)
          );
          const isMoveGoodsPhase = currentPhase === 'moveGoods';

          // 도시 클릭 핸들러
          const handleCityClick = () => {
            if (currentPhase === 'buildTrack') {
              handleHexClick(city.coord);
            } else if (isMoveGoodsPhase && isReachableDestination) {
              selectDestinationCity(city.coord);
            }
          };

          return (
            <g key={`city-${city.id}`}>
              {/* 도시 헥사곤 */}
              <polygon
                points={getHexPoints(x, y, HEX_SIZE - 2, isFlat)}
                fill={cityColor}
                stroke={
                  isReachableDestination
                    ? '#e6c77a'  // 골드 악센트 (accent-light)
                    : isSourceSelected
                    ? '#ffffff'
                    : 'rgba(255,255,255,0.2)'
                }
                strokeWidth={isReachableDestination ? 4 : isSourceSelected ? 4 : 2}
                className={
                  (isCityClickable || isReachableDestination)
                    ? 'cursor-pointer hover:opacity-90 transition-opacity'
                    : ''
                }
                onClick={handleCityClick}
              />

              {/* 도시 ID 원 */}
              <circle
                cx={x}
                cy={y - 12}
                r="18"
                fill="rgba(255,255,255,0.15)"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="2"
                style={{ pointerEvents: 'none' }}
              />
              <text
                x={x}
                y={y - 6}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="20"
                fontWeight="bold"
                fontFamily="system-ui, sans-serif"
                style={{ pointerEvents: 'none' }}
              >
                {city.id}
              </text>

              {/* 도시 이름 */}
              <text
                x={x}
                y={y + 18}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="12"
                fontWeight="600"
                fontFamily="system-ui, sans-serif"
                style={{ pointerEvents: 'none' }}
              >
                {city.name}
              </text>

              {/* 물품 큐브 */}
              <g>
                {city.cubes.map((cubeColor, i) => {
                  const cubeX = x - ((city.cubes.length - 1) * 16) / 2 + i * 16;
                  const cubeY = y + 32;
                  const isSelected =
                    ui.selectedCube?.cityId === city.id &&
                    ui.selectedCube?.cubeIndex === i;

                  return (
                    <rect
                      key={`cube-${city.id}-${i}`}
                      x={cubeX - 5}
                      y={cubeY - 5}
                      width="10"
                      height="10"
                      fill={CUBE_COLORS[cubeColor]}
                      stroke={isSelected ? '#ffffff' : 'rgba(0,0,0,0.4)'}
                      strokeWidth={isSelected ? 2 : 1}
                      rx="1"
                      className={
                        currentPhase === 'moveGoods'
                          ? 'cursor-pointer hover:opacity-80 transition-opacity'
                          : ''
                      }
                      onClick={() => handleCubeClick(city.id, i)}
                    />
                  );
                })}
              </g>
            </g>
          );
        })}

        {/* 미리보기 트랙 */}
        {ui.previewTrack && (
          <g opacity={0.5}>
            {(() => {
              const { x, y } = hexToPixel(
                ui.previewTrack.coord.col,
                ui.previewTrack.coord.row,
                undefined, undefined, undefined, isFlat
              );
              const pathData = getTrackPath(
                x,
                y,
                ui.previewTrack.edges[0],
                ui.previewTrack.edges[1],
                HEX_SIZE - 2,
                isFlat
              );
              return (
                <path
                  d={pathData}
                  fill="none"
                  stroke="#d4a853"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="4 4"
                  shapeRendering="geometricPrecision"
                  style={{ pointerEvents: 'none' }}
                />
              );
            })()}
          </g>
        )}

        {/* 이동 경로 - 트랙을 따라 곡선으로 표시 */}
        {ui.movePath.length > 1 && !ui.movingCube && (
          <path
            d={getMovementPathSVG(ui.movePath, board, HEX_SIZE - 2)}
            fill="none"
            stroke="#d4a853"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="8 4"
            shapeRendering="geometricPrecision"
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* 이동 중인 큐브 애니메이션 - Framer Motion 사용 */}
        {ui.movingCube && (() => {
          // 경로의 모든 애니메이션 포인트 계산
          const animPoints = getAnimationPoints(ui.movingCube.path, board, HEX_SIZE - 2, 5);

          // 모든 x, y 좌표 배열 생성
          const xPoints = animPoints.map(p => p.x - 9);
          const yPoints = animPoints.map(p => p.y - 9);

          return (
            <g>
              {/* 이동 경로 표시 - 트랙을 따라 점선으로 */}
              <path
                d={getMovementPathSVG(ui.movingCube.path, board, HEX_SIZE - 2)}
                fill="none"
                stroke={CUBE_COLORS[ui.movingCube.color]}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="6 3"
                opacity={0.4}
              />

              {/* 큐브 - Framer Motion으로 경로 따라 이동 */}
              <motion.rect
                key="moving-cube"
                width="18"
                height="18"
                fill={CUBE_COLORS[ui.movingCube.color]}
                stroke="#ffffff"
                strokeWidth="2"
                rx="3"
                initial={{ x: xPoints[0], y: yPoints[0] }}
                animate={{ x: xPoints, y: yPoints }}
                transition={{
                  duration: 1,
                  ease: 'linear',
                  times: animPoints.map((_, i) => i / (animPoints.length - 1))
                }}
                style={{
                  willChange: 'transform', // GPU acceleration
                }}
              />
            </g>
          );
        })()}
        </g>
      </svg>

      {/* 줌 컨트롤 (모바일/태블릿) */}
      {(isMobile || isTablet) && (
        <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
          <motion.button
            onClick={zoomIn}
            className="glass-card p-3 hover:bg-accent/20 transition-colors rounded-lg shadow-lg"
            aria-label="Zoom In"
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <ZoomIn className="w-5 h-5 text-accent" />
          </motion.button>
          <motion.button
            onClick={zoomOut}
            className="glass-card p-3 hover:bg-accent/20 transition-colors rounded-lg shadow-lg"
            aria-label="Zoom Out"
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <ZoomOut className="w-5 h-5 text-accent" />
          </motion.button>
          <motion.button
            onClick={resetZoom}
            className="glass-card p-3 hover:bg-accent/20 transition-colors rounded-lg shadow-lg"
            aria-label="Reset Zoom"
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Maximize2 className="w-5 h-5 text-accent" />
          </motion.button>
        </div>
      )}

      {/* 범례 */}
      <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-2 py-4 px-6 bg-background-secondary/50 border-t border-foreground/10">
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded"
            style={{ backgroundColor: terrainColors.plain }}
          />
          <span className="text-xs text-foreground-secondary">평지</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded"
            style={{ backgroundColor: terrainColors.lake }}
          />
          <span className="text-xs text-foreground-secondary">호수</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {Object.entries(CITY_COLORS).slice(0, 4).map(([key, color]) => (
              <div
                key={key}
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <span className="text-xs text-foreground-secondary">도시</span>
        </div>
      </div>
    </motion.div>
  );
}
