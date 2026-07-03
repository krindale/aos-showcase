// 보드 룰 순수 헬퍼 — 경계 변·마을 가닥·미완성 트랙 처리 (gameStore 스텝 3a 분리)

import { BoardState, HexCoord, PlayerId, GAME_CONSTANTS } from '@/types/game';
import { hexCoordsEqual, getNeighborHex, getOppositeEdge, isBlockedEdge } from '@/utils/hexGrid';
import { isTrackPartOfCompletedLink } from '@/utils/trackValidation';

/**
 * 철도 건설 불가 경계 변을 넘는 트랙인지 판정.
 * edges 중 하나라도 막힌 경계(coord↔이웃)를 향하면 true → 건설 금지.
 * (변 단위 판정은 hexGrid.isBlockedEdge — AI 경로탐색과 동일 함수 공유)
 */
export function crossesBlockedEdge(board: BoardState, coord: HexCoord, edges: number[]): boolean {
  if (!board.blockedEdges || board.blockedEdges.length === 0) return false;
  return edges.some(e => isBlockedEdge(board, coord, getNeighborHex(coord, e)));
}

/**
 * 마을에서 빠져 있는 가닥(스퍼) 찾기 — 내 트랙이 마을 변에 닿아 있으나 가닥이 없는 변.
 * (카운트 부족으로 타일만 짓고 미연결된 트랙을 다음 턴에 buildTownSpur로 완성하는 용도)
 */
export function findMissingTownSpurs(
  townCoord: HexCoord,
  board: BoardState,
  playerId: PlayerId
): { townCoord: HexCoord; edge: number }[] {
  const isTown = board.towns.some(t => hexCoordsEqual(t.coord, townCoord) && t.newCityColor === null);
  if (!isTown) return [];

  const missing: { townCoord: HexCoord; edge: number }[] = [];
  for (let edge = 0; edge < 6; edge++) {
    // 이미 가닥이 있는 변은 (소유자 무관) 연결 완료
    const hasSpur = (board.townSpurs ?? []).some(
      sp => hexCoordsEqual(sp.townCoord, townCoord) && sp.edge === edge
    );
    if (hasSpur) continue;

    // 이 변 너머 이웃 타일에 내 트랙이 마을 쪽 엣지로 닿아 있는지
    const nb = getNeighborHex(townCoord, edge);
    const facingEdge = getOppositeEdge(edge);
    const tile = board.trackTiles.find(t => hexCoordsEqual(t.coord, nb));
    if (!tile) continue;
    const mineFacing =
      (tile.owner === playerId && tile.edges.includes(facingEdge)) ||
      (tile.secondaryOwner === playerId && tile.secondaryEdges?.includes(facingEdge));
    if (mineFacing) missing.push({ townCoord, edge });
  }
  return missing;
}

/**
 * 이번 턴에 연장(새 타일 추가)하지 않은 미완성 트랙 구간의 소유권을 해제(공용화)한다.
 * 룰(IV): "미완성 트랙 구간을 자기 턴에 추가 트랙으로 연장하지 않으면 소유 디스크가 제거되어
 * 미소유 상태가 된다. 방향 전환만으로는 연장으로 인정되지 않는다."
 * 연결된 같은-소유자 구간 단위로 판정 — 구간에 이번 턴(builtTurn===currentTurn) 타일이 하나라도
 * 있으면 유지, 없으면 그 구간 전체를 owner null로(점진 건설 구간이 매 턴 끊기지 않도록 구간 단위).
 */
export function releaseUnextendedTrack(board: BoardState, currentTurn: number): { board: BoardState; released: number } {
  const k = (c: HexCoord) => `${c.col},${c.row}`;
  // 소유된 미완성 트랙(완성 링크의 일부가 아님)만 대상
  const incomplete = board.trackTiles.filter(
    t => t.owner != null && !isTrackPartOfCompletedLink(t.coord, board)
  );
  if (incomplete.length === 0) return { board, released: 0 };
  const incByKey = new Map(incomplete.map(t => [k(t.coord), t]));
  const visited = new Set<string>();
  const releaseKeys = new Set<string>();

  for (const start of incomplete) {
    if (visited.has(k(start.coord))) continue;
    // 같은 소유자로 연결된 미완성 구간 BFS
    const group: typeof incomplete = [];
    const stack = [start];
    visited.add(k(start.coord));
    while (stack.length) {
      const t = stack.pop()!;
      group.push(t);
      for (const e of [...t.edges, ...(t.secondaryEdges ?? [])]) {
        const nb = getNeighborHex(t.coord, e);
        const nbT = incByKey.get(k(nb));
        if (!nbT || visited.has(k(nb)) || nbT.owner !== t.owner) continue;
        const back = (e + 3) % 6; // 인접 헥스에서 마주보는 변
        if (![...nbT.edges, ...(nbT.secondaryEdges ?? [])].includes(back)) continue;
        visited.add(k(nb));
        stack.push(nbT);
      }
    }
    // 구간에 이번 턴 연장(새 타일)이 하나도 없으면 전체 소유권 해제
    if (!group.some(t => t.builtTurn === currentTurn)) {
      group.forEach(t => releaseKeys.add(k(t.coord)));
    }
  }

  if (releaseKeys.size === 0) return { board, released: 0 };
  const updated = board.trackTiles.map(t =>
    releaseKeys.has(k(t.coord)) ? { ...t, owner: null } : t
  );
  return { board: { ...board, trackTiles: updated }, released: releaseKeys.size };
}

/**
 * Germany 미완성 링크 금지: 한 플레이어의 트랙 건설이 끝났을 때, 이번 턴에 새로 깐 트랙 중
 * 완성 링크(도시/마을↔도시/마을)에 속하지 않는 것을 제거하고 건설 비용을 환불한다.
 * (룰북: "미완성 트랙 구간 건설 불가, 완성된 링크만 건설 가능")
 */
export function removeIncompleteNewTracks(
  board: BoardState,
  currentTurn: number,
  playerId: PlayerId
): { board: BoardState; refund: number } {
  const k = (c: HexCoord) => `${c.col},${c.row}`;
  const incomplete = board.trackTiles.filter(
    t => t.owner === playerId && t.builtTurn === currentTurn && !isTrackPartOfCompletedLink(t.coord, board)
  );
  if (incomplete.length === 0) return { board, refund: 0 };
  const removeKeys = new Set(incomplete.map(t => k(t.coord)));
  let refund = 0;
  for (const t of incomplete) {
    const hex = board.hexTiles.find(h => hexCoordsEqual(h.coord, t.coord));
    refund += hex?.fixedCost !== undefined ? hex.fixedCost
      : hex?.terrain === 'mountain' ? GAME_CONSTANTS.MOUNTAIN_TRACK_COST
      : (hex?.terrain === 'river' || hex?.terrain === 'swamp') ? GAME_CONSTANTS.RIVER_TRACK_COST
      : GAME_CONSTANTS.PLAIN_TRACK_COST;
  }
  const trackTiles = board.trackTiles.filter(t => !removeKeys.has(k(t.coord)));
  // 제거된 트랙 좌표에 딸린 이번 턴 마을 가닥도 함께 제거 (미완성 노선의 일부)
  const townSpurs = (board.townSpurs ?? []).filter(
    sp => !(sp.owner === playerId && sp.builtTurn === currentTurn && removeKeys.has(k(sp.townCoord)))
  );
  return { board: { ...board, trackTiles, townSpurs }, refund };
}
