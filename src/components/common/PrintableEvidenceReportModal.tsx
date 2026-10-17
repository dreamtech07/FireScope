/**
 * FireScope — Printable Evidence Summary & Analyst Dossier
 * 
 * Provides an audit-ready, print-formatted executive report containing:
 * - Executive Incident & Triage Overview
 * - High-Urgency Hotspot Priority Queue (with explainable factor contributions)
 * - Candidate Spatial-Temporal Event Clusters
 * - Contextual Evidence (Stationary flaring checks, wind spread vectors, weather telemetry)
 * - Sensor Limitations & Cloud Obscuration Mandate
 * - Full Timestamps, Data Provenance, and Scientific Boundaries
 */

import React, { useState } from 'react';
import {
  Printer,
  Copy,
  Check,
  X,
  Flame,
  ShieldCheck,
  AlertTriangle,
  Compass,
  Clock,
  Wind,
  Droplets,
  Thermometer,
  Factory,
  FileCheck2,
} from 'lucide-react';
import { FireObservation, CandidateFireEvent } from '../../types/observation';

interface PrintableEvidenceReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  observations: FireObservation[];
  clusters: CandidateFireEvent[];
  dataMode: 'SYNTHETIC_DEMO' | 'LIVE_FIRMS';
  lastRetrievalUtc: string;
}

