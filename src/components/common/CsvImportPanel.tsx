/**
 * FireScope — Dedicated CSV Upload & Validation Panel Component
 * 
 * Complies with all requirements:
 * 1. Supports NASA FIRMS (VIIRS & MODIS) and FireScope Common Schema
 * 2. Previews first 5 rows before import
 * 3. Shows detected column names and field mappings
 * 4. Validates coordinates, timestamps, and numbers
 * 5. Handles missing optional fields without inventing values
 * 6. Reports invalid rows with row numbers, failed fields, and explanations
 * 7. Distinguishes exact duplicates from likely repeats
 * 8. Download validation errors as CSV
 * 9. Bundled synthetic sample CSV loader
 */

import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  X,
  Download,
  Copy,
  Eye,
  Layers,
  ArrowRight,
  Database,
  Info,
  ShieldAlert,
  FileSpreadsheet,
} from 'lucide-react';
import { FireObservation } from '../../types/observation';
import {
  parseCsvText,
  detectColumnMapping,
  validateObservationBatch,
  generateValidationErrorReportCsv,
  BUNDLED_SYNTHETIC_SAMPLE_CSV,
  ValidationReport,
} from '../../utils/validator';
import { triggerCsvDownload } from '../../utils/export';

interface CsvImportPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onImportValidRecords: (records: FireObservation[]) => void;
}

