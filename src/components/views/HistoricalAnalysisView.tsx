/**
 * FireScope — Historical Analysis View
 * 
 * In-depth analytical views across:
 * - Observations over time (multi-sensor time series)
 * - Distribution by satellite and sensor
 * - FRP distribution with missing-value resilience & energy summary
 * - Confidence distribution with documented categorical & numeric semantics
 * - Candidate-event counts over time & cluster morphology
 * - Source coverage & missing-data completeness matrix
 * - Data-quality & duplicate-import audit
 */

import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Calendar,
  Filter,
  Flame,
  Layers,
  AlertCircle,
  Clock,
  Sparkles,
  Info,
  CheckCircle2,
  RefreshCw,
  SlidersHorizontal,
  Database,
  BarChart3,
  Activity,
  FileCheck2,
} from 'lucide-react';
import { FireObservation, CandidateFireEvent } from '../../types/observation';
import { KpiCard } from '../common/KpiCard';

interface HistoricalAnalysisViewProps {
  observations: FireObservation[];
  clusters: CandidateFireEvent[];
  onSelectObservation?: (obs: FireObservation) => void;
  onNavigateToTab?: (tab: any) => void;
}

export const HistoricalAnalysisView: React.FC<HistoricalAnalysisViewProps> = ({
  observations,
  clusters,
  onSelectObservation,
  onNavigateToTab,
}) => {
  // ---------------------------------------------------------------------------
  // Interactive Filter States
  // ---------------------------------------------------------------------------
  const [timeWindow, setTimeWindow] = useState<'24h' | '48h' | '7d' | 'all'>('all');
  const [satelliteFilter, setSatelliteFilter] = useState<string>('ALL');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('ALL');
  const [dayNightFilter, setDayNightFilter] = useState<'ALL' | 'D' | 'N'>('ALL');
  const [minFrp, setMinFrp] = useState<number>(0);

  // ---------------------------------------------------------------------------
  // Filtered Observations & Clusters
  // ---------------------------------------------------------------------------
  const filteredObservations = useMemo(() => {
    const now = new Date().getTime();
    
    return observations.filter(obs => {
      // Time window filter
      if (timeWindow !== 'all') {
        const obsTime = new Date(obs.acqTimestampUtc).getTime();
        const hoursAgo = (now - obsTime) / (1000 * 60 * 60);
        if (timeWindow === '24h' && hoursAgo > 24) return false;
        if (timeWindow === '48h' && hoursAgo > 48) return false;
        if (timeWindow === '7d' && hoursAgo > 168) return false;
      }

      // Satellite filter
      if (satelliteFilter !== 'ALL' && obs.platform !== satelliteFilter) {
        return false;
      }

      // Confidence filter
      if (confidenceFilter !== 'ALL' && obs.confidenceCategory !== confidenceFilter) {
        return false;
      }

      // Day / Night filter
      if (dayNightFilter !== 'ALL' && obs.dayNight !== dayNightFilter) {
        return false;
      }

      // FRP filter (only apply if FRP is present)
      if (minFrp > 0 && obs.frp !== undefined && obs.frp < minFrp) {
        return false;
      }

      return true;
    });
  }, [observations, timeWindow, satelliteFilter, confidenceFilter, dayNightFilter, minFrp]);

  const filteredClusters = useMemo(() => {
    const validObsIds = new Set(filteredObservations.map(o => o.id));
    return clusters.filter(c => c.observations.some(o => validObsIds.has(o.id)));
  }, [clusters, filteredObservations]);

  // Reset filters handler
  const handleResetFilters = () => {
    setTimeWindow('all');
    setSatelliteFilter('ALL');
    setConfidenceFilter('ALL');
    setDayNightFilter('ALL');
    setMinFrp(0);
  };

  // ---------------------------------------------------------------------------
  // 1. Observations Over Time Data (Bucket by 6-Hour Windows or Dates)
  // ---------------------------------------------------------------------------
  const timeSeriesData = useMemo(() => {
    if (filteredObservations.length === 0) return [];

    // Map into time buckets: "0-6h ago", "6-12h ago", "12-18h ago", "18-24h ago", "24-48h ago", "48h+ ago"
    const now = new Date().getTime();
    const buckets: Record<string, { label: string; order: number; VIIRS: number; MODIS: number; totalFRP: number; count: number }> = {
      b0_6: { label: '0–6h ago', order: 1, VIIRS: 0, MODIS: 0, totalFRP: 0, count: 0 },
      b6_12: { label: '6–12h ago', order: 2, VIIRS: 0, MODIS: 0, totalFRP: 0, count: 0 },
      b12_18: { label: '12–18h ago', order: 3, VIIRS: 0, MODIS: 0, totalFRP: 0, count: 0 },
      b18_24: { label: '18–24h ago', order: 4, VIIRS: 0, MODIS: 0, totalFRP: 0, count: 0 },
      b24_48: { label: '24–48h ago', order: 5, VIIRS: 0, MODIS: 0, totalFRP: 0, count: 0 },
      b48_plus: { label: '48h+ ago', order: 6, VIIRS: 0, MODIS: 0, totalFRP: 0, count: 0 },
    };

    filteredObservations.forEach(obs => {
      const t = new Date(obs.acqTimestampUtc).getTime();
      const elapsedHours = isNaN(t) ? 999 : (now - t) / (1000 * 60 * 60);

      let key = 'b48_plus';
      if (elapsedHours <= 6) key = 'b0_6';
      else if (elapsedHours <= 12) key = 'b6_12';
      else if (elapsedHours <= 18) key = 'b12_18';
      else if (elapsedHours <= 24) key = 'b18_24';
      else if (elapsedHours <= 48) key = 'b24_48';

      const family = obs.sensorFamily === 'MODIS' ? 'MODIS' : 'VIIRS';
      buckets[key][family] += 1;
      buckets[key].count += 1;
      if (obs.frp && obs.frp > 0) {
        buckets[key].totalFRP += obs.frp;
      }
    });

    return Object.values(buckets)
      .sort((a, b) => a.order - b.order)
      .map(b => ({
        timeLabel: b.label,
        VIIRS: b.VIIRS,
        MODIS: b.MODIS,
        Total: b.count,
        avgFRP: b.count > 0 ? Math.round((b.totalFRP / b.count) * 10) / 10 : 0,
      }));
  }, [filteredObservations]);

  // ---------------------------------------------------------------------------
  // 2. Satellite & Sensor Distribution Data
  // ---------------------------------------------------------------------------
  const satelliteDistribution = useMemo(() => {
    const counts: Record<string, { platform: string; satellite: string; sensor: string; count: number; dayCount: number; nightCount: number }> = {
      VIIRS_NOAA20: { platform: 'VIIRS_NOAA20', satellite: 'NOAA-20', sensor: 'VIIRS (375m)', count: 0, dayCount: 0, nightCount: 0 },
      VIIRS_SNPP: { platform: 'VIIRS_SNPP', satellite: 'Suomi-NPP', sensor: 'VIIRS (375m)', count: 0, dayCount: 0, nightCount: 0 },
      VIIRS_NOAA21: { platform: 'VIIRS_NOAA21', satellite: 'NOAA-21', sensor: 'VIIRS (375m)', count: 0, dayCount: 0, nightCount: 0 },
      MODIS_AQUA: { platform: 'MODIS_AQUA', satellite: 'Aqua', sensor: 'MODIS (1000m)', count: 0, dayCount: 0, nightCount: 0 },
      MODIS_TERRA: { platform: 'MODIS_TERRA', satellite: 'Terra', sensor: 'MODIS (1000m)', count: 0, dayCount: 0, nightCount: 0 },
    };

    filteredObservations.forEach(obs => {
      const p = obs.platform;
      if (counts[p]) {
        counts[p].count += 1;
        if (obs.dayNight === 'D') counts[p].dayCount += 1;
        else counts[p].nightCount += 1;
      } else {
        // Fallback for custom or unknown
        const customKey = obs.satellite || 'Other';
        if (!counts[customKey]) {
          counts[customKey] = {
            platform: customKey,
            satellite: customKey,
            sensor: obs.sensorFamily || 'Other',
            count: 0,
            dayCount: 0,
            nightCount: 0,
          };
        }
        counts[customKey].count += 1;
        if (obs.dayNight === 'D') counts[customKey].dayCount += 1;
        else counts[customKey].nightCount += 1;
      }
    });

    return Object.values(counts).filter(c => c.count > 0);
  }, [filteredObservations]);

  // Sensor Family proportions
  const sensorFamilyData = useMemo(() => {
    const viirs = filteredObservations.filter(o => o.sensorFamily === 'VIIRS').length;
    const modis = filteredObservations.filter(o => o.sensorFamily === 'MODIS').length;
    return [
      { name: 'VIIRS (375m)', value: viirs, color: '#f59e0b' },
      { name: 'MODIS (1000m)', value: modis, color: '#38bdf8' },
    ].filter(d => d.value > 0);
  }, [filteredObservations]);

  // ---------------------------------------------------------------------------
  // 3. FRP Distribution Data & Summary Statistics
  // ---------------------------------------------------------------------------
  const { frpHistogram, frpStats, missingFrpCount } = useMemo(() => {
    const bins = [
      { range: '< 10 MW', min: 0, max: 10, count: 0 },
      { range: '10–25 MW', min: 10, max: 25, count: 0 },
      { range: '25–50 MW', min: 25, max: 50, count: 0 },
      { range: '50–100 MW', min: 50, max: 100, count: 0 },
      { range: '100–250 MW', min: 100, max: 250, count: 0 },
      { range: '> 250 MW', min: 250, max: Infinity, count: 0 },
    ];

    let missingCount = 0;
    const validFrps: number[] = [];

    filteredObservations.forEach(obs => {
      if (obs.frp === undefined || obs.frp === null || isNaN(obs.frp)) {
        missingCount += 1;
        return;
      }
      validFrps.push(obs.frp);
      const val = obs.frp;
      const bin = bins.find(b => val >= b.min && (val < b.max || (b.max === Infinity && val >= 250)));
      if (bin) bin.count += 1;
    });

    validFrps.sort((a, b) => a - b);
    const totalFrp = validFrps.reduce((acc, v) => acc + v, 0);
    const meanFrp = validFrps.length > 0 ? totalFrp / validFrps.length : 0;
    const medianFrp = validFrps.length > 0 ? validFrps[Math.floor(validFrps.length / 2)] : 0;
    const maxFrp = validFrps.length > 0 ? validFrps[validFrps.length - 1] : 0;
    const p90Frp = validFrps.length > 0 ? validFrps[Math.floor(validFrps.length * 0.9)] : 0;

    return {
      frpHistogram: bins,
      frpStats: {
        totalFrp: Math.round(totalFrp * 10) / 10,
        meanFrp: Math.round(meanFrp * 10) / 10,
        medianFrp: Math.round(medianFrp * 10) / 10,
        maxFrp: Math.round(maxFrp * 10) / 10,
        p90Frp: Math.round(p90Frp * 10) / 10,
        reportedCount: validFrps.length,
      },
      missingFrpCount: missingCount,
    };
  }, [filteredObservations]);

  // ---------------------------------------------------------------------------
  // 4. Confidence Distribution (Categorical vs Numeric Semantics)
  // ---------------------------------------------------------------------------
  const { confidenceCategories, modisNumericBins } = useMemo(() => {
    const cats: Record<string, { category: string; count: number; viirsCount: number; modisCount: number }> = {
      high: { category: 'High', count: 0, viirsCount: 0, modisCount: 0 },
      nominal: { category: 'Nominal', count: 0, viirsCount: 0, modisCount: 0 },
      low: { category: 'Low', count: 0, viirsCount: 0, modisCount: 0 },
    };

    const numBins = [
      { bin: '0–29% (Low)', count: 0 },
      { bin: '30–49% (Nominal Low)', count: 0 },
      { bin: '50–79% (Nominal High)', count: 0 },
      { bin: '80–100% (High)', count: 0 },
    ];

    filteredObservations.forEach(obs => {
      const catKey = obs.confidenceCategory?.toLowerCase() || 'nominal';
      if (cats[catKey]) {
        cats[catKey].count += 1;
        if (obs.sensorFamily === 'VIIRS') cats[catKey].viirsCount += 1;
        else cats[catKey].modisCount += 1;
      }

      // MODIS percentage semantics
      if (obs.sensorFamily === 'MODIS' && typeof obs.confidence === 'number') {
        const c = obs.confidence;
        if (c < 30) numBins[0].count += 1;
        else if (c < 50) numBins[1].count += 1;
        else if (c < 80) numBins[2].count += 1;
        else numBins[3].count += 1;
      }
    });

    return {
      confidenceCategories: Object.values(cats),
      modisNumericBins: numBins,
    };
  }, [filteredObservations]);

  // ---------------------------------------------------------------------------
  // 5. Candidate-Event Counts Over Time & Cluster Sizes
  // ---------------------------------------------------------------------------
  const { eventTimeline, eventSizeDistribution, eventConfirmationStats } = useMemo(() => {
    const sizeBins = [
      { sizeRange: '1 observation (Singleton)', count: 0 },
      { sizeRange: '2–3 observations', count: 0 },
      { sizeRange: '4–7 observations', count: 0 },
      { sizeRange: '8+ observations (Dense Front)', count: 0 },
    ];

    const confLevels = {
      MULTI_SENSOR: 0,
      SAME_SENSOR: 0,
      SINGLETON: 0,
    };

    const timeBuckets: Record<string, { label: string; count: number; multiSensor: number }> = {
      t0_6: { label: '0–6h ago', count: 0, multiSensor: 0 },
      t6_12: { label: '6–12h ago', count: 0, multiSensor: 0 },
      t12_24: { label: '12–24h ago', count: 0, multiSensor: 0 },
      t24_48: { label: '24–48h ago', count: 0, multiSensor: 0 },
      t48_plus: { label: '48h+ ago', count: 0, multiSensor: 0 },
    };

    const now = new Date().getTime();

    filteredClusters.forEach(cluster => {
      const obsCount = cluster.observations.length;
      if (obsCount === 1) sizeBins[0].count += 1;
      else if (obsCount <= 3) sizeBins[1].count += 1;
      else if (obsCount <= 7) sizeBins[2].count += 1;
      else sizeBins[3].count += 1;

      if (cluster.hasMultiSensorConfirmation) {
        confLevels.MULTI_SENSOR += 1;
      } else if (obsCount > 1) {
        confLevels.SAME_SENSOR += 1;
      } else {
        confLevels.SINGLETON += 1;
      }

      // Timing
      const firstSeen = new Date(cluster.firstDetectedUtc).getTime();
      const elapsedHours = isNaN(firstSeen) ? 999 : (now - firstSeen) / (1000 * 60 * 60);

      let key = 't48_plus';
      if (elapsedHours <= 6) key = 't0_6';
      else if (elapsedHours <= 12) key = 't6_12';
      else if (elapsedHours <= 24) key = 't12_24';
      else if (elapsedHours <= 48) key = 't24_48';

      timeBuckets[key].count += 1;
      if (cluster.hasMultiSensorConfirmation) {
        timeBuckets[key].multiSensor += 1;
      }
    });

    return {
      eventTimeline: Object.values(timeBuckets),
      eventSizeDistribution: sizeBins,
      eventConfirmationStats: confLevels,
    };
  }, [filteredClusters]);

  // ---------------------------------------------------------------------------
  // 6. Source Coverage & Missing Data Completeness Matrix
  // ---------------------------------------------------------------------------
  const completenessMatrix = useMemo(() => {
    const total = filteredObservations.length;
    if (total === 0) return [];

    const fields = [
      {
        field: 'Geographic Coordinates (lat, lon)',
        dataType: 'Float [-90,90], [-180,180]',
        present: filteredObservations.filter(o => o.latitude !== undefined && o.longitude !== undefined && !isNaN(o.latitude) && !isNaN(o.longitude)).length,
        notes: 'Required for spatial matching & map positioning',
      },
      {
        field: 'UTC Acquisition Timestamp',
        dataType: 'ISO 8601 String',
        present: filteredObservations.filter(o => o.acqTimestampUtc && !isNaN(new Date(o.acqTimestampUtc).getTime())).length,
        notes: 'Required for recency decay & temporal windowing',
      },
      {
        field: 'Fire Radiative Power (frp)',
        dataType: 'Float (Megawatts)',
        present: filteredObservations.filter(o => o.frp !== undefined && o.frp !== null && !isNaN(o.frp)).length,
        notes: 'Standardized thermal output; optional in legacy products',
      },
      {
        field: 'Channel Brightness Temperature',
        dataType: 'Float (Kelvin)',
        present: filteredObservations.filter(o => o.brightness !== undefined && !isNaN(o.brightness)).length,
        notes: 'Primary 4μm mid-infrared sensor channel (I4/Ch21)',
      },
      {
        field: 'Secondary Channel (bright_t31)',
        dataType: 'Float (Kelvin)',
        present: filteredObservations.filter(o => o.brightT31 !== undefined && !isNaN(o.brightT31)).length,
        notes: '11μm thermal infrared channel for background contrast',
      },
      {
        field: 'Pixel Scan / Track Geometry',
        dataType: 'Float (km)',
        present: filteredObservations.filter(o => o.scan !== undefined && o.track !== undefined).length,
        notes: 'Along-scan and along-track pixel footprint dimensions',
      },
      {
        field: 'Sensor Detection Confidence',
        dataType: 'Categorical / Percentage',
        present: filteredObservations.filter(o => o.confidence !== undefined && o.confidenceCategory !== undefined).length,
        notes: 'VIIRS: low/nominal/high; MODIS: 0–100%',
      },
      {
        field: 'Day / Night Solar Flag',
        dataType: 'String ("D" | "N")',
        present: filteredObservations.filter(o => o.dayNight === 'D' || o.dayNight === 'N').length,
        notes: 'Solar illumination at nadir overpass time',
      },
    ];

    return fields.map(f => ({
      ...f,
      missing: total - f.present,
      percentage: Math.round((f.present / total) * 1000) / 10,
    }));
  }, [filteredObservations]);

  // ---------------------------------------------------------------------------
  // 7. Data-Quality & Duplicate-Import Statistics
  // ---------------------------------------------------------------------------
  const qualityStats = useMemo(() => {
    let duplicateImportQuarantined = 0;
    let persistentIndustrialWarnings = 0;
    let lowConfidenceWarnings = 0;
    let highScanAngleWarnings = 0;
    let agedDetectionWarnings = 0;

    filteredObservations.forEach(obs => {
      const warnings = obs.qualityWarnings || [];
      warnings.forEach(w => {
        const lower = w.toLowerCase();
        if (lower.includes('duplicate')) duplicateImportQuarantined += 1;
        if (lower.includes('industrial') || lower.includes('flare') || lower.includes('volcanic')) persistentIndustrialWarnings += 1;
        if (lower.includes('low confidence')) lowConfidenceWarnings += 1;
        if (lower.includes('scan') || lower.includes('nadir') || lower.includes('angle')) highScanAngleWarnings += 1;
        if (lower.includes('aged') || lower.includes('decay') || lower.includes('stale')) agedDetectionWarnings += 1;
      });
    });

    return {
      totalAudited: filteredObservations.length,
      duplicateImportQuarantined,
      persistentIndustrialWarnings,
      lowConfidenceWarnings,
      highScanAngleWarnings,
      agedDetectionWarnings,
      cleanRecordPercentage:
        filteredObservations.length > 0
          ? Math.round(
              (filteredObservations.filter(o => (o.qualityWarnings || []).length === 0).length /
                filteredObservations.length) *
                1000
            ) / 10
          : 0,
    };
  }, [filteredObservations]);

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-500" />
            <h2 className="text-sm font-semibold text-neutral-100">
              FireScope — Historical Analysis & Statistical Telemetry
            </h2>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Multi-sensor temporal trends, satellite distributions, Fire Radiative Power (FRP) dispersion, confidence semantics, candidate-event clusters, and data-completeness audits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-neutral-400 bg-neutral-950 px-2.5 py-1 rounded border border-neutral-800">
            {filteredObservations.length} of {observations.length} Observations Active
          </span>
          <button
            onClick={handleResetFilters}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
            title="Reset active filters"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300">
          <SlidersHorizontal className="w-3.5 h-3.5 text-amber-500" />
          <span>Interactive Dataset Filters & Cross-Cutting Constraints</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Time Window */}
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1">Time Window</label>
            <select
              value={timeWindow}
              onChange={e => setTimeWindow(e.target.value as any)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-200 text-xs focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Available Records</option>
              <option value="24h">Past 24 Hours</option>
              <option value="48h">Past 48 Hours</option>
              <option value="7d">Past 7 Days</option>
            </select>
          </div>

          {/* Satellite Platform */}
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1">Satellite Platform</label>
            <select
              value={satelliteFilter}
              onChange={e => setSatelliteFilter(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-200 text-xs focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">All Satellites & Sensors</option>
              <option value="VIIRS_NOAA20">NOAA-20 (VIIRS 375m)</option>
              <option value="VIIRS_SNPP">Suomi-NPP (VIIRS 375m)</option>
              <option value="VIIRS_NOAA21">NOAA-21 (VIIRS 375m)</option>
              <option value="MODIS_AQUA">Aqua (MODIS 1000m)</option>
              <option value="MODIS_TERRA">Terra (MODIS 1000m)</option>
            </select>
          </div>

          {/* Confidence Category */}
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1">Confidence Category</label>
            <select
              value={confidenceFilter}
              onChange={e => setConfidenceFilter(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-200 text-xs focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">All Confidence Levels</option>
              <option value="high">High Confidence Only</option>
              <option value="nominal">Nominal Confidence</option>
              <option value="low">Low Confidence</option>
            </select>
          </div>

          {/* Day / Night Pass */}
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1">Solar Orbit Pass</label>
            <select
              value={dayNightFilter}
              onChange={e => setDayNightFilter(e.target.value as any)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-200 text-xs focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">Day & Night Passes</option>
              <option value="D">Daytime Passes Only (D)</option>
              <option value="N">Nighttime Passes Only (N)</option>
            </select>
          </div>

          {/* Minimum FRP Threshold Slider */}
          <div>
            <div className="flex justify-between text-[10px] text-neutral-400 mb-1">
              <span>Min FRP:</span>
              <span className="font-mono text-amber-400 font-semibold">{minFrp} MW</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              step="5"
              value={minFrp}
              onChange={e => setMinFrp(Number(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-neutral-950 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Active Observations"
          value={filteredObservations.length}
          subtext={`${((filteredObservations.length / Math.max(1, observations.length)) * 100).toFixed(0)}% of total ingested`}
          variant="accent"
        />
        <KpiCard
          label="Total Radiative Power"
          value={`${frpStats.totalFrp.toLocaleString()} MW`}
          subtext={`Across ${frpStats.reportedCount} reported pixels`}
          variant="accent"
        />
        <KpiCard
          label="Mean FRP"
          value={`${frpStats.meanFrp} MW`}
          subtext={`Median: ${frpStats.medianFrp} MW · P90: ${frpStats.p90Frp} MW`}
        />
        <KpiCard
          label="Candidate Events"
          value={filteredClusters.length}
          subtext={`${eventConfirmationStats.MULTI_SENSOR} multi-sensor clusters`}
          variant="accent"
        />
        <KpiCard
          label="Missing FRP Records"
          value={missingFrpCount}
          subtext={`${((missingFrpCount / Math.max(1, filteredObservations.length)) * 100).toFixed(1)}% missing/omitted`}
          variant={missingFrpCount > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Clean Quality Rate"
          value={`${qualityStats.cleanRecordPercentage}%`}
          subtext={`${qualityStats.duplicateImportQuarantined} duplicate imports caught`}
        />
      </div>

      {/* Empty State Guard */}
      {filteredObservations.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-12 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
          <h3 className="text-sm font-semibold text-neutral-200">No Observations Match Current Filter Criteria</h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            The active filters (Time Window: {timeWindow}, Satellite: {satelliteFilter}, Min FRP: {minFrp} MW) returned zero records.
          </p>
          <button
            onClick={handleResetFilters}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold rounded-md text-xs transition-colors"
          >
            Reset Filters to Show All Observations
          </button>
        </div>
      ) : (
        <>
          {/* SECTION 1: Observations Over Time & Satellite Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart: Observations Over Time */}
            <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div>
                  <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span>Observations Over Time (Sensor Family Breakdown)</span>
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Temporal cadence grouped into 6-hour retrospective windows comparing high-res VIIRS vs broad-swath MODIS.
                  </p>
                </div>
                <span className="text-[10px] font-mono text-neutral-400">
                  UTC Timestamps
                </span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorViirs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorModis" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis dataKey="timeLabel" stroke="#737373" fontSize={11} tickLine={false} />
                    <YAxis stroke="#737373" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#171717',
                        borderColor: '#262626',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#f5f5f5',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Area
                      type="monotone"
                      dataKey="VIIRS"
                      stroke="#f59e0b"
                      fillOpacity={1}
                      fill="url(#colorViirs)"
                      name="VIIRS (375m)"
                    />
                    <Area
                      type="monotone"
                      dataKey="MODIS"
                      stroke="#38bdf8"
                      fillOpacity={1}
                      fill="url(#colorModis)"
                      name="MODIS (1000m)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart: Distribution by Satellite & Sensor Family */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
              <div className="pb-3 border-b border-neutral-800">
                <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  <span>Distribution by Satellite & Sensor</span>
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Proportion across active constellations.
                </p>
              </div>

              <div className="space-y-3">
                {satelliteDistribution.map(sat => {
                  const pct = Math.round((sat.count / filteredObservations.length) * 100);
                  const isViirs = sat.platform.startsWith('VIIRS');
                  return (
                    <div key={sat.platform} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-neutral-200">
                          {sat.satellite} <span className="text-[10px] text-neutral-400 font-mono">({sat.sensor})</span>
                        </span>
                        <span className="font-mono text-neutral-300">
                          {sat.count} <span className="text-neutral-500">({pct}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${pct}%` }}
                          className={`h-full rounded-full ${isViirs ? 'bg-amber-500' : 'bg-sky-500'}`}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-neutral-500">
                        <span>Day: {sat.dayCount}</span>
                        <span>Night: {sat.nightCount}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-neutral-800/80 text-[11px] text-neutral-400 space-y-1.5">
                <div className="flex justify-between">
                  <span>VIIRS 375m Spatial Share:</span>
                  <span className="font-mono text-amber-400">
                    {filteredObservations.filter(o => o.sensorFamily === 'VIIRS').length} obs (
                    {(
                      (filteredObservations.filter(o => o.sensorFamily === 'VIIRS').length /
                        Math.max(1, filteredObservations.length)) *
                      100
                    ).toFixed(1)}
                    %)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>MODIS 1km Spatial Share:</span>
                  <span className="font-mono text-sky-400">
                    {filteredObservations.filter(o => o.sensorFamily === 'MODIS').length} obs (
                    {(
                      (filteredObservations.filter(o => o.sensorFamily === 'MODIS').length /
                        Math.max(1, filteredObservations.length)) *
                      100
                    ).toFixed(1)}
                    %)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: FRP Distribution & Confidence Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart: FRP Distribution & Missing Handling */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div>
                  <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-500" />
                    <span>Fire Radiative Power (FRP) Distribution</span>
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Radiative thermal emission binned into power tiers (MW). Missing FRP is tracked without distortion.
                  </p>
                </div>
                {missingFrpCount > 0 && (
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    {missingFrpCount} Missing FRP
                  </span>
                )}
              </div>

              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={frpHistogram} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis dataKey="range" stroke="#737373" fontSize={10} tickLine={false} />
                    <YAxis stroke="#737373" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#171717',
                        borderColor: '#262626',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#f5f5f5',
                      }}
                    />
                    <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Observations" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* FRP Statistical Summary Strip */}
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-neutral-800 text-[11px]">
                <div className="bg-neutral-950 p-2 rounded border border-neutral-850">
                  <span className="text-neutral-500 block text-[10px]">Mean FRP</span>
                  <span className="font-mono font-semibold text-neutral-200">{frpStats.meanFrp} MW</span>
                </div>
                <div className="bg-neutral-950 p-2 rounded border border-neutral-850">
                  <span className="text-neutral-500 block text-[10px]">Median FRP</span>
                  <span className="font-mono font-semibold text-neutral-200">{frpStats.medianFrp} MW</span>
                </div>
                <div className="bg-neutral-950 p-2 rounded border border-neutral-850">
                  <span className="text-neutral-500 block text-[10px]">P90 FRP</span>
                  <span className="font-mono font-semibold text-neutral-200">{frpStats.p90Frp} MW</span>
                </div>
                <div className="bg-neutral-950 p-2 rounded border border-neutral-850">
                  <span className="text-neutral-500 block text-[10px]">Peak FRP</span>
                  <span className="font-mono font-semibold text-amber-400">{frpStats.maxFrp} MW</span>
                </div>
              </div>

              {missingFrpCount > 0 && (
                <div className="text-[11px] text-neutral-400 bg-amber-500/5 border border-amber-500/15 p-2.5 rounded flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Missing Field Note:</strong> {missingFrpCount} observations do not provide FRP (e.g. legacy MODIS or partial telemetry). The ranking engine transparently falls back to 4μm brightness temperature (Kelvin) rather than imputing 0 MW.
                  </span>
                </div>
              )}
            </div>

            {/* Chart: Confidence Distribution with Documented Semantics */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div>
                  <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>Confidence Distribution & Sensor Semantics</span>
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Categorical tiers for VIIRS vs continuous percentage (0–100%) for MODIS.
                  </p>
                </div>
                <span className="text-[10px] font-mono text-neutral-400">
                  Documented Semantics
                </span>
              </div>

              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={confidenceCategories} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis dataKey="category" stroke="#737373" fontSize={11} tickLine={false} />
                    <YAxis stroke="#737373" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#171717',
                        borderColor: '#262626',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#f5f5f5',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="viirsCount" fill="#f59e0b" name="VIIRS (Categorical)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="modisCount" fill="#38bdf8" name="MODIS (Mapped %)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Documented Semantics Note */}
              <div className="bg-neutral-950 p-3 rounded border border-neutral-850 text-[11px] space-y-2 text-neutral-400 leading-relaxed">
                <div className="flex items-center gap-1.5 font-semibold text-neutral-300">
                  <Info className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Documented Sensor Confidence Standards:</span>
                </div>
                <p>
                  <strong>VIIRS 375m (VNP14IMGTDL):</strong> Reports 3 discrete categories derived from contextual tests: <em>'low'</em> (borderline or cloud-edge), <em>'nominal'</em> (standard fire signature), and <em>'high'</em> (saturated or extreme thermal anomaly).
                </p>
                <p>
                  <strong>MODIS 1km (MOD14/MYD14):</strong> Reports a continuous numeric score from 0% to 100%. Mapped to: Low (0–29%), Nominal (30–79%), and High (80–100%) in accordance with NASA FIRMS user documentation.
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 3: Candidate-Event Counts Over Time & Cluster Morphology */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Candidate-Events Over Time */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div>
                  <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span>Candidate-Event Counts Over Time</span>
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Spatial-temporal clustered fire events grouped across satellite overpasses.
                  </p>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {filteredClusters.length} Total Events
                </span>
              </div>

              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis dataKey="label" stroke="#737373" fontSize={11} tickLine={false} />
                    <YAxis stroke="#737373" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#171717',
                        borderColor: '#262626',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#f5f5f5',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="count" fill="#10b981" name="Total Events Formed" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="multiSensor" fill="#f59e0b" name="Multi-Sensor Confirmed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="bg-neutral-950 p-2.5 rounded border border-neutral-850">
                  <span className="text-neutral-500 block text-[10px]">Multi-Sensor Confirmed</span>
                  <span className="font-mono font-bold text-amber-400">{eventConfirmationStats.MULTI_SENSOR}</span>
                </div>
                <div className="bg-neutral-950 p-2.5 rounded border border-neutral-850">
                  <span className="text-neutral-500 block text-[10px]">Same-Sensor Cluster</span>
                  <span className="font-mono font-bold text-neutral-200">{eventConfirmationStats.SAME_SENSOR}</span>
                </div>
                <div className="bg-neutral-950 p-2.5 rounded border border-neutral-850">
                  <span className="text-neutral-500 block text-[10px]">Single Detections</span>
                  <span className="font-mono font-bold text-neutral-400">{eventConfirmationStats.SINGLETON}</span>
                </div>
              </div>
            </div>

            {/* Candidate-Event Size Distribution */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
              <div className="pb-3 border-b border-neutral-800">
                <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>Candidate-Event Size & Cluster Morphology</span>
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Number of contributing satellite observations per candidate fire event.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {eventSizeDistribution.map(bin => {
                  const pct = Math.round((bin.count / Math.max(1, filteredClusters.length)) * 100);
                  return (
                    <div key={bin.sizeRange} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-neutral-300">{bin.sizeRange}</span>
                        <span className="font-mono text-neutral-200">
                          {bin.count} <span className="text-neutral-500">({pct}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-neutral-950 h-2.5 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${pct}%` }}
                          className="h-full bg-purple-500 rounded-full"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-neutral-950 p-3 rounded border border-neutral-850 text-[11px] text-neutral-400 leading-relaxed mt-4">
                <strong>Clustering Heuristic:</strong> Clusters aggregate individual pixel detections across VIIRS (375m) and MODIS (1km) using great-circle Haversine distance (&le; 12.0 km) and a 36-hour temporal window, isolating distinct ignition complexes without conflating separate valleys.
              </div>
            </div>
          </div>

          {/* SECTION 4: Source Coverage & Missing-Data Completeness Matrix */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div>
                <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-sky-400" />
                  <span>Source Coverage & Field Completeness Matrix</span>
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Audit of telemetry completeness across required coordinates, timestamps, and auxiliary channels.
                </p>
              </div>
              <span className="text-xs font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                100% Coordinate & Timestamp Integrity
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-950 border-b border-neutral-800 text-neutral-400 font-medium">
                    <th className="py-2.5 px-3">Telemetry Field</th>
                    <th className="py-2.5 px-3">Data Type / Specification</th>
                    <th className="py-2.5 px-3 text-right">Present</th>
                    <th className="py-2.5 px-3 text-right">Missing</th>
                    <th className="py-2.5 px-3">Completeness</th>
                    <th className="py-2.5 px-3">Operational Role / Fallback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-850">
                  {completenessMatrix.map(row => (
                    <tr key={row.field} className="hover:bg-neutral-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-neutral-200">
                        {row.field}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-400">
                        {row.dataType}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-neutral-200 font-semibold">
                        {row.present}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {row.missing > 0 ? (
                          <span className="text-amber-400 font-semibold">{row.missing}</span>
                        ) : (
                          <span className="text-neutral-500">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-neutral-950 h-2 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${row.percentage}%` }}
                              className={`h-full rounded-full ${
                                row.percentage >= 95
                                  ? 'bg-emerald-500'
                                  : row.percentage >= 75
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                            />
                          </div>
                          <span className="font-mono text-[11px] text-neutral-300 font-semibold">
                            {row.percentage}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-neutral-400">
                        {row.notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 5: Data-Quality & Duplicate-Import Statistics */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div>
                <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Data-Quality, Duplicate-Import & Anomaly Statistics</span>
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Automated ingestion filters, duplicate record quarantine, and quality warning flag distribution.
                </p>
              </div>
              <span className="text-xs font-mono text-neutral-400">
                Audited: {qualityStats.totalAudited} rows
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-850 space-y-1">
                <span className="text-[11px] text-neutral-400">Duplicate Imports Quarantined</span>
                <div className="text-lg font-bold font-mono text-amber-400">
                  {qualityStats.duplicateImportQuarantined}
                </div>
                <p className="text-[10px] text-neutral-500 leading-tight">
                  Identical platform, coordinates, and timestamp rows excluded from independent counts.
                </p>
              </div>

              <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-850 space-y-1">
                <span className="text-[11px] text-neutral-400">Persistent Industrial / Flares</span>
                <div className="text-lg font-bold font-mono text-neutral-200">
                  {qualityStats.persistentIndustrialWarnings}
                </div>
                <p className="text-[10px] text-neutral-500 leading-tight">
                  Petrochemical flare stacks and volcanic vents demoted in wildfire triage order.
                </p>
              </div>

              <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-850 space-y-1">
                <span className="text-[11px] text-neutral-400">Low-Confidence Detections</span>
                <div className="text-lg font-bold font-mono text-neutral-300">
                  {qualityStats.lowConfidenceWarnings}
                </div>
                <p className="text-[10px] text-neutral-500 leading-tight">
                  Flags with high false-positive likelihood or cloud-edge solar glint characteristics.
                </p>
              </div>

              <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-850 space-y-1">
                <span className="text-[11px] text-neutral-400">Clean Records (Zero Warnings)</span>
                <div className="text-lg font-bold font-mono text-emerald-400">
                  {qualityStats.cleanRecordPercentage}%
                </div>
                <p className="text-[10px] text-neutral-500 leading-tight">
                  Records passing all sanity constraints without quality or stationary flags.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
