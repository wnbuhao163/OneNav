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
