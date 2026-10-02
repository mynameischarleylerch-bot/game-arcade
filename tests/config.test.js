import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.deepEqual(allTags(config), ['arcade', 'puzzle']);
});

test('tolerates a missing or empty games array', () => {
  assert.deepEqual(findBySlug({}, 'x'), null);
  assert.deepEqual(allTags({}), []);
  assert.deepEqual(validateConfig({ version: 1, games: [] }).errors, []);
});