import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import { EventModel } from '../models/index.js';
import { todayIso } from '../config.js';
import { handleAssistantQuery } from '../lib/assistant.js';

export const eventsRouter = Router();
export const assistantRouter = Router();

eventsRouter.get('/', async (request, response) => {
  const city = String(request.query.city ?? '').trim();
  const today = todayIso();
  await EventModel.deleteMany({ date: { $lt: today } });
  const filter: Record<string, unknown> = {};
  if (city) filter.city = city;
  const events = await EventModel.find(filter).sort({ date: 1 }).limit(100).lean();
  response.json({ events });
});

eventsRouter.post('/', requireRole(['supplier', 'admin']), async (request, response) => {
  const { title, description = '', date, address = '' } = request.body as Partial<{ title: string; description: string; date: string; address: string }>;
  if (!title?.trim() || !date) {
    response.status(400).json({ error: 'Название и дата мероприятия обязательны' });
    return;
  }
  const user = request.user!;
  const event = await EventModel.create({ id: crypto.randomUUID(), title: title.trim(), description: String(description).trim(), date, address: String(address).trim(), ownerId: user.id, city: user.city });
  response.status(201).json({ event });
});

eventsRouter.patch('/:id', requireAuth, async (request, response) => {
  const user = request.user!;
  const filter: Record<string, unknown> = { id: request.params.id };
  if (user.role !== 'admin') filter.ownerId = user.id;
  const updates: Record<string, string> = {};
  for (const field of ['title', 'description', 'date', 'address'] as const) {
    const value = request.body?.[field];
    if (typeof value === 'string' && value.trim()) updates[field] = value.trim();
  }
  const event = await EventModel.findOneAndUpdate(filter, updates, { returnDocument: 'after' }).lean();
  if (!event) {
    response.status(404).json({ error: 'Мероприятие не найдено' });
    return;
  }
  response.json({ event });
});

eventsRouter.delete('/:id', requireAuth, async (request, response) => {
  const user = request.user!;
  const filter: Record<string, unknown> = { id: request.params.id };
  if (user.role !== 'admin') filter.ownerId = user.id;
  const deleted = await EventModel.findOneAndDelete(filter);
  if (!deleted) {
    response.status(404).json({ error: 'Мероприятие не найдено' });
    return;
  }
  response.json({ success: true });
});

assistantRouter.post('/', async (request, response) => {
  const body = request.body as { query?: string; sessionId?: string; city?: string; category?: string; lat?: number; lng?: number };
  const query = String(body.query ?? '').trim();
  if (!query) {
    response.status(400).json({ error: 'Напишите вопрос ассистенту' });
    return;
  }
  try {
    const result = await handleAssistantQuery({
      query,
      sessionId: body.sessionId ? String(body.sessionId) : undefined,
      city: body.city ? String(body.city) : request.user?.city,
      category: body.category ? String(body.category) : request.user?.category,
      lat: Number(body.lat),
      lng: Number(body.lng),
    });
    logger.info('assistant query', { query, hits: result.results.length });
    response.json(result);
  } catch (error) {
    logger.error('assistant failed', { query, error: error instanceof Error ? error.message : error });
    response.status(500).json({ answer: 'Что-то пошло не так при поиске. Попробуйте переформулировать запрос.', results: [] });
  }
});
