/**
 * 봇 경매 성격 무작위 배정 (setup.ts) 단위 테스트
 *
 * 검증 항목:
 * 1. weightedPersonalityOrder — 항상 5종 전체의 순열(중복/누락 없음)
 * 2. 가중치 편향 — 공격 성향(denial·aggressive)이 보수형보다 앞 순서에 자주 온다
 * 3. createInitialGameState 배정 — 옵션 미지정 = 전원 undefined(rng 소비 0 = 항등),
 *    randomizeBotPersonalities = 봇 수 ≤ 5 전원 상이 / 명시 config 우선 / 사람 좌석 미배정
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialGameState,
  weightedPersonalityOrder,
  AUCTION_PERSONALITY_WEIGHTS,
} from '../setup';
import { AUCTION_PERSONALITY_IDS, AuctionPersonalityId, PlayerId } from '@/types/game';

describe('weightedPersonalityOrder — 가중치 비복원 셔플', () => {
  it('항상 5종 전체의 순열을 반환한다 (중복/누락 없음)', () => {
    for (let i = 0; i < 50; i++) {
      const order = weightedPersonalityOrder();
      expect(order).toHaveLength(AUCTION_PERSONALITY_IDS.length);
      expect(new Set(order).size).toBe(AUCTION_PERSONALITY_IDS.length);
    }
  });

  it('공격 성향(denial·aggressive)이 보수형보다 첫 자리에 훨씬 자주 온다 (가중치 편향)', () => {
    // 가중치 denial 3 · aggressive 3 · conservative 1 → 첫 자리 기대 비율 3:3:1.
    // 1000회 반복이면 우연 역전 확률은 사실상 0 — 느슨한 1.5배 기준으로 플레이크 방지.
    const firstCount: Record<AuctionPersonalityId, number> = {
      standard: 0, denial: 0, wuType: 0, aggressive: 0, conservative: 0,
    };
    for (let i = 0; i < 1000; i++) firstCount[weightedPersonalityOrder()[0]]++;
    expect(firstCount.denial).toBeGreaterThan(firstCount.conservative * 1.5);
    expect(firstCount.aggressive).toBeGreaterThan(firstCount.conservative * 1.5);
  });

  it('가중치 테이블은 5종 전체를 커버한다', () => {
    for (const id of AUCTION_PERSONALITY_IDS) {
      expect(AUCTION_PERSONALITY_WEIGHTS[id]).toBeGreaterThan(0);
    }
  });
});

describe('createInitialGameState — 봇 성격 배정', () => {
  const names = (n: number) => Array.from({ length: n }, (_, i) => `AI-${i + 1}`);
  const aiConfigs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ playerIndex: i, name: `AI-${i + 1}` }));
  const personalitiesOf = (state: ReturnType<typeof createInitialGameState>) =>
    state.activePlayers.map(pid => state.players[pid as PlayerId]?.auctionPersonality);

  it('옵션 미지정이면 전원 undefined (시뮬 경로 = 기존 산식 항등)', () => {
    const state = createInitialGameState('rust-belt', names(4), aiConfigs(4));
    expect(personalitiesOf(state)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('randomizeBotPersonalities: 봇 5명이면 전원 서로 다른 성격', () => {
    const state = createInitialGameState('rust-belt', names(5), aiConfigs(5), {
      randomizeBotPersonalities: true,
    });
    const assigned = personalitiesOf(state);
    expect(assigned.every(Boolean)).toBe(true);
    expect(new Set(assigned).size).toBe(5);
  });

  it('randomizeBotPersonalities: 봇 6명이면 5종 전체 + 순환 중복 1', () => {
    const state = createInitialGameState('southern-us', names(6), aiConfigs(6), {
      randomizeBotPersonalities: true,
    });
    const assigned = personalitiesOf(state);
    expect(assigned.every(Boolean)).toBe(true);
    expect(new Set(assigned).size).toBe(5); // 6명 중 정확히 한 쌍만 중복
  });

  it('명시 config 배정이 무작위보다 우선한다', () => {
    const configs = aiConfigs(4);
    (configs[2] as { auctionPersonality?: AuctionPersonalityId }).auctionPersonality = 'conservative';
    const state = createInitialGameState('rust-belt', names(4), configs, {
      randomizeBotPersonalities: true,
    });
    expect(state.players[state.activePlayers[2] as PlayerId]?.auctionPersonality).toBe('conservative');
  });

  it('사람 좌석(비 AI)에는 성격을 배정하지 않는다', () => {
    // 좌석 0·2만 봇 — 사람 좌석 1·3은 undefined여야 한다
    const configs = [
      { playerIndex: 0, name: 'AI-1' },
      { playerIndex: 2, name: 'AI-3' },
    ];
    const state = createInitialGameState('rust-belt', ['AI-1', '사람1', 'AI-3', '사람2'], configs, {
      randomizeBotPersonalities: true,
    });
    const p = personalitiesOf(state);
    expect(p[0]).toBeDefined();
    expect(p[1]).toBeUndefined();
    expect(p[2]).toBeDefined();
    expect(p[3]).toBeUndefined();
    expect(p[0]).not.toBe(p[2]); // 봇 2명 = 서로 다른 성격
  });
});
