import { ImportLogModel, OrganizationModel, PriceHistoryModel, ProductModel, SourceStoreMappingModel, StoreOfferModel, type ProductDoc } from '../models/index.js';
import { normalizeExternalUrl } from '../lib/external-url.js';
import { PDFParse } from 'pdf-parse';

export type CatalogSource = 'technodom' | 'alser' | 'toimart' | 'arbuz' | 'yandex-lavka' | 'small';
type RawProduct = { name: string; brand?: string; model?: string; sku?: string; category?: string; price: number; oldPrice?: number; image?: string; url?: string; availability?: string; rating?: number; reviewsCount?: number; unit?: string; volume?: string; weight?: string };
type SourceConfig = { env: string; sourceCity: string; businessNames: string[]; demo: boolean; allowVerifiedCity: boolean };

const configs: Record<CatalogSource, SourceConfig> = {
  technodom: { env: 'TECHNODOM_CATALOG_URL', sourceCity: 'Кокшетау', businessNames: ['technodom', 'технодом'], demo: false, allowVerifiedCity: true },
  alser: { env: 'ALSER_CATALOG_URL', sourceCity: 'Кокшетау', businessNames: ['alser', 'алсер'], demo: false, allowVerifiedCity: true },
  toimart: { env: 'TOIMART_CATALOG_URL', sourceCity: 'не подтверждён', businessNames: ['toimart', 'тоймарт'], demo: true, allowVerifiedCity: false },
  arbuz: { env: 'ARBUZ_CATALOG_URL', sourceCity: 'Алматы', businessNames: ['arbuz'], demo: true, allowVerifiedCity: false },
  'yandex-lavka': { env: 'LAVKA_CATALOG_URL', sourceCity: 'Каталог demo', businessNames: [], demo: true, allowVerifiedCity: false },
  small: { env: 'SMALL_CATALOG_URL', sourceCity: 'Кокшетау', businessNames: ['small', 'small food', 'смолл'], demo: false, allowVerifiedCity: true },
};

const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const number = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};
const normalize = (value: string) => value.toLocaleLowerCase('ru').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const parseBrand = (value: unknown) => typeof value === 'string' ? value : text((value as { name?: unknown } | null)?.name);

const productFromObject = (item: Record<string, unknown>): RawProduct | null => {
  const type = item['@type'];
  if (!(type === 'Product' || (Array.isArray(type) && type.includes('Product')))) return null;
  const offer = (Array.isArray(item.offers) ? item.offers[0] : item.offers) as Record<string, unknown> | undefined;
  const price = number(offer?.price ?? offer?.lowPrice ?? item.price);
  const name = text(item.name);
  if (!price || !name) return null;
  const ratingData = item.aggregateRating as Record<string, unknown> | undefined;
  const sku = text(item.sku) || text(item.mpn) || text(item.productID);
  const url = text(item.url);
  const brand = parseBrand(item.brand);
  if (!sku && !url && !brand) return null;
  return {
    name,
    brand,
    model: text(item.model),
    sku,
    category: text(item.category),
    price,
    oldPrice: number(item.oldPrice ?? item.listPrice ?? item.compareAtPrice),
    image: text(Array.isArray(item.image) ? item.image[0] : item.image),
    url,
    availability: text(offer?.availability),
    rating: number(ratingData?.ratingValue),
    reviewsCount: number(ratingData?.reviewCount),
  };
};

function collectProducts(value: unknown, result: RawProduct[], seen: Set<object>) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) { for (const item of value) collectProducts(item, result, seen); return; }
  const object = value as Record<string, unknown>;
  if (object['@type'] === 'Product' || (Array.isArray(object['@type']) && object['@type'].includes('Product'))) {
    const item = productFromObject(object);
    if (item) result.push(item);
  }
  for (const child of Object.values(object)) collectProducts(child, result, seen);
}

