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
export function isValidConnectionPoint(
  coord: HexCoord,
  board: BoardState,
  currentPlayer: PlayerId
): boolean {
  // 도시인 경우 - 항상 유효한 연결점
  const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
  if (isCity) return true;

  // 플레이어의 기존 트랙이 있는 경우
  const playerTrack = board.trackTiles.find(
    t => hexCoordsEqual(t.coord, coord) && t.owner === currentPlayer
  );
  if (playerTrack) return true;

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
  board: BoardState
): boolean {
  // 타겟 헥스의 각 엣지에서 이웃 확인
  for (const edge of edges) {
    const neighbor = getNeighborHex(targetCoord, edge);
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, neighbor));
    if (isCity) return true;
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
  currentPlayer: PlayerId
): boolean {
  for (const edge of edges) {
    const neighbor = getNeighborHex(targetCoord, edge);

    // 도시에 연결되는 경우
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, neighbor));
    if (isCity) return true;

    // 플레이어의 기존 트랙에 연결되는 경우
    const oppositeEdge = getOppositeEdge(edge);
    const neighborTrack = board.trackTiles.find(
      t => hexCoordsEqual(t.coord, neighbor) && t.owner === currentPlayer
    );

    if (neighborTrack) {
      // 이웃 트랙의 엣지가 연결되는지 확인
      if (neighborTrack.edges.includes(oppositeEdge)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 플레이어가 트랙을 가지고 있는지 확인
 */
export function playerHasTrack(
  board: BoardState,
  playerId: PlayerId
): boolean {
  return board.trackTiles.some(t => t.owner === playerId);
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
  const track = board.trackTiles.find(
    t => hexCoordsEqual(t.coord, coord) && t.owner === currentPlayer
  );

  if (!track) {
    // 도시인 경우 모든 엣지가 열려있음
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
    if (isCity) {
      return [0, 1, 2, 3, 4, 5];
    }
    return [];
  }

  // 현재는 단순 트랙만 지원 (양쪽 엣지만 열림)
  // 복합 트랙 지원 시 확장 필요
  return track.edges;
}



/**
 * 완성된 철도 링크인지 확인 (도시/마을 → 도시/마을 연결)
 * @param startCoord 시작 헥스
 * @param startEdge 시작 방향 (엣지)
 * @param board 보드 상태
 * @returns { isComplete: boolean, endCoord: HexCoord | null, trackPath: HexCoord[] }
 */
export function isCompletedLink(
  startCoord: HexCoord,
  startEdge: number,
  board: BoardState
): { isComplete: boolean; endCoord: HexCoord | null; trackPath: HexCoord[] } {
  // 시작점이 도시/마을이 아니면 false
  if (!isCityOrTown(startCoord, board)) {
    return { isComplete: false, endCoord: null, trackPath: [] };
  }

  const visited = new Set<string>();
  const path: HexCoord[] = [];

  let currentCoord = startCoord;
  let currentEdge = startEdge;

  // 시작점 방문 처리
  visited.add(`${currentCoord.col},${currentCoord.row}`);

  while (true) {
    // 다음 헥스로 이동
    const nextCoord = getNeighborHex(currentCoord, currentEdge);
    const coordKey = `${nextCoord.col},${nextCoord.row}`;

    // 이미 방문한 헥스면 루프 (불완전)
    if (visited.has(coordKey)) {
      return { isComplete: false, endCoord: null, trackPath: path };
    }

    visited.add(coordKey);

    // 다음 헥스가 도시/마을이면 완성된 링크
    if (isCityOrTown(nextCoord, board)) {
      return { isComplete: true, endCoord: nextCoord, trackPath: path };
    }

    // 트랙 찾기
    const track = board.trackTiles.find(t => hexCoordsEqual(t.coord, nextCoord));
    if (!track) {
      // 트랙이 없으면 미완성
      return { isComplete: false, endCoord: null, trackPath: path };
    }

    // 경로에 추가
    path.push(nextCoord);

    // 다음 엣지 결정 (들어온 엣지의 반대편이 트랙의 다른 엣지)
    const entryEdge = getOppositeEdge(currentEdge);

    // 트랙의 두 엣지 중 들어온 엣지가 아닌 것이 나가는 엣지
    let exitEdge: number | null = null;
    if (track.edges[0] === entryEdge) {
      exitEdge = track.edges[1];
    } else if (track.edges[1] === entryEdge) {
      exitEdge = track.edges[0];
    } else {
      // 트랙이 연결되지 않음 (들어온 엣지가 트랙 엣지가 아님)
      return { isComplete: false, endCoord: null, trackPath: path };
    }

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
): { from: HexCoord; to: HexCoord; tracks: HexCoord[] }[] {
  const completedLinks: { from: HexCoord; to: HexCoord; tracks: HexCoord[] }[] = [];
  const processedPairs = new Set<string>(); // 중복 방지

  // 모든 도시/마을에서 시작
  const startPoints = [
    ...board.cities.map(c => c.coord),
    ...board.towns.map(t => t.coord),
  ];

  for (const startCoord of startPoints) {
    // 모든 엣지 방향으로 탐색
    for (let edge = 0; edge < 6; edge++) {
      const neighborCoord = getNeighborHex(startCoord, edge);

      // 이웃이 플레이어의 트랙인 경우만 탐색
      const track = board.trackTiles.find(
        t => hexCoordsEqual(t.coord, neighborCoord) && t.owner === playerId
      );

      if (!track) continue;

      // 완성된 링크 확인
      const result = isCompletedLink(startCoord, edge, board);

      if (result.isComplete && result.endCoord) {
        // 중복 체크 (A→B와 B→A는 같은 링크)
        const pairKey1 = `${startCoord.col},${startCoord.row}-${result.endCoord.col},${result.endCoord.row}`;
        const pairKey2 = `${result.endCoord.col},${result.endCoord.row}-${startCoord.col},${startCoord.row}`;

        if (!processedPairs.has(pairKey1) && !processedPairs.has(pairKey2)) {
          processedPairs.add(pairKey1);

          // 모든 트랙이 해당 플레이어 소유인지 확인
          const allOwned = result.trackPath.every(coord => {
            const t = board.trackTiles.find(tile => hexCoordsEqual(tile.coord, coord));
            return t && t.owner === playerId;
          });

          if (allOwned) {
            completedLinks.push({
              from: startCoord,
              to: result.endCoord,
              tracks: result.trackPath,
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
      const neighbor = getNeighborHex(current, edge);
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

  // 완성된 링크에 포함된 트랙 타일 수 합산
  const completedTrackCoords = new Set<string>();
  for (const link of completedLinks) {
    for (const coord of link.tracks) {
      completedTrackCoords.add(`${coord.col},${coord.row}`);
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
    const neighborCoord = getNeighborHex(trackCoord, edge);
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
  board: BoardState
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
    const neighborCoord = getNeighborHex(trackCoord, edge);

    // 이웃이 유효한지 확인 (호수, 맵 밖 제외)
    const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, neighborCoord));
    if (hexTile && hexTile.terrain === 'lake') continue;

    // 이웃이 도시가 아닌지 확인 (도시에 직접 들어가는 방향 전환은 불가)
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, neighborCoord));
    if (isCity) continue;

    // 이웃에 다른 플레이어의 트랙이 있으면 안 됨 (직접 연결 금지)
    const neighborTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, neighborCoord));
    if (neighborTrack) {
      const oppositeEdge = getOppositeEdge(edge);
      // 이웃 트랙이 반대 엣지를 가지고 있으면 연결됨 - 소유자 확인 필요
      if (neighborTrack.edges.includes(oppositeEdge) && neighborTrack.owner !== null) {
        // 다른 플레이어의 완성된 트랙에는 연결 불가
        continue;
      }
    }

    availableEdges.push(edge);
  }

  return { currentOpenEdge: actualOpenEdge, availableEdges };
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
