// 빌드 후 out/sw.js 의 CACHE_VERSION 을 빌드마다 유니크한 값으로 치환한다.
//
// 왜: Service Worker 는 "스크립트 내용이 바뀌어야" 새 워커로 인식돼 install→activate 가 일어나고,
// activate 훅에서 옛 캐시를 지운다. CACHE_VERSION 이 고정이면 코드를 새로 배포해도 sw.js 내용이
// 그대로라 옛 캐시(옛 JS 청크)가 계속 서빙돼 "a[e] is not a function" 같은 청크 불일치가 난다.
// 매 빌드 유니크 버전을 박아 넣어 배포마다 캐시가 자동으로 갈아끼워지게 한다.

import { readFileSync, writeFileSync, existsSync } from 'fs';

const FILE = 'out/sw.js';

if (!existsSync(FILE)) {
  console.warn(`[version-sw] ${FILE} 없음 — static export(out/) 빌드 후에만 동작. 건너뜀.`);
  process.exit(0);
}

// CI 는 커밋 SHA, 로컬은 타임스탬프 — 어느 쪽이든 빌드마다 달라진다.
const buildId = (process.env.GITHUB_SHA || `${Date.now()}`).slice(0, 12);

const src = readFileSync(FILE, 'utf8');
const next = src.replace(
  /const CACHE_VERSION = '[^']*';/,
  `const CACHE_VERSION = 'aos-${buildId}';`
);

if (next === src) {
  console.warn('[version-sw] CACHE_VERSION 패턴을 못 찾음 — sw.js 형식 확인 필요.');
  process.exit(0);
}

writeFileSync(FILE, next);
console.log(`[version-sw] out/sw.js CACHE_VERSION → aos-${buildId}`);
