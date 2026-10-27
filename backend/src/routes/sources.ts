import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { ImportLogModel, OrganizationModel, ProductModel, StoreOfferModel } from '../models/index.js';

export const sourcesRouter = Router();
sourcesRouter.use(requireRole(['admin']));

sourcesRouter.get('/', async (_request, response) => {
  const logs = await ImportLogModel.find().sort({ startedAt: -1 }).limit(500).lean();
  const [poi, offers] = await Promise.all([
    OrganizationModel.aggregate([{ $match: { source: 'osm' } }, { $count: 'count' }]),
    StoreOfferModel.aggregate([{ $group: { _id: '$source', count: { $sum: 1 }, updatedAt: { $max: '$fetchedAt' }, demo: { $max: '$demo' } } }]),
  ]);
  const offerBySource = new Map(offers.map((item: { _id: string; count: number; updatedAt?: string; demo?: boolean }) => [item._id, item]));
  const names = ['technodom', 'alser', 'toimart', 'arbuz', 'yandex-lavka', 'small', 'osm-kokshetau'];
  const sources = names.map((source) => {
    const latest = logs.find((item) => item.source === source);
    const offersForSource = offerBySource.get(source);
    return {
      source,
      lastImport: latest?.finishedAt ?? latest?.startedAt ?? offersForSource?.updatedAt ?? null,
      records: source === 'osm-kokshetau' ? (poi[0]?.count ?? 0) : offersForSource?.count ?? 0,
      status: latest?.status ?? (offersForSource ? 'SUCCESS' : 'NOT_IMPORTED'),
      demo: offersForSource?.demo ?? ['arbuz', 'yandex-lavka'].includes(source),
      lastLog: latest ?? null,
    };
  });
  response.json({ sources, logs: logs.slice(0, 100) });
});
