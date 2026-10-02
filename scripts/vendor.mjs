#!/usr/bin/env node
/**
 * Copy a game's built files into this repo so the player can iframe it same-origin.
 *
 *   node scripts/vendor.mjs <slug> <source-dir>
 *
 * <slug> must already exist in games.config.json; the entry's playUrl is
 * rewritten to ./vendor/<slug>/index.html and the config is rewritten in place.
 */
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findBySlug } from '../src/config.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONFIG_PATH = path.join(REPO_ROOT, 'games.config.json');
const VENDOR_ROOT = path.join(REPO_ROOT, 'vendor');
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function vendorTargetFor(slug) {
  if (!SLUG_PATTERN.test(slug ?? '')) {
    throw new Error(`Invalid slug "${slug}" — must be lowercase kebab-case (a-z, 0-9, dashes).`);
  }
  return `./vendor/${slug}/index.html`;
}

export function vendorEntryFor(game) {
  return { ...game, playUrl: vendorTargetFor(game.slug) };
}

async function exists(target) {
  return access(target).then(() => true, () => false);
}

async function main() {
  const [slug, sourceDir] = process.argv.slice(2);
  if (!slug || !sourceDir) {
    console.error('Usage: node scripts/vendor.mjs <slug> <source-dir>');
    process.exit(1);
  }
  const target = vendorTargetFor(slug); // validates before anything touches disk

  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const game = findBySlug(config, slug);
  if (!game) {
    console.error(`No game with slug "${slug}" in games.config.json. Add the entry first.`);
    process.exit(1);
  }

  const source = path.resolve(sourceDir);
  const indexHtml = path.join(source, 'index.html');
  if (!(await exists(indexHtml))) {
    console.error(`No index.html in ${source}. Point at the game's BUILT output, not its source dir.`);
    process.exit(1);
  }

  const destination = path.join(VENDOR_ROOT, slug);
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true });

  const updated = {
    ...config,
    games: config.games.map((entry) => (entry.slug === slug ? vendorEntryFor(entry) : entry)),
  };
  await writeFile(CONFIG_PATH, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');

  console.log(`Vendored ${slug}: ${source} -> vendor/${slug}`);
  console.log(`games.config.json playUrl is now ${target}`);
}

// pathToFileURL (not string surgery) so the comparison holds on Windows too.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}