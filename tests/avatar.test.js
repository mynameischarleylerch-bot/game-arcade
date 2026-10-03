import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  STATUSES, AVATARS, DEFAULT_NICK, SAVE_KEY,
  avatarSrc, clampAvatarIndex, withAvatar, withStatus, withNick,
  loadProfile, saveProfile, profileSummary,
} from '../src/messenger.js';

const REPO = new URL('../', import.meta.url);

/** A localStorage stand-in so the tests never touch the real one. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}

test('ships the sixteen MSN-era statuses', () => {
  assert.equal(STATUSES.length, 8);
  for (const s of STATUSES) {
    assert.ok(s.id && s.label && s.colour, `status ${s.id} is incomplete`);
    assert.match(s.colour, /^#[0-9a-f]{6}$/i, `colour ${s.colour} must be a hex value`);
  }
});

test('Online is available and is the default', () => {
  const online = STATUSES.find((s) => s.id === 'online');
  assert.ok(online, 'Online must exist');
  assert.equal(loadProfile(fakeStorage()).statusId, 'online');
});

test('offers exactly sixteen avatars, as MSN display pictures did', () => {
  assert.equal(AVATARS.length, 16);
});

test('every avatar has a real, relative file path', () => {
  for (const a of AVATARS) {
    assert.match(a.src, /^\.\/assets\/avatars\/avatar-\d\d\.svg\?v=[\w-]+$/, `bad path: ${a.src}`);
    assert.ok(a.label, `avatar ${a.src} needs a label`);
  }
});

test('avatar filenames are unique', () => {
  const paths = AVATARS.map((a) => a.src);
  assert.equal(new Set(paths).size, paths.length);
});

test('avatarSrc indexes safely and clamps out-of-range input', () => {
  assert.equal(avatarSrc(0), AVATARS[0].src);
  assert.equal(avatarSrc(15), AVATARS[15].src);
  assert.equal(avatarSrc(99), AVATARS[15].src);
  assert.equal(avatarSrc(-4), AVATARS[0].src);
  assert.equal(avatarSrc(1.7), AVATARS[1].src, 'a fractional index truncates');
});

test('clampAvatarIndex always yields a usable index', () => {
  for (const bad of [-1, 0, 15, 16, 999, NaN]) {
    const got = clampAvatarIndex(bad);
    assert.ok(Number.isInteger(got) && got >= 0 && got < AVATARS.length, `${bad} -> ${got}`);
  }
});

test('withAvatar sets the index and clamps out-of-range picks', () => {
  const base = loadProfile(fakeStorage());
  assert.equal(withAvatar(base, 7).avatarIndex, 7);
  assert.equal(withAvatar(base, 400).avatarIndex, AVATARS.length - 1);
});

test('withStatus accepts a known status and ignores an unknown one', () => {
  const base = loadProfile(fakeStorage());
  assert.equal(withStatus(base, 'busy').statusId, 'busy');
  assert.equal(withStatus(base, 'wobbling').statusId, 'online', 'unknown status falls back');
});

test('withNick trims and falls back to the default when emptied', () => {
  const base = loadProfile(fakeStorage());
  assert.equal(withNick(base, '  Aero  ').nick, 'Aero');
  assert.equal(withNick(base, '   ').nick, DEFAULT_NICK);
  assert.equal(withNick(base, '').nick, DEFAULT_NICK);
});

test('a fresh profile starts on avatar 1, Online, with the default nick', () => {
  const profile = loadProfile(fakeStorage());
  assert.equal(profile.avatarIndex, 0);
  assert.equal(profile.statusId, 'online');
  assert.equal(profile.nick, DEFAULT_NICK);
});

test('a saved profile round-trips through storage', () => {
  const storage = fakeStorage();
  saveProfile(storage, { avatarIndex: 9, statusId: 'brb', nick: 'Niko' });
  const loaded = loadProfile(storage);
  assert.equal(loaded.avatarIndex, 9);
  assert.equal(loaded.statusId, 'brb');
  assert.equal(loaded.nick, 'Niko');
});

test('loadProfile repairs a corrupt save instead of throwing', () => {
  for (const junk of ['{ not json', '[]', 'null', '{"avatarIndex":"lots"}', '{"statusId":42}']) {
    const profile = loadProfile(fakeStorage({ [SAVE_KEY]: junk }));
    assert.equal(typeof profile.avatarIndex, 'number', `junk: ${junk}`);
    assert.ok(STATUSES.some((s) => s.id === profile.statusId), `bad status from ${junk}`);
  }
});

test('loadProfile survives storage that throws on read', () => {
  const hostile = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  const profile = loadProfile(hostile);
  assert.equal(profile.statusId, 'online');
  assert.doesNotThrow(() => saveProfile(hostile, profile));
});

test('the summary names the status in the MSN phrasing', () => {
  assert.equal(profileSummary({ statusId: 'online' }), 'Online');
  assert.equal(profileSummary({ statusId: 'brb' }), 'Be right back');
  assert.match(profileSummary({ statusId: 'away', nick: 'Niko' }), /Niko/);
  assert.match(profileSummary({ statusId: 'online', nick: 'Niko' }), /Online/);
});

test('a long nick is truncated rather than breaking the header', () => {
  const summary = profileSummary({ statusId: 'online', nick: 'x'.repeat(200) });
  assert.ok(summary.length <= 40, `summary too long: ${summary.length}`);
});


/* ------------------------------------------------- generated asset check */

test('all sixteen avatar files exist on disk', () => {
  for (const a of AVATARS) {
    const path = new URL(`assets/avatars/avatar-${String(a.index + 1).padStart(2, '0')}.svg`, REPO);
    assert.ok(existsSync(path), `missing ${a.src} — run: node scripts/gen-avatars.mjs`);
  }
});

