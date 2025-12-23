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
}

// 기본 설정: 모두 꺼짐 (필요한 것만 켜서 사용)
const defaultConfig: DebugConfig = {
    preparation: false,
    trackBuilding: true,  // 현재 디버깅 중이므로 기본 활성화
    goodsMovement: false,
    turnEnd: false,
    verbose: false,  // 기본적으로 꺼짐 (매우 빈번한 로그)
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
        console.log('\n사용법: setDebug("trackBuilding", true) 또는 setDebug("trackBuilding", false)');
    };

    // 모든 로그 켜기/끄기
    (window as unknown as Record<string, unknown>).setAllDebug = (enabled: boolean) => {
        debugConfig.preparation = enabled;
        debugConfig.trackBuilding = enabled;
        debugConfig.goodsMovement = enabled;
        debugConfig.turnEnd = enabled;
        debugConfig.verbose = enabled;
        console.log(`[DEBUG] 모든 로그: ${enabled ? 'ON' : 'OFF'}`);
    };
}

// 카테고리별 로그 함수
export const debugLog = {
    preparation: (message: string, ...args: unknown[]) => {
        if (debugConfig.preparation) {
            console.log(message, ...args);
        }
    },
    trackBuilding: (message: string, ...args: unknown[]) => {
        if (debugConfig.trackBuilding) {
            console.log(message, ...args);
        }
    },
    goodsMovement: (message: string, ...args: unknown[]) => {
        if (debugConfig.goodsMovement) {
            console.log(message, ...args);
        }
    },
    turnEnd: (message: string, ...args: unknown[]) => {
        if (debugConfig.turnEnd) {
            console.log(message, ...args);
        }
    },
    verbose: (message: string, ...args: unknown[]) => {
        if (debugConfig.verbose) {
            console.log(message, ...args);
        }
    },
};

// 설정 가져오기
export const getDebugConfig = () => debugConfig;

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
