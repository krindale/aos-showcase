'use client';

import { useState, useEffect } from 'react';

/**
 * Orientation type
 */
export type Orientation = 'portrait' | 'landscape';

/**
 * useOrientation hook for portrait/landscape detection
 *
 * @returns Current device orientation ('portrait' or 'landscape')
 *
 * @example
 * ```tsx
 * const orientation = useOrientation();
 *
 * if (orientation === 'portrait') {
 *   // Render portrait layout
 * } else {
 *   // Render landscape layout
 * }
 * ```
 */
export function useOrientation(): Orientation | undefined {
  // SSR 안전: 초기값은 undefined (서버 렌더링 시 알 수 없음)
  const [orientation, setOrientation] = useState<Orientation | undefined>(undefined);

  useEffect(() => {
    // window.matchMedia가 존재하지 않으면 early return (SSR)
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const portraitQuery = window.matchMedia('(orientation: portrait)');

    // 현재 orientation 업데이트
    const updateOrientation = () => {
      setOrientation(portraitQuery.matches ? 'portrait' : 'landscape');
    };

    // 초기 상태 설정
    updateOrientation();

    // 미디어 쿼리 변경 감지
    const handleChange = () => {
      updateOrientation();
    };

    // 이벤트 리스너 등록
    portraitQuery.addEventListener('change', handleChange);

    // 클린업
    return () => {
      portraitQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return orientation;
}
