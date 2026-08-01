'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Play, X } from 'lucide-react';
import { getMapProfile } from '@/maps/getMapProfile';
import type { MapRuleSummary } from '@/maps/MapProfile';
import { createHexLayout, hexPolygonPoints } from '@/utils/miniHexMap';
import { useEnterMotion } from '@/hooks/useEnterMotion';

import {
  basePath,
  DIFF_COLOR,
  maps,
  thumbOf,
  type MapEntry,
  type RuleItem,
} from '@/data/mapCatalog';

type MapView = MapEntry & { players: string; turns: string; rules: RuleItem[] };

function resolveView(entry: MapEntry): MapView {
  if (!entry.playable && entry.manual) {
    return { ...entry, ...entry.manual, rules: entry.fallbackRules ?? [] };
  }
  const profile = getMapProfile(entry.slug);
  const special: MapRuleSummary[] = profile.specialRules;
  return {
    ...entry,
    players: [...profile.supportedPlayers].sort((a, b) => a - b).join('·'),
    // 다인원 맵은 인원별 턴 수를 범위로 표시 (예: 6·7턴), 고정 인원 맵은 maxTurns 그대로
    turns: `${Array.from(new Set(
      profile.turnsByPlayers
        ? profile.supportedPlayers.map((n) => profile.turnsByPlayers![n] ?? profile.maxTurns)
        : [profile.maxTurns]
    )).sort((a, b) => a - b).join('·')}턴`,
    rules: special.length > 0 ? special : entry.fallbackRules ?? [],
  };
}

const MAP_VIEWS: MapView[] = maps.map(resolveView);

/* ── 튜토리얼 미니맵 (실제 맵 배치: P/C/O/I 도시 + Wheeling 마을 + 우측 호수) ── */

