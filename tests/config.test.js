import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateConfig, findBySlug, filterByTag, featuredGames, allTags } from '../src/config.js';

const validGame = (over = {}) => ({
  slug: 'snake',
  title: 'Snake',
  summary: 'Arrows to steer, walls are lethal.',
  repoUrl: 'https://github.com/karin/snake',
  playUrl: './vendor/snake/index.html',
  cover: './assets/covers/snake.svg',
  tags: ['arcade', 'canvas'],
  controls: 'Arrow keys / WASD',
  year: 2026,
  featured: false,
  ...over,
});

test('accepts a well-formed config', () => {
  const res = validateConfig({ version: 1, games: [validGame()] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
});

test('rejects a missing required key', () => {
  const bad = validGame();
  delete bad.playUrl;
  const res = validateConfig({ version: 1, games: [bad] });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('games[0].playUrl') && e.includes('missing')));
});

test('rejects a non-kebab-case slug', () => {
  const res = validateConfig({ version: 1, games: [validGame({ slug: 'Snake_Game' })] });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('slug')));
});

test('rejects a duplicate slug', () => {
  const res = validateConfig({ version: 1, games: [validGame(), validGame()] });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('duplicate slug')));
});

test('rejects asset paths that are not ./ or https://', () => {
  for (const playUrl of ['/vendor/snake/index.html', 'javascript:alert(1)', 'vendor/snake']) {
    const res = validateConfig({ version: 1, games: [validGame({ playUrl })] });
    assert.equal(res.ok, false, `expected ${playUrl} to be rejected`);
    assert.ok(res.errors.some((e) => e.includes('playUrl')));
  }
});

test('findBySlug returns the game or null', () => {
  const config = { games: [validGame()] };
  assert.equal(findBySlug(config, 'snake').title, 'Snake');
  assert.equal(findBySlug(config, 'nope'), null);
});

test('filterByTag is case-insensitive and returns everything for no tag', () => {
  const config = { games: [validGame(), validGame({ slug: 'blocks', tags: ['puzzle'] })] };
  assert.equal(filterByTag(config, '').length, 2);
  assert.deepEqual(filterByTag(config, 'ARCADE').map((g) => g.slug), ['snake']);
  assert.deepEqual(filterByTag(config, 'puzzle').map((g) => g.slug), ['blocks']);
});

test('featuredGames and allTags', () => {
  const config = {
    games: [validGame({ featured: true }), validGame({ slug: 'blocks', tags: ['puzzle', 'arcade'] })],
  };
  assert.deepEqual(featuredGames(config).map((g) => g.slug), ['snake']);
  // validGame's default tags are ['arcade', 'canvas']; this one overrides them with ['puzzle', 'arcade'],
  // so the union across both games is arcade + canvas + puzzle.
  assert.deepEqual(allTags(config), ['arcade', 'canvas', 'puzzle']);
});

test('tolerates a missing or empty games array', () => {
  assert.deepEqual(findBySlug({}, 'x'), null);
  assert.deepEqual(allTags({}), []);
  assert.deepEqual(validateConfig({ version: 1, games: [] }).errors, []);
});

test('the README does not send people to a path that no longer exists', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  // The repo is now a GitHub *user site*, served from the bare host. The old
  // "https://<user>.github.io/game-arcade/" form is a 404.
  assert.equal(/github\.io\/game-arcade\//.test(readme), false,
    'README still points at the old /game-arcade/ path');
  assert.match(readme, /mynameischarleylerch-bot\.github\.io\//,
    'README should state the real address');
});

test('block blast is registered and points at a real game directory', async () => {
  const config = JSON.parse(
    await readFile(new URL('../games.config.json', import.meta.url), 'utf8'),
  );
  const game = config.games.find((g) => g.slug === 'block-blast');
  assert.ok(game, 'block-blast is missing from games.config.json');
  assert.equal(game.playUrl, './vendor/block-blast/index.html');
  assert.equal(game.cover, './assets/covers/block-blast.svg');
  // A slug must be lowercase kebab-case (src/config.js enforces this).
  assert.match(game.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  // Path keys must be relative or an absolute URL, never bare.
  for (const key of ['playUrl', 'cover']) {
    assert.match(game[key], /^(\.\/|https:\/\/)/);
  }
});
