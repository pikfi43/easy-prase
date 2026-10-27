import { useState, type FormEvent } from 'react'
import { cities, useAuth, userCategories } from '../api'
import { Icon } from './Icon'

export function AuthModal({ mode: initialMode, onClose }: { mode: 'login' | 'register'; onClose: () => void }) {
  const { signIn } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError('')
    setSubmitting(true)
    const result = await signIn({
      mode,
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      role: String(form.get('role') ?? 'user'),
      category: String(form.get('category') ?? 'Обычный житель'),
      city: String(form.get('city') ?? ''),
      phone: String(form.get('phone') ?? ''),
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? 'Не удалось выполнить запрос')
      return
    }
    onClose()
  }

  return <div className="modal-backdrop" onClick={onClose}>
    <form className={`auth-modal ${mode === 'register' ? 'auth-register-modal' : ''}`} onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" type="button" onClick={onClose} aria-label="Закрыть"><Icon name="close" size={18} /></button>
      <span className="auth-kicker">EASYPRICE</span>
      <h2>{mode === 'login' ? 'С возвращением' : 'Создание аккаунта'}</h2>
      <p className="auth-subtitle">{mode === 'login' ? 'Войдите, чтобы находить лучшие предложения рядом' : 'Присоединяйтесь и экономьте в своём городе'}</p>
      {mode === 'register' && <>
        <input name="name" placeholder="Ваше имя" required />
        <select name="city" defaultValue="" required>
          <option value="" disabled>Выберите город</option>
          {cities.map((city) => <option key={city}>{city}</option>)}
        </select>
        <select name="category" defaultValue="Обычный житель">
          {userCategories.map((category) => <option key={category}>{category}</option>)}
        </select>
        <input name="phone" placeholder="Телефон (необязательно)" />
        <fieldset className="role-picker">
          <legend>Выберите роль</legend>
          <label><input type="radio" name="role" value="user" defaultChecked /><span className="role-card"><b><Icon name="profile" size={18} /></b><strong>Пользователь</strong><small>Искать акции и экономить</small></span></label>
          <label><input type="radio" name="role" value="supplier" /><span className="role-card"><b><Icon name="briefcase" size={18} /></b><strong>Поставщик</strong><small>Публиковать предложения бизнеса</small></span></label>
        </fieldset>
      </>}
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" minLength={8} placeholder="Пароль (8+ символов)" required />
      {error && <p className="error-text">{error}</p>}
      <button className="auth-submit" type="submit" disabled={submitting}>{mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
      <button className="auth-switch" type="button" onClick={() => { setError(''); setMode(mode === 'login' ? 'register' : 'login') }}>
        {mode === 'login' ? 'Создать аккаунт' : 'У меня есть аккаунт'}
      </button>
    </form>
  </div>
}
