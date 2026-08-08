/**
 * Scotland 비대칭 A/B 하니스 — "기존 봇 vs 신규 봇" 맞대결 승률 측정
 *
 * 자기복제 시뮬의 평균 VP는 "대칭 전략 간 우열"만 보고 **맞대결 강함을 놓친다**
 * (docs/ai-auction-baseline-100seed.md 2026-08-05 방법론 교훈 — 긴축은 자기복제 최적이지만
 * 레버리지 상대 승률 36%). 전략 변경은 이 하니스로 승률을 함께 잰다.
 *
 * 구조: getMapProfile 캐시 인스턴스에 플레이어별 훅 오버라이드를 **결정 호출 순간만** 씌워
 * (Object.defineProperty로 게터 섀도잉 → finally에서 delete 복원) 두 정책을 한 판에 공존시킨다.
 * 결정 경로(getAIDecision)만 훅을 읽는 정책이어야 한다 — store 실행 경로가 읽는 훅(예:
 * growthDiceSplit)은 이 방식으로 A/B할 수 없다.
 *
 * 좌석 편향 주의: Scotland 2인은 좌석 승률이 기울어 있다(문서 기록 ~37/63) — 같은 시드를
 * 좌석 스왑으로 두 번 돌려 정책 기준으로 합산한다.
 *
 * 시드 수: 기본 20(게이트용 가벼움), 측정은 AOS_SEEDS=150 등으로.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { getAIDecision } from '@/ai';
import { addFailedBuildCoord } from '../strategies/buildTrack';
import { calculateVictoryPoints } from '@/utils/gameLogic';
import { isTrackPartOfCompletedLink } from '@/utils/hexGrid';
import { getMapProfile } from '@/maps/getMapProfile';
import { MapId } from '@/maps/MapId';
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

/** 정책 = 프로파일 훅 오버라이드 집합. NEW(현재 코드)는 빈 객체. */
type Policy = Record<string, unknown>;

/** OLD: 오늘 변경 이전의 훅 값 (스킵→엔진업 전환·경합 수송 절실함·2인 행동 계획 없음) */
const POLICY_OLD: Policy = {
  aiEngineSkipConversionVP: 0,
  aiAuctionContestedMoveVP: 0,
  aiTwoPlayerActionPlanning: false,
};
/** NEW: 현재 프로파일 그대로 */
const POLICY_NEW: Policy = {};

function withOverrides<T>(overrides: Policy, fn: () => T): T {
  const profile = getMapProfile(MapId.Scotland) as unknown as Record<string, unknown>;
  const keys = Object.keys(overrides);
  try {
    for (const k of keys) {
      Object.defineProperty(profile, k, { value: overrides[k], configurable: true });
    }
    return fn();
  } finally {
    for (const k of keys) delete profile[k];
  }
}

interface AbGameResult {
  vp: Record<PlayerId, number>;
  income: Record<PlayerId, number>;
  engine: Record<PlayerId, number>;
  reachedEnd: boolean;
}

/** Scotland 한 게임(2 AI, 좌석별 정책)을 동기식으로 끝까지 구동 */
function runAbGame(seed: number, policies: Record<PlayerId, Policy>): AbGameResult {
  const rng = createSeededRng(seed);
  vi.spyOn(Math, 'random').mockImplementation(rng);
  useGameStore.getState().initGame(
    'scotland',
    PLAYERS.map((_, i) => `AI-${i + 1}`),
    PLAYERS.map((_, i) => ({ playerIndex: i, name: `AI-${i + 1}` })),
  );
  vi.restoreAllMocks();

  const MAX_ITER = 60000;
  let iter = 0, stale = 0, lastSig = '';
  let reachedEnd = false;

  while (iter++ < MAX_ITER) {
    const s = useGameStore.getState();
    if (s.currentPhase === 'gameOver') { reachedEnd = true; break; }

    if (s.ui.movingCube) { s.completeCubeMove(); continue; }

    if (s.currentPhase === 'goodsGrowth') {
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
    const decision = withOverrides(policies[cp] ?? POLICY_NEW, () => getAIDecision(s, cp));
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
        } else if (d.action === 'buildDirectLink') {
          if (!store.buildDirectLink(d.cityA, d.cityB)) { useGameStore.getState().nextPhase(); break; }
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
  const vp = {} as Record<PlayerId, number>;
  const income = {} as Record<PlayerId, number>;
  const engine = {} as Record<PlayerId, number>;
  for (const pid of PLAYERS) {
    const p = f.players[pid];
    if (!p) continue;
    const ownTracks = f.board.trackTiles.filter(t => t.owner === pid);
    const completed = ownTracks.filter(t => isTrackPartOfCompletedLink(t.coord, f.board)).length;
    vp[pid] = calculateVictoryPoints(p.income, completed, p.issuedShares);
    income[pid] = p.income;
    engine[pid] = p.engineLevel;
  }
  return { vp, income, engine, reachedEnd };
}

describe('Scotland 비대칭 A/B — 기존 봇 vs 신규 봇 맞대결', () => {
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

  it('좌석 스왑 맞대결 승률 측정', () => {
    const seeds = Number(process.env.AOS_SEEDS) || 20;

    let newWins = 0, oldWins = 0, ties = 0, games = 0;
    let newVP = 0, oldVP = 0, newIncome = 0, oldIncome = 0, newEngine = 0, oldEngine = 0;
    let allReached = true;

    for (let i = 0; i < seeds; i++) {
      const seed = 3000 + i * 137; // scotlandSimulation과 동일 시드 계열
      // 좌석 스왑 2판: (P1=NEW, P2=OLD), (P1=OLD, P2=NEW)
      for (const newSeat of ['player1', 'player2'] as PlayerId[]) {
        const policies = {
          player1: newSeat === 'player1' ? POLICY_NEW : POLICY_OLD,
          player2: newSeat === 'player2' ? POLICY_NEW : POLICY_OLD,
        } as Record<PlayerId, Policy>;
        const r = runAbGame(seed, policies);
        allReached &&= r.reachedEnd;
        games++;
        const oldSeat: PlayerId = newSeat === 'player1' ? 'player2' : 'player1';
        newVP += r.vp[newSeat] ?? 0; oldVP += r.vp[oldSeat] ?? 0;
        newIncome += r.income[newSeat] ?? 0; oldIncome += r.income[oldSeat] ?? 0;
        newEngine += r.engine[newSeat] ?? 0; oldEngine += r.engine[oldSeat] ?? 0;
        const nv = r.vp[newSeat] ?? -Infinity, ov = r.vp[oldSeat] ?? -Infinity;
        if (nv > ov) newWins++; else if (ov > nv) oldWins++; else ties++;
      }
    }

    logSpy.mockRestore();
    console.log(`\n===== Scotland A/B (${seeds} 시드 × 좌석 스왑 = ${games} 게임) =====`);
    console.log(`승률: NEW ${newWins} / OLD ${oldWins} / 무승부 ${ties} → NEW ${(100 * newWins / Math.max(1, newWins + oldWins)).toFixed(0)}%`);
    console.log(`평균 VP: NEW ${(newVP / games).toFixed(2)} vs OLD ${(oldVP / games).toFixed(2)}`);
    console.log(`평균 income: NEW ${(newIncome / games).toFixed(2)} vs OLD ${(oldIncome / games).toFixed(2)}`);
    console.log(`평균 엔진: NEW ${(newEngine / games).toFixed(2)} vs OLD ${(oldEngine / games).toFixed(2)}`);

    expect(allReached).toBe(true);
  }, 1_800_000);
});
