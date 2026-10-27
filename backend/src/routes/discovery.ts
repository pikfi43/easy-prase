import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { todayIso } from '../config.js';
import {
  AnalyticsEventModel, OrganizationModel, ProductModel, PromotionModel, ReviewModel,
  SourceStoreMappingModel, StoreOfferModel, UserModel,
} from '../models/index.js';
import { normalizeSourceLink } from '../lib/external-url.js';
import { productSearchTerms } from '../lib/product-search.js';

export const discoveryRouter = Router();
const text = (value: unknown) => String(value ?? '').trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const publicOrganization = (organization: any) => organization && organization.status === 'published';

// Routing provider details stay on the server. OSRM returns a GeoJSON LineString.
discoveryRouter.get('/routes', async (request, response) => {
  const values = ['fromLat', 'fromLng', 'toLat', 'toLng'].map((key) => Number(request.query[key]));
  if (values.some((value) => !Number.isFinite(value)) || Math.abs(values[0]) > 90 || Math.abs(values[2]) > 90 || Math.abs(values[1]) > 180 || Math.abs(values[3]) > 180) {
    response.status(400).json({ error: 'Укажите корректные fromLat, fromLng, toLat и toLng' }); return;
  }
  const [fromLat, fromLng, toLat, toLng] = values;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { 'user-agent': 'EasyPrice/1.0 (city catalog routing)' } });
    if (!upstream.ok) throw new Error(`OSRM HTTP ${upstream.status}`);
    const payload = await upstream.json() as { code?: string; routes?: Array<{ geometry: unknown; distance: number; duration: number; legs?: Array<{ steps?: Array<{ name?: string; distance: number; duration: number; maneuver?: { type?: string; modifier?: string } }> }> }> };
    const route = payload.routes?.[0];
    if (!route || payload.code !== 'Ok') { response.status(404).json({ error: 'Маршрут для этих точек не найден' }); return; }
    const steps = (route.legs ?? []).flatMap((leg) => leg.steps ?? []).map((step) => ({ name: step.name ?? '', distance: step.distance, duration: step.duration, instruction: [step.maneuver?.type, step.maneuver?.modifier, step.name].filter(Boolean).join(' ') }));
    response.json({ geometry: route.geometry, distance: route.distance, duration: route.duration, steps });
  } catch {
    response.status(502).json({ error: 'Сервис маршрутизации временно недоступен. Повторите попытку позже.' });
  }
});

