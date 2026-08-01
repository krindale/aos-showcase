/**
 * 앱 내부 이동 흔적 — "뒤로 가기가 우리 사이트 안으로 돌아가는가"를 판정한다.
 *
 * 왜 window.history.length로는 안 되는가: 그 값은 **브라우저 탭의 전체 히스토리 길이**라
 * 다른 사이트 방문까지 센다. 검색 결과에서 /game/<맵>으로 바로 들어온 사람은 length가
 * 2 이상이지만, 그 상태에서 router.back()을 하면 **우리 사이트 밖(검색 페이지)으로 나간다**.
 * 게임 화면에서 X를 눌렀는데 사이트를 떠나는 건 명백한 오동작이다.
 *
 * 그래서 앱이 로드된 뒤 **우리가 router.push로 이동한 횟수**만 따로 센다.
 *
 * ⚠️ 일부러 sessionStorage를 쓰지 않는다 — 모듈 메모리라 새로고침하면 0으로 돌아간다.
 * 그게 정확하다: F5하면 그 이전 히스토리로 back해도 우리 앱의 상태가 남아 있지 않으므로
 * 폴백(맵 갤러리/셋업)으로 가는 편이 낫다. 저장해 두면 "지우는 지점"이 생기고, 그걸
 * 관리하다 어긋나는 게 이 기능의 원래 버그였다(aos-back-to 방식, 2026-08-01 폐기).
 */
let appNavCount = 0;

/** 게임 화면으로 router.push하기 직전에 호출 — 돌아갈 앱 내 페이지가 생겼음을 표시 */
export function markAppNavigation(): void {
  appNavCount += 1;
}

/** router.back()이 앱 안으로 돌아가는가 */
export function hasAppHistory(): boolean {
  return appNavCount > 0;
}
