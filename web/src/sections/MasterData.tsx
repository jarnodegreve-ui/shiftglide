import React, { useMemo, useState } from 'react';
import { parseLoondiensten } from '../../../src/excel/loondiensten.js';
import { UploadZone } from '../layout/UploadZone.js';
import { useAppStore } from '../store.js';

export function MasterDataSection(): React.ReactElement {
  const workbook = useAppStore((s) => s.workbook);
  const drivers = useAppStore((s) => s.drivers);
  const setDrivers = useAppStore((s) => s.setDrivers);
  const importDrivers = useAppStore((s) => s.importDriversFromWorkbook);

  const [driversText, setDriversText] = useState<string>(drivers.join('\n'));
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Houd lokale tekst in sync als store extern wijzigt (bv. na importeren)
  React.useEffect(() => {
    setDriversText(drivers.join('\n'));
  }, [drivers]);

  const catalogueSummary = useMemo(() => {
    if (!workbook) return null;
    const r = parseLoondiensten(workbook);
    let withLoops = 0;
    let absences = 0;
    for (const d of r.defs.values()) {
      if (d.isAbsence) absences++;
      else if (d.loops.length > 0) withLoops++;
    }
    return {
      total: r.defs.size,
      withLoops,
      absences,
      warnings: r.warnings,
    };
  }, [workbook]);

  function saveDrivers() {
    const list = driversText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    setDrivers(list);
  }

  function onImport() {
    const added = importDrivers();
    setImportMessage(
      added === 0
        ? 'Geen nieuwe chauffeurs gevonden (alles staat al in de lijst).'
        : `${added} chauffeur(s) geïmporteerd uit "praktijk"-sheet.`,
    );
  }

  return (
    <>
      <header className="section-header">
        <h1>Master-data</h1>
        <span className="subtitle">Werkboek, dienstcatalogus en chauffeurs</span>
      </header>

      <UploadZone />

      {catalogueSummary && (
        <section className="panel">
          <h2>Dienstcatalogus (loondiensten)</h2>
          <div className="stats-grid">
            <Stat label="Totaal definities" value={catalogueSummary.total} />
            <Stat label="Met loops (werkdiensten)" value={catalogueSummary.withLoops} />
            <Stat label="Afwezigheidscodes" value={catalogueSummary.absences} />
          </div>
          {catalogueSummary.warnings.length > 0 && (
            <p className="muted small" style={{ marginTop: 12 }}>
              {catalogueSummary.warnings.length} waarschuwing(en) bij het parsen.
            </p>
          )}
        </section>
      )}

      <section className="panel">
        <h2>Chauffeurs</h2>
        <p className="muted small">
          Eén chauffeur per regel. Wordt bewaard tussen sessies en gebruikt door alle modules.
        </p>
        <textarea
          className="textarea-drivers"
          value={driversText}
          onChange={(e) => setDriversText(e.target.value)}
          rows={Math.max(10, drivers.length + 1)}
          placeholder="De Roo Dieter&#10;Mendez Jesus&#10;..."
        />
        <div className="generate-bar" style={{ marginTop: 12 }}>
          <button onClick={saveDrivers} type="button">
            Opslaan
          </button>
          {workbook && (
            <button onClick={onImport} type="button" className="link-btn">
              Importeer uit werkboek
            </button>
          )}
          {importMessage && <span className="muted small">{importMessage}</span>}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          {drivers.length} chauffeur(s) bewaard.
        </p>
      </section>
    </>
  );
}

function Stat(props: { label: string; value: number }): React.ReactElement {
  return (
    <div className="stat">
      <div className="label">{props.label}</div>
      <div className="value">{props.value}</div>
    </div>
  );
}
