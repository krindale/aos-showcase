'use client';

import { useState } from 'react';

/* ── 스테퍼 카드 계산기 (claude-design 레이아웃 + 룰북 정확 수치) ── */

type StepperDef = {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
};

function Stepper({
  def,
  value,
  onChange,
}: {
  def: StepperDef;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-[14px] border-b border-[#f0ebe1] py-[14px]">
      <div>
        <div className="text-[15px] font-medium text-foreground">{def.label}</div>
        <div className="mt-[3px] font-display text-xs text-foreground-muted">{def.unit}</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(def.min, value - 1))}
          aria-label={`${def.label} 감소`}
          className="h-10 w-10 rounded-[11px] border border-[#ddd6c8] bg-background text-[21px] leading-none text-foreground transition-colors hover:border-accent hover:text-accent"
        >
          −
        </button>
        {/* ± 로 바뀐 값을 스크린리더가 읽어주도록 (버튼 라벨만으론 결과를 알 수 없다) */}
        <div
          role="status"
          aria-live="polite"
          aria-label={`${def.label} ${value}${def.unit}`}
          className="min-w-[42px] text-center font-display text-[22px] font-semibold text-foreground"
        >
          {value}
        </div>
        <button
          onClick={() => onChange(Math.min(def.max, value + 1))}
          aria-label={`${def.label} 증가`}
          className="h-10 w-10 rounded-[11px] border border-[#ddd6c8] bg-background text-[21px] leading-none text-foreground transition-colors hover:border-accent hover:text-accent"
        >
          +
        </button>
      </div>
    </div>
  );
}

function Badge({ children, tone }: { children: string; tone: 'green' | 'red' }) {
  return (
    <div
      className={`mb-3 inline-block rounded-full px-[10px] py-1 font-display text-[10px] font-semibold tracking-[0.1em] ${
        tone === 'green' ? 'bg-positive/10 text-positive' : 'bg-accent/10 text-accent'
      }`}
    >
      {children}
    </div>
  );
}

/* 트랙 건설 비용 (룰북: 단순 트랙 평지 $2 · 강 $3 · 산 $4, 복합 공존 +$1 · 교차 +$2, 마을 $1+연결 트랙당 $1) */
const trackDefs: StepperDef[] = [
  { key: 'flat', label: '평지 타일', unit: '단순 트랙 · 타일당 $2', min: 0, max: 40 },
  { key: 'river', label: '강 타일', unit: '단순 트랙 · 타일당 $3', min: 0, max: 40 },
  { key: 'mtn', label: '산 타일', unit: '단순 트랙 · 타일당 $4', min: 0, max: 40 },
  { key: 'complex', label: '복합 트랙 추가비', unit: '공존 +$1 · 교차 +$2 (합산 입력)', min: 0, max: 40 },
  { key: 'towns', label: '마을 타일', unit: '마을당 $1', min: 0, max: 8 },
  { key: 'townTracks', label: '마을 연결 트랙', unit: '트랙당 $1 (전체 마을 합산)', min: 0, max: 24 },
];

/* 예상 점수 (룰북: 소득 ×3점 + 완성 링크의 트랙 구간 ×1점 − 발행 주식 ×3점) */
const vpDefs: StepperDef[] = [
  { key: 'vpIncome', label: '최종 소득 레벨', unit: '×3점', min: 0, max: 50 },
  { key: 'vpTracks', label: '완성 링크의 트랙 구간', unit: '×1점', min: 0, max: 60 },
  { key: 'vpShares', label: '발행 주식', unit: '장당 −3점', min: 0, max: 15 },
];

/* 현금 흐름 (룰북: 지출 = 발행 주식 + 기관차 레벨) */
const cashDefs: StepperDef[] = [
  { key: 'income', label: '소득 레벨', unit: '소득 트랙 위치', min: 0, max: 50 },
  { key: 'shares', label: '발행 주식', unit: '발행한 장수', min: 0, max: 15 },
  { key: 'loco', label: '기관차 레벨', unit: '배송 거리 1–6', min: 1, max: 6 },
];

