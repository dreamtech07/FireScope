/**
 * FireScope — Explainable Priority Scoring Engine
 * 
 * Computes a transparent 0–100 triage score using normalized features:
 * - Recency (default 25%)
 * - Sensor Confidence (default 25%)
 * - Fire Radiative Power / Thermal Output (default 30%)
 * - Repeat-Detection & Spatial Clustering Evidence (default 20%)
 * 
 * SCIENTIFIC & OPERATIONAL NOTICE:
 * This score is an analyst triage support heuristic to prioritize human review order.
 * It is NOT a wildfire probability model, does NOT predict fire severity,
 * and CANNOT confirm that an active wildfire exists.
 */

import {
  FireObservation,
  ScoreBreakdown,
  ScoreWeights,
  TriagePriorityLabel,
  WeightValidationResult,
  SensorFamily,
  ConfidenceCategory,
} from '../types/observation';

export const DEFAULT_WEIGHTS: ScoreWeights = {
  recencyWeight: 0.25,
  confidenceWeight: 0.25,
  thermalWeight: 0.30,
  repeatWeight: 0.20,
};

/**
 * Validates that scoring weights are non-negative and sum to 100% (1.0).
 */
export function validateWeights(weights: ScoreWeights): WeightValidationResult {
  const errors: string[] = [];
  const { recencyWeight, confidenceWeight, thermalWeight, repeatWeight } = weights;

  if (recencyWeight < 0) errors.push('Recency weight cannot be negative');
  if (confidenceWeight < 0) errors.push('Confidence weight cannot be negative');
  if (thermalWeight < 0) errors.push('Thermal weight cannot be negative');
  if (repeatWeight < 0) errors.push('Repeat pass weight cannot be negative');

  const totalSum = recencyWeight + confidenceWeight + thermalWeight + repeatWeight;
  const sumPercentage = Math.round(totalSum * 1000) / 10;
  const isNormalized = Math.abs(totalSum - 1.0) < 0.001;

  if (!isNormalized) {
    errors.push(`Weights must sum to 100% (current sum: ${sumPercentage}%)`);
  }

  return {
    isValid: errors.length === 0,
    sumPercentage,
    isNormalized,
    errors,
  };
}

/**
 * Normalizes any non-negative weights so they sum exactly to 1.0 (100%).
 */
export function normalizeWeights(weights: ScoreWeights): ScoreWeights {
  const safeRecency = Math.max(0, weights.recencyWeight);
  const safeConfidence = Math.max(0, weights.confidenceWeight);
  const safeThermal = Math.max(0, weights.thermalWeight);
  const safeRepeat = Math.max(0, weights.repeatWeight);

  const total = safeRecency + safeConfidence + safeThermal + safeRepeat;
  if (total === 0) {
    return DEFAULT_WEIGHTS;
  }

  return {
    recencyWeight: Number((safeRecency / total).toFixed(4)),
    confidenceWeight: Number((safeConfidence / total).toFixed(4)),
    thermalWeight: Number((safeThermal / total).toFixed(4)),
    repeatWeight: Number((safeRepeat / total).toFixed(4)),
  };
}

/**
 * Normalizes elapsed hours into a 0-100 recency score using UTC timestamps.
 * - Under 1 hour: 100
 * - 6 hours: ~80
 * - 12 hours: ~65
 * - 24 hours: ~42
 * - 48 hours: ~18
 * - 72+ hours: 5 (aged baseline)
 */
export function calculateRecencyScore(
  acqTimestampUtc: string,
  referenceTimeUtc: Date = new Date()
): { score: number; elapsedHours: number; explanation: string } {
  try {
    const acqTime = new Date(acqTimestampUtc).getTime();
    const refTime = referenceTimeUtc.getTime();

    if (isNaN(acqTime)) {
      return { score: 50, elapsedHours: 24, explanation: 'Unparseable timestamp; defaulted to 50' };
    }

    const diffMs = refTime - acqTime;
    const diffHours = Math.max(0, diffMs / (1000 * 60 * 60));

    let score = 5;
    if (diffHours <= 1) {
      score = 100;
    } else if (diffHours >= 72) {
      score = 5;
    } else {
      // Exponential decay model with ~28h half-life
      score = Math.round(100 * Math.exp(-diffHours / 28));
    }

    const roundedHours = Math.round(diffHours * 10) / 10;
    const explanation = diffHours <= 1
      ? 'Acquired < 1 hour ago (Maximum recency)'
      : `Acquired ${roundedHours}h ago (Decayed to ${score}/100)`;

    return {
      score: Math.min(100, Math.max(5, score)),
      elapsedHours: roundedHours,
      explanation,
    };
  } catch {
    return { score: 50, elapsedHours: 24, explanation: 'Timestamp parsing error; neutral score applied' };
  }
}