async function dealRows({ organizationId, city, search, limit = 200 }: { organizationId?: string; city?: string; search?: string; limit?: number } = {}) {
  const today = todayIso();
  const promotionFilter: Record<string, unknown> = { status: 'published', startDate: { $lte: today }, endDate: { $gte: today } };
  if (organizationId) promotionFilter.organizationId = organizationId;
  if (city) promotionFilter.city = city;
  const promotions = await PromotionModel.find(promotionFilter).sort({ endDate: 1 }).limit(limit).lean();
  const offerFilter: Record<string, unknown> = { oldPrice: { $gt: 0 }, $expr: { $gt: ['$oldPrice', '$price'] } };
  if (organizationId) offerFilter.organizationId = organizationId;
  if (city && city !== 'Кокшетау') offerFilter.sourceCity = city;
  if (city === 'Кокшетау') offerFilter.$or = [{ cityVerified: true }, { demo: true }];
  const offers = await StoreOfferModel.find(offerFilter).sort({ discountPercent: -1, price: 1 }).limit(limit).lean();
  const productIds = [...new Set(offers.map((offer) => offer.productId))];
  const products = await ProductModel.find({ id: { $in: productIds }, status: 'published' }).lean();
  const productMap = new Map(products.map((product) => [product.id, product]));
  const orgIds = [...new Set([...promotions.flatMap((item) => item.organizationId ? [item.organizationId] : []), ...offers.flatMap((item) => item.organizationId ? [item.organizationId] : [])])];
  const orgs = await OrganizationModel.find({ id: { $in: orgIds }, status: 'published' }).select('id name category address lat lng city').lean();
  const orgMap = new Map(orgs.map((item) => [item.id, item]));
  const promotionRows = promotions.map((item) => ({
    id: `promotion:${item.id}`, kind: 'promotion' as const, promotionId: item.id, title: item.title,
    description: item.description, organization: item.organizationId ? orgMap.get(item.organizationId) ?? null : null,
    currentPrice: item.newPrice, oldPrice: item.oldPrice, discountPercent: item.discountSize,
    source: 'supplier', updatedAt: item.startDate, local: true, demo: false,
    cityVerified: item.city === 'Кокшетау', city: item.city, category: item.categoryId, startDate: item.startDate, endDate: item.endDate,
  }));
  const offerRows = offers.flatMap((offer) => {
    const product = productMap.get(offer.productId);
    if (!product) return [];
    return [{
      id: `offer:${offer.id}`, kind: 'offer' as const, offerId: offer.id, productId: product.id, title: product.title,
      description: product.description, organization: offer.organizationId ? orgMap.get(offer.organizationId) ?? null : null,
      currentPrice: offer.price, oldPrice: offer.oldPrice,
      discountPercent: offer.discountPercent ?? (offer.oldPrice ? Math.round((offer.oldPrice - offer.price) / offer.oldPrice * 100) : 0),
      source: offer.source, updatedAt: offer.fetchedAt, local: offer.cityVerified, demo: offer.demo,
      cityVerified: offer.cityVerified, city: offer.sourceCity, externalUrl: normalizeSourceLink(offer).externalUrl,
      category: product.categoryId,
    }];
  });
  const terms = search ? productSearchTerms(search) : [];
  const rows = [...promotionRows, ...offerRows].filter((row) => {
    const searchable = `${row.title} ${row.description} ${row.source} ${row.organization?.name ?? ''}`.toLocaleLowerCase('ru').replaceAll('ё', 'е');
    return terms.length === 0 || terms.every((term) => searchable.includes(term));
  });
  return rows;
}

discoveryRouter.get('/deals', async (request, response) => {
  const city = text(request.query.city) || request.user?.city;
  const deals = await dealRows({ city, search: text(request.query.q), limit: Math.min(1000, Math.max(1, Number(request.query.limit) || 1000)) });
  response.json({ deals, total: deals.length });
});

discoveryRouter.get('/map/summary', async (_request, response) => {
  const [products, deals, promotions] = await Promise.all([
    StoreOfferModel.aggregate([{ $match: { organizationId: { $type: 'string' } } }, { $group: { _id: '$organizationId', products: { $sum: 1 } } }]),
    StoreOfferModel.aggregate([{ $match: { organizationId: { $type: 'string' }, $expr: { $gt: ['$oldPrice', '$price'] } } }, { $group: { _id: '$organizationId', deals: { $sum: 1 } } }]),
    PromotionModel.aggregate([{ $match: { organizationId: { $type: 'string' }, status: 'published', startDate: { $lte: todayIso() }, endDate: { $gte: todayIso() } } }, { $group: { _id: '$organizationId', deals: { $sum: 1 } } }]),
  ]);
  const result: Record<string, { products: number; deals: number }> = {};
  for (const row of products) result[row._id] = { products: row.products, deals: 0 };
  for (const row of deals) result[row._id] = { ...(result[row._id] ?? { products: 0, deals: 0 }), deals: row.deals };
  for (const row of promotions) result[row._id] = { ...(result[row._id] ?? { products: 0, deals: 0 }), deals: (result[row._id]?.deals ?? 0) + row.deals };
  response.json({ organizations: result });
});

