# 이슈 수정 기록 (Issue Log)

버그·이슈 수정 이력을 모아두는 문서. **CLAUDE.md에는 "현재 동작 규칙·함정"만 남기고**,
"어떤 버그를 언제 어떻게 고쳤다"는 이력은 여기에 정리한다 (CLAUDE.md가 changelog가 되지 않도록).

- 최신 항목이 위로 오도록 역순 정리.
- 각 항목: 증상 → 원인 → 수정 → (있으면) 커밋/테스트/측정.

---

## 2026-07-27 — AI A*가 인접 정거장 사이 "0타일 링크" 경로를 계획 (남부 중국 봇 홍콩 배달 0·전 봇 계획 고착)

- **증상(남부 중국 100시드 신규 측정)**: 봇이 8턴 내내 `shenzhen→hongkong`을 목표 경로로
  잡는데 (9,8) 진입 헥스를 한 번도 짓지 않고 홍콩 배달 0.0회/게임. 평균 VP −2.79·파산
  1.74·승자 65%가 player2 고착 — 함정을 피한 좌석만 이기는 구조.
- **원인**: Shenzhen(8,8)과 Hong Kong(8,9)은 **인접 도시**라 사이에 타일을 놓을 헥스가
  없는데, `findOptimalPath`(analyzer A*)가 도시 노드에서 인접 도시로 직행하는 스텝을
  허용해 [SZ→HK] "0타일 경로"를 최적으로 반환. 필요 타일 0 → 지을 게 없음 → 링크는 영원히
  미완성 → 목표 경로가 매 턴 재선정되는 계획 함정. Germany Essen↔Düsseldorf·Korea 수원 등
  인접 정거장 쌍이 있는 모든 맵에 잠재해 있었고(가치가 낮아 미발현), 홍콩(전색 수용·5/6
  성장)이 최고 가치라 전면화됐다.
- **수정**: 두 A*(`findOptimalPath`·`findOptimalPathAvoidingOpponent`) 공통으로 **정거장→
  정거장 직행 스텝 금지**(`canStepStationToStation`) — 이미 **건설된** 도시-도시 직결
  링크(실존 링크)만 예외.
- **측정(100시드)**: 남부 중국 VP −2.79→**+14.26**·파산 1.74→**0.57**·홍콩 배달 0→5.2회/
  게임·승자 분포 10/65/15/10→36/14/25/25. 타 맵 영향은 baseline 문서 2026-07-27 표 참조
  (St.Lucia·튜토리얼은 수치 정확 일치 = 항등).

## 2026-07-26 — 세로로 긴 맵(독일·한국·St.Lucia)의 미니맵 하단 잘림

- **증상(사용자 발견)**: 독일·한국에서 우측 하단 미니맵(MoveCubeOverlay)의 보드 아래쪽이
  잘려서 표시.
- **원인**: 미니맵 컨테이너는 `max-h-[70vh] + overflow-hidden`인데 내부 GameBoard fitOverlay
  svg는 `maxHeight: 74vh`로 **컨테이너보다 크게 허용** + 헤더 바(~33px)도 미계산. 화면상
  세로/가로 비율이 큰 맵(St.Lucia ~1.8 > 독일 ~1.4 ≈ 한국 ~1.4)은 svg 박스가 컨테이너를
  넘어 하단이 클리핑. 비율 ≤0.9인 나머지 맵(Rust Belt·Southern·Western·Moon·몬트리올·
  튜토리얼)은 무증상.
- **수정**: fitOverlay svg `maxHeight: '74vh'` → `'calc(70vh - 44px)'` (컨테이너 70vh −
  헤더 33px − 여유). preserveAspectRatio meet라 세로 긴 맵은 잘리는 대신 좌우 여백을 두고
  전체가 보인다. 양쪽 파일에 커플링 주석 추가.
- **검증**: 맵별 종횡비 계산으로 대상 맵 전수 확인, 사용자 실화면 확인.

## 2026-07-26 — 튜토리얼 신도시 타일 C 배치 거부 (맵 도시 id 충돌) + 도시화 취소 버튼 부재

- **증상(사용자 발견, 실플레이)**: 튜토리얼 맵 내 차례에 마을 W(Wheeling)로 신도시 타일
  C를 배치하려 하자 아무 반응 없음(H·G는 됨). :3999 로그에
  `[placeNewCity] 이미 배치된 신규 도시 타일: C` 반복. 게다가 타일을 고른 상태에선
  취소 버튼도 없어 그대로 갇힘.
