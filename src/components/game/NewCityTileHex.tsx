import { City, CityColor, PlayerId, PlayerState } from '@/types/game';
import { hexToPixel, HEX_SIZE, HEX_HORIZONTAL_RADIUS } from '@/utils/hexGrid';
import { getMapData } from '@/utils/mapRegistry';
import { getMapProfile } from '@/maps/getMapProfile';
import BoardCities from './board/BoardCities';

const NOOP = () => {};
const EMPTY_PLAYERS = {} as Record<PlayerId, PlayerState>;

/**
 * 신규 도시(도시화) 타일 미리보기 — 실제 보드 렌더(BoardCities)를 그대로 재사용한다.
 * mock 신도시 City 하나를 넣어 실제 보드와 100% 동일한 헥스·라벨·크기로 그린다.
 */
export function NewCityTileHex({
  colorKey,
  id,
  mapId,
  size = 96,
}: {
  colorKey: CityColor;
  id: string;
  mapId: string;
  /** 표시 폭(px) — 기본은 보드 헥스 원본 크기(1:1) */
  size?: number;
}) {
  const isFlat = getMapData(mapId).orientation === 'flat';
  const mapProfile = getMapProfile(mapId);

  // 실제 보드 도시 하나만 렌더 (아직 배치 전이라 큐브 없음, 상호작용 없음)
  const mockCity: City = { id, name: 'New City', coord: { col: 0, row: 0 }, color: colorKey, cubes: [] };

  // 헥스 중심 픽셀 + bounding box → viewBox
  const { x, y } = hexToPixel(0, 0, undefined, undefined, undefined, isFlat);
  const pad = 4;
  const halfW = (isFlat ? HEX_SIZE : HEX_HORIZONTAL_RADIUS) + pad;
  const halfH = (isFlat ? HEX_HORIZONTAL_RADIUS : HEX_SIZE) + pad;
  const vbW = 2 * halfW;
  const vbH = 2 * halfH;

  return (
    <svg
      width={size}
      height={size * (vbH / vbW)}
      viewBox={`${x - halfW} ${y - halfH} ${vbW} ${vbH}`}
      aria-label={`신규 도시 타일 ${id}`}
    >
      <BoardCities
        cities={[mockCity]}
        dynamicCityColors={false}
        cottonPorts={undefined}
        directLinks={undefined}
        players={EMPTY_PLAYERS}
        currentPhase="buildTrack"
        isFlat={isFlat}
        cityDiceNumber={{}}
        isCityNumberBoxBlack={(cid, dc) => mapProfile.isCityNumberBoxBlack(cid, dc)}
        sourceHex={null}
        reachableDestinations={[]}
        selectedCube={null}
        onHexClick={NOOP}
        selectDestinationCity={NOOP}
        onCubeClick={NOOP}
        buildDirectLink={NOOP}
      />
    </svg>
  );
}
