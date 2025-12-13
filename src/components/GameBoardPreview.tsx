'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Hexagon, MapPin, Package, ArrowRight } from 'lucide-react';

const hexColors = [
  'bg-steam-blue/20 border-steam-blue/40',
  'bg-steam-green/20 border-steam-green/40',
  'bg-steam-purple/20 border-steam-purple/40',
  'bg-steam-yellow/20 border-steam-yellow/40',
  'bg-steam-red/20 border-steam-red/40',
];

export default function GameBoardPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section ref={ref} className="py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-background-secondary" />
      <div className="absolute inset-0 hex-pattern opacity-50" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-accent text-sm tracking-widest uppercase mb-4 block">
            Game Preview
          </span>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-6">
            헥스 기반 전략 게임보드
          </h2>
          <p className="text-foreground-secondary max-w-2xl mx-auto text-lg">
            도시와 도시를 연결하는 철도 네트워크를 구축하고,
            효율적인 물품 운송 경로를 설계하세요
          </p>
        </motion.div>

        {/* Interactive Board Preview */}
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Hex Grid Visualization */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="glass-card p-8 rounded-2xl">
              {/* Hex Grid */}
              <div className="grid grid-cols-5 gap-2 justify-items-center mb-8">
                {[...Array(15)].map((_, i) => {
                  const colorClass = hexColors[i % hexColors.length];
                  const isCity = [2, 7, 12].includes(i);
                  const hasTrack = [3, 4, 8, 9].includes(i);

                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={isInView ? { opacity: 1, scale: 1 } : {}}
                      transition={{ duration: 0.4, delay: 0.3 + i * 0.05 }}
                      whileHover={{ scale: 1.1, zIndex: 10 }}
                      className={`relative w-12 h-14 md:w-16 md:h-18 ${
                        i % 2 === 1 ? 'mt-7' : ''
                      }`}
                    >
                      <div
                        className={`w-full h-full rounded-lg border-2 ${colorClass}
                          flex items-center justify-center transition-all cursor-pointer
                          hover:shadow-glow`}
                      >
                        {isCity && (
                          <MapPin className="w-5 h-5 text-accent" />
                        )}
                        {hasTrack && (
                          <div className="w-6 h-0.5 bg-accent/60 absolute" />
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-accent" />
                  <span className="text-foreground-secondary">도시</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-accent/60" />
                  <span className="text-foreground-secondary">트랙</span>
                </div>
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-steam-yellow" />
                  <span className="text-foreground-secondary">물품</span>
                </div>
              </div>
            </div>

            {/* Floating decoration */}
            <div className="absolute -top-4 -right-4 w-20 h-20 bg-accent/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-steam-blue/10 rounded-full blur-3xl" />
          </motion.div>

          {/* Features List */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="space-y-6"
          >
            {[
              {
                icon: Hexagon,
                title: '헥스 그리드 시스템',
                description:
                  '각 헥스는 다양한 지형을 나타내며, 트랙 건설 비용에 영향을 줍니다.',
              },
              {
                icon: MapPin,
                title: '도시 연결',
                description:
                  '도시 간 철도 네트워크를 구축하여 물품 운송 경로를 확보하세요.',
              },
              {
                icon: Package,
                title: '물품 운송',
                description:
                  '색상별 물품 큐브를 해당 색상의 도시로 운송하여 수입을 얻습니다.',
              },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.6 + index * 0.1 }}
                className="glass-card p-6 group cursor-pointer card-hover"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-accent/10 group-hover:bg-accent/20 transition-colors">
                    <feature.icon className="w-6 h-6 text-accent" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-foreground-secondary text-sm leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
