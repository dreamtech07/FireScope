/**
 * FireScope — NASA FIRMS Operational Satellite Query Dialog
 * 
 * Allows analysts to configure:
 * 1. Satellite product (VIIRS NOAA-20/21/SNPP 375m, MODIS Terra/Aqua 1km)
 * 2. Region / Geographic Bounding Box (Presets or custom coordinates)
 * 3. Observation Period (1 to 5 days, optional date)
 * 4. Error states: Missing key, invalid credentials, rate limit, timeout, empty results
 */

import React, { useState, useEffect } from 'react';
import {
  Satellite,
  X,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Calendar,
  Layers,
  MapPin,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { FireObservation, FIRMSSourceOption, FIRMSRegionPreset } from '../../types/observation';

interface FirmsQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onObservationsLoaded: (observations: FireObservation[], sourceInfo: string) => void;
  onSwitchToDemoMode: () => void;
  userApiKey?: string;
  onSaveApiKey?: (key: string) => void;
}

export const FirmsQueryModal: React.FC<FirmsQueryModalProps> = ({
  isOpen,
  onClose,
  onObservationsLoaded,
  onSwitchToDemoMode,
  userApiKey = '',
  onSaveApiKey,
}) => {
  // Service status
  const [serviceStatus, setServiceStatus] = useState<{
    configured: boolean;
    provider: string;
    rateLimitNotice?: string;
  } | null>(null);

  // Key input
  const [localKey, setLocalKey] = useState(userApiKey);

  // Available options from server
  const [sources, setSources] = useState<FIRMSSourceOption[]>([]);
  const [regionPresets, setRegionPresets] = useState<FIRMSRegionPreset[]>([]);

  // Query selections (Defaults to All Constellations: VIIRS + MODIS, and India National Bounding Box)
  const [selectedSource, setSelectedSource] = useState('MULTI_CONSTELLATION');
  const [selectedRegionId, setSelectedRegionId] = useState('india_all');
  const [customBbox, setCustomBbox] = useState('68.1,8.0,97.4,37.1');
  const [isCustomBbox, setIsCustomBbox] = useState(false);
  const [dayRange, setDayRange] = useState(1);
  const [specificDate, setSpecificDate] = useState('');

  // Execution state
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  useEffect(() => {
    setLocalKey(userApiKey);
  }, [userApiKey]);

  useEffect(() => {
    if (isOpen) {
      fetchServiceStatusAndOptions();
    }
  }, [isOpen, userApiKey]);

  const fetchServiceStatusAndOptions = async () => {
    try {
      const statusUrl = userApiKey 
        ? `/api/firms/status?mapKey=${encodeURIComponent(userApiKey)}` 
        : '/api/firms/status';
      const [statusRes, optionsRes] = await Promise.all([
        fetch(statusUrl),
        fetch('/api/firms/options'),
      ]);

      if (statusRes.ok) {
        const sData = await statusRes.json();
        setServiceStatus(sData);
      }

      if (optionsRes.ok) {
        const oData = await optionsRes.json();
        setSources(oData.sensors || []);
        setRegionPresets(oData.regionPresets || []);
      }
    } catch {
      // Fallback
    }
  };

  const handleRegionPresetChange = (presetId: string) => {
    setSelectedRegionId(presetId);
    if (presetId === 'custom') {
      setIsCustomBbox(true);
    } else {
      setIsCustomBbox(false);
      const found = regionPresets.find(r => r.id === presetId);
      if (found) {
        setCustomBbox(found.bbox);
      }
    }
  };

  const handleExecuteQuery = async (bypassCache: boolean = false) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessInfo(null);

    const activePreset = regionPresets.find(r => r.id === selectedRegionId);
    const regionName = isCustomBbox ? 'Custom Bounding Box' : activePreset?.name || 'Selected Region';
    const countryName = activePreset?.country || 'Global';
    const effectiveKey = (localKey || userApiKey || '').trim();

    try {
      const response = await fetch('/api/firms/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: selectedSource,
          bbox: customBbox.trim(),
          dayRange,
          date: specificDate || undefined,
          regionName,
          countryName,
          bypassCache,
          mapKey: effectiveKey || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.code === 'MISSING_KEY') {
          setErrorMessage('NASA FIRMS MAP_KEY is required to query live satellites. Please enter your MAP_KEY below or in Settings.');
        } else {
          setErrorMessage(data.error || 'Failed to fetch NASA FIRMS active fire data');
        }
        setIsLoading(false);
        return;
      }

      if (effectiveKey && onSaveApiKey) {
        onSaveApiKey(effectiveKey);
      }

      if (data.observations && data.observations.length > 0) {
        onObservationsLoaded(data.observations, `${data.sensorLabel} · ${regionName}`);
        setSuccessInfo(`Successfully ingested ${data.recordCount} live active-fire observations ${data.cached ? '(Cached)' : '(Fresh Ingest)'}.`);
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setErrorMessage(data.message || 'No active fire thermal pixels detected in the requested spatial bounding box and observation window.');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error communicating with FireScope server.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-2xl w-full flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Satellite className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-100">NASA FIRMS Operational Feed Ingestion</h3>
              <p className="text-[11px] text-neutral-400">Direct query via NASA EOSDIS LANCE Active Fire Services</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
          {/* Key Status & Direct Input */}
          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-neutral-200 text-xs">NASA FIRMS MAP_KEY</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                localKey || serviceStatus?.configured
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
              }`}>
                {localKey || serviceStatus?.configured ? 'Key Configured' : 'Key Needed for Live Query'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="password"
                value={localKey}
                onChange={(e) => setLocalKey(e.target.value)}
                placeholder="Paste 32-character NASA FIRMS MAP_KEY..."
                className="flex-1 bg-neutral-900 border border-neutral-800 focus:border-amber-500 text-neutral-200 text-xs font-mono px-3 py-1.5 rounded outline-none"
              />
              {localKey && onSaveApiKey && (
                <button
                  type="button"
                  onClick={() => onSaveApiKey(localKey.trim())}
                  className="px-2.5 py-1.5 rounded bg-neutral-800 hover:bg-neutral-750 text-neutral-200 text-xs transition-colors cursor-pointer"
                >
                  Save
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-[10px] text-neutral-400">
              <a
                href="https://firms.modaps.eosdis.nasa.gov/api/map_key"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:underline inline-flex items-center gap-1"
              >
                <span>Get a free NASA MAP_KEY</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={() => {
                  onSwitchToDemoMode();
                  onClose();
                }}
                className="text-neutral-400 hover:text-neutral-200 underline"
              >
                Use Synthetic Baseline instead
              </button>
            </div>
          </div>

          {/* Form Controls */}
          <div className="space-y-3.5">
            {/* Sensor Selection */}
            <div>
              <label className="text-neutral-300 font-medium block mb-1.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-neutral-400" />
                <span>1. Supported Satellite Sensor Product</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {sources.map(src => {
                  const isSelected = selectedSource === src.id;
                  return (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => setSelectedSource(src.id)}
                      className={`p-2.5 rounded border text-left transition-colors ${
                        isSelected
                          ? 'bg-neutral-950 border-amber-500/60 text-neutral-100'
                          : 'bg-neutral-950/50 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-neutral-200">{src.id}</span>
                        <span className="font-mono text-[10px] text-amber-500">{src.resolution}</span>
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5 truncate">{src.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Geographic Region / Bounding Box */}
            <div>
              <label className="text-neutral-300 font-medium block mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                <span>2. Geographic Area / Bounding Box</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {regionPresets.map(preset => {
                  const isSelected = selectedRegionId === preset.id && !isCustomBbox;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleRegionPresetChange(preset.id)}
                      className={`p-2.5 rounded border text-left transition-colors ${
                        isSelected
                          ? 'bg-neutral-950 border-amber-500/60 text-neutral-100'
                          : 'bg-neutral-950/50 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      <div className="font-semibold text-neutral-200">{preset.name}</div>
                      <div className="font-mono text-[10px] text-neutral-400 mt-0.5 truncate">{preset.bbox}</div>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => handleRegionPresetChange('custom')}
                  className={`p-2.5 rounded border text-left transition-colors ${
                    isCustomBbox
                      ? 'bg-neutral-950 border-amber-500/60 text-neutral-100'
                      : 'bg-neutral-950/50 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                  }`}
                >
                  <div className="font-semibold text-neutral-200">Custom Coordinate Box</div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">Specify west,south,east,north</div>
                </button>
              </div>

              {isCustomBbox && (
                <div className="mt-2 space-y-1">
                  <input
                    type="text"
                    value={customBbox}
                    onChange={e => setCustomBbox(e.target.value)}
                    placeholder="e.g. -124.5,32.5,-114.1,42.0"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 font-mono text-neutral-200 outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-neutral-400">Order: west (min lon), south (min lat), east (max lon), north (max lat)</p>
                </div>
              )}
            </div>

            {/* Time Window (Day Range) */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-neutral-300 font-medium block mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                  <span>3. Observation Period</span>
                </label>
                <select
                  value={dayRange}
                  onChange={e => setDayRange(Number(e.target.value))}
                  className="w-full bg-neutral-950 border border-neutral-800 text-neutral-200 rounded px-2.5 py-1.5 outline-none focus:border-amber-500"
                >
                  <option value={1}>Past 24 Hours (1 Day)</option>
                  <option value={2}>Past 48 Hours (2 Days)</option>
                  <option value={3}>Past 72 Hours (3 Days)</option>
                  <option value={5}>Past 5 Days (API Max Range)</option>
                </select>
              </div>

              <div>
                <label className="text-neutral-300 font-medium block mb-1">
                  Specific Historical Date (Optional)
                </label>
                <input
                  type="date"
                  value={specificDate}
                  onChange={e => setSpecificDate(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 text-neutral-200 rounded px-2.5 py-1.5 outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Feedback states */}
          {errorMessage && (
            <div className="p-3 bg-rose-950/30 border border-rose-900/50 rounded flex items-start gap-2 text-rose-300 text-[11px]">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successInfo && (
            <div className="p-3 bg-emerald-950/30 border border-emerald-900/50 rounded flex items-center gap-2 text-emerald-300 text-[11px]">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successInfo}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-neutral-800 flex items-center justify-between bg-neutral-950">
          <div className="text-[11px] text-neutral-400">
            <span>NASA Rate Limit: 5,000 / 10m · 15m Cache</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={() => handleExecuteQuery(true)}
              disabled={isLoading}
              className="px-3 py-1.5 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-200 transition-colors flex items-center gap-1.5 font-medium disabled:opacity-50"
              title="Force cache bypass"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Force Ingest</span>
            </button>

            <button
              onClick={() => handleExecuteQuery(false)}
              disabled={isLoading}
              className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isLoading ? 'Querying NASA...' : 'Fetch Live Hotspots'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
