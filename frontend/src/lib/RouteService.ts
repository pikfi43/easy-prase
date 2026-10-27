import { apiFetch } from '../api'

export type RoutePoint = { lat: number; lng: number }
export type RouteResult = {
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  distance: number
  duration: number
  steps: Array<{ name: string; distance: number; duration: number; instruction: string }>
}

export function getCurrentPosition(): Promise<RoutePoint> {
  if (!navigator.geolocation) return Promise.reject(new Error('Геолокация недоступна в этом браузере.'))
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
    () => reject(new Error('Не удалось определить GPS. Разрешите геолокацию или выберите точку на карте.')),
    { enableHighAccuracy: true, timeout: 12000 },
  ))
}

export async function buildRoute(from: RoutePoint, to: RoutePoint) {
  const params = new URLSearchParams({ fromLat: String(from.lat), fromLng: String(from.lng), toLat: String(to.lat), toLng: String(to.lng) })
  return apiFetch<RouteResult>(`/routes?${params}`)
}

export const routeDistance = (meters: number) => meters >= 1000 ? `${(meters / 1000).toFixed(1)} км` : `${Math.round(meters)} м`
export const routeDuration = (seconds: number) => {
  const mins = Math.max(1, Math.round(seconds / 60))
  return mins >= 60 ? `${Math.floor(mins / 60)} ч ${mins % 60} мин` : `~${mins} мин`
}
