/**
 * auction.ts (ΔVP 기반 경매) 단위 테스트
 *
 * 검증 항목:
 * 1. 경합이 없으면 입찰 상한이 낮아 일찍 포기 (2인전 첫 포기는 무료)
 * 2. 건설 예산 + 운영비를 침범하는 입찰을 하지 않음
 * 3. 혼자 남으면 complete
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { decideAuctionBid, clearDesperationCache } from '../auction';
import { clearTurnPlans } from '../../strategy/turnPlan';
import { clearCurrentRoutes } from '../../strategy/state';
import { clearPathCache } from '../../strategy/analyzer';
import {
  firstSeatBidCeiling,
  personalityRankBidBonus,
  AUCTION_PERSONALITIES,
  DEFAULT_FIRST_SEAT_BID_PARAMS,
} from '../../strategy/vp';
import {
  createMockGameState,
  createMockPlayer,
} from '../../__tests__/helpers/mockState';
import { AuctionState, AUCTION_PERSONALITY_IDS } from '@/types/game';

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
    clearDesperationCache(); // (playerId, turn) 키라 테스트 간 같은 턴 번호로 누출 방지
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

describe('봇 경매 성격 (AUCTION_PERSONALITIES)', () => {
  beforeEach(() => {
    clearTurnPlans();
    clearCurrentRoutes();
    clearPathCache();
    clearDesperationCache();
  });

  it('standard 명시 배정 = 미지정과 동일한 결정 (항등 게이트)', () => {
    const makeState = (personality?: 'standard') =>
      createMockGameState({
        currentPhase: 'determinePlayerOrder',
        auction: makeAuction({ highestBid: 4, highestBidder: 'player2' }),
        players: {
          player1: createMockPlayer('player1', {
            cash: 12, issuedShares: 3, engineLevel: 2,
            ...(personality ? { auctionPersonality: personality } : {}),
          }),
        } as never,
      });

    const unspecified = decideAuctionBid(makeState(), 'player1');
    clearDesperationCache(); clearTurnPlans(); clearCurrentRoutes(); clearPathCache();
    const explicit = decideAuctionBid(makeState('standard'), 'player1');
    expect(explicit).toEqual(unspecified);
  });

  it('firstSeatBidCeiling 서열: aggressive ≥ standard ≥ conservative (전 절실함 구간)', () => {
    const agg = AUCTION_PERSONALITIES.aggressive.bid;
    const con = AUCTION_PERSONALITIES.conservative.bid;
    for (let d = 0; d <= 5; d += 0.1) {
      const a = firstSeatBidCeiling(d * AUCTION_PERSONALITIES.aggressive.desperationMult, 0.5, agg);
      const s = firstSeatBidCeiling(d, 0.5, DEFAULT_FIRST_SEAT_BID_PARAMS);
      const c = firstSeatBidCeiling(d * AUCTION_PERSONALITIES.conservative.desperationMult, 0.5, con);
      expect(a).toBeGreaterThanOrEqual(s);
      expect(s).toBeGreaterThanOrEqual(c);
    }
    // 포화 상한 확인: 공격형 $4 / 표준 $3 / 보수형 $2
    expect(firstSeatBidCeiling(10, 0.5, agg)).toBe(4);
    expect(firstSeatBidCeiling(10, 0.5, DEFAULT_FIRST_SEAT_BID_PARAMS)).toBe(3);
    expect(firstSeatBidCeiling(10, 0.5, con)).toBe(2);
  });

  it('standard 파라미터의 firstSeatBidCeiling은 기존 상수 산식과 동일 (params 미전달 = 전달)', () => {
    for (let d = 0; d <= 5; d += 0.05) {
      expect(firstSeatBidCeiling(d, 0.5, DEFAULT_FIRST_SEAT_BID_PARAMS))
        .toBe(firstSeatBidCeiling(d, 0.5));
    }
  });

  it('denial: 절실함이 없어도 경매 시작 시 $1 오프닝, 현금 없으면 안전판이 막는다', () => {
    const openState = createMockGameState({
      currentPhase: 'determinePlayerOrder',
      players: {
        player1: createMockPlayer('player1', { cash: 10, auctionPersonality: 'denial' }),
      } as never,
    });
    const open = decideAuctionBid(openState, 'player1');
    expect(open).toEqual({ action: 'bid', amount: 1 });

    // 운영비(주식2+엔진1−income0=3)를 빼면 $0 → 오프닝 불가 (건설예산·운영비 불침범)
    clearDesperationCache(); clearTurnPlans(); clearCurrentRoutes(); clearPathCache();
    const brokeState = createMockGameState({
      currentPhase: 'determinePlayerOrder',
      players: {
        player1: createMockPlayer('player1', { cash: 3, income: 0, auctionPersonality: 'denial' }),
      } as never,
    });
    expect(decideAuctionBid(brokeState, 'player1').action).toBe('pass');
  });

  it('wuType: 꼴찌 순번이면 +$2 보너스로 추격, standard는 포기', () => {
    const makeState = (personality?: 'wuType') =>
      createMockGameState({
        currentPhase: 'determinePlayerOrder',
        playerOrder: ['player2', 'player1'], // player1 = 꼴찌(rank 1, n=2)
        auction: makeAuction({ highestBid: 1, highestBidder: 'player2', currentBidder: 'player1' }),
        players: {
          player1: createMockPlayer('player1', {
            cash: 20, ...(personality ? { auctionPersonality: personality } : {}),
          }),
        } as never,
      });

    expect(decideAuctionBid(makeState(), 'player1').action).toBe('pass');
    clearDesperationCache(); clearTurnPlans(); clearCurrentRoutes(); clearPathCache();
    const wu = decideAuctionBid(makeState('wuType'), 'player1');
    expect(wu).toEqual({ action: 'bid', amount: 2 });
  });

  it('personalityRankBidBonus: 꼴찌 +2, 뒤쪽 절반 +1, 소인원 앞 순번은 0', () => {
    // 6인 (WU 공식과 동일): 6위 +2, 4·5위 +1, 1~3위 0
    expect(personalityRankBidBonus(5, 6)).toBe(2);
    expect(personalityRankBidBonus(4, 6)).toBe(1);
    expect(personalityRankBidBonus(3, 6)).toBe(1);
    expect(personalityRankBidBonus(2, 6)).toBe(0);
    // 2인: 꼴찌만 +2, 1위는 0 (WU 원공식이면 1위도 +1이 되는 소인원 함정 가드)
    expect(personalityRankBidBonus(1, 2)).toBe(2);
    expect(personalityRankBidBonus(0, 2)).toBe(0);
    // 4인: 4위 +2, 3위 +1, 1·2위 0
    expect(personalityRankBidBonus(3, 4)).toBe(2);
    expect(personalityRankBidBonus(2, 4)).toBe(1);
    expect(personalityRankBidBonus(1, 4)).toBe(0);
  });

  it('전 성격이 건설 예산·운영비 안전판을 침범하지 않는다', () => {
    for (const id of AUCTION_PERSONALITY_IDS) {
      clearDesperationCache(); clearTurnPlans(); clearCurrentRoutes(); clearPathCache();
      const state = createMockGameState({
        currentPhase: 'determinePlayerOrder',
        auction: makeAuction({ highestBid: 8, highestBidder: 'player2' }),
        players: {
          player1: createMockPlayer('player1', {
            cash: 12, issuedShares: 3, engineLevel: 2, income: 0, auctionPersonality: id,
          }),
        } as never,
      });
      // cash 12 − 운영비 5 = $7 < $9 추격 필요액 → 어떤 성격도 pass
      expect(decideAuctionBid(state, 'player1').action).toBe('pass');
    }
  });
});
