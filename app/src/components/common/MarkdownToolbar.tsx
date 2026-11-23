import { useCallback, type RefObject } from 'react'

export interface TextareaSelectionPatch {
  value: string
  selectionStart: number
  selectionEnd: number
}

function applyPatch(
  textarea: HTMLTextAreaElement,
  patch: TextareaSelectionPatch,
  onChange: (next: string) => void,
) {
  onChange(patch.value)
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(patch.selectionStart, patch.selectionEnd)
  })
}

function wrapInline(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): TextareaSelectionPatch {
  const selected = value.slice(start, end)
  const inner = selected || placeholder
  const next = `${value.slice(0, start)}${before}${inner}${after}${value.slice(end)}`
  const innerStart = start + before.length
  return {
    value: next,
    selectionStart: selected ? innerStart : innerStart,
    selectionEnd: selected ? innerStart + inner.length : innerStart + inner.length,
  }
}

function insertLinePrefix(
  value: string,
  start: number,
  end: number,
  prefix: string,
  placeholder: string,
): TextareaSelectionPatch {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const selected = value.slice(start, end)
  if (selected.includes('\n')) {
    const block = selected
      .split('\n')
      .map((line, index) => {
        const trimmed = line.trim()
        if (!trimmed) return line
        if (prefix === '1. ') return `${index + 1}. ${trimmed}`
        return `${prefix}${trimmed}`
      })
      .join('\n')
    const next = `${value.slice(0, start)}${block}${value.slice(end)}`
    return {
      value: next,
      selectionStart: start,
      selectionEnd: start + block.length,
    }
  }

  const lineEndIdx = value.indexOf('\n', start)
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx
  const line = value.slice(lineStart, lineEnd)
  const content = line.trim() ? line.replace(/^\s+/, '') : placeholder
  const nextLine = `${prefix}${content}`
  const next = `${value.slice(0, lineStart)}${nextLine}${value.slice(lineEnd)}`
  const cursor = lineStart + prefix.length
  return {
    value: next,
    selectionStart: cursor,
    selectionEnd: cursor + content.length,
  }
}

function insertBlock(
  value: string,
  start: number,
  end: number,
  block: string,
): TextareaSelectionPatch {
  const needsLeadingNl = start > 0 && value[start - 1] !== '\n'
  const needsTrailingNl = end < value.length && value[end] !== '\n'
  const insert = `${needsLeadingNl ? '\n' : ''}${block}${needsTrailingNl ? '\n' : ''}`
  const next = `${value.slice(0, start)}${insert}${value.slice(end)}`
  const cursor = start + insert.length
  return { value: next, selectionStart: cursor, selectionEnd: cursor }
}

type ToolAction =
  | { kind: 'wrap'; before: string; after: string; placeholder: string }
  | { kind: 'line'; prefix: string; placeholder: string }
  | { kind: 'block'; text: string }

const TOOLS: Array<{ id: string; label: string; title: string; action: ToolAction }> = [
  { id: 'h1', label: 'H1', title: '一级标题', action: { kind: 'line', prefix: '# ', placeholder: '一级标题' } },
  { id: 'h2', label: 'H2', title: '二级标题', action: { kind: 'line', prefix: '## ', placeholder: '二级标题' } },
  { id: 'h3', label: 'H3', title: '三级标题', action: { kind: 'line', prefix: '### ', placeholder: '三级标题' } },
  { id: 'ul', label: '• 列表', title: '无序列表', action: { kind: 'line', prefix: '- ', placeholder: '列表项' } },
  {
    id: 'ol',
    label: '1. 列表',
    title: '有序列表',
    action: { kind: 'line', prefix: '1. ', placeholder: '列表项' },
  },
  {
    id: 'bold',
    label: 'B',
    title: '加粗',
    action: { kind: 'wrap', before: '**', after: '**', placeholder: '加粗文字' },
  },
  {
    id: 'italic',
    label: 'I',
    title: '斜体',
    action: { kind: 'wrap', before: '*', after: '*', placeholder: '斜体文字' },
  },
  {
    id: 'code',
    label: '</>',
    title: '行内代码',
    action: { kind: 'wrap', before: '`', after: '`', placeholder: 'code' },
  },
  {
    id: 'quote',
    label: '引用',
    title: '引用',
    action: { kind: 'line', prefix: '> ', placeholder: '引用内容' },
  },
  { id: 'hr', label: '---', title: '分割线', action: { kind: 'block', text: '\n---\n' } },
]

interface MarkdownToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}

export function MarkdownToolbar({
  textareaRef,
  value,
  onChange,
  disabled = false,
}: MarkdownToolbarProps) {
  const run = useCallback(
    (action: ToolAction) => {
      const el = textareaRef.current
      if (!el || disabled) return
      const start = el.selectionStart ?? value.length
      const end = el.selectionEnd ?? value.length

      let patch: TextareaSelectionPatch
      if (action.kind === 'wrap') {
        patch = wrapInline(value, start, end, action.before, action.after, action.placeholder)
      } else if (action.kind === 'line') {
        patch = insertLinePrefix(value, start, end, action.prefix, action.placeholder)
      } else {
        patch = insertBlock(value, start, end, action.text)
      }
      applyPatch(el, patch, onChange)
    },
    [disabled, onChange, textareaRef, value],
  )

  return (
    <div className="md-toolbar" role="toolbar" aria-label="Markdown 格式">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={`md-toolbar-btn${tool.id === 'bold' ? ' is-bold' : ''}${
            tool.id === 'italic' ? ' is-italic' : ''
          }`}
          title={tool.title}
          aria-label={tool.title}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(tool.action)}
        >
          {tool.label}
        </button>
      ))}
    </div>
  )
}
