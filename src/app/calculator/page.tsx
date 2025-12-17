'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  Train,
  Trophy,
  TrendingUp,
  Minus,
  Plus,
  RotateCcw,
  Home,
  Mountain,
  Waves,
  DollarSign,
  Receipt,
  PiggyBank
} from 'lucide-react';

const tabs = [
  { id: 'track', label: '트랙 비용', icon: Train },
  { id: 'score', label: '승점 계산', icon: Trophy },
  { id: 'income', label: '수입 시뮬레이터', icon: TrendingUp },
];

// Track types for placing
const trackTypes = [
  { id: 'simple', name: '단순 트랙', description: '직선/커브', costs: { plain: 2, river: 3, mountain: 4 } },
  { id: 'coexist', name: '복합 공존', description: '다리 없이 교차', costs: { plain: 3, river: 4, mountain: 5 } },
  { id: 'crossing', name: '복합 교차', description: '다리로 교차', costs: { plain: 4, river: 5, mountain: 6 } },
  { id: 'town', name: '마을 트랙', description: '마을 진입', costs: { base: 1, perTrack: 1 } },
];

const terrainTypes = [
  { id: 'plain', name: '평지', icon: Home, color: 'steam-green' },
  { id: 'river', name: '강', icon: Waves, color: 'steam-blue' },
  { id: 'mountain', name: '산', icon: Mountain, color: 'steam-red' },
];

const replaceTypes = [
  { id: 'toCrossing', name: '단순 → 복합 교차', cost: 3 },
  { id: 'inTown', name: '마을 내 교체', cost: 3 },
  { id: 'other', name: '기타 교체', cost: 2 },
];

interface TrackEntry {
  id: number;
  operation: 'place' | 'replace' | 'redirect';
  trackType?: string;
  terrain?: string;
  townConnections?: number;
  replaceType?: string;
  cost: number;
}

