import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 크림 페이퍼 라이트 테마 (claude-design)
        // 2026-07-04 사용자 피드백 "너무 희어서 눈 아픔" — 한 톤 진하게 (페이지/카드 모두)
        background: {
          DEFAULT: '#efece4',   // 페이지 배경 (구 #f7f5f0)
          secondary: '#faf8f3', // 카드/패널 (구 #ffffff)
          tertiary: '#e7e1d5',  // 밴드/호버 (구 #efeae1)
        },
        // 2026-07-29 WCAG AA 대비 확보 — 배경 #efece4 기준 실측으로 조정
        // (구 secondary #6e6a61 = 4.51:1 경계, 구 muted #8a857c = 3.07:1 미달)
        foreground: {
          DEFAULT: '#1c1b18',   // 잉크
          secondary: '#5f5b53', // 보조 텍스트 — 5.66:1
          muted: '#66625a',     // 흐린 텍스트 — 배경/카드/밴드 세 곳 모두 4.5:1 이상 (5.09 / 5.72 / 4.63)
        },
        // 버밀리언 악센트
        accent: {
          DEFAULT: '#c04a2b',
          light: '#d65a39',
          dark: '#a03a22',
        },
        // 보조 시맨틱 (수입/긍정 = 딥그린)
        positive: '#2f6b4f',
        // Game colors
        steam: {
          red: '#e63946',
          blue: '#457b9d',
          green: '#2a9d8f',
          purple: '#7b2cbf',
          yellow: '#f4a261',
        },
        // 페이퍼 서피스 (구 글래스모피즘 — 토큰명 유지)
        glass: {
          DEFAULT: 'rgba(255, 255, 255, 0.7)',
          border: '#e6e1d6',
          hover: '#ece7dd',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'fade-in-up': 'fadeInUp 0.6s ease-out',
        'slide-in-left': 'slideInLeft 0.6s ease-out',
        'slide-in-right': 'slideInRight 0.6s ease-out',
        'scale-in': 'scaleIn 0.4s ease-out',
        'float': 'float 6s ease-in-out infinite',
        'steam': 'steam 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-50px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(50px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        steam: {
          '0%': { opacity: '0', transform: 'translateY(0) scale(1)' },
          '50%': { opacity: '0.5' },
          '100%': { opacity: '0', transform: 'translateY(-100px) scale(1.5)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'hero-gradient': 'radial-gradient(120% 90% at 82% 0%, rgba(192, 74, 43, 0.09), transparent 56%)',
      },
      boxShadow: {
        'glow': '0 8px 20px -8px rgba(192, 74, 43, 0.6)',
        'glow-lg': '0 24px 50px -24px rgba(192, 74, 43, 0.6)',
        'glass': '0 1px 2px rgba(28, 27, 24, 0.04), 0 14px 34px -18px rgba(28, 27, 24, 0.16)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
export default config;
