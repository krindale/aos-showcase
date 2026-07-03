'use client';

import { useMemo, useCallback, useEffect, useState } from 'react';
import BoardPulses from './BoardPulses';
import BoardTracks from './board/BoardTracks';
import BoardTowns from './board/BoardTowns';
import BoardCities from './board/BoardCities';
import BoardOverlays from './board/BoardOverlays';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { useShallow } from 'zustand/react/shallow';
import { useTouchGestures } from '@/hooks/useTouchGestures';
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
} from '@/utils/hexGrid';
import { getMapData } from '@/utils/mapRegistry';
import { getMapProfile } from '@/maps/getMapProfile';
import { isValidConnectionPoint as isValidConnectionPointUtil } from '@/utils/trackValidation';
import { CITY_COLORS, CUBE_COLORS, PLAYER_COLORS, HexCoord, PlayerId, TerrainType } from '@/types/game';
import { shadeColor, hexVertex } from './board/boardGeometry';

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
  // 산악 헥스: 바깥 밝은 갈색 테두리 + 안쪽 진한 갈색 (모든 맵 공통, 등고선 없음)
  const MTN_RING_COLOR = '#a97736'; // 바깥 테두리: 밝은 갈색
  const MTN_BASE_COLOR = '#7a5622'; // 안쪽 내부: 진한 갈색
  const MTN_RING_INSET = 12;        // 테두리 두께(px, HEX_SIZE 기준)
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

  // 지도 바깥 외곽선 — 그려지는 헥스(도시 + lake 아닌 타일)의 "이웃이 없는 바깥 변"만 모아
  // 두꺼운 실선으로 잇는다. 헥스 실루엣 = 지도 외곽. (모든 맵 generic)
  const mapOutlinePath = useMemo(() => {
    const solid = new Set<string>();
    board.cities.forEach(c => solid.add(`${c.coord.col},${c.coord.row}`));
    board.hexTiles.forEach(h => {
      if (h.terrain !== 'lake' || !mapData.hideLakeHexes) solid.add(`${h.coord.col},${h.coord.row}`);
    });
    let d = '';
    solid.forEach(k => {
      const [col, row] = k.split(',').map(Number);
      const { x, y } = hexToPixel(col, row, undefined, undefined, undefined, isFlat);
      for (let e = 0; e < 6; e++) {
        const nb = getNeighborHex({ col, row }, e);
        if (!solid.has(`${nb.col},${nb.row}`)) {
          const v1 = hexVertex(x, y, e, isFlat);
          const v2 = hexVertex(x, y, (e + 1) % 6, isFlat);
          d += `M ${v1.x.toFixed(1)} ${v1.y.toFixed(1)} L ${v2.x.toFixed(1)} ${v2.y.toFixed(1)} `;
        }
      }
    });
    return d;
  }, [board.cities, board.hexTiles, mapData.hideLakeHexes, isFlat]);

  // 철도 건설 불가 경계 변 — 두 인접 헥스의 공유 변을 외곽선 2배 굵기 실선으로 (한국 산맥 등)
  const blockedEdgePath = useMemo(() => {
    const list = board.blockedEdges;
    if (!list || list.length === 0) return '';
    let d = '';
    for (const { a, b } of list) {
      const { x, y } = hexToPixel(a.col, a.row, undefined, undefined, undefined, isFlat);
      for (let e = 0; e < 6; e++) {
        const nb = getNeighborHex(a, e);
        if (nb.col === b.col && nb.row === b.row) {
          const v1 = hexVertex(x, y, e, isFlat);
          const v2 = hexVertex(x, y, (e + 1) % 6, isFlat);
          d += `M ${v1.x.toFixed(1)} ${v1.y.toFixed(1)} L ${v2.x.toFixed(1)} ${v2.y.toFixed(1)} `;
          break;
        }
      }
    }
    return d;
  }, [board.blockedEdges, isFlat]);

  // 강 타일이 데이터로 "지나는 두 면"을 지정한 경우 (맵 데이터에 적힌 강 방향) — generic, 맵 분기 없음
  const riverEdgeMap = useMemo(() => {
    const m = new Map<string, [number, number]>();
    board.hexTiles.forEach(h => {
      if (h.terrain === 'river' && h.riverEdges) m.set(`${h.coord.col},${h.coord.row}`, h.riverEdges);
    });
    return m;
  }, [board.hexTiles]);

  const riverFlowPath = (coord: HexCoord, x: number, y: number): string => {
    // 데이터로 두 면이 지정돼 있으면 그 두 면을 잇는다 (강 방향이 맵 데이터에 적힌 경우).
    const explicit = riverEdgeMap.get(`${coord.col},${coord.row}`);
    if (explicit) {
      const a = getEdgeMidpoint(x, y, explicit[0], HEX_SIZE, isFlat);
      const b = getEdgeMidpoint(x, y, explicit[1], HEX_SIZE, isFlat);
      return `M ${a.x} ${a.y} Q ${x} ${y}, ${b.x} ${b.y}`;
    }
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
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    isMousePanning,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useTouchGestures({
    minScale: 0.5,
    maxScale: 3.0,
    contentWidth: viewWidth,
    contentHeight: boardHeight,
  });

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
      if (isMousePanning()) return; // 마우스 드래그(팬) 직후의 클릭은 무시
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
              {/* 라벨 = 누르면 실행될 동작 (상태는 배경색으로 구분) */}
              {showCoords ? '좌표 OFF' : '좌표 ON'}
            </button>
          </div>
        </div>
      </div>
      )}

      {/* SVG 보드 */}
      <svg
        width="100%"
        height={fitOverlay ? undefined : undefined}
        viewBox={`${trimLeft} ${!fitOverlay && scale < 1 ? (boardHeight * (1 - scale)) / 2 : 0} ${viewWidth} ${!fitOverlay && scale < 1 ? boardHeight * scale : boardHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="block"
        onTouchStart={fitOverlay ? undefined : handleTouchStart}
        onTouchMove={fitOverlay ? undefined : handleTouchMove}
        onTouchEnd={fitOverlay ? undefined : handleTouchEnd}
        onMouseDown={fitOverlay ? undefined : handleMouseDown}
        onMouseMove={fitOverlay ? undefined : handleMouseMove}
        onMouseUp={fitOverlay ? undefined : handleMouseUp}
        onMouseLeave={fitOverlay ? undefined : handleMouseUp}
        style={{
          touchAction: 'none',
          // 데스크톱: 확대(scale>1) 상태에서만 드래그로 이동 가능 → grab 커서
          ...(fitOverlay ? {} : { cursor: scale > 1 ? 'grab' : 'default' }),
          // 오버레이: 우측 팝업 폭(100%)에 맞춰 비율 유지, 세로 제한
          ...(fitOverlay ? { maxHeight: '74vh', display: 'block' } : {}),
        }}
        shapeRendering="geometricPrecision" // 벡터 품질 우선 (확대 시 선명)
      >
        <g
          transform={
            fitOverlay
              ? undefined
              // 보드 중심(viewBox 중앙) 기준으로 스케일 → 축소해도 화면 밖으로 쏠리지 않고
              // 중앙에서 균일하게 작아진다. (SVG는 CSS transform-origin이 안 먹으므로 좌표로 직접 계산)
              : `translate(${position.x}, ${position.y}) translate(${trimLeft + viewWidth / 2}, ${boardHeight / 2}) scale(${scale}) translate(${-(trimLeft + viewWidth / 2)}, ${-(boardHeight / 2)})`
          }
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
                  points={getHexPoints(x, y, HEX_SIZE, isFlat)}
                  fill={
                    isHighlighted
                      ? 'rgba(212, 168, 83, 0.3)' // 건설 가능 헥스 하이라이트
                      : terrain === 'river'
                      ? terrainColors.plain // 강 헥스: 평지색 + 아래 강줄기 곡선 오버레이
                      : terrain === 'mountain'
                      ? MTN_RING_COLOR // 산악: 바깥 테두리색(안쪽은 inset 폴리곤이 내부색)
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
                  strokeWidth={0.5}
                  className={
                    isClickable
                      ? 'cursor-pointer hover:opacity-80 transition-opacity'
                      : ''
                  }
                  onClick={() => isClickable && handleHexClick(coord)}
                  onMouseEnter={() => handleHexHover(coord)}
                />
                {/* 산악: 안쪽 내부색 폴리곤 → 바깥 테두리색이 띠로 남음. 클릭은 메인 폴리곤이 처리 */}
                {terrain === 'mountain' && !isHighlighted && (
                  <polygon
                    points={getHexPoints(x, y, HEX_SIZE - MTN_RING_INSET, isFlat)}
                    fill={MTN_BASE_COLOR}
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                {/* 강 헥스: 인접 강 헥스와 변에서 이어지는 연속 강줄기 (철도 타일처럼 흐름).
                    헥스 모양 clipPath로 강줄기가 외곽선을 넘어가지 않게 가둔다. */}
                {terrain === 'river' && !isHighlighted && (
                  <>
                    <clipPath id={`river-clip-${col}-${row}`}>
                      <polygon points={getHexPoints(x, y, HEX_SIZE, isFlat)} />
                    </clipPath>
                    <path
                      d={riverFlowPath(coord, x, y)}
                      fill="none"
                      stroke={terrainColors.river ?? '#5FA3D4'}
                      strokeWidth="11"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.95"
                      clipPath={`url(#river-clip-${col}-${row})`}
                      style={{ pointerEvents: 'none' }}
                    />
                  </>
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

        {/* 마을 레이어 — 흰 디스크·이름 띠·마을 트랙/가닥·도시화 하이라이트·큐브 (board/BoardTowns) */}
        <BoardTowns
          towns={board.towns}
          trackTiles={board.trackTiles}
          currentPhase={currentPhase}
          isFlat={isFlat}
          plainColor={terrainColors.plain}
          townNames={mapData.townNames}
          trackPathCache={trackPathCache}
          sourceHex={ui.sourceHex}
          urbanizationMode={ui.urbanizationMode}
          hasSelectedNewCityTile={!!ui.selectedNewCityTile}
          isMovingCube={!!ui.movingCube}
          highlightedHexes={ui.highlightedHexes}
          canPlaceNewCity={canPlaceNewCity}
          placeNewCity={placeNewCity}
          canBuildTownSpur={canBuildTownSpur}
          selectCube={selectCube}
          onHexClick={handleHexClick}
          renderTownSpurs={renderTownSpurs}
        />

        {/* 트랙 레이어 — 트랙 타일·소유 마커·완성 링크 마커·끊김 경고 (board/BoardTracks) */}
        <BoardTracks
          trackTiles={board.trackTiles}
          players={players}
          currentPlayer={currentPlayer}
          currentTurn={currentTurn}
          isBuildPhase={currentPhase === 'buildTrack'}
          isBuildModeIdle={ui.buildMode === 'idle'}
          isFlat={isFlat}
          plainColor={terrainColors.plain}
          trackPathCache={trackPathCache}
          completedLinks={completedLinks}
          disconnectedConnections={disconnectedConnections}
          isTrackInCompletedLink={isTrackInCompletedLink}
          canRedirect={canRedirect}
          selectTrackToRedirect={selectTrackToRedirect}
          onHexClick={handleHexClick}
        />

        {/* 도시 레이어 — 도시 헥스·라벨·큐브 + Germany 직결 링크 (board/BoardCities) */}
        <BoardCities
          cities={board.cities}
          dynamicCityColors={board.dynamicCityColors}
          cottonPorts={board.cottonPorts}
          directLinks={board.directLinks}
          players={players}
          currentPhase={currentPhase}
          isFlat={isFlat}
          bonusCityId={bonusCityId}
          cityDiceNumber={cityDiceNumber}
          isCityNumberBoxBlack={(cityId, demandColor) => mapProfile.isCityNumberBoxBlack(cityId, demandColor)}
          sourceHex={ui.sourceHex}
          reachableDestinations={ui.reachableDestinations}
          selectedCube={ui.selectedCube}
          onHexClick={handleHexClick}
          selectDestinationCity={selectDestinationCity}
          onCubeClick={handleCubeClick}
          buildDirectLink={buildDirectLink}
        />

        {/* 오버레이 레이어 — 미리보기·트랙 위 큐브·이동 경로/큐브·외곽선·경계·터미널 테두리 (board/BoardOverlays) */}
        <BoardOverlays
          board={board}
          currentPhase={currentPhase}
          isFlat={isFlat}
          mapOutlinePath={mapOutlinePath}
          blockedEdgePath={blockedEdgePath}
          borderColor={mapData.colors.border}
          previewTrack={ui.previewTrack}
          selectedCubeCityId={ui.selectedCube?.cityId ?? null}
          movePath={ui.movePath}
          movingCube={ui.movingCube}
          selectCube={selectCube}
        />
        {/* 인플레이스 펄스 레이어 (건설/큐브 유입) — memo 자식으로 분리, 미니 오버레이에서도 표시 */}
        <BoardPulses isFlat={isFlat} />
        {/* 좌표 오버레이 — 모든 요소 위(그룹 내 최상위). 줌/팬 변환 그룹 안에 있어야
            +/- 확대·축소 시에도 헥스와 좌표가 함께 움직인다 (밖에 두면 좌표가 어긋나는 버그).
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
        </g>

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


      {/* 줌 컨트롤 — 좌표 ON/OFF 버튼 아래(보드 우측 상단). 데스크톱 포함 항상 표시. */}
      {!fitOverlay && (
        <div className="absolute top-14 right-3 flex flex-row gap-1.5 z-10">
          <motion.button
            onClick={zoomIn}
            className="glass-card p-2 hover:bg-accent/20 transition-colors rounded-lg shadow-lg"
            aria-label="확대"
            title="확대"
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <ZoomIn className="w-4 h-4 text-accent" />
          </motion.button>
          <motion.button
            onClick={zoomOut}
            className="glass-card p-2 hover:bg-accent/20 transition-colors rounded-lg shadow-lg"
            aria-label="축소"
            title="축소"
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <ZoomOut className="w-4 h-4 text-accent" />
          </motion.button>
          <motion.button
            onClick={resetZoom}
            className="glass-card p-2 hover:bg-accent/20 transition-colors rounded-lg shadow-lg"
            aria-label="원래 크기"
            title="원래 크기"
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Maximize2 className="w-4 h-4 text-accent" />
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
