import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Button,
  Checkbox,
  Col,
  ColorPicker,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Slider,
  Space,
  Tabs,
  Tag,
  Upload,
  message,
  Spin,
} from 'antd'
import {
  CheckCircleFilled,
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
  LockOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  SettingOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  applyTheme,
  deleteHtmlTheme,
  generateThemeWithAIStream,
  getSettings,
  getThemeAIConfig,
  getThemeGuide,
  getThemes,
  testThemeAIConfig,
  updateSettings,
  updateThemeAIConfig,
  uploadHtmlTheme,
  type ThemeAIChatMessage,
  type ThemeAIGeneratedTheme,
  type ThemeAIValidation,
} from '../../api'
import ThemeGuideView, { buildGuideCopyAll, parseThemeGuide } from '../../components/ThemeGuideView'
import { buildThemeVars, defaultAppearance, type AppearanceSettings } from '../../theme/appearance'
import { useDisplaySiteTitle } from '../../site/SiteContext'

type ThemeItem = {
  key: string
  name: string
  description?: string
  type?: 'system' | 'html' | 'builtin'
  locked?: boolean
  fs_key?: string
  preview_url?: string
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value?: string
  onChange: (hex: string) => void
}) {
  const hex = value || '#000000'
  return (
    <Form.Item label={label} className="themes-color-field">
      <div className="themes-color-control">
        <ColorPicker value={hex} onChange={(_, h) => onChange(h)} size="small" />
        <Input value={hex} onChange={(e) => onChange(e.target.value)} />
        <span className="themes-color-swatch" style={{ background: hex }} />
      </div>
    </Form.Item>
  )
}

function isHtmlTheme(key?: string) {
  return !!key && key.startsWith('html:')
}

function isSystemTheme(key?: string) {
  return !key || key === 'system' || ['glass', 'default', 'dark', 'card'].includes(key)
}

const AI_QUICK_PROMPTS = [
  '做一个深色玻璃拟态导航，大图标卡片，页脚要有管理入口',
  '极简浅色主题，左侧分类、右侧链接网格，留白多一点',
  '科技感深蓝渐变背景，顶栏搜索 + 分类标签切换',
  '请输出完整可运行的 index.html（含 applyAppearance）',
]

