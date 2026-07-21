# 달 전용 알고리즘: "Moon Base 성장 연결 가치" (+조건부: 도시화 반구 배치)

## Context

달 봇은 파라미터 튜닝으로 VP −21.49 → −11.49·파산 1.50까지 왔고, 단위 액션 전수 점검 결과 기존 평가는 국소 최적에 도달했다. 남은 개선은 **달에만 존재하는 미모델링 가치**를 새 알고리즘으로 넣는 것뿐이다.

탐색으로 확인한 가장 큰 미모델링 가치: **달 성장 룰은 "낮쪽 + Moon Base와 완성 링크로 연결된 도시"만 주사위 성장을 받는데**(주사위 8개, 도시 인쇄번호 매칭 기대 ≈ 2.67큐브/성장턴), 현재 `estimateRouteVP`는 "이 경로가 어떤 도시를 시드 네트워크에 새로 잇는가"를 전혀 모른다. 즉 연결 = 미래 화물 공급 해금이라는 달 고유 VP 원천이 경로 선택에 반영되지 않는다.

**절대 제약(사용자 확정)**: 공통 알고리즘 무수정 — 모든 변경은 MapProfile 훅(기본값 = 항등) 경유. 선례: `transcontinentalVP`(가산형, vp.ts:461-475), `aiDeliveryTimingFactor`(곱셈형). 각 단계 100시드 게이트 + 전 맵 회귀 + 악화 시 롤백.

## 단계별 구현

### Stage 0 — 행동 무변경 리팩토링 (커밋 1)
`citiesConnectedToSeed(board, seedCityId)` (store/slices/goodsGrowthSlice.ts:22-42, 비export)를 **코드 그대로** `src/utils/hexGrid.ts`(findCompletedLinks 1229 근처)로 이동 + export. goodsGrowthSlice는 import로 교체(사용처 67·199 무수정). maps/는 store import 금지라 이동이 필수.
- 게이트: `npx vitest run` 전체 — 전 수치 완전 동일(순수 이동).

### Stage 1 — 훅 배관, 항등 (커밋 2)
`MapProfile.ts`(aiDeliveryTimingFactor 블록 뒤)에 가산 훅 선언:
```ts
aiRouteExtraVP(_state, _playerId, _opp: DeliveryOpportunity,
  _fullPath: HexCoord[], _deliveryStartDelay: number): number { return 0; }
```
(`DeliveryOpportunity`는 기존 `DeliveryRoute` type-only import 선례를 따름.)
`vp.ts:487-493` 합산식에 1줄 — transcontinentalVP처럼 ρ 밖 가산:
`+ profile.aiRouteExtraVP(state, playerId, opp, fullPath, deliveryStartDelay)`
selector는 무수정(deltaVP 정렬이 자동 재정렬).
- 게이트: 기본 0 = 전 맵(달 포함) 수치 완전 동일.

### Stage 2 — MoonMapProfile 구현 + 스윕 (커밋 3·4) ★핵심
`MoonMapProfile.ts`에 구현 (coveredSides WeakMap 캐시 35-52 패턴 복제):
```
connected = WeakMap(board) 캐시 ?? citiesConnectedToSeed(board, 'moonBase')
pathCities = fullPath 위의 도시들 (양 끝점 + 중간 도시 전부)
anchor 없으면(경로가 시드 연결 도시와 안 닿음) return 0        // 함정① 보수 처리
newDice = pathCities 중 MOON_CITY_DICE에 있고 미연결인 도시     // 함정③④ 동시 해결
도시별 기대 큐브 = min(남은성장턴 × 0.5(낮 격턴) × 2.67, 열 재고 + 1)
bonus = Σ 기대큐브 × MY_SHARE × VP_PER_CUBE, cap 적용
```
| 상수 | 초기값 | 스윕 |
|---|---|---|
| VP_PER_CUBE | 1.0 (배달 완전가치 6VP가 아닌 "옵션 해금" 몫만 — 배달 가치는 moveGoods가 회수) | {0.5, 1.0, 1.5, 2.0} |
| MY_SHARE | 0.4 (경쟁자도 배달 가능 — 균등 0.25 + 연결 링크 소유 이점) | {0.25, 0.4, 0.5} |
| BONUS_CAP | 4 (income 없는 연결 몰빵 차단 — 함정②) | {3, 4, 6} |

함정 방어: ①미완성 시점 판정 → anchor 근사(O(경로길이)) ②몰빵 → 훅이 배달 기회에서만 발화 + cap ③재연결 → `!connected.has` ④신도시 A~D 무성장 → MOON_CITY_DICE 키 검사 ⑤4인 몰림 → board 키 캐시(선점 즉시 보너스 소멸) + ρ 경쟁 할인.
- 게이트: 100시드 VP(−11.49 대비 **+0.3 초과**) && 파산 ≤1.55 && 성장발생턴(5.8) 비감소. 전 스윕이 +0.3 이내면 축 포기 — 커밋 3·4 revert + 훅(커밋 2)도 원상 복구.

### Stage 3 (조건부) — 도시화 반구 배치 (커밋 5, Stage 2 통과 시에만)
정정된 사실: 달 도시화는 성장 연결성을 바꾸지 않음(신도시 A~D는 무성장) — 미모델링 가치는 **밤낮 반구 배치**(이미 커버한 반구의 신도시는 격턴 죽은 목적지).
- `MapProfile.aiUrbanizeTownBonus(state, playerId, townCoord): number { return 0; }`
- `urbanization.ts` 마을 점수 루프(246행 뒤)에 가산 1줄(getMapProfile 이미 import).
- Moon 구현: `coveredSides` 재사용 — 미커버 반구 마을 +N / 커버 반구 −N, N 초기 10, 스윕 {5,10,15}.
- 게이트 동일, 악화 시 이 커밋만 revert.

## 예상 효과 (정직한 추정)
성장은 이미 5.8/8턴 발생 — dice 도시 연결은 배달 경로의 부산물로 상당 부분 일어난다. 개선분은 "동점 근처 후보에서 dice 도시 끝점을 고르는 마진". 현실적 기대 **VP −11.49 → −10.3 ~ −11.2**, 성장발생턴 5.8 → 6.3±. −9대 진입은 기대하지 않는다.

## 검증
- 각 단계: `npx vitest run src/ai/__tests__/moonSimulation.test.ts` (100시드, 시드 고정 paired 비교 — VP·파산·성장발생턴·승자분포)
- 최종: `npx vitest run` 전체(다른 맵 수치 1개라도 변하면 버그 — 즉시 중단), 관례대로 단계별 커밋·푸시(feat/moon-map), docs/ai-auction-baseline-100seed.md·CLAUDE.md·메모리 갱신.

## 핵심 파일
- src/ai/strategy/vp.ts (합산 487-493, 선례 461-475)
- src/maps/MapProfile.ts (훅 선언) / src/maps/profiles/MoonMapProfile.ts (구현 + WeakMap 캐시)
- src/utils/hexGrid.ts (citiesConnectedToSeed 이식처) / src/store/slices/goodsGrowthSlice.ts (이동 원본 22-42)
- src/ai/strategies/urbanization.ts (Stage 3, 마을 점수 246행 부근)
