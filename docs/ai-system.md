# AI 시스템 (`src/ai/`)

**AI 실행 흐름 (실제 게임)**

```
initGame/resetGame → scheduleAICheck(get) → 150ms debounce →
  isCurrentPlayerAI? → executeAITurn → getAIDecision →
  1000ms setTimeout → 결정 실행 → nextPhase → scheduleAICheck → ...
```

주의: 단위 테스트와 실제 게임(`executeAITurn`)은 다른 실행 경로를 사용하므로, AI 자동 진행 관련 수정은 `executeAITurn` 경로를 사용하는 통합 테스트(fake timers)로 검증해야 합니다. `initGame`/`resetGame` 등 상태 변경 함수 끝에는 반드시 `scheduleAICheck(get)` 호출이 있어야 첫 AI 플레이어의 페이즈가 자동 실행됩니다.

AI는 **객체 지향 아키텍처**로 설계되어 있으며, 각 AI 플레이어는 독립적인 인스턴스로 관리됩니다. 단순한 규칙 기반을 넘어 **화물 기반 동적 전략**을 사용하여 실시간으로 최적의 경로를 탐색합니다.

## AI 핵심 클래스

- **`AIPlayer`**: 개별 AI 플레이어의 생명주기와 전략 상태를 관리합니다. `decide(state)` 메서드를 통해 현재 단계에 맞는 결정을 내립니다.
- **`AIPlayerManager`**: 모든 AI 플레이어 인스턴스를 관리하는 싱글톤 클래스입니다.
- **`AIDebugger`**: AI의 의사결정 과정을 추적하고 분석 리포트를 생성합니다.

## ΔVP 중심 의사결정 (2026-06 재설계)

모든 Phase의 결정 기준을 **예상 VP 증분(ΔVP)** 단위로 통일했습니다. VP 공식(룰북): `income × 3 + 완성 링크의 트랙 구간 × 1 - 발행 주식 × 3`

**핵심 모듈**:
- **`strategy/vp.ts`**: ΔVP 환산기 (순수 함수). income +1 = +3VP, 완성 트랙 = +1VP(미완성 = 0VP), 주식 = -3VP, 현금 한계가치 λ=0.5 (스윕 측정으로 확정). 모든 튜닝 상수가 이 파일 상단에 집중.
  - `deliveryDeltaVP`: 배달 가치 (내 링크 income VP + 잔여 턴 현금흐름 − 상대 링크 페널티, N인 정규화)
  - `engineUpgradeDeltaVP`: 해금 배달 가치 × 실현확률 − 매턴 비용. 비관 시나리오 1턴 생존 시뮬레이션으로 파산 위험은 -∞ 차단
  - `estimateRouteVP`: 경로의 기대 ΔVP. **완성 불가능한 경로(시간/자금/엔진 상한)는 -∞로 원천 배제** → 산발 건설 차단. 건설 슬롯 기회비용으로 트랙VP 절반 인정
  - `incomeMarginalVP`: 수입 감소 구간(11+) 경계에서 한계가치 체감 (큰 맵 대비)
- **`strategy/mapConfig.ts`**: 엔진 상한·턴 수·턴당 건설 수·income 원천(MapAIConfig.incomeSources)을 맵 오버라이드 테이블로 주입. **AI 코드에 "tutorial이면 3" 같은 맵 분기 금지** — 새 맵 추가 시 이 테이블만 갱신
- **`strategy/turnPlan.ts`**: 턴 시작(issueShares)에 계획(목표 경로, A* fullPath, 필요 트랙/비용/현금) 수립, Phase 간 공유. 게임 리셋 시 `clearTurnPlans()` (AIPlayerManager에서 호출)

**맵 프로파일 다형성 (`src/maps/`, 2026-06)**: `mapId === 'st-lucia'` 같은 코드 전반의 문자열 분기를
없애기 위해, 맵별로 달라지는 동작(세팅·규칙·AI설정·**경로 선택 전략**)을 `MapProfile` 추상 베이스 +
서브클래스 override로 표현한다. `getMapProfile(mapId)`로 인스턴스를 얻어 다형 메서드 호출.
- `MapProfile.incomeSources` = `'cityCubes'`(표준: 출발 도시 큐브) | `'trackCubes'`(St.Lucia: 트랙 위 헥스큐브).
  analyzer는 이 목록으로 배달 기회를 생성하고, `estimateRouteVP`는 경로상 트랙 큐브 중 도착 도시 색까지
  income 원천으로 합산 — **맵 이름 하드코딩 없이** income 평가 일반화 (튜토리얼은 트랙 큐브 없어 영향 0)
- `selectTargetRoute`/`selectTopRoutes` = 헥스큐브 맵의 경로 선택을 `StLuciaMapProfile`이 override
  (기존 selector의 `hexCubeSetup` 우회 분기를 다형성으로 대체)
- 의존 방향 단방향: `maps/`는 `types/game`만 의존(저수준), AI 전략·게임 엔진이 `maps/`를 의존

**Phase별 결정**:
- `issueShares`: TurnPlan.cashNeeded 부족분만 발행. **현금 15 이상이면 계획 발행 안 함**(자금 충분), 15 미만일 때만. 생존 발행(파산 방지) 절대 우선, 마지막 턴 생존 외 발행 금지, **턴당 2주 캡**(다인 cityCubes는 생존 발행 포함 하드캡). 누적 상한(MAX_TOTAL_SHARES)은 폐지
- `auction`: **절실함 기반**(ΔVP) — 1등 가치 = (내 최선 행동 ΔVP − 차선 행동 ΔVP). `firstSeatBidCeiling`로 달러 환산(절실 미만이면 양보 $0~1, 절실하면 $2~3 바닥). 절실할 때만 적극 입찰 → 평범한 턴은 모두 양보해 경매 규칙상 순서가 자연 순환. `rankActionsByDeltaVP`(selectAction)를 재사용(turnOrder 행동 제외). 건설 예산·운영비 절대 침범 금지(파산 방지 안전판). St.Lucia 교대 선공권은 매턴 비용 구조라 바닥 없는 보수 환산(`floor(절실함/λ)`)
- `selectAction`: 행동별 ΔVP 랭킹 (engineer=완성 가능/조기화/다음 경로 착공, locomotive=해금 배달 가치, firstMove/firstBuild=경합 감지 기반, **turnOrder=`evaluateTurnOrder` 순서 탈환 가치**=내 순번이 뒤일수록↑·꼴찌 최대). 순서 고착을 사람처럼 Turn Order 행동으로 자연 해소
- `buildTrack`: 경로 커밋 + 결정론적 경로 추적(`tryDirectPathBuild`). 후보 경로(목표 → 상위 우선순위 → 네트워크 확장)를 순서대로 시도, 전부 실패 시 skip (미완성 트랙 = 0VP). **건설 차례에 이전 경로 재평가**(`resolveTurnRoute`): 다인 cityCubes에서 턴 시작에 잡은 경로가 다른 플레이어 건설로 막혔으면(`estimateRouteVP().completable=false`) 고집하지 않고 재평가 — 막힌 경로에 미완성 트랙 흩뿌림 차단
- `moveGoods`: 배달 vs 엔진 업그레이드 vs 스킵을 동일 ΔVP 단위로 비교. 상대만 이득인 배달(ΔVP≤0)은 스킵

