import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch, mediaUrl, type Product } from '../api'
import { EmptyState } from '../components/Cards'
import { formatDistance, haversineKm, type LatLng } from '../lib/geo'

type Offer = { id: string; source: string; sourceCity: string; cityVerified: boolean; demo: boolean; price: number; oldPrice?: number; discountPercent?: number; externalUrl?: string; fetchedAt: string; organization?: { id: string; name: string; lat?: number; lng?: number } | null }
type ComparedProduct = Product & { offers: Offer[] }

const cityLabel = (offer: Offer) => offer.cityVerified ? `${offer.source} · цена для Кокшетау` : `${offer.source} · ${offer.sourceCity || 'город не подтверждён'} · demo, цена не подтверждена для Кокшетау`

export function PriceComparisonPage() {
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<ComparedProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sort, setSort] = useState<'price' | 'distance'>('price')
  const [origin, setOrigin] = useState<LatLng | null>(null)

  const search = async (event: FormEvent) => {
    event.preventDefault()
    if (query.trim().length < 2) return
    setLoading(true); setError('')
    try {
      const data = await apiFetch<{ products: ComparedProduct[] }>(`/catalog/compare?search=${encodeURIComponent(query.trim())}`)
      setProducts(data.products)
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось загрузить цены') }
    finally { setLoading(false) }
  }

  const locate = () => {
    if (!navigator.geolocation) { setError('Геолокация недоступна в этом браузере'); return }
    navigator.geolocation.getCurrentPosition((position) => setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude }), () => setError('Не удалось определить местоположение'), { enableHighAccuracy: true, timeout: 10000 })
  }

  return <>
    <div className="screen-title"><h1>Сравнение цен</h1><Link to="/map">Карта</Link></div>
    <form className="compare-search" onSubmit={(event) => void search(event)}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Например, Samsung Galaxy A56" /><button type="submit" disabled={loading || query.trim().length < 2}>{loading ? 'Поиск…' : 'Найти'}</button></form>
    <div className="compare-controls"><button type="button" className={sort === 'price' ? 'selected' : ''} onClick={() => setSort('price')}>Дешевле</button><button type="button" className={sort === 'distance' ? 'selected' : ''} onClick={() => { setSort('distance'); if (!origin) locate() }}>Ближе</button>{origin && <span>Расстояние от GPS</span>}</div>
    {error && <p className="error-text">{error}</p>}
    {!loading && products.length === 0 && <EmptyState text={query ? 'В источниках нет совпадений по этому запросу.' : 'Введите название товара, чтобы сравнить цены.'} />}
    {products.map((product) => {
      const verified = product.offers.filter((offer) => offer.cityVerified)
      const demos = product.offers.filter((offer) => !offer.cityVerified)
      const sortedVerified = [...verified].sort((a, b) => sort === 'distance' && origin ? distance(a, origin) - distance(b, origin) : a.price - b.price)
      const savings = verified.length > 1 ? Math.max(...verified.map((offer) => offer.price)) - Math.min(...verified.map((offer) => offer.price)) : 0
      return <section className="compare-product" key={product.id}>
        <div className="compare-product-head"><div>{product.image && <img src={mediaUrl(product.image)} alt="" />}<div><Link to={`/products/${product.id}`}><strong>{product.title}</strong></Link><small>{product.brand} {product.model}</small></div></div><Link to={`/products/${product.id}`}>Цена и история →</Link></div>
        {verified.length > 0 && <><h2>Подтверждено для Кокшетау</h2>{sortedVerified.map((offer) => <OfferRow key={offer.id} offer={offer} origin={origin} />)}{savings > 0 && <p className="compare-savings">Разница между самой низкой и высокой ценой: {savings.toLocaleString('ru-RU')} ₸</p>}</>}
        {verified.length === 0 && <p className="muted">Нет цены, подтверждённой для Кокшетау.</p>}
        {demos.length > 0 && <><h2>Другие каталоги · демонстрационные цены</h2>{demos.map((offer) => <OfferRow key={offer.id} offer={offer} origin={origin} />)}</>}
      </section>
    })}
  </>
}

function distance(offer: Offer, origin: LatLng) {
  const coords = offer.organization
  return coords && typeof coords.lat === 'number' && typeof coords.lng === 'number' ? haversineKm(origin, { lat: coords.lat, lng: coords.lng }) : Number.POSITIVE_INFINITY
}

function OfferRow({ offer, origin }: { offer: Offer; origin: LatLng | null }) {
  const km = origin ? distance(offer, origin) : Number.POSITIVE_INFINITY
  return <article className="offer-row"><div><strong>{offer.organization?.name ?? offer.source}</strong><small>{cityLabel(offer)}</small>{Number.isFinite(km) && <small>{formatDistance(km)} от вас</small>}<small>Обновлено {offer.fetchedAt ? new Date(offer.fetchedAt).toLocaleString('ru-RU') : 'не указано'}</small></div><div><b>{offer.price.toLocaleString('ru-RU')} ₸</b>{offer.oldPrice && <del>{offer.oldPrice.toLocaleString('ru-RU')} ₸</del>}{offer.discountPercent && offer.discountPercent > 0 && <small className="offer-discount">−{offer.discountPercent}%</small>}</div>{offer.externalUrl && <a href={offer.externalUrl} target="_blank" rel="noreferrer" onClick={() => void apiFetch(`/catalog/offers/${offer.id}/click`, { method: 'POST' }).catch(() => undefined)}>К источнику</a>}</article>
}

type ProductDetails = { product: Product; offers: Offer[] }
type PriceHistory = { id: string; price: number; oldPrice?: number; timestamp: string; source: string }

export function ProductDetailPage() {
  const { id } = useParams()
  const [data, setData] = useState<ProductDetails | null>(null)
  const [history, setHistory] = useState<PriceHistory[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!id) return
    apiFetch<ProductDetails>(`/products/${id}`).then(setData).catch((err: Error) => setError(err.message))
    apiFetch<{ history: PriceHistory[] }>(`/products/${id}/history`).then((result) => setHistory(result.history)).catch(() => setHistory([]))
  }, [id])
  if (error) return <p className="error-text">{error}</p>
  if (!data) return <p className="muted">Загрузка товара…</p>
  return <article className="detail-page"><div className="screen-title"><Link to="/prices">‹ Сравнение цен</Link><h1>{data.product.title}</h1></div>
    <section className="detail-section">{data.product.image && <img className="product-detail-image" src={mediaUrl(data.product.image)} alt={data.product.title} />}<p>{data.product.description || 'Описание отсутствует.'}</p><p className="muted">Категория: {data.product.categoryId}</p>{data.product.demo && <p className="status-chip status-pending_review">Демонстрационные данные; цена не подтверждена для Кокшетау</p>}</section>
    <section className="detail-section"><h2>Предложения</h2>{data.offers.map((offer) => <OfferRow key={offer.id} offer={offer} origin={null} />)}{!data.offers.length && <EmptyState text="Цены пока не импортированы." />}</section>
    <section className="detail-section"><h2>История цены</h2>{history.length ? history.map((point) => <p className="list-row" key={point.id}><span>{new Date(point.timestamp).toLocaleDateString('ru-RU')}</span><strong>{point.price.toLocaleString('ru-RU')} ₸</strong><small>{point.source}</small></p>) : <p className="muted">История появится после следующего изменения цены.</p>}</section>
  </article>
}
