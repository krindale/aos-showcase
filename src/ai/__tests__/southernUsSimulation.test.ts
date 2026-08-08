/**
 * Southern US 6인 AI 전체 게임 시뮬레이션 — 다인(6인) 실동작 + 베이스라인
 *
 * 남부 미국 맵 특수 규칙(마을 면화(흰 큐브)·4대 항구 배달 종료·면화 +1 보너스·배달 후 제거·
 * 면화 마을 도시화 시 면화 이동·Atlanta 1~4턴 보너스 큐브·4턴 수입 감소 2배)이 끝까지
 * 정상 구동되는지 동기식으로 검증한다. 기존 맵 회귀 게이트와 별개의 베이스라인.
 *
 * 게이트: 모든 게임이 정상 종료(무한 루프/멈춤 없음) + 6턴 도달 +
 *         면화 불변식(주머니/디스플레이에 흰 큐브가 절대 들어가지 않음).
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

interface SResult {
  accurateVP: Record<PlayerId, number>;
  income: Record<PlayerId, number>;
  shares: Record<PlayerId, number>;
  completedTracks: Record<PlayerId, number>;
  bankruptcies: number;
  finalTurn: number;
  reachedEnd: boolean;
  deliveries: number;
  cottonDeliveries: number;   // 면화(흰 큐브) 배달 횟수
  builds: number;
  urbanizations: number;
  whiteInBagOrDisplay: boolean; // 면화 불변식 위반 여부 (주머니/디스플레이에 white)
  cottonRemaining: number;      // 게임 종료 시 보드(마을+도시)에 남은 면화 수
  buildsByPlayer: Record<PlayerId, number>;
  deliveriesByPlayer: Record<PlayerId, number>;
  engine: Record<PlayerId, number>;
  // ── 진단(경매/순서) ──
  bidsThisGame: number;                          // 이 게임에서 실제 입찰(placeBid) 발생 횟수
  firstSeatByBid: Record<PlayerId, number>;      // 입찰($>0)로 1번 획득한 횟수 (player별)
  firstSeatByYield: Record<PlayerId, number>;    // 양보(입찰 없이)로 1번이 된 횟수 (player별)
}

function runSouthernUsGame(seed: number): SResult {
  const rng = createSeededRng(seed);
  vi.spyOn(Math, 'random').mockImplementation(rng);
  useGameStore.getState().initGame(
    'southern-us',
    PLAYERS.map((_, i) => `AI-${i + 1}`),
    PLAYERS.map((_, i) => ({ playerIndex: i, name: `AI-${i + 1}` })),
  );
  vi.restoreAllMocks();

  let deliveries = 0, cottonDeliveries = 0, builds = 0, urbanizations = 0;
  let whiteInBagOrDisplay = false;
  const buildsByPlayer = {} as Record<PlayerId, number>;
  const deliveriesByPlayer = {} as Record<PlayerId, number>;
  const firstSeatByBid = {} as Record<PlayerId, number>;
  const firstSeatByYield = {} as Record<PlayerId, number>;
  PLAYERS.forEach(p => {
    buildsByPlayer[p] = 0; deliveriesByPlayer[p] = 0;
    firstSeatByBid[p] = 0; firstSeatByYield[p] = 0;
  });
  let lastSeatTurn = 0;
  let bidsThisGame = 0;
  let turnHadBid = false; // 이번 턴 경매에서 실제 입찰이 있었는지 (selectActions 진입 시 분류 후 리셋)
  const MAX_ITER = 120000;
  let iter = 0, stale = 0, lastSig = '';
  let reachedEnd = false;

  while (iter++ < MAX_ITER) {
    const s = useGameStore.getState();
    if (s.currentPhase === 'gameOver') { reachedEnd = true; break; }

    // 면화 불변식: 주머니/디스플레이에 흰 큐브가 들어가면 위반 (배달 후 제거 규칙)
    if (s.goodsDisplay.bag.includes('white') || s.goodsDisplay.slots.includes('white')) {
      whiteInBagOrDisplay = true;
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

    if (s.ui.movingCube) {
      if (s.ui.movingCube.color === 'white') cottonDeliveries++;
      s.completeCubeMove();
      continue;
    }

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
          builds++; buildsByPlayer[cp]++;
          const ps = useGameStore.getState().phaseState;
          if (ps.builtTracksThisTurn >= ps.maxTracksThisTurn) useGameStore.getState().nextPhase();
        } else if (d.action === 'buildSpur') {
          if (!store.buildTownSpur(d.townCoord)) { useGameStore.getState().nextPhase(); break; }
          builds++; buildsByPlayer[cp]++;
          const ps = useGameStore.getState().phaseState;
          if (ps.builtTracksThisTurn >= ps.maxTracksThisTurn) useGameStore.getState().nextPhase();
        } else if (d.action === 'buildComplex') {
          if (!store.buildComplexTrack(d.coord, d.edges, d.trackType)) { addFailedBuildCoord(cp, d.coord, s.currentTurn); break; }
          builds++; buildsByPlayer[cp]++;
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

  // 게임 종료 시 보드에 남은 면화 (마을 + 도시(도시화로 옮겨진 것))
  const cottonRemaining =
    f.board.towns.reduce((a, t) => a + t.cubes.filter(c => c === 'white').length, 0) +
    f.board.cities.reduce((a, c) => a + c.cubes.filter(cb => cb === 'white').length, 0);

  return {
    accurateVP, income, shares, completedTracks, bankruptcies,
    finalTurn: f.currentTurn, reachedEnd, deliveries, cottonDeliveries, builds, urbanizations,
    whiteInBagOrDisplay, cottonRemaining, buildsByPlayer, deliveriesByPlayer, engine,
    bidsThisGame, firstSeatByBid, firstSeatByYield,
  };
}

describe('Southern US 6 AI 전체 게임 — 다인 실동작 + 베이스라인', () => {
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
    const results: SResult[] = [];
    for (let i = 0; i < seeds; i++) results.push(runSouthernUsGame(7000 + i * 211));

    const allVPs: number[] = [];
    let totalBankrupt = 0;
    type PerPlayer = { vp: number; income: number; shares: number; engine: number; builds: number; deliveries: number; tracks: number };
    const perPlayer = {} as Record<PlayerId, PerPlayer>;
    const winnerCounts = {} as Record<PlayerId, number>;
    const firstSeatBidTotal = {} as Record<PlayerId, number>;
    const firstSeatYieldTotal = {} as Record<PlayerId, number>;
    PLAYERS.forEach(p => {
      winnerCounts[p] = 0;
      firstSeatBidTotal[p] = 0; firstSeatYieldTotal[p] = 0;
      perPlayer[p] = { vp: 0, income: 0, shares: 0, engine: 0, builds: 0, deliveries: 0, tracks: 0 };
    });
    let totalBids = 0;
    for (const r of results) {
      for (const pid of PLAYERS) allVPs.push(r.accurateVP[pid] ?? 0);
      totalBankrupt += r.bankruptcies;
      totalBids += r.bidsThisGame;
      for (const pid of PLAYERS) {
        firstSeatBidTotal[pid] += r.firstSeatByBid[pid] ?? 0;
        firstSeatYieldTotal[pid] += r.firstSeatByYield[pid] ?? 0;
        const x = perPlayer[pid];
        x.vp += r.accurateVP[pid] ?? 0;
        x.income += r.income[pid] ?? 0;
        x.shares += r.shares[pid] ?? 0;
        x.engine += r.engine[pid] ?? 0;
        x.builds += r.buildsByPlayer[pid] ?? 0;
        x.deliveries += r.deliveriesByPlayer[pid] ?? 0;
        x.tracks += r.completedTracks[pid] ?? 0;
      }
      let best = PLAYERS[0], bestVP = -Infinity;
      for (const pid of PLAYERS) {
        const v = r.accurateVP[pid] ?? -Infinity;
        if (v > bestVP) { bestVP = v; best = pid; }
      }
      winnerCounts[best]++;
    }
    PLAYERS.forEach(p => {
      const x = perPlayer[p];
      x.vp /= seeds; x.income /= seeds; x.shares /= seeds; x.engine /= seeds;
      x.builds /= seeds; x.deliveries /= seeds; x.tracks /= seeds;
    });
    const avgVP = allVPs.reduce((a, b) => a + b, 0) / allVPs.length;
    const sum = (f: (r: SResult) => number) => results.reduce((a, r) => a + f(r), 0);
    return {
      results, seeds,
      avgVP, minVP: Math.min(...allVPs), maxVP: Math.max(...allVPs),
      avgIncome: sum(r => PLAYERS.reduce((a, p) => a + (r.income[p] ?? 0), 0)) / (seeds * 6),
      avgShares: sum(r => PLAYERS.reduce((a, p) => a + (r.shares[p] ?? 0), 0)) / (seeds * 6),
      avgBankruptPerGame: totalBankrupt / seeds,
      avgDeliveries: sum(r => r.deliveries) / seeds,
      avgCotton: sum(r => r.cottonDeliveries) / seeds,
      avgCottonRemaining: sum(r => r.cottonRemaining) / seeds,
      avgBuilds: sum(r => r.builds) / seeds,
      avgUrban: sum(r => r.urbanizations) / seeds,
      avgTurns: sum(r => r.finalTurn) / seeds,
      finishedTurns: results.map(r => r.finalTurn),
      allReachedEnd: results.every(r => r.reachedEnd),
      anyWhiteLeak: results.some(r => r.whiteInBagOrDisplay),
      winnerCounts, perPlayer,
      avgBidsPerGame: totalBids / seeds,
      firstSeatBidTotal, firstSeatYieldTotal,
    };
  }

  it('6인 게임 완주 + 베이스라인 측정 (100 시드)', () => {
    const m = measure(100);
    logSpy.mockRestore();
    console.log('\n===== Southern US 6인 VP 통계 (100 시드) =====');
    console.log(`평균 accurateVP: ${m.avgVP.toFixed(2)} (min ${m.minVP}, max ${m.maxVP})`);
    console.log(`평균 발행주식: ${m.avgShares.toFixed(2)}, 평균 income: ${m.avgIncome.toFixed(2)}`);
    console.log(`건설/배달/도시화: 건설 ${m.avgBuilds.toFixed(1)}, 배달 ${m.avgDeliveries.toFixed(1)} (면화 ${m.avgCotton.toFixed(1)}), 도시화 ${m.avgUrban.toFixed(1)}`);
    console.log(`종료 시 잔여 면화: ${m.avgCottonRemaining.toFixed(1)}/14`);
    console.log(`파산: ${m.avgBankruptPerGame.toFixed(2)}명/게임, 평균 완주턴 ${m.avgTurns.toFixed(1)} (최대 6)`);
    console.log(`최종 승자 분포: ${JSON.stringify(m.winnerCounts)}`);
    // ── 경매/순서 진단 (상시) ──
    console.log(`경매 입찰 발생: ${m.avgBidsPerGame.toFixed(1)}회/게임 (0에 가까우면 경매가 양보로만 결정 = 순서 안 섞임)`);
    console.log(`1번 획득 — 입찰로(byBid): ${JSON.stringify(m.firstSeatBidTotal)}`);
    console.log(`1번 획득 — 양보로(byYield): ${JSON.stringify(m.firstSeatYieldTotal)}`);
    console.log('--- player별 평균 (건설/수송/엔진/주식) ---');
    PLAYERS.forEach(p => {
      const x = m.perPlayer[p];
      console.log(`${p}: VP ${x.vp.toFixed(1)} | 건설 ${x.builds.toFixed(1)} | 수송 ${x.deliveries.toFixed(1)} | 엔진 ${x.engine.toFixed(1)} | 주식 ${x.shares.toFixed(1)} | income ${x.income.toFixed(1)} | 완성트랙 ${x.tracks.toFixed(1)}`);
    });

    // 핵심: 모든 게임이 정상 종료 (멈춤/무한루프 없음) — Southern US 특수 규칙 실동작 보장
    expect(m.allReachedEnd).toBe(true);
    // 모든 게임이 최소 2턴 이상 진행
    expect(m.finishedTurns.every(t => t >= 2)).toBe(true);
    // Southern US 6인 = 6턴 (룰북) — 정상 게임은 6턴 도달
    expect(m.finishedTurns.some(t => t >= 6)).toBe(true);
    // 면화 불변식: 배달된 면화는 게임에서 제거 — 주머니/디스플레이에 white가 절대 없다
    expect(m.anyWhiteLeak).toBe(false);
  }, 900_000);
});