**확장성 (큰 맵 대비)**:
- 정밀 평가(A* 포함)는 사전 점수 상위 K=8개만 — 결정당 A* 호출이 맵 크기와 무관하게 O(K)
- 상대 평가는 opponents 배열 순회 + 1/(N-1) 정규화 (2인 가정 없음)
- cap/가중치는 보드 상태(매칭 큐브 수, 남은 턴)에서 유도

**VP 회귀 베이스라인** (fullGameSimulation.test.ts, 고정 시드 20개):
- 재설계 전 3.80 → 재설계 후 **9.30** (accurateVP 평균), 완성 트랙 비율 80%→84%, 파산 0건 유지
- 각 변경은 `평균 VP ≥ 베이스라인 - 1` 게이트를 통과해야 함. 단계별 이력은 테스트 파일 주석 참조

## AI 디버깅 시스템

개발 모드에서 브라우저 콘솔을 통해 AI의 생각을 실시간으로 훔쳐볼 수 있습니다.

```javascript
// 주요 사용법 (브라우저 콘솔)
debugAI(state, "player2");       // 특정 플레이어의 모든 결정 분석
getAIReport();                   // 현재 게임 상태에 대한 종합 AI 리포트
debugStrategy("player2");       // 현재 전략 및 경로 분석 상세
debugPaths("player2");          // 최적 경로 탐색 결과 시각화
```

## 로그 카테고리별 On/Off 토글

`window.DEBUG_CONFIG` 또는 헬퍼 함수를 통해 로그 출력을 제어할 수 있습니다.

| 카테고리 | 설명 | 기본값 |
| :--- | :--- | :---: |
| `preparation` | issueShares, auction, selectActions | OFF |
| `trackBuilding` | 트랙 건설 결정 및 후보 평가 | ON |
| `goodsMovement` | 물품 운송 결정 | OFF |
| `turnEnd` | 정산/수입감소/턴 종료 | OFF |
| `verbose` | 경로 탐색, 연결 확인 등 상세 로그 | OFF |
| `aiEvaluation` | AI 평가(트랙 점수/전략 평가 등) | ON |

```javascript
// 콘솔 헬퍼 함수
showDebugConfig();                   // 현재 설정 상태 확인
setDebug("trackBuilding", true);     // 특정 카테고리 on/off
setAllDebug(true);                   // 모든 로그 on/off
```

## 종합 액션 로깅 (logAction)

위 토글과 **별개로**, 모든 게임 액션을 `logAction`(debugConfig.ts)이 **토글과 무관하게 항상**
구조화 JSON 한 줄로 기록한다. 출력: `[game:<sessionId>] {"t":"buildTrack","c":"trackBuilding",...}`.
- 게임 시작/리셋 시 짧은 세션ID 부여(`newLogSession`) — 여러 게임이 섞여도 prefix로 구분
- `category`("c" 필드)는 끄는 스위치가 아니라 `:3999`에서 grep 필터링할 분류 라벨
- `level:'error'`면 `console.error`로 출력 (오류만 추출 가능)
- GamePageClient의 콘솔 미러가 이 줄을 localhost:3999로 전송 → 로그만으로 게임 진행/오류 추적

**디버깅 워크플로우(중요)**: 개발 서버 실행 중에는 화면 묘사 대신 **항상 :3999 로그 서버에서 로그를 확인**하며
원인을 추적한다(예: "AI가 철도를 이상하게 건설" → `"c":"trackBuilding"` grep). 로그는 **메모리 버퍼**라
**로그 서버를 죽이거나 재시작하면 이전 게임 로그가 전부 사라진다 — 절대 재시작 금지**, 읽기만 할 것.
버퍼에 없는 이전 로그는 브라우저 DevTools 콘솔에 원본이 남아있어(미러는 orig 출력 후 전송) 새로고침 전이면 복구 가능.

## AI 트랙 건설 로직 (상세)

- `tryDirectPathBuild` (buildTrack.ts): A* 최적 경로(상대 트랙 회피, 자사 트랙 0.1 우대)를 따라
  frontier(출발지에서 연속된 자사 트랙 끝) 다음 칸에 정확한 엣지로 건설
- **첫 트랙 방향(2026-06-18)**: 자사 트랙이 없을 때 경로가 `마을→도시` 방향이면 source/target을
  교환해 **도시 끝에서부터** 건설한다. 첫 트랙은 도시 인접만 허용되므로(정규 룰), 마을 쪽부터
  깔면 `validateFirstTrackRule` 실패로 skip된다 (St. Lucia 1턴 도시화 후 건설 안 되던 버그)
- 엣지 비호환/실패 좌표는 avoidCoords에 넣어 최대 3회 재탐색
- 상대 단순 트랙 위 복합 트랙(교차/공존) 건설 처리 포함
- 점수 기반 후보 평가 시스템(evaluateTrackForRoute 매직넘버 체계)은 2026-06 재설계에서 제거됨
  — evaluateTrackForRoute는 콘솔 AI 디버거(debugAI, debug/collectors) 용도로만 잔존 (analyzer.ts)

## St. Lucia 맵 구현 (2026-06-12, feature/st-lucia-map)

공식 맵 PDF(`maps/aos-st_lucia.pdf`) 픽셀 측정으로 재구성한 2인 전용 8턴 맵.

- **맵 데이터** (`src/utils/stLuciaMap.ts`): 도시 0(도시화로만 생성), 마을 11, 산 10, 강 9.
  원본은 flat-top 보드 — 데이터는 전치 좌표로 저장(인접 동형, 게임 로직 무변경),
  렌더만 `orientation: 'flat'`으로 기하 함수들이 전치 (`hexToPixel` 등의 `flat` 파라미터)
- **맵 룰 분리** (`src/utils/mapRegistry.ts`의 MapRuleConfig): `skipGoodsGrowth`,
  `alternateTurnOrder`(경매 대신 교대 선공권 $5), `firstSeatCost`, `disabledActions`
  (production/turnOrder), `hexCubeSetup`(헥스 위 큐브 38개, 마을 제외),
  `forceFirstTurnUrbanization`(AI가 1턴에 무조건 도시화 — 아래 첫 트랙 규칙의 전제).
  **게임 엔진에 mapId 분기 금지** — 플래그만
- **첫 트랙은 도시 인접만** (정규 룰, BGG 디자이너 Ted Alspach 공식 답변): St. Lucia는
  시작 도시 0개라 **1턴엔 Urbanization을 선택해 도시를 만든 플레이어만 (그 도시 인접) 건설** 가능.
  도시화 못한 플레이어는 1턴 건설 불가(룰상 정상, 의도된 불이익). 2턴부터 도시 존재 → 정상.
  → AI는 `forceFirstTurnUrbanization && currentTurn===1`이면 `selectAction`에서 도시화 강제.
  (구 `townsAnchorFirstTrack`/`allowTownAnchor` 마을 앵커 허용은 룰 위반이라 **제거됨**)
- **트랙 큐브 배달**: 트랙 위 큐브를 미완성 링크여도 같은 색 도시로 배달 (`findTrackCubeDeliveries`).
  수입은 시작 구간(미완성이어도) 소유자 +1 **그리고** 이후 경유하는 완성 링크마다 일반 규칙대로
  소유자 +1 (예: 구간→마을→도시 = +2). UI는 `selectCube('track:<id>')` 컨벤션
- 튜토리얼(경매/물품성장 O)과 St. Lucia(선공권/헥스큐브 O) **양쪽 헤드리스 완주 검증 필수**

## St. Lucia AI 수익 개선 (2026-06, feature/st-lucia-ai-income)

