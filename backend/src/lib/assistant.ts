import { EventModel, OrganizationModel, ProductModel, PromotionModel, StoreOfferModel } from '../models/index.js';
import { todayIso } from '../config.js';
import { answerAppHelp } from './assistant-help.js';

// ============================================================
// Движок ИИ-ассистента: интенты, морфология, синонимы, контекст
// ============================================================

type CatalogHit = {
  kind: 'organization' | 'promotion' | 'product';
  id: string;
  title: string;
  subtitle: string;
  lat?: number;
  lng?: number;
  organizationId?: string;
  distanceKm?: number;
  price?: number;
  discount?: number;
  demo?: boolean;
};

type AssistantRequest = {
  query: string;
  sessionId?: string;
  city?: string;
  category?: string;
  lat?: number;
  lng?: number;
};

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat); const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

const pick = (variants: string[]) => variants[Math.floor(Math.random() * variants.length)];

const normalize = (value: string) => value.toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

const STOP_WORDS = new Set(['и', 'в', 'на', 'с', 'по', 'за', 'до', 'из', 'от', 'у', 'к', 'о', 'об', 'а', 'но', 'или', 'же', 'бы', 'ли', 'не', 'ни', 'то', 'это', 'тут', 'там', 'мне', 'меня', 'тебе', 'тебя', 'вы', 'вас', 'мой', 'моя', 'где', 'куда', 'как', 'что', 'чем', 'чему', 'кто', 'когда', 'почему', 'зачем', 'какой', 'какая', 'какие', 'есть', 'буд', 'хочу', 'нужен', 'нужно', 'нужна', 'найти', 'найди', 'ищу', 'искать', 'покажи', 'показать', 'скажи', 'дай', 'хочу', 'пожалуйста', 'спасибо', 'привет', 'здравствуй', 'очень', 'можно', 'нельзя', 'могешь', 'можешь', 'умеешь', 'подскажи', 'посоветуй']);

