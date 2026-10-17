/**
 * FireScope — Automated Test Suite CLI Runner
 * 
 * Runs all validation, scoring, matching, evaluation, and API/export test suites:
 * 1. CSV Ingestion & Validation Test Suite
 * 2. Priority Scoring & Explainability Engine Test Suite
 * 3. Multi-Satellite Matching & Event Grouping Test Suite
 * 4. API Error Handling & Export Consistency Test Suite
 * 5. Curated Scientific Benchmark Dataset Suite
 */

import { runCsvValidationTestSuite } from '../src/utils/csvValidationTests';
import { runScoringEngineTestSuite } from '../src/utils/scoringTests';
import { runMatchingEngineTestSuite } from '../src/utils/matchingTests';
import { runApiAndExportTestSuite } from '../src/utils/apiAndExportTests';
import { runBenchmarkSuite } from '../src/utils/evaluationRunner';
import { BENCHMARK_DATASET_VERSION } from '../src/data/benchmarkDataset';
import { DEFAULT_WEIGHTS } from '../src/utils/scoring';
import { DEFAULT_MATCHING_CONFIG } from '../src/utils/matcher';

console.log('===============================================================');
console.log('   FireScope — Automated Test & Verification Runner           ');
console.log('===============================================================');
console.log(`Execution Timestamp: ${new Date().toISOString()}`);
console.log('');

let totalSuites = 0;
let passedSuites = 0;

// 1. CSV Validation
{
  totalSuites++;
  const res = runCsvValidationTestSuite();
  console.log(`[1/5] CSV Ingestion & Validation Test Suite:`);
  console.log(`      Passed: ${res.passedTests}/${res.totalTests} tests`);
  if (res.allPassed) {
    passedSuites++;
    console.log(`      Status: \x1b[32mPASSED\x1b[0m`);
  } else {
    console.log(`      Status: \x1b[31mFAILED\x1b[0m`);
    res.tests.filter(t => !t.passed).forEach(t => {
      console.log(`        - FAIL ${t.id}: ${t.name}`);
    });
  }
  console.log('');
}

// 2. Priority Scoring Engine
{
  totalSuites++;
  const res = runScoringEngineTestSuite();
  console.log(`[2/5] Priority Scoring & Sensitivity Engine Test Suite:`);
  console.log(`      Passed: ${res.passedTests}/${res.totalTests} tests`);
  if (res.allPassed) {
    passedSuites++;
    console.log(`      Status: \x1b[32mPASSED\x1b[0m`);
  } else {
    console.log(`      Status: \x1b[31mFAILED\x1b[0m`);
    res.tests.filter(t => !t.passed).forEach(t => {
      console.log(`        - FAIL ${t.id}: ${t.name}`);
    });
  }
  console.log('');
}

// 3. Multi-Satellite Matching & Event Grouping
{
  totalSuites++;
  const res = runMatchingEngineTestSuite();
  console.log(`[3/5] Multi-Satellite Matching & Event Grouping Test Suite:`);
  console.log(`      Passed: ${res.passedTests}/${res.totalTests} tests`);
  if (res.allPassed) {
    passedSuites++;
    console.log(`      Status: \x1b[32mPASSED\x1b[0m`);
  } else {
    console.log(`      Status: \x1b[31mFAILED\x1b[0m`);
    res.tests.filter(t => !t.passed).forEach(t => {
      console.log(`        - FAIL ${t.id}: ${t.name}`);
    });
  }
  console.log('');
}

// 4. API Error Handling & Export Consistency
{
  totalSuites++;
  const res = runApiAndExportTestSuite();
  console.log(`[4/5] API Error Handling & Export Consistency Test Suite:`);
  console.log(`      Passed: ${res.passed}/${res.total} tests`);
  if (res.allPassed) {
    passedSuites++;
    console.log(`      Status: \x1b[32mPASSED\x1b[0m`);
  } else {
    console.log(`      Status: \x1b[31mFAILED\x1b[0m`);
    res.results.filter(t => !t.passed).forEach(t => {
      console.log(`        - FAIL ${t.id}: ${t.name} -> ${t.actualOutcome}`);
    });
  }
  console.log('');
}

// 5. Curated Scientific Benchmark Dataset Suite
{
  totalSuites++;
  const summary = runBenchmarkSuite(DEFAULT_WEIGHTS, DEFAULT_MATCHING_CONFIG);
  const totalBench =
    summary.validationTestResults.total +
    summary.scoringTestResults.total +
    summary.groupingTestResults.total +
    summary.matchingTestResults.total;
  const passedBench =
    summary.validationTestResults.passed +
    summary.scoringTestResults.passed +
    summary.groupingTestResults.passed +
    summary.matchingTestResults.passed;

  const allBenchPassed = totalBench > 0 && totalBench === passedBench;
  console.log(`[5/5] Curated Scientific Benchmark Suite (v${BENCHMARK_DATASET_VERSION}):`);
  console.log(`      Passed: ${passedBench}/${totalBench} verification criteria`);
  console.log(`      - Validation: ${summary.validationTestResults.passed}/${summary.validationTestResults.total}`);
  console.log(`      - Scoring:    ${summary.scoringTestResults.passed}/${summary.scoringTestResults.total}`);
  console.log(`      - Grouping:   ${summary.groupingTestResults.passed}/${summary.groupingTestResults.total}`);
  console.log(`      - Matching:   ${summary.matchingTestResults.passed}/${summary.matchingTestResults.total}`);

  if (summary.confusionMatrix) {
    console.log(`      Independent Reference Sample (N=${summary.confusionMatrix.sampleSize}):`);
    console.log(`      - Precision: ${(summary.confusionMatrix.precision * 100).toFixed(1)}% | Recall: ${(summary.confusionMatrix.recall * 100).toFixed(1)}% | F1: ${summary.confusionMatrix.f1Score}`);
  }

  if (allBenchPassed) {
    passedSuites++;
    console.log(`      Status: \x1b[32mPASSED\x1b[0m`);
  } else {
    console.log(`      Status: \x1b[31mFAILED\x1b[0m`);
  }
  console.log('');
}

console.log('===============================================================');
console.log(`Summary: ${passedSuites}/${totalSuites} Test Suites Passed.`);
if (passedSuites === totalSuites) {
  console.log('\x1b[32mALL TESTS PASSED SUCCESSFULLY.\x1b[0m');
  console.log('===============================================================');
  process.exit(0);
} else {
  console.log('\x1b[31mSOME TEST SUITES FAILED.\x1b[0m');
  console.log('===============================================================');
  process.exit(1);
}