export const CsvImportPanel: React.FC<CsvImportPanelProps> = ({
  isOpen,
  onClose,
  onImportValidRecords,
}) => {
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'errors' | 'mapping'>('preview');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Process and validate CSV text
  const handleValidate = (textToValidate: string, customName?: string) => {
    setIsProcessing(true);
    try {
      const rawRows = parseCsvText(textToValidate);
      if (rawRows.length === 0) {
        setReport(null);
        setIsProcessing(false);
        return;
      }

      const headers = Object.keys(rawRows[0]);
      const mapping = detectColumnMapping(headers);
      const validationReport = validateObservationBatch(rawRows, mapping);
      setReport(validationReport);
      if (customName) setFileName(customName);
      if (validationReport.rejectedRows.length > 0 && validationReport.validRecords.length === 0) {
        setActiveTab('errors');
      } else {
        setActiveTab('preview');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = event => {
      const content = String(event.target?.result || '');
      setCsvText(content);
      handleValidate(content, file.name);
    };
    reader.readAsText(file);
  };

  // Load bundled sample CSV
  const handleLoadSampleCsv = () => {
    setFileName('firescope-firms-synthetic-sample.csv');
    setCsvText(BUNDLED_SYNTHETIC_SAMPLE_CSV);
    handleValidate(BUNDLED_SYNTHETIC_SAMPLE_CSV, 'firescope-firms-synthetic-sample.csv');
  };

  // Download validation error report as CSV
  const handleDownloadErrors = () => {
    if (!report || report.rejectedRows.length === 0) return;
    const errorCsv = generateValidationErrorReportCsv(report.rejectedRows);
    triggerCsvDownload(errorCsv, `firescope-validation-errors-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // Commit valid records to the application
  const handleCommitImport = () => {
    if (!report || report.validRecords.length === 0) return;
    onImportValidRecords(report.validRecords);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-4xl w-full flex flex-col shadow-2xl overflow-hidden max-h-[92vh] text-xs">
        {/* Modal Top Bar */}
        <div className="px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-100">CSV Observation Ingestion & Validation Panel</h3>
              <p className="text-[11px] text-neutral-400">
                Supports NASA FIRMS VIIRS & MODIS exports, and FireScope Common Schema
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Ingestion Source Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* File Drop / Select Card */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-3.5 bg-neutral-950 border border-dashed border-neutral-800 hover:border-amber-500/50 rounded-lg cursor-pointer transition-colors flex flex-col items-center justify-center text-center space-y-1.5"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload className="w-5 h-5 text-amber-500" />
              <div className="font-medium text-neutral-200">
                {fileName ? fileName : 'Choose CSV File'}
              </div>
              <p className="text-[10px] text-neutral-400">Click to browse or drop file</p>
            </div>

            {/* Load Bundled Synthetic Sample */}
            <div
              onClick={handleLoadSampleCsv}
              className="p-3.5 bg-neutral-950 border border-neutral-800 hover:border-amber-500/50 rounded-lg cursor-pointer transition-colors flex flex-col justify-between"
            >
              <div className="flex items-center gap-2 text-neutral-200 font-medium">
                <Database className="w-4 h-4 text-amber-500" />
                <span>Load Bundled Sample CSV</span>
              </div>
              <p className="text-[10px] text-neutral-400 leading-tight mt-1">
                Curated FIRMS dataset with VIIRS/MODIS rows, missing FRP edge cases, duplicates, and corrupt test records.
              </p>
              <div className="text-[10px] font-mono text-amber-400 font-semibold mt-2">
                Click to load sample (14 rows) →
              </div>
            </div>

            {/* Data Provenance & Safety Notice */}
            <div className="p-3.5 bg-neutral-950/60 border border-neutral-800 rounded-lg flex flex-col justify-between text-[11px] text-neutral-400">
              <div className="flex items-center gap-1.5 text-neutral-300 font-medium">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>Validation Guarantee</span>
              </div>
              <p className="text-[10px] leading-relaxed">
                Partial Batch Resilience: Valid records are preserved and imported even if unrelated rows in the same file fail validation.
              </p>
              <div className="text-[10px] text-neutral-400 italic">
                Missing optional fields are preserved without falsified zero substitutions.
              </div>
            </div>
          </div>

          {/* Direct CSV Text Editor / Paste Option */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-neutral-400 text-[11px]">
              <span>Or paste raw CSV text:</span>
              {csvText && (
                <button
                  onClick={() => {
                    setCsvText('');
                    setFileName(null);
                    setReport(null);
                  }}
                  className="hover:text-neutral-200"
                >
                  Clear Text
                </button>
              )}
            </div>
            <textarea
              rows={3}
              value={csvText}
              onChange={e => {
                setCsvText(e.target.value);
                if (e.target.value.trim().length > 10) {
                  handleValidate(e.target.value);
                } else {
                  setReport(null);
                }
              }}
              placeholder="latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,frp..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded p-2.5 font-mono text-[11px] text-neutral-200 placeholder-neutral-400 outline-none focus:border-amber-500"
            />
          </div>

          {/* Validation Report & Inspector */}
          {report && (
            <div className="space-y-3.5 pt-1">
              {/* Metric Counts Strip */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                  <span className="text-neutral-400 block text-[10px]">Total File Rows</span>
                  <span className="font-mono text-base font-bold text-neutral-100 tabular-nums">
                    {report.totalInputRows}
                  </span>
                </div>

                <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                  <span className="text-neutral-400 block text-[10px]">Valid for Import</span>
                  <span className="font-mono text-base font-bold text-emerald-400 tabular-nums">
                    {report.validRecords.length}
                  </span>
                </div>

                <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                  <span className="text-neutral-400 block text-[10px]">Invalid Rejected</span>
                  <span className={`font-mono text-base font-bold tabular-nums ${report.rejectedRows.length > 0 ? 'text-rose-400' : 'text-neutral-400'}`}>
                    {report.rejectedRows.length}
                  </span>
                </div>

                <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                  <span className="text-neutral-400 block text-[10px]">Exact Duplicates</span>
                  <span className="font-mono text-base font-bold text-amber-400 tabular-nums">
                    {report.duplicateCount}
                  </span>
                </div>

                <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                  <span className="text-neutral-400 block text-[10px]">Likely Repeats (10km/24h)</span>
                  <span className="font-mono text-base font-bold text-neutral-300 tabular-nums">
                    {report.likelyRepeatCount}
                  </span>
                </div>
              </div>

              {/* Sub-tab Navigation: Preview First Rows / Validation Errors / Column Mapping */}
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('preview')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      activeTab === 'preview'
                        ? 'bg-neutral-950 text-neutral-100 border border-neutral-800'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <span>Preview First 5 Rows</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('errors')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      activeTab === 'errors'
                        ? 'bg-neutral-950 text-rose-400 border border-neutral-800'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <span>Validation Errors</span>
                    {report.rejectedRows.length > 0 && (
                      <span className="px-1.5 py-0.2 bg-rose-500/20 text-rose-400 rounded text-[10px] font-mono">
                        {report.rejectedRows.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab('mapping')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      activeTab === 'mapping'
                        ? 'bg-neutral-950 text-amber-400 border border-neutral-800'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <span>Schema & Field Mapping</span>
                  </button>
                </div>

                {/* Detected format tag */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-neutral-400">Detected Format:</span>
                  <span className="font-mono text-[10px] font-semibold text-neutral-200 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                    {report.columnMapping.schemaType.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Sub-tab 1: First Rows Preview Table */}
              {activeTab === 'preview' && (
                <div className="space-y-2">
                  <div className="overflow-x-auto bg-neutral-950 border border-neutral-850 rounded">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 font-medium">
                          <th className="py-2 px-3">#</th>
                          {report.firstPreviewRows.length > 0 &&
                            Object.keys(report.firstPreviewRows[0]).slice(0, 8).map(header => (
                              <th key={header} className="py-2 px-3 font-mono">{header}</th>
                            ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-850 font-mono">
                        {report.firstPreviewRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-neutral-900/40">
                            <td className="py-1.5 px-3 text-neutral-400 font-bold">{idx + 1}</td>
                            {Object.values(row).slice(0, 8).map((val, cIdx) => (
                              <td key={cIdx} className="py-1.5 px-3 text-neutral-300 truncate max-w-[140px]">
                                {String(val || '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-neutral-400 italic">
                    Showing first {report.firstPreviewRows.length} rows as ingested before validation processing.
                  </p>
                </div>
              )}

              {/* Sub-tab 2: Validation Errors Table */}
              {activeTab === 'errors' && (
                <div className="space-y-2.5">
                  {report.rejectedRows.length === 0 ? (
                    <div className="p-4 bg-neutral-950 rounded border border-neutral-800 text-center text-emerald-400 flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Zero validation errors! All rows satisfy coordinate, temporal, and physical bounds.</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-300 font-medium">
                          {report.rejectedRows.length} Invalid Records Detected & Quarantined
                        </span>
                        <button
                          onClick={handleDownloadErrors}
                          className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 hover:bg-neutral-800 text-neutral-200 transition-colors flex items-center gap-1.5"
                          title="Export validation errors to CSV"
                        >
                          <Download className="w-3.5 h-3.5 text-neutral-400" />
                          <span>Download Error Report CSV</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto max-h-56 bg-neutral-950 border border-neutral-850 rounded">
                        <table className="w-full text-left text-[11px] border-collapse">
                          <thead>
                            <tr className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 font-medium">
                              <th className="py-2 px-3">File Line</th>
                              <th className="py-2 px-3">Identifier</th>
                              <th className="py-2 px-3">Violated Field</th>
                              <th className="py-2 px-3">Received Value</th>
                              <th className="py-2 px-4">Rejection Explanation</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-850">
                            {report.rejectedRows.map((err, idx) => (
                              <tr key={idx} className="hover:bg-neutral-900/50">
                                <td className="py-1.5 px-3 font-mono font-bold text-amber-500">
                                  Row #{err.rowIndex}
                                </td>
                                <td className="py-1.5 px-3 font-mono text-neutral-400">
                                  {err.recordId}
                                </td>
                                <td className="py-1.5 px-3 font-mono font-semibold text-rose-400">
                                  {err.failedFields.map(f => f.field).join(', ')}
                                </td>
                                <td className="py-1.5 px-3 font-mono text-neutral-300">
                                  {err.failedFields.map(f => String(f.receivedValue)).join(', ')}
                                </td>
                                <td className="py-1.5 px-4 text-neutral-300">
                                  {err.reasons.join('; ')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Sub-tab 3: Detected Field Mappings */}
              {activeTab === 'mapping' && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                    {Object.entries(report.columnMapping.mappedFields).map(([standardField, sourceCol]) => (
                      <div key={standardField} className="bg-neutral-950 p-2 rounded border border-neutral-800">
                        <span className="text-neutral-400 block text-[10px] uppercase font-mono">{standardField}</span>
                        <span className={`font-mono font-semibold ${sourceCol ? 'text-emerald-400' : 'text-neutral-400'}`}>
                          {sourceCol ? `→ ${sourceCol}` : 'Not mapped'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {report.columnMapping.unmappedColumns.length > 0 && (
                    <div className="p-2.5 bg-neutral-950 rounded border border-neutral-850 text-[11px]">
                      <span className="text-neutral-400 block text-[10px] mb-1">
                        Preserved Extra Columns (Stored in rawSourceFields):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {report.columnMapping.unmappedColumns.map(col => (
                          <span key={col} className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 font-mono text-neutral-300">
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-neutral-800 flex items-center justify-between bg-neutral-950">
          <div className="text-[11px] text-neutral-400 flex items-center gap-2">
            {report ? (
              <span>
                Ready: <strong className="text-emerald-400">{report.validRecords.length}</strong> valid records ·{' '}
                <strong className="text-rose-400">{report.rejectedRows.length}</strong> rejected rows
              </span>
            ) : (
              <span>Upload or paste CSV above to initiate validation audit</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={handleCommitImport}
              disabled={!report || report.validRecords.length === 0}
              className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {report && report.validRecords.length > 0
                  ? `Import ${report.validRecords.length} Valid Records`
                  : 'Import Valid Records'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