discoveryRouter.get('/search', async (request, response) => {
  const q = text(request.query.q);
  if (q.length < 2) { response.json({ query: q, organizations: [], products: [], offers: [], deals: [] }); return; }
  const rx = new RegExp(escapeRegex(q), 'i');
  const terms = productSearchTerms(q);
  if (!terms.length) { response.json({ query: q, organizations: [], products: [], offers: [], deals: [] }); return; }
  const city = text(request.query.city);
  const [organizations, products, deals] = await Promise.all([
    OrganizationModel.find({ status: 'published', ...(city ? { city } : {}), $or: [{ name: rx }, { category: rx }, { address: rx }, { aliases: rx }] }).limit(30).lean(),
    ProductModel.find({ status: 'published', $and: terms.map((term) => { const termRx = new RegExp(escapeRegex(term), 'i'); return { $or: [{ title: termRx }, { brand: termRx }, { model: termRx }, { categoryId: termRx }] }; }) }).limit(50).lean(),
    dealRows({ city, search: q, limit: 100 }),
  ]);
  const offerRows = await StoreOfferModel.find({ productId: { $in: products.map((product) => product.id) } }).sort({ cityVerified: -1, price: 1 }).limit(100).lean();
  response.json({ query: q, organizations, products, offers: offerRows.map(normalizeSourceLink), deals });
});

discoveryRouter.get('/product-catalog', async (request, response) => {
  const q = text(request.query.q);
  const category = text(request.query.category);
  const organizationId = text(request.query.organizationId);
  const store = text(request.query.store);
  const minPrice = Number(request.query.minPrice);
  const maxPrice = Number(request.query.maxPrice);
  const discountOnly = request.query.discount === '1';
  const localOnly = request.query.local === '1';
  const demoOnly = request.query.demo === '1';
  const page = Math.max(1, Number(request.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(request.query.limit) || 40));
  const searchTerms = productSearchTerms(q);
  if (q && searchTerms.length === 0) { response.json({ products: [], categories: [], total: 0, page, limit: pageSize }); return; }
  const filter: Record<string, unknown> = {};
  if (organizationId || store) filter.organizationId = organizationId || store;
  if (discountOnly) filter.$expr = { $gt: ['$oldPrice', '$price'] };
  if (localOnly) filter.cityVerified = true;
  if (demoOnly) filter.demo = true;
  if (Number.isFinite(minPrice)) filter.price = { ...(filter.price as object ?? {}), $gte: minPrice };
  if (Number.isFinite(maxPrice)) filter.price = { ...(filter.price as object ?? {}), $lte: maxPrice };
  let offers = await StoreOfferModel.find(filter).sort({ cityVerified: -1, price: 1 }).limit(5000).lean();
  const ids = [...new Set(offers.map((offer) => offer.productId))];
  const terms = searchTerms;
  const productFilter: Record<string, unknown> = { id: { $in: ids }, status: 'published' };
  if (category && category !== 'Все') productFilter.categoryId = category;
  if (terms.length) productFilter.$and = terms.map((term) => {
    const termRx = new RegExp(escapeRegex(term), 'i');
    return { $or: [{ title: termRx }, { brand: termRx }, { model: termRx }, { categoryId: termRx }] };
  });
  const products = await ProductModel.find(productFilter).lean();
  const productById = new Map(products.map((product) => [product.id, product]));
  offers = offers.filter((offer) => productById.has(offer.productId));
  const organizationIds = [...new Set(offers.flatMap((offer) => offer.organizationId ? [offer.organizationId] : []))];
  const organizations = await OrganizationModel.find({ id: { $in: organizationIds }, status: 'published' }).select('id name address lat lng').lean();
  const orgMap = new Map(organizations.map((item) => [item.id, item]));
  const catalogProducts = products.map((product) => ({ ...normalizeSourceLink(product), offers: offers.filter((offer) => offer.productId === product.id).map((offer) => ({ ...normalizeSourceLink(offer), organization: offer.organizationId ? orgMap.get(offer.organizationId) ?? null : null })) })).filter((product) => product.offers.length > 0).sort((a, b) => Number(b.offers.some((offer) => offer.cityVerified)) - Number(a.offers.some((offer) => offer.cityVerified)) || a.title.localeCompare(b.title, 'ru'));
  const categories = [...new Set(products.map((product) => product.categoryId))].sort((a, b) => a.localeCompare(b, 'ru'));
  response.json({ products: catalogProducts.slice((page - 1) * pageSize, page * pageSize), categories, total: catalogProducts.length, page, limit: pageSize });
});

