// ESLint 9 flat config (2026-07 ESLint 8 → 9 마이그레이션)
// eslint-config-next는 eslintrc 형식이라 FlatCompat으로 감싼다 (Next 공식 안내 방식).
// 기존 .eslintrc.json의 extends + 커스텀 룰을 그대로 이관.
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  // eslintrc의 .eslintignore/기본 무시 대체 — 빌드 산출물·정적 파일 + 구 next lint가
  // 검사하지 않던 영역(참고용 디자인 원본·CommonJS 유틸 스크립트) 제외로 검사 범위 동등 유지
  { ignores: ['.next/**', 'out/**', 'node_modules/**', 'public/sw.js', 'claude-design/**', 'scripts/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
