import type { Planning, Shift, Violation, ViolationSeverity } from '../types/index.js';

export const RULE_DAILY_DRIVING_TIME = 'EU-561.daily-driving-time';
export const RULE_WEEKLY_DRIVING_TIME = 'EU-561.weekly-driving-time';
export const RULE_BIWEEKLY_DRIVING_TIME = 'EU-561.biweekly-driving-time';
export const RULE_DRIVING_BREAK = 'EU-561.driving-break';
export const RULE_DAILY_REST = 'EU-561.daily-rest';
export const RULE_WEEKLY_REST = 'EU-561.weekly-rest';

const STANDARD_MAX_DAILY_HOURS = 9;
const EXTENDED_MAX_DAILY_HOURS = 10;
const MAX_EXTENDED_DAYS_PER_WEEK = 2;
const MAX_WEEKLY_DRIVING_HOURS = 56;
const MAX_BIWEEKLY_DRIVING_HOURS = 90;
const DRIVING_PERIOD_BEFORE_BREAK_HOURS = 4.5;
const REQUIRED_BREAK_MINUTES = 45;
const STANDARD_DAILY_REST_HOURS = 11;
const REDUCED_DAILY_REST_HOURS = 9;
const MAX_REDUCED_DAILY_RESTS_PER_WEEK = 3;
const STANDARD_WEEKLY_REST_HOURS = 45;
const REDUCED_WEEKLY_REST_HOURS = 24;

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;

interface DayBucket {
  drivingHours: number;
  shifts: Shift[];
}

interface ViolationInput {
  ruleId: string;
  driverId: string;
  message: string;
  suggestedFix?: string;
  shiftId?: string;
  severity?: ViolationSeverity;
}

function violation(input: ViolationInput): Violation {
  const { ruleId, driverId, message, suggestedFix, shiftId, severity = 'error' } = input;
  return {
    ruleId,
    driverId,
    severity,
    message,
    ...(shiftId !== undefined ? { shiftId } : {}),
    ...(suggestedFix !== undefined ? { suggestedFix } : {}),
  };
}

function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function drivingHoursOf(shift: Shift): number {
  const totalMs = shift.end.getTime() - shift.start.getTime();
  const drivingMs = totalMs - shift.breakMinutes * MS_PER_MINUTE;
  return drivingMs / MS_PER_HOUR;
}

function groupShiftsByDriver(shifts: readonly Shift[]): Map<string, Shift[]> {
  const byDriver = new Map<string, Shift[]>();
  for (const shift of shifts) {
    const list = byDriver.get(shift.driverId) ?? [];
    list.push(shift);
    byDriver.set(shift.driverId, list);
  }
  return byDriver;
}

function buildDailyBuckets(shifts: readonly Shift[]): Map<string, DayBucket> {
  const buckets = new Map<string, DayBucket>();
  for (const shift of shifts) {
    const key = toUtcDayKey(shift.start);
    const bucket = buckets.get(key) ?? { drivingHours: 0, shifts: [] };
    bucket.drivingHours += drivingHoursOf(shift);
    bucket.shifts.push(shift);
    buckets.set(key, bucket);
  }
  return buckets;
}

function sortShiftsByStart(shifts: readonly Shift[]): Shift[] {
  return [...shifts].sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function checkDailyDrivingTime(planning: Planning): Violation[] {
  const violations: Violation[] = [];

  for (const [driverId, shifts] of groupShiftsByDriver(planning.shifts)) {
    const buckets = buildDailyBuckets(shifts);
    const orderedDays = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));

    let extendedDayCount = 0;

    for (const [dayKey, { drivingHours, shifts: dayShifts }] of orderedDays) {
      const firstShiftId = dayShifts[0]?.id;

      if (drivingHours > EXTENDED_MAX_DAILY_HOURS) {
        violations.push(
          violation({
            ruleId: RULE_DAILY_DRIVING_TIME,
            driverId,
            message: `Rijtijd op ${dayKey} is ${drivingHours.toFixed(2)}u — overschrijdt absoluut maximum van ${EXTENDED_MAX_DAILY_HOURS}u.`,
            suggestedFix: `Beperk rijtijd tot maximaal ${EXTENDED_MAX_DAILY_HOURS}u of plan een tweede chauffeur in.`,
            ...(firstShiftId !== undefined ? { shiftId: firstShiftId } : {}),
          }),
        );
        continue;
      }

      if (drivingHours > STANDARD_MAX_DAILY_HOURS) {
        extendedDayCount += 1;
        if (extendedDayCount > MAX_EXTENDED_DAYS_PER_WEEK) {
          violations.push(
            violation({
              ruleId: RULE_DAILY_DRIVING_TIME,
              driverId,
              message: `Rijtijd op ${dayKey} is ${drivingHours.toFixed(2)}u — meer dan ${MAX_EXTENDED_DAYS_PER_WEEK} verhoogde dagen (>${STANDARD_MAX_DAILY_HOURS}u) per week is niet toegestaan.`,
              suggestedFix: `Beperk rijtijd op deze dag tot ${STANDARD_MAX_DAILY_HOURS}u of verschuif naar een andere week.`,
              ...(firstShiftId !== undefined ? { shiftId: firstShiftId } : {}),
            }),
          );
        }
      }
    }
  }

  return violations;
}

