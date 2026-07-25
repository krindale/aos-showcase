/**
 * 타인 철도 이용 — 사람 UI 경로 선택 상태기계 store 테스트 (스텝 2)
 *
 * selectCube → routeOptions 계산 → selectDestinationCity(후보 1개=즉시 커밋 /
 * 여러 개=routeChoice 진입) → selectRouteOption → 재클릭·confirmRouteChoice 커밋.
 *
 * 보드 기하는 routeOptions.test.ts의 보드 A와 동일 (odd-r offset):
 *   P(0,1) 출발 — M(2,0)·N(4,0) 노랑 경유 — T(6,1) 파랑 목적지
 *   윗길: P─(1,0)내꺼─M─(3,0)타인─N─(5,0)(5,1)내꺼─T (내2+타1)
 *   아랫길: P─(1,2)…(6,2) 전부 내꺼─T (내1)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../gameStore';
import type { City, CityColor, CubeColor, PlayerId, TrackTile } from '@/types/game';

const P1: PlayerId = 'player1';
const P2: PlayerId = 'player2';

function city(id: string, color: CityColor, col: number, row: number, cubes: CubeColor[] = []): City {
  return { id, name: id, coord: { col, row }, color, cubes };
}

function trk(col: number, row: number, edges: [number, number], owner: PlayerId | null): TrackTile {
  return { id: `t${col}-${row}`, coord: { col, row }, edges, owner, trackType: 'simple' };
}

/** 보드 A 설치 — withUpper: 윗길(타인 다리) 포함 여부 */
function installBoard(withUpper = true) {
  const tracks: TrackTile[] = [
    trk(1, 2, [4, 0], P1),
    trk(2, 2, [3, 0], P1),
    trk(3, 2, [3, 0], P1),
    trk(4, 2, [3, 0], P1),
    trk(5, 2, [3, 0], P1),
    trk(6, 2, [3, 5], P1),
  ];
  if (withUpper) {
    tracks.push(
      trk(1, 0, [2, 0], P1),
      trk(3, 0, [3, 0], P2),
      trk(5, 0, [3, 1], P1),
      trk(5, 1, [4, 0], P1)
    );
  }
  const state = useGameStore.getState();
  useGameStore.setState({
    currentPhase: 'moveGoods',
    currentPlayer: P1,
    board: {
      ...state.board,
      cities: [
        city('P', 'red', 0, 1, ['blue']),
        city('M', 'yellow', 2, 0),
        city('N', 'yellow', 4, 0),
        city('T', 'blue', 6, 1),
      ],
      towns: [],
      trackTiles: tracks,
      townSpurs: [],
    },
    players: {
      ...state.players,
      [P1]: { ...state.players[P1], engineLevel: 4 },
    },
  });
}

const T_COORD = { col: 6, row: 1 };

