/**
 * 디버그 로그 설정
 * 브라우저 콘솔에서 window.DEBUG_CONFIG로 접근 가능
 */

export interface DebugConfig {
    // 준비 단계 로그 (issueShares, auction, selectActions)
    preparation: boolean;
    // 트랙 건설 로그 (buildTrack)
    trackBuilding: boolean;
    // 물품 운송 로그 (moveGoods)
    goodsMovement: boolean;
    // 정산 및 턴 종료 로그 (collectIncome, payExpenses, incomeReduction, goodsGrowth, advanceTurn)
    turnEnd: boolean;
    // 로우레벨/상세 디버그 로그 (경로 탐색, 연결 확인, isRouteComplete 등)
    verbose: boolean;
    // AI 평가 로그 (트랙 점수 계산, 전략 평가 등)
    aiEvaluation: boolean;
}

// 기본 설정: 필요한 것만 켜서 사용
const defaultConfig: DebugConfig = {
    preparation: false,
    trackBuilding: true,  // 현재 디버깅 중이므로 기본 활성화
    goodsMovement: false,
    turnEnd: false,
    verbose: false,       // 저수준 로그는 기본 비활성화
    aiEvaluation: true,   // AI 평가 로그 기본 활성화
};

// 전역 설정 객체
let debugConfig: DebugConfig = { ...defaultConfig };

// 브라우저 환경에서 window 객체에 노출
if (typeof window !== 'undefined') {
    (window as unknown as { DEBUG_CONFIG: DebugConfig }).DEBUG_CONFIG = debugConfig;

    // 콘솔에서 쉽게 설정할 수 있는 헬퍼 함수들
    (window as unknown as Record<string, unknown>).setDebug = (category: keyof DebugConfig, enabled: boolean) => {
        debugConfig[category] = enabled;
        console.log(`[DEBUG] ${category} 로그: ${enabled ? 'ON' : 'OFF'}`);
    };

    (window as unknown as Record<string, unknown>).showDebugConfig = () => {
        console.log('[DEBUG 설정 현황]');
        console.log(`  preparation (준비 단계): ${debugConfig.preparation ? 'ON' : 'OFF'}`);
        console.log(`  trackBuilding (트랙 건설): ${debugConfig.trackBuilding ? 'ON' : 'OFF'}`);
        console.log(`  goodsMovement (물품 운송): ${debugConfig.goodsMovement ? 'ON' : 'OFF'}`);
        console.log(`  turnEnd (정산/턴 종료): ${debugConfig.turnEnd ? 'ON' : 'OFF'}`);
        console.log(`  verbose (상세/경로 탐색): ${debugConfig.verbose ? 'ON' : 'OFF'}`);
        console.log(`  aiEvaluation (AI 평가): ${debugConfig.aiEvaluation ? 'ON' : 'OFF'}`);
        console.log('\n사용법: setDebug("trackBuilding", true) 또는 setDebug("aiEvaluation", false)');
    };

    // 모든 로그 켜기/끄기
    (window as unknown as Record<string, unknown>).setAllDebug = (enabled: boolean) => {
        debugConfig.preparation = enabled;
        debugConfig.trackBuilding = enabled;
        debugConfig.goodsMovement = enabled;
        debugConfig.turnEnd = enabled;
        debugConfig.verbose = enabled;
        debugConfig.aiEvaluation = enabled;
        console.log(`[DEBUG] 모든 로그: ${enabled ? 'ON' : 'OFF'}`);
    };
}

// 카테고리별 로그 함수 (prefix 포함)
export const debugLog = {
    preparation: (message: string, ...args: unknown[]) => {
        if (debugConfig.preparation) {
            console.log(`[준비] ${message}`, ...args);
        }
    },
    trackBuilding: (message: string, ...args: unknown[]) => {
        if (debugConfig.trackBuilding) {
            console.log(`[트랙] ${message}`, ...args);
        }
    },
    goodsMovement: (message: string, ...args: unknown[]) => {
        if (debugConfig.goodsMovement) {
            console.log(`[운송] ${message}`, ...args);
        }
    },
    turnEnd: (message: string, ...args: unknown[]) => {
        if (debugConfig.turnEnd) {
            console.log(`[정산] ${message}`, ...args);
        }
    },
    verbose: (message: string, ...args: unknown[]) => {
        if (debugConfig.verbose) {
            console.log(`[상세] ${message}`, ...args);
        }
    },
    aiEvaluation: (message: string, ...args: unknown[]) => {
        if (debugConfig.aiEvaluation) {
            console.log(`[AI평가] ${message}`, ...args);
        }
    },
};

