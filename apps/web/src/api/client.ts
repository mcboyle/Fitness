import { getSession } from './session';

/**
 * Always same-origin. The app calls /api/* on whatever host served it, so the
 * LAN today and the Cloudflare tunnel later both work with no build-time
 * configuration and no URL for anyone to mistype. Vite proxies to the API in
 * dev; Fastify serves both from one port in production.
 */
const BASE = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, ...rest } = init;
  const headers = new Headers(rest.headers);
  // Only when there is something to parse: Fastify rejects an empty body that
  // claims to be JSON, which silently 400'd every bodyless POST.
  if (rest.body !== undefined) headers.set('content-type', 'application/json');

  if (auth) {
    const session = getSession();
    if (session) headers.set('authorization', `Bearer ${session.token}`);
  }

  const response = await fetch(BASE + path, { ...rest, headers });
  const text = await response.text();

  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /*
     * Not JSON. Cloudflare Access serves an HTML login page once a session
     * expires, so this is what a needed re-auth looks like rather than a
     * server fault.
     */
    throw new ApiError(response.status, text, 'the server did not return JSON');
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error: unknown }).error)
        : `request failed (${response.status})`;
    throw new ApiError(response.status, body, message);
  }

  return body as T;
}
