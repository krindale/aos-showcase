# Rust Belt 5인 AI income 개선 — 작업 기록

Rust Belt 5인 cityCubes 맵에서 AI의 평균 income을 올려 음수 VP/파산을 줄이려는 작업의 분석·시도 기록.
목표 income 20 (현재 ~5.7).

## 측정 방법

- **하니스**: `src/ai/__tests__/rustBeltSimulation.test.ts` (5 AI 동기식 전체 게임 구동).
- **AI는 결정론적**: `initGame` 셋업만 시드, 이후 의사결정에 random 미사용. 따라서 어떤 변경이
  측정 수치를 정확히 동일하게 남기면 **효과 0**으로 확정할 수 있다.
- 8시드는 시드 편향이 커서 **20시드 권장** (`measure(8)`→`measure(20)` 임시 변경 후 측정).
- 모든 수정은 `activePlayers >= 3 && !trackCubes` 다인 cityCubes 한정 —
  tutorial(`fullGameSimulation` VP 9.x·파산 0/20)·St.Lucia 회귀 게이트를 반드시 보존.

## 핵심 구조 발견

### 1. 주식 보존 법칙
발행주식은 **income − expense 격차를 메우는 구조적 부채**라 거의 보존된다(20시드 9.5~10.3 고정).
"투자(엔진/건설/발행)를 줄여 주식을 줄인다"는 접근은 전부 역효과 — 펀딩을 줄이면 income이 지연되어
생존 발행이 그만큼 늘고, 총 주식은 보존되며 income만 떨어진다. **유일한 레버는 income을 더 빨리
올리는 것.** 단 income을 올리면 그 건설비만큼 건설 발행이 늘어 `income × 3` VP를 상쇄한다(5인 맵의
근본 긴장).

### 2. 패자는 boxed-out — buildTrack 조각화
승자(income 15~19)와 패자(0~4)가 이분화된다.

- **패자는 완성 트랙 6~9개를 갖고 6개 도시에 닿는데도 배달후보 0**. 닿는 도시들이 분리된 조각이라
  "큐브 도시 → 같은 색 도시" 배달 경로를 하나도 완성하지 못한다.
- 배달 income은 룰상 **2라운드/턴 고정** + 배달당 평균 1.44링크(67%가 1링크)라, **승자는 이미 배달
  포화**(배달후보 5~10개 남아돎). 평균 income을 올릴 유일한 길은 패자가 배달 가능한 연결망을 만들게
  하는 것.

### 3. 패자는 '외진 1링크'를 고른다 (경로 시퀀스 진단)
- 승자(income 19): `kansascity → desmoines → chicago` — 중앙 허브 다링크를 한 경로씩 연속 좌표로 완성.
- 패자(income 0): `minneapolis → duluth`(배달 안 되는 외진 1링크) 시작 → `duluth → chicago`를 짓다
  미완성 → `desmoines → B`로 멀리 점프, 이전 투자 전부 매몰.

조각화의 상류 원인은 **`estimateRouteVP`가 짧은 1링크 경로(buildCost 낮음 + lateCompletionPenalty
회피)를 중앙 허브 다링크보다 높게 평가**하는 것. 이를 고치려면 다링크 우대가 필요한데, "1턴 완성
최우선" 지침과 충돌한다(아래 막다른 길 8 참조 — 5인 맵에서 다링크 유도는 독).

## 적용해 커밋한 변경 (`f057329`)

**preferTowns 일관성 수정.** `vp.estimateRouteVP`·`turnPlan`·`buildTrack` 세 곳이 모두 마을 경유
경로를 평가/계획/건설하도록 통일했다. 기존엔 buildTrack만 마을 경유, vp/turnPlan은 최단 경로라
**평가 ≠ 건설 불일치**였다. 다인 cityCubes에 `trackCubes || activePlayers >= 3` 적용.

| 지표 (20시드) | Before | After |
|---|---|---|
| VP | -9.64 | -9.76 (노이즈 내 중립) |
| income | 5.46 | **5.70** |
| 파산 | 2.45 | **2.20** |
| 발행주식 | 10.07 | 10.34 |

VP는 중립이지만 income↑·파산↓ + 구조적 일관성 수정. 전체 174테스트 통과.

## 시도했다 되돌린 막다른 길 (반복 금지)

1. front-load 엔진 affordability 게이트 → VP −5.9→−11.9. 엔진 막으니 짧은 배달 → income↓.
2. "죽은 네트워크(T4+ income≤1)" 엔진 차단 → 중립~악화.
3. survivalShares>0이면 건설 발행 금지 → 주식 보존·income↓·VP −8.2.
4. buildBudget 투기 spare-slot 펀딩 제거 → 주식 오히려↑ (보존 법칙).
5. moveGoods 배달 경로를 '총링크 최장'→'내 income ΔVP 최대'(findAllPaths) → 효과 정확히 0
   (결정론적 동일 결과). 배달 경로 선택지가 거의 없음(대부분 1링크) → 천장 0.
6. selector '양끝 닿은 거의완성 배달' 부스트(+5) → 효과 0. 패자 조각이 서로 멀어 'completable
   양끝닿음' 기회 자체가 없음.
7. selector 경로커밋 강화(다인 prog≥0.5면 completable 깨져도 고수) → VP −10.45·income 5.48 악화.
   완성 불가 경로를 고집해 income↓.
8. 다링크 우대 (vp.ts 다인 maxBuildTurns 2→3턴 + lateCompletionPenalty 4→2) → VP −9.76→**−14.07
   크게 악화**, income 4.74·배달↓·파산↑. 먼 다링크 경로를 잡았다 미완성으로 끝남 — '1턴완성 최우선'을
   도입한 바로 그 이유가 재현. **5인 맵에서 다링크 유도는 독**.
9. 네트워크 확장 부스트 (selector: connected source면 ΔVP +5) → 효과 정확히 0. selector에 이미
   'connected source 우선' 로직이 있어 순위 불변. 패자가 외진 경로를 고르는 건 connected 영역의 배달
   기회가 **고갈**됐을 때(boxed-out)라, 부스트할 대상 자체가 없음.

## 결론 (2세션 누적 9개 막다른 길)

**5인 income은 단일 휴리스틱 수정으로 올릴 수 없다.** 두 근본 제약 —
① 주식 보존(income−expense 격차), ② 5인 boxed-out(패자 영역 고갈 → 외진 점프 → 미완성) —
이 selector/vp/moveGoods의 어떤 단일 노브도 보존시키거나 악화시킨다. 의미 있는 진전은 **경로 선택 +
건설 + 자금을 함께 조율하는 재설계**나 근본적으로 다른 접근(초기 영역 분할/선점 전략 등)이 필요하다.
preferTowns 일관성 수정 유지가 현실적 성과.

## 다음 큰 작업 (후보)

- **buildTrack 조각화 방지 재설계**: 패자가 한 경로(도시→매칭색 도시)를 끝까지 완성하게. 경로 커밋이
  있으나(CLAUDE.md) 실제론 조각남 — 경로가 막혔을 때 멀리 점프 대신 근처 완성 우선.
- 도시화-배달 1턴완성 결합.
- `getConnectedCities` '트랙 0개 → 빈 배열' 버그 근본 수정 (`analyzer.ts`).
