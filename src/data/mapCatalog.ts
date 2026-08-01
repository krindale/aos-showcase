/**
 * 맵 카탈로그 — 갤러리(/maps)와 온라인 방 만들기(/online)가 공유하는 맵 메타.
 *
 * 인원·턴 수·특수 규칙은 여기 두지 않는다 — 게임 엔진의 단일 소스(getMapProfile)에서
 * 파생해야 페이지 하드코딩으로 인한 드리프트(예: 튜토리얼 10턴 오표기)가 안 생긴다.
 *
 * ⚠️ 이 파일은 순수 데이터로 유지할 것(게임 엔진·getMapProfile import 금지) —
 * HeroSection('수록 맵' 스탯) 등 랜딩에서도 import하므로, 여기서 엔진을 끌어오면
 * 랜딩 번들이 통째로 무거워진다. 프로파일 파생은 각 페이지(/maps·/online)가 직접 한다.
 */

// basePath는 src/utils/basePath.ts가 단일 소스 — 여기선 재수출만 한다
// (기존 `import { basePath } from '@/data/mapCatalog'` 호출부를 그대로 두기 위해).
export { BASE_PATH as basePath } from '@/utils/basePath';

export type Difficulty = '입문' | '표준' | '중급' | '고급';

export const DIFF_COLOR: Record<Difficulty, string> = {
  입문: '#66625a',
  표준: '#c04a2b',
  중급: '#2f6b4f',
  고급: '#3a4a78',
};

export type RuleItem = { title?: string; detail: string };

/**
 * 갤러리 전용 메타(diff/image/description)만 여기 두고,
 * 인원·턴 수·특수 규칙은 게임 엔진의 단일 소스(getMapProfile)에서 파생한다
 * — 페이지 하드코딩으로 인한 드리프트(예: 튜토리얼 10턴 오표기) 방지.
 */
export type MapEntry = {
  slug: string;
  name: string;
  nameKo: string;
  diff: Difficulty;
  image: string | null;
  description: string;
  playable: boolean;
  /** 프로파일이 없는(미구현) 맵의 수동 메타 */
  manual?: { players: string; turns: string };
  /** 프로파일 specialRules가 비어 있을 때(표준 룰 맵) 쓸 규칙 목록 */
  fallbackRules?: RuleItem[];
};

/* HeroSection의 '수록 맵' 스탯은 maps.length에서 자동 파생 — 항목 추가/삭제 시 수동 동기화 불필요 */

