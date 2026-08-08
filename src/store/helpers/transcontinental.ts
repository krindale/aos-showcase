// Western US 대륙횡단 연결 감지 + 보너스 (gameStore 스텝 3a 분리)

import {
  GameState,
  PlayerId,
  PlayerState,
  HexCoord,
  GAME_CONSTANTS,
  TranscontinentalEvent,
} from '@/types/game';
import { getMapProfile } from '@/maps/getMapProfile';
import { findAllCompletedLinks } from '@/utils/trackValidation';
import { hexCoordsEqual } from '@/utils/hexGrid';
import { logAction } from '@/utils/debugConfig';

// ============================================================
// Western US: 대륙횡단(서부 시작도시↔동부 시작도시) 연결 감지 + 보너스
// ============================================================

/** 완성 링크 그래프에서 starts → goals 경로의 트랙 소유자 목록(중복 포함). 없으면 null. */
function bfsConnectingOwners(
  adj: Map<string, { to: string; owner: PlayerId }[]>,
  starts: Set<string>,
  goals: Set<string>
): PlayerId[] | null {
  const queue = Array.from(starts);
  const visited = new Set<string>(starts);
  const parent = new Map<string, { from: string; owner: PlayerId }>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (goals.has(cur)) {
      const owners: PlayerId[] = [];
      let node = cur;
      while (parent.has(node)) { const p = parent.get(node)!; owners.push(p.owner); node = p.from; }
      return owners;
    }
    for (const e of adj.get(cur) ?? []) {
      if (!visited.has(e.to)) { visited.add(e.to); parent.set(e.to, { from: cur, owner: e.owner }); queue.push(e.to); }
    }
  }
  return null;
}

/**
 * 대륙횡단 연결을 평가해 (1) 각 플레이어의 transcontinental 플래그(연속성 해제)와
 * (2) 1회성 연결 보너스($4/$2 income)를 적용한 새 상태 조각을 반환. 변화 없으면 null.
 * 룰북: 1철도 연결=+$4, 2철도=각 +$2, 3철도+=연결 트랙 놓은 플레이어가 2철도 선택 +$2.
 */
