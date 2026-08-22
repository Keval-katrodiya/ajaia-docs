'use client';

import { useRef, useState } from 'react';
import { useCloseOnOutsideClick } from './UserMenu';

/**
 * Export is a plain link per format - the server sets Content-Disposition and
 * the browser handles the download. No blob juggling, no client-side
 * conversion, and the exported file is identical to what the API produces.
 */
export function ExportMenu({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useCloseOnOutsideClick(container, () => setOpen(false), open);

  const base = `/api/documents/${documentId}/export`;

  return (
    <div ref={container} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>↓</span> Export
      </button>

      {open && (
        <div className="menu" role="menu">
          <a href={`${base}?format=md`} role="menuitem" onClick={() => setOpen(false)}>
            <MenuRow title="Markdown (.md)" note="Underline becomes <u>" />
          </a>
          <a href={`${base}?format=html`} role="menuitem" onClick={() => setOpen(false)}>
            <MenuRow title="HTML (.html)" note="Standalone, styled page" />
          </a>
          <a href={`${base}?format=txt`} role="menuitem" onClick={() => setOpen(false)}>
            <MenuRow title="Plain text (.txt)" note="Formatting removed" />
          </a>
        </div>
      )}
    </div>
  );
}

function MenuRow({ title, note }: { title: string; note: string }) {
  return (
    <span style={{ display: 'block', padding: '7px 9px', borderRadius: 6 }}>
      <span style={{ display: 'block', fontSize: 13.5, color: 'var(--text)' }}>{title}</span>
      <span className="faint">{note}</span>
    </span>
  );
}
