'use client';

import { hexToPixel, getHexPoints, getNeighborHex, HEX_SIZE, CompletedLink } from '@/utils/hexGrid';
import { PLAYER_COLORS, HexCoord, PlayerId, PlayerState, TrackTile } from '@/types/game';

// 트랙 레이어 — 트랙 타일(레일+침목), 소유자 마커, 완성 링크 마커, 끊어진 연결 경고.
// GameBoard에서 그대로 이동한 순수 렌더 (게임 로직 없음, 계산값은 props로 주입).

export interface TrackPathCacheEntry {
  pathData: string;
  ties: { x: number; y: number; angle: number }[];
  secondaryPathData: string | null;
  secondaryTies: { x: number; y: number; angle: number }[];
}

interface BoardTracksProps {
  trackTiles: TrackTile[];
  players: Record<PlayerId, PlayerState>;
  currentPlayer: PlayerId;
  currentTurn: number;
  /** currentPhase === 'buildTrack' */
  isBuildPhase: boolean;
  /** ui.buildMode === 'idle' */
  isBuildModeIdle: boolean;
  isFlat: boolean;
  /** terrainColors.plain — 레일 안쪽 색 (맵 데이터에 없으면 undefined, 원본 동작 유지) */
  plainColor: string | undefined;
  trackPathCache: Map<string, TrackPathCacheEntry>;
  completedLinks: CompletedLink[];
  disconnectedConnections: { from: HexCoord; to: HexCoord; fromEdge: number; toEdge: number }[];
  /** 이 트랙 경로가 완성 링크에 속하는지 — 복합 타일은 기본(P)/보조(S)를 따로 물어야 한다 */
  isTrackInCompletedLink: (coord: HexCoord, kind?: 'P' | 'S') => boolean;
  canRedirect: (coord: HexCoord) => boolean;
  selectTrackToRedirect: (coord: HexCoord) => void;
  onHexClick: (coord: HexCoord) => void;
}

