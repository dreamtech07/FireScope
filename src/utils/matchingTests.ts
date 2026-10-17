/**
 * FireScope — Automated Multi-Satellite Observation Matching & Event Grouping Test Suite
 * 
 * Verifies Requirements:
 * 1. Nearby observations (< 6km / < 12km) and matching times are properly grouped.
 * 2. Distant observations (> spatial tolerance) are segregating into separate events.
 * 3. Different acquisition times (> temporal tolerance) are NOT merged even if co-located.
 * 4. Duplicate records are detected and excluded from independent evidence counts.
 * 5. Conflicting source evidence (e.g. VIIRS High vs MODIS Low) produces ambiguous warnings.
 * 6. Records count is strictly distinguished from unique sources, satellites, and sensors.
 * 7. Candidate event summaries use neutral evidence language and NEVER claim "confirmed wildfire".
 */

import { FireObservation, SensorPlatform, ConfidenceCategory } from '../types/observation';
import {
  matchCrossSensorObservations,
  groupIntoCandidateEvents,
  haversineDistanceKm,
  timeDifferenceMinutes,
  isDuplicateObservation,
} from './matcher';

export interface MatchingTestCaseResult {
  id: string;
  name: string;
  category: 'NEARBY' | 'DISTANT' | 'ACQ_TIME' | 'DUPLICATES' | 'CONFLICTING_EVIDENCE' | 'PROVENANCE' | 'NEUTRAL_LANGUAGE';
  description: string;
  expectedOutcome: string;
  actualOutcome: string;
  passed: boolean;
  diagnostics: string;
  executionTimeMs: number;
}

function createMockObservation(overrides: Partial<FireObservation>): FireObservation {
  const platform: SensorPlatform = overrides.platform || 'VIIRS_NOAA20';
  const confidenceCategory: ConfidenceCategory = overrides.confidenceCategory || 'high';

  return {
    id: overrides.id || `mock-${Math.random().toString(36).slice(2, 7)}`,
    sourceProvider: overrides.sourceProvider || 'NASA_FIRMS',
    source: overrides.source || 'NASA FIRMS',
    dataSourceAttribution: 'NASA FIRMS Land, Atmosphere Near real-time Capability for EOS',
    isSynthetic: false,
    latitude: overrides.latitude ?? 39.845,
    longitude: overrides.longitude ?? -121.412,
    brightness: overrides.brightness ?? 355.0,
    scan: 0.38,
    track: 0.36,
    acqDate: overrides.acqDate || '2026-10-15',
    acqTime: overrides.acqTime || '1830',
    acqTimestampUtc: overrides.acqTimestampUtc || '2026-10-15T18:30:00Z',
    satellite: overrides.satellite || 'NOAA-20',
    instrument: overrides.instrument || 'VIIRS',
    sensorFamily: overrides.sensorFamily || 'VIIRS',
    platform,
    confidence: overrides.confidence ?? 95,
    confidenceCategory,
    version: '2.0NRT',
    frp: overrides.frp ?? 120.5,
    dayNight: 'D',
    ingestionTimestampUtc: '2026-10-15T19:00:00Z',
    qualityWarnings: [],
    repeatObservationCount: 0,
    region: overrides.region || 'Sierra Nevada, CA',
    country: 'USA',
    score: {
      recencyScore: 80,
      confidenceScore: 90,
      thermalScore: 75,
      repeatScore: 30,
      finalScore: 72,
      triagePriorityLabel: 'Higher triage priority',
      isIncomplete: false,
      missingDataNotes: [],
      explanation: 'Calculated test score',
      recencyContribution: 20,
      confidenceContribution: 22.5,
      thermalContribution: 22.5,
      repeatContribution: 6,
    },
  };
}

