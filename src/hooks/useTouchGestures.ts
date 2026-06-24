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
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: (e: React.MouseEvent) => void;
  isMousePanning: () => boolean;
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
  /** 콘텐츠(보드) 크기 — 팬 이동 범위를 제한해 확대 시에도 화면 밖으로 안 나가게 한다. (viewBox 좌표 단위) */
  contentWidth?: number;
  contentHeight?: number;
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
    contentWidth = 0,
    contentHeight = 0,
    onScaleChange,
    onPositionChange,
  } = options;

  /**
   * 팬 위치를 보드가 화면 밖으로 나가지 않는 범위로 제한.
   * 중심 스케일 기준 여유 = 크기*(scale-1)/2. scale<=1이면 이동 불가(0).
   */
  const clampPosition = useCallback(
    (pos: { x: number; y: number }, sc: number) => {
      const maxX = Math.max(0, (contentWidth * (sc - 1)) / 2);
      const maxY = Math.max(0, (contentHeight * (sc - 1)) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, pos.x)),
        y: Math.min(maxY, Math.max(-maxY, pos.y)),
      };
    },
    [contentWidth, contentHeight]
  );

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

  // 마우스 드래그(팬) 상태 ref
  const mouseStateRef = useRef({
    isPanning: false,
    moved: false, // 임계값 이상 움직였는지 (클릭과 구분)
    startPos: { x: 0, y: 0 },
    initialPosition: { x: 0, y: 0 },
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

      const newPosition = clampPosition({
        x: touchStateRef.current.initialPosition.x + deltaX,
        y: touchStateRef.current.initialPosition.y + deltaY,
      }, scale);

      setPosition(newPosition);
      if (onPositionChange) {
        onPositionChange(newPosition);
      }
    }
  }, [minScale, maxScale, getDistance, onScaleChange, onPositionChange, clampPosition, scale]);

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
   * 마우스 드래그 시작 (데스크톱 팬). 좌클릭만.
   */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // 새 누름마다 직전 드래그 흔적 초기화 — 확대 중 드래그 후 축소(scale<=1)했을 때
    // moved가 남아 다음 클릭이 isMousePanning()에 먹히는 버그 방지 (early-return 전에 비움).
    mouseStateRef.current.moved = false;
    if (scale <= 1) return; // 확대(+ 버튼) 상태에서만 드래그로 이동 — 기본 배율에선 클릭 동작 보존
    mouseStateRef.current.isPanning = true;
    mouseStateRef.current.startPos = { x: e.clientX, y: e.clientY };
    mouseStateRef.current.initialPosition = { ...position };
  }, [position, scale]);

  /**
   * 마우스 드래그 이동 (데스크톱 팬)
   */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mouseStateRef.current.isPanning) return;
    const deltaX = e.clientX - mouseStateRef.current.startPos.x;
    const deltaY = e.clientY - mouseStateRef.current.startPos.y;
    // 3px 이상 움직이면 드래그로 간주 (작은 흔들림은 클릭 유지)
    if (!mouseStateRef.current.moved && Math.hypot(deltaX, deltaY) > 3) {
      mouseStateRef.current.moved = true;
    }
    if (!mouseStateRef.current.moved) return;
    const newPosition = clampPosition({
      x: mouseStateRef.current.initialPosition.x + deltaX,
      y: mouseStateRef.current.initialPosition.y + deltaY,
    }, scale);
    setPosition(newPosition);
    if (onPositionChange) {
      onPositionChange(newPosition);
    }
  }, [onPositionChange, clampPosition, scale]);

  /**
   * 마우스 드래그 종료 (데스크톱 팬)
   */
  const handleMouseUp = useCallback(() => {
    mouseStateRef.current.isPanning = false;
  }, []);

  /**
   * 직전 마우스 상호작용이 드래그(팬)였는지 — 드래그 후 헥스 클릭 억제용
   */
  const isMousePanning = useCallback(() => mouseStateRef.current.moved, []);

  /**
   * 확대 (Zoom In) - 0.2 단계씩 증가
   */
  const zoomIn = useCallback(() => {
    setScale((prevScale) => {
      const newScale = Math.min(maxScale, prevScale + 0.2);
      setPosition((p) => clampPosition(p, newScale));
      if (onScaleChange) {
        onScaleChange(newScale);
      }
      return newScale;
    });
  }, [maxScale, onScaleChange, clampPosition]);

  /**
   * 축소 (Zoom Out) - 0.2 단계씩 감소
   */
  const zoomOut = useCallback(() => {
    setScale((prevScale) => {
      const newScale = Math.max(minScale, prevScale - 0.2);
      setPosition((p) => clampPosition(p, newScale));
      if (onScaleChange) {
        onScaleChange(newScale);
      }
      return newScale;
    });
  }, [minScale, onScaleChange, clampPosition]);

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
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    isMousePanning,
    zoomIn,
    zoomOut,
    resetZoom,
  };
}
