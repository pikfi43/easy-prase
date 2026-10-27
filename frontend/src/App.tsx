import { useLayoutEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import { useAuth } from './api'
import { initTheme, useTheme } from './lib/theme'
import { BottomNav, AppHeader } from './components/Layout'
import { AuthModal } from './components/AuthModal'
import { ErrorBoundary } from './components/ErrorBoundary'
import { HomePage } from './pages/Home'
import { PromotionsPage } from './pages/Promotions'
import { OrganizationDetailPage, OrganizationsPage, PromotionDetailPage } from './pages/Details'
import { MapPage } from './pages/Map'
import { NotificationsPage } from './pages/Notifications'
import { AssistantPage } from './pages/Assistant'
import { FavoritesPage, ProfilePage } from './pages/Profile'
import { AdminPage, CategoriesAdminPage, SupplierPage } from './pages/Business'
import { PriceComparisonPage, ProductDetailPage } from './pages/PriceComparison'
import { ProductsPage } from './pages/Products'
import { SearchPage } from './pages/Search'

export default function App() {
  const { user } = useAuth()
  const theme = useTheme()
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null)
  const location = useLocation()

  useLayoutEffect(() => { initTheme() }, [])
  useLayoutEffect(() => {
    document.querySelector('.page-content')?.scrollTo(0, 0)
  }, [location.pathname, location.search])

  return <main className={theme === 'dark' ? 'site theme-dark' : 'site'}>
    <div className="phone-layout">
      <AppHeader />
      <div className="page-content">
        <ErrorBoundary key={location.pathname}>
          <Routes>
          <Route path="/" element={<HomePage onAuth={setAuthMode} />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/promotions" element={<PromotionsPage />} />
          <Route path="/promotions/:id" element={<PromotionDetailPage />} />
          <Route path="/prices" element={<PriceComparisonPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/organizations" element={<OrganizationsPage />} />
          <Route path="/organizations/:id" element={<OrganizationDetailPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/notifications" element={user ? <NotificationsPage /> : <Navigate to="/profile" replace />} />
          <Route path="/favorites" element={user ? <FavoritesPage /> : <Navigate to="/profile" replace />} />
          <Route path="/profile" element={<ProfilePage onAuth={setAuthMode} />} />
          <Route path="/supplier" element={user ? <SupplierPage /> : <Navigate to="/profile" replace />} />
          <Route path="/admin" element={user ? <AdminPage /> : <Navigate to="/profile" replace />} />
          <Route path="/admin/categories" element={user ? <CategoriesAdminPage /> : <Navigate to="/profile" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </div>
      <BottomNav />
    </div>
    {authMode && <AuthModal mode={authMode} onClose={() => setAuthMode(null)} />}
  </main>
}
