import type { Region } from '../types/index.js';

export type DayType = 'schooldag' | 'vakantiedag' | 'zaterdag' | 'zondag' | 'feestdag';

export interface DayPlan {
  /** UTC-datum, alleen YYYY-MM-DD 00:00:00Z gedeelte gebruikt */
  date: Date;
  dayType: DayType;
  /** Lijst dienstcodes die op deze dag moeten worden bemand */
  requiredDiensten: string[];
}

export interface PlannerInput {
  /** Maandag van de week (UTC) */
  weekStart: Date;
  region: Region;
  /** Beschikbare chauffeurs deze week */
  drivers: string[];
  /** Eén DayPlan per dag van de week */
  dayPlans: DayPlan[];
}

export interface Assignment {
  date: Date;
  driverName: string;
  dienstcode: string;
}

export type UnassignedReason =
  | 'geen-chauffeur-beschikbaar'
  | 'onbekende-code'
  | 'geen-werkdienst';

export interface UnassignedDienst {
  date: Date;
  dienstcode: string;
  reason: UnassignedReason;
  detail: string;
}

export interface PlannerOutput {
  assignments: Assignment[];
  unassignedDiensten: UnassignedDienst[];
  /** Werktijd in minuten per chauffeur (alleen toegewezen diensten geteld) */
  workloadMinutesPerDriver: Map<string, number>;
  warnings: string[];
}
