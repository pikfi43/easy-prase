import { Router } from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { OrganizationModel, ProductModel, PromotionModel, ReviewModel } from '../models/index.js';

const uploadDir = path.resolve(process.cwd(), 'uploads');
mkdirSync(uploadDir, { recursive: true });

const allowedMime: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadDir),
  filename: (_request, file, callback) => {
    const ext = allowedMime[file.mimetype] ?? '.bin';
    callback(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!allowedMime[file.mimetype]) {
      callback(new Error('Допустимы только JPEG, PNG и WebP'));
      return;
    }
    callback(null, true);
  },
});

export const uploadsRouter = Router();

const imageSignatureIsValid = (filePath: string, mime: string) => {
  const bytes = readFileSync(filePath);
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
};

const removeLocalImage = (url?: string) => {
  if (!url?.startsWith('/uploads/')) return;
  const filename = path.basename(url);
  try { unlinkSync(path.join(uploadDir, filename)); } catch { /* missing/already deleted */ }
};

uploadsRouter.post('/image', requireRole(['supplier', 'admin']), upload.single('file'), (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: 'Файл не получен' });
    return;
  }
  if (!imageSignatureIsValid(request.file.path, request.file.mimetype)) {
    unlinkSync(request.file.path);
    response.status(400).json({ error: 'Файл не соответствует указанному формату изображения' });
    return;
  }
  response.status(201).json({ url: `/uploads/${request.file.filename}`, size: request.file.size, mime: request.file.mimetype });
});

uploadsRouter.post('/reviews/:reviewId/image', requireAuth, upload.single('file'), async (request, response) => {
  if (!request.file) { response.status(400).json({ error: 'Файл не получен' }); return; }
  if (!imageSignatureIsValid(request.file.path, request.file.mimetype)) { unlinkSync(request.file.path); response.status(400).json({ error: 'Файл не соответствует указанному формату изображения' }); return; }
  const url = `/uploads/${request.file.filename}`;
  const review = await ReviewModel.findOne({ id: request.params.reviewId, userId: request.user!.id, status: 'published' }).lean();
  if (!review) { unlinkSync(request.file.path); response.status(404).json({ error: 'Отзыв не найден' }); return; }
  if (review.photos.length >= 5) { unlinkSync(request.file.path); response.status(409).json({ error: 'Можно добавить не более пяти фото' }); return; }
  await ReviewModel.updateOne({ id: review.id }, { $push: { photos: url }, $set: { updatedAt: new Date().toISOString() } });
  response.status(201).json({ url });
});

// Attach an uploaded image to an existing entity.
uploadsRouter.post('/:kind/:id/image', requireAuth, upload.single('file'), async (request, response) => {
  const kind = String(request.params.kind);
  const id = String(request.params.id);
  if (!['organizations', 'promotions', 'products'].includes(kind)) {
    response.status(400).json({ error: 'Некорректный тип объекта' });
    return;
  }
  if (!request.file) {
    response.status(400).json({ error: 'Файл не получен' });
    return;
  }
  if (!imageSignatureIsValid(request.file.path, request.file.mimetype)) {
    unlinkSync(request.file.path);
    response.status(400).json({ error: 'Файл не соответствует указанному формату изображения' });
    return;
  }
  const url = `/uploads/${request.file.filename}`;
  const user = request.user!;
  let oldImage = '';

  try {
    if (kind === 'organizations') {
      const filter: Record<string, unknown> = { id };
      if (user.role !== 'admin') filter.ownerId = user.id;
      const updated = await OrganizationModel.findOneAndUpdate(filter, { $push: { photos: { $each: [url], $slice: -6 } } }).lean();
      if (!updated) throw new Error('not found');
    } else if (kind === 'promotions') {
      const filter: Record<string, unknown> = { id };
      if (user.role !== 'admin') filter.ownerId = user.id;
      const current = await PromotionModel.findOne(filter).select('image').lean();
      if (!current) throw new Error('not found');
      oldImage = current.image ?? '';
      const updated = await PromotionModel.findOneAndUpdate(filter, { $set: { image: url } }).lean();
      if (!updated) throw new Error('not found');
    } else {
      const product = await ProductModel.findOne({ id }).lean();
      if (!product) throw new Error('not found');
      if (user.role !== 'admin') {
        const organization = await OrganizationModel.findOne({ id: product.organizationId }).lean();
        if (!organization || organization.ownerId !== user.id) throw new Error('forbidden');
      }
      oldImage = product.image ?? '';
      await ProductModel.updateOne({ id }, { $set: { image: url } });
    }
    removeLocalImage(oldImage);
    response.status(201).json({ url });
  } catch (error) {
    unlinkSync(request.file.path);
    const message = error instanceof Error && error.message === 'forbidden' ? 'Недостаточно прав' : 'Объект не найден';
    response.status(message === 'Недостаточно прав' ? 403 : 404).json({ error: message });
  }
});
