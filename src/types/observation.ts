/**
 * FireScope — Multi-Satellite Fire Observation & Triage Dashboard
 * Common Observation Data Schema and Sensor Types
 */

export type SensorPlatform = 
  | 'VIIRS_SNPP' 
  | 'VIIRS_NOAA20' 
  | 'VIIRS_NOAA21' 
  | 'MODIS_TERRA' 
  | 'MODIS_AQUA';

export type SensorFamily = 'VIIRS' | 'MODIS';

export type ConfidenceCategory = 'nominal' | 'low' | 'high';

export type TriagePriorityLabel = 
  | 'Review first'
  | 'Higher triage priority'
  | 'Elevated triage priority'
  | 'Standard triage queue';

export interface ScoreBreakdown {
  recencyScore: number;     // 0 - 100
  confidenceScore: number;  // 0 - 100
  thermalScore: number;     // 0 - 100 (FRP / brightness normalized)
  repeatScore: number;      // 0 - 100 (spatial-temporal cluster evidence)
  finalScore: number;       // 0 - 100 weighted total
  
  // Weighted factor contributions (points out of finalScore)
  recencyContribution: number;
  confidenceContribution: number;
  thermalContribution: number;
  repeatContribution: number;
  
  // Explainability & Analyst Context
  triagePriorityLabel: TriagePriorityLabel;
  explanation: string;
  isIncomplete: boolean;
  missingDataNotes: string[];
}

export interface ScoreWeights {
  recencyWeight: number;    // default 0.25 (25%)
  confidenceWeight: number; // default 0.25 (25%)
  thermalWeight: number;    // default 0.30 (30%)
  repeatWeight: number;     // default 0.20 (20%)
}

export interface WeightValidationResult {
  isValid: boolean;
  sumPercentage: number;
  isNormalized: boolean;
  errors: string[];
}

export interface FireObservation {
  id: string;
  sourceProvider: 'NASA_FIRMS' | 'SYNTHETIC_DEMO' | 'CSV_IMPORT';
  source?: string;
  dataSourceAttribution?: string;
  isSynthetic: boolean;
  platform: SensorPlatform;
  sensorFamily: SensorFamily;
  satellite: string;
  instrument?: string;
  
  // Coordinates
  latitude: number;
  longitude: number;
  
  // Temporal
  acqTimestampUtc: string; // ISO 8601
  acqDate: string;        // YYYY-MM-DD
  acqTime: string;        // HHMM
  dayNight: 'D' | 'N';
  
  // Thermal measurements
  brightness?: number;     // Kelvin (e.g. 325.4 K)
  brightT31?: number;      // Channel 31 brightness Kelvin
  frp?: number;            // Fire Radiative Power (MW)
  scan?: number;           // Along-scan pixel dimension (km)
  track?: number;          // Along-track pixel dimension (km)
  
  // Quality & Confidence
  confidence: number;      // 0 - 100 numeric representation
  confidenceCategory: ConfidenceCategory;
  version: string;
  
  // FireScope Triage & Aggregation
  ingestionTimestampUtc: string;
  qualityWarnings: string[];
  candidateClusterId?: string;
  repeatObservationCount: number;
  score: ScoreBreakdown;
  
  // Spatial context
  region: string;
  country: string;
  landCoverType?: string;
  
  // Preserved original sensor fields
  rawSourceFields?: Record<string, unknown>;
}

export interface FIRMSSourceOption {
  id: string;
  name: string;
  sensorFamily: SensorFamily;
  platform: SensorPlatform;
  resolution: string;
  description: string;
}

export interface FIRMSRegionPreset {
  id: string;
  name: string;
  bbox: string; // west,south,east,north
  country: string;
}

export interface FIRMSQueryParams {
  source: string;
  bbox: string;
  dayRange: number;
  date?: string;
  regionName?: string;
}

export interface ProvenanceSummaryItem {
  source: string;
  platform: SensorPlatform;
  sensorFamily: SensorFamily;
  recordCount: number;
  duplicateCount: number;
  independentCount: number;
}

