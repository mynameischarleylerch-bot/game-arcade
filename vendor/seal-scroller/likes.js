/**
 * Like handling, kept pure so it can be tested without a DOM.
 * Stored per slide index so a like survives a reload.
 */

const STORAGE_KEY = 'seal-scroller-likes';

/** Read the liked-index set. Never throws: storage can be full or blocked. */
export function loadLikes(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
if (!Array.isArray(parsed)) return new Set();
    // Number(null) is 0 and Number('') is 0, which would invent a liked seal.
    return new Set(parsed.filter((v) => typeof v === 'number' && Number.isInteger(v)));
  } catch {
    return new Set();
  }
}

export function saveLikes(storage, likes) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify([...likes]));
  } catch {
    // Private browsing or a full quota: the like still works for this session.
  }
}

/** Toggle one index and return the new set. */
export function toggleLike(likes, index) {
  const next = new Set(likes);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return next;
}

export function likeCount(likes) {
  return likes.size;
}