import React, { useEffect, useMemo, useState } from 'react';
import type { WorkBook } from 'xlsx';
import { parseLoondiensten } from '../../src/excel/loondiensten.js';
import { generatePlanning } from '../../src/planner/greedy.js';
import { DEFAULT_TEMPLATES, inferDayType } from '../../src/planner/templates.js';
import {
  ALL_DAY_TYPES,
  type DayPlan,
  type DayType,
  type PlannerInput,
  type PlannerOutput,
} from '../../src/planner/types.js';
import type { Region } from '../../src/types/index.js';

interface DayInput {
  date: Date;
  dayType: DayType;
  /** Multi-line textarea content: dienstcodes (1 per regel) */
  dienstcodes: string;
}

const DAY_LABELS_CAP: Record<DayType, string> = {
  maandag: 'Maandag',
  dinsdag: 'Dinsdag',
  woensdag: 'Woensdag',
  donderdag: 'Donderdag',
  vrijdag: 'Vrijdag',
  zaterdag: 'Zaterdag',
  zondag: 'Zondag',
};

function templateToText(codes: readonly string[]): string {
  return codes.join('\n');
}

function buildInitialDays(weekStart: Date): DayInput[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart.getTime() + i * 86_400_000);
    const dayType = inferDayType(date);
    return {
      date,
      dayType,
      dienstcodes: templateToText(DEFAULT_TEMPLATES[dayType]),
    };
  });
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}u${String(m).padStart(2, '0')}`;
}

export function GenerateView(props: {
  workbook: WorkBook | null;
  weekStart: Date;
  region: Region;
}): React.ReactElement {
  const { workbook, weekStart, region } = props;

  const [drivers, setDrivers] = useState<string>('');
  const [days, setDays] = useState<DayInput[]>(() => buildInitialDays(weekStart));
  const [result, setResult] = useState<PlannerOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset days wanneer weekStart wijzigt
  useEffect(() => {
    setDays(buildInitialDays(weekStart));
    setResult(null);
  }, [weekStart]);

  const catalogue = useMemo(() => {
    if (!workbook) return null;
    return parseLoondiensten(workbook).defs;
  }, [workbook]);

  function updateDayType(i: number, newType: DayType) {
    setDays((prev) =>
      prev.map((d, idx) =>
        idx === i ? { ...d, dayType: newType, dienstcodes: templateToText(DEFAULT_TEMPLATES[newType]) } : d,
      ),
    );
  }

  function updateDienstcodes(i: number, text: string) {
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, dienstcodes: text } : d)));
  }

  function onGenerate() {
    setError(null);
    if (!catalogue) {
      setError('Geen catalogus geladen — upload eerst je .xls bovenaan.');
      return;
    }
    const driverList = drivers
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (driverList.length === 0) {
      setError('Geef minstens één chauffeur op.');
      return;
    }

    const dayPlans: DayPlan[] = days.map((d) => ({
      date: d.date,
      dayType: d.dayType,
      requiredDiensten: d.dienstcodes
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    }));

    const input: PlannerInput = { weekStart, region, drivers: driverList, dayPlans };
    setResult(generatePlanning(input, catalogue));
  }

  if (!workbook) {
    return (
      <section className="panel">
        <h2>Genereer planning</h2>
        <div className="empty-state">
          <p>Upload eerst een <code>.xls</code>-bestand bovenaan zodat ik je dienstcatalogus kan lezen.</p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="panel">
        <h2>Chauffeurs</h2>
        <textarea
          className="textarea-drivers"
          placeholder="Eén chauffeur per regel, bv:&#10;De Roo Dieter&#10;Mendez Jesus&#10;..."
          value={drivers}
          onChange={(e) => setDrivers(e.target.value)}
          rows={8}
        />
        <p className="muted small">
          {drivers.split('\n').filter((s) => s.trim()).length} chauffeur(s)
        </p>
      </section>

      <section className="panel">
        <h2>Dagen + dienstcodes</h2>
        <div className="day-grid">
          {days.map((d, i) => (
            <div className="day-card" key={d.date.toISOString()}>
              <div className="day-card-header">
                <strong>
                  {DAY_LABELS_CAP[d.dayType]}
                  <span className="muted small">
                    {' '}
                    {String(d.date.getUTCDate()).padStart(2, '0')}/
                    {String(d.date.getUTCMonth() + 1).padStart(2, '0')}
                  </span>
                </strong>
                <select
                  value={d.dayType}
                  onChange={(e) => updateDayType(i, e.target.value as DayType)}
                >
                  {ALL_DAY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {DAY_LABELS_CAP[t]}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={d.dienstcodes}
                onChange={(e) => updateDienstcodes(i, e.target.value)}
                rows={Math.max(6, d.dienstcodes.split('\n').length + 1)}
                spellCheck={false}
              />
              <p className="muted small">
                {d.dienstcodes.split('\n').filter((s) => s.trim()).length} diensten
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="generate-bar">
          <button onClick={onGenerate}>Genereer planning</button>
          {error && <span className="error-inline">{error}</span>}
        </div>
      </section>

      {result && <ResultPanel result={result} />}
    </>
  );
}

function ResultPanel(props: { result: PlannerOutput }): React.ReactElement {
  const { result } = props;

  // assignments by (driver, dateISO) → dienstcode
  const cellMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of result.assignments) {
      m.set(`${a.driverName}|${a.date.toISOString().slice(0, 10)}`, a.dienstcode);
    }
    return m;
  }, [result.assignments]);

  // Unique drivers in assignments, plus zero-workload drivers from map
  const drivers = useMemo(() => {
    const set = new Set<string>(result.workloadMinutesPerDriver.keys());
    return [...set].sort();
  }, [result.workloadMinutesPerDriver]);

  const days = useMemo(() => {
    const set = new Set<string>();
    for (const a of result.assignments) set.add(a.date.toISOString().slice(0, 10));
    for (const u of result.unassignedDiensten) set.add(u.date.toISOString().slice(0, 10));
    return [...set].sort();
  }, [result.assignments, result.unassignedDiensten]);

  return (
    <>
      <section className="panel">
        <h2>Werkbalans per chauffeur</h2>
        <table className="violations-table">
          <thead>
            <tr>
              <th>Chauffeur</th>
              <th>Werktijd</th>
              <th># diensten</th>
            </tr>
          </thead>
          <tbody>
            {drivers
              .map((d) => ({
                name: d,
                minutes: result.workloadMinutesPerDriver.get(d) ?? 0,
                shifts: result.assignments.filter((a) => a.driverName === d).length,
              }))
              .sort((a, b) => b.minutes - a.minutes)
              .map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{formatMinutes(row.minutes)}</td>
                  <td>{row.shifts}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Toewijzingen — week-rooster</h2>
        <div className="grid-wrapper">
          <table className="week-grid">
            <thead>
              <tr>
                <th className="grid-driver-col">Chauffeur</th>
                {days.map((d) => (
                  <th key={d} className="grid-day-col">
                    {d.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => (
                <tr key={driver}>
                  <td className="grid-driver-col">{driver}</td>
                  {days.map((d) => {
                    const code = cellMap.get(`${driver}|${d}`);
                    return (
                      <td
                        key={d}
                        className={`grid-cell ${code ? 'kind-shift' : 'kind-empty'}`}
                      >
                        {code ?? ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {result.unassignedDiensten.length > 0 && (
        <section className="panel">
          <h2>Niet-toegewezen diensten ({result.unassignedDiensten.length})</h2>
          <table className="violations-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Dienstcode</th>
                <th>Reden</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {result.unassignedDiensten.map((u, i) => (
                <tr key={i}>
                  <td>{u.date.toISOString().slice(0, 10)}</td>
                  <td>{u.dienstcode}</td>
                  <td className="muted">{u.reason}</td>
                  <td className="muted">{u.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
