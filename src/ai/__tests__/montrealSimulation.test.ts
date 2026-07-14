/**
 * Montréal Métro 3인 AI 전체 게임 시뮬레이션 — 특수룰 실동작 + 베이스라인
 *
 * 몬트리올 특수 규칙(정부 링크·마스터 네트워크·DGEL·경매 무입찰 페널티·Repopulation·
 * 물품 성장 생략)이 9라운드 끝까지 정상 구동되는지 동기식으로 검증한다.
 *
 * 게이트:
 *  - 모든 게임 정상 종료(무한 루프/멈춤 없음) + 9턴 도달 게임 존재
 *  - 정부 트랙 존재 (owner null + isGovernment) + 미완성 정부 트랙 없음
 *  - 마스터 네트워크: 게임 종료 시 보드 위 모든 트랙이 하나의 연결 성분
 *  - DGEL ≤ 4
 * 동기식 러너 — 실시간 executeAITurn 대신 getAIDecision을 직접 구동(ms 단위).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { getAIDecision } from '@/ai';
import { addFailedBuildCoord } from '../strategies/buildTrack';
import { calculateVictoryPoints } from '@/utils/gameLogic';
import {
  isTrackPartOfCompletedLink,
  hexCoordsEqual,
  getNeighborHex,
  getOppositeEdge,
} from '@/utils/hexGrid';
import { runGovernmentBuildAI, pickRepopulationPlacement } from '@/store/helpers/governmentBuildAI';
import type { BoardState, PlayerId } from '@/types/game';

function createSeededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const PLAYERS: PlayerId[] = ['player1', 'player2', 'player3'];

const AUTO_PHASES = new Set([
  'collectIncome', 'payExpenses', 'incomeReduction', 'advanceTurn',
]);

/** 마스터 네트워크 검증: 모든 트랙 타일이 하나의 연결 성분인가 (정거장 허브 포함 BFS) */
function isMasterNetworkConnected(board: BoardState): boolean {
  const tiles = board.trackTiles;
  if (tiles.length <= 1) return true;
  const k = (c: { col: number; row: number }) => `${c.col},${c.row}`;
  const tileByKey = new Map(tiles.map(t => [k(t.coord), t]));
  const stations = [
    ...board.cities.map(c => c.coord),
    ...board.towns.filter(t => t.newCityColor === null).map(t => t.coord),
  ];
  const stationKeys = new Set(stations.map(k));

  const visitedTiles = new Set<string>();
  const visitedStations = new Set<string>();
  const queue: { coord: { col: number; row: number }; isStation: boolean }[] = [
    { coord: tiles[0].coord, isStation: false },
  ];
  visitedTiles.add(k(tiles[0].coord));

  while (queue.length > 0) {
    const cur = queue.pop()!;
    if (cur.isStation) {
      // 정거장 허브: 이 정거장을 향한 변을 가진 모든 타일과 연결
      for (const t of tiles) {
        if (visitedTiles.has(k(t.coord))) continue;
        for (const e of [...t.edges, ...(t.secondaryEdges ?? [])]) {
          if (hexCoordsEqual(getNeighborHex(t.coord, e), cur.coord)) {
            visitedTiles.add(k(t.coord));
            queue.push({ coord: t.coord, isStation: false });
            break;
          }
        }
      }
      continue;
    }
    const tile = tileByKey.get(k(cur.coord))!;
    for (const e of [...tile.edges, ...(tile.secondaryEdges ?? [])]) {
      const nb = getNeighborHex(cur.coord, e);
      const nbKey = k(nb);
      // 정거장으로 연결
      if (stationKeys.has(nbKey)) {
        if (!visitedStations.has(nbKey)) {
          visitedStations.add(nbKey);
          queue.push({ coord: nb, isStation: true });
        }
        continue;
      }
      // 타일-타일 (마주보는 변)
      const nbTile = tileByKey.get(nbKey);
      if (nbTile && !visitedTiles.has(nbKey)) {
        const back = getOppositeEdge(e);
        if ([...nbTile.edges, ...(nbTile.secondaryEdges ?? [])].includes(back)) {
          visitedTiles.add(nbKey);
          queue.push({ coord: nb, isStation: false });
        }
      }
    }
  }
  return visitedTiles.size === tiles.length;
}

interface MResult {
  accurateVP: Record<PlayerId, number>;
  income: Record<PlayerId, number>;
  shares: Record<PlayerId, number>;
  dgel: Record<PlayerId, number>;
  bankruptcies: number;
  finalTurn: number;
  reachedEnd: boolean;
  deliveries: number;
  builds: number;
  govTracks: number;
  govIncomplete: number;
  masterConnected: boolean;
  repopulations: number;
  actionBans: number;
}