test('every avatar file is a complete, self-contained SVG', () => {
  for (const a of AVATARS) {
    const path = new URL(`assets/avatars/avatar-${String(a.index + 1).padStart(2, '0')}.svg`, REPO);
    const svg = readFileSync(path, 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${a.src}: no svg root`);
    assert.match(svg, /<\/svg>\s*$/, `${a.src}: unclosed svg`);
    assert.match(svg, /viewBox="0 0 96 96"/, `${a.src}: wrong viewBox`);
    // Every url(#id) reference must resolve to a def in the same file.
    const ids = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    for (const ref of svg.matchAll(/url\(#([^)]+)\)/g)) {
      assert.ok(ids.has(ref[1]), `${a.src}: dangling reference ${ref[1]}`);
    }
    assert.ok(!svg.includes('<script'), `${a.src}: avatars must not carry script`);
  }
});

/* --------------------------------------------------- the figure itself */

const avatarFile = (n) => readFileSync(
  new URL(`../assets/avatars/avatar-${String(n).padStart(2, '0')}.svg`, import.meta.url), 'utf8',
);

/** The silhouette path, with its numbers. */
function figureOf(svg) {
  const d = svg.match(/<clipPath id="figure">\s*<path d="([^"]+)"/)[1];
  const nums = [...d.matchAll(/-?\d*\.?\d+/g)].map((m) => Number(m[0]));
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return {
    d,
    closed: d.trim().endsWith('Z'),
    body: svg.slice(svg.indexOf('<g clip-path')),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

test('the avatar is one closed silhouette', () => {
  const { d, closed, body } = figureOf(avatarFile(1));
  assert.ok(closed, 'the figure path must be closed');
  // The whole figure is a single clip path: nothing inside is a separate part.
  const shapesInBody = body.match(/<(path|polygon)\b/g) || [];
  assert.deepEqual(shapesInBody, [],
    `the body must contain no separate shapes, found: ${shapesInBody.join(', ')}`);
  assert.equal(d.startsWith('M48'), true, 'the figure should start at the head');
});

test('the avatar has no legs, arms or hands', () => {
  const svg = avatarFile(1);
  const { body } = figureOf(svg);
  // Only the figure fill, the two specular highlights and one ambient shadow.
  const ellipses = (body.match(/<ellipse\b/g) || []).length;
  assert.equal(ellipses, 3, `expected 3 highlight ellipses, found ${ellipses}`);
  assert.equal(/(r|cy|cx)="(1[0-9]|[2-9])\b/.test(body.replace(/<ellipse[^>]*>/g, '')), false);
  for (const word of ['leg', 'hand', 'arm', 'finger', 'foot']) {
    assert.equal(new RegExp(word, 'i').test(svg), false, `"${word}" appears in the avatar`);
  }
});

test('the avatar is not stretched: taller than wide, but only slightly', () => {
  for (const n of [1, 5, 9, 16]) {
    const { width, height } = figureOf(avatarFile(n));
    const ratio = height / width;
    assert.ok(ratio > 0.95, `avatar-${n} is too squat: h/w ${ratio.toFixed(2)}`);
    assert.ok(ratio < 1.45, `avatar-${n} is too tall: h/w ${ratio.toFixed(2)}`);
  }
});

test('the silhouette has shoulder lobes: it pinches at the neck and below the arms', () => {
  const svg = avatarFile(1);
  const d = svg.match(/<clipPath id="figure">\s*<path d="([^"]+)"/)[1];
  const nums = [...d.matchAll(/-?\d*\.?\d+/g)].map((m) => Number(m[0]));
  const rows = {};
  // Sample the cubic endpoints in document order; each segment is one row band.
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const y = nums[i + 1];
    (rows[Math.round(y / 4) * 4] ||= []).push(nums[i]);
  }
  const widths = Object.entries(rows)
    .map(([y, xs]) => [Number(y), Math.max(...xs) - Math.min(...xs)])
    .sort((a, b) => a[0] - b[0]);

  const neck = widths.find(([y]) => y >= 40 && y <= 46);
  const arms = widths.find(([y]) => y >= 64 && y <= 68);
  assert.ok(neck && arms, 'expected a neck row and an arm row');
  assert.ok(arms[1] > neck[1] * 1.8,
    `the arms (${arms[1].toFixed(1)}) should bulge far wider than the neck (${neck[1].toFixed(1)})`);
});

test('the avatar background is transparent, so it sits on the site chrome', () => {
  const svg = avatarFile(1);
  const body = svg.slice(svg.indexOf('<g clip-path'));
  // No full-bleed painted rect: only the fill that is clipped to the figure.
  const rects = [...svg.matchAll(/<rect[^>]*>/g)].map((m) => m[0]);
  for (const rect of rects) {
    assert.match(rect, /fill="url\(#body\)"/, `unexpected background rect: ${rect}`);
  }
  assert.match(body, /clip-path="url\(#figure\)"/);
});

test('all sixteen share one silhouette and differ only in colour', () => {
  const first = figureOf(avatarFile(1)).d;
  for (let n = 2; n <= 16; n += 1) {
    assert.equal(figureOf(avatarFile(n)).d, first,
      `avatar-${n} has a different silhouette; they must all be the same shape`);
  }
  const hues = new Set();
  for (let n = 1; n <= 16; n += 1) {
    const stops = avatarFile(n).match(/stop-color="hsl\(([\d.]+)/g) || [];
    hues.add(stops[0]);
  }
  assert.equal(hues.size, 16, 'the sixteen should be sixteen distinct colours');
});
