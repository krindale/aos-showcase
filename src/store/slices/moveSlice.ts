// Phase V 물품 이동 slice (2026-07-03 스텝 3f 분리 — 로직 무변경, 코드 그대로 이동)
//
// 이동 실행/정산 전부: moveGoods(사람/AI 공용 이동 커밋) · upgradeEngine(이동 대신 엔진 +1) ·
// moveTrackCube(St.Lucia 트랙 위 큐브 배달) · completeCubeMove(애니메이션 종료 시 income 정산 +
// 주머니 반환/보너스). 선택·애니메이션 UI(selectCube/selectDestinationCity/startCubeAnimation)는
// uiSlice에 있음. GameStore 타입은 순환을 피하기 위해 type-only import.

import type { StoreApi } from 'zustand';
import type { GameStore } from '../gameStore';
import { HexCoord, PlayerId, GAME_CONSTANTS, MovingCubeContext } from '@/types/game';
import { getMapProfile } from '@/maps/getMapProfile';
import { hexCoordsEqual, findTrackCubeDeliveries } from '@/utils/hexGrid';
import { logAction } from '@/utils/debugConfig';
import { releaseAILock } from '../helpers/aiScheduler';
import { captureUndo } from '../helpers/undo';

type Set = StoreApi<GameStore>['setState'];
type Get = StoreApi<GameStore>['getState'];

/** moveSlice가 제공하는 액션 — 인터페이스 정의는 gameStore(GameStore)에 그대로, Pick으로 참조 */
export type MoveSlice = Pick<
  GameStore,
  'moveGoods' | 'upgradeEngine' | 'moveTrackCube' | 'completeCubeMove'
>;

/**
 * 달(Moon) Low Gravitation(전용 8번째 행동): 이동 플레이어가 이번 수송 경로에서
 * 다른 플레이어의 링크 1개를 "내 링크처럼" 사용 — 그 링크 수입 1을 소유자 대신 내가 받는다.
 * incomeChanges(경로의 링크 소유자별 수입)를 계산한 직후 호출해 1을 이전한다.
 * 대상은 경로에서 수입을 가장 많이 얻은 상대(선두 견제 기본값) — 링크 수입은 전부 1이라 내 이득은 동일.
 * 수송(이동)마다 1회 자동 적용 = "두 수송 라운드 모두 사용 가능" 공식 룰 충족.
 */
export function applyLowGravitation(
  state: { mapId: string; players: GameStore['players']; activePlayers: PlayerId[] },
  movingPlayerId: PlayerId,
  incomeChanges: Partial<Record<PlayerId, number>>
): PlayerId | null {
  const profile = getMapProfile(state.mapId);
  if (!profile.extraActions.includes('lowGravitation')) return null;
  if (state.players[movingPlayerId]?.selectedAction !== 'lowGravitation') return null;
  let target: PlayerId | null = null;
  for (const pid of state.activePlayers) {
    if (pid === movingPlayerId) continue;
    const gain = incomeChanges[pid] ?? 0;
    if (gain > 0 && (target === null || gain > (incomeChanges[target] ?? 0))) target = pid;
  }
  if (!target) return null;
  incomeChanges[target] = (incomeChanges[target] ?? 0) - 1;
  incomeChanges[movingPlayerId] = (incomeChanges[movingPlayerId] ?? 0) + 1;
  return target;
}

