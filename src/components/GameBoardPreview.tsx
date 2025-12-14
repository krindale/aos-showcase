'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';

// 헥스 그리드 설정 (pointy-top 헥사곤) - 7x5 그리드
const HEX_SIZE = 55;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;
const BOARD_COLS = 7;
const BOARD_ROWS = 5;
const START_COL = 1;  // 시작 열 (0열은 비어있으므로 1부터 시작)
// 헥스 중심에서 좌우/상하 끝까지 거리
const HEX_HORIZONTAL_RADIUS = Math.cos(Math.PI / 6) * HEX_SIZE;  // cos 30° * HEX_SIZE
const HEX_VERTICAL_RADIUS = HEX_SIZE;  // pointy-top 헥스는 위아래 꼭지점이 HEX_SIZE 거리
const MARGIN = 50;
const PADDING_X = MARGIN + HEX_HORIZONTAL_RADIUS;  // 헥스가 마진 안에 완전히 들어오도록
const PADDING_Y = MARGIN + HEX_VERTICAL_RADIUS;    // 상하도 동일하게

// 도시 데이터 (7x5 그리드, 0-indexed) - 선명한 색상, 각 도시 2개 화물
const CITIES = [
  { id: 'P', name: 'Pittsburgh', col: 1, row: 0, color: '#E53935', cubes: ['#FFB300', '#AB47BC'] },
  { id: 'C', name: 'Cleveland', col: 5, row: 0, color: '#1E88E5', cubes: ['#AB47BC', '#E53935'] },
  { id: 'O', name: 'Columbus', col: 3, row: 2, color: '#FFB300', cubes: ['#E53935', '#1E88E5'] },
  { id: 'W', name: 'Wheeling', col: 5, row: 3, color: '#546E7A', cubes: ['#E53935', '#AB47BC'] },
  { id: 'I', name: 'Cincinnati', col: 1, row: 4, color: '#AB47BC', cubes: ['#FFB300', '#1E88E5'] },
];

// 호수 타일 (col:6)
const LAKE_TILES = [
  { col: 6, row: 0 }, { col: 6, row: 1 },
  { col: 6, row: 2 }, { col: 6, row: 3 },
];

// 철도 타일 인터페이스 - 헥스 내 엣지 연결
interface TrackTile {
  col: number;
  row: number;
  edges: [number, number];  // 연결할 두 엣지 번호 (0-5)
  ownerColor: string;
}

// 철도 타일 데이터 - 수정된 엣지 번호
// 포인티탑 헥스 엣지 번호 (getEdgeMidpoint 기준, SVG y+=down):
//         Edge 5    Edge 4
//     (UPPER-RIGHT) (UPPER-LEFT)
//            \      /
//             \    /
//     Edge 0 ──────── Edge 3
//     (RIGHT)         (LEFT)
//             /    \
//            /      \
//         Edge 1    Edge 2
//     (LOWER-RIGHT) (LOWER-LEFT)
//
// 직선: [3,0]=좌우, [4,1]=좌상↔우하(NW↔SE), [5,2]=우상↔좌하(NE↔SW)
//
// Odd-r offset 이웃 계산:
// Even row: edge1(SE)→(col, row+1), edge4(NW)→(col-1, row-1)
// Odd row:  edge1(SE)→(col+1, row+1), edge4(NW)→(col, row-1)
const TRACK_TILES: TrackTile[] = [
  // ===== Row 0: Yellow - Pittsburgh → Cleveland (수평) =====
  { col: 2, row: 0, edges: [3, 0], ownerColor: '#FFD600' },  // 수평 - 선명한 노랑
  { col: 3, row: 0, edges: [3, 0], ownerColor: '#FFD600' },  // 수평
  { col: 4, row: 0, edges: [3, 0], ownerColor: '#FFD600' },  // 수평

  // ===== Purple Route: Pittsburgh → Cincinnati (수직) =====
  // Pittsburgh(1,0) even, edge1(SE) → (1,1)
  // (1,1) odd, edge4(NW) → Pittsburgh, edge2(SW) → (1,2)
  { col: 1, row: 1, edges: [4, 2], ownerColor: '#9C27B0' },  // purple: 선명한 보라
  // (1,2) even, edge5(NE) → (1,1), edge1(SE) → (1,3)
  { col: 1, row: 2, edges: [5, 1], ownerColor: '#9C27B0' },  // purple
  // (1,3) odd, edge4(NW) → (1,2), edge2(SW) → Cincinnati(1,4)
  { col: 1, row: 3, edges: [4, 2], ownerColor: '#9C27B0' },  // purple

  // ===== White Route: Columbus → Cleveland =====
  // Columbus(3,2) even, edge5(NE) → (3,1)
  // (3,1) odd, edge2(SW) → Columbus, edge0(E) → (4,1)
  { col: 3, row: 1, edges: [2, 0], ownerColor: '#FFFFFF' },  // white: 순백색
  // (4,1) odd, edge3(W) → (3,1), edge0(E) → (5,1)
  { col: 4, row: 1, edges: [3, 0], ownerColor: '#FFFFFF' },  // white
  // (5,1) odd, edge3(W) → (4,1), edge4(NW) → Cleveland(5,0)
  { col: 5, row: 1, edges: [3, 4], ownerColor: '#FFFFFF' },  // white

  // ===== Red Route: Columbus → Wheeling =====
  // Columbus(3,2) even, edge1(SE) → (3,3)
  { col: 3, row: 3, edges: [4, 0], ownerColor: '#F44336' },  // red: 선명한 빨강
  { col: 4, row: 3, edges: [3, 0], ownerColor: '#F44336' },  // red

  // ===== Green Route: Cincinnati → Columbus =====
  // Cincinnati(1,4) even, edge0(E) → (2,4)
  { col: 2, row: 4, edges: [3, 5], ownerColor: '#4CAF50' },  // green: 선명한 초록
  // (2,3) odd, edge2(SW) → (2,4), edge5(NE) → Columbus(3,2)
  { col: 2, row: 3, edges: [2, 5], ownerColor: '#4CAF50' },  // green
];

