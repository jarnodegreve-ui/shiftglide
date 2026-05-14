import React, { useMemo } from 'react';
import {
  type AdapterResult,
  type EnrichedEntry,
  buildPlanning,
} from '../../../src/excel/adapter.js';
import { runKbChecks } from '../../../src/rules/kb-2005-08-10.js';
import type { Region, Violation } from '../../../src/types/index.js';
import { useAppStore } from '../store.js';
import type { WorkBook } from 'xlsx';

const DAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function CheckView(): React.ReactElement {
  const workbook = useAppStore((s) => s.workbook);
  const weekStartIso = useAppStore((s) => s.lastWeekStart);
  const region = useAppStore((s) => s.region);

  const result = useMemo<{ adapter: AdapterResult; violations: Violation[] } | null>(() => {
    if (!workbook) return null;
    const adapter = buildPlanning(workbook, {
      weekStart: new Date(`${weekStartIso}T00:00:00Z`),
      region,
    });
    const violations = runKbChecks(adapter.planning);
    return { adapter, violations };
  }, [workbook, weekStartIso, region]);

  if (!workbook) {
    return (
      <section className="panel">
        <div className="empty-state">
          <p>Upload je <code>.xls</code>-bestand om de compliance-check te starten.</p>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="panel">
        <div className="empty-state">
          <p>Laden…</p>
        </div>
      </section>
    );
  }

  return <ResultsPanel adapter={result.adapter} violations={result.violations} />;
}

function ResultsPanel(props: {
  adapter: AdapterResult;
  violations: Violation[];
}): React.ReactElement {
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

      <WeekGrid adapter={adapter} violations={violations} />

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

function Stat(props: { label: string; value: number }): React.ReactElement {
  return (
    <div className="stat">
      <div className="label">{props.label}</div>
      <div className="value">{props.value}</div>
    </div>
  );
}

function WeekGrid(props: {
  adapter: AdapterResult;
  violations: Violation[];
}): React.ReactElement {
  const { adapter, violations } = props;
  const weekStart = adapter.planning.weekStart;

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86_400_000)),
    [weekStart],
  );

  const cellMap = useMemo(() => {
    const m = new Map<string, EnrichedEntry>();
    for (const e of adapter.entries) {
      m.set(`${e.driverName}|${isoDay(e.date)}`, e);
    }
    return m;
  }, [adapter.entries]);

  const { violationsByCell, weeklyViolationsByDriver } = useMemo(() => {
    const byCell = new Map<string, Violation[]>();
    const byDriver = new Map<string, Violation[]>();
    for (const v of violations) {
      const m = v.shiftId?.match(/(\d{4}-\d{2}-\d{2})/);
      if (m && m[1]) {
        const key = `${v.driverId}|${m[1]}`;
        const list = byCell.get(key) ?? [];
        list.push(v);
        byCell.set(key, list);
      } else {
        const list = byDriver.get(v.driverId) ?? [];
        list.push(v);
        byDriver.set(v.driverId, list);
      }
    }
    return { violationsByCell: byCell, weeklyViolationsByDriver: byDriver };
  }, [violations]);

  const activeDrivers = useMemo(() => {
    const seen = new Set<string>();
    for (const e of adapter.entries) seen.add(e.driverName);
    return adapter.drivers.filter((d) => seen.has(d));
  }, [adapter.drivers, adapter.entries]);

  return (
    <section className="panel">
      <h2>Week-rooster</h2>
      <div className="grid-legend">
        <span><span className="grid-swatch kind-shift" /> shift</span>
        <span><span className="grid-swatch kind-absence" /> afwezig</span>
        <span><span className="grid-swatch kind-ignored" /> genegeerd</span>
        <span><span className="grid-swatch kind-unknown" /> onbekend</span>
        <span><span className="grid-swatch has-error" /> violation</span>
      </div>
      <div className="grid-wrapper">
        <table className="week-grid">
          <thead>
            <tr>
              <th className="grid-driver-col">Chauffeur</th>
              {days.map((d, i) => (
                <th key={d.toISOString()} className="grid-day-col">
                  <div className="day-label">{DAY_LABELS[i]}</div>
                  <div className="muted day-date">
                    {String(d.getUTCDate()).padStart(2, '0')}/
                    {String(d.getUTCMonth() + 1).padStart(2, '0')}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeDrivers.map((driver) => {
              const weekly = weeklyViolationsByDriver.get(driver) ?? [];
              return (
                <tr key={driver}>
                  <td className="grid-driver-col">
                    {driver}
                    {weekly.length > 0 && (
                      <span
                        className="badge error grid-week-badge"
                        title={weekly.map((v) => v.message).join('\n')}
                      >
                        week
                      </span>
                    )}
                  </td>
                  {days.map((d) => {
                    const key = `${driver}|${isoDay(d)}`;
                    const cell = cellMap.get(key);
                    const cellViolations = violationsByCell.get(key) ?? [];
                    const hasError = cellViolations.some((v) => v.severity === 'error');
                    const hasWarning = cellViolations.some((v) => v.severity === 'warning');
                    const cls = [
                      'grid-cell',
                      `kind-${cell?.kind ?? 'empty'}`,
                      hasError ? 'has-error' : '',
                      hasWarning && !hasError ? 'has-warning' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    const title = cellViolations.map((v) => v.message).join('\n');
                    return (
                      <td key={key} className={cls} title={title || undefined}>
                        {cell?.rawCode ?? ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
