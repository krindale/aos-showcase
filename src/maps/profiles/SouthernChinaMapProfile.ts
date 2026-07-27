// 남부 중국(Southern China) 맵 프로파일 — 표준(도시 큐브 배달) 맵에서 변형된 규칙만 override
//
// 특수 규칙(원본 룰 — rules/southern-china-rules-pt1/2.pdf):
//  - 4~5인 (룰북 3~5인 — 이 구현은 4~5인 지원, 디폴트 4인 8턴 / 5인 7턴)
//  - 셋업: Hong Kong·Changsha 큐브 3개, 나머지 도시 2개. 소유 디스크는 플레이어당 4개뿐.
//  - Engineer·Locomotive 행동 미사용. 신규 행동 Gain Support(지지 토큰 1개 획득).
//  - 지지 토큰: 미사용 1개 = 종료 시 3 VP. 1개 반납 → ① 이번 턴 트랙 4개 건설 or
//    ② 이번 수송 단계 양 라운드 기관차 +1 (2개 반납하면 둘 다).
//  - 국유화 트랙: 새 완성 링크에 놓을 디스크가 없으면 기존 링크의 디스크를 떼어 이전 —
//    뗀 링크는 국유화(누구나 사용·수입 0·VP 0). 보상 = 지지 토큰 1 + 구간당 $1.
//    당턴에 지은/완성한 링크는 국유화 불가. 미완성 트랙은 동시 1개만, 디스크 제거 보상 없음.
//  - Hong Kong: 모든 색 화물 수용(acceptsAllColors), 국유화 트랙 경유 배달 금지,
//    마지막 2턴은 배달 수령 불가.
//  - 인터어반(Guangzhou↔Shenzhen)·페리(Guangzhou↔HK, 서안 헥스↔HK): $8,
//    플레이어당 턴 1개, 건설 1회로 카운트 + 종료 시 1 VP.
//  - 추가비용 헥스(원 숫자 $4/$5): 표기 비용으로 건설, 복합 타일 전에 단순 타일 선행 필수.

import { StandardMapProfile } from './StandardMapProfile';
import { MapRuleSummary } from '../MapProfile';
import { MapId } from '../MapId';
import { GameState, PlayerId, SpecialAction } from '@/types/game';
import { SOUTHERN_CHINA_MAP, createSouthernChinaBoardState } from '@/utils/southernChinaMap';

export class SouthernChinaMapProfile extends StandardMapProfile {
  constructor() {
    super({
      id: MapId.SouthernChina,
      name: SOUTHERN_CHINA_MAP.name,
      nameKo: SOUTHERN_CHINA_MAP.nameKo,
      supportedPlayers: SOUTHERN_CHINA_MAP.supportedPlayers,
      maxTurns: SOUTHERN_CHINA_MAP.maxTurns,
      turnsByPlayers: SOUTHERN_CHINA_MAP.turnsByPlayers,
      createBoardState: createSouthernChinaBoardState,
    });
  }

  /** 셋업: Hong Kong·Changsha 3개, 나머지 2개 (룰북) */
  override get cityCubeCounts(): Record<string, number> {
    return { hongkong: 3, changsha: 3 };
  }

  /** Engineer·Locomotive 미사용 (룰북 Select Actions) — 건설 4개는 지지 토큰 반납으로만,
   *  기관차는 수송 기회 교환 또는 지지 토큰 임시 +1로만 올린다/보탠다. */
  override get disabledActions(): SpecialAction[] {
    return ['engineer', 'locomotive'];
  }

  /** 지지 확보(Gain Support) — 남부 중국 전용 8번째 행동 (선택 즉시 토큰 +1, gameStore) */
  override get extraActions(): SpecialAction[] {
    return ['gainSupport'];
  }

  /** 지지 토큰 룰 — 반납 사용(spendSupportToken)·종료 3 VP(playerBonusVP) 활성화 */
  override get supportTokensRule(): boolean {
    return true;
  }

  /** 소유 디스크 4개 (룰북) — 초과 시 국유화 강제 */
  override get ownershipDiscLimit(): number | null {
    return 4;
  }

  /** 미완성 트랙 구간 동시 1개 (룰북) */
  override get unfinishedSectionLimit(): number | null {
    return 1;
  }

  /** Hong Kong은 마지막 2턴 배달 수령 불가 (룰북) */
  override get allAcceptCityClosedLastTurns(): number {
    return 2;
  }

  /** 인터어반·페리: $8, 플레이어당 턴 1개, 건설 1회 카운트 + 종료 시 1 VP */
  override get interurbanFerryRule(): boolean {
    return true;
  }

