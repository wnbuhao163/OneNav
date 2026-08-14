export type VisitRecord = {
  id: number
  name: string
  url: string
  icon?: string
  icon_url?: string
  count: number
  lastAt: number
}

const STORAGE_KEY = 'onenav-link-visits'
const MAX_ITEMS = 40

export function readVisits(): VisitRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as VisitRecord[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function trackVisit(link: {
  id: number
  name: string
  url: string
  icon?: string
  icon_url?: string
}) {
  const list = readVisits()
  const idx = list.findIndex((item) => item.id === link.id)
  const now = Date.now()
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      ...link,
      count: (list[idx].count || 0) + 1,
      lastAt: now,
    }
  } else {
    list.push({ ...link, count: 1, lastAt: now })
  }
  list.sort((a, b) => b.lastAt - a.lastAt)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)))
}

export function getRecentVisits(limit = 8): VisitRecord[] {
  return readVisits()
    .slice()
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, limit)
}

export function getFrequentVisits(limit = 8): VisitRecord[] {
  return readVisits()
    .slice()
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .filter((item) => item.count >= 2)
    .slice(0, limit)
}
