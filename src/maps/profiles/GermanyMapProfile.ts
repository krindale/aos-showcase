// Germany 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 규칙만 override
//
// 특수 규칙(룰북 Germany):
//  - Engineer 절반 비용 (engineerHalfCost)
//  - 미완성 링크 건설 금지 (requireCompleteLinks)
//  - Berlin 매 턴 무작위 큐브 1개 (bonusCityCubeId)
//  - 외국 터미널/헥스 고정비용/직결 링크는 보드 데이터(City.isTerminal / HexTile.fixedCost)로 표현
//    되므로 프로파일 getter가 아니라 germanyMap.ts + 엔진 훅에서 처리한다.

import { StandardMapProfile } from './StandardMapProfile';
import { MapId } from '../MapId';
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
  // (터미널은 셋업에서 무작위 큐브 1개 — gameStore의 isTerminal 분기가 처리)
  override get cityCubeCounts(): Record<string, number> {
    return { wien: 4, koenigsberg: 3 };
  }

  override get engineerHalfCost(): boolean { return true; }
  override get requireCompleteLinks(): boolean { return true; }
  override get bonusCityCubeId(): string | null { return 'berlin'; }
}
