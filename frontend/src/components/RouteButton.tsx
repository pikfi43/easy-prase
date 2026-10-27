import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildRoute, type RoutePoint } from '../lib/RouteService'
import { apiFetch, useAuth } from '../api'
import { cityOf } from '../lib/geo'

export function RouteButton({ destination, organizationId, label = '🗺 Маршрут', className = 'button-primary', originOverride, fallbackOrigin, onRoute, onError }: { destination: RoutePoint; organizationId?: string; label?: string; className?: string; originOverride?: RoutePoint | null; fallbackOrigin?: RoutePoint; onRoute?: (route: Awaited<ReturnType<typeof buildRoute>>, origin: RoutePoint, originSource: 'selected' | 'city-center' | 'gps') => void; onError?: (message: string) => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async () => {
    setBusy(true); setError(''); onError?.('')
    try {
      const originSource = originOverride ? 'selected' : 'city-center'
      const origin = originOverride ?? fallbackOrigin ?? cityOf(user?.city)
      const route = await buildRoute(origin, destination)
      if (organizationId) void apiFetch(`/organizations/${organizationId}/route`, { method: 'POST' }).catch(() => undefined)
      onError?.('')
      if (onRoute) onRoute(route, origin, originSource)
      else navigate('/map', { state: { route, origin, destination, organizationId, originSource } })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Не удалось построить маршрут'
      setError(message)
      onError?.(message)
    }
    finally { setBusy(false) }
  }
  return <span className="route-button-wrap"><button type="button" className={className} onClick={() => void run()} disabled={busy}>{busy ? 'Строим маршрут…' : label}</button>{error && <small className="error-text">{error}</small>}</span>
}
