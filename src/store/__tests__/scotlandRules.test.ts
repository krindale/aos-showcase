// Scotland 특수룰 store 테스트
// 정본: AOSD Exp Vol II Rules v2 "Scotland" + scotland-v2 시트 인쇄문
//  ① 셋업: 2인 8턴 / 도시당 큐브 2 / 디스플레이 34칸 / 주머니 색깔별 −6 (총 66개)
//  ② 경매: 포기자(패자) 절반(올림) 지불
//  ③ Turn Order: 다음 턴 경매 생략·보유자 무조건 선공
//  ④ Ayr↔Glasgow: 마을 가닥 $2 = 링크 그 자체 (수입 귀속 포함), 도시화 시 직결 링크로 승계
//  ⑤ 페리: 양끝 마을이 모두 도시화된 후에만 $6 구매
//  ⑥ 물품 성장: 주사위 4(라이트: 도시·A~D)+4(다크: E~H) 분할

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { getMapProfile } from '@/maps/getMapProfile';
import { MapId } from '@/maps/MapId';
import { getPathLinkOwners } from '@/utils/hexGrid';
import type { PlayerId } from '@/types/game';

const AYR = { col: 6, row: 1 };
const GLASGOW = { col: 6, row: 2 };
const STORNOWAY = { col: 1, row: 0 };
const ULLAPOOL = { col: 1, row: 2 };
const AYR_TO_GLASGOW_EDGE = 2; // 데이터 공간 SW — (6,1) 홀수 행의 (6,2) 방향

function initScotland() {
  useGameStore.getState().initGame('scotland', ['A', 'B'], []);
  return useGameStore.getState();
}

