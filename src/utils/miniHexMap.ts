// 마케팅용 미니 헥스맵 지오메트리 헬퍼 (pointy-top, odd-r 오프셋)
// HeroBoardVignette·TutorialMiniMap 등 장식용 SVG 공용.
// 실제 게임 보드 렌더는 utils/hexGrid.ts(hexToPixel/getHexPoints)를 사용한다 —
// 이 모듈은 게임 좌표계와 무관한 소형 프리뷰 전용이다.

/** pointy-top 헥스 폴리곤 points 문자열 (중심 x,y · 반지름 r) */
export const hexPolygonPoints = (x: number, y: number, r: number): string =>
  Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i + 30) * Math.PI) / 180;
    return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

/** odd-r 오프셋 그리드 레이아웃 — 반지름과 원점에서 셀 중심 좌표 함수 생성 */
export function createHexLayout(radius: number, originX: number, originY: number) {
  const width = Math.sqrt(3) * radius; // 헥스 폭
  return {
    width,
    cx: (col: number, row: number) => originX + col * width + (row % 2 ? width / 2 : 0),
    cy: (row: number) => originY + row * 1.5 * radius,
  };
}
