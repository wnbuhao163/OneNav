import api from './client'

export const getInitStatus = () => api.get('/init/status') as Promise<{ data: { initialized: boolean } }>
export const initSystem = (payload: { username: string; password: string; title?: string }) =>
  api.post('/init', payload) as Promise<{ data: { token: string; user: { id: number; username: string } } }>

export const login = (payload: { username: string; password: string }) =>
  api.post('/auth/login', payload) as Promise<{ data: { token: string; user: { id: number; username: string } } }>
export const logout = () => api.post('/auth/logout')
export const getMe = () => api.get('/auth/me') as Promise<{ data: { id: number; username: string } }>

export const getAdminMenus = () => api.get('/admin/menus')
export const getDashboard = () => api.get('/admin/dashboard')

export const getCategories = () => api.get('/admin/categories')
export const getCategoriesFlat = () => api.get('/admin/categories/flat')
export const createCategory = (data: unknown) => api.post('/admin/categories', data)
export const updateCategory = (id: number, data: unknown) => api.put(`/admin/categories/${id}`, data)
export const deleteCategory = (id: number) => api.delete(`/admin/categories/${id}`)

export const getLinks = (params?: Record<string, unknown>) => api.get('/admin/links', { params })
export const createLink = (data: unknown) => api.post('/admin/links', data)
export const updateLink = (id: number, data: unknown) => api.put(`/admin/links/${id}`, data)
export const deleteLink = (id: number) => api.delete(`/admin/links/${id}`)
export const batchMoveLinks = (data: { ids: number[]; category_id: number }) =>
  api.post('/admin/links/batch-category', data)
export const getDockerContainers = (params?: { only_labeled?: boolean; all?: boolean }) =>
  api.get('/admin/docker/containers', {
    params: {
      only_labeled: params?.only_labeled ? '1' : undefined,
      all: params?.all ? '1' : undefined,
    },
  })
export const importDockerContainers = (data: {
  category_id: number
  private?: boolean
  items: { name: string; url: string; description?: string; icon_url?: string; private?: boolean }[]
}) => api.post('/admin/docker/import', data)

export const fetchLinkMeta = (url: string) =>
  api.post('/admin/links/fetch-meta', { url }) as Promise<{
    data: {
      name: string
      description?: string
      icon_url?: string
      url?: string
      partial?: boolean
      message?: string
    }
  }>
export const suggestLinkCategory = (data: { name?: string; description?: string; url?: string }) =>
  api.post('/admin/links/suggest-category', data) as Promise<{
    data: {
      suggestions: { category_id: number; name: string; score: number; reason: string }[]
      message?: string
    }
  }>

export const importBookmarks = (data: { html: string; category_id: number; private?: boolean }) =>
  api.post('/admin/bookmark/import', data)

export const getSettings = () => api.get('/admin/settings')
export const updateSettings = (data: unknown) => api.put('/admin/settings', data)

export const getThemes = () => api.get('/admin/themes')
export const applyTheme = (theme: string) => api.post('/admin/themes/apply', { theme })
export const getThemeGuide = () =>
  api.get('/admin/themes/guide') as Promise<{ data: { title: string; markdown: string } }>
export const uploadHtmlTheme = (file: File, meta?: { name?: string; description?: string }) => {
  const form = new FormData()
  form.append('file', file)
  if (meta?.name) form.append('name', meta.name)
  if (meta?.description) form.append('description', meta.description)
  return api.post('/admin/themes/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
  }) as Promise<{
    data: { key: string; name: string; preview_url: string; fs_key: string; type: string }
  }>
}
export const deleteHtmlTheme = (key: string) => api.delete(`/admin/themes/${encodeURIComponent(key)}`)

export type ThemeAIConfig = {
  ai_api_base: string
  ai_model: string
  ai_api_key_set: boolean
}

export const getThemeAIConfig = () =>
  api.get('/admin/themes/ai/config') as Promise<{ data: ThemeAIConfig }>

export const updateThemeAIConfig = (data: {
  ai_api_base: string
  ai_api_key?: string
  ai_model: string
}) => api.put('/admin/themes/ai/config', data) as Promise<{ data: ThemeAIConfig }>

