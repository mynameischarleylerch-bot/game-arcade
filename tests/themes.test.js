import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, DEFAULT_THEME, nextTheme, isKnownTheme, themeLabel } from '../src/themes.js';

test('ships the four requested themes with Aero first', () => {
  assert.deepEqual(THEMES.map((t) => t.id), ['aero', 'doric', 'eco', 'glacier', 'dark-aero']);
});

test('every theme has a label and is known', () => {
  for (const theme of THEMES) {
    assert.ok(theme.label && theme.label.length > 1, `${theme.id} needs a label`);
    assert.equal(isKnownTheme(theme.id), true);
  }
});

test('DEFAULT_THEME is the first theme and is Aero', () => {
  assert.equal(DEFAULT_THEME, 'aero');
  assert.equal(isKnownTheme(DEFAULT_THEME), true);
});

test('nextTheme cycles forward and wraps to the start', () => {
  assert.equal(nextTheme('aero'), 'doric');
  assert.equal(nextTheme('glacier'), 'dark-aero');
  assert.equal(nextTheme('dark-aero'), 'aero', 'wraps at the end');
});

test('nextTheme falls back to the default for an unknown theme', () => {
  assert.equal(nextTheme('not-a-theme'), 'doric');
  assert.equal(nextTheme(''), 'doric');
});

test('isKnownTheme rejects anything unlisted', () => {
  assert.equal(isKnownTheme('doric'), true);
  assert.equal(isKnownTheme('DORFic'), false, 'ids are lowercase and exact');
  assert.equal(isKnownTheme(''), false);
});

test('themeLabel names the theme, and falls back for an unknown id', () => {
  assert.equal(themeLabel('glacier'), 'Frutiger Glacier');
  assert.equal(themeLabel('not-real'), 'Frutiger Aero');
});