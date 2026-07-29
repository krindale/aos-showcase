// 트랙 건설 연결성 검증 유틸리티
import { HexCoord, BoardState, PlayerId, TrackTile } from '@/types/game';
import {
  getNeighborHex,
  getOppositeEdge,
  hexCoordsEqual,
  isCityOrTown,
  isTrackPartOfCompletedLink,
} from './hexGrid';

export {
  isCityOrTown,
  isTrackPartOfCompletedLink
};

/**
 * 연결점으로 유효한 헥스인지 확인 (도시 또는 플레이어의 트랙)
 */
/**
 * 플레이어의 트랙이 마을에 진입해 있는지 확인
 * (마을 헥스 위 타일 소유, 또는 인접 타일이 마을 쪽 변을 가짐)
 * 룰북: 마을은 진입하는 모든 트랙을 연결 — 진입한 플레이어는 마을의
 * 어느 방향으로든 새 트랙을 시작할 수 있는 허브가 된다.
 */
export function playerConnectsToTown(
  townCoord: HexCoord,
  board: BoardState,
  playerId: PlayerId
): boolean {
  const isTown = board.towns.some(t => hexCoordsEqual(t.coord, townCoord) && t.newCityColor === null);
  if (!isTown) return false;

  // 내 가닥(스퍼)이 마을 안에 있으면 진입 완료 — 마을 원이 모든 가닥을 연결
  return (board.townSpurs ?? []).some(
    sp => hexCoordsEqual(sp.townCoord, townCoord) && sp.owner === playerId
  );
}

/** 마을의 특정 변에 가닥(스퍼)이 있는지 (소유 무관 — 이동/링크용) */
export function townSpurAt(
  townCoord: HexCoord,
  edge: number,
  board: BoardState
) {
  return (board.townSpurs ?? []).find(
    sp => hexCoordsEqual(sp.townCoord, townCoord) && sp.edge === edge
  );
}

export function isValidConnectionPoint(
  coord: HexCoord,
  board: BoardState,
  currentPlayer: PlayerId,
  /** Montréal 정부 링크 건설 모드 — 정부 트랙(isGovernment)/정부 가닥(owner null)을 "내 것"으로 취급 */
  governmentMode = false
): boolean {
  // 도시인 경우 - 항상 유효한 연결점
  const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
  if (isCity) return true;

  if (governmentMode) {
    const trackAtCoord = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
    if (trackAtCoord?.isGovernment) return true;
    const isTown = board.towns.some(t => hexCoordsEqual(t.coord, coord) && t.newCityColor === null);
    if (isTown && (board.townSpurs ?? []).some(sp => hexCoordsEqual(sp.townCoord, coord) && sp.owner === null)) return true;
    return false;
  }

  // 플레이어의 기존 트랙이 있는 경우 (기본 경로 또는 보조 경로)
  const trackAtCoord = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
  const hasPlayerTrack = trackAtCoord && (
    trackAtCoord.owner === currentPlayer ||
    trackAtCoord.secondaryOwner === currentPlayer
  );
  if (hasPlayerTrack) return true;

  // 내 트랙이 진입해 있는 마을 - 마을은 진입 트랙을 모두 연결하는 허브
  if (playerConnectsToTown(coord, board, currentPlayer)) return true;

  // 미소유 미완성 트랙 (룰 IV: "다른 플레이어가 미소유 미완성 구간을 연장하면 소유권 주장 가능")
  // — 여기서 연장을 시작할 수 있다. 정부 트랙(Montréal, 중립)과 완성 링크 소속(파산 해제분)은 제외.
  if (trackAtCoord && trackAtCoord.owner === null && !trackAtCoord.isGovernment &&
      !isTrackPartOfCompletedLink(coord, board)) {
    return true;
  }

  return false;
}

/**
 * 정거장(도시/마을)이 마스터 네트워크(보드 위 아무 트랙)에 닿아 있는지 (Montréal).
 * 도시 = 어느 변이든 트랙이 마주보고 닿아 있으면 / 마을 = 가닥이 하나라도 있으면.
 * AI가 "네트워크에서 시작 가능한 경로"를 고를 때, 건설 시작 끝점 선택에 사용.
 */
