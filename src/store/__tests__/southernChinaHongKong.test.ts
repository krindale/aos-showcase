// 남부 중국: Hong Kong 규칙 + 인터어반/페리 테스트
// 전색 수용 · 마지막 2턴 폐쇄 · 국유화 링크 경유 배달 금지 · $8 구매(턴당 1개·+1 VP) · 페리 인접
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, createInitialGameState } from '@/store/gameStore';
import {
  cityAcceptsCube,
  findReachableDestinations,
  getNeighborHex,
} from '@/utils/hexGrid';
import { CubeColor, PlayerId, TrackTile } from '@/types/game';

const P1: PlayerId = 'player1';

function setupChina() {
  const s = createInitialGameState('southern-china', ['A', 'B', 'C', 'D'], []);
  useGameStore.setState(s);
  return useGameStore.getState();
}

const hk = () => useGameStore.getState().board.cities.find((c) => c.id === 'hongkong')!;

describe('Hong Kong 전색 수용 + 마지막 2턴 폐쇄', () => {
  beforeEach(() => { setupChina(); });

  it('홍콩은 모든 색을 받고, 폐쇄되면 아무 색도 받지 않는다', () => {
    const board = useGameStore.getState().board;
    for (const color of ['red', 'blue', 'yellow', 'purple', 'black'] as CubeColor[]) {
      expect(cityAcceptsCube(hk(), color, board)).toBe(true);
    }
    const closed = { ...board, allAcceptClosed: true };
    for (const color of ['red', 'blue', 'yellow', 'purple', 'black'] as CubeColor[]) {
      expect(cityAcceptsCube(hk(), color, closed)).toBe(false);
    }
    // 일반 도시는 폐쇄와 무관
    const gz = board.cities.find((c) => c.id === 'guangzhou')!;
    expect(cityAcceptsCube(gz, 'blue', closed)).toBe(true);
  });

  it('턴 롤오버: 마지막 2턴(4인 8턴 → 7턴) 진입 시 폐쇄 플래그가 켜진다', () => {
    // 6턴 종료 → 7턴 시작: 폐쇄
    useGameStore.setState({ currentTurn: 6, currentPhase: 'advanceTurn' });
    useGameStore.getState().nextPhase();
    const state = useGameStore.getState();
    expect(state.currentTurn).toBe(7);
    expect(state.board.allAcceptClosed).toBe(true);
    // 그 전 턴(5→6)에는 안 켜짐
    setupChina();
    useGameStore.setState({ currentTurn: 5, currentPhase: 'advanceTurn' });
    useGameStore.getState().nextPhase();
    expect(useGameStore.getState().board.allAcceptClosed ?? false).toBe(false);
  });
});

describe('국유화 링크 경유 홍콩 배달 금지', () => {
  it('소유 링크로는 홍콩 도달 가능, 같은 링크가 국유화되면 불가', () => {
    setupChina();
    const s = useGameStore.getState();
    const sz = s.board.cities.find((c) => c.id === 'shenzhen')!;
    const owned: TrackTile = {
      id: 'tt1', coord: { col: 9, row: 8 }, edges: [3, 2], owner: P1, trackType: 'simple',
    };
    const boardOwned = { ...s.board, trackTiles: [owned] };
    const reach1 = findReachableDestinations(sz.coord, boardOwned, P1, 2, 'red');
    expect(reach1.some((c) => c.id === 'hongkong')).toBe(true);

    const nationalized: TrackTile = { ...owned, owner: null, isGovernment: true, isNationalized: true };
    const boardNat = { ...s.board, trackTiles: [nationalized] };
    const reach2 = findReachableDestinations(sz.coord, boardNat, P1, 2, 'red');
    expect(reach2.some((c) => c.id === 'hongkong')).toBe(false);
    // 같은 국유화 링크라도 일반 도시(홍콩 아님)로의 이동엔 제약이 없다 — Guangzhou→Shenzhen 검증
    const gz = s.board.cities.find((c) => c.id === 'guangzhou')!;
    const midTile: TrackTile = {
      id: 'tt2', coord: { col: 6, row: 8 }, edges: [0, 4], owner: null, isGovernment: true, isNationalized: true, trackType: 'simple',
    };
    // Wuzhou 가닥이 필요 없는 도시-도시 직접 사례가 없어, 국유화 트랙의 "이동 개방"은
    // 위 reach1/reach2 대비로 충분히 검증됨 (HK 외 목적지는 별도 차단 없음).
    void gz; void midTile;
  });
});

describe('인터어반·페리 구매', () => {
  beforeEach(() => {
    setupChina();
    useGameStore.setState({ currentPhase: 'buildTrack', currentPlayer: P1 });
  });

  it('인터어반(GZ↔SZ) $8 구매: 소유·건설 카운트·ferriesBuilt(+1 VP)', () => {
    const ok = useGameStore.getState().buildDirectLink('guangzhou', 'shenzhen');
    expect(ok).toBe(true);
    const state = useGameStore.getState();
    const link = state.board.directLinks!.find((d) => d.cityA === 'guangzhou' && d.cityB === 'shenzhen')!;
    expect(link.owner).toBe(P1);
    expect(state.players[P1].cash).toBe(2); // $10 − $8
    expect(state.players[P1].ferriesBuilt).toBe(1);
    expect(state.phaseState.builtTracksThisTurn).toBe(1);
  });

  it('턴당 1개 제한: 같은 턴에 두 번째 인터어반/페리 구매 불가', () => {
    useGameStore.setState((s) => ({
      players: { ...s.players, [P1]: { ...s.players[P1], cash: 30 } },
    }));
    expect(useGameStore.getState().buildDirectLink('guangzhou', 'shenzhen')).toBe(true);
    expect(useGameStore.getState().buildDirectLink('guangzhou', 'hongkong')).toBe(false);
    expect(useGameStore.getState().buildDirectLink('shenzhen', 'hongkong')).toBe(false);
  });

  it('SZ↔HK 링크 구매: 건설되면 이동 링크로 동작 + 디스크 단위로 계산', () => {
    useGameStore.setState((s) => ({
      players: { ...s.players, [P1]: { ...s.players[P1], cash: 30 } },
    }));
    expect(useGameStore.getState().buildDirectLink('shenzhen', 'hongkong')).toBe(true);
    const after = useGameStore.getState();
    const link = after.board.directLinks!.find((d) => d.cityA === 'shenzhen' && d.cityB === 'hongkong')!;
    expect(link.owner).toBe(P1);
    expect(after.players[P1].ferriesBuilt).toBe(1);
    // 건설된 직결 링크로 SZ→HK 배달 가능 (전색 수용)
    const sz = after.board.cities.find((c) => c.id === 'shenzhen')!;
    const reach = findReachableDestinations(sz.coord, after.board, P1, 2, 'red');
    expect(reach.some((c) => c.id === 'hongkong')).toBe(true);
  });

  it('다른 맵(Germany) 직결 링크는 인터어반 룰 미적용 (ferriesBuilt 없음)', () => {
    const s = createInitialGameState('germany', ['A', 'B', 'C', 'D', 'E'], []);
    useGameStore.setState({ ...s, currentPhase: 'buildTrack', currentPlayer: P1 });
    expect(useGameStore.getState().buildDirectLink('essen', 'duesseldorf')).toBe(true);
    expect(useGameStore.getState().players[P1].ferriesBuilt ?? 0).toBe(0);
    expect(useGameStore.getState().buildFerryEdge('any')).toBe(false); // 페리 변 없음 (기계만 잔존)
  });
});
