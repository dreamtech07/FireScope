/**
 * FireScope — Visible Data-Source Status Panel
 * 
 * Provides an operational HUD displaying:
 * - Direct satellite telemetry provider status (NASA FIRMS / Live vs Demo)
 * - Environmental weather provider status (Open-Meteo / Active Free)
 * - Optical reflectance provider status (NASA GIBS / Active Free)
 * - Rate limit budget and in-memory cache status
 * - Offline / Zero-credential readiness confirmation
 */

import React, { useState } from 'react';
import {
  Database,
  Radio,
  CloudSun,
  Flame,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  KeyRound,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

interface DataSourceStatusPanelProps {
  dataMode: 'SYNTHETIC_DEMO' | 'LIVE_FIRMS';
  apiOnlyMode?: boolean;
  onToggleMode?: (mode: 'synthetic' | 'api') => void;
  lastRetrievalUtc: string;
  activeObservationCount: number;
  onRefresh?: () => void;
  onOpenQueryModal?: () => void;
  userApiKey?: string;
  onSaveApiKey?: (key: string) => void;
  configuredFeedLabel?: string;
}

export const DataSourceStatusPanel: React.FC<DataSourceStatusPanelProps> = ({
  dataMode,
  apiOnlyMode = false,
  onToggleMode,
  lastRetrievalUtc,
  activeObservationCount,
  onRefresh,
  onOpenQueryModal,
  userApiKey = '',
  onSaveApiKey,
  configuredFeedLabel,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [panelKey, setPanelKey] = useState(userApiKey);
  const [showKeyInput, setShowKeyInput] = useState(!userApiKey);

  const isLive = apiOnlyMode || dataMode === 'LIVE_FIRMS';

  const handleSaveInlineKey = () => {
    if (onSaveApiKey && panelKey.trim()) {
      onSaveApiKey(panelKey.trim());
      setShowKeyInput(false);
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden text-xs transition-all shadow-sm">
      {/* Collapsed Bar / Summary Strip */}
      <div className="p-3 flex flex-wrap items-center justify-between gap-3 bg-neutral-950/70 border-b border-neutral-850">
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          {/* Status Indicator & Title */}
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isLive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className="font-semibold text-neutral-200">
              {isLive ? 'NASA FIRMS API Key Mode' : 'Demonstration Baseline Mode'}
            </span>
          </div>

          {/* Small Mode Switch: Synthetic <-> API Key */}
          {onToggleMode && (
            <div className="flex items-center gap-2 bg-neutral-900/90 border border-neutral-800 p-0.5 rounded-lg text-[11px]">
              <button
                type="button"
                onClick={() => onToggleMode('synthetic')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  !isLive
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Switch to Demonstration Baseline Mode (Synthetic multi-satellite data)"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${!isLive ? 'bg-amber-400' : 'bg-neutral-600'}`} />
                <span>Synthetic</span>
              </button>

              {/* Slider Toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={isLive}
                onClick={() => onToggleMode(isLive ? 'synthetic' : 'api')}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isLive ? 'bg-emerald-600' : 'bg-neutral-700'
                }`}
                title={`Currently in ${isLive ? 'API Key Mode' : 'Demonstration Baseline'}. Click to switch to ${isLive ? 'Synthetic' : 'API Key'}`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    isLive ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>

              <button
                type="button"
                onClick={() => onToggleMode('api')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  isLive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Switch to Live NASA FIRMS API mode (Real satellite data)"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'}`} />
                <span>API Key</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 text-neutral-400 font-mono text-[11px]">
            <span>{activeObservationCount} records active</span>
            <span>·</span>
            <span>Retrieved: {lastRetrievalUtc ? lastRetrievalUtc.slice(11, 19) + ' UTC' : 'Pending'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenQueryModal && (
            <button
              onClick={onOpenQueryModal}
              className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-750 text-neutral-200 text-[11px] font-medium transition-colors cursor-pointer"
            >
              Configure Feed
            </button>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-200 px-2 py-1 rounded transition-colors cursor-pointer"
          >
            <span>{isExpanded ? 'Hide Data Providers' : 'Data Providers (3 Active)'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Auto-Configured Feed Bar (Sensors: VIIRS & MODIS, Coordinates: India) */}
      <div className="px-3.5 py-2 bg-neutral-950/40 border-b border-neutral-850 flex flex-wrap items-center justify-between gap-2.5 text-[11px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-neutral-300 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-amber-500" />
            <span>Feed Configuration:</span>
          </span>
          <span className="text-neutral-300 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded font-mono">
            {configuredFeedLabel || 'All Supported Satellites (VIIRS NOAA-20/21/SNPP 375m + MODIS Terra/Aqua 1km)'}
          </span>
          <span className="text-neutral-400">·</span>
          <span className="text-amber-300/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded font-mono">
            🇮🇳 India Coordinates: 68.1°E to 97.4°E, 8.0°N to 37.1°N
          </span>
        </div>

        {/* Quick Inline MAP_KEY Action */}
        {isLive && (
          <div className="flex items-center gap-2">
            {!userApiKey ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="password"
                  value={panelKey}
                  onChange={e => setPanelKey(e.target.value)}
                  placeholder="Paste NASA MAP_KEY..."
                  className="bg-neutral-900 border border-neutral-800 focus:border-amber-500 text-neutral-200 px-2 py-1 rounded text-[11px] font-mono outline-none w-44"
                />
                <button
                  type="button"
                  onClick={handleSaveInlineKey}
                  disabled={!panelKey.trim()}
                  className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Stream Live
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-mono text-[10px] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Key Connected</span>
                </span>
                {onRefresh && (
                  <button
                    onClick={onRefresh}
                    className="p-1 rounded hover:bg-neutral-800 text-neutral-300 transition-colors cursor-pointer"
                    title="Refresh live telemetry feed"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expanded Multi-Provider Telemetry Details */}
      {isExpanded && (
        <div className="p-4 border-t border-neutral-800 space-y-3 bg-neutral-900/90 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Provider 1: NASA FIRMS */}
            <div className="bg-neutral-950 p-3 rounded border border-neutral-850 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-amber-500" />
                  <span>NASA FIRMS API</span>
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                    isLive
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  }`}
                >
                  {isLive ? 'LIVE' : 'DEMO MODE'}
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Near real-time 375m VIIRS and 1km MODIS active fire detections.
              </p>
              <div className="text-[10px] font-mono text-neutral-500">
                Key: {isLive ? 'CONFIGURED IN SERVER' : 'OPTIONAL (Runs in Demo Mode)'}
              </div>
            </div>

            {/* Provider 2: Open-Meteo */}
            <div className="bg-neutral-950 p-3 rounded border border-neutral-850 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                  <CloudSun className="w-3.5 h-3.5 text-sky-400" />
                  <span>Open-Meteo Weather API</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                  ACTIVE / FREE
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Surface temperature, relative humidity, 10m wind direction vectors, and 24h rainfall.
              </p>
              <div className="text-[10px] font-mono text-neutral-500">
                Key: Zero-key public scientific access (CC BY 4.0)
              </div>
            </div>

            {/* Provider 3: NASA GIBS */}
            <div className="bg-neutral-950 p-3 rounded border border-neutral-850 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-rose-400" />
                  <span>NASA GIBS Optical WMS</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                  ACTIVE / FREE
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                250m pre/post event optical surface reflectance & False Color Bands 7-2-1 burn scars.
              </p>
              <div className="text-[10px] font-mono text-neutral-500">
                Key: Open OGC WMS/WMTS endpoints (Zero Key)
              </div>
            </div>
          </div>

          {/* Rate Limit & Offline Readiness Assurance */}
          <div className="bg-neutral-950/70 p-2.5 rounded border border-neutral-850 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-400">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong>Zero-Credential Guarantee:</strong> FireScope operates out-of-the-box with full synthetic benchmarks and open public endpoints. No credentials are required to evaluate or demonstrate features.
              </span>
            </div>
            <div className="text-[10px] font-mono text-neutral-500">
              Server Cache TTL: 15 min · Rate-Limit Protected
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
