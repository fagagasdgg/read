import {
  createContext,
  memo,
  type ReactNode,
  useContext,
  useMemo,
  createElement,
} from 'react'
import { toLemma } from '../../lib/lemmatize'
import { splitTextSegments } from './tokenize'

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'LI', 'UL', 'OL', 'HR', 'BR', 'IMG',
])

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'LINK', 'META', 'HEAD'])

const GlossContext = createContext<Record<string, string>>({})

interface ChapterContentProps {
  html: string
  onWordTap: (rawWord: string) => void
  glosses?: Record<string, string>
}

interface ReaderWordProps {
  wordKey: string
  value: string
  lemma: string
  onWordTap: (w: string) => void
}

const ReaderWord = memo(function ReaderWord({
  wordKey,
  value,
  lemma,
  onWordTap,
}: ReaderWordProps) {
  const glosses = useContext(GlossContext)
  const gloss = glosses[lemma]

  if (!gloss) {
    return (
      <span
        key={wordKey}
        className="reader-word"
        data-word={value}
        data-lemma={lemma}
        onClick={(e) => {
          e.stopPropagation()
          onWordTap(value)
        }}
      >
        {value}
      </span>
    )
  }

  return (
    <span key={wordKey} className="reader-word-wrap">
      <span className="reader-inline-gloss" aria-hidden>
        {gloss}
      </span>
      <span
        className="reader-word reader-word-has-gloss"
        data-word={value}
        data-lemma={lemma}
        onClick={(e) => {
          e.stopPropagation()
          onWordTap(value)
        }}
      >
        {value}
      </span>
    </span>
  )
})

function renderTextNode(
  text: string,
  key: string,
  onWordTap: (w: string) => void,
): ReactNode[] {
  return splitTextSegments(text).map((seg, i) => {
    if (seg.type === 'text') {
      return <span key={`${key}-t-${i}`}>{seg.value}</span>
    }

    const lemma = toLemma(seg.value)
    return (
      <ReaderWord
        key={`${key}-w-${i}`}
        wordKey={`${key}-w-${i}`}
        value={seg.value}
        lemma={lemma}
        onWordTap={onWordTap}
      />
    )
  })
}

function renderNode(
  node: ChildNode,
  key: string,
  onWordTap: (w: string) => void,
): ReactNode {
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
    const src = el.getAttribute('src')
    const alt = el.getAttribute('alt') ?? ''
    if (src) {
      return <img key={key} className="reader-image" src={src} alt={alt} />
    }
    return <span key={key} className="reader-image-placeholder"> {alt || '[图片]'} </span>
  }

  const Tag = tag.toLowerCase()
  const className = BLOCK_TAGS.has(tag) ? `reader-block reader-${Tag}` : `reader-inline reader-${Tag}`

  return createElement(Tag, { key, className }, children)
}

export function ChapterContent({ html, onWordTap, glosses = {} }: ChapterContentProps) {
  const content = useMemo(() => {
    const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
    const root = doc.getElementById('root')
    if (!root) return null
    return Array.from(root.childNodes).map((node, i) =>
      renderNode(node, `n-${i}`, onWordTap),
    )
  }, [html, onWordTap])

  return (
    <GlossContext.Provider value={glosses}>
      <article className="chapter-content">{content}</article>
    </GlossContext.Provider>
  )
}
