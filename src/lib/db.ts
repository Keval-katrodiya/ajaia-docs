/**
 * SQLite access.
 *
 * Why SQLite and not Postgres: a reviewer should be able to clone this repo and
 * have it running in two commands with no Docker daemon, no connection string
 * and no account signup. At this scope SQLite is not a compromise - it is a
 * real relational database with foreign keys, transactions and constraints.
 *
 * The escape hatch is deliberate: every query lives in a repository module
 * (users.ts / documents.ts), so swapping the driver means rewriting two files,
 * not hunting SQL across the app. See ARCHITECTURE.md.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  accent        TEXT NOT NULL DEFAULT '#5b6ee1',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,                    -- ProseMirror JSON
  preview       TEXT NOT NULL DEFAULT '',
  rev           INTEGER NOT NULL DEFAULT 1,       -- optimistic concurrency
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by    TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_owner
  ON documents(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS document_shares (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('viewer','editor')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (document_id, user_id)                   -- one row per person per doc
);

CREATE INDEX IF NOT EXISTS idx_shares_user
  ON document_shares(user_id);

-- Audit trail for file uploads. Lets the editor show "Imported from notes.md"
-- and gives us a record of what entered a document and who put it there.
CREATE TABLE IF NOT EXISTS document_imports (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  extension     TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('new','append','replace')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_imports_document
  ON document_imports(document_id, created_at DESC);
`;

export function applySchema(db: Db): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
}

export function createDatabase(file: string): Db {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  const db = new Database(file);
  applySchema(db);
  return db;
}

let instance: Db | null = null;

export function getDb(): Db {
  if (!instance) {
    instance = createDatabase(process.env.DATABASE_PATH || './data/app.db');
  }
  return instance;
}

/** Test seam. Lets each suite run against its own throwaway database file. */
export function setDatabase(db: Db | null): void {
  instance = db;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

/**
 * Full ISO-8601 with the Z suffix. SQLite's own datetime('now') returns a
 * space-separated form that Date.parse treats inconsistently across engines,
 * so every timestamp the app writes goes through here instead.
 */
export function nowIso(): string {
  return new Date().toISOString();
}