export default function BoardTracks({
  trackTiles,
  players,
  currentPlayer,
  currentTurn,
  isBuildPhase,
  isBuildModeIdle,
  isFlat,
  plainColor,
  trackPathCache,
  completedLinks,
  disconnectedConnections,
  isTrackInCompletedLink,
  canRedirect,
  selectTrackToRedirect,
  onHexClick,
}: BoardTracksProps) {
  return (
    <>
      {/* 트랙 타일 */}
      {trackTiles.map((tile) => {
        const { x, y } = hexToPixel(tile.coord.col, tile.coord.row, undefined, undefined, undefined, isFlat);
        // 캐시에서 경로 데이터 가져오기 (계산 비용 절감)
        const cached = trackPathCache.get(tile.id);
        const pathData = cached?.pathData ?? '';
        const ties = cached?.ties ?? [];
        // 정부 트랙(Montréal)은 다크 그레이로 통일 — 중립(수입 없음)을 한눈에 구분 (순검정은 게임 톤과 부조화)
        const ownerColor = tile.owner ? PLAYER_COLORS[players[tile.owner].color] : tile.isGovernment ? '#4E4D46' : '#888';

        // 복합 트랙인 경우 두 번째 경로도 렌더링
        const hasSecondary = tile.trackType !== 'simple' && tile.secondaryEdges;
        const secondaryPathData = cached?.secondaryPathData ?? null;
        const secondaryTies = cached?.secondaryTies ?? [];
        const secondaryOwnerColor = hasSecondary && tile.secondaryOwner
          ? PLAYER_COLORS[players[tile.secondaryOwner].color]
          : '#888';

        // 방향 전환 가능 여부 확인
        const isRedirectable = isBuildPhase && canRedirect(tile.coord);
        // 미소유(디스크 빠진) 트랙 — 룰 IV: 새 타일로 연장하면 소유권 인수 가능.
        // 완성 링크 소속(파산 잔재) 여부는 selectSourceHex의 isValidConnectionPoint가 걸러준다.
        const isUnownedClaimable = tile.owner === null && !tile.isGovernment;
        // 복합 타일의 두 번째 경로(secondary)도 내 트랙이다 — 그 끝에서 이어 지으려면
        // 연결점으로 선택할 수 있어야 한다 (2026-07-29 사용자 보고: 교차/공존으로 놓은
        // 트랙 끝에서 이어 짓기가 안 됨)
        const isMineHere = tile.owner === currentPlayer || tile.secondaryOwner === currentPlayer;
        const isTrackClickable = isBuildPhase && (
          isMineHere || isUnownedClaimable || isRedirectable
        );

        // 트랙 클릭 핸들러 (연결점 선택 우선, 방향 전환은 Shift+클릭)
        const handleTrackClick = (e: React.MouseEvent) => {
          if (!isTrackClickable) return;

          // 내 트랙·인수 가능한 미소유 트랙: 일반 클릭 = 연결점 선택(이어 짓기 — 미소유는 연장 시
          // 소유권 인수), Shift+클릭 = 방향 전환. (과거엔 미소유 트랙 클릭이 무조건 방향 전환으로
          // 갔음 — 연장 인수가 없던 시절의 라우팅이라 룰 정합 수정에서 내 트랙과 동일하게 통일)
          if (isMineHere || isUnownedClaimable) {
            if (e.shiftKey && isRedirectable && isBuildModeIdle) {
              // Shift+클릭: 방향 전환 모드
              selectTrackToRedirect(tile.coord);
            } else {
              // 일반 클릭: 연결점으로 선택 (이어 짓기)
              onHexClick(tile.coord);
            }
            return;
          }

          // 그 외 방향 전환만 가능한 트랙
          if (isRedirectable && isBuildModeIdle) {
            selectTrackToRedirect(tile.coord);
          }
        };

        return (
          <g key={tile.id}>
            {/* 방향 전환 가능한 트랙 배경 하이라이트 */}
            {isRedirectable && isBuildModeIdle && (
              <circle
                cx={x}
                cy={y}
                r={HEX_SIZE - 8}
                fill="rgba(255, 165, 0, 0.15)"
                stroke="#ffa500"
                strokeWidth="2"
                strokeDasharray="4 2"
                className="cursor-pointer"
                onClick={(e) => handleTrackClick(e)}
              />
            )}

            {/* 첫 번째 레일 (기본) */}
            <path
              d={pathData}
              fill="none"
              stroke="#3A3A32"
              strokeWidth="12"
              strokeLinecap="round"
              shapeRendering="geometricPrecision"
              className={isTrackClickable ? 'cursor-pointer' : ''}
              onClick={(e) => handleTrackClick(e)}
              style={{ pointerEvents: isTrackClickable ? 'auto' : 'none' }}
            />
            <path
              d={pathData}
              fill="none"
              stroke={tile.isGovernment ? '#4E4D46' : plainColor}
              strokeWidth="6"
              strokeLinecap="round"
              shapeRendering="geometricPrecision"
              className={isTrackClickable ? 'cursor-pointer' : ''}
              onClick={(e) => handleTrackClick(e)}
              style={{ pointerEvents: isTrackClickable ? 'auto' : 'none' }}
            />
            {/* 첫 번째 침목 */}
            {ties.map((tie, i) => (
              <line
                key={`tie-${tile.id}-${i}`}
                x1={tie.x - 8 * Math.cos((tie.angle + 90) * Math.PI / 180)}
                y1={tie.y - 8 * Math.sin((tie.angle + 90) * Math.PI / 180)}
                x2={tie.x + 8 * Math.cos((tie.angle + 90) * Math.PI / 180)}
                y2={tie.y + 8 * Math.sin((tie.angle + 90) * Math.PI / 180)}
                stroke="#4A4A42"
                strokeWidth="3"
                strokeLinecap="round"
                shapeRendering="crispEdges"
                style={{ pointerEvents: 'none' }}
              />
            ))}

            {/* 복합 트랙: 두 번째 레일 */}
            {hasSecondary && secondaryPathData && (
              <>
                {/* 교차(crossing)인 경우 다리 효과 표시 */}
                {tile.trackType === 'crossing' && (
                  <path
                    d={secondaryPathData}
                    fill="none"
                    stroke="#2A2A22"
                    strokeWidth="16"
                    strokeLinecap="round"
                    shapeRendering="geometricPrecision"
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                <path
                  d={secondaryPathData}
                  fill="none"
                  stroke="#3A3A32"
                  strokeWidth="12"
                  strokeLinecap="round"
                  shapeRendering="geometricPrecision"
                  style={{ pointerEvents: 'none' }}
                />
                <path
                  d={secondaryPathData}
                  fill="none"
                  stroke={plainColor}
                  strokeWidth="6"
                  strokeLinecap="round"
                  shapeRendering="geometricPrecision"
                  style={{ pointerEvents: 'none' }}
                />
                {/* 두 번째 침목 */}
                {secondaryTies.map((tie, i) => (
                  <line
                    key={`tie2-${tile.id}-${i}`}
                    x1={tie.x - 8 * Math.cos((tie.angle + 90) * Math.PI / 180)}
                    y1={tie.y - 8 * Math.sin((tie.angle + 90) * Math.PI / 180)}
                    x2={tie.x + 8 * Math.cos((tie.angle + 90) * Math.PI / 180)}
                    y2={tie.y + 8 * Math.sin((tie.angle + 90) * Math.PI / 180)}
                    stroke="#4A4A42"
                    strokeWidth="3"
                    strokeLinecap="round"
                    shapeRendering="crispEdges"
                    style={{ pointerEvents: 'none' }}
                  />
                ))}
              </>
            )}

            {/* 헥스 외곽선 재묘사 — 레일(12px)이 얇은 헥스 테두리를 덮어 "지워진" 듯 보이는
                것 방지. 타일마다 자기 헥스 변을 레일 위에 다시 그려 그리드가 항상 또렷하게. */}
            <polygon
              points={getHexPoints(x, y, HEX_SIZE, isFlat)}
              fill="none"
              stroke="#2D4A2D"
              strokeWidth={0.5}
              style={{ pointerEvents: 'none' }}
            />

            {/* 이번 턴에 건설한 트랙 표시 (턴이 끝나면 사라짐) — 누적 트랙과 구분용 */}
            {tile.builtTurn === currentTurn && (
              <polygon
                points={getHexPoints(x, y, HEX_SIZE - 6, isFlat)}
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                strokeDasharray="5 4"
                opacity="0.85"
                style={{ pointerEvents: 'none' }}
              />
            )}

            {/* 소유자 마커 - 미완성 트랙에만 표시. 파산으로 공용화된(owner null) 트랙은
                소유 디스크를 제거하므로 마커를 그리지 않음 (룰: 파산 미완성 트랙 디스크 제거) */}
            {!isTrackInCompletedLink(tile.coord) && tile.owner !== null && (
              <circle
                cx={x}
                cy={y}
                r="7"
                fill={ownerColor}
                stroke={isRedirectable && isBuildModeIdle ? '#ffa500' : '#1a1a1a'}
                strokeWidth={isRedirectable && isBuildModeIdle ? 2 : 1.5}
                className={isTrackClickable ? 'cursor-pointer' : ''}
                onClick={(e) => handleTrackClick(e)}
                style={{ pointerEvents: isTrackClickable ? 'auto' : 'none' }}
              />
            )}
            {/* 복합 트랙: 두 번째 소유자 마커 (미완성 트랙에만).
                ⚠️ onClick/pointerEvents 필수 — SVG 기본값이 pointerEvents:auto라, 둘 다
                없으면 이 원이 클릭을 삼키고 아무 일도 안 한다(내 복합 트랙 끝에서 이어
                짓기가 "클릭이 안 먹는" 것으로 보이던 원인, 2026-07-29 사용자 보고). */}
            {!isTrackInCompletedLink(tile.coord, 'S') && hasSecondary && tile.secondaryOwner && (
              <circle
                cx={x + 10}
                cy={y - 10}
                r="5"
                fill={secondaryOwnerColor}
                stroke="#1a1a1a"
                strokeWidth="1"
                className={isTrackClickable ? 'cursor-pointer' : ''}
                onClick={(e) => handleTrackClick(e)}
                style={{ pointerEvents: isTrackClickable ? 'auto' : 'none' }}
              />
            )}
          </g>
        );
      })}

      {/* 정부 완성 링크 마커 (Montréal) — findCompletedLinks는 owner 있는 링크만 다루므로
          정부 타일(isGovernment, owner null)을 변 인접으로 묶어 링크마다 중립 마커 1개를 올린다
          (원본 룰: 정부 링크는 미사용 색 마커로 표시). */}
      {(() => {
        const govTiles = trackTiles.filter(
          (t) => t.isGovernment && isTrackInCompletedLink(t.coord)
        );
        if (govTiles.length === 0) return null;
        const key = (c: HexCoord) => `${c.col},${c.row}`;
        const byKey = new Map(govTiles.map((t) => [key(t.coord), t]));
        const seen = new Set<string>();
        const groups: TrackTile[][] = [];
        for (const t of govTiles) {
          if (seen.has(key(t.coord))) continue;
          const group: TrackTile[] = [];
          const stack = [t];
          seen.add(key(t.coord));
          while (stack.length) {
            const cur = stack.pop()!;
            group.push(cur);
            // 변 인접(마주보는 변) 정부 타일 = 같은 링크 (정거장을 사이에 두면 끊김 = 다른 링크)
            for (const e of cur.edges) {
              const nb = getNeighborHex(cur.coord, e);
              const cand = byKey.get(key(nb));
              if (!cand || seen.has(key(nb))) continue;
              if (cand.edges.includes((e + 3) % 6)) {
                seen.add(key(nb));
                stack.push(cand);
              }
            }
          }
          groups.push(group);
        }
        return groups.map((group, gi) => {
          const mid = group[Math.floor(group.length / 2)];
          const c = hexToPixel(mid.coord.col, mid.coord.row, undefined, undefined, undefined, isFlat);
          return (
            <circle
              key={`gov-link-${gi}-${key(mid.coord)}`}
              cx={c.x}
              cy={c.y}
              r="8"
              fill="#4E4D46"
              stroke="#1a1a1a"
              strokeWidth="2"
              style={{ pointerEvents: 'none' }}
            />
          );
        });
      })()}

      {/* 완성된 링크 소유 마커 - 링크 중앙에 하나만 표시 */}
      {completedLinks.map((link) => {
        const ownerColor = PLAYER_COLORS[players[link.owner].color];
        // centerPosition은 pointy 기준 좌표 — flat 맵에서도 맞도록 중간 타일에서 재계산
        const midTile = link.trackTiles[Math.floor(link.trackTiles.length / 2)];
        const center = midTile
          ? hexToPixel(midTile.col, midTile.row, undefined, undefined, undefined, isFlat)
          : link.centerPosition;
        return (
          <circle
            key={link.id}
            cx={center.x}
            cy={center.y}
            r="8"
            fill={ownerColor}
            stroke="#1a1a1a"
            strokeWidth="2"
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {/* 끊어진 트랙 연결 경고 표시 */}
      {disconnectedConnections.map((conn, index) => {
        const { x: x1, y: y1 } = hexToPixel(conn.from.col, conn.from.row, undefined, undefined, undefined, isFlat);
        const { x: x2, y: y2 } = hexToPixel(conn.to.col, conn.to.row, undefined, undefined, undefined, isFlat);

        // 두 트랙 중간 지점
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        return (
          <g key={`disconn-${index}`} style={{ pointerEvents: 'none' }}>
            {/* 끊어진 연결 표시 - 빨간색 X */}
            <circle
              cx={midX}
              cy={midY}
              r="12"
              fill="rgba(220, 38, 38, 0.8)"
              stroke="#fff"
              strokeWidth="2"
            />
            <text
              x={midX}
              y={midY + 4}
              textAnchor="middle"
              fontSize="14"
              fontWeight="bold"
              fill="#fff"
            >
              ✗
            </text>
            {/* 호버 시 정보 표시 */}
            <title>
              트랙 연결 끊김: ({conn.from.col},{conn.from.row}) edge{conn.fromEdge} ↔ ({conn.to.col},{conn.to.row}) edge{conn.toEdge}
            </title>
          </g>
        );
      })}
    </>
  );
}
