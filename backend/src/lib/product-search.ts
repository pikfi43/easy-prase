const searchNoise = new Set([
  'найти', 'найди', 'поиск', 'товар', 'товары', 'продукт', 'продукты', 'цена', 'цене', 'цены',
  'купить', 'купи', 'сравнить', 'дешевле', 'акция', 'акции', 'скидка', 'скидки', 'покажи',
  'пожалуйста', 'где', 'мне', 'нужен', 'нужна', 'надо', 'за', 'по', 'для',
]);
const searchAliases: Record<string, string> = {
  айфон: 'iphone',
  телефон: 'смартфон',
  самсунг: 'samsung',
  плита: 'варочная',
};

export function productSearchTerms(query: string): string[] {
  return [...new Set((query.toLocaleLowerCase('ru').replaceAll('ё', 'е').match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((term) => term.length > 1 && !searchNoise.has(term))
    .map((term) => searchAliases[term] ?? term))];
}
