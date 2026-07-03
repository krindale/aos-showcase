// 실행 취소(Undo) 스냅샷 시스템 — gameStore 모듈 헬퍼 분리 (2026-07-03 스텝 3a)

import { GameState, BoardState } from '@/types/game';

// ============================================================
// 실행 취소(Undo): 사람 플레이어의 커밋 행동 스냅샷
// 단계/차례 전환(nextPhase) 시 초기화 — "다음으로 넘어가기 전"까지만 취소 가능
// ============================================================
interface UndoSnapshot {
  label: string;
  board: BoardState;
  players: GameState['players'];
  phaseState: GameState['phaseState'];
  newCityTiles: GameState['newCityTiles'];
  goodsDisplay: GameState['goodsDisplay'];
  logs: GameState['logs'];
}
export const undoSnapshots: UndoSnapshot[] = [];

/** 현재 상태를 스냅샷으로 저장 (AI 차례는 저장 안 함 — 사람의 취소 버튼 전용) */
export function captureUndo(state: GameState, label: string) {
  const player = state.players[state.currentPlayer];
  if (!player || player.isAI) return;
  undoSnapshots.push({
    label,
    board: structuredClone(state.board),
    players: structuredClone(state.players),
    phaseState: structuredClone(state.phaseState),
    newCityTiles: structuredClone(state.newCityTiles),
    goodsDisplay: structuredClone(state.goodsDisplay), // 한국 도시화는 디스플레이를 변경하므로 복원 대상
    logs: state.logs, // 로그 배열은 불변 갱신이므로 참조 보관으로 충분
  });
  if (undoSnapshots.length > 30) undoSnapshots.shift();
}

export function clearUndo() {
  undoSnapshots.length = 0;
}

/** 다음에 취소될 행동의 라벨 (UI 버튼 표시용) */
export function getUndoLabel(): string | null {
  return undoSnapshots[undoSnapshots.length - 1]?.label ?? null;
}
