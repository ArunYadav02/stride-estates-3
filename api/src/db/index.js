// ---------------------------------------------------------------------------
// Database access.
//
// v0.1 runs on SQLite through node:sqlite — built into Node 22, so there is
// nothing to install and nothing to configure. Queries are written with `?`
// placeholders and plain SQL, so the same query layer works against Postgres
// when you outgrow a single file (see README, "Moving to Postgres").
// ---------------------------------------------------------------------------

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(process.cwd(), config.databaseFile);

mkdirSync(dirname(file), { recursive: true });

const database = new DatabaseSync(file);
database.exec('PRAGMA foreign_keys = ON');
database.exec('PRAGMA journal_mode = WAL');

// Columns added to existing tables after the first release. CREATE TABLE IF NOT
// EXISTS will not add them to a database that already exists, so they are
// applied separately and idempotently. Small, boring, and the reason nobody has
// to delete their data to take an update.
const ADDED_COLUMNS = [
  ['properties', 'tenure', 'TEXT'],
  ['properties', 'council_tax_band', 'TEXT'],
  ['properties', 'material_info', "TEXT NOT NULL DEFAULT '{}'"],
];

// Tables whose shape changed before they ever carried real data. CREATE TABLE
// IF NOT EXISTS will not reshape an existing table, so if the marker column is
// missing the table is dropped and rebuilt from the schema. Children first.
const REBUILD_IF_MISSING = [
  ['chain_links', 'agreed_on'],
  ['chains', 'name'],
];

/** Run the schema, then apply any later column additions. */
export function migrate() {
  REBUILD_IF_MISSING.forEach(([table, marker]) => {
    const existing = database.prepare(`PRAGMA table_info(${table})`).all();
    if (existing.length && !existing.some((row) => row.name === marker)) {
      database.exec(`DROP TABLE ${table}`);
      console.log(`[db] rebuilt ${table} (schema changed before release)`);
    }
  });

  const sql = readFileSync(resolve(here, 'schema.sql'), 'utf8');
  database.exec(sql);

  ADDED_COLUMNS.forEach(([table, column, definition]) => {
    const existing = database.prepare(`PRAGMA table_info(${table})`).all();
    if (!existing.length) return;                       // table not created yet
    if (existing.some((row) => row.name === column)) return;  // already there
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[db] added ${table}.${column}`);
  });
}

/** Rows as plain objects. */
export function all(sql, params = []) {
  return database.prepare(sql).all(...params).map((row) => ({ ...row }));
}

/** First row, or undefined. */
export function get(sql, params = []) {
  const row = database.prepare(sql).get(...params);
  return row ? { ...row } : undefined;
}

/** Insert/update/delete. */
export function run(sql, params = []) {
  return database.prepare(sql).run(...params);
}

/** Wrap several writes so a half-finished change never lands. */
export function transaction(fn) {
  database.exec('BEGIN');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export const db = { all, get, run, transaction, migrate, raw: database, file };