export const maps: MapEntry[] = [
  {
    slug: 'tutorial',
    name: 'Tutorial',
    nameKo: '튜토리얼',
    diff: '입문',
    image: '/maps/tutorial.webp',
    description: '규칙을 익히기 위한 2인 학습용 맵. BOT과 함께 주식·경매·건설·배송의 한 사이클을 처음부터 끝까지 체험합니다.',
    playable: true,
    fallbackRules: [
      { detail: '2인 학습용 — 룰북 기본 규칙 그대로 짧게 진행합니다.' },
      { detail: '도시 4곳 + 마을 1곳(Wheeling)의 축소 보드.' },
      { detail: '주식·경매·건설·배송·물품 성장까지 전체 사이클을 체험합니다.' },
    ],
  },
  {
    slug: 'rust-belt',
    name: 'Rust Belt',
    nameKo: '러스트 벨트',
    diff: '표준',
    image: '/maps/rust-belt.webp',
    description: '미국 북동부 산업 지대를 배경으로 한 기본 맵. 오대호와 산악, 두 강을 낀 4~5인 대결입니다.',
    playable: true,
    fallbackRules: [
      { detail: '룰북 기본 규칙으로 진행합니다.' },
      { detail: 'Pittsburgh·Wheeling은 초기 물품 3개.' },
      { detail: '오대호 헥스에는 트랙을 건설할 수 없습니다.' },
    ],
  },
  {
    slug: 'korea',
    name: 'Korea',
    nameKo: '한국',
    diff: '고급',
    image: '/maps/korea.webp',
    description: '도시 색이 고정되지 않고 현재 놓인 큐브에 따라 수요가 바뀌는 독특한 맵. 평양에서 부산까지 한반도를 잇습니다.',
    playable: true,
  },
  {
    slug: 'western-us',
    name: 'Western U.S.',
    nameKo: '서부 미국',
    diff: '고급',
    image: '/maps/western-us.webp',
    description: '태평양에서 미시시피까지 횡단하는 5~6인전. 험준한 산맥·늪, 동서 배달 보너스와 대륙횡단 보너스가 특징입니다.',
    playable: true,
  },
  {
    slug: 'southern-us',
    name: 'Southern U.S.',
    nameKo: '남부 미국',
    diff: '중급',
    image: '/maps/southern-us.webp',
    description: '모든 마을의 면화(흰 큐브)를 4대 항구로 실어 나르는 6인전. 4턴 남북전쟁의 수입 감소 2배와 Atlanta 호황이 특징입니다.',
    playable: true,
  },
  {
    slug: 'germany',
    name: 'Germany',
    nameKo: '독일',
    diff: '중급',
    image: '/maps/germany.webp',
    description: '외국 터미널과 헥스별 고정 건설비용, 도시 직결 링크가 있는 산업 혁명기의 독일 5~6인전입니다.',
    playable: true,
  },
  {
    slug: 'southern-china',
    name: 'Southern China',
    nameKo: '남부 중국',
    diff: '고급',
    image: '/maps/southern-china.webp',
    description: '홍콩과 주강 삼각주를 둘러싼 4~5인전. 소유 디스크가 4개뿐이라 링크를 국유화하며 확장해야 하고, 모든 색을 받는 홍콩은 마지막 2턴에 문을 닫습니다.',
    playable: true,
  },
  {
    slug: 'montreal',
    name: 'Montréal Métro',
    nameKo: '몬트리올 메트로',
    diff: '고급',
    image: '/maps/montreal.webp',
    description: '몬트리올 지하철망을 놓는 3인 전용전. 매 라운드 정부가 중립 링크를 무료 건설하고, 보드 위 모든 트랙이 하나의 네트워크로 이어져야 합니다.',
    playable: true,
  },
  {
    slug: 'moon',
    name: 'The Moon',
    nameKo: '달',
    diff: '고급',
    image: '/maps/moon.webp',
    description: '달 표면에 선로를 놓는 3~4인전. 매 턴 보드 절반이 밤이 되어 검은 도시로 변하고, 맵 가장자리로 나간 선로는 반대편으로 이어집니다.',
    playable: true,
  },
  {
    slug: 'st-lucia',
    name: 'St. Lucia',
    nameKo: '세인트루시아',
    diff: '중급',
    image: '/maps/st-lucia.webp',
    description: '2인 전용 대결 맵. 시작 도시가 없어 도시화 경쟁부터 시작하는, 작은 섬 위의 치열한 1:1 수싸움입니다.',
    playable: true,
  },
  {
    slug: 'barbados',
    name: 'Barbados',
    nameKo: '바베이도스',
    diff: '중급',
    image: '/maps/barbados.webp',
    description: '1인 전용 솔로 맵. 작은 섬에서 모든 주식을 되사는 것을 목표로 하는 최적화 퍼즐입니다.',
    playable: false,
    manual: { players: '1', turns: '10턴' },
    fallbackRules: [
      { detail: '1인 솔로 전용 · 10턴 (룰북).' },
      { detail: '턴당 주식 1주만 발행 가능.' },
      { detail: '게임 종료 시 현금으로 전 주식($5)을 환매하지 못하면 패배.' },
    ],
  },
];

/** 카드 그리드용 축소 썸네일 (폭 640·q78, 원본 1600px 대비 1/4) — public/maps/thumb/ */
export function thumbOf(image: string | null): string | null {
  return image ? image.replace('/maps/', '/maps/thumb/') : null;
}
