# Proyectos

CRUD con miembros, tareas asociadas, y vista de detalle rica.

## URLs
- `/projects` — lista con grid + filtros
- `/proyectos/:id` — vista de detalle con tabs (Overview, Tareas, Miembros, Archivos, Chat)

## API
- `GET    /api/projects?q=&status=&client=&owner=&member=` — listar
- `POST   /api/projects` — crear
- `GET    /api/projects/:id` — detalle (populate client, owner, members)
- `PUT    /api/projects/:id` — actualizar
- `DELETE /api/projects/:id` — eliminar
- `POST   /api/projects/:id/members` — agregar miembro
- `DELETE /api/projects/:id/members/:userId` — quitar miembro

## Modelo
Ver `docs/DATA-MODEL.md` → Project.

## Permisos
- Admin: todo
- Owner: CRUD + member management
- Member: solo ver (read)
- Other: 403

## Audit log
- `project.create`, `project.update`, `project.delete`, `project.member_add`, `project.member_remove`
