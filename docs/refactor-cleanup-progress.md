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
- [ ] 스텝 2: GameBoard.tsx 서브 컴포넌트 분리
  - 원칙: **순수 렌더 분리만** — 게임 로직/store 액션/시뮬레이션 무영향. props로 내려서 분리
  - 후보 레이어: 헥스 타일 배경, 트랙(+마을 가닥), 도시/마을(라벨·큐브·직결 링크), 오버레이(경로 하이라이트·이동 큐브·좌표)
  - 검증: `npx vitest run` + `npm run build` + dev 시각 확인 (기능 불변)
- [ ] 스텝 3: gameStore slice 분리 로드맵 문서화 (실행은 추후 — 해당 영역을 수정할 일이 생길 때 점진)

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

### 스텝 2
- (진행 예정)

### 스텝 3
- (진행 예정)
