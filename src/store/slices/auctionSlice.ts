// Phase II 경매 + 교대 선공권 slice (2026-07-03 스텝 3c 분리 — 로직 무변경, 코드 그대로 이동)
//
// 자기완결적 상태(auction · turnOrderOffer)만 조작하고, 진행은 scheduleAICheck /
// get().nextPhase() 위임으로 처리 — payExpenses류 게임 정산과 결합 없음 (로드맵 3순위 근거).
// GameStore 타입은 순환을 피하기 위해 type-only import (uiSlice와 동일 패턴).

import type { StoreApi } from 'zustand';
import type { GameStore } from '../gameStore';
import { PlayerId } from '@/types/game';
import { getMapProfile } from '@/maps/getMapProfile';
import { logAction } from '@/utils/debugConfig';
import { scheduleAICheck } from '../helpers/aiScheduler';

type Set = StoreApi<GameStore>['setState'];
type Get = StoreApi<GameStore>['getState'];

/** auctionSlice가 제공하는 액션 — 인터페이스 정의는 gameStore(GameStore)에 그대로, Pick으로 참조 */
export type AuctionSlice = Pick<
  GameStore,
  'placeBid' | 'passBid' | 'skipBid' | 'resolveAuction' | 'respondTurnOrderOffer'
>;

