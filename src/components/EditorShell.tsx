'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '@/lib/client';
import { AUTOSAVE_DEBOUNCE_MS } from '@/lib/constants';
import { editorExtensions } from '@/lib/editor-extensions';
import type { AccessRole } from '@/lib/permissions';
import type { PmDoc } from '@/lib/richtext';
import { ExportMenu } from './ExportMenu';
import { ImportDialog } from './ImportDialog';
import { ShareDialog } from './ShareDialog';
import { Toolbar } from './Toolbar';

export interface EditorDocument {
  id: string;
  title: string;
  content: PmDoc;
  rev: number;
  role: AccessRole;
  canEdit: boolean;
  canShare: boolean;
  shareCount: number;
  lastImport: { filename: string; createdAt: string } | null;
}

type SaveState = 'clean' | 'pending' | 'saving' | 'saved' | 'error';

interface PendingPatch {
  title?: string;
  content?: PmDoc;
}

/**
 * The editing surface: title, toolbar, autosave, sharing, import and export.
 *
 * Saving model
 * ------------
 * Edits accumulate into a pending patch and flush 800 ms after typing stops.
 * Content saves carry the revision the client started from; if a co-editor
 * saved in the meantime the server answers 409 and we stop autosaving and ask
 * the user to reload, rather than quietly overwriting their colleague.
 *
 * That is a deliberate cut. Real-time CRDT merging was out of scope for the
 * timebox - so instead of pretending concurrent edits are safe, the product
 * detects the collision and says so. See ARCHITECTURE.md.
 */