/**
 * Normalizes sensor confidence to 0-100 according to documented product semantics.
 * - MODIS: directly reports 0–100 integer confidence from NASA algorithm.
 * - VIIRS: reports categorical confidence ('high' -> 92, 'nominal' -> 65, 'low' -> 30),
 *   or numeric confidence if present.
 */
export function calculateConfidenceScore(
  confidence: number,
  category: ConfidenceCategory,
  sensorFamily?: SensorFamily
): { score: number; explanation: string } {
  if (sensorFamily === 'MODIS') {
    const clamped = Math.min(100, Math.max(0, Math.round(confidence)));
    return {
      score: clamped,
      explanation: `MODIS detection confidence ${clamped}%`,
    };
  }

  // VIIRS categorical confidence mapping
  if (category === 'high') {
    const score = Math.max(88, Math.min(100, confidence || 92));
    return { score, explanation: `VIIRS high-confidence classification (${score}/100)` };
  }
  if (category === 'nominal') {
    const score = Math.max(55, Math.min(75, confidence || 65));
    return { score, explanation: `VIIRS nominal-confidence classification (${score}/100)` };
  }
  if (category === 'low') {
    const score = Math.min(45, Math.max(10, confidence || 30));
    return { score, explanation: `VIIRS low-confidence classification (${score}/100)` };
  }

  // Generic numeric fallback
  const numericClamped = Math.min(100, Math.max(0, Math.round(confidence || 50)));
  return { score: numericClamped, explanation: `Sensor confidence reported as ${numericClamped}%` };
}

/**
 * Normalizes FRP (Fire Radiative Power in MW) to a 0–100 score.
 * Distinguishes sensor pixel footprints:
 * - VIIRS (375m pixel): smaller sub-pixel FRP (e.g. 5–50 MW typical, 100+ MW severe)
 * - MODIS (1km pixel): integrated 1000m footprint (e.g. 15–200 MW typical, 300+ MW extreme)
 * 
 * If FRP is missing or unreported, falls back to brightness temperature (Kelvin),
 * flags incomplete state, and documents baseline.
 */
export function calculateThermalScore(
  frp?: number,
  brightness?: number,
  sensorFamily?: SensorFamily
): { score: number; isMissing: boolean; explanation: string } {
  if (frp !== undefined && frp !== null && !isNaN(frp) && frp >= 0) {
    if (frp === 0) {
      return { score: 10, isMissing: false, explanation: 'FRP measured at 0.0 MW (baseline minimal thermal energy)' };
    }

    // Dynamic ceiling based on sensor footprint
    const maxReferenceFrp = sensorFamily === 'MODIS' ? 300 : 200;
    
    // Logarithmic scale for wide dynamic range
    const logScore = (Math.log10(frp + 1) / Math.log10(maxReferenceFrp)) * 100;
    const clamped = Math.round(Math.min(100, Math.max(10, logScore)));

    return {
      score: clamped,
      isMissing: false,
      explanation: `FRP ${frp.toFixed(1)} MW (${clamped}/100 on ${sensorFamily || 'sensor'} dynamic scale)`,
    };
  }

  // Fallback to brightness temperature (Kelvin) if FRP is absent
  if (brightness && brightness > 300 && !isNaN(brightness)) {
    const kScore = Math.round(((brightness - 300) / (380 - 300)) * 100);
    const clamped = Math.min(100, Math.max(10, kScore));
    return {
      score: clamped,
      isMissing: true,
      explanation: `FRP unreported; estimated from Brightness Temp ${brightness.toFixed(1)} K (${clamped}/100)`,
    };
  }

  // Missing data baseline
  return {
    score: 25,
    isMissing: true,
    explanation: 'Thermal radiance (FRP) is missing from telemetry; neutral baseline applied (25/100)',
  };
}

/**
 * Computes repeat-detection score from verified independent passes.
 * Excludes duplicates from evidence counts.
 * - 0 repeats: 15 (isolated single detection)
 * - 1 repeat: 48 (2 total confirmed passes)
 * - 2 repeats: 75 (3 total passes, multi-pass confirmation)
 * - 3+ repeats: 92+ (persistent thermal signature)
 */
export function calculateRepeatScore(
  repeatCount: number
): { score: number; explanation: string } {
  const safeCount = Math.max(0, repeatCount || 0);

  if (safeCount === 0) {
    return { score: 15, explanation: 'Single isolated observation (no repeat passes in spatio-temporal radius)' };
  }
  if (safeCount === 1) {
    return { score: 48, explanation: '1 independent repeat pass nearby in past 48h' };
  }
  if (safeCount === 2) {
    return { score: 75, explanation: '2 independent repeat passes nearby (persistent confirmation)' };
  }
  if (safeCount === 3) {
    return { score: 90, explanation: '3 independent repeat passes nearby (strong multi-pass cluster)' };
  }

  const score = Math.min(100, 90 + (safeCount - 3) * 3);
  return {
    score,
    explanation: `${safeCount} independent repeat passes nearby in cluster (very high persistence)`,
  };
}

