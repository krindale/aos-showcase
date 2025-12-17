// 게임 로직 순수 함수 - 테스트 용이성을 위해 분리
// 이 파일의 모든 함수는 순수 함수로, 외부 상태에 의존하지 않습니다.

import {
  PlayerId,
  PlayerState,
  PlayerColor,
  GAME_CONSTANTS,
  PLAYER_ID_ORDER,
} from '@/types/game';

// === 플레이어 관련 순수 함수 ===

/**
 * 다음 플레이어 ID 계산 (순환)
 * @param currentPlayer 현재 플레이어 ID
 * @param activePlayers 활성 플레이어 목록
 * @returns 다음 플레이어 ID
 */
export function getNextPlayerId(
  currentPlayer: PlayerId,
  activePlayers: PlayerId[]
): PlayerId {
  if (activePlayers.length === 0) {
    return currentPlayer;
  }
  const currentIndex = activePlayers.indexOf(currentPlayer);
  if (currentIndex === -1) {
    return activePlayers[0];
  }
  const nextIndex = (currentIndex + 1) % activePlayers.length;
  return activePlayers[nextIndex];
}

/**
 * 이전 플레이어 ID 계산 (역순환)
 * @param currentPlayer 현재 플레이어 ID
 * @param activePlayers 활성 플레이어 목록
 * @returns 이전 플레이어 ID
 */
export function getPreviousPlayerId(
  currentPlayer: PlayerId,
  activePlayers: PlayerId[]
): PlayerId {
  if (activePlayers.length === 0) {
    return currentPlayer;
  }
  const currentIndex = activePlayers.indexOf(currentPlayer);
  if (currentIndex === -1) {
    return activePlayers[0];
  }
  const prevIndex = (currentIndex - 1 + activePlayers.length) % activePlayers.length;
  return activePlayers[prevIndex];
}

/**
 * 동적 playerMoves 객체 생성 (모두 false로 초기화)
 * @param activePlayers 활성 플레이어 목록
 * @returns 플레이어별 이동 여부 맵
 */
export function createPlayerMoves(
  activePlayers: PlayerId[]
): Record<PlayerId, boolean> {
  const moves: Partial<Record<PlayerId, boolean>> = {};
  activePlayers.forEach(p => { moves[p] = false; });
  return moves as Record<PlayerId, boolean>;
}

/**
 * 모든 플레이어가 이동했는지 확인
 * @param playerMoves 플레이어별 이동 여부 맵
 * @param activePlayers 활성 플레이어 목록
 * @returns 모두 이동했으면 true
 */
export function allPlayersMoved(
  playerMoves: Record<PlayerId, boolean>,
  activePlayers: PlayerId[]
): boolean {
  return activePlayers.every(p => playerMoves[p]);
}

/**
 * 모든 플레이어가 행동을 선택했는지 확인
 * @param players 플레이어 상태 맵
 * @param activePlayers 활성 플레이어 목록
 * @returns 모두 선택했으면 true
 */
export function allPlayersSelectedAction(
  players: Record<PlayerId, PlayerState>,
  activePlayers: PlayerId[]
): boolean {
  return activePlayers.every(p => players[p]?.selectedAction !== null);
}

/**
 * 플레이어들의 selectedAction 초기화
 * @param players 플레이어 상태 맵
 * @param activePlayers 활성 플레이어 목록
 * @returns 초기화된 플레이어 상태 맵
 */
export function resetPlayerActions(
  players: Record<PlayerId, PlayerState>,
  activePlayers: PlayerId[]
): Record<PlayerId, PlayerState> {
  const updated: Partial<Record<PlayerId, PlayerState>> = {};
  activePlayers.forEach(pid => {
    if (players[pid]) {
      updated[pid] = { ...players[pid], selectedAction: null };
    }
  });
  return { ...players, ...updated };
}

/**
 * 초기 플레이어 상태 생성
 * @param id 플레이어 ID
 * @param name 플레이어 이름
 * @param color 플레이어 색상
 * @returns 초기 플레이어 상태
 */
export function createInitialPlayerState(
  id: PlayerId,
  name: string,
  color: PlayerColor
): PlayerState {
  return {
    id,
    name,
    color,
    cash: GAME_CONSTANTS.STARTING_CASH,
    income: GAME_CONSTANTS.STARTING_INCOME,
    engineLevel: GAME_CONSTANTS.STARTING_ENGINE,
    issuedShares: GAME_CONSTANTS.STARTING_SHARES,
    selectedAction: null,
    turnOrderPassUsed: false,
    eliminated: false,
  };
}

