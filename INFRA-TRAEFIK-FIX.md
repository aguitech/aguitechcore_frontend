# Traefik router fix for sxxysecret.com

## Problem
EasyPanel periodically reloads Traefik and loses the custom routers
configured in `/etc/easypanel/traefik/config/main.yaml` for sxxysecret.com.
This causes HTTPS to return 404 (default Traefik page) even when
containers are running fine.

## Fix
The routers are re-added to `main.yaml` with these settings:

- **Web routers** (`https-sxxysecret-web`, `https-www-sxxysecret-web`):
  - `rule`: `Host(...)` (NO `PathPrefix(/)` — important!)
  - `priority`: default (0)
  - Service: `web_sxxysecret_com-web` -> web container :80
- **API routers** (`https-sxxysecret-api`, `https-www-sxxysecret-api`):
  - `rule`: `Host(...) && PathPrefix(/api)`
  - `priority`: **100** (high, so it always wins for /api/*)
  - Service: `web_sxxysecret_com-api` -> api container :4000
- **HTTP redirect routers**: redirect-to-https

### Why priority matters
If the web router had `PathPrefix(/)` with priority 0 and the API router
had `PathPrefix(/api)` with priority 10, Traefik still routed `/api/health`
to the web (returning index.html) because:
1. Both rules match the request
2. Traefik resolves ties by route order, not always priority

Setting web to `Host()` (no path) with priority 0 and api to priority 100
makes the API win deterministically whenever `/api/*` is requested.

### Reload command
```bash
docker kill -s HUP $(docker ps -q --filter name=traefik)
```

## Auto-heal cron
A healthcheck runs every 5 minutes via system cron:
- Script: `/usr/local/bin/sxxy-healthcheck.sh`
- Log: `/var/log/sxxy-healthcheck.log`
- Actions: checks HTTPS, restarts web/api containers, reloads Traefik
  if routers are missing.

To install manually:
```bash
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/sxxy-healthcheck.sh >> /var/log/sxxy-healthcheck.log 2>&1") | crontab -
```
