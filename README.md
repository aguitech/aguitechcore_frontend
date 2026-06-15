# Aguittech Core — MERN + JWT

Arquitectura base del **core de Aguittech** (agencia de marketing digital).
Stack: **MongoDB + Express + React (Vite) + Node.js** con autenticación **JWT**.

## Estructura

```
aguittech-core/
├── server/   # API REST (Express + Mongoose)
└── client/   # Web app (React + Vite)
```

## Requisitos
- Node.js 18+
- MongoDB corriendo local (`mongod` o `brew services start mongodb-community`)
- npm

## Arranque rápido (3 pasos)

### 1. Backend
```bash
cd server
cp .env.example .env       # ajusta JWT_SECRET si quieres
npm install
npm run seed               # crea admin@aguittech.com / admin123 + proyectos demo
npm run dev                # http://localhost:4000
```

### 2. Frontend
```bash
cd client
cp .env.example .env
npm install
npm run dev                # http://localhost:5173
```

### 3. Login
Abre `http://localhost:5173`, entra con:
- **email:** `admin@aguittech.com`
- **password:** `admin123`

## Endpoints

| Método | Ruta                 | Auth | Descripción                        |
|--------|----------------------|------|------------------------------------|
| GET    | `/api/health`        | No   | Healthcheck                        |
| POST   | `/api/auth/register` | No   | Crear cuenta                       |
| POST   | `/api/auth/login`    | No   | Login → devuelve JWT               |
| GET    | `/api/auth/me`       | Sí   | Usuario actual                     |
| GET    | `/api/dashboard/stats`    | Sí | KPIs (total, activos, etc.)        |
| GET    | `/api/dashboard/projects` | Sí | Lista proyectos del usuario        |
| POST   | `/api/dashboard/projects` | Sí | Crear proyecto                     |

## Producción
- Cambia `MONGO_URI` a **MongoDB Atlas** (free tier)
- Cambia `JWT_SECRET` por algo aleatorio largo
- Backend → Render / Railway
- Frontend → Vercel / Netlify (`VITE_API_URL` apuntando al backend desplegado)
