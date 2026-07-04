// Phase IX 물품 성장 + Production(생산) slice (2026-07-03 스텝 3d 분리 — 로직 무변경, 코드 그대로 이동)
//
// goodsDisplay(슬롯/주머니) 조작 위주의 자기완결적 그룹 (로드맵 4순위 근거):
// growGoods(주사위 성장 + Berlin/Atlanta 보너스) · Production 5액션(미리보기 뽑기 →
// 슬롯 선택 → 확정/취소). 단계 진행(nextPhase의 goodsGrowth 진입 로직)은 gameStore에 잔류.
// GameStore 타입은 순환을 피하기 위해 type-only import (uiSlice/auctionSlice와 동일 패턴).

import type { StoreApi } from 'zustand';
import type { GameStore } from '../gameStore';
import { CubeColor, GAME_CONSTANTS } from '@/types/game';
import { getMapData } from '@/utils/mapRegistry';
import { getMapProfile } from '@/maps/getMapProfile';

type Set = StoreApi<GameStore>['setState'];
type Get = StoreApi<GameStore>['getState'];

/** goodsGrowthSlice가 제공하는 액션 — 인터페이스 정의는 gameStore(GameStore)에 그대로, Pick으로 참조 */
export type GoodsGrowthSlice = Pick<
  GameStore,
  | 'growGoods'
  | 'getEmptySlots' | 'startProduction' | 'selectProductionSlot'
  | 'confirmProduction' | 'cancelProduction'
>;