// pointy-top 헥스 좌표 계산 (odd-r offset: 홀수 행 우측 이동)
function hexToPixel(col: number, row: number): { x: number; y: number } {
  const offset = row % 2 === 1 ? HEX_WIDTH / 2 : 0;
  const x = (col - START_COL) * HEX_WIDTH + offset + PADDING_X;
  const y = row * HEX_HEIGHT * 0.75 + PADDING_Y;
  return { x, y };
}

// pointy-top 헥스 꼭지점 계산
function getHexPoints(cx: number, cy: number, size: number): string {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return points.join(' ');
}

// 헥스 엣지의 중점 좌표 계산 (엣지 경계까지 연장)
function getEdgeMidpoint(cx: number, cy: number, edge: number, size: number): { x: number; y: number } {
  // 엣지를 이루는 두 꼭지점의 각도
  const angle1 = (Math.PI / 3) * edge - Math.PI / 6;
  const angle2 = (Math.PI / 3) * ((edge + 1) % 6) - Math.PI / 6;
  // 두 꼭지점의 중점 (엣지 경계까지 완전히 연장)
  return {
    x: cx + size * (Math.cos(angle1) + Math.cos(angle2)) / 2,
    y: cy + size * (Math.sin(angle1) + Math.sin(angle2)) / 2,
  };
}

// 두 엣지를 연결하는 트랙 경로 생성
function getTrackPath(cx: number, cy: number, edge1: number, edge2: number, size: number): string {
  const p1 = getEdgeMidpoint(cx, cy, edge1, size);
  const p2 = getEdgeMidpoint(cx, cy, edge2, size);

  // 엣지 간 거리 계산 (0-3)
  const diff = Math.abs(edge1 - edge2);
  const edgeDist = Math.min(diff, 6 - diff);

  if (edgeDist === 3) {
    // 직선 트랙 (반대편 엣지) - 중앙 통과하지 않고 직선 연결
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
  } else {
    // 커브 트랙 (인접 또는 2칸 떨어진 엣지) - 중앙을 통과하는 베지어 곡선
    return `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`;
  }
}

