// Phase II 경매 + 교대 선공권 slice (2026-07-03 스텝 3c 분리)
//
// 자기완결적 상태(auction · turnOrderOffer)만 조작하고, 진행은 scheduleAICheck /
// get().nextPhase() 위임으로 처리 — payExpenses류 게임 정산과 결합 없음 (로드맵 3순위 근거).
// GameStore 타입은 순환을 피하기 위해 type-only import (uiSlice와 동일 패턴).
//
// 2026-07-25 룰북 정합 재작성:
// - 패스(Turn Order)와 포기(drop out)는 별개 상태 — 패스는 droppedOutPlayers에 넣지 않는다.
// - 종료 판정·차례 진행은 advanceAuctionTurn 한 곳에서만 수행 (액션별 휴리스틱 금지).
// - 최고입찰자를 건너뛰는 룰은 없다 — 자기 차례엔 입찰(자기 최고가 위로) 또는 포기를 직접 선택.

import type { StoreApi } from 'zustand';
import type { GameStore } from '../gameStore';
import { PlayerId, PlayerState } from '@/types/game';
import { getMapProfile } from '@/maps/getMapProfile';
import { logAction } from '@/utils/debugConfig';
import { scheduleAICheck } from '../helpers/aiScheduler';
import { playSfx } from '@/utils/sfx';

type Set = StoreApi<GameStore>['setState'];
type Get = StoreApi<GameStore>['getState'];

/** auctionSlice가 제공하는 액션 — 인터페이스 정의는 gameStore(GameStore)에 그대로, Pick으로 참조 */
export type AuctionSlice = Pick<
  GameStore,
  'placeBid' | 'passBid' | 'skipBid' | 'resolveAuction' | 'respondTurnOrderOffer'
>;

/**
 * 경매 차례 진행 — 종료 판정과 다음 입찰자 계산의 **유일한** 장소.
 *
 * 룰북: "Bidding continues until all but one player has dropped out of the bidding."
 * - 종료는 포기(droppedOutPlayers)하지 않은 플레이어가 1명 남았을 때뿐이다.
 *   Turn Order 패스는 포기가 아니므로 종료 판정에 영향을 주지 않는다.
 * - 차례는 플레이어 순서대로 다음 미포기·미파산 플레이어에게 넘어간다. 예외 없음 —
 *   최고입찰자도 동일하게 차례를 받아 입찰(자기 최고가 위로) 또는 포기를 직접 선택한다.
 *   차례가 이전 행동자에게 되돌아오는 것은 정상이며 종료 신호가 아니다.
 * - 종료 시 nextPlayer = 승자(유일 잔존자) — resolveAuction을 기다린다.
 */
function advanceAuctionTurn(
  playerOrder: PlayerId[],
  players: Record<PlayerId, PlayerState>,
  droppedOutPlayers: PlayerId[],
  actor: PlayerId,
): { nextPlayer: PlayerId; auctionOver: boolean } {
  const remaining = playerOrder.filter(
    p => !droppedOutPlayers.includes(p) && !players[p]?.eliminated
  );
  if (remaining.length <= 1) {
    return { nextPlayer: remaining[0] ?? playerOrder[0], auctionOver: true };
  }
  const start = playerOrder.indexOf(actor);
  for (let i = 1; i <= playerOrder.length; i++) {
    const cand = playerOrder[(start + i) % playerOrder.length];
    if (remaining.includes(cand)) return { nextPlayer: cand, auctionOver: false };
  }
  return { nextPlayer: remaining[0], auctionOver: false }; // 도달 불가 (remaining ≥ 2)
}