헥스큐브 맵에서 AI의 income/VP가 음수에 머무는 문제를 라이브 플레이 분석으로 단계 개선.
**모두 trackCubes 맵(St.Lucia) 한정 — tutorial VP 회귀 게이트 보존.**

- **트랙 큐브 배달 경로 (`findTrackCubeDeliveries`, hexGrid.ts)**: 트랙 위 큐브를 같은 색 도시로
  배달, 다른 색 도시는 통과, **엔진 레벨(링크 수) 제한**, 자기 철도 우선 경로.
  분기 탐색의 visited를 **전역 → per-path(복사)** 로 수정 — 공유 허브를 한 경로가 먼저 지나도
  다른 경로(내 트랙만으로 가는 최적 경로)가 막히지 않게 함 (income 8.0→9.6의 핵심 버그).
  엔진 초과로 닿는 도시도 `reason:'engine-exceeded'`+`requiredEngine`으로 로그 노출.
- **route-aware 마을 가닥 (`tryDirectPathBuild`/`hasPendingFreeSpur`, buildTrack.ts)**: 경로가
  마을을 지날 때 들어온 변 가닥을 먼저 짓고 다음 타일로 진행. 3/3 마지막 타일이 마을에 새 변을
  연결하면 빌드 페이즈가 끝나기 전 무료 가닥(0카운트)으로 같은 턴에 메움(현금 가드로 루프 차단).
- **엔진 타이밍 정책 (moveGoods/selectAction)**: front-load(초반 수송 1개 포기로 엔진 3) →
  T4 이후 move-round 엔진업 금지(엔진은 Locomotive 액션으로만) → T6+ 엔진 4 floor는
  "4링크+ 배달 가능한 깊은 큐브가 있을 때만"(얕은 게임 비용 낭비 차단).
  단 front-load는 **파산 확정이 아닌 경우에만** — 치명적 디폴트 가드(`engineUpgradeShortfall.bankrupt`)가
  T1 저현금(cash $3~8·income 0) front-load를 차단하며, 측정상 개선(파산 18→15, VP −23→−19)이라 정책 확정.
- **도시화 가치 (`evaluateUrbanizationForTrackCubes`, selectAction)**: 도시화 가치를 "아직 도시
  없는 색의 큐브 수"(배달 목적지 확충)로 산정 + **도시 수 체감(decay)** (도시 2개→×0.7, 3개→×0.4,
  4개+→×0.3) — 도시가 충분하면 도시화 남발 대신 라인 확장·깊은 배달 우선.
- **깊은 배달 보상 (selector)**: depthBonus(매칭색 도시에서 먼 큐브 우선)로 긴 체인 유도.
- **후반 파산 차단 (issueShares)**: 마지막 2턴(T7-8) 건설 목적 발행 금지(배달 회수 턴 부족 → 순수 빚).
  생존 발행은 유지.
- **화물 클릭 경로 하이라이트 (selectCube/GameBoard)**: 트랙 큐브 클릭 시 도달 가능 도시 중
  최적 경로(상대 철도 적은→링크 긴 순)를 `ui.movePath`에 설정 → 골드 점선 표시.
- **측정 하니스 (`stLuciaSimulation.test.ts`)**: St.Lucia 2 AI 동기식 전체게임 러너 +
  수익/건설 깔때기(배달·미배달·건설·도시화·완주턴) + 진단 지표(배달 깊이/체인 지원/최고 엔진).
  베이스라인 측정(통과) + 목표 게이트(skip). 누적 결과(20시드): VP −21.8→**+3.8**, income→10.8,
  파산 17→7. tutorial VP 회귀 불변.

## Rust Belt 5인 AI income 개선 (2026-06-22, VP −5.09→+4.13 첫 양수)

5인 cityCubes 맵 AI를 income ~0.6·파산 4.4/5에서 **VP +4.13·income 8.59·파산 1.50·전원완주(20/20)**로
개선(20시드). 모두 **다인(activePlayers>=3) cityCubes 한정** — tutorial(2인)/St.Lucia(trackCubes) 회귀
게이트(VP 9.x, 파산 0/20) 보존. 측정 `rustBeltSimulation.test.ts` — ⚠️ **5인은 편차가 −45~+73로 극심
→ 반드시 20시드 이상으로 측정**(8시드는 노이즈로 결론이 뒤집힌다, 실제로 ②·혼잡거리가중을 오판했음).

**핵심 메커니즘 (효자 순, 전부 사용자 직관):**
- **★ 거점분산 (selector.assignHomeBases + AREA_BIAS_WEIGHT)**: 게임 시작 시 큐브 많은 도시를
  farthest-first로 각 AI에 분산 배정(서로 가장 멀리 + row 분산), 경로 점수에서 거점 먼 출발지를 감점해
  자기 영역에 머무름(boxed-out 충돌 완화). 6구획 그리드 명시분할은 빈곤구획 거점으로 악화(−7.54) → farthest가 최적.
- **★ 도시 금지 (selector.allScoredOpps)**: 경로의 출발/도착 도시가 **다른 활성 플레이어 currentRoute의
  from/to와 겹치면 score=−Infinity**. 순차 결정이라 앞 AI가 잡은 도시를 뒤 AI가 회피 → 매 턴 경로 겹침을
  직접 차단(3명이 같은 화물에 몰리던 문제 해결). 전부 금지 시 opportunities[0] fallback(빈 위험 없음).
- **★ 분리 산발 금지 (buildTrack candidateRoutes)**: 출발·도착 둘 다 내 connectedCities에 없는 경로는
  skip(내 트랙 있을 때만, 첫 건설 예외) → 분리된 새 도시 시작 = 미완성 공용화 산발 차단, 한 덩어리 성장.
- **혼잡 회피 (selector)**: 출발지 근처(거리<5) 다른 플레이어 '명 수'만큼 점수 차감(거리가중 아닌 카운트).
- **교차 트랙 배달 버그 수정 (hexGrid checkConnectionToCity/getConnectedNeighbors)**: 교차트랙
  secondaryEdges를 무시해 완성링크 오판→소유권 제거→공용철도 이동차단(보라화물 미배달)을 수정. `crossingDelivery.test.ts`.
- **도시화 placement (AIPlayer.decideUrbanizationPlacement)**: 목표 경로/내 철도에 연결된 마을 우선
  (배달 가능 도시화). 연결성을 큐브 보너스보다 우선.

**기존 유효 정책 (유지):** 장거리 경로 지속(완성 가능 경로 고수, completable 필수)·1턴완성 우선
(vp lateCompletionPenalty, timeFeasible 2턴)·마을·도시 경유 income(A* −1.5 보너스, links=실제 경유 수)·
엔진정책(T4 front-load 엔진3, T5+ Locomotive로만 엔진4).

**시행착오 교훈**: ②"경로 전환차단"(흩뿌림 방지)은 −5 악화 — 흩뿌림(1타일)이 skip보다 income 유리.
"분리 산발 금지"는 메모리에 −17 악화 기록이 있었으나 **도시금지로 분산된 뒤엔 +1.2 개선** — 악화 기록도
선행조건(여기선 분산)이 바뀌면 뒤집힌다, 막다른길을 영구 배제 말 것.

남은 작업: income 천장(목표 20) 향해 "도시화한 도시로 즉시 배달 + 1턴완성 결합", Engineer 4칸 건설을
완성 판정에 반영. (`getConnectedCities` 트랙0 빈배열은 의도된 동작으로 확정 — 전 도시 반환 시
연결성 보너스가 무의미해짐, analyzer.ts 주석 참조)

