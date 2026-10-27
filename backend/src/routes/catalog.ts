import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { promotionCategories, promotionTypes, todayIso } from '../config.js';
import { AnalyticsEventModel, CategoryModel, EventModel, OrganizationModel, PriceHistoryModel, ProductModel, PromotionModel, StoreOfferModel, UserModel } from '../models/index.js';
import { normalizeSourceLink } from '../lib/external-url.js';
import { productSearchTerms } from '../lib/product-search.js';
import { logger } from '../lib/logger.js';

export const organizationsRouter = Router();
export const promotionsRouter = Router();
export const productsRouter = Router();
export const categoriesRouter = Router();
export const catalogRouter = Router();

const cleanQuery = (value: unknown) => String(value ?? '').trim();

organizationsRouter.get('/', async (request, response) => {
  const city = cleanQuery(request.query.city);
  const search = cleanQuery(request.query.search).toLocaleLowerCase();
  const category = cleanQuery(request.query.category);
  const source = cleanQuery(request.query.source);
  const status = request.user?.role === 'admin' ? cleanQuery(request.query.status) : 'published';
  const filter: Record<string, unknown> = {};
  if (city) filter.city = city;
  if (request.user?.role === 'supplier' && request.query.mine === '1') filter.ownerId = request.user.id;
  else if (status) filter.status = status;
  if (category) filter.category = category;
  if (source && ['supplier', 'osm', 'imported'].includes(source)) filter.source = source;
  const organizations = await OrganizationModel.find(filter).select('-_id').lean();
  const result = search
    ? organizations.filter((item) => `${item.name} ${item.address} ${item.category}`.toLocaleLowerCase().includes(search))
    : organizations;
  response.json({ organizations: result });
});

organizationsRouter.get('/:id', async (request, response) => {
  const organization = await OrganizationModel.findOne({ id: request.params.id }).lean();
  if (!organization || (organization.status !== 'published' && request.user?.role !== 'admin' && request.user?.id !== organization.ownerId)) {
    response.status(404).json({ error: 'Организация не найдена' });
    return;
  }
  const promotions = await PromotionModel.find({ organizationId: organization.id, status: 'published', startDate: { $lte: todayIso() }, endDate: { $gte: todayIso() } }).lean();
  const products = await ProductModel.find({ organizationId: organization.id, status: 'published' }).lean();
  await AnalyticsEventModel.create({ id: crypto.randomUUID(), eventType: 'organization_view', organizationId: organization.id, createdAt: new Date().toISOString() });
  response.json({ organization, promotions, products });
});

organizationsRouter.post('/', requireRole(['supplier', 'admin']), async (request, response) => {
  const body = request.body as Partial<{ name: string; category: string; description: string; address: string; lat: number; lng: number; phone: string; website: string; workingHours: string; photos: string[]; businessType: string; bin: string; email: string; legalName: string; legalAddress: string; representativeName: string; representativePosition: string; claimOsmId: string }>;
  const { name, category, address } = body;
  if (!name?.trim() || !category?.trim() || !address?.trim()) {
    response.status(400).json({ error: 'Название, категория и адрес обязательны' });
    return;
  }
  if (body.businessType === 'ТОО' && (!/^\d{12}$/.test(body.bin ?? '') || !body.legalName?.trim() || !body.representativeName?.trim() || !body.representativePosition?.trim())) {
    response.status(400).json({ error: 'Для ТОО укажите 12-значный БИН, полное название и представителя с должностью' });
    return;
  }
  if (body.businessType === 'ТОО' && !body.legalAddress?.trim()) { response.status(400).json({ error: 'Укажите юридический адрес ТОО' }); return; }
  if (body.businessType === 'ИП' && (!/^\d{12}$/.test(body.bin ?? '') || !body.representativeName?.trim())) {
    response.status(400).json({ error: 'Для ИП укажите 12-значный ИИН/БИН и ФИО предпринимателя' });
    return;
  }
  const owner = request.user!;
  const existing = await OrganizationModel.findOne({ ownerId: owner.id });
  if (existing && owner.role !== 'admin') {
    response.status(409).json({ error: 'У вас уже есть организация. Измените существующую карточку.' });
    return;
  }
  const values = {
    id: crypto.randomUUID(),
    name: name.trim(),
    category: category.trim(),
    description: String(body.description ?? '').trim(),
    address: address.trim(),
    addressText: address.trim(),
    addressSource: 'supplier' as const,
    city: owner.city,
    lat: typeof body.lat === 'number' ? body.lat : undefined,
    lng: typeof body.lng === 'number' ? body.lng : undefined,
    phone: String(body.phone ?? '').trim(),
    website: String(body.website ?? '').trim(),
    workingHours: String(body.workingHours ?? '').trim(),
    photos: Array.isArray(body.photos) ? body.photos.slice(0, 6).map(String) : [],
    ownerId: owner.id,
    source: 'supplier' as const,
    businessType: body.businessType === 'ИП' || body.businessType === 'ТОО' || body.businessType === 'АО' || body.businessType === 'Другое' ? body.businessType as 'ИП' | 'ТОО' | 'АО' | 'Другое' : undefined,
    bin: body.bin?.trim(),
    email: body.email?.trim().toLocaleLowerCase(),
    legalName: body.legalName?.trim(),
    legalAddress: body.legalAddress?.trim(),
    representativeName: body.representativeName?.trim(),
    representativePosition: body.representativePosition?.trim(),
    claimOsmId: body.claimOsmId?.trim(),
    verificationStatus: 'pending_verification' as const,
    status: 'pending_review' as const,
  };
  let organization;
  if (body.claimOsmId?.trim()) {
    const osm = await OrganizationModel.findOne({ osmId: body.claimOsmId.trim(), city: owner.city, source: 'osm', ownerId: 'osm-import' });
    if (!osm) {
      response.status(404).json({ error: 'Точка OSM не найдена для выбранного города или уже закреплена' });
      return;
    }
    Object.assign(osm, { ...values, id: osm.id, osmId: osm.osmId, osmType: osm.osmType, lat: osm.lat, lng: osm.lng, source: 'supplier' });
    await osm.save();
    organization = osm;
  } else {
    organization = await OrganizationModel.create(values);
  }
  response.status(201).json({ organization });
});

organizationsRouter.post('/:id/route', async (request, response) => {
  const organization = await OrganizationModel.findOne({ id: request.params.id, status: 'published' }).select('id').lean();
  if (!organization) { response.status(404).json({ error: 'Организация не найдена' }); return; }
  await AnalyticsEventModel.create({ id: crypto.randomUUID(), eventType: 'route', organizationId: organization.id, createdAt: new Date().toISOString() });
  response.json({ success: true });
});

organizationsRouter.patch('/:id', requireAuth, async (request, response) => {
  const user = request.user!;
  const allowed = ['name', 'category', 'description', 'address', 'phone', 'website', 'workingHours'] as const;
  const updates: Record<string, unknown> = {};
  for (const field of allowed) {
    const value = request.body?.[field];
    if (typeof value === 'string' && value.trim()) updates[field] = value.trim();
  }
  if (typeof updates.address === 'string') { updates.addressText = updates.address; updates.addressSource = 'supplier'; }
  for (const field of ['lat', 'lng'] as const) {
    const value = request.body?.[field];
    if (typeof value === 'number' && Number.isFinite(value)) updates[field] = value;
  }
  if (Array.isArray(request.body?.photos)) updates.photos = request.body.photos.slice(0, 6).filter((item: unknown) => typeof item === 'string' && item.startsWith('/uploads/'));
  for (const field of ['businessType', 'bin', 'email', 'legalName', 'legalAddress', 'representativeName', 'representativePosition', 'claimOsmId'] as const) {
    const value = request.body?.[field];
    if (typeof value === 'string') updates[field] = value.trim();
  }
  if (user.role !== 'admin' && Object.keys(updates).length) {
    updates.status = 'pending_review';
    updates.verificationStatus = 'pending_verification';
    updates.verified = false;
  }
  const filter: Record<string, unknown> = { id: request.params.id };
  if (user.role !== 'admin') filter.ownerId = user.id;
  const organization = await OrganizationModel.findOneAndUpdate(filter, updates, { returnDocument: 'after' }).lean();
  if (!organization) {
    response.status(404).json({ error: 'Организация не найдена' });
    return;
  }
  response.json({ organization });
});

promotionsRouter.get('/', async (request, response) => {
  const city = cleanQuery(request.query.city);
  const search = cleanQuery(request.query.search).toLocaleLowerCase();
  const category = cleanQuery(request.query.category);
  const status = cleanQuery(request.query.status) || 'published';
  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 20));
  const today = todayIso();

  await PromotionModel.updateMany({ status: 'published', endDate: { $lt: today } }, { $set: { status: 'expired' } });

  const filter: Record<string, unknown> = {};
  if (city) filter.city = city;
  const canViewAll = request.user?.role === 'admin' || request.user?.role === 'supplier';
  if (status !== 'all' || !canViewAll) filter.status = 'published';
  if (request.user?.role === 'supplier') filter.ownerId = request.user.id;
  if (category && category !== 'Все') filter.categoryId = category;
  if (filter.status === 'published') {
    filter.startDate = { $lte: today };
    filter.endDate = { $gte: today };
  }
  const minPrice = Number(request.query.minPrice);
  const maxPrice = Number(request.query.maxPrice);
  const minDiscount = Number(request.query.minDiscount);
  const maxDiscount = Number(request.query.maxDiscount);
  if (Number.isFinite(minPrice)) filter.$or = [{ newPrice: { $gte: minPrice } }, { newPrice: { $exists: false } }];
  if (Number.isFinite(maxPrice)) filter.newPrice = { $lte: maxPrice };
  if (Number.isFinite(minDiscount)) filter.discountSize = { $gte: minDiscount };
  if (Number.isFinite(maxDiscount)) filter.discountSize = { $lte: maxDiscount };
  const all = await PromotionModel.find(filter).select('-_id').sort({ endDate: 1 }).lean();
  let searched = search
    ? all.filter((item) => `${item.title} ${item.place} ${item.description}`.toLocaleLowerCase().includes(search))
    : all;
  const activeNow = request.query.activeNow === '1';
  if (activeNow) {
    searched = searched.filter((item) => item.startDate <= today && item.endDate >= today);
  }
  const total = searched.length;
  const items = searched.slice((page - 1) * limit, page * limit);
  response.json({ promotions: items, total, page, limit });
});

promotionsRouter.get('/:id', async (request, response) => {
  const promotion = await PromotionModel.findOne({ id: request.params.id }).lean();
  if (!promotion) {
    response.status(404).json({ error: 'Акция не найдена' });
    return;
  }
  const isOwner = request.user && (request.user.id === promotion.ownerId || request.user.role === 'admin');
  if (promotion.status !== 'published' && !isOwner) {
    response.status(404).json({ error: 'Акция не найдена' });
    return;
  }
  if (promotion.status === 'published') {
    await PromotionModel.updateOne({ id: promotion.id }, { $inc: { views: 1 } });
    await AnalyticsEventModel.create({ id: crypto.randomUUID(), eventType: 'promotion_view', promotionId: promotion.id, organizationId: promotion.organizationId, createdAt: new Date().toISOString() });
    promotion.views = (promotion.views ?? 0) + 1;
  }
  const organization = promotion.organizationId ? await OrganizationModel.findOne({ id: promotion.organizationId }).lean() : null;
  response.json({ promotion, organization });
});

promotionsRouter.post('/', requireRole(['supplier', 'admin']), async (request, response) => {
  const body = request.body as Partial<{ title: string; description: string; organizationId: string; place: string; categoryId: string; type: string; value: string; oldPrice: number; newPrice: number; discountSize: number; promoCode: string; image: string; startDate: string; endDate: string; status: string }>;
  const { title, place, categoryId, startDate, endDate } = body;
  if (!title?.trim() || !place?.trim() || !categoryId || !startDate || !endDate || startDate > endDate) {
    response.status(400).json({ error: 'Заполните обязательные поля и корректный период действия' });
    return;
  }
  const user = request.user!;
  const status = body.status === 'draft' ? 'draft' : 'pending_review';
  if (body.organizationId) {
    const linked = await OrganizationModel.findOne({ id: body.organizationId, ownerId: user.id }).lean();
    if (!linked && user.role !== 'admin') { response.status(403).json({ error: 'Можно создавать акцию только для своей организации' }); return; }
  }
  const promotion = await PromotionModel.create({
    id: crypto.randomUUID(),
    title: title.trim(),
    description: String(body.description ?? '').trim(),
    organizationId: body.organizationId || undefined,
    place: place.trim(),
    categoryId,
    type: promotionTypes.includes(body.type as typeof promotionTypes[number]) ? body.type : 'temporary',
    value: String(body.value ?? '').trim(),
    oldPrice: typeof body.oldPrice === 'number' ? body.oldPrice : undefined,
    newPrice: typeof body.newPrice === 'number' ? body.newPrice : undefined,
    discountSize: typeof body.discountSize === 'number' ? body.discountSize : undefined,
    promoCode: String(body.promoCode ?? '').trim(),
    image: String(body.image ?? '').trim(),
    startDate,
    endDate,
    ownerId: user.id,
    status,
    city: user.city,
  });
  response.status(201).json({ promotion });
});

promotionsRouter.patch('/:id', requireAuth, async (request, response) => {
  const user = request.user!;
  const allowed = ['title', 'description', 'place', 'categoryId', 'type', 'value', 'promoCode', 'image', 'startDate', 'endDate'] as const;
  const updates: Record<string, string> = {};
  for (const field of allowed) {
    const value = request.body?.[field];
    if (typeof value === 'string' && value.trim()) updates[field] = value.trim();
  }
  for (const field of ['oldPrice', 'newPrice', 'discountSize'] as const) {
    const value = request.body?.[field];
    if (typeof value === 'number') updates[field] = value as unknown as string;
  }
  if (updates.startDate && updates.endDate && updates.startDate > updates.endDate) {
    response.status(400).json({ error: 'Дата окончания не может быть раньше даты начала' });
    return;
  }
  if (request.body?.status === 'draft') updates.status = 'draft';
  else if (user.role !== 'admin' && Object.keys(updates).length) updates.status = 'pending_review';
  const filter: Record<string, unknown> = { id: request.params.id };
  if (user.role !== 'admin') filter.ownerId = user.id;
  const promotion = await PromotionModel.findOneAndUpdate(filter, updates, { returnDocument: 'after' }).lean();
  if (!promotion) {
    response.status(404).json({ error: 'Акция не найдена' });
    return;
  }
  response.json({ promotion });
});

promotionsRouter.delete('/:id', requireAuth, async (request, response) => {
  const user = request.user!;
  const filter: Record<string, unknown> = { id: request.params.id };
  if (user.role !== 'admin') filter.ownerId = user.id;
  const deleted = await PromotionModel.findOneAndDelete(filter);
  if (!deleted) {
    response.status(404).json({ error: 'Акция не найдена' });
    return;
  }
  response.json({ success: true });
});

promotionsRouter.post('/:id/click', async (request, response) => {
  const promotion = await PromotionModel.findOneAndUpdate({ id: request.params.id, status: 'published' }, { $inc: { clicks: 1 } }, { returnDocument: 'after' }).lean();
  if (!promotion) { response.status(404).json({ error: 'Акция не найдена' }); return; }
  await AnalyticsEventModel.create({ id: crypto.randomUUID(), eventType: 'promotion_click', promotionId: promotion.id, organizationId: promotion.organizationId, createdAt: new Date().toISOString() });
  response.json({ success: true });
});

promotionsRouter.post('/:id/route', async (request, response) => {
  const promotion = await PromotionModel.findOneAndUpdate({ id: request.params.id, status: 'published' }, { $inc: { routes: 1 } }, { returnDocument: 'after' }).lean();
  if (!promotion) { response.status(404).json({ error: 'Акция не найдена' }); return; }
  await AnalyticsEventModel.create({ id: crypto.randomUUID(), eventType: 'route', promotionId: promotion.id, organizationId: promotion.organizationId, createdAt: new Date().toISOString() });
  response.json({ success: true });
});

productsRouter.get('/', async (request, response) => {
  const city = cleanQuery(request.query.city);
  const organizationId = cleanQuery(request.query.organizationId);
  const search = cleanQuery(request.query.search).toLocaleLowerCase();
  const status = cleanQuery(request.query.status);
  const filter: Record<string, unknown> = {};
  if (request.user?.role === 'admin' && status && status !== 'all') filter.status = status;
  else if (request.user?.role === 'supplier' && status === 'all') {
    const owned = await OrganizationModel.find({ ownerId: request.user.id }).select('id').lean();
    const ids = owned.map((item) => item.id);
    if (organizationId && !ids.includes(organizationId)) { response.status(403).json({ error: 'Недостаточно прав' }); return; }
    filter.organizationId = organizationId || { $in: ids };
  } else filter.status = 'published';
  if (city) filter.city = city;
  if (organizationId) filter.organizationId = organizationId;
  const products = await ProductModel.find(filter).select('-_id').limit(100).lean();
  const result = search ? products.filter((item) => `${item.title} ${item.brand ?? ''} ${item.model ?? ''}`.toLocaleLowerCase().includes(search)) : products;
  response.json({ products: result });
});

productsRouter.get('/:id', async (request, response) => {
  const product = await ProductModel.findOne({ id: request.params.id, status: 'published' }).select('-_id').lean();
  if (!product) { response.status(404).json({ error: 'Товар не найден' }); return; }
  const offers = await StoreOfferModel.find({ productId: product.id }).sort({ cityVerified: -1, price: 1 }).lean();
  response.json({ product: normalizeSourceLink(product), offers: offers.map(normalizeSourceLink) });
});

productsRouter.get('/:id/history', async (request, response) => {
  const product = await ProductModel.findOne({ id: request.params.id, status: 'published' }).select('id').lean();
  if (!product) { response.status(404).json({ error: 'Товар не найден' }); return; }
  const offers = await StoreOfferModel.find({ productId: product.id }).select('id').lean();
  const history = await PriceHistoryModel.find({ offerId: { $in: offers.map((offer) => offer.id) } }).sort({ timestamp: 1 }).lean();
  response.json({ history });
});

catalogRouter.get('/compare', async (request, response) => {
  const search = cleanQuery(request.query.search);
  const terms = productSearchTerms(search);
  if (search.length < 2 || !terms.length) { response.json({ products: [] }); return; }
  const products = await ProductModel.find({ status: 'published', $and: terms.map((term) => {
    const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { $or: [{ title: { $regex: safeTerm, $options: 'i' } }, { brand: { $regex: safeTerm, $options: 'i' } }, { model: { $regex: safeTerm, $options: 'i' } }] };
  }) }).limit(50).lean();
  const offers = await StoreOfferModel.find({ productId: { $in: products.map((item) => item.id) } }).sort({ cityVerified: -1, price: 1 }).lean();
  const orgs = await OrganizationModel.find({ id: { $in: offers.flatMap((item) => item.organizationId ? [item.organizationId] : []) }, status: 'published' }).select('id name lat lng').lean();
  const orgById = new Map(orgs.map((item) => [item.id, item]));
  response.json({ products: products.map((product) => ({ ...normalizeSourceLink(product), offers: offers.filter((offer) => offer.productId === product.id).map((offer) => ({ ...normalizeSourceLink(offer), organization: offer.organizationId ? orgById.get(offer.organizationId) ?? null : null })) })) });
});

catalogRouter.post('/offers/:id/click', async (request, response) => {
  const offer = await StoreOfferModel.findOne({ id: request.params.id }).lean();
  if (!offer) { response.status(404).json({ error: 'Предложение не найдено' }); return; }
  await AnalyticsEventModel.create({ id: crypto.randomUUID(), eventType: 'offer_click', organizationId: offer.organizationId, productId: offer.productId, createdAt: new Date().toISOString() });
  response.json({ success: true });
});

productsRouter.post('/', requireRole(['supplier', 'admin']), async (request, response) => {
  const body = request.body as Partial<{ organizationId: string; title: string; description: string; price: number; oldPrice: number; categoryId: string; image: string; available: boolean; status: string }>;
  if (!body.organizationId || !body.title?.trim() || !body.categoryId || typeof body.price !== 'number') {
    response.status(400).json({ error: 'Организация, название, категория и цена обязательны' });
    return;
  }
  const user = request.user!;
  const organization = await OrganizationModel.findOne({ id: body.organizationId }).lean();
  if (!organization || (user.role !== 'admin' && organization.ownerId !== user.id)) {
    response.status(403).json({ error: 'Недостаточно прав на организацию' });
    return;
  }
  const status = body.status === 'draft' ? 'draft' : 'pending_review';
  const product = await ProductModel.create({
    id: crypto.randomUUID(),
    organizationId: body.organizationId,
    title: body.title.trim(),
    description: String(body.description ?? '').trim(),
    price: body.price,
    oldPrice: typeof body.oldPrice === 'number' ? body.oldPrice : undefined,
    categoryId: body.categoryId,
    image: String(body.image ?? '').trim(),
    available: body.available !== false,
    city: organization.city,
    status,
  });
  response.status(201).json({ product });
});

productsRouter.patch('/:id', requireAuth, async (request, response) => {
  const user = request.user!;
  const product = await ProductModel.findOne({ id: request.params.id }).lean();
  if (!product) {
    response.status(404).json({ error: 'Товар не найден' });
    return;
  }
  if (user.role !== 'admin') {
    const organization = await OrganizationModel.findOne({ id: product.organizationId }).lean();
    if (!organization || organization.ownerId !== user.id) {
      response.status(403).json({ error: 'Недостаточно прав' });
      return;
    }
  }
  const updates: Record<string, unknown> = {};
  for (const field of ['title', 'description', 'categoryId', 'image'] as const) {
    const value = request.body?.[field];
    if (typeof value === 'string' && value.trim()) updates[field] = value.trim();
  }
  for (const field of ['price', 'oldPrice'] as const) {
    const value = request.body?.[field];
    if (typeof value === 'number') updates[field] = value;
  }
  if (typeof request.body?.available === 'boolean') updates.available = request.body.available;
  if (request.body?.status === 'draft') updates.status = 'draft';
  else if (user.role !== 'admin' && Object.keys(updates).length) updates.status = 'pending_review';
  const updated = await ProductModel.findOneAndUpdate({ id: request.params.id }, updates, { returnDocument: 'after' }).lean();
  response.json({ product: updated });
});

productsRouter.delete('/:id', requireAuth, async (request, response) => {
  const user = request.user!;
  const product = await ProductModel.findOne({ id: request.params.id }).lean();
  if (!product) {
    response.status(404).json({ error: 'Товар не найден' });
    return;
  }
  if (user.role !== 'admin') {
    const organization = await OrganizationModel.findOne({ id: product.organizationId }).lean();
    if (!organization || organization.ownerId !== user.id) {
      response.status(403).json({ error: 'Недостаточно прав' });
      return;
    }
  }
  await ProductModel.deleteOne({ id: request.params.id });
  response.json({ success: true });
});

categoriesRouter.get('/', async (_request, response) => {
  const categories = await CategoryModel.find().select('-_id').lean();
  response.json({ categories });
});

categoriesRouter.post('/', requireRole(['admin']), async (request, response) => {
  const { title, kind, slug } = request.body as { title?: string; kind?: string; slug?: string };
  if (!title?.trim() || !kind || !slug?.trim()) {
    response.status(400).json({ error: 'Название, тип и slug обязательны' });
    return;
  }
  if (!['organization', 'product', 'promotion'].includes(kind)) {
    response.status(400).json({ error: 'Недопустимый тип категории' });
    return;
  }
  const category = await CategoryModel.create({ id: crypto.randomUUID(), title: title.trim(), kind: kind as 'organization' | 'product' | 'promotion', slug: slug.trim() });
  response.status(201).json({ category });
});

categoriesRouter.delete('/:id', requireRole(['admin']), async (request, response) => {
  await CategoryModel.deleteOne({ id: request.params.id });
  response.json({ success: true });
});

export const adminUsersRouter = Router();

adminUsersRouter.get('/', requireRole(['admin']), async (_request, response) => {
  const users = await UserModel.find().select('-passwordHash -_id').lean();
  response.json({
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      city: user.city,
      blocked: user.blocked ?? false,
      category: user.category,
    })),
  });
});

adminUsersRouter.post('/:id/block', requireRole(['admin']), async (request, response) => {
  const user = await UserModel.findOneAndUpdate({ id: request.params.id }, { blocked: true }, { returnDocument: 'after' }).lean();
  if (!user) {
    response.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  logger.info('user blocked', { userId: user.id, admin: request.user!.id });
  response.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, blocked: user.blocked } });
});

adminUsersRouter.post('/:id/unblock', requireRole(['admin']), async (request, response) => {
  const user = await UserModel.findOneAndUpdate({ id: request.params.id }, { blocked: false }, { returnDocument: 'after' }).lean();
  if (!user) {
    response.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  logger.info('user unblocked', { userId: user.id, admin: request.user!.id });
  response.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, blocked: user.blocked } });
});
