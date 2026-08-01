/**
 * 배포 basePath의 **단일 소스**.
 *
 * 왜 파일 하나로 모으는가: 예전엔 layout.tsx·mapCatalog.ts·pwaUtils.ts가 각자
 * `process.env.NODE_ENV === 'production' ? '/aos-showcase' : ''` 를 **복제**하고 있었다.
 * 호스팅을 옮기거나 커스텀 도메인 루트로 배포할 때 이 판단을 여러 곳에서 똑같이
 * 고쳐야 했고, 한 곳만 빠뜨리면 이미지나 manifest 경로가 조용히 404가 된다.
 *
 * 이제 값은 next.config.mjs가 정하고(`env`로 주입) 여기서만 읽는다.
 * 배포 대상을 바꾸려면 **환경변수 하나**만 건드리면 된다:
 *
 *   NEXT_PUBLIC_BASE_PATH=            → 도메인 루트 배포 (Cloudflare Pages 등)
 *   NEXT_PUBLIC_BASE_PATH=/aos-showcase → 서브패스 배포 (GitHub Pages, 현재 기본값)
 *
 * ⚠️ 정적 파일(public/manifest.json·public/sw.js)은 번들을 거치지 않아 이 상수를
 *    읽을 수 없다. 그 둘은 환경변수 대신 **자기 위치 기준 상대 경로**로 해결한다
 *    (manifest는 상대 URL, sw.js는 self.location에서 유도) — 어디에 배포하든
 *    자동으로 맞으므로 이 상수와 어긋날 일이 없다.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** public/ 아래 정적 자산의 배포 경로를 만든다. `asset('/icons/x.png')` → `/aos-showcase/icons/x.png` */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
