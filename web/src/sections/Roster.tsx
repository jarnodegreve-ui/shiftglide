import React, { useState } from 'react';
import { GenerateView } from '../GenerateView.js';
import { UploadZone } from '../layout/UploadZone.js';
import { useAppStore } from '../store.js';
import { CheckView } from './CheckView.js';
import type { Region } from '../../../src/types/index.js';

type RosterTab = 'check' | 'generate';

export function RosterSection(): React.ReactElement {
  const [tab, setTab] = useState<RosterTab>('check');
  const weekStart = useAppStore((s) => s.lastWeekStart);
  const setWeekStart = useAppStore((s) => s.setLastWeekStart);
  const region = useAppStore((s) => s.region);
  const setRegion = useAppStore((s) => s.setRegion);

  return (
    <>
      <header className="section-header">
        <h1>Roster</h1>
        <span className="subtitle">Wekelijkse planning controleren en genereren</span>
      </header>

      <UploadZone />

      <section className="panel">
        <h2>Parameters</h2>
        <div className="controls">
          <div className="control">
            <label htmlFor="weekStart">Week start (maandag)</label>
            <input
              id="weekStart"
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </div>
          <div className="control">
            <label htmlFor="region">Regio</label>
            <select
              id="region"
              value={region}
              onChange={(e) => setRegion(e.target.value as Region)}
            >
              <option value="flanders">Vlaanderen</option>
              <option value="wallonia">Wallonië</option>
              <option value="brussels">Brussel</option>
            </select>
          </div>
        </div>
      </section>

      <nav className="tab-nav">
        <button
          className={`tab-btn ${tab === 'check' ? 'active' : ''}`}
          onClick={() => setTab('check')}
          type="button"
        >
          Controleer planning
        </button>
        <button
          className={`tab-btn ${tab === 'generate' ? 'active' : ''}`}
          onClick={() => setTab('generate')}
          type="button"
        >
          Genereer planning
        </button>
      </nav>

      {tab === 'check' && <CheckView />}
      {tab === 'generate' && <GenerateView />}
    </>
  );
}
