/**
 * FireScope — Contextual Evidence Data Models
 * 
 * Supports:
 * - Persistent heat-source reference datasets & proximity matching
 * - Real environmental weather & land-cover telemetry (Open-Meteo & NASA)
 * - Pre-event and post-event optical imagery & burn-scar products (NASA GIBS)
 * - Sensor uncertainty, orbit gap analysis, and cloud obscuration
 * - Historical area comparison & recurrence baselines
 */

export type PersistentEmitterType =
  | 'PETROCHEMICAL_REFINERY'
  | 'GAS_FLARE'
  | 'STEEL_BLAST_FURNACE'
  | 'CEMENT_KILN'
  | 'ACTIVE_VOLCANO'
  | 'BIOMASS_COGEN'
  | 'OTHER_STATIONARY';

export interface PersistentHeatSource {
  id: string;
  name: string;
  facilityType: PersistentEmitterType;
  latitude: number;
  longitude: number;
  country: string;
  region: string;
  documentedSource: string;
  permitNumberOrCitation: string;
  operatingSinceYear?: number;
  bufferRadiusKm: number; // e.g. 2.0 km
  operationalNotes?: string;
  isUserUploaded?: boolean;
}

export interface EmitterProximityMatch {
  emitter: PersistentHeatSource;
  distanceKm: number;
  isWithinBuffer: boolean;
  thermalConflictNotice: string;
}

export interface EnvironmentalWeatherContext {
  provider: 'Open-Meteo Historical & Current Weather API';
  timestampUtc: string;
  latitude: number;
  longitude: number;
  temperatureC?: number;
  relativeHumidityPct?: number;
  windSpeedKmh?: number;
  windDirectionDeg?: number;
  windGustsKmh?: number;
  precipitationPast24hMm?: number;
  weatherCode?: number;
  weatherDescription?: string;
  cloudCoverPct?: number;
  landCoverClass?: string;
  modelDerivedFireDangerRating?: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'EXTREME'; // Explicitly model-derived!
  attribution: string;
  isRealTimeFetched: boolean;
  rawApiUrl?: string;
}

export interface BurnScarInspectionContext {
  targetId: string;
  targetName: string;
  latitude: number;
  longitude: number;
  preEventDate: string;  // YYYY-MM-DD (e.g. 14 days prior)
  postEventDate: string; // YYYY-MM-DD (e.g. day of / day after detection)
  preEventImageryUrl: string;
  postEventImageryUrl: string;
  imageryProvider: string;
  satelliteInstrument: string;
  resolutionMeters: number;
  spectralBands: string;
  vegetationIndexNote: string;
  scientificDisclaimer: string;
}

export interface UncertaintyOrbitGapContext {
  latitude: number;
  longitude: number;
  observationAcquisitionAgeHours: number;
  revisitCadenceHours: number;
  hoursUntilNextPredictedPass: number;
  nextPredictedSatellite: string;
  availableSatellitesCoveringRegion: string[];
  cloudObscurationRisk: 'LOW_CLEAR_SKY' | 'MODERATE_PARTIAL_CLOUD' | 'HIGH_CLOUD_COVER';
  cloudFractionPct?: number;
  uncertaintyScore: number; // 0 (certain) - 100 (high uncertainty)
  limitationDisclaimer: string;
}

export interface HistoricalAreaBaseline {
  centroidLatitude: number;
  centroidLongitude: number;
  radiusKm: number;
  areaLabel: string;
  totalHistoricalDetections: number;
  peakHistoricalFrp: number;
  meanHistoricalFrp: number;
  seasonalPattern: Array<{
    month: string;
    historicalCount: number;
    currentEventCount: number;
  }>;
  recurrenceClassification: 'UNPRECEDENTED_OUTBREAK' | 'ELEVATED_SEASONAL' | 'ANNUAL_RECURRENT_BURNING' | 'CHRONIC_STATIONARY';
  isAnomalousSurge: boolean;
  zScore: number;
}

export interface ContextualLayerToggles {
  persistentEmitters: boolean;
  environmentalWeather: boolean;
  burnScarOptical: boolean;
  uncertaintyMap: boolean;
  historicalBaselines: boolean;
}

export interface DataProviderSetupStatus {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  status: 'ACTIVE_FREE' | 'CONFIGURED' | 'OPTIONAL_KEY_REQUIRED' | 'DISABLED';
  requiresKey: boolean;
  envKeyName?: string;
  setupInstructions: string;
  documentationUrl: string;
}
