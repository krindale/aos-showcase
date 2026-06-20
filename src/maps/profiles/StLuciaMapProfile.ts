// St. Lucia 맵 프로파일 — 표준 맵에서 변형된 부분만 override
//
// 변형: 헥스 위 큐브 셋업(도시 큐브 없음), 경매 대신 교대 선공권($5), 물품 성장 생략,
//       production/turnOrder 행동 불가, 트랙 큐브도 income 원천.
// 표준이 아닌 부분만 메서드 override — 나머지(배달 ΔVP 평가 등)는 StandardMapProfile 상속.

import { SpecialAction, GameState, PlayerId } from '@/types/game';
import { DeliveryRoute } from '@/ai/strategy/types';
import { getHexCubeMapRoute } from '@/ai/strategy/selector';
import { setCurrentRoute } from '@/ai/strategy/state';
import { StandardMapProfile } from './StandardMapProfile';
import { IncomeSource } from '../MapProfile';
import { MapId } from '../MapId';
import { ST_LUCIA_MAP, createStLuciaBoardState } from '@/utils/stLuciaMap';

export class StLuciaMapProfile extends StandardMapProfile {
  constructor() {
    super({
      id: MapId.StLucia,
      name: ST_LUCIA_MAP.name,
      nameKo: ST_LUCIA_MAP.nameKo,
      supportedPlayers: ST_LUCIA_MAP.supportedPlayers,
      maxTurns: ST_LUCIA_MAP.maxTurns,
      createBoardState: createStLuciaBoardState,
    });
  }

  // ── 규칙 변형 ──
  get skipGoodsGrowth(): boolean { return true; }
  get alternateTurnOrder(): boolean { return true; }
  get firstSeatCost(): number { return 5; }
  get disabledActions(): SpecialAction[] { return ['production', 'turnOrder']; }
  get hexCubeSetup(): boolean { return true; }
  get forceFirstTurnUrbanization(): boolean { return true; }

  // ── income 원천 변형: 트랙 위 큐브도 배달 가능 ──
  get incomeSources(): IncomeSource[] { return ['cityCubes', 'trackCubes']; }

  // ── 경로 선택 변형: 헥스 큐브를 트랙 위로 수집하며 도시/마을을 잇는 경로 ──
  // (표준 ΔVP 파이프라인은 도시 큐브 전제 — 헥스큐브 맵은 수집→배달 선순환을 별도로 평가)
  override selectTargetRoute(state: GameState, playerId: PlayerId): DeliveryRoute | null {
    const route = getHexCubeMapRoute(state, playerId);
    if (route) setCurrentRoute(playerId, route);
    return route;
  }

  override selectTopRoutes(state: GameState, playerId: PlayerId): DeliveryRoute[] {
    const route = getHexCubeMapRoute(state, playerId);
    return route ? [route] : [];
  }
}
