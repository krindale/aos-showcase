// Rust Belt 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 부분만 override
//
// Rust Belt는 룰북 표준 규칙을 그대로 따르는 일반 맵이므로 변형이 거의 없다.
// 유일한 셋업 변형: Pittsburgh/Wheeling은 초기 큐브 3개(그 외 도시 2개).
// 경로 전략·incomeSources(cityCubes)·엔진 상한 등은 StandardMapProfile 기본을 상속.

import { StandardMapProfile } from './StandardMapProfile';
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
}