- **원인**: ① `placeNewCity`의 중복 배치 방어가 `board.cities.some(c => c.id === 타일id)`로
  **모든 도시**의 id를 비교 — 튜토리얼 **Cleveland의 id가 'C'**라 신도시 타일 C가 영구
  오탐 거부(React 중복 key 프리즈 방어 자체는 정당, 판별 범위가 문제). 단일 문자 도시 id를
  쓰는 맵은 튜토리얼뿐이라 다른 맵은 무영향. ② PhasePanel의 "선택 취소" 버튼 조건
  `hasActiveSelection`이 buildMode·selectedCube 등만 보고 **urbanizationMode /
  selectedNewCityTile을 누락** — `cancelSelection`은 이미 도시화 상태를 정리하는데 버튼만
  안 떴다.
- **수정**: ① `City.isUrbanizedNewCity`(optional) 추가 — placeNewCity가 만든 신도시에만
  세팅하고 중복 검사는 이 플래그가 있는 도시만 비교(구버전 저장본 신도시엔 없어도
  `NewCityTile.used`가 중복을 막음). ② `hasActiveSelection`에 도시화 두 상태 추가.
- **후속(같은 날, 사용자 지적 "모든 도시 id와 충돌 아닌가?")**: ①만으로는 배치 후
  **Cleveland('C')와 신도시 C('C')가 공존** — `cities.find(c => c.id === ...)` 첫 매치가
  Cleveland를 잡아 큐브 선택/이동 혼선 + React `key={city-<id>}` 중복 위험이 남는다.
  전 맵 id 전수 조사 결과 단일 문자 A~H 충돌은 튜토리얼 'C' 하나뿐(타 맵은 2~3글자 약어)
  → **Cleveland id 'C' → 'CLE' 개명**으로 원천 제거(columnMapping·fullGameSimulation 동기
  수정. 구버전 튜토리얼 저장본은 열2 성장 매칭만 어긋남 — 새 게임으로 해소).
  재발 방지: `src/utils/__tests__/mapCityIdCollision.test.ts` — 전 맵 도시·마을 id가
  신도시 타일 id(A~H)와 겹치면 실패하는 무결성 가드(새 맵 추가 시 자동 검사).
- **검증**: 회귀 테스트 `src/store/__tests__/newCityTileIdCollision.test.ts` 3종
  (C 배치 성공·used 중복 거부 유지·실전 로그 재현 H→undo→G→undo→C) + 무결성 가드
  + 튜토리얼 기반 AI 시뮬/store/utils 335개 통과.

## 2026-07-26 — 온라인 F5 재접속 때 셋업 화면이 먼저 떴다가 보드로 전환 (부팅 게이트 부재)

- **증상(사용자 반복 보고)**: 온라인 게임 중 F5하면 방 셋업 화면이 1~3초 보였다가 게임
  보드로 전환. 그간의 F5 수정(2026-07-24/25 예전 게임 강제 복원·이어하기 배너·종료 게임
  배너)은 전부 **오프라인 복원 쪽**이라 이 구간은 계속 노출돼 있었다.
- **원인**: `showSetup` 초기값이 무조건 true + 온라인 복원(`autoRejoin` → 연결·채널 구독·
  스냅샷 적용)이 비동기 1~3초인데 "재접속 중" 중간 상태가 없음. `netRoom.status === 'playing'`
  동기화 후에야 이펙트가 보드로 전환.
- **수정**(GamePageClient): `booting` 상태 추가 — 복원 판정 전엔 셋업 대신 "게임 복원 중…"
  로딩. 해제 지점 ① 온라인 복원 성공 = status 이펙트에서 화면 전환과 **동시**(먼저 풀면 한
  프레임 셋업이 비침) ② 오프라인·복원 없음 = autoRejoin 이펙트 `finally`. 오프라인 F5·첫
  방문은 판정이 즉시라 체감 무변화.
- **리뷰 발견(스텝1)**: `RoomStatus`의 **finished**를 status 이펙트가 안 다뤄 — 호스트가
  닫은 방(DB 삭제 실패 시 finished 잔존)에 재입장하면 booting이 안 풀려 **로딩 교착**.
  else 분기(셋업 폴백) 추가. 트레이드오프: 방 소실·연결 불가 최악 케이스는 채널 15초
  타임아웃만큼 로딩 후 셋업 폴백(이전엔 셋업이 계속 보였음).
- **검증**: 사용자 실검증(온라인 F5 → 깜빡임 없이 보드) + tsc/lint 0 + net/store 181 통과.
  PR #49.

