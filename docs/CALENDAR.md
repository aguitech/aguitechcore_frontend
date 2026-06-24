# Calendario

Vista unificada de tareas con dueDate + citas, en formato mes/semana.

## URLs
- `/calendar` — vista de calendario

## API
Re-usa los endpoints de tasks y appointments (no tiene endpoint propio).

## Features
- Mes / semana / día
- Filtros por tipo (tareas, citas, ambos)
- Click en evento → drawer con detalle
- Drag-drop para reagendar (PATCH dueDate / startsAt)
- Color por status/priority
