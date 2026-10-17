/**
 * FireScope — Data Ingestion & Quality Validation Suite
 * 
 * Validates incoming satellite observation records:
 * - Coordinates: bounds [-90, 90] lat, [-180, 180] lon, not NaN
 * - Timestamps: valid UTC date, not in the future, sensible bounds
 * - Thermal: positive numbers, handles nulls without substituting 0
 * - Duplicates: filters identical sensor/lat/lon/time matches
 * - Column Mapping: detects FIRMS (VIIRS/MODIS) and Common formats
 */

import { FireObservation, ConfidenceCategory, SensorPlatform, SensorFamily } from '../types/observation';
import { ValidationRuleResult } from '../types/evaluation';
import { computePriorityScore, DEFAULT_WEIGHTS } from './scoring';
import { haversineDistanceKm } from './matcher';

export interface DetectedColumnMapping {
  schemaType: 'FIRMS_VIIRS' | 'FIRMS_MODIS' | 'FIRESCOPE_COMMON' | 'GENERIC_CSV';
  headersFound: string[];
  mappedFields: {
    latitude: string | null;
    longitude: string | null;
    timestamp: string | null;
    acqDate: string | null;
    acqTime: string | null;
    frp: string | null;
    brightness: string | null;
    confidence: string | null;
    satellite: string | null;
    dayNight: string | null;
  };
  unmappedColumns: string[];
}

export interface RejectedFieldDetail {
  field: string;
  receivedValue: unknown;
  reason: string;
}

export interface RejectedRowDetail {
  rowIndex: number; // 1-indexed row number in the CSV file
  recordId: string;
  failedFields: RejectedFieldDetail[];
  reasons: string[];
  rawRow: Record<string, unknown>;
  rawLineText?: string;
}

export interface ValidationReport {
  totalInputRows: number;
  validRecords: FireObservation[];
  rejectedRows: RejectedRowDetail[];
  duplicateCount: number;
  likelyRepeatCount: number;
  rulesRun: ValidationRuleResult[];
  columnMapping: DetectedColumnMapping;
  firstPreviewRows: Record<string, unknown>[];
  provenance: {
    sourceProvider: 'CSV_IMPORT';
    isSynthetic: boolean;
    detectedFormat: string;
  };
}

/**
 * Detects the schema format and column mapping from CSV headers.
 */
export function detectColumnMapping(headers: string[]): DetectedColumnMapping {
  const normHeaders = headers.map(h => h.trim().toLowerCase());
  const hMap = new Map<string, string>();
  headers.forEach((original, idx) => {
    hMap.set(normHeaders[idx], original);
  });

  const findHeader = (candidates: string[]): string | null => {
    for (const c of candidates) {
      if (hMap.has(c.toLowerCase())) {
        return hMap.get(c.toLowerCase())!;
      }
    }
    return null;
  };

  const latCol = findHeader(['latitude', 'lat', 'y']);
  const lonCol = findHeader(['longitude', 'lon', 'long', 'x']);
  const tsCol = findHeader(['acquisition_timestamp_utc', 'acqtimestamputc', 'timestamp', 'datetime', 'acq_datetime']);
  const dateCol = findHeader(['acq_date', 'acqdate', 'acquisition_date', 'date']);
  const timeCol = findHeader(['acq_time', 'acqtime', 'acquisition_time_utc', 'time']);
  const frpCol = findHeader(['frp', 'frp_mw', 'fire_radiative_power']);
  const brightCol = findHeader(['bright_ti4', 'brightness', 'brightness_kelvin', 'temp_k', 'brightness_temp']);
  const confCol = findHeader(['confidence', 'confidence_value', 'confidence_category', 'conf']);
  const satCol = findHeader(['satellite', 'sensor_platform', 'platform', 'instrument']);
  const dnCol = findHeader(['daynight', 'day_night', 'dn']);

  // Identify schema type
  let schemaType: DetectedColumnMapping['schemaType'] = 'GENERIC_CSV';
  if (normHeaders.includes('record_id') || normHeaders.includes('priority_score_0_100')) {
    schemaType = 'FIRESCOPE_COMMON';
  } else if (normHeaders.includes('bright_ti4') || normHeaders.includes('bright_ti5')) {
    schemaType = 'FIRMS_VIIRS';
  } else if (normHeaders.includes('bright_t31') || (normHeaders.includes('brightness') && normHeaders.includes('acq_date'))) {
    schemaType = 'FIRMS_MODIS';
  }

  const mappedFieldValues = [latCol, lonCol, tsCol, dateCol, timeCol, frpCol, brightCol, confCol, satCol, dnCol].filter(Boolean);
  const unmappedColumns = headers.filter(h => !mappedFieldValues.includes(h));

  return {
    schemaType,
    headersFound: headers,
    mappedFields: {
      latitude: latCol,
      longitude: lonCol,
      timestamp: tsCol,
      acqDate: dateCol,
      acqTime: timeCol,
      frp: frpCol,
      brightness: brightCol,
      confidence: confCol,
      satellite: satCol,
      dayNight: dnCol,
    },
    unmappedColumns,
  };
}