// === 비용 계산 순수 함수 ===

/**
 * 턴 비용 계산 (주식 + 엔진 레벨)
 * @param issuedShares 발행 주식 수
 * @param engineLevel 엔진 레벨
 * @returns 턴 비용
 */
export function calculateTurnExpense(
  issuedShares: number,
  engineLevel: number
): number {
  return issuedShares + engineLevel;
}

/**
 * 주식 발행 가능 수량 계산
 * @param currentShares 현재 발행 주식 수
 * @param maxShares 최대 발행 가능 주식 수 (기본값: GAME_CONSTANTS.MAX_SHARES)
 * @returns 추가 발행 가능 주식 수
 */
export function calculateAvailableShares(
  currentShares: number,
  maxShares: number = GAME_CONSTANTS.MAX_SHARES
): number {
  return Math.max(0, maxShares - currentShares);
}

/**
 * 주식 발행 후 현금 계산
 * @param currentCash 현재 현금
 * @param sharesToIssue 발행할 주식 수
 * @param shareValue 주식 가치 (기본값: GAME_CONSTANTS.SHARE_VALUE)
 * @returns 발행 후 현금
 */
export function calculateCashAfterIssue(
  currentCash: number,
  sharesToIssue: number,
  shareValue: number = GAME_CONSTANTS.SHARE_VALUE
): number {
  return currentCash + (sharesToIssue * shareValue);
}

/**
 * 수입 감소량 계산
 * @param currentIncome 현재 수입
 * @returns 감소량
 */
export function calculateIncomeReduction(currentIncome: number): number {
  for (const rule of GAME_CONSTANTS.INCOME_REDUCTION) {
    if (currentIncome >= rule.min && currentIncome <= rule.max) {
      return rule.reduction;
    }
  }
  return 0;
}

/**
 * 파산 여부 확인
 * @param cash 현재 현금
 * @param income 현재 수입
 * @param expense 지불할 비용
 * @returns 파산이면 true
 */
export function checkBankruptcy(
  cash: number,
  income: number,
  expense: number
): boolean {
  if (cash >= expense) {
    return false;
  }
  const shortage = expense - cash;
  const newIncome = income - shortage;
  return newIncome < GAME_CONSTANTS.MIN_INCOME;
}

// === 승점 계산 순수 함수 ===

/**
 * 승점 계산
 * @param income 수입 트랙 위치
 * @param completedLinkTiles 완성된 링크의 트랙 타일 수
 * @param issuedShares 발행 주식 수
 * @returns 총 승점
 */
export function calculateVictoryPoints(
  income: number,
  completedLinkTiles: number,
  issuedShares: number
): number {
  const incomePoints = income * 3;
  const trackPoints = completedLinkTiles;
  const sharePenalty = issuedShares * 3;
  return incomePoints + trackPoints - sharePenalty;
}

// === 유효성 검증 순수 함수 ===

/**
 * 유효한 플레이어 ID인지 확인
 * @param playerId 플레이어 ID
 * @returns 유효하면 true
 */
export function isValidPlayerId(playerId: string): playerId is PlayerId {
  return PLAYER_ID_ORDER.includes(playerId as PlayerId);
}

/**
 * 플레이어 수에 따른 총 턴 수 반환
 * @param playerCount 플레이어 수
 * @returns 총 턴 수
 */
export function getTotalTurns(playerCount: number): number {
  const turnsMap: Record<number, number> = {
    2: 6,
    3: 6,
    4: 7,
    5: 7,
    6: 8,
  };
  return turnsMap[playerCount] ?? 6;
}

// === 경매 관련 순수 함수 ===

/**
 * 경매 비용 계산 (포기 순서에 따른 지불 금액)
 * @param bid 입찰 금액
 * @param dropoutIndex 포기 순서 인덱스
 * @param totalDropouts 총 포기자 수
 * @returns 지불할 금액
 */
export function calculateAuctionPayment(
  bid: number,
  dropoutIndex: number,
  totalDropouts: number
): number {
  if (dropoutIndex === 0) {
    // 첫 번째 포기자: $0 지불
    return 0;
  } else if (dropoutIndex === totalDropouts - 1) {
    // 마지막 포기자: 전액 지불
    return bid;
  } else {
    // 중간 포기자: 절반 (올림) 지불
    return Math.ceil(bid / 2);
  }
}
