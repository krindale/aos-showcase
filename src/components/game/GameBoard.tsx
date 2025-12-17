'use client';

import { useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import {
  hexToPixel,
  getHexPoints,
  getTrackPath,
  getRailroadTies,
  calculateBoardDimensions,
  hexCoordsEqual,
  getNeighborHex,
  getOppositeEdge,
  HEX_SIZE,
  findCompletedLinks,
  getMovementPathSVG,
  getAnimationPoints,
} from '@/utils/hexGrid';
import { TUTORIAL_MAP, TUTORIAL_COLORS, TUTORIAL_LAKE_TILES } from '@/utils/tutorialMap';
import { CITY_COLORS, CUBE_COLORS, PLAYER_COLORS, HexCoord } from '@/types/game';

export default function GameBoard() {
  const {
    board,
    currentPhase,
    currentPlayer,
    players,
    ui,
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
    () => calculateBoardDimensions(TUTORIAL_MAP.cols, TUTORIAL_MAP.rows),
    []
  );

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

    for (const track of board.trackTiles) {
      for (const edge of track.edges) {
        const neighbor = getNeighborHex(track.coord, edge);
        const neighborTrack = board.trackTiles.find(t =>
          hexCoordsEqual(t.coord, neighbor)
        );

        if (neighborTrack) {
          const expectedEdge = getOppositeEdge(edge);
          const isConnected = neighborTrack.edges.includes(expectedEdge);

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

    return disconnected;
  }, [board.trackTiles]);

  // 헥스가 유효한 연결점인지 확인 (도시 또는 현재 플레이어의 트랙)
  const isValidConnectionPoint = useCallback(
    (coord: HexCoord) => {
      const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
      if (isCity) return true;

      const playerTrack = board.trackTiles.find(
        t => hexCoordsEqual(t.coord, coord) && t.owner === currentPlayer
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
      className="rounded-xl overflow-hidden border border-foreground/10"
      style={{ backgroundColor: TUTORIAL_COLORS.background }}
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
      >
        {/* 배경 헥스 그리드 */}
        {[...Array(TUTORIAL_MAP.rows)].map((_, row) =>
          [...Array(TUTORIAL_MAP.cols - TUTORIAL_MAP.startCol)].map((_, colIndex) => {
            const col = colIndex + TUTORIAL_MAP.startCol;
            const { x, y } = hexToPixel(col, row);

            if (!shouldRenderHex(col, row)) return null;

            const coord = { col, row };
            const isLake = TUTORIAL_LAKE_TILES.some(
              (l) => l.col === col && l.row === row
            );
            const isSourceSelected = ui.sourceHex && hexCoordsEqual(ui.sourceHex, coord);
            const isHighlighted = ui.highlightedHexes.some(h => hexCoordsEqual(h, coord));
            const hasPlayerTrack = board.trackTiles.some(
              t => hexCoordsEqual(t.coord, coord) && t.owner === currentPlayer
            );

            // 클릭 가능 여부: 트랙 건설 단계에서 하이라이트되거나 플레이어 트랙이 있는 경우
            const isClickable = !isLake && currentPhase === 'buildTrack' && (isHighlighted || hasPlayerTrack);

            return (
              <g key={`hex-${col}-${row}`}>
                <polygon
                  points={getHexPoints(x, y, HEX_SIZE - 2)}
                  fill={
                    isHighlighted
                      ? 'rgba(212, 168, 83, 0.3)' // 건설 가능 헥스 하이라이트
                      : isLake
                      ? TUTORIAL_COLORS.terrain.lake
                      : TUTORIAL_COLORS.terrain.plain
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
              </g>
            );
          })
        )}

        {/* 트랙 타일 */}
        {board.trackTiles.map((tile) => {
          const { x, y } = hexToPixel(tile.coord.col, tile.coord.row);
          const pathData = getTrackPath(x, y, tile.edges[0], tile.edges[1], HEX_SIZE - 2);
          const ties = getRailroadTies(x, y, tile.edges[0], tile.edges[1], HEX_SIZE - 2);
          const ownerColor = tile.owner ? PLAYER_COLORS[players[tile.owner].color] : '#888';

          // 복합 트랙인 경우 두 번째 경로도 렌더링
          const hasSecondary = tile.trackType !== 'simple' && tile.secondaryEdges;
          const secondaryPathData = hasSecondary
            ? getTrackPath(x, y, tile.secondaryEdges![0], tile.secondaryEdges![1], HEX_SIZE - 2)
            : null;
          const secondaryTies = hasSecondary
            ? getRailroadTies(x, y, tile.secondaryEdges![0], tile.secondaryEdges![1], HEX_SIZE - 2)
            : [];
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
                className={isTrackClickable ? 'cursor-pointer' : ''}
                onClick={(e) => handleTrackClick(e)}
              />
              <path
                d={pathData}
                fill="none"
                stroke={TUTORIAL_COLORS.terrain.plain}
                strokeWidth="6"
                strokeLinecap="round"
                className={isTrackClickable ? 'cursor-pointer' : ''}
                onClick={(e) => handleTrackClick(e)}
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
                    />
                  )}
                  <path
                    d={secondaryPathData}
                    fill="none"
                    stroke="#3A3A32"
                    strokeWidth="12"
                    strokeLinecap="round"
                  />
                  <path
                    d={secondaryPathData}
                    fill="none"
                    stroke={TUTORIAL_COLORS.terrain.plain}
                    strokeWidth="6"
                    strokeLinecap="round"
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
            </g>
          );
        })}

        {/* 완성된 링크 소유 마커 - 링크 중앙에 하나만 표시 */}
        {completedLinks.map((link) => {
          const ownerColor = PLAYER_COLORS[players[link.owner].color];
          return (
            <circle
              key={link.id}
              cx={link.centerPosition.x}
              cy={link.centerPosition.y}
              r="8"
              fill={ownerColor}
              stroke="#1a1a1a"
              strokeWidth="2"
            />
          );
        })}

        {/* 끊어진 트랙 연결 경고 표시 */}
        {disconnectedConnections.map((conn, index) => {
          const { x: x1, y: y1 } = hexToPixel(conn.from.col, conn.from.row);
          const { x: x2, y: y2 } = hexToPixel(conn.to.col, conn.to.row);

          // 두 트랙 중간 지점
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          return (
            <g key={`disconn-${index}`}>
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
          const { x, y } = hexToPixel(town.coord.col, town.coord.row);
          const isUrbanized = town.newCityColor !== null;
          const townColor = isUrbanized ? CITY_COLORS[town.newCityColor!] : '#ffffff';
          const isSourceSelected = ui.sourceHex && hexCoordsEqual(ui.sourceHex, town.coord);
          const isTownClickable = currentPhase === 'buildTrack' && !ui.urbanizationMode;

          // 도시화 가능 여부 확인
          const canUrbanize = ui.urbanizationMode && ui.selectedNewCityTile && !isUrbanized;
          const isUrbanizationClickable = canPlaceNewCity(town.coord);

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
                points={getHexPoints(x, y, HEX_SIZE - 2)}
                fill={TUTORIAL_COLORS.terrain.plain}
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

              {/* 마을 ID (신규 도시로 변환된 경우 도시 색상 표시) */}
              {isUrbanized ? (
                <text
                  x={x}
                  y={y + 5}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="18"
                  fontWeight="bold"
                  fontFamily="system-ui, sans-serif"
                  style={{ pointerEvents: 'none' }}
                >
                  {town.id}
                </text>
              ) : (
                <text
                  x={x}
                  y={y + 5}
                  textAnchor="middle"
                  fill="#333333"
                  fontSize="14"
                  fontWeight="600"
                  fontFamily="system-ui, sans-serif"
                  style={{ pointerEvents: 'none' }}
                >
                  Town
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
          const { x, y } = hexToPixel(city.coord.col, city.coord.row);
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
                points={getHexPoints(x, y, HEX_SIZE - 2)}
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
                ui.previewTrack.coord.row
              );
              const pathData = getTrackPath(
                x,
                y,
                ui.previewTrack.edges[0],
                ui.previewTrack.edges[1],
                HEX_SIZE - 2
              );
              return (
                <path
                  d={pathData}
                  fill="none"
                  stroke="#d4a853"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="4 4"
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
              />
            </g>
          );
        })()}
      </svg>

      {/* 범례 */}
      <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-2 py-4 px-6 bg-background-secondary/50 border-t border-foreground/10">
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded"
            style={{ backgroundColor: TUTORIAL_COLORS.terrain.plain }}
          />
          <span className="text-xs text-foreground-secondary">평지</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded"
            style={{ backgroundColor: TUTORIAL_COLORS.terrain.lake }}
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
