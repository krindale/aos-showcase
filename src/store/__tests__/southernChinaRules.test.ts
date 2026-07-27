// 남부 중국(Southern China) 맵 특수룰 store 테스트
// 셋업(큐브/행동) · Gain Support 즉시 토큰 · 토큰 반납(건설 4개/기관차 +1) · 보너스 VP
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, createInitialGameState } from '@/store/gameStore';
import { getMapProfile } from '@/maps/getMapProfile';
import { maxTracksForBuilder } from '@/store/helpers/boardRules';
import { effectiveEngineLevel, playerBonusVP, resetPlayerActions } from '@/utils/gameLogic';
import { City } from '@/types/game';

function setupChina() {
  const s = createInitialGameState('southern-china', ['A', 'B', 'C', 'D'], []);
  useGameStore.setState(s);
  return useGameStore.getState();
}

const cityById = (id: string): City =>
  useGameStore.getState().board.cities.find((c) => c.id === id)!;

describe('남부 중국 셋업', () => {
  beforeEach(() => { setupChina(); });

  it('Hong Kong·Changsha 큐브 3개, 나머지 도시 2개 (4인 8턴)', () => {
    const state = useGameStore.getState();
    expect(cityById('hongkong').cubes.length).toBe(3);
    expect(cityById('changsha').cubes.length).toBe(3);
    for (const id of ['chongqing', 'ningbo', 'guiyang', 'xiamen', 'nanning', 'guangzhou', 'shenzhen', 'haikou']) {
      expect(cityById(id).cubes.length).toBe(2);
    }
    expect(state.maxTurns).toBe(8);
    expect(state.phaseState.maxTracksThisTurn).toBe(3);
  });

  it('Engineer·Locomotive 비활성 + gainSupport 추가 행동', () => {
    const profile = getMapProfile('southern-china');
    expect(profile.disabledActions).toEqual(['engineer', 'locomotive']);
    expect(profile.extraActions).toEqual(['gainSupport']);
    expect(profile.supportTokensRule).toBe(true);
  });

  it('engineer/locomotive 선택은 거부, gainSupport 선택은 즉시 토큰 +1', () => {
    useGameStore.setState({ currentPhase: 'selectActions', currentPlayer: 'player1' });
    const store = useGameStore.getState();
    store.selectAction('player1', 'engineer');
    expect(useGameStore.getState().players.player1.selectedAction).toBeNull();
    store.selectAction('player1', 'locomotive');
    expect(useGameStore.getState().players.player1.selectedAction).toBeNull();
    expect(useGameStore.getState().players.player1.engineLevel).toBe(1); // 즉시 효과도 없음

    store.selectAction('player1', 'gainSupport');
    const after = useGameStore.getState().players.player1;
    expect(after.selectedAction).toBe('gainSupport');
    expect(after.supportTokens).toBe(1);
  });

  it('다른 맵(rust-belt)에서는 gainSupport 선택 불가', () => {
    const s = createInitialGameState('rust-belt', ['A', 'B', 'C', 'D'], []);
    useGameStore.setState({ ...s, currentPhase: 'selectActions', currentPlayer: 'player1' });
    useGameStore.getState().selectAction('player1', 'gainSupport');
    expect(useGameStore.getState().players.player1.selectedAction).toBeNull();
    expect(useGameStore.getState().players.player1.supportTokens ?? 0).toBe(0);
  });
});

