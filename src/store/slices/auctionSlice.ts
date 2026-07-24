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
          // ⚠️ 최고입찰자(highestBidder)는 건너뛴다 — 남이 자기 위로 올리기 전엔 다시 차례를
          //  줄 이유가 없고, Turn Order 스킵(skipBid) 플레이어가 활성으로 남아 순환이
          //  최고입찰자에게 되돌아가면 그가 (이미 1등인데) 포기를 눌러 스스로 순서를 무너뜨리는
          //  버그가 난다. (passBid는 highestBidder를 갱신하지 않아 포기해도 1등으로 남는다)
          const highestBidder = state.auction.highestBidder;
          const order = state.playerOrder;
          const start = order.indexOf(playerId);
          nextBidder = activePlayers.find(p => p !== highestBidder) ?? activePlayers[0];
          for (let i = 1; i <= order.length; i++) {
            const cand = order[(start + i) % order.length];
            if (activePlayers.includes(cand) && cand !== highestBidder) { nextBidder = cand; break; }
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
        // 첫 순서 플레이어가 아직 아무도 입찰하지 않은 상태(auction=null)에서 Turn Order 패스를
        // 쓰는 경우 — 탈락 없이 다음 플레이어로 넘기고, 자기는 경매 그룹에 남는다(passedPlayers에
        // 넣지 않음). 이 케이스를 빼면 첫 플레이어의 Turn Order 패스가 무시돼 화면이 멈춘다.
        if (!state.auction) {
          const order = state.playerOrder;
          const idx = order.indexOf(playerId);
          const nextBidder = order[(idx + 1) % order.length];
          return {
            auction: {
              currentBidder: nextBidder,
              highestBid: 0,
              highestBidder: null,
              passedPlayers: [],
              bids: {} as Record<PlayerId, number>,
              lastActedPlayer: playerId,
            },
            currentPlayer: nextBidder,
            players: {
              ...state.players,
              [playerId]: { ...state.players[playerId], turnOrderPassUsed: true },
            },
            logs: [
              ...state.logs,
              {
                turn: state.currentTurn,
                phase: state.currentPhase,
                player: playerId,
                action: `Turn Order 패스 사용 (첫 순서, 탈락 없음)`,
                timestamp: Date.now(),
              },
            ],
          };
        }

        // 다음 입찰자 계산 (패스한 플레이어 제외, 최고입찰자는 건너뜀 — passBid와 동일 이유)
        const highestBidder = state.auction.highestBidder;
        const activePlayers = state.playerOrder.filter(p => !state.auction!.passedPlayers.includes(p));
        const currentIndex = activePlayers.indexOf(playerId);

        // 나·최고입찰자를 뺀 "더 부를 수 있는 사람"이 없으면 = 최고입찰자만 남음 → 경매 종료.
        // Turn Order 패스는 탈락이 아니지만 여기서 더 부를 사람이 없으므로, 나를 마지막
        // 포기자(=승자 다음 순서)로 넣어 경매를 끝낸다.
        // ⚠️ 이 처리가 없으면 최고입찰자를 건너뛴 뒤 한 바퀴 돌아 "나 자신"이 다음 입찰자로
        //    잡혀 "Turn Order 패스를 썼는데 계속 내 입찰 차례"가 된다 (실플레이 버그).
        const othersCanBid = activePlayers.filter(p => p !== playerId && p !== highestBidder);
        if (othersCanBid.length === 0) {
          return {
            auction: {
              ...state.auction,
              passedPlayers: [...state.auction.passedPlayers, playerId],
              lastActedPlayer: playerId,
            },
            currentPlayer: highestBidder ?? playerId,
            players: {
              ...state.players,
              [playerId]: { ...state.players[playerId], turnOrderPassUsed: true },
            },
            logs: [
              ...state.logs,
              {
                turn: state.currentTurn,
                phase: state.currentPhase,
                player: playerId,
                action: `Turn Order 패스 — 남은 입찰자가 없어 경매 종료`,
                timestamp: Date.now(),
              },
            ],
          };
        }

        let nextBidder = othersCanBid[0];
        for (let i = 1; i <= activePlayers.length; i++) {
          const cand = activePlayers[(currentIndex + i) % activePlayers.length];
          if (cand !== highestBidder && cand !== playerId) { nextBidder = cand; break; }
        }

        return {
          auction: {
            ...state.auction,
            lastActedPlayer: playerId,  // 마지막 행동자 업데이트 (passedPlayers에는 추가 안 함)
          },
          currentPlayer: nextBidder,
          // 패스 사용 처리를 여기서 중앙화한다 — AI/테스트도 skipBid를 직접 호출하므로
          // 외부(AuctionPanel/호스트 intent)에서만 세팅하면 봇이 플래그를 못 세워 매 라운드 무한 스킵.
          players: {
            ...state.players,
            [playerId]: { ...state.players[playerId], turnOrderPassUsed: true },
          },
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
          // ⚠️ 파산자 제외 — activePlayers는 좌석 전체(탈락자 포함)라 그대로 쓰면
          // 파산한 플레이어가 "포기하지 않은 사람"으로 잡혀 1번 순서가 된다 (2026-07-24 검증).
          const activePlayers = state.activePlayers.filter(
            p => !passedPlayers.includes(p) && !newPlayers[p]?.eliminated
          );
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

        // Montréal 경매 트윅: 입찰 없이 패스한 플레이어가 2인 이상이면 그들은 이번 턴 특수 행동 선택 불가
        const penaltyLogs: typeof state.logs = [];
        if (getMapProfile(state.mapId).auctionNoBidPassPenalty) {
          const noBidPassers = passedPlayers.filter(p => !((bids[p] ?? 0) > 0));
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
