import { describe, expect, it } from 'vitest';
import type { Planning, Shift } from '../src/types/index.js';
import {
  RULE_BIWEEKLY_DRIVING_TIME,
  RULE_DAILY_DRIVING_TIME,
  RULE_DAILY_REST,
  RULE_DRIVING_BREAK,
  RULE_WEEKLY_DRIVING_TIME,
  RULE_WEEKLY_REST,
  checkBiweeklyDrivingTime,
  checkDailyDrivingTime,
  checkDailyRest,
  checkDrivingBreak,
  checkWeeklyDrivingTime,
  checkWeeklyRest,
} from '../src/rules/eu-561.js';

const DRIVER_ID = 'driver-1';
const WEEK_START = new Date(Date.UTC(2026, 4, 4));

function shiftOnDay(dayOffset: number, hours: number): Shift {
  const start = new Date(Date.UTC(2026, 4, 4 + dayOffset, 6, 0, 0));
  const end = new Date(start.getTime() + hours * 3_600_000);
  return {
    id: `shift-${dayOffset}`,
    driverId: DRIVER_ID,
    start,
    end,
    breakMinutes: 0,
    transportType: 'occasional',
  };
}

function customShift(opts: {
  id: string;
  startIso: string;
  durationHours: number;
  breakMinutes?: number;
}): Shift {
  const start = new Date(opts.startIso);
  const end = new Date(start.getTime() + opts.durationHours * 3_600_000);
  return {
    id: opts.id,
    driverId: DRIVER_ID,
    start,
    end,
    breakMinutes: opts.breakMinutes ?? 0,
    transportType: 'occasional',
  };
}

function planningWith(shifts: Shift[]): Planning {
  return { weekStart: WEEK_START, region: 'flanders', shifts };
}

describe('EU-561 — checkDailyDrivingTime', () => {
  it('staat een gewone 8u rijdag toe', () => {
    expect(checkDailyDrivingTime(planningWith([shiftOnDay(0, 8)]))).toEqual([]);
  });

  it('staat een eerste verhoogde dag van 10u toe', () => {
    expect(checkDailyDrivingTime(planningWith([shiftOnDay(0, 10)]))).toEqual([]);
  });

  it('vlagt 11u rijden als overtreding van het absolute maximum', () => {
    const result = checkDailyDrivingTime(planningWith([shiftOnDay(0, 11)]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ruleId: RULE_DAILY_DRIVING_TIME,
      driverId: DRIVER_ID,
      severity: 'error',
      shiftId: 'shift-0',
    });
    expect(result[0]?.message).toMatch(/absoluut maximum/);
  });

  it('staat exact 9u rijtijd toe (drempelwaarde)', () => {
    expect(checkDailyDrivingTime(planningWith([shiftOnDay(0, 9)]))).toEqual([]);
  });

  it('vlagt enkel de derde verhoogde dag (3x 10u in één week)', () => {
    const result = checkDailyDrivingTime(
      planningWith([shiftOnDay(0, 10), shiftOnDay(1, 10), shiftOnDay(2, 10)]),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ruleId: RULE_DAILY_DRIVING_TIME,
      driverId: DRIVER_ID,
      severity: 'error',
      shiftId: 'shift-2',
    });
    expect(result[0]?.message).toMatch(/verhoogde dagen/);
  });
});

describe('EU-561 — checkWeeklyDrivingTime', () => {
  it('staat exact 56u rijtijd per week toe (drempelwaarde)', () => {
    const shifts = Array.from({ length: 7 }, (_, i) => shiftOnDay(i, 8));
    expect(checkWeeklyDrivingTime(planningWith(shifts))).toEqual([]);
  });

  it('vlagt meer dan 56u rijtijd per week', () => {
    const shifts = Array.from({ length: 7 }, (_, i) => shiftOnDay(i, 8.5));
    const result = checkWeeklyDrivingTime(planningWith(shifts));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ruleId: RULE_WEEKLY_DRIVING_TIME,
      driverId: DRIVER_ID,
      severity: 'error',
    });
  });
});

describe('EU-561 — checkBiweeklyDrivingTime', () => {
  it('checkt enkel huidige week zonder context', () => {
    const shifts = Array.from({ length: 7 }, (_, i) => shiftOnDay(i, 8));
    expect(checkBiweeklyDrivingTime(planningWith(shifts))).toEqual([]);
  });

  it('staat exact 90u over twee weken toe', () => {
    const shifts = Array.from({ length: 5 }, (_, i) => shiftOnDay(i, 8));
    expect(checkBiweeklyDrivingTime(planningWith(shifts), { [DRIVER_ID]: 50 })).toEqual([]);
  });

  it('vlagt overschrijding van 90u over twee opeenvolgende weken', () => {
    const shifts = Array.from({ length: 7 }, (_, i) => shiftOnDay(i, 7));
    const result = checkBiweeklyDrivingTime(planningWith(shifts), { [DRIVER_ID]: 50 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ruleId: RULE_BIWEEKLY_DRIVING_TIME,
      driverId: DRIVER_ID,
      severity: 'error',
    });
  });
});

