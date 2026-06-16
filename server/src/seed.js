import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Project from './models/Project.js';
import Client from './models/Client.js';
import Task from './models/Task.js';

dotenv.config();

async function seed() {
  await connectDB();
  await Promise.all([Project.deleteMany({}), User.deleteMany({ email: 'admin@aguittech.com' }), Client.deleteMany({}), Task.deleteMany({})]);

  const admin = await User.create({
    name: 'Héctor Admin',
    email: 'admin@aguittech.com',
    password: 'admin123',
    role: 'admin',
  });

  // Additional users so projects can have members
  const maria = await User.create({
    name: 'María López',
    email: 'maria@aguittech.com',
    password: 'maria123',
    role: 'manager',
  });
  const pedro = await User.create({
    name: 'Pedro Ramírez',
    email: 'pedro@aguittech.com',
    password: 'pedro123',
    role: 'member',
  });

  const clients = await Client.insertMany([
    { name: 'Ana Reyes', company: 'Boutique Luna', email: 'ana@luna.mx', phone: '+52 55 1111 2222', status: 'activo', owner: admin._id },
    { name: 'Carlos Méndez', company: 'Méndez Bienes Raíces', email: 'carlos@mendez.mx', phone: '+52 33 4444 5555', status: 'activo', owner: admin._id },
    { name: 'Sofía Castillo', company: 'Café Raíz', email: 'sofio@caferaiz.mx', phone: '+52 81 7777 8888', status: 'activo', owner: admin._id },
    { name: 'Roberto Núñez', company: 'Núñez Abogados', email: 'r.nunez@nunezabg.mx', phone: '+52 55 9999 0000', status: 'pausado', owner: admin._id },
  ]);

  // Find clients by company for the projects
  const luna = clients.find(c => c.company === 'Boutique Luna');
  const mendez = clients.find(c => c.company === 'Méndez Bienes Raíces');
  const raiz = clients.find(c => c.company === 'Café Raíz');
  const nunez = clients.find(c => c.company === 'Núñez Abogados');

  const projects = await Project.insertMany([
    { title: 'Campaña Facebook Q3', client: luna._id, status: 'activo', progress: 65, owner: admin._id, members: [{ user: maria._id, role: 'colaborador' }, { user: pedro._id, role: 'observador' }] },
    { title: 'Rediseño Web Méndez', client: mendez._id, status: 'activo', progress: 40, owner: admin._id, members: [{ user: maria._id, role: 'revisor' }] },
    { title: 'Branding Café Raíz', client: raiz._id, status: 'activo', progress: 80, owner: admin._id },
    { title: 'SEO Local Núñez', client: nunez._id, status: 'completado', progress: 100, owner: admin._id },
    { title: 'Estrategia IG Méndez', client: mendez._id, status: 'pausado', progress: 25, owner: admin._id, members: [{ user: pedro._id, role: 'colaborador' }] },
  ]);

  const today = new Date();
  const inDays = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);

  await Task.insertMany([
    { title: 'Diseñar 3 creatividades FB', status: 'en_curso', priority: 'alta', dueDate: inDays(1), project: projects[0]._id, client: clients[0]._id, owner: admin._id, description: 'Posts de la colección otoño' },
    { title: 'Aprobar copy con cliente', status: 'pendiente', priority: 'alta', dueDate: inDays(2), project: projects[0]._id, client: clients[0]._id, owner: admin._id },
    { title: 'Wireframe home', status: 'hecho', priority: 'media', dueDate: inDays(-3), project: projects[1]._id, client: clients[1]._id, owner: admin._id },
    { title: 'Reunión kickoff Café Raíz', status: 'pendiente', priority: 'media', dueDate: inDays(5), client: clients[2]._id, owner: admin._id },
    { title: 'Entrega logo final', status: 'en_curso', priority: 'alta', dueDate: inDays(3), project: projects[2]._id, client: clients[2]._id, owner: admin._id },
    { title: 'Reporte mensual IG', status: 'pendiente', priority: 'baja', dueDate: inDays(7), client: clients[1]._id, owner: admin._id },
    { title: 'Auditoría SEO on-page', status: 'hecho', priority: 'media', dueDate: inDays(-5), project: projects[3]._id, client: clients[3]._id, owner: admin._id },
    { title: 'Calendario editorial septiembre', status: 'pendiente', priority: 'alta', dueDate: inDays(10), project: projects[0]._id, owner: admin._id },
  ]);

  console.log('🌱 Seed completo. Login: admin@aguittech.com / admin123');
  console.log(`   ${clients.length} clientes, ${projects.length} proyectos, 8 tareas, 3 usuarios`);
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