export function EditorShell({ initial }: { initial: EditorDocument }) {
  const router = useRouter();

  const [title, setTitle] = useState(initial.title);
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [shareCount, setShareCount] = useState(initial.shareCount);

  const revRef = useRef(initial.rev);
  const pendingRef = useRef<PendingPatch>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const conflictRef = useRef(false);

  const editor = useEditor({
    extensions: editorExtensions,
    content: initial.content,
    editable: initial.canEdit,
    // Required under the App Router: rendering the editor during SSR would
    // produce a hydration mismatch.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Document body',
      },
    },
    onUpdate: ({ editor: instance }) => {
      pendingRef.current.content = instance.getJSON() as PmDoc;
      queueSave();
    },
  });

  /* ---------------------------------------------------------------------- */
  /* Saving                                                                  */
  /* ---------------------------------------------------------------------- */

  const flush = useCallback(async () => {
    if (conflictRef.current) return;

    // A save is already in flight - let it finish, then pick up whatever
    // arrived while it was running.
    if (savingRef.current) {
      timerRef.current = setTimeout(() => void flush(), 120);
      return;
    }

    const patch = pendingRef.current;
    if (patch.title === undefined && patch.content === undefined) return;

    pendingRef.current = {};
    savingRef.current = true;
    setSaveState('saving');
    setError(null);

    try {
      const body: Record<string, unknown> = {};
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.content !== undefined) {
        body.content = patch.content;
        body.baseRev = revRef.current;
      }

      const result = await api<{ rev: number }>(`/api/documents/${initial.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      revRef.current = result.rev;
      setSaveState(
        pendingRef.current.title !== undefined || pendingRef.current.content !== undefined
          ? 'pending'
          : 'saved',
      );
      router.refresh(); // Keeps the document list's title/preview current.
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'conflict') {
        conflictRef.current = true;
        setConflict(true);
        setSaveState('error');
      } else {
        // Put the work back so the next flush retries it instead of losing it.
        pendingRef.current = { ...patch, ...pendingRef.current };
        setSaveState('error');
        setError(err instanceof ApiClientError ? err.message : 'Could not save.');
      }
    } finally {
      savingRef.current = false;
    }
  }, [initial.id, router]);

  const queueSave = useCallback(
    (delay = AUTOSAVE_DEBOUNCE_MS) => {
      if (conflictRef.current) return;
      setSaveState('pending');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), delay);
    },
    [flush],
  );

  function onTitleChange(next: string) {
    setTitle(next);
    pendingRef.current.title = next.trim() === '' ? 'Untitled document' : next;
    queueSave();
  }

  // Ctrl/Cmd+S saves now rather than waiting out the debounce. People press it
  // whether or not you have autosave; honouring it costs four lines.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (timerRef.current) clearTimeout(timerRef.current);
        void flush();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flush]);

  // Last line of defence against closing the tab on unsaved work.
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      const dirty =
        pendingRef.current.title !== undefined || pendingRef.current.content !== undefined;
      if (dirty || savingRef.current) event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => () => void (timerRef.current && clearTimeout(timerRef.current)), []);

  /* ---------------------------------------------------------------------- */
  /* Import into the open document                                           */
  /* ---------------------------------------------------------------------- */

  async function reloadContent() {
    const fresh = await api<{ title: string; content: PmDoc; rev: number }>(
      `/api/documents/${initial.id}`,
    );
    revRef.current = fresh.rev;
    setTitle(fresh.title);
    editor?.commands.setContent(fresh.content, false);
    pendingRef.current = {};
    conflictRef.current = false;
    setConflict(false);
    setSaveState('saved');
  }

  return (
    <>
      <div className="editor-bar">
        <input
          className="title-input grow"
          value={title}
          disabled={!initial.canEdit}
          aria-label="Document title"
          maxLength={200}
          onChange={(e) => onTitleChange(e.target.value)}
          onBlur={() => title.trim() === '' && onTitleChange('Untitled document')}
        />

        <SaveIndicator state={saveState} readOnly={!initial.canEdit} />

        {initial.canEdit && (
          <button type="button" className="btn btn-sm" onClick={() => setImportOpen(true)}>
            <span aria-hidden>↑</span> Import
          </button>
        )}

        <ExportMenu documentId={initial.id} />

        {initial.canShare && (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setShareOpen(true)}>
            <span aria-hidden>◍</span> Share{shareCount > 0 ? ` (${shareCount})` : ''}
          </button>
        )}
      </div>

      <div className="editor-bar" style={{ top: 106, paddingTop: 4, paddingBottom: 4 }}>
        <Toolbar editor={editor} disabled={!initial.canEdit || conflict} />
        {!initial.canEdit && (
          <>
            <span className="spacer" />
            <span className="badge">View only — you cannot edit this document</span>
          </>
        )}
      </div>

      <div style={{ padding: '0 16px' }}>
        {conflict && (
          <Banner tone="error">
            <strong>Someone else saved this document.</strong> Your recent changes were not stored.
            Reload to pick up their version.
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginLeft: 10 }}
              onClick={() => void reloadContent()}
            >
              Reload
            </button>
          </Banner>
        )}

        {error && !conflict && <Banner tone="error">{error}</Banner>}

        {warnings.length > 0 && (
          <Banner tone="warn" onDismiss={() => setWarnings([])}>
            {warnings.join(' ')}
          </Banner>
        )}
      </div>

      <div className="doc-canvas">
        <EditorContent editor={editor} />
      </div>

      {shareOpen && (
        <ShareDialog
          documentId={initial.id}
          onClose={() => setShareOpen(false)}
          onCountChange={setShareCount}
        />
      )}

      {importOpen && (
        <ImportDialog
          target={{ documentId: initial.id }}
          onClose={() => setImportOpen(false)}
          onImported={async (result) => {
            setImportOpen(false);
            setWarnings(result.warnings);
            await reloadContent();
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function SaveIndicator({ state, readOnly }: { state: SaveState; readOnly: boolean }) {
  if (readOnly) return <span className="save-state">Read only</span>;

  const copy: Record<SaveState, string> = {
    clean: 'All changes saved',
    pending: 'Unsaved changes',
    saving: 'Saving…',
    saved: 'All changes saved',
    error: 'Not saved',
  };

  return (
    <span className={state === 'error' ? 'save-state is-error' : 'save-state'} aria-live="polite">
      {state === 'saving' && <span className="spinner" aria-hidden />}
      {copy[state]}
    </span>
  );
}

function Banner({
  tone,
  children,
  onDismiss,
}: {
  tone: 'error' | 'warn';
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      className={tone === 'error' ? 'alert alert-error' : 'alert alert-warn'}
      style={{ maxWidth: 816, margin: '14px auto 0' }}
      role="status"
    >
      <span className="grow">{children}</span>
      {onDismiss && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}
