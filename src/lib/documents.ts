/**
 * Document + sharing repository. All SQL for the product lives here and in
 * users.ts; nothing above this layer knows the storage engine.
 */

import { getDb, newId, nowIso } from './db';
import type { AccessRole, DocumentAcl, ShareRole } from './permissions';
import { emptyDoc, previewOf, type PmDoc } from './richtext';
import type { User } from './types';

export interface DocumentRow {
  id: string;
  owner_id: string;
  title: string;
  content: string;
  preview: string;
  rev: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface DocumentSummary {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  rev: number;
  owner: Pick<User, 'id' | 'name' | 'email' | 'accent'>;
  role: AccessRole;
  shareCount: number;
}

export interface ShareEntry {
  id: string;
  role: ShareRole;
  createdAt: string;
  user: User;
}

export interface ImportEntry {
  id: string;
  filename: string;
  extension: string;
  bytes: number;
  mode: 'new' | 'append' | 'replace';
  createdAt: string;
  userName: string;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export function getDocumentRow(id: string): DocumentRow | null {
  return (getDb().prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocumentRow | undefined) ?? null;
}

/**
 * Loads only what the permission layer needs. Kept separate from the full
 * document read so an access check never has to pull a megabyte of content.
 */
export function getAcl(documentId: string): DocumentAcl | null {
  const row = getDb()
    .prepare('SELECT owner_id FROM documents WHERE id = ?')
    .get(documentId) as { owner_id: string } | undefined;
  if (!row) return null;

  const shares = getDb()
    .prepare('SELECT user_id AS userId, role FROM document_shares WHERE document_id = ?')
    .all(documentId) as Array<{ userId: string; role: ShareRole }>;

  return { ownerId: row.owner_id, shares };
}

export function parseContent(row: DocumentRow): PmDoc {
  try {
    return JSON.parse(row.content) as PmDoc;
  } catch {
    // A corrupt row should not brick the editor - open it empty and let the
    // user re-import rather than throwing a 500 they cannot act on.
    console.error(`[documents] unparseable content for ${row.id}`);
    return emptyDoc();
  }
}

export function listForUser(userId: string): { owned: DocumentSummary[]; shared: DocumentSummary[] } {
  const db = getDb();

  const owned = db
    .prepare(
      `SELECT d.id, d.title, d.preview, d.updated_at, d.rev,
              u.id AS owner_id, u.name AS owner_name, u.email AS owner_email, u.accent AS owner_accent,
              (SELECT COUNT(*) FROM document_shares s WHERE s.document_id = d.id) AS share_count
         FROM documents d
         JOIN users u ON u.id = d.owner_id
        WHERE d.owner_id = ?
        ORDER BY d.updated_at DESC`,
    )
    .all(userId) as RawSummary[];

  const shared = db
    .prepare(
      `SELECT d.id, d.title, d.preview, d.updated_at, d.rev, s.role,
              u.id AS owner_id, u.name AS owner_name, u.email AS owner_email, u.accent AS owner_accent,
              0 AS share_count
         FROM documents d
         JOIN document_shares s ON s.document_id = d.id
         JOIN users u ON u.id = d.owner_id
        WHERE s.user_id = ?
        ORDER BY d.updated_at DESC`,
    )
    .all(userId) as RawSummary[];

  return {
    owned: owned.map((r) => toSummary(r, 'owner')),
    shared: shared.map((r) => toSummary(r, (r.role as ShareRole) ?? 'viewer')),
  };
}

interface RawSummary {
  id: string;
  title: string;
  preview: string;
  updated_at: string;
  rev: number;
  role?: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  owner_accent: string;
  share_count: number;
}

function toSummary(row: RawSummary, role: AccessRole): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    preview: row.preview,
    updatedAt: row.updated_at,
    rev: row.rev,
    role,
    shareCount: row.share_count,
    owner: {
      id: row.owner_id,
      name: row.owner_name,
      email: row.owner_email,
      accent: row.owner_accent,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export function createDocument(input: {
  ownerId: string;
  title: string;
  content?: PmDoc;
}): DocumentRow {
  const content = input.content ?? emptyDoc();
  const id = newId('doc');
  const at = nowIso();

  getDb()
    .prepare(
      `INSERT INTO documents (id, owner_id, title, content, preview, rev, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    .run(id, input.ownerId, input.title, JSON.stringify(content), previewOf(content), at, at, input.ownerId);

  return getDocumentRow(id)!;
}

export type UpdateResult =
  | { status: 'ok'; row: DocumentRow }
  | { status: 'not_found' }
  | { status: 'conflict'; currentRev: number };

/**
 * Content saves are guarded by `baseRev`: if another editor has saved since
 * this client loaded, the UPDATE matches zero rows and we report a conflict
 * instead of silently discarding their work.
 *
 * Renames are not rev-guarded on purpose. Two people renaming the same document
 * in the same second is a last-write-wins situation with no data loss, and
 * making a rename invalidate an in-flight content save would be worse.
 */
export function updateDocument(input: {
  id: string;
  userId: string;
  title?: string;
  content?: PmDoc;
  baseRev?: number;
}): UpdateResult {
  const db = getDb();

  const apply = db.transaction((): UpdateResult => {
    const existing = getDocumentRow(input.id);
    if (!existing) return { status: 'not_found' };

    const at = nowIso();

    if (input.content !== undefined) {
      const baseRev = input.baseRev ?? existing.rev;
      const result = db
        .prepare(
          `UPDATE documents
              SET content = ?, preview = ?, rev = rev + 1, updated_at = ?, updated_by = ?
            WHERE id = ? AND rev = ?`,
        )
        .run(
          JSON.stringify(input.content),
          previewOf(input.content),
          at,
          input.userId,
          input.id,
          baseRev,
        );

      if (result.changes === 0) {
        const current = getDocumentRow(input.id);
        return { status: 'conflict', currentRev: current?.rev ?? existing.rev };
      }
    }

    if (input.title !== undefined) {
      db.prepare('UPDATE documents SET title = ?, updated_at = ?, updated_by = ? WHERE id = ?')
        .run(input.title, at, input.userId, input.id);
    }

    return { status: 'ok', row: getDocumentRow(input.id)! };
  });

  return apply();
}

export function deleteDocument(id: string): void {
  getDb().prepare('DELETE FROM documents WHERE id = ?').run(id);
}

/* -------------------------------------------------------------------------- */
/* Sharing                                                                     */
/* -------------------------------------------------------------------------- */

export function listShares(documentId: string): ShareEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.role, s.created_at, u.id AS user_id, u.email, u.name, u.accent
         FROM document_shares s
         JOIN users u ON u.id = s.user_id
        WHERE s.document_id = ?
        ORDER BY u.name`,
    )
    .all(documentId) as Array<{
    id: string;
    role: ShareRole;
    created_at: string;
    user_id: string;
    email: string;
    name: string;
    accent: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    createdAt: r.created_at,
    user: { id: r.user_id, email: r.email, name: r.name, accent: r.accent },
  }));
}

/**
 * Idempotent by design: re-sharing with a different role updates the existing
 * row rather than failing on the UNIQUE constraint. Sharing twice is a normal
 * user action, not an error worth showing them.
 */
export function upsertShare(input: {
  documentId: string;
  userId: string;
  role: ShareRole;
}): ShareEntry {
  getDb()
    .prepare(
      `INSERT INTO document_shares (id, document_id, user_id, role)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
    )
    .run(newId('shr'), input.documentId, input.userId, input.role);

  const share = listShares(input.documentId).find((s) => s.user.id === input.userId);
  return share!;
}

export function removeShare(documentId: string, shareId: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM document_shares WHERE id = ? AND document_id = ?')
    .run(shareId, documentId);
  return result.changes > 0;
}

/* -------------------------------------------------------------------------- */
/* Import audit                                                                */
/* -------------------------------------------------------------------------- */

export function recordImport(input: {
  documentId: string;
  userId: string;
  filename: string;
  extension: string;
  bytes: number;
  mode: 'new' | 'append' | 'replace';
}): void {
  getDb()
    .prepare(
      `INSERT INTO document_imports (id, document_id, user_id, filename, extension, bytes, mode)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId('imp'),
      input.documentId,
      input.userId,
      input.filename,
      input.extension,
      input.bytes,
      input.mode,
    );
}

export function listImports(documentId: string): ImportEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT i.id, i.filename, i.extension, i.bytes, i.mode, i.created_at, u.name AS user_name
         FROM document_imports i
         JOIN users u ON u.id = i.user_id
        WHERE i.document_id = ?
        ORDER BY i.created_at DESC
        LIMIT 10`,
    )
    .all(documentId) as Array<{
    id: string;
    filename: string;
    extension: string;
    bytes: number;
    mode: 'new' | 'append' | 'replace';
    created_at: string;
    user_name: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    extension: r.extension,
    bytes: r.bytes,
    mode: r.mode,
    createdAt: r.created_at,
    userName: r.user_name,
  }));
}
