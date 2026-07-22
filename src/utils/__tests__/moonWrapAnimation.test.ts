/**
 * 달(Moon) 랩 어라운드 화물 이동 가이드라인/애니메이션 — subpath 분리 검증
 *
 * 랩 경계(화면상 반대편·물리적 비인접)에서 이동 경로 SVG가 보드를 가로지르는 직선 대신
 * subpath로 끊겨야 한다(진입점 L→M). 애니메이션 포인트도 board를 받아 랩 변을 인식해야 한다.
 */
import { describe, it, expect } from 'vitest';
import { getMovementPathSVG, getAnimationPoints, getConnectingEdge } from '@/utils/hexGrid';
import { createMoonBoardState, MOON_WRAP_EDGES } from '@/utils/moonMap';
import type { HexCoord } from '@/types/game';

describe('달 랩 어라운드 이동 애니메이션', () => {
  const board = createMoonBoardState();

  // 첫 랩 쌍의 양끝 헥스 — 게임상 연결이지만 화면상 반대편(비인접)
  const wrap = MOON_WRAP_EDGES[0];
  const a: HexCoord = wrap.a.coord;
  const b: HexCoord = wrap.b.coord;

  it('랩 쌍은 board로는 연결, board 없이는 비인접이다 (전제 확인)', () => {
    expect(getConnectingEdge(a, b, board)).not.toBeNull();
    expect(getConnectingEdge(a, b)).toBeNull();
  });

  it('랩 경계를 지나는 경로 SVG는 subpath로 끊긴다 (M이 2개 이상)', () => {
    // a → b 랩 스텝을 포함하는 3-헥스 경로 (양끝은 도시/트랙 중심 취급)
    const path: HexCoord[] = [a, b, a];
    const svg = getMovementPathSVG(path, board, 20, true);
    const moveCount = (svg.match(/M /g) ?? []).length;
    // 시작 M(1) + 랩 경계 진입 M(1) = 최소 2개. 랩이 안 끊기면 M은 1개뿐이고
    // 보드를 가로지르는 L 직선이 생긴다.
    expect(moveCount).toBeGreaterThanOrEqual(2);
  });

  it('랩이 없는 인접 경로는 하나의 연속 subpath다 (회귀: M 1개)', () => {
    // 물리적으로 인접한 두 헥스 (랩 아님)
    const c: HexCoord = a;
    const adjEdge = getConnectingEdge(c, { col: c.col + 1, row: c.row }); // 임의 인접 방향
    void adjEdge;
    // a의 실제 인접 이웃을 하나 골라 연속 경로 구성
    const neighborCol = a.col + 1;
    const straightPath: HexCoord[] = [
      { col: a.col, row: a.row },
      { col: neighborCol, row: a.row },
    ];
    // 인접 여부 확인 후에만 검증 (맵 밖이면 스킵)
    if (getConnectingEdge(straightPath[0], straightPath[1]) !== null) {
      const svg = getMovementPathSVG(straightPath, board, 20, true);
      expect((svg.match(/M /g) ?? []).length).toBe(1);
    }
  });

  it('getAnimationPoints가 board를 받아 랩 경로에도 포인트를 생성한다', () => {
    const path: HexCoord[] = [a, b, a];
    const pts = getAnimationPoints(path, board, 20, 5, true);
    // board 없이 호출하던 과거엔 랩 변이 null이라 중간 세그먼트가 비어 포인트가 급감했다.
    expect(pts.length).toBeGreaterThan(0);
  });
});
