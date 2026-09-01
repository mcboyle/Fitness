export interface Session {
  token: string;
  user_id: string;
  display_name: string;
  avatar_color: string;
}

const KEY = 'lt.session';

let cached: Session | null | undefined;

export function getSession(): Session | null {
  if (cached !== undefined) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    cached = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function setSession(session: Session) {
  cached = session;
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Memory-only is still a usable session for this tab.
  }
}

export function clearSession() {
  cached = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}

/**
 * Rows are keyed by the signed-in user. Reading this without a session is a
 * programming error — App renders the login screen instead.
 */
export function currentUserId(): string {
  const session = getSession();
  if (!session) throw new Error('no session');
  return session.user_id;
}
