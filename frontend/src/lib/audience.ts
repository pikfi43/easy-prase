export type AudienceDeal = {
  title: string
  description?: string
  category?: string
  currentPrice?: number
  discountPercent?: number
}

type AudienceRule = {
  include: RegExp
  exclude: RegExp
  maxPrice: number
}

const gamingOrMajorAppliance = /игров|геймер|rtx|видеокарт|gaming|варочн|газов.{0,12}панел|\bплит[аы]\b/i

const audienceRules: Record<string, AudienceRule> = {
  'студент': {
    include: /смартфон|телефон|ноутбук|ноут|планшет|наушник|гаджет|одежд|обув|молок|хлеб|фрукт|овощ|круп|продукт|еда|кофе|\bчай\b/i,
    exclude: gamingOrMajorAppliance,
    maxPrice: 300_000,
  },
  'пенсионер': {
    include: /аптек|лекар|медицин|молок|хлеб|фрукт|овощ|круп|продукт|еда|чайник|утюг|пылесос|микроволн|одежд|обув|очки/i,
    exclude: gamingOrMajorAppliance,
    maxPrice: 250_000,
  },
  'молодёжь': {
    include: /смартфон|телефон|ноутбук|ноут|планшет|наушник|гаджет|одежд|обув|кофе|кино|развлеч|спорт|молок|хлеб|продукт/i,
    exclude: /варочн|газов.{0,12}панел|\bплит[аы]\b/i,
    maxPrice: 500_000,
  },
  'молодежь': {
    include: /смартфон|телефон|ноутбук|ноут|планшет|наушник|гаджет|одежд|обув|кофе|кино|развлеч|спорт|молок|хлеб|продукт/i,
    exclude: /варочн|газов.{0,12}панел|\bплит[аы]\b/i,
    maxPrice: 500_000,
  },
  'семья': {
    include: /продукт|молок|хлеб|фрукт|овощ|круп|дет|подгуз|бытов|пылесос|стиральн|холодильник|одежд|обув|аптек/i,
    exclude: gamingOrMajorAppliance,
    maxPrice: 500_000,
  },
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').trim()
}

export function dealsForAudience<T extends AudienceDeal>(deals: T[], audience?: string): T[] {
  const normalizedAudience = normalize(audience ?? '')
  const ruleKey = Object.keys(audienceRules).find((key) => normalizedAudience.includes(key))
  if (!ruleKey) return deals

  const rule = audienceRules[ruleKey]
  return deals
    .filter((deal) => {
      const text = `${deal.title} ${deal.description ?? ''} ${deal.category ?? ''}`
      if (rule.exclude.test(text) || !rule.include.test(text)) return false
      return deal.currentPrice === undefined || deal.currentPrice <= rule.maxPrice
    })
    .sort((a, b) => {
      const priceA = a.currentPrice ?? Number.POSITIVE_INFINITY
      const priceB = b.currentPrice ?? Number.POSITIVE_INFINITY
      const affordabilityA = priceA <= rule.maxPrice * 0.25 ? 0 : priceA <= rule.maxPrice * 0.6 ? 1 : 2
      const affordabilityB = priceB <= rule.maxPrice * 0.25 ? 0 : priceB <= rule.maxPrice * 0.6 ? 1 : 2
      return (b.discountPercent ?? 0) - (a.discountPercent ?? 0) || affordabilityA - affordabilityB || priceA - priceB
    })
}
