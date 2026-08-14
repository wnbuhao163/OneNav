import { useEffect, useMemo, useState } from 'react'
import { Layout, Menu, Typography, Button, Dropdown } from 'antd'
import {
  AppstoreOutlined,
  DashboardOutlined,
  LinkOutlined,
  LogoutOutlined,
  SearchOutlined,
  SettingOutlined,
  SkinOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { useDisplaySiteTitle } from '../../site/SiteContext'

const { Header, Sider, Content, Footer } = Layout

const menuItems = [
  { key: '/admin', icon: <DashboardOutlined />, label: '概览' },
  { key: '/admin/categories', icon: <AppstoreOutlined />, label: '分类列表' },
  { key: '/admin/links', icon: <LinkOutlined />, label: '链接列表' },
  { key: '/admin/search-engines', icon: <SearchOutlined />, label: '搜索引擎' },
  { key: '/admin/settings', icon: <SettingOutlined />, label: '站点设置' },
  { key: '/admin/themes', icon: <SkinOutlined />, label: '主题列表' },
]

function shortBrand(title: string, collapsed: boolean) {
  const t = title.trim()
  if (!collapsed) return t
  if (!t) return '站'
  // 折叠侧栏：取前两个字符（中文/英文都适用）
  return Array.from(t).slice(0, 2).join('')
}

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, clearSession } = useAuth()
  const siteTitle = useDisplaySiteTitle()
  const [collapsed, setCollapsed] = useState(false)

  const selected = useMemo(() => {
    const hit = [...menuItems].reverse().find((m) => location.pathname.startsWith(m.key))
    return [hit?.key || '/admin']
  }, [location.pathname])

  useEffect(() => {
    if (!user) navigate('/login', { replace: true })
  }, [user, navigate])

  const onLogout = async () => {
    try {
      await logout()
    } catch {
      // ignore
    }
    clearSession()
    navigate('/login')
  }

  return (
    <Layout className="admin-layout">
      <Sider
        className="admin-sider"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
      >
        <div className="admin-logo" title={siteTitle}>
          {shortBrand(siteTitle, collapsed)}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selected}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout className="admin-layout-right">
        <Header className="admin-header">
          <Typography.Title level={5} style={{ margin: 0, letterSpacing: '-0.02em' }}>
            后台管理
          </Typography.Title>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link to="/" target="_blank" rel="noreferrer">
              查看前台
            </Link>
            <Dropdown
              menu={{
                items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: onLogout }],
              }}
            >
              <Button icon={<UserOutlined />} style={{ borderRadius: 6 }}>
                {user?.username || '管理员'}
              </Button>
            </Dropdown>
          </div>
        </Header>
        <Content className="admin-main">
          <Outlet />
        </Content>
        <Footer className="admin-footer">
          {siteTitle} · 管理后台 © {new Date().getFullYear()} · 有建议请发送邮件: wnbuhao@live.com
        </Footer>
      </Layout>
    </Layout>
  )
}