## 2026-07-26 — 온라인 관전(상대 차례) 중 줌/신도시 버튼·물품 디스플레이 스크롤 먹통

- **증상(사용자 발견)**: 온라인에서 다른 사람 차례일 때 보드 위 +/− 줌·신도시 버튼이
  안 눌리고, 하단 물품 디스플레이 가로 스크롤도 안 됨.
- **원인**: 상대 차례 클릭 차단 오버레이(`GamePageClient`, `absolute inset-0 z-20`)가
  보드+디스플레이 컬럼 전체를 덮는데, ① 줌/신도시 버튼은 GameBoard `motion.div` 안에
  있어 **transform/contain이 만드는 스태킹 컨텍스트에 갇혀** 내부 z-index를 아무리 올려도
  오버레이를 못 이김(z-30 1차 시도 실패 원인). ② 디스플레이의 overflow-x 스크롤 컨테이너도
  오버레이 아래라 휠/드래그가 먹힘. 채팅 버튼만 살았던 건 motion.div 밖 형제 레이어(z-30)라서.
- **수정**: ① HUD(줌/신도시/차례 배지)를 **GameChat과 동일 패턴** — motion.div 밖 형제
  `absolute inset-0 z-30 pointer-events-none` 레이어로 이동(코드 그대로 이동, 헤더 높이
  46px 스페이서로 초기 위치 유지). 로컬 UI(게임 상태 무변경)만 오버레이 위로. ② 오버레이를
  컬럼 전체 → **보드 래퍼 안으로 축소** — 디스플레이 스크롤 개방(슬롯 클릭은 생산 보유자
  로컬 `ui.productionMode` 전용이라 관전자 무해). ③ `boardDisplayScale` 맵(St. Lucia)은
  HUD 레이어에 같은 maxWidth·중앙 정렬 미러링(transform 정렬은 sticky가 깨져 금지).
- **안전성(코드리뷰)**: 이동 구간 기계 비교 IDENTICAL, 신도시 모달은 view 모드(onSelect
  미전달) no-op, 보드 클릭은 오버레이+`boardInteractionBlocked` 이중 가드+호스트
  `applyGameIntent` 최종 방어 유지. tsc 0·net/store 181 테스트 통과. 알려진 경미 한계:
  좁은 화면에서 보드 헤더가 2줄로 접히면 버튼이 헤더 하단과 몇 px 겹칠 수 있음.
- **커밋**: d0a97e2

## 2026-07-26 — 교차/공존 헥스 2회 통과 경로 누락 + 합법 목적지/경로 숨김 (경로 탐색·게이트)

- **증상(사용자 발견, 온라인 한국 4인)**: 화물이 3링크로 이동할 수 있는데 2링크 가이드만
  표시. "공존 선로 때문 아니냐"는 사용자 가설이 정확했다.
- **원인 3겹**:
  1. `findAllPaths`/`findReachableDestinations`의 DFS visited가 **헥스 좌표 단위** —
     교차/공존 타일의 독립된 두 트랙(기본/보조)을 한 경로가 각각 한 번씩 지나는 합법
     경로(실전: D→타이존→신도시→전주 3링크가 (9,5) 공존 헥스를 남의 보조·내 기본
     트랙으로 두 번 통과)가 통째로 차단.
  2. `findRouteOptions` 2ⓐ 게이트가 내 수입 **동률**인 타인 경유를 숨김 — 합법 경로가
     선택지에서 사라짐.
  3. `gateMixedByCubeBest`(사람 큐브 단위 게이트)가 **본인 철도로 도달 불가한 목적지**의
     유일한 길(타인 경유)까지 숨겨 목적지 자체가 실종 (춘천·인천).
- **수정**: ① `pathVisitKey` — 정거장은 헥스 단위(룰: 도시/마을 경로당 1회), 트랙 헥스는
  (헥스+진입 트랙 P/S) 단위. ② 2ⓐ를 "이상이면 노출"로 완화(디폴트는 본인 철도 유지,
  동률 대안은 경로 선택 모드에서만). ③ 본인 철도 단독 경로가 없는 목적지는 게이트에서
  제외(유일한 길 보존). — 원칙: **합법 목적지/경로는 숨기지 않는다. 숨김은 "본인
  철도로도 갈 수 있는 목적지의, 내 수입이 최선 미만인 타인 경유"만.**
- **버그 아니었던 것(같은 세션 확인)**: 빨강 큐브가 있는 청주를 빨강 화물이 통과 못 하는
  것(한국 동적 수요색 + "자기 색 도시 도착 시 이동 종료" 룰)과 공존 헥스의 기본/보조
  트랙별 수입 귀속(`trackOwnerForEntry`)은 정상.
