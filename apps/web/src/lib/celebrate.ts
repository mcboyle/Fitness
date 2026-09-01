const KEY = 'lt.celebrated';

/**
 * Remembers which celebrations have already played.
 *
 * Without this, opening a completed day fires confetti on every render and
 * every reload — which turns a reward into an irritation within a day.
 */
function seen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** True the first time an event is claimed, false ever after. */
export function claimCelebration(id: string): boolean {
  const already = seen();
  if (already.has(id)) return false;

  already.add(id);
  try {
    // Bounded: a year of daily and weekly events, then the oldest fall off.
    localStorage.setItem(KEY, JSON.stringify([...already].slice(-400)));
  } catch {
    return true; // no storage: better to celebrate twice than never
  }
  return true;
}
