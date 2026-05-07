import { describe, expect, it } from 'vitest';
import type { Planning, Region, Shift, TransportType } from '../src/types/index.js';
import {
  RULE_AMPLITUDE,
  RULE_MAX_DAILY_WORKING_TIME,
  RULE_MAX_WEEKLY_WORKING_TIME,
  checkAmplitude,
  checkMaxDailyWorkingTime,
  checkMaxWeeklyWorkingTime,
} from '../src/rules/kb-2005-08-10.js';

const DRIVER_ID = 'driver-1';
const WEEK_START = new Date(Date.UTC(2026, 4, 4));

function shift(opts: {
  id: string;
  startIso: string;
  durationHours: number;
  breakMinutes?: number;
  transportType?: TransportType;
}): Shift {
  const start = new Date(opts.startIso);
  const end = new Date(start.getTime() + opts.durationHours * 3_600_000);
  return {
    id: opts.id,
    driverId: DRIVER_ID,
    start,
    end,
    breakMinutes: opts.breakMinutes ?? 0,
    transportType: opts.transportType ?? 'occasional',
  };
}

function planningWith(shifts: Shift[], region: Region = 'flanders'): Planning {
  return { weekStart: WEEK_START, region, shifts };
}

describe('KB 10/08/2005 — checkAmplitude', () => {
  it('staat 14u amplitude toe (drempelwaarde)', () => {
    const s = shift({ id: 'a', startIso: '2026-05-04T06:00:00Z', durationHours: 14 });
    expect(checkAmplitude(planningWith([s]))).toEqual([]);
  });

  it('vlagt amplitude >14u', () => {
    const s = shift({ id: 'a', startIso: '2026-05-04T06:00:00Z', durationHours: 14.5 });
    const result = checkAmplitude(planningWith([s]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ruleId: RULE_AMPLITUDE,
      driverId: DRIVER_ID,
      severity: 'error',
      shiftId: 'a',
    });
  });

  it('berekent amplitude over meerdere shifts op dezelfde dag', () => {
    const morning = shift({ id: 'm', startIso: '2026-05-04T06:00:00Z', durationHours: 4 });
    const evening = shift({ id: 'e', startIso: '2026-05-04T16:00:00Z', durationHours: 4 });
    expect(checkAmplitude(planningWith([morning, evening]))).toEqual([]);

    const lateEvening = shift({ id: 'e2', startIso: '2026-05-04T17:00:00Z', durationHours: 4 });
    const result = checkAmplitude(planningWith([morning, lateEvening]));
    expect(result).toHaveLength(1);
    expect(result[0]?.shiftId).toBe('m');
  });
});

describe('KB 10/08/2005 — checkMaxDailyWorkingTime', () => {
  it('staat 10u werktijd toe voor ongeregeld vervoer', () => {
    const s = shift({ id: 'a', startIso: '2026-05-04T06:00:00Z', durationHours: 10 });
    expect(checkMaxDailyWorkingTime(planningWith([s]))).toEqual([]);
  });

  it('vlagt 11u werktijd voor ongeregeld vervoer', () => {
    const s = shift({ id: 'a', startIso: '2026-05-04T06:00:00Z', durationHours: 11 });
    const result = checkMaxDailyWorkingTime(planningWith([s]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ruleId: RULE_MAX_DAILY_WORKING_TIME,
      driverId: DRIVER_ID,
      severity: 'error',
      shiftId: 'a',
    });
  });

  it('staat 11u werktijd toe voor Vlaams geregeld vervoer (limit 12u)', () => {
    const s = shift({
      id: 'a',
      startIso: '2026-05-04T06:00:00Z',
      durationHours: 11,
      transportType: 'regular',
    });
    expect(checkMaxDailyWorkingTime(planningWith([s], 'flanders'))).toEqual([]);
  });

  it('vlagt 13u werktijd ook voor Vlaams geregeld vervoer', () => {
    const s = shift({
      id: 'a',
      startIso: '2026-05-04T06:00:00Z',
      durationHours: 13,
      transportType: 'regular',
    });
    const result = checkMaxDailyWorkingTime(planningWith([s], 'flanders'));
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toMatch(/12u\/dag/);
  });

  it('past strengste limit toe bij gemengde types op één dag', () => {
    const morning = shift({
      id: 'm',
      startIso: '2026-05-04T06:00:00Z',
      durationHours: 6,
      transportType: 'regular',
    });
    const evening = shift({
      id: 'e',
      startIso: '2026-05-04T15:00:00Z',
      durationHours: 5,
      transportType: 'occasional',
    });
    const result = checkMaxDailyWorkingTime(planningWith([morning, evening], 'flanders'));
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toMatch(/10u\/dag/);
  });
});

describe('KB 10/08/2005 — checkMaxWeeklyWorkingTime', () => {
  it('staat exact 50u werktijd per week toe', () => {
    const shifts = Array.from({ length: 5 }, (_, i) =>
      shift({
        id: `s-${i}`,
        startIso: `2026-05-0${4 + i}T06:00:00Z`,
        durationHours: 10,
      }),
    );
    expect(checkMaxWeeklyWorkingTime(planningWith(shifts))).toEqual([]);
  });

  it('vlagt meer dan 50u werktijd per week', () => {
    const shifts = Array.from({ length: 6 }, (_, i) =>
      shift({
        id: `s-${i}`,
        startIso: `2026-05-0${4 + i}T06:00:00Z`,
        durationHours: 9,
      }),
    );
    const result = checkMaxWeeklyWorkingTime(planningWith(shifts));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ruleId: RULE_MAX_WEEKLY_WORKING_TIME,
      driverId: DRIVER_ID,
      severity: 'error',
    });
  });
});
