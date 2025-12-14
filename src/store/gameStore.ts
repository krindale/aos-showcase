// Zustand 게임 상태 관리

import { create } from 'zustand';
import {
  GameState,
  PlayerId,
  GamePhase,
  SpecialAction,
  HexCoord,
  TrackTile,
  CubeColor,
  PlayerState,
  GAME_CONSTANTS,
} from '@/types/game';
import {
  createInitialBoardState,
  initializeGoodsDisplay,
} from '@/utils/rustBeltMap';
import {
  isValidConnectionPoint,
  validateFirstTrackRule,
  validateTrackConnection,
  playerHasTrack,
} from '@/utils/trackValidation';
import {
  getBuildableNeighbors,
  getExitDirections,
  hexCoordsEqual,
} from '@/utils/hexGrid';

// === 초기 상태 생성 ===
function createInitialPlayerState(
  id: PlayerId,
  name: string,
  color: 'orange' | 'blue'
): PlayerState {
  return {
    id,
    name,
    color,
    cash: GAME_CONSTANTS.STARTING_CASH,
    income: GAME_CONSTANTS.STARTING_INCOME,
    engineLevel: GAME_CONSTANTS.STARTING_ENGINE,
    issuedShares: GAME_CONSTANTS.STARTING_SHARES,
    selectedAction: null,
    turnOrderPassUsed: false,
  };
}

function createInitialGameState(
  mapId: string,
  player1Name: string,
  player2Name: string
): GameState {
  const boardState = createInitialBoardState();
  const goodsDisplay = initializeGoodsDisplay();

  // 도시에 물품 배치
  const bag = [...goodsDisplay.bag];
  const citiesWithCubes = boardState.cities.map((city) => {
    const cubes: CubeColor[] = [];
    for (let i = 0; i < 2; i++) {
      if (bag.length > 0) {
        cubes.push(bag.pop()!);
      }
    }
    return { ...city, cubes };
  });

  return {
    // 메타 정보
    gameId: `game-${Date.now()}`,
    mapId,
    maxTurns: GAME_CONSTANTS.TWO_PLAYER_TURNS,

    // 턴 진행
    currentTurn: 1,
    currentPhase: 'issueShares',
    currentPlayer: 'player1',
    playerOrder: ['player1', 'player2'],

    // 플레이어
    players: {
      player1: createInitialPlayerState('player1', player1Name, 'orange'),
      player2: createInitialPlayerState('player2', player2Name, 'blue'),
    },

    // 보드
    board: {
      ...boardState,
      cities: citiesWithCubes,
    },
    goodsDisplay: {
      slots: goodsDisplay.slots,
      bag,
    },

    // 경매
    auction: null,

    // 단계 상태
    phaseState: {
      builtTracksThisTurn: 0,
      maxTracksThisTurn: GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
      moveGoodsRound: 1,
      playerMoves: { player1: false, player2: false },
      productionUsed: false,
      locomotiveUsed: false,
    },

    // UI 상태
    ui: {
      selectedHex: null,
      selectedCube: null,
      previewTrack: null,
      highlightedHexes: [],
      movePath: [],
      // 트랙 건설 UI 상태
      buildMode: 'idle',
      sourceHex: null,
      buildableNeighbors: [],
      targetHex: null,
      entryEdge: null,
      exitDirections: [],
    },

    // 로그
    logs: [],

    // 결과
    winner: null,
    finalScores: null,
  };
}

// === 스토어 인터페이스 ===
interface GameStore extends GameState {
  // 게임 초기화
  initGame: (mapId: string, player1Name: string, player2Name: string) => void;
  resetGame: () => void;

  // 주식 발행
  issueShare: (playerId: PlayerId, amount: number) => void;

  // 플레이어 순서 경매
  placeBid: (playerId: PlayerId, amount: number) => void;
  passBid: (playerId: PlayerId) => void;
  resolveAuction: () => void;

  // 행동 선택
  selectAction: (playerId: PlayerId, action: SpecialAction) => void;

  // 트랙 건설
  buildTrack: (coord: HexCoord, edges: [number, number]) => boolean;
  canBuildTrack: (coord: HexCoord, edges: [number, number]) => boolean;

  // 물품 이동
  moveGoods: (cubeColor: CubeColor, path: HexCoord[]) => void;
  upgradeEngine: () => void;

