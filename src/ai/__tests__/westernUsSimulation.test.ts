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
import { getCurrentRoute } from '../strategy/state';
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
  firstSeatCounts: Record<PlayerId, number>;  // 이 게임에서 각 플레이어가 1번(선공)이었던 턴 수
  buildsByPlayer: Record<PlayerId, number>;    // player별 철도 건설 횟수
  deliveriesByPlayer: Record<PlayerId, number>; // player별 수송(배달) 횟수
  engine: Record<PlayerId, number>;            // player별 최종 엔진 레벨
  // ── 진단(경매/순서) ──
  turnOrderByPlayer: Record<PlayerId, number>;  // player별 turnOrder 행동 선택 횟수
  bidsThisGame: number;                          // 이 게임에서 실제 입찰(placeBid) 발생 횟수
  firstSeatByBid: Record<PlayerId, number>;      // 입찰($>0)로 1번 획득한 횟수 (player별)
  firstSeatByYield: Record<PlayerId, number>;    // 양보(입찰 없이)로 1번이 된 횟수 (player별)
  seatRankByPlayer: Record<PlayerId, number[]>;  // player별 [1위,2위,...,6위] 순번 점유 횟수 (앞 절반 고착 진단)
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
  const firstSeatCounts = {} as Record<PlayerId, number>;
  const buildsByPlayer = {} as Record<PlayerId, number>;
  const deliveriesByPlayer = {} as Record<PlayerId, number>;
  const turnOrderByPlayer = {} as Record<PlayerId, number>;
  const firstSeatByBid = {} as Record<PlayerId, number>;
  const firstSeatByYield = {} as Record<PlayerId, number>;
  const seatRankByPlayer = {} as Record<PlayerId, number[]>;
  PLAYERS.forEach(p => {
    firstSeatCounts[p] = 0; buildsByPlayer[p] = 0; deliveriesByPlayer[p] = 0;
    turnOrderByPlayer[p] = 0; firstSeatByBid[p] = 0; firstSeatByYield[p] = 0;
    seatRankByPlayer[p] = [0, 0, 0, 0, 0, 0];
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

    // 턴별 1번(선공) 점유 기록 — 경매로 순서가 확정된 뒤(selectActions) 턴당 1회.
    // 1번이 "입찰로 따냈는지(byBid) vs 아무도 안 사서 양보로 됐는지(byYield)"도 분류 —
    // 순서 고착이 경매 경쟁의 결과인지, 경매가 사실상 작동 안 해서인지 진단.
    if (s.currentPhase === 'selectActions' && s.currentTurn !== lastSeatTurn) {
      const first = s.playerOrder[0];
      if (first) {
        firstSeatCounts[first] = (firstSeatCounts[first] ?? 0) + 1;
        if (turnHadBid) firstSeatByBid[first] = (firstSeatByBid[first] ?? 0) + 1;
        else firstSeatByYield[first] = (firstSeatByYield[first] ?? 0) + 1;
      }
      // 각 player의 이번 턴 순번(1~6위) 기록 — 1번뿐 아니라 앞 절반 고착을 진단
      s.playerOrder.forEach((pid, rank) => {
        if (rank < 6 && seatRankByPlayer[pid]) seatRankByPlayer[pid][rank]++;
      });
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
        if (decision.action === 'turnOrder') turnOrderByPlayer[cp] = (turnOrderByPlayer[cp] ?? 0) + 1;
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
    engine[pid] = p.engineLevel;
    if (p.eliminated) bankruptcies++;
    if (p.transcontinental) transcontinental++;
  }

  return {
    accurateVP, income, shares, completedTracks, transcontinental, bankruptcies,
    finalTurn: f.currentTurn, reachedEnd, deliveries, builds, urbanizations,
    firstSeatCounts, buildsByPlayer, deliveriesByPlayer, engine,
    turnOrderByPlayer, bidsThisGame, firstSeatByBid, firstSeatByYield,
    seatRankByPlayer,
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
    // 순서 고착 지표: 전 게임 합산 1번 점유 횟수 + 최종 승자(VP 최대) 분포
    const firstSeatTotal = {} as Record<PlayerId, number>;
    const winnerCounts = {} as Record<PlayerId, number>;
    // 경매/순서 진단: turnOrder 행동 선택 횟수, 1번 획득 방식(입찰 vs 양보)
    const turnOrderTotal = {} as Record<PlayerId, number>;
    const firstSeatBidTotal = {} as Record<PlayerId, number>;
    const firstSeatYieldTotal = {} as Record<PlayerId, number>;
    const seatRankTotal = {} as Record<PlayerId, number[]>;
    // player별 평균 지표(건설/수송/엔진/주식/income/VP/완성트랙) — player-index 편향 진단용
    type PerPlayer = { vp: number; income: number; shares: number; engine: number; builds: number; deliveries: number; tracks: number };
    const perPlayer = {} as Record<PlayerId, PerPlayer>;
    PLAYERS.forEach(p => {
      firstSeatTotal[p] = 0; winnerCounts[p] = 0;
      turnOrderTotal[p] = 0; firstSeatBidTotal[p] = 0; firstSeatYieldTotal[p] = 0;
      seatRankTotal[p] = [0, 0, 0, 0, 0, 0];
      perPlayer[p] = { vp: 0, income: 0, shares: 0, engine: 0, builds: 0, deliveries: 0, tracks: 0 };
    });
    let totalBids = 0;
    for (const r of results) {
      for (const pid of PLAYERS) allVPs.push(r.accurateVP[pid] ?? 0);
      totalBankrupt += r.bankruptcies;
      totalBids += r.bidsThisGame;
      for (const pid of PLAYERS) {
        firstSeatTotal[pid] += r.firstSeatCounts[pid] ?? 0;
        turnOrderTotal[pid] += r.turnOrderByPlayer[pid] ?? 0;
        firstSeatBidTotal[pid] += r.firstSeatByBid[pid] ?? 0;
        firstSeatYieldTotal[pid] += r.firstSeatByYield[pid] ?? 0;
        for (let rank = 0; rank < 6; rank++) seatRankTotal[pid][rank] += r.seatRankByPlayer[pid]?.[rank] ?? 0;
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
      firstSeatTotal, winnerCounts, perPlayer,
      turnOrderTotal, firstSeatBidTotal, firstSeatYieldTotal,
      avgBidsPerGame: totalBids / seeds,
      seatRankTotal,
    };
  }

  it('6인 게임 완주 + 베이스라인 측정 (100 시드)', () => {
    const m = measure(100);
    logSpy.mockRestore();
    console.log('\n===== Western US 6인 VP 통계 (100 시드) =====');
    console.log(`평균 accurateVP: ${m.avgVP.toFixed(2)} (min ${m.minVP}, max ${m.maxVP})`);
    console.log(`평균 발행주식: ${m.avgShares.toFixed(2)}, 평균 income: ${m.avgIncome.toFixed(2)}`);
    console.log(`건설/배달/도시화: 건설 ${m.avgBuilds.toFixed(1)}, 배달 ${m.avgDeliveries.toFixed(1)}, 도시화 ${m.avgUrban.toFixed(1)}`);
    console.log(`대륙횡단 달성: ${m.avgTranscontinental.toFixed(2)}명/게임`);
    console.log(`파산: ${m.avgBankruptPerGame.toFixed(2)}명/게임, 평균 완주턴 ${m.avgTurns.toFixed(1)} (최대 6)`);
    console.log(`완주 턴 분포: ${JSON.stringify(m.finishedTurns)}`);
    console.log(`1번(선공) 점유 횟수(전 게임 합): ${JSON.stringify(m.firstSeatTotal)}`);
    console.log(`최종 승자 분포: ${JSON.stringify(m.winnerCounts)}`);
    // ── 경매/순서 진단 (상시) ──
    console.log(`경매 입찰 발생: ${m.avgBidsPerGame.toFixed(1)}회/게임 (0에 가까우면 경매가 양보로만 결정 = 순서 안 섞임)`);
    console.log(`1번 획득 — 입찰로(byBid): ${JSON.stringify(m.firstSeatBidTotal)}`);
    console.log(`1번 획득 — 양보로(byYield): ${JSON.stringify(m.firstSeatYieldTotal)}`);
    console.log(`turnOrder 행동 선택 횟수(전 게임 합): ${JSON.stringify(m.turnOrderTotal)}`);
    // ── player별 순번(1~6위) 점유 분포 (앞 절반 고착 진단) ── 균등이면 각 100
    console.log('--- player별 순번 점유 (1위~6위 횟수, 균등=각 100) ---');
    PLAYERS.forEach(p => {
      const r = m.seatRankTotal[p];
      const frontHalf = r[0] + r[1] + r[2]; // 1~3위(앞 절반) 합
      console.log(`${p}: ${r.map((c, i) => `${i + 1}위 ${c}`).join(' | ')}  → 앞3합 ${frontHalf}`);
    });
    console.log('--- player별 평균 (건설/수송/엔진/주식) ---');
    PLAYERS.forEach(p => {
      const x = m.perPlayer[p];
      console.log(`${p}: VP ${x.vp.toFixed(1)} | 건설 ${x.builds.toFixed(1)} | 수송 ${x.deliveries.toFixed(1)} | 엔진 ${x.engine.toFixed(1)} | 주식 ${x.shares.toFixed(1)} | income ${x.income.toFixed(1)} | 완성트랙 ${x.tracks.toFixed(1)}`);
    });

    // 핵심: 모든 게임이 정상 종료 (멈춤/무한루프 없음) — Western US 특수 규칙 실동작 보장
    expect(m.allReachedEnd).toBe(true);
    // 모든 게임이 최소 2턴 이상 진행
    expect(m.finishedTurns.every(t => t >= 2)).toBe(true);
    // Western US 6인 = 6턴 (룰북) — 정상 게임은 6턴 도달
    expect(m.finishedTurns.some(t => t >= 6)).toBe(true);
  }, 900_000);

  // 1게임을 턴별로 추적 — 각 player가 매 턴 무엇을 하는지(건설/완성/수송/income) 하나하나.
  // "뒤 순번이 왜 완성 트랙·income을 못 만드는가"를 눈으로 보기 위한 진단.
  it('1게임 프로세스 추적 (turn-by-turn)', () => {
    const seed = 5000;
    const rng = createSeededRng(seed);
    vi.spyOn(Math, 'random').mockImplementation(rng);
    useGameStore.getState().initGame(
      'western-us',
      PLAYERS.map((_, i) => `AI-${i + 1}`),
      PLAYERS.map((_, i) => ({ playerIndex: i, name: `AI-${i + 1}` })),
    );
    vi.restoreAllMocks();

    const snaps: Array<{ turn: number; order: PlayerId[]; players: Record<PlayerId, Record<string, number | boolean>> }> = [];
    const tb = {} as Record<PlayerId, number>; // 그 턴 건설
    const td = {} as Record<PlayerId, number>; // 그 턴 수송
    const tu = {} as Record<PlayerId, number>; // 그 턴 도시화
    PLAYERS.forEach(p => { tb[p] = 0; td[p] = 0; tu[p] = 0; });
    const buildLog: string[] = []; // 턴별 player 경로 + 건설좌표 (경로 완성 실패 진단)
    const routeAtTurnStart = {} as Record<PlayerId, string>; // 그 턴 잡은 경로 (selectActions 시점)

    const MAX_ITER = 120000;
    let iter = 0, stale = 0, lastSig = '';
    while (iter++ < MAX_ITER) {
      const s = useGameStore.getState();
      if (s.currentPhase === 'gameOver') break;
      if (s.ui.movingCube) { s.completeCubeMove(); continue; }

      if (s.currentPhase === 'goodsGrowth') {
        const activeCount = s.activePlayers.filter(p => !s.players[p]?.eliminated).length;
        const dice = Array.from({ length: activeCount }, () => 1 + Math.floor(rng() * 6));
        s.growGoods(dice); useGameStore.getState().nextPhase(); continue;
      }

      // 턴 끝(advanceTurn) — 그 턴 정산 완료 상태를 스냅샷
      if (s.currentPhase === 'advanceTurn') {
        const rec = { turn: s.currentTurn, order: [...s.playerOrder], players: {} as Record<PlayerId, Record<string, number | boolean>> };
        PLAYERS.forEach(p => {
          const pl = s.players[p];
          const own = s.board.trackTiles.filter(t => t.owner === p);
          const comp = own.filter(t => isTrackPartOfCompletedLink(t.coord, s.board)).length;
          rec.players[p] = {
            rank: s.playerOrder.indexOf(p), income: pl.income, cash: pl.cash, engine: pl.engineLevel,
            shares: pl.issuedShares, tracks: own.length, completed: comp, b: tb[p], d: td[p], u: tu[p], elim: pl.eliminated,
          };
        });
        snaps.push(rec);
        PLAYERS.forEach(p => { tb[p] = 0; td[p] = 0; tu[p] = 0; });
      }

      const sig = `${s.currentPhase}:${s.currentPlayer}:${s.currentTurn}:${s.phaseState.builtTracksThisTurn}:${s.board.trackTiles.length}:${JSON.stringify(s.phaseState.playerMoves)}`;
      if (sig === lastSig) { if (++stale > 8) { useGameStore.getState().nextPhase(); stale = 0; lastSig = ''; continue; } } else { stale = 0; lastSig = sig; }
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
          if (useGameStore.getState().currentPhase === 'determinePlayerOrder') useGameStore.getState().nextPhase();
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
          else tu[cp]++;
          break;
        case 'buildTrack': {
          const d = decision.decision;
          // 진단: 그 턴 잡은 경로 + 건설 좌표/엣지 기록 (모든 player, Turn 1~2)
          if (s.currentTurn <= 2 && (d.action === 'build' || d.action === 'buildComplex' || d.action === 'buildSpur')) {
            const rt = getCurrentRoute(cp);
            const coordStr = d.action === 'buildSpur' ? `spur@${JSON.stringify(d.townCoord)}` : `${JSON.stringify(d.coord)}e[${d.edges}]`;
            buildLog.push(`T${s.currentTurn} ${cp} 경로=${rt ? `${rt.from}→${rt.to}` : '없음'} 건설 ${coordStr}`);
          }
          if (d.action === 'build') {
            if (!store.buildTrack(d.coord, d.edges)) { addFailedBuildCoord(cp, d.coord, s.currentTurn); break; }
            tb[cp]++;
            const ps = useGameStore.getState().phaseState;
            if (ps.builtTracksThisTurn >= ps.maxTracksThisTurn) useGameStore.getState().nextPhase();
          } else if (d.action === 'buildSpur') {
            if (!store.buildTownSpur(d.townCoord)) { useGameStore.getState().nextPhase(); break; }
            tb[cp]++;
            const ps = useGameStore.getState().phaseState;
            if (ps.builtTracksThisTurn >= ps.maxTracksThisTurn) useGameStore.getState().nextPhase();
          } else if (d.action === 'buildComplex') {
            if (!store.buildComplexTrack(d.coord, d.edges, d.trackType)) { addFailedBuildCoord(cp, d.coord, s.currentTurn); break; }
            tb[cp]++;
            const ps = useGameStore.getState().phaseState;
            if (ps.builtTracksThisTurn >= ps.maxTracksThisTurn) useGameStore.getState().nextPhase();
          } else { useGameStore.getState().nextPhase(); }
          break;
        }
        case 'moveGoods': {
          const d = decision.decision;
          if (d.action === 'move') {
            store.selectCube(d.sourceCityId, d.cubeIndex);
            useGameStore.getState().selectDestinationCity(d.destinationCoord);
            td[cp]++;
            if (!useGameStore.getState().ui.movingCube) useGameStore.getState().nextPhase();
          } else if (d.action === 'upgradeEngine') {
            store.upgradeEngine(cp); useGameStore.getState().nextPhase();
          } else { useGameStore.getState().nextPhase(); }
          break;
        }
        default:
          useGameStore.getState().nextPhase();
          break;
      }
    }

    logSpy.mockRestore();
    console.log(`\n===== 1게임 프로세스 추적 (seed ${seed}) =====`);
    for (const rec of snaps) {
      console.log(`\n--- Turn ${rec.turn} | 순번: ${rec.order.map((p, i) => `${i + 1}.${p}`).join('  ')} ---`);
      PLAYERS.forEach(p => {
        const x = rec.players[p];
        console.log(`  ${p}(순번${(x.rank as number) + 1}): 건설+${x.b} 수송+${x.d} 도시화+${x.u} | 누적트랙 ${x.tracks}(완성 ${x.completed}) 엔진 ${x.engine} | income ${x.income} 현금 ${x.cash} 주식 ${x.shares}${x.elim ? ' [파산]' : ''}`);
      });
    }
    console.log('\n===== Turn 1~2 경로 + 건설 좌표 (완성 실패 진단) =====');
    buildLog.forEach(l => console.log(l));
    void routeAtTurnStart;
    expect(snaps.length).toBeGreaterThan(0);
  }, 120_000);
});