function runMontrealGame(seed: number): MResult {
  const rng = createSeededRng(seed);
  vi.spyOn(Math, 'random').mockImplementation(rng);
  useGameStore.getState().initGame(
    'montreal',
    PLAYERS.map((_, i) => `AI-${i + 1}`),
    PLAYERS.map((_, i) => ({ playerIndex: i, name: `AI-${i + 1}` })),
  );

  let deliveries = 0, builds = 0, repopulations = 0, actionBans = 0;
  let lastBanTurn = 0;
  const MAX_ITER = 80000;
  let iter = 0, stale = 0, lastSig = '';
  let reachedEnd = false;

  while (iter++ < MAX_ITER) {
    const s = useGameStore.getState();
    if (s.currentPhase === 'gameOver') { reachedEnd = true; break; }

    if (s.ui.movingCube) { s.completeCubeMove(); continue; }

    // 정부 링크 단계 — 봇 관리자 자동 건설 (실게임의 runAIAutoPhase 경로와 동일 로직)
    if (s.currentPhase === 'governmentLink') {
      runGovernmentBuildAI(useGameStore.getState);
      useGameStore.getState().nextPhase();
      continue;
    }

    // Repopulation 배치 대기 — 봇이 즉시 배치 (실게임의 executeAITurn 경로와 동일 로직)
    if ((s.phaseState.repopulationCubes?.length ?? 0) > 0) {
      const drawn = s.phaseState.repopulationCubes!;
      const pick = pickRepopulationPlacement(s, drawn) ?? { cube: drawn[0], cityId: s.board.cities[0].id };
      useGameStore.getState().placeRepopulationCube(pick.cube, pick.cityId);
      repopulations++;
      useGameStore.getState().nextPhase();
      continue;
    }

    // 무입찰 페널티 집계 (턴당 1회)
    if (s.currentPhase === 'selectActions' && s.currentTurn !== lastBanTurn) {
      actionBans += PLAYERS.filter(p => s.players[p]?.actionBanned).length;
      lastBanTurn = s.currentTurn;
    }

    // Montréal은 goodsGrowth 생략 — 도달하면 스킵 방어
    if (s.currentPhase === 'goodsGrowth') { s.nextPhase(); continue; }

    const sig = `${s.currentPhase}:${s.currentPlayer}:${s.currentTurn}:` +
      `${s.phaseState.builtTracksThisTurn}:${s.board.trackTiles.length}:` +
      `${JSON.stringify(s.phaseState.playerMoves)}`;
    if (sig === lastSig) {
      if (++stale > 8) { useGameStore.getState().nextPhase(); stale = 0; lastSig = ''; continue; }
    } else { stale = 0; lastSig = sig; }

    if (AUTO_PHASES.has(s.currentPhase)) { s.nextPhase(); continue; }

    const cp = s.currentPlayer;
    // 행동 선택 불가(무입찰 페널티) 봇 차례 — 그냥 진행
    if (s.currentPhase === 'selectActions' && s.players[cp]?.actionBanned) {
      s.nextPhase();
      continue;
    }
    const decision = getAIDecision(s, cp);
    const store = useGameStore.getState();

    switch (decision.type) {
      case 'issueShares':
        if (decision.amount > 0) store.issueShare(cp, decision.amount);
        useGameStore.getState().nextPhase();
        break;

      case 'auction': {
        const a = decision.decision;
        if (a.action === 'bid') store.placeBid(cp, a.amount);
        else if (a.action === 'pass') store.passBid(cp);
        else if (a.action === 'skip') store.skipBid(cp);
        else if (a.action === 'complete') { store.resolveAuction(); useGameStore.getState().nextPhase(); }
        break;
      }

      case 'selectAction':
        store.selectAction(cp, decision.action);
        useGameStore.getState().nextPhase();
        break;

      case 'placeNewCity':
        store.enterUrbanizationMode();
        store.selectNewCityTile(decision.tileId);
        if (!store.placeNewCity(decision.townCoord)) store.exitUrbanizationMode();
        break;

      case 'buildTrack': {
        const d = decision.decision;
        if (d.action === 'build') {
          if (!store.buildTrack(d.coord, d.edges)) { addFailedBuildCoord(cp, d.coord, s.currentTurn); break; }
          builds++;
          const ps = useGameStore.getState().phaseState;
          if (ps.builtTracksThisTurn >= ps.maxTracksThisTurn) useGameStore.getState().nextPhase();
        } else if (d.action === 'buildSpur') {
          if (!store.buildTownSpur(d.townCoord)) { useGameStore.getState().nextPhase(); break; }
          builds++;
          const ps = useGameStore.getState().phaseState;
          if (ps.builtTracksThisTurn >= ps.maxTracksThisTurn) useGameStore.getState().nextPhase();
        } else if (d.action === 'buildComplex') {
          if (!store.buildComplexTrack(d.coord, d.edges, d.trackType)) { addFailedBuildCoord(cp, d.coord, s.currentTurn); break; }
          builds++;
          const ps = useGameStore.getState().phaseState;
          if (ps.builtTracksThisTurn >= ps.maxTracksThisTurn) useGameStore.getState().nextPhase();
        } else {
          useGameStore.getState().nextPhase();
        }
        break;
      }

      case 'moveGoods': {
        const d = decision.decision;
        if (d.action === 'move') {
          store.selectCube(d.sourceCityId, d.cubeIndex);
          useGameStore.getState().selectDestinationCity(d.destinationCoord);
          deliveries++;
          if (!useGameStore.getState().ui.movingCube) useGameStore.getState().nextPhase();
        } else if (d.action === 'upgradeEngine') {
          store.upgradeEngine(cp);
          useGameStore.getState().nextPhase();
        } else {
          useGameStore.getState().nextPhase();
        }
        break;
      }

      default:
        useGameStore.getState().nextPhase();
        break;
    }
  }

  vi.restoreAllMocks();

  const f = useGameStore.getState();
  const accurateVP = {} as Record<PlayerId, number>;
  const income = {} as Record<PlayerId, number>;
  const shares = {} as Record<PlayerId, number>;
  const dgel = {} as Record<PlayerId, number>;
  let bankruptcies = 0;

  for (const pid of PLAYERS) {
    const p = f.players[pid];
    if (!p) continue;
    const ownTracks = f.board.trackTiles.filter(t => t.owner === pid);
    const completed = ownTracks.filter(t => isTrackPartOfCompletedLink(t.coord, f.board)).length;
    accurateVP[pid] = calculateVictoryPoints(p.income, completed, p.issuedShares);
    income[pid] = p.income;
    shares[pid] = p.issuedShares;
    dgel[pid] = p.dgel ?? 0;
    if (p.eliminated) bankruptcies++;
  }

  const govTiles = f.board.trackTiles.filter(t => t.isGovernment);
  const govIncomplete = govTiles.filter(t => !isTrackPartOfCompletedLink(t.coord, f.board)).length;

  return {
    accurateVP, income, shares, dgel, bankruptcies,
    finalTurn: f.currentTurn, reachedEnd, deliveries, builds,
    govTracks: govTiles.length,
    govIncomplete,
    masterConnected: isMasterNetworkConnected(f.board),
    repopulations, actionBans,
  };
}

