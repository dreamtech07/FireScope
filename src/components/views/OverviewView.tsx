/**
 * FireScope — Overview Analytics Dashboard View
 */

import React from 'react';
import {
  Flame,
  Radio,
  Layers,
  Activity,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  MapPin,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import { FireObservation, CandidateFireEvent } from '../../types/observation';
import { KpiCard } from '../common/KpiCard';
import { DataSourceStatusPanel } from '../common/DataSourceStatusPanel';

interface OverviewViewProps {
  observations: FireObservation[];
  clusters: CandidateFireEvent[];
  onSelectObservation: (obs: FireObservation) => void;
  onNavigateTo: (tab: any) => void;
  dataMode?: 'SYNTHETIC_DEMO' | 'LIVE_FIRMS';
  apiOnlyMode?: boolean;
  onToggleMode?: (mode: 'synthetic' | 'api') => void;
  lastRetrievalUtc?: string;
  onRefresh?: () => void;
  onOpenFirmsQuery?: () => void;
  userApiKey?: string;
  onSaveApiKey?: (key: string) => void;
  configuredFeedLabel?: string;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  observations,
  clusters,
  onSelectObservation,
  onNavigateTo,
  dataMode = 'SYNTHETIC_DEMO',
  apiOnlyMode = false,
  onToggleMode,
  lastRetrievalUtc = new Date().toISOString(),
  onRefresh,
  onOpenFirmsQuery,
  userApiKey = '',
  onSaveApiKey,
  configuredFeedLabel,
}) => {
  // Aggregate KPIs
  const totalObs = observations.length;
  const highPriorityCount = observations.filter(o => o.score.finalScore >= 75).length;
  
  const frpValues = observations.map(o => o.frp || 0).filter(f => f > 0);
  const meanFrp = frpValues.length > 0 
    ? Math.round((frpValues.reduce((a, b) => a + b, 0) / frpValues.length) * 10) / 10 
    : 0;

  const multiSensorClusters = clusters.filter(c => c.hasMultiSensorConfirmation).length;
  const viirsCount = observations.filter(o => o.sensorFamily === 'VIIRS').length;
  const modisCount = observations.filter(o => o.sensorFamily === 'MODIS').length;

  // Chart data: Distribution by 6-hour bins
  const hourlyData = [
    { timeWindow: '0-6h ago', VIIRS: 0, MODIS: 0 },
    { timeWindow: '6-12h ago', VIIRS: 0, MODIS: 0 },
    { timeWindow: '12-24h ago', VIIRS: 0, MODIS: 0 },
    { timeWindow: '24-48h ago', VIIRS: 0, MODIS: 0 },
  ];

  const now = Date.now();
  observations.forEach(o => {
    const diffHours = (now - new Date(o.acqTimestampUtc).getTime()) / (1000 * 3600);
    let bucketIndex = 3;
    if (diffHours <= 6) bucketIndex = 0;
    else if (diffHours <= 12) bucketIndex = 1;
    else if (diffHours <= 24) bucketIndex = 2;

    if (o.sensorFamily === 'VIIRS') {
      hourlyData[bucketIndex].VIIRS++;
    } else {
      hourlyData[bucketIndex].MODIS++;
    }
  });

  // Chart data: FRP tiers
  const frpDistribution = [
    { range: '< 20 MW', count: observations.filter(o => (o.frp || 0) < 20).length },
    { range: '20-50 MW', count: observations.filter(o => (o.frp || 0) >= 20 && (o.frp || 0) < 50).length },
    { range: '50-100 MW', count: observations.filter(o => (o.frp || 0) >= 50 && (o.frp || 0) < 100).length },
    { range: '100-150 MW', count: observations.filter(o => (o.frp || 0) >= 100 && (o.frp || 0) < 150).length },
    { range: '> 150 MW', count: observations.filter(o => (o.frp || 0) >= 150).length },
  ];

  // Top 5 priority anomalies
  const topAnomalies = [...observations]
    .sort((a, b) => b.score.finalScore - a.score.finalScore)
    .slice(0, 5);

  const isLive = apiOnlyMode || dataMode === 'LIVE_FIRMS';

  return (
    <div className="space-y-6">
      {/* Operational Data-Source HUD & Coverage Status */}
      <DataSourceStatusPanel
        dataMode={dataMode}
        apiOnlyMode={apiOnlyMode}
        onToggleMode={onToggleMode}
        lastRetrievalUtc={lastRetrievalUtc}
        activeObservationCount={totalObs}
        onRefresh={onRefresh}
        onOpenQueryModal={onOpenFirmsQuery}
        userApiKey={userApiKey}
        onSaveApiKey={onSaveApiKey}
        configuredFeedLabel={configuredFeedLabel}
      />

      {/* API-Only Zero Observations Guidance Callout */}
      {totalObs === 0 && isLive && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                  <span>API Key Mode Active</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Live Feed Configured
                  </span>
                </h4>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Automated Satellite Feed: <strong>VIIRS (NOAA-20/21/SNPP 375m) & MODIS (Terra/Aqua 1km)</strong> · Geographical Envelope: <strong>India Coordinates (68.1°E to 97.4°E, 8.0°N to 37.1°N)</strong>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {onOpenFirmsQuery && (
                <button
                  onClick={onOpenFirmsQuery}
                  className="px-3.5 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-xs font-medium text-white transition-colors shadow-sm shrink-0 cursor-pointer"
                >
                  Query NASA FIRMS Live Telemetry
                </button>
              )}
              {onNavigateTo && (
                <button
                  onClick={() => onNavigateTo('fire_map')}
                  className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-750 text-xs font-medium text-neutral-200 transition-colors shrink-0 cursor-pointer"
                >
                  View India on Map
                </button>
              )}
              {onToggleMode && (
                <button
                  onClick={() => onToggleMode('synthetic')}
                  className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-750 text-xs font-medium text-neutral-200 transition-colors shrink-0 cursor-pointer"
                >
                  Switch to Synthetic Baseline
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KPI Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Total Observations"
          value={totalObs}
          subtext="Normalized satellite records"
          icon={Radio}
        />
        <KpiCard
          label="High Urgency Triage"
          value={highPriorityCount}
          subtext="Score ≥ 75 threshold"
          variant="accent"
          icon={Flame}
        />
        <KpiCard
          label="Mean Radiative Power"
          value={meanFrp}
          unit="MW"
          subtext="Active heat energy flux"
          icon={Activity}
        />
        <KpiCard
          label="Multi-Sensor Clusters"
          value={multiSensorClusters}
          subtext={`${clusters.length} total event clusters`}
          icon={Layers}
        />
        <KpiCard
          label="Sensor Distribution"
          value={`${viirsCount}/${modisCount}`}
          subtext="VIIRS / MODIS detections"
          icon={TrendingUp}
        />
      </div>

      {/* Analytical Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Temporal sensor detection cadence */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-semibold text-neutral-200">Temporal Detection Cadence</h3>
              <p className="text-[11px] text-neutral-400">Sensor acquisition frequency over time</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-400">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block"></span>VIIRS</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block"></span>MODIS</span>
            </div>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="timeWindow" stroke="#737373" fontSize={11} tickLine={false} />
                <YAxis stroke="#737373" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', borderRadius: '6px', fontSize: '12px' }}
                  labelStyle={{ color: '#f5f5f5', fontWeight: 600 }}
                />
                <Bar dataKey="VIIRS" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="MODIS" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* FRP distribution */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-semibold text-neutral-200">Fire Radiative Power (FRP) Spectrum</h3>
              <p className="text-[11px] text-neutral-400">Radiative thermal energy breakdown in Megawatts</p>
            </div>
            <button
              onClick={() => onNavigateTo('historical_analysis')}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium transition-colors"
            >
              <span>Historical Telemetry</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={frpDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="frpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="range" stroke="#737373" fontSize={11} tickLine={false} />
                <YAxis stroke="#737373" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', borderRadius: '6px', fontSize: '12px' }}
                  labelStyle={{ color: '#f5f5f5', fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#frpGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Top Urgency Queue & Active Clusters */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 5 Priority Queue snapshot */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-3">
            <div>
              <h3 className="text-xs font-semibold text-neutral-200">High-Priority Triage Queue</h3>
              <p className="text-[11px] text-neutral-400">Ranked by explainable multi-factor formula</p>
            </div>
            <button
              onClick={() => onNavigateTo('priority_queue')}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium transition-colors"
            >
              <span>View Full Queue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            {topAnomalies.map((obs, idx) => (
              <div
                key={obs.id}
                onClick={() => onSelectObservation(obs)}
                className="p-3 bg-neutral-950/70 hover:bg-neutral-800/60 border border-neutral-800/80 rounded-md cursor-pointer transition-colors flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-6 h-6 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-center text-xs font-mono font-bold text-neutral-400 shrink-0">
                    #{idx + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-neutral-200 truncate">{obs.id}</span>
                      <span className="text-[10px] text-neutral-400">·</span>
                      <span className="text-[11px] text-neutral-400 truncate">{obs.region}</span>
                    </div>
                    <div className="text-[11px] text-neutral-400 flex items-center gap-2 mt-0.5">
                      <span>{obs.platform}</span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">{obs.frp || 0} MW</span>
                      <span>·</span>
                      <span>{obs.confidence}% conf</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span className="font-mono text-sm font-bold text-amber-400">
                      {obs.score.finalScore}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono">/100</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-neutral-400" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Candidate Clusters Overview */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-3">
            <div>
              <h3 className="text-xs font-semibold text-neutral-200">Candidate Spatial-Temporal Events</h3>
              <p className="text-[11px] text-neutral-400">Grouped thermal detections within proximity</p>
            </div>
            <button
              onClick={() => onNavigateTo('satellite_comparison')}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium transition-colors"
            >
              <span>Compare Sensors</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {clusters.slice(0, 4).map(cluster => (
              <div
                key={cluster.id}
                className="p-3 bg-neutral-950/70 border border-neutral-800/80 rounded-md space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-neutral-200 truncate">{cluster.clusterName}</h4>
                  <div className="text-xs font-mono text-amber-400 font-semibold">
                    Top Score: {cluster.topPriorityScore}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-neutral-400" />
                    <span className="font-mono tabular-nums">{cluster.centroidLatitude}°, {cluster.centroidLongitude}°</span>
                  </span>
                  <span>·</span>
                  <span>{cluster.observationCount} observations</span>
                  <span>·</span>
                  <span>{cluster.estimatedSpreadRadiusKm} km radius</span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1 text-neutral-400 border-t border-neutral-850">
                  <span>Sensors: {cluster.sensorFamiliesRepresented.join(' + ')}</span>
                  <span className={cluster.hasMultiSensorConfirmation ? 'text-emerald-400 font-medium' : 'text-neutral-400'}>
                    {cluster.hasMultiSensorConfirmation ? 'Multi-Sensor Confirmed' : 'Single Sensor Only'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
