import React from 'react';

export function CrewSection(): React.ReactElement {
  return (
    <>
      <header className="section-header">
        <h1>Crew</h1>
        <span className="subtitle">Diensten samenstellen uit voertuig-blokken (runcutting)</span>
      </header>

      <section className="panel">
        <div className="empty-state">
          <h3 style={{ marginTop: 0 }}>Nog niet beschikbaar</h3>
          <p className="muted">
            Deze module komt in een latere iteratie. Wat hier gaat staan:
          </p>
          <ul className="muted feature-list">
            <li>Validator over je bestaande loondiensten: amplitude, werktijd, pauze, splits</li>
            <li>Splits-assistent: "hier kun je beter splitsen omdat amplitude 14u dreigt"</li>
            <li>Auto-runcutting: optimale diensten genereren uit voertuig-blokken (heuristiek nu, CP-SAT/column-generation later)</li>
            <li>Vergelijken: huidige dienstcodes vs. door software voorgestelde</li>
            <li>Export naar loondiensten-sheet zodat je ze in je werkboek kan inpassen</li>
          </ul>
        </div>
      </section>
    </>
  );
}
