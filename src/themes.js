/**
 * Theme registry and toggle order. Pure data + pure functions — no DOM —
 * so the switch logic is testable without a browser.
 *
 * The theme id must match the [data-theme="..."] selector in styles.css.
 */

export const THEMES = [
  { id: 'aero', label: 'Frutiger Aero' },
  { id: 'doric', label: 'Frutiger DORFic' },
  { id: 'eco', label: 'Frutiger Eco' },
  { id: 'glacier', label: 'Frutiger Glacier' },
  { id: 'dark-aero', label: 'Dark Aero' },
];

export const DEFAULT_THEME = THEMES[0].id;

export function isKnownTheme(id) {
  return THEMES.some((theme) => theme.id === id);
}

/** Cycle forward through the list; an unknown id restarts just after the default. */
export function nextTheme(current) {
  const index = THEMES.findIndex((theme) => theme.id === current);
  if (index === -1) return THEMES[1].id;
  return THEMES[(index + 1) % THEMES.length].id;
}

/** Human label for a theme id, falling back to the default's label. */
export function themeLabel(id) {
  return THEMES.find((theme) => theme.id === id)?.label ?? THEMES[0].label;
}