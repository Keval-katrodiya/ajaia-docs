import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, setDatabase, type Db } from '@/lib/db';
import {
  createDocument,
  deleteDocument,
  getAcl,
  getDocumentRow,
  listForUser,
  listImports,
  listShares,
  parseContent,
  recordImport,
  removeShare,
  updateDocument,
  upsertShare,
} from '@/lib/documents';
import { canEdit, canView } from '@/lib/permissions';
import { htmlToDoc, plainTextToDoc } from '@/lib/richtext';
import { createUser } from '@/lib/users';

/**
 * Storage + sharing behaviour, against a real (in-memory) SQLite database
 * rather than a mock. Mocking the repository here would only test that the
 * mock behaves like the mock; the interesting failures are in the SQL.
 */

let db: Db;
let alice: ReturnType<typeof createUser>;
let bob: ReturnType<typeof createUser>;
let carol: ReturnType<typeof createUser>;

beforeEach(() => {
  db = createDatabase(':memory:');
  setDatabase(db);
  alice = createUser({ email: 'alice@test.dev', name: 'Alice Owner' });
  bob = createUser({ email: 'bob@test.dev', name: 'Bob Editor' });
  carol = createUser({ email: 'carol@test.dev', name: 'Carol Viewer' });
});

afterEach(() => {
  setDatabase(null);
  db.close();
});