discoveryRouter.get('/organizations/:id/deals', async (request, response) => {
  const org = await OrganizationModel.findOne({ id: text(request.params.id) }).select('id status').lean();
  if (!org || !publicOrganization(org)) { response.status(404).json({ error: 'Организация не найдена' }); return; }
  const deals = await dealRows({ organizationId: org.id, limit: 300 });
  response.json({ deals, total: deals.length });
});

discoveryRouter.get('/organizations/:id/reviews', async (request, response) => {
  const org = await OrganizationModel.findOne({ id: text(request.params.id) }).select('id status ratingAverage ratingCount').lean();
  if (!org || !publicOrganization(org)) { response.status(404).json({ error: 'Организация не найдена' }); return; }
  const filter: Record<string, unknown> = request.user?.role === 'admin' ? { organizationId: org.id, status: { $ne: 'removed' } } : { organizationId: org.id, status: 'published' };
  const reviews = await ReviewModel.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  response.json({ reviews, rating: { average: org.ratingAverage ?? 0, count: org.ratingCount ?? 0 } });
});

async function updateRating(organizationId: string) {
  const result = await ReviewModel.aggregate([{ $match: { organizationId, status: 'published' } }, { $group: { _id: '$organizationId', average: { $avg: '$rating' }, count: { $sum: 1 } } }]);
  await OrganizationModel.updateOne({ id: organizationId }, { $set: { ratingAverage: result[0]?.average ?? 0, ratingCount: result[0]?.count ?? 0 } });
}

discoveryRouter.post('/organizations/:id/reviews', requireAuth, async (request, response) => {
  const organization = await OrganizationModel.findOne({ id: request.params.id, status: 'published' }).select('id').lean();
  if (!organization) { response.status(404).json({ error: 'Организация не найдена' }); return; }
  const rating = Number(request.body?.rating);
  const reviewText = text(request.body?.text);
  const photos = Array.isArray(request.body?.photos) ? request.body.photos.filter((photo: unknown) => typeof photo === 'string' && photo.startsWith('/uploads/')).slice(0, 5) : [];
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || reviewText.length > 3000) { response.status(400).json({ error: 'Оценка должна быть от 1 до 5, текст — не более 3000 символов' }); return; }
  const user = await UserModel.findOne({ id: request.user!.id }).select('id name').lean();
  try {
    const now = new Date().toISOString();
    const review = await ReviewModel.create({ id: crypto.randomUUID(), organizationId: organization.id, userId: user!.id, userName: user!.name, rating, text: reviewText, photos, createdAt: now, updatedAt: now, status: 'published' });
    await updateRating(organization.id);
    response.status(201).json({ review });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) { response.status(409).json({ error: 'Вы уже оставили отзыв. Отредактируйте существующий.' }); return; }
    throw error;
  }
});

discoveryRouter.patch('/organizations/:id/reviews/:reviewId', requireAuth, async (request, response) => {
  const rating = Number(request.body?.rating);
  const reviewText = text(request.body?.text);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || reviewText.length > 3000) { response.status(400).json({ error: 'Оценка должна быть от 1 до 5, текст — не более 3000 символов' }); return; }
  const review = await ReviewModel.findOneAndUpdate({ id: request.params.reviewId, organizationId: request.params.id, userId: request.user!.id, status: 'published' }, { $set: { rating, text: reviewText, updatedAt: new Date().toISOString() } }, { returnDocument: 'after' }).lean();
  if (!review) { response.status(404).json({ error: 'Отзыв не найден или нет прав на изменение' }); return; }
  await updateRating(text(request.params.id));
  response.json({ review });
});

