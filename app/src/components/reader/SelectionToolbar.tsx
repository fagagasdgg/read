import { useState } from 'react'
import { NotebookPickerSheet } from '../notes/NotebookPickerSheet'
import { getBookDefaultNotebookId } from '../../services/notes/bookNotebook'
import { addNotebookEntry } from '../../services/notes/notebooks'
import { translateTraditional } from '../../services/translation/traditionalTranslate'
import type { TextSelectionState } from './useTextSelection'

interface SelectionToolbarProps {
  bookId: string
  selection: TextSelectionState
  onClear: () => void
}

type ToolbarMode = 'actions' | 'preview'

function truncateText(text: string, max = 120): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

export function SelectionToolbar({ bookId, selection, onClear }: SelectionToolbarProps) {
  const [mode, setMode] = useState<ToolbarMode>('actions')
  const [translation, setTranslation] = useState('')
  const [translating, setTranslating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showPicker, setShowPicker] = useState(false)

  async function handleCopy() {
    setError('')
    try {
      await navigator.clipboard.writeText(selection.text)
      setMessage('已复制')
      setTimeout(onClear, 600)
    } catch {
      setError('复制失败')
    }
  }

  async function handleTraditionalTranslate() {
    setTranslating(true)
    setError('')
    setMessage('')
    try {
      const result = await translateTraditional(selection.text)
      setTranslation(result)
      setMode('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : '翻译失败')
    } finally {
      setTranslating(false)
    }
  }

  async function saveToNotebook(notebookId: string) {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await addNotebookEntry(notebookId, selection.text, {
        translation: translation || '',
      })
      setMessage('已保存到笔记')
      setShowPicker(false)
      setTimeout(onClear, 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    if (!translation) {
      setError('请先完成翻译')
      return
    }
    const defaultId = await getBookDefaultNotebookId(bookId)
    if (defaultId) {
      await saveToNotebook(defaultId)
      return
    }
    setShowPicker(true)
  }

  return (
    <>
      <button
        type="button"
        className="selection-action-backdrop"
        aria-label="关闭选段菜单"
        onClick={onClear}
      />

      <div className="selection-action-bar" onMouseDown={(e) => e.preventDefault()}>
        <p className="selection-action-snippet">{truncateText(selection.text)}</p>

        {mode === 'actions' ? (
          <div className="selection-toolbar-row">
            <button type="button" onClick={() => void handleCopy()}>
              复制
            </button>
            <button
              type="button"
              onClick={() => void handleTraditionalTranslate()}
              disabled={translating}
            >
              {translating ? '翻译中…' : '传统翻译'}
            </button>
            <button type="button" className="selection-toolbar-disabled" disabled title="即将推出">
              深度解析
            </button>
            <button type="button" className="selection-action-close" onClick={onClear}>
              关闭
            </button>
          </div>
        ) : (
          <div className="selection-toolbar-preview">
            <p className="selection-toolbar-translation">{translation}</p>
            <div className="selection-toolbar-row">
              <button type="button" onClick={() => setMode('actions')}>
                返回
              </button>
              <button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? '保存中…' : '存笔记'}
              </button>
            </div>
          </div>
        )}

        {message && <p className="selection-toolbar-message">{message}</p>}
        {error && <p className="selection-toolbar-error">{error}</p>}
      </div>

      {showPicker && (
        <NotebookPickerSheet
          title="保存到哪个笔记本？"
          onClose={() => setShowPicker(false)}
          onSelect={(id) => void saveToNotebook(id)}
        />
      )}
    </>
  )
}
