'use client';

import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import BoardPulses from './BoardPulses';
import BoardTracks from './board/BoardTracks';
import BoardTowns from './board/BoardTowns';
import BoardCities from './board/BoardCities';
import BoardOverlays from './board/BoardOverlays';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize2, Building2, Settings } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { useGameSettingsStore } from '@/store/gameSettingsStore';
import { useShallow } from 'zustand/react/shallow';
import { useTouchGestures } from '@/hooks/useTouchGestures';
import { nationalizationTargets } from '@/store/helpers/nationalization';
import {
  hexToPixel,
  getHexPoints,
  isNightCity,
  getTrackPath,
  getRailroadTies,
  getEdgeMidpoint,
  calculateBoardDimensions,
  hexCoordsEqual,
  getNeighborHex,
  getOppositeEdge,
  HEX_SIZE,
  HEX_HORIZONTAL_RADIUS,
  HEX_VERTICAL_RADIUS,
  findCompletedLinks,
  isTrackPartOfCompletedLink,
  getPathLinkOwners,
} from '@/utils/hexGrid';
import { getMapData } from '@/utils/mapRegistry';
import { getMoonSide } from '@/utils/moonMap';
import { getMapProfile } from '@/maps/getMapProfile';
import { isValidConnectionPoint as isValidConnectionPointUtil, getRedirectTargetHexes } from '@/utils/trackValidation';
import { CITY_COLORS, CUBE_COLORS, PLAYER_COLORS, HexCoord, PlayerId, TerrainType, GAME_CONSTANTS } from '@/types/game';
import { NewCityTilesModal } from './NewCityTilesModal';
import GameSettingsDialog from './GameSettingsDialog';
import TransportConfirmDialog, { TransportPreview } from './TransportConfirmDialog';
import CubePickerDialog from './CubePickerDialog';
import { useIsNarrowViewport } from '@/hooks/useIsNarrowViewport';
import { shadeColor, hexVertex } from './board/boardGeometry';
import { useMyPlayerId } from '@/hooks/useMyPlayerId';
import { useNetStore } from '@/net/netStore';
import { useToastStore } from '@/store/toastStore';
import { safeTimeout } from '@/utils/safeTimers';
import { turboDelay } from '@/utils/turboMode';

