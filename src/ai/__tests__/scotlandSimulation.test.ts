/**
 * Scotland 2인 AI 동기식 전체게임 러너(8턴) + 베이스라인
 *
 * 2인 전용 준표준 맵(변형: 페리 게이트·Ayr↔Glasgow 가닥 링크·경매 절반·턴오더 선공·성장 4+4)이
 * 2 AI 게임으로 끝까지 구동되는지 검증하고 VP/파산 베이스라인을 측정한다.
 * 러너는 southernEnglandSimulation과 동일 구조 (성장 주사위만 growthDiceSplit 반영 8개).
 *
 * 불변식: 페리 직결 링크($6)는 양끝이 도시(도시화 완료)가 아니면 소유자가 생기지 않는다.
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

const PLAYERS: PlayerId[] = ['player1', 'player2'];

const AUTO_PHASES = new Set([
  'collectIncome', 'payExpenses', 'incomeReduction', 'advanceTurn',
]);

interface ScotResult {
  accurateVP: Record<PlayerId, number>;
  income: Record<PlayerId, number>;
  shares: Record<PlayerId, number>;
  bankruptcies: number;
  finalTurn: number;
  reachedEnd: boolean;
  deliveries: number;
  builds: number;
  urbanizations: number;
  ferryViolations: number; // 페리 게이트 불변식 위반 (0이어야 함)
}

/** Scotland 한 게임(2 AI)을 동기식으로 끝까지 구동하고 결과 측정 */
function runScotlandGame(seed: number): ScotResult {
  const rng = createSeededRng(seed);
  vi.spyOn(Math, 'random').mockImplementation(rng);
  useGameStore.getState().initGame(
    'scotland',
    PLAYERS.map((_, i) => `AI-${i + 1}`),
    PLAYERS.map((_, i) => ({ playerIndex: i, name: `AI-${i + 1}` })),
  );
  vi.restoreAllMocks();

  let deliveries = 0, builds = 0, urbanizations = 0;
  let ferryViolations = 0;
  const MAX_ITER = 60000;
  let iter = 0, stale = 0, lastSig = '';
  let reachedEnd = false;

  while (iter++ < MAX_ITER) {
    const s = useGameStore.getState();
    if (s.currentPhase === 'gameOver') { reachedEnd = true; break; }

    // 불변식: 페리($6)는 양끝이 도시일 때만 소유자가 생긴다 (턴 경계에서 검사)
    if (s.currentPhase === 'issueShares') {
      for (const dl of s.board.directLinks ?? []) {
        if (dl.cost !== 6 || dl.owner === null) continue;
        const aCity = s.board.cities.some(c => c.id === dl.cityA);
        const bCity = s.board.cities.some(c => c.id === dl.cityB);
        if (!aCity || !bCity) ferryViolations++;
      }
    }

    if (s.ui.movingCube) { s.completeCubeMove(); continue; }

    if (s.currentPhase === 'goodsGrowth') {
      // Scotland: 4(라이트)+4(다크) 고정 — growthDiceSplit (runAIAutoPhase와 동일 규칙)
      const dice = Array.from({ length: 8 }, () => 1 + Math.floor(rng() * 6));
      s.growGoods(dice);
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
        else urbanizations++;
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
        } else if (d.action === 'buildDirectLink') {
          if (!store.buildDirectLink(d.cityA, d.cityB)) { useGameStore.getState().nextPhase(); break; }
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

  const f = useGameStore.getState();
  const accurateVP = {} as Record<PlayerId, number>;
  const income = {} as Record<PlayerId, number>;
  const shares = {} as Record<PlayerId, number>;
  let bankruptcies = 0;

  for (const pid of PLAYERS) {
    const p = f.players[pid];
    if (!p) continue;
    const ownTracks = f.board.trackTiles.filter(t => t.owner === pid);
    const completed = ownTracks.filter(t => isTrackPartOfCompletedLink(t.coord, f.board)).length;
    accurateVP[pid] = calculateVictoryPoints(p.income, completed, p.issuedShares);
    income[pid] = p.income;
    shares[pid] = p.issuedShares;
    if (p.eliminated) bankruptcies++;
  }

  return {
    accurateVP, income, shares, bankruptcies,
    finalTurn: f.currentTurn, reachedEnd, deliveries, builds, urbanizations,
    ferryViolations,
  };
}

describe('Scotland 2 AI 전체 게임 — 실동작 + 베이스라인', () => {
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
    const results: ScotResult[] = [];
    for (let i = 0; i < seeds; i++) results.push(runScotlandGame(3000 + i * 137));

    const allVPs: number[] = [];
    let totalBankrupt = 0, totalViolations = 0;
    const winnerCounts = {} as Record<PlayerId, number>;
    const perPlayerVP = {} as Record<PlayerId, number>;
    PLAYERS.forEach(p => { winnerCounts[p] = 0; perPlayerVP[p] = 0; });
    for (const r of results) {
      for (const pid of PLAYERS) {
        allVPs.push(r.accurateVP[pid] ?? 0);
        perPlayerVP[pid] += r.accurateVP[pid] ?? 0;
      }
      totalBankrupt += r.bankruptcies;
      totalViolations += r.ferryViolations;
      let best = PLAYERS[0], bestVP = -Infinity;
      for (const pid of PLAYERS) {
        const v = r.accurateVP[pid] ?? -Infinity;
        if (v > bestVP) { bestVP = v; best = pid; }
      }
      winnerCounts[best]++;
    }
    PLAYERS.forEach(p => { perPlayerVP[p] /= seeds; });
    const sum = (f: (r: ScotResult) => number) => results.reduce((a, r) => a + f(r), 0);
    return {
      seeds,
      avgVP: allVPs.reduce((a, b) => a + b, 0) / allVPs.length,
      minVP: Math.min(...allVPs), maxVP: Math.max(...allVPs),
      avgIncome: sum(r => PLAYERS.reduce((a, p) => a + (r.income[p] ?? 0), 0)) / (seeds * PLAYERS.length),
      avgShares: sum(r => PLAYERS.reduce((a, p) => a + (r.shares[p] ?? 0), 0)) / (seeds * PLAYERS.length),
      avgBankruptPerGame: totalBankrupt / seeds,
      avgDeliveries: sum(r => r.deliveries) / seeds,
      avgBuilds: sum(r => r.builds) / seeds,
      avgUrban: sum(r => r.urbanizations) / seeds,
      finishedTurns: results.map(r => r.finalTurn),
      allReachedEnd: results.every(r => r.reachedEnd),
      totalViolations,
      winnerCounts, perPlayerVP,
    };
  }

  // 측정 + 핵심 게이트: 모든 2인 게임이 정상 종료하고 페리 게이트 불변식을 지킨다.
  // 시드 수는 AOS_SEEDS 환경변수로 조절 (베이스라인 측정 시 100) — 기본 게이트는 20.
  it('2인 게임 완주 + 베이스라인 측정', () => {
    const seeds = Number(process.env.AOS_SEEDS) || 20;
    const m = measure(seeds);
    logSpy.mockRestore();
    console.log(`\n===== Scotland 2인 VP 통계 (${m.seeds} 시드) =====`);
    console.log(`평균 accurateVP: ${m.avgVP.toFixed(2)} (min ${m.minVP}, max ${m.maxVP})`);
    console.log(`평균 발행주식: ${m.avgShares.toFixed(2)}, 평균 income: ${m.avgIncome.toFixed(2)}`);
    console.log(`건설/배달/도시화: 건설 ${m.avgBuilds.toFixed(1)}, 배달 ${m.avgDeliveries.toFixed(1)}, 도시화 ${m.avgUrban.toFixed(1)}`);
    console.log(`파산: ${m.avgBankruptPerGame.toFixed(2)}명/게임, 완주 턴 분포: ${JSON.stringify(m.finishedTurns)}`);
    console.log(`최종 승자 분포: ${JSON.stringify(m.winnerCounts)}`);
    console.log(`player별 평균 VP: ${JSON.stringify(Object.fromEntries(Object.entries(m.perPlayerVP).map(([k, v]) => [k, +v.toFixed(1)])))}`);
    console.log(`페리 게이트 불변식 위반: ${m.totalViolations}건 (0이어야 함)`);

    // 핵심: 모든 게임이 정상 종료 (멈춤/무한루프 없음)
    expect(m.allReachedEnd).toBe(true);
    // 모든 게임이 최소 2턴 이상 진행 + 8턴 도달 게임 존재
    expect(m.finishedTurns.every(t => t >= 2)).toBe(true);
    expect(m.finishedTurns.some(t => t >= 8)).toBe(true);
    // 페리 게이트 불변식
    expect(m.totalViolations).toBe(0);
  }, 900_000);
});
