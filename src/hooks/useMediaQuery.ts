'use client';

import { useState, useEffect } from 'react';

/**
 * useMediaQuery hook for responsive breakpoint detection
 *
 * @param query - CSS media query string (e.g., '(min-width: 768px)')
 * @returns boolean indicating if the media query matches
 *
 * @example
 * ```tsx
 * const isMobile = useMediaQuery('(max-width: 767px)');
 * const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
 * const isDesktop = useMediaQuery('(min-width: 1024px)');
 * ```
 */
export function useMediaQuery(query: string): boolean {
  // SSR 안전: 초기값은 false (서버 렌더링 시 매치되지 않음)
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    // window.matchMedia가 존재하지 않으면 early return (SSR)
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia(query);

    // 초기 상태 설정
    setMatches(mediaQuery.matches);

    // 미디어 쿼리 변경 감지
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // 이벤트 리스너 등록
    mediaQuery.addEventListener('change', handleChange);

    // 클린업
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [query]);

  return matches;
}
