import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './api'
import { DataProvider } from './data'

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
        console.warn('EasyPrice service worker registration failed', error)
      })
    })
  } else {
    void navigator.serviceWorker.getRegistrations().then((registrations) =>
      Promise.all(
        registrations
          .filter((registration) => {
            const scope = new URL(registration.scope)
            return scope.origin === window.location.origin && scope.pathname === '/'
          })
          .map((registration) => registration.unregister()),
      ),
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
