import { create } from 'zustand';

/**
 * 게임 개인 설정 (로컬 UI — toastStore처럼 gameStore와 분리, 스냅샷 미동기화).
 * 게임 보드 헤더의 ⚙ 설정 창(GameSettingsDialog)에서 토글한다.
 *
 * - moveGuideEnabled: 운송 가이드(큐브 선택 시 목적지 골드 링 + 최적 경로 점선 미리보기).
 *   기본 on, localStorage로 게임 간 유지. 방 설정(GameState.moveGuideAllowed)이 false면
 *   이 값과 무관하게 강제 off — 실효 판정은 소비처가 `moveGuideAllowed && enabled`로 한다.
 * - transportConfirmEnabled: 화물 운송 확인 창(목적지 클릭 시 출발→도착·수익 귀속을 보여주고
 *   [운송/취소]). 기본 on — 끄면 확인 없이 즉시 운송. localStorage로 유지.
 * - sfxEnabled: 게임 액션 효과음 (utils/sfx.ts). 기본 on, localStorage로 유지.
 * - autoSheetEnabled: 모바일 바텀시트 높이 자동 조절 — 내 차례가 되면 그 단계가 보드를
 *   필요로 하는지에 따라 시트를 올리거나 내린다. 기본 on. **제안일 뿐 고정이 아니다** —
 *   자동 조절 후에도 드래그/탭으로 자유롭게 바꿀 수 있고, 다음 단계 전환까지 그대로 유지된다.
 * - showCoords: 헥스 좌표 표시 (디버그용 세션 토글 — 저장 안 함).
 *
 * gameStore ui가 아닌 별도 스토어인 이유: ui는 slice 곳곳에서 통째로 재생성되고
 * 스냅샷/undo 경계 관리가 필요하지만, 이 값들은 순수 개인 표시 설정이라 얽힐 이유가 없다.
 */

const GUIDE_OFF_KEY = 'aos-move-guide-off'; // 존재('1')하면 off — 기본(미저장)은 on
const TRANSPORT_CONFIRM_OFF_KEY = 'aos-transport-confirm-off'; // 존재('1')하면 off — 기본(미저장)은 on
const SFX_OFF_KEY = 'aos-sfx-off'; // 존재('1')하면 off — 기본(미저장)은 on
const AUTO_SHEET_OFF_KEY = 'aos-auto-sheet-off'; // 존재('1')하면 off — 기본(미저장)은 on

function readFlag(key: string): boolean {
  if (typeof window === 'undefined') return false; // SSR — 클라이언트 초기화 시 재평가됨
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch {
    /* localStorage 불가 환경 무시 */
  }
}

interface GameSettingsStore {
  /** 운송 가이드 개인 설정 (방 설정 강제 off와는 별개) */
  moveGuideEnabled: boolean;
  /** 화물 운송 확인 창 — 기본 on (끄면 즉시 운송) */
  transportConfirmEnabled: boolean;
  /** 게임 액션 효과음 — 기본 on */
  sfxEnabled: boolean;
  /** 모바일 바텀시트 높이 자동 조절 — 기본 on (조절 후에도 직접 올리고 내릴 수 있다) */
  autoSheetEnabled: boolean;
  /** 헥스 좌표 표시 (디버그) */
  showCoords: boolean;
  toggleMoveGuide: () => void;
  toggleTransportConfirm: () => void;
  toggleSfx: () => void;
  toggleAutoSheet: () => void;
  toggleShowCoords: () => void;
}

export const useGameSettingsStore = create<GameSettingsStore>((set, get) => ({
  moveGuideEnabled: !readFlag(GUIDE_OFF_KEY),
  transportConfirmEnabled: !readFlag(TRANSPORT_CONFIRM_OFF_KEY),
  sfxEnabled: !readFlag(SFX_OFF_KEY),
  autoSheetEnabled: !readFlag(AUTO_SHEET_OFF_KEY),
  showCoords: false,
  toggleMoveGuide: () => {
    const next = !get().moveGuideEnabled;
    writeFlag(GUIDE_OFF_KEY, !next); // off일 때만 저장
    set({ moveGuideEnabled: next });
  },
  toggleTransportConfirm: () => {
    const next = !get().transportConfirmEnabled;
    writeFlag(TRANSPORT_CONFIRM_OFF_KEY, !next); // off일 때만 저장 (기본 on)
    set({ transportConfirmEnabled: next });
  },
  toggleSfx: () => {
    const next = !get().sfxEnabled;
    writeFlag(SFX_OFF_KEY, !next); // off일 때만 저장 (기본 on)
    set({ sfxEnabled: next });
  },
  toggleAutoSheet: () => {
    const next = !get().autoSheetEnabled;
    writeFlag(AUTO_SHEET_OFF_KEY, !next); // off일 때만 저장 (기본 on)
    set({ autoSheetEnabled: next });
  },
  toggleShowCoords: () => set({ showCoords: !get().showCoords }),
}));
