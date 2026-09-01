/**
 * UUID v4 that works outside a secure context.
 *
 * `crypto.randomUUID` is only defined on secure origins. `localhost` counts as
 * one, so every test passed while the app was a blank page on any phone hitting
 * it over http://10.0.70.31 — the throw took React down before first paint.
 * See MISTAKES.md #7.
 *
 * `crypto.getRandomValues` has no such restriction, so the fallback is still
 * cryptographically random; only the very last resort is not, and that path
 * needs an environment with no Web Crypto at all.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Version 4, variant 10xx.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
