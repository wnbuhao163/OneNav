import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Spin } from 'antd'
import { Link as RouterLink } from 'react-router-dom'
import { ChevronDown, ChevronUp, Clock3, Flame, Keyboard, Moon, Sun } from 'lucide-react'
import { getPublicNav } from '../api'
import { useAuth } from '../auth/AuthContext'
import { buildThemeVars, type AppearanceSettings } from '../theme/appearance'
import { IconRender } from '../components/IconRender'
import { PublicHeaderMeta } from '../components/PublicHeaderMeta'
import { buildSearchUrl, resolveEngines } from '../search/engines'
import {
  getFrequentVisits,
  getRecentVisits,
  trackVisit,
  type VisitRecord,
} from '../utils/linkVisits'
import { applySiteBrand } from '../utils/siteBrand'
import { SITE_TITLE_FALLBACK } from '../site/SiteContext'

type LinkItem = {
  id: number
  name: string
  url: string
  backup_url?: string
  icon?: string
  icon_url?: string
  description?: string
  private?: boolean
}

type Category = {
  id: number
  name: string
  icon?: string
  private?: boolean
  children?: Category[]
  links?: LinkItem[]
}

type Settings = AppearanceSettings & {
  site_title?: string
  site_logo?: string
  site_subtitle?: string
  search_enabled?: boolean
  search_default?: string
  search_engines?: string
  search_engine_list?: Array<{
    id?: string
    key?: string
    name: string
    group: 'web' | 'content' | 'pan'
    url: string
  }>
}

const DARK_KEY = 'onenav-public-dark'

