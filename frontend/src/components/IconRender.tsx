import type { CSSProperties, ComponentType } from 'react'
import * as LucideIcons from 'lucide-react'
import type { LucideProps } from 'lucide-react'

const ignored = new Set([
  'createLucideIcon',
  'icons',
  'default',
  'Icon',
])

export function isLucideIconName(name: string) {
  return Boolean(name && (LucideIcons as Record<string, unknown>)[name] && !ignored.has(name))
}

/** 解析存储值：lucide:Home | /uploads/x.png | https://... | emoji */
export function parseIconValue(value?: string | null) {
  const raw = (value || '').trim()
  if (!raw) return { type: 'empty' as const }
  if (raw.startsWith('lucide:')) {
    const name = raw.slice(7)
    return { type: 'lucide' as const, name, value: raw }
  }
  if (
    raw.startsWith('/uploads/') ||
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:image/')
  ) {
    return { type: 'image' as const, url: raw, value: raw }
  }
  if (isLucideIconName(raw)) {
    return { type: 'lucide' as const, name: raw, value: `lucide:${raw}` }
  }
  return { type: 'text' as const, text: raw, value: raw }
}

export function toLucideValue(name: string) {
  return `lucide:${name}`
}

export function listLucideIconNames() {
  return Object.keys(LucideIcons)
    .filter((key) => {
      if (ignored.has(key)) return false
      if (!/^[A-Z]/.test(key)) return false
      const item = (LucideIcons as Record<string, unknown>)[key]
      return typeof item === 'object' || typeof item === 'function'
    })
    .sort()
}

type IconRenderProps = {
  value?: string | null
  size?: number
  className?: string
  style?: CSSProperties
  fallback?: string
}

export function IconRender({ value, size = 18, className, style, fallback }: IconRenderProps) {
  const parsed = parseIconValue(value)
  if (parsed.type === 'lucide') {
    const Comp = (LucideIcons as unknown as Record<string, ComponentType<LucideProps>>)[parsed.name]
    if (Comp) {
      return <Comp size={size} className={className} style={style} strokeWidth={1.75} />
    }
  }
  if (parsed.type === 'image') {
    return (
      <img
        src={parsed.url}
        alt=""
        className={className}
        style={{ width: size, height: size, objectFit: 'contain', ...style }}
      />
    )
  }
  if (parsed.type === 'text') {
    return (
      <span className={className} style={{ fontSize: size * 0.9, lineHeight: 1, ...style }}>
        {parsed.text}
      </span>
    )
  }
  if (fallback) {
    return (
      <span className={className} style={{ fontSize: size * 0.85, lineHeight: 1, ...style }}>
        {fallback}
      </span>
    )
  }
  return null
}
