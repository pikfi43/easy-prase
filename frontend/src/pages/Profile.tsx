import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch, cities, useAuth, userCategories } from '../api'
import { useData } from '../data'
import { Icon } from '../components/Icon'
import { RouteButton } from '../components/RouteButton'
import { EmptyState, PromotionCard } from '../components/Cards'

export function ProfilePage({ onAuth }: { onAuth: (mode: 'login' | 'register') => void }) {
  const { user, signOut, updateUser } = useAuth()
  const { favorites, promotions, organizations, products } = useData()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const match = (type: 'promotion' | 'organization' | 'product') => favorites.filter((fav) => fav.targetType === type)
  const favoritePromotions = promotions.filter((item) => match('promotion').some((fav) => fav.targetId === item.id))
  const favoriteOrganizations = organizations.filter((item) => match('organization').some((fav) => fav.targetId === item.id))
  const favoriteProducts = products.filter((item) => match('product').some((fav) => fav.targetId === item.id))

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setError('')
    try {
      const data = await apiFetch<{ user: typeof user }>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          phone: String(form.get('phone') ?? ''),
          city: String(form.get('city') ?? ''),
          category: String(form.get('category') ?? ''),
        }),
      })
      if (data.user) updateUser(data.user)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить профиль')
    } finally {
      setSaving(false)
    }
  }

  if (!user) {
    return <>
      <div className="profile-hero">
      <span className="profile-avatar">Г</span>
      <div><h1>Гость</h1><p>Войдите, чтобы открыть профиль</p></div>
      <div className="guest-auth-actions">
        <button type="button" onClick={() => onAuth('login')}>Войти</button>
        <button type="button" onClick={() => onAuth('register')}>Регистрация</button>
      </div>
      </div>
    </>
  }

  const preview = [
    ...favoriteOrganizations.slice(0, 2).map((item) => ({ key: `organization-${item.id}`, to: `/organizations/${item.id}`, title: item.name, subtitle: item.category })),
    ...favoritePromotions.slice(0, 2).map((item) => ({ key: `promotion-${item.id}`, to: `/promotions/${item.id}`, title: item.title, subtitle: item.place || 'Акция' })),
    ...favoriteProducts.slice(0, 2).map((item) => ({ key: `product-${item.id}`, to: `/products/${item.id}`, title: item.title, subtitle: `${item.price.toLocaleString('ru-RU')} ₸` })),
  ].slice(0, 4)

  return <>
    <div className="profile-hero">
      <span className="profile-avatar">{user.name[0]}</span>
      <div>
        <h1>{user.name}</h1>
        <p>{user.role === 'admin' ? 'Администратор' : user.role === 'supplier' ? 'Поставщик' : 'Житель'} · {user.city}</p>
      </div>
      <button type="button" aria-label="Настройки" onClick={() => setEditing((value) => !value)}><Icon name="settings" size={20} /></button>
    </div>

    {editing && <form className="profile-form" onSubmit={saveProfile}>
      <label>Имя<input name="name" defaultValue={user.name} required /></label>
      <label>Телефон<input name="phone" defaultValue={user.phone} placeholder="+7 ..." /></label>
      <label>Город<select name="city" defaultValue={user.city}>{cities.map((city) => <option key={city}>{city}</option>)}</select></label>
      <label>Категория<select name="category" defaultValue={user.category}>{userCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
      {error && <p className="error-text">{error}</p>}
      <button className="button-primary" type="submit" disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
    </form>}

    <section className="profile-menu">
      <Link to="/favorites"><span><Icon name="heart" size={20} /></span><span>Избранное ({favorites.length})</span><b>›</b></Link>
      <Link to="/notifications"><span><Icon name="bell" size={20} /></span><span>Уведомления</span><b>›</b></Link>
      {user.role === 'supplier' && <Link to="/supplier"><span><Icon name="briefcase" size={20} /></span><span>Кабинет поставщика</span><b>›</b></Link>}
      {user.role === 'admin' && <Link to="/admin"><span><Icon name="star" size={20} /></span><span>Панель администратора</span><b>›</b></Link>}
    </section>

    <button className="logout-button" type="button" onClick={() => { signOut(); navigate('/') }}>Выйти из аккаунта</button>

    <section className="section-block">
      <div className="section-head"><h2>Избранное</h2>{favorites.length > 0 && <Link to="/favorites">Смотреть все</Link>}</div>
      {favorites.length === 0 && <EmptyState text="В избранном пока пусто. Добавляйте товары, акции и магазины через сердечко." />}
      {preview.map((item) => <article key={item.key} className="list-row">
        <div><strong>{item.title}</strong><small>{item.subtitle}</small></div>
        <Link to={item.to}>Открыть</Link>
      </article>)}
    </section>
  </>
}

