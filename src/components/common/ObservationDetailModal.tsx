/**
 * FireScope — Detailed Observation Inspection Modal / Drawer
 */

import React from 'react';
import { X, Flame, Satellite, Clock, MapPin, AlertTriangle, ShieldCheck, Copy, Check, Layers } from 'lucide-react';
import { FireObservation } from '../../types/observation';

interface DetailModalProps {
  observation: FireObservation | null;
  onClose: () => void;
  onNavigateToTab?: (tab: any) => void;
}

export const ObservationDetailModal: React.FC<DetailModalProps> = ({ observation, onClose, onNavigateToTab }) => {
  const [copied, setCopied] = React.useState(false);

  if (!observation) return null;

  const handleCopyId = () => {
    navigator.clipboard.writeText(observation.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInspectContextual = () => {
    if (onNavigateToTab) {
      onNavigateToTab('contextual_evidence');
      onClose();
    }
  };

  const { score } = observation;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-neutral-100 font-mono">
                  {observation.id}
                </h3>
                <button
                  onClick={handleCopyId}
                  className="text-neutral-400 hover:text-neutral-200 transition-colors"
                  title="Copy ID"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                {observation.region}, {observation.country} · {observation.platform}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onNavigateToTab && (
              <button
                onClick={handleInspectContextual}
                className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-xs font-medium transition-colors flex items-center gap-1.5"
                title="Inspect weather, persistent flaring, and NASA GIBS optical burn scars"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Contextual Evidence</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Priority Score Breakdown Card */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-300 font-semibold">Triage Priority Ranking</span>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-neutral-700 bg-neutral-850 font-semibold text-neutral-200">
                    {score.triagePriorityLabel || 'Review Priority'}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 mt-0.5">Explainable multi-factor heuristic review queue</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold font-mono tabular-nums text-amber-400">
                  {score.finalScore}
                </span>
                <span className="text-xs font-mono text-neutral-400 ml-1">/100</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-neutral-900/60 p-2.5 rounded border border-neutral-800">
                <div className="text-[11px] text-neutral-400">Recency (25%)</div>
                <div className="text-base font-mono tabular-nums font-semibold text-neutral-200 mt-0.5">
                  {score.recencyScore}/100
                </div>
                <div className="text-[10px] text-amber-400/90 font-mono mt-1">
                  +{score.recencyContribution !== undefined ? score.recencyContribution.toFixed(1) : (score.recencyScore * 0.25).toFixed(1)} pts
                </div>
              </div>

              <div className="bg-neutral-900/60 p-2.5 rounded border border-neutral-800">
                <div className="text-[11px] text-neutral-400">Confidence (25%)</div>
                <div className="text-base font-mono tabular-nums font-semibold text-neutral-200 mt-0.5">
                  {score.confidenceScore}/100
                </div>
                <div className="text-[10px] text-amber-400/90 font-mono mt-1">
                  +{score.confidenceContribution !== undefined ? score.confidenceContribution.toFixed(1) : (score.confidenceScore * 0.25).toFixed(1)} pts
                </div>
              </div>

              <div className="bg-neutral-900/60 p-2.5 rounded border border-neutral-800">
                <div className="text-[11px] text-neutral-400">Thermal FRP (30%)</div>
                <div className="text-base font-mono tabular-nums font-semibold text-neutral-200 mt-0.5">
                  {score.thermalScore}/100
                </div>
                <div className="text-[10px] text-amber-400/90 font-mono mt-1">
                  +{score.thermalContribution !== undefined ? score.thermalContribution.toFixed(1) : (score.thermalScore * 0.30).toFixed(1)} pts
                </div>
              </div>

              <div className="bg-neutral-900/60 p-2.5 rounded border border-neutral-800">
                <div className="text-[11px] text-neutral-400">Repeat Pass (20%)</div>
                <div className="text-base font-mono tabular-nums font-semibold text-neutral-200 mt-0.5">
                  {score.repeatScore}/100
                </div>
                <div className="text-[10px] text-amber-400/90 font-mono mt-1">
                  +{score.repeatContribution !== undefined ? score.repeatContribution.toFixed(1) : (score.repeatScore * 0.20).toFixed(1)} pts
                </div>
              </div>
            </div>

            {/* Explanation Rationale */}
            {score.explanation && (
              <div className="bg-neutral-900/90 p-2.5 rounded border border-neutral-850 text-[11px] text-neutral-300">
                <span className="text-neutral-500 font-mono text-[10px] uppercase tracking-wider block mb-0.5">Priority Engine Explanation:</span>
                <p className="leading-relaxed">{score.explanation}</p>
              </div>
            )}

            {score.isIncomplete && score.missingDataNotes && score.missingDataNotes.length > 0 && (
              <div className="bg-amber-950/30 border border-amber-900/50 p-2.5 rounded text-[11px] text-amber-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Incomplete Telemetry Notice:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-amber-200/80">
                  {score.missingDataNotes.map((note, nIdx) => (
                    <li key={nIdx}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Sensor & Telemetry Data Grid */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 space-y-2.5">
              <div className="flex items-center gap-1.5 text-neutral-300 font-medium pb-1 border-b border-neutral-850">
                <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                <span>Geographic & Spatial</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Latitude:</span>
                <span className="font-mono tabular-nums text-neutral-200 font-medium">{observation.latitude}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Longitude:</span>
                <span className="font-mono tabular-nums text-neutral-200 font-medium">{observation.longitude}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Land Cover:</span>
                <span className="text-neutral-200 truncate max-w-[150px]">{observation.landCoverType || 'Forest / Shrub'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Cluster Association:</span>
                <span className="font-mono text-neutral-300">{observation.candidateClusterId || 'None (Isolated)'}</span>
              </div>
            </div>

            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 space-y-2.5">
              <div className="flex items-center gap-1.5 text-neutral-300 font-medium pb-1 border-b border-neutral-850">
                <Clock className="w-3.5 h-3.5 text-neutral-400" />
                <span>Temporal & Instrument</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Acquisition UTC:</span>
                <span className="font-mono tabular-nums text-neutral-200">{observation.acqTimestampUtc.replace('T', ' ').slice(0, 19)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Day / Night Pass:</span>
                <span className="text-neutral-200">{observation.dayNight === 'D' ? 'Daytime (Solar reflection filtered)' : 'Nighttime'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Platform:</span>
                <span className="text-neutral-200">{observation.platform}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Sensor Product Version:</span>
                <span className="font-mono text-neutral-300">{observation.version}</span>
              </div>
            </div>
          </div>

          {/* Thermal Measurements */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 space-y-3">
            <div className="text-xs font-medium text-neutral-300">Thermal Output & Radiative Flux</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-neutral-900 rounded border border-neutral-800">
                <div className="text-[11px] text-neutral-400">Fire Radiative Power</div>
                <div className="text-lg font-mono tabular-nums font-bold text-amber-400 mt-1">
                  {observation.frp !== undefined ? `${observation.frp} MW` : 'N/A'}
                </div>
              </div>
              <div className="p-3 bg-neutral-900 rounded border border-neutral-800">
                <div className="text-[11px] text-neutral-400">Brightness Temp</div>
                <div className="text-lg font-mono tabular-nums font-bold text-neutral-200 mt-1">
                  {observation.brightness ? `${observation.brightness} K` : 'N/A'}
                </div>
              </div>
              <div className="p-3 bg-neutral-900 rounded border border-neutral-800">
                <div className="text-[11px] text-neutral-400">Reported Confidence</div>
                <div className="text-lg font-mono tabular-nums font-bold text-neutral-200 mt-1">
                  {observation.confidence}% ({observation.confidenceCategory})
                </div>
              </div>
            </div>
          </div>

          {/* Quality Warnings */}
          {observation.qualityWarnings && observation.qualityWarnings.length > 0 && (
            <div className="p-3 bg-amber-950/30 border border-amber-900/50 rounded-lg flex items-start gap-2.5 text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">Data Quality Advisory:</span>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-amber-200/90 text-[11px]">
                  {observation.qualityWarnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Raw Preserved Sensor Metadata (for operational transparency) */}
          {observation.rawSourceFields && Object.keys(observation.rawSourceFields).length > 0 && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-300">Preserved Raw Sensor Fields (NASA FIRMS Payload)</span>
                <span className="text-[10px] font-mono text-neutral-400">{Object.keys(observation.rawSourceFields).length} keys</span>
              </div>
              <div className="bg-neutral-900 p-2.5 rounded border border-neutral-850 font-mono text-[10px] text-neutral-300 overflow-x-auto max-h-36">
                <pre>{JSON.stringify(observation.rawSourceFields, null, 2)}</pre>
              </div>
            </div>
          )}

          {/* Attribution and Retrieval footer */}
          <div className="text-[11px] text-neutral-400 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800 pt-3">
            <div>
              <span>Source Provider: </span>
              <strong className="text-neutral-200">{observation.sourceProvider}</strong>
              <span className="mx-1.5">·</span>
              <span>Sensor: </span>
              <strong className="text-neutral-200">{observation.satellite} ({observation.sensorFamily})</strong>
            </div>
            <div>
              <span>Retrieved: </span>
              <span className="font-mono tabular-nums text-neutral-300">
                {new Date(observation.ingestionTimestampUtc).toUTCString().slice(5, 25)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
