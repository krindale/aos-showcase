// Phase VI-VIII 정산 slice (2026-07-03 스텝 3g 분리 — 로직 무변경, 코드 그대로 이동)
//
// 턴 정산 3단계: collectIncome(수입 수집) · payExpenses(비용 지불·파산 처리) ·
// applyIncomeReduction(수입 감소 — Southern US 남북전쟁 2배 배수 포함).
// 단계 전환 자체는 gameStore의 nextPhase가 오케스트레이션 (이 액션들을 호출).
// GameStore 타입은 순환을 피하기 위해 type-only import.

import type { StoreApi } from 'zustand';
import type { GameStore } from '../gameStore';
import { PlayerId, GamePhase, GAME_CONSTANTS } from '@/types/game';
import { getMapProfile } from '@/maps/getMapProfile';
import { logAction } from '@/utils/debugConfig';

type Set = StoreApi<GameStore>['setState'];
type Get = StoreApi<GameStore>['getState'];

/** settlementSlice가 제공하는 액션 — 인터페이스 정의는 gameStore(GameStore)에 그대로, Pick으로 참조 */
export type SettlementSlice = Pick<
  GameStore,
  'collectIncome' | 'payExpenses' | 'applyIncomeReduction'
>;

// _get: 다른 slice와 동일한 합성 시그니처 유지용 (정산 3액션은 set만 사용)
export function createSettlementSlice(set: Set, _get: Get): SettlementSlice {
  return {
    collectIncome: () => {
      set((state) => {
        const newPlayers = { ...state.players };
        const newLogs = [...state.logs];

        for (const playerId of state.activePlayers) {
          const player = newPlayers[playerId];
          if (!player) continue;
          const incomeCollected = Math.max(0, player.income);
          newPlayers[playerId] = {
            ...player,
            cash: player.cash + incomeCollected,
          };

          // 각 플레이어 수입 수집 로깅
          newLogs.push({
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: playerId,
            action: `수입 수집: $${incomeCollected}`,
            timestamp: Date.now(),
          });
        }

        // 새 턴 수입 수집 시점에 직전 수입 감소 배지 초기화 (한 턴 동안만 노출)
        return { players: newPlayers, logs: newLogs, incomeReductions: null };
      });
    },

    payExpenses: () => {
      set((state) => {
        const newPlayers = { ...state.players };
        let newBoard = state.board;
        const bankruptPlayers: PlayerId[] = [];
        const newLogs = [...state.logs];

        console.log(`[payExpenses] 시작 - activePlayers: ${state.activePlayers.join(', ')}`);

        for (const playerId of state.activePlayers) {
          const player = newPlayers[playerId];
          if (!player) continue;

          // 이미 탈락한 플레이어는 건너뛰기
          if (player.eliminated) {
            console.log(`[payExpenses] ${player.name}: 이미 탈락 - 스킵`);
            continue;
          }

          // Montréal: 정부 전용 엔진(DGEL)도 비용에 합산 (원본 룰: 일반 엔진 + DGEL + 주식)
          const expense = player.issuedShares + player.engineLevel + (player.dgel ?? 0);
          console.log(`[payExpenses] ${player.name}: expense=${expense} (shares=${player.issuedShares} + engine=${player.engineLevel} + dgel=${player.dgel ?? 0}), cash=${player.cash}, income=${player.income}`);

          if (player.cash >= expense) {
            // 현금으로 지불 가능
            console.log(`[payExpenses] ${player.name}: 현금 지불 가능 - cash ${player.cash} → ${player.cash - expense}`);
            newPlayers[playerId] = {
              ...player,
              cash: player.cash - expense,
            };
          } else {
            // 현금 부족 시 수입 감소
            const shortage = expense - player.cash;
            const newIncome = player.income - shortage;

            console.log(`[payExpenses] ${player.name}: 현금 부족 - shortage=${shortage}, newIncome=${newIncome}, MIN_INCOME=${GAME_CONSTANTS.MIN_INCOME}`);

            // 파산 체크: 수입이 MIN_INCOME 미만이면 파산
            if (newIncome < GAME_CONSTANTS.MIN_INCOME) {
              // 파산 처리
              console.log(`[payExpenses] ${player.name}: 파산! (newIncome ${newIncome} < MIN_INCOME ${GAME_CONSTANTS.MIN_INCOME})`);
              bankruptPlayers.push(playerId);
              newPlayers[playerId] = {
                ...player,
                cash: 0,
                income: GAME_CONSTANTS.MIN_INCOME,
                eliminated: true,
              };

              newLogs.push({
                turn: state.currentTurn,
                phase: state.currentPhase,
                player: playerId,
                action: `${player.name} 파산! (비용 $${expense}, 현금 $${player.cash}, 수입 ${player.income})`,
                timestamp: Date.now(),
              });
            } else {
              // 수입 감소로 비용 충당
              console.log(`[payExpenses] ${player.name}: 수입 감소로 충당 - income ${player.income} → ${newIncome}`);
              newPlayers[playerId] = {
                ...player,
                cash: 0,
                income: newIncome,
              };

              newLogs.push({
                turn: state.currentTurn,
                phase: state.currentPhase,
                player: playerId,
                action: `비용 지불: 현금 부족으로 수입 ${shortage} 감소 (${player.income} → ${newIncome})`,
                timestamp: Date.now(),
              });
            }
          }
        }

        // 파산한 플레이어의 모든 트랙을 공용(미소유)으로 전환.
        // 룰: 미완성 트랙은 소유 디스크를 제거하고, 완성 링크는 보드에 남되 파산자는 그 위
        // 운송으로 수입을 받지 못한다. → 완성/미완성 모두 owner를 null로 만들면, 누구나 그
        // 위로 이동할 수 있는 공용 철도가 되고, 소유자가 없으므로 그 링크 운송으로는 아무도
        // 수입을 받지 못한다 (복합 트랙의 secondaryOwner, 마을 가닥 townSpur도 동일).
        if (bankruptPlayers.length > 0) {
          console.log(`[payExpenses] 파산 플레이어: ${bankruptPlayers.join(', ')} — 철도를 공용으로 전환`);
          const updatedTrackTiles = newBoard.trackTiles.map(track => {
            let t = track;
            if (track.owner && bankruptPlayers.includes(track.owner)) t = { ...t, owner: null };
            if (t.secondaryOwner && bankruptPlayers.includes(t.secondaryOwner)) t = { ...t, secondaryOwner: null };
            return t;
          });
          const updatedTownSpurs = (newBoard.townSpurs ?? []).filter(
            sp => sp.owner === null || !bankruptPlayers.includes(sp.owner)
          );
          newBoard = {
            ...newBoard,
            trackTiles: updatedTrackTiles,
            townSpurs: updatedTownSpurs,
          };
        }

        // 남은 플레이어 수 체크 - 1명만 남으면 게임 종료
        const remainingPlayers = state.activePlayers.filter(
          pid => !newPlayers[pid]?.eliminated
        );

        console.log(`[payExpenses] 남은 플레이어: ${remainingPlayers.length}명 (${remainingPlayers.join(', ')})`);

        if (remainingPlayers.length <= 1) {
          const winner = remainingPlayers[0];
          const winnerName = winner ? newPlayers[winner]?.name : '없음';

          console.log(`[payExpenses] 게임 종료! 승자: ${winnerName}`);

          newLogs.push({
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: winner || state.currentPlayer,
            action: `게임 종료! ${winnerName} 승리 (상대 파산)`,
            timestamp: Date.now(),
          });

          return {
            players: newPlayers,
            board: newBoard,
            logs: newLogs,
            currentPhase: 'gameOver' as GamePhase,
            winner: winner || null,
          };
        }

        // 파산자는 이후 모든 단계에서 차례를 받지 않는다 (룰북 VII: 게임에서 탈락).
        // 차례 계산은 20곳 넘게 흩어져 있지만 전부 playerOrder를 순회하므로, 여기서 한 번
        // 빼면 주식 발행·경매·행동 선택·건설·이동이 모두 자동으로 파산자를 건너뛴다.
        // ⚠️ activePlayers(좌석)는 건드리지 않는다 — 온라인 mySeat 매핑이 좌석 인덱스 기준이라
        // 여기서 빼면 남의 좌석으로 밀린다. 파산자는 좌석을 유지한 채 관전한다.
        const survivingOrder = bankruptPlayers.length > 0
          ? state.playerOrder.filter((pid) => !bankruptPlayers.includes(pid))
          : state.playerOrder;

        return {
          players: newPlayers,
          board: newBoard,
          logs: newLogs,
          playerOrder: survivingOrder,
          // 파산 알림 팝업용 1회성 이벤트 (온라인 스냅샷으로 전파 — 게스트도 동일하게 본다).
          // key로 중복 재생을 막는다 (BankruptcyModal이 "최초 관측 key는 스킵").
          ...(bankruptPlayers.length > 0
            ? {
                bankruptcyEvent: {
                  key: `${state.currentTurn}-${bankruptPlayers.join(',')}`,
                  turn: state.currentTurn,
                  players: bankruptPlayers.map((pid) => ({
                    id: pid,
                    name: newPlayers[pid]?.name ?? pid,
                  })),
                },
              }
            : {}),
        };
      });
    },

    applyIncomeReduction: () => {
      set((state) => {
        const newPlayers = { ...state.players };
        const newLogs = [...state.logs];
        // 이번 감소량을 플레이어별로 기록 → PlayerPanel "-N (수익 감소)" 배지
        const reductions: Partial<Record<PlayerId, number>> = {};
        // Southern US: 4턴(남북전쟁)에는 수입 감소 2배 — 플레이어 루프 밖에서 1회 계산
        const incomeReductionMult = getMapProfile(state.mapId).incomeReductionMultiplier(state.currentTurn);

        for (const playerId of state.activePlayers) {
          const player = newPlayers[playerId];
          if (!player) continue;
          let reduction = 0;

          for (const rule of GAME_CONSTANTS.INCOME_REDUCTION) {
            if (player.income >= rule.min && player.income <= rule.max) {
              reduction = rule.reduction;
              break;
            }
          }

          reduction *= incomeReductionMult;

          if (reduction > 0) {
            const oldIncome = player.income;
            const newIncome = Math.max(player.income - reduction, GAME_CONSTANTS.MIN_INCOME);
            const applied = oldIncome - newIncome;
            newPlayers[playerId] = {
              ...player,
              income: newIncome,
            };
            if (applied > 0) reductions[playerId] = applied;

            // 수입 감소 로깅
            newLogs.push({
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: playerId,
              action: `수입 감소: ${oldIncome} → ${newIncome} (-${reduction})`,
              timestamp: Date.now(),
            });
          }
        }

        // 분석용: 수입 감소 결과(배수 포함)를 :3999 미러에 기록 — Southern US 4턴 2배 검증용
        logAction('turnEnd', 'incomeReduction', {
          turn: state.currentTurn,
          multiplier: incomeReductionMult,
          reductions,
        });

        return {
          players: newPlayers,
          logs: newLogs,
          incomeReductions: Object.keys(reductions).length > 0 ? reductions : null,
        };
      });
    },
  };
}
