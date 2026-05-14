import React from 'react';

export function VehicleSection(): React.ReactElement {
  return (
    <>
      <header className="section-header">
        <h1>Vehicle</h1>
        <span className="subtitle">Voertuig-blokken — welke bus rijdt welke ritten</span>
      </header>

      <section className="panel">
        <div className="empty-state">
          <h3 style={{ marginTop: 0 }}>Nog niet beschikbaar</h3>
          <p className="muted">
            Deze module komt in een latere iteratie. Wat hier gaat staan:
          </p>
          <ul className="muted feature-list">
            <li>Parser voor de "ritorders per bus"-sheet uit jouw werkboek</li>
            <li>Gantt-visualisatie: x-as = tijd, y-as = bus, balken = ritordernummers</li>
            <li>Handmatig blokken aanpassen (drag-drop ritordernummers tussen bussen)</li>
            <li>Detectie van deadhead-tijd (lege verplaatsing tussen ritten)</li>
            <li>Suggesties voor optimalere bus-toewijzing</li>
          </ul>
        </div>
      </section>
    </>
  );
}