export default function ThemesPage() {
  const siteTitle = useDisplaySiteTitle()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [uploadDesc, setUploadDesc] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [systemTheme, setSystemTheme] = useState<ThemeItem | null>(null)
  const [custom, setCustom] = useState<ThemeItem[]>([])
  const [current, setCurrent] = useState('system')
  const [frontendUrl, setFrontendUrl] = useState('/')
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideTitle, setGuideTitle] = useState('HTML 主题开发说明')
  const [guideMarkdown, setGuideMarkdown] = useState('')
  const [guideLoading, setGuideLoading] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiTab, setAiTab] = useState('chat')
  const [aiBase, setAiBase] = useState('')
  const [aiKey, setAiKey] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiKeySet, setAiKeySet] = useState(false)
  const [aiConfigSaving, setAiConfigSaving] = useState(false)
  const [aiChat, setAiChat] = useState<ThemeAIChatMessage[]>([])
  const [aiInput, setAiInput] = useState('')
  const [aiThemeName, setAiThemeName] = useState('')
  const [aiBaseThemeKey, setAiBaseThemeKey] = useState<string | undefined>()
  const [aiOverwrite, setAiOverwrite] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiTesting, setAiTesting] = useState(false)
  const [aiLastTheme, setAiLastTheme] = useState<ThemeAIGeneratedTheme | null>(null)
  const [aiLastValidation, setAiLastValidation] = useState<ThemeAIValidation | null>(null)
  const aiAbortRef = useRef<AbortController | null>(null)
  const aiChatEndRef = useRef<HTMLDivElement | null>(null)
  const [iframeTick, setIframeTick] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [form] = Form.useForm<AppearanceSettings>()
  const watched = Form.useWatch([], form) as AppearanceSettings | undefined
  const htmlActive = isHtmlTheme(current)
  const systemActive = isSystemTheme(current)

  const activeHtmlTheme = useMemo(
    () => custom.find((t) => t.key === current) || null,
    [custom, current],
  )

  const htmlPreviewSrc = useMemo(() => {
    if (!htmlActive) return ''
    return activeHtmlTheme?.preview_url || frontendUrl || '/'
  }, [htmlActive, activeHtmlTheme, frontendUrl])

  const load = async () => {
    setLoading(true)
    try {
      const [themeRes, settingRes]: any[] = await Promise.all([getThemes(), getSettings()])
      setSystemTheme(themeRes.data.system || null)
      setCustom(themeRes.data.custom || [])
      setCurrent(themeRes.data.current || 'system')
      setFrontendUrl(themeRes.data.frontend_url || '/')
      const data = settingRes.data || {}
      form.setFieldsValue({
        ...defaultAppearance,
        theme: data.theme || 'system',
        primary_color: data.primary_color || defaultAppearance.primary_color,
        accent_color: data.accent_color || defaultAppearance.accent_color,
        bg_color: data.bg_color || defaultAppearance.bg_color,
        bg_color_end: data.bg_color_end || defaultAppearance.bg_color_end,
        text_color: data.text_color || defaultAppearance.text_color,
        muted_color: data.muted_color || defaultAppearance.muted_color,
        bg_image: data.bg_image || '',
        bg_image_mode: data.bg_image_mode || (data.bg_image ? 'custom' : 'none'),
        glass_opacity: data.glass_opacity ?? defaultAppearance.glass_opacity,
        glass_blur: data.glass_blur ?? defaultAppearance.glass_blur,
        glass_saturate: data.glass_saturate ?? defaultAppearance.glass_saturate,
        header_opacity: data.header_opacity ?? defaultAppearance.header_opacity,
      })
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const previewBgSrc = useMemo(() => {
    const mode = (watched?.bg_image_mode || 'none') as string
    if (mode === 'bing') {
      return `/api/public/bing-bg?d=${new Date().toISOString().slice(0, 10)}`
    }
    if (mode === 'none') return ''
    return (watched?.bg_image || '').trim()
  }, [watched?.bg_image, watched?.bg_image_mode])

  const previewVars = useMemo(
    () =>
      buildThemeVars({
        ...defaultAppearance,
        ...watched,
        theme: current,
        bg_image: previewBgSrc,
      }),
    [watched, current, previewBgSrc],
  )

  const hasPreviewBg = Boolean(previewBgSrc)

  const draftAppearance = useMemo(
    () =>
      ({
        ...defaultAppearance,
        ...watched,
        theme: current,
        bg_image: previewBgSrc,
        bg_image_mode: watched?.bg_image_mode || defaultAppearance.bg_image_mode,
      }) as AppearanceSettings,
    [watched, current, previewBgSrc],
  )

  const pushAppearanceIntoIframe = () => {
    const iframe = iframeRef.current
    if (!iframe || !htmlActive) return
    try {
      const doc = iframe.contentDocument
      const win = iframe.contentWindow as (Window & { applyAppearance?: (s: AppearanceSettings) => void }) | null
      if (!doc?.documentElement || !win) return
      const vars = buildThemeVars(draftAppearance)
      Object.entries(vars).forEach(([key, value]) => {
        doc.documentElement.style.setProperty(key, value)
      })
      if (draftAppearance.bg_image) {
        doc.body?.classList.add('has-bg-image')
      } else {
        doc.body?.classList.remove('has-bg-image')
      }
      if (typeof win.applyAppearance === 'function') {
        win.applyAppearance(draftAppearance)
      }
    } catch {
      // 跨域或主题未就绪时忽略
    }
  }

  useEffect(() => {
    if (!htmlActive) return
    pushAppearanceIntoIframe()
  }, [htmlActive, draftAppearance, iframeTick])

  const reloadHtmlPreview = () => setIframeTick((n) => n + 1)

  const onApply = async (key: string) => {
    try {
      const res: any = await applyTheme(key)
      message.success('已切换为当前主题')
      const next = res.data.theme || key
      setCurrent(next)
      setFrontendUrl(res.data.frontend_url || '/')
      const a = res.data.appearance
      if (a && !isHtmlTheme(next)) {
        form.setFieldsValue({
          theme: a.theme,
          primary_color: a.primary_color,
          accent_color: a.accent_color,
          bg_color: a.bg_color,
          bg_color_end: a.bg_color_end,
          text_color: a.text_color,
          muted_color: a.muted_color,
          glass_opacity: a.glass_opacity,
          glass_blur: a.glass_blur,
          glass_saturate: a.glass_saturate,
          header_opacity: a.header_opacity,
        })
      }
      if (isHtmlTheme(next)) reloadHtmlPreview()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const onSave = async () => {
    const appearance = await form.validateFields()
    setSaving(true)
    try {
      const currentSettings: any = await getSettings()
      await updateSettings({
        ...currentSettings.data,
        ...appearance,
        theme: systemActive ? 'system' : current,
      })
      message.success('外观已保存，打开前台即可看到效果')
      if (htmlActive) reloadHtmlPreview()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const openFrontend = (url?: string) => {
    window.open(url || frontendUrl || '/', '_blank', 'noopener,noreferrer')
  }

  const openGuide = async () => {
    setGuideOpen(true)
    if (guideMarkdown) return
    setGuideLoading(true)
    try {
      const res = await getThemeGuide()
      setGuideTitle(res.data.title || 'HTML 主题开发说明')
      setGuideMarkdown(res.data.markdown || '')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setGuideLoading(false)
    }
  }

  const copyGuide = async () => {
    const text = buildGuideCopyAll(parseThemeGuide(guideMarkdown))
    try {
      await navigator.clipboard.writeText(text)
      message.success('已复制说明（已排除示例段），可粘贴给 AI')
    } catch {
      message.error('复制失败，请手动选择文本')
    }
  }

  const onDelete = (item: ThemeItem) => {
    Modal.confirm({
      title: `删除主题「${item.name}」？`,
      content: '删除后不可恢复。若正在使用，将自动切回内置主题。',
      okText: '删除',
      okButtonProps: { danger: true },
      className: 'admin-modal',
      centered: true,
      onOk: async () => {
        try {
          await deleteHtmlTheme(item.fs_key || item.key.replace(/^html:/, ''))
          message.success('已删除')
          await load()
        } catch (e) {
          message.error((e as Error).message)
        }
      },
    })
  }

  const openUploadModal = () => {
    setUploadName('')
    setUploadDesc('')
    setUploadFile(null)
    setUploadOpen(true)
  }

  const openAIModal = async () => {
    setAiOpen(true)
    setAiKey('')
    try {
      const res = await getThemeAIConfig()
      setAiBase(res.data.ai_api_base || '')
      setAiModel(res.data.ai_model || '')
      setAiKeySet(!!res.data.ai_api_key_set)
      setAiTab(res.data.ai_api_base && res.data.ai_model && res.data.ai_api_key_set ? 'chat' : 'config')
    } catch (e) {
      message.error((e as Error).message)
      setAiTab('config')
    }
  }

  const saveAIConfig = async () => {
    const base = aiBase.trim()
    const model = aiModel.trim()
    if (!base || !model) {
      message.warning('请填写 API Base URL 与模型名')
      return
    }
    if (!aiKey.trim() && !aiKeySet) {
      message.warning('请填写 API Key')
      return
    }
    setAiConfigSaving(true)
    try {
      const res = await updateThemeAIConfig({
        ai_api_base: base,
        ai_model: model,
        ai_api_key: aiKey.trim() || undefined,
      })
      setAiBase(res.data.ai_api_base || base)
      setAiModel(res.data.ai_model || model)
      setAiKeySet(!!res.data.ai_api_key_set)
      setAiKey('')
      message.success('AI 配置已保存')
      setAiTab('chat')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setAiConfigSaving(false)
    }
  }

  const testAIConfig = async () => {
    setAiTesting(true)
    try {
      const res = await testThemeAIConfig({
        ai_api_base: aiBase.trim() || undefined,
        ai_model: aiModel.trim() || undefined,
        ai_api_key: aiKey.trim() || undefined,
      })
      message.success(res.data.hint || '连通成功')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setAiTesting(false)
    }
  }

  const cancelAIChat = () => {
    aiAbortRef.current?.abort()
    aiAbortRef.current = null
    setAiGenerating(false)
  }

  const sendAIChat = async (preset?: string) => {
    const text = (preset ?? aiInput).trim()
    if (!text) {
      message.warning('请描述你想要的主题')
      return
    }
    if (!aiBase.trim() || !aiModel.trim() || !aiKeySet) {
      message.warning('请先完成 AI 接口配置')
      setAiTab('config')
      return
    }
    if (aiOverwrite && !aiBaseThemeKey) {
      message.warning('覆盖保存需要先选择要微调的主题')
      return
    }

    const history = aiChat.slice(-8)
    if (!preset) setAiInput('')
    setAiChat((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    setAiGenerating(true)
    setAiLastTheme(null)
    setAiLastValidation(null)

    const controller = new AbortController()
    aiAbortRef.current = controller

    try {
      const done = await generateThemeWithAIStream(
        {
          message: text,
          history,
          name: aiThemeName.trim() || undefined,
          base_theme_key: aiBaseThemeKey,
          overwrite: aiOverwrite,
        },
        {
          signal: controller.signal,
          onDelta: (chunk) => {
            setAiChat((prev) => {
              if (!prev.length) return prev
              const next = [...prev]
              const last = next[next.length - 1]
              if (last?.role !== 'assistant') return prev
              next[next.length - 1] = { role: 'assistant', content: last.content + chunk }
              return next
            })
            requestAnimationFrame(() => aiChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }))
          },
        },
      )

      setAiChat((prev) => {
        if (!prev.length) return prev
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = { role: 'assistant', content: done.reply || last.content }
        }
        return next
      })

      if (done.validation) setAiLastValidation(done.validation)
      if (done.theme?.key) {
        setAiLastTheme(done.theme)
        message.success(done.hint || `已生成主题：${done.theme.name}`)
        await load()
        if (done.theme.overwritten) {
          setAiBaseThemeKey(done.theme.key)
        }
      } else if (done.hint) {
        message.info(done.hint)
      }
      requestAnimationFrame(() => aiChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }))
    } catch (e) {
      const err = e as Error
      if (err.name === 'AbortError' || /abort|取消/i.test(err.message)) {
        message.info('已取消生成')
        setAiChat((prev) => {
          if (!prev.length) return prev
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant' && !last.content.trim()) {
            next[next.length - 1] = { role: 'assistant', content: '（已取消）' }
          }
          return next
        })
      } else {
        message.error(err.message)
        setAiChat((prev) => {
          if (!prev.length) return [...prev, { role: 'assistant', content: `调用失败：${err.message}` }]
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') {
            next[next.length - 1] = {
              role: 'assistant',
              content: last.content.trim() ? `${last.content}\n\n调用失败：${err.message}` : `调用失败：${err.message}`,
            }
          } else {
            next.push({ role: 'assistant', content: `调用失败：${err.message}` })
          }
          return next
        })
      }
    } finally {
      aiAbortRef.current = null
      setAiGenerating(false)
    }
  }

  const applyAIGeneratedTheme = async (theme: ThemeAIGeneratedTheme) => {
    try {
      const res: any = await applyTheme(theme.key)
      setCurrent(res.data.theme || theme.key)
      setFrontendUrl(res.data.frontend_url || theme.preview_url || '/')
      message.success(`已启用「${theme.name}」`)
      await load()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const submitUpload = async () => {
    if (!uploadFile) {
      message.warning('请选择 index.html 或 ZIP 主题包')
      return
    }
    const name = uploadName.trim()
    if (!name) {
      message.warning('请填写主题名称')
      return
    }
    setUploading(true)
    try {
      const res = await uploadHtmlTheme(uploadFile, {
        name,
        description: uploadDesc.trim() || undefined,
      })
      message.success(`已上传：${res.data.name}`)
      setUploadOpen(false)
      await load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const systemDesc =
    systemTheme?.description ||
    '内置 React 前台，可在下方调整颜色与玻璃效果。删除自定义主题时会自动回退到此项。'

  if (loading) {
    return (
      <div className="themes-page themes-loading admin-shell-card">
        <Spin tip="加载中..." />
      </div>
    )
  }

  return (
    <div className="themes-page admin-shell-card">
      <div className="admin-page-header themes-header">
        <div>
          <h2>主题列表</h2>
          <p className="admin-page-desc">切换系统默认或自定义 HTML 主题，并统一调整站点配色与玻璃效果</p>
        </div>
        <Space wrap size={8}>
          <Button icon={<EyeOutlined />} onClick={() => openFrontend()} style={{ borderRadius: 6 }}>
            查看前台
          </Button>
          <Button icon={<QuestionCircleOutlined />} onClick={() => void openGuide()} style={{ borderRadius: 6 }}>
            AI 要求文档
          </Button>
          <Button icon={<RobotOutlined />} onClick={() => void openAIModal()} style={{ borderRadius: 6 }}>
            AI 生成主题
          </Button>
          <Button type="primary" icon={<UploadOutlined />} onClick={openUploadModal} style={{ borderRadius: 6 }}>
            上传主题
          </Button>
        </Space>
      </div>

      <section className="themes-section">
        <div className="themes-section-title">
          <h3>可选主题</h3>
          <span>系统默认不可删除；自定义主题支持 index.html / ZIP</span>
        </div>

        <div className="themes-grid">
          <article className={`theme-tile is-system ${systemActive ? 'is-current' : ''}`}>
            <div
              className="theme-tile-preview"
              style={
                {
                  '--p': watched?.primary_color || defaultAppearance.primary_color,
                  '--a': watched?.accent_color || defaultAppearance.accent_color,
                  '--s': watched?.bg_color || defaultAppearance.bg_color,
                  '--e': watched?.bg_color_end || defaultAppearance.bg_color_end,
                } as CSSProperties
              }
            >
              <div className="theme-tile-preview-glass" />
              <div className="theme-tile-preview-bar" />
              <div className="theme-tile-preview-cards">
                <span />
                <span />
                <span />
              </div>
              {systemActive ? (
                <span className="theme-tile-badge">
                  <CheckCircleFilled /> 当前使用
                </span>
              ) : null}
            </div>
            <div className="theme-tile-body">
              <div className="theme-tile-head">
                <strong>{systemTheme?.name || '系统默认'}</strong>
                <Tag icon={<LockOutlined />}>内置</Tag>
              </div>
              <p className="theme-tile-desc">{systemDesc}</p>
              <div className="theme-tile-actions">
                <Button size="small" icon={<EyeOutlined />} onClick={() => openFrontend('/')}>
                  查看
                </Button>
                <Button
                  size="small"
                  type={systemActive ? 'default' : 'primary'}
                  disabled={systemActive}
                  onClick={() => void onApply('system')}
                >
                  {systemActive ? '使用中' : '使用'}
                </Button>
              </div>
            </div>
          </article>

          {custom.map((t) => {
            const active = current === t.key
            return (
              <article key={t.key} className={`theme-tile is-html ${active ? 'is-current' : ''}`}>
                <div className="theme-tile-preview is-html">
                  <div className="theme-tile-preview-code">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="theme-tile-preview-html">index.html</div>
                  {active ? (
                    <span className="theme-tile-badge">
                      <CheckCircleFilled /> 当前使用
                    </span>
                  ) : null}
                </div>
                <div className="theme-tile-body">
                  <div className="theme-tile-head">
                    <strong>{t.name}</strong>
                    <Tag color="processing">HTML</Tag>
                  </div>
                  <p className="theme-tile-desc">{t.description || '上传的前台主题包'}</p>
                  {t.preview_url ? <div className="theme-tile-meta">{t.preview_url}</div> : null}
                  <div className="theme-tile-actions">
                    <Button size="small" icon={<EyeOutlined />} onClick={() => openFrontend(t.preview_url)}>
                      预览
                    </Button>
                    <Button
                      size="small"
                      type={active ? 'default' : 'primary'}
                      disabled={active}
                      onClick={() => void onApply(t.key)}
                    >
                      {active ? '使用中' : '使用'}
                    </Button>
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(t)} />
                  </div>
                </div>
              </article>
            )
          })}

          {custom.length === 0 ? (
            <button type="button" className="theme-tile theme-tile-empty" onClick={openUploadModal}>
              <UploadOutlined className="theme-tile-empty-icon" />
              <strong>上传自定义主题</strong>
              <span>可先复制「AI 要求文档」生成 index.html / ZIP 后再上传</span>
            </button>
          ) : null}
        </div>
      </section>

      {htmlActive ? (
        <div className="themes-html-tip">
          当前使用自定义 HTML 主题。下方调色会写入站点设置；主题若按「AI 要求文档」读取外观字段，前台会同步生效。
        </div>
      ) : null}

      <div className="themes-appearance">
        <div className="themes-appearance-main">
          <div className="admin-page-header themes-appearance-header">
            <div>
              <h2>站点外观调色</h2>
              <p className="admin-page-desc">
                系统默认与兼容的自定义主题共用同一套色值
                {systemActive ? ' · 作用于系统默认' : ' · 作用于兼容自定义主题'}
              </p>
            </div>
          </div>

          <Form form={form} layout="vertical" className="admin-form themes-form" initialValues={defaultAppearance}>
            <div className="admin-form-block">
              <div className="admin-form-block-title">颜色</div>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="primary_color" noStyle>
                    <Input type="hidden" />
                  </Form.Item>
                  <ColorField
                    label="主色"
                    value={watched?.primary_color}
                    onChange={(hex) => form.setFieldValue('primary_color', hex)}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="accent_color" noStyle>
                    <Input type="hidden" />
                  </Form.Item>
                  <ColorField
                    label="强调色"
                    value={watched?.accent_color}
                    onChange={(hex) => form.setFieldValue('accent_color', hex)}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="bg_color" noStyle>
                    <Input type="hidden" />
                  </Form.Item>
                  <ColorField
                    label="背景起始色"
                    value={watched?.bg_color}
                    onChange={(hex) => form.setFieldValue('bg_color', hex)}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="bg_color_end" noStyle>
                    <Input type="hidden" />
                  </Form.Item>
                  <ColorField
                    label="背景结束色"
                    value={watched?.bg_color_end}
                    onChange={(hex) => form.setFieldValue('bg_color_end', hex)}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="text_color" noStyle>
                    <Input type="hidden" />
                  </Form.Item>
                  <ColorField
                    label="文字色（含分类标题）"
                    value={watched?.text_color}
                    onChange={(hex) => form.setFieldValue('text_color', hex)}
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="muted_color" noStyle>
                    <Input type="hidden" />
                  </Form.Item>
                  <ColorField
                    label="次要文字色"
                    value={watched?.muted_color}
                    onChange={(hex) => form.setFieldValue('muted_color', hex)}
                  />
                </Col>
              </Row>
              <Form.Item name="bg_image_mode" hidden>
                <Input />
              </Form.Item>
              <Form.Item
                name="bg_image"
                label="背景图 URL（可选）"
                extra="完整模式（纯色 / 自定义上传 / Bing）请到「站点设置」配置"
                style={{ marginBottom: 0 }}
              >
                <Input
                  placeholder="https://... 或 /uploads/..."
                  onChange={(e) => {
                    if (e.target.value.trim()) {
                      form.setFieldValue('bg_image_mode', 'custom')
                    }
                  }}
                />
              </Form.Item>
            </div>

            <div className="admin-form-block">
              <div className="admin-form-block-title">玻璃效果</div>
              <Form.Item name="glass_opacity" label={`卡片玻璃透明度 ${watched?.glass_opacity ?? 42}%`}>
                <Slider min={8} max={90} />
              </Form.Item>
              <Form.Item name="header_opacity" label={`顶栏透明度 ${watched?.header_opacity ?? 55}%`}>
                <Slider min={10} max={95} />
              </Form.Item>
              <Form.Item name="glass_blur" label={`模糊程度 ${watched?.glass_blur ?? 28}px`}>
                <Slider min={4} max={60} />
              </Form.Item>
              <Form.Item
                name="glass_saturate"
                label={`饱和度 ${watched?.glass_saturate ?? 180}%`}
                style={{ marginBottom: 0 }}
              >
                <Slider min={100} max={220} />
              </Form.Item>
            </div>

            <div className="themes-appearance-actions">
              <Button type="primary" loading={saving} onClick={() => void onSave()} style={{ borderRadius: 6 }}>
                保存外观
              </Button>
            </div>
          </Form>
        </div>

        <aside className="themes-appearance-preview">
          <div className="themes-preview-card">
            <div className="themes-preview-card-head">
              <strong>实时预览</strong>
              <Space size={8}>
                {htmlActive ? (
                  <Button
                    type="text"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={reloadHtmlPreview}
                    title="刷新主题预览"
                  />
                ) : null}
                <Tag color={htmlActive ? 'processing' : 'blue'}>
                  {htmlActive ? activeHtmlTheme?.name || '自定义主题' : '系统默认'}
                </Tag>
              </Space>
            </div>

            {htmlActive && htmlPreviewSrc ? (
              <div className="theme-preview-iframe-wrap">
                <iframe
                  key={`${htmlPreviewSrc}-${iframeTick}`}
                  ref={iframeRef}
                  className="theme-preview-iframe"
                  title="自定义主题实时预览"
                  src={`${htmlPreviewSrc}${htmlPreviewSrc.includes('?') ? '&' : '?'}preview=1&t=${iframeTick}`}
                  onLoad={pushAppearanceIntoIframe}
                />
              </div>
            ) : (
              <div
                className={`theme-preview${hasPreviewBg ? ' has-bg-image' : ''}`}
                style={previewVars as CSSProperties}
                data-mode="system"
              >
                <div className="theme-preview-bg" />
                <div className="theme-preview-content">
                  <div className="theme-preview-header">
                    <div className="theme-preview-brand">
                      <span className="theme-preview-logo">{Array.from(siteTitle).slice(0, 1).join('') || '站'}</span>
                      <div>
                        <div className="theme-preview-brand-name">{siteTitle}</div>
                        <div className="theme-preview-brand-sub">外观色值预览</div>
                      </div>
                    </div>
                    <span className="theme-preview-pill">主色</span>
                  </div>

                  <div className="theme-preview-search">
                    <span className="theme-preview-search-dot" />
                    <span>搜索网站、文档或工具…</span>
                  </div>

                  <div className="theme-preview-cat">常用导航</div>
                  <div className="theme-preview-grid">
                    <div className="theme-preview-card">
                      <div className="theme-preview-icon">G</div>
                      <div>
                        <div className="theme-preview-title">GitHub</div>
                        <div className="theme-preview-desc">代码托管与协作</div>
                      </div>
                    </div>
                    <div className="theme-preview-card">
                      <div className="theme-preview-icon">D</div>
                      <div>
                        <div className="theme-preview-title">Docs</div>
                        <div className="theme-preview-desc">项目文档入口</div>
                      </div>
                    </div>
                    <div className="theme-preview-card is-accent">
                      <div className="theme-preview-icon">A</div>
                      <div>
                        <div className="theme-preview-title">AI 助手</div>
                        <div className="theme-preview-desc">强调色点缀示例</div>
                      </div>
                    </div>
                  </div>

                  <div className="theme-preview-tokens">
                    <span style={{ background: 'var(--nav-primary)' }} title="primary" />
                    <span style={{ background: 'var(--nav-accent)' }} title="accent" />
                    <span style={{ background: 'var(--nav-bg-start)' }} title="bg start" />
                    <span style={{ background: 'var(--nav-bg-end)' }} title="bg end" />
                    <span style={{ background: 'var(--nav-text)' }} title="text" />
                    <span style={{ background: 'var(--nav-muted)' }} title="muted" />
                  </div>
                </div>
              </div>
            )}

            <div className="theme-preview-foot">
              <span>
                {htmlActive
                  ? '预览为当前自定义主题。拖动色值会即时注入 CSS 变量；保存后可点刷新同步接口数据。'
                  : '预览接近系统默认前台效果。保存后打开站点首页查看。'}
              </span>
              <Button type="link" size="small" onClick={() => openFrontend()}>
                打开前台
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <Modal
        className="admin-modal"
        title={
          <div>
            <div>上传主题</div>
            <div className="admin-modal-subtitle">支持 index.html / .htm，或含 css、js 的 ZIP（≤50MB）</div>
          </div>
        }
        open={uploadOpen}
        onCancel={() => !uploading && setUploadOpen(false)}
        onOk={() => void submitUpload()}
        okText="开始上传"
        confirmLoading={uploading}
        destroyOnClose
        centered
      >
        <div className="theme-upload-form admin-form">
          <label>
            主题名称 <em>*</em>
          </label>
          <Input
            value={uploadName}
            placeholder="例如：数据中台导航"
            maxLength={64}
            onChange={(e) => setUploadName(e.target.value)}
          />
          <label>描述（可选）</label>
          <Input.TextArea
            value={uploadDesc}
            placeholder="简要说明主题风格或来源"
            rows={2}
            maxLength={200}
            onChange={(e) => setUploadDesc(e.target.value)}
          />
          <label>
            主题文件 <em>*</em>
          </label>
          <Upload.Dragger
            accept=".html,.htm,.zip"
            maxCount={1}
            beforeUpload={(file) => {
              setUploadFile(file)
              if (!uploadName.trim()) {
                const base = file.name.replace(/\.(html?|zip)$/i, '')
                if (base && !/^index$/i.test(base)) setUploadName(base)
              }
              return false
            }}
            onRemove={() => setUploadFile(null)}
            fileList={
              uploadFile
                ? [
                    {
                      uid: '-1',
                      name: uploadFile.name,
                      status: 'done',
                    },
                  ]
                : []
            }
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽上传</p>
            <p className="ant-upload-hint">单文件 index.html，或完整 ZIP 主题包</p>
          </Upload.Dragger>
        </div>
      </Modal>

      <Modal
        className="theme-ai-modal admin-modal"
        title={
          <div>
            <div>AI 生成主题</div>
            <div className="admin-modal-subtitle">
              OpenAI 兼容接口 · 流式生成 · 支持基于现有主题微调
            </div>
          </div>
        }
        open={aiOpen}
        onCancel={() => {
          if (aiGenerating) cancelAIChat()
          if (!aiConfigSaving) setAiOpen(false)
        }}
        width={760}
        centered
        destroyOnClose={false}
        footer={null}
        styles={{
          body: {
            maxHeight: 'calc(100vh - 200px)',
            overflow: 'hidden',
            paddingTop: 4,
            paddingBottom: 8,
          },
        }}
      >
        <Tabs
          activeKey={aiTab}
          onChange={setAiTab}
          items={[
            {
              key: 'config',
              label: (
                <span>
                  <SettingOutlined /> 接口配置
                </span>
              ),
              children: (
                <div className="theme-ai-config theme-upload-form admin-form">
                  <label>
                    API Base URL <em>*</em>
                  </label>
                  <Input
                    value={aiBase}
                    placeholder="例如 https://api.openai.com/v1 或 https://api.deepseek.com/v1"
                    onChange={(e) => setAiBase(e.target.value)}
                  />
                  <label>
                    API Key <em>*</em>
                  </label>
                  <Input.Password
                    value={aiKey}
                    placeholder={aiKeySet ? '已保存，留空表示不修改' : 'sk-... 或供应商提供的 Key'}
                    onChange={(e) => setAiKey(e.target.value)}
                    autoComplete="off"
                  />
                  <label>
                    模型名 <em>*</em>
                  </label>
                  <Input
                    value={aiModel}
                    placeholder="例如 gpt-4o-mini / deepseek-v4-flash / qwen-plus"
                    onChange={(e) => setAiModel(e.target.value)}
                  />
                  <p className="theme-ai-hint">
                    服务端代发请求，兼容 OpenAI <code>/v1/chat/completions</code>。Key
                    仅保存在本机数据库。可先点「测试连通」再保存。
                  </p>
                  <Space wrap>
                    <Button loading={aiTesting} onClick={() => void testAIConfig()} style={{ borderRadius: 6 }}>
                      测试连通
                    </Button>
                    <Button
                      type="primary"
                      loading={aiConfigSaving}
                      onClick={() => void saveAIConfig()}
                      style={{ borderRadius: 6 }}
                    >
                      保存配置
                    </Button>
                  </Space>
                </div>
              ),
            },
            {
              key: 'chat',
              label: (
                <span>
                  <RobotOutlined /> 对话生成
                </span>
              ),
              children: (
                <div className="theme-ai-chat">
                  <div className="theme-ai-meta">
                    <div className="theme-ai-meta-row">
                      <label>主题名称（可选）</label>
                      <Input
                        value={aiThemeName}
                        placeholder="留空自动命名"
                        maxLength={64}
                        onChange={(e) => setAiThemeName(e.target.value)}
                      />
                    </div>
                    <div className="theme-ai-meta-row">
                      <label>基于已有主题微调（可选）</label>
                      <Select
                        allowClear
                        placeholder="从零生成则不选"
                        value={aiBaseThemeKey}
                        onChange={(v) => {
                          setAiBaseThemeKey(v)
                          if (!v) setAiOverwrite(false)
                        }}
                        options={custom.map((t) => ({ value: t.key, label: t.name }))}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <Checkbox
                      checked={aiOverwrite}
                      disabled={!aiBaseThemeKey}
                      onChange={(e) => setAiOverwrite(e.target.checked)}
                    >
                      覆盖所选主题（否则另存为新主题）
                    </Checkbox>
                  </div>

                  <div className="theme-ai-prompts">
                    {AI_QUICK_PROMPTS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="theme-ai-prompt-chip"
                        disabled={aiGenerating}
                        onClick={() => void sendAIChat(p)}
                      >
                        {p.length > 28 ? `${p.slice(0, 28)}…` : p}
                      </button>
                    ))}
                  </div>

                  {aiLastTheme && (
                    <div className="theme-ai-result">
                      <div className="theme-ai-result-title">
                        已保存：{aiLastTheme.name}
                        {aiLastValidation && !aiLastValidation.ok && (
                          <Tag color="warning" style={{ marginLeft: 8 }}>
                            校验有缺项
                          </Tag>
                        )}
                        {aiLastValidation?.ok && (
                          <Tag color="success" style={{ marginLeft: 8 }}>
                            校验通过
                          </Tag>
                        )}
                      </div>
                      {aiLastValidation?.issues?.length ? (
                        <div className="theme-ai-result-issues">
                          {aiLastValidation.issues.map((i) => (
                            <span key={i}>{i}</span>
                          ))}
                        </div>
                      ) : null}
                      <Space wrap size={8}>
                        <Button
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() => openFrontend(aiLastTheme.preview_url)}
                          style={{ borderRadius: 6 }}
                        >
                          预览
                        </Button>
                        <Button
                          size="small"
                          type="primary"
                          onClick={() => void applyAIGeneratedTheme(aiLastTheme)}
                          style={{ borderRadius: 6 }}
                        >
                          一键启用
                        </Button>
                      </Space>
                    </div>
                  )}

                  <div className="theme-ai-messages">
                    {aiChat.length === 0 && (
                      <div className="theme-ai-empty">
                        描述风格即可开始。支持流式输出；可选基于已有主题微调。生成完整 HTML
                        后会自动保存，并可预览/启用。
                      </div>
                    )}
                    {aiChat.map((m, i) => (
                      <div key={i} className={`theme-ai-bubble is-${m.role}`}>
                        <div className="theme-ai-bubble-role">
                          {m.role === 'user' ? '你' : 'AI'}
                          {aiGenerating && i === aiChat.length - 1 && m.role === 'assistant' ? ' · 生成中' : ''}
                        </div>
                        <pre>{m.content || (aiGenerating ? '…' : '')}</pre>
                      </div>
                    ))}
                    <div ref={aiChatEndRef} />
                  </div>
                  <div className="theme-ai-composer">
                    <Input.TextArea
                      value={aiInput}
                      rows={3}
                      placeholder="例如：做一个深色玻璃拟态导航，大图标，页脚要有管理入口"
                      disabled={aiGenerating}
                      onChange={(e) => setAiInput(e.target.value)}
                      onPressEnter={(e) => {
                        if (!e.shiftKey) {
                          e.preventDefault()
                          void sendAIChat()
                        }
                      }}
                    />
                    {aiGenerating ? (
                      <Button danger icon={<StopOutlined />} onClick={cancelAIChat} style={{ borderRadius: 6 }}>
                        取消
                      </Button>
                    ) : (
                      <Button type="primary" onClick={() => void sendAIChat()} style={{ borderRadius: 6 }}>
                        发送
                      </Button>
                    )}
                  </div>
                </div>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        className="theme-guide-modal admin-modal"
        title={guideTitle}
        open={guideOpen}
        onCancel={() => setGuideOpen(false)}
        width={980}
        centered
        destroyOnClose
        styles={{
          body: {
            maxHeight: 'calc(100vh - 180px)',
            overflow: 'hidden',
            paddingTop: 8,
            paddingBottom: 8,
          },
        }}
        footer={[
          <Button
            key="copy"
            icon={<CopyOutlined />}
            type="primary"
            onClick={() => void copyGuide()}
            disabled={!guideMarkdown}
            style={{ borderRadius: 6 }}
          >
            复制给 AI（不含示例）
          </Button>,
          <Button key="close" onClick={() => setGuideOpen(false)} style={{ borderRadius: 6 }}>
            关闭
          </Button>,
        ]}
      >
        {guideLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : (
          <ThemeGuideView markdown={guideMarkdown} />
        )}
      </Modal>
    </div>
  )
}
