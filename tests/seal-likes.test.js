import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLikes, saveLikes, toggleLike, likeCount } from '../vendor/seal-scroller/likes.js';

/** Minimal in-memory stand-in for localStorage. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    get data() { return data; },
  };
}

test('starts with no likes', () => {
  assert.deepEqual([...loadLikes(fakeStorage())], []);
});

test('round-trips likes through storage', () => {
  const store = fakeStorage();
  saveLikes(store, new Set([0, 3, 7]));
  assert.deepEqual([...loadLikes(store)].sort((a, b) => a - b), [0, 3, 7]);
});

test('toggle adds then removes', () => {
  let likes = new Set();
  likes = toggleLike(likes, 2);
  assert.equal(likes.has(2), true);
  likes = toggleLike(likes, 2);
  assert.equal(likes.has(2), false);
});

test('toggle returns a new set and does not mutate the old one', () => {
  const original = new Set([1]);
  const next = toggleLike(original, 5);
  assert.equal(original.has(5), false);
  assert.equal(next.has(5), true);
  assert.equal(next.has(1), true);
});

test('likeCount counts liked seals', () => {
  assert.equal(likeCount(new Set()), 0);
  assert.equal(likeCount(new Set([1, 2, 3])), 3);
});

test('corrupt storage degrades to no likes instead of throwing', () => {
  const store = fakeStorage({ 'seal-scroller-likes': 'not json' });
  assert.deepEqual([...loadLikes(store)], []);
});

test('non-integer junk in storage is discarded', () => {
  const store = fakeStorage({ 'seal-scroller-likes': '[1,"two",null,4]' });
  assert.deepEqual([...loadLikes(store)].sort((a, b) => a - b), [1, 4]);
});

test('a storage that throws does not break liking', () => {
  const hostile = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.deepEqual([...loadLikes(hostile)], []);
  assert.doesNotThrow(() => saveLikes(hostile, new Set([1])));
  assert.equal(likeCount(toggleLike(new Set(), 1)), 1);
});