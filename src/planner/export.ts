import * as XLSX from 'xlsx';
import type { WorkBook } from 'xlsx';
import type { Assignment, UnassignedDienst } from './types.js';

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Format "DD-MMM-YY" om aan te sluiten op het bestaande praktijk-formaat.
 */
export function formatPraktijkDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const mon = MONTH_ABBR[date.getUTCMonth()] ?? '???';
  const yr = String(date.getUTCFullYear()).slice(2);
  return `${day}-${mon}-${yr}`;
}

export interface ExportInput {
  assignments: readonly Assignment[];
  unassigned: readonly UnassignedDienst[];
  drivers: readonly string[];
  weekStart: Date;
}

/**
 * Bouw een werkboek met twee sheets:
 *   - "praktijk": matrix dagen × chauffeurs, ingevuld met dienstcodes of "vrij",
 *     volgens hetzelfde patroon als het brondocument.
 *   - "niet-toegewezen": optioneel, lijst van diensten die niet konden worden bemand.
 */
export function exportToWorkbook(input: ExportInput): WorkBook {
  const days: Date[] = Array.from(
    { length: 7 },
    (_, i) => new Date(input.weekStart.getTime() + i * 86_400_000),
  );

  const cellByKey = new Map<string, string>();
  for (const a of input.assignments) {
    cellByKey.set(`${a.driverName}|${formatPraktijkDate(a.date)}`, a.dienstcode);
  }

  const header: (string | number)[] = ['datum', 'dagtype', ...input.drivers];
  const rows: (string | number)[][] = [header];

  for (const d of days) {
    const dateStr = formatPraktijkDate(d);
    const row: (string | number)[] = [dateStr, ''];
    for (const drv of input.drivers) {
      row.push(cellByKey.get(`${drv}|${dateStr}`) ?? 'vrij');
    }
    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'praktijk');

  if (input.unassigned.length > 0) {
    const unrows: (string | number)[][] = [
      ['Datum', 'Dienstcode', 'Reden', 'Detail'],
      ...input.unassigned.map((u) => [
        formatPraktijkDate(u.date),
        u.dienstcode,
        u.reason,
        u.detail,
      ]),
    ];
    const unws = XLSX.utils.aoa_to_sheet(unrows);
    XLSX.utils.book_append_sheet(wb, unws, 'niet-toegewezen');
  }

  return wb;
}

/**
 * Schrijf een werkboek naar een ArrayBuffer (xlsx binair).
 * Pure functie zonder DOM-afhankelijkheid — de browser-download zit in
 * `web/src/download.ts` zodat de library-code DOM-vrij blijft.
 */
export function serializeWorkbook(wb: WorkBook): ArrayBuffer {
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