describe('Montréal Métro 3 AI 전체 게임 — 특수룰 실동작 + 베이스라인', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('3인 게임 완주 + 특수룰 불변식 (100 시드)', () => {
    const seeds = 100;
    const results: MResult[] = [];
    for (let i = 0; i < seeds; i++) results.push(runMontrealGame(7000 + i * 137));

    logSpy.mockRestore();
    const allVPs = results.flatMap(r => PLAYERS.map(p => r.accurateVP[p] ?? 0));
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    console.log(`\n===== Montréal Métro 3인 통계 (${seeds} 시드) =====`);
    console.log(`평균 accurateVP: ${avg(allVPs).toFixed(2)} (min ${Math.min(...allVPs)}, max ${Math.max(...allVPs)})`);
    console.log(`평균 income: ${avg(results.flatMap(r => PLAYERS.map(p => r.income[p] ?? 0))).toFixed(2)}`);
    console.log(`평균 주식: ${avg(results.flatMap(r => PLAYERS.map(p => r.shares[p] ?? 0))).toFixed(2)}`);
    console.log(`평균 DGEL: ${avg(results.flatMap(r => PLAYERS.map(p => r.dgel[p] ?? 0))).toFixed(2)}`);
    console.log(`건설/배달: ${avg(results.map(r => r.builds)).toFixed(1)} / ${avg(results.map(r => r.deliveries)).toFixed(1)}`);
    console.log(`정부 트랙: 평균 ${avg(results.map(r => r.govTracks)).toFixed(1)}개, 미완성 ${avg(results.map(r => r.govIncomplete)).toFixed(2)}개`);
    console.log(`Repopulation: ${avg(results.map(r => r.repopulations)).toFixed(1)}회/게임, 무입찰 페널티: ${avg(results.map(r => r.actionBans)).toFixed(1)}명/게임`);
    console.log(`파산: ${avg(results.map(r => r.bankruptcies)).toFixed(2)}명/게임, 완주 턴: ${JSON.stringify(results.map(r => r.finalTurn))}`);
    console.log(`마스터 네트워크 연결: ${results.filter(r => r.masterConnected).length}/${seeds}`);

    // ① 모든 게임 정상 종료 (멈춤/무한루프 없음)
    expect(results.every(r => r.reachedEnd)).toBe(true);
    // ② 9턴 도달 게임 존재 (몬트리올 = 3인 9라운드)
    expect(results.some(r => r.finalTurn >= 9)).toBe(true);
    // ③ 정부 트랙이 실제로 건설됨 (owner null + isGovernment)
    expect(results.every(r => r.govTracks > 0)).toBe(true);
    // ④ 미완성 정부 트랙 없음 (원본 룰: no stubs)
    expect(results.every(r => r.govIncomplete === 0)).toBe(true);
    // ⑤ 마스터 네트워크: 보드 위 모든 트랙이 하나의 연결 성분
    expect(results.every(r => r.masterConnected)).toBe(true);
    // ⑥ DGEL 상한 준수
    expect(results.every(r => PLAYERS.every(p => (r.dgel[p] ?? 0) <= 4))).toBe(true);
  }, 900_000);
});
