import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import { AnalyticsEventModel, FavoriteModel, NotificationModel, OrganizationModel, ProductModel, PromotionModel, UserModel } from '../models/index.js';

const notify = async (userId: string, kind: string, title: string, body = '', link?: string) => {
  await NotificationModel.create({ id: crypto.randomUUID(), userId, kind, title, body, link, createdAt: new Date().toISOString(), read: false });
};

export const favoritesRouter = Router();

favoritesRouter.use(requireAuth);

favoritesRouter.get('/', async (request, response) => {
  const items = await FavoriteModel.find({ userId: request.user!.id }).lean();
  response.json({ favorites: items.map((item) => ({ targetType: item.targetType, targetId: item.targetId })) });
});

favoritesRouter.post('/', async (request, response) => {
  const { targetType, targetId } = request.body as { targetType?: string; targetId?: string };
  if (!['organization', 'promotion', 'product'].includes(String(targetType)) || !targetId) {
    response.status(400).json({ error: 'Некорректные данные избранного' });
    return;
  }
  try {
    await FavoriteModel.create({ userId: request.user!.id, targetType: targetType as 'organization' | 'promotion' | 'product', targetId });
    await AnalyticsEventModel.create({ id: crypto.randomUUID(), eventType: 'favorite_add', ...(targetType === 'organization' ? { organizationId: targetId } : {}), ...(targetType === 'promotion' ? { promotionId: targetId } : {}), ...(targetType === 'product' ? { productId: targetId } : {}), createdAt: new Date().toISOString() });
  } catch {
    // already exists — idempotent
  }
  response.status(201).json({ success: true });
});

favoritesRouter.delete('/:targetType/:targetId', async (request, response) => {
  const targetType = request.params.targetType;
  if (!['organization', 'promotion', 'product'].includes(targetType)) {
    response.status(400).json({ error: 'Некорректный тип объекта' });
    return;
  }
  await FavoriteModel.deleteOne({ userId: request.user!.id, targetType: targetType as 'organization' | 'promotion' | 'product', targetId: request.params.targetId });
  response.json({ success: true });
});

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (request, response) => {
  const items = await NotificationModel.find({ userId: request.user!.id }).sort({ createdAt: -1 }).limit(100).lean();
  const unread = await NotificationModel.countDocuments({ userId: request.user!.id, read: false });
  response.json({
    notifications: items.map((item) => ({ id: item.id, title: item.title, body: item.body, kind: item.kind, read: item.read, createdAt: item.createdAt, link: item.link })),
    unread,
  });
});

notificationsRouter.post('/read-all', async (request, response) => {
  await NotificationModel.updateMany({ userId: request.user!.id, read: false }, { $set: { read: true } });
  response.json({ success: true });
});

notificationsRouter.post('/:id/read', async (request, response) => {
  await NotificationModel.updateOne({ id: request.params.id, userId: request.user!.id }, { $set: { read: true } });
  response.json({ success: true });
});

export const moderationRouter = Router();

moderationRouter.use(requireRole(['admin']));

moderationRouter.get('/queue', async (_request, response) => {
  const [organizations, promotions, products] = await Promise.all([
    OrganizationModel.find({ status: 'pending_review' }).sort({ id: -1 }).lean(),
    PromotionModel.find({ status: 'pending_review' }).sort({ id: -1 }).lean(),
    ProductModel.find({ status: 'pending_review' }).sort({ id: -1 }).lean(),
  ]);
  response.json({ organizations, promotions, products });
});

const applyModeration = async <T extends { id: string; ownerId: string }>(
  model: any,
  id: string,
  decision: 'approve' | 'reject',
  reason: string,
  onDecision: (entity: T) => Promise<void>,
): Promise<T | null> => {
  const status = decision === 'approve' ? 'published' : 'rejected';
  const updates: Record<string, unknown> = { status, rejectReason: decision === 'reject' ? reason : '' };
  if (model === OrganizationModel) {
    updates.verificationStatus = decision === 'approve' ? 'verified' : 'rejected';
    updates.verified = decision === 'approve';
    if (decision === 'approve') updates.verifiedOwnerId = (await model.findOne({ id }).select('ownerId').lean())?.ownerId ?? '';
  }
  const entity = await model.findOneAndUpdate(
    { id },
    updates,
    { returnDocument: 'after' },
  ).lean();
  if (!entity) return null;
  await onDecision(entity);
  return entity;
};

