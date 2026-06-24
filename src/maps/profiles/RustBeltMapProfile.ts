// Rust Belt 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 부분만 override
//
// Rust Belt는 룰북 표준 규칙을 그대로 따르는 일반 맵이므로 변형이 거의 없다.
// 유일한 셋업 변형: Pittsburgh/Wheeling은 초기 큐브 3개(그 외 도시 2개).
// 경로 전략·incomeSources(cityCubes)·엔진 상한 등은 StandardMapProfile 기본을 상속.

import { StandardMapProfile } from './StandardMapProfile';
import { MapRuleSummary } from '../MapProfile';
import { MapId } from '../MapId';
import { RUST_BELT_MAP, createRustBeltBoardState } from '@/utils/rustBeltMap';

export class RustBeltMapProfile extends StandardMapProfile {
  constructor() {
    super({
      id: MapId.RustBelt,
      name: RUST_BELT_MAP.name,
      nameKo: RUST_BELT_MAP.nameKo,
      supportedPlayers: RUST_BELT_MAP.supportedPlayers,
      maxTurns: RUST_BELT_MAP.maxTurns,
      createBoardState: createRustBeltBoardState,
    });
  }

  // 룰북 셋업: "Place 3 goods on Pittsburgh and Wheeling, 2 on each other City"
  override get cityCubeCounts(): Record<string, number> {
    return { pittsburgh: 3, wheeling: 3 };
  }

  // 공식 맵 시트에서 숫자 박스가 검은색인 도시 (색과 무관한 디자인)
  private static readonly BLACK_BOX_IDS = new Set([
    'evansville', 'cincinnati', 'wheeling', 'pittsburgh', 'detroit', 'toronto',
  ]);
  override isCityNumberBoxBlack(cityId: string): boolean {
    return RustBeltMapProfile.BLACK_BOX_IDS.has(cityId);
  }

  override get specialRules(): MapRuleSummary[] {
    return [
      { title: '표준 규칙 맵', detail: 'Age of Steam 기본 룰을 그대로 따르는 미국 북동부 맵입니다.' },
      { title: '큐브 많은 도시', detail: 'Pittsburgh·Wheeling은 시작 큐브 3개, 그 외 도시는 2개입니다.' },
      { title: '5인 7턴', detail: '플레이어 수에 따라 턴 수가 정해집니다 (5인 기준 7턴).' },
    ];
  }
}
