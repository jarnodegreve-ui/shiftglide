import * as XLSX from 'xlsx';
import type { WorkBook } from 'xlsx';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Region } from '../../src/types/index.js';

export type SectionKey = 'roster' | 'daily' | 'vehicle' | 'crew' | 'master';

function defaultIsoMonday(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

interface AppState {
  // ── Persistent
  drivers: string[];
  region: Region;
  lastWeekStart: string;
  activeSection: SectionKey;

  // ── Transient (workbook stays in memory, not persisted)
  workbook: WorkBook | null;
  workbookFileName: string | null;
  workbookError: string | null;
  workbookBusy: boolean;

  // ── Actions
  setDrivers: (drivers: string[]) => void;
  setRegion: (region: Region) => void;
  setLastWeekStart: (iso: string) => void;
  setActiveSection: (s: SectionKey) => void;
  loadWorkbook: (file: File) => Promise<void>;
  clearWorkbook: () => void;
  /** Importeer chauffeursnamen uit de praktijk-sheet van de geladen workbook */
  importDriversFromWorkbook: () => number;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      drivers: [],
      region: 'flanders',
      lastWeekStart: defaultIsoMonday(),
      activeSection: 'roster',

      workbook: null,
      workbookFileName: null,
      workbookError: null,
      workbookBusy: false,

      setDrivers: (drivers) => set({ drivers }),
      setRegion: (region) => set({ region }),
      setLastWeekStart: (iso) => set({ lastWeekStart: iso }),
      setActiveSection: (activeSection) => set({ activeSection }),

      loadWorkbook: async (file: File) => {
        set({ workbookBusy: true, workbookError: null });
        try {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: 'array', cellDates: false });
          set({ workbook: wb, workbookFileName: file.name, workbookBusy: false });
        } catch (e) {
          set({
            workbookBusy: false,
            workbookError: `Kon bestand niet inlezen: ${(e as Error).message}`,
          });
        }
      },

      clearWorkbook: () =>
        set({ workbook: null, workbookFileName: null, workbookError: null }),

      importDriversFromWorkbook: () => {
        const wb = get().workbook;
        if (!wb) return 0;
        const ws = wb.Sheets['praktijk'];
        if (!ws) return 0;
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
          header: 1,
          defval: '',
          raw: false,
        });
        const headerRow = rows[0] ?? [];
        const imported: string[] = [];
        for (let c = 2; c < headerRow.length; c++) {
          const name = String(headerRow[c] ?? '').trim();
          if (name) imported.push(name);
        }
        if (imported.length === 0) return 0;
        // Merge: behoud volgorde uit Excel, dedupliceer
        const existing = new Set(get().drivers);
        const merged = [...get().drivers];
        let added = 0;
        for (const name of imported) {
          if (!existing.has(name)) {
            merged.push(name);
            existing.add(name);
            added++;
          }
        }
        set({ drivers: merged });
        return added;
      },
    }),
    {
      name: 'shiftglide-store-v1',
      partialize: (state) => ({
        drivers: state.drivers,
        region: state.region,
        lastWeekStart: state.lastWeekStart,
        activeSection: state.activeSection,
      }),
    },
  ),
);
