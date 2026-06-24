# Citas (Appointments)

Sistema de agendamiento público + admin.

## URLs
- **Landing público** (`/`): widget de 3 pasos para agendar
- **Admin** (`/appointments`): calendario mensual + lista, con gestión completa
- **Usuario** (`/my-appointments`): próximas + pasadas, calendario, cancelar

## API

### Públicas (sin auth)
- `GET  /api/appointments/public/staff` — lista staff asignable
- `GET  /api/appointments/public/availability?date=YYYY-MM-DD&assignee=ID` — slots ocupados ese día
- `POST /api/appointments/public` — crear cita pública

### Autenticadas
- `GET    /api/appointments?from=ISO&to=ISO&status=&assignedTo=` — listar (rango + filtros)
- `POST   /api/appointments` — crear cita manual (admin)
- `GET    /api/appointments/:id` — detalle
- `PATCH  /api/appointments/:id` — actualizar status / staffNotes / reasignar
- `DELETE /api/appointments/:id` — eliminar (admin)

## Status enum
`scheduled` → `confirmed` → `completed` (flujo normal)
`cancelled` (en cualquier momento)
`no_show` (admin marca cuando cliente no asiste)

## Conflict detection
Dos citas con el mismo `assignedTo` que se solapan → **409 Conflict** con mensaje claro.
La detección es server-side, no se puede bypasear desde la UI.

## Notificaciones automáticas
Al crear cita (pública o admin) con `assignedTo`:
- `notify({ recipient, type: 'appointment.created', title: '📅 Nueva cita: <subject>', ... })`

Al cambiar status:
- `notify({ type: 'appointment.status_changed', ... })` (si status cambia a cancelled o completed)

## Audit log
- `appointment.create` (category: `appointment`)
- `appointment.update` (incluye cambio de status)
- `appointment.delete`

## Frontend

### Admin (`/appointments`)
- Toolbar: Calendario/Lista, Nueva cita
- Filtros: status, assignedTo
- Vista calendario: grid mensual con dots de colores por status, click en día muestra citas
- Vista lista: cronológica
- Modal de edición: detalle, cambio de status, notas del equipo, eliminar

### Usuario (`/my-appointments`)
- Calendar overview + tabs Próximas/Pasadas
- Cancelar cita propia (si status es `scheduled` o `confirmed` y aún no pasó)
- Link a "Agendar nueva cita" cuando no hay próximas

### Landing (`/`)
- 3 pasos: 1) calendario (deshabilita domingos y pasados), 2) slot grid 9:00-18:30 en intervalos de 30min, 3) form (nombre, email, teléfono, asunto, descripción, modalidad, asignado a)
- Estado de éxito con resumen + link a "Mis citas" si está logueado