## Germany 맵 구현 (2026-06-22, feature/germany-map)

공식 맵 PNG(`public/maps/germany.png`)를 색상 자동검출 + 테두리 자기상관 격자 피팅으로 추출한
**4인 전용 8턴** 맵. 도시 13 + 외국 터미널 6 + 마을 14.

- **flat-top 보드 (중요)**: 헥스가 flat-top(평평한 윗변)이다. St.Lucia/Rust Belt와 동일하게
  **전치 저장(데이터 col=화면세로, row=화면가로) + `orientation:'flat'` 렌더**. 데이터 그리드 15×13.
  ⚠️ 헥스 방향은 **테두리 자기상관**(가로/세로 주기 비 ≈0.86=flat, 1.155=pointy)이나 헥스 크롭으로
  확정할 것 — pointy로 오판하면 격자가 2배 부풀려져 "전혀 다른 맵"이 된다(실제 겪음).
- **맵 데이터** (`src/utils/germanyMap.ts`): 빈 외곽은 `lake`+`hideLakeHexes`로 안 그려 국경 윤곽 표현.
  빈 상단 2칸은 col −2 평행이동으로 제거(odd-r 인접 무변경). 도시 주사위번호(=화면 표시+물품성장)는
  원본대로: 1 München·Zürich / 2 Nürnberg·Stuttgart / 3 Essen·Düsseldorf / 4 Oldenburg·Wien /
  5 Hannover·Dresden / 6 Königsberg·Breslau.
- **외국 터미널 6** (`City.isTerminal`): 셋업때 무작위 큐브1로 수용색 결정(통과 불가·생산 안 함·
  배달 출발 아님). gameStore 셋업 분기 + hexGrid 3개 DFS에 통과금지 + columnMapping에서 제외 +
  analyzer `analyzeDeliveryOpportunities` 제외.
- **헥스 고정비용** (`HexTile.fixedCost` €6~€12): 지형 기본비용 대신 사용. gameStore `buildTrack` +
  analyzer 비용 2곳(`getTerrainCost`/`getTerrainBuildCost`). GameBoard에 박스+숫자로 표시(도시 번호 원과 통일).
- **Engineer 절반 비용** (`MapProfile.engineerHalfCost` + `phaseState.engineerHalfUsed`, 빌더마다 리셋).
- **미완성 링크 금지** (`MapProfile.requireCompleteLinks`): AI buildTrack 첫 착공 시 이번 턴 슬롯으로
  완성 가능한 경로만(`countMissingTrackHexes` 게이트).
- **Berlin 매 턴 무작위 물품 1개** (`MapProfile.bonusCityCubeId='berlin'` + growGoods).
- **도시 직결 링크** (`BoardState.directLinks`/`DirectLink`, Essen↔Düsseldorf $2): 두 도시가 직접
  인접(변 공유)이라 사이 헥스가 없어 일반 트랙으로 못 이음 → `buildDirectLink` 액션(건설1카운트),
  `getConnectedNeighbors`에 직결을 도시 이웃으로(이동/완성/배달 자동 반영), `completeCubeMove` 직결구간
  income+1, GameBoard 골드점선+$2원 클릭건설. **AI는 직결 미사용(사람 전용)**. 룰북: "$2, 흰색 원 소유 마커".
- **측정** (`germanySimulation.test.ts`, 20시드): VP +14.88, income 11.2, 파산~1명/4, 8턴완주.
  tutorial/St.Lucia/Rust Belt VP 회귀 게이트 보존. 남은 작업: AI 직결 활용·파산률 밸런싱·강 표현 연속성.

**Germany 추가 규칙·동작:**
- **미완성 링크 금지 강제(엔진)**: AI 첫착공 게이트뿐 아니라, 각 플레이어 트랙 건설 종료(buildTrack
  단계 전환) 시 `removeIncompleteNewTracks`로 이번 턴 신설 미완성 트랙 제거+비용 환불(딸린 마을 가닥도).
  AI·사람 모두 보드에 미완성 트랙이 안 남는다(requireCompleteLinks 맵 한정).
- **★ 완성 링크 판정(모든 맵)**: `checkConnectionToCity`는 미도시화 마을을 **진입 변에 townSpur가
  있을 때만** 연결로 인정한다(도시는 모든 변). ⚠️ 가닥 없이 닿기만 해도 연결로 보면 dangling 트랙이
  완성으로 오판된다.
- **Engineer 절반비용**: 평지($2)에 낭비 말고 `cost > PLAIN_TRACK_COST`인 비싼 헥스에 우선 적용.
- **직결 링크 클릭**: 도시 위 레이어 + 투명 히트영역(도시 헥스가 클릭을 가로채지 않게). `germanyDirectLink.test.ts`.
- **Berlin 시작 큐브 2개** (룰북 "each other City" = 2) + 매 턴 물품성장 보너스 1개(`bonusCityCubeId`, `growGoods` 안 `[Berlin 보너스]` 로그). `germanyBerlin.test.ts`.
- **Berlin 회색 렌더**: `MapProfile.grayRenderCityId`(Germany만 'berlin') — 회색 헥스는 **순수 시각
  속성**으로 보너스 규칙(`bonusCityCubeId`)과 분리한다. 둘을 묶으면 같은 보너스 필드를 쓰는 다른 맵
  도시(예: Southern US Atlanta, 빨강)까지 회색이 된다.
- **도시 주사위번호 원본대로**(columnMapping.diceNumber): 화면 표시+물품성장 결정. 1 München·Zürich…6 Königsberg·Breslau.
- **도시 큰 라벨**: 번호 있으면 번호, 없으면 city.id, 단 터미널/Berlin(풀네임)은 생략(GameBoard 전역).
- **액션 UI**: 독일 Engineer 설명을 "트랙 1개 절반 비용"으로 표시(engineerHalfCost).

**UI 공통 동작:**
- **Production 패널**: 우하단 고정 패널(디스플레이를 가리지 않고 직접 클릭 — 전체화면 모달 금지).
- **이동/AI건설 미니 오버레이** (`MoveCubeOverlay`): 세로로 긴 맵(독일/세인트루시아)에서만, 화물 이동·AI 철도건설 중
  전체 맵을 **우측에 작게**(fit) 띄워 진행을 보여줌. 왼쪽 메인 지도는 안 가림. 가로 넓은 맵(Rust Belt 등)은
  종횡비(`calculateBoardDimensions` height>width) 자동 판정으로 끔. GameBoard `fitOverlay` prop(비인터랙티브 fit).

## Western US 맵 구현 (2026-06-22, feature/western-us-map)

공식 맵 PNG(`public/maps/western-us.png`, 3368×2382)를 색상 검출 + 헥스 내부 라벨링(면적 ~33020px) +
행/열 클러스터링으로 추출한 **6인 전용 6턴** 맵. 도시 12 + 마을 20.

- **pointy-top 네이티브 (중요)**: Rust Belt/Germany(flat-top 전치)와 달리 **전치 없이 그대로 저장**,
  `orientation:'pointy'`(기본). ⚠️ 원본은 **even-r 오프셋**(짝수행 우측 시프트)인데 엔진은 odd-r →
  추출 시 `engine_row = data_row + 1`로 패리티 정렬(맨 위 row 0은 비어 lake). 유효 좌표 col 0~13, row 1~13.
  헥스 방향은 **바운딩박스 가로/세로 비**로 확정(H>W=pointy) — 육안만으로 판단 말 것(실제로 오판했음).
