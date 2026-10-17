/**
 * FireScope — NASA FIRMS Dedicated Server-Side Service Module
 * 
 * Handles authenticated requests to NASA EOSDIS FIRMS API:
 * - Reads FIRMS_MAP_KEY from server-side environment (never leaks to client/logs)
 * - Supported Endpoints:
 *     Area query: /api/area/csv/[MAP_KEY]/[SOURCE]/[BBOX]/[DAY_RANGE]/[DATE]
 *     Country query: /api/country/csv/[MAP_KEY]/[SOURCE]/[COUNTRY]/[DAY_RANGE]/[DATE]
 * - Official Sensors: VIIRS (NOAA-20, NOAA-21, Suomi-NPP) and MODIS (Terra & Aqua)
 * - In-memory caching with 15-minute TTL to protect 5,000 req/10 min rate limits
 * - Normalization to FireObservation schema preserving raw fields
 */

import { FireObservation, SensorFamily, SensorPlatform, ConfidenceCategory } from '../src/types/observation';
import { computePriorityScore, DEFAULT_WEIGHTS } from '../src/utils/scoring';

const FIRMS_BASE_URL = 'https://firms.modaps.eosdis.nasa.gov/api';

// Cache structure
interface CacheEntry {
  data: FireObservation[];
  timestamp: number;
  cachedAtUtc: string;
  source: string;
  recordCount: number;
}

const queryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface FIRMSServiceStatus {
  configured: boolean;
  keyPresent: boolean;
  environmentVariable: 'FIRMS_MAP_KEY' | 'FIRMS_API_KEY' | 'NONE';
  provider: string;
  baseUrl: string;
  supportedSensors: Array<{
    id: string;
    label: string;
    family: SensorFamily;
    platform: SensorPlatform;
    resolution: string;
    processing: 'NRT' | 'SP';
  }>;
  supportedRegions: Array<{
    id: string;
    name: string;
    bbox: string;
    country: string;
  }>;
  cacheStats: {
    entriesCount: number;
    ttlMinutes: number;
  };
  rateLimitNotice: string;
}

export const SUPPORTED_SENSORS: FIRMSServiceStatus['supportedSensors'] = [
  {
    id: 'MULTI_CONSTELLATION',
    label: 'All Supported Satellites (VIIRS NOAA-20/21/SNPP 375m + MODIS Terra/Aqua 1km)',
    family: 'VIIRS',
    platform: 'VIIRS_NOAA20',
    resolution: '375m & 1km Combined Multi-Sensor',
    processing: 'NRT',
  },
  {
    id: 'VIIRS_NOAA20_NRT',
    label: 'VIIRS NOAA-20 (Near Real-Time 375m)',
    family: 'VIIRS',
    platform: 'VIIRS_NOAA20',
    resolution: '375m I-band',
    processing: 'NRT',
  },
  {
    id: 'VIIRS_NOAA21_NRT',
    label: 'VIIRS NOAA-21 (Near Real-Time 375m)',
    family: 'VIIRS',
    platform: 'VIIRS_NOAA21',
    resolution: '375m I-band',
    processing: 'NRT',
  },
  {
    id: 'VIIRS_SNPP_NRT',
    label: 'VIIRS Suomi-NPP (Near Real-Time 375m)',
    family: 'VIIRS',
    platform: 'VIIRS_SNPP',
    resolution: '375m I-band',
    processing: 'NRT',
  },
  {
    id: 'MODIS_NRT',
    label: 'MODIS Terra & Aqua (Near Real-Time 1km)',
    family: 'MODIS',
    platform: 'MODIS_TERRA',
    resolution: '1000m (1km)',
    processing: 'NRT',
  },
  {
    id: 'MODIS_SP',
    label: 'MODIS Standard Processing (Science Quality 1km)',
    family: 'MODIS',
    platform: 'MODIS_AQUA',
    resolution: '1000m (1km)',
    processing: 'SP',
  },
];

