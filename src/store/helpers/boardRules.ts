// 보드 룰 순수 헬퍼 — 경계 변·마을 가닥·미완성 트랙 처리 (gameStore 스텝 3a 분리)

import { BoardState, HexCoord, PlayerId, TrackTile, GameState, GAME_CONSTANTS } from '@/types/game';
import { hexCoordsEqual, getNeighborHex, getOppositeEdge, isBlockedEdge } from '@/utils/hexGrid';
import { isTrackPartOfCompletedLink } from '@/utils/trackValidation';
import { getMapProfile } from '@/maps/getMapProfile';

/**
 * 이 플레이어의 빌더 턴 트랙 건설 상한.
 * 기본은 맵의 buildsPerTurn(표준 3, 달 2). Engineer 선택 시 +1 —
 * 단 Germany(engineerHalfCost)는 타일 수 혜택이 아니라 절반 할인이므로 +1 없음.
 */
export function maxTracksForBuilder(state: Pick<GameState, 'mapId' | 'players'>, playerId: PlayerId): number {
  const profile = getMapProfile(state.mapId);
  const base = profile.buildsPerTurn;
  const isEngineer = state.players[playerId]?.selectedAction === 'engineer';
  return isEngineer && !profile.engineerHalfCost ? base + 1 : base;
}

/**
 * 철도 건설 불가 경계 변을 넘는 트랙인지 판정.
 * edges 중 하나라도 막힌 경계(coord↔이웃)를 향하면 true → 건설 금지.
 * (변 단위 판정은 hexGrid.isBlockedEdge — AI 경로탐색과 동일 함수 공유)
 */
export function crossesBlockedEdge(board: BoardState, coord: HexCoord, edges: number[]): boolean {
  if (!board.blockedEdges || board.blockedEdges.length === 0) return false;
  return edges.some(e => isBlockedEdge(board, coord, getNeighborHex(coord, e, board)));
}

/**
 * 마을에서 빠져 있는 가닥(스퍼) 찾기 — 내 트랙이 마을 변에 닿아 있으나 가닥이 없는 변.
 * (카운트 부족으로 타일만 짓고 미연결된 트랙을 다음 턴에 buildTownSpur로 완성하는 용도)
 */
