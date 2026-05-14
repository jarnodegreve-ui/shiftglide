import React from 'react';

export function DailySection(): React.ReactElement {
  return (
    <>
      <header className="section-header">
        <h1>Daily</h1>
        <span className="subtitle">Vandaag — afwezigheden, vervangers, swaps</span>
      </header>

      <section className="panel">
        <div className="empty-state">
          <h3 style={{ marginTop: 0 }}>Nog niet beschikbaar</h3>
          <p className="muted">
            Deze module komt in een volgende iteratie. Wat hier gaat staan:
          </p>
          <ul className="muted feature-list">
            <li>Dashboard "vandaag": wie werkt, wie is afwezig, wie staat stand-by</li>
            <li>Ziekmelding registreren → automatisch vervanger zoeken</li>
            <li>Swap-tooling tussen chauffeurs (1-klik wissel)</li>
            <li>Dagelijkse oproeplijst printen/exporteren</li>
            <li>Afwezigheids-historie en KPI's</li>
          </ul>
        </div>
      </section>
    </>
  );
}
