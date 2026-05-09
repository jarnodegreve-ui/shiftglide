import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { WorkBook } from 'xlsx';
import {
  type LoondienstDef,
  lookupLoondienst,
  parseLoondiensten,
} from '../../src/excel/loondiensten.js';

// Header rij die we gebruiken (matches de echte file)
const HEADER = [
  'dienst',
  'loop 1',
  'begin',
  'einde',
  'loop 2',
  'begin',
  'einde',
  'loop 3',
  'begin',
  'einde',
  '',
  'duur loop 1',
  'duur loop 2',
  'duur loop 3',
  'totale duur',
  'begin',
  'einde',
  'amplitude',
  'pauze',
  '',
];

function buildWorkbook(rows: unknown[][]): WorkBook {
  const ws = XLSX.utils.aoa_to_sheet([HEADER, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'loondiensten');
  return wb;
}

function dienst(def: Partial<LoondienstDef> & { code: string }): LoondienstDef {
  return {
    code: def.code,
    loops: def.loops ?? [],
    totalWorkingMinutes: def.totalWorkingMinutes ?? 0,
    amplitudeMinutes: def.amplitudeMinutes ?? 0,
    breakMinutes: def.breakMinutes ?? 0,
    isAbsence: def.isAbsence ?? false,
  };
}

describe('parseLoondiensten', () => {
  it('parseert een enkele-loop dienst (zoals 2103)', () => {
    const wb = buildWorkbook([
      // 2103: loop1 5:08-13:54, totale duur 8:46, amplitude 8:46, pauze 0:15
      [
        '2103',
        '4501',
        '5:08',
        '13:54',
        '',
        '--',
        '--',
        '',
        '--',
        '--',
        '',
        '8:46',
        '--',
        '--',
        '8:46',
        '5:08',
        '13:54',
        '8:46',
        '0:15',
        '9:01',
      ],
    ]);

    const { defs, warnings, skippedRows } = parseLoondiensten(wb);
    expect(warnings).toEqual([]);
    expect(skippedRows).toBe(0);
    expect(defs.size).toBe(1);

    const d = lookupLoondienst(defs, '2103');
    expect(d).toBeDefined();
    expect(d?.code).toBe('2103');
    expect(d?.loops).toHaveLength(1);
    expect(d?.loops[0]).toMatchObject({
      index: 1,
      startMinutes: 5 * 60 + 8,
      endMinutes: 13 * 60 + 54,
      durationMinutes: 8 * 60 + 46,
    });
    expect(d?.totalWorkingMinutes).toBe(8 * 60 + 46);
    expect(d?.amplitudeMinutes).toBe(8 * 60 + 46);
    expect(d?.breakMinutes).toBe(15);
    expect(d?.isAbsence).toBe(false);
  });

  it('parseert een gesplitste dienst met twee loops (zoals 2104)', () => {
    const wb = buildWorkbook([
      [
        '2104',
        '4502',
        '6:01',
        '9:26',
        '4615',
        '16:06',
        '19:56',
        '',
        '--',
        '--',
        '',
        '3:25',
        '3:50',
        '--',
        '7:15',
        '6:01',
        '19:56',
        '13:55',
        '0:30',
        '7:45',
      ],
    ]);

    const { defs } = parseLoondiensten(wb);
    const d = lookupLoondienst(defs, '2104');
    expect(d?.loops).toHaveLength(2);
    expect(d?.loops[0]?.startMinutes).toBe(6 * 60 + 1);
    expect(d?.loops[1]?.startMinutes).toBe(16 * 60 + 6);
    expect(d?.amplitudeMinutes).toBe(13 * 60 + 55);
    expect(d?.breakMinutes).toBe(30);
    expect(d?.isAbsence).toBe(false);
  });

  it('herkent een afwezigheidscode als isAbsence', () => {
    const wb = buildWorkbook([
      [
        'vrij',
        '',
        '14:00',
        '14:00',
        '',
        '--',
        '--',
        '',
        '--',
        '--',
        '',
        '0:00',
        '--',
        '--',
        '0:00',
        '14:00',
        '14:00',
        '0:00',
        '',
        '',
      ],
    ]);

    const d = lookupLoondienst(parseLoondiensten(wb).defs, 'vrij');
    expect(d?.isAbsence).toBe(true);
    expect(d?.totalWorkingMinutes).toBe(0);
    expect(d?.loops).toHaveLength(0);
  });

  it('skipt sectie-titels die geen begin/einde hebben', () => {
    const wb = buildWorkbook([
      [
        'Ma-Di-Do-Vr schoolperiode vanaf 20/04/2026',
        'maandag-dinsdag-donderdag-vrijdag',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '7:58',
        '',
        '',
        '',
        '',
        '',
      ],
      [
        '2101',
        '4500',
        '4:36',
        '7:52',
        '4611',
        '13:39',
        '17:53',
        '',
        '--',
        '--',
        '',
        '3:16',
        '4:14',
        '--',
        '7:30',
        '4:36',
        '17:53',
        '13:17',
        '0:30',
        '8:00',
      ],
    ]);

    const { defs, skippedRows } = parseLoondiensten(wb);
    expect(skippedRows).toBe(1);
    expect(defs.size).toBe(1);
    expect(lookupLoondienst(defs, '2101')).toBeDefined();
    expect(lookupLoondienst(defs, 'Ma-Di-Do-Vr schoolperiode vanaf 20/04/2026')).toBeUndefined();
  });

  it('lookup is case-insensitive', () => {
    const wb = buildWorkbook([
      [
        'BUR',
        '',
        '8:00',
        '17:00',
        '',
        '--',
        '--',
        '',
        '--',
        '--',
        '',
        '9:00',
        '--',
        '--',
        '9:00',
        '8:00',
        '17:00',
        '9:00',
        '0:30',
        '',
      ],
    ]);

    const { defs } = parseLoondiensten(wb);
    expect(lookupLoondienst(defs, 'BUR')).toBeDefined();
    expect(lookupLoondienst(defs, 'bur')).toBeDefined();
    expect(lookupLoondienst(defs, 'Bur')).toBeDefined();
  });

  it('skipt rijen zonder code', () => {
    const wb = buildWorkbook([
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      [
        '2103',
        '4501',
        '5:08',
        '13:54',
        '',
        '--',
        '--',
        '',
        '--',
        '--',
        '',
        '8:46',
        '--',
        '--',
        '8:46',
        '5:08',
        '13:54',
        '8:46',
        '0:15',
        '9:01',
      ],
    ]);

    const { defs, skippedRows } = parseLoondiensten(wb);
    expect(skippedRows).toBe(1);
    expect(defs.size).toBe(1);
  });

  it('waarschuwt bij dubbele codes', () => {
    const wb = buildWorkbook([
      [
        '2103',
        '4501',
        '5:08',
        '13:54',
        '',
        '--',
        '--',
        '',
        '--',
        '--',
        '',
        '8:46',
        '--',
        '--',
        '8:46',
        '5:08',
        '13:54',
        '8:46',
        '0:15',
        '',
      ],
      [
        '2103',
        '4501',
        '6:00',
        '14:00',
        '',
        '--',
        '--',
        '',
        '--',
        '--',
        '',
        '8:00',
        '--',
        '--',
        '8:00',
        '6:00',
        '14:00',
        '8:00',
        '0:30',
        '',
      ],
    ]);

    const { warnings } = parseLoondiensten(wb);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Dubbele code/);
  });

  // Voorkom dat de placeholder-helper als ongebruikt wordt gemarkeerd.
  it('helper-fixture levert default LoondienstDef', () => {
    expect(dienst({ code: 'test' })).toMatchObject({ code: 'test', isAbsence: false });
  });
});