function TrackCalculator() {
  const [tracks, setTracks] = useState<TrackEntry[]>([]);
  const [currentOperation, setCurrentOperation] = useState<'place' | 'replace' | 'redirect'>('place');
  const [currentTrackType, setCurrentTrackType] = useState('simple');
  const [currentTerrain, setCurrentTerrain] = useState('plain');
  const [currentTownConnections, setCurrentTownConnections] = useState(2);
  const [currentReplaceType, setCurrentReplaceType] = useState('other');

  const calculateCost = (): number => {
    if (currentOperation === 'redirect') return 2;
    if (currentOperation === 'replace') {
      return replaceTypes.find(r => r.id === currentReplaceType)?.cost || 2;
    }
    // place
    const track = trackTypes.find(t => t.id === currentTrackType);
    if (!track) return 0;
    if (currentTrackType === 'town') {
      return (track.costs as { base: number; perTrack: number }).base +
             (track.costs as { base: number; perTrack: number }).perTrack * currentTownConnections;
    }
    return (track.costs as { plain: number; river: number; mountain: number })[currentTerrain as 'plain' | 'river' | 'mountain'] || 0;
  };

  const addTrack = () => {
    if (tracks.length >= 4) return;
    const cost = calculateCost();
    const newTrack: TrackEntry = {
      id: Date.now(),
      operation: currentOperation,
      cost,
      ...(currentOperation === 'place' && {
        trackType: currentTrackType,
        terrain: currentTrackType !== 'town' ? currentTerrain : undefined,
        townConnections: currentTrackType === 'town' ? currentTownConnections : undefined,
      }),
      ...(currentOperation === 'replace' && { replaceType: currentReplaceType }),
    };
    setTracks([...tracks, newTrack]);
  };

  const removeTrack = (id: number) => {
    setTracks(tracks.filter(t => t.id !== id));
  };

  const reset = () => {
    setTracks([]);
    setCurrentOperation('place');
    setCurrentTrackType('simple');
    setCurrentTerrain('plain');
    setCurrentTownConnections(2);
    setCurrentReplaceType('other');
  };

  const totalCost = tracks.reduce((sum, t) => sum + t.cost, 0);

  const getTrackLabel = (track: TrackEntry): string => {
    if (track.operation === 'redirect') return '방향 전환';
    if (track.operation === 'replace') {
      return replaceTypes.find(r => r.id === track.replaceType)?.name || '교체';
    }
    const trackType = trackTypes.find(t => t.id === track.trackType);
    if (track.trackType === 'town') {
      return `${trackType?.name} (${track.townConnections}연결)`;
    }
    const terrain = terrainTypes.find(t => t.id === track.terrain);
    return `${trackType?.name} (${terrain?.name})`;
  };

  return (
    <div className="space-y-8">
      {/* Operation Type Selection */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">작업 유형</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { id: 'place', name: '배치', desc: '새 트랙 놓기' },
            { id: 'replace', name: '교체', desc: '기존 트랙 변경' },
            { id: 'redirect', name: '방향 전환', desc: '미완성 트랙 ($2)' },
          ].map((op) => (
            <motion.button
              key={op.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setCurrentOperation(op.id as 'place' | 'replace' | 'redirect')}
              className={`p-4 rounded-xl border transition-all ${
                currentOperation === op.id
                  ? 'border-accent bg-accent/10'
                  : 'border-glass-border hover:border-accent/50'
              }`}
            >
              <div className="text-foreground font-medium">{op.name}</div>
              <div className="text-xs text-foreground-muted">{op.desc}</div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Place Options */}
      {currentOperation === 'place' && (
        <>
          {/* Track Type */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-4">트랙 유형</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {trackTypes.map((track) => (
                <motion.button
                  key={track.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setCurrentTrackType(track.id)}
                  className={`p-4 rounded-xl border transition-all ${
                    currentTrackType === track.id
                      ? 'border-accent bg-accent/10'
                      : 'border-glass-border hover:border-accent/50'
                  }`}
                >
                  <div className="text-foreground font-medium">{track.name}</div>
                  <div className="text-xs text-foreground-muted">{track.description}</div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Terrain (for non-town tracks) */}
          {currentTrackType !== 'town' && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">지형</h3>
              <div className="grid grid-cols-3 gap-3">
                {terrainTypes.map((terrain) => {
                  const track = trackTypes.find(t => t.id === currentTrackType);
                  const cost = track ? (track.costs as { plain: number; river: number; mountain: number })[terrain.id as 'plain' | 'river' | 'mountain'] : 0;
                  return (
                    <motion.button
                      key={terrain.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setCurrentTerrain(terrain.id)}
                      className={`p-4 rounded-xl border transition-all ${
                        currentTerrain === terrain.id
                          ? 'border-accent bg-accent/10'
                          : 'border-glass-border hover:border-accent/50'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg bg-${terrain.color}/20 flex items-center justify-center mx-auto mb-2`}>
                        <terrain.icon className={`w-5 h-5 text-${terrain.color}`} />
                      </div>
                      <div className="text-foreground font-medium">{terrain.name}</div>
                      <div className="text-accent text-sm">${cost}</div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Town Connections */}
          {currentTrackType === 'town' && (
            <div className="glass-card p-6 rounded-xl">
              <h3 className="text-lg font-semibold text-foreground mb-4">마을 연결 트랙 수</h3>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setCurrentTownConnections(Math.max(1, currentTownConnections - 1))}
                  className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
                >
                  <Minus className="w-4 h-4 text-foreground" />
                </button>
                <div className="flex-1 text-center">
                  <div className="counter-number text-3xl">{currentTownConnections}</div>
                  <div className="text-xs text-foreground-muted">연결</div>
                </div>
                <button
                  onClick={() => setCurrentTownConnections(Math.min(6, currentTownConnections + 1))}
                  className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
                >
                  <Plus className="w-4 h-4 text-foreground" />
                </button>
              </div>
              <div className="text-center mt-4 text-foreground-secondary">
                비용: $1 + ${currentTownConnections} = <span className="text-accent font-bold">${1 + currentTownConnections}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Replace Options */}
      {currentOperation === 'replace' && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">교체 유형</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {replaceTypes.map((replace) => (
              <motion.button
                key={replace.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setCurrentReplaceType(replace.id)}
                className={`p-4 rounded-xl border transition-all ${
                  currentReplaceType === replace.id
                    ? 'border-accent bg-accent/10'
                    : 'border-glass-border hover:border-accent/50'
                }`}
              >
                <div className="text-foreground font-medium">{replace.name}</div>
                <div className="text-accent text-sm">${replace.cost}</div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Redirect Info */}
      {currentOperation === 'redirect' && (
        <div className="glass-card p-6 rounded-xl text-center">
          <div className="text-foreground-muted mb-2">방향 전환 비용</div>
          <div className="counter-number text-4xl text-accent">$2</div>
          <div className="text-sm text-foreground-secondary mt-2">미완성 트랙 구간의 방향을 변경합니다</div>
        </div>
      )}

      {/* Add Track Button */}
      <div className="flex items-center justify-center gap-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={addTrack}
          disabled={tracks.length >= 4}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-background font-semibold transition-all ${
            tracks.length >= 4 ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <Plus className="w-5 h-5" />
          트랙 추가 (${calculateCost()})
        </motion.button>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-3 rounded-lg hover:bg-glass text-foreground-secondary hover:text-foreground transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          초기화
        </button>
      </div>

      {/* Selected Tracks */}
      <div className="glass-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          건설 목록 ({tracks.length}/4)
        </h3>
        <div className="space-y-3 min-h-[60px]">
          {tracks.length === 0 ? (
            <p className="text-foreground-muted">트랙을 추가하세요 (Engineer 행동 시 최대 4개)</p>
          ) : (
            tracks.map((track, index) => (
              <motion.div
                key={track.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="flex items-center justify-between p-3 rounded-lg bg-glass border border-glass-border"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold">
                    {index + 1}
                  </div>
                  <span className="text-foreground">{getTrackLabel(track)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-accent font-bold">${track.cost}</span>
                  <button
                    onClick={() => removeTrack(track.id)}
                    className="p-1 hover:bg-glass-hover rounded"
                  >
                    <Minus className="w-4 h-4 text-foreground-muted" />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Result */}
      <motion.div
        key={totalCost}
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        className="glass-card p-8 rounded-xl text-center"
      >
        <div className="text-foreground-muted mb-2">총 건설 비용</div>
        <div className="counter-number text-6xl">${totalCost}</div>
        {tracks.length > 0 && (
          <div className="mt-4 text-sm text-foreground-secondary">
            {tracks.map((t, i) => `$${t.cost}`).join(' + ')} = ${totalCost}
          </div>
        )}
      </motion.div>

      {/* Cost Reference Table */}
      <div className="glass-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-foreground mb-4">비용 참조표</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-glass-border">
                <th className="text-left py-2 text-foreground-muted">배치 (Placing)</th>
                <th className="text-center py-2 text-steam-green">평지</th>
                <th className="text-center py-2 text-steam-blue">강</th>
                <th className="text-center py-2 text-steam-red">산</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-glass-border/50">
                <td className="py-2 text-foreground">단순 트랙</td>
                <td className="text-center text-accent">$2</td>
                <td className="text-center text-accent">$3</td>
                <td className="text-center text-accent">$4</td>
              </tr>
              <tr className="border-b border-glass-border/50">
                <td className="py-2 text-foreground">복합 공존</td>
                <td className="text-center text-accent">$3</td>
                <td className="text-center text-accent">$4</td>
                <td className="text-center text-accent">$5</td>
              </tr>
              <tr className="border-b border-glass-border/50">
                <td className="py-2 text-foreground">복합 교차</td>
                <td className="text-center text-accent">$4</td>
                <td className="text-center text-accent">$5</td>
                <td className="text-center text-accent">$6</td>
              </tr>
              <tr>
                <td className="py-2 text-foreground" colSpan={4}>마을: $1 + 연결 트랙당 $1</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-foreground-muted mb-2">교체 (Replacing)</div>
              <div className="text-foreground">단순→복합교차: <span className="text-accent">$3</span></div>
              <div className="text-foreground">마을 내: <span className="text-accent">$3</span></div>
              <div className="text-foreground">기타: <span className="text-accent">$2</span></div>
            </div>
            <div>
              <div className="text-foreground-muted mb-2">방향 전환 (Redirecting)</div>
              <div className="text-foreground">모든 방향 전환: <span className="text-accent">$2</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreCalculator() {
  const [incomeTrack, setIncomeTrack] = useState(0);
  const [trackSegments, setTrackSegments] = useState(0);
  const [shares, setShares] = useState(2); // 시작 시 2주

  // 메뉴얼: 수입 트랙 위치 × 3점
  const incomePoints = incomeTrack * 3;
  // 메뉴얼: 완성된 철도 링크의 각 트랙 구간당 +1점
  const trackPoints = trackSegments;
  // 메뉴얼: 발행한 주식 수 × -3점
  const sharePenalty = shares * 3;
  const totalScore = incomePoints + trackPoints - sharePenalty;

  const reset = () => {
    setIncomeTrack(0);
    setTrackSegments(0);
    setShares(2);
  };

  return (
    <div className="space-y-8">
      {/* Input Sliders */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Income Track Position */}
        <div className="glass-card p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="w-5 h-5 text-steam-green" />
            <span className="text-foreground font-medium">수입 트랙 위치</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIncomeTrack(Math.max(-10, incomeTrack - 1))}
              className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
            >
              <Minus className="w-4 h-4 text-foreground" />
            </button>
            <div className="flex-1 text-center">
              <div className="counter-number text-3xl">{incomeTrack}</div>
              <div className="text-xs text-foreground-muted">위치</div>
            </div>
            <button
              onClick={() => setIncomeTrack(Math.min(50, incomeTrack + 1))}
              className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
            >
              <Plus className="w-4 h-4 text-foreground" />
            </button>
          </div>
          <input
            type="range"
            min="-10"
            max="50"
            value={incomeTrack}
            onChange={(e) => setIncomeTrack(Number(e.target.value))}
            className="w-full mt-4 accent-steam-green"
          />
          <div className="text-xs text-steam-green mt-2 text-center">
            = +{incomePoints}점 (위치 × 3점)
          </div>
        </div>

        {/* Track Tiles in Completed Links */}
        <div className="glass-card p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-4">
            <Train className="w-5 h-5 text-accent" />
            <span className="text-foreground font-medium">완성된 링크의 트랙 타일</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setTrackSegments(Math.max(0, trackSegments - 1))}
              className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
            >
              <Minus className="w-4 h-4 text-foreground" />
            </button>
            <div className="flex-1 text-center">
              <div className="counter-number text-3xl">{trackSegments}</div>
              <div className="text-xs text-foreground-muted">타일</div>
            </div>
            <button
              onClick={() => setTrackSegments(Math.min(100, trackSegments + 1))}
              className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
            >
              <Plus className="w-4 h-4 text-foreground" />
            </button>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={trackSegments}
            onChange={(e) => setTrackSegments(Number(e.target.value))}
            className="w-full mt-4 accent-accent"
          />
          <div className="text-xs text-accent mt-2 text-center">
            = +{trackPoints}점 (타일당 1점)
          </div>
          <div className="text-xs text-foreground-muted mt-1 text-center">
            * 미완성 트랙은 제외
          </div>
        </div>

        {/* Shares */}
        <div className="glass-card p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-4">
            <Receipt className="w-5 h-5 text-steam-red" />
            <span className="text-foreground font-medium">발행 주식</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShares(Math.max(2, shares - 1))}
              className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
            >
              <Minus className="w-4 h-4 text-foreground" />
            </button>
            <div className="flex-1 text-center">
              <div className="counter-number text-3xl">{shares}</div>
              <div className="text-xs text-foreground-muted">주</div>
            </div>
            <button
              onClick={() => setShares(Math.min(15, shares + 1))}
              className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
            >
              <Plus className="w-4 h-4 text-foreground" />
            </button>
          </div>
          <input
            type="range"
            min="2"
            max="15"
            value={shares}
            onChange={(e) => setShares(Number(e.target.value))}
            className="w-full mt-4 accent-steam-red"
          />
          <div className="text-xs text-steam-red mt-2 text-center">
            = -{sharePenalty}점 (주당 -3점)
          </div>
        </div>
      </div>

      {/* Reset Button */}
      <div className="flex justify-center">
        <button
          onClick={reset}
          className="flex items-center gap-2 px-6 py-3 rounded-lg hover:bg-glass text-foreground-secondary hover:text-foreground transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          초기화
        </button>
      </div>

      {/* Result */}
      <motion.div
        key={totalScore}
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        className="glass-card p-8 rounded-xl"
      >
        <div className="grid md:grid-cols-4 gap-6 items-center">
          <div className="text-center">
            <div className="text-foreground-muted text-sm mb-1">수입 (×3)</div>
            <div className="text-2xl font-bold text-steam-green">+{incomePoints}</div>
          </div>
          <div className="text-center">
            <div className="text-foreground-muted text-sm mb-1">트랙 타일</div>
            <div className="text-2xl font-bold text-accent">+{trackPoints}</div>
          </div>
          <div className="text-center">
            <div className="text-foreground-muted text-sm mb-1">주식 (×3)</div>
            <div className="text-2xl font-bold text-steam-red">-{sharePenalty}</div>
          </div>
          <div className="text-center p-4 rounded-xl bg-accent/10">
            <div className="text-foreground-muted text-sm mb-1">총점</div>
            <div className={`counter-number text-4xl ${totalScore < 0 ? 'text-steam-red' : ''}`}>
              {totalScore}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Scoring Reference */}
      <div className="glass-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-foreground mb-4">승점 계산 공식</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-foreground">수입 트랙 위치</span>
            <span className="text-steam-green">× 3점</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground">완성된 링크의 트랙 타일 수</span>
            <span className="text-accent">× 1점</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground">발행한 주식 수</span>
            <span className="text-steam-red">× -3점</span>
          </div>
          <div className="border-t border-glass-border pt-2 mt-2">
            <p className="text-foreground-muted text-xs">
              * 완성된 링크 = 도시/마을에서 다른 도시/마을까지 연결된 트랙
              <br />* 미완성 트랙(끊긴 트랙)은 점수에 포함되지 않음
              <br />* 게임 종료 시 돈은 승점에 영향 없음
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// 수입 감소 테이블 (메뉴얼 VIII. Income Reduction)
const getIncomeReduction = (income: number): number => {
  if (income >= 50) return -10;
  if (income >= 41) return -8;
  if (income >= 31) return -6;
  if (income >= 21) return -4;
  if (income >= 11) return -2;
  return 0;
};

function IncomeSimulator() {
  const [incomeTrackPosition, setIncomeTrackPosition] = useState(0);
  const [locomotiveLevel, setLocomotiveLevel] = useState(1);
  const [issuedShares, setIssuedShares] = useState(2); // 시작 시 2주
  const [currentCash, setCurrentCash] = useState(10); // 시작 자금 $10

  // Phase VI: 수입 수집 - 수입 트랙 위치에 해당하는 금액
  const collectedIncome = incomeTrackPosition;

  // Phase VII: 비용 지불 = 기관차 레벨 + 발행 주식 수
  const totalExpenses = locomotiveLevel + issuedShares;

  // 현금 후 잔액
  const cashAfterExpenses = currentCash + collectedIncome - totalExpenses;

  // 현금 부족 시 수입 감소로 충당
  const cashShortfall = Math.max(0, -cashAfterExpenses);
  const incomeAfterShortfall = incomeTrackPosition - cashShortfall;

  // Phase VIII: 수입 감소 (테이블 기준)
  const incomeReduction = getIncomeReduction(incomeAfterShortfall);

  // 최종 수입 트랙 위치
  const finalIncomePosition = Math.max(-10, incomeAfterShortfall + incomeReduction);

  // 파산 여부 (수입이 -10 미만이 되면)
  const isBankrupt = incomeAfterShortfall + incomeReduction < -10;

  const reset = () => {
    setIncomeTrackPosition(0);
    setLocomotiveLevel(1);
    setIssuedShares(2);
    setCurrentCash(10);
  };

  return (
    <div className="space-y-8">
      {/* Phase VI & VII Inputs */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Left Column - 수입 관련 */}
        <div className="space-y-6">
          {/* Income Track Position */}
          <div className="glass-card p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-5 h-5 text-steam-green" />
              <span className="text-foreground font-medium">수입 트랙 위치</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIncomeTrackPosition(Math.max(-10, incomeTrackPosition - 1))}
                className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
              >
                <Minus className="w-4 h-4 text-foreground" />
              </button>
              <div className="flex-1 text-center">
                <div className="counter-number text-3xl">{incomeTrackPosition}</div>
              </div>
              <button
                onClick={() => setIncomeTrackPosition(Math.min(50, incomeTrackPosition + 1))}
                className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
              >
                <Plus className="w-4 h-4 text-foreground" />
              </button>
            </div>
            <input
              type="range"
              min="-10"
              max="50"
              value={incomeTrackPosition}
              onChange={(e) => setIncomeTrackPosition(Number(e.target.value))}
              className="w-full mt-4 accent-steam-green"
            />
            <div className="text-center mt-2 text-sm text-steam-green">
              수입: ${collectedIncome}
            </div>
          </div>

          {/* Current Cash */}
          <div className="glass-card p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <PiggyBank className="w-5 h-5 text-accent" />
              <span className="text-foreground font-medium">현재 보유 현금</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentCash(Math.max(0, currentCash - 5))}
                className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
              >
                <Minus className="w-4 h-4 text-foreground" />
              </button>
              <div className="flex-1 text-center">
                <div className="counter-number text-3xl">${currentCash}</div>
              </div>
              <button
                onClick={() => setCurrentCash(Math.min(100, currentCash + 5))}
                className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
              >
                <Plus className="w-4 h-4 text-foreground" />
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={currentCash}
              onChange={(e) => setCurrentCash(Number(e.target.value))}
              className="w-full mt-4 accent-accent"
            />
          </div>
        </div>

        {/* Right Column - 비용 관련 */}
        <div className="space-y-6">
          {/* Locomotive Level */}
          <div className="glass-card p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <Train className="w-5 h-5 text-steam-yellow" />
              <span className="text-foreground font-medium">기관차 레벨 (Engine Track)</span>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <button
                  key={level}
                  onClick={() => setLocomotiveLevel(level)}
                  className={`p-3 rounded-lg text-center transition-all ${
                    locomotiveLevel === level
                      ? 'bg-steam-yellow/20 border-2 border-steam-yellow'
                      : 'bg-glass border border-glass-border hover:border-steam-yellow/50'
                  }`}
                >
                  <div className="text-foreground font-bold">{level}</div>
                  <div className="text-xs text-foreground-muted">-${level}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Issued Shares */}
          <div className="glass-card p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <Receipt className="w-5 h-5 text-steam-red" />
              <span className="text-foreground font-medium">발행 주식 수</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIssuedShares(Math.max(2, issuedShares - 1))}
                className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
              >
                <Minus className="w-4 h-4 text-foreground" />
              </button>
              <div className="flex-1 text-center">
                <div className="counter-number text-3xl">{issuedShares}</div>
                <div className="text-xs text-foreground-muted">주</div>
              </div>
              <button
                onClick={() => setIssuedShares(Math.min(15, issuedShares + 1))}
                className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
              >
                <Plus className="w-4 h-4 text-foreground" />
              </button>
            </div>
            <input
              type="range"
              min="2"
              max="15"
              value={issuedShares}
              onChange={(e) => setIssuedShares(Number(e.target.value))}
              className="w-full mt-4 accent-steam-red"
            />
            <div className="text-center mt-2 text-sm text-steam-red">
              비용: -${issuedShares}
            </div>
          </div>
        </div>
      </div>

      {/* Reset */}
      <div className="flex justify-center">
        <button
          onClick={reset}
          className="flex items-center gap-2 px-6 py-3 rounded-lg hover:bg-glass text-foreground-secondary hover:text-foreground transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          초기화
        </button>
      </div>

      {/* Phase by Phase Result */}
      <div className="space-y-4">
        {/* Phase VI: Collect Income */}
        <div className="glass-card p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-foreground-muted text-sm">VI. 수입 수집</span>
              <p className="text-foreground">수입 트랙에서 ${collectedIncome} 받음</p>
            </div>
            <div className="text-steam-green font-bold text-xl">+${collectedIncome}</div>
          </div>
        </div>

        {/* Phase VII: Pay Expenses */}
        <div className="glass-card p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-foreground-muted text-sm">VII. 비용 지불</span>
              <p className="text-foreground">기관차 ${locomotiveLevel} + 주식 ${issuedShares} = ${totalExpenses}</p>
            </div>
            <div className="text-steam-red font-bold text-xl">-${totalExpenses}</div>
          </div>
          {cashShortfall > 0 && (
            <div className="mt-2 p-2 rounded bg-steam-red/10 text-steam-red text-sm">
              현금 부족! 수입 트랙에서 {cashShortfall}칸 감소
            </div>
          )}
        </div>

        {/* Phase VIII: Income Reduction */}
        <div className="glass-card p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-foreground-muted text-sm">VIII. 수입 감소</span>
              <p className="text-foreground">
                수입 {incomeAfterShortfall}에서 {incomeReduction === 0 ? '감소 없음' : `${incomeReduction}칸 감소`}
              </p>
            </div>
            <div className={`font-bold text-xl ${incomeReduction < 0 ? 'text-steam-yellow' : 'text-foreground-muted'}`}>
              {incomeReduction}
            </div>
          </div>
        </div>

        {/* Final Result */}
        <motion.div
          key={finalIncomePosition}
          initial={{ scale: 1.05 }}
          animate={{ scale: 1 }}
          className={`glass-card p-6 rounded-xl ${isBankrupt ? 'border-2 border-steam-red' : ''}`}
        >
          <div className="grid md:grid-cols-3 gap-4 items-center">
            <div className="text-center">
              <div className="text-foreground-muted text-sm">남은 현금</div>
              <div className="counter-number text-2xl">
                ${Math.max(0, cashAfterExpenses)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-foreground-muted text-sm">최종 수입 위치</div>
              <div className={`counter-number text-3xl ${finalIncomePosition < 0 ? 'text-steam-red' : 'text-steam-green'}`}>
                {finalIncomePosition}
              </div>
            </div>
            <div className="text-center">
              <div className="text-foreground-muted text-sm">다음 턴 수입</div>
              <div className="counter-number text-2xl text-accent">
                ${finalIncomePosition}
              </div>
            </div>
          </div>

          {isBankrupt && (
            <div className="mt-4 p-4 rounded-lg bg-steam-red/20 text-center">
              <p className="text-steam-red font-bold text-lg">파산!</p>
              <p className="text-steam-red text-sm">수입이 -10 미만이 되어 게임에서 탈락합니다.</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Income Reduction Reference Table */}
      <div className="glass-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-foreground mb-4">수입 감소 테이블</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
          {[
            { range: '50+', reduction: -10 },
            { range: '41-49', reduction: -8 },
            { range: '31-40', reduction: -6 },
            { range: '21-30', reduction: -4 },
            { range: '11-20', reduction: -2 },
            { range: '0-10', reduction: 0 },
          ].map((item) => (
            <div
              key={item.range}
              className={`p-3 rounded-lg text-center ${
                getIncomeReduction(incomeAfterShortfall) === item.reduction
                  ? 'bg-accent/20 border border-accent'
                  : 'bg-glass border border-glass-border'
              }`}
            >
              <div className="text-foreground font-medium">{item.range}</div>
              <div className={item.reduction < 0 ? 'text-steam-yellow' : 'text-foreground-muted'}>
                {item.reduction}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-foreground-muted">
          * 현금으로 비용 지불 불가 시, 부족한 금액만큼 수입 트랙에서 감소
          <br />* 수입이 -10 미만이 되면 파산 (게임에서 탈락)
        </div>
      </div>
    </div>
  );
}

export default function CalculatorPage() {
  const [activeTab, setActiveTab] = useState('track');
  const heroRef = useRef<HTMLDivElement>(null);
  const isHeroInView = useInView(heroRef, { once: true });

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative pt-32 pb-12 overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background-secondary to-background" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <span className="text-accent text-sm tracking-widest uppercase mb-4 block">
              Game Tools
            </span>
            <h1 className="font-display text-5xl md:text-6xl font-bold text-foreground mb-6">
              게임 <span className="text-gradient">계산기</span>
            </h1>
            <p className="text-foreground-secondary max-w-2xl mx-auto text-lg">
              트랙 비용, 승점, 수입을 쉽게 계산하세요.
              실시간으로 결과를 확인할 수 있습니다.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Calculator Section */}
      <section className="py-12 relative">
        <div className="absolute inset-0 hex-pattern opacity-30" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-12">
            {tabs.map((tab) => (
              <motion.button
                key={tab.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all ${
                  activeTab === tab.id
                    ? 'bg-accent text-background font-semibold'
                    : 'glass text-foreground-secondary hover:text-foreground'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </motion.button>
            ))}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {activeTab === 'track' && <TrackCalculator />}
              {activeTab === 'score' && <ScoreCalculator />}
              {activeTab === 'income' && <IncomeSimulator />}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
