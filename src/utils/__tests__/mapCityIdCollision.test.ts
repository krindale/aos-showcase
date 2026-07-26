/**
 * 전 맵 무결성: 도시·마을 id는 신도시 타일 id(A~H)와 겹치면 안 된다 (2026-07-26)
 *
 * 신도시는 배치 시 "타일 id = 도시 id"로 cities에 추가되므로, 맵 원본 도시가 같은 id를
 * 쓰면 ① placeNewCity 중복 배치 오탐 ② cities.find(c => c.id === ...) 첫 매치 혼선
 * (큐브 선택·성장 열 매칭이 엉뚱한 도시를 잡음) ③ React 중복 key가 생긴다.
 * 실제 사례: 튜토리얼 Cleveland가 'C'여서 타일 C가 영구 배치 불가였다 → 'CLE'로 개명.
 * 새 맵 추가 시 이 테스트가 충돌을 잡는다.
 */
import { describe, it, expect } from 'vitest';
import { MapId } from '@/maps/MapId';
import { getMapData } from '@/utils/mapRegistry';
import { NEW_CITY_TILES } from '@/types/game';

const TILE_IDS = new Set<string>(NEW_CITY_TILES.map((t) => t.id)); // A~H

// Barbados는 맵 데이터 미구현(레지스트리 폴백) — 구현 시 자동 포함되도록 목록은 enum 순회
const MAP_IDS = Object.values(MapId).filter((id) => getMapData(id).id === id);

describe('맵 도시/마을 id ↔ 신도시 타일 id 충돌 금지', () => {
  it.each(MAP_IDS.map((id) => [id]))('%s', (mapId) => {
    const data = getMapData(mapId);
    const collisions = [
      ...data.cities.filter((c) => TILE_IDS.has(c.id)).map((c) => `city:${c.id}(${c.name})`),
      ...data.towns.filter((t) => TILE_IDS.has(t.id)).map((t) => `town:${t.id}`),
    ];
    expect(collisions, `신도시 타일 id(A~H)와 충돌: ${collisions.join(', ')}`).toEqual([]);
  });

  it('맵 데이터가 있는 맵이 최소 9개 이상 검사된다 (레지스트리 폴백 누락 방지)', () => {
    expect(MAP_IDS.length).toBeGreaterThanOrEqual(9);
  });
});
