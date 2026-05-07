export type TransportType = 'regular' | 'special-regular' | 'occasional';

export type Region = 'flanders' | 'wallonia' | 'brussels';

export interface Driver {
  id: string;
  name: string;
  contractHoursPerWeek: number;
}

export interface Shift {
  id?: string;
  driverId: string;
  start: Date;
  end: Date;
  breakMinutes: number;
  transportType: TransportType;
}

export interface Planning {
  weekStart: Date;
  region: Region;
  shifts: Shift[];
}

export type ViolationSeverity = 'warning' | 'error';

export interface Violation {
  ruleId: string;
  driverId: string;
  severity: ViolationSeverity;
  message: string;
  shiftId?: string;
  suggestedFix?: string;
}
