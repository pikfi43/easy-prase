import { ImportLogModel, OrganizationModel, type ImportLogDoc, type OrganizationDoc } from '../models/index.js';

const CITY = 'Кокшетау';
const BOUNDS = { south: 53.15, west: 69.25, north: 53.42, east: 69.56 };
const OVERPASS_URL = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
const tags = [
  ['amenity', 'restaurant'], ['amenity', 'cafe'], ['amenity', 'fast_food'], ['amenity', 'food_court'],
  ['amenity', 'ice_cream'], ['amenity', 'bar'], ['amenity', 'pub'], ['shop', 'mall'], ['shop', 'supermarket'],
  ['shop', 'convenience'], ['shop', 'electronics'], ['shop', 'mobile_phone'], ['shop', 'clothes'],
  ['amenity', 'pharmacy'], ['leisure', 'fitness_centre'], ['leisure', 'sports_centre'], ['amenity', 'cinema'],
  ['amenity', 'theatre'], ['amenity', 'nightclub'], ['leisure', 'amusement_arcade'],
] as const;

type OsmElement = {
  type: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number;
  center?: { lat: number; lon: number }; tags?: Record<string, string>;
};

const asText = (value: string | undefined) => value?.trim() ?? '';
const streetLabel = (value: string) => {
  const street = value.trim();
  const knownTypes: Array<[RegExp, string]> = [
    [/^(?:улица|ул\.?)\s+/i, 'ул. '], [/^(?:проспект|пр-т\.?)\s+/i, 'пр-т '],
    [/^(?:переулок|пер\.?)\s+/i, 'пер. '], [/^(?:шоссе)\s+/i, 'ш. '],
    [/^(?:бульвар|бул\.?)\s+/i, 'бул. '], [/^(?:микрорайон|мкр\.?)\s+/i, 'мкр. '],
  ];
  for (const [pattern, label] of knownTypes) if (pattern.test(street)) return street.replace(pattern, label);
  return street ? `ул. ${street}` : '';
};
const normalize = (value: string) => value.toLocaleLowerCase('ru').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const categoryFor = (tags: Record<string, string>) => {
  const key = tags.amenity ? `amenity:${tags.amenity}` : tags.shop ? `shop:${tags.shop}` : `leisure:${tags.leisure}`;
  const labels: Record<string, string> = {
    'amenity:restaurant': 'Ресторан', 'amenity:cafe': 'Кафе', 'amenity:fast_food': 'Фастфуд', 'amenity:food_court': 'Фуд-корт',
    'amenity:ice_cream': 'Мороженое', 'amenity:bar': 'Бар', 'amenity:pub': 'Паб', 'shop:mall': 'Торговый центр',
    'shop:supermarket': 'Супермаркет', 'shop:convenience': 'Продукты', 'shop:electronics': 'Техника', 'shop:mobile_phone': 'Техника',
    'shop:clothes': 'Одежда', 'amenity:pharmacy': 'Аптека', 'leisure:fitness_centre': 'Фитнес', 'leisure:sports_centre': 'Спорт',
    'amenity:cinema': 'Кино', 'amenity:theatre': 'Театр', 'amenity:nightclub': 'Развлечения', 'leisure:amusement_arcade': 'Развлечения',
  };
  return labels[key] ?? 'Организация';
};

const addressFor = (tags: Record<string, string>) => {
  const full = asText(tags['addr:full']);
  if (full) return full;
  const street = asText(tags['addr:street']);
  const number = asText(tags['addr:housenumber']);
  const city = asText(tags['addr:city']) || CITY;
  const district = asText(tags['addr:district']) || asText(tags['addr:suburb']);
  const postcode = asText(tags['addr:postcode']);
  const streetLine = [street && streetLabel(street), number].filter(Boolean).join(', ');
  if (!streetLine && !district && !postcode) return '';
  return [`г. ${city}`, streetLine, district && `р-н ${district}`, postcode && `индекс ${postcode}`].filter(Boolean).join(', ');
};