function collectTechnodomProducts(value: unknown, result: RawProduct[], seen: Set<object>) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) { for (const item of value) collectTechnodomProducts(item, result, seen); return; }
  const object = value as Record<string, unknown>;
  const name = text(object.title ?? object.name);
  const price = number(object.price ?? object.default_price ?? object.promo_price);
  if (name && price && (object.sku || object.uri) && (object.brand || object.brand_info || object.categories)) {
    const payment = object.payment && typeof object.payment === 'object' ? object.payment as Record<string, unknown> : undefined;
    const oldPrice = number(object.oldPrice ?? object.old_price ?? payment?.oldPrice);
    const rating = number(object.rating);
    const modelMatch = name.match(/\(([A-Z0-9][A-Z0-9-]{5,})\)\s*$/i);
    result.push({
      name, brand: parseBrand(object.brand_info ?? object.brand), model: modelMatch?.[1], sku: text(object.sku),
      category: Array.isArray(object.categories) ? text(object.categories[0]) : 'Техника', price,
      oldPrice: oldPrice && oldPrice > price ? oldPrice : undefined, url: text(object.uri),
      rating: rating ? (rating > 5 && rating <= 100 ? rating / 20 : rating) : undefined,
      reviewsCount: number(object.reviews), availability: text(object.is_enabled) === 'false' ? 'нет в наличии' : 'доступность уточняйте',
    });
  }
  for (const child of Object.values(object)) collectTechnodomProducts(child, result, seen);
}

