# PR #17 코드리뷰 진행 기록 (남부 미국 맵)

> **목적**: 토큰 소진 시 다른 PC에서 이어서 진행하기 위한 상태 기록.
> **재개 방법**: 이 브랜치(`feature/southern-us-map`)를 pull 받고, 아래 체크리스트에서
> `[ ]` 남은 스텝부터 Claude Code에 "docs/code-review-pr17-progress.md 이어서 진행해줘"로 요청.
> **PR**: https://github.com/krindale/aos-showcase/pull/17 (커밋 22ce5bb, 19파일 +829/−38)

## 전체 변경 사항 요약 (리뷰 대상)

### A. 남부 미국 맵 신규 (6인 6턴, 면화 운송)
1. `src/utils/southernUsMap.ts` (신규) — 이미지 추출 맵 데이터. flat-top 전치 11×17
   (row=화면열+1 패리티, row 0 빈 줄, 하단 잘린 헥스 col 11 제거). 도시 12·마을 14·산 15·강 11.
2. `src/maps/profiles/SouthernUsMapProfile.ts` (신규) — cityCubeCounts(Atlanta 4/항구 3/기타 1),
   townFixedCube='white', incomeSources cityCubes+townCubes, cubeDeliveryBonus(white +1),
   deliveredCubeLeavesGame(white), urbanizationMovesTownCubes, bonusCityCubeId='atlanta'+MaxTurn 4,
   incomeReductionMultiplier(4턴 2배), specialRules 6항목.
3. `src/types/game.ts` — `CubeColor = CityColor | 'white'` 분리, CUBE_COLORS.white,
   `BoardState.cottonPorts?: string[]`.
4. `src/utils/hexGrid.ts` — `cityAcceptsCube`에 white→cottonPorts 분기 (배달 판정 단일 소스),
   경로탐색 3개 함수 cubeColor 파라미터 CityColor→CubeColor 확대.
5. `src/store/gameStore.ts` — ① 셋업 townFixedCube(면화는 주머니에서 안 뽑음),
   ② completeCubeMove: cubeDeliveryBonus 가산 + white는 주머니 반환 스킵,
   ③ placeNewCity: urbanizationMovesTownCubes면 마을 큐브→신도시 / 아니면 주머니 반환(Western 룰북),
   ④ growGoods: bonusCityCubeMaxTurn(1~4턴), ⑤ applyIncomeReduction: multiplier,
   ⑥ 터미널 셋업 cube를 CityColor로 캐스팅(주머니에 white 없음 전제).
6. `src/maps/MapProfile.ts` — 위 신규 getter 6종 기본값 추가. `src/maps/getMapProfile.ts` 등록.
7. `src/utils/mapRegistry.ts` — southern-us 엔트리 (orientation flat, hideLakeHexes, trimLeftHexes 1).
8. `src/ai/strategy/vp.ts` + `src/ai/strategies/moveGoods.ts` — 면화 +1 보너스를 ΔVP에 가산.
9. `src/app/game/[mapId]/page.tsx` — SSG 파라미터. `src/app/maps/page.tsx` — 갤러리 index 4 카드.
10. `src/ai/__tests__/southernUsSimulation.test.ts` (신규) — 100시드 러너 + 면화 불변식.
11. `public/maps/southern-us.webp` — 갤러리 이미지.

### B. 서부 미국 룰 보완
12. `placeNewCity` 마을 큐브 주머니 반환 (위 5-③와 동일 지점), `WesternUsMapProfile.specialRules` 항목 추가.

### C. 보드 UI
13. `src/components/game/GameBoard.tsx` — 면화 항구 안쪽 흰 테두리 7px+검은 라인 1px,
    면화 큐브 14.4px(20%↑)+테두리 2px (마을/도시/이동 큐브), 좌표 토글 라벨 동작 기준으로 수정.

### D. 문서/테스트 헬퍼
14. `CLAUDE.md` Southern 섹션, `docs/ai-auction-baseline-100seed.md` 베이스라인 행,
    `src/utils/testHelpers.ts` createTestCity color 파라미터 CityColor로 수정.

## 검증 상태 (리뷰 전 이미 통과)
- southernUsSimulation 100시드: 전 게임 6턴 완주, VP 12.30·파산 0.54, 면화 불변식 통과
- 기존 맵 회귀: AI 스위트 14파일 132 tests 통과, Western 재측정 11.07/0.50 (변화 없음)
- store/utils 74 tests, tsc(신규 에러 0), npm run build 성공

## 코드리뷰 체크리스트 (스텝바이스텝)

- [x] **스텝 1 — 면화 규칙 정합성** ✅ 통과 (2026-07-03):
      셋업(townFixedCube, 주머니 미사용)·배달 종료(cityAcceptsCube white→cottonPorts)·+1 보너스·
      게임 제거(주머니 반환 스킵)·도시화 이동(placeNewCity) 모두 룰북 일치. 엔진/AI에
      `city.color === cube` 우회 비교 없음(grep 확인 — 헬퍼 자신 + UI 밝기 판정뿐).
      수입감소 ×2는 룰 테이블 조회 후 곱해 순서 정확. Atlanta 보너스 turn<=4 게이트 정확.
      경미: applyIncomeReduction(플레이어 루프 내)·placeNewCity(4회)·completeCubeMove(2회)의
      getMapProfile 중복 호출 — 캐시 조회라 비용 미미, 스텝 7에서 hoist 정리 예정.
