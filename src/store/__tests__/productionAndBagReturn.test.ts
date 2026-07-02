/**
 * 실플레이 버그 회귀 테스트 (2026-07-02)
 *
 * 1. 생산(Production) 기회 보장: goodsGrowth 진입 시 currentPlayer가 무조건
 *    playerOrder[0]으로 잡혀, 생산 선택자가 경매 1등이 아니면 ProductionPanel이
 *    안 떠 생산이 통째로 스킵되던 버그 (독일 맵 실플레이에서 발견 — 원인은 맵 공통).
 *    → goodsGrowth 진입 시 사람 생산 선택자를 currentPlayer로 잡는지 맵별 검증.
 *
 * 2. 배달 큐브 주머니 반환 (룰북 V): "이동 완료 후 큐브는 미사용 물품 주머니로 반환".
 *    반환하지 않으면 주머니가 고갈돼 생산·물품 성장 보충이 어긋난다.
 */

import { describe, it, expect } from 'vitest';
import { useGameStore } from '../gameStore';

/** incomeReduction 단계에서 nextPhase → goodsGrowth 진입을 재현 */
function enterGoodsGrowth(mapId: string, opts: {
  productionHolder?: 'player1' | 'player2';
  holderIsAI?: boolean;
  productionUsed?: boolean;
}) {
  useGameStore.getState().initGame(mapId, ['Player1', 'Player2']);
  const s = useGameStore.getState();

  const players = { ...s.players };
  if (opts.productionHolder) {
    players[opts.productionHolder] = {
      ...players[opts.productionHolder]!,
      selectedAction: 'production',
      isAI: opts.holderIsAI ?? false,
    };
  }

  useGameStore.setState({
    currentPhase: 'incomeReduction',
    // 생산 선택자가 경매 1등이 아닌 상황 (버그 발생 조건)
    playerOrder: ['player1', 'player2'],
    currentPlayer: 'player1',
    players,
    phaseState: { ...s.phaseState, productionUsed: opts.productionUsed ?? false },
  });

  useGameStore.getState().nextPhase();
  return useGameStore.getState();
}

describe('생산(Production) 기회 보장 — goodsGrowth 진입 currentPlayer', () => {
  // 원인이 맵 공통(nextPhase)이므로 여러 맵에서 동일하게 검증
  const MAPS = ['tutorial', 'germany', 'rust-belt', 'korea', 'western-us'];

  for (const mapId of MAPS) {
    it(`${mapId}: 경매 1등이 아닌 사람 생산 선택자가 goodsGrowth의 currentPlayer가 된다`, () => {
      const f = enterGoodsGrowth(mapId, { productionHolder: 'player2' });
      expect(f.currentPhase).toBe('goodsGrowth');
      // 수정 전: player1(playerOrder[0]) → ProductionPanel 미표시로 생산 스킵
      expect(f.currentPlayer).toBe('player2');
    });
  }

  it('생산 선택자가 AI면 기존대로 playerOrder[0] (goodsGrowth는 사람이 주사위 진행)', () => {
    const f = enterGoodsGrowth('germany', { productionHolder: 'player2', holderIsAI: true });
    expect(f.currentPhase).toBe('goodsGrowth');
    expect(f.currentPlayer).toBe('player1');
  });

  it('이미 생산을 사용했으면 playerOrder[0]', () => {
    const f = enterGoodsGrowth('germany', { productionHolder: 'player2', productionUsed: true });
    expect(f.currentPhase).toBe('goodsGrowth');
    expect(f.currentPlayer).toBe('player1');
  });

  it('생산 선택자가 없으면 playerOrder[0]', () => {
    const f = enterGoodsGrowth('germany', {});
    expect(f.currentPhase).toBe('goodsGrowth');
    expect(f.currentPlayer).toBe('player1');
  });
});

describe('배달 큐브 주머니 반환 (룰북 V)', () => {
  it('completeCubeMove 후 배달된 큐브가 goodsDisplay.bag에 반환된다', () => {
    useGameStore.getState().initGame('tutorial', ['Player1', 'Player2']);
    const s = useGameStore.getState();
    const bagBefore = s.goodsDisplay.bag.length;

    // 배달 완료 직전 상태를 재현 (출발지에서 큐브는 이미 제거된 상태 — selectDestinationCity가 수행)
    const [cityA, cityB] = s.board.cities;
    useGameStore.setState({
      ui: {
        ...s.ui,
        movingCube: {
          color: 'red',
          path: [cityA.coord, cityB.coord],
          currentIndex: 1,
          context: { playerId: 'player1', phase: 'moveGoods', moveRound: 1 },
        },
      },
    });

    useGameStore.getState().completeCubeMove();

    const f = useGameStore.getState();
    expect(f.ui.movingCube).toBeNull();
    expect(f.goodsDisplay.bag.length).toBe(bagBefore + 1);
    // 반환된 색이 배달한 큐브 색과 일치
    expect(f.goodsDisplay.bag[f.goodsDisplay.bag.length - 1]).toBe('red');
  });
});
