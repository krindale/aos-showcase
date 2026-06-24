/**
 * Rust Belt 5인 AI 전체 게임 시뮬레이션 — 다인(5인) 실동작 + 파산/VP 베이스라인
 *
 * Rust Belt는 이 프로젝트 최초의 3인+ 맵이다. 게임 엔진은 N인을 지원하도록 작성돼 있으나
 * 실제 5인 게임(다인 경매 지불, 물품 성장 주사위 5개, AI 1/(N-1) 정규화)이 끝까지 구동되는지
 * 동기식으로 검증한다. tutorial/St.Lucia 회귀 게이트와 별개의 베이스라인.
 *
 * 측정: 시드별 최종 accurateVP(완성 링크 트랙만 +1), 파산 건수, 완주 턴, 건설/배달/도시화.
 * 게이트: 모든 게임이 정상 종료(무한 루프/멈춤 없음) + 최소 진행. (정밀 VP 튜닝은 후속)
 *
 * 동기식 러너 — 실시간 executeAITurn(1s/결정) 대신 getAIDecision을 직접 구동(ms 단위).
 * St.Lucia와 달리 goodsGrowth 단계를 실제 주사위(활성 플레이어 수)로 처리한다.
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

// goodsGrowth는 주사위로 직접 처리하므로 AUTO에서 제외 (나머지 정산 페이즈는 nextPhase)
const AUTO_PHASES = new Set([
  'collectIncome', 'payExpenses', 'incomeReduction', 'advanceTurn',
]);

interface RBResult {
  accurateVP: Record<PlayerId, number>;
  income: Record<PlayerId, number>;
  shares: Record<PlayerId, number>;
  completedTracks: Record<PlayerId, number>;
  bankruptcies: number;
  finalTurn: number;
  reachedEnd: boolean;   // gameOver 도달(무한루프/멈춤 아님)
  deliveries: number;
  builds: number;
  urbanizations: number;
  firstSeatCounts: Record<PlayerId, number>;  // 이 게임에서 각 플레이어가 1번(선공)이었던 턴 수
  buildsByPlayer: Record<PlayerId, number>;    // player별 철도 건설 횟수
  deliveriesByPlayer: Record<PlayerId, number>; // player별 수송(배달) 횟수
  engine: Record<PlayerId, number>;            // player별 최종 엔진 레벨
}

/** Rust Belt 한 게임(5 AI)을 동기식으로 끝까지 구동하고 결과 측정 */
function runRustBeltGame(seed: number): RBResult {
  const rng = createSeededRng(seed);
  // initGame 셋업(셔플/도시 큐브)만 시드 — 이후 AI 결정은 real random (St.Lucia 러너와 동일 철학).
  // goodsGrowth 주사위는 아래에서 seeded rng()를 직접 호출하므로 mock과 무관하게 재현된다.
  vi.spyOn(Math, 'random').mockImplementation(rng);
  useGameStore.getState().initGame(
    'rust-belt',
    PLAYERS.map((_, i) => `AI-${i + 1}`),
    PLAYERS.map((_, i) => ({ playerIndex: i, name: `AI-${i + 1}` })),
  );
  vi.restoreAllMocks();

  let deliveries = 0, builds = 0, urbanizations = 0;
  const firstSeatCounts = {} as Record<PlayerId, number>;
  const buildsByPlayer = {} as Record<PlayerId, number>;
  const deliveriesByPlayer = {} as Record<PlayerId, number>;
  PLAYERS.forEach(p => { firstSeatCounts[p] = 0; buildsByPlayer[p] = 0; deliveriesByPlayer[p] = 0; });
  let lastSeatTurn = 0;
  const MAX_ITER = 80000;
  let iter = 0, stale = 0, lastSig = '';
  let reachedEnd = false;

  while (iter++ < MAX_ITER) {
    const s = useGameStore.getState();
    if (s.currentPhase === 'gameOver') { reachedEnd = true; break; }

    // 턴별 1번(선공) 점유 기록 — 경매로 순서가 확정된 뒤(selectActions) 턴당 1회
    if (s.currentPhase === 'selectActions' && s.currentTurn !== lastSeatTurn) {
      const first = s.playerOrder[0];
      if (first) firstSeatCounts[first] = (firstSeatCounts[first] ?? 0) + 1;
      lastSeatTurn = s.currentTurn;
    }

    // 진행 중 큐브 애니메이션 완료(배달 수입 정산 + nextPhase)
    if (s.ui.movingCube) { s.completeCubeMove(); continue; }

    // 물품 성장: 탈락하지 않은 활성 플레이어 수만큼 주사위 (seeded rng로 재현)
    if (s.currentPhase === 'goodsGrowth') {
      const activeCount = s.activePlayers.filter(p => !s.players[p]?.eliminated).length;
      const dice = Array.from({ length: activeCount }, () => 1 + Math.floor(rng() * 6));
      s.growGoods(dice);
      useGameStore.getState().nextPhase();
      continue;
    }

    // 무한 루프 방지: 상태 서명이 안 바뀌면 강제 진행
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
        // Rust Belt는 일반 경매라 나오지 않지만 방어적으로 처리
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
          useGameStore.getState().nextPhase(); // redirect/skip → 단계 종료
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
          useGameStore.getState().nextPhase(); // skip
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

  return {
    accurateVP, income, shares, completedTracks, bankruptcies,
    finalTurn: f.currentTurn, reachedEnd, deliveries, builds, urbanizations,
    firstSeatCounts, buildsByPlayer, deliveriesByPlayer, engine,
  };
}

describe('Rust Belt 5 AI 전체 게임 — 다인 실동작 + 베이스라인', () => {
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

  function measure(seeds = 8) {
    const results: RBResult[] = [];
    for (let i = 0; i < seeds; i++) results.push(runRustBeltGame(2000 + i * 137));

    const allVPs: number[] = [];
    let totalBankrupt = 0;
    // 순서 고착 지표: 전 게임 합산 1번 점유 횟수 + 최종 승자(VP 최대) 분포
    const firstSeatTotal = {} as Record<PlayerId, number>;
    const winnerCounts = {} as Record<PlayerId, number>;
    // player별 평균 지표(건설/수송/엔진/주식/income/VP/완성트랙) — player-index 편향 진단용
    type PerPlayer = { vp: number; income: number; shares: number; engine: number; builds: number; deliveries: number; tracks: number };
    const perPlayer = {} as Record<PlayerId, PerPlayer>;
    PLAYERS.forEach(p => {
      firstSeatTotal[p] = 0; winnerCounts[p] = 0;
      perPlayer[p] = { vp: 0, income: 0, shares: 0, engine: 0, builds: 0, deliveries: 0, tracks: 0 };
    });
    for (const r of results) {
      for (const pid of PLAYERS) allVPs.push(r.accurateVP[pid] ?? 0);
      totalBankrupt += r.bankruptcies;
      for (const pid of PLAYERS) {
        firstSeatTotal[pid] += r.firstSeatCounts[pid] ?? 0;
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
    const sum = (f: (r: RBResult) => number) => results.reduce((a, r) => a + f(r), 0);
    return {
      results, seeds,
      avgVP, minVP: Math.min(...allVPs), maxVP: Math.max(...allVPs),
      avgIncome: sum(r => PLAYERS.reduce((a, p) => a + (r.income[p] ?? 0), 0)) / (seeds * 5),
      avgShares: sum(r => PLAYERS.reduce((a, p) => a + (r.shares[p] ?? 0), 0)) / (seeds * 5),
      avgBankruptPerGame: totalBankrupt / seeds,
      avgDeliveries: sum(r => r.deliveries) / seeds,
      avgBuilds: sum(r => r.builds) / seeds,
      avgUrban: sum(r => r.urbanizations) / seeds,
      avgTurns: sum(r => r.finalTurn) / seeds,
      finishedTurns: results.map(r => r.finalTurn),
      allReachedEnd: results.every(r => r.reachedEnd),
      firstSeatTotal, winnerCounts, perPlayer,
    };
  }

  // 측정 + 핵심 게이트: 모든 5인 게임이 정상 종료(무한루프/멈춤 없음)하고 최소 진행한다.
  it('5인 게임 완주 + 베이스라인 측정 (100 시드)', () => {
    const m = measure(100);
    logSpy.mockRestore();
    console.log('\n===== Rust Belt 5인 VP 통계 (100 시드) =====');
    console.log(`평균 accurateVP: ${m.avgVP.toFixed(2)} (min ${m.minVP}, max ${m.maxVP})`);
    console.log(`평균 발행주식: ${m.avgShares.toFixed(2)}, 평균 income: ${m.avgIncome.toFixed(2)}`);
    console.log(`건설/배달/도시화: 건설 ${m.avgBuilds.toFixed(1)}, 배달 ${m.avgDeliveries.toFixed(1)}, 도시화 ${m.avgUrban.toFixed(1)}`);
    console.log(`파산: ${m.avgBankruptPerGame.toFixed(2)}명/게임, 평균 완주턴 ${m.avgTurns.toFixed(1)} (최대 7)`);
    console.log(`완주 턴 분포: ${JSON.stringify(m.finishedTurns)}`);
    // 순서 고착 진단: 5인이면 이상적으로 1번 점유·승자가 각 ~20% (고착이면 한 명이 독점)
    console.log(`1번(선공) 점유 횟수(전 게임 합): ${JSON.stringify(m.firstSeatTotal)}`);
    console.log(`최종 승자 분포: ${JSON.stringify(m.winnerCounts)}`);
    console.log('--- player별 평균 (건설/수송/엔진/주식) ---');
    PLAYERS.forEach(p => {
      const x = m.perPlayer[p];
      console.log(`${p}: VP ${x.vp.toFixed(1)} | 건설 ${x.builds.toFixed(1)} | 수송 ${x.deliveries.toFixed(1)} | 엔진 ${x.engine.toFixed(1)} | 주식 ${x.shares.toFixed(1)} | income ${x.income.toFixed(1)} | 완성트랙 ${x.tracks.toFixed(1)}`);
    });

    // 핵심: 모든 게임이 정상 종료 (멈춤/무한루프 없음) — 다인 엔진 실동작 보장
    expect(m.allReachedEnd).toBe(true);
    // 모든 게임이 최소 2턴 이상 진행
    expect(m.finishedTurns.every(t => t >= 2)).toBe(true);
    // 5인 게임은 7턴 — 정상 게임은 7턴 도달 (조기 종료=전원 파산은 비정상)
    expect(m.finishedTurns.some(t => t >= 7)).toBe(true);
  }, 900_000);
});