// 1링크 이동 애니메이션 데이터
const DELIVERY_ANIMATIONS = [
  {
    id: 1,
    name: 'Cleveland → Pittsburgh',
    description: '빨간 큐브를 빨간 도시로 배달',
    cubeColor: '#E53935',  // 빨간 큐브
    routeColor: '#FFD600', // Yellow route
    routeOwner: 'Yellow',
    sourceCityId: 'C',     // Cleveland
    cubeIndex: 1,          // 두 번째 큐브 (빨간색)
    // 경로: Cleveland(5,0) → (4,0) → (3,0) → (2,0) → Pittsburgh(1,0)
    waypoints: [
      { col: 5, row: 0 },  // Cleveland
      { col: 4, row: 0 },
      { col: 3, row: 0 },
      { col: 2, row: 0 },
      { col: 1, row: 0 },  // Pittsburgh
    ],
  },
  {
    id: 2,
    name: 'Columbus → Cleveland',
    description: '파란 큐브를 파란 도시로 배달',
    cubeColor: '#1E88E5',  // 파란 큐브
    routeColor: '#FFFFFF', // White route
    routeOwner: 'White',
    sourceCityId: 'O',     // Columbus
    cubeIndex: 1,          // 두 번째 큐브 (파란색)
    // 경로: Columbus(3,2) → (3,1) → (4,1) → (5,1) → Cleveland(5,0)
    waypoints: [
      { col: 3, row: 2 },  // Columbus
      { col: 3, row: 1 },
      { col: 4, row: 1 },
      { col: 5, row: 1 },
      { col: 5, row: 0 },  // Cleveland
    ],
  },
  {
    id: 3,
    name: 'Cincinnati → Columbus',
    description: '노란 큐브를 노란 도시로 배달',
    cubeColor: '#FFB300',  // 노란 큐브
    routeColor: '#4CAF50', // Green route
    routeOwner: 'Green',
    sourceCityId: 'I',     // Cincinnati
    cubeIndex: 0,          // 첫 번째 큐브 (노란색)
    // 경로: Cincinnati(1,4) → (2,4) → (2,3) → Columbus(3,2)
    waypoints: [
      { col: 1, row: 4 },  // Cincinnati
      { col: 2, row: 4 },
      { col: 2, row: 3 },
      { col: 3, row: 2 },  // Columbus
    ],
  },
];