- **측정**: 100시드 8종 — Korea 43.16→44.37(+1.21·파산 0.19→0.17), 7개 맵 개선/동등,
  파산 전 맵 유지/개선. 회귀 테스트: `routeOptions.test.ts` 공존 2회 통과 2종 +
  `routeChoice.test.ts` 목적지 보존 갱신.
- **남은 한계(후속)**: St.Lucia 트랙 큐브 워커(`findTrackCubeDeliveries`)는 여전히 헥스
  단위 visited — 같은 한계가 이론상 존재하나 2인 소형 맵이라 빈도 낮음.

## 2026-07-25 — 경매 Turn Order 패스가 포기로 취급돼 경매가 강제 종료 (룰북 정합 재작성)

- **증상(사용자 발견, 온라인 4인)**: 최고입찰자($1)와 나만 남은 상태에서 Turn Order
  패스(skipBid)를 쓰자 경매가 즉시 종료되고 내가 자동으로 2등(마지막 포기자)이 됐다.
  더 입찰할 기회 자체가 사라짐.
- **원인**: 패스와 포기가 한 상태(`auction.passedPlayers`)로 뒤섞여 있었다. `skipBid`에
  "최고입찰자 외 더 부를 사람이 없으면 나를 포기자로 넣고 경매 종료"라는 휴리스틱 분기가
  있었고(과거 '패스했는데 계속 내 차례' 불만의 잘못된 해법), `passBid`에는 "최고입찰자
  건너뛰기" 로직(룰에 없음)까지 얹혀 있었다. 룰북: 패스는 "stay in the bidding"이고 종료는
  "until all but one player has **dropped out**" — 패스한 플레이어가 남아 있으면 경매는
  계속돼야 한다.
- **수정** (auctionSlice 재작성):
  - **상태 분리**: `AuctionState.passedPlayers` → `droppedOutPlayers`(포기 전용). 패스
    사용 여부는 기존 `PlayerState.turnOrderPassUsed`가 유일한 관리처. skipBid는 이 플래그만
    세우고 입찰액·순위·포기 목록을 건드리지 않는다 + 권한 가드(available && !used) 추가.
  - **종료 판정·차례 진행 단일화**: `advanceAuctionTurn`(auctionSlice 모듈 함수) 한 곳에서만
    수행 — 미포기·미파산 1명 남으면 종료, 아니면 플레이어 순서대로 다음 미포기 플레이어에게.
    액션별 종료 휴리스틱 전부 제거.
  - **최고입찰자 건너뛰기 제거**: 최고입찰자도 자기 차례에 입찰(자기 최고가 위로) 또는 포기를
    직접 선택한다(자동 통과 없음). 차례가 이전 행동자에게 되돌아오는 것은 정상.
  - **승자 = 미포기 유일 잔존자**: 최고입찰자가 포기할 수 있으므로 resolveAuction·AuctionPanel·
    TurnTrack 모두 highestBidder로 단정하지 않는다. 승자는 자기 입찰액(없으면 $0) 전액 지불.
- **테스트**: `src/store/__tests__/auctionTurnOrderPass.test.ts` 전면 재작성(9개) —
  (A) 패스 후 경매 계속+선택권 회복 (B) 무입찰 패스 후 최소입찰 $1 (B-2) $0 입찰 거부
  (C) 패스자 단독 생존 → $0으로 1등 (D) 왕복 입찰·역전·교착 없는 종료 (D-2) 최고입찰자
  포기 시 패스자 승리 (E) 롤오버 플래그 리셋 (E-2) 무권한 skipBid 무시 (F) 지불 규칙
  (첫 포기 $0/마지막 2인 전액/중간 절반 올림/무입찰 $0).

## 2026-07-21 — 미완성 트랙 소유권 규칙이 룰북과 정반대 (연장 인수 미구현 + 방향 전환 소유권 오부여)

- **증상(사용자 발견)**: "다른 사람이 건설하다 만 철도를 가져가고 싶은데" ① 방향 전환 패널에
  도시 방향이 아예 안 나오고 ② 미소유 트랙에 이어 짓는 것(연장)도 불가능. 정상적인 "미소유
  미완성 구간을 도시에 연결해 완성하며 인수"라는 플레이가 완전히 막혀 있었다.