moderationRouter.post('/organizations/:id', async (request, response) => {
  const { decision, reason = '' } = request.body as { decision?: string; reason?: string };
  if (decision !== 'approve' && decision !== 'reject') {
    response.status(400).json({ error: 'Некорректное решение' });
    return;
  }
  const cleanReason = String(reason).trim();
  if (decision === 'reject' && cleanReason.length < 3) { response.status(400).json({ error: 'Укажите причину отклонения' }); return; }
  const organization = await applyModeration<any>(OrganizationModel, request.params.id, decision, cleanReason, async (entity) => {
    if (decision === 'approve') {
      await notify(entity.ownerId, 'organization', `Организация «${entity.name}» одобрена`, 'Ваша организация опубликована в каталоге.', `/organizations/${entity.id}`);
    } else {
      await notify(entity.ownerId, 'organization', `Организация «${entity.name}» отклонена`, cleanReason, `/supplier`);
    }
    logger.info('organization moderated', { organizationId: entity.id, decision, admin: request.user!.id });
  });
  if (!organization) {
    response.status(404).json({ error: 'Организация не найдена' });
    return;
  }
  response.json({ organization });
});

moderationRouter.post('/promotions/:id', async (request, response) => {
  const { decision, reason = '' } = request.body as { decision?: string; reason?: string };
  if (decision !== 'approve' && decision !== 'reject') {
    response.status(400).json({ error: 'Некорректное решение' });
    return;
  }
  const cleanReason = String(reason).trim();
  if (decision === 'reject' && cleanReason.length < 3) { response.status(400).json({ error: 'Укажите причину отклонения' }); return; }
  if (decision === 'approve') {
    const pending = await PromotionModel.findOne({ id: request.params.id }).select('organizationId').lean();
    if (pending?.organizationId) {
      const organization = await OrganizationModel.findOne({ id: pending.organizationId, status: 'published', verified: true }).select('id').lean();
      if (!organization) { response.status(409).json({ error: 'Сначала подтвердите организацию' }); return; }
    }
  }
  const promotion = await applyModeration<any>(PromotionModel, request.params.id, decision, cleanReason, async (entity) => {
    if (decision === 'approve') {
      await notify(entity.ownerId, 'promotion', `Акция «${entity.title}» одобрена`, 'Ваша акция опубликована в каталоге.', `/promotions/${entity.id}`);
      const recipients = await UserModel.find({ city: entity.city, blocked: { $ne: true } }).select('id notificationSettings').lean();
      await NotificationModel.insertMany(recipients.filter((user) => user.notificationSettings?.newPromotions !== false).map((user) => ({
        id: crypto.randomUUID(), userId: user.id, kind: 'new_promotion', title: `Новая акция: ${entity.title}`,
        body: `${entity.place} · ${entity.value || 'Смотрите условия'}`, link: `/promotions/${entity.id}`, createdAt: new Date().toISOString(), read: false,
      })));
    } else {
      await notify(entity.ownerId, 'promotion', `Акция «${entity.title}» отклонена`, cleanReason, `/supplier`);
    }
    logger.info('promotion moderated', { promotionId: entity.id, decision, admin: request.user!.id });
  });
  if (!promotion) {
    response.status(404).json({ error: 'Акция не найдена' });
    return;
  }
  response.json({ promotion });
});

moderationRouter.post('/products/:id', async (request, response) => {
  const { decision, reason = '' } = request.body as { decision?: string; reason?: string };
  if (decision !== 'approve' && decision !== 'reject') {
    response.status(400).json({ error: 'Некорректное решение' });
    return;
  }
  const cleanReason = String(reason).trim();
  if (decision === 'reject' && cleanReason.length < 3) { response.status(400).json({ error: 'Укажите причину отклонения' }); return; }
  if (decision === 'approve') {
    const pending = await ProductModel.findOne({ id: request.params.id }).select('organizationId').lean();
    const organization = pending?.organizationId ? await OrganizationModel.findOne({ id: pending.organizationId, status: 'published', verified: true }).select('id').lean() : null;
    if (!organization) { response.status(409).json({ error: 'Сначала подтвердите организацию' }); return; }
  }
  const product = await applyModeration<any>(ProductModel, request.params.id, decision, cleanReason, async (entity) => {
    const organization = await OrganizationModel.findOne({ id: entity.organizationId }).lean();
    const ownerId = organization?.ownerId ?? entity.organizationId;
    if (decision === 'approve') {
      await notify(ownerId, 'product', `Товар «${entity.title}» одобрён`, 'Ваш товар опубликован в каталоге.');
    } else {
      await notify(ownerId, 'product', `Товар «${entity.title}» отклонён`, cleanReason);
    }
    logger.info('product moderated', { productId: entity.id, decision, admin: request.user!.id });
  });
  if (!product) {
    response.status(404).json({ error: 'Товар не найден' });
    return;
  }
  response.json({ product });
});
