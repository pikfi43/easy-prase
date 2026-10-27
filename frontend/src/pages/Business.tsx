import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, mediaUrl, useAuth, type Organization, type Product, type Promotion } from '../api'
import { useData } from '../data'
import { Icon } from '../components/Icon'
import { OrgMap } from '../components/OrgMap'
import { cityOf, geocodeAddress, type LatLng } from '../lib/geo'
import { EmptyState, statusLabels } from '../components/Cards'

const productStatuses: Record<string, string> = {
  draft: 'Черновик',
  pending_review: 'На модерации',
  published: 'Опубликован',
  rejected: 'Отклонён',
}

type BusinessActivity = { stats: { views: number; clicks: number; routes: number; favorites: number; ctr: number }; series: Record<string, { views: number; clicks: number; routes: number }> }

export function SupplierPage() {
  const { user } = useAuth()
  const { categories, loadCatalog } = useData()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [myPromotions, setMyPromotions] = useState<Promotion[]>([])
  const [myProducts, setMyProducts] = useState<Product[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [pickedPoint, setPickedPoint] = useState<LatLng | null>(null)
  const [pointConfirmed, setPointConfirmed] = useState(false)
  const [osmCandidates, setOsmCandidates] = useState<Organization[]>([])
  const [claimOsmId, setClaimOsmId] = useState('')
  const [addressSearch, setAddressSearch] = useState('')
  const [addressSearchBusy, setAddressSearchBusy] = useState(false)
  const [businessImages, setBusinessImages] = useState<string[]>([])
  const [imageBusy, setImageBusy] = useState(false)
  const [promotionImage, setPromotionImage] = useState('')
  const [businessType, setBusinessType] = useState<'ИП' | 'ТОО' | 'АО' | 'Другое'>('ИП')
  const [activity, setActivity] = useState<BusinessActivity | null>(null)
  const [activityPeriod, setActivityPeriod] = useState<7 | 30>(7)
  const [activityError, setActivityError] = useState('')
  const [productForm, setProductForm] = useState<{ id?: string; title: string; description: string; price: string; oldPrice: string; categoryId: string; image: string; available: boolean }>({ title: '', description: '', price: '', oldPrice: '', categoryId: '', image: '', available: true })

  const loadMine = () => {
    if (!user) return
    apiFetch<{ promotions: Promotion[] }>('/promotions?status=all&limit=50')
      .then((data) => setMyPromotions(data.promotions.filter((item) => item.ownerId === user.id)))
      .catch((err: Error) => setError(err.message))
  }

  const loadProducts = () => {
    if (!organization) return
    apiFetch<{ products: Product[] }>(`/products?organizationId=${organization.id}&status=all`)
      .then((data) => setMyProducts(data.products))
      .catch(() => setMyProducts([]))
  }

  useEffect(() => {
    if (!user) return
    apiFetch<{ organizations: Organization[] }>('/organizations?mine=1')
      .then((data) => { const mine = data.organizations.find((item) => item.ownerId === user.id) ?? null; setOrganization(mine); setBusinessImages(mine?.photos ?? []); if (mine?.businessType) setBusinessType(mine.businessType as typeof businessType) })
      .catch(() => setOrganization(null))
    apiFetch<{ organizations: Organization[] }>(`/organizations?city=${encodeURIComponent(user.city)}&source=osm`)
      .then((data) => setOsmCandidates(data.organizations.filter((item) => item.source === 'osm')))
      .catch(() => setOsmCandidates([]))
    loadMine()
    setActivityError('')
    apiFetch<BusinessActivity>('/stats/business?period=7').then(setActivity).catch((err: Error) => setActivityError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    apiFetch<BusinessActivity>(`/stats/business?period=${activityPeriod}`).then(setActivity).catch((err: Error) => setActivityError(err.message))
  }, [activityPeriod, user?.id])

  useEffect(() => {
    loadProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id])

  if (!user || (user.role !== 'supplier' && user.role !== 'admin')) {
    return <p className="muted">Раздел доступен после входа как поставщик. <Link to="/profile">В профиль</Link></p>
  }

  const saveOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = {
      name: String(form.get('name') ?? ''),
      category: String(form.get('category') ?? ''),
      description: String(form.get('description') ?? ''),
      address: String(form.get('address') ?? ''),
      phone: String(form.get('phone') ?? ''),
      website: String(form.get('website') ?? ''),
      workingHours: String(form.get('workingHours') ?? ''),
      businessType: String(form.get('businessType') ?? ''),
      bin: String(form.get('bin') ?? ''),
      email: String(form.get('email') ?? ''),
      legalName: String(form.get('legalName') ?? ''),
      legalAddress: String(form.get('legalAddress') ?? ''),
      representativeName: String(form.get('representativeName') ?? ''),
      representativePosition: String(form.get('representativePosition') ?? ''),
      claimOsmId,
      photos: businessImages,
      ...(pickedPoint ? { lat: pickedPoint.lat, lng: pickedPoint.lng } : {}),
    }
    setError('')
    try {
      if (organization) {
        const data = await apiFetch<{ organization: Organization }>(`/organizations/${organization.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        setOrganization(data.organization)
        setMessage(pointConfirmed ? 'Организация обновлена · Местоположение подтверждено' : 'Организация обновлена')
      } else {
        const data = await apiFetch<{ organization: Organization }>('/organizations', { method: 'POST', body: JSON.stringify(payload) })
        setOrganization(data.organization)
        setMessage(pointConfirmed ? 'Организация отправлена на модерацию · Местоположение подтверждено' : 'Организация отправлена на модерацию')
      }
      setPointConfirmed(false)
      await loadCatalog()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить организацию')
    }
  }

  const uploadImage = async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const result = await apiFetch<{ url: string }>('/uploads/image', { method: 'POST', body: form })
    return result.url
  }

  const searchBusinessAddress = async () => {
    if (!addressSearch.trim()) return
    setAddressSearchBusy(true)
    try {
      const point = await geocodeAddress(`${addressSearch}, ${user.city}, Казахстан`)
      if (!point) { setError('Адрес не найден. Уточните адрес или выберите точку на карте.'); return }
      setPickedPoint(point)
      setPointConfirmed(true)
      setPickOpen(true)
      setError('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось найти адрес') }
    finally { setAddressSearchBusy(false) }
  }

  const savePromotion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const status = submitter?.value === 'draft' ? 'draft' : 'pending_review'
    const form = new FormData(event.currentTarget)
    const payload = {
      title: String(form.get('title') ?? ''),
      description: String(form.get('description') ?? ''),
      place: String(form.get('place') ?? organization?.name ?? ''),
      categoryId: String(form.get('categoryId') ?? ''),
      value: String(form.get('value') ?? ''),
      startDate: String(form.get('startDate') ?? ''),
      endDate: String(form.get('endDate') ?? ''),
      organizationId: organization?.id,
      image: promotionImage || editing?.image || '',
      status,
    }
    setError('')
    try {
      if (editing) {
        await apiFetch(`/promotions/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        setMessage('Акция обновлена')
      } else {
        await apiFetch('/promotions', { method: 'POST', body: JSON.stringify(payload) })
        setMessage(payload.status === 'draft' ? 'Акция сохранена как черновик' : 'Акция отправлена на модерацию')
      }
      setEditing(null)
      setPromotionImage('')
      ;(event.target as HTMLFormElement).reset()
      loadMine()
      await loadCatalog()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить акцию')
    }
  }

  const removePromotion = async (id: string) => {
    try {
      await apiFetch(`/promotions/${id}`, { method: 'DELETE' })
      setMyPromotions((current) => current.filter((item) => item.id !== id))
      await loadCatalog()
    } catch {
      setError('Не удалось удалить акцию')
    }
  }

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!organization) {
      setError('Сначала создайте организацию')
      return
    }
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const status = submitter?.value === 'draft' ? 'draft' : 'pending_review'
    const payload = {
      organizationId: organization.id,
      title: productForm.title,
      description: productForm.description,
      price: Number(productForm.price),
      oldPrice: productForm.oldPrice ? Number(productForm.oldPrice) : undefined,
      categoryId: productForm.categoryId,
      image: productForm.image,
      available: productForm.available,
      status,
    }
    setError('')
    try {
      if (productForm.id) {
        await apiFetch(`/products/${productForm.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        setMessage('Товар обновлён')
      } else {
        await apiFetch('/products', { method: 'POST', body: JSON.stringify(payload) })
        setMessage(status === 'draft' ? 'Товар сохранён как черновик' : 'Товар отправлен на модерацию')
      }
      setProductForm({ title: '', description: '', price: '', oldPrice: '', categoryId: '', image: '', available: true })
      loadProducts()
      await loadCatalog()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить товар')
    }
  }

  const removeProduct = async (id: string) => {
    try {
      await apiFetch(`/products/${id}`, { method: 'DELETE' })
      setMyProducts((current) => current.filter((item) => item.id !== id))
      await loadCatalog()
    } catch {
      setError('Не удалось удалить товар')
    }
  }

  const submitted = organization?.status === 'pending_review'

  return <>
    <div className="business-profile">
      <span className="business-avatar">{user.name[0]}</span>
      <div><h1>{organization?.name ?? 'Мой бизнес'}</h1><small>Поставщик · {user.city}</small></div>
    </div>

    {submitted && <p className="status-chip status-pending_review">Организация на модерации — после одобрения акции будут видны в каталоге.</p>}
    {organization?.status === 'rejected' && <p className="error-text">Организация отклонена: {organization.rejectReason}</p>}
    {message && <p className="success-text">{message}</p>}
    {error && <p className="error-text">{error}</p>}

    <section className="detail-section">
      <div className="section-head"><h2>Аналитика за {activityPeriod} дней</h2><div className="radius-pills"><button className={activityPeriod === 7 ? 'selected' : ''} type="button" onClick={() => setActivityPeriod(7)}>7 дней</button><button className={activityPeriod === 30 ? 'selected' : ''} type="button" onClick={() => setActivityPeriod(30)}>30 дней</button></div></div>
      {activityError && <p className="error-text">{activityError}</p>}
      {activity && <>
        <div className="business-stats"><div><strong>{activity.stats.views}</strong><small>Просмотры</small></div><div><strong>{activity.stats.clicks}</strong><small>Переходы</small></div><div><strong>{activity.stats.routes}</strong><small>Маршруты</small></div><div><strong>{activity.stats.favorites}</strong><small>В избранном</small></div><div><strong>{activity.stats.ctr}%</strong><small>CTR</small></div></div>
        <div className="activity-chart" role="img" aria-label={`Активность за ${activityPeriod} дней`}>
          {Object.entries(activity.series).map(([day, value]) => { const max = Math.max(1, ...Object.values(activity.series).map((item) => Math.max(item.views, item.clicks, item.routes))); return <div className="activity-day" key={day} title={`${day}: просмотры ${value.views}, переходы ${value.clicks}, маршруты ${value.routes}`}><span style={{ height: `${Math.max(value.views, value.clicks, value.routes) ? Math.max(8, Math.max(value.views, value.clicks, value.routes) / max * 100) : 2}%` }} /><small>{day.slice(8)}</small></div> })}
        </div>
        <p className="muted small-note">Столбец показывает дневной максимум просмотров, переходов и маршрутов. Наведите для значений.</p>
      </>}
      {!activity && !activityError && <p className="muted">Загрузка аналитики…</p>}
    </section>

    <section className="detail-section">
      <h2>{organization ? 'Профиль организации' : 'Регистрация организации'}</h2>
      <form className="stack-form" onSubmit={saveOrganization}>
        <label>Название *<input name="name" defaultValue={organization?.name} required /></label>
        <label>Тип бизнеса<select name="businessType" value={businessType} onChange={(event) => setBusinessType(event.target.value as typeof businessType)} required><option>ИП</option><option>ТОО</option><option>АО</option><option>Другое</option></select></label>
        <label>ИИН / БИН (12 цифр) *<input name="bin" inputMode="numeric" pattern="[0-9]{12}" maxLength={12} defaultValue={organization?.bin} required /></label>
        <label>Полное юридическое название{businessType === 'ТОО' ? ' *' : ''}<input name="legalName" defaultValue={organization?.legalName} placeholder="Для ТОО / АО" required={businessType === 'ТОО'} /></label>
        {businessType === 'ТОО' && <label>Юридический адрес *<input name="legalAddress" defaultValue={organization?.legalAddress} required /></label>}
        <label>ФИО предпринимателя или представителя *<input name="representativeName" defaultValue={organization?.representativeName ?? user.name} required /></label>
        {businessType === 'ТОО' && <label>Должность представителя *<input name="representativePosition" defaultValue={organization?.representativePosition} required /></label>}
        <label>Категория *<select name="category" defaultValue={organization?.category ?? ''} required>
          <option value="" disabled>Выберите категорию</option>
          {categories.filter((item) => item.kind === 'organization' || item.kind === 'promotion').map((item) => <option key={item.id} value={item.title}>{item.title}</option>)}
        </select></label>
        <label>Адрес *<input name="address" defaultValue={organization?.address} required /></label>
        <label>Описание<textarea name="description" defaultValue={organization?.description} rows={3} /></label>
        <label>Телефон *<input name="phone" defaultValue={organization?.phone ?? user.phone} required /></label>
        <label>Почта *<input name="email" type="email" defaultValue={organization?.email ?? user.email} required /></label>
        <label>Сайт<input name="website" defaultValue={organization?.website} /></label>
        <label>График работы<input name="workingHours" defaultValue={organization?.workingHours} placeholder="Пн–Пт 9:00–18:00" /></label>
        <label>Фото организации (JPEG, PNG, WebP; до 5 МБ)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={imageBusy || businessImages.length >= 6} onChange={(event) => { const input = event.currentTarget; const file = input.files?.[0]; if (!file) return; setImageBusy(true); void uploadImage(file).then((url) => setBusinessImages((images) => [...images, url].slice(0, 6))).catch((err: Error) => setError(err.message)).finally(() => { setImageBusy(false); input.value = '' }) }} /></label>
        {businessImages.length > 0 && <div className="business-photo-list">{businessImages.map((url) => <img key={url} src={mediaUrl(url)} alt="Фото организации" />)}</div>}
        {!organization && osmCandidates.length > 0 && <label>Эта организация уже есть на карте? Выберите точку для проверки<select value={claimOsmId} onChange={(event) => { const id = event.target.value; setClaimOsmId(id); const selected = osmCandidates.find((item) => item.osmId === id); if (selected && typeof selected.lat === 'number' && typeof selected.lng === 'number') { setPickedPoint({ lat: selected.lat, lng: selected.lng }); setPointConfirmed(true) } }}><option value="">Новая точка</option>{osmCandidates.map((item) => <option key={item.osmId} value={item.osmId}>{item.name} · {item.address}</option>)}</select></label>}
        <div className="map-pick-block">
          <div className="map-pick-head">
            <span>Местоположение: {pointConfirmed || organization?.lat !== undefined ? <b className="success-text">подтверждено</b> : <b className="muted">не задано</b>}</span>
            <button className="button-secondary" type="button" onClick={() => setPickOpen((value) => !value)}>{pickOpen ? 'Скрыть карту' : 'Указать на карте'}</button>
          </div>
          {pointConfirmed && <p className="success-text">Местоположение подтверждено</p>}
          {pickOpen && <>
            <div className="manual-location"><input value={addressSearch} onChange={(event) => setAddressSearch(event.target.value)} placeholder="Адрес организации в Кокшетау" /><button className="button-secondary" type="button" disabled={addressSearchBusy || addressSearch.trim().length < 3} onClick={() => void searchBusinessAddress()}>{addressSearchBusy ? 'Поиск…' : 'Найти адрес'}</button></div>
            <div className="leaflet-shell leaflet-shell-small">
              <OrgMap
                center={pickedPoint ?? cityOf(organization ? undefined : user.city) /* fallback to user city */}
                zoom={organization?.lat !== undefined ? 15 : 11}
                organizations={organization?.lat !== undefined && organization?.lng !== undefined ? [{ id: organization.id, name: organization.name, category: organization.category, address: organization.address, lat: organization.lat, lng: organization.lng }] : []}
                userLocation={null}
                pickMode
                onPick={(point) => { setPickedPoint(point); setPointConfirmed(true) }}
                initialPick={pickedPoint}
              />
            </div>
            <p className="muted small-note">Нажмите на карту, чтобы выбрать место, или перетащите маркер. Найдите адрес через поиск над картой, затем подтвердите точку.</p>
            {pickedPoint && <p className="muted small-note">Выбрано: {pickedPoint.lat.toFixed(5)}, {pickedPoint.lng.toFixed(5)}</p>}
          </>}
        </div>
        <button className="button-primary" type="submit"><Icon name="check" size={16} /> {organization ? 'Сохранить изменения' : 'Отправить на модерацию'}</button>
      </form>
    </section>

    <section className="detail-section">
      <div className="section-head"><h2>Товары и услуги</h2></div>
      {myProducts.length ? myProducts.map((item) => <article key={item.id} className="list-row">
        <div><strong>{item.title}</strong><small className={`status-chip status-${item.status}`}>{productStatuses[item.status] ?? item.status} · {item.price} ₸</small></div>
        <div className="row-actions">
          <button type="button" onClick={() => setProductForm({ id: item.id, title: item.title, description: item.description, price: String(item.price), oldPrice: item.oldPrice ? String(item.oldPrice) : '', categoryId: item.categoryId, image: item.image ?? '', available: true })}>Изменить</button>
          <button type="button" onClick={() => void removeProduct(item.id)}>Удалить</button>
        </div>
      </article>) : <EmptyState text="Товаров пока нет." />}
      <form className="stack-form" onSubmit={saveProduct}>
        <h3>{productForm.id ? 'Изменить товар' : 'Новый товар'}</h3>
        <label>Название *<input value={productForm.title} onChange={(event) => setProductForm((f) => ({ ...f, title: event.target.value }))} required /></label>
        <label>Описание<textarea value={productForm.description} onChange={(event) => setProductForm((f) => ({ ...f, description: event.target.value }))} rows={2} /></label>
        <label>Категория *<select value={productForm.categoryId} onChange={(event) => setProductForm((f) => ({ ...f, categoryId: event.target.value }))} required>
          <option value="" disabled>Выберите категорию</option>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        <div className="form-row">
          <label>Цена, ₸ *<input type="number" min="0" value={productForm.price} onChange={(event) => setProductForm((f) => ({ ...f, price: event.target.value }))} required /></label>
          <label>Старая цена, ₸<input type="number" min="0" value={productForm.oldPrice} onChange={(event) => setProductForm((f) => ({ ...f, oldPrice: event.target.value }))} /></label>
        </div>
        <label>Фотография товара (JPEG, PNG, WebP)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={imageBusy} onChange={(event) => { const input = event.currentTarget; const file = input.files?.[0]; if (!file) return; setImageBusy(true); void uploadImage(file).then((url) => setProductForm((f) => ({ ...f, image: url }))).catch((err: Error) => setError(err.message)).finally(() => { setImageBusy(false); input.value = '' }) }} /></label>
        {productForm.image && <img className="uploaded-preview" src={mediaUrl(productForm.image)} alt="Фото товара" />}
        <label className="checkbox-line"><input type="checkbox" checked={productForm.available} onChange={(event) => setProductForm((f) => ({ ...f, available: event.target.checked }))} /> В наличии</label>
        <div className="form-row">
          <button className="button-secondary" type="submit" value="draft">Сохранить черновик</button>
          <button className="button-primary" type="submit" value="pending_review">Отправить на модерацию</button>
        </div>
      </form>
    </section>

    <section className="detail-section">
      <div className="section-head"><h2>Мои акции</h2></div>
      {myPromotions.length ? myPromotions.map((item) => <article key={item.id} className="list-row">
        <div><strong>{item.title}</strong><small className={`status-chip status-${item.status}`}>{statusLabels[item.status]}</small></div>
        <div className="row-actions">
          <button type="button" onClick={() => { setEditing(item); setPromotionImage(item.image ?? '') }}>Изменить</button>
          <button type="button" onClick={() => void removePromotion(item.id)}>Удалить</button>
        </div>
      </article>) : <EmptyState text="Акций пока нет — создайте первую ниже." />}
    </section>

    <section className="detail-section">
      <h2>{editing ? 'Редактировать акцию' : 'Новая акция'}</h2>
      <form className="stack-form" onSubmit={savePromotion}>
        <label>Название *<input name="title" defaultValue={editing?.title} required /></label>
        <label>Организация *<input name="place" defaultValue={editing?.place ?? organization?.name} required /></label>
        <label>Категория *<select name="categoryId" defaultValue={editing?.categoryId ?? ''} required>
          <option value="" disabled>Выберите категорию</option>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        <label>Описание<textarea name="description" defaultValue={editing?.description} rows={3} /></label>
        <label>Фотография акции (JPEG, PNG, WebP)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={imageBusy} onChange={(event) => { const input = event.currentTarget; const file = input.files?.[0]; if (!file) return; setImageBusy(true); void uploadImage(file).then((url) => setPromotionImage(url)).catch((err: Error) => setError(err.message)).finally(() => { setImageBusy(false); input.value = '' }) }} /></label>
        {(promotionImage || editing?.image) && <img className="uploaded-preview" src={mediaUrl(promotionImage || editing?.image!)} alt="Фото акции" />}
        <label>Ценовое оформление (например «−20%»)<input name="value" defaultValue={editing?.value} placeholder="−20%" /></label>
        <div className="form-row">
          <label>Дата начала *<input name="startDate" type="date" defaultValue={editing?.startDate} required /></label>
          <label>Дата окончания *<input name="endDate" type="date" defaultValue={editing?.endDate} required /></label>
        </div>
        <div className="form-row">
          <button className="button-secondary" type="submit" name="status" value="draft">Сохранить черновик</button>
          <button className="button-primary" type="submit" name="status" value="pending_review">Отправить на модерацию</button>
        </div>
      </form>
    </section>
  </>
}

type AdminQueue = { organizations: Organization[]; promotions: Promotion[]; products: Product[] }
type AdminStats = { users: number; organizations: number; promotions: number; pendingOrganizations: number; pendingPromotions: number; pendingProducts?: number }
type AdminUser = { id: string; name: string; email: string; role: string; city: string; blocked: boolean }
type ImportSource = { source: string; lastImport: string | null; records: number; status: string; demo: boolean; lastLog?: { itemsFetched: number; itemsAdded: number; itemsUpdated: number; itemsSkipped: number; errors: string[] } | null }
type AdminReview = { id: string; organizationId: string; organizationName: string; userName: string; rating: number; text: string; status: 'published' | 'hidden' | 'removed'; createdAt: string }

export function AdminPage() {
  const { user } = useAuth()
  const { loadCatalog } = useData()
  const [queue, setQueue] = useState<AdminQueue>({ organizations: [], promotions: [], products: [] })
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [sources, setSources] = useState<ImportSource[]>([])
  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadAll = () => {
    apiFetch<AdminQueue>('/admin/moderation/queue').then(setQueue).catch((err: Error) => setError(err.message))
    apiFetch<{ stats: AdminStats }>('/auth/stats').then((data) => setStats(data.stats)).catch(() => setStats(null))
    apiFetch<{ users: AdminUser[] }>('/admin/users').then((data) => setUsers(data.users)).catch(() => setUsers([]))
    apiFetch<{ sources: ImportSource[] }>('/admin/data-sources').then((data) => setSources(data.sources)).catch(() => setSources([]))
    apiFetch<{ reviews: AdminReview[] }>('/admin/moderation/reviews').then((data) => setReviews(data.reviews)).catch(() => setReviews([]))
  }

  useEffect(() => {
    if (user?.role === 'admin') loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  if (!user || user.role !== 'admin') return <p className="muted">Раздел доступен только администратору.</p>

  const moderate = async (kind: 'organizations' | 'promotions' | 'products', id: string, decision: 'approve' | 'reject') => {
    const reason = decision === 'reject' ? window.prompt('Причина отклонения:') ?? '' : ''
    if (decision === 'reject' && !reason.trim()) return
    try {
      await apiFetch(`/admin/moderation/${kind}/${id}`, { method: 'POST', body: JSON.stringify({ decision, reason }) })
      setMessage(decision === 'approve' ? 'Одобрено' : 'Отклонено')
      loadAll()
      await loadCatalog()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка модерации')
    }
  }

  const toggleBlock = async (target: AdminUser) => {
    try {
      await apiFetch(`/admin/users/${target.id}/${target.blocked ? 'unblock' : 'block'}`, { method: 'POST' })
      loadAll()
    } catch {
      setError('Не удалось изменить статус пользователя')
    }
  }

  const moderateReview = async (reviewId: string, status: AdminReview['status']) => {
    try { await apiFetch(`/admin/moderation/reviews/${reviewId}`, { method: 'POST', body: JSON.stringify({ status }) }); loadAll() }
    catch (err) { setError(err instanceof Error ? err.message : 'Не удалось обновить отзыв') }
  }

  return <>
    <div className="screen-title"><h1>Панель администратора</h1></div>
    {message && <p className="success-text">{message}</p>}
    {error && <p className="error-text">{error}</p>}

    {stats && <div className="business-stats">
      <div><strong>{stats.users}</strong><small>Пользователи</small></div>
      <div><strong>{stats.organizations}</strong><small>Организации</small></div>
      <div><strong>{stats.promotions}</strong><small>Акции</small></div>
      <div><strong>{(stats.pendingOrganizations ?? 0) + (stats.pendingPromotions ?? 0) + (stats.pendingProducts ?? 0)}</strong><small>В очереди</small></div>
    </div>}

    <section className="detail-section">
      <h2>Очередь модерации: организации ({queue.organizations.length})</h2>
      {queue.organizations.length ? queue.organizations.map((item) => <article key={item.id} className="list-row">
        <div><strong>{item.name}</strong><small>{item.category} · {item.address}</small></div>
        <div className="row-actions">
          <button type="button" onClick={() => void moderate('organizations', item.id, 'approve')}>Одобрить</button>
          <button type="button" onClick={() => void moderate('organizations', item.id, 'reject')}>Отклонить</button>
        </div>
      </article>) : <EmptyState text="Нет организаций на модерации." />}
    </section>

    <section className="detail-section">
      <h2>Очередь модерации: акции ({queue.promotions.length})</h2>
      {queue.promotions.length ? queue.promotions.map((item) => <article key={item.id} className="list-row">
        <div><strong>{item.title}</strong><small>{item.place} · до {item.endDate}</small></div>
        <div className="row-actions">
          <button type="button" onClick={() => void moderate('promotions', item.id, 'approve')}>Одобрить</button>
          <button type="button" onClick={() => void moderate('promotions', item.id, 'reject')}>Отклонить</button>
        </div>
      </article>) : <EmptyState text="Нет акций на модерации." />}
    </section>

    <section className="detail-section">
      <h2>Очередь модерации: товары ({queue.products.length})</h2>
      {queue.products.length ? queue.products.map((item) => <article key={item.id} className="list-row">
        <div><strong>{item.title}</strong><small>{item.price} ₸ · {item.description || 'без описания'}</small></div>
        <div className="row-actions">
          <button type="button" onClick={() => void moderate('products', item.id, 'approve')}>Одобрить</button>
          <button type="button" onClick={() => void moderate('products', item.id, 'reject')}>Отклонить</button>
        </div>
      </article>) : <EmptyState text="Нет товаров на модерации." />}
    </section>

    <section className="detail-section">
      <h2>Отзывы ({reviews.length})</h2>
      {reviews.map((review) => <article key={review.id} className="list-row"><div><strong>{review.organizationName} · {'★'.repeat(review.rating)} · {review.userName}</strong><small>{review.status} · {review.text || 'без текста'}</small></div><div className="row-actions"><button type="button" onClick={() => void moderateReview(review.id, review.status === 'published' ? 'hidden' : 'published')}>{review.status === 'published' ? 'Скрыть' : 'Восстановить'}</button><button type="button" onClick={() => void moderateReview(review.id, 'removed')}>Удалить</button></div></article>)}
      {!reviews.length && <EmptyState text="Отзывов для модерации пока нет." />}
    </section>

    <section className="detail-section">
      <h2>Пользователи ({users.length})</h2>
      {users.map((item) => <article key={item.id} className="list-row">
        <div><strong>{item.name}</strong><small>{item.email} · {item.role} · {item.city}</small></div>
        <button type="button" onClick={() => void toggleBlock(item)}>{item.blocked ? 'Разблокировать' : 'Заблокировать'}</button>
      </article>)}
    </section>
    <section className="detail-section">
      <h2>Источники данных</h2>
      <p className="muted small-note">Числа рассчитаны по импортированным предложениям и организациям; демонстрационные каталоги помечены отдельно.</p>
      <div className="data-source-table"><div className="data-source-row data-source-header"><b>Источник</b><b>Обновлён</b><b>Записей</b><b>Статус</b></div>
        {sources.map((item) => <div className="data-source-row" key={item.source}><strong>{item.source}{item.demo ? ' · demo' : ''}</strong><span>{item.lastImport ? new Date(item.lastImport).toLocaleString('ru-RU') : '—'}</span><span>{item.records}</span><span>{item.status}</span></div>)}
      </div>
      <h3>Последние импорты</h3>
      {sources.filter((item) => item.lastLog).map((item) => <article className="list-row" key={`${item.source}-log`}><div><strong>{item.source}: {item.status}</strong><small>Получено {item.lastLog?.itemsFetched} · добавлено {item.lastLog?.itemsAdded} · обновлено {item.lastLog?.itemsUpdated} · пропущено {item.lastLog?.itemsSkipped}</small>{item.lastLog?.errors.map((error, index) => <small className="error-text" key={index}>{error}</small>)}</div></article>)}
      {!sources.some((item) => item.lastLog) && <EmptyState text="Импорты ещё не запускались." />}
    </section>
  </>
}

export function CategoriesAdminPage() {
  const { user } = useAuth()
  const { categories, loadCatalog } = useData()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('promotion')
  const [error, setError] = useState('')

  if (!user || user.role !== 'admin') return <p className="muted">Раздел доступен только администратору.</p>

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await apiFetch('/categories', { method: 'POST', body: JSON.stringify({ title, kind, slug: title.toLocaleLowerCase() }) })
      setTitle('')
      await loadCatalog()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать категорию')
    }
  }

  const remove = async (id: string) => {
    try {
      await apiFetch(`/categories/${id}`, { method: 'DELETE' })
      await loadCatalog()
    } catch {
      setError('Не удалось удалить категорию')
    }
  }

  return <>
    <div className="screen-title"><Link to="/admin">‹ Назад</Link><h1>Категории</h1></div>
    {error && <p className="error-text">{error}</p>}
    <form className="stack-form" onSubmit={create}>
      <label>Название<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
      <label>Тип<select value={kind} onChange={(event) => setKind(event.target.value)}>
        <option value="promotion">Акции</option>
        <option value="organization">Организации</option>
        <option value="product">Товары</option>
      </select></label>
      <button className="button-primary" type="submit">Добавить</button>
    </form>
    <section className="section-block">
      {categories.map((item) => <article key={item.id} className="list-row">
        <div><strong>{item.title}</strong><small>{item.kind}</small></div>
        <button type="button" onClick={() => void remove(item.id)}>Удалить</button>
      </article>)}
    </section>
  </>
}