- **원인**: 룰북 IV가 정한 두 가지가 구현에서 서로 뒤바뀌어 있었다.
  - 룰: "다른 플레이어가 **미소유 미완성 구간을 연장하면 소유권 주장 가능**.
    **방향 전환만으로는 연장으로 인정되지 않는다**."
  - 구현: 연장 경로는 없음(`validateTrackConnection`/`isValidConnectionPoint`가 연결점으로
    "내 소유 트랙"만 인정 → 미소유 트랙에 이어 짓기 불가), 대신 방향 전환이 소유권을
    넘겨줌(`redirectTrack`·`buildTrack` 기존 타일 경로 둘 다 `owner: currentPlayer`).
    거기에 `getRedirectableEdges`가 룰에 없는 "도시 방향 금지"(`isCity continue`)까지 얹어
    도시로 트는 것도 차단. `buildTrack` 경유 방향 전환은 `builtTurn`까지 갱신해
    `releaseUnextendedTrack`이 방향 전환을 연장으로 오인하는 문제도 겹침.
- **수정** (룰북 정합, fix/track-claim-rulebook):
  - **연장 인수 구현**: `validateTrackConnection`/`isValidConnectionPoint`가 미소유 미완성
    트랙(정부 트랙·완성 링크 소속 제외)을 연결점으로 인정. `buildTrack`이 새 타일을 미소유
    구간에 이어 지으면 `findClaimableSectionKeys`(boardRules, BFS)로 그 구간 전체의 소유권을
    건설자에게 이전. Western US 연속성(requireNetwork) 중엔 분리 구간 인수가 연속성 규칙을
    깨므로 기존 동작 유지(불인정).
  - **방향 전환 소유권 제거**: `redirectTrack`·`buildTrack` 기존 타일 경로 모두 owner/builtTurn
    유지(내 것은 내 것, 미소유는 미소유). RedirectTrackPanel에 안내 문구 추가.
  - **도시 방향 허용**: `getRedirectableEdges`의 `isCity continue` 제거(자기 미완성 구간을
    도시로 틀어 완성하는 정상 플레이 허용). 함께 정리: 이웃 판정을 "타 플레이어·정부 트랙 직접
    연결 금지 / 내·미소유 트랙 허용"으로 교정(기존엔 내 트랙 방향도 차단), 맵 밖 방향
    차단(기존엔 허용 — 도시/마을 헥스는 hexTiles 항목이 없는 맵이 있어 예외 처리), 시그니처에
    currentPlayer 추가.
- **후속(같은 날, 실플레이로 발견된 UI 구멍 3건)**: store 검증만 열고 사람 UI 경로가 막혀 있었다.
  ① `getBuildableNeighbors`(hexGrid)가 미소유 소스에 빈 배열 반환 → 소스는 클릭돼도 연장 타깃
  0개. ② `BoardTracks` 클릭 라우팅이 미소유 트랙 = 무조건 방향 전환(연장 인수가 없던 시절의
  잔재) → 내 트랙과 동일하게 통일(일반 클릭 = 연장 소스, Shift+클릭 = 방향 전환 패널).
  ③ `isValidBuildTargetWithReplace`(hexGrid)가 "내 소유"만 교체 타깃으로 인정 → 미소유도 인정.
  결과: **미완성 트랙 UX가 소유 여부와 무관하게 단일 패턴** — 트랙 직접 클릭 = 연장(미소유는
  인수), 인접 연결점에서 트랙을 타깃으로 클릭 = 방향 전환(내 트랙이 원래 쓰던 일반 플로우,
  터치 호환), Shift+클릭 = 방향 전환 패널 바로가기.
- **후속 2 (2026-07-22, "노란 칸 통합" UX + 브라우저 실플레이 검증으로 버그 2건 추가 수정)**:
  사용자 피드백 "미완성 철도를 클릭하면 갈 수 있는 방향을 전부 노랗게" — 버튼/패널/Shift 없이
  기존 건설 하이라이트 문법 하나로 통일. `getRedirectTargetHexes`(trackValidation) 헬퍼를
  하이라이트(uiSlice.selectSourceHex)와 클릭 판정(GameBoard)이 공유 — 미완성 트랙 클릭 시
  연장 타깃 + 방향 전환 방향이 함께 노랗게 표시되고, 방향 전환 칸 클릭 한 번에 즉시 커밋($2).
  연장 후보와 서로소(트랙 현재 변 제외)라 클릭 판정이 겹치지 않는다. Chrome 실플레이(T1~T3
  전체 사이클: 건설→방치→미소유화→인수/방향 전환)로 검증하며 버그 2건 발견·수정:
  ① **첫 트랙 규칙이 인수 연장을 차단** — 내 트랙이 전부 미소유로 풀려 0개가 되면
  `canBuildTrack`이 "첫 트랙 = 도시 인접" 분기로 들어가 미소유 연결 분기에 도달 못 함.
  `touchesClaimableUnownedTrack` 헬퍼로 첫 트랙 분기에 인수 연장 예외 추가(getBuildBlockReason
  미러 동기화, Western US 연속성 중엔 기존대로 불허).
  ② **방향 전환 후 하이라이트 잔존** — `redirectTrack`이 buildMode만 idle로 되돌리고
  highlightedHexes/sourceHex 등을 남김(예전엔 idle 패널에서만 커밋돼 무해했던 잔재).
  resetBuildMode와 동일한 전체 필드 초기화로 교체.