export const testThemeAIConfig = (data?: {
  ai_api_base?: string
  ai_api_key?: string
  ai_model?: string
}) =>
  api.post('/admin/themes/ai/test', data || {}, { timeout: 35000 }) as Promise<{
    data: { ok: boolean; reply?: string; hint?: string }
  }>

export type ThemeAIChatMessage = { role: 'user' | 'assistant'; content: string }

export type ThemeAIGeneratedTheme = {
  key: string
  name: string
  preview_url: string
  fs_key: string
  type: string
  overwritten?: boolean
}

export type ThemeAIValidation = {
  ok: boolean
  passed: string[]
  issues: string[]
}

export type ThemeAIStreamDone = {
  type: 'done'
  reply: string
  hint?: string
  theme?: ThemeAIGeneratedTheme | null
  validation?: ThemeAIValidation | null
}

export async function generateThemeWithAIStream(
  data: {
    message: string
    history?: ThemeAIChatMessage[]
    name?: string
    base_theme_key?: string
    overwrite?: boolean
  },
  handlers: {
    onDelta?: (chunk: string) => void
    onDone?: (payload: ThemeAIStreamDone) => void
    signal?: AbortSignal
  } = {},
): Promise<ThemeAIStreamDone> {
  const token = localStorage.getItem('onenav_token')
  const res = await fetch('/api/admin/themes/ai/generate/stream', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
    signal: handlers.signal,
  })

  if (!res.ok) {
    let msg = '生成失败'
    try {
      const body = await res.json()
      msg = body?.message || msg
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  if (!res.body) {
    throw new Error('浏览器不支持流式响应')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let assembled = ''
  let donePayload: ThemeAIStreamDone | null = null

  const consumeEvent = (raw: string) => {
    const lines = raw.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload) continue
      let evt: any
      try {
        evt = JSON.parse(payload)
      } catch {
        continue
      }
      if (evt.type === 'delta' && typeof evt.content === 'string') {
        assembled += evt.content
        handlers.onDelta?.(evt.content)
      } else if (evt.type === 'error') {
        throw new Error(evt.message || '生成失败')
      } else if (evt.type === 'done') {
        donePayload = {
          type: 'done',
          reply: evt.reply || assembled,
          hint: evt.hint,
          theme: evt.theme ?? null,
          validation: evt.validation ?? null,
        }
        handlers.onDone?.(donePayload)
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) {
      if (part.trim()) consumeEvent(part)
    }
  }
  if (buffer.trim()) consumeEvent(buffer)

  if (!donePayload) {
    if (!assembled.trim()) throw new Error('AI 未返回内容')
    donePayload = { type: 'done', reply: assembled, theme: null, validation: null }
  }
  return donePayload
}

export const exportBackup = async () => {
  const token = localStorage.getItem('onenav_token')
  const res = await fetch('/api/admin/backup/export', {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('导出失败')
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^";]+)"?/i)
  const filename = match?.[1] || `onenav-backup-${Date.now()}.zip`
  const blob = await res.blob()
  return { blob, filename }
}

export const restoreBackup = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/admin/backup/restore', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const uploadIcon = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/admin/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as Promise<{ data: { url: string; name: string } }>
}

export const uploadBackground = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/admin/upload/bg', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
  }) as Promise<{ data: { url: string; name: string } }>
}

export const getPublicNav = () => api.get('/public/nav')
export const getPublicSettings = () => api.get('/public/settings')
export const getPublicCategories = () => api.get('/public/categories')
export const getBingWallpaper = () =>
  api.get('/public/bing-wallpaper') as Promise<{ data: { url: string } }>

export const getSearchEngines = () => api.get('/admin/search-engines')
export const createSearchEngine = (data: unknown) => api.post('/admin/search-engines', data)
export const updateSearchEngine = (id: number, data: unknown) => api.put(`/admin/search-engines/${id}`, data)
export const deleteSearchEngine = (id: number) => api.delete(`/admin/search-engines/${id}`)
