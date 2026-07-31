'use client';

import { useReducedMotion } from 'framer-motion';

/**
 * 진입 애니메이션 프리셋 — OS "모션 최소화"(prefers-reduced-motion) 설정을 존중한다.
 *
 * 쇼케이스 페이지의 페이드/슬라이드 진입은 전정기관이 민감한 사용자에게 불편을 주므로,
 * 모션 최소화가 켜져 있으면 **최종 상태로 즉시 렌더**한다(콘텐츠는 그대로 보임).
 *
 * CSS 쪽 장식 애니메이션(.rail-dash, animate-float 등)은 globals.css의
 * `@media (prefers-reduced-motion: reduce)` 블록이 담당한다.
 *
 * ⚠️ 게임 화면(src/components/game/**)의 애니메이션은 화물 이동·정산 결과를 전달하는
 * 기능성 연출이라 이 훅의 대상이 아니다.
 *
 * @example
 * const { enter } = useEnterMotion();
 * <motion.div {...enter({ y: 16, delay: i * 0.05 })} />
 *
 * // useInView와 함께 (뷰포트 진입 시 재생)
 * <motion.div {...enter({ y: 20, delay: i * 0.08, inView: isInView })} />
 */
export type EnterOptions = {
  /** 시작 y 오프셋(px). 0이면 페이드만 */
  y?: number;
  /** 시작 scale. 지정하면 scale 애니메이션 포함 */
  scale?: number;
  duration?: number;
  delay?: number;
  ease?: 'easeOut' | 'easeIn' | 'easeInOut' | 'linear';
  /**
   * useInView 등으로 재생 시점을 제어할 때 전달.
   * false면 아직 숨김 상태를 유지한다(생략 시 즉시 재생).
   */
  inView?: boolean;
};

export function useEnterMotion() {
  const reduce = useReducedMotion();

  const enter = (opts: EnterOptions = {}) => {
    const { y = 0, scale, duration = 0.45, delay = 0, ease, inView } = opts;

    const shown = {
      opacity: 1,
      ...(y ? { y: 0 } : {}),
      ...(scale !== undefined ? { scale: 1 } : {}),
    };

    // 모션 최소화 — 초기 애니메이션을 건너뛰고 최종 상태로 바로 표시
    if (reduce) {
      return { initial: false as const, animate: shown, transition: { duration: 0 } };
    }

    const hidden = {
      opacity: 0,
      ...(y ? { y } : {}),
      ...(scale !== undefined ? { scale } : {}),
    };

    return {
      initial: hidden,
      animate: inView === false ? {} : shown,
      transition: { duration, delay, ...(ease ? { ease } : {}) },
    };
  };

  /** exit 애니메이션이 있는 곳(AnimatePresence)에서 직접 분기할 때 사용 */
  return { enter, reduce: Boolean(reduce) };
}
