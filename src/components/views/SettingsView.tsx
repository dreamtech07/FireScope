/**
 * FireScope — Settings & Environment Configuration View
 */

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Key,
  ShieldAlert,
  Database,
  RotateCcw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Server,
  Info,
  Play,
  Layers,
  Radio,
  Map,
  HelpCircle,
} from 'lucide-react';

interface SettingsViewProps {
  onResetData: () => void;
  observationCount: number;
  dataMode?: 'SYNTHETIC_DEMO' | 'LIVE_FIRMS';
  apiOnlyMode?: boolean;
  onToggleApiOnlyMode?: (enabled: boolean) => void;
  onToggleMode?: (mode: 'synthetic' | 'api') => void;
  onOpenFirmsQuery?: () => void;
  userApiKey?: string;
  onSaveApiKey?: (key: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onResetData,
  observationCount,
  dataMode = 'SYNTHETIC_DEMO',
  apiOnlyMode = false,
  onToggleApiOnlyMode,
  onToggleMode,
  onOpenFirmsQuery,
  userApiKey = '',
  onSaveApiKey,
}) => {
  const [firmsStatus, setFirmsStatus] = useState<{
    configured: boolean;
    provider: string;
    environmentVariable?: string;
    supportedSensors?: any[];
    cacheStats?: { entriesCount: number; ttlMinutes: number };
    rateLimitNotice?: string;
  }>({
    configured: Boolean(userApiKey),
    provider: 'NASA FIRMS',
  });

  const [inputKey, setInputKey] = useState(userApiKey);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keySavedToast, setKeySavedToast] = useState(false);
  const [isCheckingBackend, setIsCheckingBackend] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    success: boolean;
    statusCode: number;
    message: string;
    durationMs: number;
    responsePayload?: any;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const isLive = apiOnlyMode || dataMode === 'LIVE_FIRMS';

  useEffect(() => {
    setInputKey(userApiKey);
  }, [userApiKey]);

  useEffect(() => {
    checkBackendFirmsStatus();
  }, [userApiKey]);

  const checkBackendFirmsStatus = async () => {
    setIsCheckingBackend(true);
    try {
      const url = userApiKey 
        ? `/api/firms/status?mapKey=${encodeURIComponent(userApiKey)}`
        : '/api/firms/status';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setFirmsStatus(data);
      }
    } catch {
      // Offline fallback
    } finally {
      setIsCheckingBackend(false);
    }
  };

  const handleSaveKey = () => {
    const trimmed = inputKey.trim();
    if (onSaveApiKey) {
      onSaveApiKey(trimmed);
      setKeySavedToast(true);
      setTimeout(() => setKeySavedToast(false), 3000);
    }
  };

  const handleClearKey = () => {
    setInputKey('');
    if (onSaveApiKey) {
      onSaveApiKey('');
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const start = performance.now();
    const effectiveKey = inputKey.trim() || userApiKey.trim();

    try {
      const res = await fetch('/api/firms/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'VIIRS_NOAA20_NRT',
          bbox: '-124.5,32.5,-114.1,42.0',
          dayRange: 1,
          mapKey: effectiveKey || undefined,
        }),
      });

      const duration = Math.round(performance.now() - start);
      const data = await res.json();

      setTestResult({
        tested: true,
        success: res.ok && data.success !== false,
        statusCode: res.status,
        message: data.configured === false 
          ? 'Tested: FIRMS_MAP_KEY is unconfigured. Enter a NASA MAP_KEY or use synthetic baseline mode.'
          : data.error || `Successfully queried NASA FIRMS in ${duration}ms (${data.recordCount || 0} observations returned).`,
        durationMs: duration,
        responsePayload: data,
      });
    } catch (err: unknown) {
      const duration = Math.round(performance.now() - start);
      setTestResult({
        tested: true,
        success: false,
        statusCode: 500,
        message: err instanceof Error ? err.message : 'Network test failure',
        durationMs: duration,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSwitchMode = (targetMode: 'synthetic' | 'api') => {
    if (onToggleMode) {
      onToggleMode(targetMode);
    } else if (onToggleApiOnlyMode) {
      onToggleApiOnlyMode(targetMode === 'api');
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
          <Settings className="w-4 h-4 text-amber-500" />
          <span>System Settings & Data Provenance</span>
        </h2>
        <p className="text-xs text-neutral-400 mt-1">
          Configure ingestion modes, API connections, and data integrity parameters for FireScope.
        </p>
      </div>

      {/* Ingestion Mode: Baseline vs Strict API-Only Mode Switch Card */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-amber-500" />
            <div>
              <h3 className="text-xs font-semibold text-neutral-200">
                Operational Telemetry Pipeline Mode
              </h3>
              <p className="text-[11px] text-neutral-400">
                Toggle between synthetic baseline scenarios and live API telemetry
              </p>
            </div>
          </div>

          <span
            className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded border ${
              isLive
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
            }`}
          >
            {isLive ? 'API KEY MODE ACTIVE' : 'DEMONSTRATION BASELINE ACTIVE'}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 bg-neutral-950 p-3.5 rounded border border-neutral-850">
          <div className="space-y-1 max-w-xl">
            <div className="text-xs font-semibold text-neutral-200">
              Active Data Pipeline: {isLive ? 'Live NASA FIRMS API' : 'Calibrated Synthetic Baseline'}
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              {isLive
                ? 'In API Key Mode, FireScope displays live satellite detections retrieved from NASA FIRMS. All maps, clusters, and priority queues update with real observational telemetry.'
                : 'In Demonstration Baseline Mode, FireScope displays curated multi-satellite benchmark scenarios across California, Australia, Spain, Brazil, and Canada.'}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Synchronized Segmented Switch Pill */}
            <div className="flex items-center bg-neutral-900 border border-neutral-800 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => handleSwitchMode('synthetic')}
                className={`px-3 py-1.5 rounded-md font-medium text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                  !isLive
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Switch to Demonstration Baseline Mode"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${!isLive ? 'bg-amber-400' : 'bg-neutral-600'}`} />
                <span>Synthetic</span>
              </button>

              {/* Slider Toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={isLive}
                onClick={() => handleSwitchMode(isLive ? 'synthetic' : 'api')}
                className={`relative inline-flex h-6 w-11 mx-1 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isLive ? 'bg-emerald-600' : 'bg-neutral-700'
                }`}
                title={`Switch to ${isLive ? 'Synthetic Baseline' : 'Live API Key'}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isLive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>

              <button
                type="button"
                onClick={() => handleSwitchMode('api')}
                className={`px-3 py-1.5 rounded-md font-medium text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                  isLive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Switch to Live NASA FIRMS API mode"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'}`} />
                <span>API Key</span>
              </button>
            </div>

            {isLive && onOpenFirmsQuery && (
              <button
                onClick={onOpenFirmsQuery}
                className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition-colors shadow-sm cursor-pointer"
              >
                Query NASA Now
              </button>
            )}
          </div>
        </div>
      </div>

      {/* NASA FIRMS MAP_KEY Configuration Card */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <Key className="w-4 h-4 text-amber-500" />
            <div>
              <h3 className="text-xs font-semibold text-neutral-200">
                NASA FIRMS MAP_KEY Credential Management
              </h3>
              <p className="text-[11px] text-neutral-400">
                Configure your NASA Earthdata MAP_KEY to unlock direct satellite streaming
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded border ${
              firmsStatus.configured || userApiKey
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
            }`}>
              {firmsStatus.configured || userApiKey ? 'Key Active (Operational)' : 'No Key (Demo Mode)'}
            </span>
            <button
              onClick={checkBackendFirmsStatus}
              disabled={isCheckingBackend}
              className="text-xs text-neutral-400 hover:text-neutral-200 p-1 cursor-pointer"
              title="Re-check key status"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isCheckingBackend ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="text-xs text-neutral-400 space-y-3 leading-relaxed">
          <p>
            Enter your free NASA FIRMS MAP_KEY below to query live VIIRS and MODIS fire detections. Keys are stored locally in your browser and securely proxied to NASA EOSDIS:
          </p>

          {/* Interactive Key Input Bar */}
          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-2.5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showKeyInput ? 'text' : 'password'}
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder="Enter NASA FIRMS MAP_KEY (32-character hex key)..."
                  className="w-full bg-neutral-900 border border-neutral-750 focus:border-amber-500 text-neutral-200 text-xs font-mono px-3 py-2 rounded-md outline-none pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowKeyInput(!showKeyInput)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400 hover:text-neutral-200 px-1.5 py-0.5 rounded bg-neutral-800 cursor-pointer"
                >
                  {showKeyInput ? 'Hide' : 'Show'}
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSaveKey}
                  className="px-3 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save & Activate</span>
                </button>
                {inputKey && (
                  <button
                    type="button"
                    onClick={handleClearKey}
                    className="px-2.5 py-2 rounded-md bg-neutral-850 hover:bg-neutral-800 text-neutral-300 text-xs transition-colors cursor-pointer"
                    title="Clear saved key"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {keySavedToast && (
              <div className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>MAP_KEY saved successfully and activated for NASA FIRMS queries!</span>
              </div>
            )}

            <div className="text-[10px] text-neutral-400 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-850">
              <span>
                Active Key Source: {userApiKey ? 'Client Browser Storage' : firmsStatus.environmentVariable ? `Server Environment (${firmsStatus.environmentVariable})` : 'None (Operating in Demo Mode)'}
              </span>
              <span>
                Format: 32 hex digits (e.g. <code>a1b2c3d4e5f6...</code>)
              </span>
            </div>
          </div>

          <p className="text-[11px]">
            Don't have a key? Register in 30 seconds for free at the official NASA FIRMS portal:{' '}
            <a
              href="https://firms.modaps.eosdis.nasa.gov/api/map_key"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:underline inline-flex items-center gap-1"
            >
              <span>https://firms.modaps.eosdis.nasa.gov/api/map_key</span>
              <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>

          {/* Test Connection Button & Result */}
          <div className="pt-2 border-t border-neutral-850 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-neutral-200">NASA FIRMS API Connection Diagnostic</div>
              <p className="text-[11px] text-neutral-400">
                Pings server-side proxy <code>/api/firms/query</code> with your active key to verify live responses.
              </p>
            </div>

            <button
              onClick={handleTestConnection}
              disabled={isTesting}
              className="px-3 py-1.5 rounded bg-neutral-950 border border-neutral-800 hover:bg-neutral-800 text-neutral-200 font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Play className={`w-3.5 h-3.5 fill-current ${isTesting ? 'animate-pulse' : ''}`} />
              <span>{isTesting ? 'Testing Proxy...' : 'Run Integration Test'}</span>
            </button>
          </div>

          {testResult && (
            <div className={`p-3 rounded border text-xs space-y-1.5 ${
              testResult.success
                ? 'bg-neutral-950 border-neutral-800 text-neutral-200'
                : 'bg-amber-950/20 border-amber-900/40 text-amber-300'
            }`}>
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="flex items-center gap-1.5">
                  {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                  <span>Status: HTTP {testResult.statusCode}</span>
                </span>
                <span className="text-neutral-400">{testResult.durationMs}ms latency</span>
              </div>
              <p className="text-[11px] leading-relaxed">{testResult.message}</p>
            </div>
          )}
        </div>
      </div>

      {/* Dataset & Memory Management Card */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <Database className="w-4 h-4 text-neutral-400" />
            <div>
              <h3 className="text-xs font-semibold text-neutral-200">
                Application Data State
              </h3>
              <p className="text-[11px] text-neutral-400">
                Manage loaded observation records and reset to baseline demonstration data
              </p>
            </div>
          </div>
          <span className="text-xs font-mono tabular-nums text-neutral-300">
            {observationCount} records in memory
          </span>
        </div>

        <div className="flex items-center justify-between text-xs pt-1">
          <div>
            <div className="font-medium text-neutral-200">Restore Baseline Synthetic Dataset</div>
            <p className="text-[11px] text-neutral-400">
              Reloads the curated multi-satellite benchmark scenarios across California, Australia, Spain, Brazil, and Canada.
            </p>
          </div>
          <button
            onClick={onResetData}
            className="px-3 py-1.5 rounded bg-neutral-950 border border-neutral-800 hover:bg-neutral-800 text-neutral-200 font-medium transition-colors flex items-center gap-1.5 shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo Records</span>
          </button>
        </div>
      </div>



      {/* Geospatial Basemap Engine (Fixing Question 2) */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-3 text-xs">
        <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
          <div className="flex items-center gap-2 text-neutral-200 font-semibold">
            <Map className="w-4 h-4 text-emerald-400" />
            <span>Geospatial Basemap Layers (Zero API Key Required)</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            KEYLESS / OPERATIONAL
          </span>
        </div>
        <p className="text-neutral-400 text-[11px] leading-relaxed">
          The interactive map now runs on 100% free, zero-key public tile services:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px]">
          <div className="bg-neutral-950 p-2.5 rounded border border-neutral-850">
            <span className="font-semibold text-neutral-200 block">Esri Dark Gray Canvas</span>
            <span className="text-neutral-400 text-[10px]">Default dark high-contrast theme; no watermark, no API key needed.</span>
          </div>
          <div className="bg-neutral-950 p-2.5 rounded border border-neutral-850">
            <span className="font-semibold text-neutral-200 block">Esri World Imagery</span>
            <span className="text-neutral-400 text-[10px]">High-resolution optical satellite terrain to inspect landcover.</span>
          </div>
          <div className="bg-neutral-950 p-2.5 rounded border border-neutral-850">
            <span className="font-semibold text-neutral-200 block">OpenStreetMap</span>
            <span className="text-neutral-400 text-[10px]">Standard cartographic street and topographic reference layer.</span>
          </div>
        </div>
      </div>

      {/* Legal & Attribution Details */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-3 text-xs">
        <div className="flex items-center gap-2 text-neutral-200 font-semibold pb-1 border-b border-neutral-800">
          <Info className="w-4 h-4 text-neutral-400" />
          <span>Source Attribution & Operational Boundaries</span>
        </div>
        <div className="space-y-2 text-neutral-400 text-[11px] leading-relaxed">
          <p>
            <strong>FireScope</strong> utilizes algorithms designed for processing NASA FIRMS (Fire Information for Resource Management System) NRT (Near Real-Time) active fire data provided by LANCE (Land, Atmosphere Near real-time Capability for EOS).
          </p>
          <p>
            <strong>Satellite Constellations:</strong> Suomi-NPP VIIRS, NOAA-20 VIIRS, NOAA-21 VIIRS, Terra MODIS, and Aqua MODIS.
          </p>
          <p>
            <strong>Disclaimers:</strong> FireScope is an analytical research and triage decision-support application. It does not provide automated emergency dispatch, nor does it confirm fire ground-truth. Analysts must verify anomalous detections against meteorological context and regional terrestrial ground assets.
          </p>
        </div>
      </div>
    </div>
  );
};
