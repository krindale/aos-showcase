// 달(The Moon) 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 규칙만 override
//
// 특수 규칙(원본 룰 — rules/AosExpMoon.md):
//  - 4인 전용 8턴
//  - 건설: 턴당 2개(Engineer 3개 — 표준 3/4에서 −1), 크레이터 $3 / 산 $4
//  - Moon Base 네트워크: 모든 트랙은 Moon Base에서 시작하거나 그 네트워크에 이어져야 함
//    (masterNetwork + masterNetworkSeedCityId='moonBase')
//  - 랩 어라운드: 외곽 같은 번호 변끼리 연결 (보드 데이터 wrapEdges — moonMap.ts)
//  - Moon Base: 색·수요 없는 도시 (City.noDemand) — 출발/통과 전용
//  - 밤/낮: 매 턴 절반이 밤 — 밤쪽 도시는 검은 도시(검은 큐브만 배달, 타색은 통과도 불가).
//    물품 성장 후 교대 (nightDayCycle, GameState.nightSide)
//  - Production → Low Gravitation: 이동 때 상대 링크 1개를 내 링크처럼(수입 포함) 사용
//  - 물품 성장: 주사위 인원×2 — 낮쪽 + Moon Base 연결 도시만 주머니에서 직접 성장
//    (cityDiceGrowth, 도시 인쇄 번호 1/2·3/4·5/6)
//  - 신규 도시 C, D, G, H 제거 (columnMapping에 A, B, E, F만 등록 — moonMap.ts)

import { StandardMapProfile } from './StandardMapProfile';
import { MapRuleSummary } from '../MapProfile';
import { MapId } from '../MapId';
import { SpecialAction } from '@/types/game';
import {
  MOON_MAP,
  MOON_CITY_CUBE_COUNTS,
  MOON_CITY_DICE,
  createMoonBoardState,
} from '@/utils/moonMap';

export class MoonMapProfile extends StandardMapProfile {
  constructor() {
    super({
      id: MapId.Moon,
      name: MOON_MAP.name,
      nameKo: MOON_MAP.nameKo,
      supportedPlayers: MOON_MAP.supportedPlayers,
      maxTurns: MOON_MAP.maxTurns,
      createBoardState: createMoonBoardState,
    });
  }

  /** 셋업: 일반 도시 2(기본), Moon Base는 플레이어당 2 × 4인 = 8 */
  override get cityCubeCounts(): Record<string, number> {
    return MOON_CITY_CUBE_COUNTS;
  }

  /** 원본 시트: 동쪽 도시(Nectaris·Tranquillitatis·Serenitatis)만 검은 숫자 박스 */
  override isCityNumberBoxBlack(cityId: string): boolean {
    return ['nectaris', 'tranquillitatis', 'serenitatis'].includes(cityId);
  }

  // ── 달 특수룰 플래그 ──
  /** 턴당 건설 2개 (Engineer 3개) — 표준 3/4에서 −1 */
  override get buildsPerTurn(): number { return 2; }
  /** 모든 트랙이 Moon Base 네트워크에 이어져야 함 */
  override get masterNetwork(): boolean { return true; }
  override get masterNetworkSeedCityId(): string | null { return 'moonBase'; }
  /** 밤/낮 교대 */
  override get nightDayCycle(): boolean { return true; }
  /** Production → Low Gravitation */
  override get productionAsLowGravitation(): boolean { return true; }
  /** 물품 성장: 주사위 → 도시 직접 (디스플레이 미사용) */
  override get cityDiceGrowth(): boolean { return true; }
  override get growthDicePerPlayer(): number { return 2; }
  override get cityGrowthDice(): Record<string, number[]> { return MOON_CITY_DICE; }
  /** 신규 도시 C·D·G·H 제거 (룰북 셋업) */
  override get availableNewCityTiles(): string[] | null { return ['A', 'B', 'E', 'F']; }

  override actionDescription(action: SpecialAction): string | undefined {
    if (action === 'production') {
      return 'Low Gravitation — 물품 이동 단계에서 다른 플레이어의 링크 1개를 내 링크처럼 사용해 수입을 가져옵니다. 두 번의 수송에 각각 다른 링크를 지정할 수 있습니다.';
    }
    if (action === 'engineer') {
      return '이번 턴 트랙 타일을 2개 대신 3개까지 건설할 수 있습니다 (달 맵은 기본 2개).';
    }
    return undefined;
  }

  override get buildCostHint(): string {
    return '크레이터: $3 / 산: $4';
  }

  override get specialRules(): MapRuleSummary[] {
    return [
      { title: '4인 8턴', detail: '달 맵 — 4명 전용, 8턴으로 진행합니다.' },
      {
        title: '건설 2개 제한',
        detail: '한 턴에 트랙 타일을 최대 2개만 건설할 수 있습니다 (Engineer 선택 시 3개). 크레이터 $3 / 산 $4.',
      },
      {
        title: 'Moon Base 네트워크',
        detail: '모든 트랙은 중앙 Moon Base에서 시작하거나 Moon Base와 이어진 선로망에 연결되어야 합니다. Moon Base는 색·수요가 없는 도시로 출발/통과만 가능합니다.',
      },
      {
        title: '랩 어라운드',
        detail: '달은 둥글기 때문에 맵 가장자리로 나간 선로는 반대편의 같은 번호 변으로 이어집니다.',
      },
      {
        title: '밤과 낮',
        detail: '매 턴 보드 절반이 밤이 됩니다. 밤쪽 도시는 전부 검은 도시로 취급되어 검은 화물만 배달할 수 있고, 다른 색 화물은 통과도 할 수 없습니다. 물품 성장 후 밤쪽이 반대로 바뀝니다.',
      },
      {
        title: 'Production → Low Gravitation',
        detail: '물품 이동 단계에서 다른 플레이어의 링크 1개를 내 링크처럼 사용해 그 수입을 가져옵니다. 두 번의 수송에 서로 다른 링크를 지정할 수 있습니다.',
      },
      {
        title: '물품 성장',
        detail: '주사위를 인원수×2개 굴려, 낮쪽에 있으면서 Moon Base와 선로로 연결된 도시(인쇄 번호 일치)만 주머니에서 화물을 받습니다. 신규 도시 타일은 A·B·E·F만 사용합니다.',
      },
    ];
  }
}