- **맵 데이터** (`src/utils/westernUsMap.ts`): 서부 시작도시(Seattle/SanFrancisco/LosAngeles, region:'west'),
  동부 시작도시(Duluth/Minneapolis/DesMoines/StLouis/Memphis/Vicksburg/NewOrleans, region:'east'),
  중앙 비시작(SaltLakeCity/Denver, region 없음 — 트랙 시작 불가). 미시시피 강 6칸·우하단 늪·좌중앙 산악.
- **특수룰은 전부 `WesternUsMapProfile` getter로 주입** (mapId 분기 없음):
  - **마을 큐브** (`townCubeCounts` 모든 마을 1) + **시작 현금 $20** (`startingCash`) — gameStore 셋업 분기.
  - **지형 비용** 늪/강 $4·산 $5 — Germany처럼 헥스 `fixedCost`로 주입(모든 비용 헬퍼가 자동 적용, swamp 지형 추가).
  - **동↔서 배달 +$1** (`regionDeliveryBonus`) — completeCubeMove income 정산 + AI(moveGoods/vp) ΔVP 가산.
  - **마을 큐브 배달** (`incomeSources`에 `'townCubes'`): 마을을 도시처럼 출발점으로 `selectCube('town:<id>')`
    컨벤션(St.Lucia `track:` 패턴 모방), 일반 'move' 액션으로 실행. AI는 moveGoods 마을 후보 + vp 경로상 마을큐브 가산.
  - **시작 도시 제한** (`startingCitiesOnly`/`isStartingCity`): 첫 트랙은 서부/동부 시작도시 인접만
    (Denver/SLC/신도시 제외). `validateFirstTrackRule(allowedCityIds)` + AI tryDirectPathBuild 시작도시 끝 앵커.
  - **연속성 강제** (`requireContiguousUntilTranscontinental`): 대륙횡단 전까지 새 트랙은 내 네트워크에 연속
    (`validateTrackConnection(requireNetwork)` — 내 네트워크 안 닿은 도시 시작 금지). `PlayerState.transcontinental`로 해제.
  - **대륙횡단 연결 보너스** (`transcontinentalBonus`): 서부↔동부 시작도시 최초 연결(완성 링크 BFS) 시 1회
    income 보너스(1철도+$4/2철도각+$2), `computeTranscontinental`(gameStore). 건설/가닥 후 `applyTranscontinental` 호출.
  - **도시화 특례** (`newCityRegion`): KansasCity→east, SanDiego/Portland→west (배달/대륙횡단 판정). 단 신도시는 시작도시 아님.
- **측정** (`westernUsSimulation.test.ts`, 12시드): VP ~10.2, income ~9.0, 건설 ~59/배달 ~36/도시화 6, 파산 ~1.7명/6, 6턴완주.
  tutorial/St.Lucia/Rust Belt/Germany VP 회귀 게이트 보존. 남은 작업: 파산률↓·AI 대륙횡단 적극 활용·도시 region 표식 UI.

## Korea 맵 구현 (2026-06-23, feature/korea-map)

Age of Steam 확장맵 3 — 한국 (Martin Wallace 2004 / James Mathias 아트 2018). 공식 맵 시트
(`maps/korea-v2.1.pdf` → `out/maps/korea.png`, 2381×3367)를 색상검출 + 테두리 자기상관 격자 피팅
(피치 row 174 / col 200, 홀수 row 아래로 +100)으로 추출한 **4인 전용 8턴** 맵. 도시 14 + 마을 16.

- **flat-top 보드**: Germany/Rust Belt/St.Lucia와 동일하게 **전치 저장**(데이터 col=화면세로 0~16,
  row=화면가로 0~13) + `orientation:'flat'` 렌더. ⚠️ 가로/세로 피치 비 0.866 = flat 확정(pointy로 오판
  말 것). 검증: SUWON{col5,row4}이 odd-r 규칙으로 INCHEON{col4,row3}=NW·SEOUL{col4,row5}=SW에 인접.
- **★ 동적 도시 색상 (시그니처, 모든 맵에 영향 없는 헬퍼)**: 도시는 고정색이 없고 **수요색 = 현재 놓인
  큐브색**. 빈 도시는 수요 없음(통과 가능), 같은 색 큐브 있는 도시는 통과 불가(거기서 배달 종료).
  - `BoardState.dynamicCityColors` 플래그(`createKoreaBoardState`가 set) + `cityAcceptsCube(city, color,
    board)` 헬퍼(hexGrid.ts) = `board.dynamicCityColors ? city.cubes.includes(color) : city.color===color`.
    **비-한국 맵은 정확히 기존 `city.color===color` 동작** → 회귀 게이트 보존(핵심).
  - 치환 지점: hexGrid 배달 경로탐색 4곳(blocker/목적지/stop) + analyzer 2곳(findDestinationCities/경로유효).
    **`moveGoods`(gameStore)는 목적지 재검증 없음** — 경로탐색이 보증하므로 정산 코드 무변경.
  - 렌더: GameBoard는 동적 맵 도시를 회색 헥스로 그리고 수요색은 하단 큐브로 표현(신도시도 회색).
- **셋업**: 평양 4 / 부산·인천 3 / 나머지 2 (`cityCubeCounts`).
- **수원 직결 링크**: 수원-서울 $2, 수원-인천 $2 (Germany `directLinks` 인프라 재사용 — 추가 엔진 코드 0).
- **도시화 디스플레이 보충** (`urbanizeFromDisplayCount=2`): 신도시 칸(A~H)의 큐브 2개를 신도시에 놓고
  빈 칸을 주머니에서 보충 (gameStore `placeNewCity`). 신도시 수요색이 이 큐브로 결정. 도시화 취소 시
  복원 위해 `UndoSnapshot`에 `goodsDisplay` 추가.
- **평양·수원 no-growth** (`noGrowthCityIds` + columnMapping 제외): 물품 성장 단계에서 새 물품 안 받음.
- **측정** (`koreaSimulation.test.ts`, 8시드): VP 23.38, income ~12, 건설 44/배달 41/도시화 8,
  파산 0.88명/4, 8턴완주(8/8). tutorial/St.Lucia/Rust Belt/Germany/Western US VP 회귀 게이트 보존.
  동적색 단위검증 `koreaDynamicColors.test.ts`(cityAcceptsCube + 직결 인접성).
- **동적색 함정(코드리뷰 발견)**: 배달 실행(hexGrid/analyzer)뿐 아니라 **AI 경로 평가**(vp.ts
  estimateRouteVP, buildTrack.ts resolveTurnRoute)도 도시 수요색을 봐야 한다. 처음엔 이 둘이
  `targetCity.color`(고정 placeholder)로 비교해 한국 경로를 오판(VP 13.75) → `cityAcceptsCube`로
  통일 후 VP 23.38. 새 동적색 맵 추가 시 "도시색 매칭" 전 지점을 cityAcceptsCube로. 남은 작업: 범례 위치 미세조정.

## AI 순서 순환 + 도시화/경로 정밀화 (2026-06-24, feature/ai-urbanization-blocked-edges)

다인 맵에서 순서 고착(특정 player-index 독식)·엉뚱한 도시화·막힌 변 통과 경로를 개선.
**측정은 모두 100시드** ([`docs/ai-auction-baseline-100seed.md`](ai-auction-baseline-100seed.md) 표와 비교).

