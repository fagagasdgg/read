import { type ReactNode, useMemo, createElement } from 'react'
import { splitTextSegments } from './tokenize'

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'LI', 'UL', 'OL', 'HR', 'BR', 'IMG',
])

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'LINK', 'META', 'HEAD'])

interface ChapterContentProps {
  html: string
  onWordTap: (rawWord: string) => void
}

function renderTextNode(text: string, key: string, onWordTap: (w: string) => void): ReactNode[] {
  return splitTextSegments(text).map((seg, i) => {
    if (seg.type === 'text') {
      return <span key={`${key}-t-${i}`}>{seg.value}</span>
    }
    return (
      <span
        key={`${key}-w-${i}`}
        className="reader-word"
        data-word={seg.value}
        onClick={(e) => {
          e.stopPropagation()
          onWordTap(seg.value)
        }}
      >
        {seg.value}
      </span>
    )
  })
}

function renderNode(node: ChildNode, key: string, onWordTap: (w: string) => void): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (!text.trim() && !text.includes(' ')) return null
    return <>{renderTextNode(text, key, onWordTap)}</>
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return null

  const el = node as Element
  const tag = el.tagName
  if (SKIP_TAGS.has(tag)) return null

  const children = Array.from(el.childNodes)
    .map((child, i) => renderNode(child, `${key}-${i}`, onWordTap))
    .filter(Boolean)

  if (tag === 'BR') return <br key={key} />
  if (tag === 'IMG') {
    const alt = el.getAttribute('alt') ?? '[图片]'
    return <span key={key} className="reader-image-placeholder"> {alt} </span>
  }

  const Tag = tag.toLowerCase()
  const className = BLOCK_TAGS.has(tag) ? `reader-block reader-${Tag}` : `reader-inline reader-${Tag}`

  return createElement(Tag, { key, className }, children)
}

export function ChapterContent({ html, onWordTap }: ChapterContentProps) {
  const content = useMemo(() => {
    const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
    const root = doc.getElementById('root')
    if (!root) return null
    return Array.from(root.childNodes).map((node, i) => renderNode(node, `n-${i}`, onWordTap))
  }, [html, onWordTap])

  return <article className="chapter-content">{content}</article>
}
