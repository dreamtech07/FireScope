/**
 * FireScope — Multi-Satellite Spatial-Temporal Matcher & Candidate Event Grouping Engine
 * 
 * Implements rigorous multi-satellite association for VIIRS (375m) and MODIS (1000m):
 * - Configurable spatial and temporal tolerances
 * - Distinguishes total records from unique sources, satellites, and sensors
 * - Quarantines duplicate imports from independent evidence counts
 * - Accounts for sensor nominal spatial resolution differences (375m vs 1000m)
 * - Identifies matched, unmatched, and ambiguous observations
 * - Enforces strict temporal coherence (prevents merging distant-in-time co-located fires)
 * - Produces neutral evidence summaries and grouping rationales
 * - NEVER labels a candidate event as a confirmed wildfire
 */

import {
  FireObservation,
  CandidateFireEvent,
  SensorMatchPair,
  SensorFamily,
  SensorPlatform,
  ProvenanceSummaryItem,
  EventConfirmationLevel,
  MatchingToleranceConfig,
  ClassifiedObservationRecord,
} from '../types/observation';

export const DEFAULT_MATCHING_CONFIG: MatchingToleranceConfig = {
  spatialToleranceKm: 12.0,
  temporalToleranceHours: 36.0,
  accountForSensorResolution: true,
  excludeDuplicateImports: true,
  maxPairDistanceKm: 6.0,
  maxPairTimeDeltaMinutes: 240, // 4 hours
};

/**
 * Calculates great-circle distance between two geographic coordinates in kilometers (Haversine).
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (
    lat1 === undefined ||
    lon1 === undefined ||
    lat2 === undefined ||
    lon2 === undefined ||
    isNaN(lat1) ||
    isNaN(lon1) ||
    isNaN(lat2) ||
    isNaN(lon2)
  ) {
    return Infinity;
  }
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Calculates absolute temporal difference in minutes between two UTC timestamps.
 */
export function timeDifferenceMinutes(timeAUtc: string, timeBUtc: string): number {
  const tA = new Date(timeAUtc).getTime();
  const tB = new Date(timeBUtc).getTime();
  if (isNaN(tA) || isNaN(tB)) return Infinity;
  return Math.round(Math.abs(tA - tB) / (1000 * 60));
}

/**
 * Determines whether two observations are exact duplicate records (same physical overpass row).
 */
export function isDuplicateObservation(a: FireObservation, b: FireObservation): boolean {
  if (a.id === b.id) return true;
  const latDiff = Math.abs(a.latitude - b.latitude);
  const lonDiff = Math.abs(a.longitude - b.longitude);
  const timeDiff = timeDifferenceMinutes(a.acqTimestampUtc, b.acqTimestampUtc);
  
  // Exact identical coordinates, platform, instrument, and time = duplicate record
  return (
    latDiff < 0.0005 &&
    lonDiff < 0.0005 &&
    timeDiff === 0 &&
    a.platform === b.platform &&
    (a.instrument || a.sensorFamily) === (b.instrument || b.sensorFamily)
  );
}

/**
 * Returns effective pairing radius accounting for nominal sensor resolution footprint.
 * VIIRS: 375m (0.375 km)
 * MODIS: 1000m (1.0 km)
 */
export function getEffectiveToleranceKm(
  sensorA: SensorFamily,
  sensorB: SensorFamily,
  baseKm: number,
  accountForResolution: boolean
): number {
  if (!accountForResolution) return baseKm;
  // MODIS pixel center can be up to ~0.7 km offset from a sub-pixel VIIRS fire spot
  const modisOffset = 0.5; // half of 1km footprint
  const viirsOffset = 0.1875; // half of 375m footprint
  const offsetA = sensorA === 'MODIS' ? modisOffset : viirsOffset;
  const offsetB = sensorB === 'MODIS' ? modisOffset : viirsOffset;
  return Number((baseKm + offsetA + offsetB).toFixed(2));
}

