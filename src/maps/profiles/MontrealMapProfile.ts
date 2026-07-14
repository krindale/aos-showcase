// Montréal Métro 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 규칙만 override
//
// 특수 규칙(원본 룰 — rules/AoS_Montreal_Rules.doc):
//  - 3인 전용 9라운드, 물품 성장(IX) 단계 없음 (물품 디스플레이 미사용)
//  - 정부 링크: 매 라운드 주식 발행 전, 정부 관리 플레이어(순번 로테이션)가 중립 링크 1개 무료 건설
//    (누구나 사용 가능하나 수입 없음, governmentLinks)
//  - 마스터 네트워크: 보드 위 모든 트랙(정부 포함)의 총합이 항상 연속 (masterNetwork)
//  - Locomotive: 일반 엔진 대신 정부 전용 엔진(DGEL) +1 — 정부 링크 위 추가 이동 전용, 비용에 합산
//    (dedicatedGovEngine). DGEL을 올리는 유일한 방법.
//  - 경매: 무입찰 패스 2인 이상이면 그들은 이번 턴 특수 행동 선택 불가 (auctionNoBidPassPenalty)
//  - Production → Repopulation: 선택 즉시 주머니에서 3개 뽑아 1개를 맵의 도시에 배치 (productionAsRepopulation)
//  - 셋업: 신규 도시 타일마다 큐브 1개 — 도시화 시 함께 보드에 (newCitySetupCube)
//  - 지형 비용(평지 $2/언덕 $3/도로 $4/물 $6·예외 $5)과 Parc Mont-Royal 건설 금지는
//    보드 데이터(HexTile.fixedCost / blockedEdges)로 표현 — montrealMap.ts

import { StandardMapProfile } from './StandardMapProfile';
import { MapRuleSummary } from '../MapProfile';
import { MapId } from '../MapId';
import { SpecialAction } from '@/types/game';
import {
  MONTREAL_MAP,
  MONTREAL_CITY_CUBE_COUNTS,
  createMontrealBoardState,
} from '@/utils/montrealMap';

export class MontrealMapProfile extends StandardMapProfile {
  constructor() {
    super({
      id: MapId.Montreal,
      name: MONTREAL_MAP.name,
      nameKo: MONTREAL_MAP.nameKo,
      supportedPlayers: MONTREAL_MAP.supportedPlayers,
      maxTurns: MONTREAL_MAP.maxTurns,
      createBoardState: createMontrealBoardState,
      engineMax: 4, // 좁은 맵 + DGEL(정부 링크 추가 이동)이 있어 일반 엔진 과투자는 낭비
    });
  }

  override get cityCubeCounts(): Record<string, number> {
    return MONTREAL_CITY_CUBE_COUNTS;
  }

  // 원본 시트: 도시 숫자 박스(초기 화물 수)는 어두운 박스 + 흰 숫자
  override isCityNumberBoxBlack(): boolean { return true; }

  // ── 몬트리올 특수룰 플래그 ──
  override get governmentLinks(): boolean { return true; }
  override get masterNetwork(): boolean { return true; }
  override get dedicatedGovEngine(): boolean { return true; }
  override get auctionNoBidPassPenalty(): boolean { return true; }
  override get productionAsRepopulation(): boolean { return true; }
  override get newCitySetupCube(): boolean { return true; }
  // 물품 성장 단계 없음 (mapRegistry rules.skipGoodsGrowth와 이중 안전망)
  override get skipGoodsGrowth(): boolean { return true; }
  // (지연 완성 페널티 11 오버라이드는 제거 — vp.ts가 배달 시작 지연의 현금 흐름 손실과
  //  엔진 증분 유지비를 직접 계산하게 되면서 기본값으로도 즉시 경로가 자연 우선됨. 2026-07-14)

  override actionDescription(action: SpecialAction): string | undefined {
    if (action === 'locomotive') {
      return '일반 엔진 대신 정부 전용 엔진(DGEL)이 +1 됩니다. DGEL만큼 정부 링크 위를 추가로 이동할 수 있고, 비용 지불에 합산됩니다.';
    }
    if (action === 'production') {
      return 'Repopulation — 선택 즉시 주머니에서 화물 3개를 뽑아 그중 1개를 맵의 도시에 배치합니다.';
    }
    return undefined;
  }

  override get buildCostHint(): string {
    return '평지: $2 / 언덕: $3 / 도로: $4 / 물: $6 (Jean-Drapeau 우측만 $5)';
  }

  override get specialRules(): MapRuleSummary[] {
    return [
      { title: '3인 9라운드', detail: '몬트리올 메트로 — 3명 전용, 9라운드로 진행합니다.' },
      {
        title: '정부 링크',
        detail: '매 라운드 시작(주식 발행 전)에 정부 관리 플레이어(1st→2nd→3rd 순번 로테이션)가 중립 링크 1개를 무료로 건설합니다. 누구나 사용할 수 있지만 수입은 없습니다.',
      },
      {
        title: '마스터 네트워크',
        detail: '보드 위 모든 트랙(정부 트랙 포함)은 항상 하나로 이어져 있어야 합니다. 첫 정부 링크가 네트워크의 시작점입니다.',
      },
      {
        title: 'Locomotive → 정부 엔진(DGEL)',
        detail: 'Locomotive 행동은 일반 엔진 대신 정부 전용 엔진 레벨을 +1 합니다. 배달 때 DGEL만큼 정부 링크를 추가로 이용할 수 있고, 비용 지불에도 합산됩니다.',
      },
      {
        title: '경매 무입찰 패스 페널티',
        detail: '경매에서 입찰 없이 패스한 플레이어가 2명 이상이면, 그들은 이번 라운드 특수 행동을 선택할 수 없습니다.',
      },
      {
        title: 'Production → Repopulation',
        detail: '선택 즉시 주머니에서 화물 3개를 뽑아 1개를 맵의 도시에 배치합니다 (물품 성장 단계 없음).',
      },
      {
        title: '지형 비용 / Parc Mont-Royal',
        detail: '평지 $2 · 언덕 $3 · 도로 $4 · 물 $6 (예외 1곳 $5). 굵은 외곽선의 Parc Mont-Royal 3헥스는 관통 건설 불가.',
      },
      { title: '신규 도시 화물', detail: '신규 도시 타일마다 셋업 때 화물 1개가 올려져 있어 도시화 시 함께 보드에 올라갑니다.' },
    ];
  }
}