  // Hong Kong 렌더는 City.acceptsAllColors가 직접 구동한다 — 회색 헥스 + 헥스 **바깥**
  // 우하단의 5색 원 그래프(폐쇄 시 그 위에 X), 숫자 박스는 상2색/하3색 세로 분할(BoardCities).
  // grayRenderCityId(Germany Berlin 단색 회색 훅)는 쓰지 않는다.

  /**
   * Gain Support AI 선호 ΔVP — 토큰은 미사용 시 확정 3 VP인데, 행동 슬롯 기회비용과
   * "지금이 아니어도 나중에 얻을 수 있음"을 감안해 3보다 약간 낮은 값을 쓴다.
   * 후반(회수 턴이 없는 시점)일수록 확정 3 VP의 상대 가치가 올라간다.
   * 100시드 실측: 이 값으로 게임당 8.0회 선택 · 잔여 토큰 3.5개(≈10.5 VP)로 종료.
   * ⚠️ 봇의 **토큰 반납**은 전 변형이 베이스라인 미달로 기각됐다(반납 없음 = 최선) —
   * docs/ai-auction-baseline-100seed.md 2026-07-27c. 이 값은 "모으기만" 전제의 튜닝값이다.
   */
  override aiExtraActionVP(action: SpecialAction, state: GameState, _playerId: PlayerId): number {
    if (action !== 'gainSupport') return 0;
    const maxTurns = state.maxTurns;
    const turnsLeft = Math.max(0, maxTurns - state.currentTurn);
    // 남은 턴이 적을수록 3 VP 확정 가치에 수렴 (초반 2.0 → 마지막 턴 2.8)
    return Math.min(2.8, 2.0 + (0.8 * (maxTurns - 1 - turnsLeft)) / Math.max(1, maxTurns - 1));
  }

  /** 원본 시트: Shenzhen·Hong Kong·Xiamen·Haikou가 검은 숫자 박스 */
  override isCityNumberBoxBlack(cityId: string): boolean {
    return ['shenzhen', 'hongkong', 'xiamen', 'haikou'].includes(cityId);
  }

  override get buildCostHint(): string {
    return '평지: $2 / 강: $3 / 산: $4 (원 숫자 헥스는 표기 비용)';
  }

  override get specialRules(): MapRuleSummary[] {
    return [
      {
        title: '4~5인 · 디스크 4개',
        detail:
          '소유 디스크를 4개만 가지고 시작합니다. 다섯 번째 완성 링크를 만들면 기존 링크 하나에서 디스크를 떼어 와야 하고, 그 링크는 국유화됩니다.',
      },
      {
        title: '국유화 트랙',
        detail:
          '국유화된 링크는 누구나 이용할 수 있지만 수입도 승점도 없습니다. 국유화 보상으로 지지 토큰 1개와 트랙 구간당 $1을 받습니다. 이번 턴에 짓거나 완성한 링크는 국유화할 수 없고, 미완성 트랙은 한 번에 1개만 가질 수 있습니다.',
      },
      {
        title: '지지 토큰 (Tokens of Support)',
        detail:
          '신규 행동 Gain Support로 토큰을 얻습니다. 토큰 1개를 반납하면 이번 턴 트랙을 4개까지 건설하거나 수송 단계 두 라운드 동안 기관차 +1 — 2개 반납하면 둘 다. 쓰지 않은 토큰은 게임 종료 시 개당 3 VP입니다. Engineer·Locomotive 행동은 이 맵에 없습니다.',
      },
      {
        title: 'Hong Kong',
        detail:
          '홍콩은 모든 색 화물을 받는 항구입니다. 단, 국유화 트랙을 거친 배달은 받지 않고, 마지막 2턴에는 어떤 배달도 받지 않습니다.',
      },
      {
        title: '인터어반과 페리',
        detail:
          'Guangzhou↔Shenzhen 인터어반, Shenzhen↔Hong Kong 링크, Guangzhou↔Hong Kong 페리를 $8에 건설할 수 있습니다 (플레이어당 턴 1개, 건설 1회로 카운트). 건설한 인터어반/페리는 게임 종료 시 1 VP입니다.',
      },
      {
        title: '추가비용 헥스',
        detail:
          '원 숫자가 표시된 헥스($4 하이난 해협, $5 주강 하구 2곳)는 표기된 비용으로 건설하며, 복합 타일을 놓기 전에 반드시 단순 타일이 먼저 놓여 있어야 합니다.',
      },
    ];
  }
}