describe('EU-561 — checkDrivingBreak', () => {
  it('vereist geen pauze bij rijtijd ≤4u30', () => {
    const shift = customShift({ id: 's', startIso: '2026-05-04T06:00:00Z', durationHours: 4.5 });
    expect(checkDrivingBreak(planningWith([shift]))).toEqual([]);
  });

  it('vlagt 5u rijden zonder pauze', () => {
    const shift = customShift({ id: 's', startIso: '2026-05-04T06:00:00Z', durationHours: 5 });
    const result = checkDrivingBreak(planningWith([shift]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ruleId: RULE_DRIVING_BREAK,
      driverId: DRIVER_ID,
      severity: 'error',
      shiftId: 's',
    });
  });

  it('staat 5u rijtijd met 45 min pauze toe', () => {
    const shift = customShift({
      id: 's',
      startIso: '2026-05-04T06:00:00Z',
      durationHours: 5.75,
      breakMinutes: 45,
    });
    expect(checkDrivingBreak(planningWith([shift]))).toEqual([]);
  });
});

describe('EU-561 — checkDailyRest', () => {
  it('staat 11u rust tussen shifts toe', () => {
    const shifts = [
      customShift({ id: 'a', startIso: '2026-05-04T06:00:00Z', durationHours: 8 }),
      customShift({ id: 'b', startIso: '2026-05-05T01:00:00Z', durationHours: 8 }),
    ];
    expect(checkDailyRest(planningWith(shifts))).toEqual([]);
  });

  it('staat tot 3 verkorte dagrusten (≥9u) per week toe', () => {
    const shifts = [
      customShift({ id: 'a', startIso: '2026-05-04T06:00:00Z', durationHours: 8 }),
      customShift({ id: 'b', startIso: '2026-05-05T00:00:00Z', durationHours: 8 }),
      customShift({ id: 'c', startIso: '2026-05-05T18:00:00Z', durationHours: 8 }),
      customShift({ id: 'd', startIso: '2026-05-06T12:00:00Z', durationHours: 8 }),
    ];
    expect(checkDailyRest(planningWith(shifts))).toEqual([]);
  });

  it('vlagt de 4e verkorte dagrust', () => {
    const shifts = [
      customShift({ id: 'a', startIso: '2026-05-04T06:00:00Z', durationHours: 8 }),
      customShift({ id: 'b', startIso: '2026-05-05T00:00:00Z', durationHours: 8 }),
      customShift({ id: 'c', startIso: '2026-05-05T18:00:00Z', durationHours: 8 }),
      customShift({ id: 'd', startIso: '2026-05-06T12:00:00Z', durationHours: 8 }),
      customShift({ id: 'e', startIso: '2026-05-07T06:00:00Z', durationHours: 8 }),
    ];
    const result = checkDailyRest(planningWith(shifts));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ruleId: RULE_DAILY_REST,
      driverId: DRIVER_ID,
      severity: 'error',
      shiftId: 'e',
    });
  });

  it('vlagt rust korter dan 9u als absolute overtreding', () => {
    const shifts = [
      customShift({ id: 'a', startIso: '2026-05-04T06:00:00Z', durationHours: 8 }),
      customShift({ id: 'b', startIso: '2026-05-04T22:00:00Z', durationHours: 8 }),
    ];
    const result = checkDailyRest(planningWith(shifts));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ruleId: RULE_DAILY_REST,
      driverId: DRIVER_ID,
      severity: 'error',
      shiftId: 'b',
    });
    expect(result[0]?.message).toMatch(/absoluut minimum/);
  });
});

describe('EU-561 — checkWeeklyRest', () => {
  it('geen overtreding bij ruime wekelijkse rust', () => {
    expect(checkWeeklyRest(planningWith([shiftOnDay(0, 8)]))).toEqual([]);
  });

  it('waarschuwt voor verkorte wekelijkse rust (≥24u, <45u)', () => {
    const shifts = Array.from({ length: 6 }, (_, i) => shiftOnDay(i, 9));
    const result = checkWeeklyRest(planningWith(shifts));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ruleId: RULE_WEEKLY_REST,
      driverId: DRIVER_ID,
      severity: 'warning',
    });
  });

  it('vlagt geen geldige wekelijkse rust (<24u) als error', () => {
    const shifts = Array.from({ length: 7 }, (_, i) => shiftOnDay(i, 9));
    const result = checkWeeklyRest(planningWith(shifts));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ruleId: RULE_WEEKLY_REST,
      driverId: DRIVER_ID,
      severity: 'error',
    });
  });
});