export function parsePublicProductPage(html: string, pageUrl: string): RawProduct[] {
  const found: RawProduct[] = [];
  const seen = new Set<object>();
  const scripts = html.matchAll(/<script[^>]+(?:type=["']application\/ld\+json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try { collectProducts(JSON.parse(match[1]), found, seen); } catch { /* malformed structured data is skipped, never treated as an empty successful import */ }
  }
  if (!found.length && new URL(pageUrl).hostname.endsWith('technodom.kz')) {
    const nextData = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (nextData) {
      try { collectTechnodomProducts(JSON.parse(nextData), found, new Set<object>()); } catch { /* malformed page state is not imported */ }
    }
  }
  const page = new URL(pageUrl);
  if (page.hostname.endsWith('arbuz.kz')) {
    for (const match of html.matchAll(/:product=["']([^"']+)["']/gi)) {
      try {
        const decoded = match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
        const item = JSON.parse(decoded) as Record<string, unknown>;
        const name = text(item.name);
        const price = number(item.priceSpecial ?? item.priceActual);
        if (!name || !price) continue;
        const sku = text(item.id) || text(item.barcode);
        const uri = text(item.uri);
        const image = text(item.image).replaceAll('%w', '400').replaceAll('%h', '400');
        found.push({
          name, brand: text(item.brandName), sku, category: text(item.catalogName) || 'Продукты', price,
          oldPrice: number(item.pricePrevious), image, url: uri ? new URL(uri, page).toString() : undefined,
          availability: item.isAvailable === false ? 'нет в наличии' : 'в наличии',
          unit: text(item.measure), weight: text(item.weight),
        });
      } catch { /* malformed product-card state is skipped */ }
    }
  }
  const unique = new Map<string, RawProduct>();
  for (const item of found) {
    const resolvedUrl = item.url ? (/^https?:\/\//i.test(item.url) ? item.url : new URL(item.url, page).toString()) : '';
    const key = item.sku || resolvedUrl || `${normalize(item.brand ?? '')}-${normalize(item.name)}`;
    if (!unique.has(key)) unique.set(key, { ...item, url: resolvedUrl });
  }
  return [...unique.values()].map((item) => ({ ...item, url: normalizeExternalUrl(page.hostname.endsWith('technodom.kz') ? 'technodom' : undefined, item.url) }));
}

export function parseCatalogPdfText(input: string): RawProduct[] {
  const results: RawProduct[] = [];
  const pricePattern = /([\d\u00a0\s]{2,12}(?:[.,]\d{1,2})?)\s*(?:₸|тг\.?)/giu;
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (line.length < 6) continue;
    const prices = [...line.matchAll(pricePattern)].map((match) => number(match[1])).filter((item): item is number => item !== undefined);
    if (!prices.length) continue;
    const lastIndex = line.search(pricePattern);
    const name = line.slice(0, lastIndex >= 0 ? lastIndex : line.length).replace(/[-−–]?\s*\d{1,3}\s*%/g, '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
    if (name.length < 3 || !/[\p{L}]{2}/u.test(name)) continue;
    const currentPrice = prices.at(-1)!;
    const oldPrice = prices.length > 1 && prices.at(-2)! > currentPrice ? prices.at(-2) : undefined;
    results.push({ name: name.slice(0, 180), price: currentPrice, oldPrice });
  }
  const unique = new Map<string, RawProduct>();
  for (const item of results) unique.set(`${normalize(item.name)}-${item.price}`, item);
  return [...unique.values()];
}

async function pdfText(url: string) {
  const response = await fetch(url, { headers: { Accept: 'application/pdf', 'User-Agent': 'EasyPrice/1.0 (public catalog import)' }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`PDF каталога вернул HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 5 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Ссылка каталога не вернула PDF; импорт прекращён');
  if (bytes.length > 30 * 1024 * 1024) throw new Error('PDF каталога превышает лимит 30 МБ');
  const parser = new PDFParse({ data: bytes });
  try { return (await parser.getText()).text; }
  finally { await parser.destroy(); }
}

async function fetchCatalogItems(source: CatalogSource, url: string) {
  const response = await fetch(url, { headers: { Accept: 'text/html,application/ld+json,application/json,application/pdf', 'User-Agent': 'EasyPrice/1.0 (public catalog import)' }, signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`${source} вернул HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (/pdf/i.test(contentType) || new URL(url).pathname.toLocaleLowerCase().endsWith('.pdf')) return parseCatalogPdfText(await pdfText(url));
  const html = await response.text();
  const structured = parsePublicProductPage(html, url);
  if (structured.length) return structured;
  const pdfLinks = [...html.matchAll(/<a\b[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  if (pdfLinks.length) {
    const preferred = pdfLinks.find((link) => /каталог|catalog|скид|акци/i.test(link[2]));
    const ordered = preferred ? [preferred, ...pdfLinks.filter((link) => link !== preferred)] : pdfLinks;
    const pdfUrls = [...new Set(ordered.slice(0, 5).map((link) => new URL(link[1], url).toString()))];
    const catalogs = await Promise.all(pdfUrls.map(async (pdfUrl) => parseCatalogPdfText(await pdfText(pdfUrl))));
    return catalogs.flat();
  }
  return [];
}

const localCityVerified = (source: CatalogSource, url: string) => {
  const config = configs[source];
  if (!config.allowVerifiedCity) return false;
  try { return new URL(url).pathname.toLocaleLowerCase().includes('/kokshetau'); } catch { return false; }
};

export async function importCatalog(source: CatalogSource) {
  const sourceConfig = configs[source];
  if (!sourceConfig) throw new Error(`Неизвестный источник: ${source}`);
  const startedAt = new Date().toISOString();
  const log = await ImportLogModel.create({ id: crypto.randomUUID(), source, startedAt, status: 'RUNNING', itemsFetched: 0, itemsAdded: 0, itemsUpdated: 0, itemsSkipped: 0, errors: [] });
  try {
    const configured = process.env[sourceConfig.env] || (source === 'technodom' ? [
      'https://www.technodom.kz/kokshetau/catalog/smartfony-i-gadzhety/smartfony-i-telefony/smartfony?page=1',
      'https://www.technodom.kz/kokshetau/catalog/noutbuki-i-komp-jutery?page=1',
      'https://www.technodom.kz/kokshetau/catalog/tv-audio-foto-video/televizory?page=1',
      'https://www.technodom.kz/kokshetau/catalog/bytovaja-tehnika?page=1',
    ].join(',') : source === 'arbuz' ? [
      'https://arbuz.kz/ru/almaty/catalog/cat/225177-frukty?page=1',
      'https://arbuz.kz/ru/almaty/catalog/cat/226059-molochnye_produkty?page=1',
      'https://arbuz.kz/ru/almaty/catalog/cat/14-voda_i_napitki?page=1',
      'https://arbuz.kz/ru/almaty/catalog/cat/226066-bakaleya?page=1',
      'https://arbuz.kz/ru/almaty/catalog/cat/225253-gotovaya_eda?page=1',
    ].join(',') : source === 'alser' ? 'https://alser.kz/kokshetau/c/vse-smartfony?page=1' : source === 'toimart' ? 'https://www.toimart.kz/catalogs' : '');
    if (!configured) throw new Error(`Источник не настроен: задайте ${sourceConfig.env} на официальный публичный каталог / feed`);
    const urls = [...new Set(configured.split(',').map((item) => item.trim()).filter(Boolean))];
    const raw: RawProduct[] = [];
    for (let index = 0; index < urls.length; index += 1) {
      const maxPages = Math.max(1, Math.min(50, Number(process.env.IMPORT_MAX_PAGES) || 10));
      for (let page = 1; page <= maxPages; page += 1) {
        if (index || page > 1) await new Promise((resolve) => setTimeout(resolve, 1100));
        const pageUrl = new URL(urls[index]);
        if (source === 'technodom' || source === 'alser' || source === 'arbuz') pageUrl.searchParams.set('page', String(page));
        const batch = await fetchCatalogItems(source, pageUrl.toString());
        if (!batch.length) break;
        raw.push(...batch);
        if (!(source === 'technodom' && batch.length >= 10) && !(source === 'alser' && batch.length >= 10) && !(source === 'arbuz' && batch.length >= 10)) break;
      }
    }
    const previousOffers = await StoreOfferModel.countDocuments({ source });
    const minimum = Math.max(Number(process.env[`IMPORT_MIN_${source.toLocaleUpperCase().replaceAll('-', '_')}`]) || 10, Math.floor(previousOffers * 0.5));
    if (raw.length < minimum) throw new Error(`IMPORT_FAILED: минимум ${minimum} корректных товарных записей, получено ${raw.length}; старые данные сохранены`);

    const cityVerified = urls.some((url) => localCityVerified(source, url));
    const cityLabel = source === 'toimart' ? 'Не подтверждён' : source === 'yandex-lavka' ? 'Demo' : sourceConfig.sourceCity;
    const candidates: Array<Pick<ProductDoc, 'id' | 'title' | 'brand' | 'model' | 'modelCode' | 'source' | 'city' | 'categoryId' | 'image' | 'description'>> = await ProductModel.find({ status: 'published' }).select('id title brand model modelCode source city categoryId image description').lean();
    const mapping = cityVerified ? await SourceStoreMappingModel.findOne({ source, city: 'Кокшетау', verified: true }).lean() : null;
    const mappedOrganization = mapping ? await OrganizationModel.findOne({ id: mapping.organizationId, city: 'Кокшетау', status: 'published' }).lean() : null;
    const stores = cityVerified && !mappedOrganization ? await OrganizationModel.find({ city: 'Кокшетау', status: 'published' }).select('id name aliases lat lng').lean() : [];
    const organization = mappedOrganization ?? stores.find((item) => sourceConfig.businessNames.some((name) => [item.name, ...(item.aliases ?? [])].some((alias) => normalize(alias).includes(normalize(name)))));
    if (organization && cityVerified) {
      await SourceStoreMappingModel.findOneAndUpdate({ source, city: 'Кокшетау' }, { $set: { id: `${source}:kokshetau`, source, organizationId: organization.id, city: 'Кокшетау', verified: true, aliases: sourceConfig.businessNames, updatedAt: new Date().toISOString() } }, { upsert: true, setDefaultsOnInsert: true });
      await StoreOfferModel.updateMany({ source, organizationId: { $ne: organization.id } }, { $set: { organizationId: organization.id } });
    }
    let added = 0; let updated = 0; let skipped = 0;
    for (const item of raw) {
      if (!item.price || !item.name) { skipped += 1; continue; }
      const modelCode = item.model || item.sku || '';
      const titleKey = normalize(`${item.brand ?? ''} ${item.name}`);
      const canonical = candidates.find((product) => (modelCode && (product.modelCode === modelCode || product.model === modelCode)) || normalize(`${product.brand ?? ''} ${product.title}`) === titleKey);
      const now = new Date().toISOString();
      let productId = canonical?.id;
      if (!canonical) {
        productId = crypto.randomUUID();
        await ProductModel.create({ id: productId, title: item.name, description: '', price: item.price, oldPrice: item.oldPrice, categoryId: item.category || 'Импортированный товар', image: item.image ?? '', city: cityVerified ? 'Кокшетау' : cityLabel, status: 'published', normalizedName: normalize(item.name), brand: item.brand ?? '', model: item.model ?? '', modelCode, rating: item.rating, reviewsCount: item.reviewsCount, stockStatus: item.availability ?? 'unknown', source, sourceCity: cityLabel, cityVerified, demo: sourceConfig.demo || !cityVerified, externalUrl: item.url ?? '', externalId: item.sku ?? '', fetchedAt: now, unit: item.unit ?? '', volume: item.volume ?? '', weight: item.weight ?? '' });
        candidates.push({ id: productId, title: item.name, brand: item.brand, model: item.model, modelCode, source, city: cityLabel, categoryId: item.category ?? 'Импортированный товар', image: item.image ?? '', description: '' });
        added += 1;
      }
      if (!productId) { skipped += 1; continue; }
      const externalId = item.sku || item.url || `${normalize(item.name)}-${source}`;
      let offer = await StoreOfferModel.findOne({ source, externalId });
      const newOffer = { productId, organizationId: organization?.id, source, externalId, externalUrl: item.url ?? '', price: item.price, oldPrice: item.oldPrice, discountPercent: item.oldPrice && item.price < item.oldPrice ? Math.round((item.oldPrice - item.price) / item.oldPrice * 100) : undefined, stockStatus: item.availability ?? 'unknown', sourceCity: cityLabel, cityVerified, demo: sourceConfig.demo || !cityVerified, fetchedAt: now, lastVerifiedAt: cityVerified ? now : undefined };
      if (!offer) {
        offer = await StoreOfferModel.create({ id: crypto.randomUUID(), ...newOffer });
        await PriceHistoryModel.create({ id: crypto.randomUUID(), productId, offerId: offer.id, price: item.price, oldPrice: item.oldPrice, timestamp: now, source });
      } else {
        const changed = offer.price !== item.price || offer.oldPrice !== item.oldPrice;
        Object.assign(offer, newOffer);
        await offer.save();
        if (changed) await PriceHistoryModel.create({ id: crypto.randomUUID(), productId, offerId: offer.id, price: item.price, oldPrice: item.oldPrice, timestamp: now, source });
        updated += 1;
      }
    }
    await ImportLogModel.updateOne({ _id: log._id }, { $set: { finishedAt: new Date().toISOString(), itemsFetched: raw.length, itemsAdded: added, itemsUpdated: updated, itemsSkipped: skipped, status: 'SUCCESS' } });
    return { itemsFetched: raw.length, itemsAdded: added, itemsUpdated: updated, itemsSkipped: skipped, cityVerified };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ImportLogModel.updateOne({ _id: log._id }, { $set: { finishedAt: new Date().toISOString(), status: 'IMPORT_FAILED', errors: [message] } });
    throw error;
  }
}
