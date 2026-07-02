'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Play, X } from 'lucide-react';

const basePath = process.env.NODE_ENV === 'production' ? '/aos-showcase' : '';

type Difficulty = '입문' | '표준' | '중급' | '고급';

const DIFF_COLOR: Record<Difficulty, string> = {
  입문: '#8a857c',
  표준: '#c04a2b',
  중급: '#2f6b4f',
  고급: '#3a4a78',
};

type MapEntry = {
  slug: string;
  name: string;
  nameKo: string;
  players: string;
  turns: string;
  diff: Difficulty;
  image: string | null;
  description: string;
  rules: string[];
  playable: boolean;
};

const maps: MapEntry[] = [
  {
    slug: 'tutorial',
    name: 'Tutorial',
    nameKo: '튜토리얼',
    players: '2',
    turns: '10턴',
    diff: '입문',
    image: null,
    description: '규칙을 익히기 위한 2인 학습용 맵. AI와 함께 주식·경매·건설·배송의 한 사이클을 처음부터 끝까지 체험합니다.',
    rules: [
      '2인 학습용 — 룰북 기본 규칙 그대로',
      '도시 4곳 + 마을 1곳(Wheeling)의 축소 보드',
      '주식·경매·건설·배송·물품 성장까지 전체 사이클 체험',
    ],    playable: true,
  },
  {
    slug: 'rust-belt',
    name: 'Rust Belt',
    nameKo: '러스트 벨트',
    players: '5',
    turns: '7턴',
    diff: '표준',
    image: '/maps/rust-belt.webp',
    description: '미국 북동부 산업 지대를 배경으로 한 기본 맵. 오대호와 산악, 두 강을 낀 5인 대결입니다.',
    rules: [
      '5인 전용 · 7턴, 룰북 기본 규칙',
      'Pittsburgh·Wheeling은 초기 물품 3개',
      '오대호 헥스에는 트랙 건설 불가',
    ],    playable: true,
  },
  {
    slug: 'korea',
    name: 'Korea',
    nameKo: '한국',
    players: '4',
    turns: '8턴',
    diff: '고급',
    image: '/maps/korea.webp',
    description: '도시 색이 고정되지 않고 현재 놓인 큐브에 따라 수요가 바뀌는 독특한 맵. 평양에서 부산까지 한반도를 잇습니다.',
    rules: [
      '도시 수요색 = 현재 놓인 큐브색 — 같은 색 물품이 있는 도시로만 배달',
      '수원–서울 / 수원–인천 직결 링크 $2',
      '신도시는 회색 취급, 도시화 시 물품 디스플레이 큐브 2개를 가져옴',
      '평양·수원은 물품 성장 없음',
    ],    playable: true,
  },
  {
    slug: 'western-us',
    name: 'Western U.S.',
    nameKo: '서부 미국',
    players: '6',
    turns: '6턴',
    diff: '고급',
    image: '/maps/western-us.webp',
    description: '태평양에서 미시시피까지 횡단하는 6인전. 험준한 산맥·늪, 동서 배달 보너스와 대륙횡단 보너스가 특징입니다.',
    rules: [
      '첫 건설은 서부·동부 시작 도시에서만 (Denver·Salt Lake City 제외)',
      '동↔서 배달 +$1 · 대륙횡단 최초 연결 보너스 $4/$2',
      '늪·강 $4, 산 $5 — 모든 마을에 물품 큐브 1개',
      '시작 현금 $20, 대륙횡단 전까지 내 트랙은 연속이어야 함',
    ],    playable: true,
  },
  {
    slug: 'germany',
    name: 'Germany',
    nameKo: '독일',
    players: '4',
    turns: '8턴',
    diff: '중급',
    image: '/maps/germany.webp',
    description: '외국 터미널과 헥스별 고정 건설비용, 도시 직결 링크가 있는 산업 혁명기의 독일 4인전입니다.',
    rules: [
      '외국 터미널 6곳 — 지정된 색만 수용, 통과 불가',
      '헥스별 고정 건설비용 ($6~$12)',
      'Engineer = 트랙 1개를 절반 비용으로, 미완성 링크 건설 금지',
      'Berlin은 매 턴 물품 1개 보충 · Essen↔Düsseldorf 직결 $2',
    ],    playable: true,
  },
  {
    slug: 'st-lucia',
    name: 'St. Lucia',
    nameKo: '세인트루시아',
    players: '2',
    turns: '8턴',
    diff: '중급',
    image: '/maps/st-lucia.webp',
    description: '2인 전용 대결 맵. 시작 도시가 없어 도시화 경쟁부터 시작하는, 작은 섬 위의 치열한 1:1 수싸움입니다.',
    rules: [
      '2인 전용 · 8턴 — 경매 대신 교대 선공권($5)',
      '시작 도시 없음: 1턴 도시화 경쟁으로 시작',
      '트랙 건설 시 헥스 큐브가 트랙 위로 — 미완성 링크로도 배달 가능',
      '물품 성장 단계 생략, Production·Turn Order 액션 사용 불가',
    ],    playable: true,
  },
  {
    slug: 'barbados',
    name: 'Barbados',
    nameKo: '바베이도스',
    players: '1',
    turns: '10턴',
    diff: '중급',
    image: '/maps/barbados.webp',
    description: '1인 전용 솔로 맵. 작은 섬에서 모든 주식을 되사는 것을 목표로 하는 최적화 퍼즐입니다.',
    rules: [
      '1인 솔로 전용 · 10턴',
      '턴당 주식 1주만 발행 가능',
      '게임 종료 시 현금으로 전 주식($5)을 환매하지 못하면 패배',
    ],    playable: false,
  },
];

