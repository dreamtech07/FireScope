/**
 * FireScope — Multi-Format Telemetry & Dossier Export Engine
 * 
 * Provides verifiable, structured data exports:
 * 1. Filtered Observations CSV (with source attribution and acquisition UTC)
 * 2. Ranked Observations CSV (with explicit factor weight breakdowns & triage contributions)
 * 3. Candidate-Event Summaries CSV (with cluster centroids, spread radii, duration, and provenance)
 * 4. Helper for browser file download triggers
 */

import { FireObservation, CandidateFireEvent, ScoreWeights } from '../types/observation';
import { DEFAULT_WEIGHTS } from './scoring';

/**
 * Escapes CSV values to prevent column breaking and formula injection.
 */
function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Neutralize formula injection (=, +, -, @)
  if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * 1. CSV export of filtered observations.
 * Mandatory fields: Source, source provider, acquisition timestamps, telemetry.
 */
export function exportFilteredObservationsCsv(
  observations: FireObservation[],
  filterContextLabel?: string
): string {
  const exportTimestampUtc = new Date().toISOString();

  const headers = [
    'Observation_ID',
    'Data_Mode',
    'Source_Provider',
    'Specific_Source',
    'Satellite_Platform',
    'Sensor_Family',
    'Satellite_Name',
    'Instrument',
    'Latitude',
    'Longitude',
    'Acquisition_Timestamp_UTC',
    'Acquisition_Date',
    'Acquisition_Time_UTC',
    'Day_Night_Solar_Flag',
    'Brightness_Kelvin_Ch21_I4',
    'Auxiliary_Brightness_Kelvin_Ch31',
    'Fire_Radiative_Power_MW',
    'Scan_Pixel_Km',
    'Track_Pixel_Km',
    'Confidence_Value',
    'Confidence_Category',
    'Final_Triage_Score_0_100',
    'Triage_Priority_Label',
    'Repeat_Observation_Count',
    'Candidate_Cluster_ID',
    'Geographic_Region',
    'Country',
    'Ingestion_Timestamp_UTC',
    'Export_Timestamp_UTC',
    'Filter_Context',
    'Legal_Scientific_Attribution',
  ];

  const rows = observations.map(obs => {
    return [
      escapeCsv(obs.id),
      obs.isSynthetic ? '"SYNTHETIC_DEMO"' : '"OPERATIONAL_FIRMS"',
      escapeCsv(obs.sourceProvider),
      escapeCsv(obs.source || 'NASA FIRMS'),
      escapeCsv(obs.platform),
      escapeCsv(obs.sensorFamily),
      escapeCsv(obs.satellite),
      escapeCsv(obs.instrument || obs.sensorFamily),
      obs.latitude,
      obs.longitude,
      escapeCsv(obs.acqTimestampUtc),
      escapeCsv(obs.acqDate),
      escapeCsv(obs.acqTime),
      escapeCsv(obs.dayNight),
      obs.brightness !== undefined ? obs.brightness : '',
      obs.brightT31 !== undefined ? obs.brightT31 : '',
      obs.frp !== undefined ? obs.frp : '',
      obs.scan !== undefined ? obs.scan : '',
      obs.track !== undefined ? obs.track : '',
      obs.confidence,
      escapeCsv(obs.confidenceCategory),
      obs.score?.finalScore ?? '',
      escapeCsv(obs.score?.triagePriorityLabel || 'Standard triage queue'),
      obs.repeatObservationCount || 0,
      escapeCsv(obs.candidateClusterId || 'UNCLUSTERED'),
      escapeCsv(obs.region),
      escapeCsv(obs.country),
      escapeCsv(obs.ingestionTimestampUtc),
      escapeCsv(exportTimestampUtc),
      escapeCsv(filterContextLabel || 'Active Filter View'),
      '"FireScope Analyst-Support Export. Not an emergency response declaration."',
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * 2. CSV export of ranked observations with explicit factor breakdowns.
 */
export function exportRankedObservationsWithBreakdownsCsv(
  observations: FireObservation[],
  weights: ScoreWeights = DEFAULT_WEIGHTS
): string {
  const exportTimestampUtc = new Date().toISOString();

  // Sort observations by finalScore descending
  const sorted = [...observations].sort((a, b) => (b.score?.finalScore || 0) - (a.score?.finalScore || 0));

  const headers = [
    'Triage_Rank',
    'Observation_ID',
    'Final_Triage_Score_0_100',
    'Triage_Priority_Label',
    'Recency_Score_0_100',
    'Recency_Weight_Applied',
    'Recency_Contribution_Points',
    'Confidence_Score_0_100',
    'Confidence_Weight_Applied',
    'Confidence_Contribution_Points',
    'Thermal_Score_0_100',
    'Thermal_Weight_Applied',
    'Thermal_Contribution_Points',
    'Repeat_Score_0_100',
    'Repeat_Weight_Applied',
    'Repeat_Contribution_Points',
    'FRP_MW',
    'Brightness_Kelvin',
    'Is_Incomplete_Telemetry',
    'Missing_Data_Notes',
    'Triage_Explanation',
    'Sensor_Platform',
    'Latitude',
    'Longitude',
    'Acquisition_Timestamp_UTC',
    'Ingestion_Timestamp_UTC',
    'Export_Timestamp_UTC',
    'Source_Provider',
  ];

  const rows = sorted.map((obs, idx) => {
    const s = obs.score;
    return [
      idx + 1,
      escapeCsv(obs.id),
      s.finalScore,
      escapeCsv(s.triagePriorityLabel),
      s.recencyScore,
      weights.recencyWeight,
      s.recencyContribution,
      s.confidenceScore,
      weights.confidenceWeight,
      s.confidenceContribution,
      s.thermalScore,
      weights.thermalWeight,
      s.thermalContribution,
      s.repeatScore,
      weights.repeatWeight,
      s.repeatContribution,
      obs.frp !== undefined ? obs.frp : '',
      obs.brightness !== undefined ? obs.brightness : '',
      s.isIncomplete ? 'TRUE' : 'FALSE',
      escapeCsv((s.missingDataNotes || []).join('; ')),
      escapeCsv(s.explanation),
      escapeCsv(obs.platform),
      obs.latitude,
      obs.longitude,
      escapeCsv(obs.acqTimestampUtc),
      escapeCsv(obs.ingestionTimestampUtc),
      escapeCsv(exportTimestampUtc),
      escapeCsv(obs.sourceProvider),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * 3. Export of candidate-event summaries.
 */
export function exportCandidateEventsSummaryCsv(clusters: CandidateFireEvent[]): string {
  const exportTimestampUtc = new Date().toISOString();

  const headers = [
    'Candidate_Event_ID',
    'Cluster_Name',
    'Centroid_Latitude',
    'Centroid_Longitude',
    'First_Detected_UTC',
    'Last_Detected_UTC',
    'Duration_Hours',
    'Total_Observations_Count',
    'Unique_Satellites_Count',
    'Unique_Sensors_Count',
    'Confirmation_Level',
    'Has_Multi_Sensor_Confirmation',
    'Max_FRP_MW',
    'Mean_FRP_MW',
    'Top_Priority_Score',
    'Estimated_Spread_Radius_Km',
    'Sensors_Represented',
    'Satellites_Represented',
    'Neutral_Evidence_Summary',
    'Grouping_Rationale',
    'Export_Timestamp_UTC',
  ];

  const rows = clusters.map(c => {
    return [
      escapeCsv(c.id),
      escapeCsv(c.clusterName),
      c.centroidLatitude,
      c.centroidLongitude,
      escapeCsv(c.firstDetectedUtc),
      escapeCsv(c.lastDetectedUtc),
      c.durationHours,
      c.observationCount,
      c.uniqueSatellitesCount,
      c.uniqueSensorsCount,
      escapeCsv(c.confirmationLevel),
      c.hasMultiSensorConfirmation ? 'TRUE' : 'FALSE',
      c.maxFrp,
      c.meanFrp,
      c.topPriorityScore,
      c.estimatedSpreadRadiusKm,
      escapeCsv((c.sensorFamiliesRepresented || []).join(' + ')),
      escapeCsv((c.satellitesRepresented || []).join('; ')),
      escapeCsv(c.neutralEvidenceSummary),
      escapeCsv(c.groupingRationale),
      escapeCsv(exportTimestampUtc),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Backward compatibility alias for generateObservationsCsv
 */
export const generateObservationsCsv = exportFilteredObservationsCsv;

/**
 * Triggers a browser download of text content as a file.
 */
export function triggerCsvDownload(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
