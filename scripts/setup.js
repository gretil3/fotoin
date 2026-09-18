#!/usr/bin/env node
/**
 * Copies each .env.example to .env where one does not already exist.
 * Existing files are never overwritten.
 *
 *   npm run setup
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = ['server', 'web'];

console.log('\nFOTOIN setup\n');

for (const workspace of targets) {
  const example = path.join(root, workspace, '.env.example');
  const target = path.join(root, workspace, '.env');

  if (!fs.existsSync(example)) {
    console.log(`  skip   ${workspace}/.env.example not found`);
    continue;
  }
  if (fs.existsSync(target)) {
    console.log(`  keep   ${workspace}/.env already exists`);
    continue;
  }
  fs.copyFileSync(example, target);
  console.log(`  create ${workspace}/.env`);
}

for (const dir of ['server/storage/uploads', 'server/storage/results']) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
}

console.log('\nReady. Run "npm run dev" to start the API and the web app.\n');
