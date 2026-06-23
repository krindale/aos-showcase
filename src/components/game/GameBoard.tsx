'use client';

import { useMemo, useCallback, useEffect, useState } from 'react';
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
  HEX_WIDTH,
  HEX_HEIGHT,
  findCompletedLinks,
  getMovementPathSVG,
  getAnimationPoints,
} from '@/utils/hexGrid';
import { getMapData } from '@/utils/mapRegistry';
import { getMapProfile } from '@/maps/getMapProfile';
import { isValidConnectionPoint as isValidConnectionPointUtil } from '@/utils/trackValidation';
import { CITY_COLORS, CUBE_COLORS, PLAYER_COLORS, HexCoord, PlayerId, TerrainType } from '@/types/game';

const SQRT3_2 = 0.8660254; // sin(60°) — flat-top 헥스 평변까지 거리 비율

// hex 색을 amt만큼 밝게(+)/어둡게(-) — 고정비용 육각형의 "필드보다 진한 녹색"용
function shadeColor(hex: string, amt: number): string {
  if (!hex.startsWith('#') || hex.length < 7) return hex;
  const ch = (i: number) =>
    Math.max(0, Math.min(255, parseInt(hex.slice(i, i + 2), 16) + amt)).toString(16).padStart(2, '0');
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}

// 도시/마을 이름 배경 points.
// flat-top(꼭짓점 가로): 헥스 좌우 꼭짓점까지 닿는 옆으로 긴 육각형.
// pointy-top(꼭짓점 세로, 서부 미국): 헥스 좌우 평변까지 닿는 네모(사각형).
function nameBandPoints(x: number, y: number, isFlat: boolean): string {
  const bh2 = (HEX_SIZE * 0.31) / 2;
  if (!isFlat) {
    const rr = SQRT3_2 * (HEX_SIZE - 2); // 좌우 평변
    return [[x + rr, y - bh2], [x + rr, y + bh2], [x - rr, y + bh2], [x - rr, y - bh2]]
      .map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  }
  const rr = HEX_SIZE - 3; // 좌우 꼭짓점
  const dx = bh2 * 0.5774; // 헥스 사선 기울기만큼 좌우 끝이 좁아짐
  return [
    [x + rr, y], [x + rr - dx, y - bh2], [x - rr + dx, y - bh2],
    [x - rr, y], [x - rr + dx, y + bh2], [x + rr - dx, y + bh2],
  ].map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
}

// 도시 숫자 박스 path.
// flat-top: 헥스 상/하 평변에 닿는 사각형(안쪽 모서리만 라운드).
// pointy-top: 헥스 상/하 꼭짓점을 덮는 "네모+세모" 오각형(home plate).
function numberBoxPath(
  x: number, y: number, bw: number, bh: number, rad: number, isFlat: boolean, isTop: boolean
): string {
  const x0 = x - bw / 2, x1 = x + bw / 2;
  if (isFlat) {
    const edge = SQRT3_2 * (HEX_SIZE - 2);
    if (isTop) {
      const topY = y - edge;
      return `M ${x0} ${topY} L ${x1} ${topY} L ${x1} ${topY + bh - rad} Q ${x1} ${topY + bh} ${x1 - rad} ${topY + bh} L ${x0 + rad} ${topY + bh} Q ${x0} ${topY + bh} ${x0} ${topY + bh - rad} Z`;
    }
    const botY = y + edge;
    return `M ${x0} ${botY - bh + rad} Q ${x0} ${botY - bh} ${x0 + rad} ${botY - bh} L ${x1 - rad} ${botY - bh} Q ${x1} ${botY - bh} ${x1} ${botY - bh + rad} L ${x1} ${botY} L ${x0} ${botY} Z`;
  }
  // pointy: 헥스 꼭짓점이 위/아래. 네모+세모로 꼭짓점을 덮음.
  // 세모 꼭짓점 각도 = 120°(헥스 꼭짓점과 동일) → tri = (bw/2)/tan60 = bw/3.4641.
  // 헥스 변에 닿지 않는 네모 안쪽 모서리만 라운드.
  const tip = HEX_SIZE - 2;      // 꼭짓점까지 거리
  const tri = bw / 3.4641;        // 세모 높이 (꼭짓점 120°)
  if (isTop) {
    const apex = y - tip;          // 헥스 상단 꼭짓점
    const base = apex + bh;        // 네모 아래 (헥스 안쪽)
    const shoulder = apex + tri;   // 세모→네모 경계 (헥스 변)
    return `M ${x} ${apex} L ${x1} ${shoulder} L ${x1} ${base - rad} Q ${x1} ${base} ${x1 - rad} ${base} L ${x0 + rad} ${base} Q ${x0} ${base} ${x0} ${base - rad} L ${x0} ${shoulder} Z`;
  }
  const apex = y + tip;            // 헥스 하단 꼭짓점
  const base = apex - bh;          // 네모 위 (헥스 안쪽)
  const shoulder = apex - tri;     // 세모→네모 경계 (헥스 변)
  return `M ${x0} ${base + rad} Q ${x0} ${base} ${x0 + rad} ${base} L ${x1 - rad} ${base} Q ${x1} ${base} ${x1} ${base + rad} L ${x1} ${shoulder} L ${x} ${apex} L ${x0} ${shoulder} Z`;
}

