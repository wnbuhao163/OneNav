import { useEffect, useState } from 'react'
import {
  Button,
  Col,
  Form,
  Image,
  Input,
  Radio,
  Row,
  Select,
  Spin,
  Switch,
  Upload,
  message,
} from 'antd'
import { DownloadOutlined, InboxOutlined, UploadOutlined, WarningOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import {
  exportBackup,
  getSearchEngines,
  getSettings,
  restoreBackup,
  updateSettings,
  uploadBackground,
  uploadIcon,
} from '../../api'
import { applySiteBrand } from '../../utils/siteBrand'
import { useSite } from '../../site/SiteContext'

function LogoUpload({
  value,
  onChange,
}: {
  value?: string
  onChange?: (v: string) => void
}) {
  const [uploading, setUploading] = useState(false)

  return (
    <div className="settings-logo-field">
      <div className="settings-logo-preview">
        {value ? <img src={value} alt="logo" /> : <span>暂无</span>}
      </div>
      <div className="settings-logo-meta">
        <strong>{value ? '当前 LOGO' : '上传 LOGO'}</strong>
        <span>{value || '支持 png / jpg / webp / svg，最大 2MB'}</span>
      </div>
      <div className="settings-logo-actions">
        {value ? <Button onClick={() => onChange?.('')}>清除</Button> : null}
        <Upload
          accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.ico"
          showUploadList={false}
          disabled={uploading}
          customRequest={async ({ file, onSuccess, onError }) => {
            setUploading(true)
            try {
              const res: any = await uploadIcon(file as File)
              onChange?.(res.data.url)
              message.success('上传成功')
              onSuccess?.(res.data)
            } catch (e) {
              message.error((e as Error).message)
              onError?.(e as Error)
            } finally {
              setUploading(false)
            }
          }}
        >
          <Button type="primary" loading={uploading} icon={<InboxOutlined />}>
            {value ? '更换' : '上传'}
          </Button>
        </Upload>
      </div>
    </div>
  )
}

type BgMode = 'none' | 'custom' | 'bing'

function BgImageField() {
  const form = Form.useFormInstance()
  const mode = (Form.useWatch('bg_image_mode', form) as BgMode) || 'none'
  const bgImage = (Form.useWatch('bg_image', form) as string) || ''
  const [uploading, setUploading] = useState(false)
  const [bingPreview, setBingPreview] = useState('')
  const [bingLoading, setBingLoading] = useState(false)

  useEffect(() => {
    if (mode !== 'bing') {
      setBingPreview('')
      setBingLoading(false)
      return
    }
    let cancelled = false
    setBingLoading(true)
    // 优先同源代理；失败再取直链，避免旧后端无接口时预览空白
    const probe = (src: string) =>
      new Promise<string>((resolve, reject) => {
        const img = new window.Image()
        img.onload = () => resolve(src)
        img.onerror = () => reject(new Error('load failed'))
        img.src = `${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`
      })

    ;(async () => {
      try {
        // 同源代理直接出图；加日期避免旧缓存
        const day = new Date().toISOString().slice(0, 10)
        const src = `/api/public/bing-bg?d=${day}`
        await probe(src)
        if (!cancelled) setBingPreview(src)
      } catch {
        if (!cancelled) {
          setBingPreview('')
          message.warning('Bing 壁纸预览失败：请确认后端已重启')
        }
      } finally {
        if (!cancelled) setBingLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mode])

  const previewSrc = mode === 'bing' ? bingPreview : mode === 'custom' ? bgImage : ''

  return (
    <div className="settings-bg-field">
      <div className={`settings-bg-preview${previewSrc ? ' has-image' : ''}`}>
        {mode === 'bing' && bingLoading ? (
          <Spin size="small" />
        ) : previewSrc ? (
          <Image
            src={previewSrc}
            alt="背景预览"
            className="settings-bg-preview-img"
            preview={{ mask: '点击放大' }}
          />
        ) : (
          <span>{mode === 'none' ? '纯色渐变' : mode === 'bing' ? '暂无预览' : '暂无背景图'}</span>
        )}
      </div>
      <div className="settings-bg-meta">
        <strong>前台页面背景图</strong>
        <span>可选择纯色渐变、自定义上传，或使用 Bing 每日壁纸（自动更新）。</span>
        <Form.Item name="bg_image_mode" style={{ marginBottom: 10 }}>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: '纯色渐变', value: 'none' },
              { label: '自定义', value: 'custom' },
              { label: 'Bing 壁纸', value: 'bing' },
            ]}
          />
        </Form.Item>
        {mode === 'custom' ? (
          <>
            <Form.Item name="bg_image" style={{ marginBottom: 10 }}>
              <Input placeholder="https://... 或 /uploads/..." allowClear />
            </Form.Item>
            <div className="settings-bg-actions">
              {bgImage ? (
                <Button
                  onClick={() => {
                    form.setFieldValue('bg_image', '')
                  }}
                >
                  清除
                </Button>
              ) : null}
              <Upload
                accept=".png,.jpg,.jpeg,.gif,.webp"
                showUploadList={false}
                disabled={uploading}
                customRequest={async ({ file, onSuccess, onError }) => {
                  setUploading(true)
                  try {
                    const res: any = await uploadBackground(file as File)
                    form.setFieldValue('bg_image', res.data.url)
                    form.setFieldValue('bg_image_mode', 'custom')
                    message.success('背景图已上传')
                    onSuccess?.(res.data)
                  } catch (e) {
                    message.error((e as Error).message)
                    onError?.(e as Error)
                  } finally {
                    setUploading(false)
                  }
                }}
              >
                <Button type="primary" loading={uploading} icon={<InboxOutlined />}>
                  {bgImage ? '更换图片' : '上传图片'}
                </Button>
              </Upload>
            </div>
          </>
        ) : null}
        {mode === 'bing' ? (
          <div className="settings-bg-bing-tip">每日自动拉取 Bing 首页壁纸，前台打开时生效（服务端缓存约 6 小时）。</div>
        ) : null}
        {mode === 'none' ? (
          <div className="settings-bg-bing-tip">使用主题配色中的渐变背景，不叠加图片。</div>
        ) : null}
      </div>
    </div>
  )
}

function SwitchRow({
  value,
  onChange,
  title,
  desc,
}: {
  value?: boolean
  onChange?: (v: boolean) => void
  title: string
  desc: string
}) {
  return (
    <div className="admin-switch-row">
      <div>
        <strong>{title}</strong>
        <span>{desc}</span>
      </div>
      <Switch checked={!!value} onChange={onChange} />
    </div>
  )
}

function BackupSection() {
  const [exporting, setExporting] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const onExport = async () => {
    setExporting(true)
    try {
      const { blob, filename } = await exportBackup()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      message.success('备份已下载')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="admin-shell-card settings-backup-card">
      <div className="admin-page-header">
        <div>
          <h2>数据备份</h2>
          <p className="admin-page-desc">导出或恢复完整站点备份（数据库 + 上传文件 + 主题）</p>
        </div>
      </div>
      <div className="backup-tip">
        <WarningOutlined />
        <div>
          <strong>注意</strong>
          <p>
            推荐使用 <strong>.zip</strong> 完整备份（含数据库、uploads、自定义主题）。仍兼容旧版仅数据库的 .db。恢复会覆盖当前数据且不可撤销，完成后请刷新页面。
          </p>
        </div>
      </div>
      <div className="backup-cards">
        <div className="backup-card">
          <div className="backup-card-icon export">
            <DownloadOutlined />
          </div>
          <div className="backup-card-body">
            <strong>导出备份</strong>
            <p>下载 .zip 完整备份到本地</p>
          </div>
          <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={onExport} style={{ borderRadius: 6 }}>
            导出
          </Button>
        </div>
        <div className="backup-card">
          <div className="backup-card-icon restore">
            <UploadOutlined />
          </div>
          <div className="backup-card-body">
            <strong>恢复备份</strong>
            <p>上传 .zip 或 .db，覆盖当前数据</p>
          </div>
          <Upload
            accept=".zip,.db"
            showUploadList={false}
            beforeUpload={async (file) => {
              setRestoring(true)
              try {
                await restoreBackup(file)
                message.success('恢复成功，请刷新页面')
              } catch (e) {
                message.error((e as Error).message)
              } finally {
                setRestoring(false)
              }
              return false
            }}
          >
            <Button icon={<UploadOutlined />} loading={restoring} style={{ borderRadius: 6 }}>
              恢复
            </Button>
          </Upload>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [form] = Form.useForm()
  const { setSiteMeta } = useSite()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabledEngines, setEnabledEngines] = useState<{ id: string; name: string }[]>([])
  const searchEnabled = Form.useWatch('search_enabled', form)

  useEffect(() => {
    Promise.all([getSettings(), getSearchEngines()])
      .then(([settingRes, engineRes]: any[]) => {
        const data = settingRes.data || {}
        const list = (engineRes.data?.list || [])
          .filter((e: any) => e.enabled)
          .map((e: any) => ({ id: e.engine_key || e.key, name: e.name }))
        setEnabledEngines(list)
        const def = data.search_default || list[0]?.id || 'baidu'
        form.setFieldsValue({
          ...data,
          search_enabled: data.search_enabled !== false,
          search_default: list.some((e: { id: string }) => e.id === def) ? def : list[0]?.id,
          bg_image_mode: data.bg_image_mode || (data.bg_image ? 'custom' : 'none'),
          bg_image: data.bg_image || '',
        })
      })
      .catch((e) => message.error(e.message))
      .finally(() => setLoading(false))
  }, [form])

  const onSave = async () => {
    const values = await form.validateFields()
    let searchDefault = values.search_default
    if (searchDefault && !enabledEngines.some((e) => e.id === searchDefault)) {
      searchDefault = enabledEngines[0]?.id
    }
    setSaving(true)
    try {
      const current: any = await getSettings()
      await updateSettings({
        ...(current.data || {}),
        ...values,
        bg_image_mode: values.bg_image_mode || 'none',
        bg_image: values.bg_image || '',
        search_default: searchDefault,
        // 启用列表由「搜索引擎」页维护，这里同步保留当前启用 key，避免被空值覆盖
        search_engines: enabledEngines.map((e) => e.id).join(',') || current.data?.search_engines,
      })
      applySiteBrand({ title: values.site_title, logo: values.site_logo })
      setSiteMeta({ title: values.site_title, logo: values.site_logo })
      message.success('已保存')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-shell-card settings-page settings-loading">
        <Spin tip="加载中..." />
      </div>
    )
  }

  return (
    <div className="settings-page">
      <div className="admin-shell-card settings-main-card">
        <div className="admin-page-header">
          <div>
            <h2>站点设置</h2>
            <p className="admin-page-desc">配置网站信息、前台背景与搜索</p>
          </div>
        </div>

        <Form form={form} layout="vertical" className="admin-form settings-form" requiredMark={false}>
          <div className="admin-form-block">
            <div className="admin-form-block-title">基础信息</div>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item name="site_title" label="网站标题" rules={[{ required: true, message: '请输入网站标题' }]}>
                  <Input placeholder="例如：我的导航" maxLength={128} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="site_subtitle" label="副标题">
                  <Input placeholder="简短一句话描述站点" maxLength={256} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="site_keywords" hidden>
              <Input />
            </Form.Item>
            <Form.Item name="site_description" hidden>
              <Input />
            </Form.Item>
            <Form.Item
              name="site_logo"
              label="网站 LOGO"
              extra="显示在前台页头；若已设置，浏览器标签页图标（favicon）会使用同一张图"
            >
              <LogoUpload />
            </Form.Item>
            <Form.Item
              label="前台背景图"
              extra="显示在前台页面背景层，保存后刷新前台即可看到效果"
              style={{ marginBottom: 0 }}
            >
              <BgImageField />
            </Form.Item>
          </div>

          <div className="admin-form-block">
            <div className="admin-form-block-title">搜索配置</div>
            <Form.Item name="search_enabled" style={{ marginBottom: 12 }}>
              <SwitchRow title="启用前台搜索" desc="开启后，前台显示搜索框；具体引擎请到「搜索引擎」页管理" />
            </Form.Item>
            {searchEnabled ? (
              <>
                <Form.Item name="search_default" label="默认搜索引擎">
                  <Select
                    options={enabledEngines.map((e) => ({ value: e.id, label: e.name }))}
                    placeholder={enabledEngines.length ? '请选择默认引擎' : '请先在搜索引擎页启用至少一个'}
                    disabled={!enabledEngines.length}
                  />
                </Form.Item>
                <div className="settings-bg-bing-tip" style={{ marginBottom: 0 }}>
                  网页 / 内容 / 网盘引擎的增删与启用，请前往{' '}
                  <Link to="/admin/search-engines">搜索引擎</Link> 管理。
                </div>
              </>
            ) : null}
          </div>

          <div className="settings-actions">
            <Button type="primary" loading={saving} onClick={onSave} style={{ borderRadius: 6 }}>
              保存设置
            </Button>
          </div>
        </Form>
      </div>

      <BackupSection />
    </div>
  )
}
