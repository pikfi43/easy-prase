import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'
import { cityOf, formatDistance, routeUrl, type LatLng } from '../lib/geo'
import { RouteLayer } from './RouteLayer'
import { RouteButton } from './RouteButton'
import type { RouteResult, RoutePoint } from '../lib/RouteService'

const orgIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

const categoryEmoji = (category: string) => {
  if (/кафе|кофе/i.test(category)) return '☕'
  if (/ресторан|еда|фуд|морож/i.test(category)) return '🍴'
  if (/фаст/i.test(category)) return '🍔'
  if (/супермаркет|продукт/i.test(category)) return '🛒'
  if (/аптек/i.test(category)) return '💊'
  if (/техник/i.test(category)) return '💻'
  if (/центр/i.test(category)) return '🏬'
  if (/кино|театр|развлеч/i.test(category)) return '🎬'
  return '📍'
}
const categoryIcon = (category: string) => L.divIcon({
  className: 'organization-marker', html: `<span>${categoryEmoji(category)}</span>`,
  iconSize: [34, 34], iconAnchor: [17, 30], popupAnchor: [0, -28],
})

const userIcon = new L.DivIcon({
  className: 'user-marker',
  html: '<div class="user-marker-dot"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

export type MapOrg = {
  id: string
  name: string
  category: string
  address: string
  lat?: number
  lng?: number
  distance?: number
  activePromotions?: number
  productCount?: number
  dealCount?: number
  workingHours?: string
  rating?: number
}

type Props = {
  center: LatLng
  zoom?: number
  organizations: MapOrg[]
  userLocation: LatLng | null
  selectedId?: string | null
  onSelect?: (id: string) => void
  pickMode?: boolean
  onPick?: (point: LatLng) => void
  initialPick?: LatLng | null
  onRoute?: (id: string) => void
  route?: RouteResult | null
  routeOrigin?: RoutePoint | null
  routeDestination?: RoutePoint | null
  fallbackRouteOrigin?: RoutePoint
}

function FlyController({ center, zoom, selectedId, organizations, routeActive }: { center: LatLng; zoom: number; selectedId?: string | null; organizations: MapOrg[]; routeActive: boolean }) {
  const map = useMap()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (routeActive) return
    if (selectedId) {
      const target = organizations.find((item) => item.id === selectedId)
      if (target && typeof target.lat === 'number' && typeof target.lng === 'number') {
        map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15), { duration: 0.6 })
        return
      }
    }
    map.flyTo([center.lat, center.lng], zoom, { duration: 0.6 })
  }, [selectedId, center, zoom, organizations, map, routeActive])
  return null
}

function FitBounds({ organizations, selectedId, routeActive }: { organizations: MapOrg[]; selectedId?: string | null; routeActive: boolean }) {
  const map = useMap()
  const key = organizations.map((item) => item.id).join('|')
  useEffect(() => {
    const points = organizations
      .filter((item) => typeof item.lat === 'number' && typeof item.lng === 'number')
      .map((item) => [item.lat!, item.lng!] as [number, number])
    if (routeActive || points.length === 0 || selectedId) return
    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 14))
      return
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map, selectedId, routeActive])
  return null
}

function ClickPicker({ onPick }: { onPick: (point: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

export function OrgMap({ center, zoom = 12, organizations, userLocation, selectedId, onSelect, pickMode, onPick, initialPick, route, routeOrigin, routeDestination, fallbackRouteOrigin }: Props) {
  const located = useMemo(() => organizations.filter((item) => typeof item.lat === 'number' && typeof item.lng === 'number'), [organizations])

  return <MapContainer center={[center.lat, center.lng]} zoom={zoom} className="leaflet-map" scrollWheelZoom>
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
    <RouteLayer route={route ?? null} origin={routeOrigin ?? null} destination={routeDestination ?? null} />
    <FlyController center={center} zoom={zoom} selectedId={selectedId} organizations={located} routeActive={Boolean(route)} />
    <FitBounds organizations={located} selectedId={selectedId} routeActive={Boolean(route)} />
    {pickMode && <ClickPicker onPick={onPick!} />}
    {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
      <Popup>Вы здесь</Popup>
    </Marker>}
    {pickMode && initialPick && <Marker position={[initialPick.lat, initialPick.lng]} icon={orgIcon} draggable eventHandlers={{ dragend(event) { const point = event.target.getLatLng(); onPick?.({ lat: point.lat, lng: point.lng }) } }}>
      <Popup>Переместите маркер или нажмите на карту</Popup>
    </Marker>}
    <MarkerClusterGroup chunkedLoading>
    {located.map((item) => <Marker
      key={item.id}
      position={[item.lat!, item.lng!]}
      icon={categoryIcon(item.category)}
      eventHandlers={{ click: () => onSelect?.(item.id) }}
    >
      <Popup>
        <div className="map-popup">
          <strong>{item.name}</strong>
          <span>{item.category}</span>
          <span>{item.address}</span>
          {item.rating !== undefined && <span>★ {item.rating}</span>}
          {item.workingHours && <span>{item.workingHours}</span>}
          {typeof item.distance === 'number' && <span>Расстояние: {formatDistance(item.distance)}</span>}
          {typeof item.activePromotions === 'number' && item.activePromotions > 0 && <span>Активных акций: {item.activePromotions}</span>}
          {typeof item.productCount === 'number' && <span>{item.productCount} товаров · {item.dealCount ?? 0} скидок</span>}
          <div className="map-popup-actions">
            <a href={`/organizations/${item.id}`}>Открыть</a>
            <RouteButton destination={{ lat: item.lat!, lng: item.lng! }} originOverride={userLocation} fallbackOrigin={fallbackRouteOrigin} organizationId={item.id} label="Маршрут" className="map-popup-route" />
          </div>
        </div>
      </Popup>
    </Marker>)}
    </MarkerClusterGroup>
  </MapContainer>
}

export { cityOf, formatDistance, routeUrl }
