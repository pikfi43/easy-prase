import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 3000),
  mongoUrl: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/easyprice',
  jwtSecret: process.env.JWT_SECRET ?? 'easyprice-development-secret',
  jwtTtlMs: 24 * 60 * 60 * 1000,
  defaultCity: 'Кокшетау',
  allowedOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((origin) => origin.trim()).filter(Boolean),
  memoryDbPath: process.env.NODE_ENV === 'test' ? undefined : process.env.MONGODB_MEMORY_DB_PATH ?? path.resolve(currentDirectory, '../data/mongodb-wt'),
};

export const cities = [
  'Кокшетау',
  'Степногорск',
  'Щучинск',
  'Атбасар',
  'Акколь',
  'Ерейментау',
  'Есиль',
  'Макинск',
  'Державинск',
] as const;

export const userCategories = ['Обычный житель', 'Студент', 'Молодёжь', 'Пенсионер', 'Семья'] as const;

export const promotionCategories = ['Еда', 'Продукты', 'Одежда', 'Аптеки', 'Техника', 'Дом', 'Авто', 'Развлечения'] as const;

export const promotionStatuses = ['draft', 'pending_review', 'published', 'rejected', 'expired'] as const;

export const promotionTypes = ['percent', 'fixed_price', 'promo_code', 'student', 'pensioner', 'temporary'] as const;

export const todayIso = () => new Date().toISOString().slice(0, 10);
