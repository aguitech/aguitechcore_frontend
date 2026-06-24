# Clientes

CRUD completo de clientes.

## URLs
- `/clients` — lista con búsqueda + filtros
- Click en cliente → drawer lateral con detalle + proyectos asociados

## API
- `GET    /api/clients?q=&status=&owner=` — listar con búsqueda
- `POST   /api/clients` — crear
- `GET    /api/clients/:id` — detalle
- `PUT    /api/clients/:id` — actualizar
- `DELETE /api/clients/:id` — eliminar (solo si no tiene proyectos/tareas)
- `GET    /api/clients/:id/projects` — proyectos del cliente

## Modelo
Ver `docs/DATA-MODEL.md` → Client.

## Permisos
- Admin: CRUD total
- Member: CRUD solo en clientes donde son `owner`

## Audit log
- `client.create`, `client.update`, `client.delete`, `client.assign`
