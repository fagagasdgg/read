import ReactMarkdown from 'react-markdown'

/** 句型分析 Markdown 白名单：段落、三级标题、列表、加粗/斜体、行内代码、引用、分割线 */
const ALLOWED_ELEMENTS = [
  'p',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'code',
  'blockquote',
  'hr',
  'br',
] as const

interface MarkdownContentProps {
  source: string
  className?: string
}

export function MarkdownContent({ source, className }: MarkdownContentProps) {
  const text = source.trim()
  if (!text) return null

  return (
    <div className={className ? `md-content ${className}` : 'md-content'}>
      <ReactMarkdown
        skipHtml
        allowedElements={[...ALLOWED_ELEMENTS]}
        unwrapDisallowed
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

/** 有 Markdown 标记才渲染；否则保持纯文本 pre-wrap（兼容旧笔记） */
export function SentencePatternView({
  text,
  asMarkdown,
  className,
  empty = '暂无内容',
}: {
  text: string
  asMarkdown?: boolean
  className?: string
  empty?: string
}) {
  const value = text.trim()
  if (!value) {
    return <p className={className}>{empty}</p>
  }
  if (asMarkdown) {
    return <MarkdownContent source={value} className={className} />
  }
  return <p className={className ? `${className} note-popup-pre` : 'note-popup-pre'}>{value}</p>
}
