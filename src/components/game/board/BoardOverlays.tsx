'use client';

import { motion } from 'framer-motion';
import {
  hexToPixel,
  getHexPoints,
  getTrackPath,
  getMovementPathSVG,
  getAnimationPoints,
  HEX_SIZE,
} from '@/utils/hexGrid';
import { BoardState, CITY_COLORS, CUBE_COLORS, CubeColor, GamePhase, HexCoord } from '@/types/game';
import { cubeStrokeColor } from './boardGeometry';

// 오버레이 레이어 — 미리보기 트랙·트랙 위 큐브·이동 경로·이동 큐브 애니메이션·
// 지도 외곽선·건설 불가 경계·터미널 테두리. GameBoard에서 그대로 이동한 순수 렌더.

interface BoardOverlaysProps {
  board: BoardState;
  currentPhase: GamePhase;
  isFlat: boolean;
  /** 지도 바깥 외곽 실루엣 path (GameBoard useMemo) */
  mapOutlinePath: string;
  /** 건설 불가 내부 경계 변 path (GameBoard useMemo) */
  blockedEdgePath: string;
  borderColor: string;
  // ui 상태 (필요한 필드만)
  previewTrack: { coord: HexCoord; edges: [number, number] } | null;
  selectedCubeCityId: string | null;
  movePath: HexCoord[];
  movingCube: { color: CubeColor; path: HexCoord[] } | null;
  // 액션
  selectCube: (cityId: string, cubeIndex: number) => void;
}

export default function BoardOverlays({
  board,
  currentPhase,
  isFlat,
  mapOutlinePath,
  blockedEdgePath,
  borderColor,
  previewTrack,
  selectedCubeCityId,
  movePath,
  movingCube,
  selectCube,
}: BoardOverlaysProps) {
  return (
    <>
      {/* 미리보기 트랙 */}
      {previewTrack && (
        <g opacity={0.5}>
          {(() => {
            const { x, y } = hexToPixel(
              previewTrack.coord.col,
              previewTrack.coord.row,
              undefined, undefined, undefined, isFlat
            );
            const pathData = getTrackPath(
              x,
              y,
              previewTrack.edges[0],
              previewTrack.edges[1],
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
      {/* 트랙 위 물품 큐브 — 최상위 레이어 (마을/도시 등 다른 요소에 클릭이 가려지지 않도록) */}
      {board.trackTiles.filter(t => t.cube).map((tile) => {
        const { x, y } = hexToPixel(tile.coord.col, tile.coord.row, undefined, undefined, undefined, isFlat);
        const isSelected = selectedCubeCityId === `track:${tile.id}`;
        const clickable = currentPhase === 'moveGoods';
        const handleClick = (e: React.MouseEvent) => {
          if (!clickable) return;
          e.stopPropagation();
          selectCube(`track:${tile.id}`, 0);
        };
        return (
          <g key={`track-cube-${tile.id}`} className={clickable ? 'cursor-pointer' : ''}>
            <rect
              x={x - 6}
              y={y - 18}
              width="12"
              height="12"
              fill={CUBE_COLORS[tile.cube!]}
              stroke={isSelected ? '#ffffff' : 'rgba(0,0,0,0.4)'}
              strokeWidth={isSelected ? 2.5 : 1}
              rx="2"
              className={clickable ? 'hover:opacity-80' : ''}
              onClick={handleClick}
            />
            {/* 투명 히트 영역 (작은 큐브도 클릭하기 쉽게) */}
            <circle
              cx={x}
              cy={y - 12}
              r="16"
              fill="transparent"
              onClick={handleClick}
            />
          </g>
        );
      })}

      {movePath.length > 1 && !movingCube && (
        <path
          d={getMovementPathSVG(movePath, board, HEX_SIZE - 2, isFlat)}
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
      {movingCube && (() => {
        // 경로의 모든 애니메이션 포인트 계산
        const animPoints = getAnimationPoints(movingCube.path, board, HEX_SIZE - 2, 5, isFlat);

        // 모든 x, y 좌표 배열 생성
        const xPoints = animPoints.map(p => p.x - 9);
        const yPoints = animPoints.map(p => p.y - 9);

        return (
          <g>
            {/* 이동 경로 표시 - 트랙을 따라 점선으로 */}
            <path
              d={getMovementPathSVG(movingCube.path, board, HEX_SIZE - 2, isFlat)}
              fill="none"
              stroke={CUBE_COLORS[movingCube.color]}
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
              fill={CUBE_COLORS[movingCube.color]}
              stroke={cubeStrokeColor(movingCube.color, '#ffffff')}
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

      {/* 지도 바깥 외곽선 — 헥스 실루엣의 바깥 변(이웃 없는 변)을 두꺼운 실선으로 연결 (맵 테두리색) */}
      {mapOutlinePath && (
        <path
          d={mapOutlinePath}
          fill="none"
          stroke={borderColor}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* 철도 건설 불가 내부 경계 변 — 외곽선 2배(8px) 굵기, 검은색 */}
      {blockedEdgePath && (
        <path
          d={blockedEdgePath}
          fill="none"
          stroke="#000000"
          strokeWidth={8}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* 외국 터미널(독일) 수용 화물색 테두리 — z 최상단(외곽선보다 위). 도시 그룹이 아닌 여기서 그림. */}
      {board.cities.filter(c => c.isTerminal).map(city => {
        const { x, y } = hexToPixel(city.coord.col, city.coord.row, undefined, undefined, undefined, isFlat);
        return (
          <polygon
            key={`terminal-border-top-${city.id}`}
            points={getHexPoints(x, y, HEX_SIZE, isFlat)}
            fill="none"
            stroke={CITY_COLORS[city.color]}
            strokeWidth={4}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}
    </>
  );
}
