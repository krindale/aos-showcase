import { BoardState, HexCoord, PlayerId } from '@/types/game';
import { hexCoordsEqual } from '@/utils/hexGrid';
import { getMapProfile } from '@/maps/getMapProfile';

/**
 * 마을 연결 비용 — **한 곳**에서 계산한다 (룰북 IV: "마을 $1 + 마을로 연결되는 트랙당 $1").
 *
 * 이 엔진은 마을 헥스에 타일을 놓지 않고 원→변 "가닥(스퍼)"을 만드는 모델이라, 룰북의
 * 두 항목을 이렇게 옮긴다:
 *   - **마을 기본료**(`MapProfile.townBaseCost`, 표준 $1) — 그 마을을 **이번 턴 처음 건드릴 때** 1회.
 *     건설 카운트가 "턴 첫 변경 시 1카운트"인 것과 같은 기준이다.
 *   - **가닥당 비용**(`MapProfile.townSpurCost`, 표준 $1) — 새로 만드는 가닥 하나마다.
 * 그래서 가닥 1개 = $2, 3개 = $4로 룰북의 "가장 싼 마을 타일 $2 / 가장 비싼 $5"와 맞는다.
 *
 * ⚠️ 2026-08-02 이전에는 기본료가 통째로 빠져 있어(가닥 수 × $1) 마을을 거치는 모든 건설이
 * 정확히 $1씩 쌌다. 청구 지점이 buildTrack·복합·방향전환·buildTownSpur 네 곳에 흩어져 있어
 * 한 곳만 고치면 또 어긋나므로, 이 헬퍼로 통일하고 AI 예상 비용도 같은 함수를 쓴다.
 */

/** 이번 턴에 그 플레이어가 이미 이 마을을 건드렸는지 (기본료 중복 청구 방지) */
export function hasTouchedTownThisTurn(
  board: BoardState,
  townCoord: HexCoord,
  currentTurn: number,
  owner: PlayerId | null
): boolean {
  return (board.townSpurs ?? []).some(
    (sp) => hexCoordsEqual(sp.townCoord, townCoord) && sp.builtTurn === currentTurn && sp.owner === owner
  );
}

/**
 * 새로 만들 가닥들의 총 비용.
 *
 * @param spurs 이번에 새로 생기는 가닥들 (같은 마을 여러 변이면 기본료는 1번만 붙는다)
 * @param owner 가닥 소유자 — **필터 필수**. 상대가 같은 턴 같은 마을을 건드렸다고 해서
 *              내 기본료가 면제되면 안 된다(카운트 규칙과 동일한 이유).
 */
export function calcTownSpurCost(
  mapId: string,
  board: BoardState,
  spurs: { townCoord: HexCoord }[],
  currentTurn: number,
  owner: PlayerId | null
): number {
  if (spurs.length === 0) return 0;
  const profile = getMapProfile(mapId);
  let cost = spurs.length * profile.townSpurCost;

  // 기본료는 "마을당 1회" — 이번 호출에서 같은 마을에 여러 가닥을 만들어도 한 번,
  // 이번 턴에 이미 건드린 마을이면 0.
  const charged: HexCoord[] = [];
  for (const sp of spurs) {
    if (charged.some((c) => hexCoordsEqual(c, sp.townCoord))) continue;
    charged.push(sp.townCoord);
    if (!hasTouchedTownThisTurn(board, sp.townCoord, currentTurn, owner)) {
      cost += profile.townBaseCost;
    }
  }
  return cost;
}

/**
 * 마을 하나에 가닥 n개를 새로 만들 때의 비용 (canBuild 검사·AI 추정용 간이 버전).
 * `alreadyTouched`가 true면 기본료가 빠진다.
 */
export function townCostFor(mapId: string, spurCount: number, alreadyTouched: boolean): number {
  if (spurCount <= 0) return 0;
  const profile = getMapProfile(mapId);
  return spurCount * profile.townSpurCost + (alreadyTouched ? 0 : profile.townBaseCost);
}
