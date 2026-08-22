'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiClientError } from '@/lib/client';
import { ACCEPTED_IMPORT_LABEL } from '@/lib/constants';
import { ImportDialog } from './ImportDialog';

export function DocumentActions() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createBlank() {
    setError(null);
    setCreating(true);
    try {
      const doc = await api<{ id: string }>('/api/documents', { method: 'POST' });
      router.push(`/docs/${doc.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not create the document.');
      setCreating(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 10, marginBottom: 6 }}>
      <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={createBlank} disabled={creating}>
          {creating ? <span className="spinner" aria-hidden /> : <span aria-hidden>+</span>}
          New document
        </button>
        <button type="button" className="btn" onClick={() => setImporting(true)}>
          <span aria-hidden>↑</span> Import a file
        </button>
        <span className="faint">Accepts {ACCEPTED_IMPORT_LABEL}</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {importing && (
        <ImportDialog
          target="new"
          onClose={() => setImporting(false)}
          onImported={(result) => router.push(`/docs/${result.documentId}`)}
        />
      )}
    </div>
  );
}
