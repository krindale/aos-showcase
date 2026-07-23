// 경매(Phase II) 진행 중 "새로운 순서" 미리보기 — 순수 파생 헬퍼.
//
// resolveAuction(auctionSlice.ts)의 최종 순서 규칙 중 "포기자 배치" 부분과 동일:
//   승자 → 1등, 포기자는 passedPlayers 역순(첫 포기자 = 꼴등, 이후 우→좌).
// 진행 중에는 승자·미정 앞자리를 알 수 없으므로 포기자만 확정하고 나머지는 null로 둔다
// (최종 순서/승자는 경매 종료 시 resolveAuction이 playerOrder를 대체하며 확정).
//
// auction 상태는 온라인 스냅샷에 자동 포함(LOCAL_ONLY_KEYS 아님)되므로 게스트도 동일하게 파생.

import { PlayerId } from '@/types/game';

/**
 * 진행 중 예상 순서 슬롯. index 0 = 1등(좌) … n-1 = 꼴등(우).
 * 포기자만 확정: 첫 포기자(passedPlayers[0]) = 맨 우측(꼴등), 이후 우→좌로.
 * 아직 포기하지 않은 앞자리(승자 후보 포함)는 미정 = null.
 *
 * @param playerOrder 현재 플레이어 순서 (슬롯 개수 = 참가자 수의 기준)
 * @param passedPlayers 포기 순서대로 쌓인 배열 (auction.passedPlayers)
 * @param winner 경매 승자가 확정됐을 때(활성 1명 남음) 그 플레이어. 남은 앞자리(1등)를 채운다.
 *   진행 중(선두가 계속 바뀜)에는 null을 넘겨 1등 자리를 미정으로 둔다.
 */
export function predictAuctionOrderSlots(
  playerOrder: PlayerId[],
  passedPlayers: PlayerId[],
  winner: PlayerId | null = null,
): (PlayerId | null)[] {
  const n = playerOrder.length;
  const slots = Array<PlayerId | null>(n).fill(null);
  passedPlayers.forEach((pid, k) => {
    const idx = n - 1 - k;
    if (idx >= 0) slots[idx] = pid;
  });
  // 경매 완료(승자 확정) 시: 남은 앞자리(첫 null = 1등 자리)를 승자로 채운다.
  if (winner) {
    const firstEmpty = slots.indexOf(null);
    if (firstEmpty >= 0) slots[firstEmpty] = winner;
  }
  return slots;
}
