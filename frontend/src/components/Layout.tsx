import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../api'
import { useData } from '../data'
import { toggleTheme, useTheme } from '../lib/theme'
import { Icon, type IconName } from './Icon'

const navItems: Array<[string, IconName, string]> = [
  ['/', 'home', 'Главная'],
  ['/promotions', 'tag', 'Акции'],
  ['/map', 'map', 'Карта'],
  ['/assistant', 'assistant', 'AI'],
  ['/favorites', 'heart', 'Избранное'],
  ['/profile', 'profile', 'Профиль'],
]

export function AppHeader() {
  const { user } = useAuth()
  const { notificationUnread } = useData()
  const theme = useTheme()
  const navigate = useNavigate()
  const unread = notificationUnread

  return <header className="app-header">
    <Link to="/" className="logo-wrap">
      <i className="logo-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z" />
          <path d="M12 8v6M9.5 11.5 12 14l2.5-2.5" />
        </svg>
      </i>
      <div>
        <strong>EasyPrice</strong>
        <small>Выгодные цены для жителей города</small>
      </div>
    </Link>
    <div className="header-actions">
      <button className="ib theme-button" type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}>
        {theme === 'dark' ? (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
          </svg>
        ) : (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>
          </svg>
        )}
      </button>
      <button className="ib bell-button" type="button" onClick={() => navigate(user ? '/notifications' : '/profile')} aria-label="Уведомления">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>
        </svg>
        {unread > 0 && <span className="bell-badge badge">{unread}</span>}
      </button>
    </div>
  </header>
}

export function BottomNav() {
  return <nav className="bottom-nav">
    {navItems.map(([to, icon, label]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
      <span><Icon name={icon} size={20} /></span>{label}
    </NavLink>)}
  </nav>
}
