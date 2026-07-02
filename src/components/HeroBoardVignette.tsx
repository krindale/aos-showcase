'use client';

/**
 * 홈 히어로 우측 — 움직이는 게임 샘플 비네트 (14초 루프, 4단계 시나리오).
 * ① 선로 건설: 네 회사의 노선이 시차를 두고 보드를 가로지른다
 * ② 상품 배송: 화물 큐브가 같은 색 도시로 교차 운행
 * ③ 도시화: 경유 마을 하나가 새 도시로 승격
 * ④ 총가동: 새 도시 포함 모든 노선에 화물이 동시에 오간다
 * 하단 캡션이 각 단계와 동기화되어 바뀐다. (SMIL — gameplay 다이어그램과 동일 문법)
 */

const R = 30; // 헥스 반지름
const W = Math.sqrt(3) * R; // pointy-top 헥스 폭
const OX = 26;
const OY = 38;

const cx = (col: number, row: number) => OX + col * W + (row % 2 ? W / 2 : 0);
const cy = (row: number) => OY + row * 1.5 * R;

const hexPoints = (x: number, y: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i + 30) * Math.PI) / 180;
    return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const CELLS: [number, number][] = [];
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 5; col++) CELLS.push([col, row]);
}

/* 지형 톤 배리에이션 (결정적 — hydration 안전) */
const hexFill = (col: number, row: number) => {
  const k = (col * 3 + row * 5) % 7;
  if (k === 1) return '#ece5d5'; // 산
  if (k === 4) return '#f0ebdf';
  return '#f6f2e9';
};

const center = ([c, r]: readonly [number, number]) => [cx(c, r), cy(r)] as const;

const pathD = (cells: readonly (readonly [number, number])[]) =>
  'M' + cells.map((cell) => center(cell).map((v) => v.toFixed(1)).join(' ')).join(' L');

const segLen = (cells: readonly (readonly [number, number])[]) => {
  let sum = 0;
  for (let i = 1; i < cells.length; i++) {
    const [x1, y1] = center(cells[i - 1]);
    const [x2, y2] = center(cells[i]);
    sum += Math.hypot(x2 - x1, y2 - y1);
  }
  return Math.ceil(sum) + 2;
};

/* 도시 4곳 (모서리) — 큐브는 같은 색 도시로 배송된다 */
const CITIES: { cell: [number, number]; color: string }[] = [
  { cell: [0, 0], color: '#6b3fa0' }, // 보라
  { cell: [4, 0], color: '#1e5aa8' }, // 파랑
  { cell: [0, 3], color: '#c41e3a' }, // 빨강
  { cell: [4, 3], color: '#d4a017' }, // 노랑
];

/* 마을 — (3,2)는 ③단계에서 도시로 승격 */
const TOWNS: [number, number][] = [
  [2, 1],
  [2, 3],
];
const URBAN_TOWN: [number, number] = [3, 2];

/* 네 갈래 노선 (odd-r 인접 체인) — ① 단계에서 시차 건설 */
const ROUTES: {
  cells: [number, number][];
  color: string;
  draw: [number, number];
}[] = [
  {
    // 빨강 도시 → 파랑 도시 (대각선)
    cells: [[0, 3], [1, 2], [1, 1], [2, 1], [3, 0], [4, 0]],
    color: '#c04a2b',
    draw: [0.02, 0.1],
  },
  {
    // 보라 도시 → 노랑 도시 (대각선, 첫 노선과 교차 · 승격 마을 경유)
    cells: [[0, 0], [0, 1], [1, 1], [2, 2], [3, 2], [3, 3], [4, 3]],
    color: '#2f6b4f',
    draw: [0.08, 0.17],
  },
  {
    // 빨강 도시 → 노랑 도시 (남부 횡단선)
    cells: [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3]],
    color: '#3a4a78',
    draw: [0.15, 0.23],
  },
  {
    // 파랑 도시 → 노랑 도시 (동부 종단선)
    cells: [[4, 0], [4, 1], [4, 2], [4, 3]],
    color: '#8a5a2b',
    draw: [0.21, 0.29],
  },
];

/* 큐브 운행: ②단계 순차 배송 → ④단계 동시 총가동 */
const CUBE_RUNS: {
  cells: readonly (readonly [number, number])[];
  color: string;
  t: [number, number];
}[] = [
  // ② 상품 배송
  { cells: ROUTES[0].cells, color: '#1e5aa8', t: [0.32, 0.43] },
  { cells: ROUTES[1].cells, color: '#d4a017', t: [0.39, 0.5] },
  { cells: [...ROUTES[2].cells].reverse(), color: '#c41e3a', t: [0.47, 0.57] },
  // ④ 총가동 (새 도시행 검정 큐브 포함)
  { cells: ROUTES[0].cells, color: '#1e5aa8', t: [0.74, 0.84] },
  { cells: [...ROUTES[1].cells].reverse(), color: '#6b3fa0', t: [0.76, 0.87] },
  { cells: ROUTES[3].cells, color: '#d4a017', t: [0.78, 0.87] },
  { cells: ROUTES[1].cells.slice(0, 5), color: '#2d2d2d', t: [0.81, 0.9] }, // → 새 도시
  { cells: [...ROUTES[2].cells].reverse(), color: '#c41e3a', t: [0.84, 0.93] },
];