export function stationInMasterNetwork(
  board: BoardState,
  stationCoord: HexCoord,
  /** 달(Moon): 시드 도시(Moon Base)는 트랙이 닿지 않아도 항상 네트워크다 */
  seedCityId?: string | null
): boolean {
  if (seedCityId) {
    const seed = board.cities.find(c => c.id === seedCityId);
    if (seed && hexCoordsEqual(seed.coord, stationCoord)) return true;
  }
  const isTown = board.towns.some(t => hexCoordsEqual(t.coord, stationCoord) && t.newCityColor === null);
  if (isTown) {
    return (board.townSpurs ?? []).some(sp => hexCoordsEqual(sp.townCoord, stationCoord));
  }
  for (let e = 0; e < 6; e++) {
    const nb = getNeighborHex(stationCoord, e, board);
    const back = getOppositeEdge(e);
    const tile = board.trackTiles.find(t => hexCoordsEqual(t.coord, nb));
    if (tile && [...tile.edges, ...(tile.secondaryEdges ?? [])].includes(back)) return true;
  }
  return false;
}

/**
 * Montréal 정부 링크 연결성 검증 — 정부 트랙은 도시(Station), 정부 트랙, 정부 가닥이 있는
 * 마을(Stop)에만 이어 지을 수 있다 (원본 룰: 정부 트랙도 정부 자신의 트랙으로 Station까지
 * 이어져야 함 — 플레이어 트랙에 잇는 건 "타인 트랙 직접 연결 금지"와 동일하게 불가).
 */
export function validateGovernmentTrackConnection(
  targetCoord: HexCoord,
  edges: [number, number],
  board: BoardState
): boolean {
  for (const edge of edges) {
    const neighbor = getNeighborHex(targetCoord, edge, board);
    if (board.cities.some(c => hexCoordsEqual(c.coord, neighbor))) return true;

    const isTown = board.towns.some(t => hexCoordsEqual(t.coord, neighbor) && t.newCityColor === null);
    if (isTown && (board.townSpurs ?? []).some(sp => hexCoordsEqual(sp.townCoord, neighbor) && sp.owner === null)) {
      return true;
    }

    const oppositeEdge = getOppositeEdge(edge);
    const nbTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighbor));
    if (nbTrack?.isGovernment && nbTrack.edges.includes(oppositeEdge)) return true;
  }
  return false;
}

/**
 * 첫 트랙 건설 규칙 검증 (도시에 인접해야 함)
 * targetCoord: 트랙이 배치될 헥스
 * edges: 트랙의 두 엣지
 */
export function validateFirstTrackRule(
  targetCoord: HexCoord,
  edges: [number, number],
  board: BoardState,
  /** Western US: 첫 트랙이 인접해야 하는 "시작 도시" id 집합 (미지정 시 모든 도시 허용). */
  allowedCityIds?: Set<string>
): boolean {
  // 타겟 헥스의 각 엣지에서 이웃 확인 — 첫 트랙은 도시에 인접해야 함
  // (St. Lucia: 시작 도시 0개 → 1턴엔 도시화로 만든 도시 인접에만 건설 가능)
  for (const edge of edges) {
    const neighbor = getNeighborHex(targetCoord, edge, board);
    const city = board.cities.find(c => hexCoordsEqual(c.coord, neighbor));
    if (city && (!allowedCityIds || allowedCityIds.has(city.id))) return true;
  }
  return false;
}

/**
 * 플레이어의 네트워크(트랙/가닥)가 이 도시에 이미 닿아 있는지.
 * (Western US 연속성 규칙: 새 트랙이 "아무 도시"에서 시작하는 분리 구간을 막기 위해 사용)
 */
export function playerNetworkTouchesCity(
  cityCoord: HexCoord,
  board: BoardState,
  playerId: PlayerId
): boolean {
  for (let edge = 0; edge < 6; edge++) {
    const neighbor = getNeighborHex(cityCoord, edge, board);
    const oppositeEdge = getOppositeEdge(edge);
    const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighbor));
    if (track) {
      if (track.owner === playerId && track.edges.includes(oppositeEdge)) return true;
      if (track.secondaryOwner === playerId && track.secondaryEdges?.includes(oppositeEdge)) return true;
    }
  }
  return false;
}

