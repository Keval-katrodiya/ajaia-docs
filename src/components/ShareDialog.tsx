'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/client';
import type { ShareEntry } from '@/lib/documents';
import type { ShareRole } from '@/lib/permissions';
import type { User } from '@/lib/types';
import { Avatar } from './Avatar';

/**
 * Sharing.
 *
 * The model is deliberately two roles deep - "can edit" and "can view" - which
 * is the smallest thing that is still a real permission system rather than an
 * on/off switch. Only the owner sees this dialog; the API enforces that
 * independently in requireOwnerAccess().
 */
export function ShareDialog({
  documentId,
  onClose,
  onCountChange,
}: {
  documentId: string;
  onClose: () => void;
  onCountChange: (count: number) => void;
}) {
  const [shares, setShares] = useState<ShareEntry[] | null>(null);
  const [people, setPeople] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [shareResult, userResult] = await Promise.all([
          api<{ shares: ShareEntry[] }>(`/api/documents/${documentId}/shares`),
          api<{ users: User[] }>('/api/users'),
        ]);
        if (cancelled) return;
        setShares(shareResult.shares);
        setPeople(userResult.users);
        onCountChange(shareResult.shares.length);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : 'Could not load sharing.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, onCountChange]);

  function apply(next: ShareEntry[]) {
    setShares(next);
    onCountChange(next.length);
  }

  async function addShare(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { share } = await api<{ share: ShareEntry }>(`/api/documents/${documentId}/shares`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      });
      const rest = (shares ?? []).filter((s) => s.user.id !== share.user.id);
      apply([...rest, share].sort((a, b) => a.user.name.localeCompare(b.user.name)));
      setNotice(`${share.user.name} can now ${role === 'editor' ? 'edit' : 'view'} this document.`);
      setEmail('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not share the document.');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(share: ShareEntry, nextRole: ShareRole) {
    setError(null);
    // Optimistic: role changes are cheap to reverse and the dialog feels dead
    // without it. A failure restores the previous list.
    const previous = shares ?? [];
    apply(previous.map((s) => (s.id === share.id ? { ...s, role: nextRole } : s)));
    try {
      await api(`/api/documents/${documentId}/shares/${share.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
    } catch (err) {
      apply(previous);
      setError(err instanceof ApiClientError ? err.message : 'Could not update access.');
    }
  }

  async function revoke(share: ShareEntry) {
    setError(null);
    const previous = shares ?? [];
    apply(previous.filter((s) => s.id !== share.id));
    try {
      await api(`/api/documents/${documentId}/shares/${share.id}`, { method: 'DELETE' });
      setNotice(`${share.user.name} no longer has access.`);
    } catch (err) {
      apply(previous);
      setError(err instanceof ApiClientError ? err.message : 'Could not remove access.');
    }
  }

  const alreadyShared = new Set((shares ?? []).map((s) => s.user.id));
  const suggestions = people.filter((p) => !alreadyShared.has(p.id));

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <h2 id="share-title">Share document</h2>
        <p className="dialog-sub">
          People you add can open this document from their &ldquo;Shared with you&rdquo; list.
        </p>

        <form onSubmit={addShare} className="stack" style={{ gap: 9 }}>
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <div className="grow">
              <label className="label" htmlFor="share-email">
                Email address
              </label>
              <input
                id="share-email"
                className="input"
                type="email"
                required
                list="share-suggestions"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <datalist id="share-suggestions">
                {suggestions.map((p) => (
                  <option key={p.id} value={p.email}>
                    {p.name}
                  </option>
                ))}
              </datalist>
            </div>
            <div style={{ width: 122 }}>
              <label className="label" htmlFor="share-role">
                Access
              </label>
              <select
                id="share-role"
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as ShareRole)}
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ height: 36 }} disabled={busy}>
              {busy ? <span className="spinner" aria-hidden /> : null}
              Share
            </button>
          </div>
          <p className="faint" style={{ margin: 0 }}>
            This demo has no invitations — you can only share with a seeded account.
          </p>
        </form>

        {error && (
          <div className="alert alert-error" style={{ marginTop: 13 }}>
            {error}
          </div>
        )}
        {notice && !error && (
          <div className="alert" style={{ marginTop: 13 }}>
            {notice}
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <span className="label">People with access</span>

          {shares === null && <p className="muted">Loading…</p>}

          {shares?.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              Only you. Add someone above to start collaborating.
            </p>
          )}

          {shares?.map((share) => (
            <div className="dialog-row" key={share.id}>
              <Avatar user={share.user} />
              <span className="grow truncate">
                <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5 }}>
                  {share.user.name}
                </span>
                <span className="faint">{share.user.email}</span>
              </span>
              <select
                className="input"
                style={{ width: 108, height: 30, fontSize: 13 }}
                value={share.role}
                aria-label={`Access level for ${share.user.name}`}
                onChange={(e) => void changeRole(share, e.target.value as ShareRole)}
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-danger"
                aria-label={`Remove access for ${share.user.name}`}
                onClick={() => void revoke(share)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
