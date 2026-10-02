import test from 'node:test';
import assert from 'node:assert/strict';
import { vendorTargetFor, vendorEntryFor } from '../scripts/vendor.mjs';

test('vendorTargetFor nests the build under vendor/<slug>/', () => {
  assert.equal(vendorTargetFor('demo-snake'), './vendor/demo-snake/index.html');
});

test('vendorTargetFor refuses a slug that escapes vendor/', () => {
  assert.throws(() => vendorTargetFor('../../evil'), /kebab-case/);
  assert.throws(() => vendorTargetFor('Demo_Snake'), /kebab-case/);
});

test('vendorEntryFor rewrites playUrl and keeps everything else', () => {
  const game = {
    slug: 'demo-snake', title: 'Demo Snake', playUrl: 'https://karin.github.io/snake/',
    cover: './assets/covers/demo-snake.svg', tags: ['arcade'], controls: 'Arrows',
    year: 2026, summary: 'x', repoUrl: 'https://github.com/karin/demo-snake', featured: true,
  };
  assert.deepEqual(vendorEntryFor(game), { ...game, playUrl: './vendor/demo-snake/index.html' });
});