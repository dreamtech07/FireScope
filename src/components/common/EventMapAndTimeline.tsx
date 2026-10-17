/**
 * FireScope — Candidate Event Map & Chronological Timeline Component
 * 
 * Renders:
 * 1. Interactive Leaflet map of candidate event cluster, spread radius, and member observations
 * 2. Chronological multi-pass timeline distinguishing satellite platforms, resolutions, and FRP
 * 3. Neutral evidence summary, grouping rationale, and complete provenance accounting
 */

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Clock,
  Layers,
  MapPin,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldAlert,
  Maximize2,
  Calendar,
  Satellite,
  Copy,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import {
  CandidateFireEvent,
  FireObservation,
  ProvenanceSummaryItem,
  SensorFamily,
} from '../../types/observation';
import { timeDifferenceMinutes } from '../../utils/matcher';

interface EventMapAndTimelineProps {
  event: CandidateFireEvent;
  onSelectObservation: (obs: FireObservation) => void;
}

export const EventMapAndTimeline: React.FC<EventMapAndTimelineProps> = ({
  event,
  onSelectObservation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [activeViewMode, setActiveViewMode] = useState<'MAP' | 'TIMELINE' | 'PROVENANCE'>('MAP');
  const [highlightedObsId, setHighlightedObsId] = useState<string | null>(null);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [event.centroidLatitude, event.centroidLongitude],
        zoom: 11,
        minZoom: 3,
        maxZoom: 18,
        attributionControl: false,
        zoomControl: false,
      });

      // Esri World Dark Gray Canvas (Zero API key required)
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: '© Esri, DeLorme, NAVTEQ · NASA FIRMS',
      }).addTo(map);

      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
      }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // 1. Draw cluster spread radius circle
    const radiusMeters = Math.max(1000, event.estimatedSpreadRadiusKm * 1000);
    const spreadCircle = L.circle([event.centroidLatitude, event.centroidLongitude], {
      radius: radiusMeters,
      color: event.hasMultiSensorConfirmation ? '#10b981' : '#f59e0b',
      fillColor: event.hasMultiSensorConfirmation ? '#10b981' : '#f59e0b',
      fillOpacity: 0.08,
      weight: 1.5,
      dashArray: '4, 4',
    });
    spreadCircle.bindTooltip(
      `Candidate Cluster Spread Radius: ~${event.estimatedSpreadRadiusKm} km`,
      { className: 'bg-neutral-900 text-neutral-200 border-neutral-700 text-xs' }
    );
    layerGroup.addLayer(spreadCircle);

    // 2. Draw centroid marker
    const centroidIcon = L.divIcon({
      className: 'centroid-icon',
      html: `
        <div style="
          width: 18px;
          height: 18px;
          background: ${event.hasMultiSensorConfirmation ? '#10b981' : '#f59e0b'};
          border: 2px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="width: 6px; height: 6px; background: #000; border-radius: 50%;"></div>
        </div>
      `,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    const centroidMarker = L.marker([event.centroidLatitude, event.centroidLongitude], {
      icon: centroidIcon,
    });
    centroidMarker.bindPopup(`
      <div style="font-family: ui-sans-serif, system-ui; font-size: 11px; padding: 4px; color: #111;">
        <strong style="display: block; margin-bottom: 4px;">Candidate Event Centroid</strong>
        <div>${event.clusterName}</div>
        <div>Coordinates: ${event.centroidLatitude}°, ${event.centroidLongitude}°</div>
        <div>Spread Radius: ${event.estimatedSpreadRadiusKm} km</div>
        <div style="color: #666; margin-top: 4px; font-size: 10px;">Calculated mean center of member detections</div>
      </div>
    `);
    layerGroup.addLayer(centroidMarker);

    // 3. Draw individual observation markers
    const bounds = L.latLngBounds([
      [event.centroidLatitude, event.centroidLongitude],
    ]);

    event.observations.forEach(obs => {
      if (isNaN(obs.latitude) || isNaN(obs.longitude)) return;

      bounds.extend([obs.latitude, obs.longitude]);

      const isViirs = obs.sensorFamily === 'VIIRS';
      const color = isViirs ? '#f59e0b' : '#f43f5e';
      const isHighlighted = highlightedObsId === obs.id;

      const markerRadius = Math.min(14, Math.max(6, 6 + Math.log10(Math.max(1, obs.frp || 1)) * 3));

      const marker = L.circleMarker([obs.latitude, obs.longitude], {
        radius: isHighlighted ? markerRadius + 4 : markerRadius,
        color: isHighlighted ? '#ffffff' : color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: isHighlighted ? 3 : 1.5,
      });

      marker.bindPopup(`
        <div style="font-family: ui-sans-serif, system-ui; font-size: 11px; padding: 4px; color: #111; min-width: 170px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="color: ${color};">${obs.sensorFamily} (${isViirs ? '375m' : '1000m'})</strong>
            <span style="font-family: monospace; font-size: 10px; color: #555;">${obs.platform}</span>
          </div>
          <div><strong>Acq UTC:</strong> ${obs.acqTimestampUtc.replace('T', ' ').slice(0, 19)}</div>
          <div><strong>FRP:</strong> ${obs.frp || 0} MW</div>
          <div><strong>Confidence:</strong> ${obs.confidenceCategory} (${obs.confidence}%)</div>
          <div><strong>Source:</strong> ${obs.source || 'NASA FIRMS'}</div>
          <div style="margin-top: 6px; font-size: 10px; color: #666;">
            Pixel Footprint: ${isViirs ? '375m I-band' : '1.0 km 4μm'}
          </div>
        </div>
      `);

      marker.on('click', () => {
        onSelectObservation(obs);
      });

      layerGroup.addLayer(marker);
    });

    // Fit map bounds safely
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.35));
    }
  }, [event, highlightedObsId, onSelectObservation]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Sorted observations for timeline
  const sortedObs = [...event.observations].sort(
    (a, b) => new Date(a.acqTimestampUtc).getTime() - new Date(b.acqTimestampUtc).getTime()
  );

  const firstTimeMs = sortedObs.length > 0 ? new Date(sortedObs[0].acqTimestampUtc).getTime() : 0;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden space-y-4 p-5">
      {/* Event Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-500" />
              <span>{event.clusterName}</span>
            </h3>
            <span
              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                event.confirmationLevel === 'MULTI_SENSOR_CONFIRMED'
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                  : event.confirmationLevel === 'MULTI_SATELLITE_SAME_SENSOR'
                  ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
              }`}
            >
              {event.confirmationLevel === 'MULTI_SENSOR_CONFIRMED'
                ? 'Multi-Sensor Corroborated'
                : event.confirmationLevel === 'MULTI_SATELLITE_SAME_SENSOR'
                ? 'Multi-Satellite (Same Sensor)'
                : 'Single-Platform Detection'}
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Centroid: <span className="font-mono text-neutral-300">{event.centroidLatitude}°N, {event.centroidLongitude}°E</span> ·
            Estimated Spread: <span className="font-mono text-neutral-300">~{event.estimatedSpreadRadiusKm} km</span> ·
            Duration: <span className="font-mono text-neutral-300">{event.durationHours} hours</span>
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-neutral-950 p-1 rounded-md border border-neutral-800 text-xs">
          <button
            onClick={() => setActiveViewMode('MAP')}
            className={`px-3 py-1 rounded transition-colors ${
              activeViewMode === 'MAP'
                ? 'bg-neutral-800 text-neutral-100 font-medium'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Cluster Map
          </button>
          <button
            onClick={() => setActiveViewMode('TIMELINE')}
            className={`px-3 py-1 rounded transition-colors ${
              activeViewMode === 'TIMELINE'
                ? 'bg-neutral-800 text-neutral-100 font-medium'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Pass Timeline ({sortedObs.length})
          </button>
          <button
            onClick={() => setActiveViewMode('PROVENANCE')}
            className={`px-3 py-1 rounded transition-colors ${
              activeViewMode === 'PROVENANCE'
                ? 'bg-neutral-800 text-neutral-100 font-medium'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Provenance Breakdown
          </button>
        </div>
      </div>

      {/* Disciplinary Analyst Notice (Never Claim Confirmed Wildfire) */}
      <div className="bg-amber-950/20 border border-amber-800/40 rounded-md p-3 text-xs text-amber-300/90 flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-amber-200">
            Analyst Triage Notice — Candidate Thermal Anomaly Grouping
          </div>
          <p className="text-amber-300/80 leading-relaxed text-[11px]">
            This grouping represents spaceborne radiometric observations associated by spatio-temporal coherence.
            Spaceborne instruments detect thermal anomalies; ground dispatch, aerial inspection, or authorized emergency agency confirmation is required before establishing that a terrestrial wildfire exists.
          </p>
        </div>
      </div>

      {/* Neutral Evidence Summary & Grouping Rationale */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="bg-neutral-950 border border-neutral-850 rounded-lg p-3 space-y-1.5">
          <span className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider block">
            Neutral Evidence Summary
          </span>
          <p className="text-neutral-400 leading-relaxed text-[11px]">
            {event.neutralEvidenceSummary}
          </p>
        </div>

        <div className="bg-neutral-950 border border-neutral-850 rounded-lg p-3 space-y-1.5">
          <span className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider block">
            Grouping Rationale & Thresholds
          </span>
          <p className="text-neutral-400 leading-relaxed text-[11px]">
            {event.groupingRationale}
          </p>
        </div>
      </div>

      {/* Evidence Distinction KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs">
        <div className="bg-neutral-950 border border-neutral-800 rounded p-2.5">
          <span className="text-[10px] text-neutral-400 block">Total Records</span>
          <span className="font-mono text-base font-bold text-neutral-100">{event.observationCount}</span>
          <span className="text-[10px] text-neutral-400 block">Ingested rows</span>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 rounded p-2.5">
          <span className="text-[10px] text-neutral-400 block">Independent Evidence</span>
          <span className="font-mono text-base font-bold text-emerald-400">{event.independentEvidenceCount}</span>
          <span className="text-[10px] text-neutral-400 block">Unique detections</span>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 rounded p-2.5">
          <span className="text-[10px] text-neutral-400 block">Unique Satellites</span>
          <span className="font-mono text-base font-bold text-cyan-400">{event.uniqueSatellitesCount}</span>
          <span className="text-[10px] text-neutral-400 block">{event.satellitesRepresented.join(', ')}</span>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 rounded p-2.5">
          <span className="text-[10px] text-neutral-400 block">Unique Sensors</span>
          <span className="font-mono text-base font-bold text-amber-400">{event.uniqueSensorsCount}</span>
          <span className="text-[10px] text-neutral-400 block">{event.sensorFamiliesRepresented.join(', ')}</span>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 rounded p-2.5">
          <span className="text-[10px] text-neutral-400 block">Duplicate Exclusions</span>
          <span className="font-mono text-base font-bold text-rose-400">{event.duplicateRecordCount}</span>
          <span className="text-[10px] text-neutral-400 block">Quarantined rows</span>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 rounded p-2.5">
          <span className="text-[10px] text-neutral-400 block">Mean / Peak FRP</span>
          <span className="font-mono text-base font-bold text-amber-400">{event.meanFrp}</span>
          <span className="text-[10px] text-neutral-400 block">Peak: {event.maxFrp} MW</span>
        </div>
      </div>

      {/* Main View Area: MAP or TIMELINE or PROVENANCE */}
      {activeViewMode === 'MAP' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-neutral-400" />
              <span>Interactive Event Footprint Map</span>
            </span>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                <span>VIIRS 375m Detection</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                <span>MODIS 1000m Detection</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 border-2 border-emerald-400 rounded-full inline-block"></span>
                <span>Cluster Centroid</span>
              </span>
            </div>
          </div>

          <div className="relative">
            <div
              ref={mapContainerRef}
              className="w-full h-80 rounded-lg overflow-hidden border border-neutral-800 bg-neutral-950 z-0 relative"
            />
            <div className="absolute bottom-2 left-2 z-[400] bg-neutral-950/85 backdrop-blur-sm border border-neutral-800 rounded px-2 py-0.5 text-[9px] text-neutral-400">
              Map tiles © Esri / World Dark Canvas · Satellite data © NASA FIRMS
            </div>
          </div>
        </div>
      )}

      {activeViewMode === 'TIMELINE' && (
        <div className="space-y-3">
          <div className="text-xs text-neutral-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
              <span>Chronological Orbital Pass Sequence ({sortedObs.length} Observations)</span>
            </span>
            <span className="text-[11px] text-neutral-400 font-mono">
              Total Duration: {event.durationHours} hours
            </span>
          </div>

          <div className="relative pl-6 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-800">
            {sortedObs.map((obs, idx) => {
              const obsTimeMs = new Date(obs.acqTimestampUtc).getTime();
              const deltaMinutes = Math.round((obsTimeMs - firstTimeMs) / (1000 * 60));
              const deltaLabel =
                deltaMinutes === 0
                  ? 'First Detection (+0m)'
                  : deltaMinutes < 60
                  ? `+${deltaMinutes}m`
                  : `+${Math.floor(deltaMinutes / 60)}h ${deltaMinutes % 60}m`;

              const isViirs = obs.sensorFamily === 'VIIRS';

              return (
                <div
                  key={obs.id}
                  onMouseEnter={() => setHighlightedObsId(obs.id)}
                  onMouseLeave={() => setHighlightedObsId(null)}
                  className="relative group bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded-lg p-3 transition-colors text-xs"
                >
                  {/* Timeline dot */}
                  <span
                    className={`absolute -left-6 top-3.5 w-2.5 h-2.5 rounded-full border-2 border-neutral-950 ${
                      isViirs ? 'bg-amber-500' : 'bg-rose-500'
                    }`}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-neutral-200 font-semibold">{obs.id}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          isViirs
                            ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                            : 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                        }`}
                      >
                        {obs.sensorFamily} ({isViirs ? '375m I-band' : '1000m 4μm'})
                      </span>
                      <span className="text-neutral-400 text-[11px]">aboard {obs.platform}</span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      <span className="text-neutral-400">{deltaLabel}</span>
                      <span className="text-neutral-200">
                        {obs.acqTimestampUtc.replace('T', ' ').slice(0, 19)} UTC
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 pt-2 border-t border-neutral-850 text-[11px]">
                    <div>
                      <span className="text-neutral-400 block text-[10px]">Fire Radiative Power:</span>
                      <span className="font-mono font-bold text-amber-400">{obs.frp || 0} MW</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px]">Confidence:</span>
                      <span className="text-neutral-200 font-medium">
                        {obs.confidenceCategory} ({obs.confidence}%)
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px]">Coordinates:</span>
                      <span className="font-mono text-neutral-300">
                        {obs.latitude.toFixed(4)}°, {obs.longitude.toFixed(4)}°
                      </span>
                    </div>
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => onSelectObservation(obs)}
                        className="text-amber-400 hover:text-amber-300 text-[11px] font-medium flex items-center gap-1"
                      >
                        <span>Inspect Raw Row</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeViewMode === 'PROVENANCE' && (
        <div className="space-y-3">
          <div className="text-xs text-neutral-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-neutral-400" />
              <span>Observation Provenance Breakdown by Ingestion Source & Platform</span>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-950 border-b border-neutral-800 text-neutral-400 font-medium">
                  <th className="py-2.5 px-3">Data Source Provenance</th>
                  <th className="py-2.5 px-3">Satellite Platform</th>
                  <th className="py-2.5 px-3">Sensor Family & Resolution</th>
                  <th className="py-2.5 px-3 text-right">Total Ingested</th>
                  <th className="py-2.5 px-3 text-right">Quarantined Dupes</th>
                  <th className="py-2.5 px-3 text-right font-semibold text-emerald-400">
                    Independent Evidence
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-850">
                {event.provenanceSummary.map((p, idx) => (
                  <tr key={idx} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="py-2 px-3 text-neutral-200 font-medium">{p.source}</td>
                    <td className="py-2 px-3 font-mono text-neutral-300">{p.platform}</td>
                    <td className="py-2 px-3 text-neutral-400">
                      {p.sensorFamily} ({p.sensorFamily === 'VIIRS' ? '375m I-Band' : '1000m 4μm'})
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-neutral-200">
                      {p.recordCount}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-rose-400">
                      {p.duplicateCount}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-emerald-400">
                      {p.independentCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
