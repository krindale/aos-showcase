// Montréal 정부 링크 자동 건설 (봇 관리자 차례) — governmentLink 단계에서 runAIAutoPhase가 호출
//
// 원본 룰: 관리 플레이어가 "원하는 아무 합법 링크"를 무료로 1개 건설 (타일 ≤3, 미완성 금지,
// 마스터 네트워크 연속성 — 첫 링크만 예외). 봇 휴리스틱:
//  ① 정거장(도시/마을) 쌍 사이의 빈 헥스 경로(≤3타일)를 BFS로 찾고
//  ② 마스터 네트워크 제약을 지키는 후보 중 "양 끝 화물 수 많음 → 경로 짧음" 순으로 선택
//  ③ 첫 링크는 Berri-UQAM(허브, 화물 6) 포함 후보를 우선 (원본 룰 권장 사항)
// 실행은 기존 store 액션(buildTrack/buildTownSpur — governmentLink 단계 분기)으로 하므로
// 검증·카운트·미완성 정리는 엔진 규칙을 그대로 따른다.

import type { GameStore } from '../gameStore';
import { BoardState, CubeColor, GameState, HexCoord } from '@/types/game';
import {
  cityAcceptsCube,
  findReachableDestinations,
  getNeighborHex,
  getOppositeEdge,
  hexCoordsEqual,
  isBlockedEdge,
} from '@/utils/hexGrid';

const key = (c: HexCoord) => `${c.col},${c.row}`;

interface Station {
  coord: HexCoord;
  isTown: boolean;
  cubes: number;
  id: string;
}

/** 정거장(도시/도시화 안 된 마을) 목록 */
function listStations(board: BoardState): Station[] {
  return [
    ...board.cities.map(c => ({ coord: c.coord, isTown: false, cubes: c.cubes.length, id: c.id })),
    ...board.towns
      .filter(t => t.newCityColor === null)
      .map(t => ({ coord: t.coord, isTown: true, cubes: t.cubes.length, id: t.id })),
  ];
}

/** 정거장에 트랙/가닥이 하나라도 닿아 있는지 (마스터 네트워크 소속 여부) */
function stationInNetwork(board: BoardState, st: Station): boolean {
  if (st.isTown) {
    return (board.townSpurs ?? []).some(sp => hexCoordsEqual(sp.townCoord, st.coord));
  }
  for (let e = 0; e < 6; e++) {
    const nb = getNeighborHex(st.coord, e);
    const back = getOppositeEdge(e);
    const tile = board.trackTiles.find(t => hexCoordsEqual(t.coord, nb));
    if (tile && [...tile.edges, ...(tile.secondaryEdges ?? [])].includes(back)) return true;
  }
  return false;
}

/**
 * 정부 건설의 "출발 앵커"로 쓸 수 있는 정거장인지 — 정부 연결성 검증
 * (validateGovernmentTrackConnection)을 첫 타일부터 통과하려면:
 * 도시 = 항상 연결점 (단, 마스터 네트워크상 트랙이 닿아 있어야 — 호출부에서 확인),
 * 마을 = 정부 가닥(owner null)이 있어야 정부 트랙의 연결점이 된다.
 */
function isGovAnchor(board: BoardState, st: Station): boolean {
  if (!st.isTown) return stationInNetwork(board, st);
  return (board.townSpurs ?? []).some(
    sp => hexCoordsEqual(sp.townCoord, st.coord) && sp.owner === null
  );
}

/** 빈(건설 가능) 헥스인지 — 지형/기존 트랙/정거장 제외 */
function isEmptyBuildable(board: BoardState, coord: HexCoord): boolean {
  const hex = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
  if (!hex || hex.terrain === 'lake') return false;
  if (board.cities.some(c => hexCoordsEqual(c.coord, coord))) return false;
  if (board.towns.some(t => hexCoordsEqual(t.coord, coord))) return false;
  if (board.trackTiles.some(t => hexCoordsEqual(t.coord, coord))) return false;
  return true;
}

interface Candidate {
  from: Station;
  to: Station;
  path: HexCoord[]; // from→to 사이의 빈 헥스들 (양 끝 정거장 제외, 1~3개)
  score: number;
}