discoveryRouter.delete('/organizations/:id/reviews/:reviewId', requireAuth, async (request, response) => {
  const removed = await ReviewModel.findOneAndDelete({ id: request.params.reviewId, organizationId: request.params.id, userId: request.user!.id });
  if (!removed) { response.status(404).json({ error: 'Отзыв не найден или нет прав на удаление' }); return; }
  await updateRating(text(request.params.id));
  response.json({ success: true });
});

discoveryRouter.post('/admin/moderation/reviews/:reviewId', requireRole(['admin']), async (request, response) => {
  const status = text(request.body?.status);
  if (!['published', 'hidden', 'removed'].includes(status)) { response.status(400).json({ error: 'Статус должен быть published, hidden или removed' }); return; }
  const review = await ReviewModel.findOneAndUpdate({ id: request.params.reviewId }, { $set: { status } }, { returnDocument: 'after' }).lean();
  if (!review) { response.status(404).json({ error: 'Отзыв не найден' }); return; }
  await updateRating(review.organizationId);
  response.json({ review });
});

discoveryRouter.get('/admin/moderation/reviews', requireRole(['admin']), async (request, response) => {
  const status = text(request.query.status);
  const filter: Record<string, unknown> = status && ['published', 'hidden', 'removed'].includes(status) ? { status } : { status: { $ne: 'removed' } };
  const reviews = await ReviewModel.find(filter).sort({ createdAt: -1 }).limit(300).lean();
  const orgs = await OrganizationModel.find({ id: { $in: [...new Set(reviews.map((review) => review.organizationId))] } }).select('id name').lean();
  const orgMap = new Map(orgs.map((org) => [org.id, org.name]));
  response.json({ reviews: reviews.map((review) => ({ ...review, organizationName: orgMap.get(review.organizationId) ?? 'Организация' })) });
});

// A single aggregate powers the organization page, including imported offers.
discoveryRouter.get('/organizations/:id', async (request, response, next) => {
  try {
    const organization = await OrganizationModel.findOne({ id: request.params.id }).lean();
    if (!organization || (!publicOrganization(organization) && request.user?.role !== 'admin' && request.user?.id !== organization.ownerId)) { response.status(404).json({ error: 'Организация не найдена' }); return; }
    const today = todayIso();
    const [promotions, products, reviews, myReview, offers, discountedOffers, dealCount, productCount, reviewCount] = await Promise.all([
      PromotionModel.find({ organizationId: organization.id, status: 'published', startDate: { $lte: today }, endDate: { $gte: today } }).lean(),
      ProductModel.find({ organizationId: organization.id, status: 'published' }).limit(12).lean(),
      ReviewModel.find({ organizationId: organization.id, status: 'published' }).sort({ createdAt: -1 }).limit(5).lean(),
      request.user?.id ? ReviewModel.findOne({ organizationId: organization.id, userId: request.user.id, status: 'published' }).lean() : null,
      StoreOfferModel.find({ organizationId: organization.id }).sort({ discountPercent: -1, price: 1 }).limit(12).lean(),
      StoreOfferModel.find({ organizationId: organization.id, oldPrice: { $gt: 0 }, $expr: { $gt: ['$oldPrice', '$price'] } }).sort({ discountPercent: -1, price: 1 }).limit(6).lean(),
      StoreOfferModel.countDocuments({ organizationId: organization.id, oldPrice: { $gt: 0 }, $expr: { $gt: ['$oldPrice', '$price'] } }),
      StoreOfferModel.countDocuments({ organizationId: organization.id }),
      ReviewModel.countDocuments({ organizationId: organization.id, status: 'published' }),
    ]);
    const allOfferProductIds = [...new Set([...offers, ...discountedOffers].map((offer) => offer.productId))];
    const offerProducts = await ProductModel.find({ id: { $in: allOfferProductIds }, status: 'published' }).lean();
    const productById = new Map(offerProducts.map((product) => [product.id, product]));
    await AnalyticsEventModel.create({ id: crypto.randomUUID(), eventType: 'organization_view', organizationId: organization.id, createdAt: new Date().toISOString() });
    response.json({ organization, promotions, products, offers: offers.flatMap((offer) => productById.has(offer.productId) ? [{ ...normalizeSourceLink(offer), product: productById.get(offer.productId) }] : []), dealsPreview: discountedOffers.flatMap((offer) => productById.has(offer.productId) ? [{ ...normalizeSourceLink(offer), product: productById.get(offer.productId) }] : []), reviewsPreview: reviews, myReview, rating: { average: organization.ratingAverage ?? 0, count: reviewCount }, counts: { products: productCount, deals: dealCount + promotions.length, reviews: reviewCount } });
  } catch (error) { next(error); }
});

