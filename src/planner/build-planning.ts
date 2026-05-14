import { classifyTransportType } from '../excel/adapter.js';
import type { LoondienstDef } from '../excel/loondiensten.js';
import type { Planning, Region, Shift } from '../types/index.js';
import type { Assignment } from './types.js';

const MS_PER_MINUTE = 60_000;

/**
 * Converteer een lijst toewijzingen + de dienst-catalogus terug naar een Planning.
 * Hieruit kunnen we de regelmotor over het generator-resultaat laten lopen
 * om een gegenereerde planning op compliance te checken.
 */
export function buildPlanningFromAssignments(
  assignments: readonly Assignment[],
  catalogue: ReadonlyMap<string, LoondienstDef>,
  weekStart: Date,
  region: Region,
): Planning {
  const shifts: Shift[] = [];

  for (const a of assignments) {
    const def = catalogue.get(a.dienstcode.toLowerCase());
    if (!def || def.isAbsence || def.loops.length === 0) continue;

    const transportType = classifyTransportType(def.code) ?? 'special-regular';
    const dayStartMs = a.date.getTime();
    const dateKey = a.date.toISOString().slice(0, 10);

    for (const loop of def.loops) {
      shifts.push({
        id: `${a.dienstcode}-${dateKey}-${a.driverName}-loop${loop.index}`,
        driverId: a.driverName,
        start: new Date(dayStartMs + loop.startMinutes * MS_PER_MINUTE),
        end: new Date(dayStartMs + loop.endMinutes * MS_PER_MINUTE),
        breakMinutes: loop.index === 1 ? def.breakMinutes : 0,
        transportType,
      });
    }
  }

  return { weekStart, region, shifts };
}
