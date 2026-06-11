import { GameState, PlayerId, HexCoord, BoardState } from '@/types/game';
import { hexCoordsEqual, hexDistance } from '@/utils/hexGrid';

/**
 * 플레이어의 현재 상태를 점수로 평가
 */
export function evaluatePlayerState(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) return -1000;

  let score = 0;

  // 1. 수입 트랙 위치 (가장 중요)
  // 수입 × 3점이 최종 점수이므로, 수입이 높을수록 좋음
  score += player.income * 3;

  // 2. 현금 (유동성)
  // 현금이 많으면 유연성이 높음
  score += Math.min(player.cash, 20) * 0.5; // 최대 10점까지

  // 3. 엔진 레벨 (물품 이동 능력)
  // 엔진 레벨이 높을수록 더 많은 링크를 이동 가능
  score += player.engineLevel * 2;

  // 4. 발행 주식 (패널티)
  // 주식이 많을수록 나중에 -3점/주식
  score -= player.issuedShares * 2;

  // 5. 완성된 링크의 트랙 수 (점수화)
  const trackCount = countPlayerTracks(state.board, playerId);
  score += trackCount;

  return score;
}

/**
 * 플레이어가 소유한 트랙 수 계산
 */
export function countPlayerTracks(board: BoardState, playerId: PlayerId): number {
  return board.trackTiles.filter(t => t.owner === playerId).length;
}

/**
 * 트랙 위치의 전략적 가치 평가
 */
export function evaluateTrackPosition(
  state: GameState,
  coord: HexCoord,
  playerId: PlayerId
): number {
  let score = 0;
  const { board } = state;

  // 1. 도시와의 인접성 (도시에 가까울수록 좋음)
  const adjacentToCities = board.cities.filter(city => {
    return hexDistance(city.coord, coord) <= 2;
  });
  score += adjacentToCities.length * 3;

  // 2. 물품이 있는 도시와의 연결 가능성
  const citiesWithGoods = board.cities.filter(c => c.cubes.length > 0);
  for (const city of citiesWithGoods) {
    const dist = hexDistance(city.coord, coord);
    if (dist <= 3) {
      score += 2;
    }
  }

  // 3. 기존 트랙과의 연결성
  const ownTracks = board.trackTiles.filter(t => t.owner === playerId);
  for (const track of ownTracks) {
    const dist = hexDistance(track.coord, coord);
    if (dist === 1) {
      score += 2; // 직접 연결 가능
    }
  }

  // 4. 지형 비용 고려
  const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
  if (hexTile) {
    if (hexTile.terrain === 'river') score -= 1;
    if (hexTile.terrain === 'mountain') score -= 2;
    if (hexTile.terrain === 'lake') score -= 100; // 호수는 건설 불가
  }

  return score;
}

/**
 * 예상 비용 계산 (턴당)
 */
export function calculateExpectedExpenses(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) return 0;

  return player.issuedShares + player.engineLevel;
}

/**
 * 추가 주식 발행 후 예상 비용 계산
 *
 * 주식 발행 시 미래 턴의 비용 부담을 미리 산정하여 파산 위험을 방지
 */
export function calculateExpectedExpensesAfterIssue(
  state: GameState,
  playerId: PlayerId,
  additionalShares: number
): number {
  const player = state.players[playerId];
  if (!player) return 0;

  const futureShares = player.issuedShares + additionalShares;
  const futureEngine = player.engineLevel; // 엔진 레벨은 변하지 않음 (보수적 추정)
  return futureShares + futureEngine;
}

/**
 * 현금 부족 여부 판단
 */
export function willBeShortOnCash(
  state: GameState,
  playerId: PlayerId,
  additionalSpending: number = 0
): boolean {
  const player = state.players[playerId];
  if (!player) return true;

  const expectedExpenses = calculateExpectedExpenses(state, playerId);
  const expectedIncome = Math.max(0, player.income);

  return player.cash - additionalSpending + expectedIncome < expectedExpenses;
}

/**
 * Pay Expenses에서 현금 부족으로 수입 감소를 방지하기 위한 최소 현금 예비금 계산
 *
 * 흐름: Build Track → Move Goods → Collect Income (cash += income) → Pay Expenses (cash -= expenses)
 * 따라서 수입감소 방지: cash_after_build + income >= expenses
 * 예비금 = max(0, expenses - income)
 *
 * @param state 게임 상태
 * @param playerId AI 플레이어 ID
 * @returns 최소 현금 예비금 (0 이상)
 */
export function calculateMinCashReserve(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) return 0;

  const expenses = player.issuedShares + player.engineLevel;
  const expectedIncome = Math.max(0, player.income);

  // 수입 감소(-3 VP/건)와 주식 발행(-3 VP/주 + 영구 비용) 비교:
  // $1 부족 허용이 주식 1주 발행보다 낫다 (같은 -3 VP이지만 주식은 추가 비용 유발)
  // 단, income=0일 때 $1 부족은 income → -1 = 파산이므로 허용 불가
  if (expectedIncome >= expenses) return 0;

  const shortfall = expenses - expectedIncome;
  const allowableShortfall = expectedIncome > 0 ? 1 : 0;
  return Math.max(0, shortfall - allowableShortfall);
}

/**
 * 주식 발행의 VP 비용 계산
 * 주식 1주 = -3 VP (영구)
 */
export function calculateShareVPCost(additionalShares: number): number {
  return additionalShares * 3;
}
