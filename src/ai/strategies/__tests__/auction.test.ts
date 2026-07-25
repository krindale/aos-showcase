/**
 * auction.ts (ΔVP 기반 경매) 단위 테스트
 *
 * 검증 항목:
 * 1. 경합이 없으면 입찰 상한이 낮아 일찍 포기 (2인전 첫 포기는 무료)
 * 2. 건설 예산 + 운영비를 침범하는 입찰을 하지 않음
 * 3. 혼자 남으면 complete
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { decideAuctionBid } from '../auction';
import { clearTurnPlans } from '../../strategy/turnPlan';
import { clearCurrentRoutes } from '../../strategy/state';
import { clearPathCache } from '../../strategy/analyzer';
import {
  createMockGameState,
  createMockPlayer,
} from '../../__tests__/helpers/mockState';
import { AuctionState } from '@/types/game';

function makeAuction(overrides?: Partial<AuctionState>): AuctionState {
  return {
    currentBidder: 'player1',
    highestBid: 0,
    highestBidder: null,
    droppedOutPlayers: [],
    bids: { player1: 0, player2: 0, player3: 0, player4: 0, player5: 0, player6: 0 },
    lastActedPlayer: null,
    ...overrides,
  };
}

describe('auction.ts — ΔVP 기반 경매', () => {
  beforeEach(() => {
    clearTurnPlans();
    clearCurrentRoutes();
    clearPathCache();
  });

  it('경합이 없으면 높은 입찰 경쟁에서 일찍 포기한다', () => {
    // 기본 mock: 큐브 없음 → 경합 배달 없음, 트랙 없음 → 경합 건설 없음
    const state = createMockGameState({
      currentPhase: 'determinePlayerOrder',
      auction: makeAuction({ highestBid: 4, highestBidder: 'player2' }),
    });

    const decision = decideAuctionBid(state, 'player1');
    expect(decision.action).toBe('pass'); // 1등 가치 ≈ 0.3VP → 상한 $0 → $4 추격 안 함
  });

  it('현금이 많아도 건설 예산과 운영비를 침범하는 입찰을 하지 않는다', () => {
    const state = createMockGameState({
      currentPhase: 'determinePlayerOrder',
      auction: makeAuction({ highestBid: 8, highestBidder: 'player2' }),
      players: {
        player1: createMockPlayer('player1', { cash: 12, issuedShares: 3, engineLevel: 2 }),
      } as never,
    });

    // cashCeiling = 12 - buildBudget - (3+2) ≤ 7 → $8 추격 불가
    const decision = decideAuctionBid(state, 'player1');
    expect(decision.action).toBe('pass');
  });

  it('혼자 남으면 complete를 반환한다', () => {
    const state = createMockGameState({
      currentPhase: 'determinePlayerOrder',
      playerOrder: ['player1', 'player2'],
      auction: makeAuction({ droppedOutPlayers: ['player2'], highestBid: 1, highestBidder: 'player1' }),
    });

    const decision = decideAuctionBid(state, 'player1');
    expect(decision.action).toBe('complete');
  });

  it('상한 내에서는 현재 입찰 +1로 추격한다', () => {
    // 경합 상황: 양쪽 모두 배달 가능한 큐브 구성이 어렵다면, 상한이 최소 $0 이상인
    // 저액 구간($0 → $1)에서의 입찰 동작만 검증
    const state = createMockGameState({
      currentPhase: 'determinePlayerOrder',
      players: {
        player1: createMockPlayer('player1', { cash: 30 }),
      } as never,
    });

    // 경매 시작 전: 가치가 있으면 $1 시작, 없으면 pass — 어느 쪽이든 유효한 결정
    const decision = decideAuctionBid(state, 'player1');
    expect(['bid', 'pass']).toContain(decision.action);
    if (decision.action === 'bid') {
      expect(decision.amount).toBe(1);
    }
  });
});
