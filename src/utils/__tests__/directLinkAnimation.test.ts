/**
 * 직결 링크(구매식 도시-도시 링크) 화물 이동 애니메이션 — 2026-07-28 사용자 보고 회귀 가드
 *
 * Southern China Guangzhou↔Hong Kong $8 페리처럼 **변으로 인접하지 않은** 두 도시를 잇는
 * 직결 링크에서는 getConnectingEdge가 null이라, 폴백이 없으면 경로 포인트가 하나도 생성되지
 * 않는다. 그러면 BoardOverlays의 `times: i/(length-1)`가 0/0 = NaN이 되어 Framer Motion
 * 애니메이션이 통째로 깨진다(= "화물 애니메이션이 끊긴다").
 *
 * 달 랩 어라운드와 구분: 랩은 board를 주면 인접(변 연결)이라 subpath로 끊어야 하고,
 * 직결 링크는 board를 줘도 비인접이라 **중점을 거쳐 이어야** 한다.
 */
import { describe, it, expect } from 'vitest';
import { getMovementPathSVG, getAnimationPoints, getConnectingEdge } from '@/utils/hexGrid';
import { createSouthernChinaBoardState } from '@/utils/southernChinaMap';
import type { HexCoord } from '@/types/game';

describe('직결 링크(비인접 도시 쌍) 이동 애니메이션', () => {
  const board = createSouthernChinaBoardState();

  const cityCoord = (id: string): HexCoord => {
    const c = board.cities.find(x => x.id === id);
    if (!c) throw new Error(`도시 없음: ${id}`);
    return c.coord;
  };

  // 광저우 ↔ 홍콩 = $8 페리 (원본 시트상 비인접 — 면 앵커 직선으로 렌더)
  const gz = cityCoord('guangzhou');
  const hk = cityCoord('hongkong');

  it('GZ↔HK는 board를 줘도 비인접이다 (전제 — 랩 어라운드와 구분)', () => {
    expect(getConnectingEdge(gz, hk, board)).toBeNull();
    expect(getConnectingEdge(gz, hk)).toBeNull();
  });

  it('직결 링크 한 구간만으로도 애니메이션 포인트가 2개 이상 생성된다', () => {
    const pts = getAnimationPoints([gz, hk], board, 20, 5, false);
    // 폴백 전에는 시작 도시 중심 1개만 생겨 times가 NaN이 됐다
    expect(pts.length).toBeGreaterThanOrEqual(2);
    // times 계산이 유한해야 한다 (i / (length-1))
    const times = pts.map((_, i) => i / (pts.length - 1));
    expect(times.every(t => Number.isFinite(t))).toBe(true);
    // 모든 좌표가 유한값
    expect(pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('직결 링크가 경로 중간에 있어도 포인트가 끊기지 않는다', () => {
    // SZ → HK(직결로 진입) → GZ(직결로 진출): 홍콩이 중간 정거장
    const sz = cityCoord('shenzhen');
    const pts = getAnimationPoints([sz, hk, gz], board, 20, 5, false);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    expect(pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('경로 SVG도 직결 구간에서 끊기지 않는다 (M 1개 + L 이어짐)', () => {
    const svg = getMovementPathSVG([gz, hk], board, 20, false);
    expect(svg).not.toBe('');
    // 랩과 달리 subpath로 끊지 않는다 — 시작 M 하나뿐
    expect((svg.match(/M /g) ?? []).length).toBe(1);
    expect(svg).toContain('L ');
    expect(svg).not.toMatch(/NaN/);
  });

  it('경로 중간의 도시도 중심을 경유한다 (진입점만 찍고 건너뛰지 않음)', () => {
    // 인접 도시 쌍 SZ↔HK는 변으로 이어져 있어 일반 경로 — 중간 도시 처리 확인용
    const sz = cityCoord('shenzhen');
    const svg = getMovementPathSVG([gz, sz, hk], board, 20, false);
    expect(svg).not.toMatch(/NaN/);
    // 중간 정거장(SZ) 중심 좌표가 경로에 포함되어야 한다
    const pts = getAnimationPoints([gz, sz, hk], board, 20, 5, false);
    expect(pts.length).toBeGreaterThanOrEqual(5);
  });
});
