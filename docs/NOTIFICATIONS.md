# Notificaciones

Sistema de alertas in-app para usuarios autenticados.

## Modelo
`Notification` — TTL 90 días. `recipient` es el usuario que recibe; `actor` es quien originó la acción.

## API
- `GET  /api/notifications?unread=true&type=&limit=20` — listar
- `GET  /api/notifications/unread-count` — solo el contador (para el bell)
- `POST /api/notifications/mark-read` — body: `{ ids: [...] }` o `{ all: true }`
- `DELETE /api/notifications/:id` — borrar una

Todas requieren auth (Bearer token).

## Tipos (recomendados)

| Tipo | Disparador | Recipient |
|---|---|---|
| `chat.message` | sendMessage en conv | todos los participantes excepto sender |
| `task.assigned` | createTask con assignee ≠ self | el assignee |
| `task.completed` | PATCH status a `hecho` | el owner del task |
| `appointment.created` | POST /appointments | el assignedTo |
| `appointment.status_changed` | PATCH status a cancelled/completed | el assignedTo |
| `post.commented` | POST comment en post | el autor del post (si ≠ commenter) |
| `client.assigned` | assign client | el asignado |

Libres (cualquier string). Se recomienda el patrón `<recurso>.<verbo>`.

## Uso server-side

```js
import { notify } from '../lib/notify.js';

await notify({
  recipient: userId,
  type: 'task.assigned',
  title: '✅ Te asignaron: Implementar OAuth',
  body: 'Revisa la descripción y avísame si tienes dudas',
  link: '/tasks',
  sourceType: 'Task',
  sourceId: taskId,
  actor: req.user._id,
  actorName: req.user.name,
  meta: { priority: 'high' },
});
```

## Frontend

### Bell (`NotificationBell.jsx`)
- Icono en top bar con badge rojo
- **Animación ring** mientras hay no leídas
- Dropdown: últimas 10, cada una con icono + título + preview + tiempo
- Click marca como leída y navega al `link`
- Polling cada 30s (`GET /api/notifications/unread-count`)
- Botón "Marcar todas leídas" + "Ver todas" → `/notifications`

### Página (`/notifications`)
- Lista completa con filtros por tipo
- Mark all read, eliminar individuales
- Empty state amigable
