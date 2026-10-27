import type { NextFunction, Request, Response } from 'express';
import { readToken } from '../lib/hash.js';
import { UserModel } from '../models/index.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'supplier' | 'admin';
  category: string;
  city: string;
  phone?: string;
  blocked?: boolean;
  notificationSettings?: Record<string, boolean>;
};

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const attachUser = async (request: Request, _response: Response, next: NextFunction) => {
  try {
    const token = request.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return next();
    const payload = await readToken(token);
    if (!payload) return next();
    const user = await UserModel.findOne({ id: payload.sub }).lean();
    if (user) {
      request.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        category: user.category,
        city: user.city,
        phone: user.phone,
        blocked: user.blocked,
        notificationSettings: user.notificationSettings,
      };
    }
    next();
  } catch (error) {
    logger.error('attachUser failed', { error: String(error) });
    next();
  }
};

export const requireAuth = (request: Request, response: Response, next: NextFunction) => {
  if (!request.user) {
    response.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  if (request.user.blocked) {
    response.status(403).json({ error: 'Аккаунт заблокирован' });
    return;
  }
  next();
};

export const requireRole = (roles: Array<'user' | 'supplier' | 'admin'>) => (request: Request, response: Response, next: NextFunction) => {
  if (!request.user) {
    response.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  if (request.user.blocked) {
    response.status(403).json({ error: 'Аккаунт заблокирован' });
    return;
  }
  if (!roles.includes(request.user.role)) {
    response.status(403).json({ error: 'Недостаточно прав' });
    return;
  }
  next();
};

export const errorHandler = (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/only JPEG|file too large|Unexpected field/i.test(message)) {
    response.status(400).json({ error: 'Ошибка загрузки файла: допустимы JPEG, PNG, WebP до 5 МБ' });
    return;
  }
  logger.error('unhandled api error', { error: String(error) });
  response.status(500).json({ error: 'Внутренняя ошибка сервера' });
};

export const notFoundHandler = (_request: Request, response: Response) => {
  response.status(404).json({ error: 'Не найдено' });
};

export const requestLogger = (request: Request, response: Response, next: NextFunction) => {
  response.on('finish', () => {
    if (response.statusCode >= 400) {
      logger.warn('request failed', { method: request.method, path: request.path, status: response.statusCode });
    }
  });
  next();
};

export const corsOptions = {
  origin: config.allowedOrigins.includes('*') ? true : config.allowedOrigins,
};

// Simple in-memory rate limiter for auth and AI endpoints.
const buckets = new Map<string, { count: number; resetAt: number }>();

export const rateLimit = (limit: number, windowMs: number) => (request: Request, response: Response, next: NextFunction) => {
  const key = `${request.ip}:${request.baseUrl}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    response.status(429).json({ error: 'Слишком много запросов. Попробуйте позже.' });
    return;
  }
  next();
};

// Periodically drop stale buckets so the map does not grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, 60 * 1000).unref();