- [x] **스텝 2 — 타입 확장 파급** ✅ 통과 (2026-07-03):
      `: CityColor`/`as CityColor` 사이트 전수 grep — testHelpers.createTestCity(도시 생성, 정당)와
      gameStore 터미널 캐스팅(Southern 터미널 없음 + Germany 주머니에 white 없음, 주석 문서화) 2곳뿐.
      그 외 흐름은 전부 CubeColor로 넓혀졌고 tsc strict가 역방향 누출을 구조적으로 차단.
      CUBE_COLORS 소비처 14곳은 white 키 추가로 undefined 조회 없음. NewCityTile.color는
      CityColor 타입이라 white 신도시 원천 불가. 100시드 불변식(주머니/디스플레이 white 0) 실증 완료.
- [x] **스텝 3 — 맵 데이터** ✅ 통과 (2026-07-03, 스크립트 검증):
      좌표 중복/범위 0건, 마을 전부 plain 타일·도시 헥스 타일 없음, 디스플레이 52슬롯 정확,
      주사위 1~6 각 2도시, 항구 4곳 실존, 인접 패리티 스팟체크(Atlanta–산/Knoxville–산/
      Savannah–강/Mobile–강) 통과, createSouthernUsBoardState의 cottonPorts 4개 주입 확인.
- [x] **스텝 4 — Western 주머니 반환 + placeNewCity 순서** ✅ 통과 (2026-07-03):
      한국 디스플레이 보충이 state.goodsDisplay가 아닌 체인된 updatedGoodsDisplay에서 읽도록
      수정돼 있어(diff 확인) 주머니 반환과 병합 충돌 없음. captureUndo가 모든 변이 전 호출 +
      UndoSnapshot.goodsDisplay(structuredClone) 존재 → 취소 시 주머니/마을 큐브 복원 정합.
      한국(마을 큐브 0)·St.Lucia(hexCube)·튜토리얼·Rust·Germany는 no-op으로 무영향.
      발견 F3(경미): urbanizationMovesTownCubes를 if/!if로 2회 조회 — 스텝 7에서 if/else+호이스트.
- [x] **스텝 5 — AI 계층** ✅ 통과 (2026-07-03):
      vp.estimateRouteVP(opp.cubeColor)·moveGoods(반복 중인 cubeColor) 보너스 가산 정확,
      비-남부 맵은 cubeDeliveryBonus=0이라 무영향(diff 재확인). 마을 면화 목표는 analyzer의
      incomeSources townCubes 게이트로 생성(신규 분기 없음). cityAcceptsCube white 분기는
      동등 비교 1회 추가로 성능 무영향. 100시드에서 면화 8.4/게임 배달로 AI 활용 실증.
- [x] **스텝 6 — UI** ✅ 통과 (2026-07-03):
      GameBoard 변경 4곳 전부 white/cottonPorts 조건 게이트 — 다른 맵은 렌더 결과 불변.
      항구 흰 링(HEX_SIZE-5, 7px)과 안쪽 검은 라인(HEX_SIZE-9) 기하 겹침 없음, 터미널 띠와
      공존 가능(동시 사용 맵 없음). 좌표 토글은 라벨만 동작 기준으로 변경(로직 불변).
      F2(큐브 스타일 3곳 중복)는 스텝 7에서 헬퍼로 추출.
- [x] **스텝 7 — 발견 사항 수정 반영 + 재검증 + 커밋 푸시** ✅ 완료 (2026-07-03):
      F1(gameStore getMapProfile 호이스트 3개 함수)·F2(GameBoard 큐브 스타일 헬퍼
      cubeRenderSize/cubeStrokeColor/cubeStrokeWidth 추출)·F3(placeNewCity if/else 통합) 반영.
      재검증: tsc 신규 에러 0, store 60 + southernSim 100시드 통과(베이스라인 12.30/0.54 동일 —
      동작 불변 리팩토링 확인).

## 리뷰 결론

**심각/중간 버그 0건.** 경미한 정리 3건(F1~F3)은 반영 완료. 기각 3건(후보 접수 섹션 참조).
리뷰 완료 — PR #17 머지 가능 상태. 남은 후속(리뷰 밖): dev 시각 검수, AI 밸런싱(순서 편향·면화 활용).

## 발견 사항 (리뷰 진행하며 기록)

### 확정 (수정 대상 — 스텝 7에서 반영)
- F1 (효율/경미): gameStore에서 getMapProfile을 같은 함수 안에서 반복 호출
  (applyIncomeReduction 루프 내, placeNewCity 4회, completeCubeMove 2회) → 함수 앞에서 1회 캐시.
- F2 (단순화/경미): GameBoard 면화 큐브 스타일(14.4px/굵은 테두리)이 마을/도시/이동 큐브 3곳에
  중복 → 공용 헬퍼(cubeRenderSize/cubeStroke)로 추출.
- F3 (단순화/경미): placeNewCity의 urbanizationMovesTownCubes 반대 조건 if 2개 → profile 호이스트
  + if/else 통합 (F1과 같은 커밋에서 처리).

### 후보 접수(검증 전 — 해당 스텝에서 판정)
- 병렬 파인더(단순화/효율/재사용 3개 앵글) 결과 접수. 나머지 5개 앵글 에이전트는 사용자 지시
  (스텝바이스텝)로 중단 — 스텝 2~6을 본 세션에서 직접 순차 수행.
- (재사용) createSeededRng/AUTO_PHASES가 7개 시뮬 테스트에 중복 — 기존 코드 전반의 관례라
  이 PR 범위 밖(전 파일 동일 패턴). 별도 리팩토링 과제로 보류.
- (효율) cottonPorts string[] → Set 제안 — 4원소 includes라 실측 비용 무의미, 기각.
- (단순화) MapProfile `void param` 패턴 — 기존 파일 관례와 동일, 기각.
- (단순화) placeNewCity 반대 조건 2개(if/if) → F3으로 확정 (스텝 4).
