# Deployment

Systemd units for the box that runs this. Copies of what is installed at
`/etc/systemd/system/` — edit here, then install.

```sh
sudo cp deploy/*.service deploy/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lifestyle-api lifestyle-snapshot.timer
```

| Unit | Does |
|---|---|
| `lifestyle-api.service` | The Fastify API on :8787, serving the built PWA same-origin. `Restart=on-failure`. |
| `lifestyle-snapshot.timer` | Hourly local database snapshot, 48 kept. |

`cloudflared.service` is installed separately and is not in this repo — it holds
a tunnel token.

## Ingress

A remotely-managed Cloudflare Tunnel routes `fitness.themfboyles.org` to
`http://localhost:8787`. The routing config lives in the Cloudflare Zero Trust
dashboard, **not** on this box: Networks → Tunnels → Fitness → Published
application routes.

TLS terminates at Cloudflare's edge, so nothing here manages a certificate. The
app is same-origin — one hostname serves both the PWA and `/api/*`, so there is
no CORS anywhere.

## Caching — do not loosen this

`sw.js`, `index.html`, `registerSW.js` and `manifest.webmanifest` are served
`private, no-cache, no-store, must-revalidate`. The `private` is doing real
work: Cloudflare's default Browser Cache TTL rewrites cacheable `.js` responses
to `max-age=14400` regardless of the origin, which pins an installed PWA to a
four-hour-old service worker and makes deploys look like they didn't land.
Marking it private turns `cf-cache-status` into `BYPASS`.

Hashed assets under `/assets/` get a year and `immutable` — safe because their
filenames change whenever their contents do.

After a deploy, check at the edge, not the origin:

```sh
curl -sI https://fitness.themfboyles.org/sw.js | grep -i 'cache-control\|cf-cache'
```

## Forcing clients onto a new build

There are no push notifications, so a device holding an old service worker
cannot be told to update — it has to notice. Both sides can see the same fact:
the hashed name of the main bundle.

- `GET /api/v1/version` reports what is actually in `dist/`, read per request so
  a deploy takes effect without a restart.
- The client reads the same name out of the document it was served, on load and
  on every foreground. On a mismatch it deletes every cache, unregisters every
  service worker and reloads.
- Guarded to once per tab. If a reload doesn't resolve it, looping forever is
  worse than running an old build, so it shows a banner instead.

**This only helps clients running a build that contains the check.** A device on
an older bundle cannot run code it does not have; it needs one successful
service-worker update first, which the cache headers above are what allow.

## Firewall

`ufw` is active with `INPUT DROP` and port 22 alone allowed. The tunnel is
outbound-only, so nothing needs an inbound port. This means **the LAN cannot
reach the dev server**; phone testing goes through the tunnel.

## After a deploy

```sh
npm run build                        # the API serves apps/web/dist
sudo systemctl restart lifestyle-api
```
