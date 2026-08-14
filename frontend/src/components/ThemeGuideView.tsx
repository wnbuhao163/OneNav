import { useMemo, useState, type ReactNode } from 'react'
import { Button, Tag, message } from 'antd'
import { CopyOutlined, DownOutlined, UpOutlined } from '@ant-design/icons'

type Block =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[]; ordered?: boolean }
  | { type: 'code'; lang: string; code: string; example?: boolean }
  | { type: 'callout'; text: string; level: 'important' | 'tip' }

type GuideSection = {
  id: string
  title: string
  level: 2 | 3
  kind: 'normal' | 'important' | 'example'
  raw: string
  blocks: Block[]
  children?: GuideSection[]
}

function classifySection(title: string): GuideSection['kind'] {
  if (/示例|样例|最小拉取|参考代码|引入示例|推荐调用方式/.test(title)) return 'example'
  if (
    /必做|重要|主要接口|页面实现|背景图|ZIP|基础约定|上传与启用|获取前台|获取站点|获取分类|站点设置|公开接口|数据源|第三方库|打进 ZIP|推荐做法|推荐目录|合并接口/.test(
      title,
    )
  ) {
    return 'important'
  }
  return 'normal'
}

function kindLabel(kind: GuideSection['kind']) {
  if (kind === 'important') return '重要'
  if (kind === 'example') return '示例'
  return ''
}

function renderInline(text: string, keyPrefix: string) {
  const parts: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('**')) {
      parts.push(
        <strong key={`${keyPrefix}-b-${i}`} className="tg-strong">
          {token.slice(2, -2)}
        </strong>,
      )
    } else {
      parts.push(
        <code key={`${keyPrefix}-c-${i}`} className="tg-code">
          {token.slice(1, -1)}
        </code>,
      )
    }
    last = m.index + token.length
    i++
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function isBlockStart(line: string) {
  const t = line.trim()
  return (
    t.startsWith('```') ||
    t.startsWith('>') ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    line.startsWith('#')
  )
}

function parseBlocks(body: string, sectionKind: GuideSection['kind']): Block[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim()
      i++
      const codeLines: string[] = []
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++
      const isExample =
        sectionKind === 'example' || lang === 'html' || /示例|sample/i.test(lang)
      blocks.push({
        type: 'code',
        lang: lang || 'text',
        code: codeLines.join('\n'),
        example: isExample,
      })
      continue
    }
    if (line.trim().startsWith('>')) {
      const parts: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        parts.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const raw = parts.join(' ')
      const level = /重要|必做|必须/.test(raw) ? 'important' : 'tip'
      blocks.push({ type: 'callout', text: raw, level })
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      blocks.push({ type: 'ul', items, ordered: true })
      continue
    }
    const para: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      para.push(lines[i])
      i++
    }
    blocks.push({ type: 'p', text: para.join('\n') })
  }
  return blocks
}

