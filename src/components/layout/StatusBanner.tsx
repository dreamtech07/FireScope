/**
 * FireScope — Status & Analyst Disclaimer Banner
 */

import React, { useState } from 'react';
import { AlertCircle, X, ShieldAlert } from 'lucide-react';

interface StatusBannerProps {
  apiOnlyMode?: boolean;
  dataMode?: 'SYNTHETIC_DEMO' | 'LIVE_FIRMS';
}

export const StatusBanner: React.FC<StatusBannerProps> = ({ apiOnlyMode = false, dataMode = 'SYNTHETIC_DEMO' }) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const isLive = apiOnlyMode || dataMode === 'LIVE_FIRMS';

  return (
    <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-2 text-xs text-neutral-300">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <ShieldAlert className={`w-4 h-4 shrink-0 ${isLive ? 'text-emerald-400' : 'text-amber-500'}`} />
          <p className="truncate">
            <strong className={`font-medium ${isLive ? 'text-emerald-400' : 'text-amber-400'}`}>
              Analyst Notice:
            </strong>{' '}
            {isLive ? (
              <span>
                <strong>NASA FIRMS API Key Mode Active:</strong> Baseline synthetic data is excluded. Detections and event clusters are derived strictly from NASA FIRMS API telemetry or operational CSV imports.
              </span>
            ) : (
              <span>
                FireScope is operating in <strong>Demonstration Baseline Mode</strong> with calibrated multi-satellite benchmark scenarios. Use the toggle switch in the navbar or status panel to switch to live API data.
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-neutral-400 hover:text-neutral-200 transition-colors p-1"
          aria-label="Dismiss banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
