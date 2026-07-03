/**
 * 게임 인텐트 계층 (Phase 1 스텝 2)
 *
 * 호스트 권위 동기화의 양쪽 끝:
 * - 게스트: 커밋 액션(게임 상태를 실제로 바꾸는 store 액션)을 몽키패치해 로컬 실행을 차단하고
 *   intent만 전송한다. UI 선택 액션(selectHex 등)은 패치하지 않는다 — 게스트도 자기 선택은 로컬.
 * - 호스트: intent를 검증(좌석 주인 강제·차례 확인)한 뒤 **기존 store 액션 그대로** 재실행.
 *   커밋이 로컬 ui 선택값을 읽는 액션(placeNewCity 등)은 게스트가 그 값을 payload.ui로 실어
 *   보내고, 호스트가 실행 직전에 자기 ui에 주입한다.
 *
 * gameStore는 net을 모른다 — 패치는 밖에서 zustand setState로 액션 함수를 교체하는 방식.
 * (uiSlice 내부 호출도 `get().buildTrack(...)` 형태라 패치가 그대로 적용된다)
 */
import { useGameStore } from '@/store/gameStore';
import type { IntentMessage } from './types';

export interface GameIntentPayload {
  args?: unknown[];
  /** 커밋이 읽는 로컬 ui 선택값 스냅샷 (호스트가 실행 전 자기 ui에 주입) */
  ui?: Record<string, unknown>;
}

interface IntentSpec {
  /** args[i]가 playerId — 호스트가 좌석 주인으로 강제(스푸핑 방지) */
  playerIdArg?: number;
  /** 게스트 전송 시 함께 보낼 ui 필드 (호스트가 실행 전 주입) */
  captureUi?: string[];
  /** 게스트에서 no-op — 호스트 전용 커밋/로컬 전용 (intent로도 안 보냄) */
  guestNoop?: boolean;
}

/**
 * 커밋 액션 카탈로그 (2026-07-04 UI 호출 지점 전수조사 기반).
 * 여기 없는 액션은 패치하지 않는다 = 게스트 로컬 실행 허용(순수 UI 선택).
 */
const INTENT_SPECS: Record<string, IntentSpec> = {
  // Phase I 주식
  issueShare: { playerIdArg: 0 },
  // Phase II 경매/선공권
  placeBid: { playerIdArg: 0 },
  passBid: { playerIdArg: 0 },
  skipBid: { playerIdArg: 0 }, // 호스트에서 turnOrderPassUsed 플래그도 함께 (AuctionPanel raw setState 재현)
  resolveAuction: {},
  respondTurnOrderOffer: { playerIdArg: 0 },
  // Phase III 행동 선택
  selectAction: { playerIdArg: 0 },
  // Phase IV 건설
  buildTrack: {},
  buildComplexTrack: {},
  buildTownSpur: {},
  buildDirectLink: {},
  redirectTrack: {},
  placeNewCity: { captureUi: ['selectedNewCityTile'] },
  // Phase V 이동 — 애니메이션 시작이 곧 부분 커밋(보드 큐브 제거)이므로 여기가 경계.
  // 최종 정산(completeCubeMove)은 호스트 GameBoard의 애니메이션 타이머가 실행한다.
  startCubeAnimation: { captureUi: ['selectedCube'] },
  moveTrackCube: { captureUi: ['selectedCube'] },
  upgradeEngine: { playerIdArg: 0 },
  // Phase IX 물품 성장/생산
  growGoods: {}, // 주사위 결과는 인자로 고정 전송 (굴린 사람 값을 호스트가 그대로 적용)
  confirmProduction: { captureUi: ['productionMode', 'selectedProductionSlots', 'productionCubes'] },
  // 단계 진행 (내부에서 collectIncome/payExpenses/incomeReduction 정산 실행)
  nextPhase: {},

  // --- 게스트 no-op: 호스트 전용 커밋 or 로컬 전용 ---
  completeCubeMove: { guestNoop: true }, // 호스트 타이머가 정산 — 게스트 이중 정산 차단
  moveGoods: { guestNoop: true }, // 레거시 즉시 이동 (사람 UI 미사용, AI 전용)
  collectIncome: { guestNoop: true },
  payExpenses: { guestNoop: true },
  applyIncomeReduction: { guestNoop: true },
  endTurn: { guestNoop: true },
  undoLastAction: { guestNoop: true }, // 게스트 undo 금지 (Phase 1 단순안)
  executeAITurn: { guestNoop: true }, // AI는 호스트에서만
  initGame: { guestNoop: true },
  resetGame: { guestNoop: true },
};

/** 게스트 → 호스트 intent 전송 콜백 */
export type SendIntent = (type: string, payload: GameIntentPayload) => void;

let patchedOriginals: Record<string, unknown> | null = null;

/** 프록시 함수 식별 마커 — HMR로 모듈 인스턴스가 갈려도 프록시 위에 프록시가 안 씌워지게 */
const PROXY_FLAG = '__aosIntentProxy';

