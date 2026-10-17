import React, { useState } from 'react';
import {
  Search,
  Filter,
  Download,
  Upload,
  ArrowUpDown,
  ExternalLink,
  AlertCircle,
  FileText,
  CheckCircle2,
  X,
  FileSpreadsheet,
  Database,
} from 'lucide-react';
import { FireObservation, ConfidenceCategory, SensorFamily } from '../../types/observation';
import { generateObservationsCsv, triggerCsvDownload } from '../../utils/export';
import { CsvImportPanel } from '../common/CsvImportPanel';

interface ObservationsViewProps {
  observations: FireObservation[];
  onSelectObservation: (obs: FireObservation) => void;
  onImportCustomObservations: (newObs: FireObservation[]) => void;
}

export const ObservationsView: React.FC<ObservationsViewProps> = ({
  observations,
  onSelectObservation,
  onImportCustomObservations,
}) => {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [sensorFilter, setSensorFilter] = useState<'ALL' | SensorFamily>('ALL');
  const [confidenceFilter, setConfidenceFilter] = useState<'ALL' | ConfidenceCategory>('ALL');
  const [dayNightFilter, setDayNightFilter] = useState<'ALL' | 'D' | 'N'>('ALL');
  const [sortField, setSortField] = useState<keyof FireObservation | 'score'>('score');
  const [sortAsc, setSortAsc] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // CSV Import Panel state
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);

  // Filtered & Sorted Records
  const filteredRecords = observations.filter(obs => {
    if (sensorFilter !== 'ALL' && obs.sensorFamily !== sensorFilter) return false;
    if (confidenceFilter !== 'ALL' && obs.confidenceCategory !== confidenceFilter) return false;
    if (dayNightFilter !== 'ALL' && obs.dayNight !== dayNightFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        obs.id.toLowerCase().includes(q) ||
        obs.region.toLowerCase().includes(q) ||
        obs.country.toLowerCase().includes(q) ||
        obs.platform.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  const sortedRecords = [...filteredRecords].sort((a, b) => {
    let valA: any = a[sortField as keyof FireObservation];
    let valB: any = b[sortField as keyof FireObservation];

    if (sortField === 'score') {
      valA = a.score.finalScore;
      valB = b.score.finalScore;
    }

    if (valA === valB) return 0;
    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;

    return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
  });

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const paginatedRecords = sortedRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (field: keyof FireObservation | 'score') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleExportFiltered = () => {
    const csv = generateObservationsCsv(filteredRecords);
    triggerCsvDownload(csv, `firescope-observations-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="space-y-4">
      {/* Search, Filter & Action Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by ID, region, country, or sensor platform..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-md pl-9 pr-3 py-1.5 text-neutral-100 placeholder-neutral-400 focus:border-amber-500 outline-none transition-colors"
            />
          </div>

          {/* Sensor family filter */}
          <select
            value={sensorFilter}
            onChange={e => {
              setSensorFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="bg-neutral-950 border border-neutral-800 text-neutral-200 rounded-md px-2.5 py-1.5 outline-none focus:border-amber-500"
          >
            <option value="ALL">All Sensors</option>
            <option value="VIIRS">VIIRS Only</option>
            <option value="MODIS">MODIS Only</option>
          </select>

          {/* Confidence filter */}
          <select
            value={confidenceFilter}
            onChange={e => {
              setConfidenceFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="bg-neutral-950 border border-neutral-800 text-neutral-200 rounded-md px-2.5 py-1.5 outline-none focus:border-amber-500"
          >
            <option value="ALL">All Confidence</option>
            <option value="high">High Confidence</option>
            <option value="nominal">Nominal Confidence</option>
            <option value="low">Low Confidence</option>
          </select>

          {/* Day / Night filter */}
          <select
            value={dayNightFilter}
            onChange={e => {
              setDayNightFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="bg-neutral-950 border border-neutral-800 text-neutral-200 rounded-md px-2.5 py-1.5 outline-none focus:border-amber-500"
          >
            <option value="ALL">Day & Night</option>
            <option value="D">Day Pass Only</option>
            <option value="N">Night Pass Only</option>
          </select>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsImportPanelOpen(true)}
            className="px-3 py-1.5 bg-neutral-950 border border-neutral-800 hover:bg-neutral-800 text-amber-400 hover:text-amber-300 rounded-md transition-colors flex items-center gap-1.5 font-medium shadow-sm"
            title="Open comprehensive CSV upload, mapping, and validation panel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>CSV Upload Panel</span>
          </button>

          <button
            onClick={handleExportFiltered}
            className="px-3 py-1.5 bg-neutral-950 border border-neutral-800 hover:bg-neutral-800 text-neutral-200 rounded-md transition-colors flex items-center gap-1.5 font-medium"
          >
            <Download className="w-3.5 h-3.5 text-neutral-400" />
            <span>Export Filtered ({filteredRecords.length})</span>
          </button>
        </div>
      </div>

      {/* High-Density Data Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-950 border-b border-neutral-800 text-neutral-400 font-medium select-none">
                <th className="py-2.5 px-4 cursor-pointer hover:text-neutral-200" onClick={() => handleSort('id')}>
                  <div className="flex items-center gap-1">
                    <span>Record ID</span>
                    <ArrowUpDown className="w-3 h-3 text-neutral-400" />
                  </div>
                </th>
                <th className="py-2.5 px-3">Platform</th>
                <th className="py-2.5 px-3">Coordinates</th>
                <th className="py-2.5 px-3 cursor-pointer hover:text-neutral-200" onClick={() => handleSort('acqTimestampUtc')}>
                  <div className="flex items-center gap-1">
                    <span>Acquisition UTC</span>
                    <ArrowUpDown className="w-3 h-3 text-neutral-400" />
                  </div>
                </th>
                <th className="py-2.5 px-3">Pass</th>
                <th className="py-2.5 px-3 text-right cursor-pointer hover:text-neutral-200" onClick={() => handleSort('frp')}>
                  <div className="flex items-center justify-end gap-1">
                    <span>FRP (MW)</span>
                    <ArrowUpDown className="w-3 h-3 text-neutral-400" />
                  </div>
                </th>
                <th className="py-2.5 px-3 text-right">Brightness (K)</th>
                <th className="py-2.5 px-3">Confidence</th>
                <th className="py-2.5 px-4 text-right cursor-pointer hover:text-neutral-200" onClick={() => handleSort('score')}>
                  <div className="flex items-center justify-end gap-1">
                    <span>Triage Score</span>
                    <ArrowUpDown className="w-3 h-3 text-neutral-400" />
                  </div>
                </th>
                <th className="py-2.5 px-3 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-850">
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-neutral-400 text-xs">
                    No satellite fire observations match the selected criteria.
                  </td>
                </tr>
              ) : (
                paginatedRecords.map(obs => (
                  <tr
                    key={obs.id}
                    onClick={() => onSelectObservation(obs)}
                    className="hover:bg-neutral-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-4 font-mono font-medium text-neutral-200">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[150px]">{obs.id}</span>
                        {obs.sourceProvider === 'CSV_IMPORT' ? (
                          <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-1 py-0.2 rounded border border-cyan-500/20">
                            csv
                          </span>
                        ) : obs.isSynthetic ? (
                          <span className="text-[9px] font-mono text-amber-500/80 bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20">
                            demo
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20">
                            firms
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-300">
                      <span className="truncate block max-w-[120px]">{obs.platform}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-neutral-400">
                      {obs.latitude}°, {obs.longitude}°
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-neutral-300">
                      {obs.acqTimestampUtc.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-400">
                      {obs.dayNight === 'D' ? 'Day' : 'Night'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-amber-400">
                      {obs.frp !== undefined ? obs.frp : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-neutral-300">
                      {obs.brightness ? obs.brightness : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-300">
                      <span className={`font-medium ${
                        obs.confidenceCategory === 'high' ? 'text-emerald-400' :
                        obs.confidenceCategory === 'nominal' ? 'text-neutral-300' : 'text-neutral-400'
                      }`}>
                        {obs.confidence}% ({obs.confidenceCategory})
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-neutral-100">
                      <span className="text-amber-400">{obs.score.finalScore}</span>
                      <span className="text-neutral-400 text-[10px] font-normal">/100</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectObservation(obs);
                        }}
                        className="text-neutral-400 hover:text-amber-400 transition-colors p-1"
                        title="View Full Observation Details"
                      >
                        <ExternalLink className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="bg-neutral-950 px-4 py-2.5 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <div>
            Showing <span className="font-mono tabular-nums font-medium text-neutral-200">{filteredRecords.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> to{' '}
            <span className="font-mono tabular-nums font-medium text-neutral-200">
              {Math.min(currentPage * pageSize, filteredRecords.length)}
            </span>{' '}
            of <span className="font-mono tabular-nums font-medium text-neutral-200">{filteredRecords.length}</span> records
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 disabled:opacity-40 hover:bg-neutral-800 text-neutral-200 transition-colors"
            >
              Previous
            </button>
            <span className="font-mono tabular-nums px-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 disabled:opacity-40 hover:bg-neutral-800 text-neutral-200 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Dedicated CSV Import & Validation Panel */}
      <CsvImportPanel
        isOpen={isImportPanelOpen}
        onClose={() => setIsImportPanelOpen(false)}
        onImportValidRecords={onImportCustomObservations}
      />
    </div>
  );
};
