import bundleAnalyzer from '@next/bundle-analyzer';

// 번들 크기 계측 — `ANALYZE=true`일 때만 리포트를 연다(평소 빌드/배포엔 무영향)
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

// 배포 basePath의 단일 진실 소스 — 호스팅을 옮길 때 여기(=환경변수)만 바꾸면 된다.
//   NEXT_PUBLIC_BASE_PATH=              → 도메인 루트 배포 (Cloudflare Pages 등)
//   NEXT_PUBLIC_BASE_PATH=/aos-showcase → 서브패스 배포
// 미설정 시 기존 동작(프로덕션=/aos-showcase, 개발='')을 그대로 유지한다.
// ?? 는 빈 문자열을 통과시키므로 `NEXT_PUBLIC_BASE_PATH=` 로 루트 배포를 명시할 수 있다.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? (isProd ? '/aos-showcase' : '');

const nextConfig = {
  // ESLint 9 flat config(eslint.config.mjs)는 Next 14 내장 빌드 lint가 인식 못 함 —
  // 빌드 중 lint를 끄고, lint는 `npm run lint`(eslint CLI) + CI(deploy.yml) 스텝이 담당
  eslint: { ignoreDuringBuilds: true },
  output: 'export',
  basePath,
  assetPrefix: basePath ? `${basePath}/` : '',
  // 클라이언트 번들에도 같은 값을 주입 — src/utils/basePath.ts가 이걸 읽는다.
  // (환경변수를 직접 넘기지 않고 위에서 계산한 값을 넣어야 미설정 시 기본값까지 일치한다)
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default withBundleAnalyzer(nextConfig);