export default function GameBoard({ fitOverlay = false }: { fitOverlay?: boolean } = {}) {
  // fitOverlay: 화물 이동 애니메이션을 전체 화면에 꽉 차게(fit) 보여주는 비인터랙티브 오버레이 모드
  // 디버그: 헥스 좌표 표시 토글 (우측 상단 버튼)
  const [showCoords, setShowCoords] = useState(false);
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
  const currentTurn = useGameStore((state) => state.currentTurn);
  // 맵 데이터(그리드 크기/지형 색): mapRegistry에서 주입 — 튜토리얼 하드코딩 금지
  const mapData = useMemo(() => getMapData(mapId), [mapId]);
  // 큰 라벨을 생략할 도시(물품성장 안 받는 외국 터미널·Berlin 보너스 도시) — id 풀네임 노출 방지
  const bonusCityId = useMemo(() => getMapProfile(mapId).bonusCityCubeId, [mapId]);
  const mapProfile = useMemo(() => getMapProfile(mapId), [mapId]);
  const terrainColors = mapData.colors.terrain;
  // 도시 헥스에 표시할 물품 성장 주사위 번호 (cityId → diceNumber).
  // Rust Belt처럼 도시가 많은 맵에서 어느 도시가 어느 주사위 번호로 보충되는지 보여준다.
  const cityDiceNumber = useMemo(() => {
    const m: Record<string, number> = {};
    for (const col of mapData.columnMapping) {
      if (!col.isNewCity && col.diceNumber != null) m[col.cityId] = col.diceNumber;
    }
    return m;
  }, [mapData]);
  // flat-top 맵(St. Lucia): 모든 렌더 기하를 전치 — 데이터/게임 로직은 pointy-top 그대로 (인접 동형)
  const isFlat = mapData.orientation === 'flat';

  // 강 흐름: 인접한 강 헥스 방향의 변중점을 헥스 중심으로 이어, 철도처럼 연속해서 흐르게 한다.
  // (공유 변의 중점은 양쪽 헥스에서 같은 좌표라, 이웃 강 헥스의 곡선과 자연히 이어진다)
  const riverHexKeys = useMemo(() => {
    const s = new Set<string>();
    board.hexTiles.forEach(h => {
      if (h.terrain === 'river') s.add(`${h.coord.col},${h.coord.row}`);
    });
    return s;
  }, [board.hexTiles]);

  const riverFlowPath = (coord: HexCoord, x: number, y: number): string => {
    const edges: number[] = [];
    const mids: { x: number; y: number }[] = [];
    for (let e = 0; e < 6; e++) {
      const nb = getNeighborHex(coord, e);
      if (riverHexKeys.has(`${nb.col},${nb.row}`)) {
        edges.push(e);
        mids.push(getEdgeMidpoint(x, y, e, HEX_SIZE, isFlat));
      }
    }
    if (mids.length === 0) {
      // 고립된 강: 양쪽 가장자리(좌우 변)에 닿게 관통
      const a = getEdgeMidpoint(x, y, 3, HEX_SIZE, isFlat);
      const b = getEdgeMidpoint(x, y, 0, HEX_SIZE, isFlat);
      return `M ${a.x} ${a.y} Q ${x} ${y}, ${b.x} ${b.y}`;
    }
    if (mids.length === 1) {
      // 강 끝(인접 강 1개): 들어온 변 → 중심 → 반대편 가장자리까지 관통해 흘러나감
      const out = getEdgeMidpoint(x, y, (edges[0] + 3) % 6, HEX_SIZE, isFlat);
      return `M ${mids[0].x} ${mids[0].y} Q ${x} ${y}, ${out.x} ${out.y}`;
    }
    if (mids.length === 2) {
      // 변 → 중심 → 변: 두 변을 중심 경유로 부드럽게 이어 연속 흐름
      return `M ${mids[0].x} ${mids[0].y} Q ${x} ${y}, ${mids[1].x} ${mids[1].y}`;
    }
    // 분기(3+): 각 변중점에서 중심으로
    return mids.map(m => `M ${m.x} ${m.y} L ${x} ${y}`).join(' ');
  };

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
    canBuildTownSpur,
    buildTownSpur,
    buildDirectLink,
  } = useGameStore();

  const { width: boardWidth, height: boardHeight } = useMemo(
    () => calculateBoardDimensions(mapData.cols, mapData.rows, undefined, undefined, isFlat),
    [mapData, isFlat]
  );
  // viewBox 보정 — 맵별 빈 가장자리 트림. 내부 좌표 계산엔 원래 boardWidth를 그대로 쓰고,
  // 표시 viewBox만 줄여 과대 여백을 없앤다 (콘텐츠는 클립되지 않는 범위에서).
  // 한 행(좌우) 폭: flat 맵은 화면 가로가 row 방향(HEX_HEIGHT*0.75), pointy 맵은 HEX_WIDTH.
  const rowPitch = isFlat ? HEX_HEIGHT * 0.75 : HEX_WIDTH;
  const trimLeft = (mapData.trimLeftHexes ?? 0) * rowPitch; // 좌측 빈 열 가림 (Korea: row 0)
  const viewWidth = boardWidth - (mapData.trimRightHexes ?? 0) * HEX_WIDTH - trimLeft;

  // 지형색 → 건설비용 범례 (hexCostMode: 'legend' 맵 — Western US). 지도에 헥스마다 숫자를
  // 찍지 않고 모서리에 한 번만 표시. 비용은 보드 hexTiles에서 직접 추출(맵 하드코딩 없음).
  const costLegend = useMemo(() => {
    if (mapData.hexCostMode !== 'legend') return [];
    const NAME: Partial<Record<TerrainType, string>> = { plain: '평지', river: '강', swamp: '늪', mountain: '산' };
    const order: TerrainType[] = ['plain', 'river', 'swamp', 'mountain'];
    const costByTerrain = new Map<TerrainType, number>();
    for (const h of board.hexTiles) {
      if (h.terrain === 'lake') continue;
      // 평지는 fixedCost가 없어 기본 $2, 그 외는 헥스에 주입된 fixedCost(늪/강 $4·산 $5)
      const cost = h.fixedCost ?? 2;
      costByTerrain.set(h.terrain, cost);
    }
    return order
      .filter(t => costByTerrain.has(t))
      .map(t => ({ terrain: t, name: NAME[t] ?? t, cost: costByTerrain.get(t)! }));
  }, [mapData.hexCostMode, board.hexTiles]);

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

  // 큐브 이동 애니메이션 처리 - 1초 후 완료.
  // (오버레이 모드 GameBoard는 표시만 담당 — 메인 GameBoard가 completeCubeMove를 호출하므로 중복 방지)
  useEffect(() => {
    if (fitOverlay || !ui.movingCube) return;

    // 애니메이션 완료 후 처리 (1초)
    const timeout = setTimeout(() => {
      completeCubeMove();
    }, 1000);

    return () => clearTimeout(timeout);
  }, [fitOverlay, ui.movingCube, completeCubeMove]);

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

  // 헥스가 유효한 연결점인지 확인 (도시, 내 트랙, 내 트랙이 진입한 마을)
  const isValidConnectionPoint = useCallback(
    (coord: HexCoord) => {
      return isValidConnectionPointUtil(coord, board, currentPlayer);
    },
    [board, currentPlayer]
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
        // 미연결 가닥 완성: 내 트랙이 변에 닿아 있으나 가닥이 없는 마을 클릭 → 가닥 건설.
        // buildMode와 무관하게 최우선 — 같은 턴에 이미 일부 연결된 마을의 추가 변도 연결 가능.
        if (canBuildTownSpur(coord)) {
          buildTownSpur(coord);
          return;
        }

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

          // 출발점이 마을이면: 클릭한 인접 헥스 방향에 따라
          //  - 가닥 없는 변 → 마을 가닥만 단독 건설 (트랙 없이)
          //  - 가닥 있는 변 → 그 방향으로 트랙(노선) 이어가기
          const src = ui.sourceHex;
          const srcIsTown = src && board.towns.some(t => hexCoordsEqual(t.coord, src) && t.newCityColor === null);
          if (srcIsTown && src) {
            for (let e = 0; e < 6; e++) {
              if (hexCoordsEqual(getNeighborHex(src, e), coord)) {
                const spurExists = (board.townSpurs ?? []).some(sp => hexCoordsEqual(sp.townCoord, src) && sp.edge === e);
                if (spurExists) {
                  // 이미 가닥이 있는 변 → 그 헥스로 트랙(노선) 이어가기
                  if (isBuildableTarget(coord)) { selectTargetHex(coord); return; }
                } else {
                  // 가닥 없는 변 → 가닥만 단독 건설
                  if (buildTownSpur(src, e)) resetBuildMode();
                  return;
                }
              }
            }
            // 인접이 아니면 다른 연결점 재선택
            if (isValidConnectionPoint(coord)) selectSourceHex(coord);
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
    [currentPhase, ui.buildMode, ui.sourceHex, ui.targetHex, isValidConnectionPoint, isBuildableTarget, getExitEdgeForCoord, selectSourceHex, selectTargetHex, selectExitDirection, resetBuildMode, canBuildTownSpur, buildTownSpur]
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
  // 마을 안 철길 가닥(스퍼) 렌더 — 실제 건설물 (일반 트랙과 동일 스타일: 레일 + 침목)
  const renderTownSpurs = useCallback(
    (townCoord: HexCoord, x: number, y: number) => {
      const spurs = (board.townSpurs ?? []).filter(sp => hexCoordsEqual(sp.townCoord, townCoord));
      return spurs.map(sp => {
        const mid = getEdgeMidpoint(x, y, sp.edge, HEX_SIZE - 2, isFlat);
        const tx = mid.x + (x - mid.x) * 0.4;
        const ty = mid.y + (y - mid.y) * 0.4;
        const ang = Math.atan2(y - mid.y, x - mid.x) + Math.PI / 2;
        return (
          <g key={`spur-${sp.id}`} style={{ pointerEvents: 'none' }}>
            <line x1={mid.x} y1={mid.y} x2={x} y2={y} stroke="#3A3A32" strokeWidth="12" strokeLinecap="round" />
            <line x1={mid.x} y1={mid.y} x2={x} y2={y} stroke={terrainColors.plain} strokeWidth="6" strokeLinecap="round" />
            <line
              x1={tx - 8 * Math.cos(ang)} y1={ty - 8 * Math.sin(ang)}
              x2={tx + 8 * Math.cos(ang)} y2={ty + 8 * Math.sin(ang)}
              stroke="#4A4A42" strokeWidth="3" strokeLinecap="round"
            />
            {/* 이번 턴에 건설한 가닥 표시 */}
            {sp.builtTurn === currentTurn && (
              <circle cx={(mid.x + x) / 2} cy={(mid.y + y) / 2} r="6" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.9" />
            )}
          </g>
        );
      });
    },
    [board.townSpurs, isFlat, terrainColors.plain, currentTurn]
  );

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
      className={fitOverlay
        ? 'w-full'
        : 'rounded-xl overflow-hidden border border-foreground/10 mx-auto'}
      style={{
        backgroundColor: mapData.colors.background,
        contain: 'layout style paint', // Performance optimization
        transform: 'translateZ(0)', // GPU acceleration
        // 세로로 긴 맵(St. Lucia 등)은 표시 배율로 보드를 축소 (폭 제한 + 중앙 정렬)
        ...(!fitOverlay && mapData.boardDisplayScale && mapData.boardDisplayScale !== 1
          ? { maxWidth: `${mapData.boardDisplayScale * 100}%` }
          : {}),
      }}
    >
      {/* 보드 헤더 (오버레이 모드에선 숨김) */}
      {!fitOverlay && (
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
            {currentPhase !== 'buildTrack' && currentPhase !== 'moveGoods' && mapData.name}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-accent whitespace-nowrap">
              {players[currentPlayer].name}의 차례
            </span>
            <button
              onClick={() => setShowCoords(v => !v)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${showCoords ? 'bg-accent text-background' : 'bg-foreground/10 text-accent hover:bg-foreground/20'}`}
            >
              {showCoords ? '좌표 ON' : '좌표 OFF'}
            </button>
          </div>
        </div>
      </div>
      )}

      {/* SVG 보드 */}
      <svg
        width="100%"
        height={fitOverlay ? undefined : undefined}
        viewBox={`${trimLeft} 0 ${viewWidth} ${boardHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="block"
        onTouchStart={fitOverlay ? undefined : handleTouchStart}
        onTouchMove={fitOverlay ? undefined : handleTouchMove}
        onTouchEnd={fitOverlay ? undefined : handleTouchEnd}
        style={{
          touchAction: 'none',
          willChange: 'transform', // Optimize for transforms
          // 오버레이: 우측 팝업 폭(100%)에 맞춰 비율 유지, 세로 제한
          ...(fitOverlay ? { maxHeight: '74vh', display: 'block' } : {}),
        }}
        shapeRendering="optimizeSpeed" // Prioritize speed over quality for hex grid
      >
        <g
          transform={fitOverlay ? undefined : `translate(${position.x}, ${position.y}) scale(${scale})`}
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
                {/* 강 헥스: 인접 강 헥스와 변에서 이어지는 연속 강줄기 (철도 타일처럼 흐름) */}
                {terrain === 'river' && !isHighlighted && (
                  <path
                    d={riverFlowPath(coord, x, y)}
                    fill="none"
                    stroke={terrainColors.river ?? '#5FA3D4'}
                    strokeWidth="11"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.95"
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                {/* Germany 헥스 고정 건설비용 — 박스 안에 숫자 (그 칸에 트랙을 깔 때 드는 비용).
                    'legend' 맵(Western US)은 지형별 비용이 균일 → 헥스 숫자 대신 좌하단 범례로 표시. */}
                {hexTile?.fixedCost !== undefined && !isHighlighted && mapData.hexCostMode !== 'legend' && (
                  <g style={{ pointerEvents: 'none' }}>
                    <polygon
                      points={getHexPoints(x, y, 19, isFlat)}
                      fill={shadeColor(terrainColors.plain ?? '#7fae5e', -38)}
                    />
                    <text
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#ffffff"
                      fontSize="18"
                      fontWeight="bold"
                      fontFamily="system-ui, sans-serif"
                    >
                      {hexTile.fixedCost}
                    </text>
                  </g>
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

        {/* 마을 (Town) - 흰색 디스크 */}
        {board.towns.map((town) => {
          const { x, y } = hexToPixel(town.coord.col, town.coord.row, undefined, undefined, undefined, isFlat);
          const isUrbanized = town.newCityColor !== null;
          // 도시화된 마을은 cities 배열에 추가되어 도시로 렌더링됨 — 여기서 또 그리면 중복
          if (isUrbanized) return null;
          const isSourceSelected = ui.sourceHex && hexCoordsEqual(ui.sourceHex, town.coord);
          const isTownClickable = (currentPhase === 'buildTrack' && !ui.urbanizationMode)
            // 물품 이동 단계: 큐브가 있는(미도시화) 마을은 출발점으로 클릭 가능 (Western US)
            || (currentPhase === 'moveGoods' && !ui.movingCube && town.newCityColor === null && town.cubes.length > 0);

          // 도시화 가능 여부 확인
          const canUrbanize = ui.urbanizationMode && ui.selectedNewCityTile && !isUrbanized;
          const isUrbanizationClickable = canPlaceNewCity(town.coord);

          // 미연결 가닥 완성 가능 여부 (내 트랙이 변에 닿아 있으나 가닥 없음 → 클릭으로 건설)
          const canCompleteSpur = currentPhase === 'buildTrack' && !ui.urbanizationMode && canBuildTownSpur(town.coord);

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
            // 물품 이동 단계: 마을 위 큐브 선택 (Western US — 'town:<id>' 컨벤션)
            if (currentPhase === 'moveGoods' && !ui.movingCube && town.newCityColor === null && town.cubes.length > 0) {
              selectCube(`town:${town.id}`, 0);
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
                    : canCompleteSpur
                    ? '#f4a261'  // 미연결 가닥 완성 가능: 주황 점선 테두리
                    : isSourceSelected
                    ? '#ffffff'
                    : '#3D5A3D'
                }
                strokeWidth={isUrbanizationClickable ? 4 : canCompleteSpur ? 3 : isSourceSelected ? 3 : 2}
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
                const label = mapData.townNames?.[town.id] ?? town.id;
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

              {/* 마을 위 물품 큐브 (도시화 전에만) — 도시 화물과 동일한 위치·크기·2줄 배치 */}
              {!isUrbanized && town.cubes.length > 0 && (
                <g>
                  {town.cubes.map((cubeColor, i) => {
                    const cubeEdge = isFlat ? SQRT3_2 * (HEX_SIZE - 2) : HEX_SIZE - 2;
                    const n = town.cubes.length;
                    const cols = n >= 4 ? Math.ceil(n / 2) : n;
                    const row = Math.floor(i / cols);
                    const colIdx = i % cols;
                    const colsInRow = row === 0 ? cols : n - cols;
                    const cubeX = x - ((colsInRow - 1) * 18) / 2 + colIdx * 18;
                    const cubeY = y + cubeEdge - HEX_SIZE * 0.58 + 4 + row * 15;
                    return (
                      <rect
                        key={`town-cube-${town.id}-${i}`}
                        x={cubeX - 6}
                        y={cubeY - 6}
                        width="12"
                        height="12"
                        fill={CUBE_COLORS[cubeColor]}
                        stroke="#e8eaec"
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

              {/* 이번 턴에 건설한 트랙 표시 (턴이 끝나면 사라짐) — 누적 트랙과 구분용 */}
              {tile.builtTurn === currentTurn && (
                <polygon
                  points={getHexPoints(x, y, HEX_SIZE - 6, isFlat)}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  opacity="0.85"
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* 소유자 마커 - 미완성 트랙에만 표시. 파산으로 공용화된(owner null) 트랙은
                  소유 디스크를 제거하므로 마커를 그리지 않음 (룰: 파산 미완성 트랙 디스크 제거) */}
              {!isTrackInCompletedLink(tile.coord) && tile.owner !== null && (
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

        {/* 도시 */}
        {board.cities.map((city) => {
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
            : board.dynamicCityColors
            ? DYNAMIC_CITY_GRAY
            : city.id === bonusCityId // Berlin: 이름·숫자 없는 정상 회색 도시
            ? DYNAMIC_CITY_GRAY
            : goodsColor;
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
              {/* 도시 헥사곤 (검은 테두리 1px) */}
              <polygon
                points={getHexPoints(x, y, HEX_SIZE - 2, isFlat)}
                fill={cityColor}
                stroke={
                  isReachableDestination
                    ? '#e6c77a'  // 골드 악센트 (accent-light)
                    : isSourceSelected
                    ? '#ffffff'
                    : city.isTerminal
                    ? goodsColor  // 터미널: 수용 화물색 테두리
                    : '#1a1a1a'
                }
                strokeWidth={isReachableDestination ? 4 : isSourceSelected ? 4 : city.isTerminal ? 3.5 : 1}
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
                stroke={board.dynamicCityColors ? 'rgba(120,124,130,0.75)' : 'rgba(255,255,255,0.85)'}
                strokeWidth={0.15}
                style={{ pointerEvents: 'none' }}
              />

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
                  외국 터미널은 ✕, Berlin(bonusCityId)은 이름만. */}
              {(() => {
                const dice = cityDiceNumber[city.id];
                const showName = city.id !== bonusCityId;
                const isBlack = mapProfile.isCityNumberBoxBlack(city.id, city.color);
                const boxFill = isBlack ? '#1f1f1f' : '#ffffff';
                const numColor = isBlack ? '#ffffff' : '#1a1a1a';
                // flat=상하 평변 / pointy=상하 꼭짓점에 박스가 닿게
                const bw = HEX_SIZE * 0.56, bh = HEX_SIZE * 0.58 + (isFlat ? 0 : 6), rad = HEX_SIZE * 0.078;
                const numFs = HEX_SIZE * 0.43;
                const SERIF = "Georgia, 'Times New Roman', serif";
                const edge = isFlat ? SQRT3_2 * (HEX_SIZE - 2) : HEX_SIZE - 2;
                // 숫자 텍스트 y: flat=박스 중앙 / pointy=네모 부분 중앙(꼭짓점 안쪽)
                const tri = bw / 3.4641;
                const topNumY = isFlat ? y - edge + bh / 2 : y - edge + (tri + bh) / 2;
                const botNumY = isFlat ? y + edge - bh / 2 : y + edge - (tri + bh) / 2;
                // 이름 배경: 밝은 헥스(회색·노랑)는 약간 어두운 회색, 어두운 헥스는 밝은 회색
                const lightHex = board.dynamicCityColors || city.color === 'yellow' || city.isTerminal;
                const bandFill = lightHex ? '#dcdce0' : '#f3f3f3';
                const nameFs =
                  Math.min(HEX_SIZE * 0.2, (2 * (HEX_SIZE - 3) - 22) / Math.max(1, city.name.length * 0.62)) * 0.8;
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    {(dice != null || city.isTerminal) && (() => {
                      // 터미널은 숫자 없음 → 흰 박스, 위는 ✕·아래는 수용 화물색 큐브. 일반 도시는 위아래 숫자.
                      const lbl = dice != null ? String(dice) : '✕';
                      const bf = dice != null ? boxFill : '#ffffff';
                      const nc = dice != null ? numColor : '#1a1a1a';
                      const nf = dice != null ? numFs : numFs * 0.85;
                      return (
                        <>
                          <path d={numberBoxPath(x, y, bw, bh, rad, isFlat, true)} fill={bf} />
                          <text x={x} y={topNumY} textAnchor="middle" dominantBaseline="central" fill={nc} fontSize={nf} fontWeight="700" fontFamily={SERIF}>{lbl}</text>
                          <path d={numberBoxPath(x, y, bw, bh, rad, isFlat, false)} fill={dice != null ? bf : CUBE_COLORS[city.color]} />
                          {dice != null && (
                            <text x={x} y={botNumY} textAnchor="middle" dominantBaseline="central" fill={nc} fontSize={nf} fontWeight="700" fontFamily={SERIF}>{dice}</text>
                          )}
                        </>
                      );
                    })()}
                    {showName && (
                      <>
                        <polygon points={nameBandPoints(x, y, isFlat)} fill={bandFill} />
                        <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#1a1a1a" fontSize={nameFs} fontWeight="600" letterSpacing="0.5" fontFamily={SERIF}>{city.name.toUpperCase()}</text>
                      </>
                    )}
                  </g>
                );
              })()}

              {/* 물품 큐브 (도시 하단 숫자 박스 가운데) */}
              <g>
                {city.cubes.map((cubeColor, i) => {
                  const cubeEdge = isFlat ? SQRT3_2 * (HEX_SIZE - 2) : HEX_SIZE - 2;
                  // 4개 이상은 2줄로 배치
                  const n = city.cubes.length;
                  const cols = n >= 4 ? Math.ceil(n / 2) : n;
                  const row = Math.floor(i / cols);
                  const colIdx = i % cols;
                  const colsInRow = row === 0 ? cols : n - cols;
                  const cubeX = x - ((colsInRow - 1) * 18) / 2 + colIdx * 18;
                  // 일반 도시: 화물 상단 = 아래 박스 상단(2줄이면 아래로). 터미널: 아래 수용색 박스 정가운데.
                  const cubeY = city.isTerminal
                    ? y + cubeEdge - (HEX_SIZE * 0.58) / 2
                    : y + cubeEdge - HEX_SIZE * 0.58 + 4 + row * 15;
                  const isSelected =
                    ui.selectedCube?.cityId === city.id &&
                    ui.selectedCube?.cubeIndex === i;

                  return (
                    <rect
                      key={`cube-${city.id}-${i}`}
                      x={cubeX - 6}
                      y={cubeY - 6}
                      width="12"
                      height="12"
                      fill={CUBE_COLORS[cubeColor]}
                      stroke={isSelected ? '#ffffff' : '#e8eaec'}
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

        {/* Germany 도시-도시 직결 링크 (Essen↔Düsseldorf $2) — 도시 위 레이어라야 클릭이 도시에 가로채이지 않음 */}
        {(board.directLinks ?? []).map((dl, i) => {
          const a = board.cities.find(c => c.id === dl.cityA);
          const b = board.cities.find(c => c.id === dl.cityB);
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
        {/* 트랙 위 물품 큐브 — 최상위 레이어 (마을/도시 등 다른 요소에 클릭이 가려지지 않도록) */}
        {board.trackTiles.filter(t => t.cube).map((tile) => {
          const { x, y } = hexToPixel(tile.coord.col, tile.coord.row, undefined, undefined, undefined, isFlat);
          const isSelected = ui.selectedCube?.cityId === `track:${tile.id}`;
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

        {ui.movePath.length > 1 && !ui.movingCube && (
          <path
            d={getMovementPathSVG(ui.movePath, board, HEX_SIZE - 2, isFlat)}
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
          const animPoints = getAnimationPoints(ui.movingCube.path, board, HEX_SIZE - 2, 5, isFlat);

          // 모든 x, y 좌표 배열 생성
          const xPoints = animPoints.map(p => p.x - 9);
          const yPoints = animPoints.map(p => p.y - 9);

          return (
            <g>
              {/* 이동 경로 표시 - 트랙을 따라 점선으로 */}
              <path
                d={getMovementPathSVG(ui.movingCube.path, board, HEX_SIZE - 2, isFlat)}
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
        {/* 좌표 오버레이 — 모든 요소 위(최상위). 노란 글자+검정 외곽으로 마을(흰 원)·도시 위에서도 보임.
            hexTiles에는 도시 헥스가 없으므로(generateHexTiles의 !isCity) 도시·마을 좌표를 합쳐 렌더 */}
        {showCoords && [
          ...board.hexTiles.map(h => h.coord),
          ...board.cities.map(c => c.coord),
          ...board.towns.map(t => t.coord),
        ].map(coord => {
          const { x, y } = hexToPixel(coord.col, coord.row, undefined, undefined, undefined, isFlat);
          return (
            <text
              key={`coord-${coord.col}-${coord.row}`}
              x={x} y={y + HEX_SIZE * 0.5 + 10}
              fontSize="9" fontWeight="bold"
              fill="#000000"
              textAnchor="middle" dominantBaseline="middle"
              style={{ pointerEvents: 'none' }}
            >
              {coord.col},{coord.row}
            </text>
          );
        })}

        {/* 지형색 → 건설비용 범례 (Western US 등 hexCostMode:'legend') — 좌하단 빈 바다(0,13 부근) */}
        {costLegend.length > 0 && (() => {
          const a = hexToPixel(0, 13, undefined, undefined, undefined, isFlat);
          const pad = 12, rowH = 30, swatch = 22, w = 168;
          const h = 36 + costLegend.length * rowH + 8;
          const x0 = Math.max(10, a.x - 66);
          const y0 = Math.min(boardHeight - h - 10, Math.max(10, a.y - 96));
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={x0} y={y0} width={w} height={h} rx={10}
                fill="rgba(8,28,38,0.82)" stroke="#d4a853" strokeWidth={2} />
              <text x={x0 + pad} y={y0 + 25} fill="#e6c77a" fontSize={19} fontWeight="bold"
                fontFamily="system-ui, sans-serif">건설 비용</text>
              {costLegend.map((e, i) => {
                const ry = y0 + 36 + i * rowH;
                return (
                  <g key={`legend-${e.terrain}`}>
                    <rect x={x0 + pad} y={ry} width={swatch} height={swatch} rx={3}
                      fill={terrainColors[e.terrain] ?? terrainColors.plain}
                      stroke="rgba(0,0,0,0.5)" strokeWidth={1.5} />
                    <text x={x0 + pad + swatch + 10} y={ry + swatch - 5} fill="#f5f5f5"
                      fontSize={17} fontWeight="600" fontFamily="system-ui, sans-serif">{e.name}</text>
                    <text x={x0 + w - pad} y={ry + swatch - 5} fill="#ffffff" fontSize={17}
                      fontWeight="bold" textAnchor="end" fontFamily="system-ui, sans-serif">${e.cost}</text>
                  </g>
                );
              })}
            </g>
          );
        })()}
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
            style={{ backgroundColor: terrainColors.lake ?? '#0a3a44' }}
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