/**
 * 후속 트랙 건설 규칙 검증 (기존 트랙/도시에 연결되어야 함)
 * targetCoord: 트랙이 배치될 헥스
 * edges: 트랙의 두 엣지
 */
export function validateTrackConnection(
  targetCoord: HexCoord,
  edges: [number, number],
  board: BoardState,
  currentPlayer: PlayerId,
  /** Western US 연속성: true면 "아무 도시"에서 시작하는 분리 구간 금지 —
   *  도시 연결은 그 도시에 내 네트워크가 이미 닿아 있을 때만 인정 (대륙횡단 전). */
  requireNetwork = false
): boolean {
  for (const edge of edges) {
    const neighbor = getNeighborHex(targetCoord, edge, board);

    // 도시에 연결되는 경우
    const city = board.cities.find(c => hexCoordsEqual(c.coord, neighbor));
    if (city) {
      if (!requireNetwork || playerNetworkTouchesCity(neighbor, board, currentPlayer)) return true;
      // requireNetwork인데 내 네트워크가 안 닿은 도시 → 이 엣지로는 인정 안 함(다른 엣지 계속 확인)
    }

    // 내 트랙이 진입해 있는 마을에 연결되는 경우 (마을은 진입 트랙을 모두 연결)
    if (playerConnectsToTown(neighbor, board, currentPlayer)) return true;

    // 플레이어의 기존 트랙에 연결되는 경우
    const oppositeEdge = getOppositeEdge(edge);
    // 이웃 헥스의 모든 트랙 검색 (소유권 필터 없이)
    const neighborTrack = board.trackTiles.find(
      t => hexCoordsEqual(t.coord, neighbor)
    );

    if (neighborTrack) {
      // 1. 기본 경로(edges)가 내 소유이고 해당 엣지를 포함하는지 확인
      if (neighborTrack.owner === currentPlayer && neighborTrack.edges.includes(oppositeEdge)) {
        return true;
      }

      // 2. 보조 경로(secondaryEdges)가 내 소유이고 해당 엣지를 포함하는지 확인 (복합 트랙)
      if (neighborTrack.secondaryOwner === currentPlayer &&
          neighborTrack.secondaryEdges?.includes(oppositeEdge)) {
        return true;
      }

      // 3. 미소유 미완성 트랙에 연결 (룰 IV: 연장하면 그 구간 소유권 주장 — 인수는 buildTrack이 수행).
      //    정부 트랙(중립)은 제외. Western US 연속성(requireNetwork) 중엔 내 네트워크와 분리된
      //    구간 인수가 연속성 규칙을 깨므로 제외(기존 동작 유지).
      if (!requireNetwork && neighborTrack.owner === null && !neighborTrack.isGovernment &&
          neighborTrack.edges.includes(oppositeEdge) &&
          !isTrackPartOfCompletedLink(neighbor, board)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 플레이어가 트랙을 가지고 있는지 확인.
 * ⚠️ 복합 타일의 보조 경로(secondaryOwner)도 내 트랙이다 — 빠뜨리면 내 primary 타일이
 * 0개인 상황(남부 중국 국유화 직후, releaseUnextendedTrack으로 전부 풀린 직후, 첫 건설이
 * 상대 트랙 위 교차였던 경우)에서 canBuildTrack이 "첫 트랙 = 도시 인접" 분기로 빠져
 * 내 복합 트랙 끝에서 이어 짓기가 거부된다 (2026-07-29 사용자 보고).
 * 판정(canBuildTrack)과 사유(getBuildBlockReason)가 이 함수를 공유하므로 미러가 자동 유지.
 */
export function playerHasTrack(
  board: BoardState,
  playerId: PlayerId
): boolean {
  return board.trackTiles.some(t => t.owner === playerId || t.secondaryOwner === playerId);
}

/**
 * 특정 엣지에 트랙이 있는지 확인
 */
export function hasTrackAtEdge(
  coord: HexCoord,
  edge: number,
  trackTiles: TrackTile[]
): boolean {
  const track = trackTiles.find(t => hexCoordsEqual(t.coord, coord));
  if (track && (track.edges[0] === edge || track.edges[1] === edge)) {
    return true;
  }
  return false;
}

/**
 * 특정 헥스에서 연결 가능한 엣지 목록 반환
 * (트랙이 있는 헥스에서 빈 엣지들)
 */
export function getOpenEdges(
  coord: HexCoord,
  board: BoardState,
  currentPlayer: PlayerId
): number[] {
  // 소유권 필터 없이 해당 좌표의 트랙 검색
  const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));

  if (!track) {
    // 도시인 경우 모든 엣지가 열려있음
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
    if (isCity) {
      return [0, 1, 2, 3, 4, 5];
    }
    return [];
  }

  // 플레이어 소유 경로의 엣지만 반환 (복합 트랙 지원)
  const openEdges: number[] = [];

  // 기본 경로가 내 소유이면 해당 엣지 추가
  if (track.owner === currentPlayer) {
    openEdges.push(...track.edges);
  }

  // 보조 경로가 내 소유이면 해당 엣지 추가
  if (track.secondaryOwner === currentPlayer && track.secondaryEdges) {
    openEdges.push(...track.secondaryEdges);
  }

  return openEdges;
}



/** 링크 경로의 한 걸음 — 복합 타일은 기본(P)·보조(S) 경로가 서로 독립된 트랙이다. */
export type LinkPathStep = { coord: HexCoord; kind: 'P' | 'S' };

/**
 * 완성된 철도 링크인지 확인 (도시/마을 → 도시/마을 연결)
 *
 * ⚠️ 복합 타일(교차/공존)은 **진입 변이 속한 경로로만** 통과한다 — 기본 edges에 있으면 P,
 * secondaryEdges에 있으면 S. 예전엔 edges만 봐서 보조 경로로 이어진 링크를 통째로 놓쳤고,
 * 그 결과 교차/공존으로 완성한 링크의 VP가 0이었다 (2026-07-29 사용자 지시로 수정).
 * 이동 경로 탐색(hexGrid.checkConnectionToCity)이 쓰는 규칙과 같다.
 *
 * @returns { isComplete, endCoord, trackPath } — trackPath는 (좌표, 경로종류) 목록
 */
export function isCompletedLink(
  startCoord: HexCoord,
  startEdge: number,
  board: BoardState
): { isComplete: boolean; endCoord: HexCoord | null; trackPath: LinkPathStep[] } {
  // 시작점이 도시/마을이 아니면 false
  if (!isCityOrTown(startCoord, board)) {
    return { isComplete: false, endCoord: null, trackPath: [] };
  }

  // 방문 기록은 **(헥스 + 경로종류)** 단위 — 복합 타일의 두 트랙은 독립이라 한 경로가
  // 각각을 한 번씩 지나는 것은 합법이다(헥스 단위로 막으면 오탐).
  const visited = new Set<string>();
  const path: LinkPathStep[] = [];

  let currentCoord = startCoord;
  let currentEdge = startEdge;

  while (true) {
    // 다음 헥스로 이동
    const nextCoord = getNeighborHex(currentCoord, currentEdge, board);

    // 다음 헥스가 도시/마을이면 완성된 링크.
    // ⚠️ 단 **출발 정거장으로 되돌아온 순환은 링크가 아니다** — 룰북 "도시/마을이 자기
    // 자신에게 직접 연결될 수 없음". 예전엔 모든 헥스를 한 visited에 넣고 도시 판정보다
    // 먼저 검사해 이 경우가 걸렸는데, 방문 단위를 경로종류별로 바꾸면서 그 보호가
    // 사라졌다 → 출발점 비교로 명시적으로 막는다 (리뷰 R3에서 발견).
    if (isCityOrTown(nextCoord, board)) {
      if (hexCoordsEqual(nextCoord, startCoord)) {
        return { isComplete: false, endCoord: null, trackPath: path };
      }
      return { isComplete: true, endCoord: nextCoord, trackPath: path };
    }

    // 트랙 찾기
    const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, nextCoord));
    if (!track) {
      // 트랙이 없으면 미완성
      return { isComplete: false, endCoord: null, trackPath: path };
    }

    // 들어온 변이 어느 경로(기본/보조)에 속하는지 판정 — 그 경로로만 통과한다.
    const entryEdge = getOppositeEdge(currentEdge);
    let kind: 'P' | 'S';
    let exitEdge: number | undefined;
    if (track.edges.includes(entryEdge)) {
      kind = 'P';
      exitEdge = track.edges.find(e => e !== entryEdge);
    } else if (track.secondaryEdges?.includes(entryEdge)) {
      kind = 'S';
      exitEdge = track.secondaryEdges.find(e => e !== entryEdge);
    } else {
      // 어느 경로에도 연결되지 않음
      return { isComplete: false, endCoord: null, trackPath: path };
    }
    if (exitEdge === undefined) {
      return { isComplete: false, endCoord: null, trackPath: path };
    }

    const stepKey = `${nextCoord.col},${nextCoord.row}:${kind}`;
    if (visited.has(stepKey)) {
      return { isComplete: false, endCoord: null, trackPath: path };
    }
    visited.add(stepKey);

    path.push({ coord: nextCoord, kind });

    currentCoord = nextCoord;
    currentEdge = exitEdge;
  }
}



