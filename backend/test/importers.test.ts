import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogPdfText, parsePublicProductPage } from '../src/importers/catalog.js';

describe('catalog source parsers', () => {
  it('extracts a product only when the public page provides structured product data and a price', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Samsung Galaxy A56', sku: 'SM-A566', brand: { '@type': 'Brand', name: 'Samsung' }, offers: { '@type': 'Offer', price: '219990', priceCurrency: 'KZT', availability: 'InStock' } })}</script>`;
    const products = parsePublicProductPage(html, 'https://shop.example/kokshetau/item');
    assert.equal(products.length, 1);
    assert.equal(products[0].name, 'Samsung Galaxy A56');
    assert.equal(products[0].price, 219990);
    assert.equal(products[0].sku, 'SM-A566');
  });

  it('does not turn an empty or malformed page into an empty-catalog success', () => {
    assert.equal(parsePublicProductPage('<h1>Catalog</h1>', 'https://shop.example/catalog').length, 0);
    assert.equal(parsePublicProductPage('<script type="application/ld+json">{broken</script>', 'https://shop.example/catalog').length, 0);
  });

  it('builds current Technodom product paths from catalog page product URIs', () => {
    const item = { title: 'Samsung Galaxy A55', sku: '123456', uri: 'smartfon-samsung-galaxy-a55-123456', brand: 'Samsung', categories: ['Смартфоны'], price: '199990' };
    const html = `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { products: [item] } } })}</script>`;
    const products = parsePublicProductPage(html, 'https://www.technodom.kz/kokshetau/catalog/smartfony-i-gadzhety/smartfony-i-telefony/smartfony');

    assert.equal(products[0].url, 'https://www.technodom.kz/kokshetau/p/smartfon-samsung-galaxy-a55-123456');
  });

  it('parses Arbuz product cards with demo-city, price and discount fields intact', () => {
    const item = { id: 'arbuz-1', name: 'Milk 1 l', brandName: 'Farm', catalogName: 'Dairy', uri: '/ru/almaty/catalog/item/arbuz-1', image: 'https://arbuz.kz/milk.jpg?w=%w&h=%h', measure: 'л', weight: '1 л', priceActual: 900, priceSpecial: 750, pricePrevious: 900, isAvailable: true };
    const html = `<div is="product-item" :product="${JSON.stringify(item).replaceAll('"', '&quot;')}"></div>`;
    const products = parsePublicProductPage(html, 'https://arbuz.kz/ru/almaty/catalog/cat/dairy');
    assert.equal(products.length, 1);
    assert.equal(products[0].sku, 'arbuz-1');
    assert.equal(products[0].price, 750);
    assert.equal(products[0].oldPrice, 900);
    assert.equal(products[0].weight, '1 л');
    assert.equal(products[0].url, 'https://arbuz.kz/ru/almaty/catalog/item/arbuz-1');
    assert.equal(products[0].image, 'https://arbuz.kz/milk.jpg?w=400&h=400');
  });

  it('extracts prices from text-layer discount rows without OCR', () => {
    const products = parseCatalogPdfText('Coffee Beans 500 g 2 900 ₸ 2 300 ₸\nMilk 1 l 850 ₸');
    assert.deepEqual(products.map((item) => [item.name, item.price, item.oldPrice]), [
      ['Coffee Beans 500 g', 2300, 2900],
      ['Milk 1 l', 850, undefined],
    ]);
  });
});
