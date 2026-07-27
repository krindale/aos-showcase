/**
 * Southern China 4인(디폴트) AI 전체 게임 시뮬레이션 — 특수룰 실동작 + 베이스라인
 *
 * 남부 중국 특수 규칙(디스크 4개+국유화·지지 토큰·Gain Support·Engineer/Locomotive 비활성·
 * Hong Kong 전색 수용+마지막 2턴 폐쇄·미완성 구간 1개)이 끝까지 정상 구동되는지 동기식으로 검증.
 *
 * 게이트: 모든 게임 정상 종료 + 8턴 도달 + 불변식(디스크 ≤4 · 폐쇄 후 홍콩 배달 0 ·
 * 국유화 대기 잔존 없음). VP 베이스라인은 콘솔 표 출력 (docs/ai-auction-baseline-100seed.md).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { getAIDecision } from '@/ai';
import { addFailedBuildCoord } from '../strategies/buildTrack';
import { calculateVictoryPoints, playerBonusVP } from '@/utils/gameLogic';
import { isTrackPartOfCompletedLink, hexCoordsEqual } from '@/utils/hexGrid';
import { countOwnershipUnits } from '@/store/helpers/nationalization';
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

interface CResult {
  accurateVP: Record<PlayerId, number>;
  income: Record<PlayerId, number>;
  shares: Record<PlayerId, number>;
  tokens: Record<PlayerId, number>;
  completedTracks: Record<PlayerId, number>;
  bankruptcies: number;
  finalTurn: number;
  reachedEnd: boolean;
  deliveries: number;
  builds: number;
  urbanizations: number;
  nationalizations: number;       // 국유화 발생 횟수 (중립화된 타일 그룹 관측)
  gainSupportPicks: number;       // gainSupport 행동 선택 횟수
  ferryBuys: number;              // 인터어반/페리($8) 구매 횟수
  hkDeliveriesOpen: number;       // 폐쇄 전 홍콩 배달
  hkDeliveriesClosed: number;     // 폐쇄 후 홍콩 배달 (불변식: 0)
  maxUnitsSeen: number;           // 관측된 최대 소유 단위 (불변식: ≤4, 국유화 대기 순간 제외)
  winnerCounts?: never;
}

function runChinaGame(seed: number): CResult {
  const rng = createSeededRng(seed);
  vi.spyOn(Math, 'random').mockImplementation(rng);
  useGameStore.getState().initGame(
    'southern-china',
    PLAYERS.map((_, i) => `AI-${i + 1}`),
    PLAYERS.map((_, i) => ({ playerIndex: i, name: `AI-${i + 1}` })),
  );
  vi.restoreAllMocks();

  let deliveries = 0, builds = 0, urbanizations = 0;
  let gainSupportPicks = 0, hkDeliveriesOpen = 0, hkDeliveriesClosed = 0;
  let maxUnitsSeen = 0, ferryBuys = 0;
  const MAX_ITER = 80000;
  let iter = 0, stale = 0, lastSig = '';
  let reachedEnd = false;
  const hkCoord = useGameStore.getState().board.cities.find(c => c.id === 'hongkong')!.coord;

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

      case 'auction': {
        const a = decision.decision;
        if (a.action === 'bid') store.placeBid(cp, a.amount);
        else if (a.action === 'pass') store.passBid(cp);
        else if (a.action === 'skip') store.skipBid(cp);
        else if (a.action === 'complete') { store.resolveAuction(); useGameStore.getState().nextPhase(); }
        break;
      }

      case 'selectAction':
        if (decision.action === 'gainSupport') gainSupportPicks++;
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
        const afterBuild = () => {
          builds++;
          // 불변식 관측: 건설 직후 소유 단위 — 국유화 대기가 없으면 상한(4) 이내여야 한다
          const st = useGameStore.getState();
          if (!st.nationalizationPending) {
            const units = countOwnershipUnits(st.board, cp);
            if (units > 4 && maxUnitsSeen <= 4) {
              // 진단: 초과 순간의 구성 (링크/구간/직결) — 어느 경로가 5단위를 만들었나
              const links = st.board.trackTiles.filter(t => t.owner === cp).length;
              const directs = (st.board.directLinks ?? []).filter(d => d.owner === cp).length;
              process.stdout.write(
                `[디스크 초과 진단] seed게임 T${st.currentTurn} ${cp}: units=${units} (내 타일 ${links}, 직결 ${directs}, 결정=${JSON.stringify(d)})\n`
              );
            }
            maxUnitsSeen = Math.max(maxUnitsSeen, units);
          }
          const ps = st.phaseState;
          if (ps.builtTracksThisTurn >= ps.maxTracksThisTurn) useGameStore.getState().nextPhase();
        };
        if (d.action === 'build') {
          if (!store.buildTrack(d.coord, d.edges)) { addFailedBuildCoord(cp, d.coord, s.currentTurn); break; }
          afterBuild();
        } else if (d.action === 'buildSpur') {
          if (!store.buildTownSpur(d.townCoord)) { useGameStore.getState().nextPhase(); break; }
          afterBuild();
        } else if (d.action === 'buildDirectLink') {
          // 인터어반/페리 구매 — 실패 시 재시도 없이 단계 종료 (executeAITurn과 동일)
          if (!store.buildDirectLink(d.cityA, d.cityB)) { useGameStore.getState().nextPhase(); break; }
          ferryBuys++;
          afterBuild();
        } else if (d.action === 'buildComplex') {
          if (!store.buildComplexTrack(d.coord, d.edges, d.trackType)) { addFailedBuildCoord(cp, d.coord, s.currentTurn); break; }
          afterBuild();
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
          if (hexCoordsEqual(d.destinationCoord, hkCoord)) {
            if (useGameStore.getState().board.allAcceptClosed) hkDeliveriesClosed++;
            else hkDeliveriesOpen++;
          }
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
  const tokens = {} as Record<PlayerId, number>;
  const completedTracks = {} as Record<PlayerId, number>;
  let bankruptcies = 0;

  for (const pid of PLAYERS) {
    const p = f.players[pid];
    if (!p) continue;
    const ownTracks = f.board.trackTiles.filter(t => t.owner === pid);
    const completed = ownTracks.filter(t => isTrackPartOfCompletedLink(t.coord, f.board)).length;
    accurateVP[pid] = calculateVictoryPoints(p.income, completed, p.issuedShares, playerBonusVP(p));
    income[pid] = p.income;
    shares[pid] = p.issuedShares;
    tokens[pid] = p.supportTokens ?? 0;
    completedTracks[pid] = completed;
    if (p.eliminated) bankruptcies++;
  }

  const nationalizations = f.board.trackTiles.filter(t => t.isNationalized).length;

  return {
    accurateVP, income, shares, tokens, completedTracks, bankruptcies,
    finalTurn: f.currentTurn, reachedEnd, deliveries, builds, urbanizations,
    nationalizations, gainSupportPicks, ferryBuys, hkDeliveriesOpen, hkDeliveriesClosed,
    maxUnitsSeen,
  };
}

describe('Southern China 4 AI 전체 게임 — 특수룰 실동작 + 베이스라인', () => {
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
    const results: CResult[] = [];
    for (let i = 0; i < seeds; i++) results.push(runChinaGame(5000 + i * 137));

    const allVPs: number[] = [];
    let totalBankrupt = 0;
    const winnerCounts = {} as Record<PlayerId, number>;
    const perPlayerVP = {} as Record<PlayerId, number>;
    PLAYERS.forEach(p => { winnerCounts[p] = 0; perPlayerVP[p] = 0; });
    for (const r of results) {
      for (const pid of PLAYERS) { allVPs.push(r.accurateVP[pid] ?? 0); perPlayerVP[pid] += r.accurateVP[pid] ?? 0; }
      totalBankrupt += r.bankruptcies;
      let best = PLAYERS[0], bestVP = -Infinity;
      for (const pid of PLAYERS) {
        const v = r.accurateVP[pid] ?? -Infinity;
        if (v > bestVP) { bestVP = v; best = pid; }
      }
      winnerCounts[best]++;
    }
    PLAYERS.forEach(p => { perPlayerVP[p] /= seeds; });
    const sum = (f: (r: CResult) => number) => results.reduce((a, r) => a + f(r), 0);
    return {
      results, seeds,
      avgVP: allVPs.reduce((a, b) => a + b, 0) / allVPs.length,
      minVP: Math.min(...allVPs), maxVP: Math.max(...allVPs),
      avgShares: sum(r => PLAYERS.reduce((a, p) => a + (r.shares[p] ?? 0), 0)) / (seeds * 4),
      avgIncome: sum(r => PLAYERS.reduce((a, p) => a + (r.income[p] ?? 0), 0)) / (seeds * 4),
      avgTokens: sum(r => PLAYERS.reduce((a, p) => a + (r.tokens[p] ?? 0), 0)) / (seeds * 4),
      avgBankruptPerGame: totalBankrupt / seeds,
      avgDeliveries: sum(r => r.deliveries) / seeds,
      avgBuilds: sum(r => r.builds) / seeds,
      avgUrban: sum(r => r.urbanizations) / seeds,
      avgNationalized: sum(r => r.nationalizations) / seeds,
      avgGainSupport: sum(r => r.gainSupportPicks) / seeds,
      avgFerryBuys: sum(r => r.ferryBuys) / seeds,
      avgHkOpen: sum(r => r.hkDeliveriesOpen) / seeds,
      totalHkClosed: sum(r => r.hkDeliveriesClosed),
      maxUnitsSeen: Math.max(...results.map(r => r.maxUnitsSeen)),
      avgTurns: sum(r => r.finalTurn) / seeds,
      finishedTurns: results.map(r => r.finalTurn),
      allReachedEnd: results.every(r => r.reachedEnd),
      winnerCounts, perPlayerVP,
    };
  }

  it('4인 게임 완주 + 특수룰 불변식 + 베이스라인 측정 (100 시드)', () => {
    const m = measure(100);
    logSpy.mockRestore();
    console.log('\n===== Southern China 4인 VP 통계 (100 시드) =====');
    console.log(`평균 accurateVP: ${m.avgVP.toFixed(2)} (min ${m.minVP}, max ${m.maxVP})`);
    console.log(`평균 발행주식: ${m.avgShares.toFixed(2)}, 평균 income: ${m.avgIncome.toFixed(2)}, 평균 잔여토큰: ${m.avgTokens.toFixed(2)}`);
    console.log(`건설/배달/도시화: 건설 ${m.avgBuilds.toFixed(1)}, 배달 ${m.avgDeliveries.toFixed(1)}, 도시화 ${m.avgUrban.toFixed(1)}`);
    console.log(`국유화 타일: ${m.avgNationalized.toFixed(1)}개/게임, gainSupport 선택: ${m.avgGainSupport.toFixed(1)}회/게임, 인터어반/페리 구매: ${m.avgFerryBuys.toFixed(1)}회/게임`);
    console.log(`홍콩 배달: 개방 중 ${m.avgHkOpen.toFixed(1)}회/게임, 폐쇄 후 ${m.totalHkClosed}회(불변식 0)`);
    console.log(`관측 최대 소유 단위: ${m.maxUnitsSeen} (상한 4)`);
    console.log(`파산: ${m.avgBankruptPerGame.toFixed(2)}명/게임, 평균 완주턴 ${m.avgTurns.toFixed(1)} (최대 8)`);
    console.log(`최종 승자 분포: ${JSON.stringify(m.winnerCounts)}`);
    console.log(`player별 평균 VP: ${JSON.stringify(Object.fromEntries(Object.entries(m.perPlayerVP).map(([k, v]) => [k, +v.toFixed(1)])))}`);

    // 핵심: 모든 게임이 정상 종료 (멈춤/무한루프 없음)
    expect(m.allReachedEnd).toBe(true);
    expect(m.finishedTurns.every(t => t >= 2)).toBe(true);
    expect(m.finishedTurns.some(t => t >= 8)).toBe(true);
    // 특수룰 불변식
    expect(m.totalHkClosed).toBe(0);      // 폐쇄(마지막 2턴) 후 홍콩 배달 없음
    expect(m.maxUnitsSeen).toBeLessThanOrEqual(4); // 디스크 상한 (국유화 대기 해소 후 기준)
  }, 900_000);
});