/* ── 튜토리얼 미니맵 (실제 맵 배치: P/C/O/I 도시 + Wheeling 마을 + 우측 호수) ── */

const MR = 30; // 헥스 반지름
const MW = Math.sqrt(3) * MR;
const MOX = 34;
const MOY = 38;
const mcx = (col: number, row: number) => MOX + col * MW + (row % 2 ? MW / 2 : 0);
const mcy = (row: number) => MOY + row * 1.5 * MR;

const miniHexPoints = (x: number, y: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i + 30) * Math.PI) / 180;
    return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const TUTORIAL_CITIES: {
  col: number;
  row: number;
  label: string;
  name: string;
  color: string;
  namePos: 'above' | 'below';
}[] = [
  { col: 0, row: 0, label: 'P', name: 'Pittsburgh', color: '#c41e3a', namePos: 'below' },
  { col: 4, row: 0, label: 'C', name: 'Cleveland', color: '#1e5aa8', namePos: 'below' },
  { col: 2, row: 2, label: 'O', name: 'Columbus', color: '#d4a017', namePos: 'below' },
  { col: 0, row: 4, label: 'I', name: 'Cincinnati', color: '#6b3fa0', namePos: 'above' },
];
const TUTORIAL_TOWN = { col: 4, row: 3, name: 'Wheeling' }; // Wheeling
const TUTORIAL_LAKES = new Set(['5,0', '5,1', '5,2', '5,3']);

/** 크림 배경 위에서도 읽히는 이름 라벨 (흰 테두리 halo) */
function NameLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill="#1c1b18"
      stroke="#fffdf8"
      strokeWidth="3.5"
      strokeLinejoin="round"
      style={{ paintOrder: 'stroke' }}
      fontFamily="Space Grotesk"
      fontSize="12"
      fontWeight="700"
    >
      {text}
    </text>
  );
}

