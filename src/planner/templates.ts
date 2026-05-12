import type { DayType } from './types.js';

/**
 * Default dienstcodes per dagtype voor de Maldegem-context.
 * Bron: door de gebruiker opgegeven schoolweek-templates.
 *
 * Aanpasbaar in de UI per individuele dag — dit is enkel de
 * pre-fill bij het kiezen van een dagtype.
 */
export const DEFAULT_TEMPLATES: Readonly<Record<DayType, readonly string[]>> = {
  maandag: [
    '2101', '2102', '2103', '2104', '2105', '2106', '2107', '2108', '2109',
    '2110', '2111', '2112', '2113', '2114', '2115', '2116', '2117', '2151',
    '2152',
  ],
  dinsdag: [
    '2101', '2102', '2103', '2104', '2105', '2106', '2107', '2108', '2109',
    '2110', '2111', '2112', '2113', '2114', '2115', '2116', '2117', '2151',
    '2152',
  ],
  woensdag: [
    '2301', '2302', '2303', '2304', '2305', '2306', '2307', '2308', '2309',
    '2310', '2311', '2312', '2313', '2314', '2315', '2316', '2317', '2351',
    '2352',
  ],
  donderdag: [
    '2101', '2102', '2103', '2104', '2105', '2106', '2107', '2108', '2109',
    '2110', '2111', '2112', '2113', '2114', '2115', '2116', '2117', '2151',
    '2152',
  ],
  vrijdag: [
    '2101', '2102', '2103', '2104', '2105', '2106', '2107', '2108', '2109',
    '2110', '2111', '2112', '2113', '2114', '2115', '2516', '2517', '2151',
    '2152',
  ],
  zaterdag: ['2601', '2602', '2603', '2604', '2605', '2606', '2607', '2608', '2651', '2652'],
  zondag: ['2701', '2702', '2703', '2704', '2705', '2751', '2752'],
};

/**
 * Map een Date naar de standaard dagtype op basis van weekdag (UTC).
 * Gebruiker kan dit per individuele dag overschrijven in de UI
 * (bv. vrijdag-feestdag → 'zondag'-template gebruiken).
 */
export function inferDayType(date: Date): DayType {
  const day = date.getUTCDay();
  // 0=zondag, 1=maandag, ..., 6=zaterdag
  switch (day) {
    case 0:
      return 'zondag';
    case 1:
      return 'maandag';
    case 2:
      return 'dinsdag';
    case 3:
      return 'woensdag';
    case 4:
      return 'donderdag';
    case 5:
      return 'vrijdag';
    case 6:
      return 'zaterdag';
    default:
      return 'maandag';
  }
}
