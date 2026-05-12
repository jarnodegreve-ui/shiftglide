import { describe, expect, it } from 'vitest';
import type { LoondienstDef } from '../../src/excel/loondiensten.js';
import { generatePlanning } from '../../src/planner/greedy.js';
import type { DayPlan, PlannerInput } from '../../src/planner/types.js';

function mkDef(
  code: string,
  opts: {
    loops?: { start: number; end: number }[];
    totalWorkingMinutes?: number;
    amplitudeMinutes?: number;
    breakMinutes?: number;
    isAbsence?: boolean;
  } = {},
): LoondienstDef {
  const loops = (opts.loops ?? []).map((l, i) => ({
    index: (i + 1) as 1 | 2 | 3,
    startMinutes: l.start,
    endMinutes: l.end,
    durationMinutes: l.end - l.start,
  }));
  const lastLoop = loops[loops.length - 1];
  const firstLoop = loops[0];
  return {
    code,
    loops,
    totalWorkingMinutes:
      opts.totalWorkingMinutes ?? loops.reduce((s, l) => s + l.durationMinutes, 0),
    amplitudeMinutes:
      opts.amplitudeMinutes ?? (firstLoop && lastLoop ? lastLoop.endMinutes - firstLoop.startMinutes : 0),
    breakMinutes: opts.breakMinutes ?? 0,
    isAbsence: opts.isAbsence ?? false,
  };
}

function buildCatalogue(defs: LoondienstDef[]): Map<string, LoondienstDef> {
  const m = new Map<string, LoondienstDef>();
  for (const d of defs) m.set(d.code.toLowerCase(), d);
  return m;
}

const MONDAY = new Date(Date.UTC(2026, 4, 4));
const TUESDAY = new Date(Date.UTC(2026, 4, 5));
const WEDNESDAY = new Date(Date.UTC(2026, 4, 6));

function dayPlan(date: Date, codes: string[]): DayPlan {
  return { date, dayType: 'maandag', requiredDiensten: codes };
}

function input(drivers: string[], dayPlans: DayPlan[]): PlannerInput {
  return { weekStart: MONDAY, region: 'flanders', drivers, dayPlans };
}

