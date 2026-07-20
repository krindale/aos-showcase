// Phase IX 물품 성장 + Production(생산) slice (2026-07-03 스텝 3d 분리 — 로직 무변경, 코드 그대로 이동)
//
// goodsDisplay(슬롯/주머니) 조작 위주의 자기완결적 그룹 (로드맵 4순위 근거):
// growGoods(주사위 성장 + Berlin/Atlanta 보너스) · Production 5액션(미리보기 뽑기 →
// 슬롯 선택 → 확정/취소). 단계 진행(nextPhase의 goodsGrowth 진입 로직)은 gameStore에 잔류.
// GameStore 타입은 순환을 피하기 위해 type-only import (uiSlice/auctionSlice와 동일 패턴).

import type { StoreApi } from 'zustand';
import type { GameStore } from '../gameStore';
import { BoardState, CubeColor, HexCoord, GAME_CONSTANTS } from '@/types/game';
import { getMapData } from '@/utils/mapRegistry';
import { getMapProfile } from '@/maps/getMapProfile';
import { findCompletedLinks, isNightCity } from '@/utils/hexGrid';

type Set = StoreApi<GameStore>['setState'];
type Get = StoreApi<GameStore>['getState'];

/**
 * 달(Moon): 시드 도시(Moon Base)와 완성 링크 체인으로 이어진 도시 id 집합.
 * "선로로 연결된 도시만 성장" 판정용 — 링크 양끝(도시/마을)을 노드로 BFS (마을 경유 포함, 소유 무관).
 */
function citiesConnectedToSeed(board: BoardState, seedCityId: string): globalThis.Set<string> {
  const seed = board.cities.find((c) => c.id === seedCityId);
  if (!seed) return new Set();
  const key = (c: HexCoord) => `${c.col},${c.row}`;
  const adj = new Map<string, string[]>();
  for (const link of findCompletedLinks(board)) {
    const a = key(link.startCity);
    const b = key(link.endCity);
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  }
  const visited = new Set<string>([key(seed.coord)]);
  const queue = [key(seed.coord)];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
    }
  }
  return new Set(board.cities.filter((c) => visited.has(key(c.coord))).map((c) => c.id));
}

/** goodsGrowthSlice가 제공하는 액션 — 인터페이스 정의는 gameStore(GameStore)에 그대로, Pick으로 참조 */
export type GoodsGrowthSlice = Pick<
  GameStore,
  | 'growGoods'
  | 'getEmptySlots' | 'startProduction' | 'selectProductionSlot'
  | 'confirmProduction' | 'cancelProduction'
  | 'placeRepopulationCube'
>;