export type EventConfirmationLevel =
  | 'MULTI_SENSOR_CONFIRMED'          // Both VIIRS and MODIS across platforms
  | 'MULTI_SATELLITE_SAME_SENSOR'     // Multiple satellites, same sensor family (e.g. NOAA-20 + Suomi-NPP)
  | 'REPEAT_PASS_SINGLE_SATELLITE'    // Same satellite multiple passes
  | 'SINGLE_DETECTION_UNCONFIRMED';   // Isolated single pass

export interface CandidateFireEvent {
  id: string;
  clusterName: string;
  centroidLatitude: number;
  centroidLongitude: number;
  firstDetectedUtc: string;
  lastDetectedUtc: string;
  durationHours: number;
  observationCount: number;           // Total records
  uniqueSourcesCount: number;         // Count of distinct data sources
  uniqueSatellitesCount: number;      // Count of distinct satellite platforms
  uniqueSensorsCount: number;         // Count of distinct sensor families
  duplicateRecordCount: number;       // Excluded duplicate imports/records
  independentEvidenceCount: number;   // Independent non-duplicate evidence count
  satellitesRepresented: SensorPlatform[];
  sensorFamiliesRepresented: SensorFamily[];
  hasMultiSensorConfirmation: boolean;
  hasMultiSatelliteConfirmation: boolean;
  confirmationLevel: EventConfirmationLevel;
  maxFrp: number;
  meanFrp: number;
  observations: FireObservation[];
  matchedObservations: FireObservation[];
  unmatchedObservations: FireObservation[];
  ambiguousObservations: FireObservation[];
  topPriorityScore: number;
  estimatedSpreadRadiusKm: number;
  neutralEvidenceSummary: string;     // Neutral analyst summary (NEVER claims confirmed wildfire)
  groupingRationale: string;          // Explainable reasoning why records were grouped
  provenanceSummary: ProvenanceSummaryItem[];
}

export interface SensorMatchPair {
  id: string;
  primaryObs: FireObservation;        // e.g. VIIRS (375m)
  secondaryObs: FireObservation;      // e.g. MODIS (1000m)
  distanceKm: number;
  timeDeltaMinutes: number;
  temporalDeltaLabel: string;
  confidenceMatch: boolean;
  resolutionRatio: string;            // e.g. "375m vs 1000m (~2.67x)"
  isAmbiguous: boolean;
  ambiguityReason?: string;
  isIndependentConfirmation: boolean; // false if same satellite or duplicate
  matchQuality: 'STRONG' | 'MODERATE' | 'AMBIGUOUS';
}

export interface MatchingToleranceConfig {
  spatialToleranceKm: number;         // Default: 6.0 km for pairwise, 12.0 km for cluster
  temporalToleranceHours: number;     // Default: 4.0 hours for pairwise, 36.0 hours for cluster
  accountForSensorResolution: boolean; // Scale search margin for 1km MODIS vs 375m VIIRS
  excludeDuplicateImports: boolean;   // Avoid counting re-imported duplicates as evidence
  maxPairDistanceKm: number;          // Default: 6.0 km
  maxPairTimeDeltaMinutes: number;    // Default: 240 mins (4 hours)
}

export type ObservationMatchCategory = 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS';

export interface ClassifiedObservationRecord {
  observation: FireObservation;
  matchCategory: ObservationMatchCategory;
  matchReason: string;
  associatedEventId?: string;
  corroboratingPlatforms: SensorPlatform[];
  corroboratingSensors: SensorFamily[];
  isDuplicate: boolean;
}

export interface ObservationFilterState {
  searchQuery: string;
  sensorFilter: 'ALL' | 'VIIRS' | 'MODIS';
  platformFilter: 'ALL' | SensorPlatform;
  confidenceFilter: 'ALL' | ConfidenceCategory;
  minFrp: number;
  maxFrp: number;
  minScore: number;
  timeWindowHours: number; // e.g. 24, 48, 72, 168 (7 days)
  dayNightFilter: 'ALL' | 'D' | 'N';
  regionFilter: string;
}
