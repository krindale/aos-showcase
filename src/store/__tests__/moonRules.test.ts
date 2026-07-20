// 달(Moon) 맵 특수룰 store/엔진 레벨 테스트
// 셋업(큐브/밤낮/건설상한) · 밤 도시 수요/통과 · Moon Base 무수요 · 주사위 성장 · 밤낮 교대
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, createInitialGameState } from '@/store/gameStore';
import { cityAcceptsCube, cityBlocksTransit, getNeighborHex } from '@/utils/hexGrid';
import { touchesMasterNetwork } from '@/store/helpers/boardRules';
import { applyLowGravitation } from '@/store/slices/moveSlice';
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
    // 물품 디스플레이 미사용 (슬롯 0칸)
    expect(state.goodsDisplay.slots.length).toBe(0);
  });

  it('신규 도시 타일은 A·B·E·F만 (C·D·G·H 제거)', () => {
    const ids = useGameStore.getState().newCityTiles.map((t) => t.id).sort();
    expect(ids).toEqual(['A', 'B', 'E', 'F']);
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

  it('production 선택자가 이동하면 경로 최다 수입 상대의 링크 수입 1을 가져온다', () => {
    const state = useGameStore.getState();
    useGameStore.setState({
      players: {
        ...state.players,
        player1: { ...state.players.player1, selectedAction: 'production' },
      },
    });
    const s = useGameStore.getState();
    const inc = changes({ player1: 1, player2: 2, player3: 1 });
    const target = applyLowGravitation(s, 'player1', inc);
    expect(target).toBe('player2'); // 최다 수입 상대
    expect(inc.player2).toBe(1);    // 상대 -1
    expect(inc.player1).toBe(2);    // 나 +1
  });

  it('production 미선택자·상대 수입 없음이면 적용되지 않는다', () => {
    const s = useGameStore.getState(); // 아무도 production 아님
    const inc1 = changes({ player1: 1, player2: 2 });
    expect(applyLowGravitation(s, 'player1', inc1)).toBeNull();
    expect(inc1.player2).toBe(2);

    useGameStore.setState({
      players: { ...s.players, player1: { ...s.players.player1, selectedAction: 'production' } },
    });
    const s2 = useGameStore.getState();
    const inc2 = changes({ player1: 3 }); // 경로에 상대 링크 없음
    expect(applyLowGravitation(s2, 'player1', inc2)).toBeNull();
    expect(inc2.player1).toBe(3);
  });
});

describe('달 물품 성장 (주사위 → 도시 직접)', () => {
  beforeEach(() => { setupMoon(); });

  it('Moon Base와 연결 안 된 도시는 주사위가 일치해도 성장하지 않는다', () => {
    const before = cityById('nectaris').cubes.length; // 동쪽(낮) 1/2
    useGameStore.getState().growGoods([1, 2, 1, 2, 1, 2, 1, 2]);
    expect(cityById('nectaris').cubes.length).toBe(before); // 연결 없음 — 버려짐
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
    useGameStore.getState().growGoods([1, 2, 3]); // 1·2 = nectaris(낮·연결) 2회, imbrium(밤) 0회
    expect(cityById('nectaris').cubes.length).toBe(beforeNectaris + 2);
    expect(cityById('imbrium').cubes.length).toBe(beforeImbrium);
    expect(useGameStore.getState().goodsDisplay.bag.length).toBe(bagBefore - 2);
  });
});
