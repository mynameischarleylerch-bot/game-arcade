/**
 * Cache-stamping guard.
 *
 * Pages serves everything with `Cache-Control: max-age=600`. This site has been
 * bitten four times by that: a renamed game, a fixed credit line, a restyled
 * cover and a rewritten avatar all deployed correctly and looked unchanged.
 *
 * These tests walk the URLs the site actually emits at runtime and require a
 * `?v=` stamp on every same-origin one. If a new asset is added without one, they
 * fail — which is far cheaper than discovering it from a user's "nothing changed".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { BUILD, versioned } from '../src/build.js';
import { AVATARS } from '../src/messenger.js';

const config = JSON.parse(readFileSync(new URL('../games.config.json', import.meta.url), 'utf8'));

const isStamped = (url) => /\?v=/.test(url);

test('BUILD is a non-empty stamp', () => {
  assert.match(BUILD, /^[A-Za-z0-9._-]+$/, `unusable BUILD: ${BUILD}`);
  assert.ok(BUILD.length >= 6, 'BUILD should be a dated stamp, not "1"');
});

test('versioned stamps same-origin paths exactly once', () => {
  assert.equal(versioned('./a.svg'), `./a.svg?v=${BUILD}`);
  assert.equal(versioned('./a.svg?v=old'), './a.svg?v=old', 'already stamped');
  assert.equal(versioned(''), '', 'empty input is left alone');
  assert.equal(versioned(null), null, 'null input is left alone');
});

test('versioned leaves external URLs alone', () => {
  for (const url of ['https://github.com/x', '//cdn.example/a.js', 'http://x.test/a']) {
    assert.equal(versioned(url), url, `${url} must not be rewritten`);
  }
});

test('every avatar in the table is stamped', () => {
  for (const a of AVATARS) {
    assert.ok(isStamped(a.src), `unstamped avatar: ${a.src}`);
    assert.match(a.src, /^\.\/assets\/avatars\/avatar-\d\d\.svg\?v=/, a.src);
  }
});

test('every game cover and play URL is stamped by the renderer', () => {
  // The renderer stamps these at the point of use, so the check is that it does.
  const render = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  assert.match(render, /versioned\(game\.cover\)/, 'the cover img is not stamped');
  assert.match(render, /versioned\(`\.\/play\.html/, 'the play link is not stamped');
});

test('the player stamps the iframe document itself', () => {
  // The whole game page is a separate document; without a stamp on the iframe URL
  // the browser serves the previous version of the game, not just its scripts.
  const play = readFileSync(new URL('../src/play.js', import.meta.url), 'utf8');
  assert.match(play, /versioned\(game\.playUrl\)/,
    'the iframe src must be stamped, or a restyled game shows the old page');
});

test('both HTML pages stamp their stylesheet and scripts', () => {
  for (const page of ['index.html', 'play.html']) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    const refs = [
      ...html.matchAll(/<link[^>]*href="([^"]+)"/g),
      ...html.matchAll(/src="(\.\/[^"]+)"/g),
      ...html.matchAll(/from '(\.\/[^']+)'/g),
    ].map((m) => m[1]);

    assert.ok(refs.length >= 3, `${page}: expected several references`);
    for (const ref of refs) {
      // data: URIs are inline, and http(s) URLs are not ours to stamp.
      if (ref.startsWith('http') || ref.startsWith('data:')) continue;
      assert.ok(isStamped(ref), `${page}: unstamped reference ${ref}`);
    }
  }
});

test('no same-origin asset path appears unstamped anywhere in src/', () => {
  // A belt-and-braces sweep: any literal ./ path in a module must carry a stamp
  // unless it is passed through versioned().
  const files = ['app.js', 'play.js', 'render.js', 'router.js', 'config.js',
    'messenger.js', 'avatar-ui.js', 'themes.js', 'theme-ui.js'];
  const offenders = [];
  for (const file of files) {
    let src;
    try {
      src = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    } catch { continue; }

    for (const m of src.matchAll(/(['"`])(\.\/[A-Za-z0-9._/-]+)\1/g)) {
      const literal = m[2];
      if (isStamped(literal)) continue;
      // Allowed only if the same line routes it through versioned().
      const line = src.slice(src.lastIndexOf('\n', m.index) + 1, src.indexOf('\n', m.index));
      if (/versioned\(/.test(line)) continue;
      offenders.push(`${file}: ${literal}`);
    }
  }
  assert.deepEqual(offenders, [], `unstamped asset paths:\n${offenders.join('\n')}`);
});

test('every registered game has a real play target and cover', () => {
  for (const game of config.games) {
    assert.match(game.playUrl, /^\.\//, `${game.slug}: playUrl must be same-origin and relative`);
    assert.match(game.cover, /^\.\//, `${game.slug}: cover must be same-origin and relative`);
  }
});


test('every module uses the same BUILD stamp, with no drift', () => {
  // Two files on one stale stamp is exactly how the Aero restyle shipped as
  // "nothing changed": the stamp exists per file, so it can fall out of step.
  // Scoped to src/: the tests hold fixture strings such as '?v=old'.
  const files = globSync(
    new URL('../src/*.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  );
  const offenders = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const stamps = new Set([...src.matchAll(/\?v=([A-Za-z0-9._-]+)/g)].map((m) => m[1]));
    // Stamps that are not the current build are drift.
    for (const stamp of stamps) {
      if (stamp !== BUILD) offenders.push(`${file.split(/[\\/]/).pop()}: ${stamp}`);
    }
  }
  assert.deepEqual(offenders, [],
    `these files are not on BUILD ${BUILD}:\n${offenders.join('\n')}`);
});

test('both HTML pages are on the current BUILD', () => {
  for (const page of ['index.html', 'play.html']) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    const stamps = new Set([...html.matchAll(/\?v=([A-Za-z0-9._-]+)/g)].map((m) => m[1]));
    for (const stamp of stamps) {
      assert.equal(stamp, BUILD, `${page} carries a stale stamp: ${stamp}`);
    }
  }
});