export function runMatchingEngineTestSuite(): {
  tests: MatchingTestCaseResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  allPassed: boolean;
} {
  const tests: MatchingTestCaseResult[] = [];

  // TEST 1: Nearby Observations Grouping
  {
    const t0 = performance.now();
    const obsViirs = createMockObservation({
      id: 'NEAR-V-1',
      latitude: 39.850,
      longitude: -121.410,
      sensorFamily: 'VIIRS',
      platform: 'VIIRS_NOAA20',
      satellite: 'NOAA-20',
      acqTimestampUtc: '2026-10-15T18:30:00Z',
    });
    const obsModis = createMockObservation({
      id: 'NEAR-M-1',
      latitude: 39.865,
      longitude: -121.395,
      sensorFamily: 'MODIS',
      platform: 'MODIS_AQUA',
      satellite: 'Aqua',
      acqTimestampUtc: '2026-10-15T19:15:00Z',
    });

    const dist = haversineDistanceKm(obsViirs.latitude, obsViirs.longitude, obsModis.latitude, obsModis.longitude);
    const timeDelta = timeDifferenceMinutes(obsViirs.acqTimestampUtc, obsModis.acqTimestampUtc);

    const { matchedPairs } = matchCrossSensorObservations([obsViirs, obsModis], 6.0, 240);
    const clusters = groupIntoCandidateEvents([obsViirs, obsModis], 12.0, 24.0);

    const passed =
      dist < 6.0 &&
      timeDelta === 45 &&
      matchedPairs.length === 1 &&
      clusters.length === 1 &&
      clusters[0].hasMultiSensorConfirmation;

    tests.push({
      id: 'MATCH-TEST-01',
      name: 'Nearby Observations Multi-Satellite Association',
      category: 'NEARBY',
      description: 'Pairs VIIRS (NOAA-20) and MODIS (Aqua) separated by 2.1km and 45 mins into a coherent candidate event.',
      expectedOutcome: '1 matched pair, 1 candidate event with multi-sensor confirmation = true',
      actualOutcome: `${matchedPairs.length} matched pairs, ${clusters.length} event, multiSensor=${clusters[0]?.hasMultiSensorConfirmation}`,
      passed,
      diagnostics: `Distance: ${dist} km, Time Delta: ${timeDelta} min`,
      executionTimeMs: Number((performance.now() - t0).toFixed(2)),
    });
  }

  // TEST 2: Distant Observations Segregation
  {
    const t0 = performance.now();
    const obs1 = createMockObservation({
      id: 'DIST-1',
      latitude: 39.850,
      longitude: -121.410,
      region: 'North Sector',
    });
    const obs2 = createMockObservation({
      id: 'DIST-2',
      latitude: 40.450,
      longitude: -120.510,
      region: 'East Sector',
    });

    const dist = haversineDistanceKm(obs1.latitude, obs1.longitude, obs2.latitude, obs2.longitude);
    const clusters = groupIntoCandidateEvents([obs1, obs2], 12.0, 24.0);

    const passed = dist > 50 && clusters.length === 2;

    tests.push({
      id: 'MATCH-TEST-02',
      name: 'Distant Observations Separation',
      category: 'DISTANT',
      description: 'Verifies that observations separated by > 12km (actual ~99km) are NOT merged into the same event.',
      expectedOutcome: '2 distinct candidate clusters',
      actualOutcome: `${clusters.length} clusters generated`,
      passed,
      diagnostics: `Distance between points: ${dist} km (Threshold: 12.0 km)`,
      executionTimeMs: Number((performance.now() - t0).toFixed(2)),
    });
  }

  // TEST 3: Different Acquisition Times at Identical Coordinates
  {
    const t0 = performance.now();
    const obsDay1 = createMockObservation({
      id: 'TIME-DAY-1',
      latitude: 37.7749,
      longitude: -122.4194,
      acqTimestampUtc: '2026-10-10T12:00:00Z',
    });
    const obsDay5 = createMockObservation({
      id: 'TIME-DAY-5',
      latitude: 37.7749,
      longitude: -122.4194,
      acqTimestampUtc: '2026-10-15T12:00:00Z', // 5 days (120 hours) later
    });

    const hoursDiff = timeDifferenceMinutes(obsDay1.acqTimestampUtc, obsDay5.acqTimestampUtc) / 60;
    const clusters = groupIntoCandidateEvents([obsDay1, obsDay5], 12.0, 36.0); // max 36 hours

    const passed = hoursDiff === 120 && clusters.length === 2;

    tests.push({
      id: 'MATCH-TEST-03',
      name: 'Temporal Tolerance Enforcement (Different Acquisition Times)',
      category: 'ACQ_TIME',
      description: 'Ensures co-located observations separated by 120 hours are NOT merged into the same event solely due to proximity.',
      expectedOutcome: '2 separate clusters (must not merge across 120-hour gap)',
      actualOutcome: `${clusters.length} clusters formed`,
      passed,
      diagnostics: `Acquisition separation: ${hoursDiff} hours (Tolerance limit: 36.0 hours)`,
      executionTimeMs: Number((performance.now() - t0).toFixed(2)),
    });
  }

  // TEST 4: Duplicate Import Segregation from Independent Evidence
  {
    const t0 = performance.now();
    const obsOriginal = createMockObservation({
      id: 'DUPE-ORIG',
      latitude: 34.0522,
      longitude: -118.2437,
      acqTimestampUtc: '2026-10-15T14:00:00Z',
      platform: 'VIIRS_NOAA20',
      satellite: 'NOAA-20',
      sensorFamily: 'VIIRS',
    });
    // Duplicate row from re-import with exact same coordinates, platform, time
    const obsDuplicate = createMockObservation({
      id: 'DUPE-COPY',
      latitude: 34.0522,
      longitude: -118.2437,
      acqTimestampUtc: '2026-10-15T14:00:00Z',
      platform: 'VIIRS_NOAA20',
      satellite: 'NOAA-20',
      sensorFamily: 'VIIRS',
    });

    const isDupe = isDuplicateObservation(obsOriginal, obsDuplicate);
    const clusters = groupIntoCandidateEvents([obsOriginal, obsDuplicate], 12.0, 24.0);
    const cluster = clusters[0];

    const passed =
      isDupe &&
      clusters.length === 1 &&
      cluster.observationCount === 2 &&
      cluster.duplicateRecordCount === 1 &&
      cluster.independentEvidenceCount === 1;

    tests.push({
      id: 'MATCH-TEST-04',
      name: 'Duplicate Import Segregation',
      category: 'DUPLICATES',
      description: 'Identifies exact duplicate imports and excludes them from independent evidence tally.',
      expectedOutcome: '2 total records, 1 duplicate record, 1 independent evidence count',
      actualOutcome: `${cluster?.observationCount} records, ${cluster?.duplicateRecordCount} dupe, ${cluster?.independentEvidenceCount} independent`,
      passed,
      diagnostics: `isDuplicateDetection=${isDupe}, duplicateRecordCount=${cluster?.duplicateRecordCount}`,
      executionTimeMs: Number((performance.now() - t0).toFixed(2)),
    });
  }

  // TEST 5: Conflicting Source Evidence Handling (Ambiguity Detection)
  {
    const t0 = performance.now();
    const obsViirsHigh = createMockObservation({
      id: 'CONF-VIIRS',
      latitude: 44.001,
      longitude: -120.501,
      sensorFamily: 'VIIRS',
      platform: 'VIIRS_SNPP',
      satellite: 'Suomi-NPP',
      confidenceCategory: 'high',
      confidence: 98,
      acqTimestampUtc: '2026-10-15T20:00:00Z',
    });
    const obsModisLow = createMockObservation({
      id: 'CONF-MODIS',
      latitude: 44.020,
      longitude: -120.485,
      sensorFamily: 'MODIS',
      platform: 'MODIS_TERRA',
      satellite: 'Terra',
      confidenceCategory: 'low',
      confidence: 25,
      acqTimestampUtc: '2026-10-15T23:30:00Z', // 210 min later (borderline)
    });

    const { matchedPairs, ambiguousPairs } = matchCrossSensorObservations(
      [obsViirsHigh, obsModisLow],
      6.0,
      240
    );

    const isAmbiguous = ambiguousPairs.length === 1 && matchedPairs.length === 0;
    const reason = ambiguousPairs[0]?.ambiguityReason || '';
    const passed = isAmbiguous && (reason.includes('Divergent confidence') || reason.includes('High temporal delta'));

    tests.push({
      id: 'MATCH-TEST-05',
      name: 'Conflicting Source Evidence & Ambiguity Flagging',
      category: 'CONFLICTING_EVIDENCE',
      description: 'Flags cross-sensor match as AMBIGUOUS when confidence sharply diverges (High vs Low) or time delta is borderline.',
      expectedOutcome: 'Flagged as AMBIGUOUS with explanatory diagnostic reason',
      actualOutcome: `ambiguousCount=${ambiguousPairs.length}, reason="${reason}"`,
      passed,
      diagnostics: `Match quality: ${ambiguousPairs[0]?.matchQuality}, Reason: ${reason}`,
      executionTimeMs: Number((performance.now() - t0).toFixed(2)),
    });
  }

  // TEST 6: Provenance & Multi-Entity Distinction
  {
    const t0 = performance.now();
    const obs1 = createMockObservation({
      id: 'PROV-1',
      source: 'NASA FIRMS',
      platform: 'VIIRS_NOAA20',
      satellite: 'NOAA-20',
      sensorFamily: 'VIIRS',
      latitude: 38.5,
      longitude: -120.1,
    });
    const obs2 = createMockObservation({
      id: 'PROV-2',
      source: 'NASA FIRMS',
      platform: 'VIIRS_SNPP',
      satellite: 'Suomi-NPP',
      sensorFamily: 'VIIRS',
      latitude: 38.52,
      longitude: -120.12,
    });
    const obs3 = createMockObservation({
      id: 'PROV-3',
      source: 'Imported CSV (USFS)',
      platform: 'MODIS_AQUA',
      satellite: 'Aqua',
      sensorFamily: 'MODIS',
      latitude: 38.51,
      longitude: -120.11,
    });

    const clusters = groupIntoCandidateEvents([obs1, obs2, obs3], 12.0, 24.0);
    const c = clusters[0];

    const passed =
      clusters.length === 1 &&
      c.observationCount === 3 &&
      c.uniqueSourcesCount === 2 && // NASA FIRMS & Imported CSV (USFS)
      c.uniqueSatellitesCount === 3 && // NOAA-20, Suomi-NPP, Aqua
      c.uniqueSensorsCount === 2; // VIIRS & MODIS

    tests.push({
      id: 'MATCH-TEST-06',
      name: 'Provenance & Entity Distinction (Records vs Satellites/Sensors)',
      category: 'PROVENANCE',
      description: 'Strictly distinguishes total record count (3) from unique sources (2), satellites (3), and sensors (2).',
      expectedOutcome: '3 records, 2 unique sources, 3 satellites, 2 sensors',
      actualOutcome: `${c?.observationCount} records, ${c?.uniqueSourcesCount} sources, ${c?.uniqueSatellitesCount} satellites, ${c?.uniqueSensorsCount} sensors`,
      passed,
      diagnostics: `Confirmation Level: ${c?.confirmationLevel}, Provenance Items: ${c?.provenanceSummary.length}`,
      executionTimeMs: Number((performance.now() - t0).toFixed(2)),
    });
  }

  // TEST 7: Neutral Evidence Language Discipline
  {
    const t0 = performance.now();
    const obs1 = createMockObservation({
      id: 'LANG-1',
      latitude: 42.1,
      longitude: -122.3,
      frp: 850.0, // very high FRP
    });
    const obs2 = createMockObservation({
      id: 'LANG-2',
      latitude: 42.12,
      longitude: -122.31,
      frp: 450.0,
      platform: 'MODIS_AQUA',
      satellite: 'Aqua',
      sensorFamily: 'MODIS',
    });

    const clusters = groupIntoCandidateEvents([obs1, obs2], 12.0, 24.0);
    const c = clusters[0];

    const forbiddenPhrases = [
      'confirmed wildfire',
      'wildfire confirmed',
      'confirmed fire',
      'fire confirmed',
      'severe disaster',
      'raging blaze',
    ];

    const summaryLower = (c.neutralEvidenceSummary + ' ' + c.groupingRationale).toLowerCase();
    const containsForbidden = forbiddenPhrases.some(phrase => summaryLower.includes(phrase));
    const containsNeutralNotice = summaryLower.includes('spaceborne') && summaryLower.includes('verification');

    const passed = !containsForbidden && containsNeutralNotice;

    tests.push({
      id: 'MATCH-TEST-07',
      name: 'Neutral Evidence Language Discipline',
      category: 'NEUTRAL_LANGUAGE',
      description: 'Validates that candidate events NEVER use "confirmed wildfire" and maintain objective spaceborne radiometric triage language.',
      expectedOutcome: 'Zero forbidden disaster claims; explicit ground-verification disclaimer present',
      actualOutcome: containsForbidden
        ? 'FAIL: Contains prohibited claim'
        : 'PASS: Strictly neutral evidence summary',
      passed,
      diagnostics: `Neutral summary sample: "${c.neutralEvidenceSummary.slice(0, 110)}..."`,
      executionTimeMs: Number((performance.now() - t0).toFixed(2)),
    });
  }

  const passedTests = tests.filter(t => t.passed).length;

  return {
    tests,
    totalTests: tests.length,
    passedTests,
    failedTests: tests.length - passedTests,
    allPassed: passedTests === tests.length,
  };
}
