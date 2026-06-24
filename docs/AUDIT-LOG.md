# Bitácora (Audit Log)

Registro inmutable de **todas** las acciones de usuarios. **Admin-only**.

## Modelo
`AuditLog` — TTL 180 días. Inmutable (no hay update endpoint).

## API
- `GET  /api/audit-log?category=&action=&actor=&q=&from=&to=&page=1&limit=50` — listar paginado
- `GET  /api/audit-log?stats=true` — incluye `stats.byCategory` y `stats.byDay`
- `GET  /api/audit-log/export?format=csv&limit=10000` — CSV con BOM

Todas requieren `role: admin`. Member → 403. Anonymous → 401.

## Categorías

`action` es dotted (`<category>.<verb>`); `category` es el primer segmento.

| Categoría | Acciones |
|---|---|
| `auth` | login, logout, password_change |
| `task` | create, update, delete, status_change, assign |
| `chat` | create_conv, send_message, delete_message |
| `appointment` | create, update, delete, status_change |
| `post` | create, update, delete, publish |
| `client` | create, update, delete, assign |
| `project` | create, update, delete, member_add, member_remove |
| `user` | create, update, delete, role_change |
| `admin` | config_change, api_key_create |

## Uso server-side

```js
import { audit, labelOf } from '../lib/audit.js';

await audit({
  req,
  action: 'task.create',
  category: 'task',           // opcional, se infiere de action
  targetType: 'Task',
  targetId: task._id,
  targetLabel: task.title,    // human-readable para listar
  meta: { project, priority },
  severity: 'info',           // 'info' | 'warning' | 'critical'
});
```

`labelOf(model)` extrae un label legible de un documento populado:
- Post → title
- Task → title
- Project → title
- Client → name
- User → name
- Appointment → `${customerName} - ${subject}`
- Conversation → name o participantes

## Frontend (`/audit-log`)

- **Stats tiles** arriba: total eventos, eventos hoy, categorías únicas
- **Category bar**: top categorías con barras horizontales (% del total)
- **Filtros**: búsqueda libre, categoría, acción, actor, rango de fechas
- **Tabla**: timestamp, actor (avatar + nombre + rol), acción (pill coloreado), target (label), IP, severity (pill)
- **Paginación** con page/limit
- **Export CSV** con BOM (compatible Excel)

## Privacidad
- `ip` y `userAgent` se capturan automáticamente
- `meta` puede contener cualquier JSON (cuidado con passwords/tokens — sanitizar antes de pasar a `meta`)

## TTL
180 días. Configurable vía `AuditLog.ensureTTL(days)` en startup (`server/src/index.js`).
