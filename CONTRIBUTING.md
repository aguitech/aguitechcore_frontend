# Contribuir

## Setup local

```bash
# Clonar
git clone https://github.com/aguitech/aguitechcore.git
cd aguitechcore

# Backend
cd server && npm install
cp .env.example .env  # editar MONGO_URI, JWT_SECRET
npm run dev           # puerto 4000

# Frontend (otra terminal)
cd client && npm install
npm run dev           # puerto 5173

# Tests (otra terminal, con server corriendo)
cd ../
python3 tests/test_system.py --base http://localhost:4000
```

## Convenciones

### Código
- **Backend**: ES modules (`"type": "module"`), controllers en `controllers/`, models en `models/`, routes en `routes/`
- **Frontend**: Vite + React 18, pages en `src/pages/`, components en `src/components/`, services en `src/services/`
- **Naming**: `camelCase` para variables/funciones, `PascalCase` para componentes y modelos
- **Imports**: relativos con extensión explícita (`.js`, `.jsx`)

### Git
- Commits en español (matching tone del proyecto)
- Mensajes: `<tipo>(<scope>): <descripción>`
  - `feat(blog): add image gallery in editor`
  - `fix(auth): bcrypt password on save`
  - `docs: add DATA-MODEL.md`
  - `chore: bump dependencies`
- PRs con descripción de qué cambia y por qué
- Squash merge

### Auditoría
**Toda acción que cree/modifique/borre datos debe llamar `audit()`** con `req, action, category, targetType, targetId, targetLabel`.

**Toda asignación o mención debe llamar `notify()`** con `recipient, type, title, body, link`.

### Tests
Antes de cada PR:
```bash
python3 tests/test_system.py --base http://localhost:4000
```
Debe pasar 31/31.

## Estructura

```
aguitechcore/
├── client/                  # React + Vite
│   ├── src/
│   │   ├── components/     # Layout, NotificationBell, ErrorBoundary
│   │   ├── pages/          # Dashboard, Blog, Chat, etc.
│   │   ├── services/       # api.js (axios client)
│   │   ├── context/        # AuthContext
│   │   ├── hooks/          # custom hooks
│   │   └── styles/         # CSS global + por feature
│   └── package.json
├── server/                  # Express + Mongoose
│   ├── src/
│   │   ├── controllers/    # CRUD handlers
│   │   ├── models/         # Mongoose schemas
│   │   ├── routes/         # Express routers
│   │   ├── lib/            # notify, audit, fileGuard
│   │   ├── middleware/     # auth, error
│   │   └── index.js        # entry point
│   └── package.json
├── tests/
│   └── test_system.py      # E2E suite (stdlib only)
├── docs/                    # Documentation
│   ├── DATA-MODEL.md
│   ├── DEPLOY.md
│   ├── TESTING.md
│   ├── APPOINTMENTS.md
│   ├── NOTIFICATIONS.md
│   ├── AUDIT-LOG.md
│   ├── BLOG.md
│   ├── LANDING.md
│   ├── CLIENTS.md
│   ├── PROJECTS.md
│   ├── TASKS.md
│   ├── CALENDAR.md
│   ├── CHAT.md
│   ├── DASHBOARD.md
│   ├── MCP-SERVER.md
│   └── PDF-EXPORT.md
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
└── .env.example
```

## Licencia
MIT — Aguitech © 2026
