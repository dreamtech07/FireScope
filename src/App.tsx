/**
 * FireScope — Multi-Satellite Fire Observation & Triage Dashboard
 * Main Application Shell
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { StatusBanner } from './components/layout/StatusBanner';
import { OverviewView } from './components/views/OverviewView';
import { FireMapView } from './components/views/FireMapView';
import { ObservationsView } from './components/views/ObservationsView';
import { PriorityQueueView } from './components/views/PriorityQueueView';
import { SatelliteComparisonView } from './components/views/SatelliteComparisonView';
import { ContextualEvidenceView } from './components/views/ContextualEvidenceView';
import { HistoricalAnalysisView } from './components/views/HistoricalAnalysisView';
import { EvaluationView } from './components/views/EvaluationView';
import { SettingsView } from './components/views/SettingsView';
import { ObservationDetailModal } from './components/common/ObservationDetailModal';
import { FirmsQueryModal } from './components/common/FirmsQueryModal';
import { PrintableEvidenceReportModal } from './components/common/PrintableEvidenceReportModal';
import { FireObservation, CandidateFireEvent } from './types/observation';
import { generateSyntheticObservations } from './data/syntheticObservations';
import { groupIntoCandidateEvents } from './utils/matcher';
import { generateObservationsCsv, triggerCsvDownload } from './utils/export';

export default function App() {
  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedObservation, setSelectedObservation] = useState<FireObservation | null>(null);
  const [isFirmsQueryOpen, setIsFirmsQueryOpen] = useState(false);
  const [isPrintReportOpen, setIsPrintReportOpen] = useState(false);

  // Core Data State: Baseline vs Live Telemetry (Defaults to API Key Mode on initial startup)
  const [apiOnlyMode, setApiOnlyMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('firescope_api_only_mode');
    return saved === null ? true : saved === 'true';
  });
  const [userApiKey, setUserApiKey] = useState<string>(() => {
    return localStorage.getItem('firescope_user_firms_key') || '';
  });
  const [liveObservations, setLiveObservations] = useState<FireObservation[]>([]);
  const [baselineObservations, setBaselineObservations] = useState<FireObservation[]>(() => generateSyntheticObservations());
  const [lastRetrievalUtc, setLastRetrievalUtc] = useState<string>(() => new Date().toISOString());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dataMode, setDataMode] = useState<'SYNTHETIC_DEMO' | 'LIVE_FIRMS'>(() => {
    const saved = localStorage.getItem('firescope_api_only_mode');
    return (saved === null || saved === 'true') ? 'LIVE_FIRMS' : 'SYNTHETIC_DEMO';
  });
  const [activeSourceLabel, setActiveSourceLabel] = useState<string>(
    'All Supported Satellites (VIIRS NOAA-20/21/SNPP 375m + MODIS Terra/Aqua 1km) · India (68.1°E-97.4°E, 8.0°N-37.1°N)'
  );

  // Observations fed to all views (Strict separation: in Synthetic mode always baseline; in API mode always live)
  const observations = useMemo(() => {
    if (!apiOnlyMode || dataMode === 'SYNTHETIC_DEMO') {
      return baselineObservations;
    }
    return liveObservations;
  }, [apiOnlyMode, dataMode, liveObservations, baselineObservations]);

  // Candidate Fire Event Clusters
  const clusters = useMemo(() => {
    return groupIntoCandidateEvents(observations, 12.0);
  }, [observations]);

  // Automatic Feed Configuration on initialization: All supported sensors (VIIRS & MODIS) and India coordinates
  useEffect(() => {
    const url = userApiKey ? `/api/firms/status?mapKey=${encodeURIComponent(userApiKey)}` : '/api/firms/status';
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (apiOnlyMode && liveObservations.length === 0) {
          handleRefreshWithKey();
        }
      })
      .catch(() => {
        // Fallback
      });
  }, [apiOnlyMode, userApiKey]);

  // Universal Mode Switching Function (Instant synchronization across Overview, Navbar, and Settings)
  const handleToggleMode = async (mode: 'synthetic' | 'api') => {
    const isApi = mode === 'api';
    setApiOnlyMode(isApi);
    setDataMode(isApi ? 'LIVE_FIRMS' : 'SYNTHETIC_DEMO');
    localStorage.setItem('firescope_api_only_mode', isApi ? 'true' : 'false');
    setActiveSourceLabel(
      isApi 
        ? 'All Supported Satellites (VIIRS NOAA-20/21/SNPP 375m + MODIS Terra/Aqua 1km) · India (68.1°E-97.4°E, 8.0°N-37.1°N)'
        : 'Synthetic Demonstration Baseline'
    );
    setLastRetrievalUtc(new Date().toISOString());

    if (isApi) {
      // If we don't have live detections loaded yet, query NASA or prompt user
      if (liveObservations.length === 0) {
        setIsRefreshing(true);
        try {
          const res = await fetch('/api/firms/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: 'MULTI_CONSTELLATION',
              bbox: '68.1,8.0,97.4,37.1',
              dayRange: 1,
              regionName: 'India — National Envelope (Coordinates: 68.1°E to 97.4°E, 8.0°N to 37.1°N)',
              countryName: 'India',
              mapKey: userApiKey || undefined,
            }),
          });
          const data = await res.json();
          if (res.ok && data.success && data.observations && data.observations.length > 0) {
            setLiveObservations(data.observations);
            setActiveSourceLabel(data.sensorLabel || 'All Supported Satellites (VIIRS & MODIS) · India');
          }
        } catch {
          // Handled gracefully
        } finally {
          setIsRefreshing(false);
        }
      }
    } else {
      // In Synthetic Baseline mode, ensure baseline benchmark data is active
      if (baselineObservations.length === 0) {
        setBaselineObservations(generateSyntheticObservations());
      }
    }
  };

  const handleToggleApiOnlyMode = (enabled: boolean) => {
    handleToggleMode(enabled ? 'api' : 'synthetic');
  };

  const handleSaveUserApiKey = (key: string) => {
    setUserApiKey(key);
    localStorage.setItem('firescope_user_firms_key', key);
    if (key.trim()) {
      // If in API mode or toggling, refresh with the new key
      handleRefreshWithKey(key.trim());
    }
  };

  const handleRefreshWithKey = async (overrideKey?: string, isUserInitiated?: boolean) => {
    setIsRefreshing(true);
    const effectiveKey = overrideKey || userApiKey;
    try {
      if (apiOnlyMode || dataMode === 'LIVE_FIRMS') {
        const res = await fetch('/api/firms/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'MULTI_CONSTELLATION',
            bbox: '68.1,8.0,97.4,37.1',
            dayRange: 1,
            regionName: 'India — National Envelope (Coordinates: 68.1°E to 97.4°E, 8.0°N to 37.1°N)',
            countryName: 'India',
            bypassCache: true,
            mapKey: effectiveKey || undefined,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.observations) {
            setLiveObservations(data.observations);
            setActiveSourceLabel(data.sensorLabel || 'All Supported Satellites (VIIRS & MODIS) · India (68.1°E-97.4°E, 8.0°N-37.1°N)');
            setDataMode('LIVE_FIRMS');
          } else if (isUserInitiated && (data.code === 'MISSING_KEY' || !data.configured)) {
            setIsFirmsQueryOpen(true);
          }
        }
      } else {
        setBaselineObservations(generateSyntheticObservations());
      }
    } catch {
      if (!apiOnlyMode && dataMode !== 'LIVE_FIRMS') {
        setBaselineObservations(generateSyntheticObservations());
      }
    } finally {
      setLastRetrievalUtc(new Date().toISOString());
      setIsRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    await handleRefreshWithKey(undefined, true);
  };

  const handleExportAllCsv = () => {
    const csv = generateObservationsCsv(observations);
    triggerCsvDownload(csv, `firescope-all-observations-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleImportCustom = (newObs: FireObservation[]) => {
    setLiveObservations(prev => [...newObs, ...prev]);
    setDataMode('LIVE_FIRMS');
    setApiOnlyMode(true);
    localStorage.setItem('firescope_api_only_mode', 'true');
    setActiveTab('observations');
  };

  const handleLiveObservationsLoaded = (newObs: FireObservation[], sourceInfo: string) => {
    setLiveObservations(newObs);
    setDataMode('LIVE_FIRMS');
    setApiOnlyMode(true);
    localStorage.setItem('firescope_api_only_mode', 'true');
    setActiveSourceLabel(sourceInfo);
    setLastRetrievalUtc(new Date().toISOString());
  };

  const handleSwitchToDemoMode = () => {
    handleToggleMode('synthetic');
  };

  const handleResetData = () => {
    setLiveObservations([]);
    setBaselineObservations(generateSyntheticObservations());
    handleToggleMode('synthetic');
  };

  const highUrgencyCount = useMemo(() => {
    return observations.filter(o => o.score.finalScore >= 75).length;
  }, [observations]);

  return (
    <div className="flex flex-col h-screen w-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans">
      {/* Notice Banner */}
      <StatusBanner apiOnlyMode={apiOnlyMode} dataMode={dataMode} />

      {/* Main Top Header */}
      <Header
        dataMode={dataMode}
        apiOnlyMode={apiOnlyMode}
        onToggleMode={handleToggleMode}
        lastRetrievalUtc={lastRetrievalUtc}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onExportCsv={handleExportAllCsv}
        onOpenFirmsQuery={() => setIsFirmsQueryOpen(true)}
        onOpenPrintReport={() => setIsPrintReportOpen(true)}
        activeObservationCount={observations.length}
      />

      {/* Body: Sidebar + Main Workspace Viewport */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          queueCount={highUrgencyCount}
        />

        {/* View Content Canvas */}
        <main className="flex-1 overflow-y-auto bg-neutral-950 p-6">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'overview' && (
              <OverviewView
                observations={observations}
                clusters={clusters}
                onSelectObservation={setSelectedObservation}
                onNavigateTo={setActiveTab}
                dataMode={dataMode}
                apiOnlyMode={apiOnlyMode}
                onToggleMode={handleToggleMode}
                lastRetrievalUtc={lastRetrievalUtc}
                onRefresh={handleRefresh}
                onOpenFirmsQuery={() => setIsFirmsQueryOpen(true)}
                userApiKey={userApiKey}
                onSaveApiKey={handleSaveUserApiKey}
                configuredFeedLabel={activeSourceLabel}
              />
            )}

            {activeTab === 'fire_map' && (
              <FireMapView
                observations={observations}
                clusters={clusters}
                selectedObservation={selectedObservation}
                onSelectObservation={setSelectedObservation}
                onNavigateToTab={setActiveTab}
                apiOnlyMode={apiOnlyMode}
                onOpenFirmsQuery={() => setIsFirmsQueryOpen(true)}
              />
            )}

            {activeTab === 'observations' && (
              <ObservationsView
                observations={observations}
                onSelectObservation={setSelectedObservation}
                onImportCustomObservations={handleImportCustom}
              />
            )}

            {activeTab === 'priority_queue' && (
              <PriorityQueueView
                observations={observations}
                onSelectObservation={setSelectedObservation}
                onNavigateToMap={() => setActiveTab('fire_map')}
              />
            )}

            {activeTab === 'satellite_comparison' && (
              <SatelliteComparisonView
                observations={observations}
                clusters={clusters}
                onSelectObservation={setSelectedObservation}
              />
            )}

            {activeTab === 'contextual_evidence' && (
              <ContextualEvidenceView
                observations={observations}
                clusters={clusters}
                selectedObservation={selectedObservation}
                onSelectObservation={setSelectedObservation}
                onNavigateToTab={setActiveTab}
              />
            )}

            {activeTab === 'historical_analysis' && (
              <HistoricalAnalysisView
                observations={observations}
                clusters={clusters}
                onSelectObservation={setSelectedObservation}
                onNavigateToTab={setActiveTab}
              />
            )}

            {activeTab === 'evaluation' && (
              <EvaluationView />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                onResetData={handleResetData}
                observationCount={observations.length}
                dataMode={dataMode}
                apiOnlyMode={apiOnlyMode}
                onToggleApiOnlyMode={handleToggleApiOnlyMode}
                onToggleMode={handleToggleMode}
                userApiKey={userApiKey}
                onSaveApiKey={handleSaveUserApiKey}
                onOpenFirmsQuery={() => setIsFirmsQueryOpen(true)}
              />
            )}
          </div>
        </main>
      </div>

      {/* Observation Detail Inspection Modal / Drawer */}
      <ObservationDetailModal
        observation={selectedObservation}
        onClose={() => setSelectedObservation(null)}
        onNavigateToTab={setActiveTab}
      />

      {/* NASA FIRMS Live Query Modal */}
      <FirmsQueryModal
        isOpen={isFirmsQueryOpen}
        onClose={() => setIsFirmsQueryOpen(false)}
        onObservationsLoaded={handleLiveObservationsLoaded}
        onSwitchToDemoMode={handleSwitchToDemoMode}
        userApiKey={userApiKey}
        onSaveApiKey={handleSaveUserApiKey}
      />

      {/* Printable Incident Evidence Report Dossier */}
      <PrintableEvidenceReportModal
        isOpen={isPrintReportOpen}
        onClose={() => setIsPrintReportOpen(false)}
        observations={observations}
        clusters={clusters}
        dataMode={dataMode}
        lastRetrievalUtc={lastRetrievalUtc}
      />
    </div>
  );
}
