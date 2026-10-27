import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** Ловит падение страницы и показывает дружелюбный экран вместо белого. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('EasyPrice: ошибка отрисовки страницы', error, info.componentStack)
  }

  private reset = () => { this.setState({ error: null }) }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return <div className="error-boundary">
      <span className="error-boundary-icon">🍊</span>
      <h2>Что-то сломалось на этой странице</h2>
      <p>Остальное приложение работает. Попробуйте открыть раздел заново.</p>
      <div className="error-boundary-actions">
        <button type="button" onClick={this.reset}>Открыть заново</button>
        <button type="button" className="secondary" onClick={() => { window.location.href = '/' }}>На главную</button>
      </div>
    </div>
  }
}