function TutorialMiniMap() {
  const cells: [number, number][] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 6; col++) cells.push([col, row]);
  }
  const isCity = (c: number, r: number) =>
    TUTORIAL_CITIES.some((city) => city.col === c && city.row === r);
  const townX = mcx(TUTORIAL_TOWN.col, TUTORIAL_TOWN.row);
  const townY = mcy(TUTORIAL_TOWN.row);

  return (
    <svg viewBox="0 0 384 262" className="h-full w-full" style={{ background: '#E9E2CB' }}>
      {cells.map(([col, row]) => {
        if (isCity(col, row)) return null;
        const lake = TUTORIAL_LAKES.has(`${col},${row}`);
        return (
          <polygon
            key={`${col}-${row}`}
            points={miniHexPoints(mcx(col, row), mcy(row), MR - 1)}
            fill={lake ? '#E9E2CB' : '#8DB36A'}
            stroke={lake ? '#DED5B8' : '#6B5B3A'}
            strokeOpacity={lake ? 1 : 0.35}
            strokeWidth="1"
          />
        );
      })}
      {/* 도시 헥스 */}
      {TUTORIAL_CITIES.map((city) => {
        const x = mcx(city.col, city.row);
        const y = mcy(city.row);
        return (
          <g key={city.label}>
            <polygon points={miniHexPoints(x, y, MR - 1)} fill={city.color} stroke="#fff" strokeWidth="2" />
            <text
              x={x}
              y={y + 6}
              textAnchor="middle"
              fill="#fff"
              fontFamily="Space Grotesk"
              fontSize="17"
              fontWeight="700"
            >
              {city.label}
            </text>
            <NameLabel
              x={Math.max(x, 38)}
              y={city.namePos === 'below' ? y + MR + 14 : y - MR - 6}
              text={city.name}
            />
          </g>
        );
      })}
      {/* Wheeling 마을 */}
      <circle cx={townX} cy={townY} r="9" fill="#fffdf8" stroke="#6B5B3A" strokeWidth="2" />
      <NameLabel x={townX} y={townY + 26} text={TUTORIAL_TOWN.name} />
    </svg>
  );
}

/* ── 맵 이미지 영역 (카드/라이트박스 공용) ── */

function MapVisual({
  map,
  sizes,
  fit = 'cover',
}: {
  map: MapEntry;
  sizes: string;
  fit?: 'cover' | 'contain';
}) {
  if (!map.image) return <TutorialMiniMap />;
  return (
    <Image
      src={`${basePath}${map.image}`}
      alt={`${map.nameKo} 맵`}
      fill
      sizes={sizes}
      className={fit === 'cover' ? 'object-cover' : 'object-contain'}
    />
  );
}