/**
 * Matches cross-sensor observation pairs (e.g. VIIRS 375m vs MODIS 1000m).
 * Detects strong matches, moderate matches, and ambiguous overlaps.
 */
export function matchCrossSensorObservations(
  observations: FireObservation[],
  maxDistanceKm: number = 6.0,
  maxTimeDeltaMinutes: number = 240,
  accountForResolution: boolean = true
): {
  matchedPairs: SensorMatchPair[];
  unmatchedViirs: FireObservation[];
  unmatchedModis: FireObservation[];
  ambiguousPairs: SensorMatchPair[];
} {
  const viirsList = observations.filter(o => o.sensorFamily === 'VIIRS');
  const modisList = observations.filter(o => o.sensorFamily === 'MODIS');

  const matchedPairs: SensorMatchPair[] = [];
  const ambiguousPairs: SensorMatchPair[] = [];
  const matchedModisIds = new Set<string>();
  const matchedViirsIds = new Set<string>();

  // Map to track how many VIIRS points fall within each MODIS footprint
  const modisCoverageMap = new Map<string, FireObservation[]>();

  for (const viirs of viirsList) {
    const effectiveTol = getEffectiveToleranceKm('VIIRS', 'MODIS', maxDistanceKm, accountForResolution);

    // Find all potential MODIS candidates within tolerance
    const candidates: { modis: FireObservation; dist: number; deltaMin: number }[] = [];

    for (const modis of modisList) {
      const dist = haversineDistanceKm(
        viirs.latitude,
        viirs.longitude,
        modis.latitude,
        modis.longitude
      );
      const deltaMin = timeDifferenceMinutes(viirs.acqTimestampUtc, modis.acqTimestampUtc);

      if (dist <= effectiveTol && deltaMin <= maxTimeDeltaMinutes) {
        candidates.push({ modis, dist, deltaMin });
      }
    }

    if (candidates.length === 0) continue;

    // Sort by spatial proximity
    candidates.sort((a, b) => a.dist - b.dist);
    const best = candidates[0];

    // Track coverage for ambiguity detection
    const existingCoverage = modisCoverageMap.get(best.modis.id) || [];
    existingCoverage.push(viirs);
    modisCoverageMap.set(best.modis.id, existingCoverage);

    const isDifferentPlatform = viirs.platform !== best.modis.platform;
    const isDuplicate = isDuplicateObservation(viirs, best.modis);
    const isIndependent = isDifferentPlatform && !isDuplicate;

    // Ambiguity checks
    let isAmbiguous = false;
    let ambiguityReason: string | undefined = undefined;

    if (candidates.length > 1) {
      const secondBest = candidates[1];
      if (Math.abs(best.dist - secondBest.dist) < 0.8) {
        isAmbiguous = true;
        ambiguityReason = `Competing MODIS detections equidistant (${best.dist} km vs ${secondBest.dist} km)`;
      }
    }

    if (best.deltaMin > maxTimeDeltaMinutes * 0.75) {
      isAmbiguous = true;
      ambiguityReason = ambiguityReason
        ? `${ambiguityReason}; High temporal delta (${best.deltaMin} min)`
        : `High temporal delta between passes (${best.deltaMin} min)`;
    }

    if (viirs.confidenceCategory === 'high' && best.modis.confidenceCategory === 'low') {
      isAmbiguous = true;
      ambiguityReason = ambiguityReason
        ? `${ambiguityReason}; Divergent confidence (VIIRS High vs MODIS Low)`
        : `Divergent confidence between sensors (VIIRS High vs MODIS Low)`;
    }

    const pair: SensorMatchPair = {
      id: `pair-${viirs.id}-${best.modis.id}`,
      primaryObs: viirs,
      secondaryObs: best.modis,
      distanceKm: best.dist,
      timeDeltaMinutes: best.deltaMin,
      temporalDeltaLabel:
        best.deltaMin < 60
          ? `${best.deltaMin}m apart`
          : `${Math.floor(best.deltaMin / 60)}h ${best.deltaMin % 60}m apart`,
      confidenceMatch: viirs.confidenceCategory === best.modis.confidenceCategory,
      resolutionRatio: '375m (I-Band) vs 1000m (4μm)',
      isAmbiguous,
      ambiguityReason,
      isIndependentConfirmation: isIndependent,
      matchQuality: isAmbiguous ? 'AMBIGUOUS' : best.dist <= 3.0 ? 'STRONG' : 'MODERATE',
    };

    if (isAmbiguous) {
      ambiguousPairs.push(pair);
    } else {
      matchedPairs.push(pair);
    }

    matchedViirsIds.add(viirs.id);
    matchedModisIds.add(best.modis.id);
  }

  // Check MODIS multi-match: if 1 MODIS pixel matched > 1 VIIRS detection, mark sub-pixel cluster
  for (const [modisId, vList] of modisCoverageMap.entries()) {
    if (vList.length > 1) {
      // Find matching pairs and append sub-pixel clarification
      for (const p of [...matchedPairs, ...ambiguousPairs]) {
        if (p.secondaryObs.id === modisId && !p.ambiguityReason?.includes('Sub-pixel')) {
          p.ambiguityReason = p.ambiguityReason
            ? `${p.ambiguityReason}; ${vList.length} VIIRS 375m hotspots inside single 1km MODIS footprint`
            : `${vList.length} sub-pixel VIIRS 375m hotspots within 1km MODIS footprint`;
        }
      }
    }
  }

  const unmatchedViirs = viirsList.filter(o => !matchedViirsIds.has(o.id));
  const unmatchedModis = modisList.filter(o => !matchedModisIds.has(o.id));

  return { matchedPairs, unmatchedViirs, unmatchedModis, ambiguousPairs };
}

