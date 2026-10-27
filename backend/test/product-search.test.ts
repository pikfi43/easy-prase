import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { productSearchTerms } from '../src/lib/product-search.js';

describe('product search terms', () => {
  it('ignores natural-language search words but keeps the product name', () => {
    assert.deepEqual(productSearchTerms('Найти Samsung Galaxy по цене'), ['samsung', 'galaxy']);
  });

  it('normalizes Russian ё and punctuation without dropping model numbers', () => {
    assert.deepEqual(productSearchTerms('Купи холодильник Samsung RB-37'), ['холодильник', 'samsung', 'rb', '37']);
  });

  it('maps common Russian product names to catalog terms', () => {
    assert.deepEqual(productSearchTerms('айфон телефон самсунг плита'), ['iphone', 'смартфон', 'samsung', 'варочная']);
  });
});
