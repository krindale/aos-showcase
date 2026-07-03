import { CubeColor } from '@/types/game';
import { HEX_SIZE } from '@/utils/hexGrid';

// GameBoard 렌더 전용 순수 기하/스타일 헬퍼 모음.
// React/store 의존 없음 — 좌표·크기 계산과 SVG path 문자열 생성만 한다.

export const SQRT3_2 = 0.8660254; // sin(60°) — flat-top 헥스 평변까지 거리 비율

// hex 색을 amt만큼 밝게(+)/어둡게(-) — 고정비용 육각형의 "필드보다 진한 녹색"용
export function shadeColor(hex: string, amt: number): string {
  if (!hex.startsWith('#') || hex.length < 7) return hex;
  const ch = (i: number) =>
    Math.max(0, Math.min(255, parseInt(hex.slice(i, i + 2), 16) + amt)).toString(16).padStart(2, '0');
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}

// 도시/마을 이름 배경 points.
// flat-top(꼭짓점 가로): 헥스 좌우 꼭짓점까지 닿는 옆으로 긴 육각형.
// pointy-top(꼭짓점 세로, 서부 미국): 헥스 좌우 평변까지 닿는 네모(사각형).
export function nameBandPoints(x: number, y: number, isFlat: boolean): string {
  const bh2 = (HEX_SIZE * 0.31) / 2;
  if (!isFlat) {
    const rr = SQRT3_2 * HEX_SIZE; // 좌우 평변 끝까지 (헥스 변에 닿게)
    return [[x + rr, y - bh2], [x + rr, y + bh2], [x - rr, y + bh2], [x - rr, y - bh2]]
      .map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  }
  const rr = HEX_SIZE; // 좌우 꼭짓점 끝까지 (헥스 변에 닿게)
  const dx = bh2 * 0.5774; // 헥스 사선 기울기만큼 좌우 끝이 좁아짐
  return [
    [x + rr, y], [x + rr - dx, y - bh2], [x - rr + dx, y - bh2],
    [x - rr, y], [x - rr + dx, y + bh2], [x + rr - dx, y + bh2],
  ].map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
}

// 도시 숫자 박스 path.
// flat-top: 헥스 상/하 평변에 닿는 사각형(안쪽 모서리만 라운드).
// pointy-top: 헥스 상/하 꼭짓점을 덮는 "네모+세모" 오각형(home plate).
export function numberBoxPath(
  x: number, y: number, bw: number, bh: number, rad: number, isFlat: boolean, isTop: boolean
): string {
  const x0 = x - bw / 2, x1 = x + bw / 2;
  if (isFlat) {
    const edge = SQRT3_2 * HEX_SIZE; // 상/하 평변에 닿게
    if (isTop) {
      const topY = y - edge;
      return `M ${x0} ${topY} L ${x1} ${topY} L ${x1} ${topY + bh - rad} Q ${x1} ${topY + bh} ${x1 - rad} ${topY + bh} L ${x0 + rad} ${topY + bh} Q ${x0} ${topY + bh} ${x0} ${topY + bh - rad} Z`;
    }
    const botY = y + edge;
    return `M ${x0} ${botY - bh + rad} Q ${x0} ${botY - bh} ${x0 + rad} ${botY - bh} L ${x1 - rad} ${botY - bh} Q ${x1} ${botY - bh} ${x1} ${botY - bh + rad} L ${x1} ${botY} L ${x0} ${botY} Z`;
  }
  // pointy: 헥스 꼭짓점이 위/아래. 네모+세모로 꼭짓점을 덮음.
  // 세모 꼭짓점 각도 = 120°(헥스 꼭짓점과 동일) → tri = (bw/2)/tan60 = bw/3.4641.
  // 헥스 변에 닿지 않는 네모 안쪽 모서리만 라운드.
  const tip = HEX_SIZE;          // 꼭짓점까지 거리 (헥스 변에 닿게)
  const tri = bw / 3.4641;        // 세모 높이 (꼭짓점 120°)
  if (isTop) {
    const apex = y - tip;          // 헥스 상단 꼭짓점
    const base = apex + bh;        // 네모 아래 (헥스 안쪽)
    const shoulder = apex + tri;   // 세모→네모 경계 (헥스 변)
    return `M ${x} ${apex} L ${x1} ${shoulder} L ${x1} ${base - rad} Q ${x1} ${base} ${x1 - rad} ${base} L ${x0 + rad} ${base} Q ${x0} ${base} ${x0} ${base - rad} L ${x0} ${shoulder} Z`;
  }
  const apex = y + tip;            // 헥스 하단 꼭짓점
  const base = apex - bh;          // 네모 위 (헥스 안쪽)
  const shoulder = apex - tri;     // 세모→네모 경계 (헥스 변)
  return `M ${x0} ${base + rad} Q ${x0} ${base} ${x0 + rad} ${base} L ${x1 - rad} ${base} Q ${x1} ${base} ${x1} ${base + rad} L ${x1} ${shoulder} L ${x} ${apex} L ${x0} ${shoulder} Z`;
}

// 면화(흰 큐브) 렌더 스펙 — 일반 큐브(12px)보다 20% 크고 어두운 테두리(요청 스펙).
// 마을/도시/이동 큐브 렌더 3곳이 공유한다 (한 곳만 고치면 시각 불일치 — 여기서만 수정).
export const cubeRenderSize = (color: CubeColor) => (color === 'white' ? 14.4 : 12);
export const cubeStrokeColor = (color: CubeColor, fallback = '#e8eaec') =>
  color === 'white' ? '#8a857c' : fallback;
export const cubeStrokeWidth = (color: CubeColor, fallback = 1) => (color === 'white' ? 2 : fallback);

// 헥스 꼭짓점 i의 픽셀 좌표 (지도 바깥 외곽 실루엣 선을 그릴 때 사용). 변 e는 꼭짓점 e와 e+1 사이.
export function hexVertex(cx: number, cy: number, i: number, flat: boolean): { x: number; y: number } {
  const angle = (Math.PI / 3) * i - Math.PI / 6;
  const dx = HEX_SIZE * Math.cos(angle);
  const dy = HEX_SIZE * Math.sin(angle);
  return flat ? { x: cx + dy, y: cy + dx } : { x: cx + dx, y: cy + dy };
}
