import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'
import { apiFetch, useAuth, type AssistantResult } from '../api'
import { useData } from '../data'
import { RouteButton } from '../components/RouteButton'

type Message = { role: 'user' | 'assistant'; text: string; results?: AssistantResult[] }

const PROMPT_POOL = [
  'Где недорого поесть рядом?',
  'Сколько стоит iPhone 15?',
  'Что со скидкой сегодня?',
  'Где ближайшая аптека?',
  'Покажи скидки на технику',
  'Где купить хлеб дешевле?',
  'Есть ли скидки для студентов?',
  'Как добавить в избранное?',
  'Как включить GPS?',
  'Как настроить профиль?',
  'Привет, что ты умеешь?',
  'Где купить подарок?',
  'Как поменять город?',
  'Как сравнить цены?',
  'Что за пометка demo у цены?',
  'Как работают уведомления?',
]

const pickPrompts = (count: number) => [...PROMPT_POOL].sort(() => Math.random() - 0.5).slice(0, count)

export function AssistantPage() {
  const { organizations } = useData()
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [voiceLanguage, setVoiceLanguage] = useState('ru-RU')
  const [dealCount, setDealCount] = useState(0)
  const [prompts] = useState(() => pickPrompts(6))
  const chatRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef<string>('')
  if (!sessionIdRef.current) sessionIdRef.current = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`

  useEffect(() => {
    apiFetch<{ total: number }>('/deals').then((data) => setDealCount(data.total)).catch(() => setDealCount(0))
  }, [])

  useEffect(() => {
    const chat = chatRef.current
    if (chat) chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const startVoice = async () => {
    setVoiceError('')
    if (Capacitor.isNativePlatform()) {
      try {
        let permission = await SpeechRecognition.checkPermissions()
        if (permission.speechRecognition !== 'granted') permission = await SpeechRecognition.requestPermissions()
        if (permission.speechRecognition !== 'granted') {
          setVoiceError('Разрешите EasyPrice доступ к микрофону в настройках телефона.')
          return
        }
        const availability = await SpeechRecognition.available()
        if (!availability.available) {
          setVoiceError('На телефоне не включено распознавание речи. Включите голосовой ввод Google в настройках.')
          return
        }
        setListening(true)
        const result = await SpeechRecognition.start({ language: voiceLanguage, maxResults: 1, partialResults: false, popup: true, prompt: 'Спросите о товарах и скидках' })
        const transcript = result.matches?.[0]?.trim()
        if (transcript) setQuery(transcript)
        else setVoiceError('Речь не распознана. Нажмите на микрофон и повторите.')
      } catch {
        setVoiceError('Голосовой ввод не запустился. Проверьте разрешение микрофона и службу распознавания речи.')
      } finally {
        setListening(false)
      }
      return
    }

    const WebSpeechRecognition = (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    if (!WebSpeechRecognition) {
      setVoiceError('Голосовой ввод не поддерживается в этом браузере. Напишите сообщение.')
      return
    }
    const recognition = new (WebSpeechRecognition as new () => {
      lang: string
      interimResults: boolean
      maxAlternatives: number
      onresult: (event: { results: Array<Array<{ transcript: string }>> }) => void
      onerror: () => void
      onend: () => void
      start: () => void
      stop: () => void
    })()
    recognition.lang = voiceLanguage
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const transcript = event.results[0][0]?.transcript ?? ''
      setQuery(transcript)
      setVoiceError('')
    }
    recognition.onerror = () => setVoiceError('Не удалось распознать речь. Проверьте доступ к микрофону и попробуйте ещё раз.')
    recognition.onend = () => setListening(false)
    setListening(true)
    try { recognition.start() } catch { setListening(false); setVoiceError('Браузер не запустил голосовой ввод.') }
  }

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = query.trim()
    if (!text || loading) return
    setMessages((current) => [...current, { role: 'user', text }])
    setLoading(true)
    setQuery('')
    try {
      const needsPosition = /рядом|поблизости|ближайш|недалеко|маршрут|построй/i.test(text)
      const position = needsPosition ? await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        if (!navigator.geolocation) { resolve(null); return }
        navigator.geolocation.getCurrentPosition((value) => resolve({ lat: value.coords.latitude, lng: value.coords.longitude }), () => resolve(null), { timeout: 5000, maximumAge: 60_000 })
      }) : null
      const data = await apiFetch<{ answer: string; results: AssistantResult[] }>('/assistant', {
        method: 'POST',
        body: JSON.stringify({ query: text, sessionId: sessionIdRef.current, city: user?.city, category: user?.category, ...position }),
      })
      setMessages((current) => [...current, { role: 'assistant', text: data.answer, results: data.results }])
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', text: error instanceof Error ? error.message : 'Не удалось связаться с ассистентом.' }])
    } finally {
      setLoading(false)
    }
  }

  const renderResult = (result: AssistantResult) => {
    const to = result.kind === 'organization'
      ? `/organizations/${result.id}`
      : result.kind === 'promotion'
        ? `/promotions/${result.id}`
        : `/products/${result.id}`
    const hasCoords = typeof result.lat === 'number' && typeof result.lng === 'number'
    return <div key={`${result.kind}-${result.id}-${result.organizationId ?? ''}`} className="assistant-result">
      <Link to={to}><strong>{result.title}</strong><small>{result.subtitle}</small></Link>
      <div className="assistant-result-actions">
        {hasCoords && <Link to={`/map?sel=${result.organizationId ?? result.id}`} title="Показать на карте">📍</Link>}
        {hasCoords && <RouteButton destination={{ lat: result.lat!, lng: result.lng! }} organizationId={result.organizationId ?? (result.kind === 'organization' ? result.id : undefined)} label="Маршрут" className="button-secondary" />}
      </div>
    </div>
  }

  return <section className="assistant-page">
    <div className="assistant-page-header">
      <span className="assistant-page-avatar">🤖</span>
      <div><h1>ИИ-ассистент</h1><small><i /> Онлайн</small></div>
      <Link to="/" aria-label="Закрыть">×</Link>
    </div>

    <div className="assistant-chat" ref={chatRef}>
      <div className="assistant-message assistant-message-bot">
        <span className="chat-avatar">🤖</span>
        <div><strong>Здравствуйте!</strong><p>Я ИИ-помощник EasyPrice. Спросите своими словами — «где дешевле кофе», «сколько стоит пылесос», «что со скидкой» — и я поищу в каталоге, сравню цены и покажу маршрут. Отвечаю только по данным каталога, без выдумок.</p></div>
      </div>
      {messages.map((item, index) => <div className={`assistant-message ${item.role === 'user' ? 'assistant-message-user' : 'assistant-message-bot'}`} key={`${item.role}-${index}`}>
        {item.role === 'assistant' && <span className="chat-avatar">🤖</span>}
        <div>
          {item.role === 'assistant' && <strong>EasyPrice</strong>}
          <p style={{ whiteSpace: 'pre-line' }}>{item.text}</p>
          {item.results && item.results.length > 0 && <div className="assistant-results">{item.results.map(renderResult)}</div>}
        </div>
      </div>)}
      {loading && <p className="muted">Ассистент ищет...</p>}
    </div>

    {messages.length === 0 && <div className="assistant-prompts">
      <span>Попробуйте спросить</span>
      <div>
        {prompts.map((prompt) => <button key={prompt} type="button" onClick={() => setQuery(prompt)}>{prompt}</button>)}
      </div>
      <p className="muted small-note">В каталоге сейчас {dealCount} предложений и {organizations.length} организаций. Можно писать и голосом 🎤</p>
    </div>}

    {voiceError && <p className="error-text">{voiceError}</p>}

    <form className="assistant-page-form" onSubmit={send}>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Напишите сообщение..." />
      <select aria-label="Язык голосового ввода" value={voiceLanguage} onChange={(event) => setVoiceLanguage(event.target.value)} disabled={listening}><option value="ru-RU">RU</option><option value="kk-KZ">KK</option><option value="en-US">EN</option></select>
      <button className={`mic-button ${listening ? 'listening' : ''}`} type="button" aria-label="Голосовой ввод" onClick={startVoice} disabled={loading}>
        {listening ? '●' : '🎤'}
      </button>
      <button className="assistant-send" type="submit" aria-label="Отправить" disabled={loading}>➤</button>
    </form>
  </section>
}
