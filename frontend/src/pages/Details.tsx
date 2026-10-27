import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch, mediaUrl, useAuth, type Organization, type Product, type Promotion } from '../api'
import { useData } from '../data'
import { OrgMap } from '../components/OrgMap'
import { EmptyState, PromotionCard, statusLabels } from '../components/Cards'
import { RouteButton } from '../components/RouteButton'

type OrgOffer = { id: string; price: number; oldPrice?: number; discountPercent?: number; source: string; sourceCity?: string; cityVerified: boolean; demo: boolean; externalUrl?: string; product: Product }
type OrgDeal = OrgOffer
type OrgReview = { id: string; userId: string; userName: string; rating: number; text: string; photos: string[]; createdAt: string }

export function PromotionDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { isFavorite, toggleFavorite } = useData()
  const [promotion, setPromotion] = useState<Promotion | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    apiFetch<{ promotion: Promotion; organization: Organization | null }>(`/promotions/${id}`)
      .then((data) => {
        setPromotion(data.promotion)
        setOrganization(data.organization)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="muted">Загрузка...</p>
  if (error) return <p className="error-text">{error}</p>
  if (!promotion) return <EmptyState text="Акция не найдена." />

  const favorite = isFavorite('promotion', promotion.id)
  const hasCoords = typeof organization?.lat === 'number' && typeof organization?.lng === 'number'

  return <article className="detail-page">
    <div className="screen-title"><Link to="/promotions">‹ Назад</Link><h1>{promotion.title}</h1></div>
    <div className="detail-hero">
      {promotion.image
        ? <img src={mediaUrl(promotion.image)} alt={promotion.title} />
        : <span className="deal-discount big">{promotion.value || 'Акция'}</span>}
    </div>
    <div className="detail-head">
      <div>
        <h2>{promotion.title}</h2>
        <p className="muted">{promotion.place}</p>
      </div>
      <button className={`deal-favorite ${favorite ? 'active' : ''}`} type="button" onClick={() => { if (user) void toggleFavorite('promotion', promotion.id) }}>
        {favorite ? '♥' : '♡'}
      </button>
    </div>
    {promotion.status !== 'published' && <p className={`status-chip status-${promotion.status}`}>{statusLabels[promotion.status]}</p>}
    {promotion.rejectReason && <p className="error-text">Причина отклонения: {promotion.rejectReason}</p>}
    <section className="detail-section">
      <h3>Описание</h3>
      <p>{promotion.description || 'Описание не указано.'}</p>
    </section>
    <section className="detail-section">
      <h3>Условия</h3>
      <ul className="detail-facts">
        <li><b>Период:</b> {promotion.startDate} — {promotion.endDate}</li>
        {promotion.oldPrice !== undefined && <li><b>Старая цена:</b> {promotion.oldPrice} ₸</li>}
        {promotion.newPrice !== undefined && <li><b>Новая цена:</b> {promotion.newPrice} ₸</li>}
        {promotion.discountSize !== undefined && <li><b>Скидка:</b> {promotion.discountSize} %</li>}
        {promotion.promoCode && <li><b>Промокод:</b> {promotion.promoCode}</li>}
      </ul>
    </section>
    {organization && <section className="detail-section">
      <h3>Организация</h3>
      <p><Link to={`/organizations/${organization.id}`}>{organization.name}</Link></p>
      <p className="muted">{organization.address} · {organization.phone}</p>
      <div className="detail-actions">
        {hasCoords && <RouteButton destination={{ lat: organization.lat!, lng: organization.lng! }} organizationId={organization.id} />}
        {organization.phone && <a className="button-secondary" href={`tel:${organization.phone}`}>Позвонить</a>}
      </div>
      {hasCoords && <div className="leaflet-shell leaflet-shell-small">
        <OrgMap center={{ lat: organization.lat!, lng: organization.lng! }} zoom={15} organizations={[{ id: organization.id, name: organization.name, category: organization.category, address: organization.address, lat: organization.lat, lng: organization.lng }]} userLocation={null} />
      </div>}
    </section>}
  </article>
}

export function OrganizationsPage() {
  const { organizations, loading, error } = useData()
  const [query, setQuery] = useState('')
  const filtered = organizations.filter((item) => !query || `${item.name} ${item.address} ${item.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))

  return <>
    <div className="screen-title"><h1>Организации</h1></div>
    <div className="search-field"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по организациям" /></div>
    <section className="section-block">
      {loading && <p className="muted">Загрузка...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && filtered.length === 0 && <EmptyState text="Организации не найдены." />}
      {filtered.map((item) => <article key={item.id} className="list-row">
        <div><strong>{item.name}</strong><small>{item.category} · {item.address}</small></div>
        <Link to={`/organizations/${item.id}`}>Открыть</Link>
      </article>)}
    </section>
  </>
}

export function OrganizationDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { isFavorite, toggleFavorite } = useData()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [orgPromotions, setOrgPromotions] = useState<Promotion[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [offers, setOffers] = useState<OrgOffer[]>([])
  const [dealsPreview, setDealsPreview] = useState<OrgDeal[]>([])
  const [reviews, setReviews] = useState<OrgReview[]>([])
  const [counts, setCounts] = useState({ products: 0, deals: 0, reviews: 0 })
  const [rating, setRating] = useState({ average: 0, count: 0 })
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [reviewPhotoBusy, setReviewPhotoBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    apiFetch<{ organization: Organization; promotions: Promotion[]; products: Product[]; offers: OrgOffer[]; dealsPreview: OrgDeal[]; reviewsPreview: OrgReview[]; myReview?: OrgReview | null; counts: typeof counts; rating: typeof rating }>(`/organizations/${id}`)
      .then((data) => {
        setOrganization(data.organization)
        setOrgPromotions(data.promotions)
        setProducts(data.products)
        setOffers(data.offers ?? [])
        setDealsPreview(data.dealsPreview ?? [])
        setReviews(data.myReview && !(data.reviewsPreview ?? []).some((item) => item.id === data.myReview?.id) ? [data.myReview, ...(data.reviewsPreview ?? [])].slice(0, 5) : data.reviewsPreview ?? [])
        setCounts(data.counts ?? { products: data.products.length, deals: data.promotions.length, reviews: 0 })
        setRating(data.rating ?? { average: 0, count: 0 })
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])


  if (loading) return <p className="muted">Загрузка...</p>
  if (error) return <p className="error-text">{error}</p>
  if (!organization) return <EmptyState text="Организация не найдена." />

  const favorite = isFavorite('organization', organization.id)
  const hasCoords = typeof organization.lat === 'number' && typeof organization.lng === 'number'
  const myReview = reviews.find((item) => item.userId === user?.id)
  const submitReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setReviewError('')
    if (!user) { setReviewError('Войдите, чтобы оставить отзыв.'); return }
    try {
      const path = `/organizations/${organization.id}/reviews${myReview ? `/${myReview.id}` : ''}`
      const data = await apiFetch<{ review: OrgReview }>(path, { method: myReview ? 'PATCH' : 'POST', body: JSON.stringify({ rating: reviewRating, text: reviewText }) })
      setReviews((current) => [data.review, ...current.filter((item) => item.id !== data.review.id)].slice(0, 5))
      setReviewText('')
      const latest = await apiFetch<{ rating: { average: number; count: number } }>(`/organizations/${organization.id}/reviews`)
      setRating(latest.rating); setCounts((current) => ({ ...current, reviews: latest.rating.count }))
    } catch (err) { setReviewError(err instanceof Error ? err.message : 'Не удалось сохранить отзыв') }
  }
  const deleteReview = async () => {
    if (!myReview) return
    try {
      await apiFetch(`/organizations/${organization.id}/reviews/${myReview.id}`, { method: 'DELETE' })
      setReviews((current) => current.filter((item) => item.id !== myReview.id))
      const latest = await apiFetch<{ rating: { average: number; count: number } }>(`/organizations/${organization.id}/reviews`)
      setRating(latest.rating); setCounts((current) => ({ ...current, reviews: latest.rating.count }))
    } catch (err) { setReviewError(err instanceof Error ? err.message : 'Не удалось удалить отзыв') }
  }

  return <article className="detail-page">
    <div className="screen-title"><Link to="/organizations">‹ Назад</Link><h1>{organization.name}</h1></div>

    {organization.photos && organization.photos.length > 0 && <div className="photo-strip">
      {organization.photos.map((photo, index) => <img key={index} src={mediaUrl(photo)} alt={`${organization.name} — фото ${index + 1}`} />)}
    </div>}

    <div className="detail-head">
      <div>
        <p className="muted">{organization.category}</p>
        <h2>{organization.name}</h2>
        {rating.count > 0 && <p className="organization-rating">★ {rating.average.toFixed(1)} · {rating.count} {rating.count === 1 ? 'отзыв' : 'отзывов'}</p>}
      </div>
      <button className={`deal-favorite ${favorite ? 'active' : ''}`} type="button" onClick={() => { if (user) void toggleFavorite('organization', organization.id) }}>
        {favorite ? '♥' : '♡'}
      </button>
    </div>

    <section className="detail-section">
        {!organization.description && <div className="organization-placeholder" aria-hidden="true">{/аптек/i.test(organization.category) ? '💊' : /кафе|ресторан|еда/i.test(organization.category) ? '☕' : /техник/i.test(organization.category) ? '💻' : '🏬'}</div>}
        <p>{organization.description || `${organization.name} — ${organization.category.toLocaleLowerCase()} в ${organization.city}.`}</p>
    </section>

    <section className="detail-section">
      <h3>Контакты</h3>
      <ul className="detail-facts">
        <li><b>Адрес:</b> {organization.addressText || organization.address || 'Адрес не указан'}</li>
        {organization.phone && <li><b>Телефон:</b> {organization.phone}</li>}
        {organization.website && <li><b>Сайт:</b> {organization.website}</li>}
        {organization.workingHours && <li><b>График:</b> {organization.workingHours}</li>}
      </ul>
      <div className="detail-actions">
        {organization.phone && <a className="button-primary" href={`tel:${organization.phone}`}>Позвонить</a>}
        {hasCoords && <RouteButton destination={{ lat: organization.lat!, lng: organization.lng! }} organizationId={organization.id} />}
        <button className="button-secondary" type="button" onClick={() => { if (user) void toggleFavorite('organization', organization.id) }}>{favorite ? '♥ В избранном' : '♡ В избранное'}</button>
      </div>
      {!hasCoords && <p className="muted">Координаты не заданы — маршрут построить нельзя.</p>}
    </section>

    {hasCoords && <section className="detail-section">
      <h3>На карте</h3>
      <div className="leaflet-shell leaflet-shell-small">
        <OrgMap
          center={{ lat: organization.lat!, lng: organization.lng! }}
          zoom={15}
          organizations={[{ id: organization.id, name: organization.name, category: organization.category, address: organization.address, lat: organization.lat, lng: organization.lng }]}
          userLocation={null}
        />
      </div>
    </section>}

    {orgPromotions.length > 0 && <section className="detail-section">
      <h3>Активные акции</h3>
      {orgPromotions.map((item) => <PromotionCard key={item.id} item={item} />)}
    </section>}

    {dealsPreview.length > 0 && <section className="detail-section"><h3>Акции и скидки · {counts.deals}</h3>{dealsPreview.map((offer) => <article className="list-row" key={offer.id}><div><strong>{offer.product.title}</strong><small>{offer.cityVerified ? 'Цена подтверждена для Кокшетау' : `${offer.sourceCity || offer.source} · demo, цена не подтверждена для Кокшетау`}</small></div><div><b>{offer.price.toLocaleString('ru-RU')} ₸</b>{offer.oldPrice && <del>{offer.oldPrice.toLocaleString('ru-RU')} ₸</del>}<small className="offer-discount">−{offer.discountPercent ?? 0}%</small></div><div className="row-actions"><Link to={`/products/${offer.product.id}`}>Товар</Link>{offer.externalUrl && <a href={offer.externalUrl} target="_blank" rel="noreferrer">Источник ↗</a>}</div></article>)}<Link to="/promotions">Все акции и скидки →</Link></section>}

    {(products.length > 0 || offers.length > 0) && <section className="detail-section">
      <h3>Товары и услуги · {counts.products}</h3>
      {offers.map((offer) => <article key={offer.id} className="list-row">
        <div><strong>{offer.product.title}</strong><small>{offer.cityVerified ? 'Цена подтверждена для Кокшетау' : `${offer.source} · ${offer.product.sourceCity || 'demo'}, цена не подтверждена для Кокшетау`}</small></div>
        <div><b>{offer.price.toLocaleString('ru-RU')} ₸</b>{offer.oldPrice && <del>{offer.oldPrice.toLocaleString('ru-RU')} ₸</del>}</div>
        {offer.externalUrl && <a href={offer.externalUrl} target="_blank" rel="noreferrer">Источник ↗</a>}
      </article>)}
      {products.map((item) => <article key={item.id} className="list-row">
        <div><strong>{item.title}</strong><small>{item.description}</small></div>
        <b>{item.price.toLocaleString('ru-RU')} ₸</b>
      </article>)}
      {counts.products > offers.length + products.length && <Link to={`/products?organizationId=${organization.id}`}>Все товары ({counts.products}) →</Link>}
    </section>}
    {counts.products === 0 && organization.source === 'osm' && <p className="muted small-note">Каталог этого магазина пока не подключён к Easy Price.</p>}

    <section className="detail-section">
      <h3>Отзывы {rating.count > 0 ? `· ★ ${rating.average.toFixed(1)} (${rating.count})` : ''}</h3>
      {reviews.length === 0 && <p className="muted">Отзывов пока нет.</p>}
      {reviews.map((review) => <article className="review-row" key={review.id}><strong>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)} · {review.userName}</strong><p>{review.text}</p><small>{new Date(review.createdAt).toLocaleDateString('ru-RU')}</small>{review.photos?.length > 0 && <div className="photo-strip">{review.photos.map((photo) => <img src={mediaUrl(photo)} alt="Фото к отзыву" key={photo} />)}</div>}{review.userId === user?.id && <button type="button" onClick={() => { setReviewRating(review.rating); setReviewText(review.text) }}>Изменить мой отзыв</button>}</article>)}
      {user && <form className="review-form" onSubmit={(event) => void submitReview(event)}><label>Ваша оценка<select value={reviewRating} onChange={(event) => setReviewRating(Number(event.target.value))}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{'★'.repeat(value)} ({value})</option>)}</select></label><textarea value={reviewText} onChange={(event) => setReviewText(event.target.value)} maxLength={3000} placeholder="Ваш отзыв" /><button type="button" className="button-secondary" disabled={!myReview || reviewPhotoBusy || (myReview.photos?.length ?? 0) >= 5} onClick={(event) => { const input = event.currentTarget.nextElementSibling as HTMLInputElement | null; input?.click() }}>Добавить фото {myReview ? `(${myReview.photos?.length ?? 0}/5)` : 'после публикации'}</button><input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (!file || !myReview) return; const body = new FormData(); body.append('file', file); setReviewPhotoBusy(true); void apiFetch<{ url: string }>(`/uploads/reviews/${myReview.id}/image`, { method: 'POST', body }).then(({ url }) => { setReviews((current) => current.map((item) => item.id === myReview.id ? { ...item, photos: [...(item.photos ?? []), url] } : item)) }).catch((err: Error) => setReviewError(err.message)).finally(() => { setReviewPhotoBusy(false); event.currentTarget.value = '' }) }} /><div className="row-actions"><button className="button-primary" type="submit">{myReview ? 'Сохранить отзыв' : 'Опубликовать'}</button>{myReview && <button type="button" className="button-secondary" onClick={() => void deleteReview()}>Удалить</button>}</div></form>}
      {!user && <p className="muted">Войдите, чтобы оставить отзыв.</p>}
      {reviewError && <p className="error-text">{reviewError}</p>}
    </section>
  </article>
}
