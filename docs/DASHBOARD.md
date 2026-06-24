# Dashboard

Página de inicio post-login (`/dashboard`). Resumen de actividad reciente.

## Widgets
- **Stats tiles**: clientes activos, proyectos en curso, tareas pendientes, citas próximas
- **Tareas recientes**: lista de últimas 5 tareas asignadas/creadas
- **Próximas citas**: calendario mini con citas de los próximos 7 días
- **Actividad reciente**: feed de cambios (audit log filtrado al usuario)

## API
- `GET /api/dashboard` — devuelve todos los widgets en una sola llamada (optimizado)

## Customización
- Stats en `client/src/pages/Dashboard.jsx`
- Tiles son configurables según el rol (admin ve más, member ve solo lo propio)
