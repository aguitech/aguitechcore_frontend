import mongoose from 'mongoose';

export async function connectDB() {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/aguittech_core';
    await mongoose.connect(uri);
    console.log('✅ MongoDB conectado:', uri);
  } catch (err) {
    console.error('❌ Error MongoDB:', err.message);
    process.exit(1);
  }
}