- **테스트**: `trackBuilding.test.ts` "룰북 소유권" 9개 추가(연장 인수 / 방향 전환 무소유 /
  도시 방향 선택지 + 완성 / 정부 트랙 인수 불가 / 미소유 소스 하이라이트 / 일반 플로우 방향
  전환 무소유 / 노란 칸 하이라이트·서로소·클릭 전환 / 트랙 0개 인수 연장 / 방향 전환 후 UI
  초기화). 단위 242개 통과.
- **주의(검증 대기)**: AI는 이 메커니즘을 계획에 쓰지 않지만 store 검증이 느슨해져(미소유 인접
  건설 시 우발적 인수) 시뮬 수치가 변할 수 있음 — **전 맵 100시드 게이트 재측정 필요**.

## 2026-07-09 — 독일 Engineer 절반 할인이 룰북과 다름 (PR #35)

- **증상**: 독일에서 Engineer를 골라도 평지($2)만 짓는 턴은 할인이 전혀 없었고, $2 타일을 $1로
  짓는 선택지도 없었다. 화면 안내는 "트랙 1개를 절반 비용으로"라 실제 청구와 어긋났다.
- **원인**: `buildSlice`의 할인 조건에 `cost > PLAIN_TRACK_COST`가 붙어 평지를 제외했다. 룰북
  Germany는 "**트랙 1개를 절반 비용(올림)으로 배치**"일 뿐 지형/비용 하한 조건이 없다. 또 타일을
  하나씩 커밋하는 구조라 조건을 만족하는 **첫 타일**에 할인을 써버렸고(뒤에 더 비싼 헥스가 와도
  못 씀), `PLAIN_TRACK_COST` 조건은 그 greedy가 $2에 낭비하는 최악을 막던 완충재였다.
- **수정**: 할인 대상을 "이번 빌더 턴 **최고가 타일 1개**"로 바꾸고, 매 건설마다 차액을 정산해
  항상 그 상태가 성립하도록 했다 (`helpers/engineerDiscount.ts` 순수 함수).
  - `charge = 정가 − (floor(max/2) − 이미_깎아준_액)`. 건설 순서와 무관하게 총액이
    `정가합 − floor(최고가/2)`로 수렴 = 플레이어가 최적으로 골랐을 때와 동일.
  - 중간 시점 누적 지불도 그 시점까지의 최적이라 **현금 부족 오탐이 없다** (예: $10 보유,
    2+4+8 → $1+$3+$6 = $10 딱 맞음). 청구액은 항상 `ceil(정가/2)` 이상이라 음수 불가.
  - `PhaseState.engineerHalfUsed`(boolean) → `engineerMaxTileCost`/`engineerDiscountGiven`.
    둘 다 optional이라 배포 전 저장본 rehydrate에 안전(`?? 0`).
  - 계산이 `buildSlice`(청구)와 `buildReason`(토스트 추정) 두 곳에 필요해 순수 함수로 공유
    — 미러 로직 금지.
- **안내문**: 룰북 기준으로 "가장 비싼 1개가 절반, 더 비싼 타일을 나중에 지으면 할인이 옮겨감".
  ⚠️ 이 PR 초반 두 커밋(a8a7e76, 42abe3d)은 **구현이 옳다는 틀린 전제**로 문구를 구현에 맞췄다
  (평지 제외를 명시). 룰북 재확인 후 뒤집었다 — 안내문을 고치기 전에 룰북을 먼저 볼 것.
- **테스트**: `store/helpers/__tests__/engineerDiscount.test.ts` 8개 (순서 순열 총액 불변,
  중간 누적 최적, 평지 할인, 청구액 하한, 정가 복귀). 전체 회귀 0.
