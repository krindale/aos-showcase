# Age of Steam AI 전략 시스템

## 목차

1. [시스템 개요](#1-시스템-개요)
2. [4가지 전략 시나리오](#2-4가지-전략-시나리오)
3. [단계별 의사결정](#3-단계별-의사결정)
4. [전략 선택 시스템](#4-전략-선택-시스템)
5. [보드 분석 엔진](#5-보드-분석-엔진)
6. [통합 흐름](#6-통합-흐름)

---

## 1. 시스템 개요

### 1.1 아키텍처

AI 시스템은 **이중 레이어 아키텍처**를 사용합니다:

```
┌─────────────────────────────────────────────────────┐
│                   AIPlayerManager                    │
│                    (싱글톤)                          │
├─────────────────────────────────────────────────────┤
│  AIPlayer Instance (플레이어별)                      │
│  ├── strategy (현재 전략)                           │
│  ├── routeProgress (경로 진행도)                    │
│  └── pathCache (경로 캐시)                          │
├─────────────────────────────────────────────────────┤
│  Phase Functions (단계별 결정 함수)                  │
│  ├── issueShares.ts    (I. 주식 발행)              │
│  ├── auction.ts        (II. 경매)                   │
│  ├── selectAction.ts   (III. 행동 선택)            │
│  ├── buildTrack.ts     (IV. 트랙 건설)             │
│  └── moveGoods.ts      (V. 물품 이동)              │
├─────────────────────────────────────────────────────┤
│  Strategy System (전략 시스템)                       │
│  ├── scenarios.ts  (4가지 전략 정의)                │
│  ├── selector.ts   (전략 선택/재평가)               │
│  ├── analyzer.ts   (A* 경로탐색, 상대 분석)         │
│  └── evaluator.ts  (상태 평가 함수)                 │
└─────────────────────────────────────────────────────┘
```

### 1.2 핵심 파일 구조

```
src/ai/
├── index.ts                    # 메인 API 엔트리포인트
├── evaluator.ts                # 상태 평가 함수
├── strategies/
│   ├── issueShares.ts         # Phase I: 주식 발행
│   ├── auction.ts             # Phase II: 경매 입찰
│   ├── selectAction.ts        # Phase III: 행동 선택
│   ├── buildTrack.ts          # Phase IV: 트랙 건설
│   └── moveGoods.ts           # Phase V: 물품 이동
└── strategy/
    ├── types.ts               # 인터페이스 정의
    ├── scenarios.ts           # 4가지 전략 시나리오
    ├── selector.ts            # 전략 선택 로직
    ├── analyzer.ts            # 보드 분석 (A*, 상대 분석)
    └── state.ts               # 전역 상태 관리
```

---

## 2. 4가지 전략 시나리오

게임 시작 시 AI는 보드 상태를 분석하여 4가지 전략 중 하나를 선택합니다.

### 2.1 Northern Express (북부 특급)

```yaml
우선순위: speed (속도)
목표 경로: Pittsburgh ↔ Cleveland (직선)
필요 자금: $10
최소 엔진: 2 링크
선호 행동: [firstBuild, engineer, locomotive]
```

**특징:**
- 가장 짧은 직선 경로 (2-3 트랙)
- 빠른 수입 확보, 초반 우위
- 적은 주식 발행으로 승점 보존

**적합 상황:**
- Pittsburgh-Cleveland 간 물품 큐브 존재
- 상대가 북부 진출 안 함

### 2.2 Columbus Hub (콜럼버스 허브)

```yaml
우선순위: income (수입)
목표 경로:
  - Pittsburgh → Columbus (우선순위 1)
  - Cleveland → Columbus (우선순위 2)
  - Wheeling → Columbus (우선순위 2)
  - Cincinnati → Columbus (우선순위 3)
필요 자금: $12
최소 엔진: 2 링크
선호 행동: [engineer, locomotive, firstMove]
```

**특징:**
- Columbus를 중심으로 4방향 연결
- 높은 유연성, 다양한 배달 기회
- 중기 전략으로 안정적 수입

**적합 상황:**
- Columbus 인접에 다양한 색상 물품
- 상대가 특정 방향 집중 시 우회 가능

### 2.3 Eastern Dominance (동부 지배)

```yaml
우선순위: income (수입)
목표 경로:
  - Pittsburgh → Wheeling (우선순위 1)
  - Pittsburgh → Columbus (우선순위 2)
  - Wheeling → Pittsburgh (우선순위 2)
필요 자금: $14
최소 엔진: 3 링크
선호 행동: [engineer, locomotive, firstBuild]
```

**특징:**
- Pittsburgh-Wheeling 삼각지대 장악
- 긴 경로 = 높은 수입
- 공격적 자금 투자 필요

**적합 상황:**
- Pittsburgh/Wheeling에 물품 풍부
- 동부 지역 초반 장악 가능

### 2.4 Western Corridor (서부 회랑)

```yaml
우선순위: blocking (차단)
목표 경로:
  - Cincinnati ↔ Columbus (우선순위 1)
  - Pittsburgh → Cincinnati (우선순위 2)
필요 자금: $10
최소 엔진: 2 링크
선호 행동: [locomotive, firstMove, engineer]
```

**특징:**
- Cincinnati-Columbus 회랑 선점
- 상대 서부 진출 차단
- 유연한 확장 가능

**적합 상황:**
- 상대가 동부 집중 예상
- 서부 물품 배달 기회 확보

---

## 3. 단계별 의사결정

### 3.1 Phase I: 주식 발행 (Issue Shares)

**함수:** `decideSharesIssue(state, playerId) → number`

**의사결정 로직:**

```
1. 전략별 필요 자금 확인 (requiredCash)
   - Northern Express: $10
   - Columbus Hub: $12
   - Eastern Dominance: $14
   - Western Corridor: $10

2. 예상 비용 계산
   expectedExpenses = 발행주식 수 + 엔진 레벨

3. 총 필요 금액
   totalNeeded = requiredCash + expectedExpenses

4. 부족 금액
   shortage = max(0, totalNeeded - 현재 현금)

5. 발행할 주식 수
   sharesToIssue = ceil(shortage / 5)

6. 제한 적용
   - 최대 가용: 10 - 현재 발행 수
   - 전략별 최대: speed/blocking=2, income=3
```

**고려 사항:**
- 주식 1장 = -3 승점 (게임 종료 시)
- 따라서 최소한으로 발행

### 3.2 Phase II: 경매 (Determine Player Order)

**함수:** `decideAuctionBid(state, playerId) → AuctionDecision`

**결정 유형:**

| 결정 | 설명 |
|------|------|
| `{ action: 'bid', amount }` | 입찰 |
| `{ action: 'pass' }` | 포기 (탈락) |
| `{ action: 'skip' }` | Turn Order 패스 사용 |
| `{ action: 'complete' }` | 마지막 플레이어 |

**의사결정 로직:**

```
1. 경매 시작 전
   → 현금 있으면 $1 입찰

2. 마지막 플레이어인지 확인
   → 'complete' 반환

3. 최대 입찰 한도 계산
   maxBid = 현재 현금 × 30%

4. Turn Order 행동 선택했는지 확인
   → 입찰이 maxBid의 50% 이상이면 'skip' 사용

5. 현재 입찰가 >= maxBid
   → 'pass' (포기)

6. 그 외
   → 현재 입찰가 + 1 입찰
```

**전략:**
- 보수적 입찰로 현금 보존
- 플레이어 순서보다 트랙 건설 자금 우선

### 3.3 Phase III: 행동 선택 (Select Actions)

**함수:** `decideAction(state, playerId) → SpecialAction`

**7가지 특수 행동:**

| 행동 | 효과 | AI 우선순위 조건 |
|------|------|------------------|
| First Move | 물품 이동 먼저 | 전략 선호도 |
| First Build | 트랙 건설 먼저 | 전략 선호도 |
| Engineer | 4개 트랙 건설 | 현금 ≥$6 |
| Locomotive | 엔진 +1 | 엔진 < 최소 요구치 |
| Urbanization | 마을 도시화 | 특수 상황 |
| Production | 물품 생산 | 특수 상황 |
| Turn Order | 경매 패스권 | 특수 상황 |

**의사결정 로직:**

```
1. 엔진 레벨 확인
   if 엔진 < 전략.minEngineLevel:
       return 'locomotive'

2. 전략 선호 행동 순회
   for action in 전략.preferredActions:
       if action == 'locomotive' and 이미 충분:
           continue
       if action == 'engineer' and 현금 < $6:
           continue
       if action 사용 가능:
           return action

3. 폴백: 트랙 부족 시
   if 보유 트랙 < 3:
       return 'engineer'

4. 기본 우선순위
   [firstBuild, locomotive, engineer, firstMove,
    urbanization, production, turnOrder]
```

### 3.4 Phase IV: 트랙 건설 (Build Track)

**함수:** `decideBuildTrack(state, playerId) → TrackBuildDecision`

**결정 유형:**

```typescript
{ action: 'build', coord: HexCoord, edges: number[] }
// 또는
{ action: 'skip' }
```

**의사결정 로직:**

```
1. 제한 확인
   - 이번 턴 건설 수 >= 최대 (3 또는 Engineer면 4)
   - 현금 < $2 (최소 비용)
   → 'skip' 반환

2. 목표 경로 획득
   targetRoute = getNextTargetRoute()

3. 건설 후보 탐색

   [첫 트랙인 경우]
   - 전략 목표 경로의 시작 도시에서 출발
   - 인접 헥스 중 건설 가능한 곳 탐색

   [이후 트랙]
   - 자신의 기존 트랙 끝점에서만 확장
   - 인접 헥스 탐색

   [폴백]
   - 목표 경로의 시작/끝/중간 도시에서 확장
   - 경로 점수 50 이상만 허용

4. 후보 평가

   for 각 후보 (coord, edges):
       baseScore = evaluateTrackPosition(coord)
       routeScore = evaluateTrackForRoute(coord, route, edges)
       totalScore = baseScore + routeScore × 2
       value = totalScore / 비용

5. 최고 가치 후보 선택
   - 가치 = 점수 / 비용
   - 현금 내에서 최고 가치 선택
```

**점수 계산 상세:**

| 요소 | 점수 |
|------|------|
| 최적 경로 위 | +100 |
| 다음 건설 위치 | +50 |
| 출구 엣지가 목표 방향 | +80 |
| 입구 엣지가 이전 경로 | +40 |
| 최적 경로 인접 (1헥스) | +20 |
| 최적 경로 근처 (2헥스) | +5 |
| 경로와 무관한 방향 | -50 |

### 3.5 Phase V: 물품 이동 (Move Goods)

**함수:** `decideMoveGoods(state, playerId) → MoveGoodsDecision`

**결정 유형:**

```typescript
{ action: 'move', sourceCityId, cubeIndex, destinationCoord }
// 또는
{ action: 'upgradeEngine' }
// 또는
{ action: 'skip' }
```

**의사결정 로직:**

```
1. 라운드당 이동 확인
   if 이미 이동함:
       return 'skip'

2. 목표 경로 획득
   targetRoute = getNextTargetRoute()

3. 모든 배달 가능 경로 탐색

   for 각 도시 in 보드:
       for 각 큐브 in 도시.물품:
           도달 가능 목적지 = findReachableDestinations(
               도시, 큐브.색상, 엔진레벨
           )
           for 각 목적지:
               경로 계산, 점수 평가

4. 이동 점수 계산

   baseScore = 링크 수 × 3

   경로 보너스:
   - 정확히 목표 경로 일치: +30
   - 출발/도착 일부 일치: +15
   - 전략 경로 중 하나 일치: +10

   자기 트랙 보너스:
   - 자기 트랙 사용 시: × 2 (두 배)

5. 최고 점수 이동 선택

6. 이동 불가 시
   if 엔진 < 6:
       return 'upgradeEngine'
   else:
       return 'skip'
```

**수입 계산 예시:**

```
Cincinnati → Columbus → Cleveland (파란 큐브)

링크 1: Cincinnati-Columbus (AI 소유) → AI 수입 +1
링크 2: Columbus-Cleveland (상대 소유) → 상대 수입 +1

AI 관점 점수:
- 기본: 2 링크 × 3 = 6점
- 자기 트랙 1개 사용: +보너스
- 전략 경로 일치: +30
```

---

## 4. 전략 선택 시스템

### 4.1 초기 전략 선택

**함수:** `selectInitialStrategy(state, playerId) → AIStrategy`

**점수 계산:**

```
for 각 전략 시나리오:
    score = 0

    # 물품 매칭 (가장 중요)
    for 각 목표 경로:
        if 경로.from 도시에 경로.to 색상 물품 존재:
            score += 10 × (4 - 경로.priority)

    # 자금 타당성
    if 현재 현금 >= 전략.requiredCash:
        score += 20
    else:
        score -= (requiredCash - 현금) × 2

    # 엔진 타당성
    if 현재 엔진 >= 전략.minEngineLevel:
        score += 15

    # 상대 차단 확인
    for 각 목표 경로:
        if 상대가 해당 경로 차단:
            score -= 15

    # blocking 전략 보너스
    if 전략.priority == 'blocking' and 상대 트랙 많음:
        score += 10
```

### 4.2 전략 재평가

**함수:** `reevaluateStrategy(state, playerId)`

**호출 시점:** 각 Phase 시작 전

**재평가 로직:**

```
1. 상대 트랙 분석
   opponentTargets = analyzeOpponentTracks()

2. 현재 전략 점수 조정
   feasibility = evaluateStrategyFeasibility()

   for 각 목표 경로:
       if 상대가 해당 경로 목표로 추정:
           feasibility -= 15 ~ 25
       if 상대가 이미 연결 완료:
           feasibility -= 25

3. 전략 전환 판단
   if feasibility < 30:
       새 전략 선택

   if opponentAdjustment < -20:
       새 전략 선택

4. 경로 우선순위 동적 조정
   for 각 목표 경로:
       progress = getRouteProgress()

       if progress >= 80%:
           우선순위 → 1 (급함)

       if 상대가 해당 경로 목표:
           우선순위 → 3 (후순위)

       if 해당 물품 없음:
           우선순위 → 3 (후순위)
```

### 4.3 타당성 평가

**함수:** `evaluateStrategyFeasibility() → number` (0-100)

```
score = 100

for 각 목표 경로:
    if 경로 차단됨:
        score -= 20

    if 물품 없음:
        if 경로.priority == 1:
            score -= 25
        else:
            score -= 15

if 현금 부족:
    score -= 10 + 부족액

return max(0, score)
```

---

## 5. 보드 분석 엔진

### 5.1 A* 경로 탐색

**함수:** `findOptimalPath(from, to, board) → HexCoord[]`

**알고리즘:**

```
openSet = [시작 도시]
cameFrom = {}
gScore = {시작: 0}
fScore = {시작: heuristic(시작, 목표)}

while openSet 비어있지 않음:
    current = fScore 최소인 노드

    if current == 목표:
        return 경로 복원

    for 각 이웃 헥스:
        # 비용 계산
        cost = 지형비용(이웃)  # 평지:2, 강:3, 산:4
        if 이웃이 도시:
            cost = 0

        tentative_g = gScore[current] + cost

        if tentative_g < gScore[이웃]:
            cameFrom[이웃] = current
            gScore[이웃] = tentative_g
            fScore[이웃] = tentative_g + heuristic(이웃, 목표)
            openSet에 이웃 추가

return [] # 도달 불가
```

### 5.2 트랙 위치 평가

**함수:** `evaluateTrackPosition(coord) → number`

```
score = 0

# 도시 근접성 (가장 중요)
for 각 인접 도시:
    score += 3

# 물품 도시 연결성
for 각 인접 물품 도시:
    score += 2

# 기존 트랙 연결성
for 각 인접 자기 트랙:
    score += 2

# 지형 패널티
if 강:
    score -= 1
if 산:
    score -= 2
if 호수:
    score -= 100

return score
```

### 5.3 경로 방향 평가

**함수:** `evaluateTrackForRoute(coord, route, edges) → number`

```
score = 0
optimalPath = findOptimalPath(route.from, route.to)

# 최적 경로 위인지
if coord in optimalPath:
    score += 100

    pathIndex = optimalPath.indexOf(coord)

    # 다음 건설 위치인지
    if pathIndex == 다음 건설 인덱스:
        score += 50

    # 엣지 방향 평가
    nextHex = optimalPath[pathIndex + 1]
    prevHex = optimalPath[pathIndex - 1]

    for 각 exit_edge in edges:
        if exit_edge 방향 == nextHex 방향:
            score += 80  # 목표 방향
        elif exit_edge 방향 == prevHex 방향:
            score += 40  # 입구 방향
        else:
            score -= 50  # 무관한 방향

# 최적 경로 인접
elif coord가 optimalPath에 인접:
    score += 20

# 최적 경로 근처 (2헥스)
elif coord가 optimalPath에서 2헥스 이내:
    score += 5

return score
```

### 5.4 상대 분석

**함수:** `analyzeOpponentTracks(state, myPlayerId) → Map<cityId, score>`

```
opponentTargets = new Map()

for 각 상대 트랙:
    # 트랙에서 2헥스 이내 연결 안 된 도시 탐색
    for 각 인접 도시 (2헥스 이내):
        if 도시가 상대 트랙에 연결 안 됨:
            opponentTargets[도시] += 1

# 점수가 높은 도시 = 상대의 목표로 추정
return opponentTargets
```

---

## 6. 통합 흐름

### 6.1 게임 시작 흐름

```
게임 초기화
    ↓
initializeAIStrategy(playerId)
    ↓
┌─────────────────────────────────┐
│ selectInitialStrategy()         │
│ 1. 4가지 시나리오 점수 계산      │
│ 2. 물품 매칭, 자금, 엔진 평가   │
│ 3. 최고 점수 전략 선택          │
└─────────────────────────────────┘
    ↓
전략 저장 (인스턴스 + 전역 상태)
```

### 6.2 턴 실행 흐름

```
새 턴 시작
    │
    ├── Phase I: Issue Shares ─────────────────────┐
    │   isCurrentPlayerAI() → decideSharesIssue()  │
    │   → 주식 발행 실행                           │
    │                                              │
    ├── Phase II: Determine Player Order ──────────┤
    │   decideAuctionBid()                         │
    │   → 입찰/패스/스킵 실행                      │
    │                                              │
    ├── Phase III: Select Actions ─────────────────┤
    │   reevaluateStrategy() ← 전략 재평가         │
    │   decideAction()                             │
    │   → 행동 선택 실행                           │
    │                                              │
    ├── Phase IV: Build Track ─────────────────────┤
    │   decideBuildTrack() (최대 3-4회)            │
    │   → 트랙 건설 실행                           │
    │                                              │
    ├── Phase V: Move Goods ───────────────────────┤
    │   decideMoveGoods() (2회)                    │
    │   → 물품 이동/엔진 업그레이드 실행           │
    │                                              │
    └── Phase VI~X: 자동 진행 ─────────────────────┘
        (수입 수집, 비용 지불, 수입 감소, 물품 성장)
```

### 6.3 의사결정 흐름 상세

```
getAIDecision(state, playerId)
    ↓
AIPlayerManager.getDecision()
    ↓
AIPlayer.decide(state)
    │
    ├── reevaluateStrategy()
    │   ├── analyzeOpponentTracks()
    │   ├── evaluateStrategyFeasibility()
    │   └── adjustRoutePriorities()
    │
    └── phase별 결정 함수 호출
        │
        └── AIDecision 반환
            {
              phase: GamePhase,
              action: string,
              params: {...}
            }
```

### 6.4 전략 적응 흐름

```
매 Phase 시작
    ↓
reevaluateStrategy()
    │
    ├── 상대 트랙 분석
    │   └── 상대 목표 도시 추정
    │
    ├── 현재 전략 타당성 평가
    │   ├── 차단된 경로 확인 (-20)
    │   ├── 물품 유무 확인 (-15~-25)
    │   └── 자금 상태 확인 (-10+)
    │
    ├── 전략 전환 판단
    │   ├── 타당성 < 30% → 전환
    │   └── 상대 조정 < -20 → 전환
    │
    └── 경로 우선순위 조정
        ├── 진행도 80%+ → 우선순위 1
        ├── 상대 경쟁 → 우선순위 3
        └── 물품 없음 → 우선순위 3
```

---

## 부록: 주요 상수 및 설정

### A. 점수 가중치

| 항목 | 값 | 설명 |
|------|-----|------|
| 물품 매칭 | ×10 | 전략 선택 시 |
| 경로 점수 | ×2 | 트랙 건설 시 |
| 자기 트랙 | ×2 | 물품 이동 시 |
| 링크 수입 | ×3 | 이동 점수 계산 |
| 수입 트랙 | ×3 | 승점 계산 |
| 발행 주식 | -3 | 승점 계산 |

### B. 제한값

| 항목 | 값 |
|------|-----|
| 최대 경매 입찰 | 현금 × 30% |
| Engineer 필요 자금 | $6 |
| 최대 트랙 (일반) | 3개/턴 |
| 최대 트랙 (Engineer) | 4개/턴 |
| 최대 엔진 레벨 | 6 링크 |
| 최대 발행 주식 | 10주 |
| 폴백 경로 점수 최소 | 50 |

### C. 지형 비용

| 지형 | 배치 비용 | A* 비용 |
|------|----------|--------|
| 평지 | $2 | 2 |
| 강 | $3 | 3 |
| 산 | $4 | 4 |
| 도시 | - | 0 |
| 호수 | 불가 | ∞ |

---

*마지막 업데이트: 2025-12-20*