  // 수입/비용
  collectIncome: () => void;
  payExpenses: () => void;
  applyIncomeReduction: () => void;

  // 물품 성장
  growGoods: (diceResults: number[]) => void;

  // 단계/턴 진행
  nextPhase: () => void;
  endTurn: () => void;

  // UI 상태
  selectHex: (coord: HexCoord | null) => void;
  selectCube: (cityId: string, cubeIndex: number) => void;
  clearSelection: () => void;
  setPreviewTrack: (track: { coord: HexCoord; edges: [number, number] } | null) => void;
  setHighlightedHexes: (hexes: HexCoord[]) => void;
  setMovePath: (path: HexCoord[]) => void;

  // 트랙 건설 UI
  selectSourceHex: (coord: HexCoord) => void;       // 연결점 선택
  selectTargetHex: (coord: HexCoord) => void;       // 대상 헥스 선택 (나가는 방향 선택 UI 표시)
  selectExitDirection: (exitEdge: number) => boolean;  // 나가는 방향 선택하여 트랙 건설
  updateTrackPreview: (targetCoord: HexCoord) => void;  // 호버 시 미리보기 업데이트
  resetBuildMode: () => void;                       // 빌드 모드 초기화

  // 로그
  addLog: (action: string) => void;
}

// === 스토어 생성 ===
export const useGameStore = create<GameStore>((set, get) => ({
  // 초기 상태 (빈 게임)
  ...createInitialGameState('rust-belt', 'Player 1', 'Player 2'),

  // === 게임 초기화 ===
  initGame: (mapId, player1Name, player2Name) => {
    set(createInitialGameState(mapId, player1Name, player2Name));
  },

  resetGame: () => {
    const state = get();
    set(createInitialGameState(state.mapId, 'Player 1', 'Player 2'));
  },

  // === 주식 발행 ===
  issueShare: (playerId, amount) => {
    set((state) => {
      const player = state.players[playerId];
      const maxShares = GAME_CONSTANTS.MAX_SHARES - player.issuedShares;
      const actualAmount = Math.min(amount, maxShares);

      if (actualAmount <= 0) return state;

      return {
        players: {
          ...state.players,
          [playerId]: {
            ...player,
            issuedShares: player.issuedShares + actualAmount,
            cash: player.cash + actualAmount * GAME_CONSTANTS.SHARE_VALUE,
          },
        },
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: playerId,
            action: `주식 ${actualAmount}주 발행 (+$${actualAmount * GAME_CONSTANTS.SHARE_VALUE})`,
            timestamp: Date.now(),
          },
        ],
      };
    });
  },

  // === 플레이어 순서 경매 ===
  placeBid: (playerId, amount) => {
    set((state) => {
      if (!state.auction) {
        // 경매 시작
        return {
          auction: {
            currentBidder: playerId,
            highestBid: amount,
            highestBidder: playerId,
            passedPlayers: [],
            bids: { [playerId]: amount } as Record<PlayerId, number>,
          },
        };
      }

      // 입찰
      if (amount <= state.auction.highestBid) return state;

      return {
        auction: {
          ...state.auction,
          currentBidder: playerId,
          highestBid: amount,
          highestBidder: playerId,
          bids: {
            ...state.auction.bids,
            [playerId]: amount,
          },
        },
      };
    });
  },

  passBid: (playerId) => {
    set((state) => {
      if (!state.auction) return state;

      const newPassedPlayers = [...state.auction.passedPlayers, playerId];

      return {
        auction: {
          ...state.auction,
          passedPlayers: newPassedPlayers,
        },
      };
    });
  },

  resolveAuction: () => {
    set((state) => {
      if (!state.auction) return state;

      const { highestBidder, highestBid, bids, passedPlayers } = state.auction;

      // 비용 지불 및 순서 결정
      const newPlayers = { ...state.players };
      const newPlayerOrder: PlayerId[] = [];

      // 최고 입찰자가 1번
      if (highestBidder) {
        newPlayers[highestBidder] = {
          ...newPlayers[highestBidder],
          cash: newPlayers[highestBidder].cash - highestBid,
        };
        newPlayerOrder.push(highestBidder);
      }

      // 나머지 플레이어 (패스 순서대로 역순)
      for (const player of passedPlayers.reverse()) {
        if (!newPlayerOrder.includes(player)) {
          // 패스한 플레이어는 입찰액의 절반 지불 (첫 번째 패스 제외)
          const playerBid = bids[player] || 0;
          if (playerBid > 0 && passedPlayers.indexOf(player) > 0) {
            newPlayers[player] = {
              ...newPlayers[player],
              cash: newPlayers[player].cash - Math.ceil(playerBid / 2),
            };
          }
          newPlayerOrder.push(player);
        }
      }

      return {
        players: newPlayers,
        playerOrder: newPlayerOrder,
        auction: null,
      };
    });
  },

  // === 행동 선택 ===
  selectAction: (playerId, action) => {
    set((state) => {
      // 이미 선택된 행동인지 확인
      const alreadySelected = Object.values(state.players).some(
        (p) => p.selectedAction === action
      );
      if (alreadySelected) return state;

      const newState: Partial<GameState> = {
        players: {
          ...state.players,
          [playerId]: {
            ...state.players[playerId],
            selectedAction: action,
          },
        },
      };

      // Locomotive 즉시 적용
      if (action === 'locomotive') {
        const player = state.players[playerId];
        if (player.engineLevel < GAME_CONSTANTS.MAX_ENGINE) {
          newState.players = {
            ...newState.players!,
            [playerId]: {
              ...newState.players![playerId],
              engineLevel: player.engineLevel + 1,
            },
          };
          newState.phaseState = {
            ...state.phaseState,
            locomotiveUsed: true,
          };
        }
      }

      // Engineer 효과
      if (action === 'engineer') {
        newState.phaseState = {
          ...state.phaseState,
          maxTracksThisTurn: GAME_CONSTANTS.ENGINEER_TRACK_LIMIT,
        };
      }

      return newState as GameState;
    });
  },

  // === 트랙 건설 ===
  canBuildTrack: (coord, edges) => {
    const state = get();
    const currentPlayer = state.currentPlayer;

    // 트랙 제한 확인
    if (state.phaseState.builtTracksThisTurn >= state.phaseState.maxTracksThisTurn) {
      return false;
    }

    const { board } = state;

    // 유효한 헥스인지 확인 (도시, 호수 제외)
    const isCity = board.cities.some(c => hexCoordsEqual(c.coord, coord));
    if (isCity) return false;

    const hexTile = board.hexTiles.find(h => hexCoordsEqual(h.coord, coord));
    if (hexTile && hexTile.terrain === 'lake') return false;

    // 이미 트랙이 있는지 확인
    const existingTrack = board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
    if (existingTrack) return false;

    // 연결성 검증
    const hasExistingTrack = playerHasTrack(board, currentPlayer);

    if (!hasExistingTrack) {
      // 첫 트랙: 도시에 인접해야 함
      if (!validateFirstTrackRule(coord, edges, board)) {
        return false;
      }
    } else {
      // 후속 트랙: 기존 트랙/도시에 연결되어야 함
      if (!validateTrackConnection(coord, edges, board, currentPlayer)) {
        return false;
      }
    }

    return true;
  },

  buildTrack: (coord, edges) => {
    const state = get();

    if (!state.canBuildTrack(coord, edges)) {
      return false;
    }

    const currentPlayer = state.currentPlayer;
    const terrain = state.board.hexTiles.find(
      (h) => hexCoordsEqual(h.coord, coord)
    )?.terrain || 'plain';

    // 비용 계산
    let cost = GAME_CONSTANTS.PLAIN_TRACK_COST;
    if (terrain === 'river') cost = GAME_CONSTANTS.RIVER_TRACK_COST;
    if (terrain === 'mountain') cost = GAME_CONSTANTS.MOUNTAIN_TRACK_COST;

    const player = state.players[currentPlayer];
    if (player.cash < cost) {
      return false;
    }

    const newTrack: TrackTile = {
      id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      coord,
      edges,
      owner: currentPlayer,
    };

    set({
      board: {
        ...state.board,
        trackTiles: [...state.board.trackTiles, newTrack],
      },
      players: {
        ...state.players,
        [currentPlayer]: {
          ...player,
          cash: player.cash - cost,
        },
      },
      phaseState: {
        ...state.phaseState,
        builtTracksThisTurn: state.phaseState.builtTracksThisTurn + 1,
      },
      logs: [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: currentPlayer,
          action: `트랙 건설 (${coord.col}, ${coord.row}) - $${cost}`,
          timestamp: Date.now(),
        },
      ],
    });

    return true;
  },

  // === 물품 이동 ===
  moveGoods: (cubeColor, path) => {
    set((state) => {
      if (path.length < 2) return state;

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

      // 경로의 트랙 소유자에게 수입 추가
      const incomeChanges: Record<PlayerId, number> = { player1: 0, player2: 0 };

      for (let i = 0; i < path.length - 1; i++) {
        const track = state.board.trackTiles.find(
          (t) =>
            (t.coord.col === path[i].col && t.coord.row === path[i].row) ||
            (t.coord.col === path[i + 1].col && t.coord.row === path[i + 1].row)
        );
        if (track?.owner) {
          incomeChanges[track.owner]++;
        }
      }

      const newPlayers = { ...state.players };
      for (const [playerId, incomeGain] of Object.entries(incomeChanges)) {
        if (incomeGain > 0) {
          newPlayers[playerId as PlayerId] = {
            ...newPlayers[playerId as PlayerId],
            income: Math.min(
              newPlayers[playerId as PlayerId].income + incomeGain,
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

  upgradeEngine: () => {
    set((state) => {
      const player = state.players[state.currentPlayer];
      if (player.engineLevel >= GAME_CONSTANTS.MAX_ENGINE) return state;

      return {
        players: {
          ...state.players,
          [state.currentPlayer]: {
            ...player,
            engineLevel: player.engineLevel + 1,
          },
        },
        phaseState: {
          ...state.phaseState,
          playerMoves: {
            ...state.phaseState.playerMoves,
            [state.currentPlayer]: true,
          },
        },
      };
    });
  },

  // === 수입/비용 ===
  collectIncome: () => {
    set((state) => {
      const newPlayers = { ...state.players };

      for (const playerId of Object.keys(newPlayers) as PlayerId[]) {
        const player = newPlayers[playerId];
        newPlayers[playerId] = {
          ...player,
          cash: player.cash + Math.max(0, player.income),
        };
      }

      return { players: newPlayers };
    });
  },

  payExpenses: () => {
    set((state) => {
      const newPlayers = { ...state.players };

      for (const playerId of Object.keys(newPlayers) as PlayerId[]) {
        const player = newPlayers[playerId];
        const expense = player.issuedShares + player.engineLevel;

        if (player.cash >= expense) {
          newPlayers[playerId] = {
            ...player,
            cash: player.cash - expense,
          };
        } else {
          // 현금 부족 시 수입 감소
          const shortage = expense - player.cash;
          newPlayers[playerId] = {
            ...player,
            cash: 0,
            income: Math.max(player.income - shortage, GAME_CONSTANTS.MIN_INCOME),
          };
        }
      }

      return { players: newPlayers };
    });
  },

  applyIncomeReduction: () => {
    set((state) => {
      const newPlayers = { ...state.players };

      for (const playerId of Object.keys(newPlayers) as PlayerId[]) {
        const player = newPlayers[playerId];
        let reduction = 0;

        for (const rule of GAME_CONSTANTS.INCOME_REDUCTION) {
          if (player.income >= rule.min && player.income <= rule.max) {
            reduction = rule.reduction;
            break;
          }
        }

        if (reduction > 0) {
          newPlayers[playerId] = {
            ...player,
            income: Math.max(player.income - reduction, GAME_CONSTANTS.MIN_INCOME),
          };
        }
      }

      return { players: newPlayers };
    });
  },

  // === 물품 성장 ===
  growGoods: (diceResults) => {
    set((state) => {
      // Production 행동 처리
      const productionPlayer = Object.values(state.players).find(
        (p) => p.selectedAction === 'production'
      );

      const newSlots = [...state.goodsDisplay.slots];
      const newBag = [...state.goodsDisplay.bag];
      const newCities = [...state.board.cities];

      // Production: 2개 추가 배치
      if (productionPlayer && !state.phaseState.productionUsed) {
        for (let i = 0; i < 2 && newBag.length > 0; i++) {
          const emptySlot = newSlots.findIndex((s) => s === null);
          if (emptySlot >= 0) {
            newSlots[emptySlot] = newBag.pop()!;
          }
        }
      }

      // 주사위 결과에 따른 물품 배치
      // 각 열(1-6)에 해당하는 주사위 수만큼 큐브 배치
      const columnCounts: Record<number, number> = {};
      for (const result of diceResults) {
        columnCounts[result] = (columnCounts[result] || 0) + 1;
      }

      // 물품 디스플레이에서 도시로 이동
      // (간소화된 구현 - 실제로는 더 복잡한 로직 필요)

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
      };
    });
  },

  // === 단계/턴 진행 ===
  nextPhase: () => {
    set((state) => {
      const phases: GamePhase[] = [
        'issueShares',
        'determinePlayerOrder',
        'selectActions',
        'buildTrack',
        'moveGoods',
        'collectIncome',
        'payExpenses',
        'incomeReduction',
        'goodsGrowth',
        'advanceTurn',
      ];

      const currentIndex = phases.indexOf(state.currentPhase);
      const playerOrder = state.playerOrder;
      const otherPlayer = state.currentPlayer === 'player1' ? 'player2' : 'player1';

      // === I. 주식 발행 단계 ===
      if (state.currentPhase === 'issueShares') {
        // 플레이어 2까지 완료했으면 다음 단계로
        if (state.currentPlayer === playerOrder[1]) {
          return {
            currentPhase: 'determinePlayerOrder' as GamePhase,
            currentPlayer: playerOrder[0],
          };
        }
        // 플레이어 1 완료 → 플레이어 2로 전환
        return {
          currentPlayer: playerOrder[1],
        };
      }

      // === II. 플레이어 순서 결정 ===
      if (state.currentPhase === 'determinePlayerOrder') {
        return {
          currentPhase: 'selectActions' as GamePhase,
          currentPlayer: playerOrder[0],
        };
      }

      // === III. 행동 선택 단계 ===
      if (state.currentPhase === 'selectActions') {
        // 두 플레이어 모두 행동을 선택했는지 확인
        const player1HasAction = state.players.player1.selectedAction !== null;
        const player2HasAction = state.players.player2.selectedAction !== null;

        if (player1HasAction && player2HasAction) {
          // 두 플레이어 모두 선택 완료 → 다음 단계
          // First Build 확인
          const firstBuildPlayer = Object.entries(state.players).find(
            ([, p]) => p.selectedAction === 'firstBuild'
          )?.[0] as PlayerId | undefined;

          return {
            currentPhase: 'buildTrack' as GamePhase,
            currentPlayer: firstBuildPlayer || playerOrder[0],
            phaseState: {
              ...state.phaseState,
              builtTracksThisTurn: 0,
              maxTracksThisTurn: state.players[state.currentPlayer].selectedAction === 'engineer'
                ? GAME_CONSTANTS.ENGINEER_TRACK_LIMIT
                : GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
            },
          };
        }

        // 현재 플레이어가 선택했으면 다른 플레이어로 전환
        if (state.players[state.currentPlayer].selectedAction !== null) {
          return {
            currentPlayer: otherPlayer,
          };
        }

        // 아직 선택 안 했으면 상태 유지
        return state;
      }

      // === IV. 트랙 건설 단계 ===
      if (state.currentPhase === 'buildTrack') {
        // 두 플레이어 모두 건설 기회를 가졌는지 확인
        const bothPlayersBuilt = state.phaseState.playerMoves.player1 && state.phaseState.playerMoves.player2;

        if (bothPlayersBuilt || state.currentPlayer === playerOrder[1]) {
          // First Move 확인
          const firstMovePlayer = Object.entries(state.players).find(
            ([, p]) => p.selectedAction === 'firstMove'
          )?.[0] as PlayerId | undefined;

          return {
            currentPhase: 'moveGoods' as GamePhase,
            currentPlayer: firstMovePlayer || playerOrder[0],
            phaseState: {
              ...state.phaseState,
              moveGoodsRound: 1,
              playerMoves: { player1: false, player2: false },
            },
          };
        }

        // 다음 플레이어로 전환
        return {
          currentPlayer: otherPlayer,
          phaseState: {
            ...state.phaseState,
            builtTracksThisTurn: 0,
            maxTracksThisTurn: state.players[otherPlayer].selectedAction === 'engineer'
              ? GAME_CONSTANTS.ENGINEER_TRACK_LIMIT
              : GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
            playerMoves: {
              ...state.phaseState.playerMoves,
              [state.currentPlayer]: true,
            },
          },
        };
      }

      // === V. 물품 이동 단계 ===
      if (state.currentPhase === 'moveGoods') {
        const bothPlayersMoved = state.phaseState.playerMoves.player1 && state.phaseState.playerMoves.player2;

        if (bothPlayersMoved) {
          // 라운드 2까지 완료했으면 다음 단계
          if (state.phaseState.moveGoodsRound >= 2) {
            return {
              currentPhase: 'collectIncome' as GamePhase,
              currentPlayer: playerOrder[0],
            };
          }

          // 라운드 2로 진행
          const firstMovePlayer = Object.entries(state.players).find(
            ([, p]) => p.selectedAction === 'firstMove'
          )?.[0] as PlayerId | undefined;

          return {
            phaseState: {
              ...state.phaseState,
              moveGoodsRound: 2,
              playerMoves: { player1: false, player2: false },
            },
            currentPlayer: firstMovePlayer || playerOrder[0],
          };
        }

        // 다음 플레이어로 전환
        return {
          currentPlayer: otherPlayer,
          phaseState: {
            ...state.phaseState,
            playerMoves: {
              ...state.phaseState.playerMoves,
              [state.currentPlayer]: true,
            },
          },
        };
      }

      // === VI-X. 자동 단계들 ===
      const nextIndex = (currentIndex + 1) % phases.length;
      const nextPhaseName = phases[nextIndex];

      // advanceTurn 후에는 새 턴 시작
      if (nextPhaseName === 'issueShares' && currentIndex === phases.length - 1) {
        // 게임 종료 확인
        if (state.currentTurn >= state.maxTurns) {
          return {
            currentPhase: 'gameOver' as GamePhase,
          };
        }

        return {
          ...state,
          currentPhase: nextPhaseName,
          currentTurn: state.currentTurn + 1,
          currentPlayer: playerOrder[0],
          phaseState: {
            builtTracksThisTurn: 0,
            maxTracksThisTurn: GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
            moveGoodsRound: 1,
            playerMoves: { player1: false, player2: false },
            productionUsed: false,
            locomotiveUsed: false,
          },
          players: {
            player1: { ...state.players.player1, selectedAction: null },
            player2: { ...state.players.player2, selectedAction: null },
          },
        };
      }

      return {
        currentPhase: nextPhaseName,
        currentPlayer: playerOrder[0],
      };
    });
  },

  endTurn: () => {
    const state = get();

    // 모든 단계 자동 실행
    state.collectIncome();
    state.payExpenses();
    state.applyIncomeReduction();

    set((prevState) => ({
      currentTurn: prevState.currentTurn + 1,
      currentPhase: 'issueShares',
      currentPlayer: prevState.playerOrder[0],
      phaseState: {
        builtTracksThisTurn: 0,
        maxTracksThisTurn: GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
        moveGoodsRound: 1,
        playerMoves: { player1: false, player2: false },
        productionUsed: false,
        locomotiveUsed: false,
      },
      players: {
        player1: { ...prevState.players.player1, selectedAction: null },
        player2: { ...prevState.players.player2, selectedAction: null },
      },
    }));
  },

  // === UI 상태 ===
  selectHex: (coord) => {
    set((state) => ({
      ui: { ...state.ui, selectedHex: coord },
    }));
  },

  selectCube: (cityId, cubeIndex) => {
    set((state) => ({
      ui: { ...state.ui, selectedCube: { cityId, cubeIndex } },
    }));
  },

  clearSelection: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        selectedHex: null,
        selectedCube: null,
        previewTrack: null,
        highlightedHexes: [],
        movePath: [],
        // 트랙 건설 UI 초기화
        buildMode: 'idle',
        sourceHex: null,
        buildableNeighbors: [],
        targetHex: null,
        entryEdge: null,
        exitDirections: [],
      },
    }));
  },

  setPreviewTrack: (track) => {
    set((state) => ({
      ui: { ...state.ui, previewTrack: track },
    }));
  },

  setHighlightedHexes: (hexes) => {
    set((state) => ({
      ui: { ...state.ui, highlightedHexes: hexes },
    }));
  },

  setMovePath: (path) => {
    set((state) => ({
      ui: { ...state.ui, movePath: path },
    }));
  },

  // === 트랙 건설 UI ===
  selectSourceHex: (coord) => {
    const state = get();
    const currentPlayer = state.currentPlayer;

    // 유효한 연결점인지 확인 (도시 또는 플레이어의 트랙)
    if (!isValidConnectionPoint(coord, state.board, currentPlayer)) {
      return;
    }

    // 건설 가능한 이웃 헥스 계산
    const neighbors = getBuildableNeighbors(coord, state.board, currentPlayer);

    // 하이라이트할 헥스 목록
    const highlightedHexes = neighbors.map(n => n.coord);

    set({
      ui: {
        ...state.ui,
        buildMode: 'source_selected',
        sourceHex: coord,
        buildableNeighbors: neighbors,
        highlightedHexes,
        selectedHex: coord,
        previewTrack: null,
        targetHex: null,
        entryEdge: null,
        exitDirections: [],
      },
    });
  },

  selectTargetHex: (coord) => {
    const state = get();

    if (state.ui.buildMode !== 'source_selected' || !state.ui.sourceHex) {
      return;
    }

    // 타겟이 건설 가능한 이웃인지 확인
    const neighbor = state.ui.buildableNeighbors.find(
      n => hexCoordsEqual(n.coord, coord)
    );

    if (!neighbor) {
      return;
    }

    // 나갈 수 있는 방향들 계산 (들어오는 방향 제외)
    const exitDirs = getExitDirections(coord, neighbor.targetEdge, state.board);

    // 하이라이트: 나갈 수 있는 방향의 이웃 헥스들
    const highlightedHexes = exitDirs.map(d => d.neighborCoord);

    set({
      ui: {
        ...state.ui,
        buildMode: 'target_selected',
        targetHex: coord,
        entryEdge: neighbor.targetEdge,
        exitDirections: exitDirs,
        highlightedHexes,
        selectedHex: coord,
        previewTrack: null,
      },
    });
  },

  selectExitDirection: (exitEdge) => {
    const state = get();

    if (state.ui.buildMode !== 'target_selected' || !state.ui.targetHex || state.ui.entryEdge === null) {
      return false;
    }

    // 유효한 출구인지 확인
    const exitDir = state.ui.exitDirections.find(d => d.exitEdge === exitEdge);
    if (!exitDir) {
      return false;
    }

    // 트랙 건설: targetHex에 트랙 배치
    // edges: [들어오는 엣지, 나가는 엣지]
    const edges: [number, number] = [state.ui.entryEdge, exitEdge];

    const success = state.buildTrack(state.ui.targetHex, edges);

    if (success) {
      // 빌드 모드 초기화
      state.resetBuildMode();
    }

    return success;
  },

  updateTrackPreview: (targetCoord) => {
    const state = get();

    // source_selected 모드: 타겟 헥스 위에서 직선 트랙 미리보기
    if (state.ui.buildMode === 'source_selected' && state.ui.sourceHex) {
      const neighbor = state.ui.buildableNeighbors.find(
        n => hexCoordsEqual(n.coord, targetCoord)
      );

      if (neighbor) {
        // 직선 트랙 미리보기 (반대편 엣지)
        const oppositeEdge = (neighbor.targetEdge + 3) % 6;
        set({
          ui: {
            ...state.ui,
            previewTrack: {
              coord: targetCoord,
              edges: [neighbor.targetEdge, oppositeEdge] as [number, number],
            },
          },
        });
      } else {
        set({ ui: { ...state.ui, previewTrack: null } });
      }
      return;
    }

    // target_selected 모드: 나가는 방향 위에서 커브/직선 트랙 미리보기
    if (state.ui.buildMode === 'target_selected' && state.ui.targetHex && state.ui.entryEdge !== null) {
      // 마우스가 있는 헥스가 exit direction에 해당하는지 확인
      const exitDir = state.ui.exitDirections.find(
        d => hexCoordsEqual(d.neighborCoord, targetCoord)
      );

      if (exitDir) {
        set({
          ui: {
            ...state.ui,
            previewTrack: {
              coord: state.ui.targetHex,
              edges: [state.ui.entryEdge, exitDir.exitEdge] as [number, number],
            },
          },
        });
      } else {
        set({ ui: { ...state.ui, previewTrack: null } });
      }
    }
  },

  resetBuildMode: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        buildMode: 'idle',
        sourceHex: null,
        buildableNeighbors: [],
        highlightedHexes: [],
        previewTrack: null,
        selectedHex: null,
        targetHex: null,
        entryEdge: null,
        exitDirections: [],
      },
    }));
  },

  // === 로그 ===
  addLog: (action) => {
    set((state) => ({
      logs: [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: state.currentPlayer,
          action,
          timestamp: Date.now(),
        },
      ],
    }));
  },
}));
