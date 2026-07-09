/**
 * 독일 Engineer 절반 할인 — 실제 gameStore + 실제 독일 보드 구동 검증.
 *
 * helpers/__tests__/engineerDiscount.test.ts는 순수 함수(공식)만 본다. 여기선 buildTrack이
 * 실제로 그 공식대로 현금을 깎는지, 독일 보드의 진짜 헥스 비용($2 평지 / 고정비용 헥스)으로 확인한다.
 *
 * 룰북: "Engineer 행동 시 트랙 1개를 절반 비용(올림)으로 배치" — 지형·비용 하한 조건 없음.
 * 구현: 타일을 하나씩 커밋하므로 '이번 빌더 턴 최고가 타일 1개'가 절반이 되도록 매번 차액 정산.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { getNeighborHex } from '@/utils/hexGrid';
import { HexCoord } from '@/types/game';

const key = (c: HexCoord) => `${c.col},${c.row}`;

/** 독일 보드에서 도시에 인접하고 지정한 정가를 가진 헥스를 찾는다. */
function findHexNextToCity(wantCost: number): { coord: HexCoord; cost: number; edges: [number, number] } | null {
  const s = useGameStore.getState();
  const cityKeys = new Set(s.board.cities.map((c) => key(c.coord)));
  for (const t of s.board.hexTiles) {
    if (t.terrain === 'lake' || cityKeys.has(key(t.coord))) continue;
    const base = t.terrain === 'mountain' ? 4 : t.terrain === 'river' ? 3 : 2;
    const cost = t.fixedCost ?? base;
    if (cost !== wantCost) continue;
    for (let e = 0; e < 6; e++) {
      const n = getNeighborHex(t.coord, e);
      // 도시로 향하는 변 e + 반대편 변 = 그 도시에 붙는 직선 트랙
      if (cityKeys.has(key(n))) return { coord: t.coord, cost, edges: [e, (e + 3) % 6] as [number, number] };
    }
  }
  return null;
}

function setupGermanyBuild(action: 'engineer' | 'firstBuild', cash = 100) {
  useGameStore.getState().initGame('germany', ['P1', 'P2', 'P3', 'P4']);
  const s = useGameStore.getState();
  useGameStore.setState({
    currentPhase: 'buildTrack',
    currentPlayer: 'player1',
    players: { ...s.players, player1: { ...s.players.player1, cash, selectedAction: action, isAI: false } },
    phaseState: { ...s.phaseState, builtTracksThisTurn: 0, maxTracksThisTurn: 3, engineerMaxTileCost: 0, engineerDiscountGiven: 0 },
  });
}

const cash = () => useGameStore.getState().players.player1.cash;

describe('독일 Engineer 절반 할인 — 실제 store', () => {
  beforeEach(() => setupGermanyBuild('engineer'));

  it('평지($2)만 지어도 할인된다 → $1 청구 (기존 구현은 $2였음)', () => {
    const plain = findHexNextToCity(2);
    expect(plain, '도시 인접 평지 헥스').not.toBeNull();
    const before = cash();
    const ok = useGameStore.getState().buildTrack(plain!.coord, plain!.edges);
    expect(ok).toBe(true);
    console.log(`평지 $2 건설: 현금 ${before} → ${cash()} (청구 $${before - cash()})`);
    expect(before - cash()).toBe(1);
  });

  it('Engineer 미선택이면 정가 $2', () => {
    setupGermanyBuild('firstBuild');
    const plain = findHexNextToCity(2)!;
    const before = cash();
    useGameStore.getState().buildTrack(plain.coord, plain.edges);
    console.log(`(firstBuild) 평지 $2 건설: 청구 $${before - cash()}`);
    expect(before - cash()).toBe(2);
  });

  it('싼 타일 먼저 → 비싼 타일 나중: 할인이 비싼 쪽으로 옮겨간다', () => {
    const plain = findHexNextToCity(2)!;
    const pricey = findHexNextToCity(8) ?? findHexNextToCity(7) ?? findHexNextToCity(6)!;
    expect(pricey, '도시 인접 고정비용 헥스').toBeTruthy();

    const c0 = cash();
    useGameStore.getState().buildTrack(plain.coord, plain.edges);
    const afterPlain = cash();
    expect(c0 - afterPlain).toBe(1); // $2 → $1

    useGameStore.getState().buildTrack(pricey.coord, pricey.edges);
    const afterPricey = cash();
    const charge2 = afterPlain - afterPricey;
    const total = c0 - afterPricey;

    console.log(`평지$2 → 비싼$${pricey.cost}: 청구 $1 + $${charge2} = 총 $${total}`);
    // 할인이 비싼 타일로 이동: 총액 = (2 + cost) - floor(cost/2)
    expect(total).toBe(2 + pricey.cost - Math.floor(pricey.cost / 2));
    expect(charge2).toBe(pricey.cost - Math.floor(pricey.cost / 2) + 1);
  });

  it('$10 보유, 2+4+8 상당 — 잔액이 정확히 맞는다 (사용자 제보 케이스)', () => {
    const tiles = [2, 4, 8].map((c) => findHexNextToCity(c)).filter(Boolean) as { coord: HexCoord; cost: number; edges: [number, number] }[];
    console.log(`도시 인접 타일 발견: ${tiles.map((t) => '$' + t.cost).join(', ')}`);
    expect(tiles.length).toBe(3); // 독일 보드엔 도시 인접 $2/$4/$8이 모두 있다

    const c0 = cash();
    for (const t of tiles) expect(useGameStore.getState().buildTrack(t.coord, t.edges)).toBe(true);
    const paid = c0 - cash();
    const costs = tiles.map((t) => t.cost);
    const expected = costs.reduce((a, b) => a + b, 0) - Math.floor(Math.max(...costs) / 2);
    console.log(`정가 ${costs.map((c) => '$' + c).join('+')} → 실제 지불 $${paid} (기대 $${expected})`);
    expect(paid).toBe(expected);
  });
});
