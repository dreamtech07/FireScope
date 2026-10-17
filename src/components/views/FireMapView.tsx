/**
 * FireScope — Interactive Geospatial Fire Observation Map
 * 
 * Built with Leaflet, CartoDB Dark Matter tiles, marker clustering,
 * comprehensive thermal legend, multi-filter HUD, and synced selection.
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import {
  Layers,
  Filter,
  Eye,
  MapPin,
  Flame,
  ExternalLink,
  Info,
  Maximize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Calendar,
  Clock,
  ShieldCheck,
  Radio,
  ArrowRight,
  FilterX,
  Compass,
  Factory,
} from 'lucide-react';
import { FireObservation, CandidateFireEvent, ConfidenceCategory, SensorFamily, SensorPlatform } from '../../types/observation';
import { DOCUMENTED_PERSISTENT_EMITTERS } from '../../data/persistentEmitters';

export type BasemapStyle = 'dark' | 'satellite' | 'osm';

interface FireMapViewProps {
  observations: FireObservation[];
  clusters: CandidateFireEvent[];
  selectedObservation: FireObservation | null;
  onSelectObservation: (obs: FireObservation) => void;
  onNavigateToTab?: (tab: any) => void;
  apiOnlyMode?: boolean;
  onOpenFirmsQuery?: () => void;
}

export const FireMapView: React.FC<FireMapViewProps> = ({
  observations,
  clusters,
  selectedObservation,
  onSelectObservation,
  onNavigateToTab,
  apiOnlyMode = false,
  onOpenFirmsQuery,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<any>(null);
  const rawMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const clustersLayerRef = useRef<L.LayerGroup | null>(null);
  const emittersLayerRef = useRef<L.LayerGroup | null>(null);
  const basemapLayersRef = useRef<L.Layer[]>([]);

  // Basemap Style state (Dark Canvas, Satellite Imagery, OpenStreetMap - Zero API Key required)
  const [basemapStyle, setBasemapStyle] = useState<BasemapStyle>('dark');

  // Filter States
  const [selectedSensor, setSelectedSensor] = useState<'ALL' | SensorFamily>('ALL');
  const [selectedPlatform, setSelectedPlatform] = useState<'ALL' | SensorPlatform>('ALL');
  const [confidenceFilter, setConfidenceFilter] = useState<'ALL' | ConfidenceCategory>('ALL');
  const [timeWindowHours, setTimeWindowHours] = useState<number>(168); // 168h = 7 days (all)
  const [minFrp, setMinFrp] = useState<number>(0);
  const [activeRegion, setActiveRegion] = useState<string>('ALL');
  const [enableClustering, setEnableClustering] = useState<boolean>(true);
  const [showClusterFootprints, setShowClusterFootprints] = useState<boolean>(true);
  const [showPersistentEmitters, setShowPersistentEmitters] = useState<boolean>(true);
  const [showLegend, setShowLegend] = useState<boolean>(true);

  // Live mouse coordinates
  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Filter observations safely handling invalid coordinates
  const filteredObs = useMemo(() => {
    const now = Date.now();
    return observations.filter(o => {
      // 1. Safe coordinate check
      if (
        o.latitude === undefined ||
        o.longitude === undefined ||
        isNaN(o.latitude) ||
        isNaN(o.longitude) ||
        o.latitude < -90 ||
        o.latitude > 90 ||
        o.longitude < -180 ||
        o.longitude > 180
      ) {
        return false;
      }

      // 2. Sensor & Platform filters
      if (selectedSensor !== 'ALL' && o.sensorFamily !== selectedSensor) return false;
      if (selectedPlatform !== 'ALL' && o.platform !== selectedPlatform) return false;

      // 3. Confidence filter
      if (confidenceFilter !== 'ALL' && o.confidenceCategory !== confidenceFilter) return false;

      // 4. FRP filter
      if ((o.frp || 0) < minFrp) return false;

      // 5. Geographic region filter
      if (activeRegion !== 'ALL' && o.region !== activeRegion) return false;

      // 6. Time window filter
      if (timeWindowHours < 168) {
        const obsTime = new Date(o.acqTimestampUtc).getTime();
        const diffHours = (now - obsTime) / (1000 * 3600);
        if (diffHours > timeWindowHours) return false;
      }

      return true;
    });
  }, [observations, selectedSensor, selectedPlatform, confidenceFilter, minFrp, activeRegion, timeWindowHours]);

  // Unique regions
  const regions = useMemo(() => Array.from(new Set(observations.map(o => o.region))), [observations]);

  // Reset filters helper
  const handleResetFilters = () => {
    setSelectedSensor('ALL');
    setSelectedPlatform('ALL');
    setConfidenceFilter('ALL');
    setMinFrp(0);
    setActiveRegion('ALL');
    setTimeWindowHours(168);
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 18,
      attributionControl: false,
      zoomControl: false, // We render custom HUD zoom buttons
    });

    // Layer Groups
    const clusterGroup = (L as any).markerClusterGroup({
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 14,
    });
    map.addLayer(clusterGroup);

    const rawMarkersLayer = L.layerGroup().addTo(map);
    const clustersLayer = L.layerGroup().addTo(map);
    const emittersLayer = L.layerGroup().addTo(map);

    clusterGroupRef.current = clusterGroup;
    rawMarkersLayerRef.current = rawMarkersLayer;
    clustersLayerRef.current = clustersLayer;
    emittersLayerRef.current = emittersLayer;
    mapInstanceRef.current = map;

    // Mouse coordinates tracking
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setMouseCoords({
        lat: Number(e.latlng.lat.toFixed(4)),
        lng: Number(e.latlng.lng.toFixed(4)),
      });
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Dynamically manage Basemap Tile Layers (Zero API Key required - fixes 'basemaps api key needed')
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove previous basemap layers safely
    basemapLayersRef.current.forEach(layer => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
    basemapLayersRef.current = [];

    const newLayers: L.Layer[] = [];

    if (basemapStyle === 'dark') {
      // Esri World Dark Gray Canvas: High-contrast Dark Geospatial Base + Reference Labels (Zero API Key)
      const base = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 16,
          attribution: '© Esri, DeLorme, NAVTEQ · NASA FIRMS',
        }
      );
      const ref = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 16,
        }
      );
      base.addTo(map);
      ref.addTo(map);
      newLayers.push(base, ref);
    } else if (basemapStyle === 'satellite') {
      // Esri World Imagery (Satellite Optical Terrain - Zero API Key)
      const sat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 18,
          attribution: '© Esri, Maxar, Earthstar Geographics · NASA FIRMS',
        }
      );
      sat.addTo(map);
      newLayers.push(sat);
    } else {
      // OpenStreetMap Standard Tile Layer (Zero API Key)
      const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors · NASA FIRMS',
      });
      osm.addTo(map);
      newLayers.push(osm);
    }

    basemapLayersRef.current = newLayers;
  }, [basemapStyle]);

  // Update Markers & Clusters when filtered observations change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const clusterGroup = clusterGroupRef.current;
    const rawMarkersLayer = rawMarkersLayerRef.current;
    const clustersLayer = clustersLayerRef.current;
    const emittersLayer = emittersLayerRef.current;
    if (!map || !clusterGroup || !rawMarkersLayer || !clustersLayer) return;

    clusterGroup.clearLayers();
    rawMarkersLayer.clearLayers();
    clustersLayer.clearLayers();
    if (emittersLayer) emittersLayer.clearLayers();

    // Render India National Bounding Box AOI (68.1°E to 97.4°E, 8.0°N to 37.1°N)
    const indiaBboxRect = L.rectangle([[8.0, 68.1], [37.1, 97.4]], {
      color: '#f59e0b',
      weight: 1.5,
      dashArray: '6, 6',
      fillColor: '#f59e0b',
      fillOpacity: 0.03,
    });
    indiaBboxRect.bindTooltip('🇮🇳 India National AOI: 68.1°E to 97.4°E, 8.0°N to 37.1°N', {
      sticky: true,
      className: 'bg-neutral-900 border border-neutral-700 text-neutral-100 text-[10px] px-2 py-1 rounded shadow-md',
    });
    clustersLayer.addLayer(indiaBboxRect);

    // 0. Render Documented Persistent Emitters
    if (emittersLayer && showPersistentEmitters) {
      DOCUMENTED_PERSISTENT_EMITTERS.forEach(emitter => {
        const eMarker = L.circleMarker([emitter.latitude, emitter.longitude], {
          radius: 6,
          color: '#c084fc',
          weight: 2,
          fillColor: '#9333ea',
          fillOpacity: 0.85,
        });

        const bufferCircle = L.circle([emitter.latitude, emitter.longitude], {
          radius: emitter.bufferRadiusKm * 1000,
          color: '#a855f7',
          weight: 1,
          dashArray: '4, 4',
          fillColor: '#a855f7',
          fillOpacity: 0.08,
        });

        const popupHtml = `
          <div style="font-family: sans-serif; font-size: 11px;">
            <div style="border-bottom: 1px solid #3b0764; padding-bottom: 4px; font-weight: 700; color: #e9d5ff;">
              Stationary Emitter: ${emitter.name}
            </div>
            <div style="color: #d8b4fe; font-size: 10px; margin-top: 4px;">
              Type: ${emitter.facilityType.replace(/_/g, ' ')}
            </div>
            <div style="color: #a3a3a3; font-size: 10px;">
              Buffer Radius: ${emitter.bufferRadiusKm} km · ${emitter.region}, ${emitter.country}
            </div>
            <div style="color: #737373; font-size: 9px; margin-top: 4px;">
              Citation: ${emitter.permitNumberOrCitation}
            </div>
          </div>
        `;
        eMarker.bindPopup(popupHtml, { maxWidth: 260 });

        emittersLayer.addLayer(bufferCircle);
        emittersLayer.addLayer(eMarker);
      });
    }

    // 1. Render Cluster Footprint Circles
    if (showClusterFootprints) {
      clusters.forEach(cluster => {
        const isMulti = cluster.hasMultiSensorConfirmation;
        const circle = L.circle([cluster.centroidLatitude, cluster.centroidLongitude], {
          radius: cluster.estimatedSpreadRadiusKm * 1000 + 800,
          color: isMulti ? '#f59e0b' : '#737373',
          weight: 1.2,
          opacity: 0.6,
          fillColor: isMulti ? '#f59e0b' : '#737373',
          fillOpacity: 0.07,
          dashArray: '4, 4',
        });

        circle.bindTooltip(
          `<div class="text-xs">
            <strong>${cluster.clusterName}</strong><br/>
            ${cluster.observationCount} detections · ${cluster.estimatedSpreadRadiusKm} km radius<br/>
            Multi-Sensor: ${isMulti ? 'Corroborated' : 'Single Sensor'}
          </div>`,
          { className: 'bg-neutral-900 text-neutral-100 border border-neutral-800' }
        );

        clustersLayer.addLayer(circle);
      });
    }

    // 2. Render Observations (either inside MarkerClusterGroup or Raw Layer)
    filteredObs.forEach(obs => {
      const isViirs = obs.sensorFamily === 'VIIRS';
      const markerColor = isViirs ? '#f97316' : '#ef4444'; // Orange for VIIRS, Crimson for MODIS

      // Radius scaled conservatively by FRP
      const frpVal = obs.frp || 12;
      const radius = Math.min(14, Math.max(5, Math.round(Math.sqrt(frpVal) * 1.25)));

      const marker = L.circleMarker([obs.latitude, obs.longitude], {
        radius,
        color: markerColor,
        weight: obs.score.finalScore >= 75 ? 2.5 : 1.5,
        opacity: 0.95,
        fillColor: markerColor,
        fillOpacity: 0.55,
      });

      // Rich popup complying with requirements
      const popupContent = document.createElement('div');
      popupContent.className = 'font-sans text-xs space-y-2';
      popupContent.innerHTML = `
        <div style="border-bottom: 1px solid #262626; padding-bottom: 6px;">
          <div style="font-family: monospace; font-weight: 700; color: #f5f5f5; font-size: 12px;">
            ${obs.id}
          </div>
          <div style="color: #a3a3a3; font-size: 11px;">
            ${obs.satellite} · ${obs.region}, ${obs.country}
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
          <div><span style="color: #737373;">Source:</span> <strong style="color: #e5e5e5;">${obs.sourceProvider}</strong></div>
          <div><span style="color: #737373;">Sensor:</span> <strong style="color: #e5e5e5;">${obs.sensorFamily}</strong></div>
          <div><span style="color: #737373;">Acq UTC:</span> <strong style="color: #e5e5e5;">${obs.acqDate} ${obs.acqTime}</strong></div>
          <div><span style="color: #737373;">Pass:</span> <strong style="color: #e5e5e5;">${obs.dayNight === 'D' ? 'Day' : 'Night'}</strong></div>
          <div><span style="color: #737373;">Confidence:</span> <strong style="color: #e5e5e5;">${obs.confidence}% (${obs.confidenceCategory})</strong></div>
          <div><span style="color: #737373;">FRP (MW):</span> <strong style="color: #f59e0b;">${obs.frp !== undefined ? obs.frp + ' MW' : 'N/A'}</strong></div>
          <div><span style="color: #737373;">Brightness:</span> <strong style="color: #e5e5e5;">${obs.brightness ? obs.brightness + ' K' : 'N/A'}</strong></div>
          <div><span style="color: #737373;">Triage Score:</span> <strong style="color: #f59e0b; font-size: 12px;">${obs.score.finalScore}/100</strong></div>
        </div>
        <div style="padding-top: 6px; border-top: 1px solid #262626; display: flex; gap: 6px;">
          <button id="inspect-btn-${obs.id}" style="background: #262626; color: #f5f5f5; border: 1px solid #404040; border-radius: 4px; padding: 4px 8px; font-size: 10px; font-weight: 600; cursor: pointer; flex: 1;">
            Inspect Full Data
          </button>
          <button id="context-btn-${obs.id}" style="background: #171717; color: #f59e0b; border: 1px solid #78350f; border-radius: 4px; padding: 4px 8px; font-size: 10px; font-weight: 600; cursor: pointer;">
            Context
          </button>
          <button id="zoom-btn-${obs.id}" style="background: #f59e0b; color: #0a0a0a; border: none; border-radius: 4px; padding: 4px 8px; font-size: 10px; font-weight: 700; cursor: pointer;">
            Zoom
          </button>
        </div>
      `;

      marker.bindPopup(popupContent, { maxWidth: 300 });

      marker.on('popupopen', () => {
        const inspectBtn = document.getElementById(`inspect-btn-${obs.id}`);
        const contextBtn = document.getElementById(`context-btn-${obs.id}`);
        const zoomBtn = document.getElementById(`zoom-btn-${obs.id}`);

        if (inspectBtn) {
          inspectBtn.onclick = () => onSelectObservation(obs);
        }
        if (contextBtn) {
          contextBtn.onclick = () => {
            onSelectObservation(obs);
            if (onNavigateToTab) onNavigateToTab('contextual_evidence');
          };
        }
        if (zoomBtn) {
          zoomBtn.onclick = () => {
            map.flyTo([obs.latitude, obs.longitude], 12, { duration: 1.2 });
          };
        }
      });

      marker.on('click', () => {
        onSelectObservation(obs);
      });

      if (enableClustering) {
        clusterGroup.addLayer(marker);
      } else {
        rawMarkersLayer.addLayer(marker);
      }
    });
  }, [filteredObs, clusters, enableClustering, showClusterFootprints, showPersistentEmitters, onSelectObservation, onNavigateToTab]);

  // Center on selected observation if one is active and updated externally
  useEffect(() => {
    if (!selectedObservation || !mapInstanceRef.current) return;
    const { latitude, longitude } = selectedObservation;
    if (!isNaN(latitude) && !isNaN(longitude)) {
      mapInstanceRef.current.flyTo([latitude, longitude], 10, { duration: 1.0 });
    }
  }, [selectedObservation]);

  // Fit bounds to current visible results
  const handleFitResults = () => {
    const map = mapInstanceRef.current;
    if (!map || filteredObs.length === 0) return;

    const bounds = L.latLngBounds(filteredObs.map(o => [o.latitude, o.longitude]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
  };

  // Reset to global world view
  const handleResetWorldView = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setView([20, 0], 2);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] space-y-2.5">
      {/* Comprehensive Filter Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-neutral-400 font-medium">
            <Filter className="w-3.5 h-3.5 text-amber-500" />
            <span>Map Filters:</span>
          </div>

          {/* Sensor Selector */}
          <div className="flex items-center bg-neutral-950 p-0.5 rounded border border-neutral-800">
            {(['ALL', 'VIIRS', 'MODIS'] as const).map(sensor => (
              <button
                key={sensor}
                onClick={() => setSelectedSensor(sensor)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  selectedSensor === sensor
                    ? 'bg-neutral-800 text-neutral-100 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {sensor}
              </button>
            ))}
          </div>

          {/* Platform Detail Selector */}
          <select
            value={selectedPlatform}
            onChange={e => setSelectedPlatform(e.target.value as any)}
            className="bg-neutral-950 border border-neutral-800 text-neutral-200 text-xs rounded px-2 py-1 outline-none focus:border-amber-500"
          >
            <option value="ALL">All Platforms</option>
            <option value="VIIRS_NOAA20">VIIRS NOAA-20</option>
            <option value="VIIRS_NOAA21">VIIRS NOAA-21</option>
            <option value="VIIRS_SNPP">VIIRS Suomi-NPP</option>
            <option value="MODIS_TERRA">MODIS Terra</option>
            <option value="MODIS_AQUA">MODIS Aqua</option>
          </select>

          {/* Confidence Filter */}
          <select
            value={confidenceFilter}
            onChange={e => setConfidenceFilter(e.target.value as any)}
            className="bg-neutral-950 border border-neutral-800 text-neutral-200 text-xs rounded px-2 py-1 outline-none focus:border-amber-500"
          >
            <option value="ALL">All Confidence</option>
            <option value="high">High Confidence (≥80%)</option>
            <option value="nominal">Nominal Confidence (≥50%)</option>
            <option value="low">Low Confidence (&lt;50%)</option>
          </select>

          {/* Time Window Filter */}
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-neutral-400" />
            <select
              value={timeWindowHours}
              onChange={e => setTimeWindowHours(Number(e.target.value))}
              className="bg-neutral-950 border border-neutral-800 text-neutral-200 text-xs rounded px-2 py-1 outline-none focus:border-amber-500"
            >
              <option value={12}>Past 12 Hours</option>
              <option value={24}>Past 24 Hours</option>
              <option value={48}>Past 48 Hours</option>
              <option value={72}>Past 72 Hours</option>
              <option value={168}>All Time Window</option>
            </select>
          </div>

          {/* Region Jump Selector */}
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-neutral-400" />
            <select
              value={activeRegion}
              onChange={e => setActiveRegion(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 text-neutral-200 text-xs rounded px-2 py-1 outline-none focus:border-amber-500"
            >
              <option value="ALL">Global Area</option>
              {regions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Min FRP Threshold Slider */}
          <div className="flex items-center gap-2 text-neutral-400">
            <span>Min FRP:</span>
            <input
              type="range"
              min="0"
              max="150"
              step="10"
              value={minFrp}
              onChange={e => setMinFrp(Number(e.target.value))}
              className="w-20 accent-amber-500 cursor-pointer"
            />
            <span className="font-mono tabular-nums text-neutral-200 w-12 text-right">{minFrp} MW</span>
          </div>
        </div>

        {/* View Options: Basemap Selector & Layers */}
        <div className="flex items-center gap-3 text-xs text-neutral-400 flex-wrap">
          {/* Basemap Style Selector (Zero API Key) */}
          <div className="flex items-center bg-neutral-950 p-0.5 rounded border border-neutral-800">
            <span className="text-[10px] text-neutral-400 px-1.5 font-medium">Basemap:</span>
            {(['dark', 'satellite', 'osm'] as const).map(style => (
              <button
                key={style}
                onClick={() => setBasemapStyle(style)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  basemapStyle === style
                    ? 'bg-neutral-800 text-amber-400 font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title={`Switch map layer to ${style === 'dark' ? 'Esri Dark Gray Canvas' : style === 'satellite' ? 'Esri World Satellite Imagery' : 'OpenStreetMap Standard'} (No API Key Required)`}
              >
                {style === 'dark' ? 'Dark Canvas' : style === 'satellite' ? 'Satellite' : 'OSM'}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enableClustering}
              onChange={e => setEnableClustering(e.target.checked)}
              className="rounded bg-neutral-950 border-neutral-800 text-amber-500 focus:ring-0"
            />
            <span>Clustering</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showClusterFootprints}
              onChange={e => setShowClusterFootprints(e.target.checked)}
              className="rounded bg-neutral-950 border-neutral-800 text-amber-500 focus:ring-0"
            />
            <span>Event Clusters</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPersistentEmitters}
              onChange={e => setShowPersistentEmitters(e.target.checked)}
              className="rounded bg-neutral-950 border-neutral-800 text-purple-500 focus:ring-0"
            />
            <span className="text-purple-300">Stationary Emitters</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showLegend}
              onChange={e => setShowLegend(e.target.checked)}
              className="rounded bg-neutral-950 border-neutral-800 text-amber-500 focus:ring-0"
            />
            <span>Legend</span>
          </label>

          {onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab('contextual_evidence')}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors flex items-center gap-1 text-[11px] font-medium"
              title="Open Contextual Evidence (weather, flaring, burn scars)"
            >
              <Layers className="w-3.5 h-3.5 text-amber-500" />
              <span>Contextual Evidence</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Map Canvas with Floating HUD & Overlays */}
      <div className="relative flex-1 bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Top-Left Map Action HUD */}
        <div className="absolute top-3 left-3 z-[400] flex items-center gap-1.5 bg-neutral-950/90 backdrop-blur-sm border border-neutral-800 rounded-md p-1 shadow-lg">
          <button
            onClick={handleFitResults}
            disabled={filteredObs.length === 0}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-300 disabled:opacity-40 transition-colors cursor-pointer"
            title="Fit map bounds to visible results"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetWorldView}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-300 transition-colors cursor-pointer"
            title="Reset to global world view"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="h-4 w-px bg-neutral-800"></div>
          <button
            onClick={() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.flyTo([22.5, 82.0], 5, { duration: 1.2 });
              }
            }}
            className="px-2.5 py-1 rounded hover:bg-neutral-800 text-neutral-200 transition-colors flex items-center gap-1.5 text-[11px] font-medium cursor-pointer"
            title="Focus map on India geographic area: 68.1°E to 97.4°E, 8.0°N to 37.1°N"
          >
            <Compass className="w-3.5 h-3.5 text-amber-500" />
            <span>🇮🇳 India (68.1°E–97.4°E, 8.0°N–37.1°N)</span>
          </button>
          <div className="h-4 w-px bg-neutral-800"></div>
          <button
            onClick={() => mapInstanceRef.current?.zoomIn()}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-300 transition-colors cursor-pointer"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => mapInstanceRef.current?.zoomOut()}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-300 transition-colors cursor-pointer"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>

        {/* Top-Right Synchronized Active Selection Inspector Card */}
        {selectedObservation && (
          <div className="absolute top-3 right-3 z-[400] max-w-sm w-full bg-neutral-950/95 backdrop-blur-md border border-neutral-800 rounded-lg p-3.5 shadow-xl space-y-2 text-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-neutral-800">
              <div className="flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-500" />
                <span className="font-mono font-bold text-neutral-100">{selectedObservation.id}</span>
              </div>
              <div className="text-right">
                <span className="font-mono font-bold text-amber-400 text-sm">
                  {selectedObservation.score.finalScore}
                </span>
                <span className="text-[10px] text-neutral-400 font-mono">/100</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-300">
              <div>
                <span className="text-neutral-400 block text-[10px]">Location:</span>
                <span className="font-mono tabular-nums">{selectedObservation.latitude}°, {selectedObservation.longitude}°</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px]">Platform / Sensor:</span>
                <span className="truncate block">{selectedObservation.platform}</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px]">Thermal Radiance:</span>
                <span className="font-mono tabular-nums text-amber-400 font-semibold">
                  {selectedObservation.frp !== undefined ? `${selectedObservation.frp} MW` : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px]">Confidence:</span>
                <span>{selectedObservation.confidence}% ({selectedObservation.confidenceCategory})</span>
              </div>
            </div>

            <div className="pt-2 border-t border-neutral-850 flex items-center justify-between gap-1.5 flex-wrap">
              <button
                onClick={() => onSelectObservation(selectedObservation)}
                className="px-2 py-1 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-200 transition-colors text-[10px] font-medium"
              >
                Inspect
              </button>
              {onNavigateToTab && (
                <button
                  onClick={() => onNavigateToTab('contextual_evidence')}
                  className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-amber-400 transition-colors text-[10px] font-medium flex items-center gap-1"
                  title="Contextual evidence: weather, flaring, burn scars"
                >
                  <Layers className="w-3 h-3 text-amber-400" />
                  <span>Context</span>
                </button>
              )}
              {onNavigateToTab && (
                <button
                  onClick={() => onNavigateToTab('priority_queue')}
                  className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors text-[10px] font-medium flex items-center gap-1"
                >
                  <span>Queue</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bottom-Right Thermal Legend */}
        {showLegend && (
          <div className="absolute bottom-10 right-3 z-[400] bg-neutral-950/90 backdrop-blur-sm border border-neutral-800 rounded-lg p-3 shadow-xl max-w-xs space-y-2 text-[11px]">
            <div className="flex items-center justify-between pb-1 border-b border-neutral-800">
              <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-500" />
                <span>Thermal Map Legend</span>
              </span>
              <button
                onClick={() => setShowLegend(false)}
                className="text-neutral-400 hover:text-neutral-200 text-[10px]"
              >
                Hide
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-500 border border-orange-300 inline-block"></span>
                  <span className="text-neutral-300">VIIRS (375m)</span>
                </span>
                <span className="text-neutral-400 font-mono text-[10px]">High Spatial</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500 border border-rose-300 inline-block"></span>
                  <span className="text-neutral-300">MODIS (1000m)</span>
                </span>
                <span className="text-neutral-400 font-mono text-[10px]">Thermal Continuity</span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-neutral-850">
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border border-dashed border-amber-500 bg-amber-500/10 inline-block"></span>
                  <span className="text-neutral-300">Candidate Event</span>
                </span>
                <span className="text-neutral-400 font-mono text-[10px]">Spatial Cluster</span>
              </div>

              <div className="pt-1 text-[10px] text-neutral-400 space-y-0.5">
                <div>Marker radius scales with FRP (10 MW → 150+ MW).</div>
                <div>Glow highlights indicate Priority Score ≥ 75.</div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State Overlay */}
        {filteredObs.length === 0 && (
          <div className="absolute inset-0 z-[400] bg-neutral-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-amber-500 mb-3">
              <FilterX className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-200">
              {observations.length === 0 && apiOnlyMode
                ? 'API-Only Mode Active — No Satellite Observations Loaded'
                : 'No Satellite Observations Match Active Filters'}
            </h3>
            <p className="text-xs text-neutral-400 max-w-md mt-1 mb-4 leading-relaxed">
              {observations.length === 0 && apiOnlyMode
                ? 'Baseline demonstration data has been turned off. Query NASA FIRMS live satellites or import an active fire CSV to stream operational thermal telemetry directly to this map.'
                : `No thermal detections were found matching Min FRP: ${minFrp} MW, Sensor: ${selectedSensor}, Platform: ${selectedPlatform}, or Time Window: ${timeWindowHours}h.`}
            </p>
            <div className="flex items-center gap-2">
              {observations.length === 0 && apiOnlyMode && onOpenFirmsQuery ? (
                <button
                  onClick={onOpenFirmsQuery}
                  className="px-3.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-xs font-medium text-white transition-colors shadow-sm"
                >
                  Query NASA FIRMS Live Feeds
                </button>
              ) : (
                <button
                  onClick={handleResetFilters}
                  className="px-3.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-xs font-medium text-white transition-colors shadow-sm"
                >
                  Reset Map Filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bottom Attribution & Mouse Coordinates Ribbon */}
        <div className="absolute bottom-2 left-2 z-[400] bg-neutral-950/85 backdrop-blur-sm border border-neutral-800 rounded px-2.5 py-1 text-[10px] text-neutral-400 flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono">
            <Compass className="w-3 h-3 text-neutral-400" />
            <span>
              {mouseCoords ? `${mouseCoords.lat}°, ${mouseCoords.lng}°` : 'Move cursor over map'}
            </span>
          </div>
          <span>·</span>
          <span>{filteredObs.length} visible detections</span>
          <span>·</span>
          <span className="text-neutral-400">
            Map tiles © Esri Canvas & Imagery / OSM (Zero API Key) · Satellite data © NASA FIRMS LANCE
          </span>
        </div>
      </div>
    </div>
  );
};
