# 이슈 수정 기록 (Issue Log)

버그·이슈 수정 이력을 모아두는 문서. **CLAUDE.md에는 "현재 동작 규칙·함정"만 남기고**,
"어떤 버그를 언제 어떻게 고쳤다"는 이력은 여기에 정리한다 (CLAUDE.md가 changelog가 되지 않도록).

- 최신 항목이 위로 오도록 역순 정리.
- 각 항목: 증상 → 원인 → 수정 → (있으면) 커밋/테스트/측정.

---

## 2026-07-04 — Turn Order 특수행동 무효 + 온라인 공통 버튼 조작 권한 (PR #22)

### Turn Order 특수행동이 표준 맵에서 사실상 무효

- **증상**: Turn Order 특수행동을 골라도 다음 턴 경매에서 "Turn Order 패스" 버튼이 뜨지 않음(사람·AI 모두).
- **원인**: 패스 권한을 `player.selectedAction === 'turnOrder'`로만 판정했는데, Turn Order 효과는
  phase III(행동 선택)에서 골라 **다음 턴** phase II(경매)에 발동한다. 그런데 `selectedAction`은 턴
  롤오버(`resetPlayerActions`) 때 지워지므로, 경매가 열리는 다음 턴엔 항상 null → `canUseTurnOrderPass`가
  늘 false. 표준 맵에서 이 액션이 사실상 무효였다(St.Lucia는 경매가 아니라 교대 선공권이라 별도 경로로 동작).
- **수정**: `PlayerState.turnOrderPassAvailable` 지속 플래그 추가. `resetPlayerActions`가 롤오버 시
  "직전 턴 selectedAction === 'turnOrder'"로 부여 + `turnOrderPassUsed` 리셋. 사람(`AuctionPanel`)·
  AI(`strategies/auction.ts`) 판정을 새 플래그로 교체.
- **부작용 차단**: AI·테스트는 `skipBid`를 직접 호출하는데 `skipBid`가 `turnOrderPassUsed`를 안 세우면
  `available && !used`가 계속 참이라 **봇이 매 라운드 무한 스킵**. 사용 플래그 세팅을 `skipBid` 액션 내부로
  **중앙화**하고(사람 패널·호스트 intent의 중복 raw setState 제거), 스냅샷은 `extractSyncedState`가 players를
  통째로 직렬화해 새 필드 자동 동기화.
- **측정**: tsc, net/store 유닛 99개, fullGameSimulation 16개, Rust Belt 100시드 베이스라인 통과(다인 맵 거동 게이트 유지).

### 온라인 공통 버튼을 아무나 눌러 넘김(혼란·깜빡임)

- **증상**: 온라인에서 정산·물품성장·턴마커처럼 공통으로 넘기는 버튼을 아무 플레이어나 눌러도 넘어가고,
  비차례 게스트가 눌러 optimistic 반영 후 호스트가 거부·되돌려 화면이 깜빡임.
- **수정**: 버튼을 두 부류로 게이팅(동작 규칙은 CLAUDE.md "버튼 조작 권한(UI 게이팅)" 참조). ① 공통 진행/정산
  단계는 방장(offline·host)만, 게스트는 대기 안내(`PhasePanel` `amIHost`·`GoodsGrowthPanel` early-return).
  ② 개인 결정 단계(주식·행동·건설·이동·경매 입찰)는 차례 좌석만(`PhasePanel` `isMyTurn`·`AuctionPanel` `isMyBid`).
  오프라인은 `myPlayerId=null`이라 항상 true → 무변경.
- **리뷰 발견 수정** (`c1db560`): 초기 커밋은 PhasePanel만 게이팅해 경매(별도 `AuctionPanel`)의
  입찰/포기/스킵/완료/건너뛰기가 비차례 게스트에게 그대로 노출돼 같은 깜빡임이 남아 있었다 → `isMyBid`로 통일.

## 2026-07-04 — 온라인에서 봇 전환 후 정산/물품성장 단계 교착 (PR #21)

- **증상**: 온라인 플레이 중 게스트가 연결이 끊겨 봇으로 전환했더니, 호스트 화면에 "봇 차례"로
  표시되지만 봇이 아무 액션도 하지 않고 게임이 멈춤.
