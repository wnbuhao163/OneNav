import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getMe } from '../api'

type User = { id: number; username: string } | null

type AuthContextValue = {
  user: User
  token: string | null
  loading: boolean
  setSession: (token: string, user: { id: number; username: string }) => void
  clearSession: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('onenav_token'))
  const [loading, setLoading] = useState(true)

  const clearSession = () => {
    localStorage.removeItem('onenav_token')
    setToken(null)
    setUser(null)
  }

  const setSession = (t: string, u: { id: number; username: string }) => {
    localStorage.setItem('onenav_token', t)
    setToken(t)
    setUser(u)
  }

  const refresh = async () => {
    try {
      // 支持 localStorage Bearer 与 HttpOnly Cookie 两种登录态
      const res = await getMe()
      setUser(res.data)
      const stored = localStorage.getItem('onenav_token')
      if (stored) setToken(stored)
    } catch {
      clearSession()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const value = useMemo(
    () => ({ user, token, loading, setSession, clearSession, refresh }),
    [user, token, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
