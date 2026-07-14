// 맵 식별자 enum
// "tutorial" 같은 문자열 분기를 코드 전반에 흩뿌리는 대신, 맵을 이 enum으로 구분하고
// 맵별 동작은 MapProfile 서브클래스(상속 override)로 표현한다.
// enum 값은 기존 mapId 문자열과 동일 — 라우트/저장/레지스트리 호환.

export enum MapId {
  Tutorial = 'tutorial',
  RustBelt = 'rust-belt',
  Korea = 'korea',
  WesternUS = 'western-us',
  SouthernUS = 'southern-us',
  Germany = 'germany',
  Barbados = 'barbados',
  StLucia = 'st-lucia',
  Montreal = 'montreal',
  Moon = 'moon',
}