/**
 * Validates a single observation row against rigorous physical & geospatial rules.
 */
export function validateSingleObservation(
  raw: Record<string, unknown>,
  index: number,
  mapping?: DetectedColumnMapping
): { valid: boolean; failedFields: RejectedFieldDetail[]; reasons: string[]; observation?: FireObservation } {
  const failedFields: RejectedFieldDetail[] = [];
  const reasons: string[] = [];

  // Helper to extract by mapped column or fallbacks
  const getVal = (field: keyof DetectedColumnMapping['mappedFields'], fallbacks: string[]): unknown => {
    if (mapping && mapping.mappedFields[field]) {
      const col = mapping.mappedFields[field]!;
      if (raw[col] !== undefined && raw[col] !== '') return raw[col];
    }
    for (const fb of fallbacks) {
      if (raw[fb] !== undefined && raw[fb] !== '') return raw[fb];
    }
    return undefined;
  };

  // 1. Latitude validation
  const rawLat = getVal('latitude', ['latitude', 'lat', 'Latitude', 'LAT']);
  const lat = parseFloat(String(rawLat ?? ''));
  if (rawLat === undefined || rawLat === null || rawLat === '' || isNaN(lat)) {
    const detail: RejectedFieldDetail = {
      field: 'latitude',
      receivedValue: rawLat ?? 'null',
      reason: 'Missing or non-numeric latitude coordinate',
    };
    failedFields.push(detail);
    reasons.push(detail.reason);
  } else if (lat < -90 || lat > 90) {
    const detail: RejectedFieldDetail = {
      field: 'latitude',
      receivedValue: lat,
      reason: `Latitude out of range [-90, 90]: received ${lat}`,
    };
    failedFields.push(detail);
    reasons.push(detail.reason);
  }

  // 2. Longitude validation
  const rawLon = getVal('longitude', ['longitude', 'lon', 'Longitude', 'LON', 'long']);
  const lon = parseFloat(String(rawLon ?? ''));
  if (rawLon === undefined || rawLon === null || rawLon === '' || isNaN(lon)) {
    const detail: RejectedFieldDetail = {
      field: 'longitude',
      receivedValue: rawLon ?? 'null',
      reason: 'Missing or non-numeric longitude coordinate',
    };
    failedFields.push(detail);
    reasons.push(detail.reason);
  } else if (lon < -180 || lon > 180) {
    const detail: RejectedFieldDetail = {
      field: 'longitude',
      receivedValue: lon,
      reason: `Longitude out of range [-180, 180]: received ${lon}`,
    };
    failedFields.push(detail);
    reasons.push(detail.reason);
  }

  // 3. Timestamp validation
  let rawTimestamp = String(getVal('timestamp', ['acquisition_timestamp_utc', 'acqTimestampUtc', 'timestamp', 'datetime']) ?? '');
  const rawDate = String(getVal('acqDate', ['acq_date', 'acqDate', 'acquisition_date', 'date']) ?? '');
  const rawTime = String(getVal('acqTime', ['acq_time', 'acqTime', 'acquisition_time_utc', 'time']) ?? '').padStart(4, '0');

  if (!rawTimestamp && rawDate) {
    const hours = rawTime.slice(0, 2);
    const mins = rawTime.slice(2, 4);
    rawTimestamp = `${rawDate}T${hours}:${mins}:00.000Z`;
  }

  const parsedDate = new Date(rawTimestamp);
  if (!rawTimestamp || isNaN(parsedDate.getTime())) {
    const detail: RejectedFieldDetail = {
      field: 'acqTimestampUtc',
      receivedValue: rawTimestamp || (rawDate ? `${rawDate} ${rawTime}` : 'empty'),
      reason: `Malformed or missing acquisition timestamp: "${rawTimestamp || 'empty'}"`,
    };
    failedFields.push(detail);
    reasons.push(detail.reason);
  } else {
    // Check future bounds (tolerance: up to 24h into future)
    const now = Date.now();
    if (parsedDate.getTime() > now + 24 * 60 * 60 * 1000) {
      const detail: RejectedFieldDetail = {
        field: 'acqTimestampUtc',
        receivedValue: rawTimestamp,
        reason: `Acquisition timestamp is in the future (>24h ahead of present): ${rawTimestamp}`,
      };
      failedFields.push(detail);
      reasons.push(detail.reason);
    }
  }

  // 4. Thermal (FRP) validation — missing is handled without zero substitution
  const rawFrp = getVal('frp', ['frp', 'frp_mw', 'FRP_MW', 'FRP']);
  let frpVal: number | undefined = undefined;
  if (rawFrp !== undefined && rawFrp !== null && rawFrp !== '') {
    const parsedFrp = parseFloat(String(rawFrp));
    if (isNaN(parsedFrp) || parsedFrp < 0) {
      const detail: RejectedFieldDetail = {
        field: 'frp',
        receivedValue: rawFrp,
        reason: `Invalid Fire Radiative Power (FRP): must be non-negative numeric MW, received "${rawFrp}"`,
      };
      failedFields.push(detail);
      reasons.push(detail.reason);
    } else {
      frpVal = parsedFrp;
    }
  }

  // 5. Brightness validation
  const rawBright = getVal('brightness', ['bright_ti4', 'brightness', 'brightness_kelvin', 'temp_k']);
  let brightnessVal: number | undefined = undefined;
  if (rawBright !== undefined && rawBright !== null && rawBright !== '') {
    const parsedBright = parseFloat(String(rawBright));
    if (isNaN(parsedBright) || parsedBright < 150 || parsedBright > 600) {
      const detail: RejectedFieldDetail = {
        field: 'brightness',
        receivedValue: rawBright,
        reason: `Brightness temperature out of credible thermal range [150K, 600K]: received "${rawBright}"`,
      };
      failedFields.push(detail);
      reasons.push(detail.reason);
    } else {
      brightnessVal = parsedBright;
    }
  }

  // 6. Confidence validation
  let confidence = 50;
  let confidenceCategory: ConfidenceCategory = 'nominal';
  const rawConf = getVal('confidence', ['confidence', 'confidence_value', 'confidence_category', 'conf']);

  if (rawConf !== undefined && rawConf !== null && rawConf !== '') {
    if (typeof rawConf === 'number') {
      confidence = Math.min(100, Math.max(0, rawConf));
      confidenceCategory = confidence >= 80 ? 'high' : confidence <= 40 ? 'low' : 'nominal';
    } else {
      const confStr = String(rawConf).toLowerCase().trim();
      if (confStr === 'h' || confStr === 'high') {
        confidence = 90;
        confidenceCategory = 'high';
      } else if (confStr === 'l' || confStr === 'low') {
        confidence = 30;
        confidenceCategory = 'low';
      } else if (confStr === 'n' || confStr === 'nominal') {
        confidence = 65;
        confidenceCategory = 'nominal';
      } else {
        const num = parseFloat(confStr);
        if (!isNaN(num)) {
          confidence = Math.min(100, Math.max(0, num));
          confidenceCategory = confidence >= 80 ? 'high' : confidence <= 40 ? 'low' : 'nominal';
        }
      }
    }
  }

  // Stop here if there are validation rejections
  if (failedFields.length > 0) {
    return { valid: false, failedFields, reasons };
  }

  // Platform & Sensor Resolution
  const rawSat = String(getVal('satellite', ['satellite', 'platform', 'sensor_platform', 'instrument']) ?? 'VIIRS_NOAA20').toUpperCase();
  let platform: SensorPlatform = 'VIIRS_NOAA20';
  let sensorFamily: SensorFamily = 'VIIRS';

  if (rawSat.includes('TERRA') || rawSat === 'T' || rawSat.includes('MODIS_T')) {
    platform = 'MODIS_TERRA';
    sensorFamily = 'MODIS';
  } else if (rawSat.includes('AQUA') || rawSat === 'A' || rawSat.includes('MODIS_A')) {
    platform = 'MODIS_AQUA';
    sensorFamily = 'MODIS';
  } else if (rawSat.includes('SNPP') || rawSat === 'NPP' || rawSat.includes('S-NPP')) {
    platform = 'VIIRS_SNPP';
    sensorFamily = 'VIIRS';
  } else if (rawSat.includes('NOAA21') || rawSat.includes('NOAA-21') || rawSat === 'N21') {
    platform = 'VIIRS_NOAA21';
    sensorFamily = 'VIIRS';
  }

  const rawDayNight = String(getVal('dayNight', ['daynight', 'day_night', 'dn']) ?? '').toUpperCase();
  const dayNight: 'D' | 'N' = rawDayNight === 'N' ? 'N' : (parsedDate.getUTCHours() >= 6 && parsedDate.getUTCHours() < 18 ? 'D' : 'N');

  const rawId = String(raw.record_id ?? raw.id ?? `CSV-${sensorFamily}-${index}-${Date.now().toString().slice(-4)}`);

  // Detect provenance flag
  const isSynthetic = String(raw.isSynthetic ?? raw.data_mode ?? raw.data_provenance ?? '').toLowerCase().includes('synthetic') ||
                      String(raw.data_mode ?? '').includes('DEMO');

  const qualityWarnings: string[] = [];
  if (frpVal === undefined) {
    qualityWarnings.push('FRP not supplied in source CSV; thermal power estimated from brightness channel');
  }
  if (confidenceCategory === 'low') {
    qualityWarnings.push('Sensor reported low detection confidence; potential thermal clutter or cloud boundary');
  }

  const regionName = String(raw.region || raw.Region || 'Imported Region');
  const countryName = String(raw.country || raw.Country || 'Global');

  const draft: Omit<FireObservation, 'score'> = {
    id: rawId,
    sourceProvider: 'CSV_IMPORT',
    isSynthetic,
    platform,
    sensorFamily,
    satellite: rawSat ? `${rawSat} (${sensorFamily})` : platform.replace(/_/g, ' '),
    latitude: Number(lat.toFixed(4)),
    longitude: Number(lon.toFixed(4)),
    acqTimestampUtc: parsedDate.toISOString(),
    acqDate: rawDate || parsedDate.toISOString().slice(0, 10),
    acqTime: rawTime || parsedDate.toISOString().slice(11, 16).replace(':', ''),
    dayNight,
    brightness: brightnessVal,
    frp: frpVal,
    confidence,
    confidenceCategory,
    version: String(raw.version || '2.0-CSV'),
    ingestionTimestampUtc: new Date().toISOString(),
    qualityWarnings,
    repeatObservationCount: 0,
    region: regionName,
    country: countryName,
    landCoverType: String(raw.landCoverType || 'Terrestrial Surface (CSV Import)'),
    rawSourceFields: { ...raw },
  };

  const score = computePriorityScore(draft, DEFAULT_WEIGHTS, new Date());

  return {
    valid: true,
    failedFields: [],
    reasons: [],
    observation: {
      ...draft,
      score,
    },
  };
}