- **경매 절실함 입찰 (auction.ts + vp.ts)**: ΔVP 직접환산 → **절실함(최선−차선 행동 ΔVP)** 기반으로 재설계.
  상수는 vp.ts 상단 집중: `DESPERATION_BID_THRESHOLD`(1.5 미만이면 양보)·`FIRST_SEAT_BID_FLOOR/CAP`($2~3)·
  `DESPERATION_BID_SAT`(2.5). "절실할 때만 적극, 평범하면 양보" → 경매 규칙상 순서 자연 순환.
- **Turn Order 행동 전략화 (selectAction.ts `evaluateTurnOrder`)**: 룰북 정식 행동(무료 패스 1회)을
  사람처럼 — 뒷순번일수록 가치↑. 단 `TURN_ORDER_SEAT_VP=0.1`(**거의 끔이 최적**, 100시드 전구간 스윕 결론:
  0.3~0.4는 작동하나 VP 악화+독식 재현, 0.1이 단조편향 해소+VP 최고). 잔존 편향은 경매 순서/거점이 원인.
- **건설 차례 경로 재평가 (buildTrack.ts `resolveTurnRoute`)**: 위 Phase별 결정 참조 — 인터랙션 게임에서
  남의 건설을 100% 예측 못 하니 내 차례에 현재 보드로 completable 재확인.
- **도시화 색/위치 정밀화 (AIPlayer.ts `decideUrbanizationPlacement`)**:
  - 타일 색 = "내 철도에서 픽업 가능한(≤3) 화물색" 중 **그 색 목적지가 멀거나 없는 색** 우선
    (`colorScore` = cargo×2 + 목적지거리보너스). 가까이 같은 색 도시 있으면 목적지 중복 → 후순위.
  - 한국(동적색+`urbanizeFromDisplayCount`>0)은 신도시 수요색이 tile.color가 아니라 **그 타일 칸(A~H)에서
    옮겨올 디스플레이 큐브**로 정해짐 → `expectedColorsOf`가 columnMapping+goodsDisplay로 예상 수요색 산출.
  - 마을 위치 = **이번 턴 연결 가능 범위(남은 건설 슬롯 수) 안의 마을만** 후보, 가까울수록 가점.
    범위 밖이면 도시화 보류(`return null`) — 엉뚱한 먼 곳에 안 만든다.
- **blockedEdges 경로 회피 (hexGrid.ts `isBlockedEdge` + analyzer.ts)**: 건설 불가 경계 변(한국 산맥)을
  A* 경로탐색 2곳(`findOptimalPath`/`findOptimalPathAvoidingOpponent`)에서 원천 회피 — 막힌 변 통과 경로를
  짜면 건설 단계에서 거부돼 슬롯 낭비. **`isBlockedEdge`는 게임 엔진(gameStore `crossesBlockedEdge`)과
  공유**(코드리뷰에서 gameStore의 중복 `isBlockedEdgePair` 제거하고 hexGrid 함수로 통일).
- **Korea 거점/경로겹침 보정 (selector.ts)**: 동적색 맵은 ① 거점 묶기(AREA_BIAS) 끔(부산 고립우위/평양
  현금난 운빨 제거), ② 경로 겹침을 완전차단(-∞) 대신 **감점**(`DYNAMIC_MAP_OVERLAP_PENALTY=6`) — 중앙 거점
  플레이어 경로 고갈 방지로 승률 분포 균등화. **다른 cityCubes 맵은 완전차단 유지**(Rust Belt 도시금지 핵심 보존).

## Western US AI 골고루 개선 (2026-06-25, feature/western-us-village-cube)

서부 미국 6인에서 "1·2·3등이 player-index로 고착"(앞3 VP ~30 vs 뒤3 ~0)을 해결. 진짜 원인은
경매 순번·거점이 아니라 **일부 AI가 첫 턴에 완성 불가능한 먼 경로에 미완성 트랙을 깔아 파산**하거나,
**자기 도시 화물 소진 후 갇혀 정체**하는 것이었다(1게임 추적으로 규명). 측정은 모두 100시드.

- **★ 마을 큐브 배달 목표 (핵심 해결, analyzer.ts `analyzeDeliveryOpportunities`)**: Western US는
  townCubes 맵인데 그동안 배달 목표를 **도시 큐브만** 생성하고 **마을 큐브를 무시**해, AI가 "우연히
  마을을 지나면 배달"할 뿐 마을 큐브를 노려 확장하지 못했다(도시 화물 소진 후 정체→파산). → townCubes
  맵에 마을 큐브 배달 기회(`town:<id>` 출발) 추가 + `findStopById`가 `town:`/`track:` prefix를 strip +
  `preliminaryScore`가 내 트랙 인접 마을 출발을 도시처럼 우대(안 그러면 상위 K 추림에서 도시 경로에
  밀려 사장). **갇혀 정체하던 뒤 순번이 중간 마을 큐브 배달로 income을 벌어 살아남** (p5 VP 0→8,
  VP 격차 30→16, 평균 VP 14.3→15.1, 붕괴 player 없음). 경매 보너스(제로섬)와 달리 전체 파이를 키운다.
- **완성트랙 7 목표 (vp.ts + `MapProfile.targetCompletedTracks`=7)**: 완성트랙 < 7이면 트랙 건설 VP를
  기회비용 없이 정상(1.0) 인정(기본 0.5) → 경로 완성을 적극 추구해 완성트랙·income 동반 상승. Western 전용.
- **대륙횡단 활용 (vp.ts `estimateRouteVP` transcontinentalVP)**: 내 네트워크가 한쪽(서/동) 시작도시를
  연결했고 경로 목적지가 반대쪽 시작도시면 대륙횡단 달성 → income +$4(영구)=큰 VP 가산. 0.4→0.9명/게임.
- **첫 착공 완성 게이트 (buildTrack.ts `gateCompletable`)**: 다인 맵 첫 착공 시 completable=false 경로
  (먼 대륙횡단 등)는 미완성 트랙 안 깔고 skip → "전 재산 쏟아 income 0으로 죽는 나선" 차단(파산
  0.79→0.34, Rust Belt도 9.8→11.7 동반 개선). banScatter(연속성 룰)와 별개의 AI 휴리스틱.
- **First Move/Build 강화 (selectAction.ts)**: 뒤 순번일수록 선수송/선건설 가치↑(rank 가중). 단 순서
  액션은 1명만 선택+실질행동 기회비용이라 제로섬(player간 재분배)에 그침 — 마을 큐브가 진짜 해결.
- **★ 경매 1번 입찰 보너스 (Western US 전용, `MapProfile.firstSeatRankBidBonus`)**: 4·5위 +1, 6위 +2로
  뒤 순번 입찰 상한을 올려 1번을 더 따 순서 순환(승자 분포 균등화). **cityCubes 맵(Rust/Germany)엔 절대
  적용 불가** — 마을 큐브가 없어 뒤 순번이 1번 사느라 건설예산 소진→붕괴(전 맵 적용 시 Rust VP 11.7→3.5,
  파산 2배). Western만 마을 큐브가 이 부작용을 상쇄하므로 override로 켠다. 골고루↑ vs 평균 VP −1.6 트레이드오프.
