import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch, type Category, type EventItem, type FavoriteItem, type NotificationItem, type Organization, type Product, type Promotion, useAuth } from './api'
import { toArray } from './lib/array-response'

type DataContextValue = {
  promotions: Promotion[]
  organizations: Organization[]
  categories: Category[]
  events: EventItem[]
  products: Product[]
  favorites: FavoriteItem[]
  notifications: NotificationItem[]
  notificationUnread: number
  loading: boolean
  error: string
  loadCatalog: () => Promise<void>
  loadFavorites: () => Promise<void>
  loadNotifications: () => Promise<void>
  toggleFavorite: (targetType: FavoriteItem['targetType'], targetId: string) => Promise<void>
  isFavorite: (targetType: FavoriteItem['targetType'], targetId: string) => boolean
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notificationUnread, setNotificationUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const cityQuery = user?.city ? `?city=${encodeURIComponent(user.city)}` : ''
      const [promotionData, organizationData, categoryData, eventData] = await Promise.all([
        apiFetch<{ promotions: Promotion[] }>(`/promotions${cityQuery}`),
        apiFetch<{ organizations: Organization[] }>(`/organizations${cityQuery}`),
        apiFetch<{ categories: Category[] }>('/categories'),
        apiFetch<{ events: EventItem[] }>(`/events${cityQuery}`),
      ])
      const promotionsList = toArray<Promotion>(promotionData?.promotions)
      const organizationsList = toArray<Organization>(organizationData?.organizations)
      const categoriesList = toArray<Category>(categoryData?.categories)
      const eventsList = toArray<EventItem>(eventData?.events)
      const hasInvalidCollection = !Array.isArray(promotionData?.promotions)
        || !Array.isArray(organizationData?.organizations)
        || !Array.isArray(categoryData?.categories)
        || !Array.isArray(eventData?.events)
      setPromotions(promotionsList)
      setOrganizations(organizationsList)
      setCategories(categoriesList)
      setEvents(eventsList)
      if (hasInvalidCollection) setError('Сервер вернул неполный каталог. Проверь подключение и обнови страницу.')
      if (user?.city) {
        const productData = await apiFetch<{ products: Product[] }>(`/products?city=${encodeURIComponent(user.city)}`)
        if (Array.isArray(productData?.products)) setProducts(productData.products)
        else setError('Сервер вернул неполный список товаров. Проверь подключение и обнови страницу.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }, [user?.city])

  const loadFavorites = useCallback(async () => {
    if (!token) {
      setFavorites([])
      return
    }
    try {
      const data = await apiFetch<{ favorites: FavoriteItem[] }>('/favorites')
      setFavorites(toArray<FavoriteItem>(data?.favorites))
    } catch {
      setFavorites([])
    }
  }, [token])

  const loadNotifications = useCallback(async () => {
    if (!token) {
      setNotifications([])
      setNotificationUnread(0)
      return
    }
    try {
      const data = await apiFetch<{ notifications: NotificationItem[]; unread: number }>('/notifications')
      setNotifications(toArray<NotificationItem>(data?.notifications))
      setNotificationUnread(data.unread)
    } catch {
      setNotifications([])
      setNotificationUnread(0)
    }
  }, [token])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  useEffect(() => {
    void loadFavorites()
    void loadNotifications()
  }, [loadFavorites, loadNotifications])

  const toggleFavorite = useCallback(async (targetType: FavoriteItem['targetType'], targetId: string) => {
    if (!token) throw new Error('Войдите, чтобы добавлять объекты в избранное')
    const exists = favorites.some((item) => item.targetType === targetType && item.targetId === targetId)
    if (exists) {
      await apiFetch(`/favorites/${targetType}/${targetId}`, { method: 'DELETE' })
      setFavorites((current) => current.filter((item) => !(item.targetType === targetType && item.targetId === targetId)))
    } else {
      await apiFetch('/favorites', { method: 'POST', body: JSON.stringify({ targetType, targetId }) })
      setFavorites((current) => [...current, { targetType, targetId }])
    }
  }, [favorites, token])

  const isFavorite = useCallback((targetType: FavoriteItem['targetType'], targetId: string) =>
    favorites.some((item) => item.targetType === targetType && item.targetId === targetId), [favorites])

  const value = useMemo(() => ({
    promotions, organizations, categories, events, products, favorites, notifications, notificationUnread, loading, error,
    loadCatalog, loadFavorites, loadNotifications, toggleFavorite, isFavorite,
  }), [promotions, organizations, categories, events, products, favorites, notifications, notificationUnread, loading, error, loadCatalog, loadFavorites, loadNotifications, toggleFavorite, isFavorite])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData must be used within DataProvider')
  return context
}
