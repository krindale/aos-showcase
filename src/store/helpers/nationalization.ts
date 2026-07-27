// Southern China: 소유 디스크 4개 제한 + 국유화 트랙 — 순수 헬퍼
//
// 디스크 모델: 디스크 1개 = 완성 링크 1개 or 미완성 트랙 구간 1개 or 구매한 직결 링크
// (인터어반/페리) 1개. 건설로 보유 단위가 상한(MapProfile.ownershipDiscLimit)을 넘으면
// 기존 완성 링크 하나를 국유화(디스크 회수)해야 한다 — GameState.nationalizationPending.
//
// 국유화 트랙 = { owner: null, isGovernment: true, isNationalized: true }:
//  - isGovernment 재사용으로 Montréal 중립 기계를 그대로 얻는다 (누구나 이동·수입 0·
//    수정/방향전환 금지·VP 0 — owner null이라 calculateTrackScore에서 자동 제외).
//  - isNationalized는 구분 마커: Hong Kong 배달 경유 금지 판정 + 렌더 색 구분 전용.
// 보상: 지지 토큰 1 + 트랙 구간(타일)당 $1. 이번 턴 지은/완성한 링크는 국유화 불가.

import { BoardState, GameState, HexCoord, PlayerId } from '@/types/game';
import {
  findCompletedLinks,
  CompletedLink,
  hexCoordsEqual,
  getNeighborHex,
  getOppositeEdge,
  isTrackPartOfCompletedLink,
  isSecondaryTrackPartOfCompletedLink,
} from '@/utils/hexGrid';

const key = (c: HexCoord) => `${c.col},${c.row}`;

/**
 * 내 미완성 트랙 구간 수 — 완성 링크에 속하지 않은 내 소유 트랙 경로(복합 타일은 P/S 별도
 * 노드)의 연결 성분 수. 구간은 정거장(도시/마을)에서 끝나므로 마을 관통 인접은 없다.
 */
export function countUnfinishedSections(board: BoardState, playerId: PlayerId): number {
  type Node = { coord: HexCoord; edges: [number, number] };
  const nodes: Node[] = [];
  for (const t of board.trackTiles) {
    if (t.owner === playerId && !isTrackPartOfCompletedLink(t.coord, board)) {
      nodes.push({ coord: t.coord, edges: t.edges });
    }
    if (
      t.secondaryOwner === playerId &&
      t.secondaryEdges &&
      !isSecondaryTrackPartOfCompletedLink(t.coord, board)
    ) {
      nodes.push({ coord: t.coord, edges: t.secondaryEdges });
    }
  }
  if (nodes.length === 0) return 0;

  // 인접: 노드 A의 변 e 이웃 헥스에 맞은편 변을 가진 노드 B
  const visited = new Set<number>();
  let components = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (visited.has(i)) continue;
    components++;
    const queue = [i];
    visited.add(i);
    while (queue.length) {
      const cur = nodes[queue.pop()!];
      for (const e of cur.edges) {
        const nb = getNeighborHex(cur.coord, e, board);
        const opp = getOppositeEdge(e);
        for (let j = 0; j < nodes.length; j++) {
          if (visited.has(j)) continue;
          if (hexCoordsEqual(nodes[j].coord, nb) && nodes[j].edges.includes(opp)) {
            visited.add(j);
            queue.push(j);
          }
        }
      }
    }
  }
  return components;
}

/** 내 소유 단위(디스크 사용) 수 = 완성 링크 + 미완성 구간 + 구매한 직결 링크(인터어반/페리) */
export function countOwnershipUnits(board: BoardState, playerId: PlayerId): number {
  const completed = findCompletedLinks(board).filter((l) => l.owner === playerId).length;
  const sections = countUnfinishedSections(board, playerId);
  const directs = (board.directLinks ?? []).filter((d) => d.owner === playerId).length;
  return completed + sections + directs;
}

/**
 * 국유화 가능한 내 링크 — 이번 턴 지은/완성한 링크 제외(룰), 그리고 내 복합 secondary
 * 경로가 낀 링크 제외(coord 기반으로는 이 링크 소속 경로를 특정할 수 없어 깨끗한 중립화가
 * 불가능한 희귀 케이스 — 대상에서 빼는 쪽이 안전).
 * **직결 링크(인터어반/페리)도 대상** — 룰북 "기존 링크에서 마커 제거"에 인터어반도 링크다.
 * (교차 타일 1개가 링크 2개를 동시 완성 + 직결 2개 보유 조합에서, 직결을 빼면 국유화 대상이
 * 소진돼 디스크 5개 초과가 잔존하던 실측 구멍의 해소책 — 2026-07-27.)
 * 직결 링크는 CompletedLink 모양의 의사 타깃으로 표현: id `direct-<directLinks 인덱스>`,
 * trackTiles 빈 배열. ⚠️ id에 **도시 이름을 넣지 않는다** — 하이픈이 든 도시 id가 생기면
 * applyNationalization의 파싱이 깨진다(리뷰 S2 지적). 인덱스는 board.directLinks가 생성 후
 * 원소 교체(map)만 하고 순서를 바꾸지 않으므로 안정적이다.
 */