- **시뮬 진단 지표 (전 다인 시뮬 *Simulation.test.ts, 상시)**: turnOrder 행동 선택·경매 입찰 발생 횟수·
  1번 획득 방식(byBid 입찰로/byYield 양보로)·순번 1~N위 점유 분포. Western은 추가로 **1게임 턴별 프로세스
  추적**(player별 매 턴 경로/건설좌표 + skip 시 게이트 이유: 완성/연결/completable). player-index 편향
  진단의 핵심 도구 — "누가 1번 먹나·왜 정체하나"를 수치로 추적.

## 도시화 계획 통합 + 건설 dangling 수정 (2026-07-02, 사용자 피드백 "생각 없는 도시화·엉망 건설")

- **`src/ai/strategies/urbanization.ts` (planUrbanization)**: 도시화의 배치 마을·타일 색·ΔVP·연결 경로를
  한 번에 계산 — selectAction(행동 가치)·AIPlayer(배치 + 신도시행 경로 `setCurrentRoute` 커밋)가 같은
  계획을 공유. 구 방식은 가치가 배치와 무관(타일색만, min(9,n*3))해 **매 턴 도시화 남발** + 신도시
  36% 미연결이었다. 정적 색 맵은 "그 색 수요 도시가 이미 가까우면 중복 목적지" 신선도 검사로 가치 floor.
- **★ 동적색 맵(한국)은 반드시 예외** (`dynamicCityColors` 분기): 수요 = 현재 큐브(소모성)라 신선도
  검사가 성립 안 함 — 걸면 도시화 말살로 **VP 20.7→3.7 붕괴**(100시드 실측). 연결 커밋·배치 제한도
  한국엔 해로움 → 동적맵은 가치만 화물량 기반, 배치·커밋은 레거시 유지 (결과 22.11로 개선).
- **건설 dangling/좀비 수정 (buildTrack.ts)**: ① 중간 슬롯 신규 착공에도 completable 게이트(커밋 경로는
  제외) — 잔여 현금으로 완성 불가한 경로에 착공해 영구 dangling 남기던 것 차단. ② 네트워크 확장 목표에서
  인접 도시(거리<2, 사이 헥스 없음=건설 불가) 제외 — 이를 목표로 잡아 매턴 전체 스킵하던 좀비 차단.
  ③ 도시화 직후에 한해 기회 목록에 없는 커밋 경로 유지(!opp) — 상시 유지로 넓히면 VP 하락(실측).
- 측정: [`docs/ai-auction-baseline-100seed.md`](ai-auction-baseline-100seed.md) 2026-07-02 표.
  **측정 드리프트 주의** — 회귀 의심 시 `git stash`로 직전 코드를 같은 환경에서 재측정해 비교할 것
  (Rust 문서값 12.40이 같은 날 실측 11.89였다).

## 파산 원인 수정 (2026-07-02b, 사용자 목표 "연명 말고 철도·수송 income으로 파산 0.3")

파산자별 턴 궤적(income/cash/건설/배달) 수집 진단으로 사망 메커니즘을 규명하고 income 레버만 수정.
결과(100시드): 파산 Rust 0.79→**0.33**·Germany 0.41→**0.30**·Korea 0.98→**0.53**·Western 0.46→0.50,
**VP 동반 급등**(Rust 11.3→17.7, Korea 22.1→26.0, Germany 23.2→26.6 — 데드락이 income도 억누르고 있었다).

- **★ 예비금 데드락 해제 (buildTrack.ts, 다인 한정)**: 적자 플레이어는 예비금(지출−income)이 현금보다
  커져 $10을 쥐고도 $3 타일을 영원히 못 짓는 좀비가 됐다(SKIP 연속→생존발행 15주→사망이 지배 패턴).
  이번 턴 잔여 슬롯으로 경로를 완성할 수 있고 출발지에 배달 화물이 있으면(=배달 income으로 회수)
  예비금 전액 면제. 부분 완화(생존 하한)는 오히려 악화 — 완성 도박이 보류보다 기대값이 높다(30시드).
- **엔진업 치명적 디폴트 가드 (moveGoods.ts)**: `engineUpgradeDeltaVP`(vp.ts)에 파산 가드가 있지만
  **front-load 지름길(return 5)이 우회** — T1에 건설로 현금을 소진한 플레이어가 배달 대신 엔진업을
  골라 그 턴 지출을 못 내고 즉사했다. 엔진업 후 shortage로 income이 음수가 되는 상황이면 -∞.
- **기각된 시도 (30시드 악화 실측 — 재시도 금지 아님, 선행조건 변화 시 재검)**: ① 광범위 엔진업
  재정 게이트(여력 $4 미만 금지)는 Rust 회복 경로(저현금 front-load→엔진3→장거리 income)를 차단해
  24→31 악화. ② 완성불가 계획의 주식 발행 차단은 22→28 악화 — **주식 보존 법칙 재확인**(막힌 계획의
  발행 현금도 건설 차례의 경로 전환에 쓰인다). ③ 파산 진단은 파산자 턴 궤적 수집이 가장 효율적
  (임시 하니스: issueShares 스냅샷 + 건설/배달/엔진업 카운트 + SKIP 플래그).
- 잔여 파산(Korea 0.53·Western 0.50)은 boxed-out income 정체(건설 많고 배달 저조) — income 천장 작업 축.

## Southern US 맵 구현 (2026-07-03, 면화 운송 6인)

사용자 제공 디자인 이미지(2000×1435)를 색상 자동검출 + 격자 피팅으로 추출한 **6인 전용 6턴** 맵.
도시 12 + 마을 14 + 산 15 + 강 11 (Tennessee/Alabama/Chattahoochee/Savannah).

- **flat-top 보드**: Germany/Korea처럼 **전치 저장**(데이터 col=화면세로 0~10, row=화면가로 0~16) +
  `orientation:'flat'` 렌더. 화면 짝수 열이 아래로 반 칸 밀린 배열이라 odd-r 패리티를 맞추기 위해
  **row = 화면열 + 1** (Western US row 0 기법) — row 0은 비어 lake, `trimLeftHexes: 1`로 가림.
  확정 근거: 도시 헥스 바운딩 120×104(=2R×√3R, flat) + 격자 피치 x108/y61.2(=1.5R/√3R/2, R≈71).
- **★ 면화(흰 큐브) 시스템 (시그니처)**: `CubeColor`에 'white' 추가 (CityColor와 분리 —
  도시색은 여전히 5색). 셋업 시 모든 마을에 면화 1개(`MapProfile.townFixedCube`, 주머니에서 안 뽑음).
  - **4대 항구 배달 종료**: `BoardState.cottonPorts`(charleston/savannah/mobile/neworleans) +
    `cityAcceptsCube`에 white 분기 — 흰 큐브는 항구에서만 수용, 다른 도시는 통과. 이 헬퍼 한 곳으로
    경로탐색(hexGrid)·AI(analyzer/vp/buildTrack) 전체에 전파 (Korea 동적색과 같은 패턴).
  - **+1 보너스 수입**: `MapProfile.cubeDeliveryBonus(color)` — completeCubeMove(엔진) +
    moveGoods.ts/vp.ts(AI ΔVP) 세 곳 모두 regionDeliveryBonus 옆에 가산.
  - **배달 후 게임에서 제거**: `MapProfile.deliveredCubeLeavesGame(color)` — completeCubeMove의
    주머니 반환을 건너뜀 (시뮬 테스트가 "주머니/디스플레이에 white 없음" 불변식으로 검증).
  - **도시화 시 면화 이동**: `MapProfile.urbanizationMovesTownCubes` — placeNewCity가 마을 큐브를
    신규 도시 위로 옮김 (다른 맵은 기존대로 제거).