export const PrintableEvidenceReportModal: React.FC<PrintableEvidenceReportModalProps> = ({
  isOpen,
  onClose,
  observations,
  clusters,
  dataMode,
  lastRetrievalUtc,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const reportGeneratedUtc = new Date().toISOString();
  const topRanked = [...observations].sort((a, b) => b.score.finalScore - a.score.finalScore).slice(0, 10);
  const highUrgencyCount = observations.filter(o => o.score.finalScore >= 75).length;
  const multiSensorClusters = clusters.filter(c => c.hasMultiSensorConfirmation);
  const totalFrp = observations.reduce((acc, o) => acc + (o.frp || 0), 0);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    const text = `
================================================================================
FIRESCOPE — SATELLITE FIRE OBSERVATION & TRIAGE EVIDENCE REPORT
Report Generated: ${reportGeneratedUtc}
Data Ingestion Mode: ${dataMode} (Retrieved: ${lastRetrievalUtc})
================================================================================

1. EXECUTIVE SUMMARY
- Total Ingested Observations: ${observations.length}
- High-Urgency Priority Queue (Score >= 75): ${highUrgencyCount}
- Total Radiative Energy: ${Math.round(totalFrp).toLocaleString()} MW
- Candidate Fire Clusters: ${clusters.length} (${multiSensorClusters.length} multi-sensor confirmed)

2. TOP TRIAGE PRIORITY QUEUE
${topRanked
  .map(
    (o, idx) =>
      `#${idx + 1} [Score: ${o.score.finalScore}/100] ${o.id} | ${o.platform} | ${o.region}, ${o.country}
   Coords: (${o.latitude.toFixed(4)}°, ${o.longitude.toFixed(4)}°) | Acquired: ${o.acqTimestampUtc}
   Thermal: ${o.frp !== undefined ? o.frp + ' MW' : 'Omitted'} | Conf: ${o.confidence}% (${o.confidenceCategory})
   Triage Label: ${o.score.triagePriorityLabel}
   Rationale: ${o.score.explanation}`
  )
  .join('\n\n')}

3. CANDIDATE SPATIAL-TEMPORAL EVENTS
${clusters
  .slice(0, 5)
  .map(
    c =>
      `* ${c.clusterName} (ID: ${c.id})
   Centroid: (${c.centroidLatitude.toFixed(3)}°, ${c.centroidLongitude.toFixed(3)}°) | Radius: ${c.estimatedSpreadRadiusKm} km
   Observations: ${c.observationCount} | Peak FRP: ${c.maxFrp} MW | Confirmation: ${c.confirmationLevel}
   Sensors: ${c.sensorFamiliesRepresented.join(' + ')}`
  )
  .join('\n')}

4. SCIENTIFIC LIMITATIONS & OPERATIONAL BOUNDARIES
- Low-Earth orbit satellites (VIIRS 375m & MODIS 1000m) provide periodic overpasses.
- A missing observation is NEVER proof of fire absence (cloud obscuration, smoke, or orbit gaps).
- FireScope scores reflect multi-sensor evidence concordance; they are NOT emergency declarations.
================================================================================
`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      {/* Container - Styled for both screen dark-mode and print media white-mode */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-4xl w-full my-auto shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-neutral-100 print:bg-white print:text-black print:border-none print:shadow-none print:max-w-none print:h-auto print:max-h-none print:overflow-visible">
        {/* Screen Controls Header (Hidden in Print) */}
        <div className="px-6 py-3.5 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-neutral-100">
              Printable Evidence Summary & Incident Dossier
            </h3>
            <span className="text-[10px] font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
              Print-Formatted
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyText}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
              title="Copy plain-text report to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-neutral-950 font-semibold rounded-md text-xs transition-colors flex items-center gap-1.5 shadow-sm"
              title="Print document via system print dialog"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Dossier</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Content Body */}
        <div className="p-8 overflow-y-auto space-y-6 text-xs leading-relaxed font-sans print:p-0 print:overflow-visible print:space-y-4">
          {/* Header Title Block */}
          <div className="border-b-2 border-neutral-800 print:border-black pb-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold tracking-tight text-neutral-100 print:text-black">
                  FIRESCOPE AI — MULTI-SATELLITE FIRE OBSERVATION DOSSIER
                </h1>
                <p className="text-neutral-400 print:text-gray-600 text-xs mt-0.5">
                  Earth Observation Analyst Triage Summary & Contextual Evidence Audit
                </p>
              </div>
              <div className="text-right text-[11px] font-mono text-neutral-400 print:text-gray-600">
                <div>Generated: {reportGeneratedUtc.replace('T', ' ').slice(0, 19)} UTC</div>
                <div>Data Mode: {dataMode}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-neutral-400 print:text-gray-700 pt-2 border-t border-neutral-850 print:border-gray-300">
              <span><strong>Source Telemetry:</strong> NASA FIRMS (VIIRS 375m & MODIS 1000m)</span>
              <span>·</span>
              <span><strong>Meteorology:</strong> Open-Meteo Global Surface Models</span>
              <span>·</span>
              <span><strong>Surface Reflectance:</strong> NASA EOSDIS GIBS</span>
            </div>
          </div>

          {/* Section 1: Executive KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
            <div className="bg-neutral-950 print:bg-gray-100 p-3 rounded border border-neutral-800 print:border-gray-300">
              <span className="text-[10px] text-neutral-500 print:text-gray-600 block">Total Hotspots Audited</span>
              <span className="text-base font-bold font-mono text-neutral-100 print:text-black">
                {observations.length} Detections
              </span>
            </div>

            <div className="bg-neutral-950 print:bg-gray-100 p-3 rounded border border-neutral-800 print:border-gray-300">
              <span className="text-[10px] text-neutral-500 print:text-gray-600 block">High-Urgency Queue (&ge;75)</span>
              <span className="text-base font-bold font-mono text-amber-400 print:text-amber-700">
                {highUrgencyCount} Observations
              </span>
            </div>

            <div className="bg-neutral-950 print:bg-gray-100 p-3 rounded border border-neutral-800 print:border-gray-300">
              <span className="text-[10px] text-neutral-500 print:text-gray-600 block">Total Radiative Energy</span>
              <span className="text-base font-bold font-mono text-neutral-100 print:text-black">
                {Math.round(totalFrp).toLocaleString()} MW
              </span>
            </div>

            <div className="bg-neutral-950 print:bg-gray-100 p-3 rounded border border-neutral-800 print:border-gray-300">
              <span className="text-[10px] text-neutral-500 print:text-gray-600 block">Candidate Fire Events</span>
              <span className="text-base font-bold font-mono text-neutral-100 print:text-black">
                {clusters.length} ({multiSensorClusters.length} Confirmed)
              </span>
            </div>
          </div>

          {/* Section 2: Top Ranked Triage Queue */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-neutral-200 print:text-black uppercase tracking-wider border-b border-neutral-800 print:border-gray-300 pb-1">
              Top Priority Triage Queue (Explainable Factor Breakdown)
            </h2>

            <table className="w-full text-left text-[11px] border-collapse print:text-[10px]">
              <thead>
                <tr className="bg-neutral-950 print:bg-gray-200 border-b border-neutral-800 print:border-gray-400 text-neutral-400 print:text-black font-semibold">
                  <th className="py-2 px-2.5">Rank</th>
                  <th className="py-2 px-2.5">Observation ID</th>
                  <th className="py-2 px-2.5">Platform</th>
                  <th className="py-2 px-2.5">Coords (Lat, Lon)</th>
                  <th className="py-2 px-2.5">Acquisition UTC</th>
                  <th className="py-2 px-2.5 text-right">FRP (MW)</th>
                  <th className="py-2 px-2.5">Conf</th>
                  <th className="py-2 px-2.5 text-right">Score</th>
                  <th className="py-2 px-2.5">Triage Label</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-850 print:divide-gray-300">
                {topRanked.map((obs, idx) => (
                  <tr key={obs.id} className="hover:bg-neutral-850/40 print:hover:bg-transparent">
                    <td className="py-2 px-2.5 font-bold font-mono">{idx + 1}</td>
                    <td className="py-2 px-2.5 font-mono text-neutral-200 print:text-black">{obs.id}</td>
                    <td className="py-2 px-2.5 font-mono text-neutral-300 print:text-gray-800">{obs.platform}</td>
                    <td className="py-2 px-2.5 font-mono tabular-nums text-neutral-400 print:text-gray-700">
                      {obs.latitude.toFixed(3)}°, {obs.longitude.toFixed(3)}°
                    </td>
                    <td className="py-2 px-2.5 font-mono text-neutral-300 print:text-gray-800">
                      {obs.acqTimestampUtc.replace('T', ' ').slice(0, 16)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono font-semibold text-amber-400 print:text-black">
                      {obs.frp !== undefined ? `${obs.frp} MW` : 'Omitted'}
                    </td>
                    <td className="py-2 px-2.5 font-mono">{obs.confidence}% ({obs.confidenceCategory})</td>
                    <td className="py-2 px-2.5 text-right font-mono font-bold text-neutral-100 print:text-black">
                      {obs.score.finalScore}/100
                    </td>
                    <td className="py-2 px-2.5 text-neutral-300 print:text-gray-800 font-medium">
                      {obs.score.triagePriorityLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section 3: Candidate Spatial-Temporal Clusters */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-neutral-200 print:text-black uppercase tracking-wider border-b border-neutral-800 print:border-gray-300 pb-1">
              Candidate Spatial-Temporal Fire Events (Cluster Morphology)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 print:grid-cols-2">
              {clusters.slice(0, 4).map(c => (
                <div
                  key={c.id}
                  className="bg-neutral-950 print:bg-gray-50 border border-neutral-850 print:border-gray-300 p-3 rounded space-y-1.5"
                >
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-xs text-neutral-100 print:text-black">{c.clusterName}</h3>
                    <span className="font-mono text-[10px] text-amber-400 print:text-amber-700 font-bold">
                      Top Score: {c.topPriorityScore}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-400 print:text-gray-600 font-mono">
                    Centroid: ({c.centroidLatitude.toFixed(3)}°, {c.centroidLongitude.toFixed(3)}°) · Spread Radius: {c.estimatedSpreadRadiusKm} km
                  </div>
                  <div className="text-[11px] text-neutral-300 print:text-gray-800">
                    {c.observationCount} observations across {c.sensorFamiliesRepresented.join(' + ')} ({c.confirmationLevel})
                  </div>
                  <p className="text-[10px] text-neutral-400 print:text-gray-600 italic">
                    {c.neutralEvidenceSummary}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Operational Boundaries & Mandatory Disclaimers */}
          <div className="border-t-2 border-neutral-800 print:border-black pt-3 space-y-1.5 text-[10px] text-neutral-400 print:text-gray-600">
            <div className="font-bold text-neutral-200 print:text-black flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500 print:text-black" />
              <span>LEGAL, SCIENTIFIC & OPERATIONAL USE BOUNDARIES</span>
            </div>
            <p>
              1. <strong>Analyst Triage Decision Support:</strong> FireScope priority scores are human-review ranking heuristics based on multi-sensor evidence concordance. They are NOT official wildfire emergency declarations.
            </p>
            <p>
              2. <strong>Missing Observation Principle:</strong> Low-Earth orbit satellites (VIIRS & MODIS) operate on sun-synchronous revisit cadences (3–12h gaps). Cloud cover, pyrocumulus smoke plumes, and orbit edges prevent continuous surveillance. <em>A missing satellite detection is NEVER evidence that no fire exists.</em>
            </p>
            <p>
              3. <strong>Stationary Industrial Masks:</strong> Stationary petrochemical flares, steel furnaces, and active volcanic calderas produce intense localized 4μm radiation and must be verified against persistent emitter registries before initiating wildland dispatch.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
