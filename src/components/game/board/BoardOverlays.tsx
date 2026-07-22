'use client';

import { motion } from 'framer-motion';
import {
  hexToPixel,
  getHexPoints,
  getTrackPath,
  getMovementPathSVG,
  getAnimationPoints,
  getPathLinkOwners,
  hexCoordsEqual,
  HEX_SIZE,
} from '@/utils/hexGrid';
import {
  BoardState, CITY_COLORS, CUBE_COLORS, CubeColor, GamePhase, HexCoord,
  PLAYER_COLORS, PlayerId, PlayerState, RouteOption,
} from '@/types/game';
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
  /** 달(Moon): 현재 밤쪽 절반 헥스들의 실루엣 path — 반투명 어둠 오버레이 (GameBoard useMemo) */
  nightOverlayPath?: string;
  /** 달(Moon): 밤쪽 상단 "밤" 배지 위치 (GameBoard useMemo) */
  nightBadge?: { x: number; y: number } | null;
  /** 달(Moon): 낮쪽 상단 "낮" 배지 위치 — 태양 타일 표시 (GameBoard useMemo) */
  dayBadge?: { x: number; y: number } | null;
  borderColor: string;
  // ui 상태 (필요한 필드만)
  previewTrack: { coord: HexCoord; edges: [number, number] } | null;
  selectedCubeCityId: string | null;
  movePath: HexCoord[];
  movingCube: { color: CubeColor; path: HexCoord[] } | null;
  /** 타인 철도 경로 선택 상태 — 후보 경로들을 소유자 색으로 렌더, 클릭으로 선택/확정 */
  routeChoice: { dest: HexCoord; options: RouteOption[]; selectedIndex: number } | null;
  players: Record<PlayerId, PlayerState>;
  // 액션
  selectCube: (cityId: string, cubeIndex: number) => void;
  selectRouteOption: (index: number) => void;
  confirmRouteChoice: () => void;
}

/** 경로를 링크(정거장 사이 구간) 단위로 분절 — 세그먼트 [i] = getPathLinkOwners [i] 링크 */
function splitPathLinks(path: HexCoord[], board: BoardState): HexCoord[][] {
  const isStop = (c: HexCoord) =>
    board.cities.some(x => hexCoordsEqual(x.coord, c)) ||
    board.towns.some(x => hexCoordsEqual(x.coord, c));
  const segs: HexCoord[][] = [];
  let start = 0;
  for (let i = 1; i < path.length; i++) {
    if (isStop(path[i])) {
      segs.push(path.slice(start, i + 1));
      start = i;
    }
  }
  return segs;
}

