/** Pure feed logic for Seal Scroller. No DOM — the page wires this to scroll events. */

/** Never return a negative index, even from an empty feed. */
export function clampIndex(index, total) {
  if (total <= 0) return 0;
  return Math.min(Math.max(index, 0), total - 1);
}

/** Shorts-style: past the last item returns to the top and vice versa. */
export function nextIndex(current, total, direction) {
  if (total <= 0) return 0;
  const stepped = current + (direction >= 0 ? 1 : -1);
  return ((stepped % total) + total) % total;
}

/** True when `index` is within `radius` of `active` — used to decide what to preload. */
export function isAdjacent(index, active, radius = 1) {
  return Math.abs(index - active) <= radius;
}