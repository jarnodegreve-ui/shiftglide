import type { LoondienstDef } from '../excel/loondiensten.js';
import type {
  Assignment,
  PlannerInput,
  PlannerOutput,
  UnassignedDienst,
} from './types.js';

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;

/**
 * Configuratie voor het greedy-algoritme. Standaardwaardes komen uit
 * KB 10/08/2005 / PC 140.01:
 *   - dagrust ≥10u tussen einde-laatste-shift en start-nieuwe-shift
 *   - max 50u werktijd per week
 */
export interface PlannerConfig {
  minDailyRestHours: number;
  maxWeeklyWorkingHours: number;
}

const DEFAULT_CONFIG: PlannerConfig = {
  minDailyRestHours: 10,
  maxWeeklyWorkingHours: 50,
};

interface DriverState {
  name: string;
  workMinutes: number;
  latestShiftEnd: Date | null;
  daysAssigned: Set<string>;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function firstLoopStart(date: Date, def: LoondienstDef): Date | null {
  const first = def.loops[0];
  if (!first) return null;
  return new Date(date.getTime() + first.startMinutes * MS_PER_MINUTE);
}

function lastLoopEnd(date: Date, def: LoondienstDef): Date | null {
  const last = def.loops[def.loops.length - 1];
  if (!last) return null;
  return new Date(date.getTime() + last.endMinutes * MS_PER_MINUTE);
}

/**
 * Greedy weekplanner.
 *
 * Werkwijze:
 *   1. Sorteer dagen chronologisch.
 *   2. Per dag: sorteer diensten op starttijd (vroege diensten eerst), dan op code.
 *   3. Per dienst: vind alle chauffeurs die:
 *        - die dag nog geen dienst hebben
 *        - voldoende dagrust hebben sinds hun vorige shift
 *        - de wekelijkse maximum-werktijd niet overschrijden
 *      Kies degene met de laagste werktijd-tot-nu-toe; bij gelijke stand alfabetisch.
 *   4. Onbemande diensten worden gerapporteerd in `unassignedDiensten`.
 *
 * Het algoritme is deterministisch: zelfde input → zelfde output.
 *
 * Bewust NIET (yet) gemodelleerd:
 *   - amplitude (komt automatisch goed als loops zelf compact zijn)
 *   - weekendrust ≥30u (we plannen één week, dus geen continuïteit nodig)
 *   - chauffeur-specifieke voorkeuren (contracturen, voorkeur-diensten)
 *   - eerlijke verdeling van weekenddiensten
 *   - de "verdeel eerst de moeilijkste diensten" heuristiek (Hungarian/CP-SAT-stijl)
 */
export function generatePlanning(
  input: PlannerInput,
  catalogue: ReadonlyMap<string, LoondienstDef>,
  config: PlannerConfig = DEFAULT_CONFIG,
): PlannerOutput {
  const assignments: Assignment[] = [];
  const unassigned: UnassignedDienst[] = [];
  const warnings: string[] = [];

  const driverStates = new Map<string, DriverState>();
  for (const name of input.drivers) {
    driverStates.set(name, {
      name,
      workMinutes: 0,
      latestShiftEnd: null,
      daysAssigned: new Set(),
    });
  }

  const maxWeeklyMinutes = config.maxWeeklyWorkingHours * 60;
  const minRestMs = config.minDailyRestHours * MS_PER_HOUR;

  const sortedDays = [...input.dayPlans].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  for (const dayPlan of sortedDays) {
    const resolved: Array<{ code: string; def: LoondienstDef }> = [];

    for (const code of dayPlan.requiredDiensten) {
      const def = catalogue.get(code.toLowerCase());
      if (!def) {
        unassigned.push({
          date: dayPlan.date,
          dienstcode: code,
          reason: 'onbekende-code',
          detail: `Dienstcode "${code}" niet gevonden in catalogus.`,
        });
        continue;
      }
      if (def.isAbsence || def.loops.length === 0) {
        unassigned.push({
          date: dayPlan.date,
          dienstcode: code,
          reason: 'geen-werkdienst',
          detail: `Code "${code}" is een afwezigheidscode of heeft geen werktijd.`,
        });
        continue;
      }
      resolved.push({ code, def });
    }

    resolved.sort((a, b) => {
      const aStart = a.def.loops[0]?.startMinutes ?? 0;
      const bStart = b.def.loops[0]?.startMinutes ?? 0;
      if (aStart !== bStart) return aStart - bStart;
      return a.code.localeCompare(b.code);
    });

    const dayKey = isoDay(dayPlan.date);

    for (const { code, def } of resolved) {
      const dienstStart = firstLoopStart(dayPlan.date, def);
      const dienstEnd = lastLoopEnd(dayPlan.date, def);
      if (!dienstStart || !dienstEnd) continue;

      const candidates: DriverState[] = [];
      for (const state of driverStates.values()) {
        if (state.daysAssigned.has(dayKey)) continue;
        if (state.latestShiftEnd) {
          const gap = dienstStart.getTime() - state.latestShiftEnd.getTime();
          if (gap < minRestMs) continue;
        }
        if (state.workMinutes + def.totalWorkingMinutes > maxWeeklyMinutes) continue;
        candidates.push(state);
      }

      if (candidates.length === 0) {
        unassigned.push({
          date: dayPlan.date,
          dienstcode: code,
          reason: 'geen-chauffeur-beschikbaar',
          detail: `Geen chauffeur respecteert rust + max werktijd op ${dayKey}.`,
        });
        continue;
      }

      candidates.sort((a, b) => {
        if (a.workMinutes !== b.workMinutes) return a.workMinutes - b.workMinutes;
        return a.name.localeCompare(b.name);
      });

      const chosen = candidates[0];
      if (!chosen) continue;

      assignments.push({ date: dayPlan.date, driverName: chosen.name, dienstcode: code });
      chosen.workMinutes += def.totalWorkingMinutes;
      chosen.latestShiftEnd = dienstEnd;
      chosen.daysAssigned.add(dayKey);
    }
  }

  const workloadMinutesPerDriver = new Map<string, number>();
  for (const state of driverStates.values()) {
    workloadMinutesPerDriver.set(state.name, state.workMinutes);
  }

  return { assignments, unassignedDiensten: unassigned, workloadMinutesPerDriver, warnings };
}