let lastNominatimRequestAt = 0;
async function reverseGeocode(lat: number, lon: number) {
  const wait = Math.max(0, 1100 - (Date.now() - lastNominatimRequestAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastNominatimRequestAt = Date.now();
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const response = await fetch(url, { headers: { 'user-agent': 'EasyPrice/1.0 (Kokshetau community directory)', 'accept-language': 'ru,en' }, signal: AbortSignal.timeout(9000) });
    if (!response.ok) return '';
    const result = await response.json() as { address?: Record<string, string> };
    const tags = result.address ?? {};
    const city = tags.city || tags.town || tags.village || CITY;
    const street = tags.road || tags.pedestrian || tags.residential || '';
    const number = tags.house_number || '';
    const district = tags.suburb || tags.city_district || tags.neighbourhood || '';
    const postcode = tags.postcode || '';
    return [`г. ${city}`, street && streetLabel(street), number, district && `р-н ${district}`, postcode && `индекс ${postcode}`].filter(Boolean).join(', ');
  } catch { return ''; }
}

export async function resolveMissingOsmAddresses() {
  const filter: Record<string, unknown> = { source: 'osm', city: CITY, lat: { $type: 'number' }, lng: { $type: 'number' }, $or: [{ addressText: { $exists: false } }, { addressText: '' }, { addressText: 'Адрес не указан' }], $and: [{ $or: [{ addressResolvedAt: { $exists: false } }, { addressResolvedAt: '' }] }] };
  const pending = await OrganizationModel.find(filter).select('id lat lng').lean();
  let resolved = 0; let unresolved = 0;
  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index];
    const address = await reverseGeocode(item.lat!, item.lng!);
    await OrganizationModel.updateOne({ id: item.id, source: 'osm' }, { $set: { address: address || 'Адрес не указан', addressText: address || 'Адрес не указан', addressResolvedAt: new Date().toISOString(), addressSource: address ? 'nominatim' : '' } });
    if (address) resolved += 1; else unresolved += 1;
    if ((index + 1) % 20 === 0 || index + 1 === pending.length) console.log(`Адреса: ${index + 1}/${pending.length}; определено ${resolved}; не найдено ${unresolved}`);
  }
  return { attempted: pending.length, resolved, unresolved };
}