export function checkWeeklyDrivingTime(planning: Planning): Violation[] {
  const violations: Violation[] = [];

  for (const [driverId, shifts] of groupShiftsByDriver(planning.shifts)) {
    const totalDrivingHours = shifts.reduce((sum, shift) => sum + drivingHoursOf(shift), 0);
    if (totalDrivingHours > MAX_WEEKLY_DRIVING_HOURS) {
      violations.push(
        violation({
          ruleId: RULE_WEEKLY_DRIVING_TIME,
          driverId,
          message: `Wekelijkse rijtijd is ${totalDrivingHours.toFixed(2)}u — overschrijdt maximum van ${MAX_WEEKLY_DRIVING_HOURS}u/week.`,
          suggestedFix: `Verminder geplande rijtijd onder ${MAX_WEEKLY_DRIVING_HOURS}u of verschuif rit naar volgende week.`,
        }),
      );
    }
  }

  return violations;
}

export function checkBiweeklyDrivingTime(
  planning: Planning,
  previousWeekDrivingHoursByDriver: Readonly<Record<string, number>> = {},
): Violation[] {
  const violations: Violation[] = [];

  for (const [driverId, shifts] of groupShiftsByDriver(planning.shifts)) {
    const currentWeekHours = shifts.reduce((sum, shift) => sum + drivingHoursOf(shift), 0);
    const previousHours = previousWeekDrivingHoursByDriver[driverId] ?? 0;
    const total = currentWeekHours + previousHours;

    if (total > MAX_BIWEEKLY_DRIVING_HOURS) {
      violations.push(
        violation({
          ruleId: RULE_BIWEEKLY_DRIVING_TIME,
          driverId,
          message: `Rijtijd over twee opeenvolgende weken is ${total.toFixed(2)}u (vorige week ${previousHours.toFixed(2)}u + huidige ${currentWeekHours.toFixed(2)}u) — overschrijdt maximum van ${MAX_BIWEEKLY_DRIVING_HOURS}u.`,
          suggestedFix: `Beperk rijtijd zodat het tweeweeks-totaal onder ${MAX_BIWEEKLY_DRIVING_HOURS}u blijft.`,
        }),
      );
    }
  }

  return violations;
}

export function checkDrivingBreak(planning: Planning): Violation[] {
  const violations: Violation[] = [];

  for (const shift of planning.shifts) {
    const drivingHours = drivingHoursOf(shift);
    if (
      drivingHours > DRIVING_PERIOD_BEFORE_BREAK_HOURS &&
      shift.breakMinutes < REQUIRED_BREAK_MINUTES
    ) {
      violations.push(
        violation({
          ruleId: RULE_DRIVING_BREAK,
          driverId: shift.driverId,
          message: `Rijtijd ${drivingHours.toFixed(2)}u (>${DRIVING_PERIOD_BEFORE_BREAK_HOURS}u) vereist minstens ${REQUIRED_BREAK_MINUTES} min pauze; geplande pauze is ${shift.breakMinutes} min.`,
          suggestedFix: `Plan een pauze van minstens ${REQUIRED_BREAK_MINUTES} minuten (mag opgesplitst in 15 + 30 min) na maximaal 4u30 rijtijd.`,
          ...(shift.id !== undefined ? { shiftId: shift.id } : {}),
        }),
      );
    }
  }

  return violations;
}

