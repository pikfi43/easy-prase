import { Link, useNavigate } from 'react-router-dom'
import { apiFetch, mediaUrl, useAuth, type Promotion } from '../api'
import { useData } from '../data'
import { Icon } from './Icon'

export const statusLabels: Record<string, string> = {
  draft: 'Черновик',
  pending_review: 'На модерации',
  published: 'Опубликована',
  rejected: 'Отклонена',
  expired: 'Истекла',
}

export function PromotionCard({ item, showStatus = false }: { item: Promotion; showStatus?: boolean }) {
  const { isFavorite, toggleFavorite } = useData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const favorite = isFavorite('promotion', item.id)

  const onFavorite = async () => {
    if (!user) {
      navigate('/profile')
      return
    }
    try {
      await toggleFavorite('promotion', item.id)
    } catch {
      // ignore
    }
  }

  const trackClick = () => {
    if (item.status === 'published') {
      void apiFetch(`/promotions/${item.id}/click`, { method: 'POST' }).catch(() => undefined)
    }
  }

  return <article className="deal-card">
    <div className="deal-photo">
      {item.image ? <img className="deal-photo-img" src={mediaUrl(item.image)} alt={item.title} /> : <span className="deal-emoji">🏷️</span>}
      <span className="deal-discount">{item.value || '−%'}</span>
      <button className="deal-favorite" type="button" onClick={onFavorite} aria-label="В избранное">{favorite ? '♥' : '♡'}</button>
    </div>
    <div className="deal-info">
      <div className="deal-title-row">
        <h3>{item.title}</h3>
        {showStatus && <span className={`status-chip status-${item.status}`}>{statusLabels[item.status] ?? item.status}</span>}
      </div>
      <p>{item.place}</p>
      <small>Действует до {new Date(`${item.endDate}T00:00:00`).toLocaleDateString('ru-RU')}</small>
      <Link className="card-link" to={`/promotions/${item.id}`} onClick={trackClick}>Подробнее →</Link>
    </div>
  </article>
}

export function OrganizationCard({ id, name, category, address, status }: { id: string; name: string; category: string; address: string; status?: string }) {
  const { isFavorite, toggleFavorite } = useData()
  const { user } = useAuth()
  const navigate = useNavigate()
  const favorite = isFavorite('organization', id)

  const onFavorite = async () => {
    if (!user) {
      navigate('/profile')
      return
    }
    try {
      await toggleFavorite('organization', id)
    } catch {
      // ignore
    }
  }

  return <article className="deal-card org-card">
    <div className="deal-photo org-photo">
      <button className="deal-favorite" type="button" onClick={onFavorite} aria-label="В избранное">{favorite ? '♥' : '♡'}</button>
      <span className="deal-emoji">🏬</span>
    </div>
    <div className="deal-info">
      <div className="deal-title-row">
        <h3>{name}</h3>
        {status && status !== 'published' && <span className={`status-chip status-${status}`}>{statusLabels[status] ?? status}</span>}
      </div>
      <p>{category}</p>
      <small>{address}</small>
      <Link className="card-link" to={`/organizations/${id}`}>Карточка →</Link>
    </div>
  </article>
}

export function EmptyState({ text }: { text: string }) {
  return <p className="muted empty-state"><Icon name="search" size={28} />{text}</p>
}
