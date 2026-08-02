'use client';

import { useState, useCallback, ReactNode } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface BottomSheetProps {
  /** Content to display inside the bottom sheet */
  children: ReactNode;
  /** Initial state of the sheet (default: collapsed) — uncontrolled 모드에서만 쓰인다 */
  defaultExpanded?: boolean;
  /**
   * 펼침 상태를 밖에서 쥐고 싶을 때 (controlled). 주면 이 값이 표시 상태가 되고,
   * 드래그·탭 조작은 `onExpandedChange`로 부모에게 넘어간다 — 부모가 그 값을 반영하면
   * **사용자 조작은 그대로 살아 있고**, 부모가 원할 때(단계 전환 등)만 값을 바꿔 제안할 수 있다.
   * 즉 "자동 조절하되 고정하지는 않는" 동작이 이 prop으로 구현된다.
   */
  expanded?: boolean;
  /** Callback when expanded state changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Height when collapsed (default: '30%') */
  collapsedHeight?: string;
  /** Height when expanded (default: '70%') */
  expandedHeight?: string;
}

/**
 * BottomSheet component for mobile controls
 *
 * @description
 * A draggable bottom sheet component that slides up from the bottom of the screen.
 * Features:
 * - Collapsed/expanded states
 * - Drag handle for touch interaction
 * - Smooth 60fps animations with Framer Motion
 * - GPU-accelerated transforms
 * - Glass morphism styling
 *
 * @example
 * ```tsx
 * <BottomSheet defaultExpanded={false}>
 *   <div>Your content here</div>
 * </BottomSheet>
 * ```
 */
export default function BottomSheet({
  children,
  defaultExpanded = false,
  expanded,
  onExpandedChange,
  collapsedHeight = '30%',
  expandedHeight = '70%',
}: BottomSheetProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  // expanded를 주면 controlled — 표시 상태는 부모 값을 따른다
  const isControlled = expanded !== undefined;
  const isExpanded = isControlled ? expanded : internalExpanded;

  /** 사용자 조작으로 상태를 바꾼다 (controlled면 부모에게 위임) */
  const setExpandedByUser = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalExpanded(next);
      onExpandedChange?.(next);
    },
    [isControlled, onExpandedChange]
  );

  // Toggle expanded/collapsed state
  const toggleExpanded = useCallback(() => {
    setExpandedByUser(!isExpanded);
  }, [isExpanded, setExpandedByUser]);

  // Handle drag end to determine if we should toggle
  // Optimized for 60fps with reduced threshold for better responsiveness
  const handleDragEnd = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const threshold = 40; // Reduced for better responsiveness
      const velocity = info.velocity.y;

      // If dragged up significantly or fast upward velocity, expand
      if (info.offset.y < -threshold || velocity < -400) {
        if (!isExpanded) setExpandedByUser(true);
      }
      // If dragged down significantly or fast downward velocity, collapse
      else if (info.offset.y > threshold || velocity > 400) {
        if (isExpanded) setExpandedByUser(false);
      }
    },
    [isExpanded, setExpandedByUser]
  );

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{
        y: 0,
        height: isExpanded ? expandedHeight : collapsedHeight,
      }}
      transition={{
        type: 'spring',
        damping: 25, // Reduced for smoother motion
        stiffness: 250, // Reduced for smoother motion
        mass: 0.8, // Lower mass for snappier feel
      }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.15} // Reduced for tighter control
      dragTransition={{
        bounceStiffness: 400,
        bounceDamping: 40,
      }}
      onDragEnd={handleDragEnd}
      className="fixed bottom-0 left-0 right-0 z-40 glass-card shadow-2xl"
      style={{
        borderTopLeftRadius: '1.5rem',
        borderTopRightRadius: '1.5rem',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        willChange: 'transform, height',
        transform: 'translateZ(0)', // GPU acceleration
        contain: 'layout style paint', // Performance optimization
      }}
    >
      {/* Drag Handle */}
      <button
        onClick={toggleExpanded}
        className="w-full py-3 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        aria-label={isExpanded ? 'Collapse bottom sheet' : 'Expand bottom sheet'}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <div className="w-12 h-1.5 bg-foreground-secondary/40 rounded-full mb-2" />
        <motion.div
          initial={false}
          animate={{ rotate: isExpanded ? 0 : 180 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-foreground-secondary" />
          ) : (
            <ChevronUp className="w-5 h-5 text-foreground-secondary" />
          )}
        </motion.div>
      </button>

      {/* Content Container */}
      <div
        className="px-4 pb-4 overflow-y-auto"
        style={{
          height: 'calc(100% - 56px)', // Subtract handle height
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch', // Smooth iOS scrolling
          transform: 'translateZ(0)', // GPU acceleration for scrolling
        }}
      >
        <motion.div
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
}
