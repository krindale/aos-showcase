/**
 * Southern England 5인(디폴트) AI 동기식 전체게임 러너(7턴) + 베이스라인
 *
 * 준표준 맵(변형: NW 큐브 3·신도시 B 제거·London 파랑 대체)이 5인 게임으로 끝까지
 * 구동되는지 검증하고 VP/파산 베이스라인을 측정한다. 러너는 rustBeltSimulation과 동일 구조.
 *
 * 불변식: 게임 어느 시점에도 London이 파란 큐브를 보유하지 않는다
 * (v2 시트: 셋업·성장의 London행 파랑은 주사위로 NW/NE 대체 — 배달 불가 데드 큐브 방지).
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

const PLAYERS: PlayerId[] = ['player1', 'player2', 'player3', 'player4', 'player5'];

const AUTO_PHASES = new Set([
  'collectIncome', 'payExpenses', 'incomeReduction', 'advanceTurn',
]);

interface SEResult {
  accurateVP: Record<PlayerId, number>;
  income: Record<PlayerId, number>;
  shares: Record<PlayerId, number>;
  completedTracks: Record<PlayerId, number>;
  bankruptcies: number;
  finalTurn: number;
  reachedEnd: boolean;
  deliveries: number;
  builds: number;
  urbanizations: number;
  londonBlueViolations: number; // 불변식 위반 횟수 (0이어야 함)
  // ── 진단(경매/순서) ──
  bidsThisGame: number;                          // 이 게임에서 실제 입찰(placeBid) 발생 횟수
  firstSeatByBid: Record<PlayerId, number>;      // 입찰($>0)로 1번 획득한 횟수 (player별)
  firstSeatByYield: Record<PlayerId, number>;    // 양보(입찰 없이)로 1번이 된 횟수 (player별)
}

/** Southern England 한 게임(5 AI)을 동기식으로 끝까지 구동하고 결과 측정 */
function runEnglandGame(seed: number): SEResult {
  const rng = createSeededRng(seed);
  vi.spyOn(Math, 'random').mockImplementation(rng);
  useGameStore.getState().initGame(
    'southern-england',
    PLAYERS.map((_, i) => `AI-${i + 1}`),
    PLAYERS.map((_, i) => ({ playerIndex: i, name: `AI-${i + 1}` })),
  );
  vi.restoreAllMocks();

  let deliveries = 0, builds = 0, urbanizations = 0;
  let londonBlueViolations = 0;
  const firstSeatByBid = {} as Record<PlayerId, number>;
  const firstSeatByYield = {} as Record<PlayerId, number>;
  PLAYERS.forEach(p => { firstSeatByBid[p] = 0; firstSeatByYield[p] = 0; });
  let lastSeatTurn = 0;
  let bidsThisGame = 0;
  let turnHadBid = false; // 이번 턴 경매에서 실제 입찰이 있었는지 (selectActions 진입 시 분류 후 리셋)
  const MAX_ITER = 80000;
  let iter = 0, stale = 0, lastSig = '';
  let reachedEnd = false;

  while (iter++ < MAX_ITER) {
    const s = useGameStore.getState();
    if (s.currentPhase === 'gameOver') { reachedEnd = true; break; }

    // 불변식: London은 어느 시점에도 파랑을 보유하지 않는다 (턴 경계에서 검사)
    if (s.currentPhase === 'issueShares') {
      const london = s.board.cities.find(c => c.id === 'london');
      if (london?.cubes.includes('blue')) londonBlueViolations++;
    }

    // 1번(선공) 획득 방식 분류 — 경매로 순서가 확정된 뒤(selectActions) 턴당 1회.
    // "입찰로 따냈는지(byBid) vs 아무도 안 사서 양보로 됐는지(byYield)"를 분류 —
    // 순서 고착이 경매 경쟁의 결과인지, 경매가 사실상 작동 안 해서인지 진단.
    if (s.currentPhase === 'selectActions' && s.currentTurn !== lastSeatTurn) {
      const first = s.playerOrder[0];
      if (first) {
        if (turnHadBid) firstSeatByBid[first] = (firstSeatByBid[first] ?? 0) + 1;
        else firstSeatByYield[first] = (firstSeatByYield[first] ?? 0) + 1;
      }
      lastSeatTurn = s.currentTurn;
      turnHadBid = false; // 다음 턴 경매를 위해 리셋
    }

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

      case 'auction': {
        const a = decision.decision;
        if (a.action === 'bid') { store.placeBid(cp, a.amount); bidsThisGame++; turnHadBid = true; }
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
    if (p.eliminated) bankruptcies++;
  }

  return {
    accurateVP, income, shares, completedTracks, bankruptcies,
    finalTurn: f.currentTurn, reachedEnd, deliveries, builds, urbanizations,
    londonBlueViolations,
    bidsThisGame, firstSeatByBid, firstSeatByYield,
  };
}

describe('Southern England 5 AI 전체 게임 — 실동작 + 베이스라인', () => {
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
    const results: SEResult[] = [];
    for (let i = 0; i < seeds; i++) results.push(runEnglandGame(2000 + i * 137));

    const allVPs: number[] = [];
    let totalBankrupt = 0, totalViolations = 0;
    const winnerCounts = {} as Record<PlayerId, number>;
    const perPlayerVP = {} as Record<PlayerId, number>;
    const firstSeatBidTotal = {} as Record<PlayerId, number>;
    const firstSeatYieldTotal = {} as Record<PlayerId, number>;
    PLAYERS.forEach(p => { winnerCounts[p] = 0; perPlayerVP[p] = 0; firstSeatBidTotal[p] = 0; firstSeatYieldTotal[p] = 0; });
    let totalBids = 0;
    for (const r of results) {
      for (const pid of PLAYERS) {
        allVPs.push(r.accurateVP[pid] ?? 0);
        perPlayerVP[pid] += r.accurateVP[pid] ?? 0;
        firstSeatBidTotal[pid] += r.firstSeatByBid[pid] ?? 0;
        firstSeatYieldTotal[pid] += r.firstSeatByYield[pid] ?? 0;
      }
      totalBids += r.bidsThisGame;
      totalBankrupt += r.bankruptcies;
      totalViolations += r.londonBlueViolations;
      let best = PLAYERS[0], bestVP = -Infinity;
      for (const pid of PLAYERS) {
        const v = r.accurateVP[pid] ?? -Infinity;
        if (v > bestVP) { bestVP = v; best = pid; }
      }
      winnerCounts[best]++;
    }
    PLAYERS.forEach(p => { perPlayerVP[p] /= seeds; });
    const sum = (f: (r: SEResult) => number) => results.reduce((a, r) => a + f(r), 0);
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
      avgBidsPerGame: totalBids / seeds,
      firstSeatBidTotal, firstSeatYieldTotal,
    };
  }

  // 측정 + 핵심 게이트: 모든 5인 게임이 정상 종료하고 London 파랑 불변식을 지킨다.
  // 시드 수는 AOS_SEEDS 환경변수로 조절 (베이스라인 측정 시 100) — 기본 게이트는 20.
  it('5인 게임 완주 + 베이스라인 측정', () => {
    const seeds = Number(process.env.AOS_SEEDS) || 20;
    const m = measure(seeds);
    logSpy.mockRestore();
    console.log(`\n===== Southern England 5인 VP 통계 (${m.seeds} 시드) =====`);
    console.log(`평균 accurateVP: ${m.avgVP.toFixed(2)} (min ${m.minVP}, max ${m.maxVP})`);
    console.log(`평균 발행주식: ${m.avgShares.toFixed(2)}, 평균 income: ${m.avgIncome.toFixed(2)}`);
    console.log(`건설/배달/도시화: 건설 ${m.avgBuilds.toFixed(1)}, 배달 ${m.avgDeliveries.toFixed(1)}, 도시화 ${m.avgUrban.toFixed(1)}`);
    console.log(`파산: ${m.avgBankruptPerGame.toFixed(2)}명/게임, 완주 턴 분포: ${JSON.stringify(m.finishedTurns)}`);
    console.log(`최종 승자 분포: ${JSON.stringify(m.winnerCounts)}`);
    console.log(`player별 평균 VP: ${JSON.stringify(Object.fromEntries(Object.entries(m.perPlayerVP).map(([k, v]) => [k, +v.toFixed(1)])))}`);
    // ── 경매/순서 진단 (상시) ──
    console.log(`경매 입찰 발생: ${m.avgBidsPerGame.toFixed(1)}회/게임 (0에 가까우면 경매가 양보로만 결정 = 순서 안 섞임)`);
    console.log(`1번 획득 — 입찰로(byBid): ${JSON.stringify(m.firstSeatBidTotal)}`);
    console.log(`1번 획득 — 양보로(byYield): ${JSON.stringify(m.firstSeatYieldTotal)}`);
    console.log(`London 파랑 불변식 위반: ${m.totalViolations}건 (0이어야 함)`);

    // 핵심: 모든 게임이 정상 종료 (멈춤/무한루프 없음)
    expect(m.allReachedEnd).toBe(true);
    // 모든 게임이 최소 2턴 이상 진행 + 5인 7턴 도달 게임 존재
    expect(m.finishedTurns.every(t => t >= 2)).toBe(true);
    expect(m.finishedTurns.some(t => t >= 7)).toBe(true);
    // London 파랑 불변식 (v2 시트 대체 규칙)
    expect(m.totalViolations).toBe(0);
  }, 900_000);
});
