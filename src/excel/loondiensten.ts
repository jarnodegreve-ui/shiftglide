import * as XLSX from 'xlsx';
import type { WorkBook } from 'xlsx';

/**
 * Parser voor de "loondiensten" sheet uit het Maldegem-werkboek.
 *
 * Layout (kolom-index → betekenis):
 *   0 (A)  dienstcode (4-cijferig of letter, bv "2104" of "vrij")
 *   1 (B)  loop1 ritordercode
 *   2 (C)  loop1 begintijd (HH:MM)
 *   3 (D)  loop1 eindtijd
 *   4 (E)  loop2 ritordercode
 *   5 (F)  loop2 begintijd
 *   6 (G)  loop2 eindtijd
 *   7 (H)  loop3 ritordercode
 *   8 (I)  loop3 begintijd
 *   9 (J)  loop3 eindtijd
 *  10 (K)  scheider, leeg
 *  11 (L)  duur loop1 (HH:MM)
 *  12 (M)  duur loop2
 *  13 (N)  duur loop3
 *  14 (O)  totale werktijd (HH:MM)
 *  15 (P)  algemene begintijd
 *  16 (Q)  algemene eindtijd
 *  17 (R)  amplitude (HH:MM)
 *  18 (S)  pauze (HH:MM)
 *  19 (T)  ?
 */

export interface Loop {
  index: 1 | 2 | 3;
  /** minuten sinds middernacht */
  startMinutes: number;
  /** minuten sinds middernacht */
  endMinutes: number;
  /** end - start */
  durationMinutes: number;
}

export interface LoondienstDef {
  code: string;
  loops: Loop[];
  totalWorkingMinutes: number;
  amplitudeMinutes: number;
  breakMinutes: number;
  /** true als duur 0 is (vrij/ziek/va/...) */
  isAbsence: boolean;
}

export interface ParseResult {
  /** lookup is case-insensitive: keys zijn lowercase */
  defs: Map<string, LoondienstDef>;
  warnings: string[];
  skippedRows: number;
}

const DASH_MARKERS = new Set(['', '--', '-']);
const TIME_REGEX = /^(\d{1,2}):(\d{2})$/;

function parseTime(value: unknown): number | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (DASH_MARKERS.has(str)) return null;
  const m = TIME_REGEX.exec(str);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (minutes >= 60) return null;
  return hours * 60 + minutes;
}

export function parseLoondiensten(workbook: WorkBook, sheetName = 'loondiensten'): ParseResult {
  const ws = workbook.Sheets[sheetName];
  if (!ws) {
    return {
      defs: new Map(),
      warnings: [`Sheet "${sheetName}" niet gevonden`],
      skippedRows: 0,
    };
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    raw: false,
  });

  const defs = new Map<string, LoondienstDef>();
  const warnings: string[] = [];
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const code = String(row[0] ?? '').trim();
    if (!code) {
      skipped++;
      continue;
    }

    const overallStart = parseTime(row[15]);
    const overallEnd = parseTime(row[16]);

    // Sectie-titel rijen ("Ma-Di-Do-Vr schoolperiode...", "Zaterdag", ...)
    // hebben geen begin/eind in P/Q.
    if (overallStart === null && overallEnd === null) {
      skipped++;
      continue;
    }

    const loops: Loop[] = [];
    for (let i = 0; i < 3; i++) {
      const startCol = 2 + i * 3;
      const endCol = 3 + i * 3;
      const start = parseTime(row[startCol]);
      const end = parseTime(row[endCol]);
      if (start !== null && end !== null && end > start) {
        loops.push({
          index: (i + 1) as 1 | 2 | 3,
          startMinutes: start,
          endMinutes: end,
          durationMinutes: end - start,
        });
      }
    }

    const totalWorking = parseTime(row[14]) ?? 0;
    const amplitude = parseTime(row[17]) ?? 0;
    const breakMin = parseTime(row[18]) ?? 0;

    const def: LoondienstDef = {
      code,
      loops,
      totalWorkingMinutes: totalWorking,
      amplitudeMinutes: amplitude,
      breakMinutes: breakMin,
      isAbsence: totalWorking === 0 && loops.length === 0,
    };

    const key = code.toLowerCase();
    if (defs.has(key)) {
      warnings.push(`Dubbele code "${code}" op rij ${r + 1} — overschrijft eerdere definitie`);
    }
    defs.set(key, def);
  }

  return { defs, warnings, skippedRows: skipped };
}

export function lookupLoondienst(
  defs: ReadonlyMap<string, LoondienstDef>,
  code: string,
): LoondienstDef | undefined {
  return defs.get(code.toLowerCase());
}
