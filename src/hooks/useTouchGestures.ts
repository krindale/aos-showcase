'use client';

import { useState, useCallback, useRef, useEffect, RefObject } from 'react';

/**
 * Touch gesture state
 */
export interface TouchGestureState {
  scale: number;
  position: { x: number; y: number };
}

/** 좌표만 필요하므로 React.Touch / 네이티브 Touch 양쪽을 받는다 */
interface PointLike {
  clientX: number;
  clientY: number;
}

/**
 * 화면 픽셀 ↔ 콘텐츠 좌표 변환 정보.
 *
 * ⚠️ 이게 없으면 팬(드래그)이 "화면 픽셀 = 콘텐츠 1단위"로 계산된다. SVG 보드처럼
 * viewBox 단위와 화면 픽셀의 축척이 다르면(예: viewBox 폭 1500이 화면 360px에 렌더)
 * 손가락을 100px 끌어도 보드는 100 viewBox 단위 = 화면상 24px만 움직여 "엄청 드래그해도
 * 찔끔" 이동하게 된다. unitsPerPixel을 곱해야 손가락을 따라온다.
 */
export interface TransformMetrics {
  /** 화면 1px에 해당하는 콘텐츠 좌표 단위 (SVG면 1 / getScreenCTM().a) */
  unitsPerPixel: number;
  /** 스케일 기준점 (콘텐츠 좌표) — 렌더 쪽 transform의 scale 원점과 같아야 한다 */
  center: { x: number; y: number };
  /** 화면 좌표 → 콘텐츠 좌표(팬/스케일 적용 전 = viewBox 좌표) */
  toContent: (clientX: number, clientY: number) => { x: number; y: number };
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
  /** 직전 상호작용이 팬/핀치 제스처였는지 — 제스처 직후의 클릭을 무시하는 데 쓴다 */
  isPanGesture: () => boolean;
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
  /**
   * 확대(scale>1) 상태에서 "가장자리 딱 맞춤"을 넘어 더 끌 수 있는 여유 — 화면에 보이는
   * 보드 크기 대비 비율(0.3 = 30%). 0이면 예전처럼 가장자리에서 정확히 멈춘다.
   *
   * 여유가 없으면 보드 가장자리 헥스가 항상 화면 맨 끝에 붙어 있어, 패널·HUD에 가리거나
   * 손가락으로 짚기 어려운 위치에서 조작해야 한다. 여유를 주면 가장자리를 화면 안쪽으로
   * 끌어와서 다룰 수 있다.
   */
  overpanRatio?: number;
  /**
   * 제스처를 붙일 요소. 지정하면 touch 이벤트를 **non-passive로 직접 등록**한다.
   * ⚠️ React의 onTouchStart/onTouchMove는 passive 리스너로 붙어 `preventDefault()`가
   * 무시된다 — 그러면 두 손가락 제스처를 브라우저가 페이지 확대로 먹어버려 보드 핀치 줌이
   * 안 먹는 것처럼 보인다(특히 iOS Safari). 그래서 여기서 직접 등록한다.
   * 지정하면 React 핸들러(handleTouch*)는 붙이지 말 것 — 이중 처리된다.
   */
  targetRef?: RefObject<SVGSVGElement | HTMLElement | null>;
  /** 화면 픽셀 ↔ 콘텐츠 좌표 변환 정보 (없으면 1:1로 간주) */
  getMetrics?: () => TransformMetrics | null;
  onScaleChange?: (scale: number) => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
}

/**
 * useTouchGestures hook for pinch zoom and pan
 *
 * 렌더 쪽은 `translate(position) translate(center) scale(scale) translate(-center)`
 * 순서로 적용한다고 가정한다(= position은 스케일의 영향을 받지 않는 콘텐츠 좌표).
 */
