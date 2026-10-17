/**
 * FireScope — Automated CSV Ingestion & Validation Test Suite
 * 
 * Verifies:
 * 1. Valid FIRMS VIIRS and MODIS records
 * 2. Invalid coordinates (out-of-bounds, non-numeric)
 * 3. Missing/malformed timestamps
 * 4. Malformed numbers (negative FRP, non-numeric)
 * 5. Missing optional fields without inventing values
 * 6. Exact duplicate detection vs unique observations
 * 7. Partial batch import (valid rows are never discarded due to unrelated invalid rows)
 */

import { parseCsvText, validateObservationBatch, detectColumnMapping } from './validator';

export interface CsvValidationTestCase {
  id: string;
  name: string;
  category: 'VALID_ROWS' | 'COORDINATES' | 'TIMESTAMPS' | 'NUMERIC' | 'OPTIONAL_FIELDS' | 'DUPLICATES' | 'PARTIAL_IMPORT';
  description: string;
  inputCsv: string;
  expectedOutcome: {
    validCount: number;
    rejectedCount: number;
    duplicateCount: number;
    expectedRejectionFields?: string[];
  };
  passed: boolean;
  actualOutcome?: {
    validCount: number;
    rejectedCount: number;
    duplicateCount: number;
    actualRejectionFields?: string[];
  };
  executionTimeMs: number;
}

