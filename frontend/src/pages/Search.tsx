import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api'
import { EmptyState } from '../components/Cards'
import { RouteButton } from '../components/RouteButton'

type OrganizationResult = { id: string; name: string; category: string; address: string; lat?: number; lng?: number }
type ProductResult = { id: string; title: string; brand?: string; categoryId: string }
type OfferResult = { id: string; productId: string; organizationId?: string; source: string; price: number; oldPrice?: number; cityVerified: boolean; demo: boolean }
type DealResult = { id: string; kind: string; promotionId?: string; productId?: string; title: string; currentPrice?: number; oldPrice?: number; cityVerified: boolean; source: string; organization?: { id: string; name: string; lat?: number; lng?: number } | null }
type SearchData = { organizations: OrganizationResult[]; products: ProductResult[]; offers: OfferResult[]; deals: DealResult[] }

export function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const [data, setData] = useState<SearchData>({ organizations: [], products: [], offers: [], deals: [] })
  const [error, setError] = useState('')
  useEffect(() => { if (q.length < 2) return; apiFetch<SearchData>(`/search?q=${encodeURIComponent(q)}`).then(setData).catch((err: Error) => setError(err.message)) }, [q])
  const productById = new Map(data.products.map((product) => [product.id, product]))
  return <>
    <div className="screen-title"><h1>Поиск</h1><Link to="/">На главную</Link></div>
    <p className="muted">Запрос: {q}</p>{error && <p className="error-text">{error}</p>}
    {data.organizations.length > 0 && <section className="detail-section"><h2>Организации</h2>{data.organizations.map((item) => <article className="list-row" key={item.id}><div><strong>{item.name}</strong><small>{item.category} · {item.address || 'Адрес не указан'}</small></div><div className="row-actions"><Link to={`/organizations/${item.id}`}>Открыть</Link><Link to={`/map?sel=${item.id}`}>На карте</Link>{typeof item.lat === 'number' && typeof item.lng === 'number' && <RouteButton destination={{ lat: item.lat, lng: item.lng }} organizationId={item.id} label="Маршрут" className="button-secondary" />}</div></article>)}</section>}
    {data.products.length > 0 && <section className="detail-section"><h2>Товары</h2>{data.products.map((item) => <article className="list-row" key={item.id}><div><strong>{item.title}</strong><small>{item.brand} · {item.categoryId}</small></div><Link to={`/products/${item.id}`}>Предложения и история →</Link></article>)}</section>}
    {data.offers.length > 0 && <section className="detail-section"><h2>Предложения</h2>{data.offers.map((item) => <article className="list-row" key={item.id}><div><strong>{productById.get(item.productId)?.title ?? 'Товар'}</strong><small>{item.source} · {item.cityVerified ? 'цена для Кокшетау' : 'demo, город не подтверждён'}</small></div><Link to={`/products/${item.productId}`}>{item.price.toLocaleString('ru-RU')} ₸</Link></article>)}</section>}
    {data.deals.length > 0 && <section className="detail-section"><h2>Акции и скидки</h2>{data.deals.map((item) => <article className="list-row" key={item.id}><div><strong>{item.title}</strong><small>{item.organization?.name ?? item.source} · {item.cityVerified ? 'Кокшетау' : 'demo'}</small></div><div className="row-actions">{item.oldPrice && <del>{item.oldPrice.toLocaleString('ru-RU')} ₸</del>}{item.currentPrice && <b>{item.currentPrice.toLocaleString('ru-RU')} ₸</b>}{item.productId && <Link to={`/products/${item.productId}`}>Открыть</Link>}{item.promotionId && <Link to={`/promotions/${item.promotionId}`}>Условия</Link>}{item.organization && typeof item.organization.lat === 'number' && typeof item.organization.lng === 'number' && <RouteButton destination={{ lat: item.organization.lat, lng: item.organization.lng }} organizationId={item.organization.id} label="Маршрут" className="button-secondary" />}</div></article>)}</section>}
    {!error && q.length >= 2 && !data.organizations.length && !data.products.length && !data.deals.length && !data.offers.length && <EmptyState text="Совпадений не найдено." />}
  </>
}
