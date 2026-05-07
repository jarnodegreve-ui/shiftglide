import type {
  Planning,
  Region,
  Shift,
  TransportType,
  Violation,
  ViolationSeverity,
} from '../types/index.js';

export const RULE_AMPLITUDE = 'BE-KB-2005-08-10.amplitude';
export const RULE_MAX_DAILY_WORKING_TIME = 'BE-KB-2005-08-10.daily-working-time';
export const RULE_MAX_WEEKLY_WORKING_TIME = 'BE-KB-2005-08-10.weekly-working-time';

const MAX_AMPLITUDE_HOURS = 14;
const STANDARD_MAX_DAILY_WORKING_HOURS = 10;
const FLANDERS_REGULAR_MAX_DAILY_WORKING_HOURS = 12;
const MAX_WEEKLY_WORKING_HOURS = 50;

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;

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

// "Werktijd" wordt hier benaderd als (shift duration - breakMinutes). Voor het strikte
// arbeidstijd-recht (richtlijn 2002/15/EG) is werktijd ruimer dan rijtijd (incl. laden,
// wachten in standby, etc.) — ons huidige Shift-model maakt dat onderscheid niet.
function workingHoursOf(shift: Shift): number {
  const totalMs = shift.end.getTime() - shift.start.getTime();
  return (totalMs - shift.breakMinutes * MS_PER_MINUTE) / MS_PER_HOUR;
}

function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function groupShiftsByDriverAndDay(
  shifts: readonly Shift[],
): Map<string, Map<string, Shift[]>> {
  const result = new Map<string, Map<string, Shift[]>>();
  for (const shift of shifts) {
    const dayKey = toUtcDayKey(shift.start);
    const driverMap = result.get(shift.driverId) ?? new Map<string, Shift[]>();
    const dayShifts = driverMap.get(dayKey) ?? [];
    dayShifts.push(shift);
    driverMap.set(dayKey, dayShifts);
    result.set(shift.driverId, driverMap);
  }
  return result;
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

function maxDailyWorkingHoursFor(transportType: TransportType, region: Region): number {
  if (transportType === 'regular' && region === 'flanders') {
    return FLANDERS_REGULAR_MAX_DAILY_WORKING_HOURS;
  }
  return STANDARD_MAX_DAILY_WORKING_HOURS;
}

export function checkAmplitude(planning: Planning): Violation[] {
  const violations: Violation[] = [];

  for (const [driverId, driverDayMap] of groupShiftsByDriverAndDay(planning.shifts)) {
    for (const [dayKey, dayShifts] of driverDayMap) {
      if (dayShifts.length === 0) continue;
      const sorted = [...dayShifts].sort((a, b) => a.start.getTime() - b.start.getTime());
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (!first || !last) continue;

      const amplitudeHours = (last.end.getTime() - first.start.getTime()) / MS_PER_HOUR;
      if (amplitudeHours > MAX_AMPLITUDE_HOURS) {
        violations.push(
          violation({
            ruleId: RULE_AMPLITUDE,
            driverId,
            message: `Amplitude op ${dayKey} is ${amplitudeHours.toFixed(2)}u — overschrijdt maximum van ${MAX_AMPLITUDE_HOURS}u (PC 140.01).`,
            suggestedFix: `Beperk spreiding van de werkdag tot ${MAX_AMPLITUDE_HOURS}u of voorzie een aaneengesloten parkering ≥4u (uitbreiding tot 16u onder PC 140.01-voorwaarden).`,
            ...(first.id !== undefined ? { shiftId: first.id } : {}),
          }),
        );
      }
    }
  }

  return violations;
}

export function checkMaxDailyWorkingTime(planning: Planning): Violation[] {
  const violations: Violation[] = [];

  for (const [driverId, driverDayMap] of groupShiftsByDriverAndDay(planning.shifts)) {
    for (const [dayKey, dayShifts] of driverDayMap) {
      if (dayShifts.length === 0) continue;

      // Bij gemengde types op dezelfde dag: gebruik de strengste limit (Math.min).
      const limits = dayShifts.map((s) => maxDailyWorkingHoursFor(s.transportType, planning.region));
      const limit = Math.min(...limits);

      const totalWorking = dayShifts.reduce((sum, s) => sum + workingHoursOf(s), 0);
      if (totalWorking > limit) {
        const firstShiftId = dayShifts[0]?.id;
        violations.push(
          violation({
            ruleId: RULE_MAX_DAILY_WORKING_TIME,
            driverId,
            message: `Werktijd op ${dayKey} is ${totalWorking.toFixed(2)}u — overschrijdt maximum van ${limit}u/dag (KB 10/08/2005).`,
            suggestedFix: `Beperk werktijd tot ${limit}u/dag of verschuif werk naar een andere dag.`,
            ...(firstShiftId !== undefined ? { shiftId: firstShiftId } : {}),
          }),
        );
      }
    }
  }

  return violations;
}

export function checkMaxWeeklyWorkingTime(planning: Planning): Violation[] {
  const violations: Violation[] = [];

  for (const [driverId, shifts] of groupShiftsByDriver(planning.shifts)) {
    const totalWorking = shifts.reduce((sum, s) => sum + workingHoursOf(s), 0);
    if (totalWorking > MAX_WEEKLY_WORKING_HOURS) {
      violations.push(
        violation({
          ruleId: RULE_MAX_WEEKLY_WORKING_TIME,
          driverId,
          message: `Wekelijkse werktijd is ${totalWorking.toFixed(2)}u — overschrijdt maximum van ${MAX_WEEKLY_WORKING_HOURS}u/week (KB 10/08/2005).`,
          suggestedFix: `Beperk wekelijkse werktijd tot ${MAX_WEEKLY_WORKING_HOURS}u (CAO-derogaties tot 70u vereisen sectorale toelating).`,
        }),
      );
    }
  }

  return violations;
}

export function runKbChecks(planning: Planning): Violation[] {
  return [
    ...checkAmplitude(planning),
    ...checkMaxDailyWorkingTime(planning),
    ...checkMaxWeeklyWorkingTime(planning),
  ];
}