export async function importKokshetauPoi() {
  const startedAt = new Date().toISOString();
  const log = await ImportLogModel.create({ id: crypto.randomUUID(), source: 'osm-kokshetau', startedAt, status: 'RUNNING', itemsFetched: 0, itemsAdded: 0, itemsUpdated: 0, itemsSkipped: 0, errors: [] });
  const query = `[out:json][timeout:90];( ${tags.map(([key, value]) => `nwr["${key}"="${value}"](${BOUNDS.south},${BOUNDS.west},${BOUNDS.north},${BOUNDS.east});`).join(' ')} );out center tags;`;

  try {
    const response = await fetch(OVERPASS_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'EasyPrice/1.0 (Kokshetau community POI import)' }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Overpass returned HTTP ${response.status}`);
    const payload = await response.json() as { elements?: OsmElement[] };
    const elements = payload.elements ?? [];
    const existingCount = await OrganizationModel.countDocuments({ source: 'osm' });
    const minimum = Math.max(10, Math.floor(existingCount * 0.5));
    if (elements.length < minimum) {
      throw new Error(`IMPORT_FAILED: ожидается не меньше ${minimum} POI, получено ${elements.length}; сохраненные организации не изменены`);
    }

    let added = 0; let updated = 0; let skipped = 0;
    const candidates: Array<Pick<OrganizationDoc, 'id' | 'name' | 'address' | 'lat' | 'lng'>> = await OrganizationModel.find({ city: CITY }).select('id name address lat lng').lean();
    for (const item of elements) {
      const tags = item.tags ?? {};
      const name = asText(tags.name) || asText(tags['name:ru']) || asText(tags.brand);
      const point = item.center ?? (typeof item.lat === 'number' && typeof item.lon === 'number' ? { lat: item.lat, lon: item.lon } : undefined);
      if (!name || !point || point.lat < BOUNDS.south || point.lat > BOUNDS.north || point.lon < BOUNDS.west || point.lon > BOUNDS.east) { skipped += 1; continue; }
      const osmId = `${item.type}/${item.id}`;
      const osmAddress = addressFor(tags);
      const exact = await OrganizationModel.findOne({ osmId }).lean();
      let addressText = osmAddress || (exact?.addressText !== 'Адрес не указан' ? exact?.addressText : '') || '';
      let addressResolvedAt = osmAddress ? new Date().toISOString() : exact?.addressResolvedAt ?? '';
      let addressSource: OrganizationDoc['addressSource'] = osmAddress ? 'osm' : exact?.addressSource ?? '';
      if (!addressText && !exact?.addressResolvedAt) {
        addressText = await reverseGeocode(point.lat, point.lon);
        addressResolvedAt = new Date().toISOString();
        addressSource = addressText ? 'nominatim' : '';
      }
      addressText ||= 'Адрес не указан';
      const aliases = [...new Set([tags.brand, tags.operator, tags['name:ru'], tags['name:kk']].map((value) => asText(value)).filter(Boolean))];
      const raw = {
        id: `osm-${item.type}-${item.id}`, name, category: categoryFor(tags), description: asText(tags.description), address: addressText, addressText, addressResolvedAt, addressSource, city: CITY,
        lat: point.lat, lng: point.lon, phone: asText(tags.phone || tags['contact:phone']), website: asText(tags.website || tags['contact:website']),
        workingHours: asText(tags.opening_hours), cuisine: asText(tags.cuisine), brand: asText(tags.brand), operator: asText(tags.operator),
        wheelchair: asText(tags.wheelchair), delivery: asText(tags.delivery), takeaway: asText(tags.takeaway), internetAccess: asText(tags.internet_access),
        aliases, photos: [tags.image, tags.wikimedia_commons].filter((value): value is string => Boolean(value)), ownerId: 'osm-import', osmId, osmType: item.type, source: 'osm' as const,
        verified: false, verificationStatus: 'pending_verification' as const, status: 'published' as const,
      };
      if (exact) {
        // OSM refreshes only OSM-owned rows. Supplier-owned claims and verified fields stay intact.
        if (exact.source !== 'osm' || exact.verified) { skipped += 1; continue; }
        await OrganizationModel.updateOne({ id: exact.id, source: 'osm', verified: { $ne: true } }, { $set: raw });
        updated += 1;
        continue;
      }
      const normalizedName = normalize(name);
      const duplicate = candidates.find((candidate) => {
        if (normalize(candidate.name) !== normalizedName || typeof candidate.lat !== 'number' || typeof candidate.lng !== 'number') return false;
        const dx = (candidate.lat - point.lat) * 111_000;
        const dy = (candidate.lng - point.lon) * 66_000;
        return Math.hypot(dx, dy) <= 100 && (normalize(candidate.address) === normalize(raw.address) || !raw.address || raw.address === CITY);
      });
      if (duplicate) { skipped += 1; continue; }
      await OrganizationModel.insertMany([raw satisfies Partial<OrganizationDoc>]);
      candidates.push({ id: raw.id, name: raw.name, address: raw.address, lat: raw.lat, lng: raw.lng });
      added += 1;
    }
    const finishedAt = new Date().toISOString();
    await ImportLogModel.updateOne({ _id: log._id }, { $set: { finishedAt, itemsFetched: elements.length, itemsAdded: added, itemsUpdated: updated, itemsSkipped: skipped, status: 'SUCCESS' } });
    return { itemsFetched: elements.length, itemsAdded: added, itemsUpdated: updated, itemsSkipped: skipped };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ImportLogModel.updateOne({ _id: log._id }, { $set: { finishedAt: new Date().toISOString(), status: 'IMPORT_FAILED', errors: [message] } });
    throw error;
  }
}