export default function GameBoard({ fitOverlay = false }: { fitOverlay?: boolean } = {}) {
  // fitOverlay: 화물 이동 애니메이션을 전체 화면에 꽉 차게(fit) 보여주는 비인터랙티브 오버레이 모드
  // 디버그: 헥스 좌표 표시 토글 — 설정 창(⚙)의 스위치 (gameSettingsStore)
  const showCoords = useGameSettingsStore((s) => s.showCoords);
  const [showNewCityInfo, setShowNewCityInfo] = useState(false);
  // 설정 창 (운송 가이드/운송 확인/좌표 스위치)
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 화물 운송 확인 창 대기 상태 — 확인 시 selectDestinationCity(coord)로 실제 커밋
  const [transportConfirm, setTransportConfirm] = useState<{ coord: HexCoord; preview: TransportPreview } | null>(null);
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

  const myPlayerId = useMyPlayerId();
  // 진행 주체(방장/오프라인) 여부 — 정산 단계 HUD 억제 대상 판정에 쓴다 (PhasePanel과 동일 기준)
  const netMode = useNetStore((s) => s.mode);
  const amIHost = netMode === 'offline' || netMode === 'host';
  // 보드 조작은 "내 차례"일 때만 — 봇 차례나 남의 차례에 사람이 클릭해 봇/타인의 이동·건설을
  // 대신 실행해 버리는 것을 막는다(수입이 엉뚱하게 귀속되던 사용자 보고). AI는 store 액션을
  // 직접 호출해 이 게이트를 거치지 않으므로 자동 진행에는 영향이 없다.
  // 오프라인(myPlayerId=null)은 봇 차례만 차단, 온라인은 내 좌석이 currentPlayer일 때만 허용.
  const boardInteractionBlocked =
    !!players[currentPlayer]?.isAI || (myPlayerId !== null && currentPlayer !== myPlayerId);
  const mapId = useGameStore((state) => state.mapId);
  const currentTurn = useGameStore((state) => state.currentTurn);
  // 화물 이동 가이드 실효값 — 방 설정(moveGuideAllowed, 스냅샷 동기화) AND 개인 토글(로컬).
  // 표시만 게이팅한다: 목적지 클릭·경로 선택 모드·이동 애니메이션은 가이드와 무관하게 동작.
  const moveGuideAllowed = useGameStore((s) => s.moveGuideAllowed ?? true);
  const moveGuideEnabled = useGameSettingsStore((s) => s.moveGuideEnabled);
  const moveGuideOn = moveGuideAllowed && moveGuideEnabled;
  // 화물 이동 선택 UI(목적지 골드 링·최적 경로 점선·선택 큐브 강조)는 **물품 이동 단계에서만**
  // 그린다. 상태(ui.selectedCube/movePath/reachableDestinations)는 nextPhase의 여러 분기 중
  // 일부에서만 정리되어, 단계가 바뀌거나 차례가 넘어가도 남아 있던 잔재가 보이던 문제
  // (2026-07-28 사용자 보고). 상태 정리는 gameStore가 하고, 여기서는 표시를 단계로 잠근다.
  const moveGoodsPhase = currentPhase === 'moveGoods';
  const moveGuideVisible = moveGuideOn && moveGoodsPhase;
  // Montréal Repopulation: 배치 대기 큐브가 있는지 (boolean 셀렉터 — 값 변화시만 리렌더)
  const repopPending = useGameStore((s) => (s.phaseState.repopulationCubes?.length ?? 0) > 0);
  // Southern China 국유화 선택 모드 — 대기 중인 플레이어(사람)만 보드에서 링크를 고른다.
  // PhasePanel 목록과 **같은 헬퍼**(nationalizationTargets)를 쓴다 — 미러 금지.
  // 그 헬퍼에는 "후보가 0이면 당턴 제외를 푸는" 폴백이 들어 있어, 표시·판정·봇이 모두
  // 같은 목록을 본다 (상한을 지킬 방법이 사라지는 경우 방지, 2026-07-29).
  const nationalizationPending = useGameStore((s) => s.nationalizationPending ?? null);
  const nationalizeLink = useGameStore((s) => s.nationalizeLink);
  const natSelecting =
    !!nationalizationPending &&
    nationalizationPending.playerId === currentPlayer &&
    !players[currentPlayer]?.isAI &&
    !boardInteractionBlocked;
  const natTargets = useMemo(
    () => (natSelecting ? nationalizationTargets(board, currentPlayer, currentTurn) : []),
    [natSelecting, board, currentPlayer, currentTurn]
  );
  /** 국유화 후보 타일 좌표 → 링크 id (보드 클릭·하이라이트가 공유하는 인덱스) */
  const natTileIndex = useMemo(() => {
    const m = new Map<string, string>();
    for (const link of natTargets) {
      for (const c of link.trackTiles) m.set(`${c.col},${c.row}`, link.id);
    }
    return m;
  }, [natTargets]);
  /**
   * 직결 링크(인터어반/페리) 국유화 후보 — `board.directLinks` 인덱스 → 링크 id.
   * 직결 의사 타깃은 trackTiles가 비어 있어(nationalization.ts) 위 natTileIndex에 안 들어간다.
   * 그래서 PhasePanel 목록에만 뜨고 보드에서는 깜빡이지도 클릭되지도 않아, "$8 링크는 디스크
   * 취급이 아니다"라는 인상을 줬다 (2026-07-29 사용자 보고).
   */
  const natDirectIndex = useMemo(() => {
    const m = new Map<number, string>();
    for (const link of natTargets) {
      if (link.id.startsWith('direct-') && link.trackTiles.length === 0) {
        m.set(Number(link.id.slice('direct-'.length)), link.id);
      }
    }
    return m;
  }, [natTargets]);
  // 마우스가 올라간 후보 링크 — 그 링크 **전체**를 강조해 "어디까지가 한 링크인지" 보여준다
  const [hoveredNatLinkId, setHoveredNatLinkId] = useState<string | null>(null);
  // 맵 데이터(그리드 크기/지형 색): mapRegistry에서 주입 — 튜토리얼 하드코딩 금지
  const mapData = useMemo(() => getMapData(mapId), [mapId]);

  // 직결 링크 시각 메타(faces 면 앵커) 보충 — 정적 맵 정의에서 도시쌍으로 조회.
  // persist 저장본의 board.directLinks에는 나중에 추가된 시각 필드가 없을 수 있어,
  // 렌더 시점에 항상 정적 정의 값으로 채운다 (게임 상태 마이그레이션 불필요).
  const directLinkFacesByPair = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const dl of mapData.createBoardState().directLinks ?? []) {
      if (dl.faces) {
        m.set(`${dl.cityA}|${dl.cityB}`, dl.faces);
        m.set(`${dl.cityB}|${dl.cityA}`, [dl.faces[1], dl.faces[0]]);
      }
    }
    return m;
  }, [mapData]);
  const renderDirectLinks = useMemo(
    () => board.directLinks?.map(dl => {
      // 끝점 좌표 해석: 도시 → 마을 폴백 (Scotland 페리 — 도시화 전엔 끝점이 마을 id라
      // cities에서 안 잡힌다. 좌표를 함께 넘겨 잠재 항로도 점선으로 표시).
      const coordOf = (id: string) =>
        board.cities.find(c => c.id === id)?.coord ?? board.towns.find(t => t.id === id)?.coord;
      // 인접 마을↔도시 잠재 링크(Scotland Ayr↔Glasgow): 도시화 전엔 마을 가닥이 링크의 실체 —
      // 비용 원(②) 클릭이 그 가닥을 짓도록 마을 좌표/변/가닥 소유를 보충한다 (룰북: 마을
      // 상태에서 건설 가능, "even if Ayr goes from a town to a City").
      let townLink: { townCoord: HexCoord; edge: number; spurOwner: PlayerId | null; hasSpur: boolean } | undefined;
      const aCity = board.cities.find(c => c.id === dl.cityA);
      const bCity = board.cities.find(c => c.id === dl.cityB);
      if (dl.requiresCities && !dl.faces && (!aCity || !bCity)) {
        const town = board.towns.find(
          t => t.id === (aCity ? dl.cityB : dl.cityA) && t.newCityColor === null
        );
        const cityEnd = aCity ?? bCity;
        if (town && cityEnd) {
          // 마을에서 인접 도시를 향한 변 (0~5 순회 — hexGrid 이웃 판정과 동일 기준.
          // 랩 어라운드(board 인자)는 미적용 — 직결 링크와 랩이 공존하는 맵이 없다)
          const edge = [0, 1, 2, 3, 4, 5].find(
            e => hexCoordsEqual(getNeighborHex(town.coord, e), cityEnd.coord)
          ) ?? -1;
          if (edge >= 0) {
            const spur = (board.townSpurs ?? []).find(
              sp => hexCoordsEqual(sp.townCoord, town.coord) && sp.edge === edge
            );
            townLink = {
              townCoord: town.coord,
              edge,
              spurOwner: spur?.owner ?? null,
              hasSpur: !!spur,
            };
          }
        }
      }
      return {
        ...dl,
        faces: dl.faces ?? directLinkFacesByPair.get(`${dl.cityA}|${dl.cityB}`),
        coordA: coordOf(dl.cityA),
        coordB: coordOf(dl.cityB),
        townLink,
      };
    }),
    [board.directLinks, board.cities, board.towns, board.townSpurs, directLinkFacesByPair]
  );
  const mapProfile = useMemo(() => getMapProfile(mapId), [mapId]);
  const terrainColors = mapData.colors.terrain;
  // 산악 헥스: 바깥 밝은 테두리 + 안쪽 진한 내부 (기본 갈색 — 달은 mountainRenderColors로 회색)
  const MTN_RING_COLOR = mapData.mountainRenderColors?.ring ?? '#a97736';
  const MTN_BASE_COLOR = mapData.mountainRenderColors?.base ?? '#7a5622';
  const MTN_RING_INSET = 12;        // 테두리 두께(px, HEX_SIZE 기준)
  // 도시 헥스에 표시할 물품 성장 주사위 번호 (cityId → diceNumber).
  // Rust Belt처럼 도시가 많은 맵에서 어느 도시가 어느 주사위 번호로 보충되는지 보여준다.
  const cityDiceNumber = useMemo(() => {
    const m: Record<string, number | string> = {};
    // 달(Moon): 도시 인쇄 주사위 번호가 범위(1/2·3/4·5/6) — cityGrowthDice로 "1/2" 라벨 생성
    const growthDice = mapProfile.cityGrowthDice;
    if (Object.keys(growthDice).length > 0) {
      for (const [cityId, dice] of Object.entries(growthDice)) m[cityId] = dice.join('/');
      return m;
    }
    for (const col of mapData.columnMapping) {
      if (!col.isNewCity && col.diceNumber != null) m[col.cityId] = col.diceNumber;
    }
    return m;
  }, [mapData, mapProfile]);
  // flat-top 맵(St. Lucia): 모든 렌더 기하를 전치 — 데이터/게임 로직은 pointy-top 그대로 (인접 동형)
  const isFlat = mapData.orientation === 'flat';

  // 강 흐름: 인접한 강 헥스 방향의 변중점을 헥스 중심으로 이어, 철도처럼 연속해서 흐르게 한다.
  // (공유 변의 중점은 양쪽 헥스에서 같은 좌표라, 이웃 강 헥스의 곡선과 자연히 이어진다)
  const riverHexKeys = useMemo(() => {
    const s = new Set<string>();
    board.hexTiles.forEach(h => {
      // riverEdges가 있으면 지형이 산이어도 강줄기를 그린다 (Scotland 산+강 $5 헥스)
      if (h.terrain === 'river' || h.riverEdges) s.add(`${h.coord.col},${h.coord.row}`);
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

  // 시각 전용 흰 강조 변 (Southern China 하이난 해협 윗변 — 원본 시트 재현)
  const whiteEdgePath = useMemo(() => {
    let d = '';
    for (const h of board.hexTiles) {
      if (!h.whiteEdges?.length) continue;
      const { x, y } = hexToPixel(h.coord.col, h.coord.row, undefined, undefined, undefined, isFlat);
      for (const e of h.whiteEdges) {
        const v1 = hexVertex(x, y, e, isFlat);
        const v2 = hexVertex(x, y, (e + 1) % 6, isFlat);
        d += `M ${v1.x.toFixed(1)} ${v1.y.toFixed(1)} L ${v2.x.toFixed(1)} ${v2.y.toFixed(1)} `;
      }
    }
    return d;
  }, [board.hexTiles, isFlat]);

  // 달(Moon): 밤쪽 절반 헥스들의 실루엣 — 반투명 어둠 오버레이 (턴마다 서↔동 교대)
  const nightOverlayPath = useMemo(() => {
    const nightSide = board.nightSide;
    if (!nightSide) return '';
    let d = '';
    const addHex = (col: number, row: number) => {
      if (getMoonSide({ col, row }) !== nightSide) return;
      const { x, y } = hexToPixel(col, row, undefined, undefined, undefined, isFlat);
      const pts = getHexPoints(x, y, HEX_SIZE, isFlat).split(' ');
      d += `M ${pts.join(' L ')} Z `;
    };
    board.hexTiles.forEach(h => { if (h.terrain !== 'lake') addHex(h.coord.col, h.coord.row); });
    board.cities.forEach(c => addHex(c.coord.col, c.coord.row));
    return d;
  }, [board.nightSide, board.hexTiles, board.cities, isFlat]);

  // 달(Moon): 밤/낮 배지 위치 — 각 반쪽 헥스들의 x 평균 + 최상단 y (마름모 좌상/우상 빈 공간)
  const sideBadgePos = useCallback((side: 'west' | 'east') => {
    let sumX = 0, minY = Infinity, n = 0;
    board.hexTiles.forEach(h => {
      if (h.terrain === 'lake' || getMoonSide(h.coord) !== side) return;
      const { x, y } = hexToPixel(h.coord.col, h.coord.row, undefined, undefined, undefined, isFlat);
      sumX += x; minY = Math.min(minY, y); n++;
    });
    if (n === 0) return null;
    return { x: sumX / n, y: minY - HEX_SIZE * 0.2 };
  }, [board.hexTiles, isFlat]);

  const nightBadge = useMemo(
    () => (board.nightSide ? sideBadgePos(board.nightSide) : null),
    [board.nightSide, sideBadgePos]
  );
  // 낮 배지 — 밤의 반대쪽 (태양 타일 자리, 사용자 요청 2026-07-21)
  const dayBadge = useMemo(
    () => (board.nightSide ? sideBadgePos(board.nightSide === 'west' ? 'east' : 'west') : null),
    [board.nightSide, sideBadgePos]
  );

  // 강 타일이 데이터로 "지나는 두 면"을 지정한 경우 (맵 데이터에 적힌 강 방향) — generic, 맵 분기 없음
  const riverEdgeMap = useMemo(() => {
    const m = new Map<string, [number, number]>();
    board.hexTiles.forEach(h => {
      // 산+강(Scotland $5) 헥스도 명시 강 방향을 따른다 — terrain 무관 riverEdges 우선
      if (h.riverEdges) m.set(`${h.coord.col},${h.coord.row}`, h.riverEdges);
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
    selectRouteOption,
    confirmRouteChoice,
    completeCubeMove,
    canRedirect,
    selectTrackToRedirect,
    redirectTrack,
    canPlaceNewCity,
    placeNewCity,
    canBuildTownSpur,
    buildTownSpur,
    buildDirectLink,
    buildFerryEdge,
  } = useGameStore();

  // 화물 운송 확인 창(설정 on일 때) — 목적지 클릭을 가로채 "출발→도착·수익 귀속"을 보여주고
  // [운송] 확인 시에만 selectDestinationCity로 커밋한다. 기본 off = 기존처럼 즉시 운송.
  // 후보 경로가 여럿이면(타인 철도) 경로 선택 모드 자체가 확인 단계라 가로채지 않는다.
  const handleSelectDestination = useCallback((coord: HexCoord) => {
    const s = useGameStore.getState();
    if (
      !useGameSettingsStore.getState().transportConfirmEnabled ||
      s.players[s.currentPlayer]?.isAI || // 봇 커밋 경로는 그대로 (표시 인스턴스 경유 방지)
      s.ui.routeChoice // 경로 선택 모드의 목적지 재클릭 = 확정 — 이미 명시적 확인
    ) {
      selectDestinationCity(coord);
      return;
    }
    const options = s.ui.routeOptions.find((r) => hexCoordsEqual(r.dest, coord))?.options ?? [];
    if (options.length > 1) {
      selectDestinationCity(coord); // 경로 선택 모드로 진입 (커밋 아님)
      return;
    }
    // 커밋될 경로 = 단일 후보 or (트랙 큐브 등 routeOptions 미사용 케이스) 최적 경로 미리보기.
    // ⚠️ movePath 폴백은 "최선 목적지 하나"의 경로다 — St.Lucia 트랙 큐브처럼 목적지가 여럿인데
    // 다른 목적지를 클릭한 경우 끝점이 어긋나므로, 일치할 때만 확인 창을 띄우고 아니면 즉시 커밋
    // (엉뚱한 경로·수익을 보여주는 것보다 확인 생략이 안전).
    const fallbackPath =
      s.ui.movePath.length > 1 && hexCoordsEqual(s.ui.movePath[s.ui.movePath.length - 1], coord)
        ? s.ui.movePath
        : null;
    const path = options[0]?.path ?? fallbackPath;
    if (!path) {
      selectDestinationCity(coord);
      return;
    }
    const stopName = (c: HexCoord): string | null => {
      const city = s.board.cities.find((x) => hexCoordsEqual(x.coord, c));
      if (city) return city.name;
      const town = s.board.towns.find((x) => hexCoordsEqual(x.coord, c));
      if (town) return town.newCityColor ? '신도시' : '마을';
      return null;
    };
    // 수익 귀속 = 정산(completeCubeMove)과 같은 미러(getPathLinkOwners) — 링크 소유자별 +1
    const owners = getPathLinkOwners(path, s.board);
    const tally = new Map<PlayerId, number>();
    let noIncomeLinks = 0;
    owners.forEach((o) => {
      if (o) tally.set(o, (tally.get(o) ?? 0) + 1);
      else noIncomeLinks++;
    });
    const gains: TransportPreview['gains'] = [];
    tally.forEach((n, pid) => {
      gains.push({
        name: s.players[pid]?.name ?? pid,
        color: PLAYER_COLORS[s.players[pid]?.color] ?? '#888888',
        amount: n,
        isMe: pid === s.currentPlayer,
      });
    });
    gains.sort((a, b) => (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0)); // 내 수입 먼저
    setTransportConfirm({
      coord,
      preview: {
        from: stopName(path[0]) ?? '트랙',
        to: stopName(path[path.length - 1]) ?? '목적지',
        linkCount: owners.length,
        gains,
        noIncomeLinks,
      },
    });
  }, [selectDestinationCity]);

  const { width: boardWidth, height: boardHeight } = useMemo(
    () => calculateBoardDimensions(mapData.cols, mapData.rows, undefined, undefined, isFlat),
    [mapData, isFlat]
  );
  // viewBox 자동 맞춤 (전 맵 공통) — calculateBoardDimensions는 사방 고정 여백 50px에 더해
  // 빈 가장자리 행/열까지 치수에 포함한다. 그래서 세로는 14~20%가 낭비되고, 가로는 빈 열이
  // 한쪽에만 있는 맵(달 좌133/우50, 튜토리얼 좌50/우145)이 한쪽으로 쏠려 보였다.
  // 실제로 그려지는 것(헥스·도시·마을)의 상하좌우 끝을 구해 viewBox를 그 범위 + 여백 30으로
  // 맞춘다 → 항상 중앙 정렬. 좌표계·게임 로직은 무변경(표시 영역만 조정).
  // (맵별 수동 보정이던 trimLeftHexes/trimRightHexes를 이 계산이 대체한다)
  const { viewTop, viewHeight, viewLeft, viewWidth } = useMemo(() => {
    // 헥스 반지름: pointy는 꼭짓점이 위아래(세로=HEX_SIZE, 가로=apothem), flat 전치는 그 반대
    const halfV = isFlat ? HEX_HORIZONTAL_RADIUS : HEX_VERTICAL_RADIUS;
    const halfH = isFlat ? HEX_SIZE : HEX_HORIZONTAL_RADIUS;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const add = (coord: HexCoord) => {
      const { x, y } = hexToPixel(coord.col, coord.row, undefined, undefined, undefined, isFlat);
      minX = Math.min(minX, x - halfH);
      maxX = Math.max(maxX, x + halfH);
      minY = Math.min(minY, y - halfV);
      maxY = Math.max(maxY, y + halfV);
    };
    board.hexTiles.forEach(h => {
      // 안 그리는 바다 헥스는 콘텐츠가 아니다 (그리는 맵이면 지도의 일부이므로 포함)
      if (h.terrain === 'lake' && mapData.hideLakeHexes) return;
      add(h.coord);
    });
    board.cities.forEach(c => add(c.coord));
    board.towns.forEach(t => add(t.coord));
    if (!Number.isFinite(minY) || !Number.isFinite(minX)) {
      return { viewTop: 0, viewHeight: boardHeight, viewLeft: 0, viewWidth: boardWidth };
    }
    // 여백: 좌·우·하 30, 상단은 100 — 우상단 호버링 버튼(줌 ±·신도시)이 보드 위에 떠 있어
    // 그만큼 비워야 헥스를 가리지 않는다. 달(랩 어라운드) 번호 박스가 변 바깥으로 최대
    // ~25px 튀어나오는 것도 30 안에 들어와 잘리지 않는다.
    // ⚠️ 0/boardWidth로 클램프하지 말 것 — 콘텐츠가 y=50~98에서 시작하는 맵이 많아
    //    Math.max(0, ...)에 걸리면 상단 100이 확보되지 않는다. viewBox는 음수/보드 밖
    //    좌표를 허용하며, 그 영역은 컨테이너 배경색으로 채워진다.
    const pad = 30;
    const padTop = 100;
    const top = minY - padTop;
    const bottom = maxY + pad;
    const left = minX - pad;
    const right = maxX + pad;
    return { viewTop: top, viewHeight: bottom - top, viewLeft: left, viewWidth: right - left };
  }, [board.hexTiles, board.cities, board.towns, mapData.hideLakeHexes, isFlat, boardHeight, boardWidth]);

  // 지형색 → 건설비용 범례 (hexCostMode: 'legend' 맵 — Western US). 지도에 헥스마다 숫자를
  // 찍지 않고 모서리에 한 번만 표시. 비용은 보드 hexTiles에서 직접 추출(맵 하드코딩 없음).
  const costLegend = useMemo(() => {
    if (mapData.hexCostMode !== 'legend') return [];
    const NAME: Partial<Record<TerrainType, string>> = {
      plain: '평지', river: '강', sea: '바다', swamp: '늪', mountain: '산',
      ...(mapData.terrainNames ?? {}), // 맵별 이름 오버라이드 (Montréal: swamp=도로, mountain=언덕)
    };
    // 순서: 평지 → 강/도로(swamp) → 언덕(mountain) → 바다 (Montréal: 평지/도로/언덕/바다, Western US: 평지/강/늪/산)
    const order: TerrainType[] = ['plain', 'river', 'swamp', 'mountain', 'sea'];
    const costByTerrain = new Map<TerrainType, number>();
    // fixedCost 미주입 지형은 룰북 표준 기본비용 (Southern China처럼 표준 비용 + 'legend' 조합
    // 맵에서 전부 $2로 찍히던 버그 수정 — 2026-07-27 사용자 발견)
    const TERRAIN_DEFAULT: Partial<Record<TerrainType, number>> = {
      plain: GAME_CONSTANTS.PLAIN_TRACK_COST,
      river: GAME_CONSTANTS.RIVER_TRACK_COST,
      swamp: GAME_CONSTANTS.RIVER_TRACK_COST,
      mountain: GAME_CONSTANTS.MOUNTAIN_TRACK_COST,
    };
    // 산+강 조합 헥스(Scotland $5 — terrain mountain + riverEdges): 지형 대표값이 아니라
    // 범례의 별도 "강+산" 조합 항목으로 표시 (없는 맵은 항목 자체가 안 생김)
    let mountainRiverCost: number | null = null;
    for (const h of board.hexTiles) {
      if (h.terrain === 'lake') continue;
      // 개별 표기 헥스(showCostMarker — 추가비용 $4/$5)는 지형 대표값이 아니므로 제외
      // (안 하면 마지막에 순회된 특수 헥스의 비용이 지형 전체 비용으로 둔갑)
      if (h.showCostMarker) continue;
      if (h.terrain === 'mountain' && h.riverEdges) {
        mountainRiverCost = h.fixedCost ?? GAME_CONSTANTS.MOUNTAIN_TRACK_COST;
        continue;
      }
      const cost = h.fixedCost ?? TERRAIN_DEFAULT[h.terrain] ?? 2;
      costByTerrain.set(h.terrain, cost);
    }
    const entries: { terrain: TerrainType; name: string; cost: number; combo?: 'mountainRiver' }[] =
      order
        .filter(t => costByTerrain.has(t))
        .map(t => ({ terrain: t, name: NAME[t] ?? t, cost: costByTerrain.get(t)! }));
    if (mountainRiverCost !== null) {
      entries.push({
        terrain: 'mountain',
        name: `${NAME.river ?? '강'}+${NAME.mountain ?? '산'}`,
        cost: mountainRiverCost,
        combo: 'mountainRiver',
      });
    }
    return entries;
  }, [mapData.hexCostMode, mapData.terrainNames, board.hexTiles]);

  // 터치 제스처 (핀치 줌, 팬) 지원.
  const svgRef = useRef<SVGSVGElement>(null);
  // getMetrics: 화면 픽셀 ↔ viewBox 좌표 축척을 SVG의 CTM에서 실측해 넘긴다. 이게 없으면
  // 훅이 "화면 1px = viewBox 1단위"로 계산해, 폭 1500짜리 보드를 360px 화면에서 끌 때
  // 손가락 100px에 보드는 24px만 따라오는 "찔끔 이동"이 된다.
  const getGestureMetrics = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || typeof svg.getScreenCTM !== 'function') return null;
    const ctm = svg.getScreenCTM();
    if (!ctm || !ctm.a) return null;
    return {
      unitsPerPixel: 1 / ctm.a,
      // 렌더 쪽 scale 원점과 동일해야 한다 (아래 <g transform>의 translate(중심) 참조)
      center: { x: viewLeft + viewWidth / 2, y: viewTop + viewHeight / 2 },
      // 역행렬은 여기서(=핀치 앵커를 구할 때만) 계산한다 — 팬 경로는 unitsPerPixel만 쓰므로
      // 위에서 미리 만들면 매 프레임 쓰지도 않을 inverse()를 돌리게 된다.
      toContent: (clientX: number, clientY: number) => {
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const p = pt.matrixTransform(ctm.inverse());
        return { x: p.x, y: p.y };
      },
    };
  }, [viewLeft, viewTop, viewWidth, viewHeight]);

  const {
    scale,
    position,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    isPanGesture,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useTouchGestures({
    minScale: 0.5,
    maxScale: 3.0,
    contentWidth: viewWidth,
    contentHeight: viewHeight,
    // 확대 상태에선 화면에 보이는 보드 크기의 30%만큼 더 끌 수 있게 여유를 준다 —
    // 가장자리에서 정확히 멈추면 맨 끝 헥스가 늘 화면 모서리에 붙어 있어 조작이 어렵다.
    overpanRatio: 0.3,
    // 터치는 훅이 non-passive 네이티브 리스너로 직접 등록한다 (React onTouch*는 passive라
    // preventDefault가 무시돼 두 손가락 제스처를 브라우저 페이지 확대가 가로챈다).
    // 미니맵(fitOverlay)은 조작 대상이 아니므로 ref를 주지 않아 등록 자체가 일어나지 않는다.
    targetRef: fitOverlay ? undefined : svgRef,
    getMetrics: getGestureMetrics,
  });

  // 완성된 링크 계산 (소유 마커 표시용)
  const completedLinks = useMemo(
    () => findCompletedLinks(board),
    [board]
  );

  // 완성된 링크에 포함된 트랙인지 확인 (경로종류별 — 복합 타일은 기본/보조가 독립이라
  // 한쪽만 완성된 상태가 정상이다. 좌표만으로 보면 보조가 완성됐다고 기본의 미완성 마커까지
  // 지워버린다).
  // 정부 트랙(Montréal, owner null)은 completedLinks(소유자 필수 목록)에 없으므로 직접 판정
  // — 안 하면 정부 완성 링크 마커가 영영 안 뜬다 (원본 룰: 정부 링크도 중립색 마커 표시).
  const completedPathKeys = useMemo(() => {
    const s = new Set<string>();
    for (const link of completedLinks) {
      for (const t of link.trackPaths) s.add(`${t.coord.col},${t.coord.row}:${t.kind}`);
    }
    return s;
  }, [completedLinks]);
  const isTrackInCompletedLink = useCallback(
    (coord: HexCoord, kind: 'P' | 'S' = 'P') => {
      if (completedPathKeys.has(`${coord.col},${coord.row}:${kind}`)) return true;
      const tile = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
      if (tile?.isGovernment) return isTrackPartOfCompletedLink(coord, board);
      return false;
    },
    [completedPathKeys, board]
  );

  // 큐브 이동 애니메이션 처리 - 1초 후 완료.
  // (오버레이 모드 GameBoard는 표시만 담당 — 메인 GameBoard가 completeCubeMove를 호출하므로 중복 방지)
  // safeTimeout: 창이 백그라운드여도 스로틀 없이 정산 — 온라인에서 호스트 창이 가려지면
  // 이동 정산이 멈춰 게임 전체가 서던 문제 방지
  // (화물 출발음은 제거 — 도착 정산 income 사운드(BoardPulses)와 이중이라 불필요, 2026-07-26)
  useEffect(() => {
    if (fitOverlay || !ui.movingCube) return;

    // 애니메이션 완료 후 처리 (1초)
    const cancel = safeTimeout(() => {
      completeCubeMove();
    }, turboDelay(1000));

    return cancel;
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
  // governmentLink(Montréal) 단계는 정부 트랙/가닥을 연결점으로 취급 (정부 모드)
  const isValidConnectionPoint = useCallback(
    (coord: HexCoord) => {
      return isValidConnectionPointUtil(coord, board, currentPlayer, currentPhase === 'governmentLink');
    },
    [board, currentPlayer, currentPhase]
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

  // 헥스 클릭 핸들러 — governmentLink(Montréal 정부 링크)도 동일한 건설 플로우 사용
  // 클릭했는데 아무 일도 일어나지 않는 헥스에 대한 안내.
  // 예전엔 완전 무반응이라 "규칙 위반인지, 차례가 아닌지, 앱이 멈춘 건지" 사용자가 구분할
  // 방법이 없었다(제보 2026-08-10: 빈 헥스를 눌러도 오류도 안내도 없어 멈춘 줄 알았다).
  const hintNoopClick = useCallback(
    (coord: HexCoord) => {
      const showToast = useToastStore.getState().showToast;
      if (isPanGesture()) return; // 드래그 직후의 클릭은 조작 의도가 아니다

      // ⚠️ 단계 게이트가 "내 차례 아님" 안내보다 **먼저**여야 한다. 정산 단계(수입·비용·
      // 수입감소·턴마커)는 방장이 '진행'으로 넘기는데 currentPlayer는 남일 수 있어서,
      // 여기서 차례 안내를 띄우면 방장이 "남 차례네"로 오해한다 — GameBoard가 같은 이유로
      // 정산 단계 HUD를 억제하고 있다(HUD_SUPPRESSED_PHASES). 건설 단계에서만 안내한다.
      if (currentPhase !== 'buildTrack' && currentPhase !== 'governmentLink') return;
      if (boardInteractionBlocked) {
        showToast('지금은 내 차례가 아니에요 — 차례가 오면 보드를 조작할 수 있어요', 'info');
        return;
      }
      if (ui.urbanizationMode) return; // 도시화 모드는 자체 안내(마을 선택)가 떠 있다

      if (natSelecting) {
        showToast('먼저 국유화할 철도를 고르세요 — 깜빡이는 철도를 클릭', 'info');
        return;
      }
      const terrain = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord))?.terrain;
      if (terrain === 'lake' || terrain === 'sea') {
        showToast('물 위에는 트랙을 놓을 수 없어요', 'info');
        return;
      }
      if (ui.buildMode === 'idle') {
        // 시작점 목록은 isValidConnectionPoint가 인정하는 것과 같아야 한다 —
        // 정부 링크 단계는 정부 트랙/정부 가닥이 "내 것" 역할을 한다.
        showToast(
          currentPhase === 'governmentLink'
            ? '먼저 시작점을 클릭하세요 — 도시, 또는 이미 놓인 정부 트랙'
            : '먼저 시작점을 클릭하세요 — 도시, 내 트랙(주인 없는 미완성 트랙 포함), 내 노선이 닿은 마을',
          'info'
        );
      } else if (ui.buildMode === 'source_selected') {
        showToast('노란색으로 표시된 헥스를 클릭해 트랙을 놓으세요', 'info');
      } else if (ui.buildMode === 'target_selected') {
        showToast('트랙이 나갈 방향(노란색 헥스)을 클릭하세요', 'info');
      }
    },
    [boardInteractionBlocked, isPanGesture, currentPhase, ui.urbanizationMode, ui.buildMode, natSelecting, board]
  );

  const handleHexClick = useCallback(
    (coord: HexCoord) => {
      if (boardInteractionBlocked) { hintNoopClick(coord); return; } // 내 차례가 아니면 무시 (봇/타인 차례 보호)
      if (isPanGesture()) return; // 드래그(팬)·핀치 직후의 클릭은 무시 (마우스·터치 공통)

      // Southern China 국유화 선택 — 대기 중엔 **다른 건설 조작보다 먼저** 가로챈다.
      // 대기가 풀릴 때까지 건설이 어차피 막혀 있으므로(buildSlice), 여기서 잡지 않으면
      // 후보 트랙 클릭이 "연결점 선택"으로 새어 혼란만 준다.
      if (natSelecting) {
        const linkId = natTileIndex.get(`${coord.col},${coord.row}`);
        if (linkId) {
          nationalizeLink(currentPlayer, linkId);
          setHoveredNatLinkId(null);
        } else {
          hintNoopClick(coord);
        }
        return;
      }

      if (currentPhase === 'buildTrack' || currentPhase === 'governmentLink') {
        // 미연결 가닥 완성: 내 트랙이 변에 닿아 있으나 가닥이 없는 마을 클릭 → 가닥 건설.
        // buildMode와 무관하게 최우선 — 같은 턴에 이미 일부 연결된 마을의 추가 변도 연결 가능.
        // ⚠️ 이 호출은 edge 생략 = "닿은 미연결 변 **전부**"를 한 번에 짓는다. 그래서
        //    시작점을 고른 뒤 그 이웃 마을을 클릭한 경우는 여기서 잡지 않고 아래 edge 지정
        //    분기로 넘긴다 — 사용자가 고른 방향 하나만 지어야 하는데 여기서 잡으면 같은
        //    마을의 다른 미연결 변(주인 없는 트랙 쪽 포함)까지 함께 지어져 예상 밖 비용이
        //    나가고, 노란 칸이 가리킨 것과 실제 건설이 어긋난다.
        const pickedTownDirection =
          ui.buildMode === 'source_selected' && !!ui.sourceHex &&
          [0, 1, 2, 3, 4, 5].some(e => hexCoordsEqual(getNeighborHex(ui.sourceHex!, e, board), coord));

        if (!pickedTownDirection && canBuildTownSpur(coord)) {
          buildTownSpur(coord);
          return;
        }

        if (ui.buildMode === 'idle') {
          // 유효한 연결점(도시 또는 기존 트랙) 클릭 → 선택
          if (isValidConnectionPoint(coord)) {
            selectSourceHex(coord);
          } else {
            hintNoopClick(coord);
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
              // board 전달 필수 — 랩 어라운드(달)에서 반대편 좌표를 돌려받아야 한다
              if (hexCoordsEqual(getNeighborHex(src, e, board), coord)) {
                const spurExists = (board.townSpurs ?? []).some(sp => hexCoordsEqual(sp.townCoord, src) && sp.edge === e);
                if (spurExists) {
                  // 이미 가닥이 있는 변 → 그 헥스로 트랙(노선) 이어가기
                  if (isBuildableTarget(coord)) { selectTargetHex(coord); return; }
                  hintNoopClick(coord);
                  return;
                } else {
                  // 가닥 없는 변 → 가닥만 단독 건설
                  if (buildTownSpur(src, e)) resetBuildMode();
                  return;
                }
              }
            }
            // 인접이 아니면 다른 연결점 재선택
            if (isValidConnectionPoint(coord)) selectSourceHex(coord);
            else hintNoopClick(coord);
            return;
          }

          // 노란 마을 칸 클릭 → 시작점 쪽 변으로 가닥 건설 (edge 지정).
          // 최상단의 canBuildTownSpur(coord)는 "내 트랙이 닿은 변 전부"를 보는 edge 생략
          // 호출이라, 시작점이 **도시**인 인접 마을(Scotland Ayr↔Glasgow 등)은 잡지 못한다.
          // 하이라이트를 띄운 판정(uiSlice의 spurTargets)과 같은 edge 지정 호출로 커밋한다.
          // ⛔ 클릭한 칸이 **마을일 때만** 이 경로로 보낸다 — 일반 헥스 클릭이 가닥 건설로
          //    새던 실전 사고(2026-08-10, 방 FGGKFB)의 1차 방어는 canBuildTownSpur 초입의
          //    마을 가드(스토어)이고, 여기는 UI 쪽 이중 방어 + "마을이 아니면 아래 연장/방향
          //    전환 분기로 넘긴다"는 라우팅이다. 조건은 uiSlice의 노란 후보(spurTargets)
          //    판정과 같아야 한다.
          const clickedIsTown = board.towns.some(
            t => hexCoordsEqual(t.coord, coord) && t.newCityColor === null
          );
          if (src && clickedIsTown) {
            for (let e = 0; e < 6; e++) {
              // board 전달 필수 — 랩 어라운드(달)에서 반대편 좌표를 돌려받아야 한다
              if (!hexCoordsEqual(getNeighborHex(src, e, board), coord)) continue;
              const spurEdge = getOppositeEdge(e);
              if (canBuildTownSpur(coord, spurEdge)) {
                if (buildTownSpur(coord, spurEdge)) resetBuildMode();
                return;
              }
              break;
            }
          }

          // 하이라이트된 헥스 클릭 → 대상 헥스 선택 (나가는 방향 UI 표시)
          if (isBuildableTarget(coord)) {
            selectTargetHex(coord);
            return;
          }

          // 소스가 미완성 트랙이면: 방향 전환 하이라이트 헥스 클릭 = 그 방향으로 즉시 전환($2).
          // 후보 계산은 uiSlice 하이라이트와 같은 헬퍼(getRedirectTargetHexes) — 미러 금지.
          // 연장 후보(isBuildableTarget)와 서로소라 위 분기와 겹치지 않는다.
          if (ui.sourceHex) {
            const rt = getRedirectTargetHexes(ui.sourceHex, board, currentPlayer)
              .find(t => hexCoordsEqual(t.coord, coord));
            if (rt) {
              // 방향 전환 후보로 표시해 놓고 커밋이 거부되면(현금 $2·건설 제한 등) 조용히
              // 실패해 "노란 칸을 눌렀는데 무반응"이 된다 — 이유를 알린다.
              if (redirectTrack(ui.sourceHex, rt.edge)) return;
              const { builtTracksThisTurn: b, maxTracksThisTurn: m } = useGameStore.getState().phaseState;
              useToastStore.getState().showToast(
                b >= m
                  ? `이번 턴 건설 제한에 도달했어요 (${b}/${m})`
                  : '이 방향으로는 방향 전환을 할 수 없어요 (방향 전환 비용 $2)'
              );
              return;
            }
          }

          // 다른 유효한 연결점 클릭 → 새로운 선택
          if (isValidConnectionPoint(coord)) {
            selectSourceHex(coord);
          } else {
            hintNoopClick(coord);
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
          } else {
            hintNoopClick(coord);
          }
        }
      }
    },
    // ⚠️ 국유화 가로채기(natSelecting·natTileIndex·nationalizeLink)가 이 콜백 **최상단**에
    //    있으므로 deps에 포함한다. 지금은 대기가 서고 풀리는 모든 사람 경로에서 board 참조도
    //    함께 바뀌어(applyNationalization·undo·스냅샷 적용) 실전에서 드러나지 않지만,
    //    board 불변인 채 대기만 바뀌는 경로가 하나라도 생기면 즉시 옛 클로저가 남아
    //    "대기가 풀렸는데 보드 클릭이 계속 먹통"이 된다. handleHexHover는 이미 포함돼 있다.
    [currentPhase, ui.buildMode, ui.sourceHex, ui.targetHex, board, currentPlayer, isValidConnectionPoint, isBuildableTarget, getExitEdgeForCoord, selectSourceHex, selectTargetHex, selectExitDirection, redirectTrack, resetBuildMode, canBuildTownSpur, buildTownSpur, boardInteractionBlocked, natSelecting, natTileIndex, nationalizeLink, isPanGesture, hintNoopClick]
  );

  // 헥스 호버 핸들러
  const handleHexHover = useCallback(
    (coord: HexCoord) => {
      // 국유화 선택 중: 후보 타일에 올리면 그 링크 전체를 강조 (링크 경계를 눈으로 확인)
      if (natSelecting) {
        setHoveredNatLinkId(natTileIndex.get(`${coord.col},${coord.row}`) ?? null);
        return;
      }
      if ((currentPhase === 'buildTrack' || currentPhase === 'governmentLink') && (ui.buildMode === 'source_selected' || ui.buildMode === 'target_selected')) {
        updateTrackPreview(coord);
      }
    },
    [natSelecting, natTileIndex, currentPhase, ui.buildMode, updateTrackPreview]
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
            {/* 정부 가닥(owner null — Montréal)은 정부 트랙과 동일하게 다크 그레이 */}
            <line x1={mid.x} y1={mid.y} x2={x} y2={y} stroke={sp.owner === null ? '#4E4D46' : terrainColors.plain} strokeWidth="6" strokeLinecap="round" />
            <line
              x1={tx - 8 * Math.cos(ang)} y1={ty - 8 * Math.sin(ang)}
              x2={tx + 8 * Math.cos(ang)} y2={ty + 8 * Math.sin(ang)}
              stroke="#4A4A42" strokeWidth="3" strokeLinecap="round"
            />
            {/* 가닥 소유자 미니 디스크 (2026-08-08 사용자 요청): 소유 디스크가 트랙 타일에만
                붙어 마을 헥스 안 가닥은 누구 것인지 안 보였다 — "레일은 중립색, 소유는 디스크"
                언어를 유지하며 침목 자리에 소형 디스크로 식별. 트랙 타일 디스크(r7)와 달리
                완성 링크 소속이어도 항상 표시한다(마을 안 즉시 식별이 목적 — 링크 중앙 마커는
                마을에서 멀 수 있다). 정부/공용 가닥(owner null)은 디스크 없음(룰과 동일). */}
            {sp.owner !== null && players[sp.owner] && (
              <circle
                cx={tx} cy={ty} r="5"
                fill={PLAYER_COLORS[players[sp.owner].color]}
                stroke="#1a1a1a" strokeWidth="1.5"
              />
            )}
            {/* 이번 턴에 건설한 가닥 표시 */}
            {sp.builtTurn === currentTurn && (
              <circle cx={(mid.x + x) / 2} cy={(mid.y + y) / 2} r="6" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.9" />
            )}
          </g>
        );
      });
    },
    [board.townSpurs, isFlat, terrainColors.plain, currentTurn, players]
  );

  // ── 모바일 화물 선택 팝업 ─────────────────────────────────────────────────────
  // 도시의 화물 큐브는 18px 간격으로 붙어 있어 좁은 화면에서는 특정 큐브를 손가락으로 짚기가
  // 거의 불가능하다. 그래서 모바일에서는 **도시를 누르면** 그 도시의 화물을 팝업에 펼쳐 고른다.
  // 데스크톱은 큐브 직접 클릭이 더 빠르므로 그대로 둔다.
  // (마을은 원래부터 헥스 클릭 = 큐브 선택이고 큐브도 1개뿐이라 대상이 아니다)
  const isNarrow = useIsNarrowViewport();
  const [cubePickerCityId, setCubePickerCityId] = useState<string | null>(null);
  const alreadyMovedThisRound = useGameStore(
    (s) => !!s.phaseState.playerMoves[s.currentPlayer]
  );
  // 팝업을 열 수 있는 조건일 때만 콜백을 넘긴다 — BoardCities는 존재 여부만 보고 판단한다.
  // 화물을 이미 골랐으면 도시 클릭은 "목적지 선택"이어야 하므로 넘기지 않는다.
  const canPickCubeByCity =
    !fitOverlay && // 미니맵은 관전용 — 콜백을 넘기면 팝업이 뜨지도 않는데 상태만 세팅된다
    isNarrow &&
    moveGoodsPhase &&
    !boardInteractionBlocked &&
    !ui.selectedCube &&
    !ui.movingCube &&
    !alreadyMovedThisRound;
  const cubePickerCity = cubePickerCityId
    ? board.cities.find((c) => c.id === cubePickerCityId) ?? null
    : null;
  // 단계·차례가 바뀌면 열려 있던 팝업을 닫는다 (스냅샷으로 남의 차례가 되는 경우 포함)
  useEffect(() => {
    if (!canPickCubeByCity) setCubePickerCityId(null);
  }, [canPickCubeByCity]);

  const handleCubeClick = useCallback(
    (cityId: string, cubeIndex: number) => {
      if (boardInteractionBlocked) return; // 내 차례가 아니면 무시 (봇/타인 차례 보호)
      if (currentPhase !== 'moveGoods') return;
      // 모바일 팝업 모드에서는 **큐브를 직접 눌러도** 팝업을 연다. 큐브가 도시 헥스의 꽤 넓은
      // 면적을 차지해서, 도시를 누른다고 누른 게 큐브에 맞는 일이 잦다 — 그때만 팝업이 안 뜨면
      // "될 때도 있고 안 될 때도 있는" UI가 된다. (도시 큐브만 — 마을/트랙 큐브는 그대로)
      if (canPickCubeByCity && !cityId.startsWith('town:') && !cityId.startsWith('track:')) {
        setCubePickerCityId(cityId);
        return;
      }
      selectCube(cityId, cubeIndex);
    },
    [currentPhase, selectCube, boardInteractionBlocked, canPickCubeByCity]
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

  // 보드 위 호버링 HUD (사용자 요청 2026-07-04): 스크롤해도 보이는 현재 플레이어 표시 + 줌 컨트롤.
  // 보드 컨테이너가 overflow-hidden이라 sticky가 안 먹혀 컨테이너 밖(fragment)에 둔다.
  const hudPlayer = players[currentPlayer];
  // 정산 단계(수입·비용·수입감소·턴마커)는 방장이 '진행' 버튼으로 넘긴다 — 아무도 "플레이" 하지
  // 않는데 currentPlayer(playerOrder[0]) 이름으로 "○○ 플레이 중" HUD가 뜨면 방장은 "남 차례네"로
  // 오해해 진행을 안 하고 서로 대기하는 착시가 생긴다.
  // ⚠️ 억제는 진행 주체(방장/오프라인)에게만 — 게스트에게까지 숨기면 "화면이 멈춘 것 같다"가 된다
  // (2026-07-24 사용자 보고). 게스트에겐 대신 "방장이 진행 중…" 중립 HUD를 띄운다.
  const HUD_SUPPRESSED_PHASES = ['collectIncome', 'payExpenses', 'incomeReduction', 'advanceTurn'];
  const isHumanSettlementPhase =
    HUD_SUPPRESSED_PHASES.includes(currentPhase) && !hudPlayer?.isAI;
  const isHumanSettlementHud = isHumanSettlementPhase && amIHost;
  // 게스트가 보는 정산 단계 HUD는 "누구 차례"가 아니라 "방장이 진행 중"이 진실이다.
  const hudIsHostProgress = isHumanSettlementPhase && !amIHost;
  // 다른 사람(온라인)/AI 차례, 또는 게스트의 정산 단계(방장 진행 중 안내)일 때 표시.
  // ⚠️ hudIsHostProgress를 빼면 "명목상 currentPlayer가 게스트 자신"인 정산 단계에서
  // HUD가 통째로 사라져 화면이 멈춘 듯 보인다 (2026-07-24 코드리뷰에서 조건-주석 불일치 발견).
  const showTurnHud =
    !fitOverlay && hudPlayer && !isHumanSettlementHud &&
    (hudIsHostProgress ||
      hudPlayer.isAI ||
      (myPlayerId !== null && currentPlayer !== myPlayerId));

  // 신도시 버튼 — 도시화 행동과 무관하게 게임 중 항상 표시(남은 신규 도시 타일을 미리 확인하고
  // 도시화 액션을 고를지 판단할 수 있게). 배치 모드(urbanizationMode) 중엔 숨긴다.
  const newCityTiles = useGameStore((s) => s.newCityTiles);
  const showNewCityBtn = !fitOverlay && !ui.urbanizationMode && !ui.selectedNewCityTile;

  return (
    <>
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      // overflow-hidden 금지: 줌 HUD가 sticky로 SVG 영역 안에서만 스크롤을 따라다니려면
      // 클리핑 조상이 없어야 한다 (모서리 라운딩은 헤더/범례에 rounded-t/b로 개별 적용)
      className={fitOverlay
        ? 'w-full'
        : 'rounded-xl border border-foreground/10 mx-auto'}
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
      <div className="px-4 py-3 bg-background-secondary/50 border-b border-foreground/10 rounded-t-xl">
        <div className="flex items-center justify-between gap-2">
          {/* ⚠️ 안내 문구는 buildMode(idle→source→target)마다 길이가 달라, 좁은 화면에서는
              클릭할 때마다 1줄↔2줄을 오간다. 그러면 헤더 높이가 20px씩 변하고 바로 아래
              보드가 통째로 위아래로 점프한다 — "건설할 때마다 레이아웃이 흔들리는" 원인.
              모바일에서는 2줄 높이를 미리 확보해 문구가 짧아도 높이가 그대로이게 하고,
              혹시 더 긴 문구가 들어와도 2줄에서 자른다. (md 이상은 항상 1줄이라 원래대로) */}
          <div className="flex-1 min-w-0 min-h-[2.5rem] md:min-h-0 flex items-center">
          <span className="text-sm text-foreground-secondary line-clamp-2">
            {currentPhase === 'buildTrack' && ui.urbanizationMode && '파란색 테두리의 마을을 클릭하여 신규 도시를 배치하세요'}
            {currentPhase === 'buildTrack' && !ui.urbanizationMode && ui.buildMode === 'idle' && '도시/기존 트랙 클릭 → 이어 짓기, Shift+클릭 → 방향 전환'}
            {currentPhase === 'buildTrack' && !ui.urbanizationMode && ui.buildMode === 'source_selected' && '노란색 헥스를 클릭하여 트랙을 건설하세요'}
            {currentPhase === 'buildTrack' && !ui.urbanizationMode && ui.buildMode === 'target_selected' && '트랙이 나갈 방향을 클릭하세요 (곡선/직선 선택)'}
            {currentPhase === 'buildTrack' && !ui.urbanizationMode && ui.buildMode === 'redirect_selected' && '방향 전환 패널에서 새 방향을 선택하세요'}
            {currentPhase === 'moveGoods' && !ui.selectedCube && !ui.movingCube && '물품 큐브를 클릭하세요'}
            {/* 가이드 off면 금색 테두리가 안 그려지므로 문구도 일반형으로 */}
            {currentPhase === 'moveGoods' && ui.selectedCube && (moveGuideOn ? '금색 테두리의 목적지 도시를 클릭하세요' : '배달할 목적지 도시를 클릭하세요')}
            {currentPhase === 'moveGoods' && ui.movingCube && '물품 이동 중...'}
            {currentPhase === 'governmentLink' && ui.buildMode === 'idle' && '정부 링크: 도시를 클릭해 무료 중립 링크를 건설하세요'}
            {currentPhase === 'governmentLink' && ui.buildMode === 'source_selected' && '노란색 헥스를 클릭하여 정부 트랙을 건설하세요'}
            {currentPhase === 'governmentLink' && ui.buildMode === 'target_selected' && '트랙이 나갈 방향을 클릭하세요 (곡선/직선 선택)'}
            {currentPhase !== 'buildTrack' && currentPhase !== 'moveGoods' && currentPhase !== 'governmentLink' && mapData.name}
          </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-accent whitespace-nowrap">
              {players[currentPlayer].name}의 차례
            </span>
            {/* 게임 설정(⚙)은 줌 컨트롤 옆 호버링 HUD에 — 헤더(motion.div 안)에 두면 온라인
                상대 차례의 클릭 차단 오버레이(z-20)에 덮여 관전 중 설정을 못 연다 */}
          </div>
        </div>
      </div>
      )}

      {/* SVG 보드 — 호버링 HUD(줌/신도시/차례 배지)는 motion.div 밖 형제 레이어로 분리 (아래 참조) */}
      <div className={fitOverlay ? undefined : 'relative'}>
      <svg
        ref={svgRef}
        width="100%"
        height={fitOverlay ? undefined : undefined}
        viewBox={`${viewLeft} ${viewTop + (!fitOverlay && scale < 1 ? (viewHeight * (1 - scale)) / 2 : 0)} ${viewWidth} ${!fitOverlay && scale < 1 ? viewHeight * scale : viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="block"
        // 터치(핀치 줌·팬)는 useTouchGestures가 non-passive 네이티브 리스너로 직접 등록한다 —
        // 여기에 React onTouch*를 함께 달면 같은 제스처가 두 번 처리된다.
        onMouseDown={fitOverlay ? undefined : handleMouseDown}
        onMouseMove={fitOverlay ? undefined : handleMouseMove}
        onMouseUp={fitOverlay ? undefined : handleMouseUp}
        onMouseLeave={fitOverlay ? undefined : handleMouseUp}
        style={{
          touchAction: 'none',
          // 보드를 끌 때 도시/마을 이름 같은 SVG 텍스트가 드래그 선택(파랗게 잡힘)되지 않도록.
          // 보드는 읽는 화면이지 복사하는 화면이 아니므로 선택 자체를 끈다.
          // WebkitUserSelect: 사파리/구형 크롬, WebkitTouchCallout: iOS 롱프레스 선택 팝업 방지.
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          // 데스크톱: 확대(scale>1) 상태에서만 드래그로 이동 가능 → grab 커서
          ...(fitOverlay ? {} : { cursor: scale > 1 ? 'grab' : 'default' }),
          // 오버레이: 우측 팝업 폭(100%)에 맞춰 비율 유지, 세로 제한.
          // ⚠️ svg 최대 높이는 반드시 "컨테이너 높이 − 헤더 바(~33px)" 안에 들어와야 한다 —
          // 이전 74vh는 컨테이너(70vh)보다 커서 세로로 긴 맵(독일·한국·St.Lucia)의 하단이
          // 잘렸다 (2026-07-26). 그 컨테이너 높이는 MoveCubeOverlay가 --aos-mini-h로 정하고
          // (모바일에선 더 작다) 여기서 그대로 받아 쓴다 — 폴백 70vh는 변수 없이 쓰일 때 대비.
          ...(fitOverlay ? { maxHeight: 'calc(var(--aos-mini-h, 70vh) - 44px)', display: 'block' } : {}),
        }}
        shapeRendering="geometricPrecision" // 벡터 품질 우선 (확대 시 선명)
      >
        <g
          transform={
            fitOverlay
              ? undefined
              // 보드 중심(viewBox 중앙) 기준으로 스케일 → 축소해도 화면 밖으로 쏠리지 않고
              // 중앙에서 균일하게 작아진다. (SVG는 CSS transform-origin이 안 먹으므로 좌표로 직접 계산)
              : `translate(${position.x}, ${position.y}) translate(${viewLeft + viewWidth / 2}, ${viewTop + viewHeight / 2}) scale(${scale}) translate(${-(viewLeft + viewWidth / 2)}, ${-(viewTop + viewHeight / 2)})`
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
            // 정부 링크 단계: 정부 타일(owner null)이 "내 트랙" 역할 — 클릭해 이어 지을 수 있어야 한다
            const hasGovTrack = board.trackTiles.some(
              t => hexCoordsEqual(t.coord, coord) && t.isGovernment
            );

            // 클릭 가능 여부: 트랙 건설 단계 = 하이라이트/내 트랙, 정부 링크 단계 = 하이라이트/정부 트랙
            // 국유화 선택 중엔 **후보 링크 타일만** 클릭 대상 — 나머지 클릭은 어차피
            // handleHexClick이 무시하므로, 커서(pointer)도 후보에만 뜨게 맞춘다.
            const isClickable = !isLake && (
              natSelecting
                ? natTileIndex.has(`${col},${row}`)
                : (currentPhase === 'buildTrack' && (isHighlighted || hasPlayerTrack)) ||
                  (currentPhase === 'governmentLink' && (isHighlighted || hasGovTrack))
            );

            return (
              <g key={`hex-${col}-${row}`}>
                {/* 후보가 아닌 헥스도 클릭은 받는다 — handleHexClick이 "왜 안 되는지"를 토스트로
                    안내한다(예전엔 onClick 자체가 없어 완전 무반응 = 멈춘 것으로 오해).
                    커서(pointer)만 후보에 한정해 "여기는 누를 수 있다" 표시는 그대로 유지. */}
                <polygon
                  points={getHexPoints(x, y, HEX_SIZE, isFlat)}
                  fill={
                    isHighlighted
                      ? 'rgba(212, 168, 83, 0.3)' // 건설 가능 헥스 하이라이트
                      : terrain === 'river'
                      ? terrainColors.plain // 강 헥스: 평지색 + 아래 강줄기 곡선 오버레이
                      : terrain === 'mountain'
                      ? MTN_RING_COLOR // 산악: 바깥 테두리색(안쪽은 inset 폴리곤이 내부색)
                      : hexTile?.landWedgeWest
                      ? terrainColors.plain // 사선 분할 바다(Montréal $5): 초록 바탕 + 아래 바다 폴리곤
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
                  onClick={() => handleHexClick(coord)}
                  onMouseEnter={() => handleHexHover(coord)}
                />
                {/* 사선 분할 바다(Montréal $5 헥스): 초록 바탕 위에 동쪽 바다 폴리곤 —
                    원본 시트처럼 좌상 꼭짓점→우하 꼭짓점 사선으로 서쪽 초록 쐐기를 남긴다 (flat 전용) */}
                {hexTile?.landWedgeWest && !isHighlighted && (() => {
                  const hw = (Math.sqrt(3) / 2) * HEX_SIZE; // flat-top 상하 평변까지의 높이
                  const S = HEX_SIZE;
                  const pts = [
                    [x - S / 2, y - hw], // 좌상 꼭짓점 (사선 시작)
                    [x + S / 2, y - hw], // 우상 꼭짓점
                    [x + S, y],          // 우측 꼭짓점
                    [x + S / 2, y + hw], // 우하 꼭짓점 (사선 끝)
                  ].map((p) => p.join(',')).join(' ');
                  return <polygon points={pts} fill={terrainColors.sea ?? '#3E7CA7'} style={{ pointerEvents: 'none' }} />;
                })()}
                {/* 산악: 안쪽 내부색 폴리곤 → 바깥 테두리색이 띠로 남음. 클릭은 메인 폴리곤이 처리 */}
                {terrain === 'mountain' && !isHighlighted && (
                  <polygon
                    points={getHexPoints(x, y, HEX_SIZE - MTN_RING_INSET, isFlat)}
                    fill={MTN_BASE_COLOR}
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                {/* 강 헥스: 인접 강 헥스와 변에서 이어지는 연속 강줄기 (철도 타일처럼 흐름).
                    헥스 모양 clipPath로 강줄기가 외곽선을 넘어가지 않게 가둔다.
                    산+강 헥스(Scotland $5)는 산 지형 위에 riverEdges로 강줄기만 얹는다. */}
                {(terrain === 'river' || !!hexTile?.riverEdges) && !isHighlighted && (
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
                    'legend' 맵(Western US)은 지형별 비용이 균일 → 헥스 숫자 대신 좌하단 범례로 표시.
                    showCostMarker 헥스(Montréal)는 도로에 가려지지 않게 도로 레이어 뒤에서 별도 렌더. */}
                {hexTile?.fixedCost !== undefined && !isHighlighted
                  && mapData.hexCostMode !== 'legend' && (
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

        {/* 도로 라인 (Montréal — 원본 시트 재현: 검정 도로 + 노란 점선 중앙선). 순수 시각 요소,
            헥스 위·마을/도시/트랙 아래에 깔린다 (정거장이 도로를 자연스럽게 덮음). */}
        {(mapData.roads ?? []).map((line, i) => {
          const pts = line
            .map((p) => {
              const { x, y } = hexToPixel(p.coord.col, p.coord.row, undefined, undefined, undefined, isFlat);
              return `${x + (p.dx ?? 0)},${y + (p.dy ?? 0)}`;
            })
            .join(' ');
          return (
            <g key={`road-${i}`} style={{ pointerEvents: 'none' }}>
              <polyline points={pts} fill="none" stroke="#33312A" strokeWidth={12} strokeLinecap="round" />
              <polyline points={pts} fill="none" stroke="#E8C25A" strokeWidth={2} strokeDasharray="8 8" strokeLinecap="round" />
            </g>
          );
        })}

        {/* 원본 표기 비용 마커 (Montréal showCostMarker — 물 "6"×2·"5"×1). legend 맵의 헥스 숫자는
            보통 숨기지만 이 헥스들은 원본 시트에 인쇄돼 있어 표시 — 도로가 지나가는 헥스라 도로 위에 그린다. */}
        {mapData.hexCostMode === 'legend' && board.hexTiles
          .filter((h) => h.showCostMarker && h.fixedCost !== undefined)
          .map((h) => {
            const { x, y } = hexToPixel(h.coord.col, h.coord.row, undefined, undefined, undefined, isFlat);
            return (
              <g key={`costmark-${h.coord.col}-${h.coord.row}`} style={{ pointerEvents: 'none' }}>
                <polygon
                  points={getHexPoints(x, y, 19, isFlat)}
                  fill={shadeColor(terrainColors.plain ?? '#7fae5e', -38)}
                />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize="18" fontWeight="bold" fontFamily="system-ui, sans-serif">
                  {h.fixedCost}
                </text>
              </g>
            );
          })}

        {/* 지도 바깥 외곽선 — 헥스 실루엣의 바깥 변을 두꺼운 실선으로 (맵 테두리색).
            ⚠️ **최하단 레이어**(배경 직후, 마을/트랙/도시보다 아래): 오버레이에 두면 굵은
            테두리가 가장자리 도시의 색 테두리·트랙 위를 덮는다 (2026-07-27 사용자 요청). */}
        {mapOutlinePath && (
          <path
            d={mapOutlinePath}
            fill="none"
            stroke={mapData.colors.border}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: 'none' }}
          />
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
          repopPlacing={currentPhase === 'selectActions' && repopPending && ui.repopulationCube !== null}
          onRepopCityClick={(cityId) => {
            const cube = useGameStore.getState().ui.repopulationCube;
            if (!cube) return;
            if (useGameStore.getState().placeRepopulationCube(cube, cityId)) {
              useGameStore.getState().nextPhase();
            }
          }}
          cities={board.cities}
          dynamicCityColors={board.dynamicCityColors}
          cottonPorts={board.cottonPorts}
          directLinks={renderDirectLinks}
          players={players}
          currentPhase={currentPhase}
          isFlat={isFlat}
          cityDiceNumber={cityDiceNumber}
          isCityNight={(city) => isNightCity(city, board)}
          isCityNumberBoxBlack={(cityId, demandColor) => mapProfile.isCityNumberBoxBlack(cityId, demandColor)}
          sourceHex={ui.sourceHex}
          reachableDestinations={moveGoodsPhase ? ui.reachableDestinations : []}
          showMoveGuide={moveGuideVisible}
          selectedCube={moveGoodsPhase ? ui.selectedCube : null}
          onHexClick={handleHexClick}
          selectDestinationCity={handleSelectDestination}
          onCubeClick={handleCubeClick}
          onPickCityCube={canPickCubeByCity ? setCubePickerCityId : undefined}
          buildDirectLink={buildDirectLink}
          buildTownSpur={buildTownSpur}
          natDirectIndex={natDirectIndex}
          onNationalizeDirect={(linkId) => nationalizeLink(currentPlayer, linkId)}
          ferryEdges={board.ferryEdges}
          buildFerryEdge={buildFerryEdge}
          allAcceptClosed={board.allAcceptClosed}
        />

        {/* 오버레이 레이어 — 미리보기·트랙 위 큐브·이동 경로/큐브·외곽선·경계·터미널 테두리 (board/BoardOverlays) */}
        <BoardOverlays
          board={board}
          currentPhase={currentPhase}
          isFlat={isFlat}
          blockedEdgePath={blockedEdgePath}
          whiteEdgePath={whiteEdgePath}
          nightOverlayPath={nightOverlayPath}
          nightBadge={nightBadge}
          dayBadge={dayBadge}
          borderColor={mapData.colors.border}
          previewTrack={ui.previewTrack}
          selectedCubeCityId={moveGoodsPhase ? (ui.selectedCube?.cityId ?? null) : null}
          movePath={moveGuideVisible ? ui.movePath : []}
          movingCube={ui.movingCube}
          routeChoice={moveGoodsPhase ? ui.routeChoice : null}
          players={players}
          selectCube={selectCube}
          selectRouteOption={selectRouteOption}
          confirmRouteChoice={confirmRouteChoice}
        />
        {/* Southern China 국유화 선택 — 후보 링크 타일 하이라이트 (트랙·도시 위 레이어).
            호버한 링크는 그 **전체**가 진하게 = 국유화되면 어디까지 중립이 되는지 보여준다.
            클릭 판정은 handleHexClick이 같은 natTileIndex로 하므로 표시=판정이 항상 일치. */}
        {natSelecting && natTargets.length > 0 && (
          <g style={{ pointerEvents: 'none' }}>
            {natTargets.map((link) => {
              const isHot = hoveredNatLinkId === link.id;
              return (
                <g key={link.id}>
                  {link.trackTiles.map((c) => {
                    const { x, y } = hexToPixel(c.col, c.row, undefined, undefined, undefined, isFlat);
                    return (
                      <polygon
                        key={`${c.col},${c.row}`}
                        points={getHexPoints(x, y, HEX_SIZE - 1, isFlat)}
                        fill={isHot ? 'rgba(192,74,43,0.28)' : 'rgba(192,74,43,0.12)'}
                        stroke="#c04a2b"
                        strokeWidth={isHot ? 4 : 2.5}
                        strokeDasharray={isHot ? undefined : '6 4'}
                      >
                        {!isHot && (
                          <animate
                            attributeName="stroke-opacity"
                            values="1;0.45;1"
                            dur="1.8s"
                            repeatCount="indefinite"
                          />
                        )}
                      </polygon>
                    );
                  })}
                </g>
              );
            })}
          </g>
        )}

        {/* 인플레이스 펄스 레이어 (건설/큐브 유입) — memo 자식으로 분리, 미니 오버레이에서도 표시 */}
        {/* viewTop: 가장자리 도시에서 떠오르는 스택이 viewBox에 잘리지 않게 방향을 뒤집는 기준 */}
        <BoardPulses isFlat={isFlat} viewTop={viewTop} silent={fitOverlay} />
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
          // 자동 맞춤된 표시 범위 안에 가두어 잘리지 않게
          const x0 = Math.min(viewLeft + viewWidth - w - 10, Math.max(viewLeft + 10, a.x - 66));
          const y0 = Math.min(viewTop + viewHeight - h - 10, Math.max(viewTop + 10, a.y - 96));
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={x0} y={y0} width={w} height={h} rx={10}
                fill="rgba(8,28,38,0.82)" stroke="#d4a853" strokeWidth={2} />
              <text x={x0 + pad} y={y0 + 25} fill="#e6c77a" fontSize={19} fontWeight="bold"
                fontFamily="system-ui, sans-serif">건설 비용</text>
              {costLegend.map((e, i) => {
                const ry = y0 + 36 + i * rowH;
                // 도로 이름(Montréal terrainNames로 swamp='도로')이면 실제 도로처럼:
                // 초록 바탕 + 검정 도로 + 노란 점선 중앙선
                const isRoad = e.name === '도로';
                return (
                  <g key={`legend-${e.combo ?? e.terrain}`}>
                    <rect x={x0 + pad} y={ry} width={swatch} height={swatch} rx={3}
                      fill={terrainColors[e.terrain] ?? terrainColors.plain}
                      stroke="rgba(0,0,0,0.5)" strokeWidth={1.5} />
                    {isRoad && (
                      <>
                        <line x1={x0 + pad + 2} y1={ry + swatch / 2} x2={x0 + pad + swatch - 2} y2={ry + swatch / 2}
                          stroke="#33312A" strokeWidth={9} strokeLinecap="round" />
                        <line x1={x0 + pad + 3} y1={ry + swatch / 2} x2={x0 + pad + swatch - 3} y2={ry + swatch / 2}
                          stroke="#E8C25A" strokeWidth={1.6} strokeDasharray="4 4" strokeLinecap="round" />
                      </>
                    )}
                    {/* 강+산 조합(Scotland $5): 산 스와치 위 파란 물결 — 보드의 산+강 헥스 모양 그대로 */}
                    {e.combo === 'mountainRiver' && (
                      <path
                        d={`M ${x0 + pad + 2} ${ry + swatch / 2 + 2} q 4.5 -7 9 0 t 9 0`}
                        fill="none"
                        stroke={terrainColors.river ?? '#4a90c8'}
                        strokeWidth={4}
                        strokeLinecap="round"
                      />
                    )}
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
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-2 py-4 px-6 bg-background-secondary/50 border-t border-foreground/10 rounded-b-xl">
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
    {/* 보드 위 호버링 HUD(줌/신도시/차례 배지) — 채팅 버튼(GameChat)과 동일 패턴: GamePageClient의
        보드 래퍼(relative) 안에서 motion.div의 "형제" absolute 레이어(z-30)로 띄운다.
        motion.div 안에 두면 transform/contain이 만드는 스태킹 컨텍스트에 갇혀, 온라인 상대 차례의
        클릭 차단 오버레이(GamePageClient, z-20)를 내부 z-index로는 못 이긴다 — 줌/신도시는 로컬 UI
        (게임 상태 무변경)라 관전 중에도 눌 수 있어야 하므로 밖에서 오버레이 위(z-30)에 올린다 */}
    {!fitOverlay && (
      <div
        className="absolute inset-0 z-30 pointer-events-none"
        // boardDisplayScale 맵(St. Lucia)은 보드(motion.div)가 maxWidth로 축소·중앙 정렬되므로
        // 레이어도 같은 폭·정렬을 미러링 — 안 하면 버튼이 보드 밖 래퍼 여백에 뜬다.
        // ⚠️ transform 중앙정렬 금지: transform은 sticky(줌/배지 스크롤 추적)를 깨뜨린다
        style={
          mapData.boardDisplayScale && mapData.boardDisplayScale !== 1
            ? { maxWidth: `${mapData.boardDisplayScale * 100}%`, marginInline: 'auto' }
            : undefined
        }
      >
        {/* 레이어가 보드 헤더까지 덮으므로, 헤더 높이만큼 초기 위치를 내려 SVG 영역에서 시작 */}
        <div className="h-[46px]" aria-hidden />
        {/* 줌 컨트롤: 보드 영역 안에서만 스크롤을 따라다님 (페이지 침범 없음) */}
        <div className="sticky top-[70px] flex justify-end px-3 pt-3">
          <div className="pointer-events-auto flex gap-1.5">
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
            {/* 게임 설정 창 (운송 가이드·운송 확인·좌표) — 전부 로컬 개인 설정(게임 상태 무변경)이라
                줌과 마찬가지로 다른 사람/봇 차례(관전 중)에도 열 수 있어야 함 → 오버레이 위 z-30 레이어 */}
            <motion.button
              onClick={() => setSettingsOpen(true)}
              className="glass-card p-2 hover:bg-accent/20 transition-colors rounded-lg shadow-lg"
              aria-label="게임 설정"
              title="게임 설정 (운송 가이드 · 운송 확인 창 · 좌표 표시)"
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.1 }}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Settings className="w-4 h-4 text-accent" />
            </motion.button>
          </div>
        </div>
        {/* 신도시 버튼 — 줌 아래. 도시화 행동과 무관하게 남은 신규 도시 타일을 확인(중앙 모달).
            배치는 도시화 행동을 골랐을 때 별도 흐름(UrbanizationPanel)으로 진행한다 */}
        {showNewCityBtn && (
          <div className="sticky top-[116px] flex justify-end px-3 pt-2">
            <button
              onClick={() => setShowNewCityInfo(true)}
              className="pointer-events-auto glass-card flex items-center gap-1.5 px-3 py-2 rounded-lg shadow-lg text-sm font-medium text-foreground hover:bg-accent/20 transition-colors"
              title="남은 신규 도시 타일 확인"
              aria-label="남은 신규 도시 타일 확인"
            >
              <Building2 className="w-4 h-4 text-accent" />
              신도시
            </button>
          </div>
        )}
        {/* 다른 사람/AI 차례 표시 — 보드 중앙, 화면 위에서 100px 지점에 호버링(스크롤 추적).
            보드 영역(absolute 레이어) 안에서만 따라다닌다 */}
        {showTurnHud && hudPlayer && (
          <div className="sticky top-[100px] z-20 h-0 flex justify-center pointer-events-none">
            <div
              // backdrop-blur 제거: 이 배지는 sticky(스크롤 추적)라 스크롤 중 backdrop-filter가
              // 매 프레임 재계산돼 화면 전체가 깜빡였다. 배경이 95% 불투명이라 blur는 거의 안
              // 보이던 효과 — 제거해도 시각 차이는 없고 깜빡임만 사라진다. (sticky엔 translateZ
              // 격리를 쓸 수 없어 — transform이 containing block을 만들어 sticky가 깨짐 — 제거가 정답)
              className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-background-secondary/95 border-2 shadow-xl self-start"
              style={{
                // 정산 단계(게스트)는 특정 플레이어의 차례가 아니므로 중립 보더를 쓴다
                borderColor: hudIsHostProgress
                  ? 'rgba(110,106,97,0.7)'
                  : `${PLAYER_COLORS[hudPlayer.color]}B3`,
              }}
            >
              <span
                className="w-3 h-3 rounded-full animate-pulse"
                style={{
                  backgroundColor: hudIsHostProgress
                    ? '#6e6a61'
                    : PLAYER_COLORS[hudPlayer.color],
                }}
              />
              {/* 텍스트 크기 = 기존(text-xs 12px)의 1.3배 */}
              <span className="text-[15.6px] font-semibold text-foreground whitespace-nowrap">
                {hudIsHostProgress
                  ? '방장이 진행 중…'
                  : `${hudPlayer.name} 플레이 중${hudPlayer.isAI ? ' (BOT)' : ''}…`}
              </span>
            </div>
          </div>
        )}
      </div>
    )}
    {/* 신도시 확인 모달(중앙) — contain:paint인 motion.div 밖에 둬야 fixed가 뷰포트 기준이 된다.
        배경(모달 밖=보드 등) 클릭 시 onClose로 닫힌다 */}
    {!fitOverlay && (
      <NewCityTilesModal
        open={showNewCityInfo}
        tiles={newCityTiles}
        mapId={mapId}
        mode="view"
        onClose={() => setShowNewCityInfo(false)}
      />
    )}
    {/* 게임 설정 창 (⚙ — 운송 가이드·운송 확인·좌표) + 화물 운송 확인 창.
        운송 확인은 미니맵(fitOverlay) 클릭에서도 뜰 수 있게 조건 없이 렌더 (fixed 중앙 표시) */}
    {!fitOverlay && <GameSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
    <TransportConfirmDialog
      preview={transportConfirm?.preview ?? null}
      onConfirm={() => {
        if (transportConfirm) selectDestinationCity(transportConfirm.coord);
        setTransportConfirm(null);
      }}
      onCancel={() => setTransportConfirm(null)}
    />
    {/* 모바일 화물 선택 팝업 — 도시를 누르면 그 도시 화물을 크게 펼쳐 고른다.
        고르고 나면 selectCube가 목적지 링·경로를 띄우는 기존 흐름 그대로다. */}
    {!fitOverlay && (
      <CubePickerDialog
        open={!!cubePickerCity}
        cityName={cubePickerCity?.name ?? ''}
        cubes={cubePickerCity?.cubes ?? []}
        onPick={(cubeIndex) => {
          // ⚠️ handleCubeClick을 부르면 안 된다 — 그건 "모바일이면 큐브 탭을 팝업으로 되돌리는"
          // 핸들러라, 여기서 부르면 selectCube 대신 팝업을 다시 열고 끝난다(화물이 안 골라져
          // 수송 가이드가 안 뜬다). 팝업은 이미 선택 UI이므로 스토어 액션을 직접 호출한다.
          if (cubePickerCity) selectCube(cubePickerCity.id, cubeIndex);
          setCubePickerCityId(null);
        }}
        onClose={() => setCubePickerCityId(null)}
      />
    )}
    </>
  );
}