export function createGoodsGrowthSlice(set: Set, get: Get): GoodsGrowthSlice {
  return {
    growGoods: (diceResults) => {
      set((state) => {
        // 방어: 배치 가능한 사람 생산 홀더가 아직 배치를 안 했으면 주사위 진행을 막는다(룰북: 생산→주사위).
        // UI(GoodsGrowthPanel)가 이미 잠그지만, 어떤 경로로든 미완료 상태 주사위가 오면 no-op로 차단.
        // (배치 불가한 홀더는 goodsGrowth 진입 시 productionUsed 자동 완료되므로 여기서 안 걸린다.)
        const pendingHolder = Object.values(state.players).find(
          p => p.selectedAction === 'production' && !p.isAI && !p.eliminated
        );
        if (pendingHolder && !state.phaseState.productionUsed) {
          console.warn('[growGoods] 생산 미완료 — 주사위 차단 (홀더 물품 배치 대기)');
          return state;
        }

        // Production은 이제 수동으로 처리됨 (startProduction/confirmProduction)
        // 여기서는 주사위 결과에 따른 물품 성장만 처리

        const newSlots = [...state.goodsDisplay.slots];
        const newBag = [...state.goodsDisplay.bag];
        const newCities = state.board.cities.map(city => ({ ...city, cubes: [...city.cubes] }));
        const newLogs = [...state.logs];

        // 열-도시 매핑 (맵 레지스트리의 columnMapping에서 유도).
        // 한 주사위 번호를 여러 도시 열이 공유할 수 있다 (Rust Belt: 12도시가 6번호를 2개씩).
        // diceNumber 미지정 시 columnId를 숫자로 해석 (Tutorial '1'~'6' 하위 호환).
        const columnMapping = getMapData(state.mapId).columnMapping;
        type ColInfo = { cityId: string; startIndex: number; rowCount: number };
        const colsByDice: Record<number, ColInfo[]> = {};
        {
          let slotIndex = 0;
          for (const m of columnMapping) {
            const startIndex = slotIndex;
            slotIndex += m.rowCount;
            // 신규 도시 열도 diceNumber가 있으면 보충 대상.
            // 배치 안 된 신규 도시는 아래에서 city를 못 찾아(if (!city) continue) 자동으로 건너뛴다.
            const dice = m.diceNumber ?? Number(m.columnId);
            if (!Number.isFinite(dice)) continue;
            if (!colsByDice[dice]) colsByDice[dice] = [];
            colsByDice[dice].push({ cityId: m.cityId, startIndex, rowCount: m.rowCount });
          }
        }

        // 주사위 번호별 출현 횟수
        const diceCounts: Record<number, number> = {};
        for (const result of diceResults) {
          diceCounts[result] = (diceCounts[result] || 0) + 1;
        }

        // noOwnColorCubes: 도시 자기 색 화물은 도시에 배치하지 않음 (튜토리얼)
        const skipOwnColor = getMapProfile(state.mapId).noOwnColorCubes;
        // 한국: 평양·수원은 물품 성장 안 받음 (columnMapping에서 이미 제외되지만 방어 가드)
        const noGrowthCityIds = new Set(getMapProfile(state.mapId).noGrowthCityIds);

        // 게스트에게도 보여줄 결과(도시별 추가된 큐브 색) 수집 — goodsGrowthEvent로 스냅샷 동기화
        const eventResults: { cityName: string; cubes: CubeColor[] }[] = [];

        // 주사위 번호 → 그 번호를 공유하는 모든 도시 열에서 각각 count개씩 도시로 이동
        for (const [diceStr, count] of Object.entries(diceCounts)) {
          const cols = colsByDice[Number(diceStr)];
          if (!cols) continue;
          for (const col of cols) {
            if (noGrowthCityIds.has(col.cityId)) continue; // 평양·수원 성장 제외
            const city = newCities.find(c => c.id === col.cityId);
            if (!city) continue;

            // 위에서부터 큐브 가져오기 (자기 색 큐브는 건너뛰고 다음 큐브를 가져옴)
            const movedCubes: CubeColor[] = [];
            for (let i = 0; i < col.rowCount && movedCubes.length < count; i++) {
              const slotIdx = col.startIndex + i;
              const cube = newSlots[slotIdx];
              if (cube && (!skipOwnColor || cube !== city.color)) {
                city.cubes.push(cube);
                newSlots[slotIdx] = null;
                movedCubes.push(cube);
              }
            }

            if (movedCubes.length > 0) {
              eventResults.push({ cityName: city.name, cubes: movedCubes });
              newLogs.push({
                turn: state.currentTurn,
                phase: state.currentPhase,
                player: state.currentPlayer,
                action: `물품 성장: ${city.name}에 ${movedCubes.length}개 추가`,
                timestamp: Date.now(),
              });
            }
          }
        }

        // Germany: Berlin은 매 물품 성장마다 주머니에서 무작위 큐브 1개를 받는다
        // Southern US: Atlanta는 1~4턴만 (bonusCityCubeMaxTurn — 남북전쟁 전 호황)
        const bonusProfile = getMapProfile(state.mapId);
        const bonusCityId = bonusProfile.bonusCityCubeId;
        const bonusMaxTurn = bonusProfile.bonusCityCubeMaxTurn;
        if (bonusCityId && (bonusMaxTurn == null || state.currentTurn <= bonusMaxTurn) && newBag.length > 0) {
          // 주머니는 이미 셔플돼 있으므로 pop으로 무작위 1개 — Math.random 미사용(시드 결정성 유지)
          const cube = newBag.pop();
          const bonusCity = newCities.find(c => c.id === bonusCityId);
          if (bonusCity && cube) {
            bonusCity.cubes.push(cube);
            console.log(`[Berlin 보너스] T${state.currentTurn} ${bonusCity.name}에 ${cube} 큐브 +1 (매 턴 물품 성장)`);
            newLogs.push({
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: state.currentPlayer,
              action: `${bonusCity.name} 보너스 물품 +1 (${cube})`,
              timestamp: Date.now(),
            });
          }
        }

        return {
          goodsDisplay: {
            slots: newSlots,
            bag: newBag,
          },
          board: {
            ...state.board,
            cities: newCities,
          },
          phaseState: {
            ...state.phaseState,
            productionUsed: true,
          },
          // 방장이 굴린 주사위와 도시별 추가 큐브 — 게스트도 스냅샷으로 동일하게 본다
          goodsGrowthEvent: { dice: [...diceResults], results: eventResults },
          logs: newLogs,
        };
      });
    },

    // === Production (생산) ===
    getEmptySlots: () => {
      const state = get();
      const emptySlots: number[] = [];
      state.goodsDisplay.slots.forEach((slot, index) => {
        if (slot === null) {
          emptySlots.push(index);
        }
      });
      return emptySlots;
    },

    startProduction: () => {
      const state = get();
      const currentPlayer = state.currentPlayer;
      const player = state.players[currentPlayer];

      // Production 행동을 선택한 플레이어만 가능
      if (player.selectedAction !== 'production') {
        return;
      }

      // 이미 Production 사용됨
      if (state.phaseState.productionUsed) {
        return;
      }

      // 주머니에서 큐브 뽑기 (미리보기). 배치는 빈 칸에만 가능하므로 빈 칸 수도 상한 —
      // 빈 칸이 1개인데 2개를 뽑으면 2번째를 놓을 곳이 없어 확정 불가(스턱)했다.
      const bag = [...state.goodsDisplay.bag];
      const cubes: CubeColor[] = [];
      const emptyCount = state.goodsDisplay.slots.filter(s => s === null).length;
      const drawCount = Math.min(GAME_CONSTANTS.PRODUCTION_CUBE_COUNT, emptyCount, bag.length);

      for (let i = 0; i < drawCount; i++) {
        const cube = bag.pop();
        if (cube) cubes.push(cube);
      }

      if (cubes.length === 0) {
        return;
      }

      set({
        ui: {
          ...state.ui,
          productionMode: true,
          productionCubes: cubes,
          selectedProductionSlots: [],
        },
      });
    },

    selectProductionSlot: (slotIndex) => {
      const state = get();

      if (!state.ui.productionMode) return;

      // 해당 슬롯이 비어있는지 확인
      if (state.goodsDisplay.slots[slotIndex] !== null) return;

      const currentSlots = [...state.ui.selectedProductionSlots];
      const maxSlots = state.ui.productionCubes.length;

      // 이미 선택된 슬롯이면 선택 해제
      const existingIndex = currentSlots.indexOf(slotIndex);
      if (existingIndex >= 0) {
        currentSlots.splice(existingIndex, 1);
      } else {
        // 최대 선택 수 체크
        if (currentSlots.length >= maxSlots) {
          // 가장 먼저 선택한 것 제거하고 새로 추가
          currentSlots.shift();
        }
        currentSlots.push(slotIndex);
      }

      set({
        ui: {
          ...state.ui,
          selectedProductionSlots: currentSlots,
        },
      });
    },

    confirmProduction: () => {
      const state = get();

      if (!state.ui.productionMode) return false;

      const selectedSlots = state.ui.selectedProductionSlots;
      const cubes = state.ui.productionCubes;

      // 선택된 슬롯 수가 큐브 수와 같아야 함
      if (selectedSlots.length !== cubes.length) return false;

      // 새 슬롯 배열 생성
      const newSlots = [...state.goodsDisplay.slots];
      const newBag = [...state.goodsDisplay.bag];

      // 선택된 슬롯에 큐브 배치
      selectedSlots.forEach((slotIndex, i) => {
        newSlots[slotIndex] = cubes[i];
        // 주머니에서 실제로 제거 (이미 startProduction에서 뽑았지만, 확인차 다시 처리)
        const bagIndex = newBag.indexOf(cubes[i]);
        if (bagIndex >= 0) {
          newBag.splice(bagIndex, 1);
        }
      });

      // 주머니에서 사용된 큐브 제거 (실제로 제거)
      const finalBag = [...state.goodsDisplay.bag];
      for (let i = 0; i < cubes.length; i++) {
        finalBag.pop();
      }

      set({
        goodsDisplay: {
          slots: newSlots,
          bag: finalBag,
        },
        phaseState: {
          ...state.phaseState,
          productionUsed: true,
        },
        ui: {
          ...state.ui,
          productionMode: false,
          productionCubes: [],
          selectedProductionSlots: [],
        },
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: state.currentPlayer,
            action: `Production: 물품 ${cubes.length}개 디스플레이에 배치`,
            timestamp: Date.now(),
          },
        ],
      });

      return true;
    },

    cancelProduction: () => {
      set((state) => ({
        ui: {
          ...state.ui,
          productionMode: false,
          productionCubes: [],
          selectedProductionSlots: [],
        },
      }));
    },
  };
}
