import * as XLSX from 'xlsx';
import { buildPlanning } from '../src/excel/adapter.js';
import { runKbChecks } from '../src/rules/kb-2005-08-10.js';

// Eenvoudige inspectie-script. Gebruik:
//   pnpm tsx scripts/inspect-week.ts <path-to-xls> <YYYY-MM-DD-of-Monday>
const [, , filePath = './Dienstregeling maldegem actueel.xls', weekStartIso = '2026-04-06'] =
  process.argv;

const wb = XLSX.readFile(filePath);
const result = buildPlanning(wb, {
  weekStart: new Date(`${weekStartIso}T00:00:00Z`),
  region: 'flanders',
});

console.log(`=== Statistieken week ${weekStartIso} (7 dagen) ===`);
console.log(`Totaal cellen in praktijk:    ${result.stats.totalEntries}`);
console.log(`  → Shifts gegenereerd:       ${result.stats.shiftsCreated}`);
console.log(`  → Afwezigheid (vrij/F/...): ${result.stats.absences}`);
console.log(`  → Genegeerd (BUR/GAR/...):  ${result.stats.ignored}`);
console.log(`  → Onbekende codes:          ${result.stats.unknown}`);

console.log('\n=== Top 10 onbekende codes ===');
for (const [code, n] of [...result.unknownCodes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(n).padStart(3)}x  →  "${code}"`);
}

console.log('\n=== Afwezigheidscodes ===');
for (const [code, n] of [...result.absenceCodes.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}x  →  "${code}"`);
}

console.log('\n=== Genegeerde werkcodes (BUR/GAR/OPL/...) ===');
for (const [code, n] of [...result.ignoredWorkCodes.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}x  →  "${code}"`);
}

console.log('\n=== Steekproef shifts (eerste 5) ===');
const fmt = (d: Date): string => d.toISOString().slice(0, 16).replace('T', ' ');
for (const s of result.planning.shifts.slice(0, 5)) {
  console.log(
    `  ${s.id}  ${s.driverId.slice(0, 18).padEnd(20)}  ${fmt(s.start)} → ${fmt(s.end)}  pauze=${s.breakMinutes}min  type=${s.transportType}`,
  );
}

console.log('\n=== Compliance-check: KB 10/08/2005 + PC 140.01 (EU 561 geskipt) ===');
const violations = runKbChecks(result.planning);
console.log(`Totaal: ${violations.length} violations`);
const byRule = new Map<string, number>();
for (const v of violations) byRule.set(v.ruleId, (byRule.get(v.ruleId) ?? 0) + 1);
console.log('Per regel:');
for (const [rule, n] of byRule) console.log(`  ${rule}: ${n}`);

console.log('\n=== Eerste 5 violations ===');
for (const v of violations.slice(0, 5)) {
  console.log(`  [${v.severity}] ${v.driverId.padEnd(20)} ${v.ruleId}`);
  console.log(`     ${v.message}`);
}
