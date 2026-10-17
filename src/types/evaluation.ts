/**
 * FireScope — Benchmark & Evaluation Schema
 */

import {
  FireObservation,
  ScoreWeights,
  MatchingToleranceConfig,
  SensorPlatform,
  SensorFamily,
  ConfidenceCategory,
} from './observation';

export type BenchmarkRecordType =
  | 'REAL_DOCUMENTED_FIRE'
  | 'SYNTHETIC_EDGE_CASE'
  | 'MISSING_VALUES'
  | 'REPEATED_DETECTION'
  | 'PERSISTENT_HEAT_SOURCE';

export type ReferenceGroundTruthClass =
  | 'ACTIVE_WILDFIRE'
  | 'PERSISTENT_INDUSTRIAL'
  | 'FALSE_DETECTION'
  | 'CORRUPT_INVALID';

export interface BenchmarkRecord {
  id: string;
  title: string;
  description: string;
  recordType: BenchmarkRecordType;
  
  // Requirement 1: Clearly distinguish synthetic examples from real satellite records
  isSynthetic: boolean;
  
  // Satellite Observation Record
  observation: FireObservation;
  
  // Provenance documentation
  provenance: {
    sourceName: string;
    datasetVersion: string;
    collectionYear?: number;
    citationOrReference: string;
    region: string;
    documentedAnomalyType: string;
  };
  
  // Independent reference ground truth (Requirement 3: Only where reliable labels can be obtained)
  independentReference: {
    hasIndependentReferenceLabel: boolean;
    groundTruthClass: ReferenceGroundTruthClass | null;
    referenceAgencyOrDoc: string;
    reliability: 'HIGH_OFFICIAL_PERIMETER' | 'VERIFIED_INDUSTRIAL_REGISTRY' | 'SYNTHETIC_SPECIFICATION' | 'UNVERIFIED';
    notes: string;
  };
  
  // Test evaluation expectations
  expectedOutcomes: {
    shouldPassValidation: boolean;
    expectedTriagePriority: 'Review first' | 'Higher triage priority' | 'Elevated triage priority' | 'Standard triage queue' | 'Suppressed / Quarantine';
    expectedMinimumScore?: number;
    expectedMaximumScore?: number;
    shouldFormClusterWithNeighbors: boolean;
    shouldCrossSensorMatch: boolean;
  };
}

export interface ConfusionMatrixStats {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  specificity: number;
  sampleSize: number;
  evaluatedRecordIds: string[];
  classDistribution: Record<string, number>;
  scientificDisclaimer: string;
}

export interface ValidationRuleResult {
  ruleId: string;
  ruleName: string;
  category: 'COORDINATES' | 'TEMPORAL' | 'THERMAL' | 'SCHEMA' | 'DUPLICATES';
  passed: boolean;
  totalRecordsChecked: number;
  invalidRecordCount: number;
  description: string;
  sampleFailures?: Array<{
    recordId: string;
    field: string;
    receivedValue: unknown;
    reason: string;
  }>;
}

export interface EvaluationScenario {
  id: string;
  title: string;
  scenarioType: 'CROSS_SENSOR_MATCH' | 'HIGH_FRP_CLUSTER' | 'FALSE_POSITIVE_REJECTION' | 'TEMPORAL_DECAY';
  description: string;
  groundTruthLabel: 'ACTIVE_ANOMALY' | 'PERSISTENT_INDUSTRIAL' | 'FALSE_DETECTION' | 'SATELLITE_GLINT';
  expectedTriageRank: 'HIGH' | 'MEDIUM' | 'LOW';
  actualScore: number;
  isCorrectlyClassified: boolean;
  notes: string;
}

export interface BenchmarkMetrics {
  totalTestCases: number;
  validRecordsIngested: number;
  rejectedRecordsCount: number;
  exactDuplicatesFiltered: number;
  spatialClusterMatches: number;
  precision: number;
  recall: number;
  f1Score: number;
  meanLatencyMs: number;
  lastRunTimestampUtc: string;
}

export interface TestResultItem {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  expected: string;
  actual: string;
  diagnostics?: string;
  executionTimeMs: number;
}

export interface BenchmarkSuiteRunSummary {
  version: string;
  timestampUtc: string;
  rankingWeights: ScoreWeights;
  matchingParams: MatchingToleranceConfig;
  totalBenchmarkRecords: number;
  realRecordCount: number;
  syntheticRecordCount: number;
  referenceLabelCount: number;
  unlabelledCount: number;
  validationTestResults: {
    total: number;
    passed: number;
    failed: number;
    tests: TestResultItem[];
  };
  scoringTestResults: {
    total: number;
    passed: number;
    failed: number;
    tests: TestResultItem[];
  };
  groupingTestResults: {
    total: number;
    passed: number;
    failed: number;
    tests: TestResultItem[];
  };
  matchingTestResults: {
    total: number;
    passed: number;
    failed: number;
    tests: TestResultItem[];
  };
  confusionMatrix: ConfusionMatrixStats | null;
  overallPassed: boolean;
}
