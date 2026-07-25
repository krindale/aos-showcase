/**
 * 타인 철도 이용 후보 경로(findRouteOptions) + 정산 미러(getPathLinkOwners) +
 * findLongestPath 타인 링크 최소 tie-break 단위 테스트.
 *
 * 좌표는 odd-r offset (docs/hex-geometry.md):
 *   짝수행 엣지 오프셋 E0=[+1,0] SE1=[0,+1] SW2=[-1,+1] W3=[-1,0] NW4=[-1,-1] NE5=[0,-1]
 *   홀수행 엣지 오프셋 E0=[+1,0] SE1=[+1,+1] SW2=[0,+1] W3=[-1,0] NW4=[0,-1] NE5=[+1,-1]
 */
import { describe, it, expect } from 'vitest';
import {
  findRouteOptions,
  findLongestPath,
  findTrackCubeDeliveries,
  findReachableDestinations,
  getPathLinkOwners,
  countOppPathLinks,
} from '@/utils/hexGrid';
import type { BoardState, City, CityColor, CubeColor, HexCoord, PlayerId, TrackTile } from '@/types/game';

function city(id: string, color: CityColor, col: number, row: number, cubes: CubeColor[] = []): City {
  return { id, name: id, coord: { col, row }, color, cubes };
}

function trk(
  col: number,
  row: number,
  edges: [number, number],
  owner: PlayerId | null,
  extra: Partial<TrackTile> = {}
): TrackTile {
  return { id: `t${col}-${row}`, coord: { col, row }, edges, owner, trackType: 'simple', ...extra };
}

function board(cities: City[], tracks: TrackTile[]): BoardState {
  return { hexTiles: [], trackTiles: tracks, cities, towns: [] };
}

const P1: PlayerId = 'player1';
const P2: PlayerId = 'player2';
const P3: PlayerId = 'player3';

/**
 * 공용 보드 A — P(0,1) 출발, T(6,1) 파랑 목적지, 중간 도시 M(2,0)·N(4,0) 노랑.
 * 윗길: P─(1,0)내꺼─M─[다리 M→N]─N─(5,0)(5,1)내꺼─T  (3링크: 내2 + 다리1)
 * 아랫길: P─(1,2)(2,2)(3,2)(4,2)(5,2)(6,2) 전부 내꺼─T  (1링크, 정거장 없음)
 */
function buildBoardA(bridge: TrackTile[], withDirect = true): BoardState {
  const tracks: TrackTile[] = [
    trk(1, 0, [2, 0], P1), // P(NE)↔M
    ...bridge,
    trk(5, 0, [3, 1], P1), // N↔(5,1)
    trk(5, 1, [4, 0], P1), // (5,0)↔T
  ];
  if (withDirect) {
    tracks.push(
      trk(1, 2, [4, 0], P1), // P(SE)↔(2,2)
      trk(2, 2, [3, 0], P1),
      trk(3, 2, [3, 0], P1),
      trk(4, 2, [3, 0], P1),
      trk(5, 2, [3, 0], P1),
      trk(6, 2, [3, 5], P1) // (5,2)↔T(NE)
    );
  }
  return board(
    [city('P', 'red', 0, 1), city('M', 'yellow', 2, 0), city('N', 'yellow', 4, 0), city('T', 'blue', 6, 1)],
    tracks
  );
}

const P_COORD: HexCoord = { col: 0, row: 1 };
const T_COORD: HexCoord = { col: 6, row: 1 };