/**
 * 플레이어의 모든 완성된 링크 찾기 (점수 계산용)
 * @returns 완성된 링크 목록 (각 링크는 트랙 좌표 배열)
 */
export function findAllCompletedLinks(
  board: BoardState,
  playerId: PlayerId
): { from: HexCoord; to: HexCoord; tracks: HexCoord[]; trackPaths: LinkPathStep[] }[] {
  const completedLinks: { from: HexCoord; to: HexCoord; tracks: HexCoord[]; trackPaths: LinkPathStep[] }[] = [];
  const processedPairs = new Set<string>(); // 중복 방지

  // 모든 도시/마을에서 시작
  const startPoints = [
    ...board.cities.map(c => c.coord),
    ...board.towns.map(t => t.coord),
  ];

  for (const startCoord of startPoints) {
    // 모든 엣지 방향으로 탐색
    for (let edge = 0; edge < 6; edge++) {
      const neighborCoord = getNeighborHex(startCoord, edge, board);

      // 이웃이 플레이어의 트랙인 경우만 탐색 — 복합 타일의 보조 경로(secondaryOwner)도
      // 내 철도이므로, 정거장을 마주보는 변이 내 경로에 속하면 시작점으로 인정한다.
      const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighborCoord));
      if (!track) continue;
      const facingEdge = getOppositeEdge(edge);
      const mineFacing =
        (track.owner === playerId && track.edges.includes(facingEdge)) ||
        (track.secondaryOwner === playerId && !!track.secondaryEdges?.includes(facingEdge));
      if (!mineFacing) continue;

      // 완성된 링크 확인
      const result = isCompletedLink(startCoord, edge, board);

      if (result.isComplete && result.endCoord) {
        // 중복 체크 (A→B와 B→A는 같은 링크).
        // ⚠️ 알려진 한계: 키가 **정거장 쌍**이라, 같은 두 정거장을 잇는 서로 다른 경로를
        // 한 플레이어가 둘 다 소유하면(예: 기본 경로 하나 + 보조 경로 하나) 하나만 집계된다.
        // 원래도 있던 한계이고 실전 빈도가 낮아 그대로 둔다 (리뷰 R3).
        const pairKey1 = `${startCoord.col},${startCoord.row}-${result.endCoord.col},${result.endCoord.row}`;
        const pairKey2 = `${result.endCoord.col},${result.endCoord.row}-${startCoord.col},${startCoord.row}`;

        if (!processedPairs.has(pairKey1) && !processedPairs.has(pairKey2)) {
          processedPairs.add(pairKey1);

          // 모든 트랙이 해당 플레이어 소유인지 확인 — 경로 종류별로 소유자를 본다
          // (복합 타일은 기본/보조가 각각 다른 주인일 수 있다)
          const allOwned = result.trackPath.every(step => {
            const t = board.trackTiles.find(tile => hexCoordsEqual(tile.coord, step.coord));
            if (!t) return false;
            return step.kind === 'P' ? t.owner === playerId : t.secondaryOwner === playerId;
          });

          if (allOwned) {
            completedLinks.push({
              from: startCoord,
              to: result.endCoord,
              tracks: result.trackPath.map(s => s.coord),
              trackPaths: result.trackPath,
            });
          }
        }
      }
    }
  }

  return completedLinks;
}

