# Deploy

VPS: srv1147020 (31.97.213.7), Ubuntu 6.8.0-110-generic, 2 CPU, 7.8 GB RAM, 96 GB disk.

## Stack
- **Traefik 3.6.7** — reverse proxy + HTTPS
- **EasyPanel** — admin UI (puerto 3000)
- **2 contenedores** para sxxysecret.com:
  - `web_sxxysecret_api` — Node, port 4000, bind-mount `/etc/easypanel/projects/web/sxxysecret_api/code/`
  - `web_sxxysecret_web` — nginx sirviendo `dist/`, bind-mount `/etc/easypanel/projects/web/sxxysecret_web/code/`
- **MongoDB** — `db_aguitechcore`

## Deploy normal (rebuild image)

Desde EasyPanel UI:
1. **Projects → sxxysecret_web → Redeploy** (clona repo, hace `npm install` + `npm run build` en client)
2. **Projects → sxxysecret_api → Redeploy** (clona repo, hace `npm install` en server, reinicia node)

## Deploy rápido (sin rebuild image, bind-mounts)

Si el código está actualizado en el host (clone manual), basta con:

```bash
# 1. API: matar proceso node (supervisord lo reinicia con código nuevo)
CID=$(docker ps -q --filter name=sxxysecret_api | head -1)
PID=$(docker exec $CID pgrep -f "node src/index.js" | head -1)
docker exec $CID kill $PID
sleep 5
curl -s https://sxxysecret.com/api/health   # debe ser {"ok":true,...}

# 2. Web: copiar dist/ nuevo
WID=$(docker ps -q --filter name=sxxysecret_web | head -1)
docker cp /root/inspect/client/dist/. $WID:/code/client/dist/
```

## ⚠️ Traefik routers missing (bug recurrente)

**Síntoma:** `https://sxxysecret.com` muestra 404 de EasyPanel, `https://sxxysecret.com/api/health` da 404.

**Causa:** EasyPanel re-sincroniza su config y **borra** los routers custom de sxxysecret del `main.yaml` de Traefik. Los contenedores pierden labels de Traefik.

**Diagnóstico:**
```bash
docker exec easypanel-traefik cat /data/config/main.yaml | grep -c sxxysecret
# si sale 0, los routers están perdidos
```

**Fix (1 minuto):**
```bash
docker exec easypanel-traefik cat /data/config/main.yaml > /tmp/main.yaml
python3 << 'EOF'
import json
with open('/tmp/main.yaml') as f: c = json.load(f)
c['http'].setdefault('routers', {}); c['http'].setdefault('services', {})
c['http']['services']['web_sxxysecret_api_svc'] = {
    'loadBalancer': {'servers': [{'url': 'http://web_sxxysecret_api:4000'}], 'passHostHeader': True}}
c['http']['services']['web_sxxysecret_web_svc'] = {
    'loadBalancer': {'servers': [{'url': 'http://web_sxxysecret_web:80'}], 'passHostHeader': True}}
c['http']['routers']['sxxysecret-api'] = {
    'rule': 'Host(`sxxysecret.com`) && PathPrefix(`/api`)',
    'service': 'web_sxxysecret_api_svc',
    'entryPoints': ['websecure'],
    'tls': {'certResolver': 'letsencrypt'},
    'priority': 100}
c['http']['routers']['sxxysecret-web'] = {
    'rule': 'Host(`sxxysecret.com`)',
    'service': 'web_sxxysecret_web_svc',
    'entryPoints': ['websecure'],
    'tls': {'certResolver': 'letsencrypt'},
    'priority': 50}
with open('/tmp/main.yaml', 'w') as f: json.dump(c, f, indent=2)
EOF
docker cp /tmp/main.yaml easypanel-traefik:/data/config/main.yaml
docker kill -s HUP easypanel-traefik
sleep 3
curl -s -o /dev/null -w "%{http_code}
" https://sxxysecret.com/api/health   # 200
curl -s -o /dev/null -w "%{http_code}
" https://sxxysecret.com/            # 200
```

## Variables de entorno (server)

`/etc/easypanel/projects/web/sxxysecret_api/code/server/.env`:
```bash
PORT=4000
MONGO_URI=mongodb://db_aguitechcore:27017/aguitechcore
JWT_SECRET=<64-char-random>
JWT_EXPIRES_IN=7d
CLIENT_ORIGIN=https://sxxysecret.com
NODE_ENV=production
```

## Credenciales de prueba

| Rol | Email | Password |
|---|---|---|
| Admin | hector@aguitech.com | peris51373 |
| Admin (seed) | admin@aguitech.com | admin123 |
| Member | memo@codimexa.com | memo10 |

## Verificación post-deploy

```bash
python3 tests/test_system.py    # 31 tests, ~5s
```

Si falla algún test, el deploy está roto. El suite cubre health, auth, blog, citas, notif, audit, RBAC.