describe('findRouteOptions — 게이트/디폴트/중복 제거', () => {
  it('타인 경유가 내 수입을 늘리면(2ⓐ) 후보로 노출되고 디폴트가 된다', () => {
    // 다리 M→N = 타인(P2) — 윗길 내2+타1, 아랫길 내1
    const b = buildBoardA([trk(3, 0, [3, 0], P2)]);
    const options = findRouteOptions(P_COORD, T_COORD, b, P1, 4, 'blue');
    expect(options).toHaveLength(2);
    // 디폴트(=첫 후보) = 내 수입 최대인 타인 경유 경로
    expect(options[0].ownLinks).toBe(2);
    expect(options[0].oppLinks).toBe(1);
    expect(options[0].owners).toEqual([P2]);
    // 본인-철도-최선도 후보로 남는다
    expect(options[1].ownLinks).toBe(1);
    expect(options[1].oppLinks).toBe(0);
    expect(options[1].owners).toEqual([]);
  });

  it('타인 경유 동률은 선택지로 남고 디폴트는 본인 철도다 (2026-07-26 정책)', () => {
    // 윗길은 P→M만 내 것, M→N·N→T 전부 타인 → 윗길 내1+타2. 아랫길 내1.
    // 내 수입 동률(1=1) — 과거엔 제외했으나 합법 경로이므로 비-디폴트 선택지로 노출.
    const b2 = board(
      [city('P', 'red', 0, 1), city('M', 'yellow', 2, 0), city('N', 'yellow', 4, 0), city('T', 'blue', 6, 1)],
      [
        trk(1, 0, [2, 0], P1), // P↔M 내꺼
        trk(3, 0, [3, 0], P2), // M↔N 타인
        trk(5, 0, [3, 1], P2), // N↔T 타인
        trk(5, 1, [4, 0], P2),
        trk(1, 2, [4, 0], P1), // 아랫길 전부 내꺼 (내1)
        trk(2, 2, [3, 0], P1),
        trk(3, 2, [3, 0], P1),
        trk(4, 2, [3, 0], P1),
        trk(5, 2, [3, 0], P1),
        trk(6, 2, [3, 5], P1),
      ]
    );
    const options = findRouteOptions(P_COORD, T_COORD, b2, P1, 4, 'blue');
    expect(options).toHaveLength(2);
    expect(options[0].oppLinks).toBe(0); // 디폴트 = 본인 철도
    expect(options[0].ownLinks).toBe(1);
    expect(options[1].ownLinks).toBe(1); // 동률 타인 경유는 비-디폴트 선택지
    expect(options[1].oppLinks).toBe(2);
    // 내 수입이 본인-최선 "미만"인 경로는 여전히 숨김 — 엔진을 줄여 윗길 내0(내 타일 미경유) 상황은
    // 별도 케이스라 여기선 동률만 검증
  });

  it('본인 철도만으론 도달 불가한 목적지는 타인 경유 경로가 열린다 (2ⓑ)', () => {
    // 아랫길 없음 + 다리 타인 → 본인-철도-최선 없음 → 타인 경유가 유일 후보
    const b = buildBoardA([trk(3, 0, [3, 0], P2)], false);
    const options = findRouteOptions(P_COORD, T_COORD, b, P1, 4, 'blue');
    expect(options).toHaveLength(1);
    expect(options[0].ownLinks).toBe(2);
    expect(options[0].oppLinks).toBe(1);
    expect(options[0].owners).toEqual([P2]);
  });

  it('같은 조건의 다리가 둘이면 ownerScore 낮은 주인의 경로가 디폴트', () => {
    // 다리1 = (3,0) P2 / 다리2 = (2,1)+(3,1) P3 — 둘 다 내2+타1
    const bridge2 = [trk(2, 1, [4, 0], P3), trk(3, 1, [3, 5], P3)];
    const b = buildBoardA([trk(3, 0, [3, 0], P2), ...bridge2]);
    const low3 = findRouteOptions(P_COORD, T_COORD, b, P1, 4, 'blue', 0, { [P2]: 30, [P3]: 5 });
    expect(low3).toHaveLength(3); // 타인 경유 2(주인 다름) + 본인 최선 1
    expect(low3[0].owners).toEqual([P3]);
    expect(low3[1].owners).toEqual([P2]);
    // 점수를 뒤집으면 디폴트도 뒤집힌다
    const low2 = findRouteOptions(P_COORD, T_COORD, b, P1, 4, 'blue', 0, { [P2]: 5, [P3]: 30 });
    expect(low2[0].owners).toEqual([P2]);
  });

  it('같은 주인 집합의 경로는 대표 1개만 남는다 (dedupe)', () => {
    // P2 다리가 두 개(윗줄·중간줄)여도 주인 집합이 같으면({P2}) 후보는 1개
    const b = buildBoardA([trk(3, 0, [3, 0], P2), trk(2, 1, [4, 0], P2), trk(3, 1, [3, 5], P2)]);
    const options = findRouteOptions(P_COORD, T_COORD, b, P1, 4, 'blue');
    expect(options).toHaveLength(2); // {P2} 대표 1 + 본인 최선 1
    expect(options[0].owners).toEqual([P2]);
  });

  it('엔진이 모자라면 타인 경유 장거리 후보는 나오지 않는다', () => {
    const b = buildBoardA([trk(3, 0, [3, 0], P2)]);
    const options = findRouteOptions(P_COORD, T_COORD, b, P1, 1, 'blue'); // 엔진 1
    expect(options).toHaveLength(1); // 아랫길(1링크)만
    expect(options[0].oppLinks).toBe(0);
  });
});