/**
 * 물품 이동 경로가 유효한지 검증 (완성된 링크만 사용 가능)
 */
export function validateGoodsPath(
  path: HexCoord[],
  board: BoardState,
  engineLevel: number
): { valid: boolean; linksUsed: number; error?: string } {
  if (path.length < 2) {
    return { valid: false, linksUsed: 0, error: '경로가 너무 짧습니다' };
  }

  // 시작점과 끝점이 도시/마을인지 확인
  if (!isCityOrTown(path[0], board)) {
    return { valid: false, linksUsed: 0, error: '출발점이 도시/마을이 아닙니다' };
  }
  if (!isCityOrTown(path[path.length - 1], board)) {
    return { valid: false, linksUsed: 0, error: '도착점이 도시/마을이 아닙니다' };
  }

  let linksUsed = 0;

  // 경로 따라가며 유효성 검증
  for (let i = 0; i < path.length - 1; i++) {
    const current = path[i];
    const next = path[i + 1];

    // 현재와 다음이 인접한지 확인
    let foundEdge = -1;
    for (let edge = 0; edge < 6; edge++) {
      const neighbor = getNeighborHex(current, edge, board);
      if (hexCoordsEqual(neighbor, next)) {
        foundEdge = edge;
        break;
      }
    }

    if (foundEdge === -1) {
      return { valid: false, linksUsed, error: `${i}번째와 ${i + 1}번째 헥스가 인접하지 않습니다` };
    }

    // 다음 헥스가 도시/마을이면 링크 1개 사용
    if (isCityOrTown(next, board)) {
      linksUsed++;
      continue;
    }

    // 다음 헥스에 트랙이 있는지 확인
    const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, next));
    if (!track) {
      return { valid: false, linksUsed, error: `${i + 1}번째 헥스에 트랙이 없습니다` };
    }

    // 트랙이 연결되는지 확인
    const entryEdge = getOppositeEdge(foundEdge);
    if (!track.edges.includes(entryEdge)) {
      return { valid: false, linksUsed, error: `${i + 1}번째 트랙이 연결되지 않습니다` };
    }
  }

  // 엔진 레벨 확인
  if (linksUsed > engineLevel) {
    return { valid: false, linksUsed, error: `엔진 레벨(${engineLevel})보다 많은 링크(${linksUsed})를 사용합니다` };
  }

  return { valid: true, linksUsed };
}