const STEMS = ['ами', 'ями', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ой', 'ей', 'ый', 'ий', 'ам', 'ям', 'ов', 'ев', 'ах', 'ях', 'ть', 'ет', 'ут', 'ют', 'ит', 'ат', 'ят', 'у', 'ю', 'а', 'я', 'ы', 'и', 'е', 'о'];

function stem(word: string): string {
  if (word.length <= 4) return word;
  for (const ending of STEMS) {
    if (word.length - ending.length >= 4 && word.endsWith(ending)) return word.slice(0, word.length - ending.length);
  }
  return word;
}

function keywords(text: string): string[] {
  const normalized = normalize(text);
  const words = normalized.split(' ').filter((word) => word.length > 1 && !STOP_WORDS.has(word));
  const stems = words.map(stem);
  return [...new Set(stems)];
}

// Жаргон и синонимы: слово в запросе -> дополнительные корни для поиска по каталогу
const EXPANSIONS: Record<string, string[]> = {
  еда: ['кафе', 'ресторан', 'столов', 'пекар', 'фастфуд', 'пицц', 'кофе', 'шашлык', 'донер', 'гриль'],
  поесть: ['кафе', 'ресторан', 'столов', 'пекар', 'фастфуд', 'пицц', 'донер'],
  вкусн: ['кафе', 'ресторан', 'пекар', 'кофе'],
  кофе: ['кофе', 'кофейн', 'кафе'],
  перекус: ['кафе', 'пекар', 'фастфуд', 'столов'],
  обед: ['столов', 'кафе', 'пекар'],
  аптек: ['аптек', 'фарма', 'медикамент'],
  лекарств: ['аптек', 'фарма', 'медикамент'],
  медици: ['аптек', 'клиник', 'стоматолог', 'медикамент'],
  продукт: ['продукт', 'гастроном', 'супермаркет', 'маркет', 'магазин'],
  бакале: ['продукт', 'гастроном', 'супермаркет'],
  одежд: ['одежд', 'мода', 'бутик', 'магазин'],
  обув: ['обув', 'одежд', 'магазин'],
  электрон: ['электрон', 'техник', 'сотовый', 'гаджет'],
  техник: ['техник', 'электрон', 'гаджет'],
  телефон: ['сотовый', 'смартфон', 'гаджет', 'техник'],
  смартфон: ['смартфон', 'сотовый', 'гаджет'],
  ноутбук: ['ноутбук', 'компьютер', 'техник', 'гаджет'],
  ноут: ['ноутбук', 'компьютер'],
  телек: ['телевизор', 'техник'],
  телевизор: ['телевизор', 'техник'],
  подар: ['подар', 'сувенир', 'цвет'],
  цвет: ['цвет', 'флорист'],
  букет: ['цвет', 'флорист'],
  спорт: ['спорт', 'фитнес', 'тренаж', 'инвентар'],
  фитнес: ['фитнес', 'спорт', 'тренаж'],
  стрижк: ['парикмахер', 'салон', 'барбер'],
  парикмахер: ['парикмахер', 'салон', 'барбер'],
  красот: ['салон', 'красот', 'косметик'],
  автомобил: ['авто', 'автозапчаст', 'шин', 'автосервис'],
  авто: ['авто', 'автозапчаст', 'автосервис', 'шин'],
  шин: ['шин', 'авто', 'автозапчаст'],
  дет: ['детск', 'игрушк', 'товар для детей'],
  игрушк: ['игрушк', 'детск'],
  мебель: ['мебел', 'интерьер'],
  стройк: ['строй', 'ремонт', 'материал'],
  ремонт: ['ремонт', 'строй'],
  животн: ['зоо', 'животн', 'корм'],
  корм: ['корм', 'зоо'],
  книг: ['книг', 'канцеляр'],
  канцеляр: ['канцеляр', 'книг'],
  ювелир: ['ювелир', 'украшен', 'золот'],
  украшен: ['ювелир', 'украшен'],
};

function expand(stems: string[]): string[] {
  const extra: string[] = [];
  for (const stemValue of stems) {
    for (const [key, roots] of Object.entries(EXPANSIONS)) {
      if (stemValue.startsWith(key) || key.startsWith(stemValue)) extra.push(...roots);
    }
  }
  return [...new Set(extra)];
}

// ---------- Готовые ответы (варьируются, чтобы не звучать роботом) ----------

const GREETINGS = [
  'Привет! 👋 Я помощник EasyPrice. Могу найти товар, сравнить цены, показать акции и магазины рядом.',
  'Здравствуйте! Спрашивайте: «где дешевле кофе», «покажи акции», «ближайшая аптека» — я поищу в каталоге.',
  'Приветствую! Ищу скидки, товары и магазины Кокшетау. Что вам нужно?',
];
const THANKS = [
  'Всегда пожалуйста! Обращайтесь ещё 🙂',
  'Рад помочь! Если что — я тут.',
  'Пожалуйста! Пусть цены радуют.',
];
const FAREWELLS = [
  'До связи! Заглядывайте за новыми скидками 👋',
  'Пока! EasyPrice обновляет цены каждый день.',
  'Хорошего дня! Возвращайтесь за выгодными покупками.',
];
const HOW_ARE_YOU = [
  'Работаю как часы — каталог обновляется, скидки ищутся. А у вас как?',
  'Отлично! Уже успел просмотреть свежие предложения Кокшетау. Чем заняться вам?',
];
const ABILITIES = [
  'Вот что я умею:\n• искать товары и сравнивать цены — «сколько стоит Galaxy A56», «хлеб дешевле»;\n• показывать акции и скидки — «что со скидкой сегодня»;\n• находить организации — «ближайшая аптека», «где поесть рядом»;\n• строить маршрут к найденному месту;\n• объяснять, как работает приложение — избранное, геолокация, профиль.\nОтветы беру только из каталога EasyPrice и честно помечаю неподтверждённые цены.',
  'Я ищу по каталогу EasyPrice: товары с ценами из разных магазинов, действующие акции, организации рядом и маршруты к ним. Могу подсказать, как пользоваться приложением. Просто спросите своими словами — например «где недорого поесть» или «покажи скидки на технику».',
];
const NOT_FOUND = [
  'В каталоге пока нет ничего подходящего. Попробуйте другое слово — например не бренд, а тип товара («смартфон», «хлеб», «кроссовки»).',
  'Ничего не нашёл по этому запросу. Могу показать акции — просто напишите «что со скидкой», или попробуйте найти категорию: «аптека», «кафе», «электроника».',
  'Такого в каталоге не нашлось. Уточните запрос или проверьте написание — а я пока умею искать по типу товара, магазину или акции.',
];

// ---------- Контекст диалога (follow-up: «ещё», «дешевле», «ближе», «только акции») ----------

type Session = { hits: CatalogHit[]; offset: number; origin?: { lat: number; lng: number }; ts: number };
const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map<string, Session>();

function saveSession(id: string, session: Session) {
  const now = Date.now();
  sessions.set(id, { ...session, ts: now });
  if (sessions.size > 200) {
    for (const [key, value] of sessions) {
      if (now - value.ts > SESSION_TTL_MS) sessions.delete(key);
    }
    if (sessions.size > 200) {
      const oldest = [...sessions.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, sessions.size - 200);
      oldest.forEach(([key]) => sessions.delete(key));
    }
  }
}

// ---------- Распознавание намерений ----------

const INTENT = {
  greeting: /^(привет|здравствуй|здрав|салам|хай|hello|hi|добрый (день|вечер|утр)|доброе утро|ку)( |$)/,
  thanks: /спасиб|благодар|мерси|thx|круто|класс|супер|молодец|умниц/i,
  bye: /^(пока|досвидан|bye|увидимся|прощай)( |$)|^до свидан/,
  howAreYou: /как (дела|ты|сам|жизнь)|что нового/i,
  abilities: /что ты уме|чем ты мож|кто ты|что умеешь|твои возможн|как ты работ|что можешь/i,
  more: /^(еще|дальше|продолж)( |$)|еще вариант|ещё вариант|more/i,
  cheaper: /дешевле|подешевле|дешев|самая низкая|по возрастанию цены|сортируй по цене/i,
  closer: /ближе|поблизости|по расстоянию|рядом/i,
  onlyDeals: /^(только )?(акци|скидк|промо)/i,
  onlyProducts: /^(только )?(товар|продукт|цен)/i,
  onlyOrganizations: /^(только )?(магазин|организац|заведени|мест)/i,
  randomDeal: /что.*(скидк|акци).*(сегодня|сейчас)|случайн.*(акци|скидк)|покажи.*(акци|скидк)/i,
  events: /мероприят|событ|концерт|фестивал|выставк/i,
  city: /какой город|где я|мой город|кокшетау/i,
  priceOf: /сколько стоит|почём|почем|какая цена|цена на|цена .*₸|стоит ли/i,
};

// ---------- Категории организаций ----------

const CATEGORY_RX: Array<{ rx: RegExp; label: string }> = [
  { rx: /аптек|фарма|лекарств/, label: 'аптеки' },
  { rx: /кафе|кофе|ресторан|поест|еда|фастфуд|донер|пицц|столов|пекар|перекус|вкусн|обед|гриль|шашлык/, label: 'кафе и рестораны' },
  { rx: /продукт|гастроном|супермаркет|бакале|маркет/, label: 'продуктовые магазины' },
  { rx: /одежд|обув|мода|бутик/, label: 'магазины одежды' },
  { rx: /электрон|техник|гаджет|сотовый/, label: 'магазины электроники' },
  { rx: /аптек/, label: 'аптеки' },
  { rx: /парикмахер|салон|барбер|стрижк|красот/, label: 'салоны красоты' },
  { rx: /фитнес|спортзал|тренаж/, label: 'фитнес-клубы' },
  { rx: /цвет|флорист|букет/, label: 'цветочные магазины' },
  { rx: /авто|автозапчаст|шин|автосервис/, label: 'автомагазины и сервисы' },
  { rx: /детск|игрушк/, label: 'детские магазины' },
  { rx: /зоо|животн|корм/, label: 'зоомагазины' },
  { rx: /книг|канцеляр/, label: 'книжные магазины' },
  { rx: /мебел|интерьер/, label: 'магазины мебели' },
  { rx: /строй|ремонт|материал/, label: 'строительные магазины' },
  { rx: /ювелир|украшен|золот/, label: 'ювелирные магазины' },
];

// ---------- Fuzzy: расстояние Левенштейна ----------

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length; const n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[n];
}