- **알려진 무관 실패**: `buildLimitByLog.test.ts`의 St. Lucia 케이스(`currentTurn >= 3`)는 이 변경
  **전에도** 동일하게 실패(`git stash` 재측정 확인)하고, 단독 실행 시엔 통과한다 — 전체 스위트와
  함께 돌릴 때 100초 예산 안에 3턴을 못 채우는 **부하 의존 flaky**. 별도 이슈.

## 2026-07-05 — 생산(Production)을 주사위 전에 강제 (PR #27)

- **증상**: 온라인에서 게스트가 생산 액션을 하지 못하고 넘어감(방장이 생산 배치 전에 주사위를 굴려
  스킵). 오프라인도 순서 미강제. 모든 맵 공통(사용자 확인: 독일/온라인).
- **원인**: 룰북 IX 순서는 **생산(주머니 큐브를 디스플레이 빈 칸에 배치) → 주사위(디스플레이→도시)**.
  그런데 `growGoods`가 `productionUsed=true`를 세우고, 온라인 주사위 조작자인 **방장**이 생산 홀더
  (게스트) 배치 전에 굴려 생산이 통째로 스킵됐다. 이전 수정(goodsGrowth 진입 시 사람 홀더를
  currentPlayer로)은 ProductionPanel을 띄우기만 했을 뿐 주사위를 막지 않았다.
- **수정** (생산 건너뛰기 버튼 없이):
  - `nextPhase` goodsGrowth 진입: 사람 홀더가 **배치 가능**(빈 칸+주머니 큐브)하면 `currentPlayer`로,
    **배치 불가**(만석/빈 주머니)면 `productionUsed` **자동 완료**(스킵 아님 — 배치할 게 없음, 주사위 잠금
    교착 방지). 첫 턴 만석·western-us 빈 주머니가 이 경우.
  - `GoodsGrowthPanel`: 사람 홀더 미완료면 주사위·건너뛰기 **잠금** + "생산 배치 대기" 안내.
  - `ProductionPanel`: **홀더 본인 좌석에만** 렌더(방장이 게스트 생산 대신 조작 방지).
  - `growGoods`: 사람 홀더 미완료면 **no-op**(방어 — UI 우회 차단).
  - `startProduction`: `min(2, 빈칸, 주머니)` 뽑기(빈 칸 1개인데 2개 뽑아 확정 불가하던 스턱 수정).
- **테스트/측정**: `productionAndBagReturn.test.ts` 갱신 — 빈칸 유무별 진입 currentPlayer/자동완료,
  growGoods 차단/진행(12개). fullGameSimulation 16개 + germany 100시드 + net 등 회귀 0.
  ⚠️ 이 수정으로 기존 회귀 테스트의 "만석에서도 홀더가 currentPlayer" 기대가 "빈 칸 있을 때만"으로 바뀜
  (만석은 자동 완료가 정답 — 룰북 "첫 턴엔 빈 칸 없어 무의미").

## 2026-07-05 — 라이브 세션 UX 버그 묶음 (PR #23) + 배포 핫픽스 (PR #24)

두 브라우저 온라인 세션에서 발견된 UX/버그들을 관심사별 커밋으로 수정. 동작 규칙은 CLAUDE.md
("게스트 취소는 호스트 왕복 + 팬텀 방지", "정산 단계 HUD 억제", "물품성장 결과 게스트 동기화",
"독일 미완성 링크 금지 UI 가드") 참조.

### 게스트 취소(undo) 팬텀 — 눌러도 안 되돌아감

- **증상**: 온라인 게스트가 건설 후 '취소'를 눌러도 되돌아가지 않음(버튼은 보이는데 무반응).
- **원인**: `undoCount`는 persist/스냅샷으로 동기화되는 **상태**지만 실제 취소 스택 `undoSnapshots`는
  호스트 메모리 모듈 싱글턴. 전체 재로드(F5·모바일 탭 복원 등)나 호스트 승계 시 스택은 비는데
  `undoCount`는 복원돼, 호스트 `undoLastAction`이 `pop()→undefined`로 count만 0으로 만들고 안 되돌린다.
  (store/net의 undo 경로 자체는 정상 — 진단 테스트로 확인.)
- **수정**: persist `merge`·`promoteToHost`에 `undoCount:0` 리셋(reconnect-as-host는 이미 리셋 중).
  게스트 취소 대기 피드백(`PhasePanel`: '취소 중…' → 스냅샷 반영 시 해제, 3.5초 미반영 시 '다시 취소').
  진단 로그(게스트 전송 / 호스트 실행·팬텀 감지). 회귀 테스트 `net/__tests__/guestUndo.test.ts`.

