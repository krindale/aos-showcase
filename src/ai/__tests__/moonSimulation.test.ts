/**
 * Moon(달) 4인 AI 전체 게임 시뮬레이션 — 특수룰 실동작 + 베이스라인
 *
 * 달 맵 특수 규칙(랩 어라운드·Moon Base 네트워크·건설 2개·밤낮 교대·저중력·주사위 성장)이
 * 끝까지 정상 구동되는지 동기식으로 검증한다 (koreaSimulation 러너 패턴).
 *
 * 게이트: 모든 게임 정상 종료 + 8턴 도달 + 달 불변식
 *   ① 밤낮 교대: 턴 N의 밤쪽 = N 홀수→west, 짝수→east
 *   ② 건설 상한: 어떤 (턴, 빌더)도 3개(Engineer) 초과 건설 없음, Engineer 아니면 2개 이하
 *   ③ Moon Base(noDemand)로 배달이 끝나지 않음 (큐브 수가 성장 외로 늘지 않음)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { getAIDecision } from '@/ai';
import { addFailedBuildCoord } from '../strategies/buildTrack';
import { calculateVictoryPoints } from '@/utils/gameLogic';
import { isTrackPartOfCompletedLink } from '@/utils/hexGrid';
import type { PlayerId } from '@/types/game';

function createSeededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const PLAYERS: PlayerId[] = ['player1', 'player2', 'player3', 'player4'];

const AUTO_PHASES = new Set([
  'collectIncome', 'payExpenses', 'incomeReduction', 'advanceTurn',
]);

interface MResult {
  accurateVP: Record<PlayerId, number>;
  income: Record<PlayerId, number>;
  shares: Record<PlayerId, number>;
  completedTracks: Record<PlayerId, number>;
  engine: Record<PlayerId, number>;
  bankruptcies: number;
  finalTurn: number;
  reachedEnd: boolean;
  deliveries: number;
  builds: number;
  buildsByPlayer: Record<PlayerId, number>;
  deliveriesByPlayer: Record<PlayerId, number>;
  winner: PlayerId;
  nightSideOk: boolean;        // 불변식 ①
  buildLimitOk: boolean;       // 불변식 ②
  moonBaseDeliveryOk: boolean; // 불변식 ③
  growthEvents: number;        // 성장으로 도시에 큐브가 추가된 횟수 (성장 실동작 확인)
}

function runMoonGame(seed: number): MResult {
  const rng = createSeededRng(seed);
  vi.spyOn(Math, 'random').mockImplementation(rng);
  useGameStore.getState().initGame(
    'moon',
    PLAYERS.map((_, i) => `AI-${i + 1}`),
    PLAYERS.map((_, i) => ({ playerIndex: i, name: `AI-${i + 1}` })),
  );
  vi.restoreAllMocks();

  let deliveries = 0, builds = 0;
  const buildsByPlayer = {} as Record<PlayerId, number>;
  const deliveriesByPlayer = {} as Record<PlayerId, number>;
  PLAYERS.forEach(p => { buildsByPlayer[p] = 0; deliveriesByPlayer[p] = 0; });

  // 불변식 추적
  let nightSideOk = true;
  let buildLimitOk = true;
  let moonBaseDeliveryOk = true;
  let growthEvents = 0;
  let lastGrowthTurn = 0;

  const MAX_ITER = 80000;
  let iter = 0, stale = 0, lastSig = '';
  let reachedEnd = false;

  while (iter++ < MAX_ITER) {
    const s = useGameStore.getState();
    if (s.currentPhase === 'gameOver') { reachedEnd = true; break; }

    // 불변식 ①: 턴 N의 밤쪽 (1턴 west 시작, 성장 후 교대 → 홀수턴 west/짝수턴 east)
    const expectedNight = s.currentTurn % 2 === 1 ? 'west' : 'east';
    if (s.board.nightSide !== expectedNight) nightSideOk = false;

    // 불변식 ③: Moon Base 큐브는 셋업 8개에서 늘지 않는다 (noDemand — 배달 종착 불가,
    // 성장 대상도 아님). 배달 출발로 줄기만 한다.
    const moonBase = s.board.cities.find(c => c.id === 'moonBase');
    if (moonBase && moonBase.cubes.length > 8) moonBaseDeliveryOk = false;

    // 불변식 ②: 건설 상한 — store 카운터가 상한을 넘지 않고, 상한 자체가 2(Engineer 3)다.
    // (마을 가닥은 "마을당 첫 변경만 1카운트"라 커밋 횟수 수동 집계는 오탐 — store 기준 검증)
    if (s.currentPhase === 'buildTrack') {
      const builderIsEngineer = s.players[s.currentPlayer]?.selectedAction === 'engineer';
      if (s.phaseState.maxTracksThisTurn > (builderIsEngineer ? 3 : 2)) buildLimitOk = false;
      if (s.phaseState.builtTracksThisTurn > s.phaseState.maxTracksThisTurn) buildLimitOk = false;
    }

    if (s.ui.movingCube) { s.completeCubeMove(); continue; }

    if (s.currentPhase === 'goodsGrowth') {
      // 달: 주사위 = 활성 인원 × 2 (growthDicePerPlayer)
      const activeCount = s.activePlayers.filter(p => !s.players[p]?.eliminated).length;
      const dice = Array.from({ length: activeCount * 2 }, () => 1 + Math.floor(rng() * 6));
      const cubesBefore = s.board.cities.reduce((a, c) => a + c.cubes.length, 0);
      s.growGoods(dice);
      const after = useGameStore.getState();
      const cubesAfter = after.board.cities.reduce((a, c) => a + c.cubes.length, 0);
      if (cubesAfter > cubesBefore && s.currentTurn !== lastGrowthTurn) {
        growthEvents++;
        lastGrowthTurn = s.currentTurn;
      }
      useGameStore.getState().nextPhase();
      continue;
    }

    const sig = `${s.currentPhase}:${s.currentPlayer}:${s.currentTurn}:` +
      `${s.phaseState.builtTracksThisTurn}:${s.board.trackTiles.length}:` +
      `${JSON.stringify(s.phaseState.playerMoves)}`;
    if (sig === lastSig) {
      if (++stale > 8) { useGameStore.getState().nextPhase(); stale = 0; lastSig = ''; continue; }
    } else { stale = 0; lastSig = sig; }

    if (AUTO_PHASES.has(s.currentPhase)) { s.nextPhase(); continue; }

    const cp = s.currentPlayer;
    const decision = getAIDecision(s, cp);
    const store = useGameStore.getState();

    const recordBuild = () => { builds++; buildsByPlayer[cp]++; };

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
          recordBuild();
          const ps = useGameStore.getState().phaseState;
          if (ps.builtTracksThisTurn >= ps.maxTracksThisTurn) useGameStore.getState().nextPhase();
        } else if (d.action === 'buildSpur') {
          if (!store.buildTownSpur(d.townCoord)) { useGameStore.getState().nextPhase(); break; }
          recordBuild();
          const ps = useGameStore.getState().phaseState;
          if (ps.builtTracksThisTurn >= ps.maxTracksThisTurn) useGameStore.getState().nextPhase();
        } else if (d.action === 'buildComplex') {
          if (!store.buildComplexTrack(d.coord, d.edges, d.trackType)) { addFailedBuildCoord(cp, d.coord, s.currentTurn); break; }
          recordBuild();
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
          deliveries++; deliveriesByPlayer[cp]++;
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

  const f = useGameStore.getState();
  const accurateVP = {} as Record<PlayerId, number>;
  const income = {} as Record<PlayerId, number>;
  const shares = {} as Record<PlayerId, number>;
  const completedTracks = {} as Record<PlayerId, number>;
  const engine = {} as Record<PlayerId, number>;
  let bankruptcies = 0;

  for (const pid of PLAYERS) {
    const p = f.players[pid];
    if (!p) continue;
    const ownTracks = f.board.trackTiles.filter(t => t.owner === pid);
    const completed = ownTracks.filter(t => isTrackPartOfCompletedLink(t.coord, f.board)).length;
    accurateVP[pid] = calculateVictoryPoints(p.income, completed, p.issuedShares);
    income[pid] = p.income;
    shares[pid] = p.issuedShares;
    completedTracks[pid] = completed;
    engine[pid] = p.engineLevel;
    if (p.eliminated) bankruptcies++;
  }

  let winner = PLAYERS[0], bestVP = -Infinity;
  for (const pid of PLAYERS) {
    const v = accurateVP[pid] ?? -Infinity;
    if (v > bestVP) { bestVP = v; winner = pid; }
  }

  return {
    accurateVP, income, shares, completedTracks, engine, bankruptcies,
    finalTurn: f.currentTurn, reachedEnd, deliveries, builds,
    buildsByPlayer, deliveriesByPlayer, winner,
    nightSideOk, buildLimitOk, moonBaseDeliveryOk, growthEvents,
  };
}

describe('Moon 4 AI 전체 게임 — 특수룰 실동작 + 베이스라인', () => {
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

  function measure(seeds: number) {
    const results: MResult[] = [];
    for (let i = 0; i < seeds; i++) results.push(runMoonGame(7000 + i * 137));

    const allVPs: number[] = [];
    let totalBankrupt = 0;
    const winnerCounts = {} as Record<PlayerId, number>;
    type PerPlayer = { vp: number; income: number; shares: number; engine: number; builds: number; deliveries: number; tracks: number };
    const perPlayer = {} as Record<PlayerId, PerPlayer>;
    PLAYERS.forEach(p => {
      winnerCounts[p] = 0;
      perPlayer[p] = { vp: 0, income: 0, shares: 0, engine: 0, builds: 0, deliveries: 0, tracks: 0 };
    });
    for (const r of results) {
      for (const pid of PLAYERS) {
        allVPs.push(r.accurateVP[pid] ?? 0);
        const x = perPlayer[pid];
        x.vp += r.accurateVP[pid] ?? 0;
        x.income += r.income[pid] ?? 0;
        x.shares += r.shares[pid] ?? 0;
        x.engine += r.engine[pid] ?? 0;
        x.builds += r.buildsByPlayer[pid] ?? 0;
        x.deliveries += r.deliveriesByPlayer[pid] ?? 0;
        x.tracks += r.completedTracks[pid] ?? 0;
      }
      totalBankrupt += r.bankruptcies;
      winnerCounts[r.winner]++;
    }
    PLAYERS.forEach(p => {
      const x = perPlayer[p];
      x.vp /= seeds; x.income /= seeds; x.shares /= seeds; x.engine /= seeds;
      x.builds /= seeds; x.deliveries /= seeds; x.tracks /= seeds;
    });
    const sum = (f: (r: MResult) => number) => results.reduce((a, r) => a + f(r), 0);
    return {
      results, seeds,
      avgVP: allVPs.reduce((a, b) => a + b, 0) / allVPs.length,
      minVP: Math.min(...allVPs), maxVP: Math.max(...allVPs),
      avgBankruptPerGame: totalBankrupt / seeds,
      avgDeliveries: sum(r => r.deliveries) / seeds,
      avgBuilds: sum(r => r.builds) / seeds,
      avgGrowthEvents: sum(r => r.growthEvents) / seeds,
      finishedTurns: results.map(r => r.finalTurn),
      allReachedEnd: results.every(r => r.reachedEnd),
      nightSideOk: results.every(r => r.nightSideOk),
      buildLimitOk: results.every(r => r.buildLimitOk),
      moonBaseDeliveryOk: results.every(r => r.moonBaseDeliveryOk),
      winnerCounts, perPlayer,
    };
  }

  it('4인 게임 완주 + 달 불변식 + 베이스라인 측정 (100 시드)', () => {
    const m = measure(100);
    logSpy.mockRestore();
    console.log('\n===== Moon 4인 VP 통계 (100 시드) =====');
    console.log(`평균 accurateVP: ${m.avgVP.toFixed(2)} (min ${m.minVP}, max ${m.maxVP})`);
    console.log(`건설/배달/성장: 건설 ${m.avgBuilds.toFixed(1)}, 배달 ${m.avgDeliveries.toFixed(1)}, 성장발생턴 ${m.avgGrowthEvents.toFixed(1)}`);
    console.log(`파산: ${m.avgBankruptPerGame.toFixed(2)}명/게임, 완주 턴 분포: ${JSON.stringify(m.finishedTurns)}`);
    console.log(`최종 승자 분포: ${JSON.stringify(m.winnerCounts)}`);
    console.log('--- player별 평균 ---');
    PLAYERS.forEach(p => {
      const x = m.perPlayer[p];
      console.log(`${p}: VP ${x.vp.toFixed(1)} | 건설 ${x.builds.toFixed(1)} | 수송 ${x.deliveries.toFixed(1)} | 엔진 ${x.engine.toFixed(1)} | 주식 ${x.shares.toFixed(1)} | income ${x.income.toFixed(1)} | 완성트랙 ${x.tracks.toFixed(1)}`);
    });

    // 핵심 게이트: 정상 종료 + 달 불변식
    expect(m.allReachedEnd).toBe(true);
    expect(m.nightSideOk).toBe(true);
    expect(m.buildLimitOk).toBe(true);
    expect(m.moonBaseDeliveryOk).toBe(true);
    // 4인 8턴 도달
    expect(m.finishedTurns.some(t => t >= 8)).toBe(true);
    // 게임이 실제로 "돌아간다" — 건설/배달이 발생
    expect(m.avgBuilds).toBeGreaterThan(0);
    expect(m.avgDeliveries).toBeGreaterThan(0);
  }, 900_000);
});
