'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ChevronDown, Train, Zap, Globe, TrendingUp } from 'lucide-react';

export default function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], ['0%', '50%']);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.9]);

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden hex-pattern"
    >
      {/* Background layers */}
      <div className="absolute inset-0 bg-hero-gradient" />

      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-accent/30 rounded-full"
            initial={{
              x: Math.random() * 100 + '%',
              y: '100%',
              opacity: 0,
            }}
            animate={{
              y: '-10%',
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: Math.random() * 10 + 10,
              repeat: Infinity,
              delay: Math.random() * 10,
            }}
          />
        ))}
      </div>

      {/* Radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent/5 rounded-full blur-3xl" />

      {/* Content */}
      <motion.div
        style={{ y, opacity, scale }}
        className="relative z-10 text-center px-4 max-w-6xl mx-auto"
      >
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8"
        >
          <Train className="w-4 h-4 text-accent" />
          <span className="text-sm text-foreground-secondary">
            Strategy Board Game by Martin Wallace
          </span>
        </motion.div>

        {/* Main Title */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="hero-title text-5xl md:text-7xl lg:text-8xl mb-6"
        >
          <span className="text-foreground">19세기,</span>
          <br />
          <span className="text-gradient glow-text">철도왕</span>
          <span className="text-foreground">이 되어라</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-lg md:text-xl text-foreground-secondary max-w-2xl mx-auto mb-12 leading-relaxed"
        >
          트랙을 건설하고, 물품을 운송하며, 경쟁자들을 제치고
          <br className="hidden md:block" />
          <span className="text-accent">가장 성공적인 철도 회사</span>를 만들어보세요
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
        >
          <Link href="/gameplay">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="btn-primary text-lg px-8 py-4"
            >
              게임 탐험하기
            </motion.button>
          </Link>
          <Link href="/actions">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="btn-secondary text-lg px-8 py-4"
            >
              룰 알아보기
            </motion.button>
          </Link>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="grid grid-cols-3 gap-4 md:gap-8 max-w-xl mx-auto"
        >
          {[
            { icon: Zap, value: '3-6', label: '플레이어' },
            { icon: Globe, value: '6+', label: '다양한 맵' },
            { icon: TrendingUp, value: '120', label: '분 소요' },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 1 + index * 0.1 }}
              className="glass-card p-4 md:p-6"
            >
              <stat.icon className="w-5 h-5 md:w-6 md:h-6 text-accent mx-auto mb-2" />
              <div className="counter-number text-2xl md:text-3xl">{stat.value}</div>
              <div className="text-xs md:text-sm text-foreground-secondary">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="flex flex-col items-center gap-2"
        >
          <span className="text-xs text-foreground-muted tracking-widest">SCROLL</span>
          <ChevronDown className="w-5 h-5 text-accent" />
        </motion.div>
      </motion.div>

      {/* Decorative train track at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
    </section>
  );
}
