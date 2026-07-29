'use client';

import { hexToPixel, getHexPoints, hexCoordsEqual, HEX_SIZE } from '@/utils/hexGrid';
import {
  CITY_COLORS,
  CUBE_COLORS,
  City,
  CityColor,
  DirectLink,
  FerryEdge,
  GamePhase,
  HexCoord,
  PLAYER_COLORS,
  PlayerId,
  PlayerState,
} from '@/types/game';
import { SQRT3_2, nameBandPoints, numberBoxPath, cubeRenderSize, cubeStrokeColor, cubeStrokeWidth, shadeColor, hexVertex } from './boardGeometry';

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
  /** Southern China 국유화 후보 직결 링크 — board.directLinks 인덱스 → 링크 id (GameBoard가 주입) */
  natDirectIndex?: Map<number, string>;
  /** 후보 직결 링크 클릭 → 국유화 */
  onNationalizeDirect?: (linkId: string) => void;
  players: Record<PlayerId, PlayerState>;
  currentPhase: GamePhase;
  isFlat: boolean;
  /** cityId → 물품 성장 주사위 번호 (달: "1/2" 같은 범위 문자열) */
  cityDiceNumber: Record<string, number | string>;
  /** 달(Moon): 이 도시가 현재 밤쪽인지 — 밤 도시는 고유색 대신 검은 도시로 렌더 (미지정 = 밤낮 없음) */
  isCityNight?: (city: City) => boolean;
  /** MapProfile.isCityNumberBoxBlack — 숫자 박스 흑/백 결정 */
  isCityNumberBoxBlack: (cityId: string, demandColor: string) => boolean;
  // ui 상태 (필요한 필드만)
  sourceHex: HexCoord | null;
  reachableDestinations: HexCoord[];
  /**
   * 화물 이동 가이드 표시 여부 (방 설정 AND 개인 토글 — GameBoard가 계산).
   * false면 목적지 골드 링만 숨긴다 — 클릭 판정(selectDestinationCity)은 그대로 살아
   * 가이드 없이도 수송이 가능하고, Repopulation 배치 골드 링은 가이드가 아니라 기능이라 유지.
   * 미지정(NewCityTileHex 등 reachableDestinations가 빈 재사용처)은 true.
   */
  showMoveGuide?: boolean;
  selectedCube: { cityId: string; cubeIndex: number } | null;
  // 액션 (store·부모 콜백)
  onHexClick: (coord: HexCoord) => void;
  /** Montréal Repopulation: 배치할 큐브가 선택된 상태 — 모든 도시를 배치 대상으로 하이라이트/클릭 */
  repopPlacing?: boolean;
  onRepopCityClick?: (cityId: string) => void;
  selectDestinationCity: (coord: HexCoord) => void;
  onCubeClick: (cityId: string, cubeIndex: number) => void;
  buildDirectLink: (cityA: string, cityB: string) => void;
  /** Southern China: 구매식 페리 변 (서안 헥스 ↔ Hong Kong) — 직결 링크와 같은 표현/클릭 */
  ferryEdges?: FerryEdge[];
  buildFerryEdge?: (ferryId: string) => void;
  /** Southern China: 전색 수용 도시(홍콩) 폐쇄 여부 — 폐쇄되면 5색 부채꼴 대신 회색 */
  allAcceptClosed?: boolean;
}

