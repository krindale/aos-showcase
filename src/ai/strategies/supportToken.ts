/**
 * 지지 토큰(Tokens of Support) 반납 결정 — Southern China 전용 (supportTokensRule)
 *
 * 토큰은 **보유만 해도 종료 시 3 VP**라, 반납은 "3 VP를 팔아 그 턴의 능력을 사는" 거래다.
 * 따라서 기준은 언제나 **얻는 ΔVP > 3 + 여유분**.
 *
 * 현재 구현하는 용도는 'loco'(이번 턴 두 라운드의 **실효** 엔진 +1)뿐이다. 이 맵은
 * Locomotive 행동이 없어 엔진을 올리려면 수송 기회를 통째로 포기해야 하는데, 토큰은
 * **영구 레벨을 올리지 않아 payExpenses가 늘지 않는다** — 유지비 없는 1회용 엔진.
 *
 * ⚠️ 'build'(건설 슬롯 +1)는 100시드에서 VP −2.16으로 명백히 손해라 구현하지 않는다
 * (docs/ai-auction-baseline-100seed.md 2026-07-27c).
 */
import { GameState, PlayerId } from '@/types/game';
import { getMapProfile } from '@/maps/getMapProfile';
import { effectiveEngineLevel } from '@/utils/gameLogic';
import { getMapAIConfig } from '@/ai/strategy/mapConfig';
import { engineUpgradeDeliveryGain } from './moveGoods';

/** 미사용 토큰 1개의 확정 가치 (playerBonusVP와 동일) */
const TOKEN_VP = 3;

/**
 * 반납이 확정 3 VP를 이기려면 요구하는 여유분.
 * 문턱을 낮추면 반납이 잦아지고 VP가 단조 하락한다(100시드: 여유 1 → 반납 4.2회·VP 16.75,
 * 여유 6 → 반납 1.0회·VP 17.21). "정말 큰 이득일 때만" 쪽으로 잡는다.
 */
const MARGIN_VP = 6;

/**
 * 실효 엔진 +1에 토큰을 쓸 것인가.
 *
 * 영구 엔진업과 달리 비용 지불에 안 들어가므로 생존 게이트가 불필요하다 — 순수하게
 * "이번 턴 열리는 배달의 **증분** ΔVP가 토큰 가치를 넘는가"만 본다.
 */
export function shouldSpendSupportForLoco(state: GameState, playerId: PlayerId): boolean {
  if (!getMapProfile(state.mapId).supportTokensRule) return false;
  const player = state.players[playerId];
  if (!player || player.eliminated || (player.supportTokens ?? 0) <= 0) return false;
  if (player.supportLocoActive) return false;

  const current = effectiveEngineLevel(state.players, playerId);
  if (current >= getMapAIConfig(state).engineMax) return false;

  // ⚠️ **증분**(엔진 없이 가능한 차선 배달을 뺀 값)이어야 한다 — 해금 배달의 총 ΔVP를 쓰면
  // "엔진 없이도 비슷한 값의 짧은 배달이 가능한" 상황까지 반납으로 오판한다(실측 VP −4.31).
  return engineUpgradeDeliveryGain(state, playerId, current) > TOKEN_VP + MARGIN_VP;
}
