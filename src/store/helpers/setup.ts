// 게임 초기 상태 생성 — 셋업 팩토리 (gameStore 스텝 3a 분리)

import {
  GameState,
  PlayerId,
  PlayerState,
  CityColor,
  CubeColor,
  GAME_CONSTANTS,
  NEW_CITY_TILES,
  PLAYER_ID_ORDER,
  PLAYER_COLOR_ORDER,
  TURNS_BY_PLAYER_COUNT,
} from '@/types/game';
import { initializeGoodsDisplay } from '@/utils/tutorialMap';
import { getMapData } from '@/utils/mapRegistry';
import { getMapProfile } from '@/maps/getMapProfile';
import { createInitialPlayerState } from '@/utils/gameLogic';

/**
 * AI 플레이어 설정
 */
export interface AIPlayerConfig {
  playerIndex: number;  // 0-based 인덱스
  name: string;
}

/**
 * 튜토리얼 게임 설정
 */
export const TUTORIAL_GAME_CONFIG = {
  maxTurns: 3,  // 튜토리얼은 3턴
  defaultAI: { playerIndex: 1, name: '컴퓨터-기차' } as AIPlayerConfig,
};

/**
 * 주머니(bag)에서 색 균형을 맞춰 큐브 N개를 뽑는다 (도시·마을 셋업 공용).
 *  ① 이 칸에 아직 없는 색 우선(칸 내 중복 회피) ② 그 중 전역 사용량(colorUsage)이 가장 적은 색.
 *  excludeColor 지정 시 그 색은 후보에서 완전히 제외(튜토리얼 noOwnColorCubes).
 * bag/colorUsage를 in-place로 갱신하고 뽑은 큐브 배열을 반환.
 */
export function drawBalancedCubes(
  bag: CubeColor[],
  count: number,
  colorUsage: Map<CubeColor, number>,
  excludeColor?: CubeColor,
): CubeColor[] {
  const cubes: CubeColor[] = [];
  for (let i = 0; i < count; i++) {
    if (bag.length === 0) break;
    let bestIdx = -1, bestUsed = Infinity, fallbackIdx = -1;
    for (let j = bag.length - 1; j >= 0; j--) {
      const c = bag[j];
      if (excludeColor && c === excludeColor) continue;
      if (fallbackIdx === -1) fallbackIdx = j;
      if (cubes.includes(c)) continue;
      const used = colorUsage.get(c) ?? 0;
      if (used < bestUsed) { bestUsed = used; bestIdx = j; }
    }
    const idx = bestIdx !== -1 ? bestIdx : fallbackIdx;
    if (idx === -1) break;
    const cube = bag.splice(idx, 1)[0];
    if (cube) { cubes.push(cube); colorUsage.set(cube, (colorUsage.get(cube) ?? 0) + 1); }
  }
  return cubes;
}

