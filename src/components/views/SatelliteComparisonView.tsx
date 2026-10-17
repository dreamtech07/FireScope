/**
 * FireScope — Multi-Satellite Observation Matching & Candidate Event Grouping View
 * 
 * Comprehensive operational view for:
 * - Associating VIIRS (375m) and MODIS (1000m) observations within configurable tolerances
 * - Inspecting Candidate Thermal Clusters with map footprint and pass timeline
 * - Neutral evidence summaries with strict discipline (never labels as confirmed wildfire)
 * - Distinguishing records count from unique sources, satellites, and sensors
 * - Quarantining duplicate imports from corroboration tallies
 * - Revealing matched, unmatched, and ambiguous observations
 * - Interactive tolerance adjustment HUD and nominal spatial resolution guidance
 */

import React, { useState, useMemo } from 'react';
import {
  GitCompare,
  Layers,
  MapPin,
  Clock,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  ExternalLink,
  ShieldAlert,
  Search,
  Filter,
  Eye,
  Info,
  RotateCcw,
  Sparkles,
  HelpCircle,
  ChevronRight,
  Radio,
  Download,
} from 'lucide-react';
import {
  FireObservation,
  CandidateFireEvent,
  MatchingToleranceConfig,
  SensorFamily,
  SensorPlatform,
} from '../../types/observation';
import {
  matchCrossSensorObservations,
  groupIntoCandidateEvents,
  classifyAllObservations,
  DEFAULT_MATCHING_CONFIG,
} from '../../utils/matcher';
import { exportCandidateEventsSummaryCsv, triggerCsvDownload } from '../../utils/export';
import { EventMapAndTimeline } from '../common/EventMapAndTimeline';

interface SatelliteComparisonViewProps {
  observations: FireObservation[];
  clusters: CandidateFireEvent[];
  onSelectObservation: (obs: FireObservation) => void;
}

