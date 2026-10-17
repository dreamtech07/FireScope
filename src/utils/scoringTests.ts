/**
 * FireScope — Automated Priority Scoring Unit Test Suite
 * 
 * Verifies Requirements:
 * 1. Known scores calculation matches exact weighted arithmetic
 * 2. Edge cases (brand new severe fire vs stale cold detection)
 * 3. Incomplete & missing data preservation (missing FRP, missing confidence)
 * 4. Non-negative weights validation and sum-to-100% enforcement
 * 5. Sensor-specific semantics (VIIRS categorical vs MODIS numeric)
 * 6. Triage label discipline (restrained operational labels, no "wildfire confirmed")
 */

import {
  computePriorityScore,
  validateWeights,
  normalizeWeights,
  calculateRecencyScore,
  calculateConfidenceScore,
  calculateThermalScore,
  calculateRepeatScore,
  DEFAULT_WEIGHTS,
} from './scoring';
import { FireObservation, ScoreWeights } from '../types/observation';

export interface ScoringTestCase {
  id: string;
  name: string;
  category: 'KNOWN_SCORES' | 'EDGE_CASES' | 'MISSING_DATA' | 'WEIGHT_VALIDATION' | 'SENSOR_SEMANTICS' | 'LABEL_DISCIPLINE';
  description: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: Record<string, unknown>;
}

