/**
 * FireScope — Explainable Priority Queue & Weight Sensitivity Triage
 * 
 * Provides:
 * - Transparent, explainable priority ranking
 * - User-adjustable weights with non-negative validation and sum-to-100% enforcement
 * - Multi-criteria sorting (Score, Recency, FRP, Confidence)
 * - Filtering by Sensor, Triage Tier, and Region
 * - Detailed component score breakdowns with exact point contributions
 * - Plain-language explanations of triage drivers
 * - Incomplete telemetry indicators
 */

import React, { useState, useMemo } from 'react';
import {
  ListOrdered,
  Sliders,
  RotateCcw,
  Download,
  Flame,
  Clock,
  ShieldCheck,
  Layers,
  ArrowRight,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowUpDown,
  Sparkles,
} from 'lucide-react';
import { FireObservation, ScoreWeights, TriagePriorityLabel } from '../../types/observation';
import {
  DEFAULT_WEIGHTS,
  computePriorityScore,
  validateWeights,
  normalizeWeights,
} from '../../utils/scoring';
import { exportRankedObservationsWithBreakdownsCsv, triggerCsvDownload } from '../../utils/export';

interface PriorityQueueViewProps {
  observations: FireObservation[];
  onSelectObservation: (obs: FireObservation) => void;
  onNavigateToMap: () => void;
}

type SortCriteria = 'score_desc' | 'score_asc' | 'recency' | 'frp' | 'confidence';