export default function BoardOverlays({
  board,
  currentPhase,
  isFlat,
  mapOutlinePath,
  blockedEdgePath,
  nightOverlayPath,
  nightBadge,
  dayBadge,
  borderColor,
  previewTrack,
  selectedCubeCityId,
  movePath,
  movingCube,
  routeChoice,
  players,
  selectCube,
  selectRouteOption,
  confirmRouteChoice,
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

      {movePath.length > 1 && !movingCube && !routeChoice && (
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

      {/* 타인 철도 경로 선택 — 후보 경로를 링크 단위로 분절해 내/무수입 구간=골드,
          빌린 구간=그 링크 소유자의 마커 색으로 렌더. 비선택 후보 클릭=선택 전환,
          선택된 후보 재클릭=수송 확정(목적지 재클릭·PhasePanel 버튼과 동일). */}
      {routeChoice && !movingCube && (
        <g>
          {routeChoice.options
            .map((opt, i) => ({ opt, i }))
            // 선택된 경로를 마지막에 그려 위로 올림 (겹치는 구간에서 선택이 보이게)
            .sort((a, b) => (a.i === routeChoice.selectedIndex ? 1 : 0) - (b.i === routeChoice.selectedIndex ? 1 : 0))
            .map(({ opt, i }) => {
              const selected = i === routeChoice.selectedIndex;
              const linkOwners = getPathLinkOwners(opt.path, board);
              const segs = splitPathLinks(opt.path, board);
              const onClick = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (selected) confirmRouteChoice();
                else selectRouteOption(i);
              };
              return (
                <g key={`route-opt-${i}`} className="cursor-pointer" onClick={onClick}>
                  {segs.map((seg, s) => {
                    const owner = linkOwners[s] ?? null;
                    const color = owner && players[owner]
                      ? PLAYER_COLORS[players[owner].color]
                      : '#d4a853'; // 내 구간·무수입(정부/공용) 구간은 골드
                    return (
                      <path
                        key={`route-opt-${i}-seg-${s}`}
                        d={getMovementPathSVG(seg, board, HEX_SIZE - 2, isFlat)}
                        fill="none"
                        stroke={color}
                        strokeWidth={selected ? 5.5 : 3.5}
                        strokeLinecap="round"
                        strokeDasharray={selected ? '10 4' : '5 5'}
                        opacity={selected ? 1 : 0.4}
                        shapeRendering="geometricPrecision"
                        style={{ pointerEvents: 'none' }}
                      />
                    );
                  })}
                  {/* 투명 히트 영역 — 얇은 점선도 클릭하기 쉽게 (모바일 터치 포함) */}
                  <path
                    d={getMovementPathSVG(opt.path, board, HEX_SIZE - 2, isFlat)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={18}
                    strokeLinecap="round"
                    style={{ pointerEvents: 'stroke' }}
                  />
                </g>
              );
            })}
        </g>
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

      {/* 달(Moon): 밤쪽 절반 어둠 — 도시/트랙 위 반투명 (밤 도시 검정 렌더와 조합, 클릭 통과) */}
      {nightOverlayPath && (
        <path
          d={nightOverlayPath}
          fill="rgba(18,18,38,0.30)"
          stroke="none"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* 달(Moon): 밤/낮 배지 — 어느 절반이 밤·낮인지 표시 (턴마다 교대, 낮=태양 타일 자리) */}
      {nightBadge && (
        <g style={{ pointerEvents: 'none' }}>
          <rect x={nightBadge.x - 44} y={nightBadge.y - 17} width={88} height={34} rx={17}
            fill="rgba(24,24,46,0.88)" stroke="#8b87a8" strokeWidth={1.2} />
          <text x={nightBadge.x} y={nightBadge.y + 1} textAnchor="middle" dominantBaseline="central"
            fill="#f3f2fa" fontSize={17} fontWeight="700">
            {'\u{1F319} \uBC24'}
          </text>
        </g>
      )}
      {dayBadge && (
        <g style={{ pointerEvents: 'none' }}>
          <rect x={dayBadge.x - 44} y={dayBadge.y - 17} width={88} height={34} rx={17}
            fill="rgba(255,248,225,0.94)" stroke="#d9a520" strokeWidth={1.2} />
          <text x={dayBadge.x} y={dayBadge.y + 1} textAnchor="middle" dominantBaseline="central"
            fill="#7a5a10" fontSize={17} fontWeight="700">
            {'\u2600\uFE0F \uB0AE'}
          </text>
        </g>
      )}

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

      {/* 달(Moon): 랩 어라운드 엣지 번호 — 원본 시트처럼 외곽 변에 딱 붙은 갈색 박스,
          변과 평행하게 회전 (하단 번호가 뒤집혀 보이는 것까지 원본 레이아웃 그대로) */}
      {(board.wrapEdges ?? []).map((w) =>
        [w.a, w.b].map((side, i) => {
          const { x, y } = hexToPixel(side.coord.col, side.coord.row, undefined, undefined, undefined, isFlat);
          // 변 중점 방향각(데이터 pointy-top: 60°×edge). flat 렌더는 dx/dy 전치 = 화면각 90°−θ
          const theta = side.edge * 60;
          const screenTheta = isFlat ? 90 - theta : theta;
          const rad = (Math.PI / 180) * screenTheta;
          const apothem = (Math.sqrt(3) / 2) * HEX_SIZE;
          const box = HEX_SIZE * 0.34;
          // 박스 중심 = 변 중점에서 바깥으로 박스 반높이 + 외곽선(4px) 절반 → 변에 밀착
          const dist = apothem + box / 2 + 2;
          const bx = x + Math.cos(rad) * dist;
          const by = y + Math.sin(rad) * dist;
          // 박스/숫자를 변에 평행하게 회전 (변 접선 = 중점 방향 + 90°)
          const tangent = screenTheta + 90;
          return (
            <g key={`wrap-${w.number}-${i}`} style={{ pointerEvents: 'none' }}
              transform={`rotate(${tangent}, ${bx.toFixed(1)}, ${by.toFixed(1)})`}>
              <rect x={bx - box / 2} y={by - box / 2} width={box} height={box} rx={3} fill={borderColor} />
              <text x={bx} y={by} textAnchor="middle" dominantBaseline="central" fill="#ffffff"
                fontSize={box * 0.62} fontWeight="700" fontFamily="Georgia, 'Times New Roman', serif">
                {w.number}
              </text>
            </g>
          );
        })
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