export function eligibleNationalizationTargets(
  board: BoardState,
  playerId: PlayerId,
  currentTurn: number
): CompletedLink[] {
  const tileLinks = findCompletedLinks(board)
    .filter((l) => l.owner === playerId)
    .filter((l) =>
      l.trackTiles.every((coord) => {
        const t = board.trackTiles.find((tt) => hexCoordsEqual(tt.coord, coord));
        if (!t) return false;
        if (t.owner !== playerId) return false; // 내 secondary 경유 링크 — 제외
        if (t.builtTurn === currentTurn) return false; // 이번 턴 건설/완성 — 제외
        return true;
      })
    );

  const directTargets: CompletedLink[] = (board.directLinks ?? [])
    .map((d, idx) => ({ d, idx }))
    .filter(({ d }) => d.owner === playerId && d.builtTurn !== currentTurn)
    .map(({ d, idx }) => {
      const a = board.cities.find((c) => c.id === d.cityA);
      const b = board.cities.find((c) => c.id === d.cityB);
      return {
        id: `direct-${idx}`,
        owner: playerId,
        trackTiles: [], // 타일 없음 — 보상은 1구간($1) 취급 (applyNationalization)
        startCity: a?.coord ?? { col: 0, row: 0 },
        endCity: b?.coord ?? { col: 0, row: 0 },
        centerPosition: { x: 0, y: 0 },
      };
    });

  return [...tileLinks, ...directTargets];
}

/**
 * 국유화 적용 — 링크 타일을 중립화하고 끝점 마을 가닥(이 링크가 쓰는 변)도 중립화한 새 보드.
 * 반환 segments = 보상 $ 계산용 트랙 구간(타일) 수. wasDirect = 직결 링크 국유화(페리 VP 회수용).
 */
export function applyNationalization(
  board: BoardState,
  link: CompletedLink
): { board: BoardState; segments: number; wasDirect: boolean } {
  // 직결 링크 의사 타깃 (id `direct-<인덱스>`) — 링크를 중립화(재구매 불가·수입 0·누구나 이동)
  if (link.id.startsWith('direct-') && link.trackTiles.length === 0) {
    const idx = Number(link.id.slice('direct-'.length));
    const target = (board.directLinks ?? [])[idx];
    if (!target || target.owner !== link.owner) {
      console.warn(`[nationalization] 직결 링크 타깃 불일치: ${link.id}`);
      return { board, segments: 0, wasDirect: false };
    }
    return {
      board: {
        ...board,
        directLinks: (board.directLinks ?? []).map((d, i) =>
          i === idx ? { ...d, owner: null, isNationalized: true } : d
        ),
      },
      segments: 1, // 직결 링크 = 1구간 취급 (보상 $1)
      wasDirect: true,
    };
  }

  const coordKeys = new Set(link.trackTiles.map(key));
  const trackTiles = board.trackTiles.map((t) => {
    if (!coordKeys.has(key(t.coord)) || t.owner !== link.owner) return t;
    return { ...t, owner: null, isGovernment: true, isNationalized: true };
  });

  // 끝점이 (비도시화) 마을이면 그 마을에서 링크의 인접 타일로 이어지는 가닥을 중립화
  const townSpurs = (board.townSpurs ?? []).map((sp) => {
    if (sp.owner !== link.owner) return sp;
    for (const end of [link.startCity, link.endCity]) {
      if (!hexCoordsEqual(sp.townCoord, end)) continue;
      const nb = getNeighborHex(end, sp.edge, board);
      const nbTile = link.trackTiles.find((c) => hexCoordsEqual(c, nb));
      if (nbTile) return { ...sp, owner: null };
    }
    return sp;
  });

  return {
    board: { ...board, trackTiles, townSpurs },
    segments: link.trackTiles.length,
    wasDirect: false,
  };
}

/**
 * 디스크 상한 초과 여부 판정 — 건설 커밋 직후 호출. 초과면 국유화 대기 상태 페이로드 반환.
 * (상한 미사용 맵 = null 항등. 대상이 없으면 null — ≤4 건설/턴 구조상 초과분보다 오래된
 * 링크가 항상 많아 실전에서는 도달하지 않는 방어 분기.)
 */
export function checkDiscLimitAfterBuild(
  state: Pick<GameState, 'board' | 'currentTurn'>,
  playerId: PlayerId,
  limit: number | null
): { playerId: PlayerId } | null {
  if (limit === null) return null;
  if (countOwnershipUnits(state.board, playerId) <= limit) return null;
  if (eligibleNationalizationTargets(state.board, playerId, state.currentTurn).length === 0) {
    console.warn('[nationalization] 디스크 초과인데 국유화 가능한 링크가 없음 — 초과 상태 유지');
    return null;
  }
  return { playerId };
}
