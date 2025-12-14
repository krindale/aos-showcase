// 트랙 건설 연결성 검증 유틸리티
import { HexCoord, BoardState, PlayerId, TrackTile } from '@/types/game';
import {
  getNeighborHex,
  getOppositeEdge,
  hexCoordsEqual,
} from './hexGrid';

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
