import * as XLSX from 'xlsx';
import type { WorkBook } from 'xlsx';

/**
 * Parser voor de "praktijk" sheet uit het Maldegem-werkboek.
 *
 * Layout:
 *   R0       header — kolom A: "xyz", kolom B: "dagtype", kolom C+: chauffeur-namen
 *   R1+      data — kolom A: datum (bv. "08-Apr-26"), kolom B: dagtype, kolom C+: dienstcode
 *
 * Lege chauffeur-kolommen tussenin worden geskipt (visuele scheiders).
 */

export interface PraktijkEntry {
  date: Date;
  driverName: string;
  rawCode: string;
  rowIndex: number;
  colIndex: number;
}

export interface PraktijkParseResult {
  entries: PraktijkEntry[];
  driverNames: string[];
  warnings: string[];
}

export interface PraktijkParseOptions {
  /** inclusief — alleen rijen vanaf deze datum (UTC) opnemen */
  weekStart?: Date;
  /** exclusief — alleen rijen vóór deze datum opnemen (typisch weekStart + 7 dagen) */
  weekEnd?: Date;
}

const MONTH_ABBR: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

export function parseExcelDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(EXCEL_EPOCH_MS + value * 86_400_000);
  }

  if (typeof value === 'string') {
    const str = value.trim();
    // Format "08-Apr-26"
    const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(str);
    if (m && m[1] && m[2] && m[3]) {
      const day = Number(m[1]);
      const month = MONTH_ABBR[m[2].toLowerCase()];
      let year = Number(m[3]);
      if (!Number.isFinite(day) || month === undefined || !Number.isFinite(year)) return null;
      if (year < 100) year += 2000;
      return new Date(Date.UTC(year, month, day));
    }
    // ISO-achtig formaat
    const iso = new Date(str);
    if (!Number.isNaN(iso.getTime())) return iso;
  }

  return null;
}

function isInRange(date: Date, start: Date | undefined, end: Date | undefined): boolean {
  if (start && date.getTime() < start.getTime()) return false;
  if (end && date.getTime() >= end.getTime()) return false;
  return true;
}

export function parsePraktijk(
  workbook: WorkBook,
  options: PraktijkParseOptions = {},
  sheetName = 'praktijk',
): PraktijkParseResult {
  const ws = workbook.Sheets[sheetName];
  if (!ws) {
    return { entries: [], driverNames: [], warnings: [`Sheet "${sheetName}" niet gevonden`] };
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    raw: false,
  });

  const warnings: string[] = [];

  if (rows.length === 0) {
    return { entries: [], driverNames: [], warnings: ['Sheet "praktijk" is leeg'] };
  }

  const headerRow = rows[0] ?? [];

  // Chauffeur-kolommen beginnen vanaf index 2. Tussen blokken kunnen 1 lege
  // kolom als visuele scheider zitten. Vanaf 2+ opeenvolgende lege headers
  // begint de statistiek-sectie (COUNTIF/SUM-formules) — daar stoppen.
  const driverCols: { col: number; name: string }[] = [];
  let consecutiveEmpty = 0;
  for (let c = 2; c < headerRow.length; c++) {
    const name = String(headerRow[c] ?? '').trim();
    if (!name) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) break;
      continue;
    }
    consecutiveEmpty = 0;
    driverCols.push({ col: c, name });
  }
  const driverNames = driverCols.map((d) => d.name);

  const entries: PraktijkEntry[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const date = parseExcelDate(row[0]);
    if (!date) continue;

    if (!isInRange(date, options.weekStart, options.weekEnd)) continue;

    for (const { col, name } of driverCols) {
      const raw = String(row[col] ?? '').trim();
      if (!raw) continue;
      entries.push({
        date,
        driverName: name,
        rawCode: raw,
        rowIndex: r,
        colIndex: col,
      });
    }
  }

  return { entries, driverNames, warnings };
}
