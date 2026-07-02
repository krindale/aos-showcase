'use client';

/** 홈 — "왜 명작인가" 에디토리얼 밴드 + 상품 배송 원리 다이어그램 */
export default function EditorialSection() {
  return (
    <section className="border-y border-glass-border bg-background-tertiary">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-[clamp(30px,5vw,68px)] px-[clamp(18px,5vw,56px)] py-[clamp(58px,8vw,104px)] md:grid-cols-2">
        <div>
          <div className="mb-4 font-display text-xs font-medium tracking-[0.16em] text-accent">
            왜 명작인가
          </div>
          <h2 className="mb-[22px] text-[clamp(26px,4vw,42px)] font-bold leading-[1.16] tracking-[-0.035em]">
            운(運)은 거의 없다.
            <br />
            오직 계산과 배짱.
          </h2>
          <p className="mb-4 text-base leading-[1.85] text-foreground-secondary">
            매 턴 발행한 주식만큼 비용이 돌아옵니다. 무리하게 빚을 내 선로를 깔
            것인가, 안전하게 갈 것인가 — 모든 결정이 경제적 압박 속에서
            이루어집니다.
          </p>
          <p className="text-base leading-[1.85] text-foreground-secondary">
            20년 넘게 사랑받아 온 경제 전략 게임의 고전. 단순한 규칙에서 끝없는
            깊이가 흘러나옵니다.
          </p>
        </div>

        <div className="glass-panel rounded-[20px] p-[30px]">
          <div className="mb-5 font-display text-[11px] font-medium tracking-[0.12em] text-foreground-muted">
            상품 배송의 원리
          </div>
          <svg viewBox="0 0 520 180" className="h-auto w-full">
            <line
              x1="60" y1="90" x2="260" y2="90"
              stroke="#c04a2b" strokeWidth="3" strokeDasharray="3 11" strokeLinecap="round"
              className="rail-dash"
            />
            <line
              x1="260" y1="90" x2="460" y2="90"
              stroke="#2f6b4f" strokeWidth="3" strokeDasharray="3 11" strokeLinecap="round"
              className="rail-dash"
            />
            <circle cx="60" cy="90" r="22" fill="#fffdf8" stroke="#c04a2b" strokeWidth="3" />
            <circle cx="260" cy="90" r="17" fill="#fffdf8" stroke="#c9c1b1" strokeWidth="3" />
            <circle cx="460" cy="90" r="22" fill="#fffdf8" stroke="#2f6b4f" strokeWidth="3" />
            <rect x="51" y="81" width="18" height="18" rx="4" fill="#c04a2b" />
            <text x="60" y="138" textAnchor="middle" fill="#6e6a61" fontFamily="IBM Plex Sans KR" fontSize="13">
              출발 도시
            </text>
            <text x="260" y="138" textAnchor="middle" fill="#8a857c" fontFamily="IBM Plex Sans KR" fontSize="13">
              경유
            </text>
            <text x="460" y="138" textAnchor="middle" fill="#6e6a61" fontFamily="IBM Plex Sans KR" fontSize="13">
              목적 도시
            </text>
            <text x="260" y="54" textAnchor="middle" fill="#1c1b18" fontFamily="Space Grotesk" fontSize="14" fontWeight="600">
              링크 2 = 소득 +2
            </text>
          </svg>
          <p className="mt-4 text-[13.5px] leading-[1.7] text-foreground-muted">
            큐브와 같은 색의 도시까지, 거쳐 간 링크 수만큼 소득이 오릅니다.
          </p>
        </div>
      </div>
    </section>
  );
}
