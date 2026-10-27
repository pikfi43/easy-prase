import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dealsForAudience } from '../../frontend/src/lib/audience.ts';

const deals = [
  { title: 'Игровой компьютер NEO Game RTX', category: 'Компьютеры', currentPrice: 697990, discountPercent: 59 },
  { title: 'Газовая варочная панель', category: 'Техника', currentPrice: 120000, discountPercent: 20 },
  { title: 'Смартфон Samsung Galaxy', category: 'Смартфоны', currentPrice: 189990, discountPercent: 10 },
  { title: 'Молоко 1 л', category: 'Продукты', currentPrice: 600, discountPercent: 5 },
];

describe('profile-based daily deals', () => {
  it('shows affordable electronics and excludes gaming PCs and stoves for students', () => {
    assert.deepEqual(dealsForAudience(deals, 'Студент').map((deal) => deal.title), [
      'Смартфон Samsung Galaxy', 'Молоко 1 л',
    ]);
  });

  it('shows essentials and excludes gaming PCs for pensioners', () => {
    assert.deepEqual(dealsForAudience(deals, 'Пенсионер').map((deal) => deal.title), ['Молоко 1 л']);
  });
});
