/**
 * Western US 대륙횡단 보너스 귀속 회귀 테스트 (2026-08-08 실전 버그)
 *
 * 룰북: 1개 철도로 연결 = 그 철도 +$4 / 2개 철도로 연결 = 각 +$2.
 * 버그: 보너스 판정이 합집합 그래프 BFS가 찾은 "임의 경로 하나"의 소유자 수였다 —
 * 내 철도 단독 연결이 있어도 BFS가 남의 링크를 낀 다른 경로를 먼저 찾으면
 * 2철도 합작(+$2/+$2)으로 오판해, 시작 도시에 링크만 걸친 무관한 플레이어가
 * 보너스를 나눠 가졌다. 수정: 단독 연결(플레이어별 BFS) 우선 판정.
 */

import { describe, it, expect } from 'vitest';
import { computeTranscontinental } from '../transcontinental';
import { createMockGameState, createMockPlayer, createMockTrack } from '../../../ai/__tests__/helpers/mockState';
import { getEdgeBetweenHexes } from '@/ai/strategy/analyzer';
import type { City, HexCoord, TrackTile, PlayerId } from '@/types/game';

/** 사이 헥스가 두 정거장을 잇는 단순 트랙 타일 (엣지 번호는 기하 헬퍼로 산출 — 하드코딩 금지) */
function tileBetween(hex: HexCoord, stopA: HexCoord, stopB: HexCoord, owner: PlayerId): TrackTile {
  const ea = getEdgeBetweenHexes(hex, stopA);
  const eb = getEdgeBetweenHexes(hex, stopB);
  if (ea < 0 || eb < 0) throw new Error(`비인접 테스트 픽스처: ${JSON.stringify(hex)}`);
  return createMockTrack(hex, [ea, eb], owner);
}

const city = (id: string, coord: HexCoord, region?: 'west' | 'east'): City => ({
  id, name: id, coord, color: 'red', cubes: [], ...(region ? { region } : {}),
});

// 지형: 시애틀(0,0) — 덴버(2,0) — SLC(4,0) — 덜루스(6,0), 전부 0행(홀수 열이 사이 헥스).
// 상대(player1)의 우회로: (0,1)-(1,1) 두 타일로 시애틀↔덴버를 잇는 별도 링크.
const SEATTLE: HexCoord = { col: 0, row: 0 };
const DENVER: HexCoord = { col: 2, row: 0 };
const SLC: HexCoord = { col: 4, row: 0 };
const DULUTH: HexCoord = { col: 6, row: 0 };

function makeState(trackTiles: TrackTile[]) {
  const state = createMockGameState({
    mapId: 'western-us',
    activePlayers: ['player1', 'player2'],
    playerOrder: ['player1', 'player2'],
    players: {
      player1: createMockPlayer('player1', { name: '상대', income: 10 }),
      player2: createMockPlayer('player2', { name: '나', income: 10 }),
    } as never,
  });
  state.board = {
    cities: [
      city('seattle', SEATTLE, 'west'),   // 서부 시작 도시
      city('duluth', DULUTH, 'east'),     // 동부 시작 도시
      city('denver', DENVER),             // 중간 (시작 도시 아님)
      city('saltlakecity', SLC),          // 중간 (시작 도시 아님)
    ],
    towns: [],
    trackTiles,
    hexTiles: [],
  };
  return state;
}

/** 내 철도 단독으로 시애틀↔덜루스 완성 (3링크) */
const myFullPath = (): TrackTile[] => [
  tileBetween({ col: 1, row: 0 }, SEATTLE, DENVER, 'player2'),
  tileBetween({ col: 3, row: 0 }, DENVER, SLC, 'player2'),
  tileBetween({ col: 5, row: 0 }, SLC, DULUTH, 'player2'),
];

/** 상대의 시애틀↔덴버 우회 링크 (2타일 — 합집합 BFS가 이쪽을 먼저 찾을 수 있는 미끼) */
const oppShortcut = (): TrackTile[] => {
  const a: HexCoord = { col: 0, row: 1 };
  const b: HexCoord = { col: 1, row: 1 };
  const ea1 = getEdgeBetweenHexes(a, SEATTLE);
  const ea2 = getEdgeBetweenHexes(a, b);
  const eb1 = getEdgeBetweenHexes(b, a);
  const eb2 = getEdgeBetweenHexes(b, DENVER);
  if ([ea1, ea2, eb1, eb2].some(e => e < 0)) throw new Error('비인접 우회 픽스처');
  return [
    createMockTrack(a, [ea1, ea2], 'player1'),
    createMockTrack(b, [eb1, eb2], 'player1'),
  ];
};

describe('computeTranscontinental — 보너스 귀속 (룰북: 1철도 +$4 / 2철도 각 +$2)', () => {
  it('내 철도 단독 연결이면, 상대 링크가 시작 도시에 붙어 있어도 나만 +$4', () => {
    const state = makeState([...oppShortcut(), ...myFullPath()]);
    const result = computeTranscontinental(state, 'player2');

    expect(result).not.toBeNull();
    expect(result!.event.bonusRecipients).toEqual([
      { playerId: 'player2', name: '나', amount: 4 },
    ]);
    expect(result!.players.player2.income).toBe(14);
    // 상대는 한 푼도 못 받고, 연속성 해제도 안 됨 (자기 단독 연결이 없으므로)
    expect(result!.players.player1.income).toBe(10);
    expect(result!.players.player1.transcontinental ?? false).toBe(false);
  });

  it('진짜 합작 연결(내 링크 일부 + 상대 링크)이면 각 +$2', () => {
    // 내 시애틀↔덴버 구간을 빼서 단독 연결 불가 — 상대 우회로가 있어야만 연결된다
    const mine = myFullPath().slice(1); // 덴버-SLC, SLC-덜루스만
    const state = makeState([...oppShortcut(), ...mine]);
    const result = computeTranscontinental(state, 'player2');

    expect(result).not.toBeNull();
    const recipients = result!.event.bonusRecipients;
    expect(recipients).toHaveLength(2);
    expect(recipients.every(r => r.amount === 2)).toBe(true);
    expect(new Set(recipients.map(r => r.playerId))).toEqual(new Set(['player1', 'player2']));
    expect(result!.players.player1.income).toBe(12);
    expect(result!.players.player2.income).toBe(12);
  });

  it('보너스가 이미 지급됐고 전원 연속성 해제면 null (조기 반환 가드)', () => {
    const state = makeState(myFullPath());
    state.transcontinentalAwarded = true;
    state.players.player1 = { ...state.players.player1, transcontinental: true };
    state.players.player2 = { ...state.players.player2, transcontinental: true };
    expect(computeTranscontinental(state, 'player2')).toBeNull();
  });
});
