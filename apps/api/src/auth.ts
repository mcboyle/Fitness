import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DB } from './db';

export interface AuthedUser {
  id: string;
  display_name: string;
  avatar_color: string;
}

/** Tokens are stored hashed, so a database leak doesn't hand over sessions. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function mintToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthedUser;
  }
}

/**
 * Bearer auth. §9: per-user tokens, long-lived, revocable — revoking is a
 * matter of stamping `revoked_at`, which this checks on every request rather
 * than caching.
 */
export function authenticate(db: DB) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing bearer token' });
    }

    const row = db
      .prepare(
        `SELECT u.id, u.display_name, u.avatar_color
           FROM tokens t
           JOIN users u ON u.id = t.user_id
          WHERE t.hash = ? AND t.revoked_at IS NULL`,
      )
      .get(hashToken(header.slice(7).trim())) as AuthedUser | undefined;

    if (!row) return reply.code(401).send({ error: 'invalid or revoked token' });
    request.user = row;
  };
}
