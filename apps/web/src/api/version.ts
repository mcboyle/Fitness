import { api } from './client';

/**
 * Forces a stale client onto the current build.
 *
 * There are no push notifications in this app by design, so a device that is
 * holding an old service worker cannot be told to update — it has to notice.
 * Both sides can see the same fact: the hashed name of the main bundle. The
 * document a client was served names its own; the server reports what is
 * actually on disk. If they differ, this client is running something the server
 * has replaced.
 */
function localBuild(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  return script ? (/assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(script.src)?.[1] ?? null) : null;
}

const FORCED = 'lt.forced_update';

/**
 * Drops every cache and service worker, then reloads.
 *
 * Guarded to once per tab: if a reload doesn't resolve the mismatch — a wedged
 * service worker, a proxy serving something stale — looping forever is worse
 * than running an old build, and the caller shows a banner instead.
 */
async function forceUpdate(): Promise<void> {
  if (sessionStorage.getItem(FORCED)) return;
  sessionStorage.setItem(FORCED, '1');

  try {
    if ('caches' in window) {
      await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
  } catch {
    // Reload anyway: a partial clear still usually picks up the new build.
  }

  location.reload();
}

export type VersionState = 'current' | 'stale';

/**
 * Returns 'stale' when the client is out of date and could not fix itself —
 * which is the only case the UI needs to say anything about.
 */
export async function checkVersion(): Promise<VersionState> {
  const mine = localBuild();
  if (!mine) return 'current'; // dev server: no hashed bundle to compare

  let theirs: string | null = null;
  try {
    theirs = (await api<{ build: string | null }>('/version', { auth: false })).build;
  } catch {
    return 'current'; // offline is not stale
  }

  if (!theirs || theirs === mine) return 'current';

  if (sessionStorage.getItem(FORCED)) return 'stale';
  await forceUpdate();
  return 'stale';
}
