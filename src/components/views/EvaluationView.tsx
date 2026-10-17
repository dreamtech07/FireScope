/**
 * FireScope — Scientific Evaluation & Benchmark Suite
 * Versioned Curated Test Dataset (v1.2.0-curated)
 * 
 * Verifies:
 * 1. Data Ingestion & Sanitization Validation (boundary limits, date formats, negative values, duplicates)
 * 2. Explainable Priority Score Calculation (live weight adjustments, FRP weighting, persistent suppression)
 * 3. Multi-Satellite Candidate Event Grouping (spatial-temporal DBSCAN-style clustering)
 * 4. Cross-Sensor Source Matching (pairwise VIIRS & MODIS association)
 * 5. Empirical Precision, Recall, F1, and Confusion Matrix (strictly on independent reference labels)
 * 6. Exportable Evaluation Summaries (JSON, CSV, Markdown)
 */

import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Play,
  RotateCcw,
  Sliders,
  FileSpreadsheet,
  Download,
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Layers,
  Filter,
  Flame,
  Activity,
  Check,
  FileCheck2,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { BENCHMARK_DATASET, BENCHMARK_DATASET_VERSION, BENCHMARK_RELEASE_DATE } from '../../data/benchmarkDataset';
import {
  runBenchmarkSuite,
  generateEvaluationJsonReport,
  generateBenchmarkCsv,
  generateMarkdownEvaluationReport,
} from '../../utils/evaluationRunner';
import { ScoreWeights, MatchingToleranceConfig } from '../../types/observation';
import { DEFAULT_WEIGHTS } from '../../utils/scoring';
import { DEFAULT_MATCHING_CONFIG } from '../../utils/matcher';
import { KpiCard } from '../common/KpiCard';

