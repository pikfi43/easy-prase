import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, useAuth } from '../api'
import { useData } from '../data'
import { EmptyState } from '../components/Cards'

export function NotificationsPage() {
  const { user, updateUser } = useAuth()
  const { notifications, loadNotifications } = useData()
  const [saving, setSaving] = useState(false)

  const settings = user?.notificationSettings ?? {}
  const defaults: Record<string, boolean> = {
    newPromotions: true,
    moderationResults: true,
    nearbyPromotions: true,
    personalOffers: true,
    events: false,
    studentDiscounts: true,
    pensionerDiscounts: false,
    recommendations: true,
  }
  const labels: Record<string, string> = {
    newPromotions: 'Новые акции',
    moderationResults: 'Результат модерации',
    nearbyPromotions: 'Предложение рядом',
    personalOffers: 'Персональное предложение',
    events: 'Мероприятия',
    studentDiscounts: 'Скидки для студентов',
    pensionerDiscounts: 'Скидки для пенсионеров',
    recommendations: 'Персональные рекомендации',
  }

  const toggle = async (key: string, value: boolean) => {
    if (!user) return
    const next = { ...defaults, ...settings, [key]: value }
    setSaving(true)
    try {
      await apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify({ notificationSettings: next }) })
      updateUser({ notificationSettings: next })
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  const markRead = async (id: string) => {
    await apiFetch(`/notifications/${id}/read`, { method: 'POST' })
    await loadNotifications()
  }

  const markAllRead = async () => {
    await apiFetch('/notifications/read-all', { method: 'POST' })
    await loadNotifications()
  }

  const unread = notifications.filter((item) => !item.read).length

  if (!user) return <p className="muted">Войдите, чтобы управлять уведомлениями.</p>

  return <>
    <div className="screen-title"><h1>Уведомления</h1></div>
    <section className="notification-page">
      <h2>Что получать?</h2>
      <div className="notification-settings">
        {Object.entries(labels).map(([key, label]) => <label key={key}>
          <span>{label}</span>
          <input type="checkbox" checked={Boolean(settings[key] ?? defaults[key])} disabled={saving} onChange={(event) => void toggle(key, event.target.checked)} />
        </label>)}
      </div>
      <div className="section-head">
        <h2>Входящие {unread > 0 && <span className="status-chip status-pending_review">{unread} новых</span>}</h2>
        {unread > 0 && <button type="button" onClick={() => void markAllRead()}>Прочитать все</button>}
      </div>
      {notifications.length ? notifications.map((item) => <article key={item.id} className={`list-row notification-row ${item.read ? '' : 'unread'}`}>
        <div>
          <strong>{item.title}</strong>
          <small>{item.body}</small>
          <small className="muted small-note">{new Date(item.createdAt).toLocaleString('ru-RU')}</small>
        </div>
        <div className="row-actions">
          {item.link && <Link to={item.link}>Открыть</Link>}
          {!item.read && <button type="button" onClick={() => void markRead(item.id)}>Прочитано</button>}
        </div>
      </article>) : <EmptyState text="Пока нет уведомлений." />}
    </section>
  </>
}
