import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiFetch, mediaUrl } from '../api'
import { EmptyState } from '../components/Cards'

type Offer = { id: string; source: string; sourceCity: string; cityVerified: boolean; demo: boolean; price: number; oldPrice?: number; discountPercent?: number; organization?: { id: string; name: string; address: string } | null }
type CatalogProduct = { id: string; title: string; image?: string; brand?: string; categoryId: string; offers: Offer[] }

export function ProductsPage() {
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [category, setCategory] = useState('Все')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [local, setLocal] = useState(false)
  const [demo, setDemo] = useState(false)
  const [discount, setDiscount] = useState(false)
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const organizationId = params.get('organizationId') ?? ''

  useEffect(() => {
    const controller = new AbortController()
    const search = new URLSearchParams()
    if (query.trim()) search.set('q', query.trim())
    if (category !== 'Все') search.set('category', category)
    if (minPrice) search.set('minPrice', minPrice)
    if (maxPrice) search.set('maxPrice', maxPrice)
    if (local) search.set('local', '1')
    if (demo) search.set('demo', '1')
    if (discount) search.set('discount', '1')
    if (organizationId) search.set('organizationId', organizationId)
    search.set('page', String(page)); search.set('limit', '40')
    setLoading(true)
    apiFetch<{ products: CatalogProduct[]; categories: string[]; total: number }>(`/product-catalog?${search}`, { signal: controller.signal })
      .then((data) => { setProducts(data.products); setCategories(data.categories); setTotal(data.total); setError('') })
      .catch((cause: Error) => { if (cause.name !== 'AbortError') setError(cause.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query, category, minPrice, maxPrice, local, demo, discount, organizationId, page])

  return <>
    <div className="screen-title"><h1>Товары</h1><Link to="/prices">Сравнить цены →</Link></div>
    <div className="search-field"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Название, бренд или модель" /></div>
    <div className="category-pills"><button className={category === 'Все' ? 'selected' : ''} onClick={() => { setCategory('Все'); setPage(1) }} type="button">Все</button>{categories.map((item) => <button className={category === item ? 'selected' : ''} key={item} onClick={() => { setCategory(item); setPage(1) }} type="button">{item}</button>)}</div>
    <div className="filter-grid"><label>Цена от, ₸<input type="number" min="0" value={minPrice} onChange={(event) => { setMinPrice(event.target.value); setPage(1) }} /></label><label>Цена до, ₸<input type="number" min="0" value={maxPrice} onChange={(event) => { setMaxPrice(event.target.value); setPage(1) }} /></label><label className="checkbox-line"><input type="checkbox" checked={discount} onChange={(event) => { setDiscount(event.target.checked); setPage(1) }} /> Со скидкой</label><label className="checkbox-line"><input type="checkbox" checked={local} onChange={(event) => { setLocal(event.target.checked); setPage(1) }} /> Кокшетау</label><label className="checkbox-line"><input type="checkbox" checked={demo} onChange={(event) => { setDemo(event.target.checked); setPage(1) }} /> Demo-каталоги</label></div>
    {error && <p className="error-text">{error}</p>}
    {loading && <p className="muted">Загружаем товары…</p>}
    {!loading && products.length === 0 && !error && <EmptyState text="Товары по этим условиям не найдены." />}
    {products.map((product) => <section className="compare-product" key={product.id}>
      <div className="compare-product-head"><div>{product.image && <img src={mediaUrl(product.image)} alt="" />}<div><Link to={`/products/${product.id}`}><strong>{product.title}</strong></Link><small>{product.brand} · {product.categoryId}</small></div></div><Link to={`/products/${product.id}`}>Карточка товара →</Link></div>
      {product.offers.map((offer) => <article className="offer-row" key={offer.id}><div><strong>{offer.organization?.name ?? offer.source}</strong><small>{offer.cityVerified ? 'Цена подтверждена для Кокшетау' : `${offer.sourceCity || 'Источник'} · demo, цена не подтверждена для Кокшетау`}</small></div><div><b>{offer.price.toLocaleString('ru-RU')} ₸</b>{offer.oldPrice && <del>{offer.oldPrice.toLocaleString('ru-RU')} ₸</del>}{offer.discountPercent ? <small className="offer-discount">−{offer.discountPercent}%</small> : null}</div>{offer.organization && <div className="row-actions"><Link to={`/organizations/${offer.organization.id}`}>Магазин</Link><Link to={`/map?sel=${offer.organization.id}`}>На карте</Link></div>}</article>)}
    </section>)}
    {total > 40 && <div className="pagination-controls"><button type="button" className="button-secondary" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Назад</button><span>{page} / {Math.ceil(total / 40)} · {total.toLocaleString('ru-RU')} товаров</span><button type="button" className="button-secondary" disabled={loading || page >= Math.ceil(total / 40)} onClick={() => setPage((value) => value + 1)}>Далее</button></div>}
  </>
}
