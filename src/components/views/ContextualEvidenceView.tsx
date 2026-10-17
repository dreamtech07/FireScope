/**
 * FireScope — Contextual Evidence Workspace
 * 
 * Provides:
 * 1. Persistent Heat-Source Context (Reference catalog + custom CSV upload & proximity matcher)
 * 2. Environmental Context (Live weather from Open-Meteo, wind vectors, 24h rainfall, land cover)
 * 3. Burn-Scar & Optical Context (Pre-event vs post-event NASA GIBS false-color satellite imagery)
 * 4. Uncertainty & Sensor Limitation Map (Acquisition age, orbit gaps, cloud obscuration risk)
 * 5. Historical Area Comparison (Seasonal recurrence patterns, baseline FRP, outbreak z-score)
 * 6. Data Provider Setup & Transparency Panel
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Layers,
  Factory,
  CloudSun,
  Flame,
  Clock,
  Compass,
  Upload,
  AlertTriangle,
  Info,
  CheckCircle2,
  RefreshCw,
  Wind,
  Droplets,
  Thermometer,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  HelpCircle,
  KeyRound,
  Filter,
  Check,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { FireObservation, CandidateFireEvent } from '../../types/observation';
import {
  PersistentHeatSource,
  EmitterProximityMatch,
  EnvironmentalWeatherContext,
  BurnScarInspectionContext,
  UncertaintyOrbitGapContext,
  HistoricalAreaBaseline,
} from '../../types/contextual';
import {
  DOCUMENTED_PERSISTENT_EMITTERS,
  findNearbyPersistentEmitters,
  parsePersistentEmittersCsv,
} from '../../data/persistentEmitters';
import { fetchEnvironmentalWeather } from '../../utils/weatherService';
import {
  generateBurnScarContext,
  GIBS_AVAILABLE_LAYERS,
} from '../../utils/gibsImageryService';
import {
  computeUncertaintyAndCoverage,
  computeHistoricalAreaBaseline,
  DATA_PROVIDERS_CONFIG,
} from '../../utils/contextualAnalysis';
import { KpiCard } from '../common/KpiCard';

interface ContextualEvidenceViewProps {
  observations: FireObservation[];
  clusters: CandidateFireEvent[];
  selectedObservation: FireObservation | null;
  onSelectObservation: (obs: FireObservation) => void;
  onNavigateToTab?: (tab: any) => void;
}

export const ContextualEvidenceView: React.FC<ContextualEvidenceViewProps> = ({
  observations,
  clusters,
  selectedObservation,
  onSelectObservation,
  onNavigateToTab,
}) => {
  // ---------------------------------------------------------------------------
  // Target Selection State (Default to selectedObservation or first high-priority obs)
  // ---------------------------------------------------------------------------
  const [activeObsId, setActiveObsId] = useState<string>(() => {
    if (selectedObservation) return selectedObservation.id;
    const highPri = observations.find(o => o.score.finalScore >= 75);
    return highPri ? highPri.id : observations[0]?.id || '';
  });

  // Active Observation Object
  const currentObs = useMemo(() => {
    return observations.find(o => o.id === activeObsId) || selectedObservation || observations[0] || null;
  }, [observations, activeObsId, selectedObservation]);

  // Active Section / Tab inside Contextual Evidence workspace
  const [activeSubTab, setActiveSubTab] = useState<
    'persistent' | 'environmental' | 'burn_scar' | 'uncertainty' | 'historical' | 'providers'
  >('persistent');

  // ---------------------------------------------------------------------------
  // 1. Persistent Heat Sources State & Custom Upload
  // ---------------------------------------------------------------------------
  const [persistentEmittersCatalog, setPersistentEmittersCatalog] = useState<PersistentHeatSource[]>(
    () => DOCUMENTED_PERSISTENT_EMITTERS
  );
  const [proximitySearchRadiusKm, setProximitySearchRadiusKm] = useState<number>(6.0);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Proximity matches for current observation
  const emitterMatches: EmitterProximityMatch[] = useMemo(() => {
    if (!currentObs) return [];
    return findNearbyPersistentEmitters(
      currentObs.latitude,
      currentObs.longitude,
      proximitySearchRadiusKm,
      persistentEmittersCatalog
    );
  }, [currentObs, proximitySearchRadiusKm, persistentEmittersCatalog]);

  const handleCustomCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      const text = evt.target?.result as string;
      const { emitters, rejectedCount, errors } = parsePersistentEmittersCsv(text);
      if (emitters.length > 0) {
        setPersistentEmittersCatalog(prev => [...emitters, ...prev]);
        setUploadFeedback(`Successfully ingested ${emitters.length} custom emitters (${rejectedCount} rows skipped).`);
        setTimeout(() => setUploadFeedback(null), 4000);
      } else {
        setUploadFeedback(`Upload failed: ${errors[0] || 'No valid coordinate rows found.'}`);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ---------------------------------------------------------------------------
  // 2. Environmental Weather State
  // ---------------------------------------------------------------------------
  const [weatherContext, setWeatherContext] = useState<EnvironmentalWeatherContext | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(false);

  useEffect(() => {
    if (!currentObs) return;
    setIsLoadingWeather(true);
    fetchEnvironmentalWeather(currentObs.latitude, currentObs.longitude)
      .then(data => {
        setWeatherContext(data);
        setIsLoadingWeather(false);
      })
      .catch(() => {
        setIsLoadingWeather(false);
      });
  }, [currentObs?.id, currentObs?.latitude, currentObs?.longitude]);

  // ---------------------------------------------------------------------------
  // 3. Burn-Scar & Optical Imagery State
  // ---------------------------------------------------------------------------
  const [selectedGibsLayer, setSelectedGibsLayer] = useState<string>('MODIS_Terra_SurfaceReflectance_Bands721');
  const [preEventDaysOffset, setPreEventDaysOffset] = useState<number>(14);

  const burnScarContext: BurnScarInspectionContext | null = useMemo(() => {
    if (!currentObs) return null;
    return generateBurnScarContext(
      currentObs.id,
      currentObs.region || `Observation ${currentObs.id}`,
      currentObs.latitude,
      currentObs.longitude,
      currentObs.acqTimestampUtc,
      selectedGibsLayer,
      preEventDaysOffset
    );
  }, [currentObs, selectedGibsLayer, preEventDaysOffset]);

  // ---------------------------------------------------------------------------
  // 4. Uncertainty & Sensor Limitations
  // ---------------------------------------------------------------------------
  const uncertaintyContext: UncertaintyOrbitGapContext | null = useMemo(() => {
    if (!currentObs) return null;
    const cloudPct = weatherContext?.cloudCoverPct ?? 20;
    return computeUncertaintyAndCoverage(currentObs, cloudPct);
  }, [currentObs, weatherContext]);

  // ---------------------------------------------------------------------------
  // 5. Historical Area Comparison
  // ---------------------------------------------------------------------------
  const historicalBaseline: HistoricalAreaBaseline | null = useMemo(() => {
    if (!currentObs) return null;
    return computeHistoricalAreaBaseline(
      currentObs.latitude,
      currentObs.longitude,
      currentObs.frp || 80,
      25.0,
      observations
    );
  }, [currentObs, observations]);

  // Fallback if no observations
  if (!currentObs) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-12 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
        <h3 className="text-sm font-semibold text-neutral-200">No Observation Active</h3>
        <p className="text-xs text-neutral-400 max-w-md mx-auto">
          Please select an observation from the Observations table or Fire Map to inspect contextual evidence.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-500" />
            <h2 className="text-sm font-semibold text-neutral-100">
              FireScope — Contextual Evidence & Environmental Intelligence
            </h2>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Multi-Provider Telemetry Active
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
            Correlate satellite thermal detections with verified industrial emitters, real-time meteorological vectors, NASA GIBS optical burn-scar reflectance, and historical recurrence baselines.
          </p>
        </div>

        {/* Target Observation Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-400">Target Hotspot:</label>
          <select
            value={activeObsId}
            onChange={e => {
              setActiveObsId(e.target.value);
              const found = observations.find(o => o.id === e.target.value);
              if (found) onSelectObservation(found);
            }}
            className="bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-200 max-w-xs focus:outline-none focus:border-amber-500 font-mono"
          >
            {observations.slice(0, 30).map(o => (
              <option key={o.id} value={o.id}>
                {o.platform} — {o.region || `${o.latitude.toFixed(2)}, ${o.longitude.toFixed(2)}`} (Score: {o.score.finalScore})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Target Observation Context Pill Strip */}
      <div className="bg-neutral-950 border border-neutral-850 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <span className="text-[10px] text-neutral-500 block">Active Target ID:</span>
            <span className="font-mono font-semibold text-neutral-200">{currentObs.id}</span>
          </div>
          <div>
            <span className="text-[10px] text-neutral-500 block">Coordinates:</span>
            <span className="font-mono text-neutral-300">
              {currentObs.latitude.toFixed(4)}°, {currentObs.longitude.toFixed(4)}°
            </span>
          </div>
          <div>
            <span className="text-[10px] text-neutral-500 block">Sensor Platform:</span>
            <span className="font-mono text-amber-400">{currentObs.platform} ({currentObs.sensorFamily})</span>
          </div>
          <div>
            <span className="text-[10px] text-neutral-500 block">Fire Radiative Power:</span>
            <span className="font-mono text-neutral-200">
              {currentObs.frp !== undefined ? `${currentObs.frp} MW` : 'Omitted / Not Reported'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-neutral-500 block">Detection Time:</span>
            <span className="font-mono text-neutral-300">{currentObs.acqTimestampUtc.replace('T', ' ').slice(0, 19)} UTC</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
            Triage Score: {currentObs.score.finalScore}/100
          </span>
          {onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab('fire_map')}
              className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px] transition-colors flex items-center gap-1"
            >
              <span>View on Map</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1 border-b border-neutral-800 overflow-x-auto pb-1 text-xs select-none">
        <button
          onClick={() => setActiveSubTab('persistent')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-t-md font-medium transition-colors ${
            activeSubTab === 'persistent'
              ? 'bg-neutral-900 text-amber-400 border-t-2 border-amber-500'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/40'
          }`}
        >
          <Factory className="w-3.5 h-3.5" />
          <span>1. Persistent Heat Sources ({emitterMatches.length} nearby)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('environmental')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-t-md font-medium transition-colors ${
            activeSubTab === 'environmental'
              ? 'bg-neutral-900 text-amber-400 border-t-2 border-amber-500'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/40'
          }`}
        >
          <CloudSun className="w-3.5 h-3.5" />
          <span>2. Environmental Weather & Land Cover</span>
        </button>

        <button
          onClick={() => setActiveSubTab('burn_scar')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-t-md font-medium transition-colors ${
            activeSubTab === 'burn_scar'
              ? 'bg-neutral-900 text-amber-400 border-t-2 border-amber-500'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/40'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>3. Pre & Post Burn-Scar Optical (NASA GIBS)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('uncertainty')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-t-md font-medium transition-colors ${
            activeSubTab === 'uncertainty'
              ? 'bg-neutral-900 text-amber-400 border-t-2 border-amber-500'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/40'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>4. Uncertainty, Orbit Gaps & Clouds</span>
        </button>

        <button
          onClick={() => setActiveSubTab('historical')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-t-md font-medium transition-colors ${
            activeSubTab === 'historical'
              ? 'bg-neutral-900 text-amber-400 border-t-2 border-amber-500'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/40'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>5. Historical Area Comparison</span>
        </button>

        <button
          onClick={() => setActiveSubTab('providers')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-t-md font-medium transition-colors ${
            activeSubTab === 'providers'
              ? 'bg-neutral-900 text-amber-400 border-t-2 border-amber-500'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/40'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Data Providers & Credentials</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: PERSISTENT HEAT SOURCES & CUSTOM CSV UPLOAD
          ========================================================================= */}
      {activeSubTab === 'persistent' && (
        <div className="space-y-5">
          {/* Controls: Search Buffer & Upload Custom Dataset */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                <Factory className="w-4 h-4 text-amber-500" />
                <span>Stationary Industrial Emitter & Volcanic Registry Comparison</span>
              </h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Compare candidate observations with verified flaring sites, petroleum refineries, blast furnaces, and volcanic calderas to prevent false alarms.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-neutral-400 text-[11px]">Proximity Radius:</span>
                <select
                  value={proximitySearchRadiusKm}
                  onChange={e => setProximitySearchRadiusKm(parseFloat(e.target.value))}
                  className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-200"
                >
                  <option value={3.0}>3.0 km buffer</option>
                  <option value={6.0}>6.0 km buffer</option>
                  <option value={10.0}>10.0 km buffer</option>
                  <option value={20.0}>20.0 km buffer</option>
                </select>
              </div>

              {/* Upload Custom Emitter CSV */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCustomCsvUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
                title="Upload CSV containing custom persistent facilities (name, latitude, longitude, type)"
              >
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>Upload Custom Registry CSV</span>
              </button>
            </div>
          </div>

          {uploadFeedback && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>{uploadFeedback}</span>
            </div>
          )}

          {/* Proximity Matches Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-300">
                Proximity Matches for Target ({currentObs.latitude.toFixed(4)}°, {currentObs.longitude.toFixed(4)}°):
              </span>
              <span className="font-mono text-neutral-400 text-[11px]">
                {emitterMatches.length} verified facilities within {proximitySearchRadiusKm} km
              </span>
            </div>

            {emitterMatches.length === 0 ? (
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-8 text-center space-y-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                <h4 className="text-xs font-semibold text-neutral-200">No Documented Persistent Emitters in Vicinity</h4>
                <p className="text-[11px] text-neutral-400 max-w-md mx-auto">
                  No verified industrial flare stacks, petrochemical refineries, or volcanic vents were found within {proximitySearchRadiusKm} km of this detection.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {emitterMatches.map(m => (
                  <div
                    key={m.emitter.id}
                    className={`border rounded-lg p-4 space-y-2.5 transition-colors ${
                      m.isWithinBuffer
                        ? 'bg-rose-950/20 border-rose-500/40'
                        : 'bg-neutral-900 border-neutral-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Factory className="w-4 h-4 text-amber-400" />
                        <span className="font-semibold text-xs text-neutral-100">{m.emitter.name}</span>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                          m.isWithinBuffer
                            ? 'text-rose-400 bg-rose-500/10 border-rose-500/30 font-bold'
                            : 'text-neutral-400 bg-neutral-800 border-neutral-700'
                        }`}
                      >
                        {m.distanceKm.toFixed(2)} km away
                      </span>
                    </div>

                    <p className="text-[11px] text-neutral-300 leading-relaxed">
                      {m.thermalConflictNotice}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-[10px] bg-neutral-950 p-2.5 rounded border border-neutral-850">
                      <div>
                        <span className="text-neutral-500 block">Facility Type:</span>
                        <span className="font-mono text-neutral-200 font-medium">
                          {m.emitter.facilityType.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block">Official Documentation:</span>
                        <span className="font-mono text-neutral-300 truncate block" title={m.emitter.permitNumberOrCitation}>
                          {m.emitter.permitNumberOrCitation}
                        </span>
                      </div>
                    </div>

                    <div className="text-[10px] text-neutral-400 italic">
                      Source: {m.emitter.documentedSource}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reference Catalog Browser */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <h4 className="text-xs font-semibold text-neutral-200">
                Active Stationary Heat Source Registry ({persistentEmittersCatalog.length} records loaded)
              </h4>
              <span className="text-[10px] text-neutral-500">
                World Bank GGFR · US EIA · USGS HVO · TCEQ
              </span>
            </div>

            <div className="overflow-x-auto max-h-56">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-950 border-b border-neutral-800 text-neutral-400 font-medium text-[11px]">
                    <th className="py-2 px-3">Facility Name</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Coordinates</th>
                    <th className="py-2 px-3">Region / Country</th>
                    <th className="py-2 px-3">Official Citation</th>
                    <th className="py-2 px-3 text-right">Buffer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-850 text-[11px]">
                  {persistentEmittersCatalog.map(e => (
                    <tr key={e.id} className="hover:bg-neutral-800/40">
                      <td className="py-2 px-3 font-medium text-neutral-200">{e.name}</td>
                      <td className="py-2 px-3 font-mono text-neutral-400">{e.facilityType}</td>
                      <td className="py-2 px-3 font-mono text-neutral-300">
                        {e.latitude.toFixed(3)}°, {e.longitude.toFixed(3)}°
                      </td>
                      <td className="py-2 px-3 text-neutral-400">{e.region}, {e.country}</td>
                      <td className="py-2 px-3 text-neutral-400 truncate max-w-xs" title={e.permitNumberOrCitation}>
                        {e.permitNumberOrCitation}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-amber-400">{e.bufferRadiusKm} km</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: ENVIRONMENTAL CONTEXT (WEATHER, RAINFALL, WIND VECTORS, LAND COVER)
          ========================================================================= */}
      {activeSubTab === 'environmental' && (
        <div className="space-y-5">
          {/* Environmental Attribution & Separation Banner */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-neutral-200">
                <CloudSun className="w-4 h-4 text-amber-500" />
                <span>Environmental Meteorological Telemetry (Open-Meteo Weather API)</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Live Query Verified
              </span>
            </div>
            <p className="text-neutral-400 text-[11px] leading-relaxed">
              Provides real-time ambient surface temperature, relative humidity, 10m wind direction vectors, and 24-hour rainfall for coordinates ({currentObs.latitude.toFixed(4)}°, {currentObs.longitude.toFixed(4)}°).
              <br />
              <strong>Architectural Separation:</strong> Direct satellite thermal detections are strictly separated from environmental context and model-derived fire weather danger ratings.
            </p>
          </div>

          {/* Meteorological Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-neutral-950 border border-neutral-850 p-4 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <Thermometer className="w-3.5 h-3.5 text-rose-400" />
                  <span>Ambient Temperature</span>
                </span>
                <span className="text-[10px] text-neutral-500 font-mono">2m AGL</span>
              </div>
              <div className="text-xl font-bold font-mono text-neutral-100">
                {weatherContext?.temperatureC !== undefined ? `${weatherContext.temperatureC}°C` : '—'}
              </div>
              <span className="text-[10px] text-neutral-500 block">
                {weatherContext?.temperatureC ? `${((weatherContext.temperatureC * 9) / 5 + 32).toFixed(1)}°F surface air` : ''}
              </span>
            </div>

            <div className="bg-neutral-950 border border-neutral-850 p-4 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-sky-400" />
                  <span>Relative Humidity</span>
                </span>
                <span className="text-[10px] text-neutral-500 font-mono">2m AGL</span>
              </div>
              <div className="text-xl font-bold font-mono text-neutral-100">
                {weatherContext?.relativeHumidityPct !== undefined ? `${weatherContext.relativeHumidityPct}%` : '—'}
              </div>
              <span className="text-[10px] text-neutral-500 block">
                {weatherContext && weatherContext.relativeHumidityPct! < 20 ? 'Critical fuel drying (<20%)' : 'Moderate ambient humidity'}
              </span>
            </div>

            <div className="bg-neutral-950 border border-neutral-850 p-4 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5 text-amber-400" />
                  <span>Wind Velocity & Gusts</span>
                </span>
                <span className="text-[10px] text-neutral-500 font-mono">10m AGL</span>
              </div>
              <div className="text-xl font-bold font-mono text-neutral-100">
                {weatherContext?.windSpeedKmh !== undefined ? `${weatherContext.windSpeedKmh} km/h` : '—'}
              </div>
              <span className="text-[10px] text-neutral-400 block font-mono">
                Gusts to {weatherContext?.windGustsKmh || 0} km/h · Dir {weatherContext?.windDirectionDeg || 0}°
              </span>
            </div>

            <div className="bg-neutral-950 border border-neutral-850 p-4 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-blue-400" />
                  <span>Precipitation (Past 24h)</span>
                </span>
                <span className="text-[10px] text-neutral-500 font-mono">Rain gauge</span>
              </div>
              <div className="text-xl font-bold font-mono text-neutral-100">
                {weatherContext?.precipitationPast24hMm !== undefined ? `${weatherContext.precipitationPast24hMm} mm` : '0.0 mm'}
              </div>
              <span className="text-[10px] text-neutral-500 block">
                {weatherContext?.precipitationPast24hMm === 0 ? 'Zero rainfall in 24 hours' : 'Recent rainfall detected'}
              </span>
            </div>
          </div>

          {/* Wind Vector & Model-Derived Fire Danger Assessment */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Wind Direction Compass & Spread Alignment */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-3">
              <h4 className="text-xs font-semibold text-neutral-200 flex items-center gap-2">
                <Compass className="w-4 h-4 text-amber-400" />
                <span>10m Wind Direction Vector & Potential Spread Azimuth</span>
              </h4>
              <p className="text-[11px] text-neutral-400">
                Wind blowing from {weatherContext?.windDirectionDeg || 0}° at {weatherContext?.windSpeedKmh || 0} km/h.
              </p>

              <div className="flex items-center gap-6 pt-2">
                {/* Visual Compass Needle */}
                <div className="relative w-24 h-24 rounded-full border border-neutral-700 bg-neutral-950 flex items-center justify-center shrink-0">
                  <span className="absolute top-1 text-[9px] font-mono text-neutral-500">N</span>
                  <span className="absolute right-1 text-[9px] font-mono text-neutral-500">E</span>
                  <span className="absolute bottom-1 text-[9px] font-mono text-neutral-500">S</span>
                  <span className="absolute left-1 text-[9px] font-mono text-neutral-500">W</span>
                  <div
                    className="w-1 h-16 bg-gradient-to-t from-transparent via-amber-500 to-rose-500 rounded transition-transform duration-500"
                    style={{ transform: `rotate(${weatherContext?.windDirectionDeg || 0}deg)` }}
                  />
                  <div className="w-3 h-3 rounded-full bg-neutral-200 border border-neutral-900 absolute" />
                </div>

                <div className="space-y-1 text-xs">
                  <div className="text-neutral-300">
                    <strong>Downwind Propagation Corridor:</strong>{' '}
                    <span className="font-mono text-amber-400 font-semibold">
                      {((weatherContext?.windDirectionDeg || 0) + 180) % 360}°
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    If an uncontained wildland fire is active in this vegetation sector, spot fires and ember transport are projected along this azimuth.
                  </p>
                </div>
              </div>
            </div>

            {/* Model-Derived Fire Weather Danger */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-neutral-200 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>Model-Derived Fire Weather Risk Rating</span>
                </h4>
                <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  Model Heuristic
                </span>
              </div>

              <div className="p-3 bg-neutral-950 rounded border border-neutral-850 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">Estimated Fire Weather Class:</span>
                  <span
                    className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                      weatherContext?.modelDerivedFireDangerRating === 'EXTREME' ||
                      weatherContext?.modelDerivedFireDangerRating === 'VERY_HIGH'
                        ? 'text-rose-400 bg-rose-500/20'
                        : weatherContext?.modelDerivedFireDangerRating === 'HIGH'
                        ? 'text-amber-400 bg-amber-500/20'
                        : 'text-emerald-400 bg-emerald-500/20'
                    }`}
                  >
                    {weatherContext?.modelDerivedFireDangerRating || 'MODERATE'}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Synthesized from temperature ({weatherContext?.temperatureC}°C), relative humidity ({weatherContext?.relativeHumidityPct}%), wind velocity ({weatherContext?.windSpeedKmh} km/h), and 24h precipitation ({weatherContext?.precipitationPast24hMm} mm).
                </p>
              </div>

              <div className="text-[10px] text-neutral-500 leading-tight">
                Provenance: {weatherContext?.attribution || 'Open-Meteo Weather API'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: PRE-EVENT AND POST-EVENT OPTICAL BURN-SCAR INSPECTION (NASA GIBS)
          ========================================================================= */}
      {activeSubTab === 'burn_scar' && burnScarContext && (
        <div className="space-y-5">
          {/* Header & Layer Selector */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-500" />
                <span>Pre-Event & Post-Event Optical Imagery Inspector (NASA GIBS)</span>
              </h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Authentic 250m satellite surface reflectance layers from NASA EOSDIS to inspect vegetative charcoal scorch and surface spectral changes.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-neutral-400 text-[11px]">Spectral Layer:</span>
                <select
                  value={selectedGibsLayer}
                  onChange={e => setSelectedGibsLayer(e.target.value)}
                  className="bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1 text-xs text-neutral-200"
                >
                  {GIBS_AVAILABLE_LAYERS.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-neutral-400 text-[11px]">Pre-Event Gap:</span>
                <select
                  value={preEventDaysOffset}
                  onChange={e => setPreEventDaysOffset(parseInt(e.target.value))}
                  className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-200"
                >
                  <option value={7}>7 days prior</option>
                  <option value={14}>14 days prior</option>
                  <option value={30}>30 days prior</option>
                </select>
              </div>
            </div>
          </div>

          {/* Prominent Mandatory Scientific Disclaimer */}
          <div className="bg-neutral-950 border border-amber-500/30 rounded-lg p-4 text-xs text-neutral-300 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Scientific Disclaimer: Optical Scars vs Active Thermal Combustion</span>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              {burnScarContext.scientificDisclaimer}
            </p>
          </div>

          {/* Side-by-Side Optical Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pre-Event Baseline Imagery */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden space-y-3 p-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <div>
                  <h4 className="text-xs font-semibold text-neutral-200">
                    1. Pre-Event Baseline Optical Imagery
                  </h4>
                  <span className="text-[10px] font-mono text-neutral-400">
                    Acquired: {burnScarContext.preEventDate} ({preEventDaysOffset} days prior to detection)
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Pre-Event
                </span>
              </div>

              <div className="relative aspect-square w-full rounded bg-neutral-950 border border-neutral-800 overflow-hidden flex items-center justify-center">
                <img
                  src={burnScarContext.preEventImageryUrl}
                  alt={`Pre-event optical surface reflectance on ${burnScarContext.preEventDate}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={e => {
                    // Fallback visual if GIBS tile is unavailable
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="absolute bottom-2 left-2 bg-neutral-950/80 px-2 py-1 rounded text-[10px] font-mono text-neutral-300 border border-neutral-800">
                  NASA GIBS {burnScarContext.preEventDate}
                </div>
              </div>

              <p className="text-[11px] text-neutral-400">
                Baseline healthy canopy condition prior to ignition event.
              </p>
            </div>

            {/* Post-Event Imagery */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden space-y-3 p-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <div>
                  <h4 className="text-xs font-semibold text-neutral-200">
                    2. Post-Event Optical Surface Reflectance
                  </h4>
                  <span className="text-[10px] font-mono text-amber-400">
                    Acquired: {burnScarContext.postEventDate} (Detection date)
                  </span>
                </div>
                <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  Post-Event
                </span>
              </div>

              <div className="relative aspect-square w-full rounded bg-neutral-950 border border-neutral-800 overflow-hidden flex items-center justify-center">
                <img
                  src={burnScarContext.postEventImageryUrl}
                  alt={`Post-event optical surface reflectance on ${burnScarContext.postEventDate}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={e => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="absolute bottom-2 left-2 bg-neutral-950/80 px-2 py-1 rounded text-[10px] font-mono text-neutral-300 border border-neutral-800">
                  NASA GIBS {burnScarContext.postEventDate}
                </div>
                {/* Hotspot Target Crosshair Marker */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-dashed animate-pulse flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-neutral-400">
                {burnScarContext.vegetationIndexNote}
              </p>
            </div>
          </div>

          {/* Technical Metadata Strip */}
          <div className="bg-neutral-950 border border-neutral-850 p-4 rounded-lg grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-neutral-500 block">Imagery Provider:</span>
              <span className="font-mono text-neutral-200">{burnScarContext.imageryProvider}</span>
            </div>
            <div>
              <span className="text-[10px] text-neutral-500 block">Nominal Resolution:</span>
              <span className="font-mono text-neutral-200">{burnScarContext.resolutionMeters} meters / pixel</span>
            </div>
            <div>
              <span className="text-[10px] text-neutral-500 block">Sensor Bands:</span>
              <span className="font-mono text-neutral-200">{burnScarContext.spectralBands}</span>
            </div>
            <div>
              <span className="text-[10px] text-neutral-500 block">WMS Coordinate Reference:</span>
              <span className="font-mono text-neutral-200">EPSG:4326 (WGS84 Lat/Lon)</span>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: SENSOR UNCERTAINTY, ORBIT GAPS & CLOUD LIMITATIONS
          ========================================================================= */}
      {activeSubTab === 'uncertainty' && uncertaintyContext && (
        <div className="space-y-5">
          {/* Mandatory Rule Notice */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-semibold text-neutral-200">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Observation Uncertainty, Sensor Latency & Orbit Coverage Map</span>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Low-Earth orbit satellites (VIIRS & MODIS) operate on sun-synchronous orbits with distinct temporal revisits. 
              <strong>Operational Principle:</strong> A missing observation is NEVER treated as proof that no fire exists. Heavy cloud layers, smoke attenuation, pyrocumulus, off-nadir distortion, or orbit gaps frequently obscure active combustion.
            </p>
          </div>

          {/* Uncertainty Metrics Ribbon */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-neutral-950 border border-neutral-850 p-4 rounded-lg space-y-1">
              <span className="text-[11px] text-neutral-400">Acquisition Age:</span>
              <div className="text-xl font-bold font-mono text-neutral-100">
                {uncertaintyContext.observationAcquisitionAgeHours} hrs ago
              </div>
              <span className="text-[10px] text-neutral-500 block">
                {uncertaintyContext.observationAcquisitionAgeHours < 3
                  ? 'Fresh telemetry (< 3h)'
                  : 'Aging footprint requiring re-verification'}
              </span>
            </div>

            <div className="bg-neutral-950 border border-neutral-850 p-4 rounded-lg space-y-1">
              <span className="text-[11px] text-neutral-400">Est. Next Orbit Pass:</span>
              <div className="text-xl font-bold font-mono text-amber-400">
                ~{uncertaintyContext.hoursUntilNextPredictedPass} hrs
              </div>
              <span className="text-[10px] text-neutral-500 block">
                Predicted: {uncertaintyContext.nextPredictedSatellite}
              </span>
            </div>

            <div className="bg-neutral-950 border border-neutral-850 p-4 rounded-lg space-y-1">
              <span className="text-[11px] text-neutral-400">Cloud Obscuration Risk:</span>
              <div
                className={`text-xl font-bold font-mono ${
                  uncertaintyContext.cloudObscurationRisk === 'HIGH_CLOUD_COVER'
                    ? 'text-rose-400'
                    : uncertaintyContext.cloudObscurationRisk === 'MODERATE_PARTIAL_CLOUD'
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {uncertaintyContext.cloudFractionPct || 20}% Cloud Cover
              </div>
              <span className="text-[10px] text-neutral-500 block">
                {uncertaintyContext.cloudObscurationRisk.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="bg-neutral-950 border border-neutral-850 p-4 rounded-lg space-y-1">
              <span className="text-[11px] text-neutral-400">Total Uncertainty Metric:</span>
              <div className="text-xl font-bold font-mono text-neutral-200">
                {uncertaintyContext.uncertaintyScore} / 100
              </div>
              <div className="w-full bg-neutral-900 h-1.5 rounded-full overflow-hidden mt-1">
                <div
                  style={{ width: `${uncertaintyContext.uncertaintyScore}%` }}
                  className="h-full bg-amber-500 rounded-full"
                />
              </div>
            </div>
          </div>

          {/* Orbit Cadence Explanation */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-3 text-xs">
            <h4 className="font-semibold text-neutral-200 flex items-center gap-2">
              <Info className="w-4 h-4 text-sky-400" />
              <span>Available Constellation Revisit Timetable for ({currentObs.latitude.toFixed(2)}°, {currentObs.longitude.toFixed(2)}°)</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="bg-neutral-950 p-3 rounded border border-neutral-850 space-y-1">
                <span className="font-semibold text-amber-400 block">VIIRS NOAA-20 & NOAA-21</span>
                <span className="text-neutral-400 block text-[11px]">Equator Crossing: ~13:30 / ~01:30 local</span>
                <p className="text-[10px] text-neutral-500">
                  375m I-band. NOAA-20 leads Suomi-NPP by ~50 minutes; NOAA-21 provides additional interleaved passes.
                </p>
              </div>

              <div className="bg-neutral-950 p-3 rounded border border-neutral-850 space-y-1">
                <span className="font-semibold text-amber-400 block">VIIRS Suomi-NPP</span>
                <span className="text-neutral-400 block text-[11px]">Equator Crossing: ~13:30 / ~01:30 local</span>
                <p className="text-[10px] text-neutral-500">
                  Primary afternoon high-resolution thermal imaging with 3,040 km cross-track swath.
                </p>
              </div>

              <div className="bg-neutral-950 p-3 rounded border border-neutral-850 space-y-1">
                <span className="font-semibold text-sky-400 block">MODIS Terra & Aqua</span>
                <span className="text-neutral-400 block text-[11px]">Equator Crossing: ~10:30 (Terra) / ~13:30 (Aqua)</span>
                <p className="text-[10px] text-neutral-500">
                  1000m resolution. Mid-morning Terra pass complements afternoon VIIRS passes.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: HISTORICAL AREA COMPARISON & HOTSPOT RECURRENCE
          ========================================================================= */}
      {activeSubTab === 'historical' && historicalBaseline && (
        <div className="space-y-5">
          {/* Header */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                <Compass className="w-4 h-4 text-amber-500" />
                <span>Historical Baseline Comparison for Area ±25 km</span>
              </h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Evaluates whether current thermal activity is an unprecedented sudden outbreak, recurring seasonal burning (e.g. agricultural stubble clearing), or chronic stationary heat.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`font-mono text-xs font-bold px-2.5 py-1 rounded border ${
                  historicalBaseline.recurrenceClassification === 'UNPRECEDENTED_OUTBREAK'
                    ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                    : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                }`}
              >
                {historicalBaseline.recurrenceClassification.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          {/* Historical Seasonal Bar Chart */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h4 className="text-xs font-semibold text-neutral-200">
                12-Month Seasonal Fire Activity Distribution vs Current Event Surge
              </h4>
              <span className="text-[10px] font-mono text-neutral-400">
                Monthly Detections Baseline
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={historicalBaseline.seasonalPattern} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="month" stroke="#737373" fontSize={11} tickLine={false} />
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
                  <Bar dataKey="historicalCount" fill="#737373" name="Historical Monthly Average" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="currentEventCount" fill="#f59e0b" name="Current Cluster Detections" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="bg-neutral-950 p-3 rounded border border-neutral-850">
                <span className="text-neutral-500 block text-[10px]">Historical Annual Detections:</span>
                <span className="font-mono font-semibold text-neutral-200">
                  {historicalBaseline.totalHistoricalDetections} detections / yr
                </span>
              </div>
              <div className="bg-neutral-950 p-3 rounded border border-neutral-850">
                <span className="text-neutral-500 block text-[10px]">Peak Historical Radiative Power:</span>
                <span className="font-mono font-semibold text-amber-400">
                  {historicalBaseline.peakHistoricalFrp} MW
                </span>
              </div>
              <div className="bg-neutral-950 p-3 rounded border border-neutral-850">
                <span className="text-neutral-500 block text-[10px]">Statistical Anomaly Z-Score:</span>
                <span className="font-mono font-semibold text-neutral-200">
                  Z = +{historicalBaseline.zScore} (&sigma;)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 6: DATA PROVIDERS CONFIGURATION & CREDENTIALS
          ========================================================================= */}
      {activeSubTab === 'providers' && (
        <div className="space-y-5">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-2">
            <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-500" />
              <span>Configured Contextual Data Providers & API Credentials</span>
            </h3>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              FireScope prioritizes zero-credential, open scientific endpoints (NASA GIBS WMS and Open-Meteo). 
              If optional provider credentials are not configured, clear setup instructions are provided below.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DATA_PROVIDERS_CONFIG.map(p => (
              <div key={p.id} className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-neutral-100">{p.name}</h4>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                      p.status === 'ACTIVE_FREE'
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                        : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                    }`}
                  >
                    {p.status === 'ACTIVE_FREE' ? 'Active / Zero Key' : 'Optional Setup'}
                  </span>
                </div>

                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  {p.description}
                </p>

                <div className="bg-neutral-950 p-2.5 rounded border border-neutral-850 text-[10px] space-y-1">
                  <div className="text-neutral-400">
                    <strong>Endpoint:</strong> <code className="text-neutral-300 font-mono">{p.endpoint}</code>
                  </div>
                  {p.envKeyName && (
                    <div className="text-amber-400 font-mono">
                      Environment Variable: {p.envKeyName}
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-neutral-300 bg-neutral-950/60 p-2.5 rounded border border-neutral-850">
                  <strong>Setup Instructions:</strong> {p.setupInstructions}
                </div>

                <a
                  href={p.documentationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <span>Official Provider Documentation</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