describe('getPathLinkOwners — 정산 미러', () => {
  it('링크 내 첫 owner 타일 소유자로 귀속하고, 정부/공용(owner null)은 null', () => {
    const b = board(
      [city('P', 'red', 0, 1), city('T', 'blue', 2, 1)],
      [trk(1, 1, [3, 0], null, { isGovernment: true })]
    );
    const path: HexCoord[] = [{ col: 0, row: 1 }, { col: 1, row: 1 }, { col: 2, row: 1 }];
    expect(getPathLinkOwners(path, b)).toEqual([null]);
    expect(countOppPathLinks(path, b, P1)).toBe(0); // 무수입 링크는 "빌린" 걸로 안 침
  });

  it('여러 링크 경로에서 링크별 소유자를 순서대로 돌려준다', () => {
    const b = buildBoardA([trk(3, 0, [3, 0], P2)], false);
    // 윗길 전체 경로: P (1,0) M (3,0) N (5,0) (5,1) T
    const path: HexCoord[] = [
      { col: 0, row: 1 }, { col: 1, row: 0 }, { col: 2, row: 0 },
      { col: 3, row: 0 }, { col: 4, row: 0 }, { col: 5, row: 0 }, { col: 5, row: 1 }, { col: 6, row: 1 },
    ];
    expect(getPathLinkOwners(path, b)).toEqual([P1, P2, P1]);
  });
});

describe('findRouteOptions — 달 저중력 크레딧 (수입 이전 반영)', () => {
  // P(0,1)→T(4,1): 직행(내1) vs M(2,0) 경유(내1+타1) — 크레딧 없으면 경유는 게이트에서 탈락
  const lowGravBoard = () => board(
    [city('P', 'red', 0, 1), city('M', 'yellow', 2, 0), city('T', 'blue', 4, 1)],
    [
      trk(1, 0, [2, 0], P1), // P↔M 내꺼
      trk(3, 0, [3, 0], P2), // M→(4,0) 타인
      trk(4, 0, [3, 1], P2), // (3,0)→T 타인
      trk(1, 2, [4, 0], P1), // 아랫줄 직행 내꺼
      trk(2, 2, [3, 0], P1),
      trk(3, 2, [3, 0], P1),
      trk(4, 2, [3, 5], P1),
    ]
  );

  it('크레딧 없음: 내 수입이 같은 타인 경유는 비-디폴트 선택지로만 남는다', () => {
    const options = findRouteOptions({ col: 0, row: 1 }, { col: 4, row: 1 }, lowGravBoard(), P1, 4, 'blue');
    expect(options[0].owners).toEqual([]); // 디폴트 = 본인 철도
    expect(options[0].ownLinks).toBe(1);
    // 동률 타인 경유는 선택지로 노출되나 디폴트가 아니다 (2026-07-26 정책)
    const mixed = options.find(o => o.oppLinks > 0);
    expect(mixed?.ownLinks).toBe(1);
  });

  it('lowGravCredit: 빌린 링크 1개 수입 이전이 반영돼(own+1/opp−1) 경유 경로가 최선이 된다', () => {
    const options = findRouteOptions(
      { col: 0, row: 1 }, { col: 4, row: 1 }, lowGravBoard(), P1, 4, 'blue', 0, undefined, true
    );
    // 경유 경로: 정산상 내 수입 2(내 링크 1 + 이전 1), 타인 순수입 0 — applyLowGravitation 미러
    expect(options[0].ownLinks).toBe(2);
    expect(options[0].oppLinks).toBe(0);
    expect(options[0].owners).toEqual([P2]);
  });
});

describe('findTrackCubeDeliveries — St.Lucia 트랙 큐브는 원래부터 타인 철도 개방', () => {
  it('타인 소유 트랙 체인을 지나 같은 색 도시로 배달 가능하다 (소유자 필터 없음 확인)', () => {
    // 내 트랙(1,1)에 파랑 큐브 — 타인(P2) 트랙(2,1)을 지나야만 파랑 도시 T(3,1)에 닿는다
    const b = board(
      [city('T', 'blue', 3, 1)],
      [
        trk(1, 1, [3, 0], P1, { cube: 'blue' }),
        trk(2, 1, [3, 0], P2),
      ]
    );
    const deliveries = findTrackCubeDeliveries(b, 't1-1', 4, P1);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].city.id).toBe('T');
    expect(deliveries[0].oppLinks).toBeGreaterThan(0); // 타인 트랙 경유가 집계될 뿐 차단되지 않음
  });
});

