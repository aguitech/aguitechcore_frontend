# Aguitech Core

Sistema de gestión integral (MERN) para Aguitech — clientes, proyectos, tareas, citas, chat, blog y bitácora de auditoría.

🌐 **Producción:** https://sxxysecret.com
📦 **Stack:** MongoDB + Express + React (Vite) + Node.js
🔐 **Auth:** JWT (Bearer token, 7 días)

---

## Inicio rápido

```bash
# Backend
cd server
npm install
cp .env.example .env   # editar MONGO_URI, JWT_SECRET, CLIENT_ORIGIN
npm run dev            # http://localhost:4000

# Frontend
cd client
npm install
npm run dev            # http://localhost:5173
```

## Tests E2E

```bash
python3 tests/test_system.py                                    # contra producción
python3 tests/test_system.py --base http://localhost:4000       # contra local
```

10 secciones, 31 asserts, stdlib puro (sin pip). Cubre: health, auth, public blog, public appointment booking con 409 en overlap, admin appointment CRUD, notifications, audit log + CSV export, RBAC, cleanup.

## Deploy

Ver [`docs/DEPLOY.md`](docs/DEPLOY.md) para la receta específica del VPS (EasyPanel + Traefik + 2 contenedores).

---

## Features

| Feature | URL | Auth | Documentación |
|---|---|---|---|
| 📊 Dashboard | `/dashboard` | user | [`docs/DASHBOARD.md`](docs/DASHBOARD.md) |
| 👥 Clientes | `/clients` | user | [`docs/CLIENTS.md`](docs/CLIENTS.md) |
| 📁 Proyectos | `/projects` | user | [`docs/PROJECTS.md`](docs/PROJECTS.md) |
| ✅ Tareas | `/tasks` | user | [`docs/TASKS.md`](docs/TASKS.md) |
| 📅 Calendario | `/calendar` | user | [`docs/CALENDAR.md`](docs/CALENDAR.md) |
| 💬 Chat | `/chat` | user | [`docs/CHAT.md`](docs/CHAT.md) |
| 📰 Blog | `/blog` | user | [`docs/BLOG.md`](docs/BLOG.md) |
| 📝 Blog público | `/public/blog` | público | [`docs/BLOG.md`](docs/BLOG.md) |
| 📅 Citas (admin) | `/appointments` | user | [`docs/APPOINTMENTS.md`](docs/APPOINTMENTS.md) |
| 📅 Mis citas | `/my-appointments` | user | [`docs/APPOINTMENTS.md`](docs/APPOINTMENTS.md) |
| 🔔 Notificaciones | `/notifications` | user | [`docs/NOTIFICATIONS.md`](docs/NOTIFICATIONS.md) |
| 📋 Bitácora (audit) | `/audit-log` | **admin** | [`docs/AUDIT-LOG.md`](docs/AUDIT-LOG.md) |
| 🚀 Landing + agendar | `/` | público | [`docs/LANDING.md`](docs/LANDING.md) |

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    Traefik (HTTPS)                  │
└────────────┬───────────────────┬────────────────────┘
             │ /                 │ /api/*
             ▼                   ▼
   ┌──────────────────┐  ┌──────────────────┐
   │ web_sxxysecret_  │  │ web_sxxysecret_  │
   │ web (nginx)      │  │ api (node)       │
   │ /code/client/    │  │ /code/server/    │
   │ dist/            │  │ src/index.js     │
   └──────────────────┘  └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ MongoDB          │
                        │ db_aguitechcore  │
                        └──────────────────┘
```

## Modelo de datos

Ver [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) para el detalle de los 13 modelos.

```
User       ApiKey       Client       Project      Task
Conversation  Message   Post        Category
Comment      Link       Attachment  Appointment  Notification  AuditLog
```

## Permisos (RBAC)

| Recurso | Admin | Owner/Author | Member | Other |
|---|---|---|---|---|
| Citas | ✅ | ✅ | ✅ | crear propias |
| Bitácora (audit) | ✅ | — | — | — |
| Notificaciones | ✅ | propias | propias | propias |
| Posts (blog) | ✅ | ✅ (author) | — | — |
| Projects | ✅ | ✅ (owner) | ver si member | — |
| Tasks | ✅ | ✅ (assignee/owner) | — | — |
| Users | ✅ | — | — | — |

## Sistema de notificaciones

Disparadores automáticos (server-side):
- `chat.message` — al enviar mensaje en cualquier chat
- `task.assigned` — al asignar tarea a otro usuario
- `task.completed` — al cambiar status a `hecho`
- `appointment.created` — al crear cita con assignedTo
- `appointment.status_changed` — al cambiar status de cita
- `post.commented` — al comentar en un post del blog
- `client.assigned` — al asignar cliente

Frontend: bell con badge rojo en top bar, dropdown con últimas 10, polling cada 30s.

## Bitácora (audit log)

Acciones registradas automáticamente:
- `auth.login` / `auth.logout`
- `task.create` / `task.update` / `task.delete`
- `chat.create` / `chat.send_message`
- `appointment.create` / `appointment.update` / `appointment.delete`
- `post.create` / `post.update` / `post.delete`
- `client.create` / `client.update` / `client.delete`
- `project.create` / `project.update` / `project.delete`
- `user.role_change` / `user.create` / `user.delete`

Admin-only. Filtros: category, action, actor, búsqueda libre, rango de fechas. CSV export con BOM.

## Licencia

MIT — Aguitech © 2026
