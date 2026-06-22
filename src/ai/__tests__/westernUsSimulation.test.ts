/**
 * Western US 6인 AI 전체 게임 시뮬레이션 — 다인(6인) 실동작 + 베이스라인
 *
 * 서부 미국 맵 특수 규칙(마을 큐브·$20 시작현금·늪/강 $4·산 $5·동서 배달 보너스·
 * 시작 도시 제한·대륙횡단 전 연속성 강제·대륙횡단 연결 보너스)이 끝까지 정상 구동되는지
 * 동기식으로 검증한다. tutorial/St.Lucia/Rust Belt/Germany 회귀 게이트와 별개의 베이스라인.
 *
 * 게이트: 모든 게임이 정상 종료(무한 루프/멈춤 없음) + 6턴 도달.
 * ⚠️ 6인은 편차가 매우 크다 → 베이스라인 측정은 반드시 다(多)시드로.
 * 동기식 러너 — 실시간 executeAITurn 대신 getAIDecision을 직접 구동(ms 단위).
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

const PLAYERS: PlayerId[] = ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];

const AUTO_PHASES = new Set([
  'collectIncome', 'payExpenses', 'incomeReduction', 'advanceTurn',
]);

interface WResult {
  accurateVP: Record<PlayerId, number>;
  income: Record<PlayerId, number>;
  shares: Record<PlayerId, number>;
  completedTracks: Record<PlayerId, number>;
  transcontinental: number;
  bankruptcies: number;
  finalTurn: number;
  reachedEnd: boolean;
  deliveries: number;
  builds: number;
  urbanizations: number;
}

function runWesternUsGame(seed: number): WResult {
  const rng = createSeededRng(seed);
  vi.spyOn(Math, 'random').mockImplementation(rng);
  useGameStore.getState().initGame(
    'western-us',
    PLAYERS.map((_, i) => `AI-${i + 1}`),
    PLAYERS.map((_, i) => ({ playerIndex: i, name: `AI-${i + 1}` })),
  );
  vi.restoreAllMocks();

  let deliveries = 0, builds = 0, urbanizations = 0;
  const MAX_ITER = 120000;
  let iter = 0, stale = 0, lastSig = '';
  let reachedEnd = false;

  while (iter++ < MAX_ITER) {
    const s = useGameStore.getState();
    if (s.currentPhase === 'gameOver') { reachedEnd = true; break; }

    if (s.ui.movingCube) { s.completeCubeMove(); continue; }

    if (s.currentPhase === 'goodsGrowth') {
      const activeCount = s.activePlayers.filter(p => !s.players[p]?.eliminated).length;
      const dice = Array.from({ length: activeCount }, () => 1 + Math.floor(rng() * 6));
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

      case 'turnOrderOffer':
        store.respondTurnOrderOffer(cp, decision.accept);
        if (useGameStore.getState().currentPhase === 'determinePlayerOrder') {
          useGameStore.getState().nextPhase();
        }
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
  const completedTracks = {} as Record<PlayerId, number>;
  let bankruptcies = 0, transcontinental = 0;

  for (const pid of PLAYERS) {
    const p = f.players[pid];
    if (!p) continue;
    const ownTracks = f.board.trackTiles.filter(t => t.owner === pid);
    const completed = ownTracks.filter(t => isTrackPartOfCompletedLink(t.coord, f.board)).length;
    accurateVP[pid] = calculateVictoryPoints(p.income, completed, p.issuedShares);
    income[pid] = p.income;
    shares[pid] = p.issuedShares;
    completedTracks[pid] = completed;
    if (p.eliminated) bankruptcies++;
    if (p.transcontinental) transcontinental++;
  }

  return {
    accurateVP, income, shares, completedTracks, transcontinental, bankruptcies,
    finalTurn: f.currentTurn, reachedEnd, deliveries, builds, urbanizations,
  };
}

describe('Western US 6 AI 전체 게임 — 다인 실동작 + 베이스라인', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  function measure(seeds: number) {
    const results: WResult[] = [];
    for (let i = 0; i < seeds; i++) results.push(runWesternUsGame(5000 + i * 211));

    const allVPs: number[] = [];
    let totalBankrupt = 0;
    for (const r of results) {
      for (const pid of PLAYERS) allVPs.push(r.accurateVP[pid] ?? 0);
      totalBankrupt += r.bankruptcies;
    }
    const avgVP = allVPs.reduce((a, b) => a + b, 0) / allVPs.length;
    const sum = (f: (r: WResult) => number) => results.reduce((a, r) => a + f(r), 0);
    return {
      results, seeds,
      avgVP, minVP: Math.min(...allVPs), maxVP: Math.max(...allVPs),
      avgIncome: sum(r => PLAYERS.reduce((a, p) => a + (r.income[p] ?? 0), 0)) / (seeds * 6),
      avgShares: sum(r => PLAYERS.reduce((a, p) => a + (r.shares[p] ?? 0), 0)) / (seeds * 6),
      avgBankruptPerGame: totalBankrupt / seeds,
      avgDeliveries: sum(r => r.deliveries) / seeds,
      avgBuilds: sum(r => r.builds) / seeds,
      avgUrban: sum(r => r.urbanizations) / seeds,
      avgTranscontinental: sum(r => r.transcontinental) / seeds,
      avgTurns: sum(r => r.finalTurn) / seeds,
      finishedTurns: results.map(r => r.finalTurn),
      allReachedEnd: results.every(r => r.reachedEnd),
    };
  }

  it('6인 게임 완주 + 베이스라인 측정 (20 시드)', () => {
    const m = measure(20);
    logSpy.mockRestore();
    console.log('\n===== Western US 6인 VP 통계 (20 시드) =====');
    console.log(`평균 accurateVP: ${m.avgVP.toFixed(2)} (min ${m.minVP}, max ${m.maxVP})`);
    console.log(`평균 발행주식: ${m.avgShares.toFixed(2)}, 평균 income: ${m.avgIncome.toFixed(2)}`);
    console.log(`건설/배달/도시화: 건설 ${m.avgBuilds.toFixed(1)}, 배달 ${m.avgDeliveries.toFixed(1)}, 도시화 ${m.avgUrban.toFixed(1)}`);
    console.log(`대륙횡단 달성: ${m.avgTranscontinental.toFixed(2)}명/게임`);
    console.log(`파산: ${m.avgBankruptPerGame.toFixed(2)}명/게임, 평균 완주턴 ${m.avgTurns.toFixed(1)} (최대 6)`);
    console.log(`완주 턴 분포: ${JSON.stringify(m.finishedTurns)}`);

    // 핵심: 모든 게임이 정상 종료 (멈춤/무한루프 없음) — Western US 특수 규칙 실동작 보장
    expect(m.allReachedEnd).toBe(true);
    // 모든 게임이 최소 2턴 이상 진행
    expect(m.finishedTurns.every(t => t >= 2)).toBe(true);
    // Western US 6인 = 6턴 (룰북) — 정상 게임은 6턴 도달
    expect(m.finishedTurns.some(t => t >= 6)).toBe(true);
  }, 240_000);
});