export const SUPPORTED_REGION_PRESETS: FIRMSServiceStatus['supportedRegions'] = [
  {
    id: 'india_all',
    name: 'India — National Envelope (Coordinates: 68.1°E to 97.4°E, 8.0°N to 37.1°N)',
    bbox: '68.1,8.0,97.4,37.1',
    country: 'India',
  },
  {
    id: 'india_north',
    name: 'India — Northern & Indo-Gangetic Plain (Coordinates: 73.5°E to 88.5°E, 24.0°N to 32.5°N)',
    bbox: '73.5,24.0,88.5,32.5',
    country: 'India',
  },
  {
    id: 'india_central_south',
    name: 'India — Central Forest & Deccan Plateau (Coordinates: 72.0°E to 85.5°E, 11.0°N to 24.0°N)',
    bbox: '72.0,11.0,85.5,24.0',
    country: 'India',
  },
  {
    id: 'india_northeast',
    name: 'India — Northeast Region (Coordinates: 89.5°E to 97.5°E, 22.0°N to 29.5°N)',
    bbox: '89.5,22.0,97.5,29.5',
    country: 'India',
  },
  {
    id: 'india_south',
    name: 'India — Southern Peninsula & Western Ghats (Coordinates: 74.0°E to 80.5°E, 8.0°N to 16.0°N)',
    bbox: '74.0,8.0,80.5,16.0',
    country: 'India',
  },
  {
    id: 'us_west',
    name: 'US West / Pacific Coast (Coordinates: -124.5°W to -114.1°W, 32.5°N to 42.0°N)',
    bbox: '-124.5,32.5,-114.1,42.0',
    country: 'United States',
  },
  {
    id: 'norcal_sierra',
    name: 'Northern California Sierra (Coordinates: -123.5°W to -119.5°W, 38.5°N to 41.5°N)',
    bbox: '-123.5,38.5,-119.5,41.5',
    country: 'United States',
  },
  {
    id: 'aus_wa',
    name: 'Western Australia (Kimberley / Pilbara)',
    bbox: '113.0,-35.0,129.0,-14.0',
    country: 'Australia',
  },
  {
    id: 'med_iberia',
    name: 'Mediterranean / Iberian Peninsula',
    bbox: '-9.5,36.0,3.3,43.8',
    country: 'Spain & Portugal',
  },
  {
    id: 'sa_pantanal',
    name: 'Pantanal & Cerrado Biome',
    bbox: '-60.0,-22.0,-45.0,-10.0',
    country: 'Brazil',
  },
  {
    id: 'can_boreal',
    name: 'Canadian Boreal (Alberta / NWT)',
    bbox: '-120.0,49.0,-110.0,60.0',
    country: 'Canada',
  },
];

/**
 * Retrieves the MAP_KEY from server environment or client override securely without logging or exposure.
 */
function getMapKey(overrideKey?: string): { key: string | null; envName: 'FIRMS_MAP_KEY' | 'FIRMS_API_KEY' | 'CLIENT_CONFIGURED' | 'NONE' } {
  if (overrideKey && overrideKey.trim().length > 0 && overrideKey !== 'MY_FIRMS_MAP_KEY') {
    return { key: overrideKey.trim(), envName: 'CLIENT_CONFIGURED' };
  }

  const mapKey = process.env.FIRMS_MAP_KEY;
  if (mapKey && mapKey.trim().length > 0 && mapKey !== 'MY_FIRMS_MAP_KEY') {
    return { key: mapKey.trim(), envName: 'FIRMS_MAP_KEY' };
  }

  const apiKey = process.env.FIRMS_API_KEY;
  if (apiKey && apiKey.trim().length > 0 && apiKey !== 'MY_FIRMS_API_KEY') {
    return { key: apiKey.trim(), envName: 'FIRMS_API_KEY' };
  }

  return { key: null, envName: 'NONE' };
}

/**
 * Returns service configuration status without leaking key values.
 */
export function getFirmsServiceStatus(overrideKey?: string): FIRMSServiceStatus {
  const { key, envName } = getMapKey(overrideKey);
  return {
    configured: Boolean(key),
    keyPresent: Boolean(key),
    environmentVariable: envName as any,
    provider: 'NASA FIRMS (EOSDIS LANCE)',
    baseUrl: FIRMS_BASE_URL,
    supportedSensors: SUPPORTED_SENSORS,
    supportedRegions: SUPPORTED_REGION_PRESETS,
    cacheStats: {
      entriesCount: queryCache.size,
      ttlMinutes: CACHE_TTL_MS / 60000,
    },
    rateLimitNotice: 'NASA FIRMS limits requests to 5,000 transactions per 10-minute interval. FireScope enforces 15-min in-memory caching.',
  };
}

/**
 * Validates bounding box coordinates string (west,south,east,north).
 */
