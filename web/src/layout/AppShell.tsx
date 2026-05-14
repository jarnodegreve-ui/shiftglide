import React from 'react';
import { Sidebar } from './Sidebar.js';
import { useAppStore } from '../store.js';
import { RosterSection } from '../sections/Roster.js';
import { DailySection } from '../sections/Daily.js';
import { VehicleSection } from '../sections/Vehicle.js';
import { CrewSection } from '../sections/Crew.js';
import { MasterDataSection } from '../sections/MasterData.js';

export function AppShell(): React.ReactElement {
  const section = useAppStore((s) => s.activeSection);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        {section === 'roster' && <RosterSection />}
        {section === 'daily' && <DailySection />}
        {section === 'vehicle' && <VehicleSection />}
        {section === 'crew' && <CrewSection />}
        {section === 'master' && <MasterDataSection />}
      </main>
    </div>
  );
}