export default function GameBoardPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const [showRoute, setShowRoute] = useState(false);
  const [currentDelivery, setCurrentDelivery] = useState(0);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [showIncome, setShowIncome] = useState(false);

  // 콘텐츠 너비: 5.5 * HEX_WIDTH (col 1~6, odd row offset 포함) + 양쪽 마진
  const boardWidth = 5.5 * HEX_WIDTH + MARGIN * 2 + HEX_HORIZONTAL_RADIUS * 2;
  // 콘텐츠 높이: (BOARD_ROWS - 1) * 0.75 * HEX_HEIGHT + 양쪽 마진
  const boardHeight = (BOARD_ROWS - 1) * HEX_HEIGHT * 0.75 + MARGIN * 2 + HEX_VERTICAL_RADIUS * 2;

  // 현재 배달 정보
  const delivery = DELIVERY_ANIMATIONS[currentDelivery];

  useEffect(() => {
    if (isInView) {
      const timer = setTimeout(() => setShowRoute(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isInView]);

  // 애니메이션 사이클
  useEffect(() => {
    if (!showRoute) return;

    const animationDuration = 3000; // 3초 동안 이동
    const pauseDuration = 2000; // 2초 대기
    const totalCycle = animationDuration + pauseDuration;

    const interval = setInterval(() => {
      setAnimationProgress(0);
      setShowIncome(false);

      // 애니메이션 진행
      const startTime = Date.now();
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);
        setAnimationProgress(progress);

        if (progress >= 1) {
          setShowIncome(true);
        }

        if (elapsed < animationDuration) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    }, totalCycle);

    // 배달 순환
    const deliveryInterval = setInterval(() => {
      setCurrentDelivery((prev) => (prev + 1) % DELIVERY_ANIMATIONS.length);
    }, totalCycle);

    // 초기 애니메이션 시작
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);
      setAnimationProgress(progress);

      if (progress >= 1) {
        setShowIncome(true);
      }

      if (elapsed < animationDuration) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);

    return () => {
      clearInterval(interval);
      clearInterval(deliveryInterval);
    };
  }, [showRoute]);

  // 현재 기차 위치 계산
  const getTrainPosition = () => {
    const waypoints = delivery.waypoints;
    const totalSegments = waypoints.length - 1;
    const currentSegment = Math.min(Math.floor(animationProgress * totalSegments), totalSegments - 1);
    const segmentProgress = (animationProgress * totalSegments) - currentSegment;

    const from = hexToPixel(waypoints[currentSegment].col, waypoints[currentSegment].row);
    const to = hexToPixel(waypoints[Math.min(currentSegment + 1, waypoints.length - 1)].col, waypoints[Math.min(currentSegment + 1, waypoints.length - 1)].row);

    return {
      x: from.x + (to.x - from.x) * segmentProgress,
      y: from.y + (to.y - from.y) * segmentProgress,
    };
  };

  const trainPos = getTrainPosition();

  return (
    <section ref={ref} className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-[#1a1a1f]" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="text-accent text-sm tracking-widest uppercase mb-4 block">
            Game Preview
          </span>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-6">
            Rust Belt 맵
          </h2>
          <p className="text-foreground-secondary max-w-2xl mx-auto text-lg">
            미국 중서부와 동부를 연결하는 철도 네트워크를 구축하세요.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="flex justify-center"
        >
          <div
            className="rounded-xl overflow-hidden border border-[#3d4f3d]"
            style={{ backgroundColor: '#2e3d2e' }}
          >
            {/* Route Header - 동적 배달 정보 (고정 높이) */}
            <div className="h-16 flex flex-col justify-center">
              <AnimatePresence mode="wait">
                {showRoute && (
                  <motion.div
                    key={currentDelivery}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-center"
                  >
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-[#d4a853] font-medium text-sm">
                        {delivery.name}
                      </span>
                      <span className="text-xs text-gray-400">|</span>
                      <span className="text-xs text-gray-400">
                        {delivery.description}
                      </span>
                      <span className="text-xs text-gray-400">|</span>
                      <div className="flex items-center gap-1">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: delivery.routeColor, border: delivery.routeColor === '#FFFFFF' ? '1px solid #888' : 'none' }}
                        />
                        <span className="text-xs text-gray-400">{delivery.routeOwner} 루트</span>
                      </div>
                    </div>
                    <div className="h-5 mt-1">
                      {showIncome && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="text-xs text-green-400 font-medium"
                        >
                          ✓ 배달 완료! {delivery.routeOwner} 수입 +1
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <svg
              width={boardWidth}
              height={boardHeight}
              viewBox={`0 0 ${boardWidth} ${boardHeight}`}
            >
              {/* 배경 헥스 그리드 */}
              {[...Array(BOARD_ROWS)].map((_, row) =>
                [...Array(BOARD_COLS - START_COL)].map((_, colIndex) => {
                  const col = colIndex + START_COL;
                  const { x, y } = hexToPixel(col, row);
                  const isLake = LAKE_TILES.some(l => l.col === col && l.row === row);
                  const isCity = CITIES.some(c => c.col === col && c.row === row);

                  if (isCity) return null;

                  return (
                    <polygon
                      key={`hex-${col}-${row}`}
                      points={getHexPoints(x, y, HEX_SIZE - 2)}
                      fill={isLake ? '#5C9EBF' : '#4A7A4A'}
                      stroke={isLake ? '#4A8CAD' : '#3A6A3A'}
                      strokeWidth="2"
                    />
                  );
                })
              )}

              {/* 철도 타일 (헥스 내 엣지 연결) */}
              {TRACK_TILES.map((tile, index) => {
                const { x, y } = hexToPixel(tile.col, tile.row);
                const pathData = getTrackPath(x, y, tile.edges[0], tile.edges[1], HEX_SIZE - 2);

                return (
                  <g key={`track-tile-${index}`}>
                    {/* 트랙 배경 (침목) */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke="#2A2A2A"
                      strokeWidth="14"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* 레일 */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke="#4A4A3A"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* 침목 패턴 (점선) */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke="#2A2A2A"
                      strokeWidth="12"
                      strokeLinecap="butt"
                      strokeLinejoin="round"
                      strokeDasharray="4 8"
                    />
                    {/* 소유자 마커 (헥스 중앙) */}
                    <circle
                      cx={x}
                      cy={y}
                      r="8"
                      fill={tile.ownerColor}
                      stroke="#1a1a1a"
                      strokeWidth="2"
                    />
                  </g>
                );
              })}

              {/* 도시 */}
              {CITIES.map((city) => {
                const { x, y } = hexToPixel(city.col, city.row);
                const textColor = '#ffffff';

                return (
                  <g key={`city-${city.id}`}>
                    {/* 도시 헥사곤 */}
                    <polygon
                      points={getHexPoints(x, y, HEX_SIZE - 2)}
                      fill={city.color}
                      stroke="rgba(255,255,255,0.2)"
                      strokeWidth="2"
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
                      fill={textColor}
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
                      fill={textColor}
                      fontSize="12"
                      fontWeight="600"
                      fontFamily="system-ui, sans-serif"
                    >
                      {city.name}
                    </text>

                    {/* 물품 큐브 - 운반 중인 큐브는 숨김 */}
                    <g>
                      {city.cubes.map((cubeColor, i) => {
                        // 현재 운반 중인 큐브인지 확인 (애니메이션 진행 중이고 도착 전)
                        const isBeingTransported =
                          showRoute &&
                          animationProgress < 1 &&
                          city.id === delivery.sourceCityId &&
                          i === delivery.cubeIndex;

                        if (isBeingTransported) return null;

                        const cubeX = x - ((city.cubes.length - 1) * 16) / 2 + i * 16;
                        const cubeY = y + 32;
                        return (
                          <rect
                            key={`cube-${city.id}-${i}`}
                            x={cubeX - 5}
                            y={cubeY - 5}
                            width="10"
                            height="10"
                            fill={cubeColor}
                            stroke="rgba(0,0,0,0.4)"
                            strokeWidth="1"
                            rx="1"
                          />
                        );
                      })}
                    </g>
                  </g>
                );
              })}

              {/* 기차 아이콘 - 도시 위에 렌더링 (z-index 최상위), 도착 시 사라짐 */}
              {showRoute && animationProgress < 1 && (
                <g transform={`translate(${trainPos.x}, ${trainPos.y})`}>
                  {/* 노란색 원 배경 */}
                  <circle cx="0" cy="0" r="22" fill="#FFD600" stroke="#E6C200" strokeWidth="2" />
                  {/* 기차 아이콘 (이미지 스타일) */}
                  <g transform="translate(0, 3) scale(0.65)">
                    {/* 팬터그래프 (상단 전선) */}
                    <path d="M-10 -24 Q0 -30 10 -24" fill="none" stroke="#6B6B6B" strokeWidth="3" strokeLinecap="round" />
                    <line x1="-6" y1="-24" x2="-6" y2="-19" stroke="#6B6B6B" strokeWidth="3" strokeLinecap="round" />
                    <line x1="6" y1="-24" x2="6" y2="-19" stroke="#6B6B6B" strokeWidth="3" strokeLinecap="round" />
                    {/* 기차 본체 */}
                    <rect x="-14" y="-18" width="28" height="30" rx="5" fill="none" stroke="#6B6B6B" strokeWidth="3" />
                    {/* 창문 */}
                    <rect x="-9" y="-13" width="18" height="12" rx="2" fill="none" stroke="#6B6B6B" strokeWidth="3" />
                    {/* 바퀴 */}
                    <circle cx="-7" cy="8" r="4" fill="none" stroke="#6B6B6B" strokeWidth="3" />
                    <circle cx="7" cy="8" r="4" fill="none" stroke="#6B6B6B" strokeWidth="3" />
                  </g>
                  {/* 화물 큐브 표시 */}
                  <rect
                    x="12"
                    y="-18"
                    width="12"
                    height="12"
                    rx="2"
                    fill={delivery.cubeColor}
                    stroke="rgba(0,0,0,0.3)"
                    strokeWidth="1"
                  />
                </g>
              )}
            </svg>

            {/* 범례 */}
            <div className="flex flex-wrap justify-center items-center gap-x-16 gap-y-3 py-5 px-8 bg-[#1a1a1f]">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded" style={{ backgroundColor: '#4A7A4A' }} />
                <span className="text-[#a0a0a0] text-sm">평지 (Plain)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded" style={{ backgroundColor: '#5C9EBF' }} />
                <span className="text-[#a0a0a0] text-sm">호수 (Lake)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  <div className="w-2 h-5 bg-[#4A4A3A] rounded-sm" />
                  <div className="w-2 h-5 bg-[#4A4A3A] rounded-sm" />
                  <div className="w-2 h-5 bg-[#4A4A3A] rounded-sm" />
                </div>
                <span className="text-[#a0a0a0] text-sm">철도 트랙</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#E53935' }} />
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#1E88E5' }} />
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#FFB300' }} />
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#AB47BC' }} />
                </div>
                <span className="text-[#a0a0a0] text-sm">도시</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
