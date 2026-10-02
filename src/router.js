/** URL <-> registry plumbing. Deliberately relative: this site is served from a subpath. */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A slug that fails the pattern is never a lookup key — it is a tampered URL. */
export function gameSlugFromSearch(search) {
  const raw = new URLSearchParams(search ?? '').get('game');
  if (!raw) return null;
  const slug = raw.trim().toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : null;
}

export function playerUrlFor(slug) {
  return `./play.html?game=${encodeURIComponent(slug)}`;
}

export function backUrl() {
  return './index.html';
}