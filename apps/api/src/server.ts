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
import { registerDevRoutes } from './routes/dev';
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

  if (registerDevRoutes(app, db)) {
    app.log.warn(
      'DEV_TOKEN is set — impersonation of any user, including their private photos, is enabled. Unset it in the systemd unit to disable.',
    );
  }

  /*
   * Same origin: Fastify serves the built PWA alongside /api/*, so there is no
   * CORS anywhere and one tunnel hostname covers both (§12). In dev the app is
   * served by Vite with a proxy instead, so a missing dist/ is not an error.
   */
  if (existsSync(WEB_DIST)) {
    app.register(fastifyStatic, {
      root: WEB_DIST,
      /*
       * @fastify/static defaults to max-age=14400, which is catastrophic for a
       * service worker: the browser will not look for a new one for four hours,
       * so a deploy simply doesn't reach an installed app. Safari honours it.
       *
       * The entry points must always be revalidated; the hashed assets can be
       * cached forever precisely because their names change when they do.
       */
      // Off, so the plugin does not add its own max-age underneath ours.
      cacheControl: false,
      setHeaders(reply, path) {
        const file = path.split('/').pop() ?? '';
        const alwaysFresh =
          file === 'sw.js' ||
          file === 'index.html' ||
          file === 'registerSW.js' ||
          file === 'manifest.webmanifest' ||
          file.startsWith('workbox-');

        reply.header(
          'cache-control',
          /*
           * `private` matters as much as `no-cache` here. Cloudflare's default
           * Browser Cache TTL rewrites a cacheable .js response to
           * max-age=14400 regardless of what the origin said — which pinned an
           * installed app to a four-hour-old service worker and made deploys
           * appear not to land. Marking it private keeps the edge out of it.
           */
          alwaysFresh
            ? 'private, no-cache, no-store, must-revalidate'
            : 'public, max-age=31536000, immutable',
        );
      },
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not found' });
      }
      // Client-side routing. Never cached, or a stale shell outlives a deploy.
      reply.header('cache-control', 'no-cache, must-revalidate');
      return reply.sendFile('index.html');
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
