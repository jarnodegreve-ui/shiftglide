import type { WorkBook } from 'xlsx';
import { serializeWorkbook } from '../../src/planner/export.js';

/**
 * Trigger een browser-download voor het gegeven werkboek.
 */
export function downloadWorkbook(wb: WorkBook, filename: string): void {
  const buf = serializeWorkbook(wb);
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
