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

## Recently deleted photos

Deleting a progress photo moves the file to `data/trash/<user_id>/` and stamps
`media.deleted_at` — it does not unlink the file or drop the row. Progress
photos are the one thing in this app nobody can retake, so a mis-tap has to be
recoverable. Recoverable for **30 days**, then purged file and row together.

Restoring is behind `DEV_TOKEN` on purpose. A trash bin in the app would mean
one tap can resurrect an image someone chose to get rid of, and they may have
meant it — restoring should be a request someone makes out loud.

```sh
DEV=$(sudo grep -oP 'Environment=DEV_TOKEN=\K\S+' /etc/systemd/system/lifestyle-api.service)
curl -s -H "x-dev-token: $DEV" localhost:8787/api/v1/dev/media/trash
curl -s -X POST -H "x-dev-token: $DEV" localhost:8787/api/v1/dev/media/<id>/restore
```

A restored photo comes back **private**, whatever it was before: sharing was a
deliberate act and that consent does not survive a round trip through the bin.

Retention holds in both directions: recoverable for thirty days, and actually
gone after them. `scripts/purge-trash.mjs` runs from the hourly
`lifestyle-snapshot` timer alongside the database snapshot. The API also sweeps
when someone deletes a photo, but that alone made the window a floor rather
than a promise — if nobody deleted anything for a year, a photo binned a year
ago would still be on disk.

That timer is operational housekeeping, not the application scheduling itself,
so it does not breach §7's no-cron rule: nothing about a streak, a pause or a
rollover depends on it firing.

```sh
npm run purge-trash    # what it would remove, and what is still recoverable
```

## Copying the photo store

`scripts/backup-media.sh` mirrors `data/media`, `data/trash` and
`data/snapshots`, and runs hourly from the `lifestyle-snapshot` timer.
`snapshot.sh` copies only the database, so without this the `media` rows
survive a bad migration while the images do not survive a lost disk — and
photos are the one thing here nobody can retake.

It also fixes a hazard in the reset procedure above: `data/snapshots` lives
*inside* `data/`, so `rm -rf data` destroyed the backups along with the thing
they were backing up. There is now a copy outside that directory.

**Set a real destination.** The default is `~/fitness-media-backup` — outside
`data/`, but the same disk, so it survives a wipe and not a disk failure. The
script says so on every run. Anything rsync understands works:

```
# in /etc/systemd/system/lifestyle-snapshot.service
Environment=MEDIA_BACKUP_DEST=user@nas:/volume1/fitness
```

```sh
npm run backup-media                       # run it now
MEDIA_BACKUP_DEST=/mnt/spare npm run backup-media
```

**Deletions propagate, on purpose.** The mirror uses `--delete`, so a photo
purged after its thirty days does not survive in the backup. Retention would
otherwise be a lie. This protects against losing the disk or wiping the
directory; it is deliberately not a way around the archive window.

### Restoring

```sh
rsync -a ~/fitness-media-backup/media/ /home/mboyle/fitness/data/media/
```

Verified: with the store deleted a signed URL returns 404, and after this
command it serves 200 again. A row whose file is missing returns 404 rather
than a server error, so a half-finished restore degrades honestly.

## Resetting the database

`ProtectSystem=full` with `ReadWritePaths=/home/mboyle/fitness/data` means
systemd bind-mounts that directory. **Deleting it takes the service down** —
the unit cannot start without it and restarts in a loop until it returns.

```sh
scripts/snapshot.sh                   # always, first
sudo systemctl stop lifestyle-api
rm -rf data && mkdir data             # recreate it in the same breath
sudo systemctl start lifestyle-api
npm run invite                        # provision the second seat
```

Photos live in `data/media/` and go with it. Snapshots live in
`data/snapshots/`, so copy one somewhere else before removing the directory or
the backups die with the thing they were backing up.

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

### Forcing it by hand

The build hash only moves when the client bundle does, so a server-only change
gives a client nothing to notice. `npm run force-refresh` bumps a cache epoch
in `data/cache-epoch`, which every client compares on load and on foreground —
a higher number means drop all caches, unregister the worker and reload.

```sh
npm run force-refresh        # takes effect immediately; no restart
curl -s localhost:8787/api/v1/version
```

The epoch is honoured ahead of the build check and is not subject to the
once-per-tab guard, because the point of bumping it is that everyone acts.
The new value is recorded in `localStorage` *before* reloading, which is what
keeps that from becoming a loop. Sign-in survives — only caches and the service
worker are cleared.

## Firewall

`ufw` is active with `INPUT DROP` and port 22 alone allowed. The tunnel is
outbound-only, so nothing needs an inbound port. This means **the LAN cannot
reach the dev server**; phone testing goes through the tunnel.

## After a deploy

```sh
npm run build                        # the API serves apps/web/dist
sudo systemctl restart lifestyle-api
```