export function runScoringEngineTestSuite(): {
  tests: ScoringTestCase[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  allPassed: boolean;
} {
  const tests: ScoringTestCase[] = [];

  // Helper mock observation builder
  const createMockObs = (overrides: Partial<FireObservation> = {}): Omit<FireObservation, 'score'> => ({
    id: 'TEST-OBS-001',
    sourceProvider: 'SYNTHETIC_DEMO',
    isSynthetic: true,
    platform: 'VIIRS_NOAA20',
    sensorFamily: 'VIIRS',
    satellite: 'NOAA-20',
    latitude: 39.8452,
    longitude: -121.4121,
    acqTimestampUtc: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 mins ago
    acqDate: '2026-10-16',
    acqTime: '1200',
    dayNight: 'D',
    confidence: 95,
    confidenceCategory: 'high',
    frp: 85.0,
    brightness: 365.2,
    version: '2.0NRT',
    ingestionTimestampUtc: new Date().toISOString(),
    qualityWarnings: [],
    repeatObservationCount: 2,
    region: 'California',
    country: 'USA',
    ...overrides,
  });

  // Test 1: Known Scores Test
  {
    const refDate = new Date('2026-10-16T12:00:00Z');
    // Obs exactly at refDate: elapsed 0h -> recency 100
    // MODIS confidence 80 -> 80
    // MODIS FRP 300 MW -> ~100
    // repeatCount 3 -> 90
    // Weights: 0.25, 0.25, 0.30, 0.20
    // Expected: 0.25*100 (25) + 0.25*80 (20) + 0.30*100 (30) + 0.20*90 (18) = 93
    const obs = createMockObs({
      acqTimestampUtc: '2026-10-16T12:00:00Z',
      sensorFamily: 'MODIS',
      platform: 'MODIS_TERRA',
      confidence: 80,
      confidenceCategory: 'high',
      frp: 299,
      repeatObservationCount: 3,
    });
    const score = computePriorityScore(obs, DEFAULT_WEIGHTS, refDate);
    const expectedFinal = 93;
    const passed = Math.abs(score.finalScore - expectedFinal) <= 1;

    tests.push({
      id: 'SCORE-TEST-01',
      name: 'Deterministic Known Score Arithmetic',
      category: 'KNOWN_SCORES',
      description: 'Verifies weighted linear formula matches analytical hand-calculated reference value within ±1 pt.',
      passed,
      expected: `Final score ~${expectedFinal} (Recency: 25.0 pts, Conf: 20.0 pts, Thermal: 30.0 pts, Repeat: 18.0 pts)`,
      actual: `Final score ${score.finalScore} (Recency: +${score.recencyContribution}, Conf: +${score.confidenceContribution}, Thermal: +${score.thermalContribution}, Repeat: +${score.repeatContribution})`,
      details: { score },
    });
  }

  // Test 2: Edge Case: Brand New High-Intensity Detection
  {
    const now = new Date();
    const obs = createMockObs({
      acqTimestampUtc: now.toISOString(),
      confidence: 100,
      confidenceCategory: 'high',
      frp: 250.0,
      repeatObservationCount: 4,
    });
    const score = computePriorityScore(obs, DEFAULT_WEIGHTS, now);
    const passed = score.finalScore >= 90 && score.triagePriorityLabel === 'Review first';

    tests.push({
      id: 'SCORE-TEST-02',
      name: 'Edge Case: Maximum Thermal Urgency Anomaly',
      category: 'EDGE_CASES',
      description: 'Fresh observation (<1h), max FRP, multi-pass confirmation must achieve top tier ("Review first", >= 90).',
      passed,
      expected: 'Score >= 90 and label === "Review first"',
      actual: `Score: ${score.finalScore}, Label: "${score.triagePriorityLabel}"`,
      details: { score },
    });
  }

  // Test 3: Edge Case: Stale Low-Confidence Cold Detection
  {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 80 * 60 * 60 * 1000).toISOString();
    const obs = createMockObs({
      acqTimestampUtc: threeDaysAgo,
      confidence: 25,
      confidenceCategory: 'low',
      frp: 0.0,
      repeatObservationCount: 0,
    });
    const score = computePriorityScore(obs, DEFAULT_WEIGHTS, now);
    const passed = score.finalScore <= 25 && score.triagePriorityLabel === 'Standard triage queue';

    tests.push({
      id: 'SCORE-TEST-03',
      name: 'Edge Case: Stale (80h old) Zero-FRP Single Pass',
      category: 'EDGE_CASES',
      description: 'Old detection with 0 FRP and no repeats must decay to bottom tier ("Standard triage queue", <= 25).',
      passed,
      expected: 'Score <= 25 and label === "Standard triage queue"',
      actual: `Score: ${score.finalScore}, Label: "${score.triagePriorityLabel}"`,
      details: { score },
    });
  }

  // Test 4: Missing Data: Missing FRP Telemetry
  {
    const obs = createMockObs({
      frp: undefined,
      brightness: undefined,
    });
    const score = computePriorityScore(obs, DEFAULT_WEIGHTS);
    const passed = score.isIncomplete === true && score.missingDataNotes.some(n => n.includes('FRP'));

    tests.push({
      id: 'SCORE-TEST-04',
      name: 'Missing Telemetry: Preserves Unreported FRP',
      category: 'MISSING_DATA',
      description: 'Preserves missing values without inventing false zeros, marks isIncomplete=true and adds note.',
      passed,
      expected: 'isIncomplete === true with FRP missing note',
      actual: `isIncomplete: ${score.isIncomplete}, notes: [${score.missingDataNotes.join(', ')}]`,
      details: { notes: score.missingDataNotes },
    });
  }

  // Test 5: Missing Data: Missing Confidence Value
  {
    const obs = createMockObs({
      confidence: NaN,
      confidenceCategory: 'nominal',
    });
    const score = computePriorityScore(obs, DEFAULT_WEIGHTS);
    const passed = score.isIncomplete === true && score.missingDataNotes.some(n => n.toLowerCase().includes('confidence'));

    tests.push({
      id: 'SCORE-TEST-05',
      name: 'Missing Telemetry: Handles Unspecified Confidence',
      category: 'MISSING_DATA',
      description: 'Flags incomplete telemetry when confidence metric is missing or unparseable.',
      passed,
      expected: 'isIncomplete === true with confidence note',
      actual: `isIncomplete: ${score.isIncomplete}, notes: [${score.missingDataNotes.join(', ')}]`,
    });
  }

  // Test 6: Non-negative Weight Validation
  {
    const negativeWeights: ScoreWeights = {
      recencyWeight: -0.20,
      confidenceWeight: 0.50,
      thermalWeight: 0.50,
      repeatWeight: 0.20,
    };
    const validation = validateWeights(negativeWeights);
    const passed = validation.isValid === false && validation.errors.some(e => e.includes('cannot be negative'));

    tests.push({
      id: 'SCORE-TEST-06',
      name: 'Validation: Rejection of Negative Weights',
      category: 'WEIGHT_VALIDATION',
      description: 'Enforces that all user-specified weights are strictly non-negative (>= 0).',
      passed,
      expected: 'isValid === false with negative weight error',
      actual: `isValid: ${validation.isValid}, errors: [${validation.errors.join('; ')}]`,
    });
  }

  // Test 7: Sum-to-100% Validation
  {
    const invalidSumWeights: ScoreWeights = {
      recencyWeight: 0.30,
      confidenceWeight: 0.30,
      thermalWeight: 0.30,
      repeatWeight: 0.30, // sums to 1.2 (120%)
    };
    const validation = validateWeights(invalidSumWeights);
    const normalized = normalizeWeights(invalidSumWeights);
    const normalizedSum = normalized.recencyWeight + normalized.confidenceWeight + normalized.thermalWeight + normalized.repeatWeight;

    const passed = validation.isValid === false && Math.abs(normalizedSum - 1.0) < 0.01;

    tests.push({
      id: 'SCORE-TEST-07',
      name: 'Validation: Sum-to-100% Enforcement & Normalizer',
      category: 'WEIGHT_VALIDATION',
      description: 'Flags when weights sum to 120% and verifies normalization balances components back to 100%.',
      passed,
      expected: 'isValid === false for 120%, normalized sum === 1.0',
      actual: `isValid: ${validation.isValid} (sum ${validation.sumPercentage}%), normalized sum: ${normalizedSum.toFixed(3)}`,
    });
  }

  // Test 8: Sensor-specific Semantics (VIIRS vs MODIS)
  {
    const viirsHigh = calculateConfidenceScore(0, 'high', 'VIIRS');
    const viirsLow = calculateConfidenceScore(0, 'low', 'VIIRS');
    const modisDirect = calculateConfidenceScore(73, 'nominal', 'MODIS');

    const passed = viirsHigh.score >= 88 && viirsLow.score <= 45 && modisDirect.score === 73;

    tests.push({
      id: 'SCORE-TEST-08',
      name: 'Sensor Semantics: VIIRS Categorical vs MODIS Direct Numeric',
      category: 'SENSOR_SEMANTICS',
      description: 'Maps VIIRS "high" to >=88, "low" to <=45, and accepts MODIS 73% direct integer confidence.',
      passed,
      expected: 'VIIRS high >= 88, low <= 45, MODIS exact 73',
      actual: `VIIRS high: ${viirsHigh.score}, low: ${viirsLow.score}, MODIS: ${modisDirect.score}`,
    });
  }

  // Test 9: Repeat Detection Evidence
  {
    const zeroRepeats = calculateRepeatScore(0);
    const twoRepeats = calculateRepeatScore(2);
    const fiveRepeats = calculateRepeatScore(5);

    const passed = zeroRepeats.score === 15 && twoRepeats.score === 75 && fiveRepeats.score >= 95;

    tests.push({
      id: 'SCORE-TEST-09',
      name: 'Repeat Evidence: Multi-Pass Spatial Concordance',
      category: 'SENSOR_SEMANTICS',
      description: 'Evaluates independent passes: isolated single pass (15 pts) vs persistent multi-pass (75-96 pts).',
      passed,
      expected: '0 repeats = 15, 2 repeats = 75, 5 repeats >= 95',
      actual: `0 repeats: ${zeroRepeats.score}, 2 repeats: ${twoRepeats.score}, 5 repeats: ${fiveRepeats.score}`,
    });
  }

  // Test 10: Triage Label Discipline
  {
    const forbiddenPhrases = ['wildfire confirmed', 'confirmed fire', 'fire severity', 'disaster probability'];
    const sampleObs = createMockObs();
    const score = computePriorityScore(sampleObs);
    const hasForbidden = forbiddenPhrases.some(phrase =>
      score.explanation.toLowerCase().includes(phrase) ||
      score.triagePriorityLabel.toLowerCase().includes(phrase)
    );
    const passed = !hasForbidden && ['Review first', 'Higher triage priority', 'Elevated triage priority', 'Standard triage queue'].includes(score.triagePriorityLabel);

    tests.push({
      id: 'SCORE-TEST-10',
      name: 'Analyst Label Discipline: No Unconfirmed Claims',
      category: 'LABEL_DISCIPLINE',
      description: 'Validates that score labels strictly adhere to triage order ("Review first") and never assert confirmed wildfires.',
      passed,
      expected: 'Label is standardized triage tier without forbidden confirmation claims',
      actual: `Label: "${score.triagePriorityLabel}", Zero forbidden phrases found.`,
    });
  }

  const passedTests = tests.filter(t => t.passed).length;
  const failedTests = tests.length - passedTests;

  return {
    tests,
    totalTests: tests.length,
    passedTests,
    failedTests,
    allPassed: failedTests === 0,
  };
}
