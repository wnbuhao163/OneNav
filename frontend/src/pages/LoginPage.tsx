import { useState } from 'react'
import { Button, Card, Form, Input, Typography, message } from 'antd'
import { Link, useNavigate } from 'react-router-dom'
import { login } from '../api'
import { useAuth } from '../auth/AuthContext'
import { useDisplaySiteTitle } from '../site/SiteContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setSession } = useAuth()
  const siteTitle = useDisplaySiteTitle()
  const [loading, setLoading] = useState(false)

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const res = await login(values)
      setSession(res.data.token, res.data.user)
      message.success('登录成功')
      navigate('/admin', { replace: true })
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <Card className="auth-card" title={`${siteTitle} · 管理员登录`}>
        <Typography.Paragraph type="secondary">登录后可管理分类、链接，并查看私有内容。</Typography.Paragraph>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
            <Input placeholder="用户名" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            登录
          </Button>
        </Form>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Link to="/">返回前台</Link>
        </div>
      </Card>
    </div>
  )
}
