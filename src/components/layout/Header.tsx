/**
 * FireScope — Top Navigation Header
 * Strictly follows the 1-row, 3-zone Top Bar Contract
 */

import React from 'react';
import { RefreshCw, Download, Flame, Satellite, CheckCircle2, Printer, Radio } from 'lucide-react';

interface HeaderProps {
  dataMode: 'SYNTHETIC_DEMO' | 'LIVE_FIRMS';
  apiOnlyMode?: boolean;
  onToggleMode?: (mode: 'synthetic' | 'api') => void;
  lastRetrievalUtc: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  onExportCsv: () => void;
  onOpenFirmsQuery: () => void;
  onOpenPrintReport?: () => void;
  activeObservationCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  dataMode,
  apiOnlyMode = false,
  onToggleMode,
  lastRetrievalUtc,
  isRefreshing,
  onRefresh,
  onExportCsv,
  onOpenFirmsQuery,
  onOpenPrintReport,
  activeObservationCount,
}) => {
  const isApiActive = apiOnlyMode || dataMode === 'LIVE_FIRMS';

  return (
    <header className="h-14 bg-neutral-950 border-b border-neutral-800 px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-6 shrink-0 select-none">
      {/* Zone 1: Brand Wordmark (Single text element) */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
          <Flame className="w-4 h-4" />
        </div>
        <div className="flex items-baseline gap-2.5">
          <span className="text-base font-bold tracking-tight text-neutral-100 whitespace-nowrap">
            FireScope
          </span>
          <span className="text-xs text-neutral-400 hidden xl:inline whitespace-nowrap">
            Multi-Satellite Observation & Triage
          </span>
        </div>
      </div>

      {/* Zone 2: Mode Switch & Telemetry */}
      <div className="flex items-center gap-3 text-xs text-neutral-400">
        {/* Synchronized Mode Switch Pill */}
        <div className="flex items-center bg-neutral-900 border border-neutral-800 p-0.5 rounded-lg text-xs shrink-0 shadow-inner">
          <button
            type="button"
            onClick={() => onToggleMode && onToggleMode('synthetic')}
            className={`px-2.5 py-1 rounded-md font-medium text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
              !isApiActive
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="Demonstration Baseline Mode: Curated multi-satellite benchmark scenarios"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${!isApiActive ? 'bg-amber-400' : 'bg-neutral-600'}`} />
            <span>Synthetic</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleMode && onToggleMode('api')}
            className={`px-2.5 py-1 rounded-md font-medium text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
              isApiActive
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="Live API Key Mode: Stream real-time detections from NASA FIRMS"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isApiActive ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'}`} />
            <span>API Key</span>
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-3">
          <span aria-hidden="true" className="text-neutral-700">·</span>

          <div className="flex items-center gap-1">
            <span>Active:</span>
            <span className="font-mono tabular-nums font-semibold text-neutral-200">
              {activeObservationCount}
            </span>
            <span className="text-[11px] text-neutral-400">
              {isApiActive ? '(NASA Live)' : '(Baseline)'}
            </span>
          </div>

          <span aria-hidden="true" className="text-neutral-700">·</span>

          <div className="flex items-center gap-1">
            <span>Ingest:</span>
            <span className="font-mono tabular-nums text-neutral-400">
              {lastRetrievalUtc ? new Date(lastRetrievalUtc).toUTCString().slice(17, 25) + ' UTC' : 'Pending'}
            </span>
          </div>
        </div>
      </div>

      {/* Zone 3: Primary Action & Controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={onOpenFirmsQuery}
          className="h-8 px-3 rounded-md bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          title="Configure and execute live NASA FIRMS active fire query"
        >
          <Satellite className="w-3.5 h-3.5" />
          <span>Query NASA FIRMS</span>
        </button>

        {onOpenPrintReport && (
          <button
            onClick={onOpenPrintReport}
            className="h-8 px-3 rounded-md bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-xs font-medium text-neutral-200 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Open printable incident evidence report"
          >
            <Printer className="w-3.5 h-3.5 text-neutral-400" />
            <span className="hidden sm:inline">Print Dossier</span>
          </button>
        )}

        <button
          onClick={onExportCsv}
          className="h-8 px-3 rounded-md bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-xs font-medium text-neutral-200 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          title="Export current observations to CSV"
        >
          <Download className="w-3.5 h-3.5 text-neutral-400" />
          <span>Export CSV</span>
        </button>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="h-8 px-3 rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-xs font-medium text-white transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm"
          title="Refresh satellite observation feeds"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Ingesting...' : 'Refresh'}</span>
        </button>
      </div>
    </header>
  );
};
