import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applyTheme, initThemeButton } from '../src/theme-ui.js';
import { DEFAULT_THEME, themeLabel } from '../src/themes.js';

function makeDom() {
  return new JSDOM(
    `<!doctype html><html data-theme="${DEFAULT_THEME}"><body>
       <button id="theme-toggle" type="button">Theme: Aero</button>
     </body></html>`,
  );
}

test('applyTheme sets data-theme on the root element', () => {
  const dom = makeDom();
  applyTheme(dom.window, 'glacier');
  assert.equal(dom.window.document.documentElement.dataset.theme, 'glacier');
});

test('applyTheme ignores an unknown theme id', () => {
  const dom = makeDom();
  applyTheme(dom.window, 'not-real');
  assert.equal(dom.window.document.documentElement.dataset.theme, DEFAULT_THEME);
});

test('initThemeButton cycles the theme on each click', () => {
  const dom = makeDom();
  initThemeButton(dom.window);
  const button = dom.window.document.getElementById('theme-toggle');
  button.dispatchEvent(new dom.window.Event('click'));
  assert.equal(dom.window.document.documentElement.dataset.theme, 'doric');
  button.dispatchEvent(new dom.window.Event('click'));
  assert.equal(dom.window.document.documentElement.dataset.theme, 'eco');
});

test('the button label always names the current theme', () => {
  const dom = makeDom();
  initThemeButton(dom.window);
  const button = dom.window.document.getElementById('theme-toggle');
  button.dispatchEvent(new dom.window.Event('click'));
  assert.match(button.textContent, new RegExp(themeLabel('doric')));
});

test('cycling wraps from the last theme back to the first', () => {
  const dom = makeDom();
  initThemeButton(dom.window);
  const button = dom.window.document.getElementById('theme-toggle');
  for (let i = 0; i < 5; i += 1) button.dispatchEvent(new dom.window.Event('click'));
  assert.equal(dom.window.document.documentElement.dataset.theme, DEFAULT_THEME);
});

test('initThemeButton does nothing when the button is absent', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  assert.doesNotThrow(() => initThemeButton(dom.window));
});

test('initThemeButton adopts the theme already on the root', () => {
  const dom = new JSDOM(
    `<!doctype html><html data-theme="eco"><body>
       <button id="theme-toggle" type="button"></button></body></html>`,
  );
  initThemeButton(dom.window);
  const button = dom.window.document.getElementById('theme-toggle');
  assert.match(button.textContent, new RegExp(themeLabel('eco')));
  // Next click advances from eco, not from the default.
  button.dispatchEvent(new dom.window.Event('click'));
  assert.equal(dom.window.document.documentElement.dataset.theme, 'glacier');
});