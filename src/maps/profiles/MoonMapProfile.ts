// 달(The Moon) 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 규칙만 override
//
// 특수 규칙(원본 룰 — rules/AosExpMoon.md):
//  - 3~4인 8턴
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

  /** 셋업: 일반 도시 2(기본), Landing hex(Moon Base)는 플레이어 인원당 2개 (공식 룰) */
  override get perPlayerCityCubes(): Record<string, number> {
    return { moonBase: 2 };
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
  /** 저중력 — 달 전용 8번째 행동 (공식 룰: "new action". Production은 표준 기능 유지) */
  override get extraActions(): SpecialAction[] { return ['lowGravitation']; }
  /** 물품 성장: 주사위 → 도시 직접 (디스플레이 미사용) */
  override get cityDiceGrowth(): boolean { return true; }
  override get growthDicePerPlayer(): number { return 2; }
  override get cityGrowthDice(): Record<string, number[]> { return MOON_CITY_DICE; }
  /** 공식 룰: "검은 신규 도시 타일 제거" — 이 구현의 타일 색(E~H=검정) 기준 A·B·C·D(빨/파/보/노) 유지.
   *  밤쪽 도시가 이미 검은 도시 역할을 하므로 검은 신도시는 게임에서 제외된다. */
  override get availableNewCityTiles(): string[] | null { return ['A', 'B', 'C', 'D']; }
  /** 공식 룰: 마을 $2 + 트랙 구간당 $1 — 스퍼 모델 근사로 가닥당 $2 (표준 $1) */
  override get townSpurCost(): number { return 2; }

  override actionDescription(action: SpecialAction): string | undefined {
    if (action === 'engineer') {
      return '이번 턴 트랙 타일을 2개 대신 3개까지 건설할 수 있습니다 (달 맵은 기본 2개).';
    }
    if (action === 'lowGravitation') {
      return '물품 이동 단계에서 다른 플레이어의 링크 1개를 내 링크처럼 사용해 그 수입을 가져옵니다. 수송마다 1회 — 경로에서 수입이 가장 큰 상대의 링크에 자동 적용됩니다.';
    }
    return undefined;
  }

  override get buildCostHint(): string {
    return '크레이터: $3 / 산: $4';
  }

  override get specialRules(): MapRuleSummary[] {
    return [
      { title: '3~4인 8턴', detail: '달 맵 — 3~4명, 8턴. 셋업: 일반 도시 2개씩 + Moon Base(랜딩 헥스)에 인원수×2개의 화물.' },
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
        detail: '1턴은 서쪽(왼쪽)이 밤으로 시작하고, 물품 성장이 끝날 때마다 밤쪽이 반대로 바뀝니다. 밤쪽 도시는 전부 검은 도시로 취급되어 검은 화물만 배달할 수 있고, 다른 색 화물은 통과도 할 수 없습니다.',
      },
      {
        title: '신규 행동: 저중력 (Low Gravitation)',
        detail: '기본 7종에 더해 8번째 행동. 물품 이동 단계에서 다른 플레이어의 링크 1개를 내 링크처럼 사용해 그 수입을 가져옵니다 (수송 라운드마다 1회). Production(생산)은 기본 게임 그대로 유지됩니다.',
      },
      {
        title: '물품 성장',
        detail: '주사위를 인원수×2개 굴려, 낮쪽에 있으면서 Moon Base와 완성 링크로 연결된 도시(인쇄 번호 1/2·3/4·5/6 일치)만 물품 디스플레이의 자기 열에서 화물을 받습니다. 조건 미달이면 디스플레이에 남습니다. 신규 도시 타일은 A·B·C·D만 사용합니다(검은 신도시 제거).',
      },
    ];
  }
}