/**
 * Builds neutral provenance summary across records in a candidate event.
 */
function buildProvenanceSummary(observations: FireObservation[]): ProvenanceSummaryItem[] {
  interface ProvenanceAccumulator {
    source: string;
    platform: SensorPlatform;
    sensorFamily: SensorFamily;
    records: FireObservation[];
    duplicates: number;
  }
  const map = new Map<string, ProvenanceAccumulator>();

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    const sourceStr = obs.source || obs.sourceProvider || 'NASA FIRMS';
    const key = `${sourceStr}-${obs.platform}-${obs.sensorFamily}`;
    
    // Check if this record is a duplicate of any earlier record in this event
    let isDupe = false;
    for (let j = 0; j < i; j++) {
      if (isDuplicateObservation(obs, observations[j])) {
        isDupe = true;
        break;
      }
    }

    const entry: ProvenanceAccumulator = map.get(key) || {
      source: sourceStr,
      platform: obs.platform,
      sensorFamily: obs.sensorFamily,
      records: [],
      duplicates: 0,
    };

    entry.records.push(obs);
    if (isDupe) entry.duplicates += 1;
    map.set(key, entry);
  }

  return Array.from(map.values()).map(e => ({
    source: e.source,
    platform: e.platform,
    sensorFamily: e.sensorFamily,
    recordCount: e.records.length,
    duplicateCount: e.duplicates,
    independentCount: e.records.length - e.duplicates,
  }));
}

/**
 * Generates neutral evidence summary and explainable grouping rationale.
 * STRICT: NEVER labels a candidate event as a confirmed wildfire.
 */