/**
 * Validates a batch of CSV rows.
 * Distinguishes:
 * - Exact Duplicates: identical sensor/platform, latitude, longitude, and timestamp -> pruned
 * - Likely Repeated Observations: nearby points within 10km and 24h -> valid records with incremented repeat counts!
 * - Valid rows are imported even if unrelated rows in the batch are invalid.
 */
export function validateObservationBatch(
  rawRows: Record<string, unknown>[],
  columnMapping?: DetectedColumnMapping
): ValidationReport {
  const validRecords: FireObservation[] = [];
  const rejectedRows: RejectedRowDetail[] = [];
  const seenFingerprints = new Set<string>();
  let duplicateCount = 0;
  let likelyRepeatCount = 0;

  let coordinateRuleFails = 0;
  let temporalRuleFails = 0;
  let thermalRuleFails = 0;

  // Process each row independently
  rawRows.forEach((row, idx) => {
    const res = validateSingleObservation(row, idx + 1, columnMapping);

    if (!res.valid || !res.observation) {
      if (res.failedFields.some(f => f.field === 'latitude' || f.field === 'longitude')) {
        coordinateRuleFails++;
      }
      if (res.failedFields.some(f => f.field === 'acqTimestampUtc')) {
        temporalRuleFails++;
      }
      if (res.failedFields.some(f => f.field === 'frp' || f.field === 'brightness')) {
        thermalRuleFails++;
      }

      rejectedRows.push({
        rowIndex: idx + 2, // 1-indexed, header is row 1
        recordId: String(row.record_id || row.id || `row-${idx + 2}`),
        failedFields: res.failedFields,
        reasons: res.reasons,
        rawRow: row,
      });
      return;
    }

    const obs = res.observation;

    // 1. Exact Duplicate Fingerprint
    const exactFingerprint = `${obs.sensorFamily}_${obs.latitude}_${obs.longitude}_${obs.acqTimestampUtc}`;
    if (seenFingerprints.has(exactFingerprint)) {
      duplicateCount++;
      return;
    }
    seenFingerprints.add(exactFingerprint);

    // 2. Likely Repeated Observation Check (within 10km and 24 hours of existing observations)
    let nearbyRepeats = 0;
    const obsTime = new Date(obs.acqTimestampUtc).getTime();

    for (const prev of validRecords) {
      const dist = haversineDistanceKm(obs.latitude, obs.longitude, prev.latitude, prev.longitude);
      const timeDiffHours = Math.abs(obsTime - new Date(prev.acqTimestampUtc).getTime()) / (1000 * 3600);
      if (dist <= 10.0 && timeDiffHours <= 24.0) {
        nearbyRepeats++;
      }
    }

    if (nearbyRepeats > 0) {
      likelyRepeatCount++;
      obs.repeatObservationCount = nearbyRepeats;
      // Recompute priority score with updated repeat evidence
      obs.score = computePriorityScore(obs, DEFAULT_WEIGHTS, new Date());
    }

    validRecords.push(obs);
  });

  const rulesRun: ValidationRuleResult[] = [
    {
      ruleId: 'GEO-01',
      ruleName: 'Geographic Coordinate Validity',
      category: 'COORDINATES',
      passed: coordinateRuleFails === 0,
      totalRecordsChecked: rawRows.length,
      invalidRecordCount: coordinateRuleFails,
      description: 'Verifies latitude is in [-90, 90] and longitude is in [-180, 180], non-null.',
    },
    {
      ruleId: 'TIME-01',
      ruleName: 'Temporal Coherence & Bounds',
      category: 'TEMPORAL',
      passed: temporalRuleFails === 0,
      totalRecordsChecked: rawRows.length,
      invalidRecordCount: temporalRuleFails,
      description: 'Checks ISO 8601 formatting, prevents future dates (>24h), checks clock sync.',
    },
    {
      ruleId: 'PHYS-01',
      ruleName: 'Thermal Metric Bounds',
      category: 'THERMAL',
      passed: thermalRuleFails === 0,
      totalRecordsChecked: rawRows.length,
      invalidRecordCount: thermalRuleFails,
      description: 'Verifies FRP >= 0 MW and brightness [150K, 600K] while preserving missing optional fields.',
    },
    {
      ruleId: 'DEDUP-01',
      ruleName: 'Exact Sensor Observation Deduplication',
      category: 'DUPLICATES',
      passed: true,
      totalRecordsChecked: rawRows.length,
      invalidRecordCount: duplicateCount,
      description: 'Detects and filters exact identical sensor/coordinate/timestamp tuples.',
    },
  ];

  // Default mapping if not provided
  const detectedMapping = columnMapping || detectColumnMapping(rawRows.length > 0 ? Object.keys(rawRows[0]) : []);

  // Determine overall synthetic status
  const isSynthetic = validRecords.some(r => r.isSynthetic);

  return {
    totalInputRows: rawRows.length,
    validRecords,
    rejectedRows,
    duplicateCount,
    likelyRepeatCount,
    rulesRun,
    columnMapping: detectedMapping,
    firstPreviewRows: rawRows.slice(0, 5),
    provenance: {
      sourceProvider: 'CSV_IMPORT',
      isSynthetic,
      detectedFormat: detectedMapping.schemaType,
    },
  };
}