/** 게스트 가드 설치: 커밋 액션을 intent 프록시로 교체 */
export function installGuestGuard(send: SendIntent): void {
  if (patchedOriginals) return;
  const state = useGameStore.getState() as unknown as Record<string, unknown>;
  const originals: Record<string, unknown> = {};
  const patch: Record<string, unknown> = {};

  for (const [name, spec] of Object.entries(INTENT_SPECS)) {
    const original = state[name];
    if (typeof original !== 'function') continue;
    if ((original as unknown as Record<string, unknown>)[PROXY_FLAG]) {
      console.warn(`[net] 가드 중복 설치 감지 — ${name}은 이미 프록시 (건너뜀)`);
      continue;
    }
    originals[name] = original;
    patch[name] = (...args: unknown[]) => {
      if (spec.guestNoop) return true;
      const payload: GameIntentPayload = { args };
      if (spec.captureUi) {
        const ui = (useGameStore.getState() as unknown as { ui: Record<string, unknown> }).ui;
        payload.ui = Object.fromEntries(spec.captureUi.map((k) => [k, ui[k]]));
      }
      send(name, payload);
      // 낙관 반환 — 실제 반영은 호스트 스냅샷으로 도착.
      // true를 돌려줘야 UI 플로우(빌드 모드 초기화 등)가 정상 진행된다.
      return true;
    };
    (patch[name] as unknown as Record<string, unknown>)[PROXY_FLAG] = true;
  }

  patchedOriginals = originals;
  useGameStore.setState(patch as never);
}

/** 게스트 가드 해제: 원본 액션 복원 */
export function removeGuestGuard(): void {
  if (!patchedOriginals) return;
  useGameStore.setState(patchedOriginals as never);
  patchedOriginals = null;
}

export function isGuestGuardInstalled(): boolean {
  return patchedOriginals !== null;
}

/**
 * 차례 검증을 건너뛰는 액션 (자체 검증이 있거나 차례 개념이 다름).
 * 경매 입찰(placeBid/passBid/skipBid)도 currentPlayer 검증을 그대로 쓴다 —
 * 입찰 차례는 store의 currentPlayer가 관리하고 auction.currentBidder는 갱신되지 않는
 * 레거시 필드다 (AuctionPanel.tsx:39 주석 참조. 실측: 이 필드로 검증하면 정상 입찰이 거부됨).
 */
const TURN_CHECK_EXEMPT = new Set(['respondTurnOrderOffer']);

/**
 * 호스트: 게스트 intent 검증 + 기존 store 액션 재실행.
 * 검증 원칙 — ① playerId 인자는 좌석 주인으로 강제, ② 그 외 액션은 좌석 주인이
 * 현재 차례(경매 중엔 현재 입찰자)여야 실행. 세부 규칙 검증(canBuildTrack, 경매 금액 등)은
 * 기존 액션 내부 검증이 그대로 담당한다 — 추가 룰 코드 없음.
 */
export function applyGameIntent(msg: IntentMessage): { ok: boolean; reason?: string } {
  const spec = INTENT_SPECS[msg.type];
  if (!spec || spec.guestNoop) {
    return { ok: false, reason: `허용되지 않은 인텐트: ${msg.type}` };
  }

  const store = useGameStore.getState();
  const seatPlayer = store.activePlayers[msg.seat];
  if (!seatPlayer) return { ok: false, reason: `좌석 ${msg.seat}에 플레이어 없음` };

  const payload = (msg.payload ?? {}) as GameIntentPayload;
  const args = [...(payload.args ?? [])];

  if (spec.playerIdArg !== undefined) {
    args[spec.playerIdArg] = seatPlayer; // 좌석 주인 강제 — 남 대신 행동 불가
  }

  // 차례 검증 (경매 입찰 차례 포함 — currentPlayer가 단일 진실)
  if (!TURN_CHECK_EXEMPT.has(msg.type) && store.currentPlayer !== seatPlayer) {
    return { ok: false, reason: `차례 아님 (${seatPlayer} ≠ ${store.currentPlayer})` };
  }

  // AuctionPanel의 raw setState 재현: Turn Order 패스는 플래그를 먼저 세운다
  if (msg.type === 'skipBid') {
    useGameStore.setState((s) => ({
      players: {
        ...s.players,
        [seatPlayer]: { ...s.players[seatPlayer], turnOrderPassUsed: true },
      },
    }));
  }

  // 게스트 로컬 ui 선택값 주입 (placeNewCity의 selectedNewCityTile 등)
  if (payload.ui) {
    useGameStore.setState((s) => ({ ui: { ...s.ui, ...payload.ui } }) as never);
  }

  try {
    const fn = (useGameStore.getState() as unknown as Record<string, (...a: unknown[]) => unknown>)[
      msg.type
    ];
    const result = fn(...args);
    if (result === false) return { ok: false, reason: `액션 거부됨: ${msg.type}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `실행 오류: ${e instanceof Error ? e.message : String(e)}` };
  }
}