export default function BoardCities({
  cities,
  dynamicCityColors,
  cottonPorts,
  directLinks,
  natDirectIndex,
  onNationalizeDirect,
  players,
  currentPhase,
  isFlat,
  cityDiceNumber,
  isCityNight,
  isCityNumberBoxBlack,
  sourceHex,
  reachableDestinations,
  showMoveGuide = true,
  selectedCube,
  onHexClick,
  selectDestinationCity,
  onCubeClick,
  buildDirectLink,
  ferryEdges,
  buildFerryEdge,
  allAcceptClosed,
  repopPlacing,
  onRepopCityClick,
}: BoardCitiesProps) {
  return (
    <>
      {/* 직결 링크/페리 선 — 도시 헥스·이름 밴드 **아래** 레이어. 도시 위를 지나는 구간은
          도시 헥스에 가려져 "변에서 변으로" 이어진 것처럼 보이고, 이름 밴드를 덮지 않는다
          (2026-07-27 사용자 이슈: 철로 선·비용 원이 도시 이름을 가림). 클릭 요소는 아래
          별도 레이어(도시 위)에 있다. */}
      {(directLinks ?? []).map((dl, i) => {
        const a = cities.find(c => c.id === dl.cityA);
        const b = cities.find(c => c.id === dl.cityB);
        if (!a || !b) return null;
        const pa = hexToPixel(a.coord.col, a.coord.row, undefined, undefined, undefined, isFlat);
        const pb = hexToPixel(b.coord.col, b.coord.row, undefined, undefined, undefined, isFlat);
        const ownerColor = dl.owner ? PLAYER_COLORS[players[dl.owner].color] : null;
        // faces(비인접 페리 — GZ SE면↔HK W면): 각 도시 헥스의 지정 변 중점끼리 직선.
        // 미지정(인접 쌍)은 중심-중심 직선 — 두 도시 헥스에 완전히 가려져 보이지 않는다(의도).
        const edgeMid = (p: { x: number; y: number }, e: number) => {
          const v1 = hexVertex(p.x, p.y, e, isFlat);
          const v2 = hexVertex(p.x, p.y, (e + 1) % 6, isFlat);
          return { x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 };
        };
        const s = dl.faces ? edgeMid(pa, dl.faces[0]) : pa;
        const t = dl.faces ? edgeMid(pb, dl.faces[1]) : pb;
        // 국유화 직결 링크: 중립 다크 그레이 실선 (정부/국유화 트랙 톤 #4E4D46)
        const built = dl.owner !== null || dl.isNationalized;
        return (
          <path
            key={`directlink-line-${i}`}
            d={`M ${s.x} ${s.y} L ${t.x} ${t.y}`}
            fill="none"
            stroke={dl.isNationalized ? '#4E4D46' : (ownerColor ?? '#d4a853')}
            strokeWidth={built ? 9 : 6}
            strokeDasharray={built ? undefined : '10 7'}
            strokeLinecap="round"
            opacity={built ? 0.95 : 0.85}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}
      {(ferryEdges ?? []).map((f) => {
        const pa = hexToPixel(f.a.coord.col, f.a.coord.row, undefined, undefined, undefined, isFlat);
        const pb = hexToPixel(f.b.coord.col, f.b.coord.row, undefined, undefined, undefined, isFlat);
        const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2 + 26;
        const ownerColor = f.owner ? PLAYER_COLORS[players[f.owner].color] : null;
        return (
          <path
            key={`ferry-line-${f.id}`}
            d={`M ${pa.x} ${pa.y} Q ${mx} ${my + 30} ${pb.x} ${pb.y}`}
            fill="none"
            stroke={ownerColor ?? '#5bbcac'}
            strokeWidth={f.owner ? 8 : 5}
            strokeDasharray={f.owner ? undefined : '9 7'}
            strokeLinecap="round"
            opacity={0.9}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

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
        // 달(Moon): Moon Base는 색·수요 없는 흰 헥스. 밤쪽 도시는 검은 도시 취급이지만
        // 순검정 대신 "원래 색에 어두운 필터"(-62%)로 렌더 — 원래 색을 식별하면서 밤 상태 표현
        // (다음 턴 낮이 됐을 때의 수요색을 계획할 수 있게, 2026-07-21 사용자 피드백)
        const MOON_BASE_WHITE = '#f5f4ef';
        const night = !city.noDemand && !!isCityNight?.(city);
        const cityColor = city.isTerminal
          ? TERMINAL_GREEN
          : city.noDemand
          ? MOON_BASE_WHITE
          : night
          ? shadeColor(goodsColor, -62)
          : dynamicCityColors
          ? DYNAMIC_CITY_GRAY
          : goodsColor; // Berlin(보너스 도시)도 데이터 색(black) 그대로 — 다른 검은 도시와 동일
        const isSourceSelected = sourceHex && hexCoordsEqual(sourceHex, city.coord);
        // governmentLink(Montréal 정부 링크)도 도시에서 건설을 시작한다
        const isCityClickable = currentPhase === 'buildTrack' || currentPhase === 'governmentLink'
          // Montréal Repopulation: 큐브 선택 후엔 모든 도시가 배치 대상
          || !!repopPlacing;
        const isReachableDestination = reachableDestinations.some(
          d => hexCoordsEqual(d, city.coord)
        )
          // Repopulation 배치 중엔 모든 도시를 골드 링으로 표시
          || !!repopPlacing;
        // 골드 링 표시 — 가이드 off면 배달 목적지 링만 숨김 (Repopulation 링은 기능이라 유지,
        // 클릭 판정은 isReachableDestination 그대로 — 가이드 없이도 수송 가능)
        const showDestRing = (showMoveGuide && isReachableDestination) || !!repopPlacing;
        const isMoveGoodsPhase = currentPhase === 'moveGoods';

        // 도시 클릭 핸들러
        const handleCityClick = () => {
          if (repopPlacing && onRepopCityClick) {
            onRepopCityClick(city.id);
          } else if (currentPhase === 'buildTrack' || currentPhase === 'governmentLink') {
            onHexClick(city.coord);
          } else if (isMoveGoodsPhase && isReachableDestination) {
            selectDestinationCity(city.coord);
          }
        };

        // 전색 수용 도시(Southern China 홍콩): 원본 시트대로 **회색 헥스**로 두고, "모든 색을
        // 받는다"는 숫자 박스의 색 분할(상 red·blue / 하 yellow·purple·black)로만 표현한다.
        // 기각된 시도들: 5색 채움·동심 링 테두리·방사형 부채꼴(이름 밴드/숫자와 경쟁해 어수선),
        // 헥스 바깥 우하단 원 그래프(위치를 여러 번 조정해도 겉돌아 2026-07-27 사용자 요청으로 제거).
        const allColorCity = !!city.acceptsAllColors;
        // 폐쇄(마지막 2턴)되면 색 분할이 사라지고 헥스가 짙은 회색 + 빨간 테두리 — 색이
        // "없어진" 것은 비교 대상이 없으면 못 알아채므로, 테두리로 명시적 신호를 남긴다.
        const allColorClosed = allColorCity && !!allAcceptClosed;

        return (
          <g key={`city-${city.id}`}>
            {/* 도시 헥사곤 (검은 테두리 0.5px) */}
            <polygon
              points={getHexPoints(x, y, HEX_SIZE, isFlat)}
              // 전색 수용 도시(홍콩)는 원본 시트대로 회색 — 수용 색은 숫자 박스 분할로 표시
              // (폐쇄 시 더 짙은 회색으로 "이제 안 받음"을 구분)
              fill={allColorClosed ? '#9aa0a6' : allColorCity ? '#d2d6da' : cityColor}
              stroke={
                showDestRing
                  ? '#e6c77a'  // 골드 악센트 (accent-light)
                  : isSourceSelected
                  ? '#ffffff'
                  : allColorClosed
                  ? '#c0392b'  // 폐쇄된 전색 도시(홍콩 마지막 2턴) — 빨간 테두리로 명시
                  : '#1a1a1a'  // 터미널 수용색은 아래 안쪽 폴리곤으로 별도 표시
              }
              strokeWidth={allColorClosed ? 2.5 : 0.5}
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
              stroke={dynamicCityColors || city.noDemand ? 'rgba(120,124,130,0.75)' : 'rgba(255,255,255,0.85)'}
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
              const lightHex = dynamicCityColors || city.noDemand || (city.color === 'yellow' && !night) || city.isTerminal;
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
                    // 달 "1/2" 같은 범위 라벨은 박스 폭에 맞게 축소
                    const nf = (isLabelBox ? numFs : numFs * 0.85) * (lbl.length > 1 ? 0.66 : 1);
                    // 전색 수용 도시(홍콩): 숫자 박스를 화물색으로 분할 — 위 2색·아래 3색으로
                    // 다섯 색을 나눠 담아 "모든 색을 받는다"를 도시 안에서 표현 (사용자 요청).
                    // 폐쇄(마지막 2턴)면 색을 잃고 원래 박스색으로 돌아간다.
                    const splitTop = allColorCity && !allColorClosed ? (['red', 'blue'] as const) : null;
                    const splitBot = allColorCity && !allColorClosed ? (['yellow', 'purple', 'black'] as const) : null;
                    /** 박스를 **세로 줄**로 n등분해 색을 칠한다 (박스 path로 클리핑).
                     *  ⚠️ 띠의 세로 범위는 헥스 전체로 잡고 클리핑에 맡긴다 — 텍스트 y(topNumY/
                     *  botNumY) 기준으로 잡으면 numberBoxPath의 실제 박스 영역과 어긋나 박스
                     *  일부가 안 칠해진다 (2026-07-27 사용자 발견). 가로도 여유를 둬 모서리까지 덮음. */
                    const splitBox = (colors: readonly CityColor[], isTop: boolean) => {
                      const clipId = `numbox-clip-${city.id}-${isTop ? 't' : 'b'}`;
                      const w = bw / colors.length;
                      return (
                        <>
                          <clipPath id={clipId}>
                            <path d={numberBoxPath(x, y, bw, bh, rad, isFlat, isTop)} />
                          </clipPath>
                          <g clipPath={`url(#${clipId})`}>
                            {colors.map((c, ci) => (
                              <rect
                                key={`${clipId}-${ci}`}
                                x={x - bw / 2 + ci * w}
                                y={y - HEX_SIZE * 1.2}
                                width={ci === colors.length - 1 ? w + 2 : w}
                                height={HEX_SIZE * 2.4}
                                fill={CITY_COLORS[c]}
                              />
                            ))}
                          </g>
                        </>
                      );
                    };
                    return (
                      <>
                        <path d={numberBoxPath(x, y, bw, bh, rad, isFlat, true)} fill={bf} />
                        {splitTop && splitBox(splitTop, true)}
                        <text x={x} y={topNumY} textAnchor="middle" dominantBaseline="central" fill={splitTop ? '#ffffff' : nc} fontSize={nf} fontWeight="700" fontFamily={SERIF}
                          stroke={splitTop ? 'rgba(0,0,0,0.55)' : undefined} strokeWidth={splitTop ? 2.5 : undefined} paintOrder="stroke">{lbl}</text>
                        <path d={numberBoxPath(x, y, bw, bh, rad, isFlat, false)} fill={isLabelBox ? bf : CUBE_COLORS[city.color]} />
                        {splitBot && splitBox(splitBot, false)}
                        {isLabelBox && (
                          <text x={x} y={botNumY} textAnchor="middle" dominantBaseline="central" fill={splitBot ? '#ffffff' : nc} fontSize={nf} fontWeight="700" fontFamily={SERIF}
                            stroke={splitBot ? 'rgba(0,0,0,0.55)' : undefined} strokeWidth={splitBot ? 2.5 : undefined} paintOrder="stroke">{lbl}</text>
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

      {/* 직결 링크 구매/소유 마커 — 도시 위 레이어 (클릭이 도시에 가로채이지 않음).
          인접 쌍(인터어반·Germany 직결)은 원본 시트처럼 공유 변 위 "점선 원 + 비용"만 —
          속이 비쳐 이름 밴드를 가리지 않는다. via 쌍(GZ↔HK 페리)은 경유점(바다)에 원. */}
      {(directLinks ?? []).map((dl, i) => {
        const a = cities.find(c => c.id === dl.cityA);
        const b = cities.find(c => c.id === dl.cityB);
        if (!a || !b) return null;
        const pa = hexToPixel(a.coord.col, a.coord.row, undefined, undefined, undefined, isFlat);
        const pb = hexToPixel(b.coord.col, b.coord.row, undefined, undefined, undefined, isFlat);
        // 마커 위치: faces 쌍은 두 면 중점을 이은 직선의 가운데(바다 위), 인접 쌍은 공유 변
        const edgeMidM = (p: { x: number; y: number }, e: number) => {
          const v1 = hexVertex(p.x, p.y, e, isFlat);
          const v2 = hexVertex(p.x, p.y, (e + 1) % 6, isFlat);
          return { x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 };
        };
        const ms = dl.faces ? edgeMidM(pa, dl.faces[0]) : pa;
        const mt = dl.faces ? edgeMidM(pb, dl.faces[1]) : pb;
        const mx = (ms.x + mt.x) / 2;
        // 마커 y: 인접 쌍은 두 중심의 중점 = 공유 변 중점. 단 **가로 인접**(같은 행)은 그 지점이
        // 도시 이름 밴드와 정확히 겹치므로 밴드 아래로 내린다. 대각 인접(선전↔홍콩)·faces(페리)에
        // 같은 보정을 걸면 마커가 상대 도시 헥스 안으로 밀려 들어간다 (2026-07-27 사용자 발견).
        const sameRowAdjacent = !dl.faces && Math.abs(pa.y - pb.y) < 1;
        const my = (ms.y + mt.y) / 2 + (sameRowAdjacent ? 26 : 0);
        const buildable = currentPhase === 'buildTrack' && dl.owner === null && !dl.isNationalized;
        const ownerColor = dl.owner ? PLAYER_COLORS[players[dl.owner].color] : null;
        // 국유화 직결: 중립 그레이 디스크 (인접 쌍은 선이 도시에 가려 보이지 않으므로 마커가 유일한 표시)
        if (dl.isNationalized) {
          return (
            <circle
              key={`directlink-${i}`}
              cx={mx} cy={my} r="10"
              fill="#4E4D46" stroke="#ffffff" strokeWidth="2.5"
              style={{ pointerEvents: 'none' }}
            />
          );
        }
        // 국유화 후보(내 직결 링크) — 깜빡이는 링 + 클릭으로 국유화.
        // 타일 링크와 달리 trackTiles가 비어 있어 좌표 인덱스로는 잡히지 않으므로
        // directLinks 인덱스로 판정한다 (GameBoard natDirectIndex).
        const natLinkId = natDirectIndex?.get(i);
        const isNatTarget = !!natLinkId && dl.owner !== null;
        return (
          <g
            key={`directlink-${i}`}
            className={buildable || isNatTarget ? 'cursor-pointer' : ''}
            onClick={() => {
              if (isNatTarget) { onNationalizeDirect?.(natLinkId!); return; }
              if (buildable) buildDirectLink(dl.cityA, dl.cityB);
            }}
          >
            {(buildable || isNatTarget) && <circle cx={mx} cy={my} r="22" fill="transparent" />}
            {isNatTarget && (
              <circle cx={mx} cy={my} r="16" fill="none" stroke="#c04a2b" strokeWidth="3">
                <animate attributeName="stroke-opacity" values="1;0.25;1" dur="1.1s" repeatCount="indefinite" />
              </circle>
            )}
            {dl.owner ? (
              // 건설됨: 소유색 디스크 (흰 테두리 — 도시색/바다 어느 배경에서도 식별)
              <circle
                cx={mx} cy={my} r="10"
                fill={ownerColor!} stroke="#ffffff" strokeWidth="2.5"
                style={{ pointerEvents: 'none' }}
              />
            ) : (
              <>
                {/* 미건설: 흰 원 + 검은 숫자 — 반투명 점선 원은 도시색·철도 위에서 묻혀
                    잘 안 보였다 (2026-07-27 사용자 피드백). 불투명 흰 배경으로 대비 확보. */}
                <circle
                  cx={mx} cy={my} r="14"
                  fill="#ffffff" stroke="#1a1a1a" strokeWidth="2"
                  style={{ pointerEvents: 'none' }}
                />
                <text
                  x={mx} y={my + 5} textAnchor="middle" fill="#1a1a1a" fontSize="15" fontWeight="bold"
                  fontFamily="system-ui, sans-serif"
                  style={{ pointerEvents: 'none' }}
                >
                  {dl.cost}
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* Southern China 페리 변 (서안 헥스 ↔ Hong Kong) 구매 마커 — 선은 위 언더레이 */}
      {(ferryEdges ?? []).map((f) => {
        const pa = hexToPixel(f.a.coord.col, f.a.coord.row, undefined, undefined, undefined, isFlat);
        const pb = hexToPixel(f.b.coord.col, f.b.coord.row, undefined, undefined, undefined, isFlat);
        const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2 + 26;
        const buildable = currentPhase === 'buildTrack' && f.owner === null;
        const ownerColor = f.owner ? PLAYER_COLORS[players[f.owner].color] : null;
        return (
          <g
            key={`ferry-${f.id}`}
            className={buildable ? 'cursor-pointer' : ''}
            onClick={() => buildable && buildFerryEdge?.(f.id)}
          >
            {buildable && <circle cx={mx} cy={my + 20} r="22" fill="transparent" />}
            <circle cx={mx} cy={my + 20} r="14" fill={ownerColor ?? 'rgba(255,255,255,0.92)'} stroke="rgba(0,0,0,0.65)" strokeWidth="2" style={{ pointerEvents: 'none' }} />
            {!f.owner && (
              <text x={mx} y={my + 25} textAnchor="middle" fill="#1a1a1a" fontSize="15" fontWeight="bold" fontFamily="system-ui, sans-serif" style={{ pointerEvents: 'none' }}>
                {f.cost}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}
