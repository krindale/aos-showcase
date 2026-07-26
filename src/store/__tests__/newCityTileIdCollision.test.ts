/**
 * 신도시 타일 id ↔ 맵 원본 도시 id 충돌 회귀 (2026-07-26 사용자 발견)
 *
 * placeNewCity의 중복 배치 방어가 board.cities 전체에서 id만 비교해, 튜토리얼 맵의
 * Cleveland(id 'C') 때문에 신도시 타일 'C'가 "이미 배치됨"으로 오탐 거부되던 버그.
 * 수정: 신도시로 배치된 도시(isUrbanizedNewCity)만 검사 + 같은 타일 재배치는 여전히 거부.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../gameStore';
import { NewCityTileId } from '@/types/game';

const WHEELING = { col: 4, row: 3 }; // 튜토리얼 유일 마을 (W)

function enterUrbanization(tileId: NewCityTileId) {
  useGameStore.setState((s) => ({
    currentPhase: 'buildTrack',
    currentPlayer: 'player1',
    players: {
      ...s.players,
      player1: { ...s.players.player1, selectedAction: 'urbanization' },
    },
    ui: { ...s.ui, urbanizationMode: true, selectedNewCityTile: tileId },
  }));
}

describe('신도시 타일 id와 맵 도시 id 충돌', () => {
  beforeEach(() => {
    useGameStore.getState().initGame('tutorial', ['Player1', 'Player2']);
  });

  it("타일 'C'는 Cleveland(id 'C')가 있어도 배치된다", () => {
    enterUrbanization('C');
    const ok = useGameStore.getState().placeNewCity(WHEELING);
    expect(ok).toBe(true);

    const state = useGameStore.getState();
    const placed = state.board.cities.filter((c) => c.id === 'C');
    // Cleveland + 신도시 C — 신도시 쪽만 isUrbanizedNewCity
    expect(placed).toHaveLength(2);
    expect(placed.filter((c) => c.isUrbanizedNewCity)).toHaveLength(1);
    expect(state.newCityTiles.find((t) => t.id === 'C')?.used).toBe(true);
  });

  it('같은 타일의 중복 배치는 여전히 거부된다 (used 플래그)', () => {
    enterUrbanization('C');
    expect(useGameStore.getState().placeNewCity(WHEELING)).toBe(true);
    // 배치 후 다시 시도 (마을이 이미 도시화됐으므로 canPlaceNewCity에서도 걸리지만,
    // used 검사 자체도 확인 — 다른 마을이 있는 맵에서의 중복 방어를 대변)
    enterUrbanization('C');
    expect(useGameStore.getState().placeNewCity(WHEELING)).toBe(false);
  });

  it('배치 → 실행 취소 → 다른 타일 배치가 가능하다 (실전 재현 시나리오)', () => {
    // H 배치 → undo → G 배치 → undo → C 배치 (10:49~10:51 로그 재현)
    enterUrbanization('H');
    expect(useGameStore.getState().placeNewCity(WHEELING)).toBe(true);
    useGameStore.getState().undoLastAction();

    enterUrbanization('G');
    expect(useGameStore.getState().placeNewCity(WHEELING)).toBe(true);
    useGameStore.getState().undoLastAction();

    enterUrbanization('C');
    expect(useGameStore.getState().placeNewCity(WHEELING)).toBe(true);
    const state = useGameStore.getState();
    expect(state.newCityTiles.find((t) => t.id === 'C')?.used).toBe(true);
    expect(state.newCityTiles.find((t) => t.id === 'H')?.used).toBe(false); // undo로 복원됨
    expect(state.newCityTiles.find((t) => t.id === 'G')?.used).toBe(false);
  });
});
