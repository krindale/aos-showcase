// 보드 룰 순수 헬퍼 — 경계 변·마을 가닥·미완성 트랙 처리 (gameStore 스텝 3a 분리)

import { BoardState, HexCoord, PlayerId, TrackTile, GameState, GAME_CONSTANTS, TRACK_REPLACE_COSTS } from '@/types/game';
import { hexCoordsEqual, getNeighborHex, getOppositeEdge, isBlockedEdge } from '@/utils/hexGrid';
import { isTrackPartOfCompletedLink } from '@/utils/trackValidation';
import { isSecondaryTrackPartOfCompletedLink } from '@/utils/hexGrid';
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
 * 룰(IV) 소유권 주장: 새 타일(coord/edges)이 미소유 미완성 트랙 구간에 이어지면(연장) 그 구간
 * 전체의 소유권을 건설자가 가져간다 — "다른 플레이어가 미소유 미완성 구간을 연장하면 소유권 주장
 * 가능". 방향 전환은 연장이 아니므로(룰: "방향 전환만으로는 연장으로 인정되지 않음") 호출하지 않는다.
 * 새 타일 변에서 시작해 미소유 트랙끼리 변이 맞물린 체인을 BFS로 모은다.
 * 제외: 정부 트랙(Montréal, 중립 — 인수 불가) · 완성 링크 소속 타일(파산 해제분 — 소유권은 영구라
 * 인수 대상 아님. 완성 링크 타일은 열린 변이 없어 실제로 닿을 수 없지만 방어적으로 차단).
 * 반환: 소유권을 넘길 타일 좌표 키("col,row") 집합.
 */
export function findClaimableSectionKeys(
  board: BoardState,
  coord: HexCoord,
  edges: [number, number]
): Set<string> {
  const k = (c: HexCoord) => `${c.col},${c.row}`;
  const claimKeys = new Set<string>();
  const visited = new Set<string>([k(coord)]);
  const stack: { coord: HexCoord; edges: number[] }[] = [{ coord, edges: [...edges] }];

  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of cur.edges) {
      const nb = getNeighborHex(cur.coord, e, board);
      const key = k(nb);
      if (visited.has(key)) continue;
      const nbTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, nb));
      if (!nbTrack || nbTrack.owner !== null || nbTrack.isGovernment) continue;
      if (!nbTrack.edges.includes(getOppositeEdge(e))) continue; // 변이 맞물려야 연결
      if (isTrackPartOfCompletedLink(nb, board)) continue;
      visited.add(key);
      claimKeys.add(key);
      stack.push({ coord: nb, edges: [...nbTrack.edges] });
    }
  }
  return claimKeys;
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

/** 이번 턴 내가 얹은 복합 secondary(교차/공존) 중 미완성인 타일 — 독일 미완성 제거 대상.
 *  builtTurn/owner는 원 타일 것이라 primary 검출(getIncompleteNewTracks)에 안 걸리고,
 *  완성 판정도 secondaryEdges 기준이어야 한다 (2026-07-24 독일 봇 게임 실측 버그). */
export function getIncompleteNewSecondaries(
  board: BoardState,
  currentTurn: number,
  playerId: PlayerId
): TrackTile[] {
  return board.trackTiles.filter(
    t =>
      t.secondaryOwner === playerId &&
      t.secondaryBuiltTurn === currentTurn &&
      !isSecondaryTrackPartOfCompletedLink(t.coord, board)
  );
}

/** 가닥이 완성 링크의 일부인지 — 가닥의 변 너머 타일이 맞물려 있고 그 트랙이 완성 링크여야 한다.
 *  (마을 자체가 정거장이므로, 변 너머 구간이 다른 정거장까지 닿으면 링크 완성) */
function isSpurPartOfCompletedLink(
  sp: { townCoord: HexCoord; edge: number },
  board: BoardState
): boolean {
  const nb = getNeighborHex(sp.townCoord, sp.edge, board);
  const opp = getOppositeEdge(sp.edge);
  const t = board.trackTiles.find(x => hexCoordsEqual(x.coord, nb));
  if (!t) return false;
  if (t.edges.includes(opp)) return isTrackPartOfCompletedLink(nb, board);
  if (t.secondaryEdges?.includes(opp)) return isSecondaryTrackPartOfCompletedLink(nb, board);
  return false;
}

/** 이번 턴 내가 만든 마을 가닥 중 미완성인 것 — 독일 미완성 제거 대상.
 *  (변 너머 타일이 없거나(고아 가닥) 그 구간이 다른 정거장에 닿지 않는 가닥.
 *   기존 제거 조건은 removeKeys(삭제 트랙 좌표)에 townCoord를 대조해 사실상 죽은 코드였다
 *   — 마을 헥스엔 타일이 없어 절대 매치 안 됨, 2026-07-24 독일 봇 게임 사용자 보고.) */