export function parseThemeGuide(markdown: string): GuideSection[] {
  const text = markdown.replace(/\r\n/g, '\n').trim()
  if (!text) return []
  const lines = text.split('\n')
  const sections: GuideSection[] = []

  type Draft = { title: string; level: 2 | 3; lines: string[]; children: GuideSection[] }
  let parent: Draft | null = null
  let child: Draft | null = null
  let seq = 0

  const makeSection = (draft: Draft): GuideSection => {
    const body = draft.lines.join('\n').trim()
    const kind = classifySection(draft.title)
    // 父级若自身无正文、仅有子接口，也标为重要（如「主要接口」）
    const finalKind =
      draft.children.length > 0 && kind === 'normal' && /接口|API|约定|流程/.test(draft.title)
        ? 'important'
        : kind
    return {
      id: `s-${seq++}`,
      title: draft.title,
      level: draft.level,
      kind: finalKind,
      raw: `${'#'.repeat(draft.level)} ${draft.title}\n\n${body}`.trim(),
      blocks: parseBlocks(body, finalKind),
      children: draft.children.length ? draft.children : undefined,
    }
  }

  const flushChild = () => {
    if (!child) return
    const section = makeSection(child)
    child = null
    if (parent) parent.children.push(section)
    else sections.push(section)
  }

  const flushParent = () => {
    flushChild()
    if (!parent) return
    sections.push(makeSection(parent))
    parent = null
  }

  let intro: string[] = []
  for (const line of lines) {
    const h2 = /^##\s+(.+)$/.exec(line)
    const h3 = /^###\s+(.+)$/.exec(line)
    if (h2) {
      if (!parent && !child && intro.length) {
        sections.push({
          id: `s-${seq++}`,
          title: '简介',
          level: 2,
          kind: 'normal',
          raw: intro.join('\n').trim(),
          blocks: parseBlocks(intro.join('\n'), 'normal'),
        })
        intro = []
      }
      flushParent()
      parent = { title: h2[1].trim(), level: 2, lines: [], children: [] }
      continue
    }
    if (h3) {
      if (!parent && !child && intro.length) {
        sections.push({
          id: `s-${seq++}`,
          title: '简介',
          level: 2,
          kind: 'normal',
          raw: intro.join('\n').trim(),
          blocks: parseBlocks(intro.join('\n'), 'normal'),
        })
        intro = []
      }
      flushChild()
      child = { title: h3[1].trim(), level: 3, lines: [], children: [] }
      continue
    }
    if (line.startsWith('# ') && !parent && !child) {
      intro.push(`**${line.replace(/^#\s+/, '')}**`)
      continue
    }
    if (child) child.lines.push(line)
    else if (parent) parent.lines.push(line)
    else intro.push(line)
  }
  flushParent()
  return sections
}

function sectionCopyText(section: GuideSection) {
  if (section.kind === 'example') return ''
  const parts: string[] = [`${'#'.repeat(section.level)} ${section.title}`]
  for (const b of section.blocks) {
    if (b.type === 'p') parts.push(b.text)
    if (b.type === 'ul') {
      parts.push(
        ...b.items.map((it, idx) => (b.ordered ? `${idx + 1}. ${it}` : `- ${it}`)),
      )
    }
    if (b.type === 'callout') parts.push(`> ${b.text}`)
    if (b.type === 'code') {
      if (b.example && b.lang === 'html') continue
      parts.push('```' + (b.lang || '') + '\n' + b.code + '\n```')
    }
  }
  for (const child of section.children || []) {
    const childText = sectionCopyText(child)
    if (childText) parts.push(childText)
  }
  return parts.join('\n\n').trim()
}

async function copyText(text: string, okMsg: string) {
  if (!text.trim()) {
    message.warning('该段为示例，无需复制')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    message.success(okMsg)
  } catch {
    message.error('复制失败，请手动选择文本')
  }
}

export function buildGuideCopyAll(sections: GuideSection[]) {
  return sections
    .filter((s) => s.kind !== 'example')
    .map(sectionCopyText)
    .filter(Boolean)
    .join('\n\n---\n\n')
}

function renderBlocks(section: GuideSection) {
  return section.blocks.map((b, idx) => {
    if (b.type === 'p') {
      return (
        <p key={idx} className="tg-p">
          {b.text.split('\n').map((line, li) => (
            <span key={li}>
              {li > 0 ? <br /> : null}
              {renderInline(line, `${section.id}-${idx}-${li}`)}
            </span>
          ))}
        </p>
      )
    }
    if (b.type === 'ul') {
      const ListTag = b.ordered ? 'ol' : 'ul'
      return (
        <ListTag key={idx} className={`tg-ul${b.ordered ? ' is-ordered' : ''}`}>
          {b.items.map((item, j) => (
            <li key={j}>{renderInline(item, `${section.id}-${idx}-${j}`)}</li>
          ))}
        </ListTag>
      )
    }
    if (b.type === 'callout') {
      return (
        <div key={idx} className={`tg-callout is-${b.level}`}>
          {renderInline(b.text, `${section.id}-call-${idx}`)}
        </div>
      )
    }
    return (
      <div
        key={idx}
        className={`tg-codeblock${b.example || section.kind === 'example' ? ' is-example' : ' is-spec'}`}
      >
        <div className="tg-codeblock-bar">
          <span>{b.lang || 'code'}</span>
          {b.example || section.kind === 'example' ? <em>示例 · 仅供参考</em> : <em>接口 / 规范</em>}
        </div>
        <pre>
          <code>{b.code}</code>
        </pre>
      </div>
    )
  })
}

