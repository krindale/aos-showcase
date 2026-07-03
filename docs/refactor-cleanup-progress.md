# 리팩토링 진행 문서 — 타입 위생 + GameBoard 분리

> 브랜치: `refactor/cleanup-typecheck-gameboard` (2026-07-03 시작)
> 규칙: 한 번에 한 스텝, 스텝 완료마다 이 문서 갱신 + 커밋·푸시 (토큰 소진 시 git 이력만으로 재개 가능)

## 배경 — 코드베이스 진단 (2026-07-03)

전체 구조 점검 결과 **대규모 리팩토링 불필요** 판정 (종합 78/100). 근거와 남은 약점:

| 항목 | 점수 | 비고 |
|---|---|---|
| 아키텍처 (MapProfile 다형성, AI 계층) | 90 | 엔진/AI에 `mapId ===` 분기 0건 |
| 테스트 안전망 | 90 | 100시드 회귀 베이스라인 문서화 |
| hexGrid.ts (1,738줄) | 80 | export 46개 순수 기하 유틸 — 응집도 높아 분리 불필요 판정 |
| gameStore.ts (4,832줄) | 68 | 섹션 배너/JSDoc 정리는 잘 됨. 단일 스토어 액션 161개 — slice 분리는 점진(해당 영역 수정 시) |
| GameBoard.tsx (1,793줄) | 60 | **단일 컴포넌트 함수** + useMemo/useCallback 22개 — 서브 컴포넌트 분리 대상 |
| 타입 위생 | 70 | `tsc --noEmit` 에러 17건 (전부 테스트 파일 — vitest는 타입체크 안 해 런타임은 통과) |

이 브랜치는 위 진단 중 **즉시 실효성 있는 두 가지**(타입 위생, GameBoard)만 처리한다.
gameStore slice 분리는 위험 대비 이득이 낮아 **이번 범위에서 제외** (스텝 3에 로드맵만 기록).

## 스텝 체크리스트

- [x] 스텝 0: 브랜치 생성 + 이 문서 작성
- [x] 스텝 1: 테스트 파일 타입 에러 17건 수정 (`tsc --noEmit` 0 에러 목표)
  - `fullGameSimulation.test.ts` 12건: `as Record<PlayerId, ...>` 캐스트(부분 객체), `{} as null`, `never` 추론
  - `fullSimulation.test.ts` 2건: `phaseState.moveGoodsRound: number` vs `1 | 2`
  - `buildLimitByLog.test.ts` 3건: 존재하지 않는 `isAIThinking` 프로퍼티 참조, MapIterator 순회(target 이슈)
  - 검증: `npx tsc --noEmit` + `npx vitest run` 전체 통과 (테스트 동작 불변 — 타입만 고침)
- [x] 스텝 2: GameBoard.tsx 서브 컴포넌트 분리 (서브 스텝별 커밋)
  - 원칙: **순수 렌더 분리만** — 게임 로직/store 액션/시뮬레이션 무영향. props로 내려서 분리
  - [x] 2a: 순수 기하/스타일 헬퍼 → `board/boardGeometry.ts` (SQRT3_2·shadeColor·nameBandPoints·numberBoxPath·큐브 스펙 3종·hexVertex)
  - [x] 2b: 트랙 레이어 → `board/BoardTracks.tsx` (트랙 타일·소유 마커·완성 링크 마커·끊김 경고, 265줄 이동)
  - [x] 2c: 마을 레이어 → `board/BoardTowns.tsx` (마을 디스크·가닥·큐브·도시화 하이라이트, 163줄 이동)
  - [x] 2d: 도시 레이어 → `board/BoardCities.tsx` (도시 헥스·라벨·큐브·직결 링크, 240줄 이동)
  - [x] 2e: 오버레이 → `board/BoardOverlays.tsx` (미리보기·트랙 위 큐브·이동 경로/큐브·외곽선·경계변·터미널 테두리, 169줄 이동.
    좌표 오버레이·비용 범례·줌 컨트롤·하단 범례는 GameBoard 로컬 상태(showCoords·boardHeight)와 묶여 있어 잔류)
  - 검증(각 서브 스텝): `npx tsc --noEmit` + dev 페이지 200 확인, 스텝 2 종료 시 `npx vitest run` 전체
    (⚠️ dev 서버 실행 중이라 `npm run build` 금지 — 머지 전 dev 중단 후 1회 빌드 검증)
