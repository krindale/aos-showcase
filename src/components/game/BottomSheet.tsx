'use client';

import { useState, useCallback, ReactNode } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface BottomSheetProps {
  /** Content to display inside the bottom sheet */
  children: ReactNode;
  /** Initial state of the sheet (default: collapsed) */
  defaultExpanded?: boolean;
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
  onExpandedChange,
  collapsedHeight = '30%',
  expandedHeight = '70%',
}: BottomSheetProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Toggle expanded/collapsed state
  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const newState = !prev;
      onExpandedChange?.(newState);
      return newState;
    });
  }, [onExpandedChange]);

  // Handle drag end to determine if we should toggle
  // Optimized for 60fps with reduced threshold for better responsiveness
  const handleDragEnd = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const threshold = 40; // Reduced for better responsiveness
      const velocity = info.velocity.y;

      // If dragged up significantly or fast upward velocity, expand
      if (info.offset.y < -threshold || velocity < -400) {
        if (!isExpanded) {
          setIsExpanded(true);
          onExpandedChange?.(true);
        }
      }
      // If dragged down significantly or fast downward velocity, collapse
      else if (info.offset.y > threshold || velocity > 400) {
        if (isExpanded) {
          setIsExpanded(false);
          onExpandedChange?.(false);
        }
      }
    },
    [isExpanded, onExpandedChange]
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
