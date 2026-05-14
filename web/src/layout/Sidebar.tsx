import React from 'react';
import { type SectionKey, useAppStore } from '../store.js';

interface NavItem {
  key: SectionKey;
  label: string;
  description: string;
  group: 'planning' | 'data';
}

const NAV_ITEMS: NavItem[] = [
  { key: 'roster', label: 'Roster', description: 'Wekelijkse planning', group: 'planning' },
  { key: 'daily', label: 'Daily', description: 'Vandaag + afwezigheden', group: 'planning' },
  { key: 'vehicle', label: 'Vehicle', description: 'Voertuig-blokken', group: 'planning' },
  { key: 'crew', label: 'Crew', description: 'Diensten + runcutting', group: 'planning' },
  { key: 'master', label: 'Master-data', description: 'Chauffeurs + catalogus', group: 'data' },
];

export function Sidebar(): React.ReactElement {
  const active = useAppStore((s) => s.activeSection);
  const setActive = useAppStore((s) => s.setActiveSection);

  const planningItems = NAV_ITEMS.filter((i) => i.group === 'planning');
  const dataItems = NAV_ITEMS.filter((i) => i.group === 'data');

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <strong>Shiftglide</strong>
        <span className="muted small">Belgische bus-planning</span>
      </div>

      <nav className="sidebar-section">
        <div className="sidebar-label">Planning</div>
        {planningItems.map((item) => (
          <SidebarItem
            key={item.key}
            item={item}
            active={active === item.key}
            onClick={() => setActive(item.key)}
          />
        ))}
      </nav>

      <nav className="sidebar-section">
        <div className="sidebar-label">Gegevens</div>
        {dataItems.map((item) => (
          <SidebarItem
            key={item.key}
            item={item}
            active={active === item.key}
            onClick={() => setActive(item.key)}
          />
        ))}
      </nav>

      <div className="sidebar-footer">
        <WorkbookIndicator />
      </div>
    </aside>
  );
}

function SidebarItem(props: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}): React.ReactElement {
  const { item, active, onClick } = props;
  return (
    <button
      className={`sidebar-item ${active ? 'active' : ''}`}
      onClick={onClick}
      type="button"
    >
      <div className="sidebar-item-label">{item.label}</div>
      <div className="sidebar-item-desc">{item.description}</div>
    </button>
  );
}

function WorkbookIndicator(): React.ReactElement {
  const name = useAppStore((s) => s.workbookFileName);
  const clear = useAppStore((s) => s.clearWorkbook);

  if (!name) {
    return (
      <div className="workbook-indicator empty">
        <span className="muted small">Geen werkboek geladen</span>
      </div>
    );
  }

  return (
    <div className="workbook-indicator loaded">
      <span className="small" title={name}>
        📄 {name.length > 22 ? name.slice(0, 19) + '…' : name}
      </span>
      <button className="link-btn" onClick={clear} type="button">
        leegmaken
      </button>
    </div>
  );
}
