import mongoose from 'mongoose';
import 'dotenv/config';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Conversation from './models/Conversation.js';
import Message from './models/Message.js';

async function seed() {
  await connectDB();
  console.log('🌱 Seeding chat conversations...');

  // Limpiar conversaciones y mensajes previos
  await Conversation.deleteMany({});
  await Message.deleteMany({});
  console.log('   conversaciones y mensajes anteriores eliminados');

  // Obtener usuarios existentes (no crear nuevos)
  const hector = await User.findOne({ email: 'hector@aguitech.com' });
  const memo = await User.findOne({ email: 'memo@codimexa.com' });
  const maria = await User.findOne({ email: 'maria@aguittech.com' });
  const admin = await User.findOne({ email: 'admin@aguittech.com' });

  if (!hector || !memo || !maria) {
    console.log('⚠️  Usuarios faltantes. Asegúrate de tener: hector, memo, maria en la BD.');
    process.exit(1);
  }

  // Helper: build pair key
  const buildPairKey = (a, b) => [a.toString(), b.toString()].sort().join(':');

  // Conversación 1: Hector <-> Memo
  const conv1 = await Conversation.create({
    type: 'direct',
    pairKey: buildPairKey(hector._id, memo._id),
    participants: [{ user: hector._id }, { user: memo._id }],
    lastMessageAt: new Date(),
  });
  const m1 = await Message.insertMany([
    {
      conversation: conv1._id,
      sender: memo._id,
      text: '¡Hola Hector! Ya pude entrar al sistema. Todo se ve increíble 🔥',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3), // 3h ago
    },
    {
      conversation: conv1._id,
      sender: hector._id,
      text: '¡Qué bueno, bro! Bienvenido al equipo 💪 Ya tienes acceso a tus proyectos.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3 + 60000),
    },
    {
      conversation: conv1._id,
      sender: memo._id,
      text: 'Gracias. ¿Cuándo empezamos con el primer sprint?',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      conversation: conv1._id,
      sender: hector._id,
      text: 'Mañana lunes arrancamos. Te paso los detalles por aquí.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2 + 30000),
    },
    {
      conversation: conv1._id,
      sender: memo._id,
      text: '¡Va! Aquí andamos 🤙',
      createdAt: new Date(Date.now() - 1000 * 60 * 5), // 5 min ago
    },
  ]);
  conv1.lastMessage = m1[m1.length - 1]._id;
  conv1.lastMessageAt = m1[m1.length - 1].createdAt;
  await conv1.save();
  console.log(`   ✅ Conversación Hector<->Memo: ${m1.length} mensajes`);

  // Conversación 2: Hector <-> Maria
  if (maria) {
    const conv2 = await Conversation.create({
      type: 'direct',
      pairKey: buildPairKey(hector._id, maria._id),
      participants: [{ user: hector._id }, { user: maria._id }],
      lastMessageAt: new Date(),
    });
    const m2 = await Message.insertMany([
      {
        conversation: conv2._id,
        sender: maria._id,
        text: 'Hector, ¿ya viste las creatividades para Boutique Luna?',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      },
      {
        conversation: conv2._id,
        sender: hector._id,
        text: 'Sí, quedaron chidas. Le mando feedback mañana.',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 + 600000),
      },
      {
        conversation: conv2._id,
        sender: maria._id,
        text: '👍 Perfecto, gracias!',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20),
      },
    ]);
    conv2.lastMessage = m2[m2.length - 1]._id;
    conv2.lastMessageAt = m2[m2.length - 1].createdAt;
    await conv2.save();
    console.log(`   ✅ Conversación Hector<->Maria: ${m2.length} mensajes`);
  }

  // Conversación 3: Admin <-> Memo
  if (admin && admin.email !== hector.email) {
    const conv3 = await Conversation.create({
      type: 'direct',
      pairKey: buildPairKey(admin._id, memo._id),
      participants: [{ user: admin._id }, { user: memo._id }],
      lastMessageAt: new Date(),
    });
    const m3 = await Message.insertMany([
      {
        conversation: conv3._id,
        sender: admin._id,
        text: 'Memo, te dejo agregado a los proyectos de Ascend System y Hector.',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
      },
      {
        conversation: conv3._id,
        sender: memo._id,
        text: '¡Listo! Ya entré y los vi. Gracias!',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
      },
    ]);
    conv3.lastMessage = m3[m3.length - 1]._id;
    conv3.lastMessageAt = m3[m3.length - 1].createdAt;
    await conv3.save();
    console.log(`   ✅ Conversación Admin<->Memo: ${m3.length} mensajes`);
  }

  console.log('');
  console.log('🎉 Seed de chat completo. Recarga https://sxxysecret.com/chat');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
