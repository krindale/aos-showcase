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
  TRACK_REPLACE_COSTS,
  NEW_CITY_TILES,
  NewCityTileId,
  City,
  PLAYER_ID_ORDER,
  PLAYER_COLOR_ORDER,
  TURNS_BY_PLAYER_COUNT,
} from '@/types/game';
import {
  createInitialBoardState,
  initializeGoodsDisplay,
} from '@/utils/tutorialMap';
import {
  isValidConnectionPoint,
  validateFirstTrackRule,
  validateTrackConnection,
  playerHasTrack,
  isTrackPartOfCompletedLink,
  canRedirectTrack,
  getRedirectableEdges,
  isEndpointOfIncompleteSection,
} from '@/utils/trackValidation';
import {
  getBuildableNeighbors,
  getExitDirections,
  hexCoordsEqual,
  findLongestPath,
  findReachableDestinations,
} from '@/utils/hexGrid';
import {
  getNextPlayerId,
  createPlayerMoves,
  allPlayersMoved,
  allPlayersSelectedAction,
  resetPlayerActions,
  createInitialPlayerState,
} from '@/utils/gameLogic';

// 테스트에서 사용할 수 있도록 export
export function createInitialGameState(
  mapId: string,
  playerNames: string[]
): GameState {
  const boardState = createInitialBoardState();
  const goodsDisplay = initializeGoodsDisplay();

  // 도시에 물품 배치
  const bag = [...goodsDisplay.bag];
  const citiesWithCubes = boardState.cities.map((city) => {
    const cubes: CubeColor[] = [];
    for (let i = 0; i < 2; i++) {
      if (bag.length > 0) {
        const cube = bag.pop();
        if (cube) cubes.push(cube);
      }
    }
    return { ...city, cubes };
  });

  // 동적 플레이어 초기화
  const playerCount = playerNames.length;
  const activePlayers = PLAYER_ID_ORDER.slice(0, playerCount);

  // 플레이어 객체 생성
  const players: Partial<Record<PlayerId, PlayerState>> = {};
  activePlayers.forEach((playerId, index) => {
    players[playerId] = createInitialPlayerState(
      playerId,
      playerNames[index],
      PLAYER_COLOR_ORDER[index]
    );
  });

  // playerMoves 동적 생성
  const playerMoves: Partial<Record<PlayerId, boolean>> = {};
  activePlayers.forEach(p => { playerMoves[p] = false; });

  return {
    // 메타 정보
    gameId: `game-${Date.now()}`,
    mapId,
    playerCount,
    activePlayers,
    maxTurns: TURNS_BY_PLAYER_COUNT[playerCount] || 6,

    // 턴 진행
    currentTurn: 1,
    currentPhase: 'issueShares',
    currentPlayer: 'player1',
    playerOrder: [...activePlayers],

    // 플레이어
    players: players as Record<PlayerId, PlayerState>,

    // 보드
    board: {
      ...boardState,
      cities: citiesWithCubes,
    },
    goodsDisplay: {
      slots: goodsDisplay.slots,
      bag,
    },
    newCityTiles: NEW_CITY_TILES.map(tile => ({ ...tile })),  // 복사본 생성

    // 경매
    auction: null,

    // 단계 상태
    phaseState: {
      builtTracksThisTurn: 0,
      maxTracksThisTurn: GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
      moveGoodsRound: 1,
      playerMoves: playerMoves as Record<PlayerId, boolean>,
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
      // 복합 트랙 선택 UI 상태
      complexTrackSelection: null,
      // 방향 전환 UI 상태
      redirectTrackSelection: null,
      // 도시화 UI 상태
      urbanizationMode: false,
      selectedNewCityTile: null,
      // Production UI 상태
      productionMode: false,
      productionCubes: [],
      selectedProductionSlots: [],
      // 물품 이동 애니메이션 상태
      movingCube: null,
      reachableDestinations: [],
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
  initGame: (mapId: string, playerNames: string[]) => void;
  resetGame: () => void;

  // 플레이어 순환 헬퍼
  getNextPlayer: (playerId: PlayerId) => PlayerId;
  getPreviousPlayer: (playerId: PlayerId) => PlayerId;

  // 주식 발행
  issueShare: (playerId: PlayerId, amount: number) => void;

  // 플레이어 순서 경매
  placeBid: (playerId: PlayerId, amount: number) => void;
  passBid: (playerId: PlayerId) => void;
  skipBid: (playerId: PlayerId) => void;  // Turn Order 패스용
  resolveAuction: () => void;

  // 행동 선택
  selectAction: (playerId: PlayerId, action: SpecialAction) => void;

  // 트랙 건설
  buildTrack: (coord: HexCoord, edges: [number, number]) => boolean;
  canBuildTrack: (coord: HexCoord, edges: [number, number]) => boolean;

  // 복합 트랙 건설 (교차/공존)
  buildComplexTrack: (
    coord: HexCoord,
    newEdges: [number, number],
    trackType: 'crossing' | 'coexist'
  ) => boolean;
  canBuildComplexTrack: (
    coord: HexCoord,
    newEdges: [number, number],
    trackType: 'crossing' | 'coexist'
  ) => boolean;

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

  // 복합 트랙 UI
  showComplexTrackSelection: (coord: HexCoord, newEdges: [number, number]) => void;
  hideComplexTrackSelection: () => void;

  // 트랙 방향 전환
  selectTrackToRedirect: (coord: HexCoord) => boolean;
  redirectTrack: (coord: HexCoord, newExitEdge: number) => boolean;
  canRedirect: (coord: HexCoord) => boolean;
  hideRedirectSelection: () => void;

  // 도시화 (Urbanization)
  enterUrbanizationMode: () => void;
  exitUrbanizationMode: () => void;
  selectNewCityTile: (tileId: NewCityTileId) => void;
  placeNewCity: (townCoord: HexCoord) => boolean;
  canPlaceNewCity: (townCoord: HexCoord) => boolean;

  // Production (생산)
  startProduction: () => void;
  selectProductionSlot: (slotIndex: number) => void;
  confirmProduction: () => boolean;
  cancelProduction: () => void;
  getEmptySlots: () => number[];

  // 물품 이동 UI
  selectDestinationCity: (coord: HexCoord) => void;  // 목적지 도시 선택
  startCubeAnimation: (path: HexCoord[], color: CubeColor) => void;  // 큐브 애니메이션 시작
  advanceCubeAnimation: () => void;                  // 애니메이션 다음 단계
  completeCubeMove: () => void;                      // 큐브 이동 완료

  // 로그
  addLog: (action: string) => void;
}

// === 스토어 생성 ===
export const useGameStore = create<GameStore>((set, get) => ({
  // 초기 상태 (빈 게임)
  ...createInitialGameState('tutorial', ['기차-하나', '기차-둘']),

  // === 게임 초기화 ===
  initGame: (mapId, playerNames) => {
    set(createInitialGameState(mapId, playerNames));
  },

  resetGame: () => {
    const state = get();
    // 기존 플레이어 이름 유지하며 리셋
    const playerNames = state.activePlayers.map(
      pid => state.players[pid]?.name || `플레이어 ${pid.slice(-1)}`
    );
    set(createInitialGameState(state.mapId, playerNames));
  },

  // === 플레이어 순환 헬퍼 ===
  getNextPlayer: (playerId: PlayerId) => {
    const state = get();
    const currentIndex = state.activePlayers.indexOf(playerId);
    const nextIndex = (currentIndex + 1) % state.activePlayers.length;
    return state.activePlayers[nextIndex];
  },

  getPreviousPlayer: (playerId: PlayerId) => {
    const state = get();
    const currentIndex = state.activePlayers.indexOf(playerId);
    const prevIndex = (currentIndex - 1 + state.activePlayers.length) % state.activePlayers.length;
    return state.activePlayers[prevIndex];
  },

  // === 주식 발행 ===
  issueShare: (playerId, amount) => {
    set((state) => {
      const player = state.players[playerId];
      if (!player) {
        console.error(`[ERROR] issueShare: 플레이어 없음 - playerId: ${playerId}`);
        return state;
      }
      const maxShares = GAME_CONSTANTS.MAX_SHARES - player.issuedShares;
      const actualAmount = Math.min(amount, maxShares);

      if (actualAmount <= 0) {
        console.warn(`[WARN] issueShare: 발행 불가 - playerId: ${playerId}, 요청: ${amount}, 최대 가능: ${maxShares}`);
        return state;
      }

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
            lastActedPlayer: playerId,
          },
        };
      }

      // 입찰
      if (amount <= state.auction.highestBid) {
        console.warn(`[WARN] placeBid: 입찰 금액 부족 - playerId: ${playerId}, 입찰: $${amount}, 현재 최고: $${state.auction.highestBid}`);
        return state;
      }

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
  },

  passBid: (playerId) => {
    set((state) => {
      if (!state.auction) {
        console.warn(`[WARN] passBid: 경매 없음 - playerId: ${playerId}`);
        return state;
      }

      const newPassedPlayers = [...state.auction.passedPlayers, playerId];

      return {
        auction: {
          ...state.auction,
          passedPlayers: newPassedPlayers,
          lastActedPlayer: playerId,
        },
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
  },

  // Turn Order 패스: 탈락 없이 다음 입찰자로 넘어가기
  skipBid: (playerId) => {
    set((state) => {
      if (!state.auction) {
        console.warn(`[WARN] skipBid: 경매 없음 - playerId: ${playerId}`);
        return state;
      }

      return {
        auction: {
          ...state.auction,
          lastActedPlayer: playerId,  // 마지막 행동자 업데이트 (passedPlayers에는 추가 안 함)
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
  },

  resolveAuction: () => {
    set((state) => {
      if (!state.auction) {
        console.warn('[WARN] resolveAuction: 경매 없음');
        return state;
      }

      const { highestBidder, highestBid, bids, passedPlayers } = state.auction;

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

  // === 행동 선택 ===
  selectAction: (playerId, action) => {
    set((state) => {
      // 플레이어 존재 검증
      const player = state.players[playerId];
      if (!player) {
        console.error(`[ERROR] selectAction: 플레이어 없음 - playerId: ${playerId}`);
        return state;
      }

      // 이미 선택된 행동인지 확인
      const alreadySelected = Object.values(state.players).some(
        (p) => p.selectedAction === action
      );
      if (alreadySelected) {
        console.warn(`[WARN] selectAction: 이미 선택된 행동 - playerId: ${playerId}, action: ${action}`);
        return state;
      }

      const newState: Partial<GameState> = {
        players: {
          ...state.players,
          [playerId]: {
            ...player,
            selectedAction: action,
          },
        },
      };

      // Locomotive 즉시 적용
      if (action === 'locomotive') {
        const currentPlayers = newState.players ?? state.players;
        if (player.engineLevel < GAME_CONSTANTS.MAX_ENGINE) {
          newState.players = {
            ...currentPlayers,
            [playerId]: {
              ...currentPlayers[playerId],
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

      // 로깅 추가
      newState.logs = [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: playerId,
          action: `행동 선택: ${action}`,
          timestamp: Date.now(),
        },
      ];

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
    if (!player) {
      console.error(`[ERROR] buildTrack: 플레이어 없음 - currentPlayer: ${currentPlayer}`);
      return false;
    }
    if (player.cash < cost) {
      console.warn(`[WARN] buildTrack: 현금 부족 - 필요: $${cost}, 보유: $${player.cash}`);
      return false;
    }

    const newTrack: TrackTile = {
      id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      coord,
      edges,
      owner: currentPlayer,
      trackType: 'simple',
    };

    const newBuiltCount = state.phaseState.builtTracksThisTurn + 1;

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
        builtTracksThisTurn: newBuiltCount,
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

    // 최대 트랙 수 건설 완료 시 자동으로 다음 플레이어로 전환
    if (newBuiltCount >= state.phaseState.maxTracksThisTurn) {
      setTimeout(() => get().nextPhase(), 100);
    }

    return true;
  },

  // === 복합 트랙 건설 ===
  canBuildComplexTrack: (coord, newEdges, trackType) => {
    const state = get();
    const currentPlayer = state.currentPlayer;

    // 트랙 제한 확인
    if (state.phaseState.builtTracksThisTurn >= state.phaseState.maxTracksThisTurn) {
      return false;
    }

    // 기존 트랙이 있어야 함
    const existingTrack = state.board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
    if (!existingTrack) return false;

    // 기존 트랙이 단순 트랙이어야 함 (이미 복합 트랙이면 불가)
    if (existingTrack.trackType !== 'simple') return false;

    // 새 경로가 기존 경로와 겹치지 않아야 함 (엣지가 같으면 안 됨)
    const existingEdges = existingTrack.edges;
    if (
      newEdges[0] === existingEdges[0] ||
      newEdges[0] === existingEdges[1] ||
      newEdges[1] === existingEdges[0] ||
      newEdges[1] === existingEdges[1]
    ) {
      return false;
    }

    // 교차(crossing)인 경우: 두 경로가 실제로 교차해야 함 (추후 검증 추가 가능)
    // 공존(coexist)인 경우: 두 경로가 교차하지 않아야 함
    // 현재는 trackType 로깅만 수행
    console.log(`복합 트랙 타입: ${trackType}`);

    // 연결성 검증: 새 경로가 현재 플레이어의 기존 트랙/도시에 연결되어야 함
    if (!validateTrackConnection(coord, newEdges, state.board, currentPlayer)) {
      return false;
    }

    return true;
  },

  buildComplexTrack: (coord, newEdges, trackType) => {
    const state = get();

    if (!state.canBuildComplexTrack(coord, newEdges, trackType)) {
      return false;
    }

    const currentPlayer = state.currentPlayer;
    const existingTrack = state.board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
    if (!existingTrack) {
      console.error('[ERROR] buildComplexTrack: Track not found at', coord);
      return false;
    }

    // 교체 비용 계산
    const cost = trackType === 'crossing'
      ? TRACK_REPLACE_COSTS.simpleToCrossing
      : TRACK_REPLACE_COSTS.default;

    const player = state.players[currentPlayer];
    if (!player) {
      console.error(`[ERROR] buildComplexTrack: 플레이어 없음 - currentPlayer: ${currentPlayer}`);
      return false;
    }
    if (player.cash < cost) {
      console.warn(`[WARN] buildComplexTrack: 현금 부족 - 필요: $${cost}, 보유: $${player.cash}`);
      return false;
    }

    // 기존 트랙 업데이트 (복합 트랙으로 변환)
    const updatedTrack: TrackTile = {
      ...existingTrack,
      trackType,
      secondaryEdges: newEdges,
      secondaryOwner: currentPlayer,
    };

    const updatedTrackTiles = state.board.trackTiles.map(t =>
      hexCoordsEqual(t.coord, coord) ? updatedTrack : t
    );

    const newBuiltCount = state.phaseState.builtTracksThisTurn + 1;

    set({
      board: {
        ...state.board,
        trackTiles: updatedTrackTiles,
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
        builtTracksThisTurn: newBuiltCount,
      },
      logs: [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: currentPlayer,
          action: `복합 트랙 건설 (${trackType}) (${coord.col}, ${coord.row}) - $${cost}`,
          timestamp: Date.now(),
        },
      ],
    });

    // 최대 트랙 수 건설 완료 시 자동으로 다음 플레이어로 전환
    if (newBuiltCount >= state.phaseState.maxTracksThisTurn) {
      setTimeout(() => get().nextPhase(), 100);
    }

    return true;
  },

  // === 물품 이동 ===
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

      // 경로의 트랙 소유자에게 수입 추가 (동적 플레이어 지원)
      const incomeChanges: Partial<Record<PlayerId, number>> = {};
      state.activePlayers.forEach(p => { incomeChanges[p] = 0; });

      for (let i = 0; i < path.length - 1; i++) {
        const track = state.board.trackTiles.find(
          (t) =>
            (t.coord.col === path[i].col && t.coord.row === path[i].row) ||
            (t.coord.col === path[i + 1].col && t.coord.row === path[i + 1].row)
        );
        if (track?.owner) {
          incomeChanges[track.owner] = (incomeChanges[track.owner] || 0) + 1;
        }
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
      if (!player) {
        console.error(`[ERROR] upgradeEngine: 플레이어 없음 - currentPlayer: ${state.currentPlayer}`);
        return state;
      }
      if (player.engineLevel >= GAME_CONSTANTS.MAX_ENGINE) {
        console.warn(`[WARN] upgradeEngine: 최대 레벨 도달 - playerId: ${state.currentPlayer}, engineLevel: ${player.engineLevel}`);
        return state;
      }

      const oldLevel = player.engineLevel;
      const newLevel = player.engineLevel + 1;

      return {
        players: {
          ...state.players,
          [state.currentPlayer]: {
            ...player,
            engineLevel: newLevel,
          },
        },
        phaseState: {
          ...state.phaseState,
          playerMoves: {
            ...state.phaseState.playerMoves,
            [state.currentPlayer]: true,
          },
        },
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: state.currentPlayer,
            action: `엔진 업그레이드: ${oldLevel} → ${newLevel} 링크`,
            timestamp: Date.now(),
          },
        ],
      };
    });
  },

  // === 수입/비용 ===
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

      return { players: newPlayers, logs: newLogs };
    });
  },

  payExpenses: () => {
    set((state) => {
      const newPlayers = { ...state.players };
      let newBoard = state.board;
      const bankruptPlayers: PlayerId[] = [];
      const newLogs = [...state.logs];

      for (const playerId of state.activePlayers) {
        const player = newPlayers[playerId];
        if (!player) continue;

        // 이미 탈락한 플레이어는 건너뛰기
        if (player.eliminated) continue;

        const expense = player.issuedShares + player.engineLevel;

        if (player.cash >= expense) {
          // 현금으로 지불 가능
          newPlayers[playerId] = {
            ...player,
            cash: player.cash - expense,
          };
        } else {
          // 현금 부족 시 수입 감소
          const shortage = expense - player.cash;
          const newIncome = player.income - shortage;

          // 파산 체크: 수입이 MIN_INCOME 미만이면 파산
          if (newIncome < GAME_CONSTANTS.MIN_INCOME) {
            // 파산 처리
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

      // 파산한 플레이어의 미완성 트랙 소유권 제거
      if (bankruptPlayers.length > 0) {
        const updatedTrackTiles = newBoard.trackTiles.map(track => {
          if (track.owner && bankruptPlayers.includes(track.owner)) {
            // 완성된 링크의 일부가 아닌 트랙만 소유권 제거
            if (!isTrackPartOfCompletedLink(track.coord, newBoard)) {
              return { ...track, owner: null };
            }
          }
          return track;
        });

        newBoard = {
          ...newBoard,
          trackTiles: updatedTrackTiles,
        };
      }

      return {
        players: newPlayers,
        board: newBoard,
        logs: newLogs,
      };
    });
  },

  applyIncomeReduction: () => {
    set((state) => {
      const newPlayers = { ...state.players };
      const newLogs = [...state.logs];

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

        if (reduction > 0) {
          const oldIncome = player.income;
          const newIncome = Math.max(player.income - reduction, GAME_CONSTANTS.MIN_INCOME);
          newPlayers[playerId] = {
            ...player,
            income: newIncome,
          };

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

      return { players: newPlayers, logs: newLogs };
    });
  },

  // === 물품 성장 ===
  growGoods: (diceResults) => {
    set((state) => {
      // Production은 이제 수동으로 처리됨 (startProduction/confirmProduction)
      // 여기서는 주사위 결과에 따른 물품 성장만 처리

      const newSlots = [...state.goodsDisplay.slots];
      const newBag = [...state.goodsDisplay.bag];
      const newCities = state.board.cities.map(city => ({ ...city, cubes: [...city.cubes] }));
      const newLogs = [...state.logs];

      // 열-도시 매핑 (Rust Belt)
      // 1-6: 주사위 열, A-D: 신규 도시 열
      const columnToCityId: Record<string, string> = {
        '1': 'P', // Pittsburgh
        '2': 'C', // Cincinnati
        '3': 'O', // Columbus
        '4': 'W', // Wheeling
        '5': 'I', // Indianapolis (or another city)
        '6': 'E', // Evansville
      };

      // 열의 시작 인덱스 계산
      const columnStartIndex: Record<string, number> = {
        '1': 0,   // 0-5
        '2': 6,   // 6-11
        '3': 12,  // 12-17
        '4': 18,  // 18-23
        '5': 24,  // 24-29
        '6': 30,  // 30-35
        'A': 36,  // 36-39
        'B': 40,  // 40-43
        'C': 44,  // 44-47
        'D': 48,  // 48-51
      };

      // 주사위 결과에 따른 물품 배치
      const columnCounts: Record<string, number> = {};
      for (const result of diceResults) {
        const key = String(result);
        columnCounts[key] = (columnCounts[key] || 0) + 1;
      }

      // 각 열에서 도시로 큐브 이동
      for (const [column, count] of Object.entries(columnCounts)) {
        const cityId = columnToCityId[column];
        if (!cityId) continue;

        const city = newCities.find(c => c.id === cityId);
        if (!city) continue;

        const startIdx = columnStartIndex[column];
        const rowCount = column.match(/[A-D]/) ? 4 : 6;

        // 위에서부터 큐브 가져오기
        let moved = 0;
        for (let i = 0; i < rowCount && moved < count; i++) {
          const slotIdx = startIdx + i;
          const cube = newSlots[slotIdx];
          if (cube) {
            city.cubes.push(cube);
            newSlots[slotIdx] = null;
            moved++;
          }
        }

        if (moved > 0) {
          newLogs.push({
            turn: state.currentTurn,
            phase: state.currentPhase,
            player: state.currentPlayer,
            action: `물품 성장: ${city.name}에 ${moved}개 추가`,
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
        logs: newLogs,
      };
    });
  },

  // === 단계/턴 진행 ===
  nextPhase: () => {
    const currentState = get();

    // 자동 단계 로직 실행 (단계 전환 전에 실행)
    if (currentState.currentPhase === 'collectIncome') {
      get().collectIncome();
    } else if (currentState.currentPhase === 'payExpenses') {
      get().payExpenses();
    } else if (currentState.currentPhase === 'incomeReduction') {
      get().applyIncomeReduction();
    }

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
      const { activePlayers } = state;

      // 빈 배열 방어 검증
      if (playerOrder.length === 0 || activePlayers.length === 0) {
        console.error('[ERROR] nextPhase: playerOrder 또는 activePlayers가 비어있음');
        return state;
      }

      const nextPlayer = getNextPlayerId(state.currentPlayer, activePlayers);

      // 현재 플레이어가 마지막 플레이어인지 확인
      const isLastPlayer = state.currentPlayer === playerOrder[playerOrder.length - 1];

      // === I. 주식 발행 단계 ===
      if (state.currentPhase === 'issueShares') {
        // 마지막 플레이어까지 완료했으면 다음 단계로
        if (isLastPlayer) {
          return {
            currentPhase: 'determinePlayerOrder' as GamePhase,
            currentPlayer: playerOrder[0],
          };
        }
        // 다음 플레이어로 전환
        return {
          currentPlayer: nextPlayer,
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
        // 모든 플레이어가 행동을 선택했는지 확인
        const allSelected = allPlayersSelectedAction(state.players, activePlayers);

        if (allSelected) {
          // 모든 플레이어 선택 완료 → 다음 단계
          // First Build 확인
          const firstBuildPlayer = activePlayers.find(
            pid => state.players[pid]?.selectedAction === 'firstBuild'
          );

          // 실제로 첫 번째로 건설할 플레이어 결정
          const firstBuilder = firstBuildPlayer || playerOrder[0];

          return {
            currentPhase: 'buildTrack' as GamePhase,
            currentPlayer: firstBuilder,
            phaseState: {
              ...state.phaseState,
              builtTracksThisTurn: 0,
              // 첫 번째로 건설할 플레이어의 Engineer 효과 확인
              maxTracksThisTurn: state.players[firstBuilder].selectedAction === 'engineer'
                ? GAME_CONSTANTS.ENGINEER_TRACK_LIMIT
                : GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
            },
          };
        }

        // 현재 플레이어가 선택했으면 다음 플레이어로 전환
        if (state.players[state.currentPlayer].selectedAction !== null) {
          return {
            currentPlayer: nextPlayer,
          };
        }

        // 아직 선택 안 했으면 상태 유지
        return state;
      }

      // === IV. 트랙 건설 단계 ===
      if (state.currentPhase === 'buildTrack') {
        // 현재 플레이어를 먼저 완료 처리한 후 확인
        const updatedPlayerMoves = {
          ...state.phaseState.playerMoves,
          [state.currentPlayer]: true,
        };
        const allPlayersBuilt = allPlayersMoved(updatedPlayerMoves, activePlayers);

        if (allPlayersBuilt) {
          // First Move 확인
          const firstMovePlayer = activePlayers.find(
            pid => state.players[pid]?.selectedAction === 'firstMove'
          );

          return {
            currentPhase: 'moveGoods' as GamePhase,
            currentPlayer: firstMovePlayer || playerOrder[0],
            phaseState: {
              ...state.phaseState,
              moveGoodsRound: 1,
              playerMoves: createPlayerMoves(activePlayers),
            },
          };
        }

        // 다음 플레이어로 전환
        return {
          currentPlayer: nextPlayer,
          phaseState: {
            ...state.phaseState,
            builtTracksThisTurn: 0,
            maxTracksThisTurn: state.players[nextPlayer].selectedAction === 'engineer'
              ? GAME_CONSTANTS.ENGINEER_TRACK_LIMIT
              : GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
            playerMoves: updatedPlayerMoves,
          },
        };
      }

      // === V. 물품 이동 단계 ===
      if (state.currentPhase === 'moveGoods') {
        // 현재 플레이어를 먼저 완료 처리한 후 확인
        const updatedPlayerMoves = {
          ...state.phaseState.playerMoves,
          [state.currentPlayer]: true,
        };
        const allMoved = allPlayersMoved(updatedPlayerMoves, activePlayers);

        if (allMoved) {
          // 라운드 2까지 완료했으면 다음 단계
          if (state.phaseState.moveGoodsRound >= 2) {
            return {
              currentPhase: 'collectIncome' as GamePhase,
              currentPlayer: playerOrder[0],
            };
          }

          // 라운드 2로 진행
          const firstMovePlayer = activePlayers.find(
            pid => state.players[pid]?.selectedAction === 'firstMove'
          );

          return {
            phaseState: {
              ...state.phaseState,
              moveGoodsRound: 2,
              playerMoves: createPlayerMoves(activePlayers),
            },
            currentPlayer: firstMovePlayer || playerOrder[0],
          };
        }

        // 다음 플레이어로 전환
        return {
          currentPlayer: nextPlayer,
          phaseState: {
            ...state.phaseState,
            playerMoves: updatedPlayerMoves,
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
            playerMoves: createPlayerMoves(activePlayers),
            productionUsed: false,
            locomotiveUsed: false,
          },
          players: resetPlayerActions(state.players, activePlayers),
        };
      }

      // 단계 전환 로깅
      return {
        currentPhase: nextPhaseName,
        currentPlayer: playerOrder[0],
        logs: [
          ...state.logs,
          {
            turn: state.currentTurn,
            phase: nextPhaseName,
            player: state.currentPlayer,
            action: `[시스템] 단계 전환: ${state.currentPhase} → ${nextPhaseName}`,
            timestamp: Date.now(),
          },
        ],
      };
    });
  },

  endTurn: () => {
    const state = get();

    // 빈 배열 방어 검증
    if (state.playerOrder.length === 0 || state.activePlayers.length === 0) {
      console.error('[ERROR] endTurn: playerOrder 또는 activePlayers가 비어있음');
      return;
    }

    // 모든 단계 자동 실행
    state.collectIncome();
    state.payExpenses();
    state.applyIncomeReduction();

    set((prevState) => ({
      currentTurn: prevState.currentTurn + 1,
      currentPhase: 'issueShares',
      currentPlayer: prevState.playerOrder[0] ?? prevState.activePlayers[0],
      phaseState: {
        builtTracksThisTurn: 0,
        maxTracksThisTurn: GAME_CONSTANTS.NORMAL_TRACK_LIMIT,
        moveGoodsRound: 1,
        playerMoves: createPlayerMoves(prevState.activePlayers),
        productionUsed: false,
        locomotiveUsed: false,
      },
      players: resetPlayerActions(prevState.players, prevState.activePlayers),
      logs: [
        ...prevState.logs,
        {
          turn: prevState.currentTurn,
          phase: prevState.currentPhase,
          player: prevState.activePlayers[0],
          action: `[시스템] 턴 ${prevState.currentTurn} 종료`,
          timestamp: Date.now(),
        },
      ],
    }));
  },

  // === UI 상태 ===
  selectHex: (coord) => {
    set((state) => ({
      ui: { ...state.ui, selectedHex: coord },
    }));
  },

  selectCube: (cityId, cubeIndex) => {
    const state = get();

    // 이미 이번 라운드에 이동했으면 리턴
    if (state.phaseState.playerMoves[state.currentPlayer]) {
      console.log('이미 이번 라운드에 이동했습니다.');
      return;
    }

    const city = state.board.cities.find(c => c.id === cityId);
    if (!city) return;

    const cubeColor = city.cubes[cubeIndex];
    if (!cubeColor) return;

    const player = state.players[state.currentPlayer];

    // 디버그: 큐브 선택 정보
    console.log('=== selectCube 디버그 ===');
    console.log('출발 도시:', city.name, city.coord);
    console.log('큐브 색상:', cubeColor);
    console.log('엔진 레벨:', player.engineLevel);
    console.log('같은 색상 도시들:', state.board.cities.filter(c => c.color === cubeColor).map(c => ({ name: c.name, coord: c.coord })));
    console.log('전체 트랙 수:', state.board.trackTiles.length);
    console.log('트랙 목록:', state.board.trackTiles.map(t => ({ coord: t.coord, edges: t.edges, owner: t.owner })));

    // 도달 가능한 목적지 계산
    const reachable = findReachableDestinations(
      city.coord,
      state.board,
      state.currentPlayer,
      player.engineLevel,
      cubeColor
    );

    console.log('도달 가능한 목적지:', reachable.map(c => ({ name: c.name, coord: c.coord })));
    console.log('=========================');

    set({
      ui: {
        ...state.ui,
        selectedCube: { cityId, cubeIndex },
        reachableDestinations: reachable.map(c => c.coord),
      },
    });
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
        // 복합 트랙 선택 UI 초기화
        complexTrackSelection: null,
        // 방향 전환 UI 초기화
        redirectTrackSelection: null,
        // 도시화 UI 초기화
        urbanizationMode: false,
        selectedNewCityTile: null,
        // Production UI 초기화
        productionMode: false,
        productionCubes: [],
        selectedProductionSlots: [],
        // 물품 이동 UI 초기화
        movingCube: null,
        reachableDestinations: [],
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
    const targetHex = state.ui.targetHex;
    const entryEdge = state.ui.entryEdge;

    if (state.ui.buildMode !== 'target_selected' || !targetHex || entryEdge === null) {
      return false;
    }

    // 유효한 출구인지 확인
    const exitDir = state.ui.exitDirections.find(d => d.exitEdge === exitEdge);
    if (!exitDir) {
      return false;
    }

    // 트랙 건설: targetHex에 트랙 배치
    // edges: [들어오는 엣지, 나가는 엣지]
    const edges: [number, number] = [entryEdge, exitEdge];

    // 기존 트랙이 있는지 확인
    const existingTrack = state.board.trackTiles.find(
      t => hexCoordsEqual(t.coord, targetHex)
    );

    // 기존 트랙이 있고 단순 트랙이면 복합 트랙 선택 패널 표시
    if (existingTrack && existingTrack.trackType === 'simple') {
      // 엣지가 겹치지 않는지 확인
      const edgesOverlap =
        edges[0] === existingTrack.edges[0] ||
        edges[0] === existingTrack.edges[1] ||
        edges[1] === existingTrack.edges[0] ||
        edges[1] === existingTrack.edges[1];

      if (!edgesOverlap) {
        // 복합 트랙 선택 패널 표시
        state.showComplexTrackSelection(targetHex, edges);
        return true;
      }
    }

    const success = state.buildTrack(targetHex, edges);

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

  // === 복합 트랙 UI ===
  showComplexTrackSelection: (coord, newEdges) => {
    set((state) => ({
      ui: {
        ...state.ui,
        complexTrackSelection: { coord, newEdges },
      },
    }));
  },

  hideComplexTrackSelection: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        complexTrackSelection: null,
      },
    }));
  },

  // === 트랙 방향 전환 ===
  canRedirect: (coord) => {
    const state = get();
    return canRedirectTrack(coord, state.board, state.currentPlayer);
  },

  selectTrackToRedirect: (coord) => {
    const state = get();
    const currentPlayer = state.currentPlayer;

    // 방향 전환 가능한지 확인
    if (!canRedirectTrack(coord, state.board, currentPlayer)) {
      return false;
    }

    // 방향 전환 가능한 엣지 정보 가져오기
    const redirectInfo = getRedirectableEdges(coord, state.board);
    if (!redirectInfo) return false;

    const { isEndpoint, connectedEdge } = isEndpointOfIncompleteSection(coord, state.board);
    if (!isEndpoint || connectedEdge === null) return false;

    // 방향 전환 선택 UI 표시
    set({
      ui: {
        ...state.ui,
        buildMode: 'redirect_selected',
        selectedHex: coord,
        redirectTrackSelection: {
          coord,
          connectedEdge,
          currentOpenEdge: redirectInfo.currentOpenEdge,
          availableEdges: redirectInfo.availableEdges,
        },
      },
    });

    return true;
  },

  redirectTrack: (coord, newExitEdge) => {
    const state = get();
    const currentPlayer = state.currentPlayer;

    // 방향 전환 가능한지 확인
    if (!canRedirectTrack(coord, state.board, currentPlayer)) {
      return false;
    }

    // 현재 트랙 정보 가져오기
    const track = state.board.trackTiles.find(t => hexCoordsEqual(t.coord, coord));
    if (!track) return false;

    // 방향 전환 정보 확인
    const redirectInfo = getRedirectableEdges(coord, state.board);
    if (!redirectInfo) return false;

    // 유효한 방향인지 확인
    if (!redirectInfo.availableEdges.includes(newExitEdge)) {
      return false;
    }

    // 비용 확인
    const cost = TRACK_REPLACE_COSTS.redirect;
    const player = state.players[currentPlayer];
    if (player.cash < cost) {
      return false;
    }

    // 연결된 엣지 확인 (유지되는 엣지)
    const { connectedEdge } = isEndpointOfIncompleteSection(coord, state.board);
    if (connectedEdge === null) return false;

    // 새 엣지 설정
    const newEdges: [number, number] = [connectedEdge, newExitEdge];

    // 트랙 업데이트
    const updatedTrack: TrackTile = {
      ...track,
      edges: newEdges,
      owner: currentPlayer, // 방향 전환하면 소유권 획득
    };

    const updatedTrackTiles = state.board.trackTiles.map(t =>
      hexCoordsEqual(t.coord, coord) ? updatedTrack : t
    );

    set({
      board: {
        ...state.board,
        trackTiles: updatedTrackTiles,
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
      ui: {
        ...state.ui,
        buildMode: 'idle',
        selectedHex: null,
        redirectTrackSelection: null,
      },
      logs: [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: currentPlayer,
          action: `트랙 방향 전환 (${coord.col}, ${coord.row}) - $${cost}`,
          timestamp: Date.now(),
        },
      ],
    });

    return true;
  },

  hideRedirectSelection: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        buildMode: 'idle',
        selectedHex: null,
        redirectTrackSelection: null,
      },
    }));
  },

  // === 도시화 (Urbanization) ===
  enterUrbanizationMode: () => {
    const state = get();
    const currentPlayer = state.currentPlayer;
    const player = state.players[currentPlayer];

    // Urbanization 행동을 선택한 플레이어만 가능
    if (player.selectedAction !== 'urbanization') {
      return;
    }

    set({
      ui: {
        ...state.ui,
        urbanizationMode: true,
        selectedNewCityTile: null,
      },
    });
  },

  exitUrbanizationMode: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        urbanizationMode: false,
        selectedNewCityTile: null,
      },
    }));
  },

  selectNewCityTile: (tileId) => {
    const state = get();

    // 이미 사용된 타일인지 확인
    const tile = state.newCityTiles.find(t => t.id === tileId);
    if (!tile || tile.used) {
      return;
    }

    set({
      ui: {
        ...state.ui,
        selectedNewCityTile: tileId,
      },
    });
  },

  canPlaceNewCity: (townCoord) => {
    const state = get();

    // 도시화 모드인지 확인
    if (!state.ui.urbanizationMode) return false;

    // 신규 도시 타일이 선택되었는지 확인
    if (!state.ui.selectedNewCityTile) return false;

    // 해당 좌표에 마을이 있는지 확인
    const town = state.board.towns.find(
      t => hexCoordsEqual(t.coord, townCoord)
    );
    if (!town) return false;

    // 이미 도시화된 마을인지 확인
    if (town.newCityColor !== null) return false;

    return true;
  },

  placeNewCity: (townCoord) => {
    const state = get();

    if (!state.canPlaceNewCity(townCoord)) {
      return false;
    }

    const selectedTileId = state.ui.selectedNewCityTile;
    if (!selectedTileId) {
      console.error('[ERROR] placeNewCity: No new city tile selected');
      return false;
    }
    const tile = state.newCityTiles.find(t => t.id === selectedTileId);
    if (!tile) return false;

    const town = state.board.towns.find(t => hexCoordsEqual(t.coord, townCoord));
    if (!town) return false;

    // 1. 마을을 신규 도시로 변환
    const updatedTowns = state.board.towns.map(t => {
      if (hexCoordsEqual(t.coord, townCoord)) {
        return {
          ...t,
          newCityColor: tile.color,
          cubes: [],  // 마을의 물품은 제거 (Southern US 맵에서만 관련)
        };
      }
      return t;
    });

    // 2. 새 도시를 cities 배열에 추가
    const newCity: City = {
      id: selectedTileId,  // 타일 ID를 도시 ID로 사용
      name: `New City ${selectedTileId}`,
      coord: townCoord,
      color: tile.color,
      cubes: [],  // 처음에는 물품 없음
    };

    // 3. 해당 헥스의 트랙 타일 제거 (룰북: 신규 도시 배치 시 기존 트랙 제거)
    const updatedTrackTiles = state.board.trackTiles.filter(
      track => !hexCoordsEqual(track.coord, townCoord)
    );

    // 4. 신규 도시 타일 사용 표시
    const updatedNewCityTiles = state.newCityTiles.map(t => {
      if (t.id === selectedTileId) {
        return { ...t, used: true };
      }
      return t;
    });

    set({
      board: {
        ...state.board,
        towns: updatedTowns,
        cities: [...state.board.cities, newCity],
        trackTiles: updatedTrackTiles,
      },
      newCityTiles: updatedNewCityTiles,
      ui: {
        ...state.ui,
        urbanizationMode: false,
        selectedNewCityTile: null,
      },
      logs: [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: state.currentPlayer,
          action: `도시화: ${town.id || '마을'}에 ${tile.color} 신규 도시 (${selectedTileId}) 배치`,
          timestamp: Date.now(),
        },
      ],
    });

    return true;
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

    // 주머니에서 큐브 2개 뽑기 (미리보기)
    const bag = [...state.goodsDisplay.bag];
    const cubes: CubeColor[] = [];

    for (let i = 0; i < 2 && bag.length > 0; i++) {
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

  // === 물품 이동 UI ===
  selectDestinationCity: (coord) => {
    const state = get();
    if (!state.ui.selectedCube) return;

    // 도달 가능한 목적지인지 확인
    const isReachable = state.ui.reachableDestinations.some(
      d => hexCoordsEqual(d, coord)
    );
    if (!isReachable) return;

    // 출발 도시 정보
    const sourceCityId = state.ui.selectedCube.cityId;
    const cubeIndex = state.ui.selectedCube.cubeIndex;
    const sourceCity = state.board.cities.find(c => c.id === sourceCityId);
    if (!sourceCity) return;

    const cubeColor = sourceCity.cubes[cubeIndex];
    if (!cubeColor) return;

    const player = state.players[state.currentPlayer];

    // 가장 긴 경로 찾기
    const path = findLongestPath(
      sourceCity.coord,
      coord,
      state.board,
      state.currentPlayer,
      player.engineLevel,
      cubeColor
    );

    if (!path || path.length < 2) return;

    // 애니메이션 시작
    state.startCubeAnimation(path, cubeColor);
  },

  startCubeAnimation: (path, color) => {
    const state = get();
    if (!state.ui.selectedCube) return;

    // 출발 도시에서 큐브 즉시 제거
    const sourceCityId = state.ui.selectedCube.cityId;
    const cubeIndex = state.ui.selectedCube.cubeIndex;

    const newCities = state.board.cities.map(city => {
      if (city.id === sourceCityId) {
        const newCubes = [...city.cubes];
        newCubes.splice(cubeIndex, 1);
        return { ...city, cubes: newCubes };
      }
      return city;
    });

    set({
      board: {
        ...state.board,
        cities: newCities,
      },
      ui: {
        ...state.ui,
        movingCube: {
          color,
          path,
          currentIndex: 0,
        },
        movePath: path,
        selectedCube: null,
        reachableDestinations: [],
      },
    });
  },

  advanceCubeAnimation: () => {
    set((state) => {
      if (!state.ui.movingCube) return state;

      const nextIndex = state.ui.movingCube.currentIndex + 1;

      if (nextIndex >= state.ui.movingCube.path.length) {
        // 애니메이션 완료
        return state;
      }

      return {
        ui: {
          ...state.ui,
          movingCube: {
            ...state.ui.movingCube,
            currentIndex: nextIndex,
          },
        },
      };
    });
  },

  completeCubeMove: () => {
    const state = get();
    if (!state.ui.movingCube) return;

    const { path, color } = state.ui.movingCube;

    // 경로의 트랙 소유자에게 수입 추가 (동적 플레이어 지원)
    const incomeChanges: Partial<Record<PlayerId, number>> = {};
    state.activePlayers.forEach(p => { incomeChanges[p] = 0; });

    // 링크별로 수입 계산 (도시/마을 → 다음 도시/마을 = 1 링크)
    // 룰북: "물품이 지나가는 각 완성된 철도 링크마다 해당 링크 소유자의 수입이 1 증가"
    let linkStartIndex = 0;
    const { cities, towns, trackTiles } = state.board;

    for (let i = 1; i < path.length; i++) {
      const coord = path[i];
      const isCity = cities.some(c => hexCoordsEqual(c.coord, coord));
      const isTown = towns.some(t => hexCoordsEqual(t.coord, coord));

      if (isCity || isTown) {
        // 이 링크(linkStartIndex → i) 구간의 트랙 소유자 찾기
        for (let j = linkStartIndex + 1; j < i; j++) {
          const track = trackTiles.find(t => hexCoordsEqual(t.coord, path[j]));
          if (track?.owner) {
            incomeChanges[track.owner] = (incomeChanges[track.owner] || 0) + 1;
            break; // 링크당 한 번만 계산 (같은 링크 내 트랙은 같은 소유자)
          }
        }
        linkStartIndex = i; // 다음 링크 시작점 업데이트
      }
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

    set({
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
        movingCube: null,
        movePath: [],
        selectedCube: null,
        reachableDestinations: [],
      },
      logs: [
        ...state.logs,
        {
          turn: state.currentTurn,
          phase: state.currentPhase,
          player: state.currentPlayer,
          action: `${color} 물품 배달 (${totalLinks} 링크, +${incomeChanges[state.currentPlayer]} 수입)`,
          timestamp: Date.now(),
        },
      ],
    });
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

// 디버깅용: 전역에 스토어 노출
if (typeof window !== 'undefined') {
  (window as unknown as { __GAME_STORE__: typeof useGameStore }).__GAME_STORE__ = useGameStore;
}