export function createGoodsGrowthSlice(set: Set, get: Get): GoodsGrowthSlice {
  return {
    // === Montréal Repopulation: production 선택 즉시 뽑힌 3개 중 1개를 도시에 배치 ===
    placeRepopulationCube: (cubeColor, cityId) => {
      const state = get();
      const drawn = state.phaseState.repopulationCubes ?? [];
      const holder = state.phaseState.repopulationPlayer;
      if (drawn.length === 0 || !holder) {
        console.warn('[placeRepopulationCube] 배치 대기 중인 Repopulation 없음');
        return false;
      }
      const cubeIdx = drawn.indexOf(cubeColor);
      if (cubeIdx === -1) {
        console.warn(`[placeRepopulationCube] 뽑은 큐브에 없는 색: ${cubeColor} (뽑음: ${drawn.join(',')})`);
        return false;
      }
      const city = state.board.cities.find(c => c.id === cityId);
      if (!city) {
        console.warn(`[placeRepopulationCube] 도시 없음: ${cityId}`);
        return false;
      }

      const rest = drawn.filter((_, i) => i !== cubeIdx);
      set({
        board: {
          ...state.board,
          cities: state.board.cities.map(c =>
            c.id === cityId ? { ...c, cubes: [...c.cubes, cubeColor] } : c
          ),
        },
        // 나머지 2개는 주머니로 반환
        goodsDisplay: { ...state.goodsDisplay, bag: [...state.goodsDisplay.bag, ...rest] },
        phaseState: {
          ...state.phaseState,
          repopulationCubes: [],
          repopulationPlayer: null,
        },
        // 보드 클릭 배치 선택 상태 정리 (로컬 UI)
        ui: { ...state.ui, repopulationCube: null },
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: holder,
            action: `Repopulation: ${cubeColor} 화물을 ${city.name}에 배치 (나머지 ${rest.length}개 주머니 반환)`,
            timestamp: Date.now(),
          },
        ],
      });
      console.log(`[Repopulation] ${holder}: ${cubeColor} → ${city.name}`);
      return true;
    },
    growGoods: (diceResults) => {
      set((state) => {
        // 멱등 가드: 이번 goodsGrowth에서 이미 주사위를 굴렸으면(goodsGrowthEvent 존재) 재실행 차단.
        // 봇 자동 진행이 결과 표시용으로 nextPhase를 1.2초 지연하는데, 그 창 동안 어떤 경로로든
        // growGoods가 다시 호출되면 슬롯 큐브를 또 도시로 옮겨 중복 성장한다. 진입 시 null 리셋되므로
        // (nextPhase의 goodsGrowth 진입) 정상 첫 호출은 통과, 재호출만 막힌다. 사람 경로도 함께 보호.
        if (state.goodsGrowthEvent) {
          console.warn('[growGoods] 이미 이번 턴 물품 성장을 굴림 — 중복 성장 차단');
          return state;
        }

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

        // === 달(Moon): "주사위 = 도시 인쇄 번호(1/2·3/4·5/6)" — 물품 디스플레이의 도시 열에서 성장 ===
        // 공식 룰(AOSD Exp Vol V): 디스플레이를 평소처럼 채워 두고, 주사위 눈이 도시의 두 번호 중
        // 하나와 일치하면 그 도시 열 위에서부터 큐브를 가져온다. 단 "낮쪽 + Moon Base와 완성 링크로
        // 연결된" 도시만 받을 수 있다 — 조건 미달이면 큐브는 디스플레이에 남는다.
        const moonProfile = getMapProfile(state.mapId);
        if (moonProfile.cityDiceGrowth) {
          const newSlots = [...state.goodsDisplay.slots];
          const newCities = state.board.cities.map(city => ({ ...city, cubes: [...city.cubes] }));
          const newLogs = [...state.logs];
          const growthDice = moonProfile.cityGrowthDice;
          const seedId = moonProfile.masterNetworkSeedCityId;
          const connected = seedId ? citiesConnectedToSeed(state.board, seedId) : null;
          const gained = new Map<string, CubeColor[]>(); // cityId → 추가된 큐브들

          // 디스플레이 열 시작 인덱스 (columnMapping rowCount 누적 — 표준 경로와 동일 계산)
          const moonColumnMapping = getMapData(state.mapId).columnMapping;
          const colByCity = new Map<string, { startIndex: number; rowCount: number }>();
          {
            let slotIndex = 0;
            for (const m of moonColumnMapping) {
              if (!m.isNewCity) colByCity.set(m.cityId, { startIndex: slotIndex, rowCount: m.rowCount });
              slotIndex += m.rowCount;
            }
          }

          for (const die of diceResults) {
            for (const [cityId, dice] of Object.entries(growthDice)) {
              if (!dice.includes(die)) continue;
              const city = newCities.find(c => c.id === cityId);
              if (!city) continue;
              if (isNightCity(city, state.board)) continue;          // 밤쪽 도시는 성장 없음
              if (connected && !connected.has(cityId)) continue;      // Moon Base 미연결 — 받지 못함
              const col = colByCity.get(cityId);
              if (!col) continue;
              // 그 도시 열의 위에서부터 첫 큐브를 도시로 이동 (없으면 성장 없음)
              for (let i = 0; i < col.rowCount; i++) {
                const idx = col.startIndex + i;
                const cube = newSlots[idx];
                if (cube) {
                  city.cubes.push(cube);
                  newSlots[idx] = null;
                  gained.set(cityId, [...(gained.get(cityId) ?? []), cube]);
                  break;
                }
              }
            }
          }

          const eventResults = Array.from(gained.entries()).map(([cityId, cubes]) => {
            const city = newCities.find(c => c.id === cityId)!;
            newLogs.push({
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: state.currentPlayer,
              action: `물품 성장: ${city.name}에 ${cubes.length}개 추가`,
              timestamp: Date.now(),
            });
            return { cityName: city.name, cubes };
          });

          return {
            goodsDisplay: { slots: newSlots, bag: [...state.goodsDisplay.bag] },
            board: { ...state.board, cities: newCities },
            phaseState: { ...state.phaseState, productionUsed: true },
            goodsGrowthEvent: { dice: [...diceResults], results: eventResults },
            logs: newLogs,
          };
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
