// Southern England 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 부분만 override
//
// 정본: rules/AOSD Vol IV Rules v9 LowRes.pdf "England" + maps/southern-england-v2.pdf 인쇄 셋업문.
// 변형 4가지뿐인 준표준 맵:
//  ① North West 초기 큐브 3개 (그 외 도시 2개)
//  ② 신규 도시 B(파랑) 게임에서 제거 — London이 유일한 파랑 목적지가 되도록
//  ③ 셋업·물품 성장에서 파란 큐브가 London에 놓이려 하면 주사위 1-4 → North West, 5-6 → North East
//     (London 안의 파랑은 배달 불가능한 데드 큐브이므로 — v2 시트 "DURING SETUP & GROWTH" 인쇄문)
//  ④ 승리 동점: 현금 → 트랙 타일 수 → 주사위 (사이트는 공동 승리 표시 — 규칙 안내로 제공,
//     Western US의 동점 규칙과 같은 취급)

import { StandardMapProfile } from './StandardMapProfile';
import { MapRuleSummary } from '../MapProfile';
import { MapId } from '../MapId';
import { CubeColor } from '@/types/game';
import { SOUTHERN_ENGLAND_MAP, createSouthernEnglandBoardState } from '@/utils/southernEnglandMap';

export class SouthernEnglandMapProfile extends StandardMapProfile {
  constructor() {
    super({
      id: MapId.SouthernEngland,
      name: SOUTHERN_ENGLAND_MAP.name,
      nameKo: SOUTHERN_ENGLAND_MAP.nameKo,
      supportedPlayers: SOUTHERN_ENGLAND_MAP.supportedPlayers,
      maxTurns: SOUTHERN_ENGLAND_MAP.maxTurns,
      turnsByPlayers: SOUTHERN_ENGLAND_MAP.turnsByPlayers,
      createBoardState: createSouthernEnglandBoardState,
    });
  }

  // 시트 셋업: "Place 3 goods on North West, Place 2 goods on each other City"
  override get cityCubeCounts(): Record<string, number> {
    return { northwest: 3 };
  }

  // "Remove City B from the game" — 파랑 신규 도시 제거 (columnMapping에도 B 열 없음)
  override get availableNewCityTiles(): string[] | null {
    return ['A', 'C', 'D', 'E', 'F', 'G', 'H'];
  }

  // v2 시트: "If a blue good is to be placed on London instead roll a die, 1-4 place on NW, 5-6 NE"
  // 셋업(createInitialGameState)과 물품 성장(growGoods)이 이 훅을 공유한다.
  override redirectCubePlacement(cityId: string, color: CubeColor): string {
    if (cityId !== 'london' || color !== 'blue') return cityId;
    return Math.floor(Math.random() * 6) + 1 <= 4 ? 'northwest' : 'northeast';
  }

  // 공식 맵 시트에서 숫자 박스가 검은색인 도시 = 물품 디스플레이 "다크" 열 (라이트는 흰 박스)
  private static readonly BLACK_BOX_IDS = new Set([
    'exeter', 'northwest', 'birmingham', 'nottingham', 'northeast', 'norwich',
  ]);
  override isCityNumberBoxBlack(cityId: string): boolean {
    return SouthernEnglandMapProfile.BLACK_BOX_IDS.has(cityId);
  }

  override get specialRules(): MapRuleSummary[] {
    return [
      { title: '준표준 규칙 맵', detail: 'Age of Steam 기본 룰에 작은 변형만 있는 잉글랜드 남부 맵입니다. North West는 시작 큐브 3개, 그 외 도시는 2개입니다.' },
      { title: 'London만 파랑 수요', detail: '파랑 도시는 London뿐이고 파랑 신규 도시 B는 게임에서 제거됩니다 — 파란 화물은 전부 London으로 실어 날라야 합니다.' },
      { title: 'London의 파랑 대체', detail: '셋업·물품 성장에서 파란 화물이 London에 놓이려 하면 주사위를 굴려 1-4는 North West, 5-6은 North East에 대신 놓입니다.' },
      { title: '동점 규칙', detail: '승점 동점이면 현금 → 트랙 타일 수 → 주사위 순으로 승자를 가립니다 (원본 룰).' },
    ];
  }
}
