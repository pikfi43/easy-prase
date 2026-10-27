import { useEffect, useMemo } from 'react'
import { Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { RouteResult, RoutePoint } from '../lib/RouteService'

export function RouteLayer({ route, origin, destination }: { route: RouteResult | null; origin: RoutePoint | null; destination: RoutePoint | null }) {
  const map = useMap()
  const positions = useMemo(() => route?.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]) ?? [], [route])
  useEffect(() => {
    const bounds = L.latLngBounds([])
    if (origin) bounds.extend([origin.lat, origin.lng])
    if (destination) bounds.extend([destination.lat, destination.lng])
    positions.forEach((point) => bounds.extend(point))
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 })
  }, [map, origin, destination, positions])
  return positions.length > 0 ? <Polyline positions={positions} pathOptions={{ color: '#2563eb', weight: 6, opacity: 0.88 }} /> : null
}