export function validateBoundingBox(bbox: string): { valid: boolean; error?: string } {
  const parts = bbox.split(',').map(p => parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some(isNaN)) {
    return { valid: false, error: 'Bounding box must be 4 comma-separated numbers: west,south,east,north' };
  }
  const [west, south, east, north] = parts;
  if (west < -180 || west > 180 || east < -180 || east > 180) {
    return { valid: false, error: 'Longitude values must be within [-180, 180]' };
  }
  if (south < -90 || south > 90 || north < -90 || north > 90) {
    return { valid: false, error: 'Latitude values must be within [-90, 90]' };
  }
  if (west > east) {
    return { valid: false, error: 'West longitude cannot exceed East longitude' };
  }
  if (south > north) {
    return { valid: false, error: 'South latitude cannot exceed North latitude' };
  }
  return { valid: true };
}

/**
 * Normalizes raw NASA FIRMS CSV row into FireScope common observation schema.
 */
export function normalizeFirmsRecord(
  raw: Record<string, string>,
  sensorConfig: typeof SUPPORTED_SENSORS[0],
  regionName: string,
  countryName: string,
  index: number
): FireObservation {
  const lat = parseFloat(raw.latitude);
  const lon = parseFloat(raw.longitude);

  const acqDate = raw.acq_date || new Date().toISOString().slice(0, 10);
  const acqTime = (raw.acq_time || '0000').padStart(4, '0');
  const hours = acqTime.slice(0, 2);
  const minutes = acqTime.slice(2, 4);
  const acqTimestampUtc = `${acqDate}T${hours}:${minutes}:00.000Z`;

  // Thermal metrics: VIIRS uses bright_ti4 / bright_ti5; MODIS uses brightness / bright_t31
  let brightness: number | undefined;
  if (raw.bright_ti4) {
    brightness = parseFloat(raw.bright_ti4);
  } else if (raw.brightness) {
    brightness = parseFloat(raw.brightness);
  }

  let brightT31: number | undefined;
  if (raw.bright_ti5) {
    brightT31 = parseFloat(raw.bright_ti5);
  } else if (raw.bright_t31) {
    brightT31 = parseFloat(raw.bright_t31);
  }

  const frp = raw.frp ? parseFloat(raw.frp) : undefined;
  const scan = raw.scan ? parseFloat(raw.scan) : undefined;
  const track = raw.track ? parseFloat(raw.track) : undefined;

  // Confidence normalization
  let confidence = 50;
  let confidenceCategory: ConfidenceCategory = 'nominal';
  const confRaw = (raw.confidence || '').toLowerCase().trim();

  if (confRaw === 'h' || confRaw === 'high') {
    confidence = 90;
    confidenceCategory = 'high';
  } else if (confRaw === 'l' || confRaw === 'low') {
    confidence = 30;
    confidenceCategory = 'low';
  } else if (confRaw === 'n' || confRaw === 'nominal') {
    confidence = 65;
    confidenceCategory = 'nominal';
  } else {
    const parsedNum = parseFloat(confRaw);
    if (!isNaN(parsedNum)) {
      confidence = Math.min(100, Math.max(0, parsedNum));
      confidenceCategory = confidence >= 80 ? 'high' : confidence <= 40 ? 'low' : 'nominal';
    }
  }

  // Satellite platform resolution
  let platform: SensorPlatform = sensorConfig.platform;
  const satStr = (raw.satellite || '').toUpperCase();
  if (satStr.includes('AQUA') || satStr === 'A') platform = 'MODIS_AQUA';
  else if (satStr.includes('TERRA') || satStr === 'T') platform = 'MODIS_TERRA';
  else if (satStr.includes('NPP') || satStr === 'N') platform = 'VIIRS_SNPP';
  else if (satStr.includes('20') || satStr.includes('NOAA-20')) platform = 'VIIRS_NOAA20';
  else if (satStr.includes('21') || satStr.includes('NOAA-21')) platform = 'VIIRS_NOAA21';

  const dayNight: 'D' | 'N' = (raw.daynight || '').toUpperCase() === 'N' ? 'N' : 'D';

  const warnings: string[] = [];
  if (confidenceCategory === 'low') {
    warnings.push('Sensor reported low confidence; potential solar glint or smoke edge');
  }
  if (frp === undefined || isNaN(frp)) {
    warnings.push('FRP not supplied; thermal intensity estimated from brightness temperature');
  }

  const draft: Omit<FireObservation, 'score'> = {
    id: `FIRMS-${sensorConfig.family}-${acqDate.replace(/-/g, '')}-${acqTime}-${index + 1}`,
    sourceProvider: 'NASA_FIRMS',
    isSynthetic: false,
    platform,
    sensorFamily: sensorConfig.family,
    satellite: raw.satellite ? `Satellite ${raw.satellite}` : platform.replace(/_/g, ' '),
    latitude: Number(lat.toFixed(4)),
    longitude: Number(lon.toFixed(4)),
    acqTimestampUtc,
    acqDate,
    acqTime,
    dayNight,
    brightness: !isNaN(brightness || NaN) ? brightness : undefined,
    brightT31: !isNaN(brightT31 || NaN) ? brightT31 : undefined,
    frp: !isNaN(frp || NaN) ? frp : undefined,
    scan: !isNaN(scan || NaN) ? scan : undefined,
    track: !isNaN(track || NaN) ? track : undefined,
    confidence,
    confidenceCategory,
    version: raw.version || '2.0-NRT',
    ingestionTimestampUtc: new Date().toISOString(),
    qualityWarnings: warnings,
    repeatObservationCount: 0,
    region: regionName,
    country: countryName,
    landCoverType: 'Terrestrial Surface (FIRMS Sensor Grid)',
    rawSourceFields: { ...raw },
  };

  const score = computePriorityScore(draft, DEFAULT_WEIGHTS, new Date());

  return {
    ...draft,
    score,
  };
}