export function createAuctionSlice(set: Set, get: Get): AuctionSlice {
  return {
    placeBid: (playerId, amount) => {
      logAction('preparation', 'placeBid', { player: playerId, amount, turn: get().currentTurn });
      // 효과음용 성공 판정 미러 (set 콜백은 순수 유지 — 실패 시 무음)
      const okBid = amount >= 1 && amount > (get().auction?.highestBid ?? 0);
      set((state) => {
        const highestSoFar = state.auction?.highestBid ?? 0;
        // $0 입찰 불가, 기존 최고입찰액보다 높아야 함 (최고입찰자가 자기 최고가 위로 올리는 것 포함)
        if (amount < 1 || amount <= highestSoFar) {
          console.warn(`[WARN] placeBid: 입찰 금액 부족 - playerId: ${playerId}, 입찰: $${amount}, 현재 최고: $${highestSoFar}`);
          return state;
        }

        const droppedOutPlayers = state.auction?.droppedOutPlayers ?? [];
        const { nextPlayer } = advanceAuctionTurn(
          state.playerOrder, state.players, droppedOutPlayers, playerId
        );

        return {
          auction: {
            currentBidder: playerId,
            highestBid: amount,
            highestBidder: playerId,
            droppedOutPlayers,
            bids: {
              ...(state.auction?.bids ?? {}),
              [playerId]: amount,
            } as Record<PlayerId, number>,
            lastActedPlayer: playerId,
          },
          currentPlayer: nextPlayer,
          logs: [
            ...state.logs,
            {
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: playerId,
              action: `입찰: $${amount}`,
              timestamp: Date.now(),
            },
          ],
        };
      });
      if (okBid) playSfx('bid');

      // AI 턴 트리거 (중앙 집중식 스케줄러 사용)
      scheduleAICheck(get);
    },

    // 포기(drop out): 경매에서 탈락 — 순서는 resolveAuction이 포기 역순으로 배치
    passBid: (playerId) => {
      logAction('preparation', 'passBid', { player: playerId, turn: get().currentTurn });
      const okPass = !get().auction?.droppedOutPlayers.includes(playerId);
      set((state) => {
        // 중복 포기 방어 (재전송·중복 클릭)
        if (state.auction?.droppedOutPlayers.includes(playerId)) {
          console.warn(`[WARN] passBid: 이미 포기한 플레이어 - ${playerId}`);
          return state;
        }

        const droppedOutPlayers = [...(state.auction?.droppedOutPlayers ?? []), playerId];
        const { nextPlayer } = advanceAuctionTurn(
          state.playerOrder, state.players, droppedOutPlayers, playerId
        );

        return {
          auction: {
            currentBidder: state.auction?.currentBidder ?? null,
            highestBid: state.auction?.highestBid ?? 0,
            highestBidder: state.auction?.highestBidder ?? null,
            droppedOutPlayers,
            bids: (state.auction?.bids ?? {}) as Record<PlayerId, number>,
            lastActedPlayer: playerId,
          },
          currentPlayer: nextPlayer,
          logs: [
            ...state.logs,
            {
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: playerId,
              action: `입찰 포기`,
              timestamp: Date.now(),
            },
          ],
        };
      });
      if (okPass) playSfx('pass');

      // AI 턴 트리거 (중앙 집중식 스케줄러 사용)
      scheduleAICheck(get);
    },

    // Turn Order 패스: 포기 없이 이번 차례만 넘긴다 (룰북 "say 'pass' once to stay in the bidding").
    // 입찰액·순위·droppedOutPlayers는 건드리지 않고 turnOrderPassUsed만 세운다.
    // 종료 로직 없음 — 종료 판정은 advanceAuctionTurn 한 곳뿐.
    skipBid: (playerId) => {
      logAction('preparation', 'skipBid', { player: playerId, turn: get().currentTurn });
      set((state) => {
        const player = state.players[playerId];
        // 권한 검증: 직전 턴 turnOrder 선택(available) + 미사용("once")일 때만
        if (!player?.turnOrderPassAvailable || player.turnOrderPassUsed) {
          console.warn(`[WARN] skipBid: Turn Order 패스 권한 없음 또는 이미 사용 - ${playerId}`);
          return state;
        }

        const droppedOutPlayers = state.auction?.droppedOutPlayers ?? [];
        const { nextPlayer } = advanceAuctionTurn(
          state.playerOrder, state.players, droppedOutPlayers, playerId
        );

        return {
          // 첫 순서 패스(auction=null)면 빈 경매 셸을 만들어 차례만 넘긴다
          auction: {
            currentBidder: state.auction?.currentBidder ?? null,
            highestBid: state.auction?.highestBid ?? 0,
            highestBidder: state.auction?.highestBidder ?? null,
            droppedOutPlayers, // 변경 없음 — 패스는 포기가 아니다
            bids: (state.auction?.bids ?? {}) as Record<PlayerId, number>,
            lastActedPlayer: playerId,
          },
          currentPlayer: nextPlayer,
          // 패스 사용 처리를 여기서 중앙화한다 — AI/테스트도 skipBid를 직접 호출하므로
          // 외부(AuctionPanel/호스트 intent)에서만 세팅하면 봇이 플래그를 못 세워 매 라운드 무한 스킵.
          players: {
            ...state.players,
            [playerId]: { ...player, turnOrderPassUsed: true },
          },
          logs: [
            ...state.logs,
            {
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: playerId,
              action: `Turn Order 패스 사용 (포기 아님 — 경매에 남음)`,
              timestamp: Date.now(),
            },
          ],
        };
      });

      // AI 턴 트리거 (중앙 집중식 스케줄러 사용)
      scheduleAICheck(get);
    },

    resolveAuction: () => {
      const hadAuction = !!get().auction;
      set((state) => {
        if (!state.auction) {
          console.warn('[WARN] resolveAuction: 경매 없음');
          return state;
        }

        const { bids, droppedOutPlayers } = state.auction;

        // 비용 지불 및 순서 결정
        const newPlayers = { ...state.players };
        const newPlayerOrder: PlayerId[] = [];

        // 다중 플레이어 경매 규칙 (룰북 기준):
        // - 첫 번째로 포기한 플레이어: 마지막 순서, $0 지불 (입찰했어도)
        // - 마지막 2명 (승자 + 마지막 포기자): 각자 "자기 입찰액" 전액 지불
        // - 나머지 포기자들 (중간): 자기 입찰액의 절반 (올림) 지불
        // - 입찰한 적 없는 플레이어(무입찰 포기·패스만 한 승자)는 $0

        // 포기 순서 복사 (원본 변경 방지)
        const dropOrder = [...droppedOutPlayers];
        const lastDropoutIndex = dropOrder.length - 1;

        // 승자 = 포기하지 않고 남은 유일한 플레이어 (최고입찰자가 포기했을 수도,
        // 무입찰 패스만 한 플레이어일 수도 있다 — highestBidder로 단정하지 않는다).
        // ⚠️ 파산자 제외 — activePlayers는 좌석 전체(탈락자 포함)라 그대로 쓰면
        // 파산한 플레이어가 "포기하지 않은 사람"으로 잡혀 1번 순서가 된다 (2026-07-24 검증).
        const remaining = state.activePlayers.filter(
          p => !droppedOutPlayers.includes(p) && !newPlayers[p]?.eliminated
        );
        const winner = remaining[0] ?? state.auction.highestBidder ?? null;
        if (winner && remaining.length === 0) {
          console.warn(`[WARN] resolveAuction: 미포기 잔존자 없음 — highestBidder(${winner})로 폴백`);
        }

        // 승자가 1번 — 자기 입찰액 전액 지불 (입찰한 적 없으면 $0)
        if (winner) {
          const winnerBid = bids[winner] ?? 0;
          const winnerCash = newPlayers[winner].cash - winnerBid;
          if (winnerCash < 0) {
            console.warn(`[WARN] resolveAuction: 현금 부족 - ${winner}, 입찰: $${winnerBid}, 보유: $${newPlayers[winner].cash}`);
          }
          newPlayers[winner] = {
            ...newPlayers[winner],
            cash: Math.max(0, winnerCash),
          };
          newPlayerOrder.push(winner);
        }

        // 포기한 플레이어들 처리 (포기 역순으로 순서 결정)
        // 마지막 포기자부터 첫 번째 포기자까지 (1번 다음 순서부터)
        for (let i = lastDropoutIndex; i >= 0; i--) {
          const player = dropOrder[i];
          if (newPlayerOrder.includes(player)) continue;

          const playerBid = bids[player] || 0;

          // 비용 계산
          // Scotland 변형(auctionLoserPaysHalf): 포기자 전원 절반(올림) — 위치 무관
          // (v2 시트: "Losing bidder pays 1/2 (rounded up)". 승자는 표준대로 전액.)
          if (getMapProfile(state.mapId).auctionLoserPaysHalf) {
            if (playerBid > 0) {
              newPlayers[player] = {
                ...newPlayers[player],
                cash: Math.max(0, newPlayers[player].cash - Math.ceil(playerBid / 2)),
              };
            }
          } else if (i === 0) {
            // 첫 번째 포기자: $0 지불
            // 이미 cash 변경 없음
          } else if (i === lastDropoutIndex) {
            // 마지막 포기자 (승자와 함께 "마지막 2명"): 전액 지불
            if (playerBid > 0) {
              newPlayers[player] = {
                ...newPlayers[player],
                cash: Math.max(0, newPlayers[player].cash - playerBid),
              };
            }
          } else {
            // 중간 포기자: 절반 (올림) 지불
            if (playerBid > 0) {
              newPlayers[player] = {
                ...newPlayers[player],
                cash: Math.max(0, newPlayers[player].cash - Math.ceil(playerBid / 2)),
              };
            }
          }

          // 순서에 추가
          newPlayerOrder.push(player);
        }

        // 모든 플레이어가 순서에 있는지 확인 (안전장치)
        // ⚠️ 파산자(eliminated)는 제외 — payExpenses가 playerOrder에서 뺀 탈락자를 이 안전장치가
        // activePlayers(좌석 전체)에서 다시 집어넣어 부활시키던 버그(2026-07-24 온라인 달 검증에서
        // 파산한 게스트에게 행동 선택 차례가 돌아옴). 좌석은 유지하되 순서에는 넣지 않는다.
        for (const playerId of state.activePlayers) {
          if (newPlayers[playerId]?.eliminated) continue;
          if (!newPlayerOrder.includes(playerId)) {
            newPlayerOrder.push(playerId);
          }
        }

        console.log(`[resolveAuction] 새 playerOrder: [${newPlayerOrder.join(', ')}], 1번: ${newPlayerOrder[0]} (isAI: ${newPlayers[newPlayerOrder[0]]?.isAI})`);

        // Montréal 경매 트윅: 입찰 없이 포기한 플레이어가 2인 이상이면 그들은 이번 턴 특수 행동 선택 불가
        const penaltyLogs: typeof state.logs = [];
        if (getMapProfile(state.mapId).auctionNoBidPassPenalty) {
          const noBidPassers = droppedOutPlayers.filter(p => !((bids[p] ?? 0) > 0));
          if (noBidPassers.length >= 2) {
            for (const p of noBidPassers) {
              newPlayers[p] = { ...newPlayers[p], actionBanned: true };
              penaltyLogs.push({
                turn: state.currentTurn,
                phase: state.currentPhase,
                player: p,
                action: `${newPlayers[p].name}: 무입찰 패스 2인 이상 — 이번 턴 특수 행동 선택 불가`,
                timestamp: Date.now(),
              });
            }
          }
        }

        const winnerBidPaid = winner ? (bids[winner] ?? 0) : 0;
        return {
          players: newPlayers,
          playerOrder: newPlayerOrder,
          auction: null,
          logs: [
            ...state.logs,
            ...penaltyLogs,
            {
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: winner || state.playerOrder[0],
              action: winner
                ? `경매 승리: ${newPlayers[winner].name} ($${winnerBidPaid} 지불)`
                : '경매 없이 순서 유지',
              timestamp: Date.now(),
            },
          ],
        };
      });
      if (hadAuction) playSfx('auctionWin');
    },

    // ============================================================
    // Phase II (대체): 교대 선공권 (alternateTurnOrder 맵 전용)
    // ============================================================
    respondTurnOrderOffer: (playerId, accept) => {
      // 가드는 set 밖에서: 해결(offer가 null이 됨) 시 nextPhase 호출 여부를 판단해야 함
      const pre = get();
      if (!pre.turnOrderOffer || pre.turnOrderOffer.offerPlayer !== playerId) {
        console.warn(`[WARN] respondTurnOrderOffer: 유효하지 않은 응답 - playerId: ${playerId}`);
        return;
      }

      set((state) => {
        const offer = state.turnOrderOffer;
        if (!offer || offer.offerPlayer !== playerId) {
          return state;
        }

        const rules = getMapProfile(state.mapId);
        const others = state.activePlayers.filter(p => p !== playerId);

        // 수락: firstSeatCost 지불 후 선공
        if (accept) {
          const player = state.players[playerId];
          const cost = rules.firstSeatCost;
          if (player.cash < cost) {
            console.warn(`[WARN] respondTurnOrderOffer: 현금 부족 - ${playerId}, 필요: $${cost}, 보유: $${player.cash}`);
            return state;
          }
          return {
            players: {
              ...state.players,
              [playerId]: { ...player, cash: player.cash - cost },
            },
            playerOrder: [playerId, ...others],
            turnOrderOffer: null,
            currentPlayer: playerId,
            logs: [
              ...state.logs,
              {
                turn: state.currentTurn,
                phase: state.currentPhase,
                player: playerId,
                action: `선공권 구매 ($${cost} 지불) - 1번 플레이어`,
                timestamp: Date.now(),
              },
            ],
          };
        }

        // 거절: 다음 플레이어에게 옵션 이전
        const declined = [...offer.declined, playerId];
        const nextOffer = state.activePlayers.find(p => !declined.includes(p));

        if (nextOffer) {
          return {
            turnOrderOffer: { ...offer, offerPlayer: nextOffer, declined },
            currentPlayer: nextOffer,
            logs: [
              ...state.logs,
              {
                turn: state.currentTurn,
                phase: state.currentPhase,
                player: playerId,
                action: `선공권 거절 → ${state.players[nextOffer]?.name}에게 옵션 이전`,
                timestamp: Date.now(),
              },
            ],
          };
        }

        // 모두 거절: 첫 제안 대상이 무료로 선공
        const first = offer.firstOptionPlayer;
        const rest = state.activePlayers.filter(p => p !== first);
        return {
          playerOrder: [first, ...rest],
          turnOrderOffer: null,
          currentPlayer: first,
          logs: [
            ...state.logs,
            {
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: first,
              action: `모두 선공권 거절 → ${state.players[first]?.name} 무료 선공`,
              timestamp: Date.now(),
            },
          ],
        };
      });

      // 선공권이 해결됨(수락 또는 모두 거절) → 다음 단계로 진행
      // (이게 없으면 determinePlayerOrder에 머물러 경매 패널이 표시되는 버그)
      if (!get().turnOrderOffer) {
        get().nextPhase(); // 내부에서 scheduleAICheck 호출
        return;
      }

      // 옵션이 다음 플레이어에게 이전됨 → AI 턴 트리거만
      scheduleAICheck(get);
    },
  };
}
