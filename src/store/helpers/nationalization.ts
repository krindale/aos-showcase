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

import { BoardState, GameState, HexCoord, PlayerId, TrackTile } from '@/types/game';
import {
  findCompletedLinks,
  CompletedLink,
  hexCoordsEqual,
  getNeighborHex,
  getOppositeEdge,
  isTrackPartOfCompletedLink,
  isSecondaryTrackPartOfCompletedLink,
  buildOwnedLinkTileIndex,
  isTrackInOwnedCompletedLink,
} from '@/utils/hexGrid';

const key = (c: HexCoord) => `${c.col},${c.row}`;

/**
 * 내 미완성 트랙 구간 수 — 완성 링크에 속하지 않은 내 소유 트랙 경로(복합 타일은 P/S 별도
 * 노드)의 연결 성분 수. 구간은 정거장(도시/마을)에서 끝나므로 마을 관통 인접은 없다.
 */
export function countUnfinishedSections(
  board: BoardState,
  playerId: PlayerId,
  /** 완성 링크 타일 인덱스 — 같은 보드로 여러 번 셀 때 재사용해 findCompletedLinks 중복 실행을
   *  피한다(describeOwnershipUnits가 넘긴다). 생략하면 여기서 만든다. */
  linkIndex?: Map<string, PlayerId>
): number {
  type Node = { coord: HexCoord; edges: [number, number] };
  const nodes: Node[] = [];
  // ⚠️ 완성 판정은 **소유자 인식**으로 — 물리적 완성(isTrackPartOfCompletedLink)으로 재면
  // 내 타일이 국유화/미소유/타인 타일에 기대 이어진 경우 "완성됐다"며 구간에서 빼는데,
  // findCompletedLinks는 소유자가 섞였다고 링크를 안 만들어 완성 링크로도 안 센다
  // → 디스크 0개로 증발 (2026-07-29 사용자 실측). hexGrid 주석 참조.
  const ownedLinkIndex = linkIndex ?? buildOwnedLinkTileIndex(board);
  for (const t of board.trackTiles) {
    if (t.owner === playerId &&
        !isTrackInOwnedCompletedLink(t.coord, board, playerId, 'P', ownedLinkIndex)) {
      nodes.push({ coord: t.coord, edges: t.edges });
    }
    // 보조 경로도 같은 기준(소유자 인식)으로 — 예전엔 isSecondaryTrackPartOfCompletedLink
    // (소유권 무시)를 써서 기준이 엇갈렸다.
    if (t.secondaryOwner === playerId && t.secondaryEdges &&
        !isTrackInOwnedCompletedLink(t.coord, board, playerId, 'S', ownedLinkIndex)) {
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

/**
 * 미완성 구간 상한(unfinishedSectionLimit) 게이트 — "이 타일을 놓아도 되는가".
 * canBuildTrack(buildSlice)과 실패 사유(buildReason)가 **같은 함수를 공유**한다
 * (미러 복제 금지 — 리뷰 S3에서 두 곳이 어긋날 위험을 제거).
 *
 * 새 타일이 ① 내 미완성 구간에 이어지거나 ② 양 끝이 정거장(1타일 즉시 완성)이면 허용,
 * 그 외에는 이미 상한만큼 구간을 가진 경우 거부한다.
 * ⚠️ 이웃 타일의 **복합 secondary 경로**로 이어지는 경우 완성 여부도 secondary 기준으로
 *    판정해야 한다 — primary만 보면 "primary는 완성 링크, 내 secondary는 미완성"인 타일에
 *    이어 지을 때 잘못 거부된다 (리뷰 S3).
 */
export function canStartSectionHere(
  board: BoardState,
  playerId: PlayerId,
  coord: HexCoord,
  edges: [number, number],
  limit: number
): boolean {
  const joinsMySection = edges.some((e) => {
    const nb = getNeighborHex(coord, e, board);
    const opp = getOppositeEdge(e);
    return board.trackTiles.some((tt) => {
      if (!hexCoordsEqual(tt.coord, nb)) return false;
      if (tt.owner === playerId && tt.edges.includes(opp) && !isTrackPartOfCompletedLink(nb, board)) {
        return true;
      }
      if (
        tt.secondaryOwner === playerId &&
        tt.secondaryEdges?.includes(opp) &&
        !isSecondaryTrackPartOfCompletedLink(nb, board)
      ) {
        return true;
      }
      return false;
    });
  });
  if (joinsMySection) return true;

  // 양 끝이 정거장인 1타일 건설 — 구간으로 남지 않는다 (마을 끝점은 가닥이 곧 따라붙는 근사)
  const bothEndsStations = edges.every((e) => {
    const nb = getNeighborHex(coord, e, board);
    return (
      board.cities.some((c) => hexCoordsEqual(c.coord, nb)) ||
      board.towns.some((t) => hexCoordsEqual(t.coord, nb))
    );
  });
  if (bothEndsStations) return true;

  return countUnfinishedSections(board, playerId) < limit;
}

/**
 * 내 소유 단위(디스크 사용) 내역 = 완성 링크 + 미완성 구간 + 구매한 직결 링크(인터어반/페리).
 * UI가 "지금 몇 개를 왜 쓰고 있는지"를 보여줄 수 있도록 항목별로 돌려준다 — 화면에 사용량이
 * 전혀 없어서 사용자가 "직결 링크는 디스크를 안 세는 것 같다"고 판단했던 원인 (2026-07-29).
 */
export function describeOwnershipUnits(
  board: BoardState,
  playerId: PlayerId
): { completed: number; sections: number; directs: number; total: number } {
  // findCompletedLinks는 정거장×6변 경로추적이라 비싸다 — 한 번만 돌려 완성 링크 수와
  // 구간 판정 인덱스에 함께 쓴다 (PlayerPanel이 매 렌더 × 플레이어 수만큼 호출한다).
  const links = findCompletedLinks(board);
  const completed = links.filter((l) => l.owner === playerId).length;
  const sections = countUnfinishedSections(board, playerId, buildOwnedLinkTileIndex(board, links));
  const directs = (board.directLinks ?? []).filter((d) => d.owner === playerId).length;
  return { completed, sections, directs, total: completed + sections + directs };
}

/** 내 소유 단위(디스크 사용) 수 — 내역 합. 미러 복제 금지: describeOwnershipUnits 한 곳에서 센다. */
export function countOwnershipUnits(board: BoardState, playerId: PlayerId): number {
  return describeOwnershipUnits(board, playerId).total;
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
  currentTurn: number,
  /** 당턴 건설/완성 링크도 후보에 포함 — 후보가 0이라 상한을 지킬 수 없을 때의 폴백 전용.
   *  일반 호출은 nationalizationTargets()를 쓴다(폴백이 내장돼 있다). */
  allowSameTurn = false
): CompletedLink[] {
  const tileLinks = findCompletedLinks(board)
    .filter((l) => l.owner === playerId)
    .filter((l) =>
      // 경로 종류별로 소유자·건설 턴을 본다. 예전엔 좌표만으로는 "링크가 이 타일의 어느
      // 경로를 쓰는지" 특정할 수 없어 보조 경로가 낀 링크를 통째로 제외했는데(깨끗한 중립화
      // 불가), trackPaths가 생겨 정확히 가릴 수 있다 — 그래서 보조 경로 링크도 국유화 대상이다.
      // 안 그러면 중국에서 교차로 링크를 완성하면 디스크는 쓰면서 반납할 방법이 없어 영구히
      // 묶인다 (2026-07-29).
      l.trackPaths.every(({ coord, kind }) => {
        const t = board.trackTiles.find((tt) => hexCoordsEqual(tt.coord, coord));
        if (!t) return false;
        const owner = kind === 'P' ? t.owner : t.secondaryOwner;
        if (owner !== playerId) return false;
        const builtTurn = kind === 'P' ? t.builtTurn : t.secondaryBuiltTurn;
        if (!allowSameTurn && builtTurn === currentTurn) return false; // 이번 턴 건설/완성 — 제외
        return true;
      })
    );

  const directTargets: CompletedLink[] = (board.directLinks ?? [])
    .map((d, idx) => ({ d, idx }))
    .filter(({ d }) => d.owner === playerId && (allowSameTurn || d.builtTurn !== currentTurn))
    .map(({ d, idx }) => {
      const a = board.cities.find((c) => c.id === d.cityA);
      const b = board.cities.find((c) => c.id === d.cityB);
      return {
        id: `direct-${idx}`,
        owner: playerId,
        trackTiles: [], // 타일 없음 — 보상은 1구간($1) 취급 (applyNationalization)
        trackPaths: [], // 직결 링크는 보드 타일을 지나지 않는다
        startCity: a?.coord ?? { col: 0, row: 0 },
        endCity: b?.coord ?? { col: 0, row: 0 },
        centerPosition: { x: 0, y: 0 },
      };
    });

  return [...tileLinks, ...directTargets];
}

/**
 * **실제 국유화 후보 — 모든 소비자는 이 함수를 쓴다** (보드 하이라이트·PhasePanel 목록·
 * 봇 자동 해소·nationalizeLink·건설 게이트가 같은 목록을 봐야 표시와 판정이 어긋나지 않는다).
 *
 * 룰상 당턴에 짓거나 완성한 링크는 국유화 대상이 아니다("방금 지은 걸 즉시 반납해 이득 보는"
 * 것을 막는 조항). 그런데 내 링크가 **전부 당턴 건설**이면 후보가 0이 되고, 그러면 디스크
 * 상한(불변식)을 지킬 방법이 사라진다 — 대기도 안 서고 안전망(releaseUnfinishedOwnership)은
 * 미완성 구간만 풀어 완성 링크·직결 링크를 못 건드리므로 5단위가 그대로 굳는다
 * (2026-07-29 사용자 실측: "$8 페리를 짓고도 철도를 5개 소유하고 있었다").
 *
 * 상한이 더 상위 불변식이므로, **후보가 하나도 없을 때만** 당턴 제외를 풀어 폴백한다.
 * 실물 게임에서도 디스크가 없으면 그 건설 자체가 불가능하니, 방금 지은 링크를 반납하게 되는
 * 것이 "상한 초과 상태로 계속 진행"보다 룰에 가깝다.
 */
export function nationalizationTargets(
  board: BoardState,
  playerId: PlayerId,
  currentTurn: number
): CompletedLink[] {
  const strict = eligibleNationalizationTargets(board, playerId, currentTurn);
  if (strict.length > 0) return strict;
  return eligibleNationalizationTargets(board, playerId, currentTurn, true);
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

  // ⚠️ 중립화는 **경로 종류별로** — 복합 타일은 기본/보조가 독립된 트랙이라, 보조 경로 링크를
  // 국유화하면서 기본 경로(다른 주인일 수 있다)까지 건드리면 남의 철도를 뺏는 셈이 된다.
  const pathKind = new Map<string, 'P' | 'S'>();
  for (const t of link.trackPaths) pathKind.set(key(t.coord), t.kind);
  const trackTiles = board.trackTiles.map((t) => {
    const kind = pathKind.get(key(t.coord));
    if (!kind) return t;
    if (kind === 'P') {
      if (t.owner !== link.owner) return t;
      return { ...t, owner: null, isGovernment: true, isNationalized: true };
    }
    if (t.secondaryOwner !== link.owner) return t;
    // 보조 경로만 중립화 — 타일 자체를 정부 트랙으로 만들면 기본 경로 주인이 피해를 본다.
    return { ...t, secondaryOwner: null, isNationalized: true };
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
  // 폴백 포함 목록으로 판정 — 당턴 링크뿐이라 엄격 목록이 0이어도 상한은 지켜야 한다
  if (nationalizationTargets(state.board, playerId, state.currentTurn).length === 0) {
    console.warn('[nationalization] 디스크 초과인데 국유화 가능한 링크가 없음 — 초과 상태 유지');
    return null;
  }
  return { playerId };
}

/**
 * 디스크 초과인데 국유화할 링크가 없을 때의 안전망 — 미완성 구간의 소유 마커를 해제해
 * (무보상, 룰북 "미완성 트랙 마커 제거는 보상 없음 · 국유화가 아님") 한도를 복원한다.
 *
 * ⚠️ **초과를 방치하면 안 된다** — 디스크 상한은 불변식이라, 방치하면 5단위 이상 보유 상태가
 * 그대로 굳고 그 플레이어는 이후 건설이 계속 막힌다. 두 진입점이 모두 이 함수를 거쳐야 한다:
 *   ① 건설 직후 대상이 아예 없을 때 (buildSlice.afterBuildDiscCheck)
 *   ② 국유화를 한 번 한 뒤에도 초과인데 남은 대상이 소진됐을 때 (gameStore.nationalizeLink)
 * ①만 막았을 때 봇이 5단위로 굳는 실패를 시뮬이 잡았고(리뷰 S5), ②는 같은 구멍의 사람 버전이다.
 *
 * @returns 해제된 타일이 있으면 새 board, 해제할 것이 없거나 초과가 아니면 null
 */
export function releaseUnfinishedOwnership(
  board: BoardState,
  playerId: PlayerId,
  limit: number | null
): { board: BoardState; released: number } | null {
  if (limit === null) return null;
  if (countOwnershipUnits(board, playerId) <= limit) return null;

  // ⚠️ **복합 타일의 secondary 소유도 해제 대상** — 디스크 회계(countUnfinishedSections)가
  // secondary 구간을 세므로, primary만 풀면 "내 primary 타일 0개인데 5단위"가 굳는다
  // (리뷰 S5 진단 실측: units=5인데 내 primary 타일 0·직결 0 = 전부 공존/교차 secondary).
  const ownedLinkIndex = buildOwnedLinkTileIndex(board);
  const isPrimaryMine = (t: TrackTile) =>
    t.owner === playerId &&
    !isTrackInOwnedCompletedLink(t.coord, board, playerId, 'P', ownedLinkIndex);
  const isSecondaryMine = (t: TrackTile) =>
    t.secondaryOwner === playerId && !!t.secondaryEdges &&
    !isTrackInOwnedCompletedLink(t.coord, board, playerId, 'S', ownedLinkIndex);

  const released = board.trackTiles.filter((t) => isPrimaryMine(t) || isSecondaryMine(t)).length;
  if (released === 0) return null;

  return {
    released,
    board: {
      ...board,
      trackTiles: board.trackTiles.map((t) => {
        let nt = t;
        if (isPrimaryMine(t)) nt = { ...nt, owner: null };
        if (isSecondaryMine(t)) nt = { ...nt, secondaryOwner: null };
        return nt;
      }),
    },
  };
}