export function computeTranscontinental(state: GameState, builder: PlayerId):
  { players: Record<PlayerId, PlayerState>; awarded: boolean; log: string; event: TranscontinentalEvent } | null {
  const profile = getMapProfile(state.mapId);
  if (!profile.transcontinentalBonus) return null;
  // 효율: 보너스 이미 지급 + 모든 활성 플레이어가 대륙횡단 달성 → 더 스캔할 것 없음
  // (매 건설마다 findAllCompletedLinks×N 전수 스캔을 후반에 회피)
  if ((state.transcontinentalAwarded ?? false) &&
      state.activePlayers.every(p => state.players[p]?.transcontinental || state.players[p]?.eliminated)) {
    return null;
  }
  const board = state.board;

  const westStops = board.cities.filter(c => c.region === 'west' && profile.isStartingCity(c));
  const eastStops = board.cities.filter(c => c.region === 'east' && profile.isStartingCity(c));
  if (!westStops.length || !eastStops.length) return null;

  const stopKey = (coord: HexCoord): string => {
    const c = board.cities.find(ct => hexCoordsEqual(ct.coord, coord));
    return c ? `c:${c.id}` : `t:${coord.col},${coord.row}`;
  };
  const westKeys = new Set(westStops.map(c => `c:${c.id}`));
  const eastKeys = new Set(eastStops.map(c => `c:${c.id}`));

  // 완성 링크(소유자별) 수집 → 합집합/플레이어별 인접그래프
  const allEdges: { a: string; b: string; owner: PlayerId }[] = [];
  for (const pid of state.activePlayers) {
    for (const link of findAllCompletedLinks(board, pid)) {
      allEdges.push({ a: stopKey(link.from), b: stopKey(link.to), owner: pid });
    }
  }
  if (!allEdges.length) return null;
  const buildAdj = (filter?: PlayerId) => {
    const adj = new Map<string, { to: string; owner: PlayerId }[]>();
    const add = (a: string, b: string, owner: PlayerId) => {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a)!.push({ to: b, owner });
    };
    for (const e of allEdges) {
      if (filter && e.owner !== filter) continue;
      add(e.a, e.b, e.owner); add(e.b, e.a, e.owner);
    }
    return adj;
  };

  let players = state.players;
  let changed = false;
  const ensureCopy = () => { if (!changed) { players = { ...players }; changed = true; } };

  // (1) 플레이어별 연속성 해제: 자기 완성 링크만으로 서부↔동부 연결 시 플래그
  const unlockedPlayers: { playerId: PlayerId; name: string }[] = [];
  for (const pid of state.activePlayers) {
    if (players[pid]?.transcontinental || players[pid]?.eliminated) continue;
    if (bfsConnectingOwners(buildAdj(pid), westKeys, eastKeys)) {
      ensureCopy();
      players[pid] = { ...players[pid], transcontinental: true };
      unlockedPlayers.push({ playerId: pid, name: players[pid].name });
    }
  }

  // (2) 1회성 연결 보너스 (보드 전체 최초 연결)
  let awarded = state.transcontinentalAwarded ?? false;
  let log = '';
  const bonusRecipients: { playerId: PlayerId; name: string; amount: number }[] = [];
  if (!awarded) {
    // 룰북 "1개 철도로 연결 = 그 철도 +$4"는 **단독 연결 여부로 먼저** 판정한다.
    // 합집합 BFS가 찾은 임의 경로의 소유자 수로 판정하면, 내 철도 단독 연결이 있어도
    // BFS가 남의 링크를 낀 다른 경로를 먼저 찾아 "2철도 합작(+$2/+$2)"으로 오판한다
    // — 시작 도시에 링크만 걸친 무관한 플레이어가 보너스를 나눠 갖던 실전 버그(2026-08-08).
    // 단독 연결자는 위 (1)의 플레이어별 BFS가 이미 transcontinental=true로 판정해 뒀다.
    // (보너스 지급 전에 이 플래그가 서 있을 수 있는 경로는 이번 호출의 (1)뿐 — 이전 턴에
    //  단독 연결이 있었다면 그때 합집합도 연결이라 이미 awarded=true였을 것)
    const soloConnectors = state.activePlayers.filter(
      pid => players[pid]?.transcontinental && !players[pid]?.eliminated
    );
    let recipients: PlayerId[] | null = null;
    let amt = 0;
    let ownersForLog: PlayerId[] = [];
    if (soloConnectors.length > 0) {
      // 1철도 단독 연결 → 그 철도만 +$4. (동시 복수 단독은 이론상 builder뿐이지만 방어적 전원 지급)
      recipients = soloConnectors; amt = 4; ownersForLog = soloConnectors;
    } else {
      // 단독 연결이 없을 때만 합작(임의 소유자 경로) 판정
      const ownersOnPath = bfsConnectingOwners(buildAdj(), westKeys, eastKeys);
      if (ownersOnPath && ownersOnPath.length) {
        // 경로상 각 철도의 트랙 기여 수(빈도)
        const freq = new Map<PlayerId, number>();
        for (const o of ownersOnPath) freq.set(o, (freq.get(o) ?? 0) + 1);
        const distinct = Array.from(freq.keys());
        ownersForLog = distinct;
        // 룰북: 2철도 → 각 +$2. 3철도+ → "연결 트랙 놓은 플레이어가 2철도 선택" →
        //   연결을 완성한 builder를 우선 포함하고, 나머지 한 자리는 경로 트랙이 가장 많은 철도로.
        // (distinct 1개는 위 단독 분기가 이미 잡으므로 여기 도달 시 항상 2개 이상)
        const ranked = distinct.slice().sort((a, b) => (freq.get(b)! - freq.get(a)!));
        const ordered = distinct.includes(builder) ? [builder, ...ranked.filter(o => o !== builder)] : ranked;
        recipients = ordered.slice(0, 2); amt = distinct.length === 1 ? 4 : 2;
      }
    }
    if (recipients && recipients.length) {
      ensureCopy();
      const parts: string[] = [];
      for (const pid of recipients) {
        players[pid] = {
          ...players[pid],
          income: Math.min(players[pid].income + amt, GAME_CONSTANTS.MAX_INCOME),
          transcontinental: true,
        };
        parts.push(`${players[pid].name} +${amt} income`);
        bonusRecipients.push({ playerId: pid, name: players[pid].name, amount: amt });
      }
      awarded = true;
      log = `🌉 대륙횡단 연결 보너스: ${parts.join(', ')}`;
      logAction('trackBuilding', 'transcontinental', { owners: ownersForLog, recipients, amt }, 'error');
    }
  }

  if (!changed && awarded === (state.transcontinentalAwarded ?? false)) return null;
  // 보너스 수령자는 연속성도 함께 해제됨 — 팝업에 중복 표시하지 않도록 unlockedPlayers에서 제외
  const bonusIds = new Set(bonusRecipients.map(r => r.playerId));
  const event: TranscontinentalEvent = {
    bonusRecipients,
    unlockedPlayers: unlockedPlayers.filter(u => !bonusIds.has(u.playerId)),
    key: 0, // applyTranscontinental이 발생 시각으로 교체 (순수 계산부는 시간을 모른다)
  };
  return { players, awarded, log, event };
}