export function FavoritesPage() {
  const { favorites, promotions, organizations, products, loading } = useData()
  const { user } = useAuth()
  const [tab, setTab] = useState<'all' | 'organization' | 'promotion' | 'product'>('all')

  const favoritePromotions = promotions.filter((item) => favorites.some((fav) => fav.targetType === 'promotion' && fav.targetId === item.id))
  const favoriteOrganizations = organizations.filter((item) => favorites.some((fav) => fav.targetType === 'organization' && fav.targetId === item.id))
  const favoriteProducts = products.filter((item) => favorites.some((fav) => fav.targetType === 'product' && fav.targetId === item.id))

  const shownPromotions = tab === 'all' || tab === 'promotion' ? favoritePromotions : []
  const shownOrganizations = tab === 'all' || tab === 'organization' ? favoriteOrganizations : []
  const shownProducts = tab === 'all' || tab === 'product' ? favoriteProducts : []
  const total = favorites.length

  const tabs: Array<{ id: typeof tab; label: string; count: number }> = [
    { id: 'all', label: 'Все', count: total },
    { id: 'organization', label: 'Организации', count: favoriteOrganizations.length },
    { id: 'promotion', label: 'Акции', count: favoritePromotions.length },
    { id: 'product', label: 'Товары', count: favoriteProducts.length },
  ]

  if (!user) return <p className="muted">Войдите, чтобы видеть избранное.</p>

  return <>
    <div className="screen-title"><Link to="/profile">‹ Назад</Link><h1>Избранное</h1></div>
    {loading && <p className="loading-line">Загрузка данных...</p>}
    <div className="category-pills">
      {tabs.map((item) => <button key={item.id} className={tab === item.id ? 'selected' : ''} type="button" onClick={() => setTab(item.id)}>
        {item.label}{item.count > 0 ? ` (${item.count})` : ''}
      </button>)}
    </div>

    {shownOrganizations.length > 0 && <section className="section-block">
      <div className="section-head"><h2>Организации</h2></div>
      {shownOrganizations.map((item) => <article key={item.id} className="list-row">
        <div><strong>{item.name}</strong><small>{item.category} · {item.address}</small></div>
        <div className="row-actions"><Link to={`/organizations/${item.id}`}>Открыть</Link>{typeof item.lat === 'number' && typeof item.lng === 'number' && <RouteButton destination={{ lat: item.lat, lng: item.lng }} organizationId={item.id} label="Маршрут" className="button-secondary" />}</div>
      </article>)}
    </section>}

    {shownPromotions.length > 0 && <section className="section-block">
      <div className="section-head"><h2>Акции</h2></div>
      {shownPromotions.map((item) => <PromotionCard key={item.id} item={item} />)}
    </section>}

    {shownProducts.length > 0 && <section className="section-block">
      <div className="section-head"><h2>Товары</h2></div>
        {shownProducts.map((item) => <article key={item.id} className="list-row">
          <div><strong>{item.title}</strong><small>{item.price} ₸{item.oldPrice ? ` · старая цена ${item.oldPrice} ₸` : ''}</small></div>
          <Link to={`/products/${item.id}`}>Открыть</Link>
      </article>)}
    </section>}

    {shownOrganizations.length === 0 && shownPromotions.length === 0 && shownProducts.length === 0 &&
      <EmptyState text="В этой вкладке пока ничего нет." />}
  </>
}
