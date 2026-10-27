import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdir } from 'node:fs/promises';
import { config } from '../config.js';

export async function connectDatabase() {
  let memoryServer: MongoMemoryServer | undefined;
  const shouldUseMemory = process.env.NODE_ENV === 'test' || process.env.MONGODB_MEMORY === '1' || process.env.MONGODB_URI === undefined;
  const startMemory = async () => {
    if (config.memoryDbPath) await mkdir(config.memoryDbPath, { recursive: true });
    try {
      memoryServer = await MongoMemoryServer.create({
        binary: { version: process.env.MONGOMS_VERSION ?? '6.0.14' },
        ...(config.memoryDbPath ? { instance: { dbPath: config.memoryDbPath, storageEngine: 'wiredTiger' } } : {}),
      });
    } catch (error) {
      if (config.memoryDbPath && String(error).includes('DBPathInUse')) {
        throw new Error('Локальная база уже используется другим процессом. Остановите backend перед запуском CLI-импорта или подключите отдельный MongoDB-сервер.');
      }
      throw error;
    }
    process.env.MONGODB_URI = memoryServer.getUri('easyprice');
    config.mongoUrl = process.env.MONGODB_URI;
    await mongoose.connect(config.mongoUrl, {
      serverSelectionTimeoutMS: 10_000,
      ...(config.memoryDbPath ? { writeConcern: { w: 1, j: true } } : {}),
    });
  };
  if (shouldUseMemory) {
    await startMemory();
  } else {
    try {
      await mongoose.connect(config.mongoUrl, { serverSelectionTimeoutMS: 2_500 });
    } catch (error) {
      if (!config.memoryDbPath || process.env.NODE_ENV === 'test') throw error;
      process.stderr.write('MongoDB недоступна — используется локальное постоянное хранилище.\n');
      await startMemory();
    }
  }
  return memoryServer;
}
