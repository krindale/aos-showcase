// 맵 프로파일 팩토리 — mapId(문자열/enum) → MapProfile 인스턴스 (캐싱)
//
// 게임 엔진·AI는 "mapId === 'st-lucia'" 분기 대신 getMapProfile(mapId).<메서드>를 호출해
// 맵별 동작을 다형성으로 얻는다. 새 맵은 여기 case 한 줄 + 서브클래스 하나로 추가된다.

import { MapProfile } from './MapProfile';
import { MapId } from './MapId';
import { StandardMapProfile } from './profiles/StandardMapProfile';
import { StLuciaMapProfile } from './profiles/StLuciaMapProfile';
import { RustBeltMapProfile } from './profiles/RustBeltMapProfile';
import { GermanyMapProfile } from './profiles/GermanyMapProfile';
import { WesternUsMapProfile } from './profiles/WesternUsMapProfile';
import { KoreaMapProfile } from './profiles/KoreaMapProfile';
import { TUTORIAL_MAP, createInitialBoardState as createTutorialBoardState } from '@/utils/tutorialMap';

// 튜토리얼 맵은 3턴 (mapRegistry의 TUTORIAL_MAX_TURNS와 동일해야 함)
const TUTORIAL_MAX_TURNS = 3;

const cache = new Map<string, MapProfile>();

function buildProfile(mapId: string): MapProfile {
  switch (mapId) {
    case MapId.StLucia:
      return new StLuciaMapProfile();

    case MapId.RustBelt:
      return new RustBeltMapProfile();

    case MapId.Germany:
      return new GermanyMapProfile();

    case MapId.WesternUS:
      return new WesternUsMapProfile();

    case MapId.Korea:
      return new KoreaMapProfile();

    case MapId.Tutorial:
      return new StandardMapProfile({
        id: MapId.Tutorial,
        name: TUTORIAL_MAP.name,
        nameKo: TUTORIAL_MAP.nameKo,
        supportedPlayers: TUTORIAL_MAP.supportedPlayers,
        maxTurns: TUTORIAL_MAX_TURNS,
        createBoardState: createTutorialBoardState,
        engineMax: 3, // 7×5 좁은 맵 → 과도한 엔진 업그레이드 비용 낭비
        noOwnColorCubes: true, // 도시에 자기 색 화물 배치 금지 (튜토리얼 하우스룰)
      });

    default:
      // 등록 안 된 맵: 룰북 기본값 표준 맵 (engineMax 미지정=6, totalTurns는 state.maxTurns).
      // 튜토리얼 설정(engine 3)을 적용하지 않는다 — 큰 맵 확장성 가드 (vp.test).
      return new StandardMapProfile({
        id: MapId.RustBelt,
        name: 'Standard',
        nameKo: '표준',
        supportedPlayers: [2, 3, 4, 5, 6],
        maxTurns: 6,
        createBoardState: createTutorialBoardState,
      });
  }
}

export function getMapProfile(mapId: string): MapProfile {
  const cached = cache.get(mapId);
  if (cached) return cached;
  const profile = buildProfile(mapId);
  cache.set(mapId, profile);
  return profile;
}