const fuzzyOk = (a: string, b: string) => {
  const threshold = Math.max(1, Math.floor(Math.min(a.length, b.length) / 4));
  return levenshtein(a, b) <= threshold;
};

// ---------- Поиск по каталогу ----------

async function searchOrganizations(city: string, stems: string[], extraRoots: string[], categoryRx?: RegExp) {
  const organizations = await OrganizationModel.find({ status: 'published', ...(city ? { city } : {}) }).limit(1500).lean();
  const roots = [...new Set([...stems, ...extraRoots])];
  const scored = organizations
    .map((organization) => {
      const haystack = `${organization.name} ${organization.category} ${organization.address} ${(organization.aliases ?? []).join(' ')}`.toLocaleLowerCase('ru-RU');
      const haystackStems = keywords(haystack);
      let score = 0;
      for (const root of roots) {
        if (haystack.includes(root)) score += 2;
        else if (haystackStems.some((part) => part.startsWith(root) || root.startsWith(part))) score += 1;
      }
      if (categoryRx && categoryRx.test(haystack)) score += 2;
      return { organization, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.organization);
  return { organizations, scored };
}

async function searchProducts(stems: string[], extraRoots: string[]) {
  const roots = [...new Set([...stems, ...extraRoots])].filter((root) => root.length > 1);
  if (!roots.length) return [];
  const conditions = roots.flatMap((root) => [
    { title: { $regex: root, $options: 'i' } },
    { brand: { $regex: root, $options: 'i' } },
    { model: { $regex: root, $options: 'i' } },
    { categoryId: { $regex: root, $options: 'i' } },
  ]);
  const found = await ProductModel.find({ status: 'published', $or: conditions }).limit(60).lean();
  if (found.length) return found;
  // Fuzzy-фоллбэк: правки опечаток по заголовкам
  const pool = await ProductModel.find({ status: 'published' }).limit(2000).lean();
  return pool.filter((product) => {
    const titleTokens = keywords(`${product.title} ${product.brand ?? ''} ${product.model ?? ''}`);
    return stems.some((stemValue) => stemValue.length >= 4 && titleTokens.some((token) => fuzzyOk(stemValue, token)));
  });
}

// ---------- Формулировки ответов ----------

function describeHits(hits: CatalogHit[], intentLabel: string): string {
  if (!hits.length) return pick(NOT_FOUND);
  const intro = pick([
    `Вот что нашёл по запросу «${intentLabel}»:`,
    `Нашёл ${hits.length} подходящих вариант(ов):`,
    `По каталогу EasyPrice подходит ${hits.length} шт.:`,
  ]);
  const lines = hits.map((hit, index) => {
    const distance = hit.distanceKm !== undefined ? ` · ${hit.distanceKm.toFixed(1)} км от вас` : '';
    return `${index + 1}. ${hit.title} — ${hit.subtitle}${distance}`;
  });
  const cheapest = hits.filter((hit) => typeof hit.price === 'number').sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0];
  let tail = '';
  if (cheapest && hits.length > 1) tail = `\n\nСамая низкая цена — ${cheapest.price?.toLocaleString('ru-RU')} ₸ (${cheapest.title.slice(0, 40)}${cheapest.title.length > 40 ? '…' : ''}).`;
  if (hits.some((hit) => hit.demo)) tail += '\nПометка demo — цена ещё не подтверждена для Кокшетау, проверяйте источник.';
  if (hits.length > 1) tail += '\nСкажите «ещё», чтобы показать остальные варианты, или «только товары» / «только магазины» — отфильтрую.';
  return `${intro}\n${lines.join('\n')}${tail}`;
}

// ---------- Основной обработчик ----------

export async function handleAssistantQuery(request: AssistantRequest): Promise<{ answer: string; results: CatalogHit[] }> {
  const query = request.query.trim();
  const normalized = normalize(query);
  const sessionId = request.sessionId && /^[\w-]{6,64}$/.test(request.sessionId) ? request.sessionId : '';

  // --- светские реплики (умения — раньше приветствия: «привет, что ты умеешь?») ---
  if (INTENT.abilities.test(normalized)) return { answer: pick(ABILITIES), results: [] };
  if (INTENT.thanks.test(normalized) && normalized.split(' ').length <= 5) return { answer: pick(THANKS), results: [] };
  if (INTENT.greeting.test(normalized) && normalized.split(' ').length <= 4) return { answer: pick(GREETINGS), results: [] };
  if (INTENT.bye.test(normalized) && normalized.split(' ').length <= 3) return { answer: pick(FAREWELLS), results: [] };
  if (INTENT.howAreYou.test(normalized)) return { answer: pick(HOW_ARE_YOU), results: [] };

  if (INTENT.city.test(normalized)) {
    return { answer: pick([
      'EasyPrice сейчас работает по Кокшетау — все подтверждённые цены и организации отсюда. Ваш город можно сменить в профиле (шестерёнка рядом с именем).',
      'Каталог собран по Кокшетау. Город профиля можно поменять в настройках профиля — подборка на главной подстроится.',
    ]), results: [] };
  }

  // --- справка по приложению ---
  const helpAnswer = answerAppHelp(query, request.category);
  if (helpAnswer) return { answer: helpAnswer, results: [] };

  const stems = keywords(query);
  const extraRoots = expand(stems);
  const city = request.city?.trim() || 'Кокшетау';
  const today = todayIso();
  const hasOrigin = Number.isFinite(request.lat) && Number.isFinite(request.lng);
  const origin = hasOrigin ? { lat: request.lat!, lng: request.lng! } : undefined;

  // --- намерения по данным (важно: до follow-up, чтобы «где поесть рядом» не считался командой сортировки) ---
  const dealIntent = /скид|акци|распродаж|дешев|выгод|промо|снижен/.test(normalized);
  const nearbyIntent = /рядом|поблизости|ближайш|недалеко|около|вокруг|неподалеку/.test(normalized);
  const routeIntent = /маршрут|добраться|доехать|дойти|пролож|как доех|как дойт/.test(normalized);
  const priceIntent = INTENT.priceOf.test(normalized);
  const category = CATEGORY_RX.find(({ rx }) => rx.test(normalized));
  const isBareCommand = normalized.split(' ').length <= 4 && !category && !dealIntent && !priceIntent && !/купить|найди|ищу|покажи|сколько|цена|где/i.test(normalized);

  // --- follow-up по контексту: «ещё», «дешевле», «ближе», «только акции» ---
  if (sessionId && isBareCommand && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    const applyFilter = (kinds: CatalogHit['kind'][]) => {
      const filtered = session.hits.filter((hit) => kinds.includes(hit.kind));
      if (filtered.length) {
        session.hits = filtered; session.offset = 0;
        return { answer: `Показываю только ${kinds.includes('promotion') ? 'акции' : kinds.includes('product') ? 'товары' : 'магазины'} — ${filtered.length} шт.:\n${describeHits(filtered.slice(0, 8), 'фильтр').split('\n').slice(1).join('\n')}`, results: filtered.slice(0, 8) };
      }
      return { answer: 'В прошлой выдаче таких не было. Попробуйте новый запрос — я поищу заново.', results: [] };
    };
    if (INTENT.more.test(normalized)) {
      const next = session.hits.slice(session.offset, session.offset + 8);
      if (!next.length) return { answer: 'Это все варианты, что я нашёл по прошлому запросу. Попробуйте спросить иначе — например указать категорию или магазин.', results: [] };
      session.offset += next.length; session.ts = Date.now();
      return { answer: `Следующие варианты:\n${describeHits(next, 'продолжение').split('\n').slice(1).join('\n')}`, results: next };
    }
    if (INTENT.onlyDeals.test(normalized) && normalized.split(' ').length <= 4) return applyFilter(['promotion']);
    if (INTENT.onlyProducts.test(normalized) && normalized.split(' ').length <= 4) return applyFilter(['product']);
    if (INTENT.onlyOrganizations.test(normalized) && normalized.split(' ').length <= 4) return applyFilter(['organization']);
    if (INTENT.cheaper.test(normalized) && normalized.split(' ').length <= 4) {
      const sorted = [...session.hits].sort((a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY));
      session.hits = sorted; session.offset = 8; session.ts = Date.now();
      const top = sorted.slice(0, 8);
      return { answer: `Отсортировал по цене:\n${describeHits(top, 'сортировка').split('\n').slice(1).join('\n')}`, results: top };
    }
    if (INTENT.closer.test(normalized) && normalized.split(' ').length <= 4) {
      if (!session.origin) return { answer: 'Чтобы сортировать по расстоянию, разрешите геолокацию и повторите исходный запрос — например «ближайшая аптека».', results: [] };
      const sorted = [...session.hits].sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));
      session.hits = sorted; session.offset = 8; session.ts = Date.now();
      const top = sorted.slice(0, 8);
      return { answer: `Отсортировал по расстоянию:\n${describeHits(top, 'сортировка').split('\n').slice(1).join('\n')}`, results: top };
    }
  }

  const orgMapRoots = extraRoots;
  const wantOrganizations = Boolean(category) || (!priceIntent && stems.length > 0) || nearbyIntent;
  const { scored } = wantOrganizations || category
    ? await searchOrganizations(city, stems, orgMapRoots, category?.rx)
    : { scored: [] as Awaited<ReturnType<typeof searchOrganizations>>['scored'] };

  const hits: CatalogHit[] = [];
  for (const organization of (nearbyIntent || category ? scored : scored.slice(0, 4))) {
    hits.push({
      kind: 'organization',
      id: organization.id,
      title: organization.name,
      subtitle: `${organization.category} · ${organization.addressText || organization.address || 'Адрес не указан'}`,
      lat: organization.lat,
      lng: organization.lng,
    });
  }

  const wantProducts = !category || /продукт|маркет|магазин/.test(normalized);
  if (wantProducts && (stems.length > 0 || extraRoots.length > 0)) {
    const matchedProducts = await searchProducts(stems, extraRoots);
    if (matchedProducts.length) {
      const offers = await StoreOfferModel.find({ productId: { $in: matchedProducts.map((product) => product.id) } }).sort({ cityVerified: -1, price: 1 }).lean();
      const productMap = new Map(matchedProducts.map((product) => [product.id, product]));
      const orgList = scored.length ? scored : await OrganizationModel.find({ status: 'published', ...(city ? { city } : {}) }).limit(1500).lean();
      const orgs = new Map(orgList.map((item) => [item.id, item]));
      const seen = new Set<string>();
      for (const offer of offers) {
        const product = productMap.get(offer.productId);
        if (!product || seen.has(product.id)) continue;
        seen.add(product.id);
        const organization = offer.organizationId ? orgs.get(offer.organizationId) : undefined;
        const distance = origin && organization?.lat !== undefined && organization?.lng !== undefined ? haversineKm(origin, { lat: organization.lat, lng: organization.lng }) : undefined;
        hits.push({
          kind: 'product',
          id: product.id,
          title: product.title,
          subtitle: `${organization?.name ?? offer.source}: ${offer.price.toLocaleString('ru-RU')} ₸${offer.discountPercent ? ` · −${offer.discountPercent}%` : ''} · ${offer.cityVerified ? 'цена подтверждена для Кокшетау' : 'demo, цена не подтверждена'}`,
          lat: organization?.lat,
          lng: organization?.lng,
          organizationId: organization?.id,
          distanceKm: distance,
          price: offer.price,
          discount: offer.discountPercent,
          demo: !offer.cityVerified,
        });
      }
    }
  }

  if (dealIntent || INTENT.randomDeal.test(normalized)) {
    const promotions = await PromotionModel.find({ status: 'published', startDate: { $lte: today }, endDate: { $gte: today }, ...(city ? { city } : {}) }).limit(100).lean();
    const searchRoots = [...new Set([...stems, ...extraRoots])];
    const matching = promotions.filter((item) => {
      if (INTENT.randomDeal.test(normalized) && stems.length <= 2) return true;
      if (!searchRoots.length) return true;
      const haystack = keywords(`${item.title} ${item.place} ${item.description}`);
      return searchRoots.some((root) => haystack.some((token) => token.startsWith(root) || root.startsWith(token)));
    });
    for (const promotion of matching.slice(0, 6)) {
      const organization = promotion.organizationId ? (await OrganizationModel.findOne({ id: promotion.organizationId }).lean()) : null;
      hits.push({ kind: 'promotion', id: promotion.id, title: promotion.title, subtitle: `${promotion.place || 'Акция'} · до ${promotion.endDate}`, lat: organization?.lat, lng: organization?.lng, organizationId: organization?.id });
    }
  }

  if (INTENT.events.test(normalized)) {
    const events = await EventModel.find({ ...(city ? { city } : {}), date: { $gte: today } }).sort({ date: 1 }).limit(5).lean();
    if (events.length) {
      const lines = events.map((event) => `• ${event.title} — ${event.date}${event.address ? `, ${event.address}` : ''}`);
      return { answer: `Ближайшие мероприятия:\n${lines.join('\n')}`, results: [] };
    }
  }

  if (hasOrigin) hits.forEach((hit) => { if (hit.distanceKm === undefined && typeof hit.lat === 'number' && typeof hit.lng === 'number') hit.distanceKm = haversineKm(origin!, { lat: hit.lat!, lng: hit.lng! }); });

  // --- ранжирование ---
  if (nearbyIntent || routeIntent) {
    hits.sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));
  } else if (priceIntent || dealIntent) {
    hits.sort((a, b) => {
      const aPrice = a.price ?? Number.POSITIVE_INFINITY;
      const bPrice = b.price ?? Number.POSITIVE_INFINITY;
      if (aPrice !== bPrice) return aPrice - bPrice;
      return a.kind === 'product' ? -1 : b.kind === 'product' ? 1 : 0;
    });
  }

  const results = hits.slice(0, 8);
  if (sessionId && results.length) saveSession(sessionId, { hits, offset: results.length, origin, ts: Date.now() });

  let answer: string;
  if (!results.length) {
    answer = pick(NOT_FOUND);
    if (nearbyIntent && !hasOrigin) answer += '\nСовет: разрешите геолокацию — найду то, что действительно рядом с вами.';
  } else if (routeIntent) {
    answer = `Маршрут можно проложить к любому месту из списка — нажмите «Маршрут» под нужным вариантом:\n${results.map((hit, index) => `${index + 1}. ${hit.title} — ${hit.subtitle}`).join('\n')}`;
  } else {
    answer = describeHits(results, query.length > 40 ? query.slice(0, 40) + '…' : query);
  }
  return { answer, results };
}