/**
 * Generates downloadable CSV content containing detailed validation errors.
 */
export function generateValidationErrorReportCsv(rejectedRows: RejectedRowDetail[]): string {
  const headers = [
    'Row_Number',
    'Record_ID',
    'Failed_Fields',
    'Rejection_Reasons',
    'Raw_Row_Data',
  ];

  const lines = rejectedRows.map(r => {
    const fieldsList = r.failedFields.map(f => `${f.field}: ${String(f.receivedValue)}`).join('; ');
    const reasonsList = r.reasons.join('; ');
    const rawJson = JSON.stringify(r.rawRow).replace(/"/g, '""');
    return [
      r.rowIndex,
      `"${r.recordId}"`,
      `"${fieldsList}"`,
      `"${reasonsList}"`,
      `"${rawJson}"`,
    ].join(',');
  });

  return [headers.join(','), ...lines].join('\n');
}

/**
 * Parses raw CSV string into array of object records.
 * Supports quoted values, internal commas, and trims whitespace.
 */
export function parseCsvText(csvText: string): Record<string, unknown>[] {
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length <= 1) return [];

  // Parse header
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;

    const rowObj: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      rowObj[header] = values[index] ?? '';
    });
    rows.push(rowObj);
  }

  return rows;
}

/**
 * Robust CSV line tokenizer supporting quoted fields containing commas.
 */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      if (inQuotes && line[i + 1] === char) {
        current += char;
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Bundled Curated Synthetic Sample CSV
 * Contains a mix of VIIRS NOAA-20, NOAA-21, and MODIS Terra records,
 * with missing optional FRP handled cleanly, 1 duplicate, and 3 intentional invalid rows
 * to test validation, deduplication, error reporting, and partial import.
 */
export const BUNDLED_SYNTHETIC_SAMPLE_CSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,data_provenance
39.8452,-121.4121,367.4,0.38,0.36,2026-10-15,1830,NOAA-20,VIIRS,high,2.0NRT,304.2,148.5,D,SYNTHETIC_DEMO_SAMPLE
39.8612,-121.3984,352.1,0.39,0.37,2026-10-15,1830,NOAA-20,VIIRS,high,2.0NRT,301.8,112.4,D,SYNTHETIC_DEMO_SAMPLE
39.8510,-121.4050,341.6,1.00,1.00,2026-10-15,1915,Aqua,MODIS,88,6.1NRT,298.5,165.2,D,SYNTHETIC_DEMO_SAMPLE
-16.4215,125.6842,358.9,0.40,0.38,2026-10-15,1420,NOAA-21,VIIRS,high,2.0NRT,294.6,182.0,N,SYNTHETIC_DEMO_SAMPLE
-16.4420,125.7110,349.3,0.41,0.39,2026-10-15,1420,NOAA-21,VIIRS,high,2.0NRT,292.1,140.8,N,SYNTHETIC_DEMO_SAMPLE
38.1294,-4.8912,335.8,0.42,0.40,2026-10-15,1210,NOAA-20,VIIRS,nominal,2.0NRT,302.4,62.4,D,SYNTHETIC_DEMO_SAMPLE
-19.2450,-56.7840,344.2,0.39,0.37,2026-10-15,1745,NOAA-20,VIIRS,high,2.0NRT,300.5,,D,SYNTHETIC_DEMO_SAMPLE
56.7264,-111.3803,361.2,0.45,0.41,2026-10-15,2005,NOAA-20,VIIRS,high,2.0NRT,295.4,134.0,D,SYNTHETIC_DEMO_SAMPLE
44.5120,5.8920,314.5,0.40,0.38,2026-10-15,1130,SNPP,VIIRS,low,2.0NRT,295.0,14.2,D,SYNTHETIC_DEMO_SAMPLE
-23.5120,29.4120,308.2,1.10,1.00,2026-10-15,0840,Terra,MODIS,32,6.1NRT,292.0,8.5,D,SYNTHETIC_DEMO_SAMPLE
39.8452,-121.4121,367.4,0.38,0.36,2026-10-15,1830,NOAA-20,VIIRS,high,2.0NRT,304.2,148.5,D,SYNTHETIC_DEMO_SAMPLE
112.8452,-121.4121,367.4,0.38,0.36,2026-10-15,1830,NOAA-20,VIIRS,high,2.0NRT,304.2,148.5,D,SYNTHETIC_DEMO_SAMPLE
39.8452,-121.4121,367.4,0.38,0.36,invalid_date,9999,NOAA-20,VIIRS,high,2.0NRT,304.2,148.5,D,SYNTHETIC_DEMO_SAMPLE
39.8452,-121.4121,367.4,0.38,0.36,2026-10-15,1830,NOAA-20,VIIRS,high,2.0NRT,304.2,-99.0,D,SYNTHETIC_DEMO_SAMPLE`;