- **원인 확정(Supabase 스냅샷 디코딩)**: 방 `7HHP3U`(Korea 4인, 턴 3)의 rooms 스냅샷을 열어보니
  `currentPhase=incomeReduction`, `currentPlayer=player2`(봇 전환된 게스트, `isAI:true`)에서 멈춰
  있었다. 정산 3단계·`advanceTurn`·`goodsGrowth`는 봇의 "결정"이 필요 없어 AI 스케줄러
  (`PLAYER_ACTION_PHASES`) 대상이 아니고, 원래 사람이 '진행'/'주사위' 버튼으로 넘기던 단계다.
  게스트가 하필 그 단계의 첫 순서(경매로 `playerOrder[0]`)라 끊긴 뒤 봇 전환해도 진행 주체가
  사라져 교착됐다. (행동 5단계는 `executeAITurn`으로 자동 진행되므로 봇 전환 시 원래부터 정상)
- **수정** (`630049c`): `aiScheduler`에 `AI_AUTO_ADVANCE_PHASES` + `scheduleAICheck` 두 번째 분기
  (봇이 자동 단계 `currentPlayer`면 `runAIAutoPhase`). `gameStore.runAIAutoPhase` — 정산은 자동
  `nextPhase`, goodsGrowth는 봇 주사위 자동 굴림(활성 플레이어 수만큼 1~6) + `growGoods` 후 진행.
  `nextPhase` 끝의 재예약으로 정산~물품성장이 debounce 간격으로 연쇄 자동 통과된다. 동작 규칙은
  CLAUDE.md "봇 자동 단계 진행" 참조.
- **리뷰 발견 수정** (`144719b`): 초기 구현은 `runAIAutoPhase`를 `intents.ts`에 등록 안 해,
  게스트가 optimistic `nextPhase`를 로컬 실행해 봇 정산 단계로 넘어가면 게스트에서
  `runAIAutoPhase`가 실제로 돌아 내부 `growGoods`/`nextPhase`가 로컬 반영 + 거부될 intent를 스팸
  전송(디싱크)했다 — `executeAITurn`이 `guestNoop`으로 막는 것과 같은 경로가 뚫려 있었다.
  `runAIAutoPhase: { guestNoop: true }` 등록으로 봇 자동화를 호스트 전용으로 대칭화.
- **테스트**: `store/__tests__/aiAutoPhase.test.ts`(정산 자동 진행·goodsGrowth 봇 주사위·사람 차례
  미진행·scheduleAICheck 연쇄 4개) + `net/__tests__/intents.test.ts`에 게스트 no-op 회귀 1개.
  전체 유닛 245개·타입체크 통과.
- **한계**: DB에 남은 교착 방 `7HHP3U`는 배포 코드로 돌던 게임이라 이 수정으로 자동 복구되지
  않음(필요 시 수동 정리). 봇 생산 선택자의 실제 주머니 뽑기는 여전히 미구현(기존 갭, 범위 밖).

## 2026-07-04 — 온라인 멀티플레이 안정화 + PR #19 코드리뷰

