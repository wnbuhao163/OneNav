export type SearchEngineGroup = 'web' | 'content' | 'pan'

export type SearchEngine = {
  id: string
  name: string
  group: SearchEngineGroup
  url: string
  enabled?: boolean
  builtin?: boolean
  sort?: number
  key?: string
}

/** 内置预设：仅作兜底；正式数据以后台「搜索引擎」表为准 */
export const SEARCH_ENGINE_PRESETS: SearchEngine[] = [
  { id: 'baidu', name: '百度', group: 'web', url: 'https://www.baidu.com/s?wd={q}' },
  { id: 'google', name: '谷歌', group: 'web', url: 'https://www.google.com/search?q={q}' },
  { id: 'bing', name: '必应', group: 'web', url: 'https://www.bing.com/search?q={q}' },
  { id: 'sogou', name: '搜狗', group: 'web', url: 'https://www.sogou.com/web?query={q}' },
  { id: 'duckduckgo', name: 'DuckDuckGo', group: 'web', url: 'https://duckduckgo.com/?q={q}' },
  { id: 'github', name: 'GitHub', group: 'content', url: 'https://github.com/search?q={q}' },
  { id: 'bilibili', name: 'B站', group: 'content', url: 'https://search.bilibili.com/all?keyword={q}' },
  { id: 'zhihu', name: '知乎', group: 'content', url: 'https://www.zhihu.com/search?type=content&q={q}' },
  { id: 'baidupan', name: '百度网盘', group: 'pan', url: 'https://pan.qianfan.app/#/search?type=baidu&keyword={q}' },
  { id: 'alipansou', name: '阿里云盘', group: 'pan', url: 'https://www.alipansou.com/search?k={q}' },
  { id: 'quark', name: '夸克网盘', group: 'pan', url: 'https://pan.qianfan.app/#/search?type=quark&keyword={q}' },
  { id: 'xunlei', name: '迅雷云盘', group: 'pan', url: 'https://pan.qianfan.app/#/search?type=xunlei&keyword={q}' },
  { id: 'tianyi', name: '天翼云盘', group: 'pan', url: 'https://pan.qianfan.app/#/search?type=tianyi&keyword={q}' },
  { id: 'lanzou', name: '蓝奏云', group: 'pan', url: 'https://pan.qianfan.app/#/search?type=lanzou&keyword={q}' },
  { id: 'yunsopan', name: '云搜盘', group: 'pan', url: 'https://www.yunsopan.com/search?keyword={q}' },
  { id: 'qianfan', name: '千帆聚合', group: 'pan', url: 'https://pan.qianfan.app/#/search?keyword={q}' },
]

export const SEARCH_GROUP_LABELS: Record<SearchEngineGroup, string> = {
  web: '网页搜索',
  content: '内容搜索',
  pan: '网盘搜索',
}

export function parseEngineIds(raw?: string): string[] {
  if (!raw) return ['baidu', 'google', 'bing']
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function serializeEngineIds(ids: string[]): string {
  return ids.join(',')
}

function normalizeEngine(raw: any): SearchEngine | null {
  const id = String(raw?.id || raw?.key || '').trim()
  const name = String(raw?.name || '').trim()
  const url = String(raw?.url || '').trim()
  const group = String(raw?.group || '').trim() as SearchEngineGroup
  if (!id || !name || !url) return null
  if (group !== 'web' && group !== 'content' && group !== 'pan') return null
  return {
    id,
    key: id,
    name,
    group,
    url,
    enabled: raw?.enabled !== false,
    builtin: !!raw?.builtin,
    sort: Number(raw?.sort || 0),
  }
}

/** 优先用公开接口返回的 search_engine_list；否则回退到旧版 ID 列表 + 内置预设 */
export function resolveEngines(raw?: string | SearchEngine[] | { search_engines?: string; search_engine_list?: any[] }): SearchEngine[] {
  if (Array.isArray(raw)) {
    return raw.map(normalizeEngine).filter(Boolean) as SearchEngine[]
  }
  if (raw && typeof raw === 'object') {
    const list = (raw as any).search_engine_list
    if (Array.isArray(list) && list.length > 0) {
      return list.map(normalizeEngine).filter(Boolean) as SearchEngine[]
    }
    return resolveEnginesFromIds((raw as any).search_engines)
  }
  return resolveEnginesFromIds(typeof raw === 'string' ? raw : undefined)
}

function resolveEnginesFromIds(raw?: string): SearchEngine[] {
  const ids = parseEngineIds(raw)
  const map = new Map(SEARCH_ENGINE_PRESETS.map((e) => [e.id, e]))
  const legacy: Record<string, string> = { pan123: 'qianfan' }
  return ids.map((id) => map.get(legacy[id] || id)).filter(Boolean) as SearchEngine[]
}

export function buildSearchUrl(engine: SearchEngine, keyword: string) {
  return engine.url.replace('{q}', encodeURIComponent(keyword.trim()))
}