/**
 * Assigns standardized operational triage label.
 * Restrained language: never claims "wildfire confirmed" or "disaster".
 */
export function getTriageLabel(finalScore: number): TriagePriorityLabel {
  if (finalScore >= 80) return 'Review first';
  if (finalScore >= 65) return 'Higher triage priority';
  if (finalScore >= 45) return 'Elevated triage priority';
  return 'Standard triage queue';
}

/**
 * Computes complete explainable priority breakdown for an observation.
 */
export function computePriorityScore(
  obs: Omit<FireObservation, 'score'>,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
  referenceTime: Date = new Date()
): ScoreBreakdown {
  const recency = calculateRecencyScore(obs.acqTimestampUtc, referenceTime);
  const confidence = calculateConfidenceScore(obs.confidence, obs.confidenceCategory, obs.sensorFamily);
  const thermal = calculateThermalScore(obs.frp, obs.brightness, obs.sensorFamily);
  const repeat = calculateRepeatScore(obs.repeatObservationCount);

  // Normalize weights so they always sum to 1.0
  const normalizedWeights = normalizeWeights(weights);

  // Calculate weighted contribution points
  const recencyContribution = Number((normalizedWeights.recencyWeight * recency.score).toFixed(1));
  const confidenceContribution = Number((normalizedWeights.confidenceWeight * confidence.score).toFixed(1));
  const thermalContribution = Number((normalizedWeights.thermalWeight * thermal.score).toFixed(1));
  const repeatContribution = Number((normalizedWeights.repeatWeight * repeat.score).toFixed(1));

  let rawFinal = recencyContribution + confidenceContribution + thermalContribution + repeatContribution;

  // Stationary / persistent industrial heat source demotion
  const hasPersistentEmitterWarning = obs.qualityWarnings?.some(w =>
    /stationary|industrial|flare|volcan|emitter/i.test(w)
  );
  if (hasPersistentEmitterWarning) {
    // Demote stationary industrial emitters to prevent crowding out active wildland fires
    rawFinal = Math.min(55, Math.max(10, rawFinal - 28));
  }

  const finalScore = Math.min(100, Math.max(0, Math.round(rawFinal)));

  const triagePriorityLabel = getTriageLabel(finalScore);

  // Missing data tracking
  const missingDataNotes: string[] = [];
  let isIncomplete = false;

  if (thermal.isMissing) {
    isIncomplete = true;
    missingDataNotes.push('FRP (Fire Radiative Power) missing from record telemetry');
  }
  if (obs.confidence === undefined || obs.confidence === null || isNaN(obs.confidence)) {
    isIncomplete = true;
    missingDataNotes.push('Sensor confidence level unspecified');
  }

  // Construct plain-text explanation
  let driver = 'Balanced contribution';
  if (thermal.score >= 80 && thermalContribution >= 24) {
    driver = `Elevated thermal radiance (${obs.frp ? obs.frp.toFixed(1) + ' MW' : 'high brightness'})`;
  } else if (recency.score >= 90 && recencyContribution >= 22) {
    driver = `Very recent satellite pass (${recency.elapsedHours}h ago)`;
  } else if (repeat.score >= 80 && repeatContribution >= 16) {
    driver = `Repeated multi-satellite detections (${obs.repeatObservationCount} nearby passes)`;
  } else if (finalScore < 45) {
    driver = 'Low thermal intensity and aging pass';
  }

  const explanation = `${triagePriorityLabel}: ${driver}. Overall triage index ${finalScore}/100 ` +
    `[Recency: +${recencyContribution} pts (${recency.score}/100), ` +
    `Confidence: +${confidenceContribution} pts (${confidence.score}/100), ` +
    `Thermal: +${thermalContribution} pts (${thermal.score}/100), ` +
    `Repeat evidence: +${repeatContribution} pts (${repeat.score}/100)]. ` +
    (isIncomplete ? 'Notice: Score contains incomplete telemetry values.' : '');

  return {
    recencyScore: recency.score,
    confidenceScore: confidence.score,
    thermalScore: thermal.score,
    repeatScore: repeat.score,
    finalScore,
    recencyContribution,
    confidenceContribution,
    thermalContribution,
    repeatContribution,
    triagePriorityLabel,
    explanation,
    isIncomplete,
    missingDataNotes,
  };
}