/**
 * 점수 계산: 완성된 링크의 트랙 타일 수
 */
export function calculateTrackScore(
  board: BoardState,
  playerId: PlayerId
): number {
  const completedLinks = findAllCompletedLinks(board, playerId);

  // 완성된 링크에 포함된 트랙 구간 수 합산.
  // ⚠️ 집계 단위는 **헥스가 아니라 (헥스 + 경로종류)** — 룰북의 "완성된 철도 링크의 각 트랙
  // 구간당 +1점"에서 복합 타일의 두 트랙은 서로 독립된 구간이므로 각각 1점이다.
  // (좌표만으로 세면 같은 헥스의 기본/보조가 하나로 합쳐져 점수가 누락된다.)
  const completedTrackCoords = new Set<string>();
  for (const link of completedLinks) {
    for (const step of link.trackPaths) {
      completedTrackCoords.add(`${step.coord.col},${step.coord.row}:${step.kind}`);
    }
  }

  return completedTrackCoords.size;
}

/**
 * 특정 트랙이 미완성 구간의 끝점인지 확인
 * (한쪽 엣지만 다른 트랙/도시에 연결되어 있고, 다른 쪽은 빈 헥스거나 연결 안 됨)
 */
export function isEndpointOfIncompleteSection(
  trackCoord: HexCoord,
  board: BoardState
): { isEndpoint: boolean; connectedEdge: number | null; openEdge: number | null } {
  const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, trackCoord));
  if (!track) {
    return { isEndpoint: false, connectedEdge: null, openEdge: null };
  }

  // 완성된 링크의 일부인지 확인
  if (isTrackPartOfCompletedLink(trackCoord, board)) {
    return { isEndpoint: false, connectedEdge: null, openEdge: null };
  }

  // 트랙의 두 엣지 검사
  let connectedCount = 0;
  let connectedEdge: number | null = null;
  let openEdge: number | null = null;

  for (const edge of track.edges) {
    const neighborCoord = getNeighborHex(trackCoord, edge, board);
    const oppositeEdge = getOppositeEdge(edge);

    // 이웃이 도시/마을인지 확인
    if (isCityOrTown(neighborCoord, board)) {
      connectedCount++;
      connectedEdge = edge;
      continue;
    }

    // 이웃에 연결된 트랙이 있는지 확인
    const neighborTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighborCoord));
    if (neighborTrack && neighborTrack.edges.includes(oppositeEdge)) {
      connectedCount++;
      connectedEdge = edge;
    } else {
      openEdge = edge;
    }
  }

  // 한쪽만 연결되어 있으면 끝점
  if (connectedCount === 1 && openEdge !== null) {
    return { isEndpoint: true, connectedEdge, openEdge };
  }

  return { isEndpoint: false, connectedEdge: null, openEdge: null };
}