export default function CalculatorPage() {
  const [values, setValues] = useState<Record<string, number>>({
    flat: 3, river: 1, mtn: 0, complex: 0, towns: 0, townTracks: 0,
    income: 8, shares: 4, loco: 3,
    vpIncome: 12, vpTracks: 10, vpShares: 5,
  });

  const set = (key: string) => (v: number) => setValues((s) => ({ ...s, [key]: v }));

  // 마을 비용(룰북): 마을마다 $1 + 그 마을로 연결되는 트랙당 $1
  // — 마을 수와 트랙 수를 분리 입력받아 여러 마을도 정확히 계산 (트랙은 마을이 있을 때만 유효)
  const trackTotal =
    values.flat * 2 +
    values.river * 3 +
    values.mtn * 4 +
    values.complex +
    values.towns +
    (values.towns > 0 ? values.townTracks : 0);

  const collect = values.income;
  const expenses = values.shares + values.loco;
  const net = collect - expenses;

  const vpTotal = values.vpIncome * 3 + values.vpTracks - values.vpShares * 3;

  return (
    <div>
      {/* 헤더 */}
      <section className="mx-auto max-w-[1200px] px-[clamp(18px,5vw,56px)] pb-[clamp(24px,4vw,40px)] pt-[clamp(48px,7vw,92px)]">
        <div className="mb-4 font-display text-xs font-medium tracking-[0.16em] text-accent">
          CALCULATOR / 계산기
        </div>
        <h1 className="mb-[18px] text-[clamp(30px,6vw,60px)] font-bold leading-[1.04] tracking-[-0.04em]">
          숫자로 이기는 도구
        </h1>
        <p className="max-w-[620px] text-base leading-[1.8] text-foreground-secondary">
          선로 비용·현금 흐름·최종 점수 모두 룰북 공식 그대로 계산합니다. 버튼으로
          값을 조정하세요.
        </p>
      </section>

      {/* 3-카드 그리드 */}
      <section className="mx-auto max-w-[1200px] px-[clamp(18px,5vw,56px)] pb-[clamp(48px,7vw,90px)]">
        <div className="grid grid-cols-1 items-start gap-[18px] md:grid-cols-2 xl:grid-cols-3">
          {/* TRACK COST */}
          <div className="glass-card px-[26px] py-7">
            <Badge tone="green">정확한 계산</Badge>
            <h3 className="mb-[6px] text-[21px] font-bold tracking-[-0.02em] text-foreground">
              선로 건설 비용
            </h3>
            <p className="mb-2 text-[13px] text-foreground-muted">
              지형별 타일 수를 입력하면 총 건설 비용이 나옵니다.
            </p>
            {trackDefs.map((def) => (
              <Stepper key={def.key} def={def} value={values[def.key]} onChange={set(def.key)} />
            ))}
            <div className="mt-[22px] flex items-center justify-between rounded-[14px] border border-glass-border bg-background p-5">
              <span className="font-medium text-foreground-secondary">총 건설 비용</span>
              <span className="font-display text-[34px] font-bold tracking-[-0.02em] text-accent">
                ${trackTotal}
              </span>
            </div>
          </div>

          {/* CASHFLOW */}
          <div className="glass-card px-[26px] py-7">
            <Badge tone="green">정확한 계산</Badge>
            <h3 className="mb-[6px] text-[21px] font-bold tracking-[-0.02em] text-foreground">
              소득 · 지출 현금 흐름
            </h3>
            <p className="mb-2 text-[13px] text-foreground-muted">
              지출 = 발행 주식 + 기관차 레벨. 순이익을 확인하세요.
            </p>
            {cashDefs.map((def) => (
              <Stepper key={def.key} def={def} value={values[def.key]} onChange={set(def.key)} />
            ))}
            <div className="mt-[22px] grid grid-cols-2 gap-[10px]">
              <div className="rounded-xl border border-[#f0ebe1] bg-background p-[14px]">
                <div className="mb-[5px] text-xs text-foreground-muted">소득 징수</div>
                <div className="font-display text-[23px] font-semibold text-positive">
                  ${collect}
                </div>
              </div>
              <div className="rounded-xl border border-[#f0ebe1] bg-background p-[14px]">
                <div className="mb-[5px] text-xs text-foreground-muted">지출</div>
                <div className="font-display text-[23px] font-semibold text-accent">
                  ${expenses}
                </div>
              </div>
            </div>
            <div
              className="mt-[10px] flex items-center justify-between rounded-[14px] border bg-background px-5 py-[18px]"
              style={{ borderColor: net >= 0 ? '#bcd4c7' : '#eccabd' }}
            >
              <span className="font-medium text-foreground-secondary">순이익 / 턴</span>
              <span
                className="font-display text-[30px] font-bold tracking-[-0.02em]"
                style={{ color: net >= 0 ? '#2f6b4f' : '#c04a2b' }}
              >
                {net >= 0 ? '+$' : '−$'}
                {Math.abs(net)}
              </span>
            </div>
            {net < 0 && (
              <p className="mt-3 text-[12.5px] leading-[1.6] text-accent">
                현금이 부족하면 부족분만큼 소득이 깎입니다. 소득이 0 미만이 되면
                파산으로 탈락합니다.
              </p>
            )}
          </div>

          {/* SCORE */}
          <div className="glass-card px-[26px] py-7">
            <Badge tone="red">최종 점수</Badge>
            <h3 className="mb-[6px] text-[21px] font-bold tracking-[-0.02em] text-foreground">
              예상 최종 점수
            </h3>
            <p className="mb-2 text-[13px] text-foreground-muted">
              점수 = 소득 ×3 + 완성 링크의 트랙 구간 ×1 − 발행 주식 ×3.
            </p>
            {vpDefs.map((def) => (
              <Stepper key={def.key} def={def} value={values[def.key]} onChange={set(def.key)} />
            ))}
            <div className="mt-[22px] flex items-center justify-between rounded-[14px] border border-glass-border bg-background p-5">
              <span className="font-medium text-foreground-secondary">예상 점수</span>
              <span className="font-display text-[34px] font-bold tracking-[-0.02em] text-foreground">
                {vpTotal}
                <span className="ml-1 text-base text-foreground-muted">점</span>
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
