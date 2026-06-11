'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';

// BGG 평점 데이터 (실제 데이터)
const BGG_RATING = {
  score: 7.9,
  votes: "12K+",
  rank: "#95 전략 게임",
  weight: 3.89,
  weightLabel: "Heavy",
};

// 수상 내역
const AWARDS = [
  { year: "2003", name: "International Gamers Award", detail: "General Strategy" },
  { year: "2002", name: "Meeples' Choice Award", detail: "" },
];

// 한줄 리뷰 데이터 (실제 리뷰 기반)
const REVIEWS = [
  { quote: "The greatest train game ever made", source: "BGG Community" },
  { quote: "20년이 지나도 고전의 가치를 증명하는 명작", source: "Meeple Mountain" },
  { quote: "Bring a shiv! 치열한 경쟁의 정수", source: "Board Game Review" },
];

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

// 도시 데이터 (7x5 그리드, 0-indexed) - 세련된 톤, 각 도시 2개 화물
const CITIES = [
  { id: 'P', name: 'Pittsburgh', col: 1, row: 0, color: '#C62828', cubes: ['#F9A825', '#8E24AA'] },
  { id: 'C', name: 'Cleveland', col: 5, row: 0, color: '#1565C0', cubes: ['#8E24AA', '#C62828'] },
  { id: 'O', name: 'Columbus', col: 3, row: 2, color: '#F9A825', cubes: ['#C62828', '#1565C0'] },
  { id: 'W', name: 'Wheeling', col: 5, row: 3, color: '#455A64', cubes: ['#C62828', '#8E24AA'] },
  { id: 'I', name: 'Cincinnati', col: 1, row: 4, color: '#8E24AA', cubes: ['#F9A825', '#1565C0'] },
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

// 링크 데이터 - 도시/마을 간 연결 (마커는 링크 중간에 하나만 표시)
interface RailroadLink {
  id: string;
  ownerColor: string;
  // 마커를 배치할 중간 타일의 좌표
  markerTile: { col: number; row: number };
}

const RAILROAD_LINKS: RailroadLink[] = [
  {
    id: 'yellow-pittsburgh-cleveland',
    ownerColor: '#FFD600',
    markerTile: { col: 3, row: 0 },  // 중간 타일
  },
  {
    id: 'purple-pittsburgh-cincinnati',
    ownerColor: '#9C27B0',
    markerTile: { col: 1, row: 2 },  // 중간 타일
  },
  {
    id: 'white-columbus-cleveland',
    ownerColor: '#FFFFFF',
    markerTile: { col: 4, row: 1 },  // 중간 타일
  },
  {
    id: 'red-columbus-wheeling',
    ownerColor: '#F44336',
    markerTile: { col: 3, row: 3 },  // 첫 번째 타일 (2개 중)
  },
  {
    id: 'green-cincinnati-columbus',
    ownerColor: '#4CAF50',
    markerTile: { col: 2, row: 3 },  // 두 번째 타일 (2개 중)
  },
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

// 침목(Railroad ties) 생성 - 트랙을 따라 수직으로 배치
function getRailroadTies(cx: number, cy: number, edge1: number, edge2: number, size: number): { x: number; y: number; angle: number }[] {
  const p1 = getEdgeMidpoint(cx, cy, edge1, size);
  const p2 = getEdgeMidpoint(cx, cy, edge2, size);
  const ties: { x: number; y: number; angle: number }[] = [];

  const diff = Math.abs(edge1 - edge2);
  const edgeDist = Math.min(diff, 6 - diff);
  const numTies = 6; // 침목 개수 증가

  for (let i = 0; i <= numTies; i++) {
    const t = i / numTies;
    let x: number, y: number, angle: number;

    if (edgeDist === 3) {
      // 직선 트랙
      x = p1.x + (p2.x - p1.x) * t;
      y = p1.y + (p2.y - p1.y) * t;
      angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
    } else {
      // 베지어 곡선 트랙
      const oneMinusT = 1 - t;
      x = oneMinusT * oneMinusT * p1.x + 2 * oneMinusT * t * cx + t * t * p2.x;
      y = oneMinusT * oneMinusT * p1.y + 2 * oneMinusT * t * cy + t * t * p2.y;
      // 접선 방향 계산
      const dx = 2 * (1 - t) * (cx - p1.x) + 2 * t * (p2.x - cx);
      const dy = 2 * (1 - t) * (cy - p1.y) + 2 * t * (p2.y - cy);
      angle = Math.atan2(dy, dx) * 180 / Math.PI;
    }

    ties.push({ x, y, angle });
  }

  return ties;
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

  // 애니메이션 사이클 (requestAnimationFrame cleanup 개선)
  useEffect(() => {
    if (!showRoute) return;

    const animationDuration = 2000; // 2초 동안 이동
    const pauseDuration = 2000; // 2초 대기
    const totalCycle = animationDuration + pauseDuration;

    let animationFrameId: number | null = null;
    let isActive = true;

    // 애니메이션 실행 함수 (중복 제거)
    const runAnimation = () => {
      if (!isActive) return;

      setAnimationProgress(0);
      setShowIncome(false);

      const startTime = Date.now();
      const animate = () => {
        if (!isActive) return;

        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);
        setAnimationProgress(progress);

        if (progress >= 1) {
          setShowIncome(true);
        }

        if (elapsed < animationDuration && isActive) {
          animationFrameId = requestAnimationFrame(animate);
        }
      };
      animationFrameId = requestAnimationFrame(animate);
    };

    // 초기 애니메이션 시작
    runAnimation();

    // 주기적 애니메이션 반복
    const interval = setInterval(() => {
      runAnimation();
    }, totalCycle);

    // 배달 순환
    const deliveryInterval = setInterval(() => {
      setCurrentDelivery((prev) => (prev + 1) % DELIVERY_ANIMATIONS.length);
    }, totalCycle);

    return () => {
      isActive = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
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
    <section ref={ref} className="snap-section py-24 relative overflow-hidden">
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

        {/* 메인 콘텐츠: 보드 + 프리뷰 패널 */}
        <div className="flex flex-col lg:flex-row gap-8 justify-center items-start">
          {/* 왼쪽: 게임보드 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div
              className="rounded-xl overflow-hidden border border-[#2D3F2D]"
              style={{ backgroundColor: '#252D25' }}
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
                      fill={isLake ? '#4A7A8A' : '#3D5A3D'}
                      stroke={isLake ? '#3A6A7A' : '#2D4A2D'}
                      strokeWidth="2"
                    />
                  );
                })
              )}

              {/* 철도 타일 (헥스 내 엣지 연결) - 침목 스타일 */}
              {TRACK_TILES.map((tile, index) => {
                const { x, y } = hexToPixel(tile.col, tile.row);
                const pathData = getTrackPath(x, y, tile.edges[0], tile.edges[1], HEX_SIZE - 2);
                const ties = getRailroadTies(x, y, tile.edges[0], tile.edges[1], HEX_SIZE - 2);

                return (
                  <g key={`track-tile-${index}`}>
                    {/* 레일 (두 줄 평행선, 가운데 투명) - 먼저 그려서 침목 아래에 */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke="#3A3A32"
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={pathData}
                      fill="none"
                      stroke="#3D5A3D"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* 침목 (Railroad ties) - 레일 위에 그려서 z-index 높게, 길이 2/3 */}
                    {ties.map((tie, i) => (
                      <line
                        key={`tie-${index}-${i}`}
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
                );
              })}

              {/* 링크 마커 (링크 중간 타일에 하나씩 배치) */}
              {RAILROAD_LINKS.map((link) => {
                const { x, y } = hexToPixel(link.markerTile.col, link.markerTile.row);
                return (
                  <circle
                    key={`link-marker-${link.id}`}
                    cx={x}
                    cy={y}
                    r="8"
                    fill={link.ownerColor}
                    stroke="#1a1a1a"
                    strokeWidth="2"
                  />
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
                  {/* 앤틱 골드 원 배경 */}
                  <circle cx="0" cy="0" r="22" fill="#C9A227" stroke="#A8841F" strokeWidth="2" />
                  {/* 기차 아이콘 (이미지 스타일) */}
                  <g transform="translate(0, 3) scale(0.65)">
                    {/* 팬터그래프 (상단 전선) */}
                    <path d="M-10 -24 Q0 -30 10 -24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
                    <line x1="-6" y1="-24" x2="-6" y2="-19" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
                    <line x1="6" y1="-24" x2="6" y2="-19" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
                    {/* 기차 본체 */}
                    <rect x="-14" y="-18" width="28" height="30" rx="5" fill="none" stroke="#ffffff" strokeWidth="3" />
                    {/* 창문 */}
                    <rect x="-9" y="-13" width="18" height="12" rx="2" fill="none" stroke="#ffffff" strokeWidth="3" />
                    {/* 바퀴 */}
                    <circle cx="-7" cy="8" r="4" fill="none" stroke="#ffffff" strokeWidth="3" />
                    <circle cx="7" cy="8" r="4" fill="none" stroke="#ffffff" strokeWidth="3" />
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
                <div className="w-7 h-7 rounded" style={{ backgroundColor: '#3D5A3D' }} />
                <span className="text-[#a0a0a0] text-sm">평지 (Plain)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded" style={{ backgroundColor: '#4A7A8A' }} />
                <span className="text-[#a0a0a0] text-sm">호수 (Lake)</span>
              </div>
              <div className="flex items-center gap-3">
                <svg width="40" height="20" viewBox="0 0 40 20">
                  {/* 레일 (두 줄, 가운데 비움) */}
                  <line x1="2" y1="10" x2="38" y2="10" stroke="#3A3A32" strokeWidth="8" strokeLinecap="round" />
                  <line x1="2" y1="10" x2="38" y2="10" stroke="#252D25" strokeWidth="4" strokeLinecap="round" />
                  {/* 침목 - 레일 위에 */}
                  <line x1="6" y1="2" x2="6" y2="18" stroke="#4A4A42" strokeWidth="2" strokeLinecap="round" />
                  <line x1="14" y1="2" x2="14" y2="18" stroke="#4A4A42" strokeWidth="2" strokeLinecap="round" />
                  <line x1="22" y1="2" x2="22" y2="18" stroke="#4A4A42" strokeWidth="2" strokeLinecap="round" />
                  <line x1="30" y1="2" x2="30" y2="18" stroke="#4A4A42" strokeWidth="2" strokeLinecap="round" />
                  {/* 소유자 마커 (중앙) */}
                  <circle cx="20" cy="10" r="5" fill="#FFD600" stroke="#1a1a1a" strokeWidth="1" />
                </svg>
                <span className="text-[#a0a0a0] text-sm">철도 트랙</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#C62828' }} />
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#1565C0' }} />
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#F9A825' }} />
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#8E24AA' }} />
                </div>
                <span className="text-[#a0a0a0] text-sm">도시</span>
              </div>
            </div>
            </div>
          </motion.div>

          {/* 오른쪽: BGG 평점 + 리뷰 패널 */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="w-full lg:w-72 space-y-4"
          >
            {/* BGG 평점 카드 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="text-center p-6 rounded-xl border border-[#2a2a3a] bg-[#12121a]/80 backdrop-blur-sm"
            >
              <div className="text-xs text-[#a0a0a0] uppercase tracking-wider mb-2">
                BoardGameGeek
              </div>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-bold text-[#d4a853]">{BGG_RATING.score}</span>
                <span className="text-xl text-[#6b6b6b]">/ 10</span>
              </div>
              <div className="flex justify-center gap-1 mt-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    className={star <= Math.round(BGG_RATING.score / 2) ? "text-[#d4a853]" : "text-[#3a3a4a]"}
                  >
                    ★
                  </span>
                ))}
              </div>
              <div className="text-sm text-[#a0a0a0] mt-2">{BGG_RATING.votes} votes</div>
              <div className="text-xs text-[#6b6b6b] mt-1">{BGG_RATING.rank}</div>

              {/* 복잡도 (Weight) */}
              <div className="mt-4 pt-4 border-t border-[#2a2a3a]">
                <div className="text-xs text-[#a0a0a0] uppercase tracking-wider mb-2">
                  Complexity
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl font-bold text-[#f5f5f5]">{BGG_RATING.weight}</span>
                  <span className="text-sm text-[#6b6b6b]">/ 5</span>
                </div>
                <div className="flex justify-center gap-0.5 mt-2">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`w-8 h-1.5 rounded-full ${
                        level <= Math.round(BGG_RATING.weight) ? "bg-[#e63946]" : "bg-[#2a2a3a]"
                      }`}
                    />
                  ))}
                </div>
                <div className="text-xs text-[#e63946] mt-1 font-medium">{BGG_RATING.weightLabel}</div>
              </div>
            </motion.div>

            {/* 수상 내역 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.55 }}
              className="p-4 rounded-lg border border-[#d4a853]/30 bg-[#12121a]/80 backdrop-blur-sm"
            >
              <div className="text-xs text-[#d4a853] uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>🏆</span> Awards
              </div>
              <div className="space-y-2">
                {AWARDS.map((award, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-xs text-[#d4a853] font-mono">{award.year}</span>
                    <div>
                      <div className="text-sm text-[#f5f5f5]">{award.name}</div>
                      {award.detail && (
                        <div className="text-xs text-[#6b6b6b]">{award.detail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* 한줄 리뷰 */}
            <div className="space-y-3">
              {REVIEWS.map((review, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.6 + index * 0.1 }}
                  className="p-4 rounded-lg border border-[#2a2a3a] bg-[#12121a]/80 backdrop-blur-sm hover:border-[#d4a853]/30 transition-colors"
                >
                  <p className="text-sm text-[#f5f5f5] italic leading-relaxed">
                    &ldquo;{review.quote}&rdquo;
                  </p>
                  <p className="text-xs text-[#6b6b6b] mt-2 text-right">
                    — {review.source}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
