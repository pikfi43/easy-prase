import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { AnalyticsEventModel, FavoriteModel, OrganizationModel, ProductModel, PromotionModel, UserModel } from '../models/index.js';

export const statsRouter = Router();

const dayKey = (offsetDays: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - offsetDays);
  return date.toISOString().slice(0, 10);
};

statsRouter.get('/business', requireRole(['supplier', 'admin']), async (request, response) => {
  const user = request.user!;
  const organizations = await OrganizationModel.find(user.role === 'admin' ? {} : { ownerId: user.id }).lean();
  const organizationIds = organizations.map((item) => item.id);
  const promotions = await PromotionModel.find({ ownerId: user.id }).lean();
  const period = request.query.period === '7' ? 7 : 30;
  const favoritesCount = await FavoriteModel.countDocuments({ $or: [
    { targetType: 'promotion', targetId: { $in: promotions.map((item) => item.id) } },
    { targetType: 'organization', targetId: { $in: organizationIds } },
  ] });

  const products = await ProductModel.find({ organizationId: { $in: organizationIds } }).lean();

  const series: Record<string, { views: number; clicks: number; routes: number }> = {};
  for (let index = 0; index < period; index += 1) series[dayKey(index)] = { views: 0, clicks: 0, routes: 0 };
  const eventFilter = { $or: [
    { promotionId: { $in: promotions.map((item) => item.id) } },
    { organizationId: { $in: organizationIds } },
  ], createdAt: { $gte: `${dayKey(period - 1)}T00:00:00.000Z` } };
  const events = await AnalyticsEventModel.find(eventFilter).select('eventType createdAt').lean();
  for (const event of events) {
    const day = event.createdAt.slice(0, 10);
    const bucket = series[day];
    if (!bucket) continue;
    if (event.eventType === 'promotion_view' || event.eventType === 'organization_view') bucket.views += 1;
    if (event.eventType === 'promotion_click' || event.eventType === 'offer_click') bucket.clicks += 1;
    if (event.eventType === 'route') bucket.routes += 1;
  }
  const views = events.filter((item) => item.eventType === 'promotion_view' || item.eventType === 'organization_view').length;
  const clicks = events.filter((item) => item.eventType === 'promotion_click' || item.eventType === 'offer_click').length;
  const routes = events.filter((item) => item.eventType === 'route').length;

  response.json({
    stats: { views, clicks, routes, favorites: favoritesCount, ctr: views > 0 ? Math.round((clicks / views) * 1000) / 10 : 0, promotions: promotions.length, products: products.length },
    series,
    items: promotions.map((item) => ({ id: item.id, title: item.title, views: item.views ?? 0, clicks: item.clicks ?? 0, routes: item.routes ?? 0, status: item.status })),
  });
});

statsRouter.get('/admin', requireRole(['admin']), async (_request, response) => {
  const [users, organizations, promotions, products] = await Promise.all([
    UserModel.countDocuments(),
    OrganizationModel.countDocuments(),
    PromotionModel.countDocuments(),
    ProductModel.countDocuments(),
  ]);
  response.json({ stats: { users, organizations, promotions, products } });
});
