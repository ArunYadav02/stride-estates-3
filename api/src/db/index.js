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

/** Run the schema. Safe to call repeatedly — every statement is IF NOT EXISTS. */
export function migrate() {
  const sql = readFileSync(resolve(here, 'schema.sql'), 'utf8');
  database.exec(sql);
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
