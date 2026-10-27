import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Role = 'user' | 'supplier' | 'admin'
export type User = {
  id: string
  name: string
  email: string
  role: Role
  category: string
  city: string
  phone: string
  notificationSettings: Record<string, boolean>
}

export type Organization = {
  id: string
  name: string
  category: string
  description: string
  address: string
  addressText?: string
  city: string
  lat?: number
  lng?: number
  phone?: string
  website?: string
  workingHours?: string
  aliases?: string[]
  ratingAverage?: number
  ratingCount?: number
  verifiedOwnerId?: string
  photos?: string[]
  ownerId: string
  status: 'pending_review' | 'published' | 'rejected' | 'blocked'
  rejectReason?: string
  osmId?: string
  osmType?: 'node' | 'way' | 'relation'
  source?: 'supplier' | 'osm' | 'imported'
  verified?: boolean
  businessType?: string
  bin?: string
  email?: string
  legalName?: string
  legalAddress?: string
  representativeName?: string
  representativePosition?: string
  verificationStatus?: string
}

export type Promotion = {
  id: string
  title: string
  description: string
  organizationId?: string
  place: string
  categoryId: string
  category?: string
  type: string
  value: string
  oldPrice?: number
  newPrice?: number
  discountSize?: number
  promoCode?: string
  image?: string
  startDate: string
  endDate: string
  ownerId: string
  status: 'draft' | 'pending_review' | 'published' | 'rejected' | 'expired'
  rejectReason?: string
  city: string
  views?: number
  clicks?: number
}

export type NotificationItem = { id: string; title: string; body: string; kind: string; read: boolean; createdAt: string; link?: string }
export type Product = { id: string; organizationId?: string; title: string; description: string; price: number; oldPrice?: number; categoryId: string; image?: string; city: string; status: string; brand?: string; model?: string; source?: string; sourceCity?: string; cityVerified?: boolean; demo?: boolean; externalUrl?: string; fetchedAt?: string }
export type Category = { id: string; title: string; kind: string; slug: string }
export type EventItem = { id: string; title: string; description: string; date: string; address: string }
export type FavoriteItem = { targetType: 'organization' | 'promotion' | 'product'; targetId: string }
export type AssistantResult = { kind: 'organization' | 'promotion' | 'product'; id: string; title: string; subtitle: string; lat?: number; lng?: number; organizationId?: string; distanceKm?: number }

const defaultApiUrl = (() => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  const { hostname, protocol } = window.location
  // Веб-версия, открытая с ноутбука по сети (телефон сканирует QR):
  // API берём на том же хосте, порт 3000 — адрес вводить вручную не нужно.
  if (protocol === 'http:' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:3000/api`
  }
  return 'http://localhost:3000/api'
})()

export const apiUrl = defaultApiUrl
const apiUrlStorageKey = 'easyprice-server-url'

export function getApiUrl() {
  try {
    return localStorage.getItem(apiUrlStorageKey) || apiUrl
  } catch {
    return apiUrl
  }
}

export function saveApiUrl(value: string) {
  const parsed = new URL(value.trim())
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Используйте адрес, начинающийся с http:// или https://')
  }
  const path = parsed.pathname.replace(/\/+$/, '')
  if (path && path !== '/api') {
    throw new Error('Укажите только адрес сервера, например http://192.168.1.25:3000')
  }
  const normalized = `${parsed.origin}${path || '/api'}`
  try {
    localStorage.setItem(apiUrlStorageKey, normalized)
  } catch {
    throw new Error('Не удалось сохранить адрес сервера на этом устройстве')
  }
  return normalized
}

export function resetApiUrl() {
  try {
    localStorage.removeItem(apiUrlStorageKey)
  } catch {
    // ignore storage failures
  }
}

export const mediaUrl = (url: string) => url.startsWith('/uploads/') ? `${getApiUrl().replace(/\/api\/?$/, '')}${url}` : url

export const cities = ['Кокшетау', 'Степногорск', 'Щучинск', 'Атбасар', 'Акколь', 'Ерейментау', 'Есиль', 'Макинск', 'Державинск']
export const userCategories = ['Обычный житель', 'Студент', 'Молодёжь', 'Пенсионер', 'Семья']

type AuthContextValue = {
  user: User | null
  token: string | null
  signIn: (payload: { mode: 'login' | 'register'; name?: string; email: string; password: string; role?: string; category?: string; city?: string; phone?: string }) => Promise<{ ok: boolean; error?: string }>
  signOut: () => void
  updateUser: (patch: Partial<User>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const tokenStorageKey = 'easyprice-token'

const readStoredToken = () => {
  try {
    return localStorage.getItem(tokenStorageKey)
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredToken())
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    if (!token) {
      setUser(null)
      return
    }
    let cancelled = false
    fetch(`${getApiUrl()}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('session'))))
      .then((data: { user: User }) => {
        if (!cancelled) setUser(data.user)
      })
      .catch(() => {
        if (!cancelled) {
          try {
            localStorage.removeItem(tokenStorageKey)
          } catch {
            // ignore
          }
          setToken(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const signIn = useCallback(async (payload: { mode: 'login' | 'register'; name?: string; email: string; password: string; role?: string; category?: string; city?: string; phone?: string }) => {
    const body = payload.mode === 'login'
      ? { email: payload.email, password: payload.password }
      : { name: payload.name, email: payload.email, password: payload.password, role: payload.role, category: payload.category, city: payload.city, phone: payload.phone }
    try {
      const response = await fetch(`${getApiUrl()}/auth/${payload.mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json() as { token?: string; user?: User; error?: string }
      if (!response.ok || !data.token || !data.user) return { ok: false, error: data.error ?? 'Не удалось выполнить запрос' }
      try {
        localStorage.setItem(tokenStorageKey, data.token)
      } catch {
        // ignore
      }
      setToken(data.token)
      setUser(data.user)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Сервер недоступен. Запустите backend и повторите попытку.' }
    }
  }, [])

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(tokenStorageKey)
    } catch {
      // ignore
    }
    setToken(null)
    setUser(null)
  }, [])

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((current) => (current ? { ...current, ...patch } : current))
  }, [])

  const value = useMemo(() => ({ user, token, signIn, signOut, updateUser }), [user, token, signIn, signOut, updateUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = readStoredToken()
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers: Record<string, string> = { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...((options.headers as Record<string, string>) ?? {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${getApiUrl()}${path}`, { ...options, headers })
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(data.error ?? `Ошибка запроса (${response.status})`)
  return data
}
