/**
 * Seeds three demo accounts and a small set of documents that exercise every
 * sharing state a reviewer needs to see: owned-and-private, owned-and-shared,
 * shared-to-me-as-editor, and shared-to-me-as-viewer.
 *
 *   npm run seed          idempotent - safe to run repeatedly
 *   npm run seed:reset    deletes the database first
 */

import fs from 'node:fs';
import path from 'node:path';
import { getDb, setDatabase, createDatabase } from '../src/lib/db';
import { createDocument, upsertShare } from '../src/lib/documents';
import { htmlToDoc } from '../src/lib/richtext';
import { upsertUser } from '../src/lib/users';

const DB_PATH = process.env.DATABASE_PATH || './data/app.db';
const reset = process.argv.includes('--reset');

if (reset) {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = path.resolve(`${DB_PATH}${suffix}`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  console.log(`Removed ${DB_PATH}`);
}

setDatabase(createDatabase(DB_PATH));
const db = getDb();

const keval = upsertUser({ email: 'keval@ajaia.test', name: 'Keval Katrodiya', accent: '#4f5fd6' });
const priya = upsertUser({ email: 'priya@ajaia.test', name: 'Priya Sharma', accent: '#c2557a' });
const sam = upsertUser({ email: 'sam@ajaia.test', name: 'Sam Okoro', accent: '#2e8b74' });

const existing = db.prepare('SELECT COUNT(*) AS n FROM documents').get() as { n: number };

if (existing.n > 0) {
  console.log(`Users ready. ${existing.n} document(s) already present - skipping document seed.`);
  console.log('Run "npm run seed:reset" for a clean database.');
} else {
  const spec = createDocument({
    ownerId: keval.id,
    title: 'Product spec — Ajaia Docs v1',
    content: htmlToDoc(`
      <h1>Ajaia Docs v1</h1>
      <p>A lightweight collaborative editor. This document is <strong>owned by Keval</strong>
         and shared with the rest of the team, so it appears in their
         <em>Shared with you</em> list.</p>
      <h2>What shipped</h2>
      <ul>
        <li>Rich-text editing: <strong>bold</strong>, <em>italic</em>, <u>underline</u>, headings, lists</li>
        <li>Import from <code>.txt</code>, <code>.md</code> and <code>.docx</code></li>
        <li>Owner / editor / viewer sharing</li>
        <li>Autosave with conflict detection</li>
      </ul>
      <h2>What we cut</h2>
      <ol>
        <li>Real-time cursors — needs a CRDT and a websocket layer</li>
        <li>Comments and suggestion mode</li>
        <li>Images and tables</li>
      </ol>
      <blockquote>Depth in a few areas beats shallow coverage everywhere.</blockquote>
    `),
  });
  upsertShare({ documentId: spec.id, userId: priya.id, role: 'editor' });
  upsertShare({ documentId: spec.id, userId: sam.id, role: 'viewer' });

  const notes = createDocument({
    ownerId: priya.id,
    title: 'Design review notes',
    content: htmlToDoc(`
      <h2>Design review — 21 Aug</h2>
      <p>Owned by <strong>Priya</strong>, shared with Keval as an <u>editor</u>.
         Sign in as Keval and you can change this text.</p>
      <ul>
        <li>Toolbar should stay pinned while scrolling</li>
        <li>Save state needs to be visible without hunting for it</li>
        <li>Empty state should explain what to do, not just say "no documents"</li>
      </ul>
    `),
  });
  upsertShare({ documentId: notes.id, userId: keval.id, role: 'editor' });

  const roadmap = createDocument({
    ownerId: sam.id,
    title: 'Q3 roadmap (read-only)',
    content: htmlToDoc(`
      <h2>Q3 roadmap</h2>
      <p>Owned by <strong>Sam</strong> and shared with Keval as a <em>viewer</em>.
         Open it as Keval: the toolbar is disabled and the header says "View only".</p>
      <ol>
        <li>Version history</li>
        <li>Comments</li>
        <li>Real-time presence</li>
      </ol>
    `),
  });
  upsertShare({ documentId: roadmap.id, userId: keval.id, role: 'viewer' });

  createDocument({
    ownerId: keval.id,
    title: 'Private scratchpad',
    content: htmlToDoc(
      `<p>Owned by Keval and shared with nobody. It should never appear for Priya or Sam.</p>`,
    ),
  });

  console.log('Seeded 4 documents with 4 shares.');
}

console.log('\nDemo accounts (no passwords - pick one on the sign-in screen):');
for (const user of [keval, priya, sam]) {
  console.log(`  ${user.name.padEnd(18)} ${user.email}`);
}
console.log(`\nDatabase: ${path.resolve(DB_PATH)}`);