- [x] 스텝 3: gameStore slice 분리 로드맵 문서화 (실행은 추후 — 해당 영역을 수정할 일이 생길 때 점진)

## 스텝별 결과 기록

### 스텝 0 (완료)
- 브랜치 `refactor/cleanup-typecheck-gameboard` 생성, 진행 문서 작성.

### 스텝 1 (완료)
- `tsc --noEmit` **0 에러** 달성, `npx vitest run` 24파일 207개 전부 통과 (1 skipped = 기존 St.Lucia 목표 게이트).
- `fullGameSimulation.test.ts`: 턴별 스냅샷 변수 6개를 `Partial<Record<PlayerId, ...>>`로 선언 —
  `{} as typeof X` 캐스트 전부 제거 (2인만 채우는 부분 레코드의 정직한 타입). `financials`는 6인 전체 키로 초기화.
- `fullSimulation.test.ts`: `moveGoodsRound: round as 1 | 2` + `playerMoves`에 player4~6 키 보충.
- `buildLimitByLog.test.ts`: 존재하지 않는 `isAIThinking` → `aiExecution.pending`으로 교체
  (types/game.ts 주석에 명시된 공식 대체 필드 — 기존엔 항상 undefined라 stuck 감지가 무조건 통과했음, 실질 버그 수정).
  `[...counts.entries()]` 스프레드 → `Array.from(...)` (MapIterator target 이슈).

### 스텝 2 (완료)
- GameBoard.tsx **1,793줄 → 965줄** (−46%). 렌더 레이어 5개 파일로 분리:
  `board/boardGeometry.ts`(순수 기하) · `BoardTracks.tsx` · `BoardTowns.tsx` · `BoardCities.tsx` · `BoardOverlays.tsx`
- 전부 **코드 그대로 이동 + props 주입** — 게임 로직/store/시뮬레이션 무영향 (JSX·스타일·핸들러 로직 무변경)
- GameBoard에 남은 것: store 구독·useMemo 계산(트랙 캐시/완성 링크/외곽선 등)·클릭 핸들러·헥스 그리드 배경·
  헤더/줌 컨트롤/범례·좌표 오버레이 (로컬 상태와 결합된 부분)
- 검증: tsc 0 에러, 7개 맵 게임 페이지 전부 200(dev), 전체 vitest 통과
  (1차 실행에서 1건 실패했으나 재실행 전부 통과 — 시뮬 테스트는 wall-clock 의존이라 dev 서버 부하 시 플레이크 가능,
  분리 코드는 테스트가 import하지 않는 렌더 전용이라 무관)

### 스텝 3 실행 기록 (사용자 지시로 로드맵 실행 개시, 2026-07-03)

- [x] 3a (로드맵 1순위): 모듈 레벨 헬퍼 → `src/store/helpers/` 5개 파일 분리, gameStore **4,832 → 4,129줄**
  - `undo.ts`(스냅샷 스택·captureUndo·getUndoLabel) · `boardRules.ts`(crossesBlockedEdge·findMissingTownSpurs·
    releaseUnextendedTrack·removeIncompleteNewTracks) · `setup.ts`(createInitialGameState·drawBalancedCubes·
    AIPlayerConfig·TUTORIAL_GAME_CONFIG) · `transcontinental.ts`(computeTranscontinental) ·
    `aiScheduler.ts`(AI 락·컨텍스트 검증·scheduleAICheck)
  - `GameStore` 인터페이스 export 추가 — aiScheduler가 **type-only import**로 참조 (런타임 순환 없음)
  - 기존 import 경로 호환: `getUndoLabel`·`createInitialGameState`·`TUTORIAL_GAME_CONFIG`·`AIPlayerConfig`를
    gameStore에서 재export (PhasePanel·테스트 수정 불필요)
  - 검증: tsc 0 에러 + 전체 vitest 24파일 207개 통과 + dev 200