/**
 * 트랙을 방향 전환할 수 있는지 확인
 * - 미완성 구간의 끝점이어야 함
 * - 소유자가 없거나 현재 플레이어 소유여야 함
 */
export function canRedirectTrack(
  trackCoord: HexCoord,
  board: BoardState,
  currentPlayer: PlayerId
): boolean {
  const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, trackCoord));
  if (!track) return false;

  // 정부 트랙(Montréal)은 중립 — 플레이어가 방향 전환/소유권 획득 불가
  if (track.isGovernment) return false;

  // 복합 트랙은 방향 전환 불가 (단순 트랙만 가능)
  if (track.trackType !== 'simple') return false;

  // 소유자 확인 (소유자 없거나 현재 플레이어 소유)
  if (track.owner !== null && track.owner !== currentPlayer) return false;

  // 완성된 링크의 일부인지 확인 (완성된 링크는 수정 불가)
  if (isTrackPartOfCompletedLink(trackCoord, board)) return false;

  return true;
}

/**
 * 방향 전환 가능한 엣지 목록 반환
 * (현재 연결된 엣지는 유지하고, 열린 엣지를 다른 방향으로 변경)
 */
export function getRedirectableEdges(
  trackCoord: HexCoord,
  board: BoardState,
  currentPlayer: PlayerId
): { currentOpenEdge: number; availableEdges: number[] } | null {
  const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, trackCoord));
  if (!track) return null;

  const { connectedEdge, openEdge } = isEndpointOfIncompleteSection(trackCoord, board);

  // 끝점이 아니더라도 리다이렉트를 시도할 수 있도록 허용 (AI 보정 등)
  // 연결된 엣지가 없으면 첫 번째 엣지를 기준으로 삼음
  const actualConnectedEdge = connectedEdge !== null ? connectedEdge : track.edges[0];
  void actualConnectedEdge; // 향후 확장용
  const actualOpenEdge = openEdge !== null ? openEdge : track.edges[1];

  // 가능한 방향들 (연결된 엣지 제외, 막힌 방향 제외)
  const availableEdges: number[] = [];

  for (let edge = 0; edge < 6; edge++) {
    // 현재 연결된 엣지는 제외
    if (edge === connectedEdge) continue;

    // 현재 열린 엣지도 선택지에 포함 (같은 방향 유지 가능)
    const neighborCoord = getNeighborHex(trackCoord, edge, board);

    // 도시 방향은 허용 — 룰북 방향 전환 규칙에 도시 금지 조항 없음.
    // 자기 미완성 구간을 도시로 틀어 링크를 완성하는 정상 플레이 (2026-07-21 룰 정합 수정).
    const isCityNeighbor = board.cities.some(c => hexCoordsEqual(c.coord, neighborCoord));
    const isTownNeighbor = board.towns.some(t => hexCoordsEqual(t.coord, neighborCoord));

    // 이웃이 유효한지 확인 (맵 밖·호수 제외). 도시/마을 헥스는 hexTiles에 항목이 없는 맵이
    // 있으므로(튜토리얼 등 — "도시 헥스는 지형 없음") 도시/마을이 아닐 때만 항목 없음 = 맵 밖.
    // 룰: "트랙이 그리드 밖으로 나가도록 건설 불가"
    const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, neighborCoord));
    if (!isCityNeighbor && !isTownNeighbor && (!hexTile || hexTile.terrain === 'lake')) continue;

    // 이웃 트랙 확인: 다른 플레이어 트랙·정부 트랙(중립)에 직접 연결되는 방향은 금지,
    // 내 트랙·미소유 트랙으로 잇는 방향은 허용
    const neighborTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighborCoord));
    if (neighborTrack) {
      const oppositeEdge = getOppositeEdge(edge);
      if (neighborTrack.edges.includes(oppositeEdge)) {
        if (neighborTrack.isGovernment) continue;
        if (neighborTrack.owner !== null && neighborTrack.owner !== currentPlayer) continue;
      }
    }

    availableEdges.push(edge);
  }

  return { currentOpenEdge: actualOpenEdge, availableEdges };
}

