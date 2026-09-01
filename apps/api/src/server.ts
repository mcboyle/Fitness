import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_TIMEZONE, today } from '@lifestyle/shared';
import { type DB, openDatabase } from './db';
import { ensureBootstrapUser, registerAuthRoutes } from './routes/auth';
import { registerChallengeRoutes } from './routes/challenges';
import { registerMediaRoutes } from './routes/media';
import { registerReactionRoutes } from './routes/reactions';
import { registerSyncRoutes } from './routes/sync';

const here = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = resolve(here, '../../web/dist');

export function buildServer(db: DB = openDatabase()) {
  const app = Fastify({ logger: { transport: undefined } });

  // Progress photos upload as multipart; nothing else in the API uses it.
  app.register(fastifyMultipart, { attachFieldsToBody: false });

  app.get('/api/v1/health', async () => ({
    ok: true,
    // The client greys out locked days against this rather than its own clock.
    server_date: today(),
    timezone: APP_TIMEZONE,
  }));

  registerAuthRoutes(app, db);
  registerSyncRoutes(app, db);
  registerChallengeRoutes(app, db);
  registerMediaRoutes(app, db);
  registerReactionRoutes(app, db);

  /*
   * Same origin: Fastify serves the built PWA alongside /api/*, so there is no
   * CORS anywhere and one tunnel hostname covers both (§12). In dev the app is
   * served by Vite with a proxy instead, so a missing dist/ is not an error.
   */
  if (existsSync(WEB_DIST)) {
    app.register(fastifyStatic, { root: WEB_DIST });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.sendFile('index.html'); // client-side routing
    });
  }

  return app;
}

export async function start() {
  const db = openDatabase();
  const app = buildServer(db);
  ensureBootstrapUser(db, (msg) => app.log.warn(msg));

  const port = Number(process.env.PORT ?? 8787);
  await app.listen({ port, host: '0.0.0.0' });
  return app;
}