describe('findLongestPath — 타인 링크 최소 tie-break', () => {
  it('내 링크 수가 같으면 타인 링크가 적은(총 링크 짧은) 경로를 고른다', () => {
    // P(0,1)→T(4,1): 직행(아랫줄, 내1·총1) vs M 경유(내1 + 타인1·총2)
    const b = board(
      [city('P', 'red', 0, 1), city('M', 'yellow', 2, 0), city('T', 'blue', 4, 1)],
      [
        trk(1, 0, [2, 0], P1), // P↔M 내꺼
        trk(3, 0, [3, 0], P2), // M→(4,0) 타인
        trk(4, 0, [3, 1], P2), // (3,0)→T 타인
        trk(1, 2, [4, 0], P1), // 아랫줄 직행 내꺼
        trk(2, 2, [3, 0], P1),
        trk(3, 2, [3, 0], P1),
        trk(4, 2, [3, 5], P1), // (3,2)↔T(NE)
      ]
    );
    const path = findLongestPath({ col: 0, row: 1 }, { col: 4, row: 1 }, b, P1, 4, 'blue', 0, 4);
    expect(path).not.toBeNull();
    // 구 규칙(총 링크 최대)이면 M 경유(총2)를 골라 P2에 수입을 헌납했다
    expect(path!.some(c => c.col === 3 && c.row === 0)).toBe(false);
    expect(countOppPathLinks(path!, b, P1)).toBe(0);
  });

  it('opponentExtra=0이면 타인 경로는 아예 탐색되지 않는다 (기존 동작 보존)', () => {
    const b = buildBoardA([trk(3, 0, [3, 0], P2)], false);
    const path = findLongestPath(P_COORD, T_COORD, b, P1, 4, 'blue', 0, 0);
    expect(path).toBeNull(); // 아랫길 없음 + 다리는 타인 → 도달 불가
  });
});

describe('교차/공존 헥스 2회 통과 (2026-07-26 사용자 발견 — 한국 실전 재현)', () => {
  // 실게임(Korea) 기하 축소 재현: D(6,5) 빨강 큐브 → T(10,5) 빨강 도시.
  //   2링크 본인길: D─(7,5)나─MID(8,6)─(8,7)나─(9,6)#보조(나)─(10,6)나─T          (내2)
  //   3링크 혼합길: D─MID─(9,6)#기본(남)─(9,5)#보조(남)─(10,4)남─NC(9,4)─(9,5)#기본(나)─T
  //     → (9,5) 공존 헥스를 "남의 보조 트랙"과 "내 기본 트랙"으로 두 번 지난다 (내2+남1, 총3).
  // 헥스 단위 visited는 두 번째 통과를 차단해 3링크 경로가 통째로 사라졌다.
  const D = { col: 6, row: 5 };
  const T = { col: 10, row: 5 };
  const cities = () => [
    city('D', 'blue', 6, 5, ['red']),
    city('MID', 'purple', 8, 6),
    city('NC', 'black', 9, 4),
    city('T', 'red', 10, 5),
  ];
  const coexistTracks = () => [
    trk(9, 6, [3, 5], P2, { secondaryEdges: [2, 0], secondaryOwner: P1, trackType: 'coexist' }),
    trk(9, 5, [0, 4], P1, { secondaryEdges: [2, 5], secondaryOwner: P2, trackType: 'coexist' }),
    trk(10, 4, [2, 3], P2),
    trk(7, 5, [1, 3], P1),
  ];

  it('같은 공존 헥스의 독립된 두 트랙을 각각 한 번씩 지나는 3링크 경로를 찾는다', () => {
    const b = board(cities(), [
      ...coexistTracks(),
      trk(8, 7, [4, 5], P1),  // 2링크 본인길
      trk(10, 6, [3, 5], P1),
    ]);
    const options = findRouteOptions(D, T, b, P1, 4, 'red');
    // 디폴트 = 본인 철도 2링크 (내 수입 최대·타인 0)
    expect(options[0].ownLinks).toBe(2);
    expect(options[0].oppLinks).toBe(0);
    expect(options[0].totalLinks).toBe(2);
    // 동률(내2) 3링크 혼합 경로도 선택지로 노출 — (9,5)를 두 번 지나는 경로
    const mixed = options.find(o => o.oppLinks > 0);
    expect(mixed).toBeDefined();
    expect(mixed!.ownLinks).toBe(2);
    expect(mixed!.oppLinks).toBe(1);
    expect(mixed!.totalLinks).toBe(3);
    expect(mixed!.owners).toEqual([P2]);
    expect(mixed!.path.filter(c => c.col === 9 && c.row === 5)).toHaveLength(2);
  });

  it('공존 헥스 2회 통과가 유일한 길이어도 목적지가 누락되지 않는다 (findReachableDestinations)', () => {
    const b = board(cities(), coexistTracks()); // 2링크 본인길 제거 — 혼합 3링크가 유일
    const options = findRouteOptions(D, T, b, P1, 4, 'red');
    expect(options).toHaveLength(1);
    expect(options[0].totalLinks).toBe(3);
    const reachable = findReachableDestinations(D, b, P1, 4, 'red', 0, 4);
    expect(reachable.some(c => c.id === 'T')).toBe(true);
  });
});
