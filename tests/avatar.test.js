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

/* --------------------------------------------------- the Aero orb itself */

/**
 * The avatars are the first version: a glossy Aero orb with a simple line glyph
 * (bubble, wave, leaf, sun, droplet, star, crystal, fish). Each is a round clip
 * of a gradient with one symbol, not a figure.
 */
const avatarFile = (n) => readFileSync(
  new URL(`../assets/avatars/avatar-${String(n).padStart(2, '0')}.svg`, import.meta.url), 'utf8',
);

test('every avatar is a round Aero orb, not a figure', () => {
  for (let n = 1; n <= 16; n += 1) {
    const svg = avatarFile(n);
    assert.match(svg, /<clipPath id="round"><circle cx="48" cy="48" r="48"\/><\/clipPath>/,
      `avatar-${n}: the clip must be the 48px round orb`);
    assert.match(svg, /<rect width="96" height="96" fill="url\(#sky\)"\/>/,
      `avatar-${n}: the sky gradient must fill the orb`);
    // Glyphs are drawn as strokes inside one <g fill="none">. A figure would be a
    // big *filled* path; nothing here may be filled, or it is a body again.
    const glyph = svg.match(/<g fill="none"[\s\S]*?<\/g>/);
    assert.ok(glyph, `avatar-${n}: no stroked glyph group`);
    const outside = svg.replace(glyph[0], '');
    assert.equal(/<path[^>]*fill="(?!none)/.test(outside), false,
      `avatar-${n}: a filled path outside the glyph group means a figure crept back`);
  }
});

test('every avatar carries an Aero gradient and a gloss highlight', () => {
  for (let n = 1; n <= 16; n += 1) {
    const svg = avatarFile(n);
    assert.match(svg, /<linearGradient id="sky"/, `avatar-${n}: missing the sky gradient`);
    assert.match(svg, /hsl\(\d+ 88% 78%\)/, `avatar-${n}: missing the Aero sky ramp`);
    assert.match(svg, /<radialGradient id="orb"/, `avatar-${n}: missing the glossy sphere`);
    // The specular highlight is the Aero signature.
    assert.match(svg, /<ellipse cx="34" cy="26" rx="15" ry="9"/,
      `avatar-${n}: missing the gloss highlight`);
    assert.match(svg, /#fff9c4/, `avatar-${n}: missing the sun bloom`);
  }
});

test('the sixteen glyphs vary, so the grid is not sixteen identical tiles', () => {
  const bodies = [];
  for (let n = 1; n <= 16; n += 1) {
    const svg = avatarFile(n);
    // The glyph is the stroked group; its d-data is what distinguishes them.
    const glyph = svg.match(/<g fill="none"[\s\S]*?<\/g>/);
    assert.ok(glyph, `avatar-${n}: no glyph group`);
    bodies.push(glyph[0]);
  }
  assert.ok(new Set(bodies).size >= 8,
    `expected varied glyphs, found only ${new Set(bodies).size} distinct`);
});

test('no avatar has limbs or a head-and-body figure', () => {
  for (let n = 1; n <= 16; n += 1) {
    const svg = avatarFile(n).toLowerCase();
    for (const word of ['leg', 'hand', 'arm', 'figure', 'head']) {
      assert.equal(svg.includes(word), false, `avatar-${n} contains "${word}"`);
    }
  }
});

test('all sixteen are distinct colours', () => {
  const hues = new Set();
  for (let n = 1; n <= 16; n += 1) {
    // The sky ramp's first stop carries the hue, so that is the avatar's colour.
    const first = avatarFile(n).match(/stop-color="(hsl\(\d+ [^)]+\))"/);
    assert.ok(first, `avatar-${n}: no hsl stop found`);
    hues.add(first[1]);
  }
  assert.equal(hues.size, 16, `expected 16 distinct ramps, found ${hues.size}`);
});