function generateNeutralEventSummary(
  clusterName: string,
  totalRecords: number,
  duplicateCount: number,
  independentCount: number,
  uniqueSensors: SensorFamily[],
  uniqueSatellites: SensorPlatform[],
  uniqueSources: string[],
  spreadRadiusKm: number,
  durationHours: number,
  confirmationLevel: EventConfirmationLevel,
  meanFrp: number,
  maxFrp: number
): { neutralSummary: string; rationale: string } {
  const sensorStr = uniqueSensors.join(' & ');
  const platformStr = uniqueSatellites.join(', ');
  const sourcesStr = uniqueSources.join(', ');

  let confirmationDesc = '';
  switch (confirmationLevel) {
    case 'MULTI_SENSOR_CONFIRMED':
      confirmationDesc = 'Cross-sensor corroboration established via independent VIIRS (375m) and MODIS (1000m) spaceborne radiometers.';
      break;
    case 'MULTI_SATELLITE_SAME_SENSOR':
      confirmationDesc = 'Cross-platform corroboration observed across multiple orbital passes using the same sensor family.';
      break;
    case 'REPEAT_PASS_SINGLE_SATELLITE':
      confirmationDesc = 'Single satellite platform repeat observation over consecutive orbital tracks.';
      break;
    case 'SINGLE_DETECTION_UNCONFIRMED':
    default:
      confirmationDesc = 'Isolated single-pass thermal anomaly detection; awaiting secondary satellite overpass.';
      break;
  }

  const dupeNotice =
    duplicateCount > 0
      ? ` Note: ${duplicateCount} duplicate record${duplicateCount > 1 ? 's were' : ' was'} detected and excluded from independent evidence counts.`
      : '';

  const neutralSummary =
    `Candidate thermal anomaly cluster consisting of ${totalRecords} observation record${totalRecords > 1 ? 's' : ''} ` +
    `(${independentCount} independent detection${independentCount > 1 ? 's' : ''}) across ${uniqueSatellites.length} satellite platform${uniqueSatellites.length > 1 ? 's' : ''} ` +
    `(${platformStr}) and ${uniqueSensors.length} sensor constellation${uniqueSensors.length > 1 ? 's' : ''} (${sensorStr}). ` +
    `${confirmationDesc}${dupeNotice} Mean FRP: ${meanFrp} MW (Peak: ${maxFrp} MW). ` +
    `Analyst Notice: Spaceborne thermal radiance detection only. In-situ field inspection or agency ground-verification is required to verify terrestrial wildfire occurrence.`;

  const rationale =
    `Observations grouped by spatio-temporal coherence: all member detections occurred within ${spreadRadiusKm} km ` +
    `of the cluster centroid across a ${durationHours.toFixed(1)}-hour acquisition window. ` +
    `Data ingested from ${sourcesStr}. Records with unverified coordinates or exceeding temporal tolerances are segregated.`;

  return { neutralSummary, rationale };
}

/**
 * Groups observations into candidate fire event clusters based on configurable spatio-temporal tolerances.
 * Enforces:
 * - Spatial radius (default 12.0 km)
 * - Temporal window (default 36.0 hours)
 * - Segregates duplicate imports from independent evidence counts
 * - Distinguishes total records from unique sources, satellites, and sensors
 * - Does NOT merge records with similar coordinates if acquisition times exceed the temporal tolerance
 */
