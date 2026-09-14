'use client';

import { useEffect } from 'react';

/**
 * 모달이 열려 있는 동안 배경(body) 스크롤을 잠근다 — 모달 5종(확인창·도움말·설정·운송 확인·
 * 신도시)이 각자 `body.style.overflow='hidden'`을 복제하던 것을 한 곳으로.
 *
 * ⚠️ 왜 단순 `overflow:hidden`이 아닌가 (2026-09-14 실전 버그): `globals.css`의
 * `::-webkit-scrollbar{width:8px}`는 Chrome에서 **자리를 차지하는 클래식 스크롤바**를 강제한다.
 * overflow를 숨기면 그 8px이 사라져 뷰포트가 넓어지고, 보드 SVG·헤더·패널이 통째로 재배치됐다가
 * 닫으면 도로 돌아온다 — 모달을 열고 닫을 때마다 화면 전체가 "깜빡"였다(사용자 보고: 신도시
 * 버튼을 누를 때마다). 트랙패드(오버레이 스크롤바)에선 폭이 0이라 로컬 검수에서 안 보였다.
 * 사라지는 스크롤바 폭만큼 body에 padding-right를 넣어 흐름 내 콘텐츠를 제자리에 고정한다.
 * 1차 방어는 globals.css의 `html{scrollbar-gutter:stable}`(자리 상시 확보)이고, 이 보정은 그게
 * 안 먹는 브라우저용이다 — 그래서 **잠근 뒤 실제로 사라진 폭**만 보정한다(gutter가 유지되면 0).
 * 잠그기 전 폭을 그대로 넣으면 gutter 위에 8px이 더 얹혀 반대로 밀린다.
 *
 * 참조 카운트: 모달 위에 모달(확인창 위 운송 확인 등)이 겹쳐도 마지막 하나가 닫힐 때만 푼다 —
 * 각자 prev 값을 복원하면 안쪽이 먼저 닫히는 순간 바깥 모달의 잠금이 풀린다.
 */
let lockCount = 0;
let prevOverflow = '';
let prevPaddingRight = '';

function lock() {
  if (lockCount++ > 0) return;
  const body = document.body;
  prevOverflow = body.style.overflow;
  prevPaddingRight = body.style.paddingRight;
  const before = window.innerWidth - document.documentElement.clientWidth;
  body.style.overflow = 'hidden';
  const lost = before - (window.innerWidth - document.documentElement.clientWidth);
  if (lost > 0) body.style.paddingRight = `${lost}px`;
}

function unlock() {
  if (--lockCount > 0) return;
  lockCount = 0;
  const body = document.body;
  body.style.overflow = prevOverflow;
  body.style.paddingRight = prevPaddingRight;
}

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