export const SatelliteComparisonView: React.FC<SatelliteComparisonViewProps> = ({
  observations,
  clusters: defaultClusters,
  onSelectObservation,
}) => {
  // Configurable Matching & Grouping Tolerances
  const [spatialToleranceKm, setSpatialToleranceKm] = useState<number>(12.0);
  const [temporalToleranceHours, setTemporalToleranceHours] = useState<number>(36.0);
  const [maxPairDistanceKm, setMaxPairDistanceKm] = useState<number>(6.0);
  const [maxPairTimeDeltaMinutes, setMaxPairTimeDeltaMinutes] = useState<number>(240);
  const [accountForSensorResolution, setAccountForSensorResolution] = useState<boolean>(true);
  const [excludeDuplicateImports, setExcludeDuplicateImports] = useState<boolean>(true);

  // Active Tab
  const [activeSubTab, setActiveSubTab] = useState<'EVENTS' | 'PAIRS' | 'CLASSIFICATION' | 'SPECS'>('EVENTS');

  // Filter States
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [eventConfirmationFilter, setEventConfirmationFilter] = useState<'ALL' | 'MULTI_SENSOR' | 'SINGLE_SENSOR'>('ALL');
  const [classificationFilter, setClassificationFilter] = useState<'ALL' | 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS'>('ALL');
  const [pairFilter, setPairFilter] = useState<'ALL' | 'STRONG' | 'AMBIGUOUS'>('ALL');

  // Selected Event for Deep-Dive Map & Timeline
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Recompute clusters and matches whenever observations or tolerances change
  const currentConfig: MatchingToleranceConfig = useMemo(() => ({
    spatialToleranceKm,
    temporalToleranceHours,
    accountForSensorResolution,
    excludeDuplicateImports,
    maxPairDistanceKm,
    maxPairTimeDeltaMinutes,
  }), [
    spatialToleranceKm,
    temporalToleranceHours,
    accountForSensorResolution,
    excludeDuplicateImports,
    maxPairDistanceKm,
    maxPairTimeDeltaMinutes,
  ]);

  const activeClusters = useMemo(() => {
    return groupIntoCandidateEvents(
      observations,
      spatialToleranceKm,
      temporalToleranceHours,
      currentConfig
    );
  }, [observations, spatialToleranceKm, temporalToleranceHours, currentConfig]);

  // Selected event object
  const activeSelectedEvent = useMemo(() => {
    if (!activeClusters.length) return null;
    if (!selectedEventId) return activeClusters[0];
    return activeClusters.find(c => c.id === selectedEventId) || activeClusters[0];
  }, [activeClusters, selectedEventId]);

  // Cross-sensor matching computation
  const { matchedPairs, unmatchedViirs, unmatchedModis, ambiguousPairs } = useMemo(() => {
    return matchCrossSensorObservations(
      observations,
      maxPairDistanceKm,
      maxPairTimeDeltaMinutes,
      accountForSensorResolution
    );
  }, [observations, maxPairDistanceKm, maxPairTimeDeltaMinutes, accountForSensorResolution]);

  // Classify all observations
  const classifiedRecords = useMemo(() => {
    return classifyAllObservations(observations, currentConfig);
  }, [observations, currentConfig]);

  // Summary counts
  const viirsCount = observations.filter(o => o.sensorFamily === 'VIIRS').length;
  const modisCount = observations.filter(o => o.sensorFamily === 'MODIS').length;
  const multiSensorClusterCount = activeClusters.filter(c => c.hasMultiSensorConfirmation).length;

  const totalDuplicatesQuarantined = useMemo(() => {
    return activeClusters.reduce((acc, c) => acc + c.duplicateRecordCount, 0);
  }, [activeClusters]);

  // Reset tolerances to FIRMS recommendations
  const handleResetTolerances = () => {
    setSpatialToleranceKm(DEFAULT_MATCHING_CONFIG.spatialToleranceKm);
    setTemporalToleranceHours(DEFAULT_MATCHING_CONFIG.temporalToleranceHours);
    setMaxPairDistanceKm(DEFAULT_MATCHING_CONFIG.maxPairDistanceKm);
    setMaxPairTimeDeltaMinutes(DEFAULT_MATCHING_CONFIG.maxPairTimeDeltaMinutes);
    setAccountForSensorResolution(true);
    setExcludeDuplicateImports(true);
  };

  // Filtered clusters
  const filteredClusters = useMemo(() => {
    return activeClusters.filter(c => {
      if (eventConfirmationFilter === 'MULTI_SENSOR' && !c.hasMultiSensorConfirmation) return false;
      if (eventConfirmationFilter === 'SINGLE_SENSOR' && c.hasMultiSensorConfirmation) return false;
      if (eventSearchQuery.trim()) {
        const q = eventSearchQuery.toLowerCase();
        return (
          c.clusterName.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.satellitesRepresented.some(p => p.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [activeClusters, eventConfirmationFilter, eventSearchQuery]);

  // Filtered pairs
  const allPairs = useMemo(() => {
    return [...matchedPairs, ...ambiguousPairs];
  }, [matchedPairs, ambiguousPairs]);

  const filteredPairs = useMemo(() => {
    if (pairFilter === 'STRONG') return matchedPairs.filter(p => p.matchQuality === 'STRONG');
    if (pairFilter === 'AMBIGUOUS') return ambiguousPairs;
    return allPairs;
  }, [pairFilter, matchedPairs, ambiguousPairs, allPairs]);

  // Filtered classified observations
  const filteredClassified = useMemo(() => {
    if (classificationFilter === 'ALL') return classifiedRecords;
    return classifiedRecords.filter(r => r.matchCategory === classificationFilter);
  }, [classifiedRecords, classificationFilter]);

  return (
    <div className="space-y-6">
      {/* Sensor Constellation Specs & Technical Comparison Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* VIIRS Spec */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block"></span>
              <h3 className="text-xs font-semibold text-neutral-100">VIIRS Sensor Constellation</h3>
            </div>
            <span className="text-[11px] font-mono text-neutral-400">375m Spatial Resolution (I-Band)</span>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Visible Infrared Imaging Radiometer Suite aboard Suomi-NPP, NOAA-20, and NOAA-21. Provides higher spatial resolution and enhanced detection of smaller, cooler active fires and perimeter flanks.
          </p>
          <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
            <div className="bg-neutral-950 p-2 rounded border border-neutral-850">
              <span className="text-neutral-400 block text-[10px]">Loaded Detections</span>
              <span className="text-neutral-200 font-bold">{viirsCount}</span>
            </div>
            <div className="bg-neutral-950 p-2 rounded border border-neutral-850">
              <span className="text-neutral-400 block text-[10px]">Operational Constellation</span>
              <span className="text-neutral-200 font-bold">SNPP, N20, N21</span>
            </div>
            <div className="bg-neutral-950 p-2 rounded border border-neutral-850">
              <span className="text-neutral-400 block text-[10px]">Pixel Footprint</span>
              <span className="text-neutral-200 font-bold">375m I-Band (I4/I5)</span>
            </div>
          </div>
        </div>

        {/* MODIS Spec */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block"></span>
              <h3 className="text-xs font-semibold text-neutral-100">MODIS Sensor Constellation</h3>
            </div>
            <span className="text-[11px] font-mono text-neutral-400">1000m Spatial Resolution (4μm)</span>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Moderate Resolution Imaging Spectroradiometer aboard NASA Terra (morning pass) and Aqua (afternoon pass). Offers unbroken 20+ year baseline and calibrated 4μm/11μm saturation thresholds.
          </p>
          <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
            <div className="bg-neutral-950 p-2 rounded border border-neutral-850">
              <span className="text-neutral-400 block text-[10px]">Loaded Detections</span>
              <span className="text-neutral-200 font-bold">{modisCount}</span>
            </div>
            <div className="bg-neutral-950 p-2 rounded border border-neutral-850">
              <span className="text-neutral-400 block text-[10px]">Operational Platforms</span>
              <span className="text-neutral-200 font-bold">Terra, Aqua</span>
            </div>
            <div className="bg-neutral-950 p-2 rounded border border-neutral-850">
              <span className="text-neutral-400 block text-[10px]">Pixel Footprint</span>
              <span className="text-neutral-200 font-bold">1.0 km Bands 21/22</span>
            </div>
          </div>
        </div>
      </div>

      {/* Configurable Spatial-Temporal Matching Tolerances HUD */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-semibold text-neutral-100 uppercase tracking-wide">
              Configurable Multi-Satellite Matching & Grouping Tolerances
            </h3>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleResetTolerances}
              className="text-[11px] text-neutral-400 hover:text-neutral-200 flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Standards</span>
            </button>
            <span className="text-neutral-700">|</span>
            <span className="text-[11px] font-mono text-neutral-400">
              <span className="text-emerald-400 font-bold">{activeClusters.length}</span> Clusters ·{' '}
              <span className="text-amber-400 font-bold">{matchedPairs.length}</span> Matched Pairs ·{' '}
              <span className="text-rose-400 font-bold">{totalDuplicatesQuarantined}</span> Quarantined Dupes
            </span>
          </div>
        </div>

        {/* Interactive Sliders & Toggles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Spatial Cluster Radius */}
          <div className="bg-neutral-950 p-3 rounded border border-neutral-850 space-y-2">
            <div className="flex justify-between items-center text-neutral-300">
              <span className="font-medium">Cluster Spatial Radius:</span>
              <span className="font-mono font-bold text-amber-400">{spatialToleranceKm} km</span>
            </div>
            <input
              type="range"
              min="2.0"
              max="25.0"
              step="0.5"
              value={spatialToleranceKm}
              onChange={e => setSpatialToleranceKm(parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <span className="text-[10px] text-neutral-400 block">
              Max distance from centroid for event grouping
            </span>
          </div>

          {/* Temporal Window */}
          <div className="bg-neutral-950 p-3 rounded border border-neutral-850 space-y-2">
            <div className="flex justify-between items-center text-neutral-300">
              <span className="font-medium">Cluster Temporal Window:</span>
              <span className="font-mono font-bold text-amber-400">{temporalToleranceHours} hrs</span>
            </div>
            <input
              type="range"
              min="6"
              max="72"
              step="3"
              value={temporalToleranceHours}
              onChange={e => setTemporalToleranceHours(parseInt(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <span className="text-[10px] text-neutral-400 block">
              Prevents merging co-located fires across large gaps
            </span>
          </div>

          {/* Cross-Sensor Pair Distance */}
          <div className="bg-neutral-950 p-3 rounded border border-neutral-850 space-y-2">
            <div className="flex justify-between items-center text-neutral-300">
              <span className="font-medium">Pairwise Distance (VIIRS/MODIS):</span>
              <span className="font-mono font-bold text-amber-400">{maxPairDistanceKm} km</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="15.0"
              step="0.5"
              value={maxPairDistanceKm}
              onChange={e => setMaxPairDistanceKm(parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <span className="text-[10px] text-neutral-400 block">
              Max offset between co-located VIIRS & MODIS pixels
            </span>
          </div>

          {/* Pairwise Time Delta */}
          <div className="bg-neutral-950 p-3 rounded border border-neutral-850 space-y-2">
            <div className="flex justify-between items-center text-neutral-300">
              <span className="font-medium">Pairwise Max Time Delta:</span>
              <span className="font-mono font-bold text-amber-400">{maxPairTimeDeltaMinutes} min</span>
            </div>
            <input
              type="range"
              min="30"
              max="480"
              step="30"
              value={maxPairTimeDeltaMinutes}
              onChange={e => setMaxPairTimeDeltaMinutes(parseInt(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <span className="text-[10px] text-neutral-400 block">
              {Math.round(maxPairTimeDeltaMinutes / 60)} hours orbital pass separation limit
            </span>
          </div>
        </div>

        {/* Toggles Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-neutral-850 text-xs">
          <div className="flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={accountForSensorResolution}
                onChange={e => setAccountForSensorResolution(e.target.checked)}
                className="rounded border-neutral-700 bg-neutral-950 text-amber-500 focus:ring-amber-500/20"
              />
              <span className="text-neutral-300">Account for Nominal Sensor Footprint Margin (+0.68 km for 1km MODIS)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={excludeDuplicateImports}
                onChange={e => setExcludeDuplicateImports(e.target.checked)}
                className="rounded border-neutral-700 bg-neutral-950 text-amber-500 focus:ring-amber-500/20"
              />
              <span className="text-neutral-300">Quarantine Re-Imported Duplicates from Evidence Counts</span>
            </label>
          </div>

          <div className="text-[11px] text-neutral-400">
            Strict Multi-Satellite Grouping Algorithm v2.4 · NASA FIRMS Aligned
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
        <button
          onClick={() => setActiveSubTab('EVENTS')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-colors ${
            activeSubTab === 'EVENTS'
              ? 'bg-neutral-800 text-neutral-100'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Layers className="w-4 h-4 text-amber-500" />
          <span>Candidate Events ({activeClusters.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('PAIRS')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-colors ${
            activeSubTab === 'PAIRS'
              ? 'bg-neutral-800 text-neutral-100'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <GitCompare className="w-4 h-4 text-emerald-400" />
          <span>Matched & Ambiguous Pairs ({allPairs.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('CLASSIFICATION')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-colors ${
            activeSubTab === 'CLASSIFICATION'
              ? 'bg-neutral-800 text-neutral-100'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-cyan-400" />
          <span>Observation Status Breakdown ({classifiedRecords.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('SPECS')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-colors ${
            activeSubTab === 'SPECS'
              ? 'bg-neutral-800 text-neutral-100'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Info className="w-4 h-4 text-neutral-400" />
          <span>Sensor Metadata & Resolution Reference</span>
        </button>
      </div>

      {/* SUB-TAB 1: CANDIDATE EVENTS (CLUSTERS) + INTERACTIVE MAP & TIMELINE */}
      {activeSubTab === 'EVENTS' && (
        <div className="space-y-6">
          {/* Active Event Map & Timeline Deep Dive */}
          {activeSelectedEvent ? (
            <EventMapAndTimeline
              event={activeSelectedEvent}
              onSelectObservation={onSelectObservation}
            />
          ) : (
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-8 text-center text-neutral-400 text-xs">
              No candidate fire events currently formed under active tolerances.
            </div>
          )}

          {/* Candidate Events List & Selector */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
              <div>
                <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-500" />
                  <span>All Candidate Thermal Events ({filteredClusters.length} of {activeClusters.length})</span>
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Click any candidate event below to inspect its interactive footprint map, multi-pass timeline, and provenance.
                </p>
              </div>

              {/* Filter controls */}
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search region, platform..."
                    value={eventSearchQuery}
                    onChange={e => setEventSearchQuery(e.target.value)}
                    className="bg-neutral-950 border border-neutral-800 rounded pl-8 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 w-48 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <select
                  value={eventConfirmationFilter}
                  onChange={e => setEventConfirmationFilter(e.target.value as any)}
                  className="bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none"
                >
                  <option value="ALL">All Confirmation Tiers</option>
                  <option value="MULTI_SENSOR">Multi-Sensor Corroborated</option>
                  <option value="SINGLE_SENSOR">Single-Sensor Detection</option>
                </select>
              </div>
            </div>

            {/* Clusters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredClusters.map(cluster => {
                const isSelected = activeSelectedEvent?.id === cluster.id;
                return (
                  <div
                    key={cluster.id}
                    onClick={() => setSelectedEventId(cluster.id)}
                    className={`cursor-pointer rounded-lg border p-4 space-y-2.5 transition-all ${
                      isSelected
                        ? 'bg-neutral-900 border-amber-500/60 ring-1 ring-amber-500/30'
                        : 'bg-neutral-950 border-neutral-850 hover:border-neutral-750 hover:bg-neutral-900/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-semibold text-neutral-200 line-clamp-1">
                        {cluster.clusterName}
                      </h4>
                      <span
                        className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                          cluster.confirmationLevel === 'MULTI_SENSOR_CONFIRMED'
                            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                            : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                        }`}
                      >
                        {cluster.hasMultiSensorConfirmation ? 'Multi-Sensor' : 'Single Sensor'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-neutral-400 block text-[10px]">Centroid:</span>
                        <span className="font-mono text-neutral-300">
                          {cluster.centroidLatitude}°, {cluster.centroidLongitude}°
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block text-[10px]">Evidence Tally:</span>
                        <span className="font-mono text-neutral-200 font-semibold">
                          {cluster.observationCount} records ({cluster.independentEvidenceCount} indep.)
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block text-[10px]">Platforms:</span>
                        <span className="font-mono text-neutral-300">
                          {cluster.satellitesRepresented.join(', ')}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block text-[10px]">Mean / Max FRP:</span>
                        <span className="font-mono text-amber-400 font-bold">
                          {cluster.meanFrp} / {cluster.maxFrp} MW
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-neutral-850 flex items-center justify-between text-[10px] text-neutral-400 font-mono">
                      <span>Span: {cluster.durationHours}h · ~{cluster.estimatedSpreadRadiusKm} km</span>
                      <span className="text-amber-400 font-semibold">
                        {isSelected ? 'Viewing Footprint' : 'Click to Inspect'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: MATCHED & AMBIGUOUS PAIRS */}
      {activeSubTab === 'PAIRS' && (
        <div className="space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
              <div>
                <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                  <GitCompare className="w-4 h-4 text-emerald-400" />
                  <span>Cross-Sensor Associated Pairs ({filteredPairs.length})</span>
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Co-located VIIRS (375m) and MODIS (1000m) detections within {maxPairDistanceKm} km and {maxPairTimeDeltaMinutes} minutes.
                </p>
              </div>

              {/* Pair filter */}
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setPairFilter('ALL')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    pairFilter === 'ALL'
                      ? 'bg-neutral-800 text-neutral-100 font-medium'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  All Pairs ({allPairs.length})
                </button>
                <button
                  onClick={() => setPairFilter('STRONG')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    pairFilter === 'STRONG'
                      ? 'bg-neutral-800 text-emerald-400 font-medium'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Strong Matches ({matchedPairs.length})
                </button>
                <button
                  onClick={() => setPairFilter('AMBIGUOUS')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    pairFilter === 'AMBIGUOUS'
                      ? 'bg-neutral-800 text-amber-400 font-medium'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Ambiguous ({ambiguousPairs.length})
                </button>
              </div>
            </div>

            {/* Pairs Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-950 border-b border-neutral-800 text-neutral-400 font-medium">
                    <th className="py-2.5 px-3">Primary (VIIRS 375m)</th>
                    <th className="py-2.5 px-3">Secondary (MODIS 1000m)</th>
                    <th className="py-2.5 px-3">Region</th>
                    <th className="py-2.5 px-3 text-right">Distance (km)</th>
                    <th className="py-2.5 px-3 text-right">Time Delta</th>
                    <th className="py-2.5 px-3 text-right">FRP (VIIRS vs MODIS)</th>
                    <th className="py-2.5 px-3 text-center">Quality / Status</th>
                    <th className="py-2.5 px-3">Association Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-850">
                  {filteredPairs.map(pair => (
                    <tr key={pair.id} className="hover:bg-neutral-800/40 transition-colors">
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => onSelectObservation(pair.primaryObs)}
                          className="font-mono text-amber-400 hover:underline text-left block"
                        >
                          {pair.primaryObs.id}
                        </button>
                        <span className="text-[10px] text-neutral-400 font-mono">
                          {pair.primaryObs.platform} · {pair.primaryObs.acqTimestampUtc.slice(11, 16)} UTC
                        </span>
                      </td>

                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => onSelectObservation(pair.secondaryObs)}
                          className="font-mono text-rose-400 hover:underline text-left block"
                        >
                          {pair.secondaryObs.id}
                        </button>
                        <span className="text-[10px] text-neutral-400 font-mono">
                          {pair.secondaryObs.platform} · {pair.secondaryObs.acqTimestampUtc.slice(11, 16)} UTC
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-neutral-300">
                        {pair.primaryObs.region}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-neutral-200">
                        {pair.distanceKm} km
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-neutral-300">
                        {pair.temporalDeltaLabel}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        <span className="text-amber-400 font-semibold">{pair.primaryObs.frp || 0} MW</span>
                        <span className="text-neutral-600 mx-1">/</span>
                        <span className="text-rose-400 font-semibold">{pair.secondaryObs.frp || 0} MW</span>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border inline-block ${
                            pair.matchQuality === 'STRONG'
                              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                              : pair.matchQuality === 'MODERATE'
                              ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
                              : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                          }`}
                        >
                          {pair.matchQuality}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-[11px] text-neutral-400 max-w-xs">
                        {pair.ambiguityReason ? (
                          <span className="text-amber-300/90">{pair.ambiguityReason}</span>
                        ) : (
                          <span className="text-neutral-400">Co-located within footprint bounds</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: OBSERVATION CLASSIFICATION (MATCHED, UNMATCHED, AMBIGUOUS) */}
      {activeSubTab === 'CLASSIFICATION' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
            <div>
              <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                <span>Observation Match Classification ({filteredClassified.length} Records)</span>
              </h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Every observation categorized as MATCHED (corroborated), UNMATCHED (isolated), or AMBIGUOUS with specific rationale.
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setClassificationFilter('ALL')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  classificationFilter === 'ALL'
                    ? 'bg-neutral-800 text-neutral-100 font-medium'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                All ({classifiedRecords.length})
              </button>
              <button
                onClick={() => setClassificationFilter('MATCHED')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  classificationFilter === 'MATCHED'
                    ? 'bg-neutral-800 text-emerald-400 font-medium'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Matched ({classifiedRecords.filter(r => r.matchCategory === 'MATCHED').length})
              </button>
              <button
                onClick={() => setClassificationFilter('AMBIGUOUS')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  classificationFilter === 'AMBIGUOUS'
                    ? 'bg-neutral-800 text-amber-400 font-medium'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Ambiguous ({classifiedRecords.filter(r => r.matchCategory === 'AMBIGUOUS').length})
              </button>
              <button
                onClick={() => setClassificationFilter('UNMATCHED')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  classificationFilter === 'UNMATCHED'
                    ? 'bg-neutral-800 text-neutral-300 font-medium'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Unmatched ({classifiedRecords.filter(r => r.matchCategory === 'UNMATCHED').length})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-950 border-b border-neutral-800 text-neutral-400 font-medium">
                  <th className="py-2.5 px-3">Observation ID</th>
                  <th className="py-2.5 px-3">Platform & Instrument</th>
                  <th className="py-2.5 px-3">Nominal Footprint</th>
                  <th className="py-2.5 px-3">Acquisition UTC</th>
                  <th className="py-2.5 px-3 text-right">FRP</th>
                  <th className="py-2.5 px-3 text-center">Match Category</th>
                  <th className="py-2.5 px-3">Classification Rationale & Provenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-850">
                {filteredClassified.map(rec => {
                  const o = rec.observation;
                  return (
                    <tr key={o.id} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono">
                        <button
                          onClick={() => onSelectObservation(o)}
                          className="text-amber-400 hover:underline"
                        >
                          {o.id}
                        </button>
                        {rec.isDuplicate && (
                          <span className="text-[9px] text-rose-400 block font-mono">
                            Quarantined Duplicate
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-neutral-200 block">{o.platform}</span>
                        <span className="text-[10px] text-neutral-400">{o.instrument} ({o.sensorFamily})</span>
                      </td>

                      <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-300">
                        {o.sensorFamily === 'VIIRS' ? '375m I-Band' : '1000m 4μm'}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-neutral-300">
                        {o.acqTimestampUtc.replace('T', ' ').slice(0, 19)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-amber-400 font-semibold">
                        {o.frp || 0} MW
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border inline-block ${
                            rec.matchCategory === 'MATCHED'
                              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                              : rec.matchCategory === 'AMBIGUOUS'
                              ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                              : 'text-neutral-400 bg-neutral-900 border-neutral-800'
                          }`}
                        >
                          {rec.matchCategory}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-[11px] text-neutral-400 max-w-sm">
                        <span className="text-neutral-300 block">{rec.matchReason}</span>
                        <span className="text-[10px] text-neutral-400 block mt-0.5 font-mono">
                          Source: {o.source || 'NASA FIRMS'} · Conf: {o.confidenceCategory} ({o.confidence}%)
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: SENSOR METADATA & NOMINAL RESOLUTION REFERENCE */}
      {activeSubTab === 'SPECS' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-5 text-xs text-neutral-300">
          <div className="border-b border-neutral-800 pb-3">
            <h3 className="text-xs font-semibold text-neutral-100 flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-500" />
              <span>Multi-Satellite Sensor Metadata & Spatial Resolution Dynamics</span>
            </h3>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Why nominal pixel footprints and orbital revisit patterns dictate matching tolerances.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3 bg-neutral-950 p-4 rounded-lg border border-neutral-850">
              <h4 className="font-semibold text-neutral-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span>
                <span>VIIRS 375m Active Fire Product (VNP14IMGTDL / VJ114IMGTDL)</span>
              </h4>
              <ul className="space-y-2 text-neutral-400 text-[11px] leading-relaxed list-disc list-inside">
                <li>
                  <strong className="text-neutral-200">Bands:</strong> I4 (3.55–3.93 μm, 367K saturation) & I5 (10.5–12.4 μm, 380K).
                </li>
                <li>
                  <strong className="text-neutral-200">Nominal Resolution:</strong> 375m at nadir. Pixel expansion at edge of swath is constrained by onboard aggregation (max ~800m).
                </li>
                <li>
                  <strong className="text-neutral-200">Revisit Frequency:</strong> ~12 hours when combining NOAA-20 (13:30 ascending) and Suomi-NPP (13:30 ascending, 50-min orbit offset).
                </li>
                <li>
                  <strong className="text-neutral-200">Matching Consideration:</strong> A single 1km MODIS fire pixel can encompass multiple distinct 375m VIIRS flaming fronts.
                </li>
              </ul>
            </div>

            <div className="space-y-3 bg-neutral-950 p-4 rounded-lg border border-neutral-850">
              <h4 className="font-semibold text-neutral-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span>
                <span>MODIS 1000m Active Fire Product (MOD14 / MYD14)</span>
              </h4>
              <ul className="space-y-2 text-neutral-400 text-[11px] leading-relaxed list-disc list-inside">
                <li>
                  <strong className="text-neutral-200">Bands:</strong> Band 21 (high-range 4μm, 500K saturation) and Band 22 (low-range 4μm, 331K saturation), Band 31 (11μm).
                </li>
                <li>
                  <strong className="text-neutral-200">Nominal Resolution:</strong> 1000m (1 km) at nadir. Due to optical projection, pixel footprints grow up to 2.0 km x 4.8 km at swath edges.
                </li>
                <li>
                  <strong className="text-neutral-200">Revisit Frequency:</strong> Terra (10:30 descending) and Aqua (13:30 ascending), providing morning and afternoon passes.
                </li>
                <li>
                  <strong className="text-neutral-200">Matching Consideration:</strong> MODIS detections report coordinates at the geometric center of the 1000m pixel. True thermal anomaly may be anywhere within that 1km footprint.
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-850 space-y-2 text-[11px] leading-relaxed">
            <span className="font-semibold text-neutral-200 block">
              Algorithmic Independent Confirmation Criteria
            </span>
            <p className="text-neutral-400">
              To avoid misleading analysts with artificial corroboration:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-neutral-400">
              <li>
                <strong className="text-neutral-300">Platform Independence:</strong> Consecutive scans from the same satellite (e.g., adjacent orbital swaths) are classified as repeat single-platform passes, not cross-satellite confirmations.
              </li>
              <li>
                <strong className="text-neutral-300">Duplicate Segregation:</strong> Re-ingested or overlapping CSV rows with identical coordinates and timestamps are strictly quarantined.
              </li>
              <li>
                <strong className="text-neutral-300">Temporal Horizon:</strong> Detections occurring more than {temporalToleranceHours} hours apart are never merged into a single event, recognizing distinct burn phases or separate ignitions.
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};