describe('persistence', () => {
  it('stores and reads back rich-text structure, not flattened text', () => {
    const doc = createDocument({
      ownerId: alice.id,
      title: 'Formatted',
      content: htmlToDoc('<h2>Heading</h2><ul><li><strong>bold item</strong></li></ul>'),
    });

    const reloaded = parseContent(getDocumentRow(doc.id)!);
    expect(reloaded.content[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
    expect(reloaded.content[1].content?.[0].content?.[0].content?.[0].marks).toEqual([
      { type: 'bold' },
    ]);
  });

  it('generates a text preview for the document list', () => {
    const doc = createDocument({
      ownerId: alice.id,
      title: 'Preview',
      content: plainTextToDoc('The quick brown fox jumps.'),
    });
    expect(getDocumentRow(doc.id)!.preview).toBe('The quick brown fox jumps.');
  });

  it('opens a document with corrupt content instead of throwing', () => {
    const doc = createDocument({ ownerId: alice.id, title: 'Broken' });
    db.prepare('UPDATE documents SET content = ? WHERE id = ?').run('{not json', doc.id);

    const content = parseContent(getDocumentRow(doc.id)!);
    expect(content.type).toBe('doc');
    expect(content.content).toHaveLength(1);
  });
});

describe('sharing', () => {
  it('separates owned documents from shared ones for each user', () => {
    const owned = createDocument({ ownerId: alice.id, title: 'Alice doc' });
    const other = createDocument({ ownerId: bob.id, title: 'Bob doc' });
    upsertShare({ documentId: other.id, userId: alice.id, role: 'viewer' });

    const forAlice = listForUser(alice.id);
    expect(forAlice.owned.map((d) => d.id)).toEqual([owned.id]);
    expect(forAlice.shared.map((d) => d.id)).toEqual([other.id]);
    expect(forAlice.shared[0].role).toBe('viewer');
    expect(forAlice.shared[0].owner.name).toBe('Bob Editor');

    // Carol was not involved at all and sees nothing.
    const forCarol = listForUser(carol.id);
    expect(forCarol.owned).toHaveLength(0);
    expect(forCarol.shared).toHaveLength(0);
  });

  it('reports how many people a document is shared with', () => {
    const doc = createDocument({ ownerId: alice.id, title: 'Team doc' });
    upsertShare({ documentId: doc.id, userId: bob.id, role: 'editor' });
    upsertShare({ documentId: doc.id, userId: carol.id, role: 'viewer' });

    expect(listForUser(alice.id).owned[0].shareCount).toBe(2);
  });

  it('drives the access rules the API enforces', () => {
    const doc = createDocument({ ownerId: alice.id, title: 'Doc' });
    upsertShare({ documentId: doc.id, userId: bob.id, role: 'editor' });
    upsertShare({ documentId: doc.id, userId: carol.id, role: 'viewer' });

    const acl = getAcl(doc.id)!;
    expect(canEdit(acl, bob.id)).toBe(true);
    expect(canEdit(acl, carol.id)).toBe(false);
    expect(canView(acl, carol.id)).toBe(true);
  });

  it('treats re-sharing as a role change rather than a duplicate', () => {
    const doc = createDocument({ ownerId: alice.id, title: 'Doc' });
    upsertShare({ documentId: doc.id, userId: bob.id, role: 'viewer' });
    upsertShare({ documentId: doc.id, userId: bob.id, role: 'editor' });

    const shares = listShares(doc.id);
    expect(shares).toHaveLength(1);
    expect(shares[0].role).toBe('editor');
  });

  it('revokes access, and refuses to revoke a share on a different document', () => {
    const doc = createDocument({ ownerId: alice.id, title: 'Doc' });
    const decoy = createDocument({ ownerId: alice.id, title: 'Decoy' });
    const share = upsertShare({ documentId: doc.id, userId: bob.id, role: 'editor' });

    // The share id alone is not enough - it must belong to the document in
    // the URL, or one owner could delete another document's shares.
    expect(removeShare(decoy.id, share.id)).toBe(false);
    expect(removeShare(doc.id, share.id)).toBe(true);
    expect(listForUser(bob.id).shared).toHaveLength(0);
  });

  it('removes shares when the document is deleted', () => {
    const doc = createDocument({ ownerId: alice.id, title: 'Doc' });
    upsertShare({ documentId: doc.id, userId: bob.id, role: 'editor' });

    deleteDocument(doc.id);

    expect(getDocumentRow(doc.id)).toBeNull();
    expect(listForUser(bob.id).shared).toHaveLength(0);
  });
});

describe('concurrent editing', () => {
  it('accepts a save from the revision the client actually loaded', () => {
    const doc = createDocument({ ownerId: alice.id, title: 'Doc' });

    const result = updateDocument({
      id: doc.id,
      userId: alice.id,
      content: plainTextToDoc('first edit'),
      baseRev: doc.rev,
    });

    expect(result.status).toBe('ok');
    expect(result.status === 'ok' && result.row.rev).toBe(doc.rev + 1);
  });

  it('rejects a save built on a stale revision instead of overwriting', () => {
    const doc = createDocument({ ownerId: alice.id, title: 'Doc' });

    // Bob saves first...
    updateDocument({
      id: doc.id,
      userId: bob.id,
      content: plainTextToDoc('bob was here'),
      baseRev: doc.rev,
    });

    // ...then Alice saves from the version she loaded before Bob's write.
    const stale = updateDocument({
      id: doc.id,
      userId: alice.id,
      content: plainTextToDoc('alice overwrites'),
      baseRev: doc.rev,
    });

    expect(stale.status).toBe('conflict');
    expect(stale.status === 'conflict' && stale.currentRev).toBe(doc.rev + 1);
    // Bob's work is still there. This is the whole point.
    expect(parseContent(getDocumentRow(doc.id)!)).toEqual(plainTextToDoc('bob was here'));
  });

  it('does not let a rename invalidate an in-flight content save', () => {
    const doc = createDocument({ ownerId: alice.id, title: 'Old title' });

    updateDocument({ id: doc.id, userId: bob.id, title: 'New title' });

    const save = updateDocument({
      id: doc.id,
      userId: alice.id,
      content: plainTextToDoc('body'),
      baseRev: doc.rev,
    });

    expect(save.status).toBe('ok');
    expect(getDocumentRow(doc.id)!.title).toBe('New title');
  });

  it('reports not_found for a document deleted mid-edit', () => {
    const doc = createDocument({ ownerId: alice.id, title: 'Doc' });
    deleteDocument(doc.id);

    expect(updateDocument({ id: doc.id, userId: alice.id, title: 'x' }).status).toBe('not_found');
  });
});

describe('import audit', () => {
  it('keeps a record of what was uploaded into a document', () => {
    const doc = createDocument({ ownerId: alice.id, title: 'Doc' });
    recordImport({
      documentId: doc.id,
      userId: alice.id,
      filename: 'notes.md',
      extension: '.md',
      bytes: 512,
      mode: 'append',
    });

    const [entry] = listImports(doc.id);
    expect(entry).toMatchObject({ filename: 'notes.md', mode: 'append', userName: 'Alice Owner' });
  });
});