/* 단계 캡션 (애니메이션과 동기화) */
const STEPS: { n: string; text: string; t: [number, number] }[] = [
  { n: '①', text: '선로 건설 — 네 회사가 도시를 잇는 노선을 깐다', t: [0, 0.31] },
  { n: '②', text: '상품 배송 — 화물은 같은 색 도시로, 링크 수만큼 소득', t: [0.31, 0.6] },
  { n: '③', text: '도시화 — 마을이 새 도시로 승격된다', t: [0.6, 0.73] },
  { n: '④', text: '총가동 — 새 도시까지, 모든 노선에 화물이 오간다', t: [0.73, 0.97] },
];

const DUR = '14s';
const WIPE = 0.97; // 이 시점에 전 노선이 지워지고 루프 재시작

export default function HeroBoardVignette() {
  const [ux, uy] = center(URBAN_TOWN);

  return (
    <div className="glass-panel rounded-[20px] p-6">
      <div className="mb-4 font-display text-[11px] font-medium tracking-[0.12em] text-foreground-muted">
        보드 미리보기 — 한 판의 흐름
      </div>

      <svg viewBox="0 0 292 254" className="block h-auto w-full">
        {/* 헥스 보드 */}
        <g stroke="#d9d1c1" strokeWidth="1">
          {CELLS.map(([col, row]) => (
            <polygon
              key={`${col}-${row}`}
              points={hexPoints(cx(col, row), cy(row), R - 1.5)}
              fill={hexFill(col, row)}
            />
          ))}
        </g>

        {/* ① 노선 건설 — 시차 드로잉, 루프 끝에 함께 지워진다 */}
        {ROUTES.map((route, i) => {
          const L = segLen(route.cells);
          return (
            <path
              key={i}
              d={pathD(route.cells)}
              fill="none"
              stroke={route.color}
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={L}
              strokeDashoffset={L}
            >
              <animate
                attributeName="stroke-dashoffset"
                values={`${L};${L};0;0;${L}`}
                keyTimes={`0;${route.draw[0]};${route.draw[1]};${WIPE};1`}
                dur={DUR}
                repeatCount="indefinite"
              />
            </path>
          );
        })}

        {/* 마을 */}
        {TOWNS.map(([c, r]) => (
          <circle
            key={`${c}-${r}`}
            cx={cx(c, r)}
            cy={cy(r)}
            r="6.5"
            fill="#fffdf8"
            stroke="#c9c1b1"
            strokeWidth="2.5"
          />
        ))}

        {/* ③ 승격 마을 → 새 도시 */}
        <circle cx={ux} cy={uy} fill="#fffdf8" strokeWidth="3" r="6.5" stroke="#c9c1b1">
          <animate attributeName="r" values="6.5;6.5;11;11;6.5" keyTimes="0;0.62;0.67;0.97;1" dur={DUR} repeatCount="indefinite" />
          <animate
            attributeName="stroke"
            values="#c9c1b1;#c9c1b1;#4a4640;#4a4640;#c9c1b1"
            keyTimes="0;0.62;0.67;0.97;1"
            dur={DUR}
            repeatCount="indefinite"
          />
        </circle>
        <circle cx={ux} cy={uy} r="17" fill="none" stroke="#4a4640" strokeWidth="1.5" strokeDasharray="3 4" opacity="0">
          <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.61;0.64;0.7;0.73;1" dur={DUR} repeatCount="indefinite" />
        </circle>

        {/* 도시 */}
        {CITIES.map((city) => {
          const [x, y] = center(city.cell);
          return <circle key={city.color} cx={x} cy={y} r="12" fill="#fffdf8" stroke={city.color} strokeWidth="3.5" />;
        })}

        {/* ②·④ 상품 큐브 운행 */}
        {CUBE_RUNS.map((run, i) => {
          const [t0, t1] = run.t;
          return (
            <rect key={i} x="-6.5" y="-6.5" width="13" height="13" rx="3" fill={run.color} opacity="0">
              <animateMotion
                path={pathD(run.cells)}
                keyPoints="0;0;1;1"
                keyTimes={`0;${t0};${t1};1`}
                calcMode="linear"
                dur={DUR}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;0;1;1;0;0"
                keyTimes={`0;${t0};${(t0 + 0.012).toFixed(3)};${(t1 - 0.012).toFixed(3)};${t1};1`}
                dur={DUR}
                repeatCount="indefinite"
              />
            </rect>
          );
        })}

        {/* 단계 캡션 (하단, 애니메이션 동기화) */}
        <line x1="8" y1="224" x2="284" y2="224" stroke="#ebe6dc" strokeWidth="1" />
        {STEPS.map((step, i) => {
          const [t0, t1] = step.t;
          const fadeIn = i === 0 ? 0.015 : t0 + 0.015;
          return (
            <g key={step.n} opacity="0">
              <animate
                attributeName="opacity"
                values={i === 0 ? '1;1;0;0' : '0;0;1;1;0;0'}
                keyTimes={
                  i === 0
                    ? `0;${(t1 - 0.015).toFixed(3)};${t1};1`
                    : `0;${t0};${fadeIn.toFixed(3)};${(t1 - 0.015).toFixed(3)};${t1};1`
                }
                dur={DUR}
                repeatCount="indefinite"
              />
              <text x="10" y="246" fontFamily="IBM Plex Sans KR" fontSize="12.5" fill="#6e6a61">
                <tspan fill="#c04a2b" fontWeight="700">
                  {step.n}{' '}
                </tspan>
                {step.text}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
