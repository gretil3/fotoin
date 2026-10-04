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
// Tests never call a paid or networked service, even when the developer's .env
// switches the refiner or the image step to an AI provider (dotenv does not
// override these). Tests of a real provider inject a fake one instead.
process.env.REFINER_PROVIDER = 'rules';
process.env.IMAGE_PROVIDER = 'mock';

process.on('exit', () => {
  fs.rmSync(process.env.STORAGE_DIR, { recursive: true, force: true });
});