// Match known imported catalog sources to actual city businesses and backfill prior offers.
export async function ensureSourceStoreMappings() {
  const malformedAddresses = await OrganizationModel.find({ addressSource: 'nominatim', addressText: /ул\.\s+улица\s+/i }).select('id address addressText').lean();
  if (malformedAddresses.length) await OrganizationModel.bulkWrite(malformedAddresses.map((org) => {
    const clean = (value: string) => value.replace(/ул\.\s+улица\s+/i, 'ул. ');
    return { updateOne: { filter: { id: org.id }, update: { $set: { address: clean(text(org.address)), addressText: clean(text(org.addressText)) } } } };
  }));
  const legacyOrganizations = await OrganizationModel.find({ $or: [{ addressText: { $exists: false } }, { addressText: '' }, { ratingAverage: { $exists: false } }, { ratingCount: { $exists: false } }] }).select('id address city brand aliases ratingAverage ratingCount').lean();
  if (legacyOrganizations.length) await OrganizationModel.bulkWrite(legacyOrganizations.map((org) => {
    const address = text(org.address);
    const addressText = !address || address === org.city ? 'Адрес не указан' : address;
    const aliases = [...new Set([...(org.aliases ?? []), text(org.brand)].filter(Boolean))];
    return { updateOne: { filter: { id: org.id }, update: { $set: { addressText, ...(addressText === 'Адрес не указан' ? { address: addressText } : {}), aliases, ratingAverage: org.ratingAverage ?? 0, ratingCount: org.ratingCount ?? 0 } } } };
  }));
  const sources = [
    { source: 'technodom', aliases: ['technodom', 'технодом'] },
    { source: 'alser', aliases: ['alser', 'алсер'] },
    { source: 'sulpak', aliases: ['sulpak', 'сулпак'] },
    { source: 'small', aliases: ['small', 'small food', 'смолл'] },
  ];
  for (const item of sources) {
    const organizations = await OrganizationModel.find({ city: 'Кокшетау', status: 'published' }).select('id name aliases').lean();
    const target = organizations.find((org) => item.aliases.some((alias) => [org.name, ...(org.aliases ?? [])].some((name) => name.toLocaleLowerCase().includes(alias))));
    if (!target) continue;
    await SourceStoreMappingModel.findOneAndUpdate({ source: item.source, city: 'Кокшетау' }, { $set: { id: `${item.source}:kokshetau`, source: item.source, organizationId: target.id, city: 'Кокшетау', verified: item.source === 'technodom' || item.source === 'alser' || item.source === 'sulpak' || item.source === 'small', aliases: item.aliases, updatedAt: new Date().toISOString() } }, { upsert: true, setDefaultsOnInsert: true });
    await StoreOfferModel.updateMany({ source: item.source, organizationId: { $ne: target.id } }, { $set: { organizationId: target.id } });
  }
}