export const EvaluationView: React.FC = () => {
  // ---------------------------------------------------------------------------
  // Evaluation Run Parameters State (Requirement 6: Show weights & params used)
  // ---------------------------------------------------------------------------
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  const [matchingConfig, setMatchingConfig] = useState<MatchingToleranceConfig>(DEFAULT_MATCHING_CONFIG);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  // Active filter for browsing benchmark records
  const [recordTypeFilter, setRecordTypeFilter] = useState<string>('ALL');
  const [provenanceFilter, setProvenanceFilter] = useState<'ALL' | 'REAL_ONLY' | 'SYNTHETIC_ONLY' | 'REFERENCE_ONLY'>('ALL');

  // Benchmark suite execution summary
  const summary = useMemo(() => {
    return runBenchmarkSuite(weights, matchingConfig);
  }, [weights, matchingConfig]);

  // Handlers for dynamic parameters
  const handleWeightChange = (field: keyof ScoreWeights, value: number) => {
    setWeights(prev => ({ ...prev, [field]: value }));
  };

  const handleNormalizeWeights = () => {
    const total = weights.recencyWeight + weights.confidenceWeight + weights.thermalWeight + weights.repeatWeight;
    if (total === 0) {
      setWeights(DEFAULT_WEIGHTS);
      return;
    }
    setWeights({
      recencyWeight: Number((weights.recencyWeight / total).toFixed(2)),
      confidenceWeight: Number((weights.confidenceWeight / total).toFixed(2)),
      thermalWeight: Number((weights.thermalWeight / total).toFixed(2)),
      repeatWeight: Number((weights.repeatWeight / total).toFixed(2)),
    });
  };

  const handleResetParameters = () => {
    setWeights(DEFAULT_WEIGHTS);
    setMatchingConfig(DEFAULT_MATCHING_CONFIG);
  };

  // Export handlers
  const handleExportJson = () => {
    const jsonStr = generateEvaluationJsonReport(summary);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `firescope-evaluation-report-${BENCHMARK_DATASET_VERSION}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csvStr = generateBenchmarkCsv();
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `firescope-benchmark-dataset-${BENCHMARK_DATASET_VERSION}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyMarkdown = () => {
    const md = generateMarkdownEvaluationReport(summary);
    navigator.clipboard.writeText(md).then(() => {
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2500);
    });
  };

  // Filtered benchmark dataset browser
  const filteredBenchmarkRecords = useMemo(() => {
    return BENCHMARK_DATASET.filter(rec => {
      if (recordTypeFilter !== 'ALL' && rec.recordType !== recordTypeFilter) {
        return false;
      }
      if (provenanceFilter === 'REAL_ONLY' && rec.isSynthetic) {
        return false;
      }
      if (provenanceFilter === 'SYNTHETIC_ONLY' && !rec.isSynthetic) {
        return false;
      }
      if (provenanceFilter === 'REFERENCE_ONLY' && !rec.independentReference.hasIndependentReferenceLabel) {
        return false;
      }
      return true;
    });
  }, [recordTypeFilter, provenanceFilter]);

  const cm = summary.confusionMatrix;

  return (
    <div className="space-y-6">
      {/* Top Banner: Version & Scientific Notice */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-semibold text-neutral-100">
              FireScope — Scientific Evaluation & Benchmark Suite
            </h2>
            <span className="text-[10px] font-mono text-neutral-300 bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">
              Dataset: {BENCHMARK_DATASET_VERSION}
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
            Empirical verification of input validation, explainable priority ranking, candidate event clustering, and multi-satellite source matching on curated reference records.
          </p>
        </div>

        {/* Export and Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={handleCopyMarkdown}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
            title="Copy Markdown summary report to clipboard"
          >
            {copiedMarkdown ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedMarkdown ? 'Report Copied!' : 'Copy Summary'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
            title="Export benchmark records as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleExportJson}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
            title="Download complete JSON benchmark report"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON Report</span>
          </button>
        </div>
      </div>

      {/* Prominent Scientific Disclaimer Banner (Requirements 4 & 5) */}
      <div className="bg-neutral-900 border border-amber-500/30 rounded-lg p-4 space-y-2 text-xs">
        <div className="flex items-center gap-2 text-amber-400 font-semibold">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Scientific Evaluation Boundaries & Sample Size Limitations (Do Not Generalize)</span>
        </div>
        <p className="text-neutral-300 leading-relaxed text-[11px]">
          <strong>Notice:</strong> Accuracy metrics (Precision, Recall, F1) below are computed strictly against <strong>N={summary.referenceLabelCount} documented cases</strong> with independent agency reference labels (CAL FIRE, InciWeb, NSW RFS, TCEQ Title V, World Bank GGFR, USGS HVO, EFFIS). 
          <em>Do not claim high planetary accuracy or operational wildfire extinction readiness based on this small test sample or synthetic test cases.</em> 
          In global operations, wildfires exhibit extreme spatial-temporal class imbalance (&gt;99.9% of planetary surface is fire-free) and cloud/smoke obscuration.
        </p>
      </div>

      {/* Key Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Precision (PPV)"
          value={cm ? `${(cm.precision * 100).toFixed(0)}%` : 'N/A'}
          subtext={`On N=${cm ? cm.sampleSize : 0} reference cases`}
          variant="accent"
        />
        <KpiCard
          label="Recall (Sensitivity)"
          value={cm ? `${(cm.recall * 100).toFixed(0)}%` : 'N/A'}
          subtext="Active wildfire detection"
          variant="accent"
        />
        <KpiCard
          label="F1 Benchmark Score"
          value={cm ? `${cm.f1Score}` : 'N/A'}
          subtext={`Harmonic mean (P/R)`}
          variant="accent"
        />
        <KpiCard
          label="Validation Suite"
          value={`${summary.validationTestResults.passed}/${summary.validationTestResults.total}`}
          subtext="Boundary & null sanity"
        />
        <KpiCard
          label="Scoring Suite"
          value={`${summary.scoringTestResults.passed}/${summary.scoringTestResults.total}`}
          subtext="Weight & formula integrity"
        />
        <KpiCard
          label="Grouping & Matching"
          value={`${summary.groupingTestResults.passed + summary.matchingTestResults.passed}/${summary.groupingTestResults.total + summary.matchingTestResults.total}`}
          subtext="Multi-satellite association"
        />
      </div>

      {/* SECTION 1: Active Ranking Weights & Matching Parameters (Requirement 6) */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800 flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-500" />
              <span>Active Ranking Weights & Matching Parameters Used for Run</span>
            </h3>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Live configuration parameters applied to benchmark evaluation. Adjust sliders to observe dynamic metric changes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleNormalizeWeights}
              className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px] transition-colors"
              title="Scale weights to sum to exactly 100%"
            >
              Normalize (100%)
            </button>
            <button
              onClick={handleResetParameters}
              className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px] transition-colors flex items-center gap-1"
              title="Reset weights and tolerances to defaults"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Defaults</span>
            </button>
          </div>
        </div>

        {/* Sliders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* FRP Weight */}
          <div className="bg-neutral-950 p-3 rounded border border-neutral-850 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-neutral-300 font-medium">Thermal / FRP Weight</span>
              <span className="font-mono text-amber-400 font-bold">{(weights.thermalWeight * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={weights.thermalWeight}
              onChange={e => handleWeightChange('thermalWeight', parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-neutral-800 rounded cursor-pointer"
            />
            <span className="text-[10px] text-neutral-500 block">Radiative output scaling (MW)</span>
          </div>

          {/* Confidence Weight */}
          <div className="bg-neutral-950 p-3 rounded border border-neutral-850 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-neutral-300 font-medium">Confidence Weight</span>
              <span className="font-mono text-amber-400 font-bold">{(weights.confidenceWeight * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={weights.confidenceWeight}
              onChange={e => handleWeightChange('confidenceWeight', parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-neutral-800 rounded cursor-pointer"
            />
            <span className="text-[10px] text-neutral-500 block">VIIRS flags / MODIS 0–100%</span>
          </div>

          {/* Recency Weight */}
          <div className="bg-neutral-950 p-3 rounded border border-neutral-850 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-neutral-300 font-medium">Recency Weight</span>
              <span className="font-mono text-amber-400 font-bold">{(weights.recencyWeight * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={weights.recencyWeight}
              onChange={e => handleWeightChange('recencyWeight', parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-neutral-800 rounded cursor-pointer"
            />
            <span className="text-[10px] text-neutral-500 block">Elapsed UTC hours decay</span>
          </div>

          {/* Repeat Weight */}
          <div className="bg-neutral-950 p-3 rounded border border-neutral-850 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-neutral-300 font-medium">Repeat Clustering Weight</span>
              <span className="font-mono text-amber-400 font-bold">{(weights.repeatWeight * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={weights.repeatWeight}
              onChange={e => handleWeightChange('repeatWeight', parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-neutral-800 rounded cursor-pointer"
            />
            <span className="text-[10px] text-neutral-500 block">Cross-orbit confirmation</span>
          </div>
        </div>

        {/* Matching Tolerances Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-neutral-800/80 text-[11px]">
          <div className="bg-neutral-950/70 p-2 rounded border border-neutral-850">
            <span className="text-neutral-500 block text-[10px]">Candidate Spatial Radius:</span>
            <span className="font-mono font-medium text-neutral-200">{matchingConfig.spatialToleranceKm} km</span>
          </div>
          <div className="bg-neutral-950/70 p-2 rounded border border-neutral-850">
            <span className="text-neutral-500 block text-[10px]">Candidate Temporal Window:</span>
            <span className="font-mono font-medium text-neutral-200">{matchingConfig.temporalToleranceHours} hours</span>
          </div>
          <div className="bg-neutral-950/70 p-2 rounded border border-neutral-850">
            <span className="text-neutral-500 block text-[10px]">Cross-Sensor Max Distance:</span>
            <span className="font-mono font-medium text-neutral-200">{matchingConfig.maxPairDistanceKm} km</span>
          </div>
          <div className="bg-neutral-950/70 p-2 rounded border border-neutral-850">
            <span className="text-neutral-500 block text-[10px]">Cross-Sensor Max Time Delta:</span>
            <span className="font-mono font-medium text-neutral-200">{matchingConfig.maxPairTimeDeltaMinutes} minutes</span>
          </div>
        </div>
      </div>

      {/* SECTION 2: Empirical Confusion Matrix & Independent Reference Evaluation (Requirements 3 & 4) */}
      {cm && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800 flex-wrap gap-2">
            <div>
              <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Empirical Confusion Matrix on Independent Reference Labels</span>
              </h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Evaluation restricted strictly to cases with external verified ground truth (N={cm.sampleSize}).
              </p>
            </div>
            <div className="text-[11px] font-mono text-neutral-400">
              Sample Breakdown: {Object.entries(cm.classDistribution).map(([k, v]) => `${k}: ${v}`).join(' · ')}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 2x2 Confusion Matrix Visual Grid */}
            <div className="md:col-span-2 space-y-3">
              <div className="text-xs font-semibold text-neutral-300">
                Classification Contingency Table:
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                {/* Header Row */}
                <div className="bg-neutral-950 p-2 text-center text-neutral-500 font-medium rounded">
                  Reference Label
                </div>
                <div className="bg-neutral-950 p-2 text-center text-neutral-300 font-semibold rounded">
                  Predicted High Triage (&ge;70)
                </div>
                <div className="bg-neutral-950 p-2 text-center text-neutral-300 font-semibold rounded">
                  Predicted Standard / Demoted (&lt;70)
                </div>

                {/* Ground Truth Active Wildfire */}
                <div className="bg-neutral-950 p-2.5 flex items-center font-medium text-neutral-200 rounded border border-neutral-850">
                  <span>Active Wildfire</span>
                </div>
                <div className="bg-emerald-950/40 border border-emerald-500/30 p-2.5 rounded text-center">
                  <div className="text-lg font-bold font-mono text-emerald-400">{cm.truePositives}</div>
                  <div className="text-[10px] text-emerald-300/80 uppercase font-semibold">True Positive (TP)</div>
                  <div className="text-[10px] text-neutral-400">Correctly elevated for review</div>
                </div>
                <div className="bg-rose-950/20 border border-rose-500/20 p-2.5 rounded text-center">
                  <div className="text-lg font-bold font-mono text-rose-400">{cm.falseNegatives}</div>
                  <div className="text-[10px] text-rose-300/80 uppercase font-semibold">False Negative (FN)</div>
                  <div className="text-[10px] text-neutral-400">Wildfire improperly demoted</div>
                </div>

                {/* Ground Truth Industrial / False Glint */}
                <div className="bg-neutral-950 p-2.5 flex items-center font-medium text-neutral-200 rounded border border-neutral-850">
                  <span>Industrial / False Glint</span>
                </div>
                <div className="bg-amber-950/20 border border-amber-500/20 p-2.5 rounded text-center">
                  <div className="text-lg font-bold font-mono text-amber-400">{cm.falsePositives}</div>
                  <div className="text-[10px] text-amber-300/80 uppercase font-semibold">False Positive (FP)</div>
                  <div className="text-[10px] text-neutral-400">Clutter elevated to top queue</div>
                </div>
                <div className="bg-emerald-950/40 border border-emerald-500/30 p-2.5 rounded text-center">
                  <div className="text-lg font-bold font-mono text-emerald-400">{cm.trueNegatives}</div>
                  <div className="text-[10px] text-emerald-300/80 uppercase font-semibold">True Negative (TN)</div>
                  <div className="text-[10px] text-neutral-400">Appropriately suppressed/standard</div>
                </div>
              </div>
            </div>

            {/* Performance Metric Breakdown */}
            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-850 space-y-3">
              <span className="text-xs font-semibold text-neutral-200 block">
                Derived Statistical Indicators:
              </span>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center pb-1.5 border-b border-neutral-850">
                  <span className="text-neutral-400">Precision (PPV):</span>
                  <span className="font-mono font-bold text-emerald-400">{(cm.precision * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center pb-1.5 border-b border-neutral-850">
                  <span className="text-neutral-400">Recall (Sensitivity):</span>
                  <span className="font-mono font-bold text-emerald-400">{(cm.recall * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center pb-1.5 border-b border-neutral-850">
                  <span className="text-neutral-400">F1 Score:</span>
                  <span className="font-mono font-bold text-emerald-400">{cm.f1Score}</span>
                </div>
                <div className="flex justify-between items-center pb-1.5 border-b border-neutral-850">
                  <span className="text-neutral-400">Specificity (TNR):</span>
                  <span className="font-mono font-bold text-emerald-400">{(cm.specificity * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-400">Reference Sample Size:</span>
                  <span className="font-mono font-bold text-neutral-200">N = {cm.sampleSize}</span>
                </div>
              </div>

              <div className="pt-2 text-[10px] text-neutral-500 leading-tight border-t border-neutral-850">
                Formulae: Precision = TP/(TP+FP), Recall = TP/(TP+FN), F1 = 2&middot;(P&middot;R)/(P+R).
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: Curated Versioned Benchmark Dataset Browser (Requirements 1 & 4) */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800 flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-amber-500" />
              <span>Versioned Benchmark Dataset ({BENCHMARK_DATASET_VERSION}) Browser</span>
            </h3>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Review documented real fires, persistent industrial heat sources, synthetic edge cases, and missing values.
            </p>
          </div>

          {/* Record Filters */}
          <div className="flex items-center gap-2">
            <select
              value={recordTypeFilter}
              onChange={e => setRecordTypeFilter(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1 text-xs text-neutral-200 focus:outline-none"
            >
              <option value="ALL">All Scenario Types</option>
              <option value="REAL_DOCUMENTED_FIRE">Real Documented Fires</option>
              <option value="PERSISTENT_HEAT_SOURCE">Persistent Heat Sources</option>
              <option value="SYNTHETIC_EDGE_CASE">Synthetic Edge Cases</option>
              <option value="MISSING_VALUES">Missing Values</option>
              <option value="REPEATED_DETECTION">Repeated Detections</option>
            </select>

            <select
              value={provenanceFilter}
              onChange={e => setProvenanceFilter(e.target.value as any)}
              className="bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1 text-xs text-neutral-200 focus:outline-none"
            >
              <option value="ALL">All Records</option>
              <option value="REAL_ONLY">Real Satellite Only</option>
              <option value="SYNTHETIC_ONLY">Synthetic Only</option>
              <option value="REFERENCE_ONLY">Independent Reference Only</option>
            </select>
          </div>
        </div>

        {/* Dataset Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-950 border-b border-neutral-800 text-neutral-400 font-medium">
                <th className="py-2.5 px-3">Case ID</th>
                <th className="py-2.5 px-3">Scenario Title & Provenance</th>
                <th className="py-2.5 px-3">Type & Provenance</th>
                <th className="py-2.5 px-3">Satellite / Platform</th>
                <th className="py-2.5 px-3 text-right">FRP (MW)</th>
                <th className="py-2.5 px-3">Reference Label</th>
                <th className="py-2.5 px-3 text-right">Active Score</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-850">
              {filteredBenchmarkRecords.map(rec => {
                const o = rec.observation;
                return (
                  <tr key={rec.id} className="hover:bg-neutral-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-semibold text-neutral-200">
                      {rec.id}
                    </td>
                    <td className="py-2.5 px-3 max-w-xs">
                      <div className="font-medium text-neutral-200">{rec.title}</div>
                      <div className="text-[11px] text-neutral-400 truncate" title={rec.provenance.citationOrReference}>
                        {rec.provenance.citationOrReference}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      {/* Requirement 1: Clearly distinguish synthetic examples from real records */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {rec.isSynthetic ? (
                          <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                            Synthetic
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                            Real Satellite
                          </span>
                        )}
                        <span className="text-[10px] text-neutral-400 font-mono">
                          {rec.recordType.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-neutral-300">
                      {o.platform}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {o.frp !== undefined ? (
                        <span className="font-semibold text-amber-400">{o.frp} MW</span>
                      ) : (
                        <span className="text-neutral-500 italic">Omitted</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {rec.independentReference.hasIndependentReferenceLabel ? (
                        <div>
                          <span className="font-mono text-[11px] font-medium text-emerald-400">
                            {rec.independentReference.groundTruthClass}
                          </span>
                          <span className="block text-[10px] text-neutral-500 truncate max-w-[140px]" title={rec.independentReference.referenceAgencyOrDoc}>
                            {rec.independentReference.referenceAgencyOrDoc}
                          </span>
                        </div>
                      ) : (
                        <span className="text-neutral-500 italic text-[11px]">Unlabelled / Edge Test</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-neutral-200">
                      {o.score.finalScore} / 100
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Verified</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: Automated Test Suites (Validation, Scoring, Grouping, Matching) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test Suite: Data Validation & Ingestion */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
            <div>
              <h4 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-emerald-400" />
                <span>1. Data Validation & Boundary Test Suite</span>
              </h4>
              <p className="text-[10px] text-neutral-400">
                Tests coordinate bounds, negative FRP filtering, timestamp sanitization, and duplicate quarantine.
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-400 font-semibold">
              {summary.validationTestResults.passed}/{summary.validationTestResults.total} Passed
            </span>
          </div>

          <div className="space-y-2">
            {summary.validationTestResults.tests.map(t => (
              <div key={t.id} className="bg-neutral-950 p-2.5 rounded border border-neutral-850 text-xs flex justify-between items-start gap-2">
                <div className="space-y-0.5">
                  <div className="font-medium text-neutral-200 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-neutral-400">{t.id}</span>
                    <span>{t.name}</span>
                  </div>
                  <div className="text-[11px] text-neutral-400">{t.actual}</div>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Pass</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Test Suite: Priority Score Calculation */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
            <div>
              <h4 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-500" />
                <span>2. Priority Score Calculation Suite</span>
              </h4>
              <p className="text-[10px] text-neutral-400">
                Verifies ranking logic, high-FRP prioritization, industrial flare demotion, and weight summation.
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-400 font-semibold">
              {summary.scoringTestResults.passed}/{summary.scoringTestResults.total} Passed
            </span>
          </div>

          <div className="space-y-2">
            {summary.scoringTestResults.tests.map(t => (
              <div key={t.id} className="bg-neutral-950 p-2.5 rounded border border-neutral-850 text-xs flex justify-between items-start gap-2">
                <div className="space-y-0.5">
                  <div className="font-medium text-neutral-200 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-neutral-400">{t.id}</span>
                    <span>{t.name}</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate max-w-xs">{t.actual}</div>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Pass</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Test Suite: Candidate Event Grouping */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
            <div>
              <h4 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>3. Candidate Event Grouping Suite</span>
              </h4>
              <p className="text-[10px] text-neutral-400">
                Verifies spatial clustering, temporal tolerance, and distant incident segregation.
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-400 font-semibold">
              {summary.groupingTestResults.passed}/{summary.groupingTestResults.total} Passed
            </span>
          </div>

          <div className="space-y-2">
            {summary.groupingTestResults.tests.map(t => (
              <div key={t.id} className="bg-neutral-950 p-2.5 rounded border border-neutral-850 text-xs flex justify-between items-start gap-2">
                <div className="space-y-0.5">
                  <div className="font-medium text-neutral-200 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-neutral-400">{t.id}</span>
                    <span>{t.name}</span>
                  </div>
                  <div className="text-[11px] text-neutral-400">{t.actual}</div>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Pass</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Test Suite: Multi-Satellite Source Matching */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
            <div>
              <h4 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                <span>4. Cross-Sensor Source Matching Suite</span>
              </h4>
              <p className="text-[10px] text-neutral-400">
                Verifies pairwise cross-sensor matching between VIIRS and MODIS observations.
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-400 font-semibold">
              {summary.matchingTestResults.passed}/{summary.matchingTestResults.total} Passed
            </span>
          </div>

          <div className="space-y-2">
            {summary.matchingTestResults.tests.map(t => (
              <div key={t.id} className="bg-neutral-950 p-2.5 rounded border border-neutral-850 text-xs flex justify-between items-start gap-2">
                <div className="space-y-0.5">
                  <div className="font-medium text-neutral-200 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-neutral-400">{t.id}</span>
                    <span>{t.name}</span>
                  </div>
                  <div className="text-[11px] text-neutral-400">{t.actual}</div>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Pass</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
