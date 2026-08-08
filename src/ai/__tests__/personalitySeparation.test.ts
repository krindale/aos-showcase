/**
 * 봇 경매 성격 분리 측정 — Rust Belt 4인, 성격 고정 배정 (denial/wuType/aggressive/conservative)
 *
 * 목적("재미" 분석 1단계): 성격이 시뮬 지표에서 실제로 갈라지는지 측정한다.
 * 성격별 ①입찰 참여 횟수 ②입찰액 합 ③1등 획득(입찰) 횟수가 서로 분리되지 않으면
 * 플레이어도 차이를 못 느낀다 → 그 성격은 무작위 배정 풀에서 제외(코드는 유지).
 *
 * 게이트는 건강(전 게임 정상 종료 + 파산 폭증 없음)만 하드로 걸고, 분리 수치는
 * 로그로 출력해 사람이 판정한다 (Part A 재측정 표와 함께 baseline 문서에 기록).
 *
 * 러너는 rustBeltSimulation.test.ts의 동기식 러너 축약 복제 — 단 aiPlayers 설정에
 * auctionPersonality를 고정 배정하고, 경매 지표를 **플레이어(=성격)별로** 계측한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { getAIDecision } from '@/ai';
import { addFailedBuildCoord } from '../strategies/buildTrack';
import { calculateVictoryPoints } from '@/utils/gameLogic';
import { isTrackPartOfCompletedLink } from '@/utils/hexGrid';
import type { PlayerId, AuctionPersonalityId } from '@/types/game';

function createSeededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const RB_PLAYERS: PlayerId[] = ['player1', 'player2', 'player3', 'player4'];

/** 좌석 고정 성격 배정 — 분리 측정용 (standard는 항등 게이트가 따로 있어 4개 비교군만) */
const SEAT_PERSONALITY: Record<PlayerId, AuctionPersonalityId> = {
  player1: 'denial',
  player2: 'wuType',
  player3: 'aggressive',
  player4: 'conservative',
} as Record<PlayerId, AuctionPersonalityId>;

/** Western US 건강 게이트용 5인 배정 (맵 seatBonus와 성격의 상호작용 감시 — max 합성 검증) */
const WU_PLAYERS: PlayerId[] = ['player1', 'player2', 'player3', 'player4', 'player5'];
const WU_SEAT_PERSONALITY: Record<PlayerId, AuctionPersonalityId> = {
  player1: 'denial',
  player2: 'wuType',
  player3: 'aggressive',
  player4: 'conservative',
  player5: 'standard',
} as Record<PlayerId, AuctionPersonalityId>;

const AUTO_PHASES = new Set([
  'collectIncome', 'payExpenses', 'incomeReduction', 'advanceTurn',
]);

interface PSResult {
  accurateVP: Record<PlayerId, number>;
  bankruptcies: number;
  reachedEnd: boolean;
  bidsByPlayer: Record<PlayerId, number>;     // 성격별 입찰 참여 횟수
  bidSumByPlayer: Record<PlayerId, number>;   // 성격별 입찰액 합
  firstSeatByBid: Record<PlayerId, number>;   // 성격별 입찰로 1등 획득 횟수
  firstSeatTotal: Record<PlayerId, number>;   // 성격별 1등 횟수 (양보 포함)
}