- [x] 3b (로드맵 2순위): UI 선택/건설 플로우 액션 slice 분리 — gameStore **4,129 → 3,432줄**
  - `src/store/slices/uiSlice.ts` (754줄) 신설: `createUiSlice(set, get): UiSlice` — `UiSlice`는
    `Pick<GameStore, ...>` 24개 액션 (반환 타입 명시로 액션 파라미터 contextual typing 자동 추론).
    gameStore 본문에서 `...createUiSlice(set, get),`로 합성. GameStore는 type-only import (aiScheduler 패턴).
  - 이동 (계획대로, **코드 그대로 + 들여쓰기만 +2**): ① selectHex·selectCube·clearSelection
    ② cancelSelection·setPreviewTrack·setHighlightedHexes·setMovePath·selectSourceHex·selectTargetHex·
    selectExitDirection·updateTrackPreview·resetBuildMode·복합트랙 show/hide·canRedirect·selectTrackToRedirect
    ③ hideRedirectSelection·도시화 모드 enter/exit·selectNewCityTile·canPlaceNewCity
    ④ selectDestinationCity·startCubeAnimation·advanceCubeAnimation
  - **잔류** (게임 상태 변경 — 계획대로 이동 안 함): undoLastAction·redirectTrack·placeNewCity·
    Production 그룹·completeCubeMove·addLog. 잔류 액션 위에 분리 안내 주석 추가.
  - gameStore 임포트 정리: 이동 코드만 쓰던 8개 제거 (isValidConnectionPoint·getBuildableNeighbors·
    getExitDirections·findLongestPath·findReachableDestinations·countPathLinks·cityAcceptsCube·isBlockedEdge)
  - 검증: tsc 0 에러 + 전체 vitest 24파일 207개 통과(1 skipped=기존 게이트) + 7개 맵 dev 200
- [x] 3c (로드맵 3순위): 경매 + 교대 선공권 slice 분리 — gameStore **3,432 → 3,036줄**
  - `src/store/slices/auctionSlice.ts` (신설): placeBid·passBid·skipBid·resolveAuction·
    respondTurnOrderOffer 5개 액션 — uiSlice와 동일 패턴(`Pick<GameStore,...>` 반환 + type-only import)
  - 자기완결적 상태(auction·turnOrderOffer)만 조작, 진행은 scheduleAICheck/`get().nextPhase()` 위임 —
    코드 그대로 이동, 로직 무변경. gameStore 임포트 정리 불필요(전부 다른 곳에서도 사용)
  - 검증: tsc 0 에러 + 전체 vitest 24파일 207개 통과(1 skipped) + 7개 맵 dev 200
- [x] 3d (로드맵 4순위): 물품 성장 + 생산 slice 분리 — gameStore **3,036 → 2,774줄**
  - `src/store/slices/goodsGrowthSlice.ts` (신설): growGoods + Production 5액션(getEmptySlots·
    startProduction·selectProductionSlot·confirmProduction·cancelProduction) — goodsDisplay 조작 위주
  - nextPhase의 goodsGrowth 진입 로직(생산 선택자 currentPlayer 설정 등)은 gameStore에 잔류
  - 검증: tsc 0 에러 + 전체 vitest 24파일 207개 통과(1 skipped) + 7개 맵 dev 200
- 로드맵 5순위(Phase IV/V/nextPhase)는 계획대로 보류 — 가장 위험, 필요할 때만

### 스텝 3 로드맵 (원문)

**gameStore.ts (4,832줄, 액션 161개) slice 분리 로드맵.** 지금 통째로 쪼개지 않는 이유:
잘 동작하고 100시드 회귀 게이트로 덮여 있는 코드의 일괄 이동은 위험 대비 이득이 낮다.
대신 **해당 영역을 수정할 일이 생길 때 그 영역만 떼어내는 점진 방식**을 따른다.

분리 단위 후보 (현재 파일의 섹션 배너 기준, 응집도 순):