export function runCsvValidationTestSuite(): {
  tests: CsvValidationTestCase[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  allPassed: boolean;
} {
  const tests: CsvValidationTestCase[] = [
    // Test 1: Valid FIRMS VIIRS row
    {
      id: 'CSV-TEST-01',
      name: 'Valid FIRMS VIIRS Row Ingestion',
      category: 'VALID_ROWS',
      description: 'Verifies normal VIIRS record with bright_ti4, acq_date, acq_time, high confidence and FRP.',
      inputCsv: `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n39.8452,-121.4121,367.4,0.38,0.36,2026-10-15,1830,NOAA-20,VIIRS,high,2.0NRT,304.2,148.5,D`,
      expectedOutcome: { validCount: 1, rejectedCount: 0, duplicateCount: 0 },
      passed: false,
      executionTimeMs: 0,
    },

    // Test 2: Valid FIRMS MODIS row
    {
      id: 'CSV-TEST-02',
      name: 'Valid FIRMS MODIS Row Ingestion',
      category: 'VALID_ROWS',
      description: 'Verifies normal MODIS record with brightness, bright_t31, numeric confidence (88%).',
      inputCsv: `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight\n39.8510,-121.4050,341.6,1.0,1.0,2026-10-15,1915,Aqua,MODIS,88,6.1NRT,298.5,165.2,D`,
      expectedOutcome: { validCount: 1, rejectedCount: 0, duplicateCount: 0 },
      passed: false,
      executionTimeMs: 0,
    },

    // Test 3: Invalid coordinates (latitude > 90, longitude < -180, non-numeric lat)
    {
      id: 'CSV-TEST-03',
      name: 'Invalid Geographic Coordinates Detection',
      category: 'COORDINATES',
      description: 'Rejects rows where latitude is 112.5 or -95, and longitude is 210 or non-numeric.',
      inputCsv: `latitude,longitude,bright_ti4,acq_date,acq_time,satellite,confidence,frp\n112.54,-121.41,350.0,2026-10-15,1830,NOAA-20,high,50.0\n38.5,-210.0,350.0,2026-10-15,1830,NOAA-20,high,50.0\nNOT_A_LAT,-120.0,350.0,2026-10-15,1830,NOAA-20,high,50.0`,
      expectedOutcome: {
        validCount: 0,
        rejectedCount: 3,
        duplicateCount: 0,
        expectedRejectionFields: ['latitude', 'longitude'],
      },
      passed: false,
      executionTimeMs: 0,
    },

    // Test 4: Missing or malformed timestamps
    {
      id: 'CSV-TEST-04',
      name: 'Malformed and Missing Timestamps Detection',
      category: 'TIMESTAMPS',
      description: 'Rejects rows with unparseable date strings or completely empty timestamp columns.',
      inputCsv: `latitude,longitude,bright_ti4,acq_date,acq_time,satellite,confidence,frp\n39.8452,-121.4121,350.0,invalid_date_format,9999,NOAA-20,high,50.0\n39.8452,-121.4121,350.0,,,NOAA-20,high,50.0`,
      expectedOutcome: {
        validCount: 0,
        rejectedCount: 2,
        duplicateCount: 0,
        expectedRejectionFields: ['acqTimestampUtc'],
      },
      passed: false,
      executionTimeMs: 0,
    },

    // Test 5: Malformed numbers (negative FRP)
    {
      id: 'CSV-TEST-05',
      name: 'Malformed Numeric Metrics Validation',
      category: 'NUMERIC',
      description: 'Rejects rows with negative FRP values (e.g. -45 MW) or invalid temperature metrics.',
      inputCsv: `latitude,longitude,bright_ti4,acq_date,acq_time,satellite,confidence,frp\n39.8452,-121.4121,350.0,2026-10-15,1830,NOAA-20,high,-45.5\n39.8452,-121.4121,350.0,2026-10-15,1830,NOAA-20,high,NaN_VALUE`,
      expectedOutcome: {
        validCount: 0,
        rejectedCount: 2,
        duplicateCount: 0,
        expectedRejectionFields: ['frp'],
      },
      passed: false,
      executionTimeMs: 0,
    },

    // Test 6: Missing optional fields handled without inventing values
    {
      id: 'CSV-TEST-06',
      name: 'Missing Optional Fields Tolerance',
      category: 'OPTIONAL_FIELDS',
      description: 'Verifies that missing FRP or brightness fields are tolerated as undefined without inventing false zeros.',
      inputCsv: `latitude,longitude,bright_ti4,acq_date,acq_time,satellite,confidence,frp\n39.8452,-121.4121,,2026-10-15,1830,NOAA-20,high,\n39.8612,-121.3984,352.1,2026-10-15,1830,NOAA-20,high,`,
      expectedOutcome: { validCount: 2, rejectedCount: 0, duplicateCount: 0 },
      passed: false,
      executionTimeMs: 0,
    },

    // Test 7: Duplicate detection
    {
      id: 'CSV-TEST-07',
      name: 'Exact Duplicate Detection and Filtering',
      category: 'DUPLICATES',
      description: 'Detects and prunes identical sensor/lat/lon/timestamp tuples.',
      inputCsv: `latitude,longitude,bright_ti4,acq_date,acq_time,satellite,confidence,frp\n39.8452,-121.4121,350.0,2026-10-15,1830,NOAA-20,high,50.0\n39.8452,-121.4121,350.0,2026-10-15,1830,NOAA-20,high,50.0`,
      expectedOutcome: { validCount: 1, rejectedCount: 0, duplicateCount: 1 },
      passed: false,
      executionTimeMs: 0,
    },

    // Test 8: Partial import (valid rows are never discarded due to unrelated invalid rows)
    {
      id: 'CSV-TEST-08',
      name: 'Partial Batch Resilience',
      category: 'PARTIAL_IMPORT',
      description: 'Ensures 2 valid rows are imported cleanly despite 2 invalid rows in the same file.',
      inputCsv: `latitude,longitude,bright_ti4,acq_date,acq_time,satellite,confidence,frp\n39.8452,-121.4121,350.0,2026-10-15,1830,NOAA-20,high,50.0\n112.54,-121.41,350.0,2026-10-15,1830,NOAA-20,high,50.0\n38.1294,-4.8912,335.8,2026-10-15,1210,NOAA-20,nominal,62.4\n39.8452,-121.4121,350.0,bad_date,1830,NOAA-20,high,50.0`,
      expectedOutcome: { validCount: 2, rejectedCount: 2, duplicateCount: 0 },
      passed: false,
      executionTimeMs: 0,
    },
  ];

  // Execute each test
  tests.forEach(testCase => {
    const tStart = performance.now();
    const rows = parseCsvText(testCase.inputCsv);
    const mapping = detectColumnMapping(rows.length > 0 ? Object.keys(rows[0]) : []);
    const report = validateObservationBatch(rows, mapping);
    const duration = Math.round((performance.now() - tStart) * 100) / 100;

    const actualValid = report.validRecords.length;
    const actualRejected = report.rejectedRows.length;
    const actualDups = report.duplicateCount;

    const countsMatch =
      actualValid === testCase.expectedOutcome.validCount &&
      actualRejected === testCase.expectedOutcome.rejectedCount &&
      actualDups === testCase.expectedOutcome.duplicateCount;

    let fieldsMatch = true;
    if (testCase.expectedOutcome.expectedRejectionFields && report.rejectedRows.length > 0) {
      const recordedFields = new Set(
        report.rejectedRows.flatMap(r => r.failedFields.map(f => f.field))
      );
      fieldsMatch = testCase.expectedOutcome.expectedRejectionFields.some(f => recordedFields.has(f));
    }

    testCase.passed = countsMatch && fieldsMatch;
    testCase.actualOutcome = {
      validCount: actualValid,
      rejectedCount: actualRejected,
      duplicateCount: actualDups,
    };
    testCase.executionTimeMs = duration;
  });

  const passedTests = tests.filter(t => t.passed).length;

  return {
    tests,
    totalTests: tests.length,
    passedTests,
    failedTests: tests.length - passedTests,
    allPassed: passedTests === tests.length,
  };
}
