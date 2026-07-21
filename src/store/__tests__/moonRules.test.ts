// 달(Moon) 맵 특수룰 store/엔진 레벨 테스트
// 셋업(큐브/밤낮/건설상한) · 밤 도시 수요/통과 · Moon Base 무수요 · 주사위 성장 · 밤낮 교대
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, createInitialGameState } from '@/store/gameStore';
import { cityAcceptsCube, cityBlocksTransit, cityEverAcceptsCube, findReachableDestinations, getNeighborHex } from '@/utils/hexGrid';
import { touchesMasterNetwork } from '@/store/helpers/boardRules';
import { applyLowGravitation } from '@/store/slices/moveSlice';
import { getMapProfile } from '@/maps/getMapProfile';
import { nightSideAfter } from '@/utils/moonMap';
import { City, PlayerId, TrackTile } from '@/types/game';

function setupMoon() {
  const s = createInitialGameState('moon', ['A', 'B', 'C', 'D'], []);
  useGameStore.setState(s);
  return useGameStore.getState();
}

const cityById = (id: string): City =>
  useGameStore.getState().board.cities.find((c) => c.id === id)!;

describe('달 맵 셋업', () => {
  beforeEach(() => { setupMoon(); });

  it('Moon Base 8개(4인×2), 일반 도시 2개, 1턴 밤=서쪽, 건설 상한 2', () => {
    const state = useGameStore.getState();
    expect(cityById('moonBase').cubes.length).toBe(8);
    for (const id of ['imbrium', 'humorum', 'nubium', 'serenitatis', 'tranquillitatis', 'nectaris']) {
      expect(cityById(id).cubes.length).toBe(2);
    }
    expect(state.board.nightSide).toBe('west');
    expect(state.phaseState.maxTracksThisTurn).toBe(2);
    expect(state.maxTurns).toBe(8);
    // 물품 디스플레이 사용 (공식 룰 "평소처럼 채운다") — 도시 6열×3 + 신도시 A~D×2 = 26칸
    expect(state.goodsDisplay.slots.length).toBe(26);
    expect(state.goodsDisplay.slots.every((c) => c !== null)).toBe(true);
  });

  it('신규 도시 타일은 A·B·C·D만 (검은 신도시 E~H 제거 — 공식 룰)', () => {
    const ids = useGameStore.getState().newCityTiles.map((t) => t.id).sort();
    expect(ids).toEqual(['A', 'B', 'C', 'D']);
  });

  it('3인 게임: Landing hex(Moon Base) 큐브 = 인원×2 = 6개', () => {
    const s3 = createInitialGameState('moon', ['A', 'B', 'C'], []);
    useGameStore.setState(s3);
    expect(cityById('moonBase').cubes.length).toBe(6);
  });
});

describe('밤/낮 수요·통과 판정', () => {
  beforeEach(() => { setupMoon(); });

  it('밤쪽(서) 도시는 검은 큐브만 수용, 낮쪽(동) 도시는 원래 색 수용', () => {
    const board = useGameStore.getState().board;
    const imbrium = cityById('imbrium');       // 서쪽 빨강 — 1턴 밤
    const nectaris = cityById('nectaris');     // 동쪽 파랑 — 1턴 낮
    expect(cityAcceptsCube(imbrium, 'red', board)).toBe(false);
    expect(cityAcceptsCube(imbrium, 'black', board)).toBe(true);
    expect(cityAcceptsCube(nectaris, 'blue', board)).toBe(true);
    expect(cityAcceptsCube(nectaris, 'black', board)).toBe(false);
  });

  it('밤쪽 도시는 검은색 외 큐브의 통과도 차단, Moon Base는 항상 통과 가능·수요 없음', () => {
    const board = useGameStore.getState().board;
    const imbrium = cityById('imbrium');
    const moonBase = cityById('moonBase');
    expect(cityBlocksTransit(imbrium, 'red', board)).toBe(true);
    expect(cityBlocksTransit(imbrium, 'black', board)).toBe(false);
    expect(cityBlocksTransit(moonBase, 'red', board)).toBe(false);
    for (const color of ['red', 'blue', 'yellow', 'purple', 'black'] as const) {
      expect(cityAcceptsCube(moonBase, color, board)).toBe(false);
    }
  });

  it('턴 롤오버 시 밤쪽이 교대된다 (west → east)', () => {
    useGameStore.setState({ currentPhase: 'advanceTurn' });
    useGameStore.getState().nextPhase();
    expect(useGameStore.getState().board.nightSide).toBe('east');
    expect(useGameStore.getState().currentTurn).toBe(2);
  });
});