export function useTouchGestures(
  options: TouchGestureOptions = {}
): TouchGestureState & TouchGestureHandlers {
  const {
    minScale = 0.5,
    maxScale = 3.0,
    contentWidth = 0,
    contentHeight = 0,
    overpanRatio = 0,
    targetRef,
    getMetrics,
    onScaleChange,
    onPositionChange,
  } = options;

  /**
   * 팬 위치를 보드가 화면 밖으로 나가지 않는 범위로 제한.
   * 중심 스케일 기준 여유 = 크기*(scale-1)/2. scale<=1이면 이동 불가(0).
   *
   * overpanRatio를 주면 확대 상태에 한해 그만큼 더 끌 수 있다. position은 스케일 밖에
   * 적용되는 콘텐츠 좌표라, "화면에 보이는 보드 크기의 r배"는 콘텐츠 단위로 크기*r*scale이다.
   */
  const clampPosition = useCallback(
    (pos: { x: number; y: number }, sc: number) => {
      const overpan = sc > 1 ? Math.max(0, overpanRatio) * sc : 0;
      const maxX = Math.max(0, (contentWidth * (sc - 1)) / 2) + contentWidth * overpan;
      const maxY = Math.max(0, (contentHeight * (sc - 1)) / 2) + contentHeight * overpan;
      return {
        x: Math.min(maxX, Math.max(-maxX, pos.x)),
        y: Math.min(maxY, Math.max(-maxY, pos.y)),
      };
    },
    [contentWidth, contentHeight, overpanRatio]
  );

  // 현재 상태
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // 핸들러가 항상 최신 값을 보도록 ref로 미러 (네이티브 리스너는 1회만 등록하므로
  // 클로저에 갇힌 옛 state를 보면 제스처가 매번 처음 값으로 되돌아간다)
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const positionRef = useRef(position);
  positionRef.current = position;

  const applyScale = useCallback(
    (next: number) => {
      scaleRef.current = next;
      setScale(next);
      onScaleChange?.(next);
    },
    [onScaleChange]
  );
  const applyPosition = useCallback(
    (next: { x: number; y: number }) => {
      positionRef.current = next;
      setPosition(next);
      onPositionChange?.(next);
    },
    [onPositionChange]
  );

  /**
   * 화면 픽셀 → 콘텐츠 단위 배율 (metrics가 없거나 값이 이상하면 1:1).
   * ⚠️ metrics 조회는 `getScreenCTM()`+`inverse()`라 레이아웃을 강제할 수 있다. touchmove는
   * 60fps로 들어오므로 **핸들러당 한 번만 조회해** 이 함수에 넘긴다(프레임당 2회 조회 금지).
   */
  const resolveUnitsPerPixel = useCallback(
    (m: TransformMetrics | null | undefined) =>
      m && Number.isFinite(m.unitsPerPixel) && m.unitsPerPixel > 0 ? m.unitsPerPixel : 1,
    []
  );

  // 터치 상태를 추적하기 위한 ref
  const touchStateRef = useRef({
    initialDistance: 0,
    initialScale: 1,
    initialPosition: { x: 0, y: 0 },
    /** 제스처 시작 지점(1손가락) 또는 두 손가락 중점 — 화면 좌표 */
    startPoint: { x: 0, y: 0 },
    /** 핀치 시작 시점의 중점을 콘텐츠 원좌표로 환산한 값 (줌 앵커) */
    pinchAnchor: null as { x: number; y: number } | null,
    isPinching: false,
    isPanning: false,
    moved: false,
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
  const getDistance = useCallback((a: PointLike, b: PointLike): number => {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  }, []);

  const getMidpoint = useCallback((a: PointLike, b: PointLike) => ({
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  }), []);

  /**
   * 한 손가락 팬 시작(또는 핀치 종료 후 재시작).
   * ⚠️ 축소/기본 배율(scale<=1)에선 팬을 시작하지 않는다 — 그 상태는 보드 전체가 화면에
   * 들어와 clampPosition이 이동을 0으로 묶으므로, 팬으로 인정하면 위치는 그대로면서
   * moved 플래그만 서서 "손가락이 살짝 밀린 탭"이 헥스 클릭으로 안 먹는 부작용만 남는다.
   * (마우스 드래그가 scale<=1에서 클릭을 보존하는 것과 같은 이유)
   */
  const beginTouchPan = useCallback((t: PointLike) => {
    if (scaleRef.current <= 1) {
      touchStateRef.current.isPanning = false;
      touchStateRef.current.isPinching = false;
      return;
    }
    touchStateRef.current.isPanning = true;
    touchStateRef.current.isPinching = false;
    touchStateRef.current.pinchAnchor = null;
    touchStateRef.current.startPoint = { x: t.clientX, y: t.clientY };
    touchStateRef.current.initialPosition = { ...positionRef.current };
  }, []);

  /** 두 손가락 핀치 시작 — 중점을 콘텐츠 원좌표로 환산해 줌 앵커로 삼는다 */
  const beginPinch = useCallback(
    (a: PointLike, b: PointLike) => {
      const st = touchStateRef.current;
      st.isPinching = true;
      st.isPanning = false;
      st.initialDistance = getDistance(a, b) || 1;
      st.initialScale = scaleRef.current;
      st.initialPosition = { ...positionRef.current };
      const mid = getMidpoint(a, b);
      st.startPoint = mid;

      // 화면 중점 → 콘텐츠 원좌표:
      //   렌더 변환이 p = pos + C + s*(a - C) 이므로 a = C + (p - pos - C) / s
      const m = getMetrics?.();
      if (m) {
        const p = m.toContent(mid.x, mid.y);
        const s = st.initialScale || 1;
        st.pinchAnchor = {
          x: m.center.x + (p.x - st.initialPosition.x - m.center.x) / s,
          y: m.center.y + (p.y - st.initialPosition.y - m.center.y) / s,
        };
      } else {
        st.pinchAnchor = null;
      }
    },
    [getDistance, getMidpoint, getMetrics]
  );

  const onTouchStart = useCallback(
    (e: TouchEvent | React.TouchEvent) => {
      const touches = e.touches;
      touchStateRef.current.moved = false;
      if (touches.length >= 2) {
        e.preventDefault();
        beginPinch(touches[0], touches[1]);
      } else if (touches.length === 1) {
        beginTouchPan(touches[0]);
      }
    },
    [beginPinch, beginTouchPan]
  );

  const onTouchMove = useCallback(
    (e: TouchEvent | React.TouchEvent) => {
      const st = touchStateRef.current;
      const touches = e.touches;

      if (touches.length >= 2 && st.isPinching) {
        // 핀치 줌 — 두 손가락 중점을 고정한 채 배율만 바꾸고(앵커), 중점이 움직이면 함께 팬
        e.preventDefault();
        st.moved = true;
        const dist = getDistance(touches[0], touches[1]);
        const newScale = Math.max(
          minScale,
          Math.min(maxScale, st.initialScale * (dist / st.initialDistance))
        );

        const mid = getMidpoint(touches[0], touches[1]);
        const m = getMetrics?.(); // 프레임당 1회만 (getScreenCTM은 레이아웃 강제 가능)
        const upp = resolveUnitsPerPixel(m);
        let next = { ...st.initialPosition };
        if (st.pinchAnchor) {
          // 앵커가 화면에서 제자리에 있도록 보정: pos' = pos + (s0 - s')*(anchor - C)
          const c = m?.center ?? { x: 0, y: 0 };
          const k = st.initialScale - newScale;
          next = { x: next.x + k * (st.pinchAnchor.x - c.x), y: next.y + k * (st.pinchAnchor.y - c.y) };
        }
        // 중점 이동만큼 따라가기 (두 손가락으로 끌어 옮기기)
        next = {
          x: next.x + (mid.x - st.startPoint.x) * upp,
          y: next.y + (mid.y - st.startPoint.y) * upp,
        };

        applyScale(newScale);
        applyPosition(clampPosition(next, newScale));
      } else if (touches.length === 1 && st.isPanning) {
        // 한 손가락 팬 — 손가락이 이동한 픽셀을 콘텐츠 단위로 환산해 그대로 따라간다
        e.preventDefault();
        const dxPx = touches[0].clientX - st.startPoint.x;
        const dyPx = touches[0].clientY - st.startPoint.y;
        // 8px 이상 움직이면 팬으로 간주 (손가락 흔들림은 탭으로 유지).
        // 임계를 넘는 순간을 **새 기준으로 다시 잡는다** — 안 그러면 그동안 쌓인 8px이
        // 한 프레임에 통째로 적용돼 보드가 툭 튄다.
        if (!st.moved) {
          if (Math.hypot(dxPx, dyPx) <= 8) return;
          st.moved = true;
          st.startPoint = { x: touches[0].clientX, y: touches[0].clientY };
          st.initialPosition = { ...positionRef.current };
          return;
        }
        const upp = resolveUnitsPerPixel(getMetrics?.());
        applyPosition(
          clampPosition(
            {
              x: st.initialPosition.x + dxPx * upp,
              y: st.initialPosition.y + dyPx * upp,
            },
            scaleRef.current
          )
        );
      }
    },
    [minScale, maxScale, getDistance, getMidpoint, getMetrics, resolveUnitsPerPixel, clampPosition, applyScale, applyPosition]
  );

  const onTouchEnd = useCallback(
    (e: TouchEvent | React.TouchEvent) => {
      const st = touchStateRef.current;
      const touches = e.touches;

      if (touches.length === 1) {
        // 핀치에서 손가락 하나를 뗀 경우 — 남은 손가락으로 팬을 이어받는다
        // (여기서 다시 시작하지 않으면 보드가 그 자리에서 굳거나 다음 이동이 튄다)
        const wasGesture = st.moved;
        beginTouchPan(touches[0]);
        st.moved = wasGesture;
      } else if (touches.length === 0) {
        st.isPanning = false;
        st.isPinching = false;
        st.pinchAnchor = null;
        // moved는 남겨 둔다 — 직후에 오는 click을 무시해야 하므로(다음 touchstart에서 리셋)
      }
    },
    [beginTouchPan]
  );

  /**
   * 마우스 드래그 시작 (데스크톱 팬). 좌클릭만.
   */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // 새 누름마다 직전 드래그 흔적 초기화 — 확대 중 드래그 후 축소(scale<=1)했을 때
    // moved가 남아 다음 클릭이 isPanGesture()에 먹히는 버그 방지 (early-return 전에 비움).
    mouseStateRef.current.moved = false;
    if (scaleRef.current <= 1) return; // 확대(+ 버튼) 상태에서만 드래그로 이동 — 기본 배율에선 클릭 동작 보존
    // 팬을 시작할 때만 기본 동작(텍스트 드래그 선택)을 막는다. 커서가 보드 밖으로 나가도
    // 선택이 따라 번지지 않는다. click 이벤트는 그대로 발생하므로 헥스 클릭에는 영향 없다.
    e.preventDefault();
    mouseStateRef.current.isPanning = true;
    mouseStateRef.current.startPos = { x: e.clientX, y: e.clientY };
    mouseStateRef.current.initialPosition = { ...positionRef.current };
  }, []);

  /**
   * 마우스 드래그 이동 (데스크톱 팬)
   */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mouseStateRef.current.isPanning) return;
    const dxPx = e.clientX - mouseStateRef.current.startPos.x;
    const dyPx = e.clientY - mouseStateRef.current.startPos.y;
    // 3px 이상 움직이면 드래그로 간주 (작은 흔들림은 클릭 유지)
    if (!mouseStateRef.current.moved && Math.hypot(dxPx, dyPx) > 3) {
      mouseStateRef.current.moved = true;
    }
    if (!mouseStateRef.current.moved) return;
    const upp = resolveUnitsPerPixel(getMetrics?.());
    applyPosition(
      clampPosition(
        {
          x: mouseStateRef.current.initialPosition.x + dxPx * upp,
          y: mouseStateRef.current.initialPosition.y + dyPx * upp,
        },
        scaleRef.current
      )
    );
  }, [getMetrics, resolveUnitsPerPixel, clampPosition, applyPosition]);

  /**
   * 마우스 드래그 종료 (데스크톱 팬)
   */
  const handleMouseUp = useCallback(() => {
    mouseStateRef.current.isPanning = false;
  }, []);

  /**
   * 직전 상호작용이 팬/핀치였는지 — 제스처 직후의 헥스 클릭 억제용
   */
  const isPanGesture = useCallback(
    () => mouseStateRef.current.moved || touchStateRef.current.moved,
    []
  );

  /**
   * 확대 (Zoom In) - 0.2 단계씩 증가
   */
  const zoomIn = useCallback(() => {
    const next = Math.min(maxScale, scaleRef.current + 0.2);
    applyScale(next);
    applyPosition(clampPosition(positionRef.current, next));
  }, [maxScale, applyScale, applyPosition, clampPosition]);

  /**
   * 축소 (Zoom Out) - 0.2 단계씩 감소
   */
  const zoomOut = useCallback(() => {
    const next = Math.max(minScale, scaleRef.current - 0.2);
    applyScale(next);
    applyPosition(clampPosition(positionRef.current, next));
  }, [minScale, applyScale, applyPosition, clampPosition]);

  /**
   * 줌 리셋 (Reset Zoom) - 1.0으로 복귀, 위치도 초기화
   */
  const resetZoom = useCallback(() => {
    applyScale(1);
    applyPosition({ x: 0, y: 0 });
  }, [applyScale, applyPosition]);

  // 네이티브 non-passive 리스너 등록 (targetRef가 있을 때만).
  // 핸들러는 ref를 통해 호출해 리스너 자체는 마운트 시 1회만 등록한다 — 매 상태 변화마다
  // add/removeEventListener를 반복하면 제스처 도중 리스너가 갈려 끊긴다.
  const handlersRef = useRef({ onTouchStart, onTouchMove, onTouchEnd });
  handlersRef.current = { onTouchStart, onTouchMove, onTouchEnd };

  useEffect(() => {
    const el = targetRef?.current;
    if (!el) return;
    // 리스너 시그니처는 (e: Event) — el이 SVG|HTML 유니온이라 addEventListener 오버로드가
    // 일반형으로 떨어진다. 안에서 TouchEvent로 좁혀 쓴다.
    const start = (e: Event) => handlersRef.current.onTouchStart(e as TouchEvent);
    const move = (e: Event) => handlersRef.current.onTouchMove(e as TouchEvent);
    const end = (e: Event) => handlersRef.current.onTouchEnd(e as TouchEvent);
    const opts: AddEventListenerOptions = { passive: false };
    el.addEventListener('touchstart', start, opts);
    el.addEventListener('touchmove', move, opts);
    el.addEventListener('touchend', end, opts);
    el.addEventListener('touchcancel', end, opts);
    return () => {
      el.removeEventListener('touchstart', start, opts);
      el.removeEventListener('touchmove', move, opts);
      el.removeEventListener('touchend', end, opts);
      el.removeEventListener('touchcancel', end, opts);
    };
  }, [targetRef]);

  return {
    scale,
    position,
    // React 핸들러 형태로도 노출 (targetRef를 쓰지 않는 사용처용 — 둘을 함께 쓰면 이중 처리)
    handleTouchStart: onTouchStart as (e: React.TouchEvent) => void,
    handleTouchMove: onTouchMove as (e: React.TouchEvent) => void,
    handleTouchEnd: onTouchEnd as (e: React.TouchEvent) => void,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    isPanGesture,
    zoomIn,
    zoomOut,
    resetZoom,
  };
}
