/**
 * 게임 액션 효과음(SFX) — Web Audio 합성 (외부 오디오 파일/라이브러리 없음).
 *
 * GameChat.tsx의 "딩동" 알림음(oscillator+gain 합성) 패턴을 범용 유틸로 승격한 것.
 * 각 사운드는 SFX_CATALOG의 레시피(파형·주파수·엔벨로프)로 매번 새 노드를 만들어
 * 재생한다(Web Audio 노드는 1회용). 사운드 확인 페이지(/sfx)가 이 카탈로그의
 * 라벨·설명을 그대로 순회해 버튼 목록을 만든다.
 *
 * 재생 게이트 (playSfx):
 * 1. 터보 모드면 무음 — 딜레이가 50ms로 압축돼 소리가 겹쳐 터진다
 * 2. 개인 설정(gameSettingsStore.sfxEnabled) off면 무음 — 비반응형 getState 접근
 *    (store slice 내부에서도 호출되므로)
 * 3. 같은 사운드 150ms 스로틀 — BoardPulses 이중 마운트(메인+미니맵)·스냅샷
 *    재적용으로 같은 이벤트를 두 번 관측해도 소리는 한 번만
 * 4. try/catch — 오디오 미지원/차단 환경(jsdom 포함)은 조용히 무시
 *
 * previewSfx는 확인 페이지 전용 — 설정/터보 게이트를 건너뛰고 항상 재생(스로틀만 유지).
 */

import { isTurboMode } from './turboMode';
import { useGameSettingsStore } from '@/store/gameSettingsStore';

export type SfxName =
  | 'build'
  | 'cubeStart'
  | 'income'
  | 'dice'
  | 'diceLand'
  | 'bid'
  | 'pass'
  | 'auctionWin'
  | 'actionSelect'
  | 'phase'
  | 'newCity'
  | 'goodsGrowth'
  | 'undo'
  | 'engine'
  | 'share'
  | 'error'
  | 'notify';

/** 전체 음량 상한 — GameChat 딩동(0.06)과 같은 은은한 레벨로 통일 */
const MASTER_VOLUME = 0.07;
/** 같은 사운드 재호출 스로틀 (이중 마운트/재관측 중복 방어) */
const THROTTLE_MS = 150;

interface ToneOpts {
  /** 파형 (기본 sine) */
  type?: OscillatorType;
  /** 시작 주파수(Hz) */
  freq: number;
  /** 끝 주파수 — glide면 램프, 아니면 중간 지점에서 계단 전환 */
  to?: number;
  glide?: boolean;
  /** 길이(초) */
  dur: number;
  /** 상대 음량 (마스터 게인에 곱해짐, 기본 1) */
  vol?: number;
  /** 시작 지연(초) */
  delay?: number;
}

/** 단음 하나 — 엔벨로프는 exponential ramp(클릭 노이즈 방지, GameChat과 동일) */
function tone(ctx: AudioContext, dest: AudioNode, t0: number, opts: ToneOpts) {
  const at = t0 + (opts.delay ?? 0);
  const gain = ctx.createGain();
  gain.connect(dest);
  const v = opts.vol ?? 1;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(v, 0.0002), at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + opts.dur);
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, at);
  if (opts.to !== undefined) {
    if (opts.glide) osc.frequency.exponentialRampToValueAtTime(opts.to, at + opts.dur);
    else osc.frequency.setValueAtTime(opts.to, at + opts.dur / 2);
  }
  osc.connect(gain);
  osc.start(at);
  osc.stop(at + opts.dur + 0.02);
}

