/**
 * AIPlayerManager 싱글톤 - 모든 AI 플레이어 인스턴스 관리
 *
 * 책임:
 * - AIPlayer 인스턴스 생성 및 관리
 * - 게임 상태에 따른 AI 결정 중개
 * - 게임 리셋 시 모든 인스턴스 초기화
 */

import { GameState, PlayerId } from '@/types/game';
import { AIPlayer, AIDecision } from './AIPlayer';

export class AIPlayerManager {
  private static instance: AIPlayerManager | null = null;
  private players: Map<PlayerId, AIPlayer> = new Map();

  private constructor() {
    console.log('[AIPlayerManager] 인스턴스 생성');
  }

  /**
   * 싱글톤 인스턴스 가져오기
   */
  static getInstance(): AIPlayerManager {
    if (!AIPlayerManager.instance) {
      AIPlayerManager.instance = new AIPlayerManager();
    }
    return AIPlayerManager.instance;
  }

  /**
   * AI 플레이어 인스턴스 가져오기 또는 생성
   */
  getOrCreate(playerId: PlayerId, name: string): AIPlayer {
    let player = this.players.get(playerId);

    if (!player) {
      player = new AIPlayer(playerId, name);
      this.players.set(playerId, player);
      console.log(`[AIPlayerManager] 새 AI 플레이어 등록: ${name} (${playerId})`);
    }

    return player;
  }

  /**
   * AI 플레이어 인스턴스 가져오기 (없으면 undefined)
   */
  get(playerId: PlayerId): AIPlayer | undefined {
    return this.players.get(playerId);
  }

  /**
   * AI 플레이어가 등록되어 있는지 확인
   */
  has(playerId: PlayerId): boolean {
    return this.players.has(playerId);
  }

  /**
   * 게임 상태 기반 AI 결정 반환
   *
   * 편의 메서드: 인스턴스를 직접 가져오지 않고 결정을 요청할 수 있음
   */
  getDecision(state: GameState, playerId: PlayerId): AIDecision {
    const player = this.players.get(playerId);

    if (!player) {
      console.error(`[AIPlayerManager] AI 플레이어 없음: ${playerId}`);
      return { type: 'skip' };
    }

    return player.decide(state);
  }

  /**
   * 모든 AI 플레이어 상태 리셋 (게임 재시작 시)
   */
  resetAll(): void {
    console.log(`[AIPlayerManager] 모든 AI 플레이어 리셋 (${this.players.size}명)`);

    Array.from(this.players.values()).forEach(player => {
      player.reset();
    });
  }

  /**
   * 모든 AI 플레이어 인스턴스 제거 (새 게임 초기화 시)
   */
  clear(): void {
    console.log(`[AIPlayerManager] 모든 AI 플레이어 제거 (${this.players.size}명)`);
    this.players.clear();
  }

  /**
   * 등록된 AI 플레이어 수
   */
  get count(): number {
    return this.players.size;
  }

  /**
   * 등록된 모든 AI 플레이어 ID 목록
   */
  getPlayerIds(): PlayerId[] {
    return Array.from(this.players.keys());
  }

  /**
   * 디버깅용 상태 로그
   */
  logStatus(): void {
    console.log('[AIPlayerManager] 상태:');
    console.log(`  - 등록된 AI: ${this.players.size}명`);

    Array.from(this.players.values()).forEach(player => {
      player.logStrategyState();
    });
  }
}

// 싱글톤 인스턴스 export
export const aiPlayerManager = AIPlayerManager.getInstance();
