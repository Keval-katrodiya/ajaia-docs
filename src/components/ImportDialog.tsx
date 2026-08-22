'use client';

import { useRef, useState } from 'react';
import { api, ApiClientError } from '@/lib/client';
import {
  ACCEPTED_IMPORT_EXTENSIONS,
  ACCEPTED_IMPORT_LABEL,
  MAX_UPLOAD_BYTES,
} from '@/lib/constants';

export interface ImportResponse {
  documentId: string;
  title: string;
  rev: number;
  warnings: string[];
}

type Target = 'new' | { documentId: string };

/**
 * File import.
 *
 * The same dialog covers both entry points - creating a document from a file,
 * and pulling a file into a document that is already open. Only the mode
 * selector differs, which keeps the upload/validate/error path in one place.
 *
 * Client-side extension and size checks are a UX courtesy, not a control:
 * the same rules are enforced server-side in file-import.ts.
 */
export function ImportDialog({
  target,
  onClose,
  onImported,
}: {
  target: Target;
  onClose: () => void;
  onImported: (result: ImportResponse) => void;
}) {
  const intoExisting = target !== 'new';
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function choose(next: File | null | undefined) {
    setError(null);
    if (!next) return;

    const extension = /\.[^.]+$/.exec(next.name.toLowerCase())?.[0] ?? '';
    if (!(ACCEPTED_IMPORT_EXTENSIONS as readonly string[]).includes(extension)) {
      setError(`${extension || 'That file type'} is not supported. Upload ${ACCEPTED_IMPORT_LABEL}.`);
      return;
    }
    if (next.size > MAX_UPLOAD_BYTES) {
      setError(`That file is too large. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setFile(next);
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);

    const form = new FormData();
    form.append('file', file);
    form.append('mode', intoExisting ? mode : 'new');
    if (intoExisting) form.append('documentId', target.documentId);

    try {
      const result = await api<ImportResponse>('/api/import', { method: 'POST', body: form });
      onImported(result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Import failed.');
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <h2 id="import-title">{intoExisting ? 'Import into this document' : 'Import a file'}</h2>
        <p className="dialog-sub">
          {intoExisting
            ? 'Bring the contents of a file into the document you have open.'
            : 'Turn a file into a new editable document. Formatting is converted, not screenshotted.'}
        </p>

        <div
          className={dragOver ? 'dropzone is-over' : 'dropzone'}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            choose(e.dataTransfer.files?.[0]);
          }}
        >
          {file ? (
            <>
              <strong>{file.name}</strong>
              <span className="faint">{Math.max(1, Math.round(file.size / 1024))} KB — click to change</span>
            </>
          ) : (
            <>
              <strong>Drop a file here, or click to browse</strong>
              <span className="faint">{ACCEPTED_IMPORT_LABEL} · up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB</span>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={ACCEPTED_IMPORT_EXTENSIONS.join(',')}
          onChange={(e) => choose(e.target.files?.[0])}
        />

        {intoExisting && (
          <div style={{ marginTop: 16 }}>
            <span className="label">Where should it go?</span>
            <div className="stack" style={{ gap: 6 }}>
              <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === 'append'}
                  onChange={() => setMode('append')}
                />
                <span>
                  <strong style={{ fontWeight: 600 }}>Add to the end</strong>
                  <span className="faint" style={{ display: 'block' }}>
                    Keeps what is already written.
                  </span>
                </span>
              </label>
              <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                />
                <span>
                  <strong style={{ fontWeight: 600 }}>Replace everything</strong>
                  <span className="faint" style={{ display: 'block' }}>
                    Overwrites the current contents.
                  </span>
                </span>
              </label>
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-error" style={{ marginTop: 14 }}>
            {error}
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!file || busy}>
            {busy && <span className="spinner" aria-hidden />}
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