### 물품 성장 완료 문구가 큐브 개수를 적게 표시

- **증상**: 한 열에서 여러 개 성장해도 완료 문구('물품 성장 완료!')에 1개만 표시(색상도 어긋남).
- **원인**: 완료 문구가 `calculateGrowthResults()`를 매 렌더 실시간 계산 → 적용(`growGoods`)이 성장
  큐브를 디스플레이 슬롯에서 빼므로 재계산 시 남은 큐브만 잡혀 개수가 줄었다.
- **수정**: 적용 직전 결과를 `appliedResults` 스냅샷으로 잡아 완료 문구에 사용(미리보기와 동일).

### 정산 단계에 방장 보드가 게스트 "플레이 중" 착시

- **증상**: 수입 등 정산 단계인데 방장 보드에 "○○(게스트) 플레이 중" HUD가 계속 떠 서로 대기.
- **원인**: 정산 단계는 방장이 '진행'으로 넘기게 바꿨는데(PR #22), 보드 HUD는 여전히
  `currentPlayer`(=playerOrder[0], 게스트일 수 있음)를 "플레이 중"으로 표시해 방장이 오해.
- **수정**: `GameBoard`가 사람 currentPlayer인 정산 단계(`HUD_SUPPRESSED_PHASES`)에선 HUD를 숨김
  (봇이면 자동 진행 표시로 유지). 하드 교착은 아니었음 — 방장이 '진행' 누르면 진행.

### 독일 미완성 철도가 물품이동 단계로 넘어가며 사라짐

- **증상**: 독일에서 미완성 철도를 만든 뒤 다음 단계로 넘기니 미완성 철도가 삭제됨(나쁜 UX).
- **원인(설계상 동작)**: 독일(`requireCompleteLinks`)은 완성 링크만 허용 — 단계 전환 시
  `removeIncompleteNewTracks`가 이번 턴 미완성 신설 트랙을 삭제·환불한다. 사용자가 이를 모르고 넘어감.
- **수정**: `boardRules`에 `hasIncompleteNewTracks` 헬퍼(제거 로직과 조건 공유). `PhasePanel`이 사람 차례
  buildTrack에서 미완성 트랙이 있으면 '다음 단계로'를 비활성 + "완성하거나 취소" 경고. 이번 턴 트랙만
  대상이라 undo로 해소 가능(교착 없음).

### Berlin이 다른 검은 도시와 다르게 회색으로 렌더

- **증상**: 독일 Berlin이 데이터상 `color:'black'`인데 회색으로 보임.
- **원인**: `grayRenderCityId`(회색렌더 전용 config, bonusCityCubeId와 분리 — Atlanta 회색화 방지용)가
  Berlin을 회색으로 렌더. `BoardCities`가 그 도시를 `DYNAMIC_CITY_GRAY`로 채우고 이름 띠도 회색.
- **수정**: `BoardCities`의 회색 특수 처리를 제거해 Berlin도 `goodsColor`(검정)로 렌더 + 검은 도시 기본 띠.
  Atlanta는 `grayRenderCityId`가 별개라 원래 안전(영향 없음). 보너스 큐브(`bonusCityCubeId`) 로직은 무변경
  — Berlin 매 턴, Atlanta 1~4턴 큐브 추가 그대로.

### 물품 성장 결과 게스트 표시 (기능 추가)

- 방장이 굴린 주사위와 도시별 추가 큐브를 `GameState.goodsGrowthEvent`로 스냅샷 동기화 → 게스트도
  `GoodsGrowthPanel`에서 동일하게 봄. `goodsGrowth` 진입 시 null 리셋.

### 룰북 문서 통합 (문서)

- `docs/game-rules.md`(룰북 전문)를 CLAUDE.md로 인라인, 원본 삭제(참조 정리). 헥스 기하는 분리 유지.

### 배포 실패 핫픽스 (PR #24)

- **증상**: PR #23 머지 후 GitHub Pages 배포가 `'bonusCityId' is defined but never used`
  (@typescript-eslint/no-unused-vars, BoardCities)로 실패. `tsc`는 통과하지만 Next 빌드 ESLint가 막음.
- **수정**: Berlin 렌더 수정으로 안 쓰이게 된 `bonusCityId` prop 제거(BoardCities 선언·구조분해 +
  GameBoard useMemo·전달). 재배포 성공. (교훈: 미사용 변수는 tsc 통과해도 Next 빌드 ESLint에서 막힘.)

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
