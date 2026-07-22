# 타인 철도 이용 화물 운송 — 구현 계획

브랜치: `feat/opponent-rail-transport` (기반: main f242318 = PR #40 머지 후 최신)
작성: 2026-07-22 · 상태: **스텝 1~6 완료(게이트 7/7 채택)** — 잔여: 스텝 7 + dev 수동 검수

게이트 결과(2026-07-22b, ai-auction-baseline-100seed.md에 정본 기록): 7맵 전부 VP·파산 동시 개선
(Rust 36.56 / Germany 43.00 / Western 28.31 / Southern 20.61 / Korea 45.21 / Montréal 5.43 /
Moon 20.29). 단위 스위트 311개 통과.

진행 메모 (2026-07-22):
- 스텝 1: `findRouteOptions`/`getPathLinkOwners`(정산 미러)/`countOppPathLinks` 신설,
  `findLongestPath` tie-break에 타인 링크 최소 삽입(own↓→opp↓→총↓), 독일 직결 링크
  includeOpponents 누락 수정. 단위 테스트 `utils/__tests__/routeOptions.test.ts` 10개.
  전 기존 스위트 259개 항등 통과. 달 100시드 −2.15→−2.34(게이트 내 — 저중력 크레딧으로 해소 예정).
- 스텝 2: ui 상태 `routeOptions`/`routeChoice` + 액션 `selectRouteOption`/`confirmRouteChoice`.
  목적지 클릭: 후보 1개=즉시 커밋(기존 UX), 여러 개=선택 모드(재클릭=확정). 봇은 항상 디폴트
  즉시 커밋(AI 결정과 동일 정책이라 일치). store 테스트 `store/__tests__/routeChoice.test.ts` 6개.
- 스텝 3: BoardOverlays 후보 경로 렌더(빌린 링크=소유자 색 분절, 선택=굵게, 클릭 선택/확정,
  18px 투명 히트영역) + PhasePanel 철도 선택 카드(후보 목록+수송 버튼). — dev 수동 검수 잔여.
- 스텝 4: 무수정에 가까움 — 경로는 startCubeAnimation args로 전달(기존 신뢰 모델),
  새 UI 액션 2종은 INTENT_SPECS 미등록=게스트 로컬 허용. netStore 스냅샷 적용 시
  routeChoice/routeOptions 정리 1줄.
- 스텝 5: AI 전 맵 개방(`oppExtra=엔진`) + findRouteOptions 디폴트 채택(최저 VP 주인 포함) +
  **저중력 크레딧**(`lowGravCredit` — 빌린 링크 1개 수입 이전을 RouteOption 수치에 반영,
  평가/정산 불일치 해소, 구 `opponentExtra=1` 대체). 선점 보너스·엔진 해금 판정도 개방 반영.
  시뮬 러너: moon 계측을 실행 경로(movingCube.path) 직독으로, fullGameSimulation 실행을
  findRouteOptions로 교체.
- 스텝 7도 완료(2026-07-22): Western 마을 큐브 = 결정/실행 불일치 버그 수정으로 개방(29.52),
  St.Lucia 트랙 큐브 = 원래 개방 상태였고 수입 귀속 근사만 정산 미러(ownIncome/oppIncome)로
  통일 → VP −15.25→−4.80·파산 15/20→11/20. 남은 것: CLAUDE.md/ai-system.md 문서화,
  dev 서버 수동 검수, 달 저중력 선호값 재스윕(후순위), 커밋.

## 배경 / 목표

룰북은 타인 소유 완성 링크를 자유롭게 이용해 화물을 옮길 수 있고, 수입은 그 링크
소유자에게 간다. 현재 구현은 경로 탐색(`hexGrid.ts`)이 **본인 + 공용(파산 owner=null)
트랙만** 허용하고, 유일한 예외가 달 저중력(`opponentExtra=1` + 수입 이전)이다.
정산(`completeCubeMove`)은 이미 "링크 소유자별 +1" 구조라 **정산 코드는 거의 무수정** —
탐색·UI·AI가 본론이다.

### 확정 요구사항 (사용자 답변 반영)

1. **전 맵 공통(달 포함), 타인 링크 무제한**(엔진 한도 내). 빌린 링크 수입은 소유자에게.
2. **본인 철도 우선 게이트**: 본인 철도만으로 "내 소유 링크 수(=내 수입)" 최대치를 낼 수
   있으면 본인 철도만. 타인 경유 경로는 ⓐ 내 소유 링크 수가 본인-최선보다 **더 커지거나**
   ⓑ 본인 철도만으론 **도달 불가한 목적지**가 열릴 때만 후보로 노출.
3. **경로 선택 UI**: 후보 철도가 여러 개면 각 경로를 **철도 주인의 마커 색**으로
   하이라이트하고 선택 가능. **디폴트 = VP가 가장 낮은 주인의 경로**.
   VP = `calculateVictoryPoints(income, calculateTrackScore, issuedShares)`
   (gameLogic.ts:243 + trackValidation.ts:516 — 종료 정산 화면과 동일 공식).
4. **AI 봇도 동일 적용** + 7맵 100시드 전/후 게이트.
5. **달 저중력 재정의**: '타인 링크 1개 경유'는 전 맵 개방으로 소멸 →
   **'빌린 링크 수입 1개를 내가 가져옴'(`applyLowGravitation`)만 잔존**.
   selectAction 선호값 재튜닝 + 달 100시드 재측정.

## 설계 핵심

### A. 후보 경로 모델 (RouteOption)

목적지별로 `findAllPaths(…, opponentExtra=engineLinks)`(사실상 무제한 — opp 링크 ≤ 총
링크 ≤ 엔진)를 돌린 뒤 정책 계층에서 후보를 추린다. 새 함수(hexGrid.ts):

```ts
interface RouteOption {
  path: HexCoord[];
  ownLinks: number;      // 내 수입
  oppLinks: number;      // 빌린 링크 수
  owners: PlayerId[];    // 빌린 링크 소유자들 (중복 제거)
}
findRouteOptions(start, end, board, playerId, maxLength, cubeColor, govExtra): RouteOption[]
```

- **본인-최선**: oppLinks=0 경로 중 ownLinks 최대(동률이면 총 링크 최대 — 기존 규칙 유지) 1개.
- **타인-경유 후보**: `ownLinks > 본인최선.ownLinks`인 경로만(요구 2ⓐ). 본인-최선이 없으면
  (요구 2ⓑ) 모든 경로가 후보 풀. **소유자 집합(owners) 단위로 중복 제거** — 같은 집합이면
  ownLinks 최대 → oppLinks 최소 1개만 대표로.
- **디폴트 선정**: ownLinks 최대 → (동률) 빌린 소유자 중 **최고 VP가 낮은** 경로 →
  (동률) oppLinks 최소. VP 맵은 호출부(uiSlice/AI)에서 계산해 인자로 전달
  (hexGrid는 players를 모르므로 `ownerScore?: Record<PlayerId, number>` 파라미터).
- **타인 링크 판정은 기존 로직 재사용**(hexGrid.ts 984–991행): `isGovernment` 제외,
  `owner===null`(파산 공용) 제외 — 정부/공용은 지금처럼 무료·무수입 그대로.
- `findLongestPath` tie-break에 **oppLinks 최소**를 2순위로 삽입(own↓ → opp↓ → 총↓).
  타인 개방 후 "내 링크 같으면 총 링크 많은 경로"가 상대에게 수입을 헌납하는 것 방지.

### B. 사람 UI 흐름

- `selectCube`: `findReachableDestinations(opponentExtra=engine)`로 목적지 확대(타인 경유
  전용 목적지 포함) + 목적지별 `findRouteOptions` 계산 → `ui.routeOptions`(신규,
  목적지별 후보 배열) 저장. `ui.movePath` 미리보기는 디폴트 경로.
- `selectDestinationCity`: 해당 목적지 후보가 **1개면 기존대로 즉시 커밋**(UX 무변경).
  **2개 이상이면 경로 선택 모드** 진입: `ui.routeChoice = { destination, options,
  selectedIndex }`(디폴트 선택됨).
  - 보드: 모든 후보 경로 렌더 — **내 소유 구간은 골드(#d4a853), 빌린 구간은 그 링크
    소유자의 PLAYER_COLORS** (링크 = 정거장 사이 구간, 첫 타일 owner 기준으로 분절 렌더).
    선택된 경로는 굵게+불투명, 비선택은 얇게+반투명. 경로 클릭 = 선택 전환.
  - 확정: **목적지 재클릭 또는 PhasePanel '이 경로로 수송' 버튼** → 선택 경로로
    `startCubeAnimation`. 취소는 기존 `cancelSelection`(빈 헥스 클릭 포함)이 routeChoice도 정리.
- 새 ui 필드 2종(`routeOptions`, `routeChoice`)은 로컬 UI 상태 — persist/스냅샷 제외
  (movingCube만 승격되는 기존 구조 유지).

### C. 온라인 동기화

- `startCubeAnimation`은 **경로를 인자로 받으므로** 게스트가 고른 경로가 intent args로
  자연 전달됨 — 호스트가 재탐색하지 않아 디싱크 없음(스텝 4에서 직렬화 실측 확인).
- 호스트 검증: 현행 수준 유지(경로 재검증 미도입 — 호스트 권위 스냅샷이 정본).
  `captureUi: ['selectedCube']` 그대로. routeChoice는 로컬 UI라 캡처 불요.

### D. AI 적용

- `ai/strategies/moveGoods.ts:73` — `oppExtra = lowGrav?1:0` → **항상 엔진 링크 수**(전 맵).
- 목적지별 경로는 UI와 같은 `findRouteOptions` 디폴트 규칙을 사용(요구 1·2·3의 "최저 VP
  주인에게 수입 주기"까지 봇이 동일하게 — 선두 견제로 전략적으로도 옳음).
- ΔVP 평가는 기존 `deliveryDeltaVP(own, opp)` 그대로 — opp 페널티 구조가 게이트와 자연
  정합(own 같으면 opp 적은 쪽이 항상 우위).
- **저중력 평가/정산 불일치 해소**: 저중력 플레이어의 경로 평가 시 opp≥1이면
  `(own+1, opp−1)`로 보정(수입 이전이 ΔVP에 반영 — 기존 미반영 이슈 동시 수정).
- `selectAction.ts:168–184` 저중력 선호값 재튜닝(효과가 '경로 확장+이전'→'이전만'으로
  축소 — 스윕으로 재결정). `moonSimulation.test.ts:223`의 `?1:0`도 동일 변경.
- 건설 계획(analyzer/selector/turnPlan)의 타인 링크 활용은 **이번 범위 밖**(수송만).
  단, 회귀 여부는 100시드로 확인.

### E. 함정 체크리스트

- 정부 링크(Montréal)·파산 공용(owner null)은 타인 링크로 세지 않음(기존 판정 재사용).
- St.Lucia 트랙 큐브·Western US 마을 큐브 경로도 동일 개방(uiSlice 88–157행 패턴,
  `findTrackCubeDeliveries`) — 별도 스텝으로 분리.
- `moveGoods`(AI/레거시 즉시 정산)와 `completeCubeMove`의 수입 귀속 코드 중복 — 수정 시
  양쪽 일관성(이번엔 정산 무수정이 원칙이라 영향 없어야 함, 확인만).
- 성능: 타인 개방으로 `findAllPaths` 탐색 폭발 가능 — 스텝 1에서 최악 맵(Rust Belt 5인
  전 트랙) 소요 시간 실측, 필요 시 "정거장 도달 시 own/opp 지배 경로 가지치기" 추가.
- 온라인 `PHASE_CHANGE_HOLD`/이동 애니메이션 흐름은 무변경(path 내용만 달라짐).

## 실행 스텝 (스텝바이스텝 — 각 스텝 검증 후 커밋 단위)

| # | 내용 | 파일 | 검증 |
|---|------|------|------|
| 1 | 탐색 코어: `findRouteOptions` 신설, `findLongestPath` tie-break(opp↓ 삽입), opponentExtra 상한 해석 정리 | `utils/hexGrid.ts` (+ 신규 `utils/__tests__/routeOptions.test.ts`) | 단위 테스트: 게이트 2ⓐⓑ·디폴트 선정·정부/공용 비집계·소유자 집합 dedupe. 기존 hexGrid 호출처 회귀(`npx vitest run`) + 성능 실측 |
| 2 | 사람 UI 상태기계: selectCube/selectDestinationCity 후보 계산·routeChoice 진입/선택/확정/취소, VP 맵 계산 | `store/slices/uiSlice.ts`, `types/game.ts`(ui 타입) | store 테스트 신규(후보 1개=즉시 커밋, 2개=선택 모드, 디폴트=최저 VP 주인, 재클릭 커밋) |
| 3 | 렌더: 경로별 소유자 색 분절 하이라이트 + 클릭 선택, PhasePanel 안내/확정 버튼, 목적지 링 구분(타인 경유 전용 목적지) | `board/BoardOverlays.tsx`, `board/BoardCities.tsx`, `PhasePanel.tsx` | dev 서버 수동 검수(:3999 로그) — 2인 로컬에서 타인 링크 경유 수송·색·디폴트 확인 |
| 4 | 온라인: startCubeAnimation args 직렬화 확인, 게스트 낙관/noop 경로 점검 | `net/intents.ts`(필요 시), net 테스트 | `npx vitest run src/net/__tests__/` + 두 탭 E2E(게스트가 타인 경유 수송) |
| 5 | AI 개방 + 저중력 재정의: oppExtra 전 맵, findRouteOptions 디폴트 채택, 저중력 평가 보정, selectAction 재튜닝 준비 | `ai/strategies/moveGoods.ts`, `ai/strategies/selectAction.ts`, `ai/strategy/vp.ts`(필요 시), `moonSimulation.test.ts` | AI 단위/시뮬 테스트 통과 |
| 6 | 100시드 게이트: 7맵 전/후 비교(기준: docs/ai-auction-baseline-100seed.md), 달은 저중력 선호값 스윕 재튜닝 루프 | 시뮬 테스트 실행·베이스라인 문서 갱신 | VP 하락 −1 초과·파산 +0.1 초과 맵 없음(달은 신규 기준 수립) |
| 7 | 확장·문서: St.Lucia 트랙 큐브·Western US 마을 큐브 동일 개방, CLAUDE.md·ai-system.md·이 문서 상태 갱신 | `uiSlice.ts`, `hexGrid.ts`(findTrackCubeDeliveries), 문서 | 해당 맵 시뮬 + 수동 검수 |

## PR #41 코드리뷰 체크리스트 (스텝바이스텝 — 스텝마다 결과 기록·커밋)

| # | 스텝 | 상태 | 결과 |
|---|------|------|------|
| 1 | 탐색 코어 (hexGrid: findRouteOptions·getPathLinkOwners·tie-break·직결·트랙큐브 랭킹) | ✅ 통과 | 메모 3건(모두 무해): ① getPathLinkOwners 직결 분기는 인접 정거장 한정 — 정산은 무조건 검사지만 독일 직결=인접 도시쌍뿐이라 실차이 없음 ② findLongestPath tie-break의 own(secondary 인정)/opp(정산 미러) 기준 혼용 — 휴리스틱이라 무해 ③ cmp의 −Infinity는 ‖ 체인에서 NaN 반환 불가 확인 |
| 2 | uiSlice 상태기계 (selectCube 도시/마을·selectDestinationCity·selectRouteOption/confirm·정리·봇 우회) | ✅ 수정 1건 | **스테일 routeChoice**: 트랙 큐브 선택(selectCube track:)·moveTrackCube·completeCubeMove가 routeChoice/routeOptions를 정리 안 해 St.Lucia에서 수송 후 스테일 경로 UI 부활(확정은 selectedCube 가드로 불가—표시 혼란만). 3곳 정리 추가. 단위 184개 통과 |
| 3 | 렌더 계층 (BoardOverlays 분절/히트영역·PhasePanel 카드·GameBoard 배선) | ✅ 주석 정정 | 동작 이상 없음(미니맵은 경로 선택 시점 미표시라 오클릭 불가·stopPropagation·선택 위로 정렬 확인). "내 구간=골드" 주석이 실동작(내 구간=내 마커 색 — 요구사항 문구에 부합)과 달라 주석만 정정 |
| 4 | AI 계층 (moveGoods: 개방·디폴트 채택·선점/해금·트랙큐브 평가) | ✅ 개선 1건 | 선점 보너스 상대 도달 탐색이 목적지 루프 안에 있어 (출발지·큐브·상대)당 목적지 수만큼 재탐색 — 큐브 단위 1회로 호이스팅(동작 동치: 달 100시드 VP 20.29·파산 0.16 정확 재현) |
| 5 | 온라인/동기화 (intents 무등록 타당성·netStore 정리·deliveryIncomeEvent 스냅샷/persist) | ✅ 통과 | 경로=startCubeAnimation args(기존 신뢰 모델)·새 UI 액션 미등록=게스트 로컬 허용 타당·이벤트는 블록리스트 코덱으로 자동 전파, merge 미리셋+컴포넌트 key 가드 정합. routeChoice의 persist 복원은 기존 selectedCube 관례와 동일 |
| 6 | 수익 펄스 (moveSlice 이벤트·BoardPulses 가드/수명) | ✅ 통과 | key 최초 관측 스킵·undo 억제 확인. 비고: 6행 스택 마지막 행 페이드가 TTL(2.6s)에 ~0.15s 잘림 — 기존 큐브 펄스와 동일 패턴이라 수용 |
| 7 | 테스트/문서 (커버리지 빈틈·sim 러너 수정 타당성·CLAUDE.md/베이스라인 정확성) | ✅ 보강 1건 | lowGravCredit이 단위 미커버(달 시뮬 간접뿐) → routeOptions.test에 크레딧 유/무 2케이스 추가(13/13). sim 러너 수정(실행 경로 직독·findRouteOptions 실행) 타당, 문서 수치 대조 일치 |

## 리스크 / 미결

- 달 봇 밸런스: 저중력 축소 + 전원 타인 링크 개방의 순효과 예측 불가 — 스텝 6에서
  재튜닝 루프 각오(현 기준 VP −3.94·파산 0.87).
- 경로 폭발 성능: 스텝 1 실측 후 가지치기 여부 결정.
- 경로 선택 UI의 모바일(BottomSheet) 터치 정밀도 — 스텝 3에서 선 두께/히트영역 보정.
