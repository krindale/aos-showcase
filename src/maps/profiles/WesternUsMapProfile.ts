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
import { IncomeSource, MapRuleSummary } from '../MapProfile';
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

  // 공식 맵 시트에서 숫자 박스가 검은색인 도시 (동부 도시)
  private static readonly BLACK_BOX_IDS = new Set([
    'duluth', 'minneapolis', 'desmoines', 'memphis', 'vicksburg', 'neworleans',
  ]);
  override isCityNumberBoxBlack(cityId: string): boolean {
    return WesternUsMapProfile.BLACK_BOX_IDS.has(cityId);
  }

  // 지형 비용(늪/강 $4, 산 $5)은 헥스 fixedCost로 주입됨 (westernUsMap.generateWesternUsHexTiles).
  override get buildCostHint(): string { return '평지: $2 / 늪·강: $4 / 산: $5'; }

  // income 원천: 도시 큐브 + 마을 큐브
  override get incomeSources(): IncomeSource[] { return ['cityCubes', 'townCubes']; }

  // 완성 트랙 7 목표 (사용자 지침, Western US 전용) — 완성트랙 7 미만이면 경로 완성을 적극 추구.
  override get targetCompletedTracks(): number { return 7; }

  // 경매 1번 입찰 보너스 (Western US 전용) — 4·5위 +1, 6위(꼴찌) +2. 뒤 순번이 1번을 더 따내
  // 순서를 순환시킨다. 마을 큐브 배달이 "1번 사느라 건설예산 소진" 부작용을 상쇄해 Western만 가능
  // (cityCubes 맵은 이 보너스로 뒤 순번이 붕괴 — Rust Belt VP 11.7→3.5 측정).
  override firstSeatRankBidBonus(rank: number, n: number): number {
    if (rank === n - 1) return 2;   // 6위(꼴찌)
    if (rank >= n - 3) return 1;    // 4·5위
    return 0;                       // 1~3위
  }

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

  override get specialRules(): MapRuleSummary[] {
    return [
      { title: '6인 6턴', detail: '서부 미국 대륙횡단 — 6명, 6턴으로 진행합니다.' },
      { title: '시작 자금 $20', detail: '2주 발행으로 $20을 받고 시작합니다 (표준 $10보다 많음).' },
      { title: '마을 큐브 배달', detail: '마을에도 큐브가 1개씩 있어 도시처럼 출발점이 됩니다 (보충 안 됨).' },
      { title: '마을 도시화 시 화물', detail: '큐브가 남아 있는 마을을 도시화하면 그 큐브는 주머니로 반환됩니다.' },
      { title: '시작 도시 제한', detail: '첫 트랙은 서부(시애틀·샌프란시스코·LA)/동부 시작 도시에 인접해야 합니다. 덴버·솔트레이크는 시작 불가.' },
      { title: '연속 건설 강제', detail: '대륙횡단 달성 전까지 모든 새 트랙은 내 철도망과 이어져야 합니다.' },
      { title: '🌉 대륙횡단 보너스', detail: '서부↔동부 시작 도시를 최초로 연결하면 즉시 수입 보너스(+$4 또는 각 +$2). 이후 연속 건설 규칙 해제.' },
      { title: '동↔서 배달 +$1', detail: '동부 도시→서부 도시(또는 반대) 배달 시 수입 +1 보너스.' },
      {
        title: '도시화 시 지역 편입',
        detail: '도시화하면 캔자스시티는 동부, 샌디에이고·포틀랜드는 서부로 취급(배달 보너스만, 대륙횡단 시작 도시는 아님).',
      },
      { title: '지형 비용', detail: '늪·강 $4, 산 $5로 건설 비용이 높습니다.' },
    ];
  }
}
