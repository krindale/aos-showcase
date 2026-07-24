# 검증 대기 이슈 (2026-07-23 세션)

이 세션에서 구현했으나 **아직 실사용/시뮬 검증이 끝나지 않은** 항목들. 각 항목 검증 후 체크.

## 1. 온라인 — 대기실 본인 이름 변경 ⏳
- **구현**: `roomLogic.renameSeat`(트림·중복거부) + `netStore.renameSeat`(호스트 직접 / 게스트 intent) +
  `OnlineLobby` 편집 UI(✏️). 단위 테스트 4개 통과.
- **검증 필요 (2탭 E2E)**:
  - [ ] 앞뒤 공백이 트림되어 저장 (`"  홍길동  "` → `홍길동`)
  - [ ] 다른 좌석과 같은 이름이면 거부("이미 같은 이름이 있어요")
  - [ ] **게스트**가 이름 변경 → 호스트 거쳐 전원에 반영
  - [ ] 호스트 본인 이름 변경 즉시 반영

## 2. 온라인 — 방 승계 시 방 복원(upsert) ⏳
- **원인 확정(DB 조회)**: 방장이 "방 나가기" → `closeRoom`이 DB 삭제 → 승계자 `updateRoom`(UPDATE)이
  삭제된 행을 못 살려 공개목록·재입장 불가. (승계 방 `FJVVYJ`가 DB에 없던 것으로 확인)
- **구현**: `supabaseTransport.upsertRoom`(id 기준 update-or-insert) + `promoteToHost`가 이걸 사용.
  방장이 나가면 방을 닫고(유령 방 방지), 승계자가 같은 id·code로 되살림.
- **검증 필요 (2탭+)**:
  - [ ] 방장 "방 나가기" → 다른 사람 승계(이어받기) → **다른 사람이 공개방 목록에서 그 방을 보고 입장 가능**
  - [ ] 아무도 승계 안 하면 방이 DB에 남지 않음(유령 방 없음)

## 3. 달 — 강화된 수입 감소: **유지 결정 (강화 미적용, 검증 불필요)** ✅
- 룰북(Moon)은 표준보다 강한 수입 감소(50+ −15 등)를 규정하나, 짝을 이루는 Satellite 미니 확장
  (수입 기회 보강)이 미구현이라 감소만 강화하면 균형이 어려운 쪽으로만 쏠린다.
- 100시드 측정(VP 20.29 → 10.47, 파산 0.16 불변)까지 해본 뒤 **표준 감소 유지로 최종 결정** —
  강화 코드는 커밋하지 않음(2026-07-23 rebase로 drop). 향후 Satellite 구현 시 함께 검토.

## 4. 보드 인터랙션 게이팅 (자기 차례만 조작) ⏳
- **구현**: `GameBoard`의 `handleHexClick`/`handleCubeClick`에 `boardInteractionBlocked` 가드
  (`currentPlayer`가 봇이거나 온라인에서 내 좌석이 아니면 무시). AI는 store 직접 호출이라 무영향.
- **검증 필요**:
  - [ ] 오프라인 봇 게임: **봇 차례에 화물/헥스 클릭 무시**, 사람 차례에만 조작
  - [ ] 온라인: 내 좌석 currentPlayer일 때만 조작
  - [ ] 핫시트(사람 여럿): 각자 자기 차례에 조작 정상
  - [ ] 회귀: 건설·도시화·화물이동 등 정상 진입 (자기 차례)

## 5. 교차 철도 소유자 판정 ⚠️ 회귀 미완 (중단됨)
- **원인 확정(로그)**: `getPathLinkOwners`(미리보기 `findRouteOptions`+정산 `completeCubeMove` 공통)가
  교차 헥스에서 화물이 지나는 트랙을 구분 않고 `track.owner`(primary)만 집음 → 내 crossing
  (secondaryOwner)을 지나도 **기존 트랙 주인(남)으로 카운트**. 미리보기·정산 둘 다 오류.
- **구현**: `trackOwnerForEntry(track, entryEdge)` — 들어온 edge가 `secondaryEdges`면 `secondaryOwner`.
  `getPathLinkOwners`(미리보기 자동 반영) + `completeCubeMove`(정산) 양쪽 적용. store 테스트 47개 통과.
- **⚠️ 주의(HMR 함정)**: zustand store가 HMR로 slice 로직을 안 갈아끼워, **dev 재시작+.next 삭제 전엔
  옛 정산 코드가 돌아** "가이드는 고쳐졌는데 수익은 저놈한테" 증상이 남았다. 검증 시 반드시 강력 새로고침.
- **검증 필요**:
  - [ ] 강력 새로고침 후: 내 crossing 지나는 화물의 **미리보기 own/opp + 실제 수익 귀속**이 나에게
  - [ ] `moveIncome` 로그(:3999)의 `gains`로 정산 귀속 확인
  - [ ] **100시드 회귀 재측정 (중단됨)** — 달·Rust Belt·St.Lucia 등 교차 트랙 맵. baseline과 비교
    - Moon baseline(현재): VP 20.29·파산 0.16 (단 #3 수입감소 적용 시 10.47)
    - 진단 로그(`moveIncome`)는 검증 후 제거할지 결정

## 커밋 구성 (이 브랜치)
1. `feat(online)`: 이름 변경 + 방 승계 upsert
2. `fix(board)`: 자기 차례만 보드 조작 게이팅
3. `fix(goods)`: 교차 철도 소유자 판정 + moveIncome 진단 로그
(달 수입 감소 강화는 유지 결정으로 커밋하지 않음 — 위 #3 참조)
