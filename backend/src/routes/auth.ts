import { Router } from 'express';
import { createToken, hashPassword, verifyPassword } from '../lib/hash.js';
import { requireAuth } from '../middleware/auth.js';
import { userCategories, cities } from '../config.js';
import { OrganizationModel, ProductModel, PromotionModel, UserModel, type Role } from '../models/index.js';

const publicUser = (user: { id: string; name: string; email: string; role: Role; category: string; city: string; phone?: string; notificationSettings?: Record<string, boolean> }) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  category: user.category,
  city: user.city,
  phone: user.phone ?? '',
  notificationSettings: user.notificationSettings ?? {},
});

export const authRouter = Router();

authRouter.post('/register', async (request, response) => {
  const { name, email, password, role = 'user', category = 'Обычный житель', city, phone = '' } = request.body as Partial<{ name: string; email: string; password: string; role: string; category: string; city: string; phone: string }>;
  if (!name?.trim() || !email?.trim() || !password || password.length < 8) {
    response.status(400).json({ error: 'Имя, email и пароль от 8 символов обязательны' });
    return;
  }
  if (await UserModel.exists({ email: email.toLowerCase() })) {
    response.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован' });
    return;
  }
  if (!city || !cities.includes(city as typeof cities[number])) {
    response.status(400).json({ error: 'Выберите город' });
    return;
  }
  const safeRole: Role = role === 'supplier' ? 'supplier' : 'user';
  // Never let a public registration claim admin by being first in an empty database.
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase();
  const allowAdmin = role === 'admin' && Boolean(bootstrapEmail) && email.toLowerCase() === bootstrapEmail;
  const finalRole: Role = allowAdmin ? 'admin' : safeRole;
  const safeCategory = userCategories.includes(category as typeof userCategories[number]) ? category : 'Обычный житель';
  const user = await UserModel.create({
    id: crypto.randomUUID(),
    name: name.trim(),
    email: email.toLowerCase(),
    passwordHash: hashPassword(password),
    role: finalRole,
    category: safeCategory,
    city,
    phone: String(phone).trim(),
  });
  response.status(201).json({ token: await createToken(user.id, user.role), user: publicUser(user) });
});

authRouter.post('/login', async (request, response) => {
  const { email, password } = request.body as { email?: string; password?: string };
  const user = email ? await UserModel.findOne({ email: email.toLowerCase() }) : null;
  if (!user || !password || !verifyPassword(password, user.passwordHash)) {
    response.status(401).json({ error: 'Неверный email или пароль' });
    return;
  }
  if (user.blocked) {
    response.status(403).json({ error: 'Аккаунт заблокирован' });
    return;
  }
  response.json({ token: await createToken(user.id, user.role), user: publicUser(user) });
});

authRouter.get('/me', requireAuth, (request, response) => {
  response.json({ user: publicUser(request.user!) });
});

authRouter.patch('/me', requireAuth, async (request, response) => {
  const user = request.user!;
  const { name, category, city, phone, notificationSettings } = request.body as Partial<{ name: string; category: string; city: string; phone: string; notificationSettings: Record<string, boolean> }>;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    if (!name.trim()) {
      response.status(400).json({ error: 'Имя обязательно' });
      return;
    }
    updates.name = name.trim();
  }
  if (category !== undefined) {
    if (!userCategories.includes(category as typeof userCategories[number])) {
      response.status(400).json({ error: 'Недопустимая категория профиля' });
      return;
    }
    updates.category = category;
  }
  if (city !== undefined) {
    if (!cities.includes(city as typeof cities[number])) {
      response.status(400).json({ error: 'Недопустимый город' });
      return;
    }
    updates.city = city;
  }
  if (phone !== undefined) updates.phone = String(phone).trim();
  if (notificationSettings && typeof notificationSettings === 'object') {
    const sanitized: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(notificationSettings)) sanitized[key] = Boolean(value);
    updates.notificationSettings = sanitized;
  }
  const updated = await UserModel.findOneAndUpdate({ id: user.id }, updates, { returnDocument: 'after' }).lean();
  if (!updated) {
    response.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  response.json({ user: publicUser(updated) });
});

authRouter.get('/stats', requireAuth, async (request, response) => {
  if (request.user!.role !== 'admin') {
    response.status(403).json({ error: 'Недостаточно прав' });
    return;
  }
  const [users, organizations, promotions, products, pendingOrganizations, pendingPromotions, pendingProducts] = await Promise.all([
    UserModel.countDocuments(),
    OrganizationModel.countDocuments(),
    PromotionModel.countDocuments(),
    ProductModel.countDocuments(),
    OrganizationModel.countDocuments({ status: 'pending_review' }),
    PromotionModel.countDocuments({ status: 'pending_review' }),
    ProductModel.countDocuments({ status: 'pending_review' }),
  ]);
  response.json({ stats: { users, organizations, promotions, products, pendingOrganizations, pendingPromotions, pendingProducts } });
});