function runGame(
  seed: number,
  mapId: string = 'rust-belt',
  players: PlayerId[] = RB_PLAYERS,
  seatPersonality: Record<PlayerId, AuctionPersonalityId> = SEAT_PERSONALITY,
): PSResult {
  const PLAYERS = players; // 아래 계측 루프가 참조하는 이름 유지 (섀도잉)
  const rng = createSeededRng(seed);
  vi.spyOn(Math, 'random').mockImplementation(rng);
  useGameStore.getState().initGame(
    mapId,
    PLAYERS.map((_, i) => `AI-${i + 1}`),
    PLAYERS.map((_, i) => ({
      playerIndex: i,
      name: `AI-${i + 1}`,
      auctionPersonality: seatPersonality[PLAYERS[i]],
    })),
  );
  vi.restoreAllMocks();

  const bidsByPlayer = {} as Record<PlayerId, number>;
  const bidSumByPlayer = {} as Record<PlayerId, number>;
  const firstSeatByBid = {} as Record<PlayerId, number>;
  const firstSeatTotal = {} as Record<PlayerId, number>;
  PLAYERS.forEach(p => {
    bidsByPlayer[p] = 0; bidSumByPlayer[p] = 0; firstSeatByBid[p] = 0; firstSeatTotal[p] = 0;
  });
  let lastSeatTurn = 0;
  let turnHadBid = false;
  const MAX_ITER = 80000;
  let iter = 0, stale = 0, lastSig = '';
  let reachedEnd = false;

  while (iter++ < MAX_ITER) {
    const s = useGameStore.getState();
    if (s.currentPhase === 'gameOver') { reachedEnd = true; break; }

    if (s.currentPhase === 'selectActions' && s.currentTurn !== lastSeatTurn) {
      const first = s.playerOrder[0];
      if (first) {
        firstSeatTotal[first] = (firstSeatTotal[first] ?? 0) + 1;
        if (turnHadBid) firstSeatByBid[first] = (firstSeatByBid[first] ?? 0) + 1;
      }
      lastSeatTurn = s.currentTurn;
      turnHadBid = false;
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
        if (a.action === 'bid') {
          store.placeBid(cp, a.amount);
          bidsByPlayer[cp]++; bidSumByPlayer[cp] += a.amount; turnHadBid = true;
        }
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
          const ps = useGameStore.getState().phaseState;
          if (ps.builtTracksThisTurn >= ps.maxTracksThisTurn) useGameStore.getState().nextPhase();
        } else if (d.action === 'buildSpur') {
          if (!store.buildTownSpur(d.townCoord)) { useGameStore.getState().nextPhase(); break; }
          const ps = useGameStore.getState().phaseState;
          if (ps.builtTracksThisTurn >= ps.maxTracksThisTurn) useGameStore.getState().nextPhase();
        } else if (d.action === 'buildComplex') {
          if (!store.buildComplexTrack(d.coord, d.edges, d.trackType)) { addFailedBuildCoord(cp, d.coord, s.currentTurn); break; }
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
  let bankruptcies = 0;
  for (const pid of PLAYERS) {
    const p = f.players[pid];
    if (!p) continue;
    const ownTracks = f.board.trackTiles.filter(t => t.owner === pid);
    const completed = ownTracks.filter(t => isTrackPartOfCompletedLink(t.coord, f.board)).length;
    accurateVP[pid] = calculateVictoryPoints(p.income, completed, p.issuedShares);
    if (p.eliminated) bankruptcies++;
  }

  return { accurateVP, bankruptcies, reachedEnd, bidsByPlayer, bidSumByPlayer, firstSeatByBid, firstSeatTotal };
}

describe('봇 경매 성격 분리 측정 — Rust Belt 4인 고정 배정', () => {
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

  it('성격별 경매 지표 분리 + 건강 게이트', () => {
    const seeds = Number(process.env.AOS_SEEDS ?? 100);
    const results: PSResult[] = [];
    for (let i = 0; i < seeds; i++) results.push(runGame(2000 + i * 137));

    const agg = {} as Record<PlayerId, { bids: number; bidSum: number; byBid: number; first: number; vp: number }>;
    RB_PLAYERS.forEach(p => { agg[p] = { bids: 0, bidSum: 0, byBid: 0, first: 0, vp: 0 }; });
    let totalBankrupt = 0;
    for (const r of results) {
      totalBankrupt += r.bankruptcies;
      for (const p of RB_PLAYERS) {
        agg[p].bids += r.bidsByPlayer[p] ?? 0;
        agg[p].bidSum += r.bidSumByPlayer[p] ?? 0;
        agg[p].byBid += r.firstSeatByBid[p] ?? 0;
        agg[p].first += r.firstSeatTotal[p] ?? 0;
        agg[p].vp += r.accurateVP[p] ?? 0;
      }
    }

    logSpy.mockRestore();
    console.log(`\n===== 성격 분리 측정 (Rust Belt 4인, ${seeds} 시드) =====`);
    RB_PLAYERS.forEach(p => {
      const x = agg[p];
      console.log(
        `${SEAT_PERSONALITY[p]} (${p}): 입찰 ${(x.bids / seeds).toFixed(1)}회/게임 · ` +
        `평균 입찰액 $${x.bids > 0 ? (x.bidSum / x.bids).toFixed(2) : '0'} · ` +
        `1등(입찰) ${x.byBid}회 · 1등(전체) ${x.first}회 · VP ${(x.vp / seeds).toFixed(1)}`
      );
    });
    console.log(`파산: ${(totalBankrupt / seeds).toFixed(2)}명/게임`);

    // 건강 게이트: 전 게임 정상 종료 + 파산 폭증 없음 (Part A rust-belt 0.16 대비 2배 상한)
    expect(results.every(r => r.reachedEnd)).toBe(true);
    expect(totalBankrupt / seeds).toBeLessThanOrEqual(0.4);
  }, 900_000);

  // Western US: 유일하게 맵 자체 seatBonus(firstSeatRankBidBonus)를 가진 맵 — 과거 견제 가치와의
  // 중첩으로 승자편차 붕괴(11→21) 전력. 성격 보너스는 max 합성이라 중첩 불가지만 실측으로 확인.
  it('Western US + 성격 혼합 건강 게이트 (seatBonus max 합성 감시)', () => {
    const seeds = Number(process.env.AOS_SEEDS ?? 100);
    const results: PSResult[] = [];
    for (let i = 0; i < seeds; i++) {
      results.push(runGame(5000 + i * 137, 'western-us', WU_PLAYERS, WU_SEAT_PERSONALITY));
    }

    const winnerCounts = {} as Record<PlayerId, number>;
    WU_PLAYERS.forEach(p => { winnerCounts[p] = 0; });
    let totalBankrupt = 0, totalVP = 0;
    for (const r of results) {
      totalBankrupt += r.bankruptcies;
      let best = WU_PLAYERS[0], bestVP = -Infinity;
      for (const p of WU_PLAYERS) {
        totalVP += r.accurateVP[p] ?? 0;
        const v = r.accurateVP[p] ?? -Infinity;
        if (v > bestVP) { bestVP = v; best = p; }
      }
      winnerCounts[best]++;
    }

    logSpy.mockRestore();
    console.log(`\n===== WU + 성격 혼합 건강 게이트 (${seeds} 시드) =====`);
    console.log(`평균 VP: ${(totalVP / (seeds * WU_PLAYERS.length)).toFixed(2)}, 파산: ${(totalBankrupt / seeds).toFixed(2)}명/게임`);
    WU_PLAYERS.forEach(p => {
      console.log(`${WU_SEAT_PERSONALITY[p]} (${p}): 입찰 ${(results.reduce((a, r) => a + (r.bidsByPlayer[p] ?? 0), 0) / seeds).toFixed(1)}회 · 승리 ${winnerCounts[p]}회`);
    });

    expect(results.every(r => r.reachedEnd)).toBe(true);
    // Part A WU 파산 0.21 대비 폭증 없음
    expect(totalBankrupt / seeds).toBeLessThanOrEqual(0.5);
  }, 900_000);

  // 성격별 "진짜" 승률 — 좌석 고정 측정은 좌석 편향(시드 아티팩트)이 섞이므로,
  // 시드마다 성격을 좌석에 로테이션 배정해(seed i → r = i%5) 좌석 효과를 상쇄한다.
  // Rust Belt 5인(7턴) + 5성격 전원: 각 성격이 각 좌석에 seeds/5회씩 앉는다.
  it('성격별 승률 측정 (좌석 로테이션, Rust Belt 5인)', () => {
    const seeds = Number(process.env.AOS_SEEDS ?? 100);
    const ROT_PLAYERS: PlayerId[] = ['player1', 'player2', 'player3', 'player4', 'player5'];
    const LIST: AuctionPersonalityId[] = ['denial', 'wuType', 'aggressive', 'conservative', 'standard'];

    const wins = {} as Record<AuctionPersonalityId, number>;
    const vpSum = {} as Record<AuctionPersonalityId, number>;
    const bankruptByPers = {} as Record<AuctionPersonalityId, number>;
    LIST.forEach(id => { wins[id] = 0; vpSum[id] = 0; bankruptByPers[id] = 0; });
    let allEnd = true;

    for (let i = 0; i < seeds; i++) {
      const rot = i % LIST.length;
      const seatPersonality = {} as Record<PlayerId, AuctionPersonalityId>;
      ROT_PLAYERS.forEach((p, j) => { seatPersonality[p] = LIST[(j + rot) % LIST.length]; });

      const r = runGame(7000 + i * 137, 'rust-belt', ROT_PLAYERS, seatPersonality);
      allEnd = allEnd && r.reachedEnd;

      let best: PlayerId = ROT_PLAYERS[0], bestVP = -Infinity;
      for (const p of ROT_PLAYERS) {
        const v = r.accurateVP[p] ?? -Infinity;
        vpSum[seatPersonality[p]] += r.accurateVP[p] ?? 0;
        if (v > bestVP) { bestVP = v; best = p; }
      }
      wins[seatPersonality[best]]++;
    }

    logSpy.mockRestore();
    console.log(`\n===== 성격별 승률 (좌석 로테이션, Rust Belt 5인, ${seeds} 시드) =====`);
    LIST.forEach(id => {
      console.log(`${id}: 승리 ${wins[id]}회 (${(wins[id] / seeds * 100).toFixed(0)}%) · 평균 VP ${(vpSum[id] / seeds).toFixed(1)}`);
    });

    expect(allEnd).toBe(true);
  }, 900_000);
});
