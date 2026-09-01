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

## Firewall

`ufw` is active with `INPUT DROP` and port 22 alone allowed. The tunnel is
outbound-only, so nothing needs an inbound port. This means **the LAN cannot
reach the dev server**; phone testing goes through the tunnel.

## After a deploy

```sh
npm run build                        # the API serves apps/web/dist
sudo systemctl restart lifestyle-api
```
