import React, { useCallback, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { WorkBook } from 'xlsx';
import { type AdapterResult, buildPlanning } from '../../src/excel/adapter.js';
import { runKbChecks } from '../../src/rules/kb-2005-08-10.js';
import type { Region, Violation } from '../../src/types/index.js';

type LoadedFile = {
  name: string;
  workbook: WorkBook;
};

function isoMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

const DEFAULT_WEEK_START = isoMonday(new Date());

export function App(): React.ReactElement {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [weekStart, setWeekStart] = useState<string>(DEFAULT_WEEK_START);
  const [region, setRegion] = useState<Region>('flanders');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = useCallback(async (f: File) => {
    setBusy(true);
    setError(null);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });
      setFile({ name: f.name, workbook: wb });
    } catch (e) {
      setError(`Kon bestand niet inlezen: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) void handleFile(f);
    },
    [handleFile],
  );

  const result = useMemo<{ adapter: AdapterResult; violations: Violation[] } | null>(() => {
    if (!file) return null;
    try {
      const adapter = buildPlanning(file.workbook, {
        weekStart: new Date(`${weekStart}T00:00:00Z`),
        region,
      });
      const violations = runKbChecks(adapter.planning);
      return { adapter, violations };
    } catch (e) {
      setError(`Fout bij analyseren: ${(e as Error).message}`);
      return null;
    }
  }, [file, weekStart, region]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Shiftglide</h1>
        <span className="subtitle">Compliance-check voor week-planningen — KB 10/08/2005 + PC 140.01</span>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <Dropzone fileName={file?.name ?? null} busy={busy} onFile={handleFile} onDrop={onDrop} />

      <section className="panel">
        <h2>Parameters</h2>
        <div className="controls">
          <div className="control">
            <label htmlFor="weekStart">Week start (maandag)</label>
            <input
              id="weekStart"
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </div>
          <div className="control">
            <label htmlFor="region">Regio</label>
            <select
              id="region"
              value={region}
              onChange={(e) => setRegion(e.target.value as Region)}
            >
              <option value="flanders">Vlaanderen</option>
              <option value="wallonia">Wallonië</option>
              <option value="brussels">Brussel</option>
            </select>
          </div>
        </div>
      </section>

      {result && <ResultsPanel adapter={result.adapter} violations={result.violations} />}
    </div>
  );
}

function Dropzone(props: {
  fileName: string | null;
  busy: boolean;
  onFile: (f: File) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        setDragging(false);
        props.onDrop(e);
      }}
    >
      <strong>{props.fileName ? `Geladen: ${props.fileName}` : 'Sleep je .xls hierheen'}</strong>
      <p>{props.busy ? 'Bezig met inlezen…' : 'Of klik om te bladeren — .xls / .xlsx'}</p>
      <input
        type="file"
        accept=".xls,.xlsx"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) props.onFile(f);
        }}
      />
    </label>
  );
}

function ResultsPanel(props: { adapter: AdapterResult; violations: Violation[] }) {
  const { adapter, violations } = props;
  const errors = violations.filter((v) => v.severity === 'error').length;
  const warnings = violations.filter((v) => v.severity === 'warning').length;

  return (
    <>
      <section className="panel">
        <h2>Statistieken</h2>
        <div className="stats-grid">
          <Stat label="Shifts" value={adapter.stats.shiftsCreated} />
          <Stat label="Afwezigheid" value={adapter.stats.absences} />
          <Stat label="Genegeerd" value={adapter.stats.ignored} />
          <Stat label="Onbekend" value={adapter.stats.unknown} />
          <Stat label="Totaal cellen" value={adapter.stats.totalEntries} />
        </div>
      </section>

      <section className="panel">
        <h2>
          Violations — <span className="badge error">{errors} error</span>{' '}
          <span className="badge warning">{warnings} warning</span>
        </h2>
        {violations.length === 0 ? (
          <div className="empty-state">
            <span className="badge ok">geen overtredingen</span>
            <p className="muted" style={{ marginTop: 12 }}>
              Geen violations gevonden voor deze week (op basis van geladen regels).
            </p>
          </div>
        ) : (
          <table className="violations-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Chauffeur</th>
                <th>Regel</th>
                <th>Bericht</th>
                <th>Suggestie</th>
              </tr>
            </thead>
            <tbody>
              {violations.map((v, i) => (
                <tr key={i}>
                  <td>
                    <span className={`badge ${v.severity}`}>{v.severity}</span>
                  </td>
                  <td>{v.driverId}</td>
                  <td className="muted">{v.ruleId}</td>
                  <td>{v.message}</td>
                  <td className="muted">{v.suggestedFix ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {adapter.unknownCodes.size > 0 && (
        <section className="panel">
          <h2>Onbekende codes (top 10)</h2>
          <table className="violations-table">
            <thead>
              <tr>
                <th>Aantal</th>
                <th>Code</th>
              </tr>
            </thead>
            <tbody>
              {[...adapter.unknownCodes.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([code, n]) => (
                  <tr key={code}>
                    <td>{n}</td>
                    <td>"{code}"</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function Stat(props: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="label">{props.label}</div>
      <div className="value">{props.value}</div>
    </div>
  );
}
