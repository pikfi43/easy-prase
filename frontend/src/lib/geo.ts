export type LatLng = { lat: number; lng: number }

export const cityCenters: Record<string, LatLng> = {
  'Кокшетау': { lat: 53.2833, lng: 69.3833 },
  'Степногорск': { lat: 52.3500, lng: 70.2000 },
  'Щучинск': { lat: 52.6300, lng: 70.1900 },
  'Атбасар': { lat: 51.8700, lng: 68.3500 },
  'Акколь': { lat: 51.9800, lng: 70.9400 },
  'Ерейментау': { lat: 50.0300, lng: 72.1100 },
  'Есиль': { lat: 51.9700, lng: 66.4200 },
  'Макинск': { lat: 52.6300, lng: 70.4200 },
  'Державинск': { lat: 51.0700, lng: 71.3500 },
}

export const cityOf = (city?: string): LatLng => (city && cityCenters[city]) || cityCenters['Кокшетау']

export const haversineKm = (a: LatLng, b: LatLng) => {
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

export const routeUrl = (from: LatLng | null, to: LatLng) => {
  const origin = from ? `${from.lat},${from.lng}` : ''
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm&route=${origin};${to.lat},${to.lng}`
}

export const formatDistance = (km: number) => (km < 1 ? `${Math.round(km * 1000)} м` : `${km.toFixed(1)} км`)

let lastGeocodeAt = 0
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const query = address.trim()
  if (query.length < 3) return null
  const wait = Math.max(0, 1100 - (Date.now() - lastGeocodeAt))
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
  lastGeocodeAt = Date.now()
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', countrycodes: 'kz' })
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Сервис поиска адреса недоступен (${response.status})`)
  const results = await response.json() as Array<{ lat: string; lon: string }>
  if (!results[0]) return null
  return { lat: Number(results[0].lat), lng: Number(results[0].lon) }
}
