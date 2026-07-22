// 표준 맵 프로파일 — 도시 안 큐브를 같은 색 도시로 배달하는 일반 맵
// (Tutorial / Rust Belt / Korea 등). 맵 간 얕은 차이(엔진 상한 등)는 생성자 인자로,
// 큰 변형(St. Lucia 등)은 이 클래스를 상속해 메서드를 override 한다.

import { BoardState, GAME_CONSTANTS, GameState, PlayerId } from '@/types/game';
import { DeliveryRoute } from '@/ai/strategy/types';
import { selectStandardRoute, selectStandardTopRoutes } from '@/ai/strategy/selector';
import { MapProfile } from '../MapProfile';
import { MapId } from '../MapId';

export interface StandardMapArgs {
  id: MapId;
  name: string;
  nameKo: string;
  supportedPlayers: number[];
  maxTurns: number;
  /** 인원별 턴 수 (다인원 지원 맵 — 미지정 시 maxTurns 고정) */
  turnsByPlayers?: Record<number, number>;
  createBoardState: () => BoardState;
  /** 맵 규모에 따른 AI 엔진 전략 상한 (미지정 시 룰북 기본) */
  engineMax?: number;
  /** 도시에 자기 색 화물 배치 금지 (튜토리얼 하우스룰) */
  noOwnColorCubes?: boolean;
}

export class StandardMapProfile extends MapProfile {
  readonly id: MapId;
  readonly name: string;
  readonly nameKo: string;
  readonly supportedPlayers: number[];
  readonly maxTurns: number;
  override readonly turnsByPlayers?: Record<number, number>;
  private readonly _createBoardState: () => BoardState;
  private readonly _engineMax?: number;
  private readonly _noOwnColorCubes: boolean;

  constructor(args: StandardMapArgs) {
    super();
    this.id = args.id;
    this.name = args.name;
    this.nameKo = args.nameKo;
    this.supportedPlayers = args.supportedPlayers;
    this.maxTurns = args.maxTurns;
    this.turnsByPlayers = args.turnsByPlayers;
    this._createBoardState = args.createBoardState;
    this._engineMax = args.engineMax;
    this._noOwnColorCubes = args.noOwnColorCubes ?? false;
  }

  createBoardState(): BoardState {
    return this._createBoardState();
  }

  get engineMax(): number {
    return this._engineMax ?? GAME_CONSTANTS.MAX_ENGINE;
  }

  get noOwnColorCubes(): boolean {
    return this._noOwnColorCubes;
  }

  // 표준 경로 선택 (도시 큐브 배달 ΔVP 파이프라인) — selector의 표준 본문에 위임
  selectTargetRoute(state: GameState, playerId: PlayerId): DeliveryRoute | null {
    return selectStandardRoute(state, playerId);
  }

  selectTopRoutes(state: GameState, playerId: PlayerId, count = 5): DeliveryRoute[] {
    return selectStandardTopRoutes(state, playerId, count);
  }
}
