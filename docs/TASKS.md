# Tareas

CRUD con status, prioridad, asignación, fechas, archivos adjuntos.

## URLs
- `/tasks` — vista principal: kanban (pendiente/en curso/hecho) + lista + calendario

## API
- `GET    /api/tasks?status=&assignee=&project=&priority=&q=&from=&to=` — listar con filtros
- `POST   /api/tasks` — crear
- `GET    /api/tasks/:id` — detalle
- `PUT    /api/tasks/:id` — actualizar (status, assignee, priority, dueDate, etc.)
- `DELETE /api/tasks/:id` — eliminar
- `POST   /api/tasks/:id/images` — upload imágenes
- `POST   /api/tasks/:id/documents` — upload documentos
- `DELETE /api/tasks/:id/files/:kind/:fileId` — borrar adjunto

## Status enum
`pendiente` → `en_curso` → `hecho`

## Notificaciones automáticas
- `task.assigned` al asignar a otro user
- `task.completed` al cambiar status a `hecho`

## Audit log
- `task.create`, `task.update`, `task.delete`, `task.status_change`, `task.assign`

## Permisos
- Admin: todo
- Assignee: actualizar status y campos limitados
- Project owner: todo
