'use client';

import { hexToPixel, getHexPoints, hexCoordsEqual, HEX_SIZE } from '@/utils/hexGrid';
import { CUBE_COLORS, GamePhase, HexCoord, Town, TrackTile } from '@/types/game';
import { SQRT3_2, nameBandPoints, cubeRenderSize, cubeStrokeColor, cubeStrokeWidth } from './boardGeometry';
import { TrackPathCacheEntry } from './BoardTracks';

// 마을 레이어 — 흰 디스크·이름 띠·마을 위 트랙/가닥·도시화 하이라이트·마을 큐브.
// GameBoard에서 그대로 이동한 순수 렌더 (게임 로직 없음, 판정/액션은 props로 주입).

interface BoardTownsProps {
  towns: Town[];
  trackTiles: TrackTile[];
  currentPhase: GamePhase;
  isFlat: boolean;
  /** terrainColors.plain (맵 데이터에 없으면 undefined, 원본 동작 유지) */
  plainColor: string | undefined;
  townNames: Record<string, string> | undefined;
  trackPathCache: Map<string, TrackPathCacheEntry>;
  // ui 상태 (필요한 필드만)
  sourceHex: HexCoord | null;
  urbanizationMode: boolean;
  hasSelectedNewCityTile: boolean;
  isMovingCube: boolean;
  highlightedHexes: HexCoord[];
  // 판정/액션 (store·부모 콜백)
  canPlaceNewCity: (coord: HexCoord) => boolean;
  placeNewCity: (coord: HexCoord) => void;
  canBuildTownSpur: (coord: HexCoord) => boolean;
  selectCube: (cityId: string, cubeIndex: number) => void;
  onHexClick: (coord: HexCoord) => void;
  renderTownSpurs: (townCoord: HexCoord, x: number, y: number) => React.ReactNode;
}