export const PriorityQueueView: React.FC<PriorityQueueViewProps> = ({
  observations,
  onSelectObservation,
  onNavigateToMap,
}) => {
  // Configurable weights state (in percentage integer form 0-100 for intuitive user editing)
  const [weightInputs, setWeightInputs] = useState<{
    recency: number;
    confidence: number;
    thermal: number;
    repeat: number;
  }>({
    recency: 25,
    confidence: 25,
    thermal: 30,
    repeat: 20,
  });

  // Filters & Sorting state
  const [sortCriteria, setSortCriteria] = useState<SortCriteria>('score_desc');
  const [selectedSensorFilter, setSelectedSensorFilter] = useState<'ALL' | 'VIIRS' | 'MODIS'>('ALL');
  const [selectedTierFilter, setSelectedTierFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [minFrpFilter, setMinFrpFilter] = useState<number>(0);

  // Validate weights
  const currentWeights: ScoreWeights = useMemo(() => ({
    recencyWeight: Math.max(0, weightInputs.recency) / 100,
    confidenceWeight: Math.max(0, weightInputs.confidence) / 100,
    thermalWeight: Math.max(0, weightInputs.thermal) / 100,
    repeatWeight: Math.max(0, weightInputs.repeat) / 100,
  }), [weightInputs]);

  const weightValidation = useMemo(() => {
    return validateWeights(currentWeights);
  }, [currentWeights]);

  // Handle Normalize to 100% button
  const handleNormalizeWeights = () => {
    const normalized = normalizeWeights(currentWeights);
    setWeightInputs({
      recency: Math.round(normalized.recencyWeight * 100),
      confidence: Math.round(normalized.confidenceWeight * 100),
      thermal: Math.round(normalized.thermalWeight * 100),
      repeat: Math.round(normalized.repeatWeight * 100),
    });
  };

  const handleApplyPreset = (preset: 'balanced' | 'thermal' | 'recency' | 'persistence') => {
    if (preset === 'balanced') {
      setWeightInputs({ recency: 25, confidence: 25, thermal: 30, repeat: 20 });
    } else if (preset === 'thermal') {
      setWeightInputs({ recency: 15, confidence: 15, thermal: 50, repeat: 20 });
    } else if (preset === 'recency') {
      setWeightInputs({ recency: 45, confidence: 20, thermal: 20, repeat: 15 });
    } else if (preset === 'persistence') {
      setWeightInputs({ recency: 15, confidence: 20, thermal: 25, repeat: 40 });
    }
  };

  // Recompute scores on weight modification
  const prioritizedRecords = useMemo(() => {
    return observations.map(obs => {
      const recalculatedScore = computePriorityScore(obs, currentWeights);
      return {
        ...obs,
        score: recalculatedScore,
      };
    });
  }, [observations, currentWeights]);

  // Apply filters and sorting
  const filteredRecords = useMemo(() => {
    let result = prioritizedRecords;

    // Filter by sensor family
    if (selectedSensorFilter !== 'ALL') {
      result = result.filter(o => o.sensorFamily === selectedSensorFilter);
    }

    // Filter by triage tier
    if (selectedTierFilter !== 'ALL') {
      result = result.filter(o => o.score.triagePriorityLabel === selectedTierFilter);
    }

    // Filter by Min FRP
    if (minFrpFilter > 0) {
      result = result.filter(o => (o.frp || 0) >= minFrpFilter);
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        o =>
          o.id.toLowerCase().includes(q) ||
          o.region.toLowerCase().includes(q) ||
          o.country.toLowerCase().includes(q) ||
          o.platform.toLowerCase().includes(q)
      );
    }

    // Sorting
    return [...result].sort((a, b) => {
      if (sortCriteria === 'score_desc') return b.score.finalScore - a.score.finalScore;
      if (sortCriteria === 'score_asc') return a.score.finalScore - b.score.finalScore;
      if (sortCriteria === 'recency') {
        return new Date(b.acqTimestampUtc).getTime() - new Date(a.acqTimestampUtc).getTime();
      }
      if (sortCriteria === 'frp') return (b.frp || 0) - (a.frp || 0);
      if (sortCriteria === 'confidence') return b.confidence - a.confidence;
      return 0;
    });
  }, [prioritizedRecords, selectedSensorFilter, selectedTierFilter, minFrpFilter, searchQuery, sortCriteria]);

  const handleExportQueue = () => {
    const csv = exportRankedObservationsWithBreakdownsCsv(filteredRecords, currentWeights);
    triggerCsvDownload(csv, `firescope-ranked-observations-breakdowns-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const reviewFirstCount = prioritizedRecords.filter(o => o.score.triagePriorityLabel === 'Review first').length;
  const higherPriorityCount = prioritizedRecords.filter(o => o.score.triagePriorityLabel === 'Higher triage priority').length;

  return (
    <div className="space-y-6">
      {/* Analyst Decision Support Disclaimer */}
      <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg p-4 text-xs text-amber-200/90 flex items-start gap-3">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-amber-300 font-semibold">Analyst Decision Support Protocol: </strong>
          FireScope triage scores are transparent operational heuristics designed to optimize human analyst review queues.
          Scores do <strong>not</strong> quantify wildfire probability, predict fire behavior, or constitute confirmation of an active wildfire.
        </div>
      </div>

      {/* Weight Tuning & Transparent Formula Console */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-semibold text-neutral-100">
                Explainable Priority Ranking Engine (Weights Sensitivity)
              </h3>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Priority Score = ({weightInputs.recency}% × Recency) + ({weightInputs.confidence}% × Confidence) + ({weightInputs.thermal}% × Thermal) + ({weightInputs.repeat}% × Repeat Evidence)
            </p>
          </div>

          {/* Presets & Reset */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="text-neutral-400">Presets:</span>
            <button
              onClick={() => handleApplyPreset('balanced')}
              className={`px-2.5 py-1 rounded border text-xs transition-colors ${
                weightInputs.recency === 25 && weightInputs.confidence === 25 && weightInputs.thermal === 30 && weightInputs.repeat === 20
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-neutral-950 border-neutral-800 hover:bg-neutral-800 text-neutral-200'
              }`}
            >
              Balanced (25/25/30/20)
            </button>
            <button
              onClick={() => handleApplyPreset('thermal')}
              className={`px-2.5 py-1 rounded border text-xs transition-colors ${
                weightInputs.thermal === 50
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-neutral-950 border-neutral-800 hover:bg-neutral-800 text-neutral-200'
              }`}
            >
              Thermal Focus (50% FRP)
            </button>
            <button
              onClick={() => handleApplyPreset('recency')}
              className={`px-2.5 py-1 rounded border text-xs transition-colors ${
                weightInputs.recency === 45
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-neutral-950 border-neutral-800 hover:bg-neutral-800 text-neutral-200'
              }`}
            >
              Rapid Recency (45% Age)
            </button>
            <button
              onClick={() => handleApplyPreset('persistence')}
              className={`px-2.5 py-1 rounded border text-xs transition-colors ${
                weightInputs.repeat === 40
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-neutral-950 border-neutral-800 hover:bg-neutral-800 text-neutral-200'
              }`}
            >
              Persistence (40% Repeat)
            </button>
            <button
              onClick={() => handleApplyPreset('balanced')}
              className="p-1 text-neutral-400 hover:text-neutral-200 transition-colors"
              title="Reset weights to default"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Real-time Weight Adjustment Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Recency */}
          <div className="bg-neutral-950 p-3 rounded border border-neutral-800 space-y-2">
            <div className="flex justify-between items-center text-neutral-300 font-medium">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-neutral-400" /> Recency Weight
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={weightInputs.recency}
                  onChange={e => setWeightInputs(prev => ({ ...prev, recency: Math.max(0, parseInt(e.target.value) || 0) }))}
                  className="w-12 bg-neutral-900 border border-neutral-700 text-right px-1.5 py-0.5 rounded font-mono text-amber-400"
                />
                <span className="font-mono text-neutral-400">%</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={weightInputs.recency}
              onChange={e => setWeightInputs(prev => ({ ...prev, recency: parseInt(e.target.value) }))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[10px] text-neutral-400">Decays exponentially after 24h</p>
          </div>

          {/* Confidence */}
          <div className="bg-neutral-950 p-3 rounded border border-neutral-800 space-y-2">
            <div className="flex justify-between items-center text-neutral-300 font-medium">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-neutral-400" /> Confidence Weight
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={weightInputs.confidence}
                  onChange={e => setWeightInputs(prev => ({ ...prev, confidence: Math.max(0, parseInt(e.target.value) || 0) }))}
                  className="w-12 bg-neutral-900 border border-neutral-700 text-right px-1.5 py-0.5 rounded font-mono text-amber-400"
                />
                <span className="font-mono text-neutral-400">%</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={weightInputs.confidence}
              onChange={e => setWeightInputs(prev => ({ ...prev, confidence: parseInt(e.target.value) }))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[10px] text-neutral-400">VIIRS categorical & MODIS 0–100%</p>
          </div>

          {/* Thermal / FRP */}
          <div className="bg-neutral-950 p-3 rounded border border-neutral-800 space-y-2">
            <div className="flex justify-between items-center text-neutral-300 font-medium">
              <span className="flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-neutral-400" /> Thermal (FRP) Weight
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={weightInputs.thermal}
                  onChange={e => setWeightInputs(prev => ({ ...prev, thermal: Math.max(0, parseInt(e.target.value) || 0) }))}
                  className="w-12 bg-neutral-900 border border-neutral-700 text-right px-1.5 py-0.5 rounded font-mono text-amber-400"
                />
                <span className="font-mono text-neutral-400">%</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={weightInputs.thermal}
              onChange={e => setWeightInputs(prev => ({ ...prev, thermal: parseInt(e.target.value) }))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[10px] text-neutral-400">Log-normalized sensor radiance (MW)</p>
          </div>

          {/* Repeat */}
          <div className="bg-neutral-950 p-3 rounded border border-neutral-800 space-y-2">
            <div className="flex justify-between items-center text-neutral-300 font-medium">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-neutral-400" /> Repeat Pass Weight
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={weightInputs.repeat}
                  onChange={e => setWeightInputs(prev => ({ ...prev, repeat: Math.max(0, parseInt(e.target.value) || 0) }))}
                  className="w-12 bg-neutral-900 border border-neutral-700 text-right px-1.5 py-0.5 rounded font-mono text-amber-400"
                />
                <span className="font-mono text-neutral-400">%</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={weightInputs.repeat}
              onChange={e => setWeightInputs(prev => ({ ...prev, repeat: parseInt(e.target.value) }))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[10px] text-neutral-400">Independent spatial co-detections</p>
          </div>
        </div>

        {/* Weight Validation Status Strip */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-800 text-xs">
          <div className="flex items-center gap-2">
            {weightValidation.isNormalized ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>Weights Validated: Sums exactly to 100% ({weightValidation.sumPercentage}%)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
                <AlertTriangle className="w-4 h-4" />
                <span>
                  Sum is {weightValidation.sumPercentage}% (must sum to 100%). Weights are dynamically scaled for scoring.
                </span>
              </span>
            )}
          </div>

          {!weightValidation.isNormalized && (
            <button
              onClick={handleNormalizeWeights}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Normalize to 100%</span>
            </button>
          )}
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Box */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by ID, region, country..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded pl-8 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
              />
            </div>

            {/* Sensor Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-neutral-400">Sensor:</span>
              <select
                value={selectedSensorFilter}
                onChange={e => setSelectedSensorFilter(e.target.value as 'ALL' | 'VIIRS' | 'MODIS')}
                className="bg-neutral-950 border border-neutral-800 text-neutral-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-neutral-600"
              >
                <option value="ALL">All Sensors (VIIRS + MODIS)</option>
                <option value="VIIRS">VIIRS Only (375m)</option>
                <option value="MODIS">MODIS Only (1km)</option>
              </select>
            </div>

            {/* Tier Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-neutral-400">Triage Tier:</span>
              <select
                value={selectedTierFilter}
                onChange={e => setSelectedTierFilter(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 text-neutral-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-neutral-600"
              >
                <option value="ALL">All Triage Tiers</option>
                <option value="Review first">Review first (≥ 80)</option>
                <option value="Higher triage priority">Higher triage priority (65–79)</option>
                <option value="Elevated triage priority">Elevated triage priority (45–64)</option>
                <option value="Standard triage queue">Standard triage queue (&lt; 45)</option>
              </select>
            </div>

            {/* Min FRP Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-neutral-400">Min FRP:</span>
              <select
                value={minFrpFilter}
                onChange={e => setMinFrpFilter(Number(e.target.value))}
                className="bg-neutral-950 border border-neutral-800 text-neutral-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-neutral-600"
              >
                <option value={0}>All Thermal Levels</option>
                <option value={20}>≥ 20 MW</option>
                <option value={50}>≥ 50 MW</option>
                <option value={100}>≥ 100 MW (Intense)</option>
              </select>
            </div>
          </div>

          {/* Sort Control & Export */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400" />
              <span className="text-neutral-400">Sort by:</span>
              <select
                value={sortCriteria}
                onChange={e => setSortCriteria(e.target.value as SortCriteria)}
                className="bg-neutral-950 border border-neutral-800 text-neutral-200 rounded px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-neutral-600"
              >
                <option value="score_desc">Priority Score (Highest first)</option>
                <option value="score_asc">Priority Score (Lowest first)</option>
                <option value="recency">Acquisition Time (Newest first)</option>
                <option value="frp">Thermal Output / FRP (Highest first)</option>
                <option value="confidence">Sensor Confidence (Highest first)</option>
              </select>
            </div>

            <button
              onClick={handleExportQueue}
              className="px-3 py-1.5 rounded bg-neutral-950 border border-neutral-800 hover:bg-neutral-800 text-neutral-200 transition-colors flex items-center gap-1.5 text-xs font-medium"
            >
              <Download className="w-3.5 h-3.5 text-neutral-400" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Triage Tier Summary Chips */}
        <div className="flex items-center gap-2 pt-2 border-t border-neutral-850 text-xs">
          <span className="text-neutral-400 font-medium">Queue Snapshot:</span>
          <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
            {reviewFirstCount} Review First
          </span>
          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
            {higherPriorityCount} Higher Priority
          </span>
          <span className="text-neutral-400 font-mono text-[11px] ml-auto">
            Showing {filteredRecords.length} of {prioritizedRecords.length} records
          </span>
        </div>
      </div>

      {/* Ranked Queue Cards List */}
      <div className="space-y-3">
        {filteredRecords.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-10 text-center space-y-2">
            <Filter className="w-8 h-8 text-neutral-600 mx-auto" />
            <h4 className="text-sm font-semibold text-neutral-300">No observations match active triage filters</h4>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              Try relaxing your minimum FRP threshold, clearing your search query, or switching the sensor filter to "All Sensors".
            </p>
          </div>
        ) : (
          filteredRecords.map((obs, idx) => {
            const score = obs.score;
            const isReviewFirst = score.triagePriorityLabel === 'Review first';
            const isHigherPriority = score.triagePriorityLabel === 'Higher triage priority';

            return (
              <div
                key={obs.id}
                onClick={() => onSelectObservation(obs)}
                className={`bg-neutral-900 hover:bg-neutral-850 border rounded-lg p-4 cursor-pointer transition-colors space-y-3 ${
                  isReviewFirst
                    ? 'border-rose-500/40 hover:border-rose-500/60'
                    : isHigherPriority
                    ? 'border-amber-500/30 hover:border-amber-500/50'
                    : 'border-neutral-800 hover:border-neutral-700'
                }`}
              >
                {/* Card Top: Rank, Metadata, Triage Tier, and Score */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-md flex items-center justify-center font-mono font-bold text-sm shrink-0 ${
                        idx < 3
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : idx < 10
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-neutral-950 text-neutral-400 border border-neutral-800'
                      }`}
                    >
                      #{idx + 1}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-neutral-100">{obs.id}</span>
                        <span className="text-neutral-600">·</span>
                        <span className="text-xs font-semibold text-neutral-200">
                          {obs.region}, {obs.country}
                        </span>
                        <span className="text-neutral-600">·</span>
                        <span className="text-xs text-neutral-400">{obs.platform}</span>

                        {/* Triage Tier Badge */}
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-semibold ${
                            isReviewFirst
                              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              : isHigherPriority
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-neutral-800 text-neutral-300 border-neutral-700'
                          }`}
                        >
                          {score.triagePriorityLabel}
                        </span>

                        {/* Incomplete Telemetry Warning Tag */}
                        {score.isIncomplete && (
                          <span
                            className="text-[10px] bg-amber-950/40 text-amber-400 border border-amber-700/50 px-1.5 py-0.5 rounded flex items-center gap-1"
                            title={score.missingDataNotes.join(', ')}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span>Incomplete Telemetry</span>
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-neutral-400 flex items-center gap-2 mt-0.5 flex-wrap">
                        <span>
                          Coordinates: <strong className="font-mono tabular-nums text-neutral-300">{obs.latitude}°N, {obs.longitude}°W</strong>
                        </span>
                        <span>·</span>
                        <span>
                          Acquired: <strong className="font-mono tabular-nums text-neutral-300">{obs.acqTimestampUtc.replace('T', ' ').slice(0, 16)} UTC</strong>
                        </span>
                        <span>·</span>
                        <span>
                          FRP: <strong className="font-mono tabular-nums text-amber-400">{obs.frp !== undefined ? `${obs.frp} MW` : 'N/A'}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Big Triage Score Indicator */}
                  <div className="flex items-center gap-4 shrink-0 ml-auto">
                    <div className="text-right">
                      <div
                        className={`text-2xl font-bold font-mono tabular-nums ${
                          score.finalScore >= 80 ? 'text-rose-400' : score.finalScore >= 65 ? 'text-amber-400' : 'text-neutral-200'
                        }`}
                      >
                        {score.finalScore}
                      </div>
                      <div className="text-[10px] font-mono text-neutral-400">Triage Priority Index</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-neutral-500" />
                  </div>
                </div>

                {/* Weighted Point Contribution Formula Breakdown Strip */}
                <div className="bg-neutral-950 p-2.5 rounded border border-neutral-850 space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    {/* Recency contribution */}
                    <div className="bg-neutral-900/60 p-2 rounded border border-neutral-800">
                      <div className="flex justify-between items-center text-neutral-400 text-[10px]">
                        <span>Recency ({Math.round(currentWeights.recencyWeight * 100)}%)</span>
                        <span className="font-mono text-neutral-300">{score.recencyScore}/100</span>
                      </div>
                      <div className="font-mono font-semibold text-neutral-200 mt-0.5">
                        +{score.recencyContribution.toFixed(1)} <span className="text-[10px] text-neutral-400 font-normal">pts</span>
                      </div>
                    </div>

                    {/* Confidence contribution */}
                    <div className="bg-neutral-900/60 p-2 rounded border border-neutral-800">
                      <div className="flex justify-between items-center text-neutral-400 text-[10px]">
                        <span>Confidence ({Math.round(currentWeights.confidenceWeight * 100)}%)</span>
                        <span className="font-mono text-neutral-300">{score.confidenceScore}/100</span>
                      </div>
                      <div className="font-mono font-semibold text-neutral-200 mt-0.5">
                        +{score.confidenceContribution.toFixed(1)} <span className="text-[10px] text-neutral-400 font-normal">pts</span>
                      </div>
                    </div>

                    {/* Thermal contribution */}
                    <div className="bg-neutral-900/60 p-2 rounded border border-neutral-800">
                      <div className="flex justify-between items-center text-neutral-400 text-[10px]">
                        <span>Thermal FRP ({Math.round(currentWeights.thermalWeight * 100)}%)</span>
                        <span className="font-mono text-amber-400">{score.thermalScore}/100</span>
                      </div>
                      <div className="font-mono font-semibold text-amber-400 mt-0.5">
                        +{score.thermalContribution.toFixed(1)} <span className="text-[10px] text-neutral-400 font-normal">pts</span>
                      </div>
                    </div>

                    {/* Repeat contribution */}
                    <div className="bg-neutral-900/60 p-2 rounded border border-neutral-800">
                      <div className="flex justify-between items-center text-neutral-400 text-[10px]">
                        <span>Repeat Pass ({Math.round(currentWeights.repeatWeight * 100)}%)</span>
                        <span className="font-mono text-neutral-300">{score.repeatScore}/100</span>
                      </div>
                      <div className="font-mono font-semibold text-neutral-200 mt-0.5">
                        +{score.repeatContribution.toFixed(1)} <span className="text-[10px] text-neutral-400 font-normal">pts</span>
                      </div>
                    </div>
                  </div>

                  {/* Transparent Plain-Text Explanation */}
                  <div className="flex items-start gap-2 pt-1 border-t border-neutral-900 text-[11px] text-neutral-300">
                    <span className="text-neutral-500 font-mono text-[10px] shrink-0 uppercase tracking-wider">Rationale:</span>
                    <p className="leading-snug">{score.explanation}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
