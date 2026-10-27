import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch, useAuth } from '../api'
import { useData } from '../data'
import { Icon } from '../components/Icon'
import { OrgMap, type MapOrg } from '../components/OrgMap'
import { cityOf, formatDistance, geocodeAddress, haversineKm, type LatLng } from '../lib/geo'
import { RouteButton } from '../components/RouteButton'
import type { RouteResult } from '../lib/RouteService'

const radiusOptions = [
  { label: '500 м', km: 0.5 },
  { label: '1 км', km: 1 },
  { label: '2 км', km: 2 },
  { label: '5 км', km: 5 },
  { label: '10 км', km: 10 },
]
const mapCategories = [
  { label: 'Еда', test: /ресторан|фастфуд|фуд-корт|мороженое/i }, { label: 'Кофе', test: /кафе/i },
  { label: 'Продукты', test: /супермаркет|продукт/i }, { label: 'Аптеки', test: /аптека/i },
  { label: 'Техника', test: /техника/i }, { label: 'ТЦ', test: /торговый центр/i },
  { label: 'Развлечения', test: /кино|театр|развлеч|бар|паб/i }, { label: 'Спорт', test: /спорт|фитнес/i },
]

export function MapPage() {
  const { organizations, promotions, loading, error } = useData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Все')
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [locationError, setLocationError] = useState('')
  const [address, setAddress] = useState('')
  const [addressBusy, setAddressBusy] = useState(false)
  const [nearOnly, setNearOnly] = useState(false)
  const [radiusKm, setRadiusKm] = useState(2)
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('sel'))
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [routeOrigin, setRouteOrigin] = useState<LatLng | null>(null)
  const [routeDestination, setRouteDestination] = useState<LatLng | null>(null)
  const [routeOrgId, setRouteOrgId] = useState<string | undefined>()
  const [routeError, setRouteError] = useState('')
  const [routeOriginSource, setRouteOriginSource] = useState<'selected' | 'city-center' | 'gps' | null>(null)
  const routeViewRef = useRef<HTMLElement | null>(null)
  const [mapSummary, setMapSummary] = useState<Record<string, { products: number; deals: number }>>({})

  useEffect(() => { apiFetch<{ organizations: Record<string, { products: number; deals: number }> }>('/map/summary').then((data) => setMapSummary(data.organizations)).catch(() => setMapSummary({})) }, [])

  useEffect(() => {
    const state = location.state as { route?: RouteResult; origin?: LatLng; destination?: LatLng; organizationId?: string; originSource?: 'selected' | 'city-center' | 'gps' } | null
    if (!state?.route || !state.origin || !state.destination) return
    setRoute(state.route); setRouteOrigin(state.origin); setRouteDestination(state.destination); setRouteOrgId(state.organizationId); setRouteOriginSource(state.originSource ?? 'gps'); setRouteError('')
    if (state.originSource !== 'city-center') setUserLocation(state.origin)
    if (state.organizationId) setSelectedId(state.organizationId)
    window.history.replaceState({}, document.title)
  }, [location.key, location.state])

  useEffect(() => {
    if (route || routeError) routeViewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [route, routeError])

  const center = cityOf(user?.city)
  const located = useMemo(() => organizations.filter((item) => typeof item.lat === 'number' && typeof item.lng === 'number'), [organizations])

  const withDistance = useMemo(() => {
    const result = located.map((item) => ({
      ...item,
      distance: userLocation ? haversineKm(userLocation, { lat: item.lat!, lng: item.lng! }) : undefined,
    }))
    return userLocation ? result.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)) : result
  }, [located, userLocation])

  const visible = useMemo(() => withDistance.filter((item) => {
    const matchesQuery = !query.trim() || `${item.name} ${item.address} ${item.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    const selectedCategory = mapCategories.find((item) => item.label === category)
    const matchesCategory = category === 'Все' || Boolean(selectedCategory?.test.test(item.category))
    const matchesRadius = !nearOnly || (userLocation !== null && item.distance !== undefined && item.distance <= radiusKm)
    return matchesQuery && matchesCategory && matchesRadius
  }), [withDistance, query, category, nearOnly, radiusKm, userLocation])

  const promotionsByOrg = useMemo(() => {
    const map: Record<string, number> = {}
    for (const promo of promotions) {
      if (promo.organizationId) map[promo.organizationId] = (map[promo.organizationId] ?? 0) + 1
    }
    return map
  }, [promotions])

  const mapOrgs: MapOrg[] = visible.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    address: item.address,
    lat: item.lat,
    lng: item.lng,
    distance: item.distance,
    activePromotions: promotionsByOrg[item.id] ?? 0,
    productCount: mapSummary[item.id]?.products,
    dealCount: mapSummary[item.id]?.deals,
    workingHours: item.workingHours,
  }))

  const askLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocationError('Геолокация не поддерживается этим браузером. Выберите город в профиле или введите адрес вручную.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocationError('')
      },
      () => setLocationError('Не удалось определить местоположение. Выберите город в профиле или введите адрес вручную.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [])

  const searchAddress = async () => {
    if (!address.trim()) return
    setAddressBusy(true)
    try {
      const point = await geocodeAddress(`${address}, ${user?.city ?? 'Кокшетау'}, Казахстан`)
      if (!point) { setLocationError('Адрес не найден. Уточните адрес или выберите город в профиле.'); return }
      setUserLocation(point)
      setLocationError('')
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : 'Не удалось найти адрес')
    } finally { setAddressBusy(false) }
  }

  useEffect(() => {
    const sel = searchParams.get('sel')
    if (sel) setSelectedId(sel)
  }, [searchParams])

  const selectOrg = (id: string) => {
    setSelectedId(id)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('sel', id)
      return next
    })
  }

  return <>
    <div className="screen-title"><h1>Карта города</h1></div>

    <div className="map-search">
      <input placeholder="Поиск по организациям" value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>

    <div className="category-pills">
      <button className={category === 'Все' ? 'selected' : ''} type="button" onClick={() => setCategory('Все')}>Все</button>
      {mapCategories.map((item) => <button key={item.label} className={category === item.label ? 'selected' : ''} type="button" onClick={() => setCategory(item.label)}>{item.label}</button>)}
    </div>

    <div className="map-toolbar">
      <button className={`button-secondary ${nearOnly ? 'active' : ''}`} type="button" onClick={() => { setNearOnly((value) => !value); if (!userLocation) askLocation() }}>
        <Icon name="map" size={15} /> Рядом со мной
      </button>
      {nearOnly && <div className="radius-pills">
        {radiusOptions.map((option) => <button key={option.km} className={radiusKm === option.km ? 'selected' : ''} type="button" onClick={() => setRadiusKm(option.km)}>{option.label}</button>)}
      </div>}
      <button className="button-secondary" type="button" onClick={askLocation}><Icon name="search" size={15} /> Моё местоположение</button>
    </div>

    {locationError && <p className="error-text">{locationError}</p>}
    {!locationError && userLocation && <p className="muted small-note">Местоположение задано — расстояния рассчитаны от выбранной точки.</p>}
    {!userLocation && <div className="manual-location">
      <input value={address} onChange={(event) => setAddress(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchAddress() } }} placeholder="Введите адрес вручную" aria-label="Адрес для расчёта расстояния" />
      <button type="button" className="button-secondary" disabled={addressBusy || address.trim().length < 3} onClick={() => void searchAddress()}>{addressBusy ? 'Поиск…' : 'Найти'}</button>
      <Link to="/profile">Выбрать город</Link>
    </div>}

    <section ref={routeViewRef} className="route-map-view">
      {routeError && <div className="route-summary route-summary-error" role="alert">Маршрут не построен: {routeError}</div>}
      {route && routeOrigin && routeDestination && <div className="route-summary" role="status" aria-live="polite">
        <strong>Маршрут построен</strong>
        <span>{formatRouteDistance(route.distance)} · {formatRouteDuration(route.duration)}</span>
          <span className="muted">{routeOriginSource === 'city-center' ? 'Старт: центр города' : 'Старт: выбранное местоположение'}</span>
          <button type="button" className="button-secondary" onClick={() => { setRoute(null); setRouteOrigin(null); setRouteDestination(null); setRouteOrgId(undefined); setRouteOriginSource(null); setRouteError('') }}>Сбросить маршрут</button>
        {routeOrgId && <Link to={`/organizations/${routeOrgId}`}>Открыть организацию</Link>}
        <a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${routeOrigin.lat}%2C${routeOrigin.lng}%3B${routeDestination.lat}%2C${routeDestination.lng}`}>Открыть во внешней карте ↗</a>
      </div>}

      <div className="leaflet-shell">
        <OrgMap
          center={userLocation ?? center}
          zoom={12}
          organizations={mapOrgs}
          userLocation={userLocation}
          selectedId={selectedId}
          onSelect={selectOrg}
          route={route}
          routeOrigin={routeOrigin}
          routeDestination={routeDestination}
          fallbackRouteOrigin={center}
        />
      </div>
    </section>

    {loading && <p className="muted">Загрузка организаций...</p>}
    {error && <p className="error-text">{error}</p>}
    {!loading && visible.length === 0 && <p className="muted empty-state"><Icon name="search" size={26} />Организации не найдены. Измените фильтр или радиус.</p>}

    <section className="map-places">
      {visible.map((item) => <article key={item.id} className={selectedId === item.id ? 'selected' : ''}>
        <div>
          <strong>{item.name}</strong>
          <small>{item.category} · {item.address}{item.distance !== undefined ? ` · ${formatDistance(item.distance)}` : ''}</small>
        </div>
        <div className="row-actions">
          <button type="button" onClick={() => { selectOrg(item.id); navigate(`/organizations/${item.id}`) }}>Открыть</button>
          <RouteButton destination={{ lat: item.lat!, lng: item.lng! }} originOverride={userLocation} fallbackOrigin={center} organizationId={item.id} label="Маршрут" className="button-secondary" onError={setRouteError} onRoute={(value, origin, source) => { setRouteError(''); setRoute(value); setRouteOrigin(origin); setRouteDestination({ lat: item.lat!, lng: item.lng! }); setRouteOrgId(item.id); setRouteOriginSource(source); if (source !== 'city-center') setUserLocation(origin); selectOrg(item.id) }} />
        </div>
      </article>)}
    </section>
  </>
}

const formatRouteDistance = (meters: number) => meters >= 1000 ? `${(meters / 1000).toFixed(1)} км` : `${Math.round(meters)} м`
const formatRouteDuration = (seconds: number) => `~${Math.max(1, Math.round(seconds / 60))} мин`