describe('지지 토큰 반납', () => {
  beforeEach(() => {
    setupChina();
    useGameStore.setState((s) => ({
      players: { ...s.players, player1: { ...s.players.player1, supportTokens: 2 } },
    }));
  });

  it("'build' 반납: buildTrack 단계 내 차례에 건설 상한 4", () => {
    useGameStore.setState({ currentPhase: 'buildTrack', currentPlayer: 'player1' });
    useGameStore.getState().spendSupportToken('player1', 'build');
    const state = useGameStore.getState();
    expect(state.players.player1.supportTokens).toBe(1);
    expect(state.players.player1.supportBuildActive).toBe(true);
    expect(state.phaseState.maxTracksThisTurn).toBe(4);
    expect(maxTracksForBuilder(state, 'player1')).toBe(4);
    // 중복 반납 불가
    useGameStore.getState().spendSupportToken('player1', 'build');
    expect(useGameStore.getState().players.player1.supportTokens).toBe(1);
  });

  it("'loco' 반납: moveGoods 단계에 실효 엔진 +1 (영구 레벨·비용은 불변)", () => {
    useGameStore.setState({ currentPhase: 'moveGoods', currentPlayer: 'player1' });
    useGameStore.getState().spendSupportToken('player1', 'loco');
    const state = useGameStore.getState();
    expect(state.players.player1.supportTokens).toBe(1);
    expect(state.players.player1.supportLocoActive).toBe(true);
    expect(state.players.player1.engineLevel).toBe(1); // 영구 레벨 불변 → 비용 지불에도 미포함
    expect(effectiveEngineLevel(state.players, 'player1')).toBe(2);
    expect(effectiveEngineLevel(state.players, 'player2')).toBe(1);
  });

  it('잘못된 단계/차례/토큰 0개면 반납 거부', () => {
    useGameStore.setState({ currentPhase: 'moveGoods', currentPlayer: 'player1' });
    useGameStore.getState().spendSupportToken('player1', 'build'); // 단계 불일치
    expect(useGameStore.getState().players.player1.supportTokens).toBe(2);
    useGameStore.setState({ currentPhase: 'buildTrack', currentPlayer: 'player2' });
    useGameStore.getState().spendSupportToken('player1', 'build'); // 차례 아님
    expect(useGameStore.getState().players.player1.supportTokens).toBe(2);
    useGameStore.getState().spendSupportToken('player2', 'build'); // 토큰 없음
    expect(useGameStore.getState().players.player2.supportBuildActive ?? false).toBe(false);
  });

  it('턴 롤오버 시 토큰 효과 플래그는 리셋, 토큰 보유량은 유지', () => {
    useGameStore.setState({ currentPhase: 'buildTrack', currentPlayer: 'player1' });
    useGameStore.getState().spendSupportToken('player1', 'build');
    const players = resetPlayerActions(useGameStore.getState().players, ['player1', 'player2', 'player3', 'player4']);
    expect(players.player1.supportBuildActive).toBe(false);
    expect(players.player1.supportLocoActive).toBe(false);
    expect(players.player1.supportTokens).toBe(1); // 남은 토큰은 유지 (종료 시 3 VP)
  });

  it('미사용 토큰 보너스 VP = 토큰×3 + 페리×1', () => {
    expect(playerBonusVP({ supportTokens: 2, ferriesBuilt: 1 })).toBe(7);
    expect(playerBonusVP({})).toBe(0);
  });
});

describe('추가비용 헥스 — 복합 타일 전 단순 타일 선행 (룰북)', () => {
  // 이 엔진의 복합(교차/공존)은 항상 "기존 단순 트랙 위 교체"라 빈 헥스 복합 배치가
  // 전 맵에서 불가능 = 룰이 구조적으로 충족된다. 이 테스트는 그 전제를 박제하는 회귀 가드 —
  // 훗날 빈 헥스 복합 배치가 허용되면 여기가 깨져 추가비용 헥스($4/$5) 제약을 상기시킨다.
  it('빈 추가비용 헥스($4/$5)에는 복합 트랙(교차/공존)을 바로 놓을 수 없다', () => {
    setupChina();
    useGameStore.setState({ currentPhase: 'buildTrack', currentPlayer: 'player1' });
    // (7,7)·(9,8) $5, (4,10) $4 — 트랙이 없는 상태에서는 어떤 복합도 불가 (단순 선행 필수)
    for (const coord of [{ col: 7, row: 7 }, { col: 9, row: 8 }, { col: 4, row: 10 }]) {
      expect(useGameStore.getState().canBuildComplexTrack(coord, [0, 3], 'crossing')).toBe(false);
      expect(useGameStore.getState().canBuildComplexTrack(coord, [0, 3], 'coexist')).toBe(false);
    }
  });
});
