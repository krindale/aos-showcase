'use client';

import { hexToPixel, getHexPoints, hexCoordsEqual, HEX_SIZE } from '@/utils/hexGrid';
import {
  CITY_COLORS,
  CUBE_COLORS,
  City,
  DirectLink,
  GamePhase,
  HexCoord,
  PLAYER_COLORS,
  PlayerId,
  PlayerState,
} from '@/types/game';
import { SQRT3_2, nameBandPoints, numberBoxPath, cubeRenderSize, cubeStrokeColor, cubeStrokeWidth } from './boardGeometry';

// 도시 레이어 — 도시 헥스·라벨(숫자 박스/이름 띠)·물품 큐브 + Germany 직결 링크.
// GameBoard에서 그대로 이동한 순수 렌더 (게임 로직 없음, 판정/액션은 props로 주입).

interface BoardCitiesProps {
  cities: City[];
  /** board.dynamicCityColors (한국 — 도시 수요색 = 현재 큐브색) */
  dynamicCityColors: boolean | undefined;
  /** board.cottonPorts (Southern US — 면화 배달 종착 항구) */
  cottonPorts: string[] | undefined;
  /** board.directLinks (Germany Essen↔Düsseldorf 등) */
  directLinks: DirectLink[] | undefined;
  players: Record<PlayerId, PlayerState>;
  currentPhase: GamePhase;
  isFlat: boolean;
  /** cityId → 물품 성장 주사위 번호 */
  cityDiceNumber: Record<string, number>;
  /** MapProfile.isCityNumberBoxBlack — 숫자 박스 흑/백 결정 */
  isCityNumberBoxBlack: (cityId: string, demandColor: string) => boolean;
  // ui 상태 (필요한 필드만)
  sourceHex: HexCoord | null;
  reachableDestinations: HexCoord[];
  selectedCube: { cityId: string; cubeIndex: number } | null;
  // 액션 (store·부모 콜백)
  onHexClick: (coord: HexCoord) => void;
  selectDestinationCity: (coord: HexCoord) => void;
  onCubeClick: (cityId: string, cubeIndex: number) => void;
  buildDirectLink: (cityA: string, cityB: string) => void;
}

