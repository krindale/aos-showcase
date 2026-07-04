# 헥스 그리드 기하 레퍼런스

헥스 좌표계·엣지 번호·odd-r 이웃 계산 공식. `src/utils/hexGrid.ts` 구현의 근거 문서.

## 포인티탑 헥스 가장자리 번호 (getEdgeMidpoint 코드 기준)

⚠️ **중요**: SVG 좌표계에서 y+는 아래 방향입니다!

```
        Edge 5    Edge 4
    (UPPER-RIGHT) (UPPER-LEFT)
           \      /
            \    /
    Edge 0 ──────── Edge 3
    (RIGHT)         (LEFT)
            /    \
           /      \
        Edge 1    Edge 2
    (LOWER-RIGHT) (LOWER-LEFT)
```

- Edge 0: 오른쪽 (RIGHT / E)
- Edge 1: 오른쪽 아래 (LOWER-RIGHT / SE) ← 이전 문서 틀림!
- Edge 2: 왼쪽 아래 (LOWER-LEFT / SW) ← 이전 문서 틀림!
- Edge 3: 왼쪽 (LEFT / W)
- Edge 4: 왼쪽 위 (UPPER-LEFT / NW) ← 이전 문서 틀림!
- Edge 5: 오른쪽 위 (UPPER-RIGHT / NE) ← 이전 문서 틀림!

**직선 트랙 (반대편 엣지):**
- [3, 0]: 좌↔우 (수평)
- [4, 1]: 좌상↔우하 (NW↔SE)
- [5, 2]: 우상↔좌하 (NE↔SW)

## 좌표 0-base (2026-06, feature/st-lucia-ai-income)

맵 데이터 좌표를 0-base로 통일했다 — 맵 데이터(stLucia/tutorial)의 col을 −1 이동,
`DEFAULT_START_COL = 0`. **게임 로직은 불변** (odd-r 인접은 row의 홀짝만 사용하므로 col 평행이동에
무영향). 화면/로그 좌표가 (0,0)부터 표시된다. 프리셋 트랙 좌표를 쓰는 테스트는 col −1 재정렬 필요.

## Odd-r Offset 이웃 계산 공식

```
Even row (row % 2 == 0):
  Edge 0 (E/RIGHT):       (col+1, row)
  Edge 1 (SE/LOWER-RIGHT): (col,   row+1)  ← 주의: (col+1, row+1) 아님!
  Edge 2 (SW/LOWER-LEFT):  (col-1, row+1)
  Edge 3 (W/LEFT):        (col-1, row)
  Edge 4 (NW/UPPER-LEFT):  (col-1, row-1)
  Edge 5 (NE/UPPER-RIGHT): (col,   row-1)

Odd row (row % 2 == 1):
  Edge 0 (E/RIGHT):       (col+1, row)
  Edge 1 (SE/LOWER-RIGHT): (col+1, row+1)
  Edge 2 (SW/LOWER-LEFT):  (col,   row+1)
  Edge 3 (W/LEFT):        (col-1, row)
  Edge 4 (NW/UPPER-LEFT):  (col,   row-1)
  Edge 5 (NE/UPPER-RIGHT): (col+1, row-1)
```

**연결 규칙**: A 헥스의 edge X와 B 헥스의 edge (X+3)%6이 양쪽 모두 있어야 연결됨
