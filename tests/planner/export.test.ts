import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { exportToWorkbook, formatPraktijkDate } from '../../src/planner/export.js';
import type { Assignment, UnassignedDienst } from '../../src/planner/types.js';

const MONDAY = new Date(Date.UTC(2026, 4, 4));
const TUESDAY = new Date(Date.UTC(2026, 4, 5));

describe('exportToWorkbook', () => {
  it('formatteert datums als DD-MMM-YY', () => {
    expect(formatPraktijkDate(MONDAY)).toBe('04-May-26');
    expect(formatPraktijkDate(new Date(Date.UTC(2026, 11, 31)))).toBe('31-Dec-26');
  });

  it('bouwt een praktijk-sheet met header + 7 dagrijen', () => {
    const assignments: Assignment[] = [
      { date: MONDAY, driverName: 'alice', dienstcode: '2101' },
      { date: TUESDAY, driverName: 'bob', dienstcode: '2102' },
    ];
    const wb = exportToWorkbook({
      assignments,
      unassigned: [],
      drivers: ['alice', 'bob'],
      weekStart: MONDAY,
    });

    expect(wb.SheetNames).toContain('praktijk');
    const ws = wb.Sheets['praktijk'];
    expect(ws).toBeDefined();
    if (!ws) return;

    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
      header: 1,
      defval: '',
      raw: false,
    });

    expect(rows[0]).toEqual(['datum', 'dagtype', 'alice', 'bob']);
    expect(rows.length).toBe(8); // 1 header + 7 days

    // Maandag: alice heeft 2101, bob heeft vrij
    expect(rows[1]?.[0]).toBe('04-May-26');
    expect(rows[1]?.[2]).toBe('2101');
    expect(rows[1]?.[3]).toBe('vrij');

    // Dinsdag: alice vrij, bob 2102
    expect(rows[2]?.[2]).toBe('vrij');
    expect(rows[2]?.[3]).toBe('2102');
  });

  it('voegt een "niet-toegewezen" sheet toe als er unassigned diensten zijn', () => {
    const unassigned: UnassignedDienst[] = [
      {
        date: MONDAY,
        dienstcode: '2105',
        reason: 'geen-chauffeur-beschikbaar',
        detail: 'Geen chauffeur respecteert rust.',
      },
    ];
    const wb = exportToWorkbook({
      assignments: [],
      unassigned,
      drivers: ['alice'],
      weekStart: MONDAY,
    });

    expect(wb.SheetNames).toContain('niet-toegewezen');
    const ws = wb.Sheets['niet-toegewezen'];
    expect(ws).toBeDefined();
    if (!ws) return;

    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
      header: 1,
      defval: '',
      raw: false,
    });

    expect(rows[0]).toEqual(['Datum', 'Dienstcode', 'Reden', 'Detail']);
    expect(rows[1]).toEqual([
      '04-May-26',
      '2105',
      'geen-chauffeur-beschikbaar',
      'Geen chauffeur respecteert rust.',
    ]);
  });

  it('voegt geen "niet-toegewezen" sheet toe als unassigned leeg is', () => {
    const wb = exportToWorkbook({
      assignments: [],
      unassigned: [],
      drivers: ['alice'],
      weekStart: MONDAY,
    });
    expect(wb.SheetNames).toEqual(['praktijk']);
  });
});