// 설정 가져오기
export const getDebugConfig = () => debugConfig;

// ──────────────────────────────────────────────────────────────────────────
// 종합 액션 로깅 (게임별 세션ID + 구조화 JSON + 레벨)
// ──────────────────────────────────────────────────────────────────────────
// 모든 게임 액션을 한 곳(logAction)에서 일관되게 기록한다.
// ★ 액션 로깅은 디버그 토글과 무관하게 항상 출력된다 (사용자의 모든 액션을 빠짐없이 추적하는 게 목적).
//   category는 끄는 스위치가 아니라 :3999에서 필터링할 분류 라벨("c":...)일 뿐이다.
// 출력: `[game:<sessionId>] {"t":"buildTrack","c":"trackBuilding","player":"player1",...}` (한 줄 JSON)
// GamePageClient의 콘솔 미러가 이 줄을 :3999로 전송 → 로그만으로 게임 진행 추적/오류 확인.
// 여러 게임이 섞여도 sessionId prefix로 구분된다.

// 액션 → 카테고리 라벨 매핑 (출력 여부와 무관 — :3999 grep `"c":"preparation"` 등으로 필터용)
//   preparation : issueShare, placeBid, passBid, skipBid, selectAction
//   trackBuilding: buildTrack, buildComplexTrack, redirectTrack, buildTownSpur, placeNewCity
//   goodsMovement: selectCube, moveTrackCube, completeCubeMove, upgradeEngine
//   turnEnd      : nextPhase
export type LogCategory = keyof Pick<
    DebugConfig,
    'preparation' | 'trackBuilding' | 'goodsMovement' | 'turnEnd'
>;

let logSessionId = '';

/** 게임 시작/리셋 시 새 세션ID 부여 (여러 게임 구분용). */
export const setLogSession = (id: string) => { logSessionId = id; };
export const getLogSession = () => logSessionId;

/** 짧은 게임 세션ID 생성 (예: "a3f9"). */
export const newLogSession = (): string => {
    const id = Math.random().toString(36).slice(2, 6);
    logSessionId = id;
    return id;
};

/**
 * 게임 액션 1건을 구조화 JSON 한 줄로 기록한다. ★ 토글과 무관하게 항상 출력된다.
 * @param category 분류 라벨 (record의 "c" 필드 — 출력 여부에 영향 없음, :3999 필터용)
 * @param type     액션 이름 (buildTrack, selectCube, nextPhase, ...)
 * @param payload  구조화 데이터 (player, turn, coord, cost 등)
 * @param level    'error'면 console.error로 출력 (오류만 추출 가능)
 */
export const logAction = (
    category: LogCategory,
    type: string,
    payload: Record<string, unknown> = {},
    level: 'info' | 'error' = 'info',
) => {
    const record = { t: type, c: category, ...payload };
    const prefix = `[game:${logSessionId || '?'}]`;
    if (level === 'error') console.error(prefix, JSON.stringify(record));
    else console.log(prefix, JSON.stringify(record));
};

// 상태 변경 리스너 (React 훅에서 사용)
type DebugConfigListener = (config: DebugConfig) => void;
const listeners: Set<DebugConfigListener> = new Set();

export const subscribeDebugConfig = (listener: DebugConfigListener): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

// 설정 업데이트 (UI에서 사용)
export const updateDebugConfig = (config: Partial<DebugConfig>) => {
    debugConfig = { ...debugConfig, ...config };
    listeners.forEach(listener => listener(debugConfig));
};

// 개별 카테고리 토글
export const toggleDebugCategory = (category: keyof DebugConfig) => {
    debugConfig[category] = !debugConfig[category];
    listeners.forEach(listener => listener(debugConfig));
};
