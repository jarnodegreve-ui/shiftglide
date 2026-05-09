import type { WorkBook } from 'xlsx';
import type { Planning, Region, Shift, TransportType } from '../types/index.js';
import { type LoondienstDef, lookupLoondienst, parseLoondiensten } from './loondiensten.js';
import { type PraktijkEntry, parsePraktijk } from './praktijk.js';

export interface AdapterOptions {
  /** Begin van de week (UTC, inclusief) */
  weekStart: Date;
  /** Einde van de week (UTC, exclusief) — default: weekStart + 7 dagen */
  weekEnd?: Date;
  region: Region;
}

export interface AdapterResult {
  planning: Planning;
  warnings: string[];
  /** Codes die wel in praktijk staan maar niet in loondiensten — voor diagnose */
  unknownCodes: Map<string, number>;
  /** Codes die als afwezigheid werden geïnterpreteerd (vrij/F/ziek/...) */
  absenceCodes: Map<string, number>;
  /** Codes die genegeerd zijn omdat hun reeks niet als een rij-shift telt (BUR/GAR/OPL/...) */
  ignoredWorkCodes: Map<string, number>;
  /** Aantal entries per categorie */
  stats: {
    totalEntries: number;
    shiftsCreated: number;
    absences: number;
    ignored: number;
    unknown: number;
  };
}

/**
 * Classificeer een 4-cijferige dienstcode naar transport-type op basis van de reeks-prefix.
 * Voor de Maldegem-context:
 *   - 26xx, 27xx → 'regular' (geregeld vervoer, weekend)
 *   - alle andere 4-cijferige → 'special-regular' (school, vakantie, examen, zwembad)
 *   - letter-codes → null (niet als rij-shift gemodelleerd)
 */
export function classifyTransportType(code: string): TransportType | null {
  if (!/^\d{4}$/.test(code)) return null;
  if (/^2[67]\d{2}$/.test(code)) return 'regular';
  return 'special-regular';
}

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;

function inc(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function buildShiftsForEntry(
  entry: PraktijkEntry,
  def: LoondienstDef,
  transportType: TransportType,
): Shift[] {
  const dayStartMs = entry.date.getTime();
  const shifts: Shift[] = [];

  for (const loop of def.loops) {
    const start = new Date(dayStartMs + loop.startMinutes * MS_PER_MINUTE);
    const end = new Date(dayStartMs + loop.endMinutes * MS_PER_MINUTE);

    // Pauze toekennen aan de eerste loop. Vereenvoudiging — de echte verdeling
    // van pauze over loops is niet uit het Excel-model af te leiden.
    const breakMinutes = loop.index === 1 ? def.breakMinutes : 0;

    shifts.push({
      id: `${def.code}-${entry.date.toISOString().slice(0, 10)}-loop${loop.index}`,
      driverId: entry.driverName,
      start,
      end,
      breakMinutes,
      transportType,
    });
  }

  return shifts;
}

export function buildPlanning(workbook: WorkBook, options: AdapterOptions): AdapterResult {
  const weekEnd = options.weekEnd ?? new Date(options.weekStart.getTime() + 7 * MS_PER_DAY);

  const ldResult = parseLoondiensten(workbook);
  const pkResult = parsePraktijk(workbook, {
    weekStart: options.weekStart,
    weekEnd,
  });

  const warnings: string[] = [...ldResult.warnings, ...pkResult.warnings];
  const unknownCodes = new Map<string, number>();
  const absenceCodes = new Map<string, number>();
  const ignoredWorkCodes = new Map<string, number>();

  const shifts: Shift[] = [];

  for (const entry of pkResult.entries) {
    const def = lookupLoondienst(ldResult.defs, entry.rawCode);

    if (!def) {
      inc(unknownCodes, entry.rawCode);
      continue;
    }

    if (def.isAbsence) {
      inc(absenceCodes, entry.rawCode);
      continue;
    }

    const transportType = classifyTransportType(def.code);
    if (transportType === null) {
      // Letter-werk-codes (BUR, GAR, OPL, kv, verk, ...): genegeerd voor planning-check
      inc(ignoredWorkCodes, entry.rawCode);
      continue;
    }

    shifts.push(...buildShiftsForEntry(entry, def, transportType));
  }

  const planning: Planning = {
    weekStart: options.weekStart,
    region: options.region,
    shifts,
  };

  return {
    planning,
    warnings,
    unknownCodes,
    absenceCodes,
    ignoredWorkCodes,
    stats: {
      totalEntries: pkResult.entries.length,
      shiftsCreated: shifts.length,
      absences: [...absenceCodes.values()].reduce((a, b) => a + b, 0),
      ignored: [...ignoredWorkCodes.values()].reduce((a, b) => a + b, 0),
      unknown: [...unknownCodes.values()].reduce((a, b) => a + b, 0),
    },
  };
}
