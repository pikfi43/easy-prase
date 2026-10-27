import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch, useAuth } from '../api'
import { useData } from '../data'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/Cards'
import { dealsForAudience } from '../lib/audience'

type HomeDeal = { id: string; kind: 'promotion' | 'offer'; promotionId?: string; productId?: string; title: string; description: string; category: string; currentPrice?: number; oldPrice?: number; discountPercent?: number; source: string; local: boolean; demo: boolean; cityVerified: boolean; city: string; organization?: { id: string; name: string } | null }

export function HomePage({ onAuth }: { onAuth: (mode: 'login' | 'register') => void }) {
  const { user } = useAuth()
  const { organizations, events, loading, error } = useData()
  const [query, setQuery] = useState('')
  const [deals, setDeals] = useState<HomeDeal[]>([])
  const navigate = useNavigate()
  useEffect(() => {
    const controller = new AbortController()
    apiFetch<{ deals: HomeDeal[] }>(`/deals${user?.city ? `?city=${encodeURIComponent(user.city)}` : ''}`, { signal: controller.signal })
      .then((data) => setDeals(data.deals))
      .catch((cause: Error) => { if (cause.name !== 'AbortError') setDeals([]) })
    return () => controller.abort()
  }, [user?.city])
  const submitSearch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (query.trim().length >= 2) navigate(`/search?q=${encodeURIComponent(query.trim())}`) }

  const nearest = useMemo(() => organizations.slice(0, 3), [organizations])
  const filtered = useMemo(() => deals.filter((item) =>
    !query.trim() || `${item.title} ${item.description} ${item.source}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  ), [deals, query])

  const recommendations = useMemo(() => dealsForAudience(filtered, user?.category), [filtered, user?.category])
  const heroDeals = user?.category && user.category !== 'Обычный житель' ? recommendations : filtered
  const [heroIndex, setHeroIndex] = useState(0)
  useEffect(() => setHeroIndex(0), [query, user?.category, heroDeals.length])
  const featured = heroDeals.length ? heroDeals[heroIndex % heroDeals.length] : undefined
  const featuredPath = featured?.kind === 'promotion' && featured.promotionId
    ? `/promotions/${featured.promotionId}`
    : featured?.productId ? `/products/${featured.productId}` : '/promotions'
  const audienceTitle = user?.category === 'Студент' ? 'Подборка для студентов'
    : user?.category === 'Пенсионер' ? 'Подборка для пенсионеров'
      : user?.category === 'Молодёжь' ? 'Подборка для молодёжи'
        : user?.category === 'Семья' ? 'Подборка для семьи' : 'Подходящие предложения'

  return <>
    <form className="search-field" onSubmit={submitSearch}><Icon name="search" size={17} />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Что вы ищете?" />
      <button type="submit" disabled={query.trim().length < 2}>Найти</button>
    </form>

    <section className="daily-offers" aria-label="Предложения дня">
      {featured ? <Link className="hero-deal" to={featuredPath} aria-label={`Открыть товар: ${featured.title}`}>
        <div className="hero-copy">
          <span className="hero-label">Предложение дня · {heroIndex + 1} из {heroDeals.length}</span>
          <h1>{featured.title}</h1>
          <p>{featured.currentPrice !== undefined ? `${featured.currentPrice.toLocaleString('ru-RU')} ₸${featured.discountPercent ? ` · −${featured.discountPercent}%` : ''}` : 'Условия акции'}</p>
          <small>{featured.organization?.name ?? featured.source} · {featured.cityVerified ? 'цена для Кокшетау' : 'демо-цена'}</small>
          <span className="hero-cta">Открыть товар</span>
        </div>
        <span className="hero-food"><Icon name="tag" size={56} /></span>
      </Link> : <Link className="hero-deal hero-deal-empty" to="/promotions">
        <div><span className="hero-label">Предложения дня</span><h1>{user?.category ? `Для профиля «${user.category}» пока нет подходящих скидок` : 'Экономьте с EasyPrice'}</h1><p>Откройте все акции города</p><span className="hero-cta">Смотреть акции</span></div>
        <span className="hero-food"><Icon name="tag" size={56} /></span>
      </Link>}
      {heroDeals.length > 1 && <div className="hero-controls" aria-label="Выбор предложения">
        <button type="button" aria-label="Предыдущее предложение" onClick={() => setHeroIndex((value) => (value - 1 + heroDeals.length) % heroDeals.length)}>‹</button>
        <span>{heroIndex + 1} / {heroDeals.length}</span>
        <button type="button" aria-label="Следующее предложение" onClick={() => setHeroIndex((value) => (value + 1) % heroDeals.length)}>›</button>
      </div>}
    </section>

    <div className="quick-grid">
      <button type="button" onClick={() => navigate('/promotions')}><b><Icon name="tag" /></b><span>Акции</span></button>
      <button type="button" onClick={() => navigate('/favorites')}><b><Icon name="heart" /></b><span>Избранное</span></button>
      <button type="button" onClick={() => navigate('/map')}><b><Icon name="map" /></b><span>Карта</span></button>
      <button type="button" onClick={() => navigate('/assistant')}><b><Icon name="assistant" /></b><span>AI</span></button>
      <button type="button" onClick={() => navigate('/prices')}><b>₸</b><span>Сравнить цены</span></button>
      <button type="button" onClick={() => navigate('/products')}><b>🛍</b><span>Товары</span></button>
    </div>

    {!user && <p className="muted">Войдите в аккаунт, чтобы видеть предложения рядом с вами. <button className="link-button" type="button" onClick={() => onAuth('login')}>Войти</button></p>}
    {loading && <p className="loading-line">Загрузка данных...</p>}
    {error && <p className="error-text">{error}</p>}

    {user?.category && recommendations.length > 0 && <section className="section-block">
      <div className="section-head"><h2>{audienceTitle}</h2><Link to="/promotions">Все предложения</Link></div>
      {recommendations.slice(0, 3).map((item) => <article className="deal-card" key={item.id}>
        <div className="deal-card-head"><div><strong>{item.title}</strong><small>{item.organization?.name ?? item.source}</small></div>{item.discountPercent ? <b className="deal-discount">−{item.discountPercent}%</b> : null}</div>
        <div className="deal-card-price">{item.oldPrice && <del>{item.oldPrice.toLocaleString('ru-RU')} ₸</del>}{item.currentPrice !== undefined && <strong>{item.currentPrice.toLocaleString('ru-RU')} ₸</strong>}</div>
        <small className={item.cityVerified ? 'source-local' : 'source-demo'}>{item.cityVerified ? '✓ Цена подтверждена для Кокшетау' : `${item.city || 'Источник'} · цена не подтверждена для Кокшетау`}</small>
        <Link to={item.kind === 'promotion' && item.promotionId ? `/promotions/${item.promotionId}` : `/products/${item.productId}`}>Открыть предложение</Link>
      </article>)}
    </section>}

    {filtered.length > 0 && <section className="section-block">
      <div className="section-head">
        <h2>{user ? `Скидки в городе ${user.city}` : 'Актуальные акции'}</h2>
        <Link to="/promotions">Смотреть все</Link>
      </div>
      {filtered.slice(0, 3).map((item) => <article className="deal-card" key={item.id}><div className="deal-card-head"><div><strong>{item.title}</strong><small>{item.organization?.name ?? item.source}</small></div>{item.discountPercent ? <b className="deal-discount">−{item.discountPercent}%</b> : null}</div><div className="deal-card-price">{item.oldPrice && <del>{item.oldPrice.toLocaleString('ru-RU')} ₸</del>}{item.currentPrice !== undefined && <strong>{item.currentPrice.toLocaleString('ru-RU')} ₸</strong>}</div><small className={item.cityVerified ? 'source-local' : 'source-demo'}>{item.cityVerified ? '✓ Цена подтверждена для Кокшетау' : `${item.city || 'Источник'} · demo; цена не подтверждена для Кокшетау`}</small><Link to={item.kind === 'promotion' && item.promotionId ? `/promotions/${item.promotionId}` : `/products/${item.productId}`}>Подробнее →</Link></article>)}
    </section>}
    {!loading && filtered.length === 0 && <p className="muted small-note">Скидки пока не опубликованы.</p>}

    <section className="section-block">
      <div className="section-head"><h2>Ближайшие организации</h2><Link to="/organizations">Все организации</Link></div>
      {nearest.length ? nearest.map((item) => <article key={item.id} className="list-row">
        <div><strong>{item.name}</strong><small>{item.category} · {item.address}</small></div>
        <Link to={`/organizations/${item.id}`}>Открыть</Link>
      </article>) : <EmptyState text="Организации появятся после модерации." />}
    </section>

    {events.length > 0 && <section className="section-block">
      <div className="section-head"><h2>Мероприятия</h2></div>
      {events.slice(0, 3).map((item) => <article key={item.id} className="list-row">
        <div><strong>{item.title}</strong><small>{new Date(item.date).toLocaleDateString('ru-RU')} · {item.address}</small></div>
      </article>)}
    </section>}

    <button className="ask-card" type="button" onClick={() => navigate('/assistant')}>
      <span className="ask-avatar"><Icon name="assistant" size={21} /></span>
      <span><strong>Спросите помощника</strong><small>Подберу скидки, товары и магазины</small></span>
      <b>›</b>
    </button>
  </>
}