export default function BoardCities({
  cities,
  dynamicCityColors,
  cottonPorts,
  directLinks,
  players,
  currentPhase,
  isFlat,
  cityDiceNumber,
  isCityNumberBoxBlack,
  sourceHex,
  reachableDestinations,
  selectedCube,
  onHexClick,
  selectDestinationCity,
  onCubeClick,
  buildDirectLink,
}: BoardCitiesProps) {
  return (
    <>
      {/* 도시 */}
      {cities.map((city) => {
        const { x, y } = hexToPixel(city.coord.col, city.coord.row, undefined, undefined, undefined, isFlat);
        // 외국 터미널(독일 녹색 헥스): 칸은 원본 맵의 teal 녹색으로 채우고 테두리를
        // "수용 화물색"(city.color)으로. 일반 도시: 도시 색으로 채움.
        const TERMINAL_GREEN = '#2c908c'; // 원본 germany.png 터미널 헥스에서 추출
        const goodsColor = CITY_COLORS[city.color];
        // 한국(동적 색상): 도시는 고정색이 없으므로 회색 헥스로 그리고, 수요색은 하단 큐브로 표현.
        // (빈 도시 = 수요 없음 = 회색, 신도시도 회색)
        const DYNAMIC_CITY_GRAY = '#d2d6da'; // 공식 맵의 밝은(거의 흰) 도시 헥스 톤
        const cityColor = city.isTerminal
          ? TERMINAL_GREEN
          : dynamicCityColors
          ? DYNAMIC_CITY_GRAY
          : goodsColor; // Berlin(보너스 도시)도 데이터 색(black) 그대로 — 다른 검은 도시와 동일
        const isSourceSelected = sourceHex && hexCoordsEqual(sourceHex, city.coord);
        const isCityClickable = currentPhase === 'buildTrack';
        const isReachableDestination = reachableDestinations.some(
          d => hexCoordsEqual(d, city.coord)
        );
        const isMoveGoodsPhase = currentPhase === 'moveGoods';

        // 도시 클릭 핸들러
        const handleCityClick = () => {
          if (currentPhase === 'buildTrack') {
            onHexClick(city.coord);
          } else if (isMoveGoodsPhase && isReachableDestination) {
            selectDestinationCity(city.coord);
          }
        };

        return (
          <g key={`city-${city.id}`}>
            {/* 도시 헥사곤 (검은 테두리 0.5px) */}
            <polygon
              points={getHexPoints(x, y, HEX_SIZE, isFlat)}
              fill={cityColor}
              stroke={
                isReachableDestination
                  ? '#e6c77a'  // 골드 악센트 (accent-light)
                  : isSourceSelected
                  ? '#ffffff'
                  : '#1a1a1a'  // 터미널 수용색은 아래 안쪽 폴리곤으로 별도 표시
              }
              strokeWidth={0.5}
              className={
                (isCityClickable || isReachableDestination)
                  ? 'cursor-pointer hover:opacity-90 transition-opacity'
                  : ''
              }
              onClick={handleCityClick}
            />

            {/* 헥스 테두리 안쪽 얇은 inset 라인 (회색 도시=어두운 회색, 컬러 도시=흰색, 거의 안 보임) */}
            <polygon
              points={getHexPoints(x, y, HEX_SIZE - 7, isFlat)}
              fill="none"
              stroke={dynamicCityColors ? 'rgba(120,124,130,0.75)' : 'rgba(255,255,255,0.85)'}
              strokeWidth={0.15}
              style={{ pointerEvents: 'none' }}
            />

            {/* 면화 항구(Southern US): 헥스 변 안쪽으로 두꺼운 흰 테두리 — 바깥은 지도 외곽선과
                겹치므로 안쪽(inset)으로 그린다. 면화(흰 큐브) 배달 종착지 표시. */}
            {cottonPorts?.includes(city.id) && (
              <>
                <polygon
                  points={getHexPoints(x, y, HEX_SIZE - 5, isFlat)}
                  fill="none"
                  stroke="rgba(255,255,255,0.95)"
                  strokeWidth={7}
                  style={{ pointerEvents: 'none' }}
                />
                {/* 흰 테두리 안쪽 경계의 얇은 검은 라인 */}
                <polygon
                  points={getHexPoints(x, y, HEX_SIZE - 9, isFlat)}
                  fill="none"
                  stroke="#1a1a1a"
                  strokeWidth={1}
                  style={{ pointerEvents: 'none' }}
                />
              </>
            )}

            {/* 외국 터미널: 얇은 흰 띠 (비인터랙티브). */}
            {city.isTerminal && (
              <polygon
                points={getHexPoints(x, y, HEX_SIZE - 6, isFlat)}
                fill="none"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={2.5}
                style={{ pointerEvents: 'none' }}
              />
            )}

            {/* 라벨: 위·아래 흰/검 숫자 박스(맵별) + 헥스 좌우 끝까지 닿는 이름 띠 (공식 PDF 스타일).
                외국 터미널은 ✕, 주사위 번호 없는 도시(Berlin 등)는 이름만. */}
            {(() => {
              const dice = cityDiceNumber[city.id];
              // 신도시(도시화 타일): id가 타일 letter(A~H), name이 "New City X". 이름은 "NEW CITY",
              // 숫자 자리엔 letter를 표시한다.
              const isNewCityTile = city.name.startsWith('New City');
              const showName = true; // 모든 도시 이름 표시 (Berlin 등 보너스 도시 포함)
              const isBlack = isNewCityTile
                ? city.id >= 'E'  // 신도시 A~D = 흰 박스, E~H = 검은 박스
                : isCityNumberBoxBlack(city.id, city.color);
              const boxFill = isBlack ? '#1f1f1f' : '#ffffff';
              const numColor = isBlack ? '#ffffff' : '#1a1a1a';
              // flat=상하 평변 / pointy=상하 꼭짓점에 박스가 닿게
              const bw = HEX_SIZE * 0.56, bh = HEX_SIZE * 0.58 + (isFlat ? 0 : 6), rad = HEX_SIZE * 0.078;
              const numFs = HEX_SIZE * 0.43;
              const SERIF = "Georgia, 'Times New Roman', serif";
              const edge = isFlat ? SQRT3_2 * HEX_SIZE : HEX_SIZE;
              // 숫자 텍스트 y: flat=박스 중앙 / pointy=네모 부분 중앙(꼭짓점 안쪽)
              const tri = bw / 3.4641;
              const topNumY = isFlat ? y - edge + bh / 2 : y - edge + (tri + bh) / 2;
              const botNumY = isFlat ? y + edge - bh / 2 : y + edge - (tri + bh) / 2;
              // 이름 배경: 어두운 헥스는 밝은 회색 띠. 밝은 헥스(노랑·터미널)는 약간 어두운 회색.
              // 동적색(한국 회색 도시 #d2d6da)은 띠가 헥스보다 밝으면 끝이 묻혀 안 보이므로
              // 또렷이 어두운 회색으로 — Rust Belt(색 헥스+밝은 띠)와 같은 대비 확보.
              const lightHex = dynamicCityColors || city.color === 'yellow' || city.isTerminal;
              // 회색 헥스(한국 동적색 도시)는 또렷한 어두운 회색 띠로 대비 확보
              // (Berlin은 이제 일반 검은 도시로 렌더하므로 회색 취급 제외 — 검은 도시 기본 띠 사용)
              const grayHex = dynamicCityColors;
              const bandFill = grayHex ? '#b3b9c1' : lightHex ? '#dcdce0' : '#f3f3f3';
              const nameFs =
                Math.min(HEX_SIZE * 0.2, (2 * (HEX_SIZE - 3) - 22) / Math.max(1, city.name.length * 0.62)) * 0.8;
              return (
                <g style={{ pointerEvents: 'none' }}>
                  {(dice != null || isNewCityTile || city.isTerminal) && (() => {
                    // 일반 도시: 위아래 숫자. 신도시: 위아래 letter(A~H). 터미널: 위 ✕·아래 수용색 큐브.
                    const isLabelBox = dice != null || isNewCityTile; // 위아래 같은 라벨(숫자/letter)을 가진 박스
                    const lbl = dice != null ? String(dice) : isNewCityTile ? city.id : '✕';
                    const bf = isLabelBox ? boxFill : '#ffffff';
                    const nc = isLabelBox ? numColor : '#1a1a1a';
                    const nf = isLabelBox ? numFs : numFs * 0.85;
                    return (
                      <>
                        <path d={numberBoxPath(x, y, bw, bh, rad, isFlat, true)} fill={bf} />
                        <text x={x} y={topNumY} textAnchor="middle" dominantBaseline="central" fill={nc} fontSize={nf} fontWeight="700" fontFamily={SERIF}>{lbl}</text>
                        <path d={numberBoxPath(x, y, bw, bh, rad, isFlat, false)} fill={isLabelBox ? bf : CUBE_COLORS[city.color]} />
                        {isLabelBox && (
                          <text x={x} y={botNumY} textAnchor="middle" dominantBaseline="central" fill={nc} fontSize={nf} fontWeight="700" fontFamily={SERIF}>{lbl}</text>
                        )}
                      </>
                    );
                  })()}
                  {showName && (
                    <>
                      <polygon points={nameBandPoints(x, y, isFlat)} fill={bandFill} />
                      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#1a1a1a" fontSize={nameFs} fontWeight="600" letterSpacing="0.5" fontFamily={SERIF}>{isNewCityTile ? 'NEW CITY' : city.name.toUpperCase()}</text>
                    </>
                  )}
                </g>
              );
            })()}

            {/* 물품 큐브 (도시 하단 숫자 박스 가운데) */}
            <g>
              {city.cubes.map((cubeColor, i) => {
                const cubeEdge = isFlat ? SQRT3_2 * HEX_SIZE : HEX_SIZE;
                // 4개 이상은 2줄로 배치
                const n = city.cubes.length;
                const cols = n >= 4 ? Math.ceil(n / 2) : n;
                const row = Math.floor(i / cols);
                const colIdx = i % cols;
                const colsInRow = row === 0 ? cols : n - cols;
                const cubeX = x - ((colsInRow - 1) * 18) / 2 + colIdx * 18;
                // 일반 도시: 화물 상단 = 아래 박스 상단(2줄이면 아래로). 터미널: 아래 수용색 박스 정가운데.
                // pointy-top(꼭짓점 세로, 서부 US) 맵은 화물을 6px 위로 올려 헥스 안에 더 잘 들어오게.
                const cubeY = (city.isTerminal
                  ? y + cubeEdge - (HEX_SIZE * 0.58) / 2
                  : y + cubeEdge - HEX_SIZE * 0.58 + 4 + row * 15)
                  - (isFlat ? 0 : 6);
                const isSelected =
                  selectedCube?.cityId === city.id &&
                  selectedCube?.cubeIndex === i;

                const cubeSize = cubeRenderSize(cubeColor);
                return (
                  <rect
                    key={`cube-${city.id}-${i}`}
                    x={cubeX - cubeSize / 2}
                    y={cubeY - cubeSize / 2}
                    width={cubeSize}
                    height={cubeSize}
                    fill={CUBE_COLORS[cubeColor]}
                    stroke={isSelected ? '#ffffff' : cubeStrokeColor(cubeColor)}
                    strokeWidth={isSelected ? 2 : cubeStrokeWidth(cubeColor)}
                    rx="1"
                    className={
                      currentPhase === 'moveGoods'
                        ? 'cursor-pointer hover:opacity-80 transition-opacity'
                        : ''
                    }
                    onClick={() => onCubeClick(city.id, i)}
                  />
                );
              })}
            </g>
          </g>
        );
      })}

      {/* Germany 도시-도시 직결 링크 (Essen↔Düsseldorf $2) — 도시 위 레이어라야 클릭이 도시에 가로채이지 않음 */}
      {(directLinks ?? []).map((dl, i) => {
        const a = cities.find(c => c.id === dl.cityA);
        const b = cities.find(c => c.id === dl.cityB);
        if (!a || !b) return null;
        const pa = hexToPixel(a.coord.col, a.coord.row, undefined, undefined, undefined, isFlat);
        const pb = hexToPixel(b.coord.col, b.coord.row, undefined, undefined, undefined, isFlat);
        const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
        const buildable = currentPhase === 'buildTrack' && dl.owner === null;
        const ownerColor = dl.owner ? PLAYER_COLORS[players[dl.owner].color] : null;
        return (
          <g
            key={`directlink-${i}`}
            className={buildable ? 'cursor-pointer' : ''}
            onClick={() => buildable && buildDirectLink(dl.cityA, dl.cityB)}
          >
            <line
              x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
              stroke={ownerColor ?? '#d4a853'}
              strokeWidth={dl.owner ? 9 : 6}
              strokeDasharray={dl.owner ? undefined : '10 7'}
              strokeLinecap="round"
              opacity={dl.owner ? 0.95 : 0.85}
              style={{ pointerEvents: 'none' }}
            />
            {/* 클릭 히트영역(투명, 큰 원) — 건설 가능할 때만 */}
            {buildable && <circle cx={mx} cy={my} r="22" fill="transparent" />}
            <circle cx={mx} cy={my} r="14" fill={ownerColor ?? 'rgba(255,255,255,0.92)'} stroke="rgba(0,0,0,0.65)" strokeWidth="2" style={{ pointerEvents: 'none' }} />
            {!dl.owner && (
              <text x={mx} y={my + 5} textAnchor="middle" fill="#1a1a1a" fontSize="15" fontWeight="bold" fontFamily="system-ui, sans-serif" style={{ pointerEvents: 'none' }}>
                {dl.cost}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}
