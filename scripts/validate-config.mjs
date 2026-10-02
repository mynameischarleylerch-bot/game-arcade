#!/usr/bin/env node
// Fails loudly on a malformed games.config.json. Wired to npm test in Task 6.
import { readFile } from 'node:fs/promises';
import { validateConfig } from '../src/config.js';

const path = new URL('../games.config.json', import.meta.url);
const config = JSON.parse(await readFile(path, 'utf8'));
const { ok, errors } = validateConfig(config);

if (!ok) {
  console.error('games.config.json is invalid:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`games.config.json OK: ${config.games.length} game(s)`);