describe('Moon Base 네트워크 (마스터 네트워크 시드)', () => {
  beforeEach(() => { setupMoon(); });

  it('빈 보드: Moon Base 인접에만 건설 가능', () => {
    const board = useGameStore.getState().board;
    const moonBase = cityById('moonBase');
    // Moon Base 동쪽 이웃 헥스 (데이터 E=edge0) — 인접이라 OK
    const nb = getNeighborHex(moonBase.coord, 0, board);
    expect(touchesMasterNetwork(board, nb, [3, 0], 'moonBase')).toBe(true);
    // 멀리 떨어진 헥스(다른 도시 imbrium 옆) — 네트워크 밖
    const far = getNeighborHex(cityById('imbrium').coord, 0, board);
    expect(touchesMasterNetwork(board, far, [3, 0], 'moonBase')).toBe(false);
  });
});

describe('Low Gravitation (Production 대체 — 상대 링크 수입 이전)', () => {
  beforeEach(() => { setupMoon(); });

  const changes = (v: Partial<Record<PlayerId, number>>) => ({ ...v });

  it('저중력 선택자가 이동하면 경로 최다 수입 상대의 링크 수입 1을 가져온다', () => {
    const state = useGameStore.getState();
    useGameStore.setState({
      players: {
        ...state.players,
        player1: { ...state.players.player1, selectedAction: 'lowGravitation' },
      },
    });
    const s = useGameStore.getState();
    const inc = changes({ player1: 1, player2: 2, player3: 1 });
    const target = applyLowGravitation(s, 'player1', inc);
    expect(target).toBe('player2'); // 최다 수입 상대
    expect(inc.player2).toBe(1);    // 상대 -1
    expect(inc.player1).toBe(2);    // 나 +1
  });

  it('저중력 미선택자·상대 수입 없음이면 적용되지 않는다 (production 선택도 효과 없음)', () => {
    const s = useGameStore.getState(); // 아무도 lowGravitation 아님
    const inc1 = changes({ player1: 1, player2: 2 });
    expect(applyLowGravitation(s, 'player1', inc1)).toBeNull();
    expect(inc1.player2).toBe(2);
    // production은 이제 표준 행동 — 저중력 효과 없음
    useGameStore.setState({
      players: { ...s.players, player1: { ...s.players.player1, selectedAction: 'production' } },
    });
    const sProd = useGameStore.getState();
    const incProd = changes({ player1: 1, player2: 2 });
    expect(applyLowGravitation(sProd, 'player1', incProd)).toBeNull();

    useGameStore.setState({
      players: { ...s.players, player1: { ...s.players.player1, selectedAction: 'lowGravitation' } },
    });
    const s2 = useGameStore.getState();
    const inc2 = changes({ player1: 3 }); // 경로에 상대 링크 없음
    expect(applyLowGravitation(s2, 'player1', inc2)).toBeNull();
    expect(inc2.player1).toBe(3);
  });
});

describe('저중력 경로 확장 + 계획용 수요 판정', () => {
  beforeEach(() => { setupMoon(); });

  it('상대 소유 링크는 opponentExtra=1일 때만 경유할 수 있다', () => {
    const state = useGameStore.getState();
    const moonBase = cityById('moonBase');
    const nectaris = cityById('nectaris');
    // moonBase → nectaris를 잇는 체인을 "상대(player2)" 소유로 부설
    const chain: { col: number; row: number }[] = [];
    let cur = getNeighborHex(moonBase.coord, 0, state.board);
    let guard = 0;
    while (!(cur.col === nectaris.coord.col && cur.row === nectaris.coord.row) && guard++ < 20) {
      chain.push({ ...cur });
      let best = cur; let bestD = Infinity;
      for (let e = 0; e < 6; e++) {
        const nb = getNeighborHex(cur, e, state.board);
        const d = Math.abs(nb.col - nectaris.coord.col) * 2 + Math.abs(nb.row - nectaris.coord.row);
        if (d < bestD) { bestD = d; best = nb; }
      }
      cur = best;
    }
    const nodes = [moonBase.coord, ...chain, nectaris.coord];
    const tracks: TrackTile[] = [];
    for (let i = 1; i < nodes.length - 1; i++) {
      const findEdge = (from: { col: number; row: number }, to: { col: number; row: number }): number => {
        for (let e = 0; e < 6; e++) {
          const nb = getNeighborHex(nodes[i], e, state.board);
          void from;
          if (nb.col === to.col && nb.row === to.row) return e;
        }
        throw new Error('not adjacent');
      };
      tracks.push({
        id: `opp${i}`, coord: { ...nodes[i] },
        edges: [findEdge(nodes[i], nodes[i - 1]), findEdge(nodes[i], nodes[i + 1])] as [number, number],
        owner: 'player2', trackType: 'simple',
      });
    }
    useGameStore.setState({
      board: { ...state.board, trackTiles: [...state.board.trackTiles, ...tracks] },
    });
    const board = useGameStore.getState().board;
    // player1은 blue 큐브를 nectaris(동쪽·낮·blue)로: 상대 링크뿐 —
    const without = findReachableDestinations(moonBase.coord, board, 'player1', 6, 'blue', 0, 0);
    expect(without.some((c) => c.id === 'nectaris')).toBe(false); // 저중력 없음: 불가
    const withLowGrav = findReachableDestinations(moonBase.coord, board, 'player1', 6, 'blue', 0, 1);
    expect(withLowGrav.some((c) => c.id === 'nectaris')).toBe(true); // 저중력: 상대 링크 1개 경유
  });

  it('계획용 판정(cityEverAcceptsCube): 밤 도시도 원래 색을 인정, 검은 큐브는 어느 도시든 인정', () => {
    const board = useGameStore.getState().board;
    const imbrium = cityById('imbrium'); // 서쪽 빨강 — 1턴 밤 (현재는 black만 수용)
    expect(cityAcceptsCube(imbrium, 'red', board)).toBe(false);      // 실행 판정: 지금은 불가
    expect(cityEverAcceptsCube(imbrium, 'red', board)).toBe(true);   // 계획 판정: 낮이 되면 가능
    expect(cityEverAcceptsCube(imbrium, 'black', board)).toBe(true); // 검은 큐브: 밤이 되는 턴 가능
    expect(cityEverAcceptsCube(cityById('moonBase'), 'red', board)).toBe(false); // 무수요는 불변
  });
});