const MR = 30; // 헥스 반지름
const { cx: mcx, cy: mcy } = createHexLayout(MR, 34, 38);

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
            points={hexPolygonPoints(mcx(col, row), mcy(row), MR - 1)}
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
            <polygon points={hexPolygonPoints(x, y, MR - 1)} fill={city.color} stroke="#fff" strokeWidth="2" />
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
  thumb = false,
}: {
  map: MapEntry;
  sizes: string;
  fit?: 'cover' | 'contain';
  /** 카드처럼 작게 보이는 자리는 축소본을 쓴다 (원본 1600px은 라이트박스 전용) */
  thumb?: boolean;
}) {
  // unoptimized: true(static export)라 Next의 placeholder="blur"를 못 쓰고, blurDataURL을
  // 만들려면 이미지 처리 라이브러리가 필요해(추가 금지) CSS 스켈레톤으로 대체 — 로드 전엔
  // 카드 톤 배경 + 은은한 펄스, 로드되면 이미지가 위에 페이드인.
  const [loaded, setLoaded] = useState(false);
  if (!map.image) return <TutorialMiniMap />;
  const src = (thumb ? thumbOf(map.image) : map.image) ?? map.image;
  return (
    <>
      {!loaded && (
        <div
          aria-hidden
          className="absolute inset-0 bg-background-tertiary motion-safe:animate-pulse"
        />
      )}
      <Image
        src={`${basePath}${src}`}
        alt={`${map.nameKo} 맵`}
        fill
        sizes={sizes}
        onLoad={() => setLoaded(true)}
        className={`${fit === 'cover' ? 'object-cover' : 'object-contain'} transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </>
  );
}

export default function MapsPage() {
  const { enter, reduce } = useEnterMotion();
  const [lightboxMap, setLightboxMap] = useState<MapView | null>(null);

  useEffect(() => {
    if (!lightboxMap) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxMap(null);
    };
    // 라이트박스가 떠 있는 동안 배경 페이지 스크롤 잠금
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
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
          {MAP_VIEWS.map((map, i) => (
            <motion.div
              key={map.slug}
              {...enter({ y: 16, duration: 0.4, delay: i * 0.05 })}
              className="glass-card card-hover flex flex-col overflow-hidden"
            >
              {/* 이미지 영역 — 클릭 시 라이트박스 */}
              <button
                onClick={() => setLightboxMap(map)}
                aria-label={`${map.nameKo} 맵 크게 보기`}
                className="relative block aspect-[16/10] w-full cursor-zoom-in border-b border-[#ebe6dc] bg-[#E9E2CB]"
              >
                <MapVisual map={map} thumb sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw" />
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
                <div className="mt-1 font-display text-xs tracking-wide text-foreground-muted">
                  {map.name}
                </div>
                <p className="mt-[14px] text-sm leading-[1.7] text-foreground-secondary">
                  {map.description}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-5">
                  {map.playable ? (
                    <Link
                      href={`/game/${map.slug}/`}
                      prefetch={false}
                      className="inline-flex items-center gap-2 rounded-[10px] bg-accent px-4 py-[9px] text-sm font-bold text-[#fffdf8] shadow-glow transition-colors hover:bg-accent-light"
                    >
                      <Play className="h-[14px] w-[14px]" fill="currentColor" />
                      플레이하기
                    </Link>
                  ) : (
                    /* 준비 중 카드에 후속 행동이 없어 관심 있는 방문자를 놓치던 문제(UX 리뷰).
                       정적 사이트라 "알림 받기"(이메일 수집)는 불가능하므로, 지금 바로 할 수 있는
                       가장 가까운 경험으로 안내한다 — 바베이도스는 유일한 솔로 맵이지만
                       어느 맵이든 상대를 봇으로 채우면 사실상 혼자 플레이가 된다. */
                    <>
                      <span className="inline-block rounded-[10px] border border-[#ddd6c8] px-4 py-[9px] text-sm font-medium text-foreground-muted">
                        준비 중
                      </span>
                      <Link
                        href="/game/tutorial/"
                        prefetch={false}
                        className="text-xs font-semibold text-accent underline-offset-4 transition-colors hover:underline"
                      >
                        혼자 해보고 싶다면 → 봇과 튜토리얼
                      </Link>
                    </>
                  )}
                  {/* 11개 카드 중 초보 진입점을 표시 — 전부 같은 "플레이하기"라 어디서
                      시작해야 할지 신호가 없었다 */}
                  {map.slug === 'tutorial' && (
                    <span className="font-display text-xs font-semibold tracking-wide text-accent">
                      ← 처음이라면 여기서 시작
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
            transition={{ duration: reduce ? 0 : 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-[clamp(12px,4vw,40px)]"
            onClick={() => setLightboxMap(null)}
          >
            {/* 백드롭 — backdrop-blur를 자체 GPU 합성 레이어로 고정(translateZ). 안 하면
                우측 규칙 목록을 스크롤할 때 브라우저가 blur를 재계산하며 레이어가 오락가락해
                화면이 간헐적으로 깜빡인다(backdrop-filter + scroll 리페인트 간섭). */}
            <div
              className="absolute inset-0 bg-[#1c1b18]/60 backdrop-blur-sm"
              style={{ transform: 'translateZ(0)', willChange: 'transform' }}
            />

            {/* 패널 */}
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: reduce ? 0 : 0.25, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="glass-card relative flex max-h-[92vh] w-full max-w-[1100px] flex-col overflow-hidden md:h-[min(88vh,780px)] md:flex-row"
            >
              <button
                onClick={() => setLightboxMap(null)}
                aria-label="닫기"
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[#ddd6c8] bg-background-secondary/90 text-foreground-secondary transition-colors hover:border-accent hover:text-accent"
              >
                <X className="h-[18px] w-[18px]" />
              </button>

              {/* 좌: 큰 지도 — 팝업 세로를 항상 꽉 채우고, 전체가 보이도록 contain */}
              <div className="relative h-[38vh] w-full flex-none bg-[#E9E2CB] md:h-full md:flex-1">
                <MapVisual map={lightboxMap} sizes="(max-width: 1024px) 100vw, 760px" fit="contain" />
              </div>

              {/* 우: 맵 정보(고정) + 특수 규칙(이 영역만 스크롤) + 플레이 버튼(고정) */}
              <div className="flex min-h-0 w-full flex-col border-t border-[#ebe6dc] p-6 md:h-full md:w-[330px] md:flex-none md:border-l md:border-t-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-[22px] font-bold tracking-[-0.02em] text-foreground">
                    {lightboxMap.nameKo}
                  </h3>
                  <span className="font-display text-xs tracking-wide text-foreground-muted">
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

                <div className="mt-5 flex min-h-0 flex-1 flex-col border-t border-[#ebe6dc] pt-4">
                  <div className="mb-3 flex-none font-display text-[11px] font-semibold tracking-[0.12em] text-accent">
                    특수 규칙
                  </div>
                  {/* 규칙이 길면 이 목록만 스크롤 — 제목/버튼은 고정.
                      overscroll-contain: 목록 끝에서 스크롤이 백드롭(backdrop-blur)으로 체이닝되지
                      않게 차단. translateZ: 스크롤 컨테이너를 자체 레이어로 격리(백드롭 깜빡임 방지). */}
                  <ul
                    className="min-h-0 flex-1 space-y-[10px] overflow-y-auto overscroll-contain pr-1 max-h-[30vh] md:max-h-none"
                    style={{ transform: 'translateZ(0)' }}
                  >
                    {lightboxMap.rules.map((rule) => (
                      <li
                        key={rule.detail}
                        className="flex gap-2 text-[13px] leading-[1.65] text-foreground-secondary"
                      >
                        <span className="mt-[7px] h-[5px] w-[5px] flex-none rounded-full bg-accent" />
                        <span>
                          {rule.title && (
                            <span className="font-semibold text-foreground">{rule.title} — </span>
                          )}
                          {rule.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex-none pt-5">
                  {lightboxMap.playable ? (
                    <Link
                      href={`/game/${lightboxMap.slug}/`}
                      prefetch={false}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-base font-bold text-[#fffdf8] shadow-glow transition-colors hover:bg-accent-light"
                    >
                      <Play className="h-4 w-4" fill="currentColor" />
                      플레이하기
                    </Link>
                  ) : (
                    /* 카드 쪽과 같은 처리 — 준비 중이어도 지금 할 수 있는 행동을 남긴다 */
                    <div className="flex flex-col items-center gap-2">
                      <span className="inline-block w-full rounded-xl border border-[#ddd6c8] px-6 py-3 text-center text-base font-medium text-foreground-muted">
                        준비 중
                      </span>
                      <Link
                        href="/game/tutorial/"
                        prefetch={false}
                        className="text-[13px] font-semibold text-accent underline-offset-4 transition-colors hover:underline"
                      >
                        혼자 해보고 싶다면 → 봇과 튜토리얼
                      </Link>
                    </div>
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
