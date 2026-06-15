import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Project from './models/Project.js';

dotenv.config();

async function seed() {
  await connectDB();
  await Project.deleteMany({});
  await User.deleteMany({ email: 'admin@aguittech.com' });

  const admin = await User.create({
    name: 'Héctor Admin',
    email: 'admin@aguittech.com',
    password: 'admin123',
    role: 'admin',
  });

  await Project.insertMany([
    { title: 'Campaña Facebook Q3', client: 'Cliente A', status: 'activo', progress: 65, owner: admin._id },
    { title: 'Rediseño Web', client: 'Cliente B', status: 'activo', progress: 40, owner: admin._id },
    { title: 'SEO Local', client: 'Cliente C', status: 'completado', progress: 100, owner: admin._id },
    { title: 'Branding Restaurante', client: 'Cliente D', status: 'pausado', progress: 25, owner: admin._id },
  ]);

  console.log('🌱 Seed listo. Login: admin@aguittech.com / admin123');
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