export function groupIntoCandidateEvents(
  observations: FireObservation[],
  clusterRadiusKm: number = 12.0,
  maxTemporalHours: number = 36.0,
  config: Partial<MatchingToleranceConfig> = {}
): CandidateFireEvent[] {
  if (!observations || observations.length === 0) return [];

  const effectiveClusterRadius = config.spatialToleranceKm ?? clusterRadiusKm;
  const effectiveTemporalHours = config.temporalToleranceHours ?? maxTemporalHours;
  const maxTemporalMs = effectiveTemporalHours * 60 * 60 * 1000;

  const events: CandidateFireEvent[] = [];
  const assigned = new Set<string>();

  // Sort by priority score descending to anchor clusters on high-urgency points
  const sorted = [...observations].sort(
    (a, b) => (b.score?.finalScore || 0) - (a.score?.finalScore || 0)
  );

  for (const seed of sorted) {
    if (assigned.has(seed.id)) continue;

    const clusterObs: FireObservation[] = [seed];
    assigned.add(seed.id);

    const seedTime = new Date(seed.acqTimestampUtc).getTime();

    for (const candidate of sorted) {
      if (assigned.has(candidate.id)) continue;

      // 1. Check spatial distance
      const dist = haversineDistanceKm(
        seed.latitude,
        seed.longitude,
        candidate.latitude,
        candidate.longitude
      );

      if (dist > effectiveClusterRadius) continue;

      // 2. Check temporal proximity: do NOT merge solely because coordinates are close if times exceed window!
      const candidateTime = new Date(candidate.acqTimestampUtc).getTime();
      const timeDeltaMs = Math.abs(candidateTime - seedTime);

      if (timeDeltaMs <= maxTemporalMs) {
        clusterObs.push(candidate);
        assigned.add(candidate.id);
      }
    }

    // Compute cluster metrics
    const validObsWithCoords = clusterObs.filter(
      o => !isNaN(o.latitude) && !isNaN(o.longitude)
    );

    const latSum = validObsWithCoords.reduce((acc, o) => acc + o.latitude, 0);
    const lonSum = validObsWithCoords.reduce((acc, o) => acc + o.longitude, 0);
    const avgLat = Number((latSum / validObsWithCoords.length).toFixed(4));
    const avgLon = Number((lonSum / validObsWithCoords.length).toFixed(4));

    // Timestamps
    const timestamps = clusterObs
      .map(o => new Date(o.acqTimestampUtc).getTime())
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);

    const firstTime = timestamps[0] || Date.now();
    const lastTime = timestamps[timestamps.length - 1] || firstTime;
    const firstDetected = new Date(firstTime).toISOString();
    const lastDetected = new Date(lastTime).toISOString();
    const durationHours = Number(((lastTime - firstTime) / (1000 * 60 * 60)).toFixed(1));

    // Count unique provenance entities
    const uniqueSources = Array.from(new Set(clusterObs.map(o => o.source || o.sourceProvider || 'NASA FIRMS')));
    const uniqueSatellites = Array.from(new Set(clusterObs.map(o => o.platform)));
    const uniqueSensors = Array.from(new Set(clusterObs.map(o => o.sensorFamily)));

    // Detect duplicate records inside this cluster
    let duplicateRecordCount = 0;
    for (let i = 0; i < clusterObs.length; i++) {
      for (let j = 0; j < i; j++) {
        if (isDuplicateObservation(clusterObs[i], clusterObs[j])) {
          duplicateRecordCount += 1;
          break;
        }
      }
    }
    const independentEvidenceCount = Math.max(1, clusterObs.length - duplicateRecordCount);

    // Cross-sensor confirmation checks
    const hasViirs = uniqueSensors.includes('VIIRS');
    const hasModis = uniqueSensors.includes('MODIS');
    const hasMultiSensorConfirmation = hasViirs && hasModis && independentEvidenceCount > 1;
    const hasMultiSatelliteConfirmation = uniqueSatellites.length > 1;

    let confirmationLevel: EventConfirmationLevel = 'SINGLE_DETECTION_UNCONFIRMED';
    if (hasMultiSensorConfirmation) {
      confirmationLevel = 'MULTI_SENSOR_CONFIRMED';
    } else if (hasMultiSatelliteConfirmation) {
      confirmationLevel = 'MULTI_SATELLITE_SAME_SENSOR';
    } else if (independentEvidenceCount > 1) {
      confirmationLevel = 'REPEAT_PASS_SINGLE_SATELLITE';
    }

    // FRP metrics
    const frps = clusterObs.map(o => o.frp || 0).filter(f => f > 0);
    const maxFrp = frps.length > 0 ? Math.max(...frps) : 0;
    const meanFrp =
      frps.length > 0
        ? Math.round((frps.reduce((a, b) => a + b, 0) / frps.length) * 10) / 10
        : 0;

    const topScore = Math.max(...clusterObs.map(o => o.score?.finalScore || 0));

    // Calculate maximum distance from centroid to define spread radius
    let maxDistFromCentroid = 0.5;
    for (const o of clusterObs) {
      const d = haversineDistanceKm(avgLat, avgLon, o.latitude, o.longitude);
      if (d > maxDistFromCentroid) maxDistFromCentroid = d;
    }
    const estimatedSpreadRadiusKm = Number(maxDistFromCentroid.toFixed(1));

    // Provenance breakdown
    const provenanceSummary = buildProvenanceSummary(clusterObs);

    // Classify observations within the cluster (matched, unmatched, ambiguous)
    const { matchedPairs, ambiguousPairs } = matchCrossSensorObservations(
      clusterObs,
      config.maxPairDistanceKm ?? 6.0,
      config.maxPairTimeDeltaMinutes ?? 240,
      config.accountForSensorResolution ?? true
    );

    const matchedIdSet = new Set<string>();
    const ambiguousIdSet = new Set<string>();

    matchedPairs.forEach(p => {
      matchedIdSet.add(p.primaryObs.id);
      matchedIdSet.add(p.secondaryObs.id);
    });

    ambiguousPairs.forEach(p => {
      ambiguousIdSet.add(p.primaryObs.id);
      ambiguousIdSet.add(p.secondaryObs.id);
    });

    const matchedObservations = clusterObs.filter(o => matchedIdSet.has(o.id));
    const ambiguousObservations = clusterObs.filter(
      o => ambiguousIdSet.has(o.id) && !matchedIdSet.has(o.id)
    );
    const unmatchedObservations = clusterObs.filter(
      o => !matchedIdSet.has(o.id) && !ambiguousIdSet.has(o.id)
    );

    const { neutralSummary, rationale } = generateNeutralEventSummary(
      `${seed.region || 'Regional'} Candidate Thermal Cluster`,
      clusterObs.length,
      duplicateRecordCount,
      independentEvidenceCount,
      uniqueSensors,
      uniqueSatellites,
      uniqueSources,
      estimatedSpreadRadiusKm,
      durationHours,
      confirmationLevel,
      meanFrp,
      maxFrp
    );

    const eventId = `cluster-${(seed.region || 'zone')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')}-${events.length + 1}`;

    // Tag member observations
    clusterObs.forEach(o => {
      o.candidateClusterId = eventId;
      o.repeatObservationCount = independentEvidenceCount - 1;
    });

    events.push({
      id: eventId,
      clusterName: `${seed.region || 'Regional'} Candidate Thermal Cluster #${events.length + 1}`,
      centroidLatitude: avgLat,
      centroidLongitude: avgLon,
      firstDetectedUtc: firstDetected,
      lastDetectedUtc: lastDetected,
      durationHours,
      observationCount: clusterObs.length,
      uniqueSourcesCount: uniqueSources.length,
      uniqueSatellitesCount: uniqueSatellites.length,
      uniqueSensorsCount: uniqueSensors.length,
      duplicateRecordCount,
      independentEvidenceCount,
      satellitesRepresented: uniqueSatellites,
      sensorFamiliesRepresented: uniqueSensors,
      hasMultiSensorConfirmation,
      hasMultiSatelliteConfirmation,
      confirmationLevel,
      maxFrp,
      meanFrp,
      observations: clusterObs,
      matchedObservations,
      unmatchedObservations,
      ambiguousObservations,
      topPriorityScore: topScore,
      estimatedSpreadRadiusKm,
      neutralEvidenceSummary: neutralSummary,
      groupingRationale: rationale,
      provenanceSummary,
    });
  }

  return events;
}

/**
 * Classifies every individual observation record in the dataset into MATCHED, UNMATCHED, or AMBIGUOUS.
 */
export function classifyAllObservations(
  observations: FireObservation[],
  config: Partial<MatchingToleranceConfig> = {}
): ClassifiedObservationRecord[] {
  const mergedConfig = { ...DEFAULT_MATCHING_CONFIG, ...config };
  const { matchedPairs, ambiguousPairs, unmatchedViirs, unmatchedModis } = matchCrossSensorObservations(
    observations,
    mergedConfig.maxPairDistanceKm,
    mergedConfig.maxPairTimeDeltaMinutes,
    mergedConfig.accountForSensorResolution
  );

  const matchedObsMap = new Map<string, { platforms: Set<SensorPlatform>; sensors: Set<SensorFamily>; reason: string }>();
  const ambiguousObsMap = new Map<string, { platforms: Set<SensorPlatform>; sensors: Set<SensorFamily>; reason: string }>();

  // Matched pairs
  for (const p of matchedPairs) {
    // Primary
    const pEntry = matchedObsMap.get(p.primaryObs.id) || {
      platforms: new Set(),
      sensors: new Set(),
      reason: `Corroborated by ${p.secondaryObs.platform} (${p.secondaryObs.sensorFamily}) within ${p.distanceKm} km and ${p.temporalDeltaLabel}`,
    };
    pEntry.platforms.add(p.secondaryObs.platform);
    pEntry.sensors.add(p.secondaryObs.sensorFamily);
    matchedObsMap.set(p.primaryObs.id, pEntry);

    // Secondary
    const sEntry = matchedObsMap.get(p.secondaryObs.id) || {
      platforms: new Set(),
      sensors: new Set(),
      reason: `Corroborated by ${p.primaryObs.platform} (${p.primaryObs.sensorFamily}) within ${p.distanceKm} km and ${p.temporalDeltaLabel}`,
    };
    sEntry.platforms.add(p.primaryObs.platform);
    sEntry.sensors.add(p.primaryObs.sensorFamily);
    matchedObsMap.set(p.secondaryObs.id, sEntry);
  }

  // Ambiguous pairs
  for (const p of ambiguousPairs) {
    if (!matchedObsMap.has(p.primaryObs.id)) {
      ambiguousObsMap.set(p.primaryObs.id, {
        platforms: new Set([p.secondaryObs.platform]),
        sensors: new Set([p.secondaryObs.sensorFamily]),
        reason: p.ambiguityReason || 'Ambiguous spatial-temporal association',
      });
    }
    if (!matchedObsMap.has(p.secondaryObs.id)) {
      ambiguousObsMap.set(p.secondaryObs.id, {
        platforms: new Set([p.primaryObs.platform]),
        sensors: new Set([p.primaryObs.sensorFamily]),
        reason: p.ambiguityReason || 'Ambiguous spatial-temporal association',
      });
    }
  }

  return observations.map((obs, idx) => {
    // Check if duplicate of earlier record
    let isDupe = false;
    for (let j = 0; j < idx; j++) {
      if (isDuplicateObservation(obs, observations[j])) {
        isDupe = true;
        break;
      }
    }

    if (matchedObsMap.has(obs.id)) {
      const entry = matchedObsMap.get(obs.id)!;
      return {
        observation: obs,
        matchCategory: 'MATCHED',
        matchReason: entry.reason,
        corroboratingPlatforms: Array.from(entry.platforms),
        corroboratingSensors: Array.from(entry.sensors),
        isDuplicate: isDupe,
      };
    }

    if (ambiguousObsMap.has(obs.id)) {
      const entry = ambiguousObsMap.get(obs.id)!;
      return {
        observation: obs,
        matchCategory: 'AMBIGUOUS',
        matchReason: entry.reason,
        corroboratingPlatforms: Array.from(entry.platforms),
        corroboratingSensors: Array.from(entry.sensors),
        isDuplicate: isDupe,
      };
    }

    return {
      observation: obs,
      matchCategory: 'UNMATCHED',
      matchReason: `Isolated detection: No complementary satellite pass within ${mergedConfig.maxPairDistanceKm} km / ${Math.round(mergedConfig.maxPairTimeDeltaMinutes / 60)}h window`,
      corroboratingPlatforms: [],
      corroboratingSensors: [],
      isDuplicate: isDupe,
    };
  });
}
