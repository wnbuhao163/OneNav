import { useEffect, useState } from 'react'
import { Button, Col, Row, Spin, Tag, Tooltip } from 'antd'
import {
  AppstoreOutlined,
  EyeOutlined,
  LinkOutlined,
  LockOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  SkinOutlined,
  UnlockOutlined,
} from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { getDashboard } from '../../api'
import { IconRender } from '../../components/IconRender'
import { useAuth } from '../../auth/AuthContext'
import { SITE_TITLE_FALLBACK, useDisplaySiteTitle } from '../../site/SiteContext'

type RecentLink = {
  id: number
  name: string
  url: string
  icon?: string
  icon_url?: string
  private?: boolean
  category_id?: number
  updated_at?: string
}

type DashboardData = {
  category_count: number
  link_count: number
  private_link_count: number
  public_link_count: number
  search_engine_count: number
  search_engine_enabled: number
  site_title?: string
  site_subtitle?: string
  theme?: string
  theme_name?: string
  bg_image_mode?: string
  search_enabled?: boolean
  recent_links?: RecentLink[]
  version?: string
}

const emptyData: DashboardData = {
  category_count: 0,
  link_count: 0,
  private_link_count: 0,
  public_link_count: 0,
  search_engine_count: 0,
  search_engine_enabled: 0,
  recent_links: [],
}