/** from 정거장에서 BFS로 ≤3타일 링크 후보 수집 */
function findLinksFrom(board: BoardState, from: Station, stations: Station[]): Candidate[] {
  const out: Candidate[] = [];
  const stationByKey = new Map(stations.map(s => [key(s.coord), s]));
  // BFS 노드: 빈 헥스. parent 추적으로 경로 복원.
  const parent = new Map<string, string | null>();
  const depth = new Map<string, number>();
  const queue: HexCoord[] = [];

  for (let e = 0; e < 6; e++) {
    const nb = getNeighborHex(from.coord, e);
    if (isBlockedEdge(board, from.coord, nb)) continue;
    if (!isEmptyBuildable(board, nb)) continue;
    const k = key(nb);
    if (depth.has(k)) continue;
    parent.set(k, null);
    depth.set(k, 1);
    queue.push(nb);
  }

  const coordByKey = new Map<string, HexCoord>();
  for (const q of queue) coordByKey.set(key(q), q);

  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const ck = key(cur);
    const d = depth.get(ck)!;

    // 이 헥스에서 정거장에 닿으면 링크 후보 완성
    for (let e = 0; e < 6; e++) {
      const nb = getNeighborHex(cur, e);
      if (isBlockedEdge(board, cur, nb)) continue;
      const st = stationByKey.get(key(nb));
      if (st && !hexCoordsEqual(st.coord, from.coord)) {
        // 경로 복원
        const path: HexCoord[] = [];
        let k2: string | null = ck;
        while (k2) {
          path.unshift(coordByKey.get(k2)!);
          k2 = parent.get(k2) ?? null;
        }
        out.push({ from, to: st, path, score: 0 });
      }
    }

    if (d >= 3) continue;
    for (let e = 0; e < 6; e++) {
      const nb = getNeighborHex(cur, e);
      if (isBlockedEdge(board, cur, nb)) continue;
      if (!isEmptyBuildable(board, nb)) continue;
      const nk = key(nb);
      if (depth.has(nk)) continue;
      parent.set(nk, ck);
      depth.set(nk, d + 1);
      coordByKey.set(nk, nb);
      queue.push(nb);
    }
  }
  return out;
}

/** 두 헥스 사이의 방향(엣지) — 인접해야 함 */
function edgeBetween(a: HexCoord, b: HexCoord): number | null {
  for (let e = 0; e < 6; e++) {
    if (hexCoordsEqual(getNeighborHex(a, e), b)) return e;
  }
  return null;
}

/**
 * Montréal Repopulation 봇 배치 휴리스틱 — 뽑힌 3개 중 (큐브, 도시) 조합을 고른다.
 * 같은 색(수요색) 도시 위 배치는 배달 불가(죽은 화물)라 제외하고,
 * 트랙이 닿은(배달 가능성이 높은) 도시를 우선한다.
 */
export function pickRepopulationPlacement(
  state: GameState,
  drawn: CubeColor[]
): { cube: CubeColor; cityId: string } | null {
  const { board } = state;
  let best: { cube: CubeColor; cityId: string; score: number } | null = null;
  for (const cube of drawn) {
    for (const city of board.cities) {
      if (cityAcceptsCube(city, cube, board)) continue; // 수요색 위 배치 = 배달 불가
      // 다른 어딘가에 이 색을 받는 도시가 있어야 배달 가능
      if (!board.cities.some(c => c.id !== city.id && cityAcceptsCube(c, cube, board))) continue;
      let score = 0;
      // 트랙이 닿은 도시 우선 (곧 배달 가능)
      for (let e = 0; e < 6; e++) {
        const nb = getNeighborHex(city.coord, e);
        const back = getOppositeEdge(e);
        const tile = board.trackTiles.find(t => hexCoordsEqual(t.coord, nb));
        if (tile && [...tile.edges, ...(tile.secondaryEdges ?? [])].includes(back)) { score += 2; break; }
      }
      // 화물이 적은 도시에 분산 (수요 대비 공급 균형)
      score -= city.cubes.length * 0.1;
      if (!best || score > best.score) best = { cube, cityId: city.id, score };
    }
  }
  return best ? { cube: best.cube, cityId: best.cityId } : null;
}

/**
 * 정부 링크 자동 건설 실행. 후보를 골라 store 액션으로 타일/가닥을 짓는다.
 * 성공 여부와 무관하게 호출자는 nextPhase로 진행 (미완성은 단계 전환 시 자동 제거).
 */