/**
 * 새 타일(coord/edges)이 미소유 미완성 트랙에 변으로 맞물리는지 — 룰 IV "인수 연장" 판정.
 * canBuildTrack의 첫 트랙 규칙 예외(내 트랙이 0개여도 미소유 구간에 이어 짓기 허용)와
 * getBuildBlockReason이 공유한다. 정부 트랙(중립)·완성 링크 소속(파산 해제분)은 제외.
 */
export function touchesClaimableUnownedTrack(
  coord: HexCoord,
  edges: [number, number],
  board: BoardState
): boolean {
  return edges.some(e => {
    const nb = getNeighborHex(coord, e, board);
    const nt = board.trackTiles.find(t => hexCoordsEqual(t.coord, nb));
    return !!nt && nt.owner === null && !nt.isGovernment
      && nt.edges.includes(getOppositeEdge(e))
      && !isTrackPartOfCompletedLink(nb, board);
  });
}

/**
 * 방향 전환 후보 이웃 헥스 — 미완성 트랙(내 것/미소유)을 소스로 선택했을 때,
 * "노란 칸 클릭 한 번 = 그 방향으로 방향 전환($2)"이 되는 대상 헥스 목록.
 * 트랙의 현재 변(edges) 방향은 연장 타깃(getBuildableNeighbors)이 담당하므로 제외 —
 * 연장 후보와 방향 전환 후보는 서로소가 되어 클릭 판정이 겹치지 않는다.
 * 하이라이트(uiSlice.selectSourceHex)와 클릭 판정(GameBoard)이 이 함수를 공유한다 — 미러 금지.
 */
export function getRedirectTargetHexes(
  trackCoord: HexCoord,
  board: BoardState,
  currentPlayer: PlayerId
): { coord: HexCoord; edge: number }[] {
  const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, trackCoord));
  if (!track) return [];
  if (!canRedirectTrack(trackCoord, board, currentPlayer)) return [];
  const info = getRedirectableEdges(trackCoord, board, currentPlayer);
  if (!info) return [];
  return info.availableEdges
    .filter(e => !track.edges.includes(e)) // 현재 변 방향은 연장 타깃이 담당 (중복 방지)
    .map(e => ({ coord: getNeighborHex(trackCoord, e, board), edge: e }));
}

/**
 * 마을에서 트랙을 교체할 수 있는지 확인
 */
export function canReplaceTrackInTown(
  townCoord: HexCoord,
  board: BoardState,
  currentPlayer: PlayerId
): boolean {
  // 마을인지 확인
  const isTown = board.towns.some(t => hexCoordsEqual(t.coord, townCoord));
  if (!isTown) return false;

  // 마을에 트랙이 있는지 확인
  const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, townCoord));
  if (!track) return false;

  // 소유자 확인 (마을 트랙은 자신의 것만 교체 가능)
  if (track.owner !== currentPlayer) return false;

  return true;
}