describe('타인 철도 경로 선택 상태기계', () => {
  beforeEach(() => {
    useGameStore.getState().initGame('tutorial', ['사람1', '사람2']);
  });

  it('selectCube: 목적지별 후보를 계산하고 디폴트(내 수입 최대) 경로를 미리보기로 둔다', () => {
    installBoard();
    useGameStore.getState().selectCube('P', 0);
    const ui = useGameStore.getState().ui;
    expect(ui.routeOptions).toHaveLength(1);
    expect(ui.routeOptions[0].options).toHaveLength(2);
    // 디폴트 = 윗길(내2+타1) — 미리보기 movePath가 윗길
    expect(ui.routeOptions[0].options[0].ownLinks).toBe(2);
    expect(ui.movePath.some(c => c.col === 3 && c.row === 0)).toBe(true);
    expect(ui.reachableDestinations).toHaveLength(1);
    expect(ui.routeChoice).toBeNull();
  });

  it('후보 1개면 목적지 클릭 즉시 커밋 (기존 UX 보존)', () => {
    installBoard(false); // 아랫길만
    useGameStore.getState().selectCube('P', 0);
    useGameStore.getState().selectDestinationCity(T_COORD);
    const ui = useGameStore.getState().ui;
    expect(ui.movingCube).not.toBeNull();
    expect(ui.routeChoice).toBeNull();
    // 출발 도시에서 큐브 제거됨
    expect(useGameStore.getState().board.cities.find(c => c.id === 'P')!.cubes).toHaveLength(0);
  });

  it('후보 여러 개면 목적지 클릭 시 경로 선택 모드 진입(커밋 안 함), 재클릭이 확정', () => {
    installBoard();
    useGameStore.getState().selectCube('P', 0);
    useGameStore.getState().selectDestinationCity(T_COORD);
    let ui = useGameStore.getState().ui;
    expect(ui.movingCube).toBeNull(); // 아직 커밋 아님
    expect(ui.routeChoice).not.toBeNull();
    expect(ui.routeChoice!.options).toHaveLength(2);
    expect(ui.routeChoice!.selectedIndex).toBe(0);
    // 재클릭 → 현재 선택(디폴트 = 윗길 내2)으로 확정
    useGameStore.getState().selectDestinationCity(T_COORD);
    ui = useGameStore.getState().ui;
    expect(ui.movingCube).not.toBeNull();
    expect(ui.movingCube!.path.some(c => c.col === 3 && c.row === 0)).toBe(true);
    expect(ui.routeChoice).toBeNull(); // startCubeAnimation이 정리
  });

  it('selectRouteOption으로 경로를 바꾸고 confirmRouteChoice로 커밋한다', () => {
    installBoard();
    useGameStore.getState().selectCube('P', 0);
    useGameStore.getState().selectDestinationCity(T_COORD);
    useGameStore.getState().selectRouteOption(1); // 본인-철도-최선(아랫길)으로 전환
    let ui = useGameStore.getState().ui;
    expect(ui.routeChoice!.selectedIndex).toBe(1);
    expect(ui.movePath.some(c => c.col === 3 && c.row === 2)).toBe(true); // 아랫길 미리보기
    useGameStore.getState().confirmRouteChoice();
    ui = useGameStore.getState().ui;
    expect(ui.movingCube).not.toBeNull();
    expect(ui.movingCube!.path.some(c => c.col === 3 && c.row === 2)).toBe(true); // 아랫길로 이동
    expect(ui.movingCube!.path.some(c => c.col === 3 && c.row === 0)).toBe(false);
  });

  it('cancelSelection이 경로 선택 상태를 정리한다', () => {
    installBoard();
    useGameStore.getState().selectCube('P', 0);
    useGameStore.getState().selectDestinationCity(T_COORD);
    expect(useGameStore.getState().ui.routeChoice).not.toBeNull();
    useGameStore.getState().cancelSelection();
    const ui = useGameStore.getState().ui;
    expect(ui.routeChoice).toBeNull();
    expect(ui.routeOptions).toHaveLength(0);
    expect(ui.selectedCube).toBeNull();
  });

  it('타인 경유 확정 → 정산: 내 링크 수입은 나에게, 빌린 링크 수입은 그 주인에게 (공짜 수입 없음)', () => {
    installBoard();
    const s0 = useGameStore.getState();
    const income1 = s0.players[P1].income;
    const income2 = s0.players[P2].income;
    useGameStore.getState().selectCube('P', 0);
    useGameStore.getState().selectDestinationCity(T_COORD);
    useGameStore.getState().confirmRouteChoice(); // 디폴트 = 윗길 (내2 + 타1)
    expect(useGameStore.getState().ui.movingCube).not.toBeNull();
    useGameStore.getState().completeCubeMove();
    const s = useGameStore.getState();
    // 3링크 배달: P→M(내꺼)·M→N(P2)·N→T(내꺼) — 총 수입 3이 소유자별로 정확히 분배
    expect(s.players[P1].income).toBe(income1 + 2);
    expect(s.players[P2].income).toBe(income2 + 1);
    // 도착지 수익 펄스 이벤트도 같은 분배를 기록 (증가량 내림차순)
    expect(s.deliveryIncomeEvent?.dest).toEqual(T_COORD);
    expect(s.deliveryIncomeEvent?.gains).toEqual([
      { player: P1, amount: 2 },
      { player: P2, amount: 1 },
    ]);
  });

  it('봇은 경로 선택 UI 없이 디폴트로 즉시 커밋한다 (결정/실행 일치)', () => {
    installBoard();
    const st = useGameStore.getState();
    useGameStore.setState({
      players: { ...st.players, [P1]: { ...st.players[P1], isAI: true } },
    });
    useGameStore.getState().selectCube('P', 0);
    useGameStore.getState().selectDestinationCity(T_COORD);
    const ui = useGameStore.getState().ui;
    expect(ui.routeChoice).toBeNull();
    expect(ui.movingCube).not.toBeNull();
    expect(ui.movingCube!.path.some(c => c.col === 3 && c.row === 0)).toBe(true); // 디폴트 윗길
  });

  it('큐브 단위 게이트: 본인 철도로 못 가는 목적지는 숨기지 않는다 (합법 목적지 보존, 2026-07-26)', () => {
    // T(6,1) = 본인 철도 own2 (P→Y→T) / T2(4,0) = 타인 경유 own1+opp1이 유일한 길.
    // 과거엔 T2를 통째로 숨겼으나(2026-07-22 게이트), 합법 배달 목적지가 UI에서 사라져
    // "엔진상 더 긴 배달이 가능한데 짧은 가이드만 표시"되는 버그(사용자 발견) — 이제
    // 본인 철도 단독 경로가 없는 목적지는 유일한 길(타인 경유)을 그대로 노출한다.
    const install = (meIsBot: boolean) => {
      const st = useGameStore.getState();
      useGameStore.setState({
        currentPhase: 'moveGoods',
        currentPlayer: P1,
        board: {
          ...st.board,
          cities: [
            city('P', 'red', 0, 1, ['blue']),
            city('Y', 'yellow', 3, 2),
            city('M', 'yellow', 2, 0),
            city('T2', 'blue', 4, 0),
            city('T', 'blue', 6, 1),
          ],
          towns: [],
          townSpurs: [],
          trackTiles: [
            // 본인 철도 own2: P─(1,2)(2,2)─Y─(4,2)(5,2)(6,2)─T
            trk(1, 2, [4, 0], P1), trk(2, 2, [3, 0], P1),
            trk(4, 2, [3, 0], P1), trk(5, 2, [3, 0], P1), trk(6, 2, [3, 5], P1),
            // 타인 경유 own1+opp1: P─(1,0)내꺼─M─(3,0)타인─T2
            trk(1, 0, [2, 0], P1), trk(3, 0, [3, 0], P2),
          ],
        },
        players: {
          ...st.players,
          [P1]: { ...st.players[P1], engineLevel: 4, isAI: meIsBot },
        },
      });
    };
    install(false);
    useGameStore.getState().selectCube('P', 0);
    const ui = useGameStore.getState().ui;
    let dests = ui.reachableDestinations;
    expect(dests.some(d => d.col === 6 && d.row === 1)).toBe(true); // T 유지 (본인 철도 own2)
    // T2는 본인 철도로 도달 불가 — 유일한 길(타인 경유 own1+opp1)을 숨기지 않는다
    expect(dests.some(d => d.col === 4 && d.row === 0)).toBe(true);
    const t2 = ui.routeOptions.find(r => r.dest.col === 4 && r.dest.row === 0)!;
    expect(t2.options).toHaveLength(1);
    expect(t2.options[0].ownLinks).toBe(1);
    expect(t2.options[0].oppLinks).toBe(1);
    // 봇도 동일하게 노출 (ΔVP가 같은 판단 — 결정/실행 일치 유지)
    useGameStore.getState().initGame('tutorial', ['사람1', '사람2']);
    install(true);
    useGameStore.getState().selectCube('P', 0);
    dests = useGameStore.getState().ui.reachableDestinations;
    expect(dests.some(d => d.col === 4 && d.row === 0)).toBe(true);
  });

  it('범위 밖 selectRouteOption은 무시된다', () => {
    installBoard();
    useGameStore.getState().selectCube('P', 0);
    useGameStore.getState().selectDestinationCity(T_COORD);
    useGameStore.getState().selectRouteOption(5);
    expect(useGameStore.getState().ui.routeChoice!.selectedIndex).toBe(0);
  });
});
