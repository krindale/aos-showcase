// Southern England 특수룰 store 테스트
// 정본: AOSD Vol IV "England" + southern-england-v2 시트 인쇄문
//  ① 셋업: North West 큐브 3 / 그 외 도시 2 / 신도시 B 제거
//  ② London 파랑 대체: 셋업·물품 성장에서 파란 큐브가 London에 놓이려 하면 주사위 1-4 NW / 5-6 NE
//  ③ 물품 디스플레이 50칸 (B 열 없음)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { getMapProfile } from '@/maps/getMapProfile';
import { MapId } from '@/maps/MapId';

const PLAYER_NAMES = ['A', 'B', 'C', 'D', 'E'];
const AI_NONE: { playerIndex: number; name: string }[] = [];

function initEngland() {
  useGameStore.getState().initGame('southern-england', PLAYER_NAMES, AI_NONE);
  return useGameStore.getState();
}

describe('Southern England 특수룰', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); vi.restoreAllMocks(); });

  it('프로파일: 5~6인, 5인 7턴/6인 6턴, 신도시 B 제외', () => {
    const p = getMapProfile(MapId.SouthernEngland);
    expect(p.supportedPlayers).toEqual([5, 6]);
    expect(p.turnsByPlayers?.[5]).toBe(7);
    expect(p.turnsByPlayers?.[6]).toBe(6);
    expect(p.availableNewCityTiles).toEqual(['A', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(p.cityCubeCounts.northwest).toBe(3);
  });

  it('redirectCubePlacement: London의 파랑만 주사위 1-4 → NW / 5-6 → NE', () => {
    const p = getMapProfile(MapId.SouthernEngland);
    // 주사위 1 (rand→0) = NW
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(p.redirectCubePlacement('london', 'blue')).toBe('northwest');
    // 주사위 6 (rand→0.99) = NE
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(p.redirectCubePlacement('london', 'blue')).toBe('northeast');
    // 파랑이 아니거나 London이 아니면 그대로
    expect(p.redirectCubePlacement('london', 'red')).toBe('london');
    expect(p.redirectCubePlacement('bristol', 'blue')).toBe('bristol');
  });

  it('셋업: NW 3개+대체분, 총 큐브 25개 유지, London에 파랑 없음, B 타일 없음, 디스플레이 50칸', () => {
    // 여러 시드로 반복 — 어떤 무작위 뽑기에서도 London에 파랑이 남지 않아야 한다
    for (let i = 0; i < 10; i++) {
      const s = initEngland();
      const cities = s.board.cities;
      const nw = cities.find(c => c.id === 'northwest')!;
      const london = cities.find(c => c.id === 'london')!;

      expect(s.maxTurns).toBe(7); // 5인 디폴트
      // NW는 기본 3개 (+London 파랑 대체분이 올 수 있음)
      expect(nw.cubes.length).toBeGreaterThanOrEqual(3);
      // London은 기본 2개에서 대체로 빠질 수만 있음 + 파랑 절대 없음
      expect(london.cubes.length).toBeLessThanOrEqual(2);
      expect(london.cubes.includes('blue')).toBe(false);
      // 대체는 이동일 뿐 — 도시 위 총 큐브는 3 + 11×2 = 25개 그대로
      expect(cities.reduce((sum, c) => sum + c.cubes.length, 0)).toBe(25);
      // 신도시 B는 게임에서 제거
      expect(s.newCityTiles.some(t => t.id === 'B')).toBe(false);
      expect(s.newCityTiles).toHaveLength(7);
      // 디스플레이 50칸 (B 열 없음)
      expect(s.goodsDisplay.slots).toHaveLength(50);
    }
  });

  it('물품 성장: London 열의 파랑은 London 대신 NW/NE로 (주사위 5)', () => {
    const s = initEngland();
    // London 열은 매핑 순서상 9번째 열 — 시작 인덱스 8×3 = 24
    const slots = [...s.goodsDisplay.slots];
    slots[24] = 'blue';
    useGameStore.setState({
      goodsDisplay: { ...s.goodsDisplay, slots },
      goodsGrowthEvent: null,
    });

    const before = useGameStore.getState();
    const nwBefore = before.board.cities.find(c => c.id === 'northwest')!.cubes.filter(c => c === 'blue').length;
    const londonBefore = before.board.cities.find(c => c.id === 'london')!.cubes.length;

    // 대체 주사위를 1로 고정(rand→0) → NW로
    vi.spyOn(Math, 'random').mockReturnValue(0);
    useGameStore.getState().growGoods([5]); // 주사위 5 = London(라이트)·North East(다크) 열 성장

    const after = useGameStore.getState();
    const london = after.board.cities.find(c => c.id === 'london')!;
    const nw = after.board.cities.find(c => c.id === 'northwest')!;
    // London은 늘지 않았고(파랑이 대체됨), NW에 파랑이 +1
    expect(london.cubes.length).toBe(londonBefore);
    expect(london.cubes.includes('blue')).toBe(false);
    expect(nw.cubes.filter(c => c === 'blue').length).toBe(nwBefore + 1);
    // 열에서는 빠졌다
    expect(after.goodsDisplay.slots[24]).toBeNull();
  });

  it('물품 성장: London 열의 비파랑 큐브는 정상적으로 London에 놓인다', () => {
    const s = initEngland();
    const slots = [...s.goodsDisplay.slots];
    slots[24] = 'red';
    useGameStore.setState({
      goodsDisplay: { ...s.goodsDisplay, slots },
      goodsGrowthEvent: null,
    });
    const londonBefore = useGameStore.getState().board.cities.find(c => c.id === 'london')!.cubes.length;
    useGameStore.getState().growGoods([5]);
    const london = useGameStore.getState().board.cities.find(c => c.id === 'london')!;
    expect(london.cubes.length).toBe(londonBefore + 1);
    expect(london.cubes.includes('red')).toBe(true);
  });
});
