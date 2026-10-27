import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { EmptyState } from '../components/Cards'
import { useAuth } from '../api'
import { cityOf, haversineKm, type LatLng } from '../lib/geo'

type Deal = { id: string; kind: 'promotion' | 'offer'; promotionId?: string; productId?: string; title: string; description: string; organization?: { id: string; name: string; lat?: number; lng?: number } | null; currentPrice?: number; oldPrice?: number; discountPercent?: number; source: string; updatedAt: string; local: boolean; demo: boolean; cityVerified: boolean; city: string; category: string; endDate?: string; externalUrl?: string }
const radiusOptions = [{ label: '500 м', km: .5 }, { label: '1 км', km: 1 }, { label: '2 км', km: 2 }, { label: '5 км', km: 5 }, { label: '10 км', km: 10 }]

export function PromotionsPage() {
  const { user } = useAuth()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Все')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [minDiscount, setMinDiscount] = useState('')
  const [nearOnly, setNearOnly] = useState(false)
  const [radiusKm, setRadiusKm] = useState(2)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [page, setPage] = useState(1)
  useEffect(() => {
    apiFetch<{ deals: Deal[] }>('/deals').then((data) => setDeals(data.deals)).catch((err: Error) => setError(err.message)).finally(() => setLoading(false))
  }, [])
  const categories = useMemo(() => [...new Set(deals.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')), [deals])
  const locate = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }), () => setUserLocation(null), { enableHighAccuracy: true, timeout: 10000 })
  }
  const filtered = useMemo(() => deals.filter((item) => {
    if (category !== 'Все' && item.category !== category) return false
    if (query && !`${item.title} ${item.description} ${item.source} ${item.organization?.name ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) return false
    if (minPrice && (item.currentPrice === undefined || item.currentPrice < Number(minPrice))) return false
    if (maxPrice && (item.currentPrice === undefined || item.currentPrice > Number(maxPrice))) return false
    if (minDiscount && (item.discountPercent ?? 0) < Number(minDiscount)) return false
    if (nearOnly) {
      const origin = userLocation ?? cityOf(user?.city)
      if (!item.organization?.lat || !item.organization.lng || haversineKm(origin, { lat: item.organization.lat, lng: item.organization.lng }) > radiusKm) return false
    }
    return true
  }), [deals, category, query, minPrice, maxPrice, minDiscount, nearOnly, userLocation, user?.city, radiusKm])
  const pageSize = 40
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleDeals = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  return <>
    <div className="screen-title offers-title"><h1>Акции и скидки</h1><Link to="/products">Все товары →</Link></div>
    <div className="search-field"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по товарам, организациям и акциям" /></div>
    <div className="category-pills"><button className={category === 'Все' ? 'selected' : ''} type="button" onClick={() => setCategory('Все')}>Все</button>{categories.map((item) => <button key={item} className={category === item ? 'selected' : ''} type="button" onClick={() => setCategory(item)}>{item}</button>)}</div>
    <div className="filter-grid"><label>Цена от, ₸<input type="number" min="0" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} /></label><label>Цена до, ₸<input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></label><label>Скидка от, %<input type="number" min="0" max="100" value={minDiscount} onChange={(event) => setMinDiscount(event.target.value)} /></label><label className="checkbox-line"><input type="checkbox" checked={nearOnly} onChange={(event) => { setNearOnly(event.target.checked); if (event.target.checked && !userLocation) locate() }} /> Рядом</label>{nearOnly && <div className="radius-pills full">{radiusOptions.map((item) => <button key={item.km} className={radiusKm === item.km ? 'selected' : ''} onClick={() => setRadiusKm(item.km)} type="button">{item.label}</button>)}</div>}</div>
    {error && <p className="error-text">{error}</p>}
    {loading && <p className="muted">Загружаем акции и скидки…</p>}
    {!loading && filtered.length === 0 && <EmptyState text="Акций по этим условиям пока нет." />}
    {visibleDeals.map((item) => <article className="deal-card" key={item.id}>
      <div className="deal-card-head"><div><strong>{item.title}</strong><small>{item.organization?.name ?? item.source} · {item.kind === 'promotion' ? `до ${item.endDate ?? 'окончания акции'}` : new Date(item.updatedAt).toLocaleDateString('ru-RU')}</small></div><b className="deal-discount">−{item.discountPercent ?? 0}%</b></div>
      <div className="deal-card-price">{item.oldPrice !== undefined && <del>{item.oldPrice.toLocaleString('ru-RU')} ₸</del>}<strong>{item.currentPrice?.toLocaleString('ru-RU') ?? 'Условия акции'}{item.currentPrice !== undefined ? ' ₸' : ''}</strong></div>
      <small className={item.cityVerified ? 'source-local' : 'source-demo'}>{item.cityVerified ? '✓ Цена подтверждена для Кокшетау' : `${item.city || 'Источник'} · demo; цена не подтверждена для Кокшетау`}</small>
      <div className="row-actions">{item.kind === 'promotion' && item.promotionId ? <Link to={`/promotions/${item.promotionId}`}>Условия акции</Link> : item.productId ? <Link to={`/products/${item.productId}`}>Товар и источник</Link> : null}{item.organization && <Link to={`/organizations/${item.organization.id}`}>Магазин</Link>}{item.externalUrl && <a href={item.externalUrl} target="_blank" rel="noreferrer">Официальный источник ↗</a>}</div>
    </article>)}
    {!loading && filtered.length > pageSize && <div className="pagination-controls"><button type="button" className="button-secondary" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Назад</button><span>{currentPage} / {pageCount} · {filtered.length.toLocaleString('ru-RU')} скидок</span><button type="button" className="button-secondary" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Далее</button></div>}
  </>
}
