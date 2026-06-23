'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Users,
  Clock,
  Star,
  Info,
  Zap,
  Factory,
  Mountain,
  Palmtree,
  MapPin, Play, ZoomIn, X } from 'lucide-react';

const basePath = process.env.NODE_ENV === 'production' ? '/aos-showcase' : '';

const maps = [
  {
    id: 1,
    slug: 'rust-belt',
    name: 'Rust Belt',
    nameKo: '러스트 벨트',
    region: '미국 북동부',
    players: '5',
    time: '120-180',
    difficulty: 2,
    theme: '산업 혁명',
    icon: Factory,
    color: 'steam-red',
    bgColor: 'from-steam-red/30 via-background-secondary to-background',
    image: '/maps/rust-belt.png',
    description: '미국 북동부 산업 지대를 배경으로 한 Age of Steam 기본 맵입니다. 오대호와 산악, 두 강을 낀 5인 대결 맵.',
    features: [
      '12개 도시 · 14개 마을',
      '오대호 · 산악 · 강 지형',
      '5인 전용 · 7턴 (룰북 기본 규칙)',
    ],
    specialRules: '5인 전용, Pittsburgh·Wheeling 초기 물품 3개, 7턴',
    playable: true,
  },
  {
    id: 2,
    slug: 'korea',
    name: 'Korea',
    nameKo: '한국',
    region: '한반도',
    players: '3-6',
    time: '120-180',
    difficulty: 4,
    theme: '동적 도시 색상',
    icon: MapPin,
    color: 'steam-blue',
    bgColor: 'from-steam-blue/30 via-background-secondary to-background',
    image: '/maps/korea.png',
    description: '도시의 색상이 고정되지 않고, 현재 놓인 물품 큐브에 따라 동적으로 결정되는 독특한 맵입니다. 평양에서 부산까지 한반도 전역을 연결하세요.',
    features: [
      '도시 색상 = 현재 물품 색상',
      '인접 도시 간 직접 철로 ($2)',
      '신도시는 모두 회색 취급',
      '평양/수원은 물품 보충 없음',
    ],
    specialRules: '물품은 같은 색 물품이 있는 도시로만 운반 가능. 산악 $3, 수원-서울/인천 $2',
    playable: false,
  },
  {
    id: 3,
    slug: 'western-us',
    name: 'Western U.S.',
    nameKo: '서부 미국',
    region: '미국 서부',
    players: '6',
    time: '120-180',
    difficulty: 5,
    theme: '대륙 횡단',
    icon: Mountain,
    color: 'steam-yellow',
    bgColor: 'from-steam-yellow/30 via-background-secondary to-background',
    image: '/maps/western-us.png',
    description: '태평양에서 미시시피까지 횡단하는 6인 철도 건설. 험준한 산맥·늪과 동서 연결 보너스가 특징입니다.',
    features: [
      '서부·동부 시작 도시에서만 건설',
      '동↔서 배달 +$1 보너스',
      '대륙횡단 연결 보너스 $4/$2',
    ],
    specialRules: '늪/강 $4·산 $5, 마을 큐브, 시작 현금 $20',
    playable: true,
  },
  {
    id: 4,
    slug: 'germany',
    name: 'Germany',
    nameKo: '독일',
    region: '중부 유럽',
    players: '4',
    time: '120-180',
    difficulty: 4,
    theme: '유럽 산업화',
    icon: Factory,
    color: 'steam-green',
    bgColor: 'from-steam-green/30 via-background-secondary to-background',
    image: '/maps/germany.png',
    description: '산업 혁명기의 독일. 외국 터미널, 헥스별 고정 건설비용, 알프스 산악을 낀 4인 대결 맵입니다.',
    features: [
      '도시 13 · 마을 14 · 외국 터미널 6',
      '헥스별 고정 건설비용 (€6~€12)',
      '4인 전용 · 8턴',
    ],
    specialRules: 'Engineer 절반 비용, 미완성 링크 금지, 외국 터미널(자기 색만 수용·통과 불가), Berlin 매 턴 물품 1개',
    playable: true,
  },
  {
    id: 5,
    slug: 'barbados',
    name: 'Barbados',
    nameKo: '바베이도스',
    region: '카리브해',
    players: '1',
    time: '60-90',
    difficulty: 4,
    theme: '열대 솔로',
    icon: Palmtree,
    color: 'steam-purple',
    bgColor: 'from-steam-purple/30 via-background-secondary to-background',
    image: '/maps/barbados.png',
    description: '1인 전용 솔로 맵. 작은 섬에서 최적의 철도 네트워크를 구축하는 퍼즐입니다.',
    features: [
      '솔로 플레이 전용',
      '목표 점수 달성',
      '제한된 턴 수',
    ],
    specialRules: '솔로 모드 규칙 적용',
    playable: false,
  },
  {
    id: 6,
    slug: 'st-lucia',
    name: 'St. Lucia',
    nameKo: '세인트루시아',
    region: '카리브해',
    players: '2',
    time: '60-90',
    difficulty: 3,
    theme: '2인 대결',
    icon: Palmtree,
    color: 'accent',
    bgColor: 'from-accent/30 via-background-secondary to-background',
    image: '/maps/st-lucia.png',
    description: '2인 전용 대결 맵. 작은 공간에서 벌어지는 치열한 1:1 경쟁입니다.',
    features: [
      '2인 플레이 전용',
      '직접적인 경쟁',
      '빠른 게임 진행',
    ],
    specialRules: '경매 대신 교대 선공권($5), Production 불가, 물품 성장 생략, 8턴',
    playable: true,
  },
];

