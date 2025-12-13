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
  Building2,
  Mountain,
  TreePine,
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

const terrainTypes = [
  { id: 'plain', name: '평지', cost: 2, icon: Home, color: 'steam-green' },
  { id: 'town', name: '마을', cost: 3, icon: Building2, color: 'steam-blue' },
  { id: 'mountain', name: '산', cost: 4, icon: Mountain, color: 'steam-red' },
  { id: 'forest', name: '숲', cost: 3, icon: TreePine, color: 'steam-green' },
  { id: 'river', name: '강', cost: 3, icon: Waves, color: 'steam-blue' },
  { id: 'city', name: '도시', cost: 5, icon: Building2, color: 'steam-purple' },
];

function TrackCalculator() {
  const [selectedTerrains, setSelectedTerrains] = useState<string[]>([]);
  const [complexTrack, setComplexTrack] = useState(false);

  const addTerrain = (id: string) => {
    if (selectedTerrains.length < 3) {
      setSelectedTerrains([...selectedTerrains, id]);
    }
  };

  const removeTerrain = (index: number) => {
    setSelectedTerrains(selectedTerrains.filter((_, i) => i !== index));
  };

  const reset = () => {
    setSelectedTerrains([]);
    setComplexTrack(false);
  };

  const baseCost = selectedTerrains.reduce((sum, id) => {
    const terrain = terrainTypes.find((t) => t.id === id);
    return sum + (terrain?.cost || 0);
  }, 0);

  const totalCost = complexTrack ? baseCost + 2 : baseCost;

  return (
    <div className="space-y-8">
      {/* Terrain Selection */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">
          지형 선택 (최대 3개)
        </h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {terrainTypes.map((terrain) => (
            <motion.button
              key={terrain.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => addTerrain(terrain.id)}
              disabled={selectedTerrains.length >= 3}
              className={`p-4 rounded-xl border border-glass-border hover:border-accent/50
                transition-all ${selectedTerrains.length >= 3 ? 'opacity-50' : ''}`}
            >
              <div className={`w-10 h-10 rounded-lg bg-${terrain.color}/20
                flex items-center justify-center mx-auto mb-2`}>
                <terrain.icon className={`w-5 h-5 text-${terrain.color}`} />
              </div>
              <div className="text-sm font-medium text-foreground">{terrain.name}</div>
              <div className="text-xs text-accent">${terrain.cost}</div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Selected Terrains */}
      <div className="glass-card p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-foreground mb-4">선택된 지형</h3>
        <div className="flex flex-wrap gap-3 min-h-[60px]">
          {selectedTerrains.length === 0 ? (
            <p className="text-foreground-muted">지형을 선택하세요</p>
          ) : (
            selectedTerrains.map((id, index) => {
              const terrain = terrainTypes.find((t) => t.id === id)!;
              return (
                <motion.div
                  key={index}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-${terrain.color}/10 border border-${terrain.color}/30`}
                >
                  <terrain.icon className={`w-4 h-4 text-${terrain.color}`} />
                  <span className="text-foreground">{terrain.name}</span>
                  <span className="text-accent">${terrain.cost}</span>
                  <button
                    onClick={() => removeTerrain(index)}
                    className="ml-2 p-1 hover:bg-glass rounded"
                  >
                    <Minus className="w-3 h-3 text-foreground-muted" />
                  </button>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Options */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={complexTrack}
            onChange={(e) => setComplexTrack(e.target.checked)}
            className="w-5 h-5 rounded border-glass-border bg-glass text-accent focus:ring-accent"
          />
          <span className="text-foreground">복잡한 트랙 (+$2)</span>
        </label>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-glass text-foreground-secondary hover:text-foreground transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          초기화
        </button>
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
        {selectedTerrains.length > 0 && (
          <div className="mt-4 text-sm text-foreground-secondary">
            기본: ${baseCost} {complexTrack && '+ 복잡한 트랙: $2'}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function ScoreCalculator() {
  const [income, setIncome] = useState(0);
  const [tracks, setTracks] = useState(0);
  const [shares, setShares] = useState(0);

  const trackPoints = Math.floor(tracks / 2);
  const sharePenalty = shares * 3;
  const totalScore = income + trackPoints - sharePenalty;

  const reset = () => {
    setIncome(0);
    setTracks(0);
    setShares(0);
  };

  return (
    <div className="space-y-8">
      {/* Input Sliders */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Income */}
        <div className="glass-card p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="w-5 h-5 text-steam-green" />
            <span className="text-foreground font-medium">수입 트랙</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIncome(Math.max(0, income - 1))}
              className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
            >
              <Minus className="w-4 h-4 text-foreground" />
            </button>
            <div className="flex-1 text-center">
              <div className="counter-number text-3xl">{income}</div>
              <div className="text-xs text-foreground-muted">점</div>
            </div>
            <button
              onClick={() => setIncome(Math.min(30, income + 1))}
              className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
            >
              <Plus className="w-4 h-4 text-foreground" />
            </button>
          </div>
          <input
            type="range"
            min="0"
            max="30"
            value={income}
            onChange={(e) => setIncome(Number(e.target.value))}
            className="w-full mt-4 accent-steam-green"
          />
        </div>

        {/* Tracks */}
        <div className="glass-card p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-4">
            <Train className="w-5 h-5 text-accent" />
            <span className="text-foreground font-medium">트랙 타일</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setTracks(Math.max(0, tracks - 1))}
              className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
            >
              <Minus className="w-4 h-4 text-foreground" />
            </button>
            <div className="flex-1 text-center">
              <div className="counter-number text-3xl">{tracks}</div>
              <div className="text-xs text-foreground-muted">개</div>
            </div>
            <button
              onClick={() => setTracks(Math.min(50, tracks + 1))}
              className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
            >
              <Plus className="w-4 h-4 text-foreground" />
            </button>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            value={tracks}
            onChange={(e) => setTracks(Number(e.target.value))}
            className="w-full mt-4 accent-accent"
          />
          <div className="text-xs text-foreground-muted mt-2 text-center">
            = {trackPoints}점 (2개당 1점)
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
              onClick={() => setShares(Math.max(0, shares - 1))}
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
            min="0"
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
            <div className="text-foreground-muted text-sm mb-1">수입</div>
            <div className="text-2xl font-bold text-steam-green">+{income}</div>
          </div>
          <div className="text-center">
            <div className="text-foreground-muted text-sm mb-1">트랙</div>
            <div className="text-2xl font-bold text-accent">+{trackPoints}</div>
          </div>
          <div className="text-center">
            <div className="text-foreground-muted text-sm mb-1">주식</div>
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
    </div>
  );
}

function IncomeSimulator() {
  const [currentIncome, setCurrentIncome] = useState(0);
  const [deliveries, setDeliveries] = useState(0);
  const [operatingCost, setOperatingCost] = useState(0);
  const [shares, setShares] = useState(0);

  const newIncome = Math.min(30, currentIncome + deliveries);
  const incomeGain = Math.max(-10, newIncome - operatingCost - shares);

  const reset = () => {
    setCurrentIncome(0);
    setDeliveries(0);
    setOperatingCost(0);
    setShares(0);
  };

  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Current Income */}
          <div className="glass-card p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <PiggyBank className="w-5 h-5 text-accent" />
              <span className="text-foreground font-medium">현재 수입</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentIncome(Math.max(-10, currentIncome - 1))}
                className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
              >
                <Minus className="w-4 h-4 text-foreground" />
              </button>
              <div className="flex-1">
                <input
                  type="range"
                  min="-10"
                  max="30"
                  value={currentIncome}
                  onChange={(e) => setCurrentIncome(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
              <button
                onClick={() => setCurrentIncome(Math.min(30, currentIncome + 1))}
                className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
              >
                <Plus className="w-4 h-4 text-foreground" />
              </button>
            </div>
            <div className="text-center mt-2 counter-number text-2xl">{currentIncome}</div>
          </div>

          {/* Deliveries */}
          <div className="glass-card p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-5 h-5 text-steam-green" />
              <span className="text-foreground font-medium">이번 턴 배송 횟수</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setDeliveries(Math.max(0, deliveries - 1))}
                className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
              >
                <Minus className="w-4 h-4 text-foreground" />
              </button>
              <div className="flex-1">
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={deliveries}
                  onChange={(e) => setDeliveries(Number(e.target.value))}
                  className="w-full accent-steam-green"
                />
              </div>
              <button
                onClick={() => setDeliveries(Math.min(10, deliveries + 1))}
                className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
              >
                <Plus className="w-4 h-4 text-foreground" />
              </button>
            </div>
            <div className="text-center mt-2 counter-number text-2xl text-steam-green">
              +{deliveries}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Operating Cost */}
          <div className="glass-card p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <Receipt className="w-5 h-5 text-steam-yellow" />
              <span className="text-foreground font-medium">운영 비용 (기관차 레벨)</span>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <button
                  key={level}
                  onClick={() => setOperatingCost(level)}
                  className={`p-3 rounded-lg text-center transition-all ${
                    operatingCost === level
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

          {/* Shares */}
          <div className="glass-card p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <DollarSign className="w-5 h-5 text-steam-red" />
              <span className="text-foreground font-medium">주식 이자</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShares(Math.max(0, shares - 1))}
                className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
              >
                <Minus className="w-4 h-4 text-foreground" />
              </button>
              <div className="flex-1">
                <input
                  type="range"
                  min="0"
                  max="15"
                  value={shares}
                  onChange={(e) => setShares(Number(e.target.value))}
                  className="w-full accent-steam-red"
                />
              </div>
              <button
                onClick={() => setShares(Math.min(15, shares + 1))}
                className="p-2 rounded-lg bg-glass hover:bg-glass-hover"
              >
                <Plus className="w-4 h-4 text-foreground" />
              </button>
            </div>
            <div className="text-center mt-2 counter-number text-2xl text-steam-red">
              -{shares}
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

      {/* Result */}
      <motion.div
        key={incomeGain}
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        className="glass-card p-8 rounded-xl"
      >
        <div className="text-center mb-6">
          <div className="text-foreground-muted mb-2">이번 턴 순수입</div>
          <div className={`counter-number text-5xl ${incomeGain < 0 ? 'text-steam-red' : 'text-steam-green'}`}>
            {incomeGain > 0 ? '+' : ''}{incomeGain}
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 text-sm">
          <span className="text-foreground">
            새 수입 위치: <span className="text-accent font-bold">{newIncome}</span>
          </span>
          <span className="text-foreground-muted">→</span>
          <span className="text-foreground">
            실제 수입: <span className={`font-bold ${incomeGain < 0 ? 'text-steam-red' : 'text-steam-green'}`}>
              ${Math.max(-10, incomeGain)}
            </span>
          </span>
        </div>

        {incomeGain < 0 && (
          <div className="mt-4 p-4 rounded-lg bg-steam-red/10 text-center">
            <p className="text-steam-red text-sm">
              경고: 수입이 마이너스입니다! 주식을 발행해야 합니다.
            </p>
          </div>
        )}
      </motion.div>
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
