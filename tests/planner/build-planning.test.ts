import { describe, expect, it } from 'vitest';
import type { LoondienstDef } from '../../src/excel/loondiensten.js';
import { buildPlanningFromAssignments } from '../../src/planner/build-planning.js';
import type { Assignment } from '../../src/planner/types.js';

function mkDef(
  code: string,
  loops: { start: number; end: number }[],
  breakMin = 0,
): LoondienstDef {
  const ls = loops.map((l, i) => ({
    index: (i + 1) as 1 | 2 | 3,
    startMinutes: l.start,
    endMinutes: l.end,
    durationMinutes: l.end - l.start,
  }));
  const total = ls.reduce((s, l) => s + l.durationMinutes, 0);
  const firstLoop = ls[0];
  const lastLoop = ls[ls.length - 1];
  return {
    code,
    loops: ls,
    totalWorkingMinutes: total,
    amplitudeMinutes: firstLoop && lastLoop ? lastLoop.endMinutes - firstLoop.startMinutes : 0,
    breakMinutes: breakMin,
    isAbsence: false,
  };
}

const MONDAY = new Date(Date.UTC(2026, 4, 4));

describe('buildPlanningFromAssignments', () => {
  it('produceert één shift per loop met juiste tijdstempels', () => {
    const cat = new Map<string, LoondienstDef>();
    // 2104: 06:01-09:26 + 16:06-19:56, pauze 30 min
    cat.set('2104', mkDef('2104', [
      { start: 6 * 60 + 1, end: 9 * 60 + 26 },
      { start: 16 * 60 + 6, end: 19 * 60 + 56 },
    ], 30));

    const assignments: Assignment[] = [
      { date: MONDAY, driverName: 'alice', dienstcode: '2104' },
    ];

    const planning = buildPlanningFromAssignments(assignments, cat, MONDAY, 'flanders');
    expect(planning.shifts).toHaveLength(2);

    const first = planning.shifts[0];
    const second = planning.shifts[1];
    expect(first?.driverId).toBe('alice');
    expect(first?.start.toISOString()).toBe('2026-05-04T06:01:00.000Z');
    expect(first?.end.toISOString()).toBe('2026-05-04T09:26:00.000Z');
    expect(first?.breakMinutes).toBe(30); // pauze aan loop 1
    expect(second?.breakMinutes).toBe(0);
    expect(second?.start.toISOString()).toBe('2026-05-04T16:06:00.000Z');
  });

  it('skipt afwezigheids- en lege diensten', () => {
    const cat = new Map<string, LoondienstDef>();
    cat.set('vrij', {
      code: 'vrij',
      loops: [],
      totalWorkingMinutes: 0,
      amplitudeMinutes: 0,
      breakMinutes: 0,
      isAbsence: true,
    });

    const planning = buildPlanningFromAssignments(
      [{ date: MONDAY, driverName: 'alice', dienstcode: 'vrij' }],
      cat,
      MONDAY,
      'flanders',
    );
    expect(planning.shifts).toEqual([]);
  });

  it('classificeert 26xx/27xx als regular en de rest als special-regular', () => {
    const cat = new Map<string, LoondienstDef>();
    cat.set('2701', mkDef('2701', [{ start: 360, end: 720 }]));
    cat.set('2104', mkDef('2104', [{ start: 360, end: 720 }]));

    const planning = buildPlanningFromAssignments(
      [
        { date: MONDAY, driverName: 'alice', dienstcode: '2701' },
        { date: MONDAY, driverName: 'bob', dienstcode: '2104' },
      ],
      cat,
      MONDAY,
      'flanders',
    );
    expect(planning.shifts[0]?.transportType).toBe('regular');
    expect(planning.shifts[1]?.transportType).toBe('special-regular');
  });
});
