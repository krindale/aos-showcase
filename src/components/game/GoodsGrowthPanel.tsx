'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useNetStore } from '@/net/netStore';
import { CUBE_COLORS, CubeColor } from '@/types/game';
import { getMapData } from '@/utils/mapRegistry';
import { getMapProfile } from '@/maps/getMapProfile';
import { citiesConnectedToSeed, isNightCity } from '@/utils/hexGrid';
import DiceRoller from './DiceRoller';
import { Sparkles, Package, Check, ArrowRight } from 'lucide-react';

export default function GoodsGrowthPanel() {
  const {
    mapId,
    players,
    currentPlayer,
    goodsDisplay,
    board,
    phaseState,
    growGoods,
    nextPhase,
    goodsGrowthEvent,
  } = useGameStore();

  const columns = getMapData(mapId).columnMapping;

  // 물품 성장 주사위/진행은 방장(또는 오프라인)만 조작 — 게스트는 스냅샷으로 결과만 본다.
  // (아무나 주사위를 굴러 호스트가 거부·되돌리던 혼란 방지)
  const netMode = useNetStore((s) => s.mode);
  const amIHost = netMode === 'offline' || netMode === 'host';
  // 봇이 순서 1등이면 봇이 주사위를 자동으로 굴린다. 이때 사람용 주사위 UI 대신 결과 뷰를
  // 보여줘야 성장 결과(주사위/도시별 추가 큐브)를 잠시 확인할 수 있다("그냥 넘어감" 방지).
  const currentIsBot = players[currentPlayer]?.isAI ?? false;
  const showSpectatorView = !amIHost || currentIsBot;

  const [diceResults, setDiceResults] = useState<number[]>([]);
  const [growthApplied, setGrowthApplied] = useState(false);
  // 적용(growGoods)은 성장한 큐브를 디스플레이에서 빼므로, 완료 문구를 실시간 재계산하면
  // 개수가 줄어든다(예: 2개 성장인데 1개만 표시). 적용 직전 결과를 스냅샷으로 잡아 완료 표시에 쓴다.
  const [appliedResults, setAppliedResults] = useState<
    { columnId: string; cityName: string; count: number; cubes: CubeColor[] }[]
  >([]);

  // Production 행동을 선택한 플레이어
  const productionPlayer = Object.values(players).find(
    (p) => p.selectedAction === 'production'
  );
  // 사람 생산 홀더가 아직 배치를 안 했으면 주사위/진행을 잠근다 (룰북: 생산 → 주사위).
  // 배치 불가(빈칸/주머니 없음) 홀더는 goodsGrowth 진입 시 productionUsed 자동 완료라 여기 안 걸림.
  const productionPending =
    !!productionPlayer && !productionPlayer.isAI && !phaseState.productionUsed;

  // 주사위 수 = 탈락하지 않은 활성 플레이어 수 × 맵별 배수 (표준 1, 달 2)
  const activePlayers = Object.values(players).filter(p => !p.eliminated);
  const diceCount = activePlayers.length * getMapProfile(mapId).growthDicePerPlayer;

  // 열의 시작 인덱스 (앞 열들의 rowCount 누적)
  const startIndexOf = (columnIndex: number): number =>
    columns.slice(0, columnIndex).reduce((sum, m) => sum + m.rowCount, 0);

  // 주사위 결과에 따른 이동할 큐브 계산 (한 주사위 번호를 여러 도시 열이 공유 가능)
  const calculateGrowthResults = () => {
    if (diceResults.length === 0) return [];

    const results: { columnId: string; cityName: string; count: number; cubes: CubeColor[] }[] = [];
    const profile = getMapProfile(mapId);

    // 달: "주사위 눈 = 열 번호"가 아니라 도시별 인쇄 번호 쌍(cityGrowthDice)으로 성장이 결정된다
    // (신도시 A~D만 다른 맵과 같은 diceNumber 방식) — 또한 낮쪽+Moon Base 연결 조건까지 맞아야
    // 실제로 이동한다. growGoods(goodsGrowthSlice)의 판정을 그대로 미러링해 미리보기를 정확히 맞춘다.
    if (profile.cityDiceGrowth) {
      const growthDice = profile.cityGrowthDice;
      const seedId = profile.masterNetworkSeedCityId;
      const connected = seedId ? citiesConnectedToSeed(board, seedId) : null;

      const pushIfGrowable = (cityId: string, columnIndex: number, matchCount: number) => {
        if (matchCount === 0) return;
        const city = board.cities.find(c => c.id === cityId);
        if (!city) return;                                      // 신도시 미배치 등
        if (isNightCity(city, board)) return;                    // 밤쪽 — 성장 없음
        if (connected && !connected.has(cityId)) return;         // Moon Base 미연결 — 성장 없음
        const m = columns[columnIndex];
        const startIndex = startIndexOf(columnIndex);
        const columnCubes = goodsDisplay.slots
          .slice(startIndex, startIndex + m.rowCount)
          .filter(c => c !== null) as CubeColor[];
        const cubesToMove = columnCubes.slice(0, matchCount);
        if (cubesToMove.length > 0) {
          results.push({ columnId: m.columnId, cityName: city.name, count: cubesToMove.length, cubes: cubesToMove });
        }
      };

      columns.forEach((m, columnIndex) => {
        if (!m.isNewCity) {
          const pair = growthDice[m.cityId];
          if (!pair) return;
          const matchCount = diceResults.filter(d => pair.includes(d)).length;
          pushIfGrowable(m.cityId, columnIndex, matchCount);
        } else {
          if (m.diceNumber === undefined) return;
          const matchCount = diceResults.filter(d => d === m.diceNumber).length;
          pushIfGrowable(m.cityId, columnIndex, matchCount);
        }
      });

      return results;
    }

    // 주사위 결과 카운트
    const diceCountMap: Record<number, number> = {};
    diceResults.forEach(d => {
      diceCountMap[d] = (diceCountMap[d] || 0) + 1;
    });

    // 주사위 번호 → diceNumber가 일치하는 모든 도시 열에서 이동할 큐브 계산
    for (const [diceValue, count] of Object.entries(diceCountMap)) {
      const dnum = Number(diceValue);
      columns.forEach((m, columnIndex) => {
        if (m.isNewCity) return;
        const dice = m.diceNumber ?? Number(m.columnId);
        if (dice !== dnum) return;

        const city = board.cities.find(c => c.id === m.cityId);
        if (!city) return;

        const startIndex = startIndexOf(columnIndex);
        const columnCubes = goodsDisplay.slots
          .slice(startIndex, startIndex + m.rowCount)
          .filter(c => c !== null) as CubeColor[];
        const cubesToMove = columnCubes.slice(0, count);

        if (cubesToMove.length > 0) {
          results.push({
            columnId: m.columnId,
            cityName: city.name,
            count: cubesToMove.length,
            cubes: cubesToMove,
          });
        }
      });
    }

    return results;
  };

  // 주사위 굴리기 핸들러
  const handleDiceRoll = (results: number[]) => {
    setDiceResults(results);
    setGrowthApplied(false);
  };

  // 물품 성장 적용
  const handleApplyGrowth = () => {
    if (diceResults.length === 0) return;
    setAppliedResults(growthResults); // 변형 전 결과 스냅샷 (완료 문구용)
    growGoods(diceResults);
    setGrowthApplied(true);
  };

  // 다음 단계로 이동
  const handleNextPhase = () => {
    nextPhase();
  };

  const growthResults = calculateGrowthResults();

  // 관전 뷰: (게스트) 방장이 진행하는 성장을 스냅샷으로 보거나, (오프라인) 봇이 자동으로 굴린
  // 성장 결과를 잠시 본다 — 주사위 결과와 도시별 추가 큐브를 표시.
  if (showSpectatorView) {
    const waitingText = currentIsBot
      ? `${players[currentPlayer]?.name ?? '봇'}이 주사위를 굴리는 중입니다...`
      : '방장이 주사위를 굴리는 중입니다...';
    const diceLabel = currentIsBot ? '봇 주사위:' : '방장 주사위:';
    return (
      <div className="p-4 rounded-lg bg-background/50 border border-foreground/10">
        <div className="flex items-center gap-2 mb-2 text-accent">
          <Sparkles size={18} />
          <span className="font-medium">물품 성장</span>
        </div>
        {goodsGrowthEvent ? (
          <>
            <p className="text-xs md:text-sm text-foreground-secondary">
              {diceLabel}{' '}
              <span className="font-semibold text-foreground">{goodsGrowthEvent.dice.join(', ')}</span>
            </p>
            {goodsGrowthEvent.results.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-foreground">
                {goodsGrowthEvent.results.map((r, i) => (
                  <li key={`${r.cityName}-${i}`} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                    <span className="font-semibold">{r.cityName}</span>
                    <span className="font-bold text-foreground">+</span>
                    <span className="flex items-center gap-1">
                      {r.cubes.map((cube, j) => (
                        <span
                          key={j}
                          className="inline-block w-3 h-3 rounded-sm border border-white/60"
                          style={{ backgroundColor: CUBE_COLORS[cube] }}
                        />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-foreground-secondary">이동한 물품이 없습니다.</p>
            )}
          </>
        ) : (
          <p className="text-xs md:text-sm text-foreground-secondary">
            {waitingText}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Production 행동 안내 */}
      {productionPlayer && !phaseState.productionUsed && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg bg-purple-500/20 border border-purple-500/30"
        >
          <div className="flex items-center gap-2 text-purple-400">
            <Package size={16} />
            <span className="text-sm font-medium">
              {productionPlayer.name}의 Production 효과
            </span>
          </div>
          <p className="text-xs text-purple-300 mt-1">
            {productionPending
              ? `${productionPlayer?.name}님이 주머니 큐브를 빈 칸에 배치하는 중입니다. 배치가 끝나면 주사위를 굴릴 수 있어요.`
              : '주머니에서 큐브 2개를 물품 디스플레이 빈 칸에 추가합니다.'}
          </p>
        </motion.div>
      )}

      {/* 주사위 굴리기 (생산 대기 중이면 잠금 — 룰북: 생산 → 주사위) */}
      <div className="p-4 rounded-lg bg-background/50 border border-foreground/10">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-accent" />
          <h4 className="font-medium text-foreground">물품 성장</h4>
        </div>

        <DiceRoller
          diceCount={diceCount}
          onRoll={handleDiceRoll}
          disabled={growthApplied || productionPending}
          showColumnTally={!getMapProfile(mapId).cityDiceGrowth}
        />
        {productionPending && (
          <p className="mt-2 text-center text-xs text-foreground-secondary">
            ⏳ 생산 배치 완료를 기다리는 중…
          </p>
        )}
      </div>

      {/* 결과 미리보기 */}
      <AnimatePresence>
        {diceResults.length > 0 && !growthApplied && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 rounded-lg bg-accent/10 border border-accent/30"
          >
            <h4 className="text-sm font-medium text-accent mb-3">이동 예정</h4>

            {growthResults.length > 0 ? (
              <div className="space-y-2">
                {growthResults.map((result, index) => (
                  <motion.div
                    key={result.columnId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center justify-between p-2 rounded bg-background/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground-secondary">
                        열 {result.columnId}
                      </span>
                      <ArrowRight size={14} className="text-foreground-muted" />
                      <span className="text-sm font-medium text-foreground">
                        {result.cityName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {result.cubes.map((cube, i) => (
                        <div
                          key={i}
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: CUBE_COLORS[cube] }}
                        />
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground-secondary">
                이동할 물품이 없습니다.
              </p>
            )}

            <button
              onClick={handleApplyGrowth}
              className="w-full mt-4 py-2 rounded-lg text-sm font-medium bg-accent text-background hover:bg-accent-light transition-colors flex items-center justify-center gap-2"
            >
              <Check size={16} />
              물품 성장 적용
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 완료 */}
      {growthApplied && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 rounded-lg bg-positive/10 border border-positive/30"
        >
          {/* 라이트 테마 대비: 옅은 초록 배경 위엔 딥그린/잉크 텍스트 */}
          <div className="flex items-center gap-2 text-positive mb-3">
            <Check size={18} />
            <span className="font-bold">물품 성장 완료!</span>
          </div>

          {appliedResults.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm text-foreground">
              {appliedResults.map((r, i) => (
                <li key={`${r.cityName}-${i}`} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                  <span className="font-semibold">{r.cityName}</span>
                  {/* "+n개" 텍스트 대신 검은 + 기호 + 실제 도착 큐브 색상 표시 */}
                  <span className="font-bold text-foreground">+</span>
                  <span className="flex items-center gap-1">
                    {r.cubes.map((cube, j) => (
                      <span
                        key={j}
                        className="inline-block w-3 h-3 rounded-sm border border-white/60"
                        style={{ backgroundColor: CUBE_COLORS[cube] }}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={handleNextPhase}
            className="w-full py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-500 transition-colors flex items-center justify-center gap-2"
          >
            다음 단계로
            <ArrowRight size={16} />
          </button>
        </motion.div>
      )}

      {/* 건너뛰기 (생산 대기 중이면 숨김 — 생산을 건너뛰지 못하게) */}
      {!growthApplied && diceResults.length === 0 && !productionPending && (
        <button
          onClick={handleNextPhase}
          className="w-full py-2 rounded-lg text-xs text-foreground-secondary hover:text-foreground hover:bg-background/30 transition-colors"
        >
          물품 성장 건너뛰기
        </button>
      )}
    </div>
  );
}