- **Atlanta 호황**: Germany Berlin의 `bonusCityCubeId` 재사용 + **`bonusCityCubeMaxTurn=4`**
  (1~4턴만 물품 성장마다 주머니에서 1개 — 남북전쟁 전 호황).
- **4턴 남북전쟁**: `MapProfile.incomeReductionMultiplier(turn)` — applyIncomeReduction에서
  룰 테이블 감소량에 배수 적용 (Southern: turn===4 → 2배).
- **도시 초기 큐브**: Atlanta 4 / 항구 3 / 나머지 1 (`cityCubeCounts` — 기본 2를 쓰는 도시가 없어 전부 명시).
- **AI**: `incomeSources: ['cityCubes','townCubes']` — Western의 마을 큐브 배달 인프라('town:<id>')를
  그대로 타서 면화 목표 생성·클릭 배달이 추가 코드 없이 동작. 흰 큐브 목적지는 cityAcceptsCube로 항구 자동.
- **측정** (`southernUsSimulation.test.ts`, 100시드): 아래 표. 다른 맵 회귀 게이트 보존.
- **주의**: 면화는 `CUBE_COLORS.white`가 밝은 색이라 보드 렌더에서 흰 큐브만 어두운 테두리(#8a857c)로 구분.

## 마을 가닥(스퍼) 모델 (2026-06-12 재설계, 모든 맵 공통)

마을 = 헥스 안의 원. **마을 헥스에는 트랙 타일을 배치할 수 없다** (도시처럼).
노선이 마을에 연결되려면 **원→변 가닥(TownSpur)** 이 있어야 하며, 가닥은 실제 건설물이다.

- `TownSpur { townCoord, edge, owner }` — `board.townSpurs`
- **카운트 규칙 (2026-06-18 확정)**: 일반 헥스 타일 1개 = +1카운트. **가닥은 타일 건설 시
  자동 생성되지 않는다** — 타일은 항상 1카운트만 소모하므로 수익을 위해 한 턴에 타일을 온전히
  3개(Engineer 4개) 깔 수 있다. 마을에 닿는 타일은 미연결 상태로 둔다.
- **마을 가닥은 마을 클릭(`buildTownSpur`)으로만 별도 건설** — 그 마을의 빠진 가닥 전부를 한 번에 연결.
  **카운트 = 이번 턴에 그 마을 타일을 처음 변경하면 1**(가닥 개수 무관 — `builtTurn === currentTurn`),
  지난 턴 가닥은 무관, 같은 턴에 그 마을을 또 연결하면 0카운트. 비용 가닥당 $1. 같은 턴 잔여나 다음 턴에.
  UI는 완성 가능한 마을에 주황 점선 테두리. (예: 신도시→마을 트랙을 타일 3개로 깔고, 마을 연결은 다음 턴)
- **AI는 타일 우선** (`decideBuildTrack`): 타일 건설을 먼저 시도하고, 더 못 깔 때만 미연결 마을을
  `buildSpur`로 연결. → 신도시에서 타일을 최대한 짓고 마을 연결은 후순위.
- **도시화(`placeNewCity`)는 건설 카운트와 무관** — 마을→도시 전환 시 그 마을 가닥만 제거, `builtTracksThisTurn` 불변.
- 연결된 노선 수 = 마을 안 가닥 수 (화면 토막 수). 가닥이 2개여도 마을 진입 카운트는 1.
- 이동/배달/완성 링크 판정 모두 **가닥이 있는 변으로만** 마을 통과/도달 인정
- 내 가닥이 있는 마을 = 내 네트워크 → 6방향 어디로든 새 노선 시작 가능
- 도시화 시 해당 마을의 가닥 제거 (도시는 모든 변 연결)
- **도시화된 마을(`town.newCityColor !== null`)은 모든 마을 판정에서 제외** — towns 배열에
  남아 있으므로 `t.newCityColor === null` 조건 필수 (빠뜨리면 도시 연결에 가닥을 요구하는 버그)
- 핵심 테스트: `src/store/__tests__/townHubModel.test.ts` (15 케이스 — 가닥 카운트/첫 트랙 도시 앵커),
  `buildLimitByLog.test.ts` (게임 로그 기반 턴당 건설 제한 검증 — St. Lucia 1턴 도시화 선점자만 건설)

## 건설 제한 시스템

- 턴당 3개(Engineer 4개) — `builtTracksThisTurn`/`maxTracksThisTurn`
- 모든 건설 경로(buildTrack/buildComplexTrack/redirectTrack/buildTownSpur)가 카운트 검사,
  buildTrack에는 canBuildTrack과 별개의 최종 하드 가드 (`[제한 위반 차단]` 콘솔 박제)
- 카운트 검사는 **타일 1개 기준** — 마을 가닥은 잔여 카운트만큼만 함께 건설 (마을 가닥 모델 참조)
- 게임 로그에 `[N/max]` 카운트 병기, 이번 턴 건설 트랙에 흰 점선 링 표시
- 디버깅: dev 모드에서 브라우저 콘솔 로그를 localhost:3999로 미러링하는 코드가
  GamePageClient에 있음 (수신 서버는 별도 실행 필요 — 없어도 무해, fetch 실패 무시)

## 실행 취소 / 선택 취소 (2026-06-13)

사람 플레이어의 행동을 **다음 단계로 넘어가기 전까지** 되돌리는 두 층위의 취소:

- **선택 취소** (`cancelSelection`): 커밋 전 UI 선택만 초기화 — 건설 출발지/방향,
  큐브 선택, 복합/방향전환 패널, 도시화 모드. 진행 중 큐브 애니메이션(`movingCube`)은 보존
- **실행 취소** (`undoLastAction` + `undoCount`): 확정 행동의 스냅샷 복원.
  대상: 주식 발행, 행동 선택(locomotive 즉시 엔진업 포함 복원), buildTrack/복합/방향전환/
  마을 가닥/도시화. 스냅샷(`board`/`players`/`phaseState`/`newCityTiles`/`goodsDisplay`/`logs`)은
  `store/helpers/undo.ts`의 모듈 레벨 스택 `undoSnapshots`에 보관(비영속, ES 모듈 싱글턴이라
  slice/gameStore가 공유), **`nextPhase`마다 초기화** = 단계/차례 전환 시 확정
- `captureUndo`는 AI 차례면 저장 안 함 (사람 전용). 취소 내역은 게임 로그에 `↩ 취소: ...`
- 새 커밋 액션을 추가하면 검증 통과 직후 `captureUndo(state, label)` + set에
  `undoCount: undoSnapshots.length` 포함할 것 (둘 다 `../helpers/undo`에서 임포트)
- UI: PhasePanel에 단계별 버튼 (`getUndoLabel()`로 취소 대상 표시)
- 테스트: `townHubModel.test.ts`의 실행 취소 케이스 3건

## 알려진 이슈 (미해결)

- 현재 없음 (2026-07-03 기준). PR #14 코드리뷰 잔여 이슈 5건은 전부 종결 — 처리 내역과 기각 실험
  기록은 [`docs/ai-auction-baseline-100seed.md`](ai-auction-baseline-100seed.md)의 2026-07-03
  섹션 참조. 특히 **"도시화 계획 null이면 필러 선택 차단" 수정은 실측 기각**(Germany −1.88 게이트
  위반) — 계획 null 필러 도시화는 건설 후 배치 재시도가 성공하는 회복 경로이므로 재수정 금지.
