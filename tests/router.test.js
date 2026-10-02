import test from 'node:test';
import assert from 'node:assert/strict';
import { gameSlugFromSearch, playerUrlFor, backUrl } from '../src/router.js';

test('reads the slug from a query string', () => {
  assert.equal(gameSlugFromSearch('?game=demo-snake'), 'demo-snake');
  assert.equal(gameSlugFromSearch('?foo=1&game=blocks'), 'blocks');
});

test('returns null when absent or empty', () => {
  assert.equal(gameSlugFromSearch(''), null);
  assert.equal(gameSlugFromSearch('?game='), null);
  assert.equal(gameSlugFromSearch('?other=1'), null);
});

test('returns null for a malformed slug instead of throwing', () => {
  assert.equal(gameSlugFromSearch('?game=../../etc/passwd'), null);
  assert.equal(gameSlugFromSearch('?game=UPPER'), null);
});

test('playerUrlFor percent-encodes the slug', () => {
  assert.equal(playerUrlFor('a b'), './play.html?game=a%20b');
});

test('backUrl returns to the relative index', () => {
  assert.equal(backUrl(), './index.html');
});