'use client';

import { useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import {
  hexToPixel,
  getHexPoints,
  getTrackPath,
  getRailroadTies,
  calculateBoardDimensions,
  hexCoordsEqual,
  HEX_SIZE,
} from '@/utils/hexGrid';
import { RUST_BELT_MAP, RUST_BELT_COLORS, RUST_BELT_LAKE_TILES } from '@/utils/rustBeltMap';
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
  } = useGameStore();

  const { width: boardWidth, height: boardHeight } = useMemo(
    () => calculateBoardDimensions(RUST_BELT_MAP.cols, RUST_BELT_MAP.rows),
    []
  );

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
    return !isCity;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl overflow-hidden border border-foreground/10"
      style={{ backgroundColor: RUST_BELT_COLORS.background }}
    >
      {/* 보드 헤더 */}
      <div className="px-4 py-3 bg-background-secondary/50 border-b border-foreground/10">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground-secondary">
            {currentPhase === 'buildTrack' && ui.buildMode === 'idle' && '도시를 클릭하여 트랙 건설을 시작하세요'}
            {currentPhase === 'buildTrack' && ui.buildMode === 'source_selected' && '노란색 헥스를 클릭하여 트랙을 건설하세요'}
            {currentPhase === 'buildTrack' && ui.buildMode === 'target_selected' && '트랙이 나갈 방향을 클릭하세요 (곡선/직선 선택)'}
            {currentPhase === 'moveGoods' && '물품 큐브를 클릭하여 이동하세요'}
            {currentPhase !== 'buildTrack' && currentPhase !== 'moveGoods' && 'Rust Belt'}
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
        {[...Array(RUST_BELT_MAP.rows)].map((_, row) =>
          [...Array(RUST_BELT_MAP.cols - RUST_BELT_MAP.startCol)].map((_, colIndex) => {
            const col = colIndex + RUST_BELT_MAP.startCol;
            const { x, y } = hexToPixel(col, row);

            if (!shouldRenderHex(col, row)) return null;

            const coord = { col, row };
            const isLake = RUST_BELT_LAKE_TILES.some(
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
                      ? RUST_BELT_COLORS.terrain.lake
                      : RUST_BELT_COLORS.terrain.plain
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

          return (
            <g key={tile.id}>
              {/* 레일 */}
              <path
                d={pathData}
                fill="none"
                stroke="#3A3A32"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path
                d={pathData}
                fill="none"
                stroke={RUST_BELT_COLORS.terrain.plain}
                strokeWidth="6"
                strokeLinecap="round"
              />
              {/* 침목 */}
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
              {/* 소유자 마커 */}
              <circle
                cx={x}
                cy={y}
                r="7"
                fill={ownerColor}
                stroke="#1a1a1a"
                strokeWidth="1.5"
              />
            </g>
          );
        })}

        {/* 도시 */}
        {board.cities.map((city) => {
          const { x, y } = hexToPixel(city.coord.col, city.coord.row);
          const cityColor = CITY_COLORS[city.color];
          const isSourceSelected = ui.sourceHex && hexCoordsEqual(ui.sourceHex, city.coord);
          const isCityClickable = currentPhase === 'buildTrack';

          return (
            <g key={`city-${city.id}`}>
              {/* 도시 헥사곤 */}
              <polygon
                points={getHexPoints(x, y, HEX_SIZE - 2)}
                fill={cityColor}
                stroke={isSourceSelected ? '#ffffff' : 'rgba(255,255,255,0.2)'}
                strokeWidth={isSourceSelected ? 4 : 2}
                className={isCityClickable ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}
                onClick={() => isCityClickable && handleHexClick(city.coord)}
              />

              {/* 도시 ID 원 */}
              <circle
                cx={x}
                cy={y - 12}
                r="18"
                fill="rgba(255,255,255,0.15)"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="2"
              />
              <text
                x={x}
                y={y - 6}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="20"
                fontWeight="bold"
                fontFamily="system-ui, sans-serif"
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

        {/* 이동 경로 */}
        {ui.movePath.length > 1 && (
          <g>
            {ui.movePath.map((coord, i) => {
              if (i === 0) return null;
              const from = hexToPixel(ui.movePath[i - 1].col, ui.movePath[i - 1].row);
              const to = hexToPixel(coord.col, coord.row);
              return (
                <line
                  key={`path-${i}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#d4a853"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray="8 4"
                />
              );
            })}
          </g>
        )}
      </svg>

      {/* 범례 */}
      <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-2 py-4 px-6 bg-background-secondary/50 border-t border-foreground/10">
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded"
            style={{ backgroundColor: RUST_BELT_COLORS.terrain.plain }}
          />
          <span className="text-xs text-foreground-secondary">평지</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded"
            style={{ backgroundColor: RUST_BELT_COLORS.terrain.lake }}
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