export default function MapsPage() {
  const [lightboxMap, setLightboxMap] = useState<MapEntry | null>(null);

  useEffect(() => {
    if (!lightboxMap) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxMap(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxMap]);

  return (
    <div>
      {/* 헤더 */}
      <section className="mx-auto max-w-[1200px] px-[clamp(18px,5vw,56px)] pb-[clamp(30px,4vw,48px)] pt-[clamp(48px,7vw,92px)]">
        <div className="mb-4 font-display text-xs font-medium tracking-[0.16em] text-accent">
          MAPS / 맵 갤러리
        </div>
        <h1 className="mb-[18px] text-[clamp(30px,6vw,60px)] font-bold leading-[1.04] tracking-[-0.04em]">
          대륙마다 다른 한 판
        </h1>
        <p className="max-w-[620px] text-base leading-[1.8] text-foreground-secondary">
          같은 규칙도 지도가 바뀌면 완전히 다른 게임이 됩니다. 지역 보너스, 험준한
          지형, 특수 규칙이 매번 새로운 수싸움을 만듭니다. 브라우저에서 AI와 바로
          플레이할 수 있습니다.
        </p>
      </section>

      {/* 카드 그리드 */}
      <section className="mx-auto max-w-[1200px] px-[clamp(18px,5vw,56px)] pb-[clamp(48px,7vw,90px)]">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {maps.map((map, i) => (
            <motion.div
              key={map.slug}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="glass-card card-hover flex flex-col overflow-hidden"
            >
              {/* 이미지 영역 — 클릭 시 라이트박스 */}
              <button
                onClick={() => setLightboxMap(map)}
                aria-label={`${map.nameKo} 맵 크게 보기`}
                className="relative block aspect-[16/10] w-full cursor-zoom-in border-b border-[#ebe6dc] bg-[#E9E2CB]"
              >
                <MapVisual map={map} sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw" />
                <span
                  className="absolute left-[14px] top-[14px] rounded-full px-[11px] py-[5px] text-[11px] font-semibold text-[#fffdf8]"
                  style={{ background: DIFF_COLOR[map.diff] }}
                >
                  {map.diff}
                </span>
              </button>

              {/* 본문 */}
              <div className="flex flex-1 flex-col px-6 pb-6 pt-[22px]">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[22px] font-bold tracking-[-0.02em] text-foreground">
                    {map.nameKo}
                  </h3>
                  <span className="whitespace-nowrap font-display text-xs text-foreground-muted">
                    {map.players}인 · {map.turns}
                  </span>
                </div>
                <div className="mt-1 font-display text-xs tracking-wide text-[#a39d91]">
                  {map.name}
                </div>
                <p className="mt-[14px] text-sm leading-[1.7] text-foreground-secondary">
                  {map.description}
                </p>
                <div className="mt-auto pt-5">
                  {map.playable ? (
                    <Link
                      href={`/game/${map.slug}/`}
                      className="inline-flex items-center gap-2 rounded-[10px] bg-accent px-4 py-[9px] text-sm font-bold text-[#fffdf8] shadow-glow transition-colors hover:bg-accent-light"
                    >
                      <Play className="h-[14px] w-[14px]" fill="currentColor" />
                      플레이하기
                    </Link>
                  ) : (
                    <span className="inline-block rounded-[10px] border border-[#ddd6c8] px-4 py-[9px] text-sm font-medium text-foreground-muted">
                      준비 중
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 라이트박스 (좌우 전환 없음) */}
      <AnimatePresence>
        {lightboxMap && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-[clamp(12px,4vw,40px)]"
            onClick={() => setLightboxMap(null)}
          >
            {/* 백드롭 */}
            <div className="absolute inset-0 bg-[#1c1b18]/60 backdrop-blur-sm" />

            {/* 패널 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="glass-card relative flex max-h-[92vh] w-full max-w-[1100px] flex-col overflow-hidden md:flex-row"
            >
              <button
                onClick={() => setLightboxMap(null)}
                aria-label="닫기"
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[#ddd6c8] bg-background-secondary/90 text-foreground-secondary transition-colors hover:border-accent hover:text-accent"
              >
                <X className="h-[18px] w-[18px]" />
              </button>

              {/* 좌: 큰 지도 — 전체가 보이도록 contain */}
              <div className="relative h-[38vh] w-full flex-none bg-[#E9E2CB] md:h-[min(72vh,680px)] md:flex-1">
                <MapVisual map={lightboxMap} sizes="(max-width: 1024px) 100vw, 760px" fit="contain" />
              </div>

              {/* 우: 맵 정보 + 특수 규칙 + 플레이 */}
              <div className="flex min-h-0 w-full flex-col overflow-y-auto border-t border-[#ebe6dc] p-6 md:w-[330px] md:flex-none md:border-l md:border-t-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-[22px] font-bold tracking-[-0.02em] text-foreground">
                    {lightboxMap.nameKo}
                  </h3>
                  <span className="font-display text-xs tracking-wide text-[#a39d91]">
                    {lightboxMap.name}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="rounded-full px-[9px] py-[3px] text-[10.5px] font-semibold text-[#fffdf8]"
                    style={{ background: DIFF_COLOR[lightboxMap.diff] }}
                  >
                    {lightboxMap.diff}
                  </span>
                  <span className="font-display text-xs text-foreground-muted">
                    {lightboxMap.players}인 · {lightboxMap.turns}
                  </span>
                </div>

                <p className="mt-4 text-[13.5px] leading-[1.7] text-foreground-secondary">
                  {lightboxMap.description}
                </p>

                <div className="mt-5 border-t border-[#ebe6dc] pt-4">
                  <div className="mb-3 font-display text-[11px] font-semibold tracking-[0.12em] text-accent">
                    특수 규칙
                  </div>
                  <ul className="space-y-[10px]">
                    {lightboxMap.rules.map((rule) => (
                      <li
                        key={rule}
                        className="flex gap-2 text-[13px] leading-[1.65] text-foreground-secondary"
                      >
                        <span className="mt-[7px] h-[5px] w-[5px] flex-none rounded-full bg-accent" />
                        {rule}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-auto pt-6">
                  {lightboxMap.playable ? (
                    <Link
                      href={`/game/${lightboxMap.slug}/`}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-base font-bold text-[#fffdf8] shadow-glow transition-colors hover:bg-accent-light"
                    >
                      <Play className="h-4 w-4" fill="currentColor" />
                      플레이하기
                    </Link>
                  ) : (
                    <span className="inline-block w-full rounded-xl border border-[#ddd6c8] px-6 py-3 text-center text-base font-medium text-foreground-muted">
                      준비 중
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