describe('generatePlanning — greedy', () => {
  it('wijst alle diensten toe bij voldoende chauffeurs', () => {
    // 06:00=360 min, 14:00=840 min → 480 min werktijd (8u)
    const cat = buildCatalogue([
      mkDef('2101', { loops: [{ start: 360, end: 840 }] }),
      mkDef('2102', { loops: [{ start: 420, end: 900 }] }),
    ]);
    const result = generatePlanning(input(['alice', 'bob'], [dayPlan(MONDAY, ['2101', '2102'])]), cat);
    expect(result.assignments).toHaveLength(2);
    expect(result.unassignedDiensten).toEqual([]);
    expect([...result.workloadMinutesPerDriver.values()]).toEqual([480, 480]);
  });

  it('verdeelt werktijd ongeveer gelijk over meerdere dagen', () => {
    const cat = buildCatalogue([
      mkDef('A', { loops: [{ start: 360, end: 840 }] }), // 480
      mkDef('B', { loops: [{ start: 420, end: 900 }] }), // 480
    ]);
    const result = generatePlanning(
      input(['alice', 'bob'], [
        dayPlan(MONDAY, ['A', 'B']),
        dayPlan(TUESDAY, ['A', 'B']),
      ]),
      cat,
    );
    expect(result.assignments).toHaveLength(4);
    const workloads = [...result.workloadMinutesPerDriver.values()];
    expect(workloads).toEqual([960, 960]);
  });

  it('respecteert dagrust ≥10u', () => {
    // late dienst eindigt 22:00 (1320 min), vroege start 05:00 (300 min) → 7u gap
    const cat = buildCatalogue([
      mkDef('LATE', { loops: [{ start: 840, end: 1320 }] }), // 14:00–22:00
      mkDef('EARLY', { loops: [{ start: 300, end: 780 }] }), // 05:00–13:00
    ]);
    const result = generatePlanning(
      input(['alice', 'bob'], [
        dayPlan(MONDAY, ['LATE']),
        dayPlan(TUESDAY, ['EARLY']),
      ]),
      cat,
    );
    expect(result.assignments).toHaveLength(2);
    // Alice (alfabetisch eerst) krijgt LATE op maandag → kan dinsdag-vroeg NIET
    expect(result.assignments[0]).toMatchObject({ driverName: 'alice', dienstcode: 'LATE' });
    expect(result.assignments[1]).toMatchObject({ driverName: 'bob', dienstcode: 'EARLY' });
  });

  it('vlagt unassigned als rust geblokkeerd is met enkele chauffeur', () => {
    const cat = buildCatalogue([
      mkDef('LATE', { loops: [{ start: 840, end: 1320 }] }),
      mkDef('EARLY', { loops: [{ start: 300, end: 780 }] }),
    ]);
    const result = generatePlanning(
      input(['alice'], [
        dayPlan(MONDAY, ['LATE']),
        dayPlan(TUESDAY, ['EARLY']),
      ]),
      cat,
    );
    expect(result.assignments).toHaveLength(1);
    expect(result.unassignedDiensten).toHaveLength(1);
    expect(result.unassignedDiensten[0]).toMatchObject({
      dienstcode: 'EARLY',
      reason: 'geen-chauffeur-beschikbaar',
    });
  });

  it('respecteert max 50u werktijd per week', () => {
    const cat = buildCatalogue([
      mkDef('LONG', { loops: [{ start: 360, end: 960 }] }), // 10u = 600 min
    ]);
    const days = [
      dayPlan(MONDAY, ['LONG']),
      dayPlan(TUESDAY, ['LONG']),
      dayPlan(WEDNESDAY, ['LONG']),
      dayPlan(new Date(Date.UTC(2026, 4, 7)), ['LONG']),
      dayPlan(new Date(Date.UTC(2026, 4, 8)), ['LONG']),
      dayPlan(new Date(Date.UTC(2026, 4, 9)), ['LONG']), // 6e dag → > 50u
    ];
    const result = generatePlanning(input(['alice'], days), cat);
    expect(result.assignments).toHaveLength(5);
    expect(result.unassignedDiensten).toHaveLength(1);
    expect(result.unassignedDiensten[0]?.dienstcode).toBe('LONG');
    expect(result.workloadMinutesPerDriver.get('alice')).toBe(3000); // 5 × 600
  });

  it('vlagt onbekende dienstcodes als unassigned', () => {
    const cat = buildCatalogue([mkDef('2101', { loops: [{ start: 360, end: 840 }] })]);
    const result = generatePlanning(
      input(['alice'], [dayPlan(MONDAY, ['2101', '9999'])]),
      cat,
    );
    expect(result.assignments).toHaveLength(1);
    expect(result.unassignedDiensten).toHaveLength(1);
    expect(result.unassignedDiensten[0]).toMatchObject({
      dienstcode: '9999',
      reason: 'onbekende-code',
    });
  });

  it('skipt afwezigheidscodes en werkdiensten zonder loops', () => {
    const cat = buildCatalogue([
      mkDef('vrij', { isAbsence: true }),
      mkDef('2101', { loops: [{ start: 360, end: 840 }] }),
    ]);
    const result = generatePlanning(
      input(['alice'], [dayPlan(MONDAY, ['vrij', '2101'])]),
      cat,
    );
    expect(result.assignments).toHaveLength(1);
    expect(result.unassignedDiensten).toHaveLength(1);
    expect(result.unassignedDiensten[0]?.reason).toBe('geen-werkdienst');
  });

  it('is deterministisch (zelfde input → zelfde output)', () => {
    const cat = buildCatalogue([
      mkDef('A', { loops: [{ start: 360, end: 840 }] }),
      mkDef('B', { loops: [{ start: 420, end: 900 }] }),
    ]);
    const inp = input(['alice', 'bob', 'carol'], [dayPlan(MONDAY, ['A', 'B'])]);
    const r1 = generatePlanning(inp, cat);
    const r2 = generatePlanning(inp, cat);
    expect(r1.assignments).toEqual(r2.assignments);
    expect([...r1.workloadMinutesPerDriver.entries()]).toEqual([
      ...r2.workloadMinutesPerDriver.entries(),
    ]);
  });

  it('balanceert eerlijk: chauffeur met minste werktijd krijgt voorrang', () => {
    // 3 chauffeurs, 5 identieke diensten op één dag — onmogelijk (1 per dag)
    // dus 3 toegewezen + 2 unassigned. Wel test op verdeling met 3 dagen × 1 dienst.
    const cat = buildCatalogue([
      mkDef('A', { loops: [{ start: 360, end: 840 }] }),
    ]);
    const result = generatePlanning(
      input(['alice', 'bob', 'carol'], [
        dayPlan(MONDAY, ['A']),
        dayPlan(TUESDAY, ['A']),
        dayPlan(WEDNESDAY, ['A']),
      ]),
      cat,
    );
    // Drie diensten, drie chauffeurs, eentje per dag → ieder krijgt 1 dag (480 min)
    expect(result.assignments).toHaveLength(3);
    const workloads = [...result.workloadMinutesPerDriver.values()].sort((a, b) => a - b);
    expect(workloads).toEqual([480, 480, 480]);
  });
});
