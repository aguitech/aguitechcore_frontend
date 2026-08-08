import 'dotenv/config';
import { connectDB } from './config/db.js';
import Incident from './models/Incident.js';
import User from './models/User.js';

// ─────────────────────────────────────────────────────────────────
// INCIDENTS SEED — populates a handful of demo incidents so the
// /incidents page doesn't look empty after the feature goes live.
// Idempotent: skips if any incident already exists.
// ─────────────────────────────────────────────────────────────────

async function seed() {
  await connectDB();
  console.log('🌱 Seeding incidents...');

  const existing = await Incident.countDocuments();
  if (existing > 0) {
    console.log(`⏭️  Skipped — ${existing} incidents already exist.`);
    process.exit(0);
  }

  const hector = await User.findOne({ email: 'hector@aguitech.com' });
  const admin = await User.findOne({ email: 'admin@aguittech.com' });
  if (!hector || !admin) {
    console.log('⚠️  Required users not found (hector / admin). Run user seed first.');
    process.exit(1);
  }

  const incidents = [
    {
      title: 'Login devuelve 500 desde 14:30',
      description: 'El endpoint POST /api/auth/login está retornando 500 desde las 14:30. Logs muestran "Unexpected server error". Afecta a todos los usuarios. Workaround temporal: limpiar caché del navegador.',
      status: 'en_atencion',
      severity: 'S1',
      type: 'caida',
      impact: '200+ usuarios no pueden iniciar sesión durante 30 minutos.',
      owner: hector._id,
      assignee: hector._id,
    },
    {
      title: 'CSS del modal de clientes se ve raro en iOS Safari',
      description: 'El backdrop del modal de crear cliente aparece transparente en iOS Safari 17. Se ve el listado detrás. Bug visual, no afecta funcionalidad.',
      status: 'abierta',
      severity: 'S4',
      type: 'ux',
      owner: hector._id,
      assignee: admin._id,
    },
    {
      title: 'Query lenta en /api/dashboard cuando hay +50 proyectos',
      description: 'El endpoint tarda 4-5 segundos cuando hay muchos proyectos. Logs muestran N+1 query en Project.find().populate().',
      status: 'abierta',
      severity: 'S3',
      type: 'rendimiento',
      impact: 'Usuarios con muchos proyectos ven loading largo al abrir el dashboard.',
      owner: admin._id,
    },
    {
      title: 'Sesión expira demasiado rápido (24h)',
      description: 'Los usuarios piden sesiones más largas. El token JWT expira en 24h y los echa cuando están a media tarea.',
      status: 'resuelta',
      severity: 'S4',
      type: 'ux',
      resolution: 'Se aumentó el JWT expiresInSeconds a 7 días (604800s). Desplegado en staging, pendiente producción.',
      rootCause: 'Decisión original conservadora — 24h era poco para sesiones de trabajo largas.',
      prevention: 'Agregar setting configurable JWT_EXPIRES_IN_DAYS en .env para ajustar sin redeploy.',
      owner: hector._id,
      assignee: hector._id,
    },
  ];

  const created = await Incident.insertMany(incidents);
  console.log(`✅ Created ${created.length} incidents.`);
  for (const inc of created) {
    console.log(`   [${inc.severity}] ${inc.title} (${inc.status})`);
  }
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });