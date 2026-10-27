import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
delete process.env.MONGODB_URI;

const { app, shutdown } = await import('../src/server.js');

let server: Server;
let baseUrl: string;

const unique = () => Math.random().toString(36).slice(2, 10);

const request = async (method: string, path: string, body?: unknown, token?: string) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data: data as Record<string, any> };
};

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  await shutdown();
  // Force exit: mongodb-memory-server may keep child-process handles alive briefly
  setTimeout(() => process.exit(0), 500).unref();
});

describe('EasyPrice API', () => {
  it('health check responds', async () => {
    const result = await request('GET', '/health');
    assert.equal(result.status, 200);
    assert.equal(result.data.status, 'ok');
  });

  it('registers, logs in and reads profile', async () => {
    const email = `user-${unique()}@test.dev`;
    const register = await request('POST', '/auth/register', {
      name: 'Тест',
      email,
      password: 'password123',
      city: 'Кокшетау',
    });
    assert.equal(register.status, 201);
    assert.ok(register.data.token);

    const me = await request('GET', '/auth/me', undefined, register.data.token);
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, email);
  });

  it('does not grant admin from a public registration role field', async () => {
    const register = await request('POST', '/auth/register', { name: 'Не админ', email: `public-admin-${unique()}@test.dev`, password: 'password123', city: 'Кокшетау', role: 'admin' });
    assert.equal(register.status, 201);
    assert.equal(register.data.user.role, 'user');
    const forbidden = await request('GET', '/admin/moderation/queue', undefined, register.data.token);
    assert.equal(forbidden.status, 403);
  });

  it('rejects invalid login', async () => {
    const result = await request('POST', '/auth/login', { email: `missing-${unique()}@test.dev`, password: 'wrong' });
    assert.equal(result.status, 401);
  });

  it('runs moderation lifecycle for promotion', async () => {
    const suffix = unique();
    const supplierEmail = `supplier-${suffix}@test.dev`;
    const adminEmail = `admin-${suffix}@test.dev`;

    const supplier = await request('POST', '/auth/register', {
      name: 'Поставщик', email: supplierEmail, password: 'password123', city: 'Кокшетау', role: 'supplier',
    });
    assert.equal(supplier.status, 201);

    const admin = await request('POST', '/auth/register', {
      name: 'Админ', email: adminEmail, password: 'password123', city: 'Кокшетау',
    });
    assert.equal(admin.status, 201);

    // promote second user to admin directly in DB for the test
    const { UserModel } = await import('../src/models/index.js');
    await UserModel.updateOne({ email: adminEmail }, { $set: { role: 'admin' } });
    const adminLogin = await request('POST', '/auth/login', { email: adminEmail, password: 'password123' });
    assert.equal(adminLogin.status, 200);

    const promotion = await request('POST', '/promotions', {
      title: 'Тестовая акция',
      place: 'Магазин',
      categoryId: 'cat-1',
      value: '−10%',
      startDate: '2026-01-01',
      endDate: '2099-12-31',
    }, supplier.data.token);
    assert.equal(promotion.status, 201);
    assert.equal(promotion.data.promotion.status, 'pending_review');

    const queue = await request('GET', '/admin/moderation/queue', undefined, adminLogin.data.token);
    assert.equal(queue.status, 200);
    assert.ok(queue.data.promotions.some((item: any) => item.id === promotion.data.promotion.id));

    const approve = await request('POST', `/admin/moderation/promotions/${promotion.data.promotion.id}`, { decision: 'approve' }, adminLogin.data.token);
    assert.equal(approve.status, 200);
    assert.equal(approve.data.promotion.status, 'published');

    const catalog = await request('GET', '/promotions?city=Кокшетау');
    assert.equal(catalog.status, 200);
    assert.ok(catalog.data.promotions.some((item: any) => item.id === promotion.data.promotion.id));

    // supplier cannot access admin endpoints
    const forbidden = await request('GET', '/admin/moderation/queue', undefined, supplier.data.token);
    assert.equal(forbidden.status, 403);
  });

  it('favorites toggle persists per user', async () => {
    const email = `fav-${unique()}@test.dev`;
    const user = await request('POST', '/auth/register', { name: 'Фав', email, password: 'password123', city: 'Кокшетау' });
    const token = user.data.token;

    const add = await request('POST', '/favorites', { targetType: 'organization', targetId: 'org-1' }, token);
    assert.equal(add.status, 201);

    const list = await request('GET', '/favorites', undefined, token);
    assert.equal(list.status, 200);
    assert.ok(list.data.favorites.some((item: any) => item.targetId === 'org-1'));

    const remove = await request('DELETE', '/favorites/organization/org-1', undefined, token);
    assert.equal(remove.status, 200);

    const listAfter = await request('GET', '/favorites', undefined, token);
    assert.ok(!listAfter.data.favorites.some((item: any) => item.targetId === 'org-1'));
  });

  it('separates promotion views from intentional clicks', async () => {
    const suffix = unique();
    const supplier = await request('POST', '/auth/register', { name: 'Поставщик', email: `events-${suffix}@test.dev`, password: 'password123', city: 'Кокшетау', role: 'supplier' });
    const promotion = await request('POST', '/promotions', { title: 'События метрики', place: 'Магазин', categoryId: 'cat-1', startDate: '2026-01-01', endDate: '2099-12-31' }, supplier.data.token);
    const admin = await request('POST', '/auth/register', { name: 'Модератор', email: `events-admin-${suffix}@test.dev`, password: 'password123', city: 'Кокшетау' });
    const { UserModel } = await import('../src/models/index.js');
    await UserModel.updateOne({ email: `events-admin-${suffix}@test.dev` }, { $set: { role: 'admin' } });
    const login = await request('POST', '/auth/login', { email: `events-admin-${suffix}@test.dev`, password: 'password123' });
    const approved = await request('POST', `/admin/moderation/promotions/${promotion.data.promotion.id}`, { decision: 'approve' }, login.data.token);
    assert.equal(approved.status, 200);
    await request('GET', `/promotions/${promotion.data.promotion.id}`);
    const viewed = await (await import('../src/models/index.js')).PromotionModel.findOne({ id: promotion.data.promotion.id }).lean();
    assert.equal(viewed?.views, 1);
    assert.equal(viewed?.clicks, 0);
    const click = await request('POST', `/promotions/${promotion.data.promotion.id}/click`);
    assert.equal(click.status, 200);
    const clicked = await (await import('../src/models/index.js')).PromotionModel.findOne({ id: promotion.data.promotion.id }).lean();
    assert.equal(clicked?.views, 1);
    assert.equal(clicked?.clicks, 1);
  });

  it('keeps pending products private and publishes them only after moderation', async () => {
    const suffix = unique();
    const supplier = await request('POST', '/auth/register', { name: 'Поставщик', email: `product-${suffix}@test.dev`, password: 'password123', city: 'Кокшетау', role: 'supplier' });
    const organization = await request('POST', '/organizations', { name: `Бизнес ${suffix}`, category: 'Еда', address: 'Кокшетау' }, supplier.data.token);
    const admin = await request('POST', '/auth/register', { name: 'Модератор', email: `product-admin-${suffix}@test.dev`, password: 'password123', city: 'Кокшетау' });
    const { UserModel } = await import('../src/models/index.js');
    await UserModel.updateOne({ email: `product-admin-${suffix}@test.dev` }, { $set: { role: 'admin' } });
    const login = await request('POST', '/auth/login', { email: `product-admin-${suffix}@test.dev`, password: 'password123' });
    await request('POST', `/admin/moderation/organizations/${organization.data.organization.id}`, { decision: 'approve' }, login.data.token);
    const product = await request('POST', '/products', { organizationId: organization.data.organization.id, title: 'Тестовый товар', categoryId: 'cat-1', price: 2500 }, supplier.data.token);
    assert.equal(product.status, 201);
    const privateCatalog = await request('GET', '/products?status=all');
    assert.equal(privateCatalog.data.products.some((item: any) => item.id === product.data.product.id), false);
    const privateDetail = await request('GET', `/products/${product.data.product.id}`);
    assert.equal(privateDetail.status, 404);
    const publish = await request('POST', `/admin/moderation/products/${product.data.product.id}`, { decision: 'approve' }, login.data.token);
    assert.equal(publish.status, 200);
    const publicDetail = await request('GET', `/products/${product.data.product.id}`);
    assert.equal(publicDetail.status, 200);
    assert.equal(publicDetail.data.product.status, 'published');
  });

  it('assistant returns explicit no-data message', async () => {
    const result = await request('POST', '/assistant', { query: `qzzz-${unique()}` });
    assert.equal(result.status, 200);
    assert.match(result.data.answer, /нет подходящих данных|не нашёл|не нашел/i);
  });

  it('answers app-help questions instead of searching the product catalog', async () => {
    const result = await request('POST', '/assistant', { query: 'Как изменить профиль и получать подходящие рекомендации?' });
    assert.equal(result.status, 200);
    assert.match(result.data.answer, /профил|рекомендац/i);
    assert.deepEqual(result.data.results, []);
  });

  it('validates routing coordinates and serves unified catalog endpoints', async () => {
    const invalidRoute = await request('GET', '/routes?fromLat=no&fromLng=0&toLat=0&toLng=0');
    assert.equal(invalidRoute.status, 400);
    const deals = await request('GET', '/deals');
    assert.equal(deals.status, 200);
    assert.ok(Array.isArray(deals.data.deals));
    const search = await request('GET', '/search?q=Samsung%20A57');
    assert.equal(search.status, 200);
    assert.ok(Array.isArray(search.data.products));
  });

  it('finds products when search queries include natural-language filler words', async () => {
    const id = `search-product-${unique()}`;
    const { ProductModel } = await import('../src/models/index.js');
    await ProductModel.create({ id, title: 'Samsung Galaxy A56', price: 219990, categoryId: 'Смартфоны', city: 'Кокшетау', status: 'published', brand: 'Samsung' });
    try {
      const search = await request('GET', `/search?q=${encodeURIComponent('Найти Samsung Galaxy по цене')}`);
      assert.ok(search.data.products.some((item: any) => item.id === id));

      const comparison = await request('GET', `/catalog/compare?search=${encodeURIComponent('Samsung Galaxy цена')}`);
      assert.ok(comparison.data.products.some((item: any) => item.id === id));
    } finally {
      await ProductModel.deleteOne({ id });
    }
  });

  it('creates one validated organization review and updates its rating', async () => {
    const suffix = unique();
    const reviewer = await request('POST', '/auth/register', { name: 'Автор отзыва', email: `review-${suffix}@test.dev`, password: 'password123', city: 'Кокшетау' });
    const { OrganizationModel } = await import('../src/models/index.js');
    const organizationId = `review-org-${suffix}`;
    await OrganizationModel.create({ id: organizationId, name: 'Кофейня для теста', category: 'Кафе', description: '', address: 'Адрес не указан', city: 'Кокшетау', ownerId: 'osm-import', source: 'osm', status: 'published' });
    const created = await request('POST', `/organizations/${organizationId}/reviews`, { rating: 5, text: 'Хороший кофе' }, reviewer.data.token);
    assert.equal(created.status, 201);
    const duplicate = await request('POST', `/organizations/${organizationId}/reviews`, { rating: 4, text: 'Повторный отзыв' }, reviewer.data.token);
    assert.equal(duplicate.status, 409);
    const invalidRating = await request('POST', `/organizations/${organizationId}/reviews`, { rating: 42, text: 'Невалидная оценка' }, reviewer.data.token);
    assert.equal(invalidRating.status, 400);
    const detail = await request('GET', `/organizations/${organizationId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.rating.average, 5);
    assert.equal(detail.data.counts.reviews, 1);
    const deleted = await request('DELETE', `/organizations/${organizationId}/reviews/${created.data.review.id}`, undefined, reviewer.data.token);
    assert.equal(deleted.status, 200);
    const afterDelete = await request('GET', `/organizations/${organizationId}/reviews`);
    assert.equal(afterDelete.data.rating.count, 0);
  });
});
