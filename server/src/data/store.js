/**
 * Tiny JSON-file-backed store.
 *
 * Deliberately dependency-free so the project runs with `npm install` and no
 * database daemon. The surface (findAll / findById / insert / update) is the
 * same shape a Prisma/Postgres repository would expose, so swapping this out
 * later touches only this file. See docs/ARCHITECTURE.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/env.js';

const EMPTY_DB = { orders: [], reviews: [], messages: [] };

let db = null;
let writeScheduled = false;

const ensureStorageDirs = () => {
  for (const dir of [config.paths.storage, config.paths.uploads, config.paths.results]) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const load = () => {
  if (db) return db;
  ensureStorageDirs();
  try {
    const raw = fs.readFileSync(config.paths.db, 'utf8');
    db = { ...EMPTY_DB, ...JSON.parse(raw) };
  } catch {
    db = structuredClone(EMPTY_DB);
  }
  return db;
};

/** Debounced write: many mutations per request collapse into one flush. */
const persist = () => {
  if (writeScheduled) return;
  writeScheduled = true;
  setTimeout(() => {
    writeScheduled = false;
    try {
      const tmp = `${config.paths.db}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, config.paths.db);
    } catch (error) {
      console.error('[store] failed to persist db:', error.message);
    }
  }, 50).unref?.();
};

export const collection = (name) => ({
  all() {
    return load()[name];
  },
  findById(id) {
    return load()[name].find((row) => row.id === id) || null;
  },
  find(predicate) {
    return load()[name].filter(predicate);
  },
  findOne(predicate) {
    return load()[name].find(predicate) || null;
  },
  insert(row) {
    load()[name].push(row);
    persist();
    return row;
  },
  update(id, patch) {
    const rows = load()[name];
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) return null;
    rows[index] = { ...rows[index], ...patch, updatedAt: new Date().toISOString() };
    persist();
    return rows[index];
  },
  remove(id) {
    const rows = load()[name];
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) return false;
    rows.splice(index, 1);
    persist();
    return true;
  },
});

export const orders = collection('orders');
export const messages = collection('messages');

/** Test helper: wipes in-memory state without touching the on-disk file. */
export const __resetForTests = () => {
  db = structuredClone(EMPTY_DB);
};

export default { orders, messages, collection };
