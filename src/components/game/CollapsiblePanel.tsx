'use client';

import { useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CollapsiblePanelProps {
  /** Content to display inside the panel */
  children: ReactNode;
  /** Initial state of the panel (default: expanded) */
  defaultExpanded?: boolean;
  /** Callback when expanded state changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Width when collapsed (default: '64px') */
  collapsedWidth?: string;
  /** Width when expanded (default: '320px') */
  expandedWidth?: string;
  /** Position of the panel (default: 'right') */
  position?: 'left' | 'right';
}

/**
 * CollapsiblePanel component for tablet sidebar
 *
 * @description
 * A collapsible sidebar panel component that slides in/out from the side of the screen.
 * Features:
 * - Collapsed/expanded states
 * - Toggle button with chevron icon
 * - Smooth width animations with Framer Motion
 * - Glass morphism styling
 * - Supports left or right positioning
 *
 * @example
 * ```tsx
 * <CollapsiblePanel defaultExpanded={true} position="right">
 *   <div>Your content here</div>
 * </CollapsiblePanel>
 * ```
 */
export default function CollapsiblePanel({
  children,
  defaultExpanded = true,
  onExpandedChange,
  collapsedWidth = '64px',
  expandedWidth = '320px',
  position = 'right',
}: CollapsiblePanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Toggle expanded/collapsed state
  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const newState = !prev;
      onExpandedChange?.(newState);
      return newState;
    });
  }, [onExpandedChange]);

  return (
    <motion.div
      initial={{ width: defaultExpanded ? expandedWidth : collapsedWidth }}
      animate={{
        width: isExpanded ? expandedWidth : collapsedWidth,
      }}
      transition={{
        type: 'spring',
        damping: 30,
        stiffness: 300,
      }}
      className="relative h-full glass-card overflow-hidden"
      style={{
        willChange: 'width',
        borderTopLeftRadius: position === 'right' ? '1rem' : 0,
        borderBottomLeftRadius: position === 'right' ? '1rem' : 0,
        borderTopRightRadius: position === 'left' ? '1rem' : 0,
        borderBottomRightRadius: position === 'left' ? '1rem' : 0,
      }}
    >
      {/* Toggle Button */}
      <button
        onClick={toggleExpanded}
        className={`absolute top-4 ${
          position === 'right' ? 'left-4' : 'right-4'
        } z-10 p-2 rounded-lg bg-background-secondary/80 hover:bg-background-tertiary/80 transition-colors shadow-lg`}
        aria-label={isExpanded ? 'Collapse panel' : 'Expand panel'}
      >
        {isExpanded ? (
          position === 'right' ? (
            <ChevronRight className="w-5 h-5 text-foreground-secondary" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-foreground-secondary" />
          )
        ) : position === 'right' ? (
          <ChevronLeft className="w-5 h-5 text-foreground-secondary" />
        ) : (
          <ChevronRight className="w-5 h-5 text-foreground-secondary" />
        )}
      </button>

      {/* Content Container */}
      <AnimatePresence mode="wait">
        {isExpanded ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, x: position === 'right' ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: position === 'right' ? 20 : -20 }}
            transition={{ duration: 0.2 }}
            className="h-full pt-14 px-4 pb-4 overflow-y-auto"
            style={{
              overscrollBehavior: 'contain',
            }}
          >
            {children}
          </motion.div>
        ) : (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full pt-14 flex flex-col items-center gap-4"
          >
            {/* Collapsed state: could show icons or minimal info */}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