export function findMissingTownSpurs(
  townCoord: HexCoord,
  board: BoardState,
  /** null = 정부(Montréal governmentLink) — owner null 트랙(정부 트랙)이 닿은 변을 찾는다 */
  playerId: PlayerId | null
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
    const nb = getNeighborHex(townCoord, edge, board);
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
 *
 * ownerId를 주면 그 플레이어 소유 구간만 판정 — 룰 타이밍상 해제는 "그 플레이어의 건설 차례가
 * 끝날 때"이므로(gameStore buildTrack 차례 전환), 아직 건설 안 한 다른 플레이어 구간은 건드리지
 * 않는다. 생략하면 전체 소유자 대상(턴 종료 안전망).
 */
export function releaseUnextendedTrack(
  board: BoardState,
  currentTurn: number,
  ownerId?: PlayerId
): { board: BoardState; released: number } {
  const k = (c: HexCoord) => `${c.col},${c.row}`;
  // 소유된 미완성 트랙(완성 링크의 일부가 아님)만 대상
  const incomplete = board.trackTiles.filter(
    t => t.owner != null && (ownerId == null || t.owner === ownerId) && !isTrackPartOfCompletedLink(t.coord, board)
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
        const nb = getNeighborHex(t.coord, e, board);
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
/**
 * 이번 턴에 그 플레이어가 새로 깐 트랙 중 완성 링크에 속하지 않는 것(미완성 신설 트랙) 목록.
 * requireCompleteLinks(독일) 맵에서 단계 전환 시 제거 대상 — 버튼 비활성 판정도 이걸 공유한다.
 */
export function getIncompleteNewTracks(
  board: BoardState,
  currentTurn: number,
  playerId: PlayerId
): TrackTile[] {
  return board.trackTiles.filter(
    t => t.owner === playerId && t.builtTurn === currentTurn && !isTrackPartOfCompletedLink(t.coord, board)
  );
}

/** 위 목록이 하나라도 있는지 (UI 게이팅용 boolean) */
export function hasIncompleteNewTracks(
  board: BoardState,
  currentTurn: number,
  playerId: PlayerId
): boolean {
  return getIncompleteNewTracks(board, currentTurn, playerId).length > 0;
}

/**
 * Montréal 정부 링크: 이번 턴에 깐 정부 트랙(isGovernment) 중 완성 링크에 속하지 않는 것을
 * 제거한다 (원본 룰: "No stubs / unfinished track" — 무료 건설이라 환불 없음).
 * 함께 깐 정부 가닥(owner null, builtTurn 일치)도 제거.
 */
export function removeIncompleteGovernmentTracks(
  board: BoardState,
  currentTurn: number
): { board: BoardState; removed: number } {
  const k = (c: HexCoord) => `${c.col},${c.row}`;
  const incomplete = board.trackTiles.filter(
    t => t.isGovernment && t.builtTurn === currentTurn && !isTrackPartOfCompletedLink(t.coord, board)
  );
  if (incomplete.length === 0) return { board, removed: 0 };
  const removeKeys = new Set(incomplete.map(t => k(t.coord)));
  const trackTiles = board.trackTiles.filter(t => !removeKeys.has(k(t.coord)));
  const townSpurs = (board.townSpurs ?? []).filter(
    sp => !(sp.owner === null && sp.builtTurn === currentTurn && removeKeys.has(k(sp.townCoord)))
  );
  return { board: { ...board, trackTiles, townSpurs }, removed: removeKeys.size };
}

/**
 * Montréal 마스터 네트워크: 새 타일이 기존 네트워크(보드 위 모든 트랙의 총합)에 닿는지.
 * - 어느 변이든 이웃 타일이 마주보는 변으로 트랙을 갖고 있으면 연결 (소유자 무관 — 정부 포함)
 * - 어느 변이든 이웃이 "트랙이 하나라도 닿아 있는" 도시/마을이면 연결 (정거장이 트랙들을 잇는 허브)
 * - 보드에 트랙이 하나도 없으면 true (첫 정부 링크가 네트워크를 세운다)
 * 타일 단위 귀납 검사: 이전에 놓인 모든 타일이 이 검사를 통과했다면 네트워크는 항상 연속이다.
 */
export function touchesMasterNetwork(
  board: BoardState,
  coord: HexCoord,
  edges: number[],
  /** 달(Moon): 네트워크의 시드 도시 id — 이 도시는 트랙이 닿아 있지 않아도 항상 네트워크의
   *  허브다(모든 트랙이 Moon Base에서 뻗어야 함). 빈 보드에서도 시드 인접만 건설 가능.
   *  null/미지정 = 몬트리올식(첫 링크가 네트워크를 세움). */
  seedCityId?: string | null
): boolean {
  const seedCity = seedCityId ? board.cities.find(c => c.id === seedCityId) : undefined;
  const anyTrack = board.trackTiles.length > 0 || (board.townSpurs ?? []).length > 0;
  if (!anyTrack && !seedCity) return true; // 첫 정부 링크 — 네트워크 시작점 (Montréal)

  for (const e of edges) {
    const nb = getNeighborHex(coord, e, board);
    const back = getOppositeEdge(e);
    // ① 이웃 타일이 마주보는 변으로 트랙을 갖고 있으면 연결 (소유자 무관)
    const nbTile = board.trackTiles.find(t => hexCoordsEqual(t.coord, nb));
    if (nbTile && [...nbTile.edges, ...(nbTile.secondaryEdges ?? [])].includes(back)) return true;
    // ② 이웃 도시: 그 도시에 트랙이 하나라도 닿아 있으면 (도시는 모든 변을 잇는 허브).
    //    시드 도시(Moon Base)는 트랙이 없어도 항상 네트워크다.
    if (board.cities.some(c => hexCoordsEqual(c.coord, nb))) {
      if (seedCity && hexCoordsEqual(nb, seedCity.coord)) return true;
      if (stationHasAnyTrack(board, nb)) return true;
      continue;
    }
    // ③ 이웃 마을: 가닥이 하나라도 있으면 (마을 원이 진입 트랙들을 잇는 허브)
    const isTown = board.towns.some(t => hexCoordsEqual(t.coord, nb));
    if (isTown && (board.townSpurs ?? []).some(sp => hexCoordsEqual(sp.townCoord, nb))) return true;
  }
  return false;
}

/** 정거장(도시)에 트랙이 하나라도 닿아 있는지 (변을 마주보는 타일 트랙 존재 여부) */
function stationHasAnyTrack(board: BoardState, cityCoord: HexCoord): boolean {
  for (let e = 0; e < 6; e++) {
    const nb = getNeighborHex(cityCoord, e, board);
    const back = getOppositeEdge(e);
    const tile = board.trackTiles.find(t => hexCoordsEqual(t.coord, nb));
    if (tile && [...tile.edges, ...(tile.secondaryEdges ?? [])].includes(back)) return true;
  }
  return false;
}


export function removeIncompleteNewTracks(
  board: BoardState,
  currentTurn: number,
  playerId: PlayerId
): { board: BoardState; refund: number } {
  const k = (c: HexCoord) => `${c.col},${c.row}`;
  const incomplete = getIncompleteNewTracks(board, currentTurn, playerId);
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
