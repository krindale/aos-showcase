// Southern US 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 규칙만 override
//
// 특수 규칙(룰북 Southern US):
//  - 모든 마을에 면화(흰 큐브) 1개 (townFixedCube — 주머니에서 뽑지 않음)
//  - 면화는 4대 항구(Charleston/Savannah/Mobile/New Orleans)에서만 배달 종료
//    (board.cottonPorts + cityAcceptsCube), 배달 시 +1 보너스 수입(cubeDeliveryBonus),
//    배달 후 게임에서 제거(deliveredCubeLeavesGame)
//  - 면화 마을이 도시화되면 면화는 신규 도시로 이동 (urbanizationMovesTownCubes)
//  - 도시 초기 큐브: Atlanta 4, 4대 항구 3, 나머지 1 (cityCubeCounts)
//  - Atlanta는 1~4턴 물품 성장마다 주머니에서 큐브 1개 추가 (bonusCityCubeId + MaxTurn)
//  - 4턴(남북전쟁)에는 수입 감소 2배 (incomeReductionMultiplier)

import { StandardMapProfile } from './StandardMapProfile';
import { IncomeSource, MapRuleSummary } from '../MapProfile';
import { MapId } from '../MapId';
import { CubeColor } from '@/types/game';
import {
  SOUTHERN_US_MAP,
  SOUTHERN_US_CITIES,
  SOUTHERN_PORTS,
  createSouthernUsBoardState,
} from '@/utils/southernUsMap';

export class SouthernUsMapProfile extends StandardMapProfile {
  constructor() {
    super({
      id: MapId.SouthernUS,
      name: SOUTHERN_US_MAP.name,
      nameKo: SOUTHERN_US_MAP.nameKo,
      supportedPlayers: SOUTHERN_US_MAP.supportedPlayers,
      maxTurns: SOUTHERN_US_MAP.maxTurns,
      createBoardState: createSouthernUsBoardState,
    });
  }

  // 셋업: Atlanta 4 / 4대 항구 3 / 나머지 도시 1 (룰북 — 기본값 2를 쓰는 도시가 없으므로 전부 명시)
  override get cityCubeCounts(): Record<string, number> {
    const m: Record<string, number> = {};
    for (const c of SOUTHERN_US_CITIES) m[c.id] = 1;
    m['atlanta'] = 4;
    for (const port of SOUTHERN_PORTS) m[port] = 3;
    return m;
  }

  // 셋업: 모든 마을에 면화(흰 큐브) 1개
  override get townFixedCube(): CubeColor { return 'white'; }

  // income 원천: 도시 큐브 + 마을 면화 (마을 큐브도 도시처럼 배달 출발점)
  override get incomeSources(): IncomeSource[] { return ['cityCubes', 'townCubes']; }

  // 면화 배달 +$1 보너스 / 배달 후 게임에서 제거
  override cubeDeliveryBonus(color: CubeColor): number { return color === 'white' ? 1 : 0; }
  override deliveredCubeLeavesGame(color: CubeColor): boolean { return color === 'white'; }

  // 면화 마을 도시화 → 면화는 신규 도시로
  override get urbanizationMovesTownCubes(): boolean { return true; }

  // Atlanta 1~4턴 물품 성장마다 주머니에서 큐브 1개 추가 (남북전쟁 전 호황)
  override get bonusCityCubeId(): string { return 'atlanta'; }
  override get bonusCityCubeMaxTurn(): number { return 4; }

  // 4턴(남북전쟁) 수입 감소 2배
  override incomeReductionMultiplier(turn: number): number { return turn === 4 ? 2 : 1; }

  override get specialRules(): MapRuleSummary[] {
    return [
      { title: '6인 6턴', detail: '미국 남부 면화 지대 — 6명, 6턴으로 진행합니다.' },
      { title: '🏵 면화(흰 큐브)', detail: '모든 마을에 면화가 1개씩 있습니다. 면화는 4대 항구(찰스턴·서배너·모빌·뉴올리언스)에서만 배달이 끝나며, 배달 시 수입 +1 보너스를 받고 게임에서 제거됩니다.' },
      { title: '면화 마을 도시화', detail: '면화가 있는 마을을 도시화하면 면화는 신규 도시 위로 옮겨집니다.' },
      { title: '도시 초기 물품', detail: 'Atlanta 4개, 4대 항구 3개, 나머지 도시 1개로 시작합니다.' },
      { title: 'Atlanta 호황', detail: '1~4턴 물품 성장마다 Atlanta에 주머니에서 물품 1개가 추가됩니다.' },
      { title: '⚔️ 남북전쟁', detail: '4턴에는 수입 감소가 2배로 적용됩니다.' },
    ];
  }
}