const bgModeLabel: Record<string, string> = {
  none: '纯色渐变',
  custom: '自定义图片',
  bing: 'Bing 壁纸',
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const siteTitle = useDisplaySiteTitle()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData>(emptyData)

  useEffect(() => {
    getDashboard()
      .then((res: any) => setData({ ...emptyData, ...(res.data || {}) }))
      .catch(() => setData(emptyData))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="admin-shell-card dashboard-page dashboard-loading">
        <Spin tip="加载中..." />
      </div>
    )
  }

  const stats = [
    {
      key: 'cat',
      label: '分类',
      value: data.category_count,
      hint: '导航分组',
      icon: <AppstoreOutlined />,
      tone: 'blue',
      to: '/admin/categories',
    },
    {
      key: 'link',
      label: '链接',
      value: data.link_count,
      hint: `公开 ${data.public_link_count} · 私有 ${data.private_link_count}`,
      icon: <LinkOutlined />,
      tone: 'green',
      to: '/admin/links',
    },
    {
      key: 'private',
      label: '私有链接',
      value: data.private_link_count,
      hint: '仅登录可见',
      icon: <LockOutlined />,
      tone: 'slate',
      to: '/admin/links',
    },
    {
      key: 'engine',
      label: '搜索引擎',
      value: data.search_engine_enabled,
      hint: `已启用 / 共 ${data.search_engine_count}`,
      icon: <SearchOutlined />,
      tone: 'amber',
      to: '/admin/search-engines',
    },
  ]

  const shortcuts = [
    { label: '新增链接', desc: '添加一条导航', icon: <PlusOutlined />, to: '/admin/links', primary: true },
    { label: '分类管理', desc: '整理分组结构', icon: <AppstoreOutlined />, to: '/admin/categories' },
    { label: '站点设置', desc: '标题 / LOGO / 背景', icon: <SettingOutlined />, to: '/admin/settings' },
    { label: '主题外观', desc: '切换主题与调色', icon: <SkinOutlined />, to: '/admin/themes' },
  ]

  const recent = data.recent_links || []

  return (
    <div className="dashboard-page">
      <div className="admin-shell-card dashboard-hero">
        <div className="dashboard-hero-text">
          <p className="dashboard-eyebrow">控制台</p>
          <h2>你好，{user?.username || '管理员'}</h2>
          <p className="admin-page-desc">
            {data.site_title || siteTitle || SITE_TITLE_FALLBACK}
            {data.site_subtitle ? ` · ${data.site_subtitle}` : ' · 个人导航站点'}
          </p>
        </div>
        <div className="dashboard-hero-actions">
          <Button icon={<EyeOutlined />} onClick={() => window.open('/', '_blank', 'noopener,noreferrer')} style={{ borderRadius: 6 }}>
            查看前台
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/admin/links')} style={{ borderRadius: 6 }}>
            新增链接
          </Button>
        </div>
      </div>

      <div className="dashboard-stats">
        {stats.map((s) => (
          <button key={s.key} type="button" className={`dashboard-stat is-${s.tone}`} onClick={() => navigate(s.to)}>
            <span className="dashboard-stat-icon">{s.icon}</span>
            <span className="dashboard-stat-meta">
              <span className="dashboard-stat-label">{s.label}</span>
              <strong className="dashboard-stat-value">{s.value}</strong>
              <span className="dashboard-stat-hint">{s.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <Row gutter={[16, 16]} className="dashboard-grid">
        <Col xs={24} lg={14}>
          <div className="admin-shell-card dashboard-panel">
            <div className="dashboard-panel-head">
              <div>
                <h3>快捷入口</h3>
                <p>常用管理操作</p>
              </div>
            </div>
            <div className="dashboard-shortcuts">
              {shortcuts.map((item) => (
                <button
                  key={item.to + item.label}
                  type="button"
                  className={`dashboard-shortcut${item.primary ? ' is-primary' : ''}`}
                  onClick={() => navigate(item.to)}
                >
                  <span className="dashboard-shortcut-icon">{item.icon}</span>
                  <span>
                    <strong>{item.label}</strong>
                    <em>{item.desc}</em>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="admin-shell-card dashboard-panel" style={{ marginTop: 16 }}>
            <div className="dashboard-panel-head">
              <div>
                <h3>最近更新</h3>
                <p>按最近修改的链接</p>
              </div>
              <Link to="/admin/links">查看全部</Link>
            </div>
            {recent.length === 0 ? (
              <div className="dashboard-empty">
                还没有链接。去 <Link to="/admin/links">链接列表</Link> 添加第一条。
              </div>
            ) : (
              <ul className="dashboard-recent">
                {recent.map((item) => (
                  <li key={item.id}>
                    <div className="dashboard-recent-icon">
                      <IconRender value={item.icon_url || item.icon} size={18} fallback={(item.name || '?').slice(0, 1)} />
                    </div>
                    <div className="dashboard-recent-body">
                      <div className="dashboard-recent-title">
                        <strong>{item.name}</strong>
                        {item.private ? (
                          <Tag icon={<LockOutlined />} className="dashboard-mini-tag">
                            私有
                          </Tag>
                        ) : (
                          <Tag icon={<UnlockOutlined />} className="dashboard-mini-tag is-public">
                            公开
                          </Tag>
                        )}
                      </div>
                      <Tooltip title={item.url}>
                        <a href={item.url} target="_blank" rel="noreferrer" className="dashboard-recent-url">
                          {item.url}
                        </a>
                      </Tooltip>
                    </div>
                    <span className="dashboard-recent-time">{item.updated_at || ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Col>

        <Col xs={24} lg={10}>
          <div className="admin-shell-card dashboard-panel">
            <div className="dashboard-panel-head">
              <div>
                <h3>站点状态</h3>
                <p>当前主题与前台配置</p>
              </div>
            </div>
            <div className="dashboard-status-list">
              <div className="dashboard-status-row">
                <span>当前主题</span>
                <strong>{data.theme_name || '系统默认'}</strong>
              </div>
              <div className="dashboard-status-row">
                <span>主题标识</span>
                <code>{data.theme || 'system'}</code>
              </div>
              <div className="dashboard-status-row">
                <span>背景模式</span>
                <strong>{bgModeLabel[data.bg_image_mode || 'none'] || data.bg_image_mode || '纯色渐变'}</strong>
              </div>
              <div className="dashboard-status-row">
                <span>前台搜索</span>
                <strong>{data.search_enabled === false ? '已关闭' : '已开启'}</strong>
              </div>
              <div className="dashboard-status-row">
                <span>启用引擎</span>
                <strong>
                  {data.search_engine_enabled} / {data.search_engine_count}
                </strong>
              </div>
              <div className="dashboard-status-row">
                <span>服务版本</span>
                <code>{data.version || 'dev'}</code>
              </div>
            </div>
            <div className="dashboard-status-actions">
              <Button block onClick={() => navigate('/admin/themes')} style={{ borderRadius: 6 }}>
                管理主题
              </Button>
              <Button block type="primary" onClick={() => navigate('/admin/settings')} style={{ borderRadius: 6 }}>
                站点设置
              </Button>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  )
}