export function checkDailyRest(planning: Planning): Violation[] {
  const violations: Violation[] = [];

  for (const [driverId, shifts] of groupShiftsByDriver(planning.shifts)) {
    const sorted = sortShiftsByStart(shifts);
    let reducedRestCount = 0;

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (!prev || !cur) continue;

      const restHours = (cur.start.getTime() - prev.end.getTime()) / MS_PER_HOUR;

      if (restHours < REDUCED_DAILY_REST_HOURS) {
        violations.push(
          violation({
            ruleId: RULE_DAILY_REST,
            driverId,
            message: `Rust tussen shifts is ${restHours.toFixed(2)}u — minder dan absoluut minimum van ${REDUCED_DAILY_REST_HOURS}u.`,
            suggestedFix: `Verleng dagrust tot minstens ${STANDARD_DAILY_REST_HOURS}u (of ${REDUCED_DAILY_REST_HOURS}u verkorte dagrust, max ${MAX_REDUCED_DAILY_RESTS_PER_WEEK}x per week).`,
            ...(cur.id !== undefined ? { shiftId: cur.id } : {}),
          }),
        );
        continue;
      }

      if (restHours < STANDARD_DAILY_REST_HOURS) {
        reducedRestCount += 1;
        if (reducedRestCount > MAX_REDUCED_DAILY_RESTS_PER_WEEK) {
          violations.push(
            violation({
              ruleId: RULE_DAILY_REST,
              driverId,
              message: `Verkorte dagrust #${reducedRestCount} van ${restHours.toFixed(2)}u — meer dan ${MAX_REDUCED_DAILY_RESTS_PER_WEEK} verkorte dagrusten per week is niet toegestaan.`,
              suggestedFix: `Plan minstens ${STANDARD_DAILY_REST_HOURS}u dagrust voor deze shift.`,
              ...(cur.id !== undefined ? { shiftId: cur.id } : {}),
            }),
          );
        }
      }
    }
  }

  return violations;
}

export function checkWeeklyRest(planning: Planning): Violation[] {
  const violations: Violation[] = [];
  const weekStartMs = planning.weekStart.getTime();
  const weekEndMs = weekStartMs + 7 * 24 * MS_PER_HOUR;

  for (const [driverId, shifts] of groupShiftsByDriver(planning.shifts)) {
    if (shifts.length === 0) continue;

    const sorted = sortShiftsByStart(shifts);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) continue;

    let largestRestHours = (first.start.getTime() - weekStartMs) / MS_PER_HOUR;

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (!prev || !cur) continue;
      const gap = (cur.start.getTime() - prev.end.getTime()) / MS_PER_HOUR;
      if (gap > largestRestHours) largestRestHours = gap;
    }

    const tailGap = (weekEndMs - last.end.getTime()) / MS_PER_HOUR;
    if (tailGap > largestRestHours) largestRestHours = tailGap;

    if (largestRestHours < REDUCED_WEEKLY_REST_HOURS) {
      violations.push(
        violation({
          ruleId: RULE_WEEKLY_REST,
          driverId,
          message: `Langste aaneengesloten rust deze week is ${largestRestHours.toFixed(2)}u — geen geldige wekelijkse rust (minimum ${REDUCED_WEEKLY_REST_HOURS}u verkort, ${STANDARD_WEEKLY_REST_HOURS}u standaard).`,
          suggestedFix: `Plan een aaneengesloten rustperiode van minstens ${STANDARD_WEEKLY_REST_HOURS}u in deze week.`,
        }),
      );
    } else if (largestRestHours < STANDARD_WEEKLY_REST_HOURS) {
      violations.push(
        violation({
          ruleId: RULE_WEEKLY_REST,
          driverId,
          severity: 'warning',
          message: `Wekelijkse rust is ${largestRestHours.toFixed(2)}u — verkort (<${STANDARD_WEEKLY_REST_HOURS}u). Compensatie vereist binnen 3 weken.`,
          suggestedFix: `Voorzie compensatierust gekoppeld aan een andere rustperiode binnen de derde volgende week.`,
        }),
      );
    }
  }

  return violations;
}

export function runEu561Checks(
  planning: Planning,
  previousWeekDrivingHoursByDriver: Readonly<Record<string, number>> = {},
): Violation[] {
  return [
    ...checkDailyDrivingTime(planning),
    ...checkWeeklyDrivingTime(planning),
    ...checkBiweeklyDrivingTime(planning, previousWeekDrivingHoursByDriver),
    ...checkDrivingBreak(planning),
    ...checkDailyRest(planning),
    ...checkWeeklyRest(planning),
  ];
}
