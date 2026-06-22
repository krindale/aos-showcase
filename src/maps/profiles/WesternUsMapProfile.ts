// Western US 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 규칙만 override
//
// 특수 규칙(룰북 Western US):
//  - 마을당 큐브 1 + 시작 현금 $20 (townCubeCounts / startingCash)
//  - 지형 비용: 늪/강 $4, 산 $5 (terrainCost)
//  - 마을 큐브도 일반 배달 (incomeSources에 'townCubes')
//  - 동↔서 배달 +$1 (regionDeliveryBonus)
//  - 트랙은 서부/동부 시작 도시에서만 시작, 대륙횡단 전까지 연속성 강제
//  - 대륙횡단(서부↔동부 시작도시) 최초 연결 보너스 $4/$2
//  - 도시화 특례: Kansas City→동부, San Diego/Portland→서부

import { StandardMapProfile } from './StandardMapProfile';
import { IncomeSource } from '../MapProfile';
import { MapId } from '../MapId';
import { City } from '@/types/game';
import {
  WESTERN_US_MAP,
  WESTERN_US_TOWNS,
  WESTERN_START_CITIES,
  EASTERN_START_CITIES,
  URBANIZE_REGION,
  createWesternUsBoardState,
} from '@/utils/westernUsMap';

export class WesternUsMapProfile extends StandardMapProfile {
  constructor() {
    super({
      id: MapId.WesternUS,
      name: WESTERN_US_MAP.name,
      nameKo: WESTERN_US_MAP.nameKo,
      supportedPlayers: WESTERN_US_MAP.supportedPlayers,
      maxTurns: WESTERN_US_MAP.maxTurns,
      createBoardState: createWesternUsBoardState,
    });
  }

  // 셋업: 도시당 2(기본) + 마을당 1 + 시작 현금 $20
  override get townCubeCounts(): Record<string, number> {
    const m: Record<string, number> = {};
    for (const t of WESTERN_US_TOWNS) m[t.id] = 1;
    return m;
  }
  override get startingCash(): number { return 20; }

  // 지형 비용(늪/강 $4, 산 $5)은 헥스 fixedCost로 주입됨 (westernUsMap.generateWesternUsHexTiles).

  // income 원천: 도시 큐브 + 마을 큐브
  override get incomeSources(): IncomeSource[] { return ['cityCubes', 'townCubes']; }

  // 트랙 시작은 서부/동부 "시작 도시"에서만 (중앙 Denver/SLC·신도시 제외)
  override get startingCitiesOnly(): boolean { return true; }
  override isStartingCity(city: City): boolean {
    return WESTERN_START_CITIES.includes(city.id) || EASTERN_START_CITIES.includes(city.id);
  }

  // 대륙횡단 연결 전까지 연속성 강제 + 연결 보너스 사용
  override get requireContiguousUntilTranscontinental(): boolean { return true; }
  override get transcontinentalBonus(): boolean { return true; }

  // 도시화 특례
  override newCityRegion(townId: string): 'east' | 'west' | undefined {
    return URBANIZE_REGION[townId];
  }

  // 동↔서 배달 +$1
  override regionDeliveryBonus(fromRegion?: 'east' | 'west', toRegion?: 'east' | 'west'): number {
    return fromRegion && toRegion && fromRegion !== toRegion ? 1 : 0;
  }
}