export default function MapsPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // 라이트박스 지도 전환 방향 (1=다음/오른쪽, -1=이전/왼쪽) — 슬라이드 애니메이션용
  const [slideDir, setSlideDir] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const isHeroInView = useInView(heroRef, { once: true });

  const currentMap = maps[currentIndex];

  // 라이트박스: ESC 키로 닫기 + 열려있는 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      else if (e.key === 'ArrowRight') { setSlideDir(1); setCurrentIndex((prev) => (prev + 1) % maps.length); }
      else if (e.key === 'ArrowLeft') { setSlideDir(-1); setCurrentIndex((prev) => (prev - 1 + maps.length) % maps.length); }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightboxOpen]);

  const nextMap = () => {
    setSlideDir(1);
    setCurrentIndex((prev) => (prev + 1) % maps.length);
  };

  const prevMap = () => {
    setSlideDir(-1);
    setCurrentIndex((prev) => (prev - 1 + maps.length) % maps.length);
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section
        ref={heroRef}
        className="snap-section relative pt-32 pb-12 overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background-secondary to-background" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <span className="text-accent text-sm tracking-widest uppercase mb-4 block">
              Map Gallery
            </span>
            <h1 className="font-display text-5xl md:text-6xl font-bold text-foreground mb-6">
              다양한 <span className="text-gradient">맵</span> 탐험
            </h1>
            <p className="text-foreground-secondary max-w-2xl mx-auto text-lg">
              각 맵은 독특한 지형, 특수 규칙, 그리고 새로운 전략적 도전을 제공합니다.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Map Slider */}
      <section className="snap-section py-8 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Fixed height container to prevent layout shifts */}
          <div className="h-[750px] relative">
            {/* Left Arrow - 카드 중간 왼쪽 */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-20">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={prevMap}
                className="p-4 rounded-full bg-background/80 backdrop-blur-sm border border-glass-border shadow-lg hover:bg-background transition-colors"
              >
                <ChevronLeft className="w-8 h-8 text-foreground" />
              </motion.button>
            </div>

            {/* Right Arrow - 카드 중간 오른쪽 */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={nextMap}
                className="p-4 rounded-full bg-background/80 backdrop-blur-sm border border-glass-border shadow-lg hover:bg-background transition-colors"
              >
                <ChevronRight className="w-8 h-8 text-foreground" />
              </motion.button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentMap.id}
                initial={{ opacity: 0, x: 100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0"
              >
                {/* Main Card */}
                <div className={`glass-card rounded-3xl overflow-hidden h-full`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${currentMap.bgColor} opacity-50`} />

                <div className="relative p-8 md:p-12 h-full">
                  <div className="grid lg:grid-cols-2 gap-12 items-start h-full">
                    {/* Map Visual */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setLightboxOpen(true)}
                        aria-label={`${currentMap.name} 지도 확대 보기`}
                        className="group relative aspect-[4/3] w-full rounded-2xl bg-background-tertiary border border-glass-border overflow-hidden cursor-pointer"
                      >
                        {/* Map Image */}
                        <Image
                          src={`${basePath}${currentMap.image}`}
                          alt={currentMap.name}
                          fill
                          sizes="(max-width: 1024px) 100vw, 50vw"
                          className="object-contain bg-background-secondary transition-transform duration-300 group-hover:scale-105"
                          priority={false}
                        />

                        {/* 확대 힌트 (호버 시) */}
                        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-background/80 backdrop-blur-sm border border-glass-border opacity-0 group-hover:opacity-100 transition-opacity">
                          <ZoomIn className="w-4 h-4 text-accent" />
                          <span className="text-foreground text-xs font-medium">확대</span>
                        </div>

                        {/* Overlay gradient for better text contrast */}
                        <div className={`absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent pointer-events-none`} />

                        {/* Map name badge */}
                        <div className="absolute bottom-4 left-4 right-4">
                          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/80 backdrop-blur-sm border border-${currentMap.color}/30`}>
                            <currentMap.icon className={`w-4 h-4 text-${currentMap.color}`} />
                            <span className="text-foreground text-sm font-medium">{currentMap.region}</span>
                          </div>
                        </div>
                      </button>
                    </div>

                    {/* Map Info */}
                    <div className="flex flex-col">
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`px-3 py-1 rounded-full bg-${currentMap.color}/20 text-${currentMap.color} text-sm font-medium`}>
                          {currentMap.theme}
                        </div>
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-4 h-4 ${
                                i < currentMap.difficulty
                                  ? `text-${currentMap.color} fill-current`
                                  : 'text-foreground-muted'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-2">
                        {currentMap.name}
                      </h2>
                      <p className="text-accent text-lg mb-6">{currentMap.nameKo}</p>

                      <p className="text-foreground-secondary leading-relaxed mb-8 min-h-[72px]">
                        {currentMap.description}
                      </p>

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="glass p-4 rounded-xl">
                          <div className="flex items-center gap-2 mb-1">
                            <Users className="w-4 h-4 text-accent" />
                            <span className="text-foreground-muted text-sm">플레이어</span>
                          </div>
                          <div className="text-foreground font-semibold">
                            {currentMap.players}인
                          </div>
                        </div>
                        <div className="glass p-4 rounded-xl">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="w-4 h-4 text-accent" />
                            <span className="text-foreground-muted text-sm">플레이 시간</span>
                          </div>
                          <div className="text-foreground font-semibold">
                            {currentMap.time}분
                          </div>
                        </div>
                      </div>

                      {/* Features */}
                      <div className="mb-6 flex-grow">
                        <h3 className="text-foreground font-semibold mb-3 flex items-center gap-2">
                          <Zap className="w-4 h-4 text-accent" />
                          맵 특징
                        </h3>
                        <ul className="space-y-2">
                          {currentMap.features.map((feature, i) => (
                            <li key={i} className="flex items-center gap-2 text-foreground-secondary">
                              <div className={`w-1.5 h-1.5 rounded-full bg-${currentMap.color}`} />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Special Rules - Always show container for consistent height */}
                      <div className={`p-4 rounded-xl ${currentMap.specialRules ? `bg-${currentMap.color}/10 border border-${currentMap.color}/20` : 'bg-transparent border border-transparent'}`}>
                        {currentMap.specialRules ? (
                          <>
                            <div className="flex items-center gap-2 mb-1">
                              <Info className={`w-4 h-4 text-${currentMap.color}`} />
                              <span className={`text-${currentMap.color} text-sm font-medium`}>
                                특수 규칙
                              </span>
                            </div>
                            <p className="text-foreground-secondary text-sm">
                              {currentMap.specialRules}
                            </p>
                          </>
                        ) : (
                          <div className="h-[52px]" />
                        )}
                      </div>

                      {/* 플레이 가능한 맵: 게임 진입 버튼 (Link로 클라이언트 전환 — 하드 리로드 깜빡임 제거) */}
                      {currentMap.playable && (
                        <Link
                          href={`/game/${currentMap.slug}/`}
                          className="btn-primary mt-4 flex items-center justify-center gap-2 text-sm py-3"
                        >
                          <Play className="w-4 h-4" />
                          지금 플레이하기
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Map Indicators */}
          <div className="flex items-center justify-center gap-3 mt-8">
            {maps.map((map, index) => (
              <button
                key={map.id}
                onClick={() => setCurrentIndex(index)}
                className={`group relative`}
              >
                <div
                  className={`w-3 h-3 rounded-full transition-all ${
                    index === currentIndex
                      ? `bg-${map.color} scale-125`
                      : 'bg-foreground-muted hover:bg-foreground-secondary'
                  }`}
                />
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-foreground-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  {map.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Map Grid */}
      <section className="snap-section py-24 relative">
        <div className="absolute inset-0 hex-pattern opacity-30" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-bold text-foreground mb-8 text-center">
            모든 맵 보기
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {maps.map((map, index) => (
              <motion.div
                key={map.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => {
                  setCurrentIndex(index);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                role="button"
                className={`glass-card p-6 rounded-xl text-left transition-all cursor-pointer
                  ${currentIndex === index ? 'ring-2 ring-accent' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl bg-${map.color}/20 flex items-center justify-center`}>
                    <map.icon className={`w-6 h-6 text-${map.color}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg font-semibold text-foreground">
                      {map.name}
                    </h3>
                    <p className="text-foreground-muted text-sm">{map.nameKo}</p>
                  </div>
                  <div className="flex items-center gap-1 text-foreground-muted text-sm">
                    <Users className="w-4 h-4" />
                    {map.players}
                  </div>
                </div>
                {/* 플레이 가능한 맵: 그리드에서 바로 게임 진입 (Link로 클라이언트 전환) */}
                {map.playable && (
                  <Link
                    href={`/game/${map.slug}/`}
                    onClick={(e) => e.stopPropagation()}
                    className="btn-primary mt-4 flex items-center justify-center gap-2 text-sm py-2"
                  >
                    <Play className="w-4 h-4" />
                    플레이
                  </Link>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 지도 확대 라이트박스 */}
      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setLightboxOpen(false)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 sm:p-8"
            role="dialog"
            aria-modal="true"
            aria-label={`${currentMap.name} 지도 확대`}
          >
            {/* 닫기 버튼 */}
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="닫기"
              className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-background/80 backdrop-blur-sm border border-glass-border hover:bg-background transition-colors"
            >
              <X className="w-6 h-6 text-foreground" />
            </button>

            {/* 좌우 지도 변경 버튼 */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prevMap(); }}
              aria-label="이전 지도"
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-background/80 backdrop-blur-sm border border-glass-border hover:bg-accent hover:text-background transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); nextMap(); }}
              aria-label="다음 지도"
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-background/80 backdrop-blur-sm border border-glass-border hover:bg-accent hover:text-background transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>

            {/* 확대 이미지 + 정보/플레이 (배경 클릭은 닫힘, 내부 클릭은 유지).
                좌우 전환 시 방향에 따라 슬라이드 (AnimatePresence mode="wait"). */}
            <AnimatePresence mode="wait" custom={slideDir} initial={false}>
            <motion.div
              key={currentMap.id}
              custom={slideDir}
              variants={{
                enter: (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: d > 0 ? -80 : 80, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-7xl h-[85vh] flex flex-col lg:flex-row items-center justify-center gap-4 lg:gap-6"
            >
              {/* 지도 이미지 — 자기 비율대로(높이 기준) 렌더해 메뉴가 바로 옆에 붙도록 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${basePath}${currentMap.image}`}
                alt={currentMap.name}
                className="max-h-[85vh] max-w-full lg:max-w-[calc(100%-20rem)] w-auto object-contain rounded-lg"
              />

              {/* 간략 정보 + 플레이 버튼 (지도 옆 패널, 아래 정렬) */}
              <aside className="lg:w-72 flex-shrink-0 flex flex-col gap-4 px-4 py-4 rounded-xl bg-background/85 backdrop-blur-sm border border-glass-border lg:self-end">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-foreground font-bold text-lg">{currentMap.name}</span>
                    {!currentMap.playable && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-foreground/10 text-foreground-secondary">준비 중</span>
                    )}
                  </div>
                  <span className="text-foreground-secondary text-sm">{currentMap.nameKo}</span>
                </div>

                <div className="flex flex-col gap-2 text-sm text-foreground-secondary">
                  <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-accent" />{currentMap.region}</span>
                  <span className="flex items-center gap-2"><Users className="w-4 h-4 text-accent" />{currentMap.players}인</span>
                  <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-accent" />{currentMap.time}분</span>
                  <span className="flex items-center gap-2"><Info className="w-4 h-4 text-accent" />{currentMap.theme}</span>
                </div>

                {currentMap.playable && (
                  <Link
                    href={`/game/${currentMap.slug}/`}
                    className="btn-primary flex items-center justify-center gap-2 text-sm py-2.5 px-5 mt-auto"
                  >
                    <Play className="w-4 h-4" />
                    지금 플레이하기
                  </Link>
                )}
              </aside>
            </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
