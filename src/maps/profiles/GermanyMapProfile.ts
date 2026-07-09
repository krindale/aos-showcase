// Germany 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 규칙만 override
//
// 특수 규칙(룰북 Germany):
//  - Engineer 절반 비용 (engineerHalfCost)
//  - 미완성 링크 건설 금지 (requireCompleteLinks)
//  - Berlin 매 턴 무작위 큐브 1개 (bonusCityCubeId)
//  - 외국 터미널/헥스 고정비용/직결 링크는 보드 데이터(City.isTerminal / HexTile.fixedCost)로 표현
//    되므로 프로파일 getter가 아니라 germanyMap.ts + 엔진 훅에서 처리한다.

import { StandardMapProfile } from './StandardMapProfile';
import { MapRuleSummary } from '../MapProfile';
import { MapId } from '../MapId';
import { SpecialAction } from '@/types/game';
import { GERMANY_MAP, createGermanyBoardState } from '@/utils/germanyMap';

export class GermanyMapProfile extends StandardMapProfile {
  constructor() {
    super({
      id: MapId.Germany,
      name: GERMANY_MAP.name,
      nameKo: GERMANY_MAP.nameKo,
      supportedPlayers: GERMANY_MAP.supportedPlayers,
      maxTurns: GERMANY_MAP.maxTurns,
      createBoardState: createGermanyBoardState,
    });
  }

  // 룰북 셋업: "Place 4 goods on Wien, 3 on Königsberg, 2 on each other City"
  // Berlin도 "each other City"이므로 시작 큐브 2개(기본값) + 매 턴 물품 성장 보너스 1개(bonusCityCubeId).
  // (터미널은 셋업에서 무작위 큐브 1개 — gameStore의 isTerminal 분기가 처리)
  override get cityCubeCounts(): Record<string, number> {
    return { wien: 4, koenigsberg: 3 };
  }

  override get engineerHalfCost(): boolean { return true; }
  override get requireCompleteLinks(): boolean { return true; }
  override get bonusCityCubeId(): string | null { return 'berlin'; }
  // Berlin은 원본 맵 시트에서 회색 헥스 (보너스 규칙과 별개의 시각 표현)
  override get grayRenderCityId(): string | null { return 'berlin'; }
  // 기본 검은 박스, 단 공식 시트에서 흰 박스인 도시는 예외
  private static readonly WHITE_BOX_IDS = new Set([
    'oldenburg', 'duesseldorf', 'breslau', 'stuttgart', 'zuerich',
  ]);
  override isCityNumberBoxBlack(cityId: string): boolean {
    return !GermanyMapProfile.WHITE_BOX_IDS.has(cityId);
  }

  override actionDescription(action: SpecialAction): string | undefined {
    return action === 'engineer'
      ? '트랙을 4개가 아닌 표준과 같은 3개까지 건설합니다. 대신 이번 턴 처음 짓는 평지 아닌 타일 1개(강·산·고정비용 헥스)의 비용이 절반(올림)으로 자동 할인됩니다.'
      : undefined;
  }

  override get specialRules(): MapRuleSummary[] {
    return [
      { title: '4인 8턴', detail: '독일 맵 — 4명, 8턴으로 진행합니다.' },
      { title: '외국 터미널 (녹색)', detail: '국경의 녹색 도시는 한 종류 화물만 받습니다. 생산하지 않고 통과도 불가.' },
      { title: '헥스 고정 비용', detail: '사각형 숫자(€6~€12)가 그 헥스의 트랙 건설 비용입니다 (지형 기본비용 대신).' },
      {
        title: 'Engineer 효과 변경',
        detail: 'Engineer를 골라도 트랙은 4개가 아니라 표준과 같은 3개까지만 건설합니다. 대신 이번 턴 처음 짓는 평지 아닌 타일 1개(강·산·고정비용 헥스)가 절반 비용(올림)으로 자동 할인됩니다 — 평지($2)에는 적용되지 않습니다.',
      },
      { title: '완성 링크만 건설', detail: '미완성 트랙 구간은 둘 수 없습니다 — 모든 건설은 링크를 완성해야 합니다.' },
      { title: 'Berlin 보너스', detail: '매 턴 Berlin에 주머니에서 무작위 큐브 1개가 추가됩니다.' },
      { title: '도시 직결 링크', detail: '맞붙은 두 도시(예: Essen↔Düsseldorf)는 $2 직결 링크로 이을 수 있습니다.' },
    ];
  }
}
