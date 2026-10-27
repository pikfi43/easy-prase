import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { config, promotionCategories, todayIso } from './config.js';
import { attachUser, corsOptions, errorHandler, notFoundHandler, rateLimit, requestLogger } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { adminUsersRouter, catalogRouter, categoriesRouter, organizationsRouter, productsRouter, promotionsRouter } from './routes/catalog.js';
import { assistantRouter, eventsRouter } from './routes/content.js';
import { favoritesRouter, moderationRouter, notificationsRouter } from './routes/moderation.js';
import { statsRouter } from './routes/stats.js';
import { uploadsRouter } from './routes/uploads.js';
import { sourcesRouter } from './routes/sources.js';
import { CategoryModel, EventModel, NotificationModel, OrganizationModel, ProductModel, PromotionModel, UserModel } from './models/index.js';
import { logger } from './lib/logger.js';
import { startImportCron } from './importers/cron.js';
import { connectDatabase } from './lib/database.js';
import { discoveryRouter, ensureSourceStoreMappings } from './routes/discovery.js';

const app = express();

app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use(requestLogger);
app.use(attachUser);

app.get('/api/health', (_request, response) => {
  response.json({ service: 'EasyPrice API', status: 'ok' });
});

app.use('/api', discoveryRouter);
app.use('/api/auth', rateLimit(30, 60 * 1000), authRouter);
app.use('/api/organizations', organizationsRouter);
app.use('/api/promotions', promotionsRouter);
app.use('/api/products', productsRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/events', eventsRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/admin/moderation', moderationRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/admin/data-sources', sourcesRouter);
app.use('/api/assistant', rateLimit(20, 60 * 1000), assistantRouter);
app.use('/api/stats', statsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/uploads', express.static('uploads'));

app.use(notFoundHandler);
app.use(errorHandler);

const seedCategories = async () => {
  const count = await CategoryModel.countDocuments();
  if (count > 0) return;
  await CategoryModel.insertMany(
    promotionCategories.map((title) => ({
      id: crypto.randomUUID(),
      title,
      kind: 'promotion',
      slug: title.toLocaleLowerCase(),
    })),
  );
};

const cleanupExpired = async () => {
  const today = todayIso();
  await Promise.all([
    PromotionModel.updateMany({ status: 'published', endDate: { $lt: today } }, { $set: { status: 'expired' } }),
    EventModel.deleteMany({ date: { $lt: today } }),
  ]);
};

const start = async () => {
  try {
    memoryMongo = await connectDatabase();
    await seedCategories();
    await ensureSourceStoreMappings();
    await cleanupExpired();
    importTimers = startImportCron();
    cleanupTimer = setInterval(() => {
      void cleanupExpired().catch((error: unknown) => logger.error('cleanup failed', { error: String(error) }));
    }, 60 * 60 * 1000);
    if (process.env.NODE_ENV === 'test') return;
    serverInstance = app.listen(config.port, () => logger.info(`EasyPrice API is running on http://localhost:${config.port}`));
  } catch (error) {
    if (!memoryMongo && process.env.MONGODB_MEMORY !== '1' && process.env.NODE_ENV !== 'test') {
      logger.warn('MongoDB недоступна — пробуем встроенный in-memory режим (MONGODB_MEMORY=1)');
      process.env.MONGODB_MEMORY = '1';
      delete process.env.MONGODB_URI;
      await start();
      return;
    }
    logger.error(`Не удалось подключиться к MongoDB (${config.mongoUrl})`, { error: String(error) });
    process.exitCode = 1;
  }
};

let cleanupTimer: ReturnType<typeof setInterval> | undefined;
let importTimers: ReturnType<typeof setInterval>[] = [];
let serverInstance: import('node:http').Server | undefined;
let memoryMongo: import('mongodb-memory-server').MongoMemoryServer | undefined;

export const shutdown = async () => {
  if (cleanupTimer) clearInterval(cleanupTimer);
  importTimers.forEach(clearInterval);
  if (serverInstance) await new Promise<void>((resolve) => serverInstance!.close(() => resolve()));
  await mongoose.disconnect();
  if (memoryMongo) await memoryMongo.stop();
};

void start();

export { app, mongoose, UserModel, OrganizationModel, PromotionModel, NotificationModel, ProductModel };