export function runGovernmentBuildAI(get: () => GameStore): void {
  const state = get();
  const { board } = state;
  const stations = listStations(board);
  const firstLink = board.trackTiles.length === 0 && (board.townSpurs ?? []).length === 0;

  // 후보 수집 — 출발 앵커: 첫 링크는 도시 아무 곳, 이후엔 정부 연결성+마스터 네트워크를
  // 첫 타일부터 통과할 수 있는 정거장(도시=트랙 닿음, 마을=정부 가닥)만
  let candidates: Candidate[] = [];
  for (const st of stations) {
    if (firstLink) {
      if (st.isTown) continue; // 첫 링크는 도시에서 출발 (마을 앵커는 정부 가닥 필요)
    } else if (!isGovAnchor(board, st)) {
      continue;
    }
    candidates.push(...findLinksFrom(board, st, stations));
  }

  // 정부는 "트랙 3개까지" — 마을 끝점 가닥도 건설 1카운트이므로 총합이 3을 넘는 후보는 제외
  candidates = candidates.filter(c => {
    const townEnds = (c.from.isTown ? 1 : 0) + (c.to.isTown ? 1 : 0);
    return c.path.length + townEnds <= 3;
  });

  if (candidates.length === 0) {
    console.warn('[정부 링크 AI] 후보 링크 없음 — 건너뜀');
    return;
  }

  // 점수: ① 색 매칭(이 링크로 실제 배달 가능한 화물 수 — 게임마다 다른 무작위 색을 반영) ×4
  //       ② 양 끝 화물 합(잠재 물동량) ×1  ③ 경로 길이 ↓
  // 몬트리올은 도시별 화물 "개수"가 고정(맵 인쇄)이라 개수만 보면 첫 링크가 매판 동일해진다
  // (사용자 관찰: 10판 연속 Berri↔Longueuil). Berri 가산은 원본 룰이 "권장(필수 아님)"이므로
  // 절대 보너스(+100) 대신 약한 가산(+3)으로 — 화물 색이 좋은 다른 링크가 이길 수 있게.

  // ⚠️ 기각 실험 (2026-07-25, 100시드): 정부 링크를 "봇 계획 지원"으로 유도하는 두 항 —
  // 계획 끝 정거장 네트워크 편입 가점 + 계획 구간 잠식 방지 감점 — 전 지점 단조 악화.
  //   기본 13.46·파산0.70 / 감점만(0/−4) 11.44·0.75 / (3/−4) 9.14·0.80 / (6/−8) 6.28·0.89.
  // 원인: 화물 중심의 정부 링크는 전원이 공유하는 무료 배달 인프라라, 그걸 계획 방향으로
  // 돌리면 공용 인프라 가치가 죽어 3인 전원의 수입이 준다(봇은 매턴 재계획하므로 "계획
  // 잠식"의 실피해도 작음). 화물수·색매칭·짧음 기반 기본 휴리스틱이 봇들에게도 최적.

  // ── 배달 해금 스코어 (2026-07-25, 사용자 설계 채택 — 100시드 VP 13.05→14.82·파산 0.70):
  //    정부 링크 = "무수입 통과 구간".
  // 후보 링크를 가상으로 얹었을 때 "새로 배달 가능해지는 (화물→수요 도시) 쌍"의 수를
  // 직접 센다 — 직결 색매칭 근사를 다중 홉 실측으로 대체 (경로에 정부 링크가 끼며
  // 열리는 배달 최대화). 통과는 현재 룰대로 소유 무관(타인 철도 개방·정부 링크 전원 이용).
  const anyPid = state.activePlayers[0];
  const maxEngine = Math.max(1, ...state.activePlayers.map(pid => state.players[pid]?.engineLevel ?? 1));
  const maxDgel = Math.max(0, ...state.activePlayers.map(pid => state.players[pid]?.dgel ?? 0));
  const cubeSources = board.cities.filter(ct => ct.cubes.length > 0);
  const reachCount = (b: BoardState, srcCoord: HexCoord, color: CubeColor): number =>
    findReachableDestinations(srcCoord, b, anyPid, maxEngine, color, maxDgel, maxEngine).length;
  /** 후보 링크를 가상 정부 트랙으로 얹은 보드 (건설 실행부와 동일한 변 체인) */
  const boardWithLink = (c: Candidate): BoardState | null => {
    const nodes = [c.from.coord, ...c.path, c.to.coord];
    const tiles = [] as typeof board.trackTiles;
    for (let i = 1; i < nodes.length - 1; i++) {
      const entry = edgeBetween(nodes[i], nodes[i - 1]);
      const exit = edgeBetween(nodes[i], nodes[i + 1]);
      if (entry === null || exit === null) return null;
      tiles.push({
        id: `gov-sim-${i}`, coord: nodes[i], edges: [entry, exit] as [number, number],
        owner: null, trackType: 'simple', isGovernment: true,
      });
    }
    const spurs = [...(board.townSpurs ?? [])];
    for (const st of [c.from, c.to]) {
      if (!st.isTown) continue;
      const adjIdx = hexCoordsEqual(st.coord, nodes[0]) ? 1 : nodes.length - 2;
      const e = edgeBetween(st.coord, nodes[adjIdx]);
      if (e !== null) spurs.push({ id: `gov-sim-sp-${st.id}`, townCoord: st.coord, edge: e, owner: null, builtTurn: 0 });
    }
    return { ...board, trackTiles: [...board.trackTiles, ...tiles], townSpurs: spurs };
  };
  // 기준(현재 보드) 도달 수 — (출발지, 색)별 1회
  const baseReach = new Map<string, number>();
  for (const ct of cubeSources) {
    for (const color of Array.from(new Set(ct.cubes))) {
      baseReach.set(`${ct.id}:${color}`, reachCount(board, ct.coord, color));
    }
  }

  for (const c of candidates) {
    const vBoard = boardWithLink(c);
    let unlocked = 0;
    if (vBoard) {
      for (const ct of cubeSources) {
        for (const color of Array.from(new Set(ct.cubes))) {
          const gain = reachCount(vBoard, ct.coord, color) - (baseReach.get(`${ct.id}:${color}`) ?? 0);
          if (gain > 0) unlocked += gain * ct.cubes.filter(cb => cb === color).length;
        }
      }
    }
    // 가중 스윕(100시드): 해금×4 단독 12.73·0.82 / +끝점화물 하이브리드 ×2 14.35·0.71 /
    // ×3 14.82·0.70(채택) / ×4 14.17·0.75 / ×5 13.00·0.79 — ×3 봉우리.
    // 가중 스윕(100시드): 해금×0(기존) 13.05/0.71 → ×2 14.35/0.71 → ×3 14.82/0.70(峰)
    // → ×4 14.17/0.75 → ×5 13.00/0.79. 끝점 화물 항 제거(해금×4 단독)는 12.73/0.82로 악화
    // — 해금은 "새로 열리는 배달", 끝점 화물은 "그 링크가 매턴 실어나를 물량"이라 상보적.
    c.score = unlocked * 3 + (c.from.cubes + c.to.cubes) - c.path.length;

    if (firstLink && (c.from.id === 'berriUqam' || c.to.id === 'berriUqam')) c.score += 3;
    // 네트워크 밖 정거장을 새로 잇는 확장 우선 (+1).
    // ⚠️ 확장 가중 스윕 (2026-07-25, 100시드 — "건설이 중심에만 몰린다" 사용자 관찰로 실험):
    //   +1: VP 12.51·파산 0.74 / +2: 11.97·0.76 / +4: 10.79·0.76 / +10: 8.80·0.85 — 단조 악화.
    // 몬트리올은 화물이 중심(Berri 6 등)에 몰려 있어 확장을 강제할수록 무수입 정부 링크가
    // 저화물 외곽으로 빠지며 전체 수입이 죽는다. "중심 밀집"은 마스터 네트워크 룰(네트워크 밖
    // 건설 불법) + 화물 분포가 만든 합리적 결과 — 미관을 위해 올리려면 VP 대가를 감수해야 한다.
    if (!firstLink && !stationInNetwork(board, c.to)) c.score += 1;
  }
  candidates = candidates.sort((a, b) => b.score - a.score);

  const chosen = candidates[0];
  console.log(
    `[정부 링크 AI] ${chosen.from.id} ↔ ${chosen.to.id} (${chosen.path.length}타일) 건설 시도`
  );

  // 타일 건설: from(네트워크 쪽) → to 순서로
  const nodes = [chosen.from.coord, ...chosen.path, chosen.to.coord];
  for (let i = 1; i < nodes.length - 1; i++) {
    const entry = edgeBetween(nodes[i], nodes[i - 1]);
    const exit = edgeBetween(nodes[i], nodes[i + 1]);
    if (entry === null || exit === null) {
      console.warn('[정부 링크 AI] 경로 좌표 불연속 — 중단');
      return;
    }
    const ok = get().buildTrack(nodes[i], [entry, exit]);
    if (!ok) {
      console.warn(`[정부 링크 AI] 타일 건설 실패 (${nodes[i].col},${nodes[i].row}) — 중단 (미완성은 자동 제거)`);
      return;
    }
  }

  // 마을(Stop) 끝점에는 정부 가닥을 놓아 이동 가능하게 한다
  for (const st of [chosen.from, chosen.to]) {
    if (!st.isTown) continue;
    const adjIdx = hexCoordsEqual(st.coord, nodes[0]) ? 1 : nodes.length - 2;
    const edgeToPath = edgeBetween(st.coord, nodes[adjIdx]);
    if (edgeToPath !== null) {
      get().buildTownSpur(st.coord, edgeToPath);
    }
  }
}