function readDarkMode() {
  try {
    const saved = localStorage.getItem(DARK_KEY)
    if (saved === '1') return true
    if (saved === '0') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

export default function PublicPage() {
  const { user, token } = useAuth()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<Settings>({})
  const [nav, setNav] = useState<Category[]>([])
  const [keyword, setKeyword] = useState('')
  const [engineId, setEngineId] = useState('baidu')
  const [darkMode, setDarkMode] = useState(false)
  const [visitTick, setVisitTick] = useState(0)
  const [engineMenuOpen, setEngineMenuOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const engineMenuRef = useRef<HTMLDivElement>(null)

  const engines = useMemo(() => resolveEngines(settings), [settings])
  const searchEnabled = settings.search_enabled !== false && engines.length > 0

  const load = async () => {
    setLoading(true)
    try {
      const res: any = await getPublicNav()
      const nextSettings: Settings = res.data.settings || {}
      if (typeof nextSettings.theme === 'string' && nextSettings.theme.startsWith('html:')) {
        const key = nextSettings.theme.slice('html:'.length)
        window.location.replace(`/themes/${key}/index.html`)
        return
      }
      setSettings(nextSettings)
      setNav(res.data.nav || [])
      applySiteBrand({ title: nextSettings.site_title || SITE_TITLE_FALLBACK, logo: nextSettings.site_logo })
      const list = resolveEngines(nextSettings)
      const def = nextSettings.search_default || list[0]?.id
      setEngineId(list.find((e) => e.id === def)?.id || list[0]?.id || 'baidu')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setDarkMode(readDarkMode())
  }, [])

  useEffect(() => {
    void load()
  }, [token])

  useEffect(() => {
    if (!engineMenuOpen) return
    const onPointer = (e: MouseEvent) => {
      if (!engineMenuRef.current?.contains(e.target as Node)) setEngineMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEngineMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [engineMenuOpen])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (e.key === 'Escape') {
        if (keyword) setKeyword('')
        searchInputRef.current?.blur()
        return
      }

      if (typing) return

      if (e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        window.setTimeout(() => searchInputRef.current?.focus(), 0)
        return
      }

      if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setDarkMode((prev) => {
          const next = !prev
          try {
            localStorage.setItem(DARK_KEY, next ? '1' : '0')
          } catch {
            /* ignore */
          }
          return next
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [keyword])

  const toggleDark = () => {
    setDarkMode((prev) => {
      const next = !prev
      try {
        localStorage.setItem(DARK_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const filtered = useMemo(() => {
    if (!keyword.trim()) return nav
    const kw = keyword.trim().toLowerCase()
    const filterCat = (cats: Category[]): Category[] =>
      cats
        .map((c) => {
          const children = filterCat(c.children || [])
          const links = (c.links || []).filter(
            (l) =>
              l.name.toLowerCase().includes(kw) ||
              l.url.toLowerCase().includes(kw) ||
              (l.description || '').toLowerCase().includes(kw),
          )
          const nameHit = c.name.toLowerCase().includes(kw)
          if (!nameHit && links.length === 0 && children.length === 0) return null
          return { ...c, links: nameHit ? c.links : links, children }
        })
        .filter(Boolean) as Category[]
    return filterCat(nav)
  }, [nav, keyword])

  const onExternalSearch = (value?: string) => {
    const q = (value ?? keyword).trim()
    if (!q || !searchEnabled) return
    const engine = engines.find((e) => e.id === engineId) || engines[0]
    if (!engine) return
    window.open(buildSearchUrl(engine, q), '_blank', 'noopener,noreferrer')
  }

  const flatLinks = useMemo(() => {
    const out: LinkItem[] = []
    const walk = (cats: Category[]) => {
      for (const c of cats) {
        out.push(...(c.links || []))
        walk(c.children || [])
      }
    }
    walk(nav)
    return out
  }, [nav])

  const linkMap = useMemo(() => {
    const map = new Map<number, LinkItem>()
    flatLinks.forEach((l) => map.set(l.id, l))
    return map
  }, [flatLinks])

  const recentLinks = useMemo(() => {
    void visitTick
    return getRecentVisits(8)
      .map((v) => linkMap.get(v.id) || visitToLink(v))
      .filter(Boolean) as LinkItem[]
  }, [linkMap, visitTick])

  const frequentLinks = useMemo(() => {
    void visitTick
    return getFrequentVisits(8)
      .map((v) => linkMap.get(v.id) || visitToLink(v))
      .filter(Boolean) as LinkItem[]
  }, [linkMap, visitTick])

  const onLinkOpen = (link: LinkItem, e?: { preventDefault: () => void; shiftKey?: boolean }) => {
    const primary = (link.url || '').trim()
    const backup = (link.backup_url || '').trim()
    const useBackup = (!primary && !!backup) || (!!e?.shiftKey && !!backup)
    const target = useBackup ? backup : primary || backup
    trackVisit({
      id: link.id,
      name: link.name,
      url: primary || backup,
      icon: link.icon,
      icon_url: link.icon_url,
    })
    setVisitTick((n) => n + 1)
    if (e && useBackup && target) {
      e.preventDefault()
      window.open(target, '_blank', 'noopener,noreferrer')
    }
  }

  const themeStyle = useMemo(() => {
    const bg = settings.bg_image
      ? settings.bg_image_mode === 'bing'
        ? `/api/public/bing-bg?d=${new Date().toISOString().slice(0, 10)}`
        : settings.bg_image
      : ''
    const base = buildThemeVars({ ...settings, bg_image: bg }) as CSSProperties
    if (!darkMode) return base
    return {
      ...base,
      ['--nav-surface-bg' as string]: 'rgba(15, 23, 42, 0.62)',
      ['--nav-surface-item-bg' as string]: 'rgba(15, 23, 42, 0.62)',
      ['--nav-surface-border' as string]: 'rgba(148, 163, 184, 0.28)',
      ['--nav-surface-hover' as string]: 'rgba(51, 65, 85, 0.88)',
      ['--nav-glass-bg' as string]: 'rgba(15, 23, 42, 0.62)',
      ['--nav-glass-border' as string]: 'rgba(148, 163, 184, 0.28)',
    }
  }, [settings, darkMode])
  const hasBgImage = Boolean(settings.bg_image)
  const themeClass = `public-page theme-${settings.theme === 'system' || !settings.theme ? 'glass' : settings.theme}${darkMode ? ' is-dark' : ''}${hasBgImage ? ' has-bg-image' : ''}`
  const activeEngine = engines.find((e) => e.id === engineId) || engines[0]

  const visibleCats = useMemo(() => filtered.filter(categoryHasLinks), [filtered])
  const anchors = useMemo(() => collectAnchors(visibleCats), [visibleCats])
  const hasNav = visibleCats.length > 0
  const showQuick = !keyword.trim() && (recentLinks.length > 0 || frequentLinks.length > 0)

  const scrollToCategory = (id: number, el?: HTMLElement | null) => {
    el?.blur()
    const target = document.getElementById(`nav-cat-${id}`)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const scrollToTop = (el?: HTMLElement | null) => {
    el?.blur()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading) {
    return (
      <div className="public-loading">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className={themeClass} style={themeStyle}>
      <div className="public-atmosphere" aria-hidden />
      <div className="public-shell">
        <header className="public-header">
          <div className="brand">
            {settings.site_logo ? (
              <img src={settings.site_logo} alt="" className="logo" />
            ) : (
              <span className="logo-fallback" aria-hidden>
                {(settings.site_title || SITE_TITLE_FALLBACK).slice(0, 1)}
              </span>
            )}
            <div className="brand-text">
              <h1 className="public-title">{settings.site_title || SITE_TITLE_FALLBACK}</h1>
              {settings.site_subtitle ? <p className="public-subtitle">{settings.site_subtitle}</p> : null}
            </div>
          </div>
          <div className="public-header-right">
            <button
              type="button"
              className="public-dark-toggle"
              onClick={toggleDark}
              aria-label={darkMode ? '切换浅色模式' : '切换暗色模式'}
              title={darkMode ? '浅色模式（快捷键 D）' : '暗色模式（快捷键 D）'}
            >
              {darkMode ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
            </button>
            <PublicHeaderMeta />
          </div>
        </header>

        {searchEnabled ? (
          <section className={`public-search-panel public-surface${engineMenuOpen ? ' is-menu-open' : ''}`}>
            <div className="public-search-body">
              <div className="public-search-bar-row">
                <div className="public-search-bar">
                  <div className={`public-search-engine${engineMenuOpen ? ' is-open' : ''}`} ref={engineMenuRef}>
                    <button
                      type="button"
                      className="public-search-engine-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={engineMenuOpen}
                      onClick={() => setEngineMenuOpen((v) => !v)}
                    >
                      <span>{activeEngine?.name || '搜索引擎'}</span>
                      <ChevronDown size={14} strokeWidth={2.4} aria-hidden />
                    </button>
                    {engineMenuOpen ? (
                      <div className="public-search-engine-menu" role="listbox" aria-label="选择搜索引擎">
                        {engines.map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            role="option"
                            aria-selected={engineId === e.id}
                            className={`public-search-engine-option${engineId === e.id ? ' is-active' : ''}`}
                            onClick={() => {
                              setEngineId(e.id)
                              setEngineMenuOpen(false)
                            }}
                          >
                            {e.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <input
                    ref={searchInputRef}
                    className="public-search-input"
                    value={keyword}
                    placeholder={`搜索或筛选 · ${activeEngine?.name || '搜索引擎'}`}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onExternalSearch()
                    }}
                  />
                  {keyword ? (
                    <button type="button" className="public-search-clear" aria-label="清空" onClick={() => setKeyword('')}>
                      ×
                    </button>
                  ) : null}
                  <button type="button" className="public-search-go" onClick={() => onExternalSearch()}>
                    搜索
                  </button>
                </div>
                <div className="public-search-shortcuts" tabIndex={0} aria-label="快捷键：/ 聚焦搜索，Esc 清空，D 切换主题">
                  <Keyboard size={15} strokeWidth={2.2} aria-hidden />
                  <span className="public-search-shortcuts-tip" role="tooltip">
                    <kbd>/</kbd> 聚焦搜索
                    <kbd>Esc</kbd> 清空
                    <kbd>D</kbd> 切换主题
                  </span>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="public-search-panel public-surface">
            <div className="public-search-body">
              <div className="public-search-bar-row">
                <div className="public-search-bar">
                  <input
                    ref={searchInputRef}
                    className="public-search-input"
                    value={keyword}
                    placeholder="筛选本站链接"
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setKeyword(keyword.trim())
                    }}
                  />
                  {keyword ? (
                    <button type="button" className="public-search-clear" aria-label="清空" onClick={() => setKeyword('')}>
                      ×
                    </button>
                  ) : null}
                  <button type="button" className="public-search-go" onClick={() => setKeyword(keyword.trim())}>
                    筛选
                  </button>
                </div>
                <div className="public-search-shortcuts" tabIndex={0} aria-label="快捷键：/ 聚焦搜索，Esc 清空，D 切换主题">
                  <Keyboard size={15} strokeWidth={2.2} aria-hidden />
                  <span className="public-search-shortcuts-tip" role="tooltip">
                    <kbd>/</kbd> 聚焦搜索
                    <kbd>Esc</kbd> 清空
                    <kbd>D</kbd> 切换主题
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        <main className="public-main">
          {showQuick ? (
            <section className="public-quick glass-panel">
              {recentLinks.length > 0 ? (
                <div className="public-quick-block">
                  <header className="public-quick-head">
                    <Clock3 size={15} strokeWidth={2.2} aria-hidden />
                    <h2>最近访问</h2>
                  </header>
                  <div className="public-quick-grid">
                    {recentLinks.map((link) => (
                      <QuickLink key={`recent-${link.id}`} link={link} onOpen={onLinkOpen} />
                    ))}
                  </div>
                </div>
              ) : null}
              {frequentLinks.length > 0 ? (
                <div className="public-quick-block">
                  <header className="public-quick-head">
                    <Flame size={15} strokeWidth={2.2} aria-hidden />
                    <h2>常用</h2>
                  </header>
                  <div className="public-quick-grid">
                    {frequentLinks.map((link) => (
                      <QuickLink key={`freq-${link.id}`} link={link} onOpen={onLinkOpen} />
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {!hasNav ? (
            <div className="glass-panel empty-panel public-empty">
              <h2 className="public-empty-title">还没有可展示的导航</h2>
              <p className="public-empty-desc">
                {keyword.trim()
                  ? '没有匹配的链接，试试换个关键词，或按 Esc 清空筛选。'
                  : user
                    ? '去后台添加分类和链接，或导入浏览器书签，很快就能用起来。'
                    : '登录后可查看私有内容；管理员可在后台添加链接或导入书签。'}
              </p>
              <div className="public-empty-actions">
                {keyword.trim() ? (
                  <button type="button" className="public-empty-btn" onClick={() => setKeyword('')}>
                    清空筛选
                  </button>
                ) : null}
                {user ? (
                  <RouterLink to="/admin/links" className="public-empty-btn is-primary">
                    去管理链接
                  </RouterLink>
                ) : (
                  <RouterLink to="/login" className="public-empty-btn is-primary">
                    登录后台
                  </RouterLink>
                )}
              </div>
              <p className="public-empty-tip">提示：按 / 可快速聚焦搜索框</p>
            </div>
          ) : (
            filtered
              .filter(categoryHasLinks)
              .map((cat, idx) => <CategoryBlock key={cat.id} cat={cat} index={idx} onLinkOpen={onLinkOpen} />)
          )}
        </main>

        <footer className="public-footer">
          <div className="public-footer-admin">
            {user ? (
              <RouterLink to="/admin" className="public-admin-link">
                管理
              </RouterLink>
            ) : (
              <RouterLink to="/login" className="public-admin-link">
                登录
              </RouterLink>
            )}
          </div>
        </footer>
      </div>

      {anchors.length > 0 ? (
        <nav className="nav-anchors" aria-label="分类锚点">
          <div className="nav-anchors-list" role="list">
            {anchors.map((item) => {
              const initial = item.name.slice(0, 1)
              return (
                <button
                  key={item.id}
                  type="button"
                  role="listitem"
                  className={`nav-anchors-item${item.depth > 0 ? ' is-child' : ''}`}
                  onClick={(e) => scrollToCategory(item.id, e.currentTarget)}
                  aria-label={item.name}
                >
                  <span className="nav-anchors-tip">
                    <span className="nav-anchors-tip-text">{item.name}</span>
                  </span>
                  <span className="nav-anchors-sq">
                    {item.icon ? (
                      <IconRender value={item.icon} size={14} fallback={initial} />
                    ) : (
                      <span className="nav-anchors-initial">{initial}</span>
                    )}
                  </span>
                </button>
              )
            })}
            <button
              type="button"
              role="listitem"
              className="nav-anchors-item nav-anchors-top"
              onClick={(e) => scrollToTop(e.currentTarget)}
              aria-label="回到顶部"
            >
              <span className="nav-anchors-tip">
                <span className="nav-anchors-tip-text">TOP</span>
              </span>
              <span className="nav-anchors-sq">
                <ChevronUp size={16} strokeWidth={2.25} aria-hidden />
              </span>
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  )
}

function visitToLink(v: VisitRecord): LinkItem {
  return {
    id: v.id,
    name: v.name,
    url: v.url,
    icon: v.icon,
    icon_url: v.icon_url,
  }
}

function linkHref(link: LinkItem) {
  return (link.url || '').trim() || (link.backup_url || '').trim() || '#'
}

function linkTitle(link: LinkItem) {
  const backup = (link.backup_url || '').trim()
  const base = link.description || link.name
  return backup ? `${base}\n备用链接：Shift+点击打开` : base
}

function QuickLink({
  link,
  onOpen,
}: {
  link: LinkItem
  onOpen: (link: LinkItem, e: { preventDefault: () => void; shiftKey?: boolean }) => void
}) {
  return (
    <a
      className="public-quick-card"
      href={linkHref(link)}
      target="_blank"
      rel="noreferrer"
      title={linkTitle(link)}
      onClick={(e) => onOpen(link, e)}
    >
      <span className="public-quick-icon">
        <IconRender value={link.icon_url || link.icon} size={16} fallback={link.name.slice(0, 1)} />
      </span>
      <span className="public-quick-name">{link.name}</span>
    </a>
  )
}

type AnchorItem = { id: number; name: string; icon?: string; depth: number }

function collectAnchors(cats: Category[], depth = 0): AnchorItem[] {
  const items: AnchorItem[] = []
  for (const c of cats) {
    if (!categoryHasLinks(c)) continue
    items.push({ id: c.id, name: c.name, icon: c.icon, depth })
    items.push(...collectAnchors(c.children || [], depth + 1))
  }
  return items
}

function categoryHasLinks(cat: Category): boolean {
  if ((cat.links || []).length > 0) return true
  return (cat.children || []).some(categoryHasLinks)
}

function CategoryBlock({
  cat,
  index = 0,
  depth = 0,
  onLinkOpen,
}: {
  cat: Category
  index?: number
  depth?: number
  onLinkOpen: (link: LinkItem, e: { preventDefault: () => void; shiftKey?: boolean }) => void
}) {
  if (!categoryHasLinks(cat)) return null

  const visibleChildren = (cat.children || []).filter(categoryHasLinks)

  return (
    <section
      id={`nav-cat-${cat.id}`}
      className={`nav-section${depth > 0 ? ' is-child' : ''}`}
      style={{ animationDelay: `${Math.min(index, 8) * 45 + depth * 30}ms` }}
    >
      <header className="nav-section-title">
        <span className="nav-section-chip">
          {cat.icon ? (
            <span className="nav-section-icon">
              <IconRender value={cat.icon} size={14} fallback="" />
            </span>
          ) : null}
          <h2 className="nav-section-heading">{cat.name}</h2>
        </span>
        <span className="nav-section-line" aria-hidden />
      </header>
      {(cat.links || []).length > 0 ? (
        <div className="nav-grid">
          {(cat.links || []).map((link) => {
            const href = linkHref(link)
            const host = (() => {
              try {
                return new URL(href).hostname.replace(/^www\./, '')
              } catch {
                return ''
              }
            })()
            return (
              <a
                key={link.id}
                className="nav-card"
                href={href}
                target="_blank"
                rel="noreferrer"
                title={linkTitle({ ...link, description: link.description || link.url })}
                onClick={(e) => onLinkOpen(link, e)}
              >
                <span className="nav-card-icon">
                  <IconRender value={link.icon_url || link.icon} size={18} fallback={link.name.slice(0, 1)} />
                </span>
                <span className="nav-card-body">
                  <strong>{link.name}</strong>
                  <em>{link.description || host || link.url}</em>
                </span>
              </a>
            )
          })}
        </div>
      ) : null}
      {visibleChildren.map((child, i) => (
        <CategoryBlock key={child.id} cat={child} index={i} depth={depth + 1} onLinkOpen={onLinkOpen} />
      ))}
    </section>
  )
}