/**
 * Parses raw CSV returned by NASA FIRMS into normalized JSON records.
 */
export function parseFirmsCsv(
  csvText: string,
  sensorConfig: typeof SUPPORTED_SENSORS[0],
  regionName: string,
  countryName: string
): FireObservation[] {
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length <= 1) return [];

  // Check for error messages returned in plain text by NASA API
  const firstLine = lines[0].toLowerCase();
  if (firstLine.includes('invalid') || firstLine.includes('error') || firstLine.includes('exceeded') || firstLine.includes('not found')) {
    throw new Error(`NASA FIRMS Service Message: ${lines[0]}`);
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const observations: FireObservation[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 2) continue;

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] || '';
    });

    try {
      const obs = normalizeFirmsRecord(rowObj, sensorConfig, regionName, countryName, i);
      observations.push(obs);
    } catch {
      // Skip corrupt individual line
    }
  }

  return observations;
}

/**
 * Main query function to fetch active fires from NASA FIRMS API.
 */
/**
 * Queries a single satellite sensor product from NASA FIRMS API.
 */
async function fetchSingleSensorHotspots(params: {
  sensorConfig: typeof SUPPORTED_SENSORS[0];
  bbox: string;
  dayRange: number;
  date?: string;
  regionName: string;
  countryName: string;
  bypassCache: boolean;
  mapKey?: string;
}): Promise<{
  success: boolean;
  observations: FireObservation[];
  cached: boolean;
  retrievedAtUtc: string;
  message?: string;
  sourceIdentifier: string;
  sensorLabel: string;
  recordCount: number;
}> {
  const { sensorConfig, bbox, dayRange, date, regionName, countryName, bypassCache, mapKey: paramKey } = params;

  const { key } = getMapKey(paramKey);
  if (!key) {
    throw new Error('FIRMS_MAP_KEY is not configured in server environment or client. Please enter a NASA FIRMS MAP_KEY or use synthetic baseline mode.');
  }

  const clampedDayRange = Math.min(5, Math.max(1, Math.round(dayRange)));
  const cacheKey = `${sensorConfig.id}_${bbox}_${clampedDayRange}_${date || 'latest'}`;

  if (!bypassCache && queryCache.has(cacheKey)) {
    const entry = queryCache.get(cacheKey)!;
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return {
        success: true,
        observations: entry.data,
        cached: true,
        retrievedAtUtc: entry.cachedAtUtc,
        message: `Serving cached data (${entry.recordCount} records, 15m cache active)`,
        sourceIdentifier: sensorConfig.id,
        sensorLabel: sensorConfig.label,
        recordCount: entry.recordCount,
      };
    }
  }

  let url = `${FIRMS_BASE_URL}/area/csv/${key}/${sensorConfig.id}/${bbox}/${clampedDayRange}`;
  if (date) {
    url += `/${date}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FireScope-Geospatial-Triage/1.0',
        'Accept': 'text/csv',
      },
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      throw new Error('Unauthorized NASA FIRMS MAP_KEY. Please verify your FIRMS_MAP_KEY in server secrets.');
    }

    if (response.status === 429) {
      throw new Error('NASA FIRMS API rate limit reached (5,000 queries per 10-minute window). Please wait a few minutes.');
    }

    if (!response.ok) {
      throw new Error(`NASA FIRMS API returned HTTP status ${response.status}: ${response.statusText}`);
    }

    const csvText = await response.text();
    const observations = parseFirmsCsv(csvText, sensorConfig, regionName, countryName);
    const nowUtc = new Date().toISOString();

    queryCache.set(cacheKey, {
      data: observations,
      timestamp: Date.now(),
      cachedAtUtc: nowUtc,
      source: sensorConfig.id,
      recordCount: observations.length,
    });

    return {
      success: true,
      observations,
      cached: false,
      retrievedAtUtc: nowUtc,
      message: observations.length === 0 ? 'No active thermal detections reported for selected bounding box and date range' : undefined,
      sourceIdentifier: sensorConfig.id,
      sensorLabel: sensorConfig.label,
      recordCount: observations.length,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Main query function to fetch active fires from NASA FIRMS API.
 * Supports individual sensors as well as MULTI_CONSTELLATION (VIIRS + MODIS).
 */
export async function queryFirmsHotspots(params: {
  source: string;
  bbox: string;
  dayRange: number;
  date?: string;
  regionName?: string;
  countryName?: string;
  bypassCache?: boolean;
  mapKey?: string;
}): Promise<{
  success: boolean;
  observations: FireObservation[];
  cached: boolean;
  retrievedAtUtc: string;
  message?: string;
  sourceIdentifier: string;
  sensorLabel: string;
  recordCount: number;
}> {
  const { source, bbox, dayRange, date, regionName = 'Selected Region', countryName = 'Global', bypassCache = false, mapKey: paramKey } = params;

  // 1. Verify API Key
  const { key } = getMapKey(paramKey);
  if (!key) {
    throw new Error('FIRMS_MAP_KEY is not configured in server environment or client. Please enter a NASA FIRMS MAP_KEY or use synthetic baseline mode.');
  }

  // 2. Validate bounding box
  const bboxValidation = validateBoundingBox(bbox);
  if (!bboxValidation.valid) {
    throw new Error(bboxValidation.error || 'Invalid bounding box parameter');
  }

  // 3. Multi-Sensor constellation query: All supported satellites (VIIRS NOAA-20, NOAA-21, Suomi-NPP + MODIS Terra & Aqua)
  if (source === 'MULTI_CONSTELLATION' || source === 'ALL_SENSORS') {
    const multiSensorTargets = [
      SUPPORTED_SENSORS.find(s => s.id === 'VIIRS_NOAA20_NRT')!,
      SUPPORTED_SENSORS.find(s => s.id === 'VIIRS_NOAA21_NRT')!,
      SUPPORTED_SENSORS.find(s => s.id === 'VIIRS_SNPP_NRT')!,
      SUPPORTED_SENSORS.find(s => s.id === 'MODIS_NRT')!,
    ].filter(Boolean);

    const queryPromises = multiSensorTargets.map(sensorConfig =>
      fetchSingleSensorHotspots({
        sensorConfig,
        bbox,
        dayRange,
        date,
        regionName,
        countryName,
        bypassCache,
        mapKey: paramKey,
      }).catch(err => ({
        success: false as const,
        observations: [] as FireObservation[],
        cached: false,
        retrievedAtUtc: new Date().toISOString(),
        message: err instanceof Error ? err.message : 'Sensor query failed',
        sourceIdentifier: sensorConfig.id,
        sensorLabel: sensorConfig.label,
        recordCount: 0,
      }))
    );

    const results = await Promise.all(queryPromises);

    const mergedObs: FireObservation[] = [];
    const seenIds = new Set<string>();

    for (const res of results) {
      if (res.observations && res.observations.length > 0) {
        for (const obs of res.observations) {
          if (!seenIds.has(obs.id)) {
            seenIds.add(obs.id);
            mergedObs.push(obs);
          }
        }
      }
    }

    const nowUtc = new Date().toISOString();
    return {
      success: true,
      observations: mergedObs,
      cached: results.every(r => r.cached),
      retrievedAtUtc: nowUtc,
      message: mergedObs.length === 0 ? `No active thermal detections detected in ${regionName} across VIIRS & MODIS` : undefined,
      sourceIdentifier: 'MULTI_CONSTELLATION',
      sensorLabel: 'All Supported Satellites (VIIRS NOAA-20/21/SNPP + MODIS Terra/Aqua)',
      recordCount: mergedObs.length,
    };
  }

  // 4. Single sensor query
  const sensorConfig = SUPPORTED_SENSORS.find(s => s.id === source) || SUPPORTED_SENSORS[1];
  return fetchSingleSensorHotspots({
    sensorConfig,
    bbox,
    dayRange,
    date,
    regionName,
    countryName,
    bypassCache,
    mapKey: paramKey,
  });
}
