/**
 * vp.ts (ΔVP 환산기) 단위 테스트
 *
 * 검증 항목:
 * 1. 배달 ΔVP: 자기 1링크 > 상대 N링크 (구 점수 체계의 동점 모순 해소)
 * 2. λ(현금 한계가치): 건설 기회가 없으면 0
 * 3. incomeMarginalVP: 수입 감소 구간 경계에서 체감 (큰 맵 대비)
 * 4. 엔진 업그레이드 ΔVP: 상한/생존/마지막 턴 처리
 * 5. MapAIConfig: 튜토리얼 가정이 하드코딩되지 않음 (가짜 큰 맵 스모크)
 */

import { describe, it, expect } from 'vitest';
import { createMockGameState, createMockPlayer } from '../../__tests__/helpers/mockState';
import { getMapAIConfig } from '../mapConfig';
import {
  deliveryDeltaVP,
  engineUpgradeDeltaVP,
  cashToVPRate,
  incomeMarginalVP,
  incomeReductionAt,
  opponentWeight,
  remainingBuildTurns,
  LAMBDA_BASE,
  VP_PER_INCOME,
} from '../vp';
import { GAME_CONSTANTS } from '@/types/game';

describe('vp.ts — ΔVP 환산기', () => {
  describe('deliveryDeltaVP', () => {
    it('자기 1링크 배달이 상대 5링크 배달보다 명확히 높다 (동점 모순 해소)', () => {
      const state = createMockGameState({ currentPhase: 'moveGoods', currentTurn: 1, maxTurns: 3 });

      const own1 = deliveryDeltaVP(state, 'player1', 1, 0);
      const opp5 = deliveryDeltaVP(state, 'player1', 0, 5);

      expect(own1).toBeGreaterThan(0);       // income +1 = 양수 가치
      expect(opp5).toBeLessThan(0);          // 상대만 이득 = 음수
      expect(own1).toBeGreaterThan(opp5 + 10); // 압도적 차이
    });

    it('내 링크가 많을수록 가치가 비례 증가한다', () => {
      const state = createMockGameState({ currentPhase: 'moveGoods', currentTurn: 1, maxTurns: 3 });

      const own1 = deliveryDeltaVP(state, 'player1', 1, 0);
      const own2 = deliveryDeltaVP(state, 'player1', 2, 0);

      expect(own2).toBeGreaterThan(own1 * 1.9);
    });

    it('마지막 턴에도 income VP(영구 +3)는 유지된다', () => {
      const state = createMockGameState({ currentPhase: 'moveGoods', currentTurn: 3, maxTurns: 3 });

      const own1 = deliveryDeltaVP(state, 'player1', 1, 0);
      // 마지막 턴: λ=0이지만 income +1 = +3VP는 영구
      expect(own1).toBeGreaterThanOrEqual(VP_PER_INCOME);
    });
  });

  describe('cashToVPRate (λ)', () => {
    it('건설 기회가 남아있으면 LAMBDA_BASE', () => {
      const state = createMockGameState({ currentPhase: 'issueShares', currentTurn: 1, maxTurns: 3 });
      expect(cashToVPRate(state, 'player1')).toBe(LAMBDA_BASE);
    });

    it('마지막 턴 buildTrack 이후에는 0 (돈은 더 이상 VP로 바꿀 수 없음)', () => {
      const state = createMockGameState({ currentPhase: 'moveGoods', currentTurn: 3, maxTurns: 3 });
      expect(remainingBuildTurns(state)).toBe(0);
      expect(cashToVPRate(state, 'player1')).toBe(0);
    });

    it('마지막 턴이라도 buildTrack 이전이면 양수', () => {
      const state = createMockGameState({ currentPhase: 'issueShares', currentTurn: 3, maxTurns: 3 });
      expect(remainingBuildTurns(state)).toBe(1);
      expect(cashToVPRate(state, 'player1')).toBe(LAMBDA_BASE);
    });
  });

  describe('incomeMarginalVP — 수입 감소 구간 (큰 맵 대비)', () => {
    it('튜토리얼 구간(income < 11)에서는 gain × 3 그대로', () => {
      const state = createMockGameState({ currentPhase: 'moveGoods', currentTurn: 1, maxTurns: 3 });
      expect(incomeMarginalVP(state, 'player1', 1)).toBe(3);
      expect(incomeMarginalVP(state, 'player1', 2)).toBe(6);
    });

    it('수입 감소 구간 경계(10→11)를 넘으면 한계가치가 체감한다', () => {
      const state = createMockGameState({
        currentPhase: 'moveGoods',
        currentTurn: 1,
        maxTurns: 8,
        players: {
          player1: createMockPlayer('player1', { income: 10 }),
        } as never,
      });

      const atBoundary = incomeMarginalVP(state, 'player1', 1); // 10→11: 매턴 -2 구간 진입
      const state2 = createMockGameState({
        currentPhase: 'moveGoods',
        currentTurn: 1,
        maxTurns: 8,
        players: {
          player1: createMockPlayer('player1', { income: 5 }),
        } as never,
      });
      const safe = incomeMarginalVP(state2, 'player1', 1); // 5→6: 감소 없음

      expect(atBoundary).toBeLessThan(safe);
    });

    it('incomeReductionAt 구간 테이블이 룰북과 일치', () => {
      expect(incomeReductionAt(10)).toBe(0);
      expect(incomeReductionAt(11)).toBe(2);
      expect(incomeReductionAt(21)).toBe(4);
      expect(incomeReductionAt(31)).toBe(6);
      expect(incomeReductionAt(41)).toBe(8);
      expect(incomeReductionAt(50)).toBe(10);
    });
  });

  describe('engineUpgradeDeltaVP', () => {
    it('엔진 상한 도달 시 -Infinity', () => {
      const state = createMockGameState({
        currentPhase: 'moveGoods',
        players: { player1: createMockPlayer('player1', { engineLevel: 3 }) } as never,
      });
      // tutorial engineMax = 3
      expect(engineUpgradeDeltaVP(state, 'player1', 10)).toBe(-Infinity);
    });

    it('업그레이드 후 비용을 감당 못 하면 -Infinity (생존 게이트)', () => {
      const state = createMockGameState({
        currentPhase: 'moveGoods',
        players: {
          player1: createMockPlayer('player1', { engineLevel: 1, cash: 0, income: 0, issuedShares: 5 }),
        } as never,
      });
      expect(engineUpgradeDeltaVP(state, 'player1', 100)).toBe(-Infinity);
    });

    it('해금 배달 가치가 충분하면 양수', () => {
      const state = createMockGameState({
        currentPhase: 'moveGoods',
        currentTurn: 1,
        maxTurns: 3,
        players: {
          player1: createMockPlayer('player1', { engineLevel: 1, cash: 20, income: 3 }),
        } as never,
      });
      const unlockedVP = deliveryDeltaVP(state, 'player1', 2, 0); // 2링크 해금 ≈ +6VP대
      expect(engineUpgradeDeltaVP(state, 'player1', unlockedVP)).toBeGreaterThan(0);
    });
  });

  describe('opponentWeight — N인 일반화', () => {
    it('2인전은 1.0, 4인전은 1/3', () => {
      const state2p = createMockGameState({ activePlayers: ['player1', 'player2'] });
      expect(opponentWeight(state2p)).toBe(1);

      const state4p = createMockGameState({
        activePlayers: ['player1', 'player2', 'player3', 'player4'],
      });
      expect(opponentWeight(state4p)).toBeCloseTo(1 / 3);
    });
  });

  describe('MapAIConfig — 확장성 가드 (튜토리얼 하드코딩 금지)', () => {
    it('튜토리얼 맵: 엔진 상한 3', () => {
      const state = createMockGameState({ mapId: 'tutorial' });
      expect(getMapAIConfig(state).engineMax).toBe(3);
    });

    it('알 수 없는 큰 맵: 룰북 기본값(엔진 6, state.maxTurns)을 따른다', () => {
      const state = createMockGameState({ mapId: 'rust-belt', maxTurns: 8 });
      const config = getMapAIConfig(state);
      expect(config.engineMax).toBe(GAME_CONSTANTS.MAX_ENGINE); // 6
      expect(config.totalTurns).toBe(8);
      expect(config.buildsPerTurn).toBe(GAME_CONSTANTS.NORMAL_TRACK_LIMIT);
    });

    it('큰 맵 스모크: vp 함수들이 합리적 값을 반환 (엔진 6, 8턴)', () => {
      const state = createMockGameState({
        mapId: 'rust-belt',
        maxTurns: 8,
        currentTurn: 2,
        currentPhase: 'moveGoods',
        players: {
          player1: createMockPlayer('player1', { engineLevel: 4, cash: 30, income: 8 }),
        } as never,
      });

      // 엔진 4 → 5 업그레이드가 가능해야 함 (튜토리얼이면 -Infinity였을 것)
      const unlockedVP = deliveryDeltaVP(state, 'player1', 3, 0);
      const upgradeVP = engineUpgradeDeltaVP(state, 'player1', unlockedVP);
      expect(upgradeVP).toBeGreaterThan(0);
      expect(Number.isFinite(upgradeVP)).toBe(true);

      // 배달 가치도 유한하고 단조적
      expect(deliveryDeltaVP(state, 'player1', 5, 0)).toBeGreaterThan(deliveryDeltaVP(state, 'player1', 1, 0));
    });
  });
});