export function createInitialGameState(
  mapId: string,
  playerNames: string[],
  aiPlayers: AIPlayerConfig[] = [],
  options: { randomizeStartOrder?: boolean } = {}
): GameState {
  const mapData = getMapData(mapId);
  const boardState = mapData.createBoardState();
  // 디스플레이 칸 수는 맵의 columnMapping rowCount 합, 큐브 색 구성은 맵별(미지정 시 표준).
  // 매핑이 아예 없을 때만 표준 52칸 폴백 — rowCount 합이 0인 맵(Montréal: 디스플레이 미사용,
  // 원본 룰 "Do not fill goods display")은 0칸이어야 주머니가 고갈되지 않는다(Repopulation·타일 큐브).
  const slotSum = mapData.columnMapping.reduce((sum, m) => sum + m.rowCount, 0);
  const totalGoodsSlots = mapData.columnMapping.length > 0 ? slotSum : 52;
  let goodsDisplay = initializeGoodsDisplay(mapData.goodsCubeCounts, totalGoodsSlots);

  const setupRules = getMapProfile(mapId);

  // noOwnColorCubes(튜토리얼): 물품 디스플레이의 각 도시 열에 그 도시 색 큐브가
  // 놓이지 않도록 교체한다 (예: 빨강 도시 Pittsburgh 열엔 빨강 화물이 보이지 않음).
  // 빼낸 자기 색 큐브는 주머니로 보내고, 주머니의 다른 색 큐브와 맞바꾼다.
  if (setupRules.noOwnColorCubes && !setupRules.hexCubeSetup) {
    const slots = [...goodsDisplay.slots];
    const pool = [...goodsDisplay.bag];
    let slotIndex = 0;
    for (const m of mapData.columnMapping) {
      const mappedCity = m.isNewCity ? undefined : mapData.cities.find(c => c.id === m.cityId);
      // 도시(주사위 열)인데 매칭 도시가 없으면 = 마을/미사용 열(예: 마을이 된 Wheeling의 4번 열).
      // 물품이 배달될 곳이 없으므로 열을 비워 주머니로 돌려보낸다.
      if (!m.isNewCity && !mappedCity) {
        for (let i = 0; i < m.rowCount; i++) {
          const idx = slotIndex + i;
          if (slots[idx] !== null) { pool.push(slots[idx]!); slots[idx] = null; }
        }
        slotIndex += m.rowCount;
        continue;
      }
      // 신규 도시 열(A~D)은 고정 색이 없으므로 제외
      const ownColor = mappedCity?.color;
      if (ownColor) {
        for (let i = 0; i < m.rowCount; i++) {
          const idx = slotIndex + i;
          if (slots[idx] === ownColor) {
            const replIdx = pool.findIndex(c => c !== ownColor);
            if (replIdx >= 0) {
              const repl = pool[replIdx];
              pool[replIdx] = ownColor; // 자기 색은 주머니로
              slots[idx] = repl;        // 다른 색으로 교체
            }
            // 주머니에 다른 색이 없으면(극히 드묾) 그대로 둠
          }
        }
      }
      slotIndex += m.rowCount;
    }
    goodsDisplay = { slots, bag: pool };
  }

  // 헥스 큐브 맵(St. Lucia): 물품 성장이 없어 디스플레이가 불필요 →
  // 디스플레이에 깔린 큐브까지 전부 주머니로 합쳐 모든 평지/강 헥스를 채운다
  // (디스플레이 52개를 빼면 주머니가 44개뿐이라 일부 헥스가 비는 문제 방지)
  const bag = setupRules.hexCubeSetup
    ? [...goodsDisplay.bag, ...goodsDisplay.slots.filter((c): c is NonNullable<typeof c> => c !== null)]
    : [...goodsDisplay.bag];
  const displaySlots = setupRules.hexCubeSetup
    ? goodsDisplay.slots.map(() => null)
    : goodsDisplay.slots;

  // 도시에 물품 배치 (헥스 큐브 셋업 맵은 도시 큐브 없음 — 룰북 St. Lucia)
  const cityCubeCounts = setupRules.cityCubeCounts;
  // 색이 한쪽으로 몰리지 않도록 전역 색 사용량을 추적해 균형 있게 배치한다.
  // (순수 무작위면 한 도시에 같은 색 2개·특정 색 쏠림이 생겨 시각적으로 빈약함)
  const colorUsage = new Map<CubeColor, number>();
  const citiesWithCubes = boardState.cities.map((city) => {
    // Germany 외국 터미널: 무작위 큐브 1개로 수용색(color)을 정하고 그 큐브를 마커로 올린다.
    // (이 큐브는 "물품"이 아니라 수용색 표시 — 배달 대상이 아니며 물품 성장도 받지 않는다)
    if (city.isTerminal) {
      if (bag.length === 0) return { ...city, cubes: [] };
      let tIdx = bag.length - 1;
      let tUsed = Infinity;
      for (let j = bag.length - 1; j >= 0; j--) {
        const used = colorUsage.get(bag[j]) ?? 0;
        if (used < tUsed) { tUsed = used; tIdx = j; }
      }
      // 터미널 수용색은 도시색 — 면화(white)는 주머니에 없어 CityColor로 안전 (Southern은 터미널 없음)
      const cube = bag.splice(tIdx, 1)[0] as CityColor;
      colorUsage.set(cube, (colorUsage.get(cube) ?? 0) + 1);
      return { ...city, color: cube, cubes: [cube] };
    }
    if (setupRules.hexCubeSetup) return { ...city, cubes: [] };
    // 도시별 초기 큐브 수 (Rust Belt: Pittsburgh/Wheeling 3, 나머지 2). 색 균형 배치(공용 헬퍼).
    // 인원 비례 도시(Moon Landing hex: 인원×2)는 perPlayerCityCubes가 우선.
    const perPlayer = setupRules.perPlayerCityCubes[city.id];
    const targetCubes = perPlayer != null
      ? perPlayer * playerNames.length
      : cityCubeCounts[city.id] ?? GAME_CONSTANTS.INITIAL_CUBES_PER_CITY;
    const cubes = drawBalancedCubes(bag, targetCubes, colorUsage, setupRules.noOwnColorCubes ? city.color : undefined);
    return { ...city, cubes };
  });

  // 헥스 큐브 셋업 (공식 맵: "1 Good: Every Plain and River space")
  // 마을 헥스는 제외 — AoS 룰북 용어상 마을 칸은 'Town hex'로 plain hex와 구분됨
  const hexTilesWithCubes = setupRules.hexCubeSetup
    ? boardState.hexTiles.map((hex) => {
      if (hex.terrain !== 'plain' && hex.terrain !== 'river') return hex;
      const isTownHex = boardState.towns.some(
        t => t.coord.col === hex.coord.col && t.coord.row === hex.coord.row
      );
      if (isTownHex) return hex;
      const cube = bag.length > 0 ? bag.pop() : null;
      return { ...hex, cube: cube ?? null };
    })
    : boardState.hexTiles;

  // 마을 큐브 셋업 (Western US: "Place 1 good on each Town"). townCubeCounts에 지정된 마을만.
  // 도시 큐브와 동일한 전역 색 균형(colorUsage)을 공유한다. hexCubeSetup 맵은 마을 큐브 없음.
  // Southern US: townFixedCube(면화)는 주머니에서 뽑지 않고 모든 마을에 고정색 1개를 놓는다.
  const townCubeCounts = setupRules.townCubeCounts;
  const townFixedCube = setupRules.townFixedCube;
  const townsWithCubes = (setupRules.hexCubeSetup
    ? boardState.towns
    : boardState.towns.map((town) => {
        if (townFixedCube) return { ...town, cubes: [townFixedCube] };
        const target = townCubeCounts[town.id] ?? 0;
        if (target <= 0) return { ...town, cubes: [] };
        return { ...town, cubes: drawBalancedCubes(bag, target, colorUsage) };
      }));

  // 동적 플레이어 초기화
  const playerCount = playerNames.length;
  const activePlayers = PLAYER_ID_ORDER.slice(0, playerCount);

  // AI 플레이어 인덱스 세트 생성
  const aiPlayerIndexes = new Set(aiPlayers.map(ai => ai.playerIndex));

  // 플레이어 객체 생성
  const players: Partial<Record<PlayerId, PlayerState>> = {};
  activePlayers.forEach((playerId, index) => {
    const isAI = aiPlayerIndexes.has(index);
    const p = createInitialPlayerState(
      playerId,
      playerNames[index],
      PLAYER_COLOR_ORDER[index],
      isAI
    );
    // 시작 현금 오버라이드 (Western US: 2주에 $20 — 추가 $10은 개인 자산)
    const sc = setupRules.startingCash;
    if (sc != null) p.cash = sc;
    players[playerId] = p;
  });

  // playerMoves 동적 생성
  const playerMoves: Partial<Record<PlayerId, boolean>> = {};
  activePlayers.forEach(p => { playerMoves[p] = false; });

  // 맵별 턴 수 (튜토리얼 3턴, St. Lucia 8턴 등 - mapRegistry에서 정의)
  const maxTurns = mapData.maxTurns || (TURNS_BY_PLAYER_COUNT[playerCount] || 6);

  // 첫 턴 플레이어 순서 결정 (룰북: 주사위를 굴려 무작위로 결정)
  // - 실제 게임(UI/온라인)은 randomizeStartOrder=true → 좌석은 유지하고 turn order만 무작위 셔플.
  // - 시뮬레이션/단위 테스트는 randomizeStartOrder 미지정(false) → player-index 고정 순서 유지:
  //   순서를 섞으면 player별 통계가 평준화돼 AI 편향("골고루 이기는지")을 측정할 수 없다.
  // - 교대 선공권 맵(St. Lucia 등)은 기존대로 첫 두 명 스왑(2인 전용 = 전체 셔플과 동치).
  const mapRules = getMapProfile(mapId);
  const initialPlayerOrder = [...activePlayers];
  if (mapRules.alternateTurnOrder) {
    if (initialPlayerOrder.length >= 2 && Math.random() < 0.5) {
      [initialPlayerOrder[0], initialPlayerOrder[1]] = [initialPlayerOrder[1], initialPlayerOrder[0]];
    }
  } else if (options.randomizeStartOrder && initialPlayerOrder.length >= 2) {
    // Fisher-Yates 셔플 (turn order만 무작위, 좌석 activePlayers는 불변 → 온라인 좌석 매핑 안전)
    for (let i = initialPlayerOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [initialPlayerOrder[i], initialPlayerOrder[j]] = [initialPlayerOrder[j], initialPlayerOrder[i]];
    }
  }

  // Montréal: 신규 도시 타일마다 주머니에서 큐브 1개 (도시화 시 함께 보드에 올라감)
  // 맵별 신규 도시 타일 구성 (Moon: C·D·G·H 제거 — A·B·E·F만)
  const availableTiles = mapRules.availableNewCityTiles;
  const newCityTiles = NEW_CITY_TILES
    .filter(tile => !availableTiles || availableTiles.includes(tile.id))
    .map(tile => ({ ...tile }));
  if (mapRules.newCitySetupCube) {
    for (const tile of newCityTiles) {
      const [cube] = drawBalancedCubes(bag, 1, colorUsage);
      if (cube) tile.setupCube = cube;
    }
  }

  return {
    // 메타 정보
    gameId: `game-${Date.now()}`,
    mapId,
    playerCount,
    activePlayers,
    maxTurns,

    // 턴 진행
    // 룰북(St. Lucia): 첫 턴 1번은 무작위 결정 (선공권 제안 없음), 이후 턴부터 교대 제안
    // Montréal: 매 라운드 주식 발행 전 정부 링크 건설 — 첫 단계가 governmentLink
    currentTurn: 1,
    currentPhase: mapRules.governmentLinks ? 'governmentLink' : 'issueShares',
    currentPlayer: initialPlayerOrder[0],
    playerOrder: initialPlayerOrder,
    // Montréal: 정부 관리 순번 스냅샷 (라운드 N 관리자 = [(N-1) % 인원]) — 셋업 때 고정 (원본 룰)
    // 비몬트리올 맵은 undefined를 "명시" — zustand set은 얕은 병합이라 키를 빼면 직전
    // 몬트리올 게임의 3인 배열이 남아 2인 맵(St.Lucia 등)에서 없는 플레이어 참조로 크래시
    governmentControllers: mapRules.governmentLinks ? [...initialPlayerOrder] : undefined,

    // 플레이어
    players: players as Record<PlayerId, PlayerState>,

    // 보드
    board: {
      ...boardState,
      cities: citiesWithCubes,
      towns: townsWithCubes,
      hexTiles: hexTilesWithCubes,
      // 달(Moon): 1턴 밤 = 서쪽(왼쪽) — 물품 성장 후 교대 (rules/AosExpMoon.md)
      ...(setupRules.nightDayCycle ? { nightSide: 'west' as const } : {}),
    },
    goodsDisplay: {
      slots: displaySlots,
      bag,
    },
    newCityTiles,  // 복사본 (Montréal은 타일별 setupCube 포함)

    // 경매
    auction: null,

    // 교대 선공권 제안 (alternateTurnOrder 맵 전용)
    turnOrderOffer: null,
    // 다음 턴(2턴) 선공권 제안 차례: 첫 턴 1번이 아닌 플레이어 (엄격 교대)
    nextFirstSeatOption: mapRules.alternateTurnOrder ? (initialPlayerOrder[1] ?? null) : null,

    // 단계 상태
    phaseState: {
      builtTracksThisTurn: 0,
      maxTracksThisTurn: setupRules.buildsPerTurn, // 맵별 상한 (표준 3, 달 2)
      lastBuiltCoords: [],
      moveGoodsRound: 1,
      playerMoves: playerMoves as Record<PlayerId, boolean>,
      engineUpgradedThisTurn: { ...playerMoves } as Record<PlayerId, boolean>,
      productionUsed: false,
      urbanizationUsed: false,
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
      repopulationCube: null,
      // 물품 이동 애니메이션 상태
      movingCube: null,
      reachableDestinations: [],
    },

    // 로그
    logs: [],

    // 실행 취소
    undoCount: 0,

    // 결과
    winner: null,
    finalScores: null,

    // 1회성/임시 상태 — 새 게임마다 반드시 초기화 (persist 병합 시 이전 게임 값 잔존 방지)
    transcontinentalAwarded: false,
    transcontinentalEvent: null,
    incomeReductions: null,
    goodsGrowthEvent: null,
  };
}
