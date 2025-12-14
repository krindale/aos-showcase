'use client';

import { useState, useRef } from 'react';
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
} from 'lucide-react';

const maps = [
  {
    id: 1,
    name: 'Rust Belt',
    nameKo: '러스트 벨트',
    region: '미국 북동부',
    players: '3-6',
    time: '120-180',
    difficulty: 2,
    theme: '산업 혁명',
    icon: Factory,
    color: 'steam-red',
    bgColor: 'from-steam-red/30 via-background-secondary to-background',
    image: '/maps/rust-belt.png',
    description: '미국 북동부 산업 지대를 배경으로 한 기본 맵입니다. Age of Steam을 처음 시작하기에 적합합니다.',
    features: [
      '균형 잡힌 도시 분포',
      '다양한 지형 조합',
      '기본 규칙 적용',
    ],
    specialRules: null,
  },
  {
    id: 2,
    name: 'Western U.S.',
    nameKo: '서부 미국',
    region: '미국 서부',
    players: '3-6',
    time: '120-180',
    difficulty: 3,
    theme: '대륙 횡단',
    icon: Mountain,
    color: 'steam-yellow',
    bgColor: 'from-steam-yellow/30 via-background-secondary to-background',
    image: '/maps/western-us.png',
    description: '광활한 미국 서부를 횡단하는 철도 건설의 도전. 긴 거리와 험준한 산맥이 특징입니다.',
    features: [
      '긴 거리 운송 필요',
      '산악 지형이 많음',
      '자원이 분산되어 있음',
    ],
    specialRules: '산악 트랙 건설 비용 증가',
  },
  {
    id: 3,
    name: 'Germany',
    nameKo: '독일',
    region: '중부 유럽',
    players: '3-6',
    time: '120-180',
    difficulty: 3,
    theme: '유럽 산업화',
    icon: Factory,
    color: 'steam-green',
    bgColor: 'from-steam-green/30 via-background-secondary to-background',
    image: '/maps/germany.png',
    description: '산업 혁명기의 독일. 조밀한 도시 네트워크와 치열한 경쟁이 특징입니다.',
    features: [
      '도시가 조밀하게 분포',
      '짧은 거리, 높은 경쟁',
      '다양한 물품 색상',
    ],
    specialRules: '도시 연결 보너스',
  },
  {
    id: 4,
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
  },
  {
    id: 5,
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
    specialRules: '2인 모드 규칙 적용',
  },
];

export default function MapsPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const isHeroInView = useInView(heroRef, { once: true });

  const currentMap = maps[currentIndex];

  const nextMap = () => {
    setCurrentIndex((prev) => (prev + 1) % maps.length);
  };

  const prevMap = () => {
    setCurrentIndex((prev) => (prev - 1 + maps.length) % maps.length);
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative pt-32 pb-12 overflow-hidden"
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
      <section className="py-8 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Fixed height container to prevent layout shifts */}
          <div className="h-[750px] relative">
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
                      <div className="aspect-[4/3] rounded-2xl bg-background-tertiary border border-glass-border overflow-hidden">
                        {/* Map Image */}
                        <img
                          src={currentMap.image}
                          alt={currentMap.name}
                          className="w-full h-full object-contain bg-background-secondary"
                        />

                        {/* Overlay gradient for better text contrast */}
                        <div className={`absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent pointer-events-none`} />

                        {/* Map name badge */}
                        <div className="absolute bottom-4 left-4 right-4">
                          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/80 backdrop-blur-sm border border-${currentMap.color}/30`}>
                            <currentMap.icon className={`w-4 h-4 text-${currentMap.color}`} />
                            <span className="text-foreground text-sm font-medium">{currentMap.region}</span>
                          </div>
                        </div>
                      </div>
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
                    </div>
                  </div>
                </div>
              </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            {/* Prev Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={prevMap}
              className="p-3 rounded-xl glass hover:bg-glass-hover transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-foreground" />
            </motion.button>

            {/* Map Indicators */}
            <div className="flex items-center gap-3">
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

            {/* Next Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={nextMap}
              className="p-3 rounded-xl glass hover:bg-glass-hover transition-colors"
            >
              <ChevronRight className="w-6 h-6 text-foreground" />
            </motion.button>
          </div>
        </div>
      </section>

      {/* Map Grid */}
      <section className="py-24 relative">
        <div className="absolute inset-0 hex-pattern opacity-30" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-bold text-foreground mb-8 text-center">
            모든 맵 보기
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {maps.map((map, index) => (
              <motion.button
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
                className={`glass-card p-6 rounded-xl text-left transition-all
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
              </motion.button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