export default function BoardTowns({
  towns,
  trackTiles,
  currentPhase,
  isFlat,
  plainColor,
  townNames,
  trackPathCache,
  sourceHex,
  urbanizationMode,
  hasSelectedNewCityTile,
  isMovingCube,
  highlightedHexes,
  canPlaceNewCity,
  placeNewCity,
  canBuildTownSpur,
  selectCube,
  onHexClick,
  renderTownSpurs,
}: BoardTownsProps) {
  return (
    <>
      {towns.map((town) => {
        const { x, y } = hexToPixel(town.coord.col, town.coord.row, undefined, undefined, undefined, isFlat);
        const isUrbanized = town.newCityColor !== null;
        // 도시화된 마을은 cities 배열에 추가되어 도시로 렌더링됨 — 여기서 또 그리면 중복
        if (isUrbanized) return null;
        const isSourceSelected = sourceHex && hexCoordsEqual(sourceHex, town.coord);
        // governmentLink(Montréal): 정부 링크가 마을(Stop)을 지나도록 정부 가닥 건설 클릭 허용
        const isBuildingPhase = currentPhase === 'buildTrack' || currentPhase === 'governmentLink';
        const isTownClickable = (isBuildingPhase && !urbanizationMode)
          // 물품 이동 단계: 큐브가 있는(미도시화) 마을은 출발점으로 클릭 가능 (Western US)
          || (currentPhase === 'moveGoods' && !isMovingCube && town.newCityColor === null && town.cubes.length > 0);

        // 도시화 가능 여부 확인
        const canUrbanize = urbanizationMode && hasSelectedNewCityTile && !isUrbanized;
        const isUrbanizationClickable = canPlaceNewCity(town.coord);

        // 미연결 가닥 완성 가능 여부 (내 트랙이 변에 닿아 있으나 가닥 없음 → 클릭으로 건설)
        const canCompleteSpur = isBuildingPhase && !urbanizationMode && canBuildTownSpur(town.coord);

        // 마을 헥스 자체에 깔린 트랙 (마을 디스크 아래 트랙 타일)
        const townTrack = trackTiles.find(t => hexCoordsEqual(t.coord, town.coord));
        const townTrackCache = townTrack ? trackPathCache.get(townTrack.id) : undefined;

        // 마을 클릭 핸들러
        const handleTownClick = () => {
          // 도시화 모드인 경우
          if (urbanizationMode && isUrbanizationClickable) {
            placeNewCity(town.coord);
            return;
          }
          // 물품 이동 단계: 마을 위 큐브 선택 (Western US — 'town:<id>' 컨벤션)
          if (currentPhase === 'moveGoods' && !isMovingCube && town.newCityColor === null && town.cubes.length > 0) {
            selectCube(`town:${town.id}`, 0);
            return;
          }
          // 일반 트랙 건설 모드(또는 정부 링크 건설)인 경우
          if (isBuildingPhase && !urbanizationMode) {
            onHexClick(town.coord);
          }
        };

        // 트랙 건설 가이드: 마을 방향으로 지을 수 있을 때 노란 하이라이트 (헥스와 동일)
        const isTownHighlighted = isBuildingPhase
          && highlightedHexes.some(h => hexCoordsEqual(h, town.coord));

        return (
          <g key={`town-${town.id}`}>
            {/* 마을 배경 헥스 */}
            <polygon
              points={getHexPoints(x, y, HEX_SIZE, isFlat)}
              fill={isTownHighlighted ? 'rgba(212, 168, 83, 0.45)' : plainColor}
              stroke={
                isUrbanizationClickable
                  ? '#3B82F6'  // 도시화 가능: 파란색 테두리
                  : canCompleteSpur
                  ? '#f4a261'  // 미연결 가닥 완성 가능: 주황 점선 테두리
                  : isSourceSelected
                  ? '#ffffff'
                  : isTownHighlighted
                  ? '#d4a853'  // 트랙 건설 가능 방향: 노란(골드) 테두리
                  : '#2D4A2D'  // 배경 평지 헥스와 동일
              }
              strokeWidth={isTownHighlighted ? 1.5 : 0.5}
              strokeDasharray={canCompleteSpur ? '6 4' : undefined}
              className={(isTownClickable || isUrbanizationClickable) ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}
              onClick={handleTownClick}
            >
              {canCompleteSpur && <title>클릭: 마을 가닥 건설 ($1, 건설 1회) — 미연결 노선의 연결을 완성합니다</title>}
            </polygon>

            {/* 마을 헥스 위 트랙 타일 (마을 디스크 아래 깔린 철길) */}
            {townTrack && townTrackCache && (
              <g style={{ pointerEvents: 'none' }}>
                <path d={townTrackCache.pathData} fill="none" stroke="#3A3A32" strokeWidth="12" strokeLinecap="round" shapeRendering="geometricPrecision" />
                <path d={townTrackCache.pathData} fill="none" stroke={plainColor} strokeWidth="6" strokeLinecap="round" shapeRendering="geometricPrecision" />
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
            {/* 마을 안 철길 가닥 (실제 건설물 — 원에서 변까지) */}
            {renderTownSpurs(town.coord, x, y)}

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

            {/* 마을 (흰 원 + 헥스 좌우 끝까지 육각형 이름 띠 — 공식 PDF 스타일, 테두리 없음) */}
            {(() => {
              const label = townNames?.[town.id] ?? town.id;
              const nameFs =
                Math.min(HEX_SIZE * 0.2, (2 * (HEX_SIZE - 3) - 22) / Math.max(1, label.length * 0.62)) * 0.8;
              const SERIF = "Georgia, 'Times New Roman', serif";
              const clickable = (isTownClickable || isUrbanizationClickable) ? 'cursor-pointer' : '';
              return (
                <>
                  {/* 흰 원 (가장 낮은 z — 헥스 바로 위, 이름 띠 아래) */}
                  <circle cx={x} cy={y} r={HEX_SIZE * 0.52} fill="#ffffff" className={clickable} onClick={handleTownClick} />
                  {/* 이름 띠 (육각형) */}
                  <polygon points={nameBandPoints(x, y, isFlat)} fill="#ffffff" className={clickable} onClick={handleTownClick} />
                  <text
                    x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#1a1a1a"
                    fontSize={nameFs} fontWeight="600" letterSpacing="0.5" fontFamily={SERIF}
                    style={{ pointerEvents: 'none' }}
                  >
                    {label.toUpperCase()}
                  </text>
                </>
              );
            })()}

            {/* 마을 위 물품 큐브 (도시화 전에만) — 도시 화물과 동일한 위치·크기·2줄 배치.
                큐브가 헥스 위에 그려져 클릭을 삼키므로, 이동 단계엔 큐브 자체를 선택
                핸들러로(마을 클릭과 동일 동작), 그 외 단계엔 클릭을 헥스로 통과시킨다. */}
            {!isUrbanized && town.cubes.length > 0 && (
              <g>
                {town.cubes.map((cubeColor, i) => {
                  const cubeEdge = isFlat ? SQRT3_2 * HEX_SIZE : HEX_SIZE;
                  const n = town.cubes.length;
                  const cols = n >= 4 ? Math.ceil(n / 2) : n;
                  const row = Math.floor(i / cols);
                  const colIdx = i % cols;
                  const colsInRow = row === 0 ? cols : n - cols;
                  const cubeX = x - ((colsInRow - 1) * 18) / 2 + colIdx * 18;
                  // pointy-top(꼭짓점 세로, 서부 US) 맵은 화물을 6px 위로.
                  const cubeY = y + cubeEdge - HEX_SIZE * 0.58 + 4 + row * 15 - (isFlat ? 0 : 6);
                  const cubeSize = cubeRenderSize(cubeColor);
                  const cubeClickable =
                    currentPhase === 'moveGoods' && !isMovingCube && town.newCityColor === null;
                  return (
                    <rect
                      key={`town-cube-${town.id}-${i}`}
                      x={cubeX - cubeSize / 2}
                      y={cubeY - cubeSize / 2}
                      width={cubeSize}
                      height={cubeSize}
                      fill={CUBE_COLORS[cubeColor]}
                      stroke={cubeStrokeColor(cubeColor)}
                      strokeWidth={cubeStrokeWidth(cubeColor)}
                      rx="1"
                      className={cubeClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
                      style={cubeClickable ? undefined : { pointerEvents: 'none' }}
                      onClick={cubeClickable ? () => selectCube(`town:${town.id}`, i) : undefined}
                    />
                  );
                })}
              </g>
            )}
          </g>
        );
      })}
    </>
  );
}