describe('달 AI 튜닝 훅 (2026-07-21)', () => {
  beforeEach(() => { setupMoon(); });

  it('밤낮 위상 헬퍼가 스토어의 실제 교대와 8턴 내내 일치한다', () => {
    // 1턴 west 시작 + 매 턴 반전 — 헬퍼가 규칙의 단일 소스임을 보장
    for (let t = 1; t <= 8; t++) {
      expect(useGameStore.getState().board.nightSide).toBe(nightSideAfter('west', t - 1));
      if (t < 8) {
        useGameStore.setState({ currentPhase: 'advanceTurn' });
        useGameStore.getState().nextPhase();
      }
    }
  });

  it('배달 타이밍 계수: 검은 큐브 우대, 색 큐브는 목적지가 밤이면 소폭 할인', () => {
    const profile = getMapProfile('moon');
    const state = useGameStore.getState(); // 1턴, 밤=west
    const imbrium = cityById('imbrium');   // 서(밤) 빨강
    const nectaris = cityById('nectaris'); // 동(낮) 파랑
    // 검은 큐브는 어느 목적지든 매 턴 배달처가 있어 우대
    expect(profile.aiDeliveryTimingFactor(imbrium, 'black', 1, state)).toBeGreaterThan(1);
    // 색 큐브: 첫 배달 턴에 목적지가 낮이면 1.0, 밤이면 할인
    expect(profile.aiDeliveryTimingFactor(nectaris, 'blue', 1, state)).toBe(1);
    expect(profile.aiDeliveryTimingFactor(imbrium, 'red', 1, state)).toBeLessThan(1);
    // Moon Base(무수요)는 판정 대상 아님
    expect(profile.aiDeliveryTimingFactor(cityById('moonBase'), 'red', 1, state)).toBe(1);
    // 다른 맵은 항등 (기본값)
    expect(getMapProfile('germany').aiDeliveryTimingFactor(imbrium, 'black', 1, state)).toBe(1);
  });

  it('달만 후반 계획 발행 금지·운영비 income 상계가 켜져 있다 (타 맵 기본값 불변)', () => {
    const moon = getMapProfile('moon');
    expect(moon.aiNoBuildIssueLastTurns).toBe(5); // 8턴 중 T4~8 계획 발행 금지
    expect(moon.aiPlanExpensesNetOfIncome).toBe(true);
    for (const other of ['germany', 'korea', 'rust-belt', 'montreal', 'western-us']) {
      expect(getMapProfile(other).aiNoBuildIssueLastTurns).toBe(0);
      expect(getMapProfile(other).aiPlanExpensesNetOfIncome).toBe(false);
      expect(getMapProfile(other).aiEngineFrontLoad).toBe(true);
    }
    // 달도 엔진 front-load는 켜둔 상태 (끄면 악화 — MapProfile 주석의 기각 실험)
    expect(moon.aiEngineFrontLoad).toBe(true);
  });
});

