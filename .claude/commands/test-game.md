---
description: Age of Steam 게임 10단계 전체 Playwright 테스트 실행 (project)
---

Age of Steam 게임의 Playwright 테스트를 실행해주세요.

## 테스트 파일

1. `tests/game-phases.spec.ts` - 게임 단계별 기본 테스트 (50개)

## 실행 단계

1. 실행 중인 dev 서버 포트 확인:
```bash
# 3000 포트 확인
lsof -i :3000 -sTCP:LISTEN 2>/dev/null | grep node
# 3001 포트 확인
lsof -i :3001 -sTCP:LISTEN 2>/dev/null | grep node
```

2. dev 서버가 없으면 시작 (포트 3000 기본):
```bash
npm run dev -- -p 3000 &
```

3. 전체 테스트 실행 (실행 중인 포트에 맞춤):
```bash
# 3000 포트에서 실행 중이면:
PORT=3000 npx playwright test

# 3001 포트에서 실행 중이면:
PORT=3001 npx playwright test
```

4. 특정 테스트 파일만 실행:
```bash
PORT=3000 npx playwright test tests/game-phases.spec.ts
```

5. 테스트 실패 시 리포트 확인:
```bash
npx playwright show-report
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

### Phase IV: Build Track (트랙 건설)
- 헥스 선택 및 트랙 배치 UI 확인
- 트랙 비용 계산 확인 (평지, 강, 산)
- Engineer 행동 시 4개 트랙 배치 가능 확인

### Phase V: Move Goods (물품 이동)
- 물품 큐브 선택 UI 확인
- 엔진 레벨에 따른 최대 이동 거리 확인
- 수입 트랙 업데이트 확인

### Phase VI: Collect Income (수입 수집)
- 수입 트랙 값에 따른 수입 수령 확인

### Phase VII: Pay Expenses (비용 지불)
- 발행 주식 수 × $1 + 기관차 링크 수 × $1 비용 계산
- 파산 조건 테스트

### Phase VIII: Income Reduction (수입 감소)
- 수입 범위별 감소량 확인 (50+: -10, 41-49: -8, 31-40: -6, 21-30: -4, 11-20: -2, 0-10: 0)

### Phase IX: Goods Growth (물품 성장)
- Production 행동 선택 시 2개 큐브 배치 확인
- 주사위 굴림 및 물품 배치 확인

### Phase X: Advance Turn Marker (턴 마커 전진)
- 턴 마커 전진 확인
- 마지막 턴 종료 시 게임 종료 및 승점 계산

## 참고 사항

- 테스트는 `tutorial` 맵, 2인 플레이어 설정 사용
- 테스트 실패 시 스크린샷: `test-results/` 폴더 확인