/** 화이트 노이즈 버스트 — 달그락(주사위)·샤락(지폐)·칙칙(증기) 질감용 */
function noiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  opts: { dur: number; vol?: number; delay?: number; filterFreq?: number; filterType?: BiquadFilterType }
) {
  const at = t0 + (opts.delay ?? 0);
  const len = Math.max(1, Math.ceil(ctx.sampleRate * opts.dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filterType ?? 'highpass';
  filter.frequency.setValueAtTime(opts.filterFreq ?? 2000, at);
  const gain = ctx.createGain();
  const v = opts.vol ?? 0.5;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(v, 0.0002), at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + opts.dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  src.start(at);
  src.stop(at + opts.dur + 0.02);
}

interface SfxDef {
  /** 확인 페이지 카드 제목 */
  label: string;
  /** 어떤 상황에서 나는 소리인지 (확인 페이지 설명) */
  situation: string;
  render: (ctx: AudioContext, t0: number, out: AudioNode) => void;
}

export const SFX_CATALOG: Record<SfxName, SfxDef> = {
  build: {
    label: '트랙 건설',
    situation: '트랙 타일·마을 가닥을 건설했을 때 (봇·상대 건설 포함)',
    render: (ctx, t, out) => {
      // 나무 "탁" — 낮은 사각파 타격 + 저음 울림
      tone(ctx, out, t, { type: 'square', freq: 210, to: 140, glide: true, dur: 0.06, vol: 0.7 });
      tone(ctx, out, t, { type: 'triangle', freq: 90, dur: 0.09, vol: 0.9 });
    },
  },
  cubeStart: {
    label: '화물 출발',
    situation: '화물 큐브가 철도를 따라 이동을 시작할 때',
    render: (ctx, t, out) => {
      // 기적 "뿌—" — 단3도 화음(기차 경적 느낌)
      tone(ctx, out, t, { type: 'triangle', freq: 233, dur: 0.28, vol: 0.75 });
      tone(ctx, out, t, { type: 'triangle', freq: 311, dur: 0.28, vol: 0.6 });
    },
  },
  income: {
    label: '수입 정산',
    situation: '화물이 목적지에 도착해 링크 소유자 수입이 오를 때',
    render: (ctx, t, out) => {
      // 동전 "차칭" — 고음 2연타
      tone(ctx, out, t, { freq: 880, dur: 0.09, vol: 0.8 });
      tone(ctx, out, t, { freq: 1318, dur: 0.16, vol: 0.9, delay: 0.07 });
    },
  },
  dice: {
    label: '주사위 굴림',
    situation: '물품 성장 주사위를 굴리기 시작할 때',
    render: (ctx, t, out) => {
      // 달그락 — 노이즈 버스트 3연타
      noiseBurst(ctx, out, t, { dur: 0.05, vol: 0.5, filterFreq: 2500 });
      noiseBurst(ctx, out, t, { dur: 0.05, vol: 0.4, delay: 0.09, filterFreq: 3200 });
      noiseBurst(ctx, out, t, { dur: 0.06, vol: 0.45, delay: 0.19, filterFreq: 2800 });
    },
  },
  diceLand: {
    label: '주사위 확정',
    situation: '주사위 결과가 확정됐을 때 (봇 자동 굴림 포함)',
    render: (ctx, t, out) => {
      // "톡" 착지음
      tone(ctx, out, t, { type: 'triangle', freq: 520, to: 300, glide: true, dur: 0.1, vol: 0.9 });
    },
  },
  bid: {
    label: '경매 입찰',
    situation: '플레이어 순서 경매에서 입찰했을 때',
    render: (ctx, t, out) => {
      tone(ctx, out, t, { freq: 1046, dur: 0.12, vol: 0.8 });
    },
  },
  pass: {
    label: '경매 포기',
    situation: '경매에서 포기(패스)했을 때',
    render: (ctx, t, out) => {
      // 하강 2음
      tone(ctx, out, t, { freq: 523, dur: 0.09, vol: 0.7 });
      tone(ctx, out, t, { freq: 392, dur: 0.14, vol: 0.7, delay: 0.09 });
    },
  },
  auctionWin: {
    label: '낙찰',
    situation: '경매가 끝나 새 플레이어 순서가 정해졌을 때',
    render: (ctx, t, out) => {
      // 상승 3음 소형 팡파레
      tone(ctx, out, t, { freq: 523, dur: 0.1, vol: 0.7 });
      tone(ctx, out, t, { freq: 659, dur: 0.1, vol: 0.7, delay: 0.09 });
      tone(ctx, out, t, { freq: 784, dur: 0.2, vol: 0.85, delay: 0.18 });
    },
  },
  actionSelect: {
    label: '행동 선택',
    situation: '특수 행동(First Build·Engineer·Locomotive 등)을 선택했을 때',
    render: (ctx, t, out) => {
      // 확정 "딩-동" 상승 2음 — 결정을 찍는 느낌
      tone(ctx, out, t, { type: 'triangle', freq: 587, dur: 0.1, vol: 0.75 });
      tone(ctx, out, t, { type: 'triangle', freq: 880, dur: 0.18, vol: 0.85, delay: 0.09 });
    },
  },
  phase: {
    label: '단계 전환',
    situation: '게임 단계가 넘어갈 때 (주식 발행 → 경매 → …)',
    render: (ctx, t, out) => {
      // "휙" 상승 스윕 — 은은하게
      tone(ctx, out, t, { freq: 420, to: 880, glide: true, dur: 0.16, vol: 0.45 });
    },
  },
  newCity: {
    label: '신도시 건설',
    situation: '도시화로 신도시 타일이 배치됐을 때',
    render: (ctx, t, out) => {
      // 상승 아르페지오 + 옥타브 마무리 — 제일 화려한 팡파레
      tone(ctx, out, t, { type: 'triangle', freq: 523, dur: 0.12, vol: 0.7 });
      tone(ctx, out, t, { type: 'triangle', freq: 659, dur: 0.12, vol: 0.7, delay: 0.1 });
      tone(ctx, out, t, { type: 'triangle', freq: 784, dur: 0.12, vol: 0.75, delay: 0.2 });
      tone(ctx, out, t, { type: 'triangle', freq: 1046, dur: 0.3, vol: 0.9, delay: 0.3 });
      tone(ctx, out, t, { freq: 1568, dur: 0.3, vol: 0.35, delay: 0.3 });
    },
  },
  goodsGrowth: {
    label: '물품 성장',
    situation: '성장 주사위로 도시에 새 화물이 도착했을 때',
    render: (ctx, t, out) => {
      // 또르륵 — 고음 하강 3음
      tone(ctx, out, t, { freq: 1318, dur: 0.07, vol: 0.7 });
      tone(ctx, out, t, { freq: 1046, dur: 0.07, vol: 0.7, delay: 0.07 });
      tone(ctx, out, t, { freq: 880, dur: 0.12, vol: 0.7, delay: 0.14 });
    },
  },
  undo: {
    label: '실행 취소',
    situation: '확정한 행동을 되돌렸을 때',
    render: (ctx, t, out) => {
      // 되감기 하강 스윕
      tone(ctx, out, t, { freq: 700, to: 330, glide: true, dur: 0.16, vol: 0.6 });
    },
  },
  engine: {
    label: '엔진 업그레이드',
    situation: '수송 기회 대신 엔진을 1레벨 올렸을 때',
    render: (ctx, t, out) => {
      // 증기 "칙칙" + 상승음
      noiseBurst(ctx, out, t, { dur: 0.07, vol: 0.4, filterFreq: 1800 });
      noiseBurst(ctx, out, t, { dur: 0.07, vol: 0.35, delay: 0.11, filterFreq: 1800 });
      tone(ctx, out, t, { type: 'triangle', freq: 330, to: 494, glide: true, dur: 0.2, vol: 0.7, delay: 0.2 });
    },
  },
  share: {
    label: '주식 발행',
    situation: '주식을 발행해 $5를 받았을 때',
    render: (ctx, t, out) => {
      // 지폐 "샤락" — 고음 노이즈 + 짧은 확인음
      noiseBurst(ctx, out, t, { dur: 0.12, vol: 0.35, filterFreq: 4000 });
      tone(ctx, out, t, { freq: 988, dur: 0.1, vol: 0.5, delay: 0.08 });
    },
  },
  error: {
    label: '에러 안내',
    situation: '건설 불가 등 에러 토스트가 떴을 때',
    render: (ctx, t, out) => {
      tone(ctx, out, t, { type: 'square', freq: 165, dur: 0.18, vol: 0.4 });
    },
  },
  notify: {
    label: '일반 안내',
    situation: '일반 안내 토스트가 떴을 때',
    render: (ctx, t, out) => {
      tone(ctx, out, t, { freq: 660, dur: 0.15, vol: 0.6 });
    },
  },
};

// ── 엔진 (모듈 싱글턴) ─────────────────────────────────────────────────────

let ctx: AudioContext | null = null;
let unlockBound = false;

/**
 * AudioContext lazy 싱글턴 + autoplay unlock.
 * 브라우저는 사용자 제스처 전 오디오를 suspend하므로, 첫 pointerdown/keydown에서
 * resume하는 리스너를 한 번 등록한다 (GameChat엔 없던 보강 — 게임 첫 소리 유실 방지).
 */
function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (!unlockBound) {
      unlockBound = true;
      const unlock = () => {
        if (ctx?.state === 'suspended') void ctx.resume();
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }
    return ctx;
  } catch {
    return null; // 오디오 미지원 환경 (jsdom 등) — 무음
  }
}

const lastPlayedAt: Partial<Record<SfxName, number>> = {};

function playInternal(name: SfxName): void {
  const now = Date.now();
  if (now - (lastPlayedAt[name] ?? 0) < THROTTLE_MS) return;
  lastPlayedAt[name] = now;
  try {
    const c = ensureCtx();
    if (!c) return;
    const master = c.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(c.destination);
    SFX_CATALOG[name].render(c, c.currentTime, master);
  } catch {
    // 재생 실패는 게임에 무해 — 조용히 무시
  }
}

/** 게임 내 효과음 재생 — 터보/개인 설정 게이트 적용 */
export function playSfx(name: SfxName): void {
  try {
    if (isTurboMode()) return;
    if (!useGameSettingsStore.getState().sfxEnabled) return;
  } catch {
    return;
  }
  playInternal(name);
}

/** 확인 페이지(/sfx) 전용 — 설정/터보 게이트 무시, 스로틀만 유지 */
export function previewSfx(name: SfxName): void {
  playInternal(name);
}
