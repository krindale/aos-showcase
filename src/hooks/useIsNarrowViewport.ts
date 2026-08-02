'use client';

import { useEffect, useState } from 'react';

/** Tailwind `md` 브레이크포인트 — 이 미만이 "모바일 레이아웃"이다 */
const NARROW_QUERY = '(max-width: 767px)';

/**
 * 모바일 레이아웃인지 — **바텀시트가 뜨는 화면인가**가 곧 이 판정이다.
 *
 * ⚠️ 이 훅이 모바일 판정의 **단일 소스**다. GamePageClient가 이 값으로 `BottomSheet` 렌더를
 * 결정하고, 게임 보드의 모바일 전용 동작(화물 선택 팝업 등)도 같은 값을 본다. 예전처럼
 * 한쪽은 Tailwind `md:hidden`(CSS), 다른 쪽은 별도 미디어쿼리(JS)로 각각 판정하면 값이
 * 같아도 두 정의가 따로 놀아, 한쪽만 바뀌었을 때 "바텀시트는 떠 있는데 모바일 동작은 안 하는"
 * 상태가 된다. 브레이크포인트를 바꿔야 하면 여기 한 곳만 고친다.
 *
 * SSR·초기 렌더에서는 false로 시작한다 — 정적 export라 서버는 화면 크기를 알 수 없고,
 * 마운트 직후 effect에서 실제 값으로 교정된다. 기본값을 false(=데스크톱 동작)로 두는 쪽이
 * 안전하다: 잘못 true가 되면 데스크톱에서 없던 팝업이 뜨지만, false면 기존 동작 그대로다.
 */
export function useIsNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return narrow;
}
