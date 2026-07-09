// 트랙 건설 실패 사유(사람 UI 토스트용). canBuildTrack(buildSlice)의 검사 순서를 거울처럼
// 따라 실패한 첫 조건의 한 줄 사유를 돌려준다. 여기까지 다 통과하면 남은 원인은 현금 부족.
// ⚠️ canBuildTrack 규칙을 바꾸면 여기 순서/조건도 함께 맞출 것.

import { GameState, HexCoord, GAME_CONSTANTS, TRACK_REPLACE_COSTS, TrackTile } from '@/types/game';
import { getMapProfile } from '@/maps/getMapProfile';
import {
  validateFirstTrackRule,
  validateTrackConnection,
  playerHasTrack,
  canRedirectTrack,
} from '@/utils/trackValidation';
import { hexCoordsEqual } from '@/utils/hexGrid';
import { crossesBlockedEdge } from './boardRules';
import { applyEngineerDiscount, hasEngineerDiscount } from './engineerDiscount';

/** 신규 타일 건설 예상 비용 (buildTrack의 비용 계산 미러 — 지형/고정비용/Engineer 절반). */
function estimateBuildCost(state: GameState, coord: HexCoord, existingTrack?: TrackTile): number {
  if (existingTrack) return TRACK_REPLACE_COSTS.redirect;
  const hex = state.board.hexTiles.find((h) => hexCoordsEqual(h.coord, coord));
  let cost: number;
  if (hex?.fixedCost !== undefined) {
    cost = hex.fixedCost;
  } else {
    const terrain = hex?.terrain ?? 'plain';
    cost = GAME_CONSTANTS.PLAIN_TRACK_COST;
    if (terrain === 'river' || terrain === 'swamp') cost = GAME_CONSTANTS.RIVER_TRACK_COST;
    if (terrain === 'mountain') cost = GAME_CONSTANTS.MOUNTAIN_TRACK_COST;
  }
  const profile = getMapProfile(state.mapId);
  const player = state.players[state.currentPlayer];
  if (hasEngineerDiscount(profile.engineerHalfCost, player?.selectedAction)) {
    cost = applyEngineerDiscount(cost, state.phaseState).charge;
  }
  return cost;
}

/** buildTrack 실패 시 사람에게 보여줄 한 줄 사유. 지을 수 있으면(원인 불명) 폴백 문구. */
export function getBuildBlockReason(
  state: GameState,
  coord: HexCoord,
  edges: [number, number]
): string {
  const { board, phaseState, currentPlayer } = state;

  if (phaseState.builtTracksThisTurn + 1 > phaseState.maxTracksThisTurn) {
    return `이번 턴 건설 제한에 도달했어요 (${phaseState.builtTracksThisTurn}/${phaseState.maxTracksThisTurn})`;
  }
  if (board.cities.some((c) => hexCoordsEqual(c.coord, coord))) {
    return '도시 칸에는 트랙을 놓을 수 없어요';
  }
  if (board.towns.some((t) => hexCoordsEqual(t.coord, coord) && t.newCityColor === null)) {
    return '마을은 타일 대신 가닥(마을 클릭)으로 연결해요';
  }
  const hexTile = board.hexTiles.find((h) => hexCoordsEqual(h.coord, coord));
  if (hexTile?.terrain === 'lake') return '호수에는 건설할 수 없어요';
  if (crossesBlockedEdge(board, coord, edges)) return '산맥 등 막힌 경계는 넘을 수 없어요';

  const existingTrack = board.trackTiles.find((t) => hexCoordsEqual(t.coord, coord));
  if (existingTrack && !canRedirectTrack(coord, board, currentPlayer)) {
    return '이미 트랙이 있어 여기엔 지을 수 없어요';
  }

  const profile = getMapProfile(state.mapId);
  const allowedStartCityIds = profile.startingCitiesOnly
    ? new Set(board.cities.filter((c) => profile.isStartingCity(c)).map((c) => c.id))
    : undefined;
  const requireNetwork =
    profile.requireContiguousUntilTranscontinental && !state.players[currentPlayer]?.transcontinental;
  const hasExistingTrack = playerHasTrack(board, currentPlayer);
  if (!hasExistingTrack) {
    if (!validateFirstTrackRule(coord, edges, board, allowedStartCityIds)) {
      return profile.startingCitiesOnly ? '첫 트랙은 시작 도시에 붙여야 해요' : '첫 트랙은 도시에 붙여야 해요';
    }
  } else if (!validateTrackConnection(coord, edges, board, currentPlayer, requireNetwork)) {
    return requireNetwork
      ? '기존 내 노선에 이어서 지어야 해요 (분리 구간 불가)'
      : '내 트랙이나 도시에 연결되어야 해요';
  }

  // 여기까지 통과 = canBuildTrack OK → 남은 실패 원인은 현금.
  const cost = estimateBuildCost(state, coord, existingTrack);
  const cash = state.players[currentPlayer]?.cash ?? 0;
  if (cash < cost) return `현금이 부족해요 (필요 $${cost}, 보유 $${cash})`;

  return '지금은 여기에 건설할 수 없어요';
}