describe('Scotland 특수룰', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { logSpy.mockRestore(); warnSpy.mockRestore(); vi.restoreAllMocks(); });

  it('프로파일: 2인 전용 8턴, 경매 절반, 턴오더 경매 생략, 성장 4+4', () => {
    const p = getMapProfile(MapId.Scotland);
    expect(p.supportedPlayers).toEqual([2]);
    expect(p.maxTurns).toBe(8);
    expect(p.auctionLoserPaysHalf).toBe(true);
    expect(p.turnOrderSkipsAuction).toBe(true);
    expect(p.growthDiceSplit).toEqual({ light: 4, dark: 4 });
    expect(p.actionDescription('turnOrder')).toContain('경매 없이');
  });

  it('셋업: 도시 6×2 큐브, 디스플레이 34칸, 주머니 20개 (총 66 = 색깔별 −6)', () => {
    const s = initScotland();
    expect(s.maxTurns).toBe(8);
    expect(s.board.cities).toHaveLength(6);
    s.board.cities.forEach(c => expect(c.cubes).toHaveLength(2));
    expect(s.goodsDisplay.slots).toHaveLength(34);
    // 66(총 큐브) − 34(디스플레이) − 12(도시 셋업) = 20
    expect(s.goodsDisplay.bag).toHaveLength(20);
    // 직결 링크 3개 전부 미개통
    expect(s.board.directLinks).toHaveLength(3);
    s.board.directLinks!.forEach(d => expect(d.owner).toBeNull());
  });

  it('경매: 포기자는 입찰액의 절반(올림)만 지불, 승자는 전액', () => {
    const s = initScotland();
    const [first, second] = s.playerOrder;
    useGameStore.setState({
      currentPhase: 'determinePlayerOrder',
      auction: {
        currentBidder: first,
        highestBid: 5,
        highestBidder: first,
        droppedOutPlayers: [second],
        bids: { [first]: 5, [second]: 3 } as Record<PlayerId, number>,
        lastActedPlayer: second,
      },
    });
    const cashBefore = {
      [first]: useGameStore.getState().players[first].cash,
      [second]: useGameStore.getState().players[second].cash,
    };
    useGameStore.getState().resolveAuction();
    const after = useGameStore.getState();
    expect(after.players[first].cash).toBe(cashBefore[first] - 5); // 승자 전액
    expect(after.players[second].cash).toBe(cashBefore[second] - 2); // ceil(3/2)
    expect(after.playerOrder[0]).toBe(first);
  });

  it('Turn Order: 보유자가 있으면 경매를 생략하고 무조건 선공', () => {
    const s = initScotland();
    const holder = s.playerOrder[1]; // 후공이 직전 턴 turnOrder를 골랐다고 가정
    useGameStore.setState({
      currentPhase: 'issueShares',
      currentPlayer: s.playerOrder[s.playerOrder.length - 1],
      players: {
        ...s.players,
        [holder]: { ...s.players[holder], turnOrderPassAvailable: true },
      },
    });
    useGameStore.getState().nextPhase();
    const after = useGameStore.getState();
    expect(after.currentPhase).toBe('selectActions'); // 경매 단계 생략
    expect(after.playerOrder[0]).toBe(holder);
    expect(after.currentPlayer).toBe(holder);
    expect(after.players[holder].turnOrderPassAvailable).toBe(false); // 소비됨
  });

  it('Turn Order: 보유자가 없으면 표준대로 경매 단계 진행', () => {
    const s = initScotland();
    useGameStore.setState({
      currentPhase: 'issueShares',
      currentPlayer: s.playerOrder[s.playerOrder.length - 1],
    });
    useGameStore.getState().nextPhase();
    expect(useGameStore.getState().currentPhase).toBe('determinePlayerOrder');
  });

  it('Ayr↔Glasgow: 가닥 건설 $2(마을 $1+가닥 $1) + 수입은 가닥 소유자에게 귀속', () => {
    const s = initScotland();
    const builder = s.playerOrder[0];
    useGameStore.setState({ currentPhase: 'buildTrack', currentPlayer: builder });
    // 링크 없인 수입 귀속 대상 없음
    expect(getPathLinkOwners([AYR, GLASGOW], s.board)).toEqual([null]);

    const cashBefore = useGameStore.getState().players[builder].cash;
    expect(useGameStore.getState().canBuildTownSpur(AYR, AYR_TO_GLASGOW_EDGE)).toBe(true);
    expect(useGameStore.getState().buildTownSpur(AYR, AYR_TO_GLASGOW_EDGE)).toBe(true);
    const after = useGameStore.getState();
    expect(after.players[builder].cash).toBe(cashBefore - 2); // 룰북 £2와 일치
    expect(after.phaseState.builtTracksThisTurn).toBe(1);
    // 인접 마을↔도시 가닥 링크의 수입 귀속 (정산 미러)
    expect(getPathLinkOwners([AYR, GLASGOW], after.board)).toEqual([builder]);
    expect(getPathLinkOwners([GLASGOW, AYR], after.board)).toEqual([builder]);
  });

  it('페리: 양끝 도시화 전엔 구매 불가, 도시화 후 $6 구매 가능 (id 승계 포함)', () => {
    const s = initScotland();
    const buyer = s.playerOrder[0];
    useGameStore.setState({ currentPhase: 'buildTrack', currentPlayer: buyer });

    // 도시화 전: 거부
    expect(useGameStore.getState().buildDirectLink('ST', 'UL')).toBe(false);

    // Stornoway 도시화 (타일 A)
    useGameStore.setState({
      ui: { ...useGameStore.getState().ui, urbanizationMode: true, selectedNewCityTile: 'A' },
    });
    expect(useGameStore.getState().placeNewCity(STORNOWAY)).toBe(true);
    let links = useGameStore.getState().board.directLinks!;
    expect(links.find(d => d.cost === 6 && d.cityA === 'A')).toBeTruthy(); // ST → A 승계
    // 한쪽만 도시: 여전히 거부
    expect(useGameStore.getState().buildDirectLink('A', 'UL')).toBe(false);

    // Ullapool 도시화 (타일 B)
    useGameStore.setState({
      ui: { ...useGameStore.getState().ui, urbanizationMode: true, selectedNewCityTile: 'B' },
    });
    expect(useGameStore.getState().placeNewCity(ULLAPOOL)).toBe(true);
    links = useGameStore.getState().board.directLinks!;
    const ferry = links.find(d => d.cost === 6 && d.cityA === 'A')!;
    expect(ferry.cityB).toBe('B'); // UL → B 승계

    // 양끝 도시: 구매 성공 ($6 + 건설 카운트 1)
    const cashBefore = useGameStore.getState().players[buyer].cash;
    const builtBefore = useGameStore.getState().phaseState.builtTracksThisTurn;
    expect(useGameStore.getState().buildDirectLink('A', 'B')).toBe(true);
    const after = useGameStore.getState();
    expect(after.players[buyer].cash).toBe(cashBefore - 6);
    expect(after.phaseState.builtTracksThisTurn).toBe(builtBefore + 1);
    expect(after.board.directLinks!.find(d => d.cityA === 'A' && d.cityB === 'B')!.owner).toBe(buyer);
  });

  it('Ayr 도시화: 기존 가닥 소유자가 Ayr↔Glasgow 직결 링크를 승계한다', () => {
    const s = initScotland();
    const builder = s.playerOrder[0];
    useGameStore.setState({ currentPhase: 'buildTrack', currentPlayer: builder });
    expect(useGameStore.getState().buildTownSpur(AYR, AYR_TO_GLASGOW_EDGE)).toBe(true);

    // Ayr 도시화 (타일 C — 다른 플레이어가 해도 링크는 가닥 소유자 것)
    const other = s.playerOrder[1];
    useGameStore.setState({
      currentPlayer: other,
      ui: { ...useGameStore.getState().ui, urbanizationMode: true, selectedNewCityTile: 'C' },
    });
    expect(useGameStore.getState().placeNewCity(AYR)).toBe(true);

    const after = useGameStore.getState();
    const link = after.board.directLinks!.find(d => d.cost === 2)!;
    expect(link.cityA).toBe('C'); // AY → C 승계
    expect(link.cityB).toBe('glasgow');
    expect(link.owner).toBe(builder); // 가닥 소유자 승계 (룰북: 도시화돼도 제거되지 않는다)
    // 가닥 자체는 도시화로 제거됨
    expect(after.board.townSpurs!.some(sp => sp.townCoord.col === AYR.col && sp.townCoord.row === AYR.row)).toBe(false);
    // 수입 귀속: 이제 직결 링크 경유 (getPathLinkOwners의 도시-도시 분기)
    expect(getPathLinkOwners([AYR, GLASGOW], after.board)).toEqual([builder]);
  });

  it('물품 성장: 라이트 주사위 4개만 도시 열에 적용, 다크 4개는 미배치 E~H에 무효', () => {
    initScotland();
    // edinburgh 열(주사위 1, 시작 0)·G 열(주사위 1 다크, 시작 30)만 채운 통제 디스플레이
    const slots: (ReturnType<typeof initScotland>['goodsDisplay']['slots'])[number][] = Array(34).fill(null);
    slots[0] = 'red'; slots[1] = 'yellow'; slots[2] = 'blue';
    slots[30] = 'purple'; slots[31] = 'purple';
    useGameStore.setState({
      currentPhase: 'goodsGrowth',
      goodsDisplay: { slots, bag: [] },
      goodsGrowthEvent: null,
    });
    const edinBefore = useGameStore.getState().board.cities.find(c => c.id === 'edinburgh')!.cubes.length;

    // 라이트 [1,2,2,2] → edinburgh(1) 큐브 1개만 이동. 다크 [1,1,1,1] → G 열은 도시 미배치라 스킵.
    // (엔진이 8개를 전부 라이트로 오적용하면 edinburgh가 +3 되므로 이 단언이 잡는다)
    useGameStore.getState().growGoods([1, 2, 2, 2, 1, 1, 1, 1]);

    const after = useGameStore.getState();
    const edinburgh = after.board.cities.find(c => c.id === 'edinburgh')!;
    expect(edinburgh.cubes.length).toBe(edinBefore + 1);
    expect(after.goodsDisplay.slots[0]).toBeNull();      // 위에서부터 1개만
    expect(after.goodsDisplay.slots[1]).toBe('yellow');
    expect(after.goodsDisplay.slots[30]).toBe('purple'); // 다크 열은 그대로 (G 미배치)
    expect(after.goodsDisplay.slots[31]).toBe('purple');
  });
});
