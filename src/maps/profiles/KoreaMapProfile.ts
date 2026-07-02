// Korea 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 규칙만 override
//
// 특수 규칙(룰북 한국):
//  - 동적 도시 색상: 도시 수요색 = 현재 놓인 큐브 색 (BoardState.dynamicCityColors — koreaMap.ts에서 set,
//    엔진 cityAcceptsCube 헬퍼가 처리). 프로파일 getter가 아니라 보드 플래그로 표현(hexGrid 저수준 의존).
//  - 셋업: 평양 4, 부산·인천 3, 나머지 도시 2 (cityCubeCounts)
//  - 도시화 시 디스플레이에서 큐브 2개를 신도시에 배치 후 보충 (urbanizeFromDisplayCount)
//  - 평양·수원은 물품 성장 안 받음 (noGrowthCityIds + columnMapping 제외)
//  - 산 $3 고정비용 / 수원-서울·수원-인천 직결 링크는 koreaMap.ts 보드 데이터로 표현

import { StandardMapProfile } from './StandardMapProfile';
import { MapRuleSummary } from '../MapProfile';
import { MapId } from '../MapId';
import { KOREA_MAP, createKoreaBoardState } from '@/utils/koreaMap';

export class KoreaMapProfile extends StandardMapProfile {
  constructor() {
    super({
      id: MapId.Korea,
      name: KOREA_MAP.name,
      nameKo: KOREA_MAP.nameKo,
      supportedPlayers: KOREA_MAP.supportedPlayers,
      maxTurns: KOREA_MAP.maxTurns,
      createBoardState: createKoreaBoardState,
    });
  }

  // 룰북 셋업: 평양 4 / 부산·인천 3 / 나머지 도시 2(기본값)
  override get cityCubeCounts(): Record<string, number> {
    return { pyongyang: 4, busan: 3, incheon: 3 };
  }

  // 도시화: 디스플레이에서 큐브 2개를 신도시에 배치 후 보충 (신도시 수요색이 이 큐브로 결정됨)
  override get urbanizeFromDisplayCount(): number { return 2; }
  // 공식 맵 시트 기준 숫자 박스 색 (도시별 지정 + 기본은 어두운 수요색만 검정)
  override isCityNumberBoxBlack(cityId: string, demandColor: string): boolean {
    if (['taejon', 'incheon', 'gangneung'].includes(cityId)) return false; // 흰 박스
    if (['pohang', 'gwangju'].includes(cityId)) return true; // 검은 박스
    return ['blue', 'purple', 'black'].includes(demandColor);
  }

  // 평양·수원은 물품 성장 안 받음
  override get noGrowthCityIds(): string[] { return ['pyongyang', 'suwon']; }

  override get specialRules(): MapRuleSummary[] {
    return [
      { title: '4인 8턴', detail: '한국 맵 — 4명, 8턴으로 진행합니다.' },
      { title: '동적 도시 색상', detail: '도시는 고정색이 없습니다. 도시의 수요색 = 현재 놓인 물품 큐브의 색이며, 빈 도시는 수요가 없습니다.' },
      { title: '같은 색 통과 불가', detail: '물품은 같은 색 큐브가 있는 도시를 통과할 수 없고, 그 도시에서 배달이 끝납니다.' },
      { title: '도시 직결 링크', detail: '수원-서울, 수원-인천은 $2 직결 링크로 이을 수 있습니다 (트랙 1개).' },
      { title: '신도시는 회색', detail: '도시화 시 디스플레이에서 큐브 2개를 신도시에 놓고 보충합니다. 신도시는 모두 회색 취급(수요색은 놓인 큐브로 결정).' },
      { title: '산 $3', detail: '산악(갈색) 헥스의 트랙 건설 비용은 $3입니다.' },
      { title: '산맥 경계 건설 불가', detail: '지도에 두꺼운 선으로 표시된 산맥 경계를 가로질러서는 철도를 건설할 수 없습니다.' },
      { title: '평양·수원 성장 없음', detail: '평양과 수원은 물품 성장 단계에서 새 물품을 받지 않습니다.' },
    ];
  }
}
