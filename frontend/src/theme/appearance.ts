export type AppearanceSettings = {
  theme?: string
  primary_color?: string
  accent_color?: string
  bg_color?: string
  bg_color_end?: string
  text_color?: string
  muted_color?: string
  bg_image?: string
  bg_image_mode?: 'none' | 'custom' | 'bing' | string
  glass_opacity?: number
  glass_blur?: number
  glass_saturate?: number
  header_opacity?: number
}

export const defaultAppearance: Required<Omit<AppearanceSettings, 'bg_image' | 'bg_image_mode'>> & {
  bg_image: string
  bg_image_mode: string
} = {
  theme: 'system',
  primary_color: '#3B82F6',
  accent_color: '#60A5FA',
  bg_color: '#E4EEF8',
  bg_color_end: '#F3F6FA',
  text_color: '#0F172A',
  muted_color: '#64748B',
  bg_image: '',
  bg_image_mode: 'none',
  glass_opacity: 58,
  glass_blur: 22,
  glass_saturate: 160,
  header_opacity: 70,
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace('#', '').trim()
  if (raw.length === 3) {
    const r = parseInt(raw[0] + raw[0], 16)
    const g = parseInt(raw[1] + raw[1], 16)
    const b = parseInt(raw[2] + raw[2], 16)
    return { r, g, b }
  }
  if (raw.length !== 6) return null
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  }
}

function rgba(hex: string, alpha: number) {
  const rgb = hexToRgb(hex) || { r: 255, g: 255, b: 255 }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

function isDarkTheme(theme?: string, text?: string) {
  if (theme === 'dark') return true
  const rgb = hexToRgb(text || '#1C1C1E')
  if (!rgb) return false
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 < 140
}

/** 将外观设置映射为 CSS 变量，供前台毛玻璃主题使用 */
export function buildThemeVars(input: AppearanceSettings = {}): Record<string, string> {
  const s = { ...defaultAppearance, ...input }
  const opacity = Math.min(100, Math.max(0, s.glass_opacity)) / 100
  const headerOpacity = Math.min(100, Math.max(0, s.header_opacity)) / 100
  const dark = isDarkTheme(s.theme, s.text_color)
  const surfaceBase = dark ? '#1C1C1E' : '#FFFFFF'
  const borderBase = dark ? '#FFFFFF' : '#FFFFFF'
  /* 面板 / 卡片 / 标签统一透明度 */
  const surfaceAlpha = dark ? Math.min(0.72, Math.max(0.5, opacity)) : Math.min(Math.max(opacity, 0.32), 0.4)
  const surfaceBg = rgba(surfaceBase, surfaceAlpha)
  const surfaceBorder = rgba(borderBase, dark ? 0.28 : 0.5)
  const surfaceBlur = `${Math.max(s.glass_blur, 24)}px`
  const surfaceSaturate = `${Math.max(s.glass_saturate, 160)}%`

  return {
    '--nav-primary': s.primary_color,
    '--nav-accent': s.accent_color,
    '--nav-bg-start': s.bg_color,
    '--nav-bg-end': s.bg_color_end,
    '--nav-text': s.text_color,
    '--nav-muted': s.muted_color,
    '--nav-bg-image': s.bg_image ? `url("${String(s.bg_image).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")` : 'none',
    '--nav-glass-blur': surfaceBlur,
    '--nav-glass-saturate': surfaceSaturate,
    '--nav-glass-bg': surfaceBg,
    '--nav-glass-bg-strong': rgba(surfaceBase, dark ? Math.min(1, surfaceAlpha + 0.14) : Math.min(0.58, surfaceAlpha + 0.16)),
    '--nav-header-bg': rgba(surfaceBase, dark ? headerOpacity : Math.min(headerOpacity, 0.42)),
    '--nav-glass-border': surfaceBorder,
    '--nav-glass-highlight': rgba('#FFFFFF', dark ? 0.1 : 0.7),
    '--nav-surface-bg': surfaceBg,
    '--nav-surface-item-bg': surfaceBg,
    '--nav-surface-border': surfaceBorder,
    '--nav-surface-blur': surfaceBlur,
    '--nav-surface-saturate': surfaceSaturate,
    '--nav-surface-shadow': dark
      ? '0 8px 28px rgba(0,0,0,0.28)'
      : '0 8px 28px rgba(15, 23, 42, 0.07)',
    '--nav-surface-hover': dark ? 'rgba(51, 65, 85, 0.88)' : 'rgba(255, 255, 255, 0.55)',
    '--nav-shadow': dark
      ? '0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)'
      : '0 10px 36px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255,255,255,0.7)',
    '--nav-icon-bg': rgba(s.primary_color, dark ? 0.22 : 0.12),
    '--nav-icon-color': s.primary_color,
  }
}
