import { useMemo, useState } from 'react'
import { Button, Card, Form, Input, Typography, message } from 'antd'
import { initSystem } from '../api'
import { useAuth } from '../auth/AuthContext'

export default function InitPage() {
  const { setSession } = useAuth()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const siteTitle = Form.useWatch('title', form) as string | undefined
  const bingBg = useMemo(() => `/api/public/bing-bg?d=${new Date().toISOString().slice(0, 10)}`, [])

  const onFinish = async (values: { username: string; password: string; title?: string }) => {
    setLoading(true)
    try {
      const res = await initSystem(values)
      setSession(res.data.token, res.data.user)
      message.success('初始化成功')
      window.location.href = '/admin'
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const previewTitle = (siteTitle || '').trim() || '我的导航'

  return (
    <div
      className="auth-page auth-page-bing"
      style={{ ['--auth-bing-bg' as string]: `url("${bingBg}")` }}
    >
      <div className="auth-bing-overlay" aria-hidden />
      <Card className="auth-card" title="首次初始化">
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          设置网站标题与管理员账号。完成后前台将默认使用 Bing 每日壁纸。
        </Typography.Paragraph>
        <div className="init-title-preview" aria-live="polite">
          <span className="init-title-preview-label">网站标题预览</span>
          <strong className="init-title-preview-value">{previewTitle}</strong>
        </div>
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ title: '我的导航' }}>
          <Form.Item
            name="title"
            label="网站标题"
            rules={[{ required: true, message: '请填写网站标题' }, { max: 64, message: '标题过长' }]}
            extra="将显示在前台页头、浏览器标签与后台品牌处"
          >
            <Input placeholder="例如：我的导航" maxLength={64} autoFocus allowClear />
          </Form.Item>
          <Form.Item name="username" label="管理员用户名" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="admin" />
          </Form.Item>
          <Form.Item name="password" label="管理员密码" rules={[{ required: true, min: 6 }]}>
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认密码"
            dependencies={['password']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve()
                  return Promise.reject(new Error('两次密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            完成初始化
          </Button>
        </Form>
      </Card>
    </div>
  )
}
