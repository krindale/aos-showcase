---
description: Age of Steam 게임 10단계 전체 Playwright 테스트 실행
---

# Age of Steam 게임 테스트 워크플로우

Age of Steam 게임의 10가지 게임 단계를 Playwright로 테스트합니다.

## 게임 단계 (Sequence of Play)

```
I.   Issue Shares (주식 발행)
II.  Determine Player Order (플레이어 순서 결정)
III. Select Actions (행동 선택)
IV.  Build Track (트랙 건설)
V.   Move Goods (물품 이동)
VI.  Collect Income (수입 수집)
VII. Pay Expenses (비용 지불)
VIII.Income Reduction (수입 감소)
IX.  Goods Growth (물품 성장)
X.   Advance Turn Marker (턴 마커 전진)
```

## 사전 준비

// turbo
1. 프로젝트 루트로 이동하여 의존성 설치:
```bash
cd /Users/dalelee/Desktop/aos-showcase && npm install
```

// turbo
2. Playwright 브라우저 설치 (처음 실행 시에만):
```bash
npx playwright install chromium
```

// turbo
3. 개발 서버 실행 (별도 터미널 또는 백그라운드):
```bash
npm run dev &
```

## 테스트 파일 위치

테스트 파일: `/Users/dalelee/Desktop/aos-showcase/tests/game-phases.spec.ts`

## 테스트 실행 방법

// turbo
4. 전체 테스트 실행:
```bash
cd /Users/dalelee/Desktop/aos-showcase && npx playwright test tests/game-phases.spec.ts
```

// turbo
5. UI 모드로 테스트 실행 (테스트 과정 시각화):
```bash
cd /Users/dalelee/Desktop/aos-showcase && npx playwright test tests/game-phases.spec.ts --ui
```

// turbo
6. 특정 단계만 테스트:
```bash
# 예: Issue Shares 단계만 테스트
cd /Users/dalelee/Desktop/aos-showcase && npx playwright test tests/game-phases.spec.ts -g "Issue Shares"
```

// turbo
7. 디버그 모드로 테스트:
```bash
cd /Users/dalelee/Desktop/aos-showcase && npx playwright test tests/game-phases.spec.ts --debug
```

// turbo
8. 테스트 결과 리포트 확인:
```bash
cd /Users/dalelee/Desktop/aos-showcase && npx playwright show-report
```

## 테스트 시나리오 요약

### Phase I: Issue Shares (주식 발행)
- 게임 시작 시 2주 발행 확인
- 주식 발행 버튼 클릭하여 추가 주식 발행
- $5 수령 및 발행 주식 트랙 업데이트 확인

### Phase II: Determine Player Order (플레이어 순서 결정)
- 경매 입찰 UI 확인
- 입찰/패스 동작 테스트
- 입찰 금액 지불 및 순서 결정 확인

### Phase III: Select Actions (행동 선택)
- 7가지 특수 행동 카드 표시 확인
- 행동 선택 및 다른 플레이어 선택 불가 확인
- First Move, First Build, Engineer, Locomotive, Urbanization, Production, Turn Order

### Phase IV: Build Track (트랙 건설)
- 헥스 선택 및 트랙 배치 UI 확인
- 트랙 비용 계산 확인 (평지, 강, 산)
- 단순/복합 트랙 배치 테스트
- Engineer 행동 시 4개 트랙 배치 가능 확인

### Phase V: Move Goods (물품 이동)
- 물품 큐브 선택 UI 확인
- 이동 경로 계획 및 실행
- 엔진 레벨에 따른 최대 이동 거리 확인
- 도착 도시 색상 매칭 확인
- 수입 트랙 업데이트 확인

### Phase VI: Collect Income (수입 수집)
- 수입 트랙 값에 따른 수입 수령 확인
- 플레이어 현금 업데이트 확인

### Phase VII: Pay Expenses (비용 지불)
- 발행 주식 수 × $1 비용 계산
- 기관차 링크 수 × $1 비용 계산
- 현금 부족 시 수입 감소 처리
- 파산 조건 테스트

### Phase VIII: Income Reduction (수입 감소)
- 수입 범위별 감소량 확인
  - 50 이상: -10
  - 41-49: -8
  - 31-40: -6
  - 21-30: -4
  - 11-20: -2
  - 0-10: 0

### Phase IX: Goods Growth (물품 성장)
- Production 행동 선택 시 2개 큐브 배치 확인
- 주사위 굴림 UI 확인
- 물품 디스플레이에서 도시로 큐브 이동 확인

### Phase X: Advance Turn Marker (턴 마커 전진)
- 턴 마커 전진 확인
- 마지막 턴 종료 시 게임 종료 및 승점 계산
- 새 턴 시작 시 Issue Shares 단계로 복귀 확인

## 참고 사항

- 테스트는 `rust-belt` 맵을 기본으로 사용
- 2인 플레이어 설정으로 테스트
- 각 단계는 독립적으로 테스트 가능
- 게임 상태는 Zustand 스토어로 관리됨

## 디버깅 팁

1. 테스트 실패 시 스크린샷 확인: `test-results/` 폴더
2. 개발자 도구로 게임 상태 확인: `window.__ZUSTAND_STORE__`
3. 네트워크 요청 확인: Playwright trace 사용
