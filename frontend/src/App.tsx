import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ConfigProvider, App as AntApp, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { SiteProvider } from './site/SiteContext'
import { getInitStatus } from './api'
import InitPage from './pages/InitPage'
import LoginPage from './pages/LoginPage'
import PublicPage from './pages/PublicPage'
import AdminLayout from './pages/admin/AdminLayout'
import DashboardPage from './pages/admin/DashboardPage'
import CategoriesPage from './pages/admin/CategoriesPage'
import LinksPage from './pages/admin/LinksPage'
import SettingsPage from './pages/admin/SettingsPage'
import SearchEnginesPage from './pages/admin/SearchEnginesPage'
import ThemesPage from './pages/admin/ThemesPage'

function Bootstrap() {
  const { loading: authLoading } = useAuth()
  const [checking, setChecking] = useState(true)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    getInitStatus()
      .then((res) => setInitialized(res.data.initialized))
      .catch(() => setInitialized(false))
      .finally(() => setChecking(false))
  }, [])

  if (checking || authLoading) {
    return (
      <div className="public-loading">
        <Spin size="large" tip="加载中..." />
      </div>
    )
  }

  if (!initialized) {
    return (
      <Routes>
        <Route path="/init" element={<InitPage />} />
        <Route path="*" element={<Navigate to="/init" replace />} />
      </Routes>
    )
  }

  return (
    <SiteProvider>
      <Routes>
        <Route path="/" element={<PublicPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/init" element={<Navigate to="/login" replace />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="links" element={<LinksPage />} />
          <Route path="bookmark" element={<Navigate to="/admin/links" replace />} />
          <Route path="search-engines" element={<SearchEnginesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="themes" element={<ThemesPage />} />
          <Route path="backup" element={<Navigate to="/admin/settings" replace />} />
          <Route path="ai" element={<Navigate to="/admin" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SiteProvider>
  )
}

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#111827',
          borderRadius: 6,
          controlHeight: 32,
          fontFamily: '"SF Pro Display", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
      }}
    >
      <AntApp>
        <AuthProvider>
          <BrowserRouter>
            <Bootstrap />
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  )
}
