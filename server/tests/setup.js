/**
 * Import this FIRST in every test file that touches config, the store or the app.
 *
 * It points storage at a throwaway temp directory. Without it, the store's
 * debounced persist() writes the tests' fixtures over the developer's real
 * storage/db.json, wiping their orders.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fotoin-test-'));

process.on('exit', () => {
  fs.rmSync(process.env.STORAGE_DIR, { recursive: true, force: true });
});