export function createMoveSlice(set: Set, get: Get): MoveSlice {
  return {
    moveGoods: (cubeColor, path) => {
      set((state) => {
        if (path.length < 2) {
          console.warn(`[WARN] moveGoods: 경로 부족 - cubeColor: ${cubeColor}, pathLength: ${path.length}`);
          return state;
        }

        const fromCoord = path[0];
        // TODO: toCoord를 사용한 도착 도시 검증 로직 추가 예정

        // 출발 도시에서 큐브 제거
        const newCities = state.board.cities.map((city) => {
          if (city.coord.col === fromCoord.col && city.coord.row === fromCoord.row) {
            const cubeIndex = city.cubes.indexOf(cubeColor);
            if (cubeIndex >= 0) {
              return {
                ...city,
                cubes: city.cubes.filter((_, i) => i !== cubeIndex),
              };
            }
          }
          return city;
        });

        // 경로에서 완성된 링크 소유자 확인 및 수입 계산
        const incomeChanges: Partial<Record<PlayerId, number>> = {};
        state.activePlayers.forEach(p => { incomeChanges[p] = 0; });

        let currentLinkOwner: PlayerId | null = null;
        let inLink = false;
        let prevStopCoord: HexCoord | null = null;

        for (let i = 0; i < path.length; i++) {
          const coord = path[i];
          const isCity = state.board.cities.some(c => hexCoordsEqual(c.coord, coord));
          const isTown = state.board.towns.some(t => hexCoordsEqual(t.coord, coord));

          if (isCity || isTown) {
            if (inLink && currentLinkOwner) {
              // 도시/마을에 도착했으므로 이전 링크 완료, 소유자 수입 +1
              incomeChanges[currentLinkOwner] = (incomeChanges[currentLinkOwner] || 0) + 1;
            } else if (inLink && !currentLinkOwner && prevStopCoord) {
              // Germany 직결 링크: 사이 트랙 없이 두 도시가 바로 이어진 구간 → 직결 owner 수입 +1
              const a = state.board.cities.find(c => hexCoordsEqual(c.coord, prevStopCoord!));
              const b = state.board.cities.find(c => hexCoordsEqual(c.coord, coord));
              if (a && b) {
                const dl = (state.board.directLinks ?? []).find(d => d.owner &&
                  ((d.cityA === a.id && d.cityB === b.id) || (d.cityA === b.id && d.cityB === a.id)));
                if (dl?.owner && state.activePlayers.includes(dl.owner)) {
                  incomeChanges[dl.owner] = (incomeChanges[dl.owner] || 0) + 1;
                }
              }
            }
            // 새 링크 시작
            inLink = true;
            currentLinkOwner = null;
            prevStopCoord = coord;
          } else {
            // 트랙 구간: 소유자 확인 (한 링크는 한 소유자만 가짐)
            if (inLink && !currentLinkOwner) {
              const track = state.board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
              if (track?.owner) {
                currentLinkOwner = track.owner;
              }
            }
          }
        }

        // 달(Moon) Low Gravitation: 상대 링크 1개의 수입을 내가 가져온다 (수송마다 1회)
        applyLowGravitation(state, state.currentPlayer, incomeChanges);

        const newPlayers = { ...state.players };
        for (const playerId of state.activePlayers) {
          const incomeGain = incomeChanges[playerId] ?? 0;
          if (incomeGain > 0) {
            newPlayers[playerId] = {
              ...newPlayers[playerId],
              income: Math.min(
                newPlayers[playerId].income + incomeGain,
                GAME_CONSTANTS.MAX_INCOME
              ),
            };
          }
        }

        return {
          board: {
            ...state.board,
            cities: newCities,
          },
          players: newPlayers,
          phaseState: {
            ...state.phaseState,
            playerMoves: {
              ...state.phaseState.playerMoves,
              [state.currentPlayer]: true,
            },
          },
          ui: {
            ...state.ui,
            movePath: [],
            selectedCube: null,
          },
        };
      });
    },

    upgradeEngine: (targetPlayerId?: PlayerId) => {
      set((state) => {
        // targetPlayerId가 제공되면 사용, 아니면 currentPlayer 사용
        const playerId = targetPlayerId || state.currentPlayer;
        logAction('goodsMovement', 'upgradeEngine', { player: playerId, turn: state.currentTurn });
        const player = state.players[playerId];
        if (!player) {
          console.error(`[ERROR] upgradeEngine: 플레이어 없음 - playerId: ${playerId}`);
          return state;
        }
        if (player.engineLevel >= GAME_CONSTANTS.MAX_ENGINE) {
          console.warn(`[WARN] upgradeEngine: 최대 레벨 도달 - playerId: ${playerId}, engineLevel: ${player.engineLevel}`);
          return state;
        }
        // 이미 이동했으면 업그레이드 불가 (물품 이동 또는 업그레이드 중 택1)
        if (state.phaseState.playerMoves[playerId]) {
          console.warn(`[WARN] upgradeEngine: 이미 이동 완료 - playerId: ${playerId}`);
          return state;
        }
        // 이번 턴에 이미 엔진 업그레이드했으면 불가 (2 move round 통틀어 1회만 — 룰북)
        if (state.phaseState.engineUpgradedThisTurn?.[playerId]) {
          console.warn(`[WARN] upgradeEngine: 이번 턴 이미 엔진업 완료 - playerId: ${playerId}`);
          return state;
        }

        const oldLevel = player.engineLevel;
        const newLevel = player.engineLevel + 1;
        console.log(`[upgradeEngine] ${player.name}: 엔진 업그레이드 ${oldLevel} → ${newLevel}`);
        console.log(`[PLAY] T${state.currentTurn} ${playerId} 엔진업 ${oldLevel}→${newLevel}`);

        // 실행 취소 지원: 수송 기회를 엔진업에 잘못 쓴 경우 되돌려 화물 이동으로 바꿀 수 있게.
        // captureUndo가 AI 차례엔 no-op이므로 카운트 증가도 동일 조건 — 안 맞추면 팬텀 취소.
        const undoable = !state.players[state.currentPlayer]?.isAI;
        if (undoable) captureUndo(state, '엔진 업그레이드');

        return {
          undoCount: state.undoCount + (undoable ? 1 : 0),
          players: {
            ...state.players,
            [playerId]: {
              ...player,
              engineLevel: newLevel,
            },
          },
          phaseState: {
            ...state.phaseState,
            playerMoves: {
              ...state.phaseState.playerMoves,
              [playerId]: true,
            },
            // 턴당 1회 엔진업 — 라운드2로 넘어가도 유지돼 재업그레이드를 막는다
            engineUpgradedThisTurn: {
              ...state.phaseState.engineUpgradedThisTurn,
              [playerId]: true,
            },
          },
          logs: [
            ...state.logs,
            {
              turn: state.currentTurn,
              phase: state.currentPhase,
              player: playerId,
              action: `엔진 업그레이드: ${oldLevel} → ${newLevel} 링크`,
              timestamp: Date.now(),
            },
          ],
        };
      });
    },

    // ============================================================
    // St. Lucia: 트랙 위 큐브 배달 (미완성 링크 허용 + 보너스 수입)
    // ============================================================
    moveTrackCube: (trackId, destCityId) => {
      const state = get();
      const currentPlayer = state.currentPlayer;
      logAction('goodsMovement', 'moveTrackCube', { player: currentPlayer, trackId, dest: destCityId, turn: state.currentTurn });

      if (state.phaseState.playerMoves[currentPlayer]) {
        console.warn('[moveTrackCube] 이미 이번 라운드에 이동함');
        return false;
      }

      // 수송 시작 — 같은 도시로 가는 후보 루트를 모두 로그(사람/AI 공통), 그 다음 선택 루트 로그
      const deliveries = findTrackCubeDeliveries(
        state.board, trackId, state.players[state.currentPlayer]?.engineLevel ?? 1, state.currentPlayer,
        (cand) => logAction('goodsMovement', 'deliveryCandidate', { player: currentPlayer, trackId, ...cand }),
      );
      const delivery = deliveries.find(d => d.city.id === destCityId);
      if (!delivery) {
        console.warn(`[moveTrackCube] 배달 불가: track=${trackId} → ${destCityId}`);
        return false;
      }
      logAction('goodsMovement', 'deliverySelected', {
        player: currentPlayer, trackId, dest: destCityId,
        linkCount: delivery.linkCount, oppLinks: delivery.oppLinks,
        path: [...delivery.pathCoords, delivery.city.coord],
      });

      const track = state.board.trackTiles.find(t => t.id === trackId);
      if (!track || !track.cube) return false;
      const cubeColor = track.cube;

      // 큐브를 트랙에서 즉시 제거하고 애니메이션 시작
      // (수입/이동 완료 처리는 completeCubeMove에서 — 도시 큐브 배달과 동일한 흐름)
      const newTrackTiles = state.board.trackTiles.map(t =>
        t.id === trackId ? { ...t, cube: null } : t
      );
      const path = [...delivery.pathCoords, delivery.city.coord];
      const context: MovingCubeContext = {
        playerId: currentPlayer,
        phase: state.currentPhase,
        moveRound: state.phaseState.moveGoodsRound,
        trackCubeSectionOwner: delivery.sectionOwner,
      };

      set({
        board: { ...state.board, trackTiles: newTrackTiles },
        ui: {
          ...state.ui,
          movingCube: { color: cubeColor, path, currentIndex: 0, context },
          movePath: path,
          selectedCube: null,
          reachableDestinations: [],
        },
      });

      console.log(`[moveTrackCube] ${currentPlayer}: ${cubeColor} → ${destCityId} 애니메이션 시작 (구간 소유 ${delivery.sectionOwner ?? '없음'})`);
      // [PLAY] 사람 플레이 분석용 — 배달 링크 깊이(4-5링크 목표 확인)
      console.log(`[PLAY] T${state.currentTurn} ${currentPlayer} 배달 ${cubeColor}→${destCityId} ${delivery.linkCount}링크 (경로 ${path.map(c => `(${c.col},${c.row})`).join('→')})`);
      return true;
    },

    completeCubeMove: () => {
      const state = get();
      if (!state.ui.movingCube) return;
      logAction('goodsMovement', 'completeCubeMove', { player: state.currentPlayer, turn: state.currentTurn });

      const { path, color, context } = state.ui.movingCube;

      // 캡처된 컨텍스트에서 플레이어 ID 사용 (레이스 컨디션 방지)
      const movingPlayerId = context.playerId;

      // 경로의 트랙 소유자에게 수입 추가 (동적 플레이어 지원)
      const incomeChanges: Partial<Record<PlayerId, number>> = {};
      state.activePlayers.forEach(p => { incomeChanges[p] = 0; });

      const { cities, towns, trackTiles } = state.board;
      const isStopAt = (coord: HexCoord) =>
        cities.some(c => hexCoordsEqual(c.coord, coord)) ||
        towns.some(t => hexCoordsEqual(t.coord, coord));

      // 링크 계산 시작점: 일반 큐브는 출발 도시(path[0]),
      // 트랙 큐브(St. Lucia)는 첫 도착 정거장 — 시작 구간은 아래에서 별도 +1
      let linkStartIndex = 0;

      if (context.trackCubeSectionOwner !== undefined) {
        // 룰북(St. Lucia): 큐브가 놓인 시작 구간은 미완성 링크여도 소유자에게 수입 1 제공
        // (이후 지나가는 완성 링크들은 일반 규칙대로 각각 +1)
        const owner = context.trackCubeSectionOwner;
        if (owner && state.activePlayers.includes(owner)) {
          incomeChanges[owner] = (incomeChanges[owner] || 0) + 1;
        }
        const firstStop = path.findIndex((coord, idx) => idx > 0 && isStopAt(coord));
        linkStartIndex = firstStop === -1 ? path.length : firstStop;
      }

      // 링크별로 수입 계산 (도시/마을 → 다음 도시/마을 = 1 링크)
      // 룰북: "물품이 지나가는 각 완성된 철도 링크마다 해당 링크 소유자의 수입이 1 증가"
      for (let i = linkStartIndex + 1; i < path.length; i++) {
        if (isStopAt(path[i])) {
          // 이 링크(linkStartIndex → i) 구간의 트랙 소유자 찾기
          let credited = false;
          for (let j = linkStartIndex + 1; j < i; j++) {
            const track = trackTiles.find(t => hexCoordsEqual(t.coord, path[j]));
            if (track?.owner) {
              incomeChanges[track.owner] = (incomeChanges[track.owner] || 0) + 1;
              credited = true;
              break; // 링크당 한 번만 계산 (같은 링크 내 트랙은 같은 소유자)
            }
          }
          // Germany 직결 링크: 사이 트랙 없이 두 도시가 바로 이어진 구간 → 직결 owner에게 수입 +1
          if (!credited) {
            const a = cities.find(c => hexCoordsEqual(c.coord, path[linkStartIndex]));
            const b = cities.find(c => hexCoordsEqual(c.coord, path[i]));
            if (a && b) {
              const dl = (state.board.directLinks ?? []).find(d => d.owner &&
                ((d.cityA === a.id && d.cityB === b.id) || (d.cityA === b.id && d.cityB === a.id)));
              if (dl?.owner && state.activePlayers.includes(dl.owner)) {
                incomeChanges[dl.owner] = (incomeChanges[dl.owner] || 0) + 1;
              }
            }
          }
          linkStartIndex = i; // 다음 링크 시작점 업데이트
        }
      }

      // Western US: 동(east)↔서(west) 배달 +$1 income 보너스 (배달한 플레이어에게).
      // 출발/도착이 모두 east/west 도시여야 함 — 중앙 도시(Denver/SLC)·마을·트랙 출발은 보너스 없음.
      // Southern US: 면화(흰 큐브) 배달 +$1 보너스 (cubeDeliveryBonus).
      const profile = getMapProfile(state.mapId);
      {
        const fromCity = cities.find(c => hexCoordsEqual(c.coord, path[0]));
        const toCity = cities.find(c => hexCoordsEqual(c.coord, path[path.length - 1]));
        const regionBonus = profile.regionDeliveryBonus(fromCity?.region, toCity?.region)
          + profile.cubeDeliveryBonus(color);
        if (regionBonus > 0 && state.activePlayers.includes(movingPlayerId)) {
          incomeChanges[movingPlayerId] = (incomeChanges[movingPlayerId] || 0) + regionBonus;
        }
      }

      // 달(Moon) Low Gravitation: 상대 링크 1개의 수입을 내가 가져온다 (수송마다 1회)
      const lowGravTarget = applyLowGravitation(state, movingPlayerId, incomeChanges);
      if (lowGravTarget) {
        console.log(`[Low Gravitation] ${state.players[movingPlayerId]?.name}이 ${state.players[lowGravTarget]?.name}의 링크 수입 1을 가져옴`);
      }

      const newPlayers = { ...state.players };
      for (const playerId of state.activePlayers) {
        const incomeGain = incomeChanges[playerId] ?? 0;
        if (incomeGain > 0) {
          newPlayers[playerId] = {
            ...newPlayers[playerId],
            income: Math.min(
              newPlayers[playerId].income + incomeGain,
              GAME_CONSTANTS.MAX_INCOME
            ),
          };
        }
      }

      // 총 링크 수 계산 (로그용)
      const totalLinks = Object.values(incomeChanges).reduce((a, b) => a + b, 0);

      // 도착지 수익 펄스 이벤트 — 수입 얻은 플레이어만, 증가량 내림차순(동률이면 수송자 먼저).
      // BoardPulses가 도착 도시 위에 표시하고 스냅샷으로 게스트에게도 전파된다.
      const incomeGains = state.activePlayers
        .map(p => ({ player: p, amount: incomeChanges[p] ?? 0 }))
        .filter(g => g.amount > 0)
        .sort((a, b) => b.amount - a.amount
          || (a.player === movingPlayerId ? -1 : b.player === movingPlayerId ? 1 : 0));

      // 캡처된 플레이어 ID 사용 (state.currentPlayer 대신)
      set({
        players: newPlayers,
        ...(incomeGains.length > 0
          ? { deliveryIncomeEvent: { dest: path[path.length - 1], gains: incomeGains, key: Date.now() } }
          : {}),
        // 룰북 V: "이동 완료 후 큐브는 미사용 물품 주머니로 반환" — 반환하지 않으면 주머니가
        // 게임 진행에 따라 고갈돼 생산(Production)·물품 성장 보충·Berlin 보너스가 어긋난다.
        // 단 Southern US 면화(흰 큐브)는 배달 후 게임에서 제거 (룰북: removed from the game).
        goodsDisplay: {
          ...state.goodsDisplay,
          bag: profile.deliveredCubeLeavesGame(color)
            ? [...state.goodsDisplay.bag]
            : [...state.goodsDisplay.bag, color],
        },
        phaseState: {
          ...state.phaseState,
          playerMoves: {
            ...state.phaseState.playerMoves,
            [movingPlayerId]: true,  // 캡처된 플레이어 ID 사용
          },
        },
        ui: {
          ...state.ui,
          movingCube: null,
          movePath: [],
          selectedCube: null,
          reachableDestinations: [],
        },
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: context.phase,  // 캡처된 phase 사용
            player: movingPlayerId,  // 캡처된 플레이어 ID 사용
            action: context.trackCubeSectionOwner !== undefined
              ? `${color} 트랙 큐브 배달 (${totalLinks} 링크 수입, 시작 구간 소유 ${context.trackCubeSectionOwner ?? '없음'})`
              : `${color} 물품 배달 (${totalLinks} 링크, +${incomeChanges[movingPlayerId] ?? 0} 수입)`,
            timestamp: Date.now(),
          },
        ],
      });

      // 물품 이동 완료 후 AI 락 해제 및 다음 단계로 진행
      // AI의 'move' 액션에서 락을 유지했으므로 여기서 해제
      const currentExecId = state.aiExecution.executionId;
      if (state.aiExecution.pending && currentExecId > 0) {
        releaseAILock(currentExecId, get, set);
      }

      get().nextPhase();
    },
  };
}
