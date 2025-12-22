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
 * 물품 이동의 가치 평가
 */
export function evaluateMoveValue(
  linksCount: number,
  usesOwnTracks: boolean
): number {
  let score = 0;

  // 링크 수 = 수입
  score += linksCount * 3; // 수입이 점수에 3배로 반영되므로

  // 자신의 트랙 사용 시 추가 점수
  if (usesOwnTracks) {
    score += linksCount * 2;
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