export function createAuctionSlice(set: Set, get: Get): AuctionSlice {
  return {
    placeBid: (playerId, amount) => {
      logAction('preparation', 'placeBid', { player: playerId, amount, turn: get().currentTurn });
      set((state) => {
        if (!state.auction) {
          // 경매 시작 - 다음 입찰자 계산
          const activePlayers = state.playerOrder;
          const currentIndex = activePlayers.indexOf(playerId);
          const nextIndex = (currentIndex + 1) % activePlayers.length;
          const nextBidder = activePlayers[nextIndex];

          return {
            auction: {
              currentBidder: playerId,
              highestBid: amount,
              highestBidder: playerId,
              passedPlayers: [],
              bids: { [playerId]: amount } as Record<PlayerId, number>,
              lastActedPlayer: playerId,
            },
            currentPlayer: nextBidder,
          };
        }

        // 입찰
        if (amount <= state.auction.highestBid) {
          console.warn(`[WARN] placeBid: 입찰 금액 부족 - playerId: ${playerId}, 입찰: $${amount}, 현재 최고: $${state.auction.highestBid}`);
          return state;
        }

        // 다음 입찰자 계산 (패스한 플레이어 제외)
        const activePlayers = state.playerOrder.filter(p => !state.auction!.passedPlayers.includes(p));
        const currentIndex = activePlayers.indexOf(playerId);
        const nextIndex = (currentIndex + 1) % activePlayers.length;
        const nextBidder = activePlayers[nextIndex];

        return {
          auction: {
            ...state.auction,
            currentBidder: playerId,
            highestBid: amount,
            highestBidder: playerId,
            lastActedPlayer: playerId,
            bids: {
              ...state.auction.bids,
              [playerId]: amount,
            },
          },
          currentPlayer: nextBidder,
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

      // AI 턴 트리거 (중앙 집중식 스케줄러 사용)
      scheduleAICheck(get);
    },

    passBid: (playerId) => {
      logAction('preparation', 'passBid', { player: playerId, turn: get().currentTurn });
      set((state) => {
        // 첫 번째 플레이어가 입찰 없이 포기하는 경우 (auction이 null)
        if (!state.auction) {
          console.log(`[passBid] 첫 번째 플레이어 포기 - playerId: ${playerId}`);
          const newPassedPlayers = [playerId];
          const activePlayers = state.playerOrder.filter(p => !newPassedPlayers.includes(p));

          // 다음 입찰자 계산
          let nextBidder: PlayerId;
          if (activePlayers.length <= 1) {
            // 경매 종료 (모두 포기 또는 1명 남음)
            nextBidder = activePlayers[0] || state.playerOrder[0];
          } else {
            nextBidder = activePlayers[0];
          }

          return {
            auction: {
              currentBidder: nextBidder,
              highestBid: 0,
              highestBidder: null,
              passedPlayers: newPassedPlayers,
              bids: {} as Record<PlayerId, number>,
              lastActedPlayer: playerId,
            },
            currentPlayer: nextBidder,
            logs: [
              ...state.logs,
              {
                turn: state.currentTurn,
                phase: state.currentPhase,
                player: playerId,
                action: `입찰 포기 (첫 번째)`,
                timestamp: Date.now(),
              },
            ],
          };
        }

        const newPassedPlayers = [...state.auction.passedPlayers, playerId];

        // 다음 입찰자 계산 (패스한 플레이어 제외)
        const activePlayers = state.playerOrder.filter(p => !newPassedPlayers.includes(p));

        // 남은 플레이어가 1명 이하면 경매 종료 상태
        let nextBidder: PlayerId;
        if (activePlayers.length <= 1) {
          // 경매 종료 - 승자가 현재 플레이어가 됨
          nextBidder = state.auction.highestBidder || activePlayers[0] || state.playerOrder[0];
        } else {
          // 방금 포기한 playerId의 다음 순서부터 미포기 플레이어를 찾는다.
          // (lastActedPlayer 기반 계산은 그 플레이어가 이미 포기했을 때 indexOf가 -1이 되어
          //  첫 입찰자로 잘못 되돌아가는 버그 — 5인+ 경매에서 차례가 꼬임)
          const order = state.playerOrder;
          const start = order.indexOf(playerId);
          nextBidder = activePlayers[0];
          for (let i = 1; i <= order.length; i++) {
            const cand = order[(start + i) % order.length];
            if (activePlayers.includes(cand)) { nextBidder = cand; break; }
          }
        }

        return {
          auction: {
            ...state.auction,
            passedPlayers: newPassedPlayers,
            lastActedPlayer: playerId,
          },
          currentPlayer: nextBidder,
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

      // AI 턴 트리거 (중앙 집중식 스케줄러 사용)
      scheduleAICheck(get);
    },

    // Turn Order 패스: 탈락 없이 다음 입찰자로 넘어가기
    skipBid: (playerId) => {
      logAction('preparation', 'skipBid', { player: playerId, turn: get().currentTurn });
      set((state) => {
        if (!state.auction) {
          console.warn(`[WARN] skipBid: 경매 없음 - playerId: ${playerId}`);
          return state;
        }

        // 다음 입찰자 계산 (패스한 플레이어 제외)
        const activePlayers = state.playerOrder.filter(p => !state.auction!.passedPlayers.includes(p));
        const currentIndex = activePlayers.indexOf(playerId);
        const nextIndex = (currentIndex + 1) % activePlayers.length;
        const nextBidder = activePlayers[nextIndex];

        return {
          auction: {
            ...state.auction,
            lastActedPlayer: playerId,  // 마지막 행동자 업데이트 (passedPlayers에는 추가 안 함)
          },
          currentPlayer: nextBidder,
          logs: [
            ...state.logs,
            {
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: playerId,
              action: `Turn Order 패스 사용 (탈락 없음)`,
              timestamp: Date.now(),
            },
          ],
        };
      });

      // AI 턴 트리거 (중앙 집중식 스케줄러 사용)
      scheduleAICheck(get);
    },

    resolveAuction: () => {
      set((state) => {
        if (!state.auction) {
          console.warn('[WARN] resolveAuction: 경매 없음');
          return state;
        }

        const { highestBid, bids, passedPlayers } = state.auction;
        let { highestBidder } = state.auction;

        // 비용 지불 및 순서 결정
        const newPlayers = { ...state.players };
        const newPlayerOrder: PlayerId[] = [];

        // 다중 플레이어 경매 규칙 (룰북 기준):
        // - 첫 번째로 포기한 플레이어: 마지막 순서, $0 지불
        // - 마지막 2명 (승자 + 마지막 포기자): 각자 입찰액 전액 지불
        // - 나머지 포기자들 (중간): 입찰액의 절반 (올림) 지불

        // 포기 순서 복사 (원본 변경 방지)
        const passOrder = [...passedPlayers];
        const lastDropoutIndex = passOrder.length - 1;

        // highestBidder가 없으면 (모두 포기하거나 입찰 없이 완료된 경우)
        // 포기하지 않은 플레이어를 승자로 설정
        if (!highestBidder) {
          const activePlayers = state.activePlayers.filter(p => !passedPlayers.includes(p));
          if (activePlayers.length > 0) {
            highestBidder = activePlayers[0];
            console.log(`[resolveAuction] 입찰 없이 완료 - 승자: ${highestBidder}`);
          }
        }

        // 최고 입찰자가 1번 (전액 지불)
        if (highestBidder) {
          const bidderCash = newPlayers[highestBidder].cash - highestBid;
          if (bidderCash < 0) {
            console.warn(`[WARN] resolveAuction: 현금 부족 - ${highestBidder}, 입찰: $${highestBid}, 보유: $${newPlayers[highestBidder].cash}`);
          }
          newPlayers[highestBidder] = {
            ...newPlayers[highestBidder],
            cash: Math.max(0, bidderCash),
          };
          newPlayerOrder.push(highestBidder);
        }

        // 포기한 플레이어들 처리 (포기 역순으로 순서 결정)
        // 마지막 포기자부터 첫 번째 포기자까지 (1번 다음 순서부터)
        for (let i = lastDropoutIndex; i >= 0; i--) {
          const player = passOrder[i];
          if (newPlayerOrder.includes(player)) continue;

          const playerBid = bids[player] || 0;

          // 비용 계산
          if (i === 0) {
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
        for (const playerId of state.activePlayers) {
          if (!newPlayerOrder.includes(playerId)) {
            newPlayerOrder.push(playerId);
          }
        }

        console.log(`[resolveAuction] 새 playerOrder: [${newPlayerOrder.join(', ')}], 1번: ${newPlayerOrder[0]} (isAI: ${newPlayers[newPlayerOrder[0]]?.isAI})`);

        return {
          players: newPlayers,
          playerOrder: newPlayerOrder,
          auction: null,
          logs: [
            ...state.logs,
            {
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: highestBidder || state.playerOrder[0],
              action: highestBidder
                ? `경매 승리: ${newPlayers[highestBidder].name} ($${highestBid} 지불)`
                : '경매 없이 순서 유지',
              timestamp: Date.now(),
            },
          ],
        };
      });
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
