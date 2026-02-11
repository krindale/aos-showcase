'use client';

import { useState, useCallback, useRef } from 'react';

/**
 * Touch gesture state
 */
export interface TouchGestureState {
  scale: number;
  position: { x: number; y: number };
}

/**
 * Touch gesture handlers
 */
export interface TouchGestureHandlers {
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

/**
 * Touch gesture options
 */
export interface TouchGestureOptions {
  minScale?: number;
  maxScale?: number;
  onScaleChange?: (scale: number) => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
}

/**
 * useTouchGestures hook for pinch zoom and pan detection
 *
 * @param options - Configuration options for touch gestures
 * @returns Touch gesture state and handlers
 *
 * @example
 * ```tsx
 * const { scale, position, handleTouchStart, handleTouchMove, handleTouchEnd } = useTouchGestures({
 *   minScale: 0.5,
 *   maxScale: 3.0,
 * });
 *
 * return (
 *   <div
 *     onTouchStart={handleTouchStart}
 *     onTouchMove={handleTouchMove}
 *     onTouchEnd={handleTouchEnd}
 *     style={{
 *       transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
 *     }}
 *   >
 *     {content}
 *   </div>
 * );
 * ```
 */
export function useTouchGestures(
  options: TouchGestureOptions = {}
): TouchGestureState & TouchGestureHandlers {
  const {
    minScale = 0.5,
    maxScale = 3.0,
    onScaleChange,
    onPositionChange,
  } = options;

  // 현재 상태
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // 터치 상태를 추적하기 위한 ref
  const touchStateRef = useRef({
    initialDistance: 0,
    initialScale: 1,
    initialPosition: { x: 0, y: 0 },
    lastTouchPosition: { x: 0, y: 0 },
    isPinching: false,
    isPanning: false,
  });

  /**
   * 두 터치 포인트 사이의 거리 계산
   */
  const getDistance = useCallback((touch1: React.Touch, touch2: React.Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  /**
   * 터치 시작 핸들러
   */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touches = e.touches;

    if (touches.length === 2) {
      // 핀치 줌 시작
      e.preventDefault();
      touchStateRef.current.isPinching = true;
      touchStateRef.current.isPanning = false;
      touchStateRef.current.initialDistance = getDistance(touches[0], touches[1]);
      touchStateRef.current.initialScale = scale;
    } else if (touches.length === 1) {
      // 팬 시작
      touchStateRef.current.isPanning = true;
      touchStateRef.current.isPinching = false;
      touchStateRef.current.lastTouchPosition = {
        x: touches[0].clientX,
        y: touches[0].clientY,
      };
      touchStateRef.current.initialPosition = { ...position };
    }
  }, [scale, position, getDistance]);

  /**
   * 터치 이동 핸들러
   */
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touches = e.touches;

    if (touches.length === 2 && touchStateRef.current.isPinching) {
      // 핀치 줌
      e.preventDefault();
      const currentDistance = getDistance(touches[0], touches[1]);
      const scaleChange = currentDistance / touchStateRef.current.initialDistance;
      const newScale = Math.max(
        minScale,
        Math.min(maxScale, touchStateRef.current.initialScale * scaleChange)
      );

      setScale(newScale);
      if (onScaleChange) {
        onScaleChange(newScale);
      }
    } else if (touches.length === 1 && touchStateRef.current.isPanning) {
      // 팬
      e.preventDefault();
      const deltaX = touches[0].clientX - touchStateRef.current.lastTouchPosition.x;
      const deltaY = touches[0].clientY - touchStateRef.current.lastTouchPosition.y;

      const newPosition = {
        x: touchStateRef.current.initialPosition.x + deltaX,
        y: touchStateRef.current.initialPosition.y + deltaY,
      };

      setPosition(newPosition);
      if (onPositionChange) {
        onPositionChange(newPosition);
      }
    }
  }, [minScale, maxScale, getDistance, onScaleChange, onPositionChange]);

  /**
   * 터치 종료 핸들러
   */
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const touches = e.touches;

    if (touches.length < 2) {
      touchStateRef.current.isPinching = false;
    }

    if (touches.length === 0) {
      touchStateRef.current.isPanning = false;
    }
  }, []);

  /**
   * 확대 (Zoom In) - 0.2 단계씩 증가
   */
  const zoomIn = useCallback(() => {
    setScale((prevScale) => {
      const newScale = Math.min(maxScale, prevScale + 0.2);
      if (onScaleChange) {
        onScaleChange(newScale);
      }
      return newScale;
    });
  }, [maxScale, onScaleChange]);

  /**
   * 축소 (Zoom Out) - 0.2 단계씩 감소
   */
  const zoomOut = useCallback(() => {
    setScale((prevScale) => {
      const newScale = Math.max(minScale, prevScale - 0.2);
      if (onScaleChange) {
        onScaleChange(newScale);
      }
      return newScale;
    });
  }, [minScale, onScaleChange]);

  /**
   * 줌 리셋 (Reset Zoom) - 1.0으로 복귀, 위치도 초기화
   */
  const resetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    if (onScaleChange) {
      onScaleChange(1);
    }
    if (onPositionChange) {
      onPositionChange({ x: 0, y: 0 });
    }
  }, [onScaleChange, onPositionChange]);

  return {
    scale,
    position,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    zoomIn,
    zoomOut,
    resetZoom,
  };
}
