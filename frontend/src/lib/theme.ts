import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'
const themeKey = 'easyprice-theme'

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(themeKey)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    // хранилище недоступно — используем системную тему
  }
  return systemTheme()
}

let current: Theme = readTheme()
const listeners = new Set<() => void>()

function applySideEffects(theme: Theme) {
  document.documentElement.style.colorScheme = theme
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', theme === 'dark' ? '#141210' : '#a8700f')
}

export function getTheme(): Theme {
  return current
}

export function setTheme(theme: Theme) {
  current = theme
  try {
    localStorage.setItem(themeKey, theme)
  } catch {
    // хранилище недоступно — тема применится только на текущую сессию
  }
  applySideEffects(theme)
  listeners.forEach((listener) => listener())
}

export function toggleTheme() {
  setTheme(current === 'dark' ? 'light' : 'dark')
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange)
      return () => { listeners.delete(onStoreChange) }
    },
    getTheme,
  )
}

export function initTheme() {
  applySideEffects(current)
}
