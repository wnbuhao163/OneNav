import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getPublicSettings } from '../api'
import { applySiteBrand } from '../utils/siteBrand'

type SiteContextValue = {
  siteTitle: string
  siteLogo: string
  loading: boolean
  refresh: () => Promise<void>
  setSiteMeta: (meta: { title?: string; logo?: string }) => void
}

const SiteContext = createContext<SiteContextValue | null>(null)

/** 无标题时的界面兜底（不用产品名硬编码） */
export const SITE_TITLE_FALLBACK = '站点'

export function SiteProvider({ children }: { children: ReactNode }) {
  const [siteTitle, setSiteTitle] = useState('')
  const [siteLogo, setSiteLogo] = useState('')
  const [loading, setLoading] = useState(true)

  const applyMeta = useCallback((title?: string | null, logo?: string | null) => {
    const nextTitle = String(title || '').trim()
    const nextLogo = String(logo || '').trim()
    setSiteTitle(nextTitle)
    setSiteLogo(nextLogo)
    applySiteBrand({ title: nextTitle || SITE_TITLE_FALLBACK, logo: nextLogo })
  }, [])

  const refresh = useCallback(async () => {
    try {
      const res: any = await getPublicSettings()
      applyMeta(res.data?.site_title, res.data?.site_logo)
    } catch {
      // 未初始化等
    } finally {
      setLoading(false)
    }
  }, [applyMeta])

  const setSiteMeta = useCallback(
    (meta: { title?: string; logo?: string }) => {
      applyMeta(meta.title ?? siteTitle, meta.logo ?? siteLogo)
    },
    [applyMeta, siteTitle, siteLogo],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ siteTitle, siteLogo, loading, refresh, setSiteMeta }),
    [siteTitle, siteLogo, loading, refresh, setSiteMeta],
  )

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

export function useSite() {
  const ctx = useContext(SiteContext)
  if (!ctx) throw new Error('useSite must be used within SiteProvider')
  return ctx
}

/** 展示用网站标题（已配置则用配置，否则兜底） */
export function useDisplaySiteTitle() {
  const { siteTitle } = useSite()
  return siteTitle || SITE_TITLE_FALLBACK
}
