import bundleAnalyzer from '@next/bundle-analyzer';

// 번들 크기 계측 — `ANALYZE=true`일 때만 리포트를 연다(평소 빌드/배포엔 무영향)
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  // ESLint 9 flat config(eslint.config.mjs)는 Next 14 내장 빌드 lint가 인식 못 함 —
  // 빌드 중 lint를 끄고, lint는 `npm run lint`(eslint CLI) + CI(deploy.yml) 스텝이 담당
  eslint: { ignoreDuringBuilds: true },
  output: 'export',
  basePath: isProd ? '/aos-showcase' : '',
  assetPrefix: isProd ? '/aos-showcase/' : '',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default withBundleAnalyzer(nextConfig);
