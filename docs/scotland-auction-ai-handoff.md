# Scotland 경매·행동 AI — 작업 히스토리 & 핸드오프 (2026-08-06)

다른 PC에서 이어가기 위한 세션 기록. 브랜치 `feat/scotland-auction-ai`(커밋 5601ab4),
베이스는 `feat/scotland-map`(맵 자체도 main 미머지 — 78476b1·89aeb63).
측정·기각의 상세 근거는 [ai-auction-baseline-100seed.md](ai-auction-baseline-100seed.md)
2026-08-05m ~ 2026-08-06b 항목 참조 (이 문서는 흐름 요약 + 남은 일).

## 발단 — 사용자 실플레이 리포트 3건 (시간순)

1. **"내가 매턴 $1로 비딩해도 봇이 안 따라와 — 경매가 무의미"**
   → 원인: 입찰 현금 가드가 운영비 전액(주식+엔진)을 현금에서 예비 → 봇 maxBid 영구 $0.
   (2026-08-05l 전면 롤백 때 "미해결 원인"으로 기록돼 있던 바로 그 버그)
2. **"봇이 운송도 건설도 안 해"** → 로그 추적 결과 건설은 하고 있었고, 진짜 문제는
   사람이 Locomotive를 8턴 독점 → 봇 엔진 1 고착 → 1링크 배달만 가능 → 큐브 선점에
   무저항 → income 1 vs 21 좀비화. (봇끼리 15점 내던 튜닝이 사람의 레버리지 앞에서 붕괴 —
   자기복제 시뮬은 "대칭 전략 우열"만 보고 맞대결 강함을 놓친다는 방법론 교훈 재확인)
3. **"경매는 엔진업·도시화로 배달 옵션을 늘리는 선택인데 봇은 그런 생각이 없다"**
   → 구조 확인: selectAction의 다인(3+) 전용 게이트 2개에 2인 맵이 잘려 있었다 —
   Locomotive 공짜 엔진 front-load = 0, Urbanization = 0.2 고정. 봇이 firstBuild만 반복.

## 구현 — Scotland 전용 MapProfile 훅 5종 (전부 기본값 = 타 맵 무영향)

| 훅 | 값 | 내용 |
|---|---|---|
| `aiAuctionExpensesNetOfIncome` | true | 입찰 가드에서 운영비를 income으로 상계 — maxBid $0 해소 (선행 조건) |
| `aiAuctionDenialValue` | true | 상대의 (최선−차선) 격차 ÷ 상대수를 절실함에 합산 — 1등 견제 |
| `aiAuctionContestedMoveVP` | 1 | 경합 배달(hasContestedDelivery) 있을 때 수송 선순위 가치 합산 |
| `aiEngineSkipConversionVP` | 0.5 | 죽은 수송 라운드 → 엔진업 전환. **상대 엔진 열세일 때만** |
| `aiTwoPlayerActionPlanning` | true | 2인 맵에 Locomotive front-load + Urbanization 실계획 개방 |

+ 비대칭 A/B 하니스 신설(`src/ai/__tests__/scotlandAB.test.ts` — 훅을 결정 호출 순간만
플레이어별 섀도잉, 좌석 스왑으로 편향 상쇄) + 시뮬에 경매 입찰 횟수·입찰액 지표 추가.

## 핵심 측정 (Scotland 300시드 자기복제, 시작→최종)

- VP 15.66 → **30.84** · income 10.72 → 14.98 · 도시화 1.0 → 3.2/게임
- **경매 입찰 0.04 → 2.56회/게임 ($4.00)** — "긴장감 없음"의 정량 지표
- 파산 0.05 → 0.14 (허용) · 좌석 편향 141/159 → 183/117 (선공이 처음으로 값어치 획득)
- 타 맵 무영향: Rust Belt 100시드 비트 일치(42.85/0.12/19·19·30·32), 튜토리얼 게이트 통과

## 기각된 설계 (재시도 금지 근거 — 상세는 baseline 문서)

- **엔진 front-load 2인 개방**: A/B 41% — "엔진 올리는 동안 상대가 큐브를 다 먹는" 참패
  (자기복제 VP는 +1이었어서 대칭 측정만 믿으면 안 되는 전형)
- **스킵 전환 무제한/조건 완화**: 44%/46% — 엔진 +1은 유지비 $1/턴이라 과등반 자멸.
  "상대 엔진 열세일 때만"으로 좁혀 49%(항등) 달성
- (기존 기각 유지: turnOrderSeatVP 상향, 체인 연결 보너스, firstSeatRankBidBonus 계열)

## ⚠️ 검증의 한계 — 실플레이가 정본

봇끼리는 **경로 겹침 회피로 경합 자체가 안 생겨** 경매 훅 일부(경합 절실함)는 시뮬로 검증
불가(배수 100 프로브에도 입찰 불변 실측). `aiTwoPlayerActionPlanning`의 A/B 36%는 "무료
승차" 구조(신봇의 신도시 = 공공재를 확장 안 하는 구봇이 착취)라 확장형 사람 상대와 무관 —
판정 기준을 "사용자 실플레이"로 둔 첫 채택. 검증은 :3999 로그 서버로 게임 로그 추적.

## 남은 일

1. **실플레이 검증**: 마지막 변경(aiTwoPlayerActionPlanning)은 사용자가 아직 체험 전 —
   커밋 직전 판(z4xx)은 그 이전 버전이었다. 새 판에서 봇이 초반부터 Locomotive·도시화를
   놓고 경매에 붙는지 확인.
2. **PR·머지 판단** (사용자) — 머지 시 **CLAUDE.md에 스코틀랜드 항목이 아직 없다** →
   맵 요약 + 이 작업 요약 동기화 필요.
3. 그래도 밋밋하면 다음 레버:
   - 레버리지 발행 규모 — 뒤질 때 차입이 여전히 소극적(T2에 0주: cashNeeded가 "현재 목표
     경로 하나"만 계산, 상대 템포를 안 봄)
   - "최소 견제 입찰 $1 상시" — 05i에서 선공 고착+양측 출혈로 보류된 카드
4. 측정 명령:
   ```bash
   AOS_SEEDS=300 npx vitest run src/ai/__tests__/scotlandSimulation.test.ts  # 자기복제
   AOS_SEEDS=150 npx vitest run src/ai/__tests__/scotlandAB.test.ts          # A/B 맞대결
   ```
   새 훅 추가 시 scotlandAB의 `POLICY_OLD`에 그 훅의 이전 값(보통 0/false)을 반드시 추가.