describe('달 물품 성장 (주사위 → 도시 직접)', () => {
  beforeEach(() => { setupMoon(); });

  it('Moon Base와 연결 안 된 도시는 주사위가 일치해도 성장하지 않는다 (디스플레이에 잔류)', () => {
    const before = cityById('nectaris').cubes.length; // 동쪽(낮) 1/2
    const slotsBefore = useGameStore.getState().goodsDisplay.slots.filter(Boolean).length;
    useGameStore.getState().growGoods([1, 2, 1, 2, 1, 2, 1, 2]);
    expect(cityById('nectaris').cubes.length).toBe(before); // 연결 없음 — 받지 못함
    expect(useGameStore.getState().goodsDisplay.slots.filter(Boolean).length).toBe(slotsBefore); // 디스플레이 그대로
    expect(useGameStore.getState().goodsGrowthEvent?.dice.length).toBe(8);
  });

  it('낮쪽 + Moon Base 연결 도시만 주머니에서 성장한다', () => {
    const state = useGameStore.getState();
    const moonBase = cityById('moonBase');
    const nectaris = cityById('nectaris'); // 동쪽(1턴 낮), dice 1/2
    // Moon Base ↔ Nectaris 완성 링크를 인위로 부설: 데이터 좌표로 직선 경로 구성
    // moonBase (5,8) → nectaris (8,10). 간단히: 두 정거장을 잇는 가짜 트랙 체인 대신
    // "인접 링크"가 필요하므로 중간 헥스에 연결 트랙을 놓는다.
    // moonBase 데이터 (col5,row8), nectaris (col8,row10)는 멀어서 — 경로: 링크 판정은
    // findCompletedLinks가 트랙 체인을 따라가므로 실제 유효 체인을 놓는다.
    // moonBase E(edge0) 이웃 → (6,8); (6,8) E → (7,8)? nectaris는 (8,10)...
    // 간단한 검증을 위해 가까운 서쪽 도시 대신 임의 체인을 계산해 부설한다.
    // (6,8)=moonBase 동쪽, (7,8), (8,8) ... nectaris (8,10) — 대각 필요.
    // 여기서는 유효성 검증이 목적이 아니므로 트랙 체인을 좌표 인접에 맞춰 놓는다:
    const chain: { col: number; row: number }[] = [];
    let cur = getNeighborHex(moonBase.coord, 0, state.board); // (6? ,8) 동쪽
    // nectaris까지 단순 그리디 (테스트 보드에서 항상 수렴)
    const target = nectaris.coord;
    let guard = 0;
    while (!(cur.col === target.col && cur.row === target.row) && guard++ < 20) {
      chain.push({ ...cur });
      // 다음 스텝: col/row 차이를 줄이는 인접 엣지 선택
      let best = cur; let bestD = Infinity; let bestEdge = 0;
      for (let e = 0; e < 6; e++) {
        const nb = getNeighborHex(cur, e, state.board);
        const d = Math.abs(nb.col - target.col) * 2 + Math.abs(nb.row - target.row);
        if (d < bestD) { bestD = d; best = nb; bestEdge = e; }
      }
      void bestEdge;
      cur = best;
    }
    // 체인 좌표들을 순서대로 트랙으로 연결
    const tracks: TrackTile[] = [];
    const nodes = [moonBase.coord, ...chain, nectaris.coord];
    for (let i = 1; i < nodes.length - 1; i++) {
      const prev = nodes[i - 1]; const here = nodes[i]; const next = nodes[i + 1];
      const inEdge = ((): number => {
        for (let e = 0; e < 6; e++) {
          const nb = getNeighborHex(here, e, state.board);
          if (nb.col === prev.col && nb.row === prev.row) return e;
        }
        throw new Error('not adjacent');
      })();
      const outEdge = ((): number => {
        for (let e = 0; e < 6; e++) {
          const nb = getNeighborHex(here, e, state.board);
          if (nb.col === next.col && nb.row === next.row) return e;
        }
        throw new Error('not adjacent');
      })();
      tracks.push({
        id: `t${i}`, coord: { ...here }, edges: [inEdge, outEdge] as [number, number],
        owner: 'player1', trackType: 'simple',
      });
    }
    useGameStore.setState({
      board: { ...state.board, trackTiles: [...state.board.trackTiles, ...tracks] },
    });

    const beforeNectaris = cityById('nectaris').cubes.length;
    const beforeImbrium = cityById('imbrium').cubes.length; // 서쪽(밤) — 연결 여부 무관 성장 금지
    const bagBefore = useGameStore.getState().goodsDisplay.bag.length;
    const slotsBefore = useGameStore.getState().goodsDisplay.slots.filter(Boolean).length;
    useGameStore.getState().growGoods([1, 2, 3]); // 1·2 = nectaris(낮·연결) 2회, imbrium(밤) 0회
    expect(cityById('nectaris').cubes.length).toBe(beforeNectaris + 2);
    expect(cityById('imbrium').cubes.length).toBe(beforeImbrium);
    // 공식 룰: 큐브는 물품 디스플레이(그 도시 열)에서 나온다 — 주머니 아님
    expect(useGameStore.getState().goodsDisplay.slots.filter(Boolean).length).toBe(slotsBefore - 2);
    expect(useGameStore.getState().goodsDisplay.bag.length).toBe(bagBefore);
  });
});
