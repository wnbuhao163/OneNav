/** 将站点标题与 LOGO 同步到浏览器标签（document.title + favicon） */

function guessIconType(url: string): string | undefined {
  const path = url.split('?')[0].toLowerCase()
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.ico')) return 'image/x-icon'
  if (path.endsWith('.gif')) return 'image/gif'
  return undefined
}

function upsertLink(rel: string, href: string, type?: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
  if (type) el.type = type
  else el.removeAttribute('type')
}

export function applySiteBrand(opts: { title?: string | null; logo?: string | null }) {
  const title = String(opts.title || '').trim() || '站点'
  document.title = title

  const logo = String(opts.logo || '').trim()
  if (!logo) return

  const type = guessIconType(logo)
  upsertLink('icon', logo, type)
  upsertLink('shortcut icon', logo, type)
  upsertLink('apple-touch-icon', logo)
}