function SectionBody({
  section,
  copiedId,
  onCopied,
  nested = false,
}: {
  section: GuideSection
  copiedId: string
  onCopied: (id: string) => void
  nested?: boolean
}) {
  const [expanded, setExpanded] = useState(section.kind !== 'example')
  const hasChildren = !!(section.children && section.children.length)
  const hasBlocks = section.blocks.length > 0

  return (
    <section
      className={`theme-guide-section is-${section.kind}${nested ? ' is-nested' : ''}${
        !expanded ? ' is-collapsed' : ''
      }${hasChildren ? ' has-children' : ''}`}
    >
      <header className="theme-guide-section-head">
        <div className="theme-guide-section-title">
          {kindLabel(section.kind) ? (
            <Tag color={section.kind === 'important' ? 'gold' : section.kind === 'example' ? 'default' : 'blue'}>
              {kindLabel(section.kind)}
            </Tag>
          ) : null}
          <h3 title={section.title}>{section.title}</h3>
        </div>
        <div className="theme-guide-section-actions">
          {section.kind === 'example' ? (
            <Button
              size="small"
              type="text"
              icon={expanded ? <UpOutlined /> : <DownOutlined />}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? '收起示例' : '展开示例'}
            </Button>
          ) : (
            <Button
              size="small"
              type={copiedId === section.id ? 'primary' : 'default'}
              icon={<CopyOutlined />}
              onClick={() => {
                void (async () => {
                  await copyText(sectionCopyText(section), hasChildren ? '已复制本组（含下级）' : '已复制本段')
                  onCopied(section.id)
                })()
              }}
            >
              {hasChildren ? '复制本组' : '复制本段'}
            </Button>
          )}
        </div>
      </header>
      {expanded ? (
        <div className={`theme-guide-section-body${!hasBlocks && hasChildren ? ' is-group-only' : ''}`}>
          {hasBlocks ? renderBlocks(section) : null}
          {hasChildren ? (
            <div className="theme-guide-children">
              {section.children!.map((child) => (
                <SectionBody
                  key={child.id}
                  section={child}
                  copiedId={copiedId}
                  onCopied={onCopied}
                  nested
                />
              ))}
            </div>
          ) : null}
          {!hasBlocks && !hasChildren ? <p className="tg-p tg-muted">暂无内容</p> : null}
        </div>
      ) : (
        <div className="theme-guide-section-preview">完整 HTML 示例已折叠，需要时可展开查看（无需复制给 AI）</div>
      )}
    </section>
  )
}

export default function ThemeGuideView({ markdown }: { markdown: string }) {
  const sections = useMemo(() => parseThemeGuide(markdown), [markdown])
  const [copiedId, setCopiedId] = useState('')

  if (!sections.length) {
    return <div className="theme-guide-empty">暂无说明内容</div>
  }

  return (
    <div className="theme-guide-view">
      <div className="theme-guide-legend">
        <div className="theme-guide-legend-item">
          <Tag color="gold">重要</Tag>
          <span>建议分段复制给 AI</span>
        </div>
        <div className="theme-guide-legend-item">
          <Tag>示例</Tag>
          <span>默认折叠，仅供参考</span>
        </div>
      </div>
      <div className="theme-guide-sections">
        {sections.map((section) => (
          <SectionBody
            key={section.id}
            section={section}
            copiedId={copiedId}
            onCopied={(id) => {
              setCopiedId(id)
              window.setTimeout(() => setCopiedId(''), 1200)
            }}
          />
        ))}
      </div>
    </div>
  )
}