| 순위 | 분리 대상 | 현재 위치(줄) | 비고 |
|---|---|---|---|
| 1 | **모듈 레벨 헬퍼** (Undo 스냅샷·대륙횡단 감지·AI 스케줄러) | 94~793 | set/get 클로저에 안 묶여 있어 **순수 함수로 추출 가장 쉬움** — 이미 store 밖 모듈 함수라 파일만 나누면 됨 |
| 2 | **UI 선택/건설 플로우 액션** (selectHex~, buildMode 상태기계) | 3489~ | 게임 룰과 분리된 인터랙션 상태 — 회귀 위험 낮음 |
| 3 | **Phase II 경매 + 교대 선공권** | 1361~1827 | 자기완결적 상태(auction) — payExpenses류와 결합 없음 |
| 4 | **Phase IX 물품 성장 + 생산** | 2898~3014 | goodsDisplay 조작 위주 |
| 5 | Phase IV 트랙 건설 / Phase V 이동 / nextPhase | 1928~3488 | **가장 위험** (턴 진행·완성 판정·persist와 얽힘) — 마지막에, 필요할 때만 |

방법: zustand 공식 slice 패턴(`(set, get) => ({...})` 부분 함수를 합성)으로 인터페이스 무변경 분리.
각 slice 이동은 이 브랜치와 같은 방식(한 slice = 한 스텝 = 커밋·푸시, 100시드 게이트 통과)으로.

## PR #18 코드리뷰 (2026-07-03, 순차 진행)

> 방식: CLAUDE.md 코드리뷰 규칙 — 한 번에 한 스텝, 스텝마다 결과 기록 + 즉시 커밋·푸시.
> 대상: origin/main(726275e)..HEAD 전체 diff (스텝 1~3d + ConfirmDialog + 문서)

- [ ] R1: 스텝 1 테스트 타입 수정 3파일 — 동작 불변 검증 (특히 `isAIThinking`→`aiExecution.pending` 교체의 의미, 부분 레코드 타입의 정직성)
- [ ] R2: 스텝 2 GameBoard 분리 5파일 — 이동 충실성·props 정확성·렌더 순서 보존
- [ ] R3: 스텝 3a helpers 5파일 — 모듈 상태(undo 스택) 이동 동작 보존·재export 호환·type-only 순환 확인
- [ ] R4: 스텝 3b~3d slice 3파일 — **기계 검증**: 원본 커밋에서 제거된 블록 vs slice 본문 문자열 비교 (공백 정규화)
- [ ] R5: slice 합성부 — spread 중복 키·Set/Get 타입·Pick 목록과 GameStore 인터페이스 일치
- [ ] R6: ConfirmDialog/PhasePanel — 엣지(진행 중 중복 클릭·스크롤락 복원·백드롭/ESC)·접근성
- [ ] R7: 문서·위생 — progress 문서 사실성, 미사용 임포트/lint 잔존
- [ ] R8: 최종 게이트 — tsc + 전체 vitest + 프로덕션 빌드 재확인

### 리뷰 결과 기록

(스텝별로 아래에 추가)

## 최종 결과 요약

- `tsc --noEmit` 0 에러 (기존 17건) — 타입 안전망 복구
- GameBoard.tsx 1,793 → 965줄, 렌더 레이어 5파일 분리 (로직 무변경)
- gameStore.ts **4,832 → 2,774줄 (−43%)**: 모듈 헬퍼 5파일(`store/helpers/`) +
  slice 3파일(`store/slices/` — uiSlice·auctionSlice·goodsGrowthSlice), 전부 코드 그대로 이동
- 전체 vitest 24파일 207개 통과, 7개 맵 dev 페이지 정상 (각 스텝마다 게이트 통과)
- ✅ 머지 전 `npm run build` 검증 완료 (2026-07-03, dev 중단 후 실행): 프로덕션 빌드 성공, 게임 8경로 SSG 정상.
  1차 빌드에서 ESLint 미사용 임포트 4건 발견(분리 과정 잔재 — tsc는 미사용 임포트를 안 잡음) → 정리:
  GameBoard `PLAYER_COLORS`, gameStore `PlayerState`·`BoardState`·`getMapData`·`PLAYER_ACTION_PHASES`
