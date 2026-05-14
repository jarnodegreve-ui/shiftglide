import React, { useState } from 'react';
import { useAppStore } from '../store.js';

/**
 * Drop-zone die de werkboek-state direct in de store laadt.
 * Wordt gebruikt op alle plekken waar een file nodig is (Roster, Master-data).
 */
export function UploadZone(): React.ReactElement {
  const fileName = useAppStore((s) => s.workbookFileName);
  const busy = useAppStore((s) => s.workbookBusy);
  const error = useAppStore((s) => s.workbookError);
  const loadWorkbook = useAppStore((s) => s.loadWorkbook);

  const [dragging, setDragging] = useState(false);

  return (
    <>
      <label
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) void loadWorkbook(f);
        }}
      >
        <strong>{fileName ? `Geladen: ${fileName}` : 'Sleep je .xls hierheen'}</strong>
        <p>{busy ? 'Bezig met inlezen…' : 'Of klik om te bladeren — .xls / .xlsx'}</p>
        <input
          type="file"
          accept=".xls,.xlsx"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadWorkbook(f);
          }}
        />
      </label>
      {error && <div className="error-banner">{error}</div>}
    </>
  );
}