export function getIncompleteNewSpurs(
  board: BoardState,
  currentTurn: number,
  playerId: PlayerId
): { townCoord: HexCoord; edge: number }[] {
  return (board.townSpurs ?? []).filter(
    sp => sp.owner === playerId && sp.builtTurn === currentTurn && !isSpurPartOfCompletedLink(sp, board)
  );
}

/** 위 목록이 하나라도 있는지 (UI 게이팅용 boolean) — 이번 턴 교차 추가분(secondary)·마을 가닥 포함 */
export function hasIncompleteNewTracks(
  board: BoardState,
  currentTurn: number,
  playerId: PlayerId
): boolean {
  return (
    getIncompleteNewTracks(board, currentTurn, playerId).length > 0 ||
    getIncompleteNewSecondaries(board, currentTurn, playerId).length > 0 ||
    getIncompleteNewSpurs(board, currentTurn, playerId).length > 0
  );
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
  playerId: PlayerId,
  spurCost: number = 1 // 마을 가닥 1개 환불액 (MapProfile.townSpurCost — 호출부가 전달)
): { board: BoardState; refund: number; removed: { tiles: number; crossings: number; spurs: number } } {
  const k = (c: HexCoord) => `${c.col},${c.row}`;
  const incomplete = getIncompleteNewTracks(board, currentTurn, playerId);
  // 이번 턴 얹은 미완성 교차/공존(secondary)도 되돌린다 — 타일 삭제가 아니라 원 단순
  // 트랙으로 복원(원소유자 트랙 보존) + 교체비 환불 (2026-07-24 독일 봇 게임 실측:
  // 미완성 링크 제거 때 교차 추가분만 보드에 남던 버그)
  const incompleteSecondaries = getIncompleteNewSecondaries(board, currentTurn, playerId);
  if (incomplete.length === 0 && incompleteSecondaries.length === 0) {
    // 타일·교차가 없어도 고아 가닥만 남는 케이스가 가능 — 가닥 검사는 계속 진행
    const lone = getIncompleteNewSpurs(board, currentTurn, playerId);
    if (lone.length === 0) return { board, refund: 0, removed: { tiles: 0, crossings: 0, spurs: 0 } };
  }
  const removeKeys = new Set(incomplete.map(t => k(t.coord)));
  const revertKeys = new Set(incompleteSecondaries.map(t => k(t.coord)));
  let refund = 0;
  for (const t of incomplete) {
    const hex = board.hexTiles.find(h => hexCoordsEqual(h.coord, t.coord));
    refund += hex?.fixedCost !== undefined ? hex.fixedCost
      : hex?.terrain === 'mountain' ? GAME_CONSTANTS.MOUNTAIN_TRACK_COST
      : (hex?.terrain === 'river' || hex?.terrain === 'swamp') ? GAME_CONSTANTS.RIVER_TRACK_COST
      : GAME_CONSTANTS.PLAIN_TRACK_COST;
  }
  for (const t of incompleteSecondaries) {
    if (removeKeys.has(k(t.coord))) continue; // 타일 자체가 삭제되면 환불 중복 방지
    refund += t.trackType === 'crossing'
      ? TRACK_REPLACE_COSTS.simpleToCrossing
      : TRACK_REPLACE_COSTS.default;
  }
  const trackTiles = board.trackTiles
    .filter(t => !removeKeys.has(k(t.coord)))
    .map(t =>
      revertKeys.has(k(t.coord)) && !removeKeys.has(k(t.coord))
        ? {
            ...t,
            trackType: 'simple' as const,
            secondaryEdges: undefined,
            secondaryOwner: undefined,
            secondaryBuiltTurn: undefined,
          }
        : t
    );
  // 이번 턴 내 마을 가닥 중 (타일 제거 후 기준) 미완성인 것 제거 + 환불.
  // 기존 조건(removeKeys에 townCoord 대조)은 마을 헥스엔 트랙 타일이 없어 절대 매치되지 않는
  // 죽은 코드였다 — 미완성 노선의 가닥이 마을에 그대로 남았다 (2026-07-24 사용자 보고).
  const interim: BoardState = { ...board, trackTiles };
  const orphanSpurs = getIncompleteNewSpurs(interim, currentTurn, playerId);
  const orphanSet = new Set(orphanSpurs.map(sp => `${k(sp.townCoord)}:${sp.edge}`));
  refund += orphanSpurs.length * spurCost;
  const townSpurs = (board.townSpurs ?? []).filter(
    sp => !(sp.owner === playerId && sp.builtTurn === currentTurn && orphanSet.has(`${k(sp.townCoord)}:${sp.edge}`))
  );
  return {
    board: { ...board, trackTiles, townSpurs },
    refund,
    removed: {
      tiles: incomplete.length,
      crossings: incompleteSecondaries.filter(t => !removeKeys.has(k(t.coord))).length,
      spurs: orphanSpurs.length,
    },
  };
}