feature/online-multiplayer 브랜치 (PR #19). 온라인 플레이 중 발견된 이슈들과 순차 코드리뷰 결과.

### 온라인 동기화·UX

- **봇 진행이 백그라운드 탭에서 3~4초로 느려짐** (`32d02c9`)
  - 원인: 크롬이 숨김 탭의 setTimeout을 최소 1초로 스로틀 — 봇 파이프라인이 타이머 3개
    체인이라 창이 가려지면 행동당 3~4초. 온라인에선 호스트 창이 뒤로 가면 게임 전체가 멈춤.
  - 수정: `src/utils/safeTimers.ts`(Web Worker 기반 safeTimeout/safeInterval, 취소 함수 반환)로
    넷·게임 진행·이동 정산 타이머 전면 교체. Worker 불가 환경(vitest/SSR)은 setTimeout 폴백.
    `AI_TURN_DELAY` 1000→1350(VITEST는 1000 유지) → 봇 간격 ≈1.5초(debounce 150 + 1350).
  - 실측(hidden 탭, 독일 4인): 봇 간격 1551/1556ms — 전경/배경 동일.

- **마지막 플레이어 행동을 확인할 새가 없음** (`fdf3d39` 등, 이번 세션 이전 + safeTimers 반영)
  - `AI_ACTION_VIEW_DELAY`(gameStore, 1200) — 단계의 **마지막 플레이어** 행동으로 넘어갈 때만
    결과를 잠시 보여준 뒤 진행(중간 봇은 즉시). 스냅샷은 `PHASE_CHANGE_HOLD`(1200)로 단계
    전환 스냅샷을 홀드해 게스트도 동일하게 본다.

- **게스트에게 화물 이동 애니메이션이 안 나옴** (`5be532d`)
  - 원인: `ui.movingCube`가 로컬 전용이라 스냅샷에 안 실림 — 게스트는 결과만 뚝 떨어짐.
  - 수정: `netMovingCube`로 승격 동기화(snapshotCodec). 게스트가 자기 ui.movingCube에 주입해
    같은 애니메이션을 봄. 정산(completeCubeMove)은 여전히 호스트 타이머 전용(게스트는 noop).
    ⚠️ encodeSnapshot이 내부에서 상태를 재추출하므로 `'ui' in state`일 때만 파생(무조건 덮으면
    null로 지워지는 멱등성 버그).

- **게스트가 이동 후에도 화물 가이드(골드 점선/선택)가 남음** (`99f902b`)
  - 원인: 게스트 안내 ui는 로컬인데 이동 실행은 호스트라 지워주는 주체가 없었음.
  - 수정: 이동 애니메이션(netMovingCube)이 도착하는 순간 selectedCube/reachableDestinations/
    movePath를 함께 정리. 호스트가 거부한 경우엔 남겨 재선택 가능(의도).

- **채팅 위치·알림·차단 UX** (`bd4bdab`, `670c6a1`, `99f902b`)
  - 채팅 버튼을 게임 보드 우측 하단 sticky 호버링으로(보드가 화면보다 길면 뷰포트 하단에 따라붙음).
  - 채팅창 닫혀 있을 때 새 메시지 도착 시 Web Audio "딩동" 알림음(외부 파일 없음).
  - 채팅 열 때 scrollIntoView가 페이지 전체를 끌어당기던 것 → 목록 컨테이너 내부만 스크롤.
  - 단계 전환 팝업이 숨김 탭에서 박제된 채 화면 클릭을 먹던 것 → pointer-events-none + safeTimeout.
  - 상대 차례에 우측 패널 스크롤 락 → 오버레이를 보드 열만 덮고 패널은 내용만 pointer-events-none.

### 게임 규칙·렌더

- **미완성 트랙 소유 마커가 그 턴 내내 안 사라짐** (`8f85ae1`)
  - 원인: `releaseUnextendedTrack`이 턴 전체 종료 때만 해제 → 룰북 IV(자신의 건설 턴에 연장
    안 하면 제거) 타이밍과 어긋남.
  - 수정: ownerId 필터 추가, 각 플레이어의 건설 차례 종료 시(nextPhase의 buildTrack 전환) 그
    플레이어의 미연장 미완성 구간을 공용화. 턴 종료 전체 해제는 안전망으로 유지.
  - ⚠️ trackCubes 맵(St.Lucia)은 제외 — 미완성 구간 소유가 수입원인데 AI 미적응이라 즉시 해제
    시 붕괴(20시드 VP 추가 악화). 테스트 `store/__tests__/releaseUnextendedTrack.test.ts`(7케이스).
  - 게이트: tutorial 9.65 불변, Rust Belt 100시드 18.05·파산 0.32(기준 17.7/0.33).

- **Southern US Atlanta가 회색으로 렌더됨** (`6a9890c`)
  - 원인: Berlin(독일)의 회색 헥스 표현이 `bonusCityCubeId`에 묶여, 호황 규칙만 공유하는
    Atlanta(빨강 도시)까지 회색이 됨.
  - 수정: `MapProfile.grayRenderCityId`(순수 시각 속성) 신설 — Germany만 'berlin' 반환. 보너스
    규칙과 렌더를 분리.

- **마을 위 화물 큐브를 클릭해도 반응 없음(마을 원을 눌러야 수송)** (`a7db6bb`)
  - 원인: 큐브 rect가 마을 헥스 위에 그려져 클릭을 삼킴 + 클릭 핸들러 없음.
  - 수정: 이동 단계엔 큐브 rect에 선택 핸들러(`town:<id>` 컨벤션, 해당 index)를 달고, 그 외
    단계엔 pointer-events:none으로 헥스에 통과(BoardTowns).

### PR #19 순차 코드리뷰 (스텝1~5)

- **채널 구독 무한 대기** (`0666088`): SUBSCRIBED도 에러도 안 오는 경로(구독 전 CLOSED 등)에서
  입장 Promise가 안 풀림 → 15초 타임아웃 + 채널 정리 후 reject.
- **방 메타 브로드캐스트 스냅샷 낭비** (`0666088`): broadcastRoom이 압축 게임 상태(~2KB)를 통째로
  실어 보냄(수신측은 seats/status만 사용) → snapshot:null로 제외.
- **호스트 ui 주입 잔존** (`b4fe7cc`): 게스트 payload.ui를 호스트 ui에 주입 후 복원 안 해 거부/완료
  뒤에도 게스트 선택이 호스트 화면에 남음 → finally에서 원값 복원.
- **이중 호스트 경합** (`b4fe7cc`): 승계 직후(6초 경계) 옛 호스트 복귀 시 둘 다 host로 스냅샷 송신
  → onRoom에서 방 메타 hostClientId가 내가 아니면 게스트로 강등.
- **로비 채팅 페이지 스크롤** (`f8e1531`): scrollIntoView가 페이지 전체를 끌어당김 → 컨테이너 내부만.

### 정리

- **임시 전송 계층 테스트 페이지(/net-test) 삭제** (`189cadf`): Phase 0 게이트용 임시 도구, 정식
  로비가 대체. 정적 export에 포함되면 공개 URL로 프로덕션 rooms 테이블에 고아 방 행을 만들 수 있어 삭제.

### 미해결(별도 과제)

- **St. Lucia(2인) AI 파탄**: 100/20시드 VP ≈ −19, 파산 15/20. 본 브랜치 이전부터 회귀돼 있음
  (stash 재측정으로 이번 작업과 무관 확인). 언제 회귀했는지 이등분 조사 필요.
- **타인 철도 배달 룰**: 사람 이동 UI가 자기+공용 철도만 배달 허용(룰북은 타인 철도 사용 가능, 수입은
  링크 소유자에게). 온라인에서 게스트가 호스트 철도로 배달 못 하는 형태로 발견. 착수 시 AI 경로 평가
  일관성 + 100시드 재측정 필요.

---

## ~2026-07-03 (이전 주요 버그 수정 요약)

feature/online-multiplayer 이전에 고친 실플레이/룰북 버그들. 결과 규칙은 CLAUDE.md 해당 섹션에
현재 동작으로 반영돼 있고, 여기엔 "무엇이 버그였나"를 남긴다. (AI VP 튜닝·기각 실험은 버그가 아니라
설계 기록이므로 CLAUDE.md + `ai-auction-baseline-100seed.md`에 유지 — 여기 없음.)

- **배달 큐브 주머니 미반환** (2026-07-03): `completeCubeMove`가 이동 후 큐브를 소멸시켜 주머니가
  고갈 → 생산·Berlin 보너스·한국 도시화 보충이 어긋남. `goodsDisplay.bag`으로 반환하도록 수정.
  100시드 영향: Korea +0.7 VP·Germany −0.85(게이트 내), Rust/Western 불변. 테스트 productionAndBagReturn.
- **생산 단계 통째 스킵** (2026-07-03, 독일 실플레이): goodsGrowth 진입 시 currentPlayer가 무조건
  playerOrder[0]이라 생산 선택자가 경매 1등이 아니면 ProductionPanel이 안 떠 모든 맵에서 생산이
  스킵됨. nextPhase에서 사람 생산 선택자를 currentPlayer로 설정.
- **완성 링크 오판 근본 버그** (2026-06-22, 모든 맵): `checkConnectionToCity`가 마을을 가닥(spur)
  없이 닿기만 해도 연결로 오판 → dangling 트랙이 완성으로 잘못 판정. 미도시화 마을은 진입 변에
  townSpur가 있을 때만 연결 인정으로 수정.
- **교차 트랙 통과 배달 실패**: 교차트랙 secondaryEdges를 무시해 완성 링크 오판 → 소유권 제거 →
  공용 철도 이동 차단(배달 실패). checkConnectionToCity/getConnectedNeighbors 수정. 테스트 crossingDelivery.
- **엔진 업그레이드가 라운드1·2 양쪽에서 발동**: playerMoves만 보면 라운드2 전환 시 리셋돼 턴당 2회
  업그레이드됨 → `phaseState.engineUpgradedThisTurn`(턴 단위 플래그)로 2라운드 통틀어 1회 보장.
- **St. Lucia 1턴 도시화 후 건설 불가**: 경로가 마을→도시 방향이면 첫 트랙이 마을 쪽부터 깔려
  validateFirstTrackRule 실패로 skip. 첫 트랙은 source/target 교환해 도시 끝에서부터 건설.
- **Germany 직결 링크 클릭이 도시 헥스에 가로채임**: 직결을 도시 위 레이어 + 투명 히트영역으로.
  테스트 germanyDirectLink.
- **Production 패널이 물품 디스플레이를 가림**: 전체화면 모달 → 우하단 고정 패널로(디스플레이 직접 클릭).
