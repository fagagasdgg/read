import { useState } from 'react'
import { createPortal } from 'react-dom'
import { analyzeSentenceDeep } from '../../services/llm/deepAnalysis'
import { hasZhipuApiKey } from '../../services/llm/zhipuSettings'
import { getBookDefaultNotebookId } from '../../services/notes/bookNotebook'
import { addNotebookEntry, type NotebookEntryAnalysis } from '../../services/notes/notebooks'
import { NotebookPickerSheet } from '../notes/NotebookPickerSheet'
import type { TextSelectionState } from './useTextSelection'

interface SelectionToolbarProps {
  bookId: string
  selection: TextSelectionState
  onClose: () => void
  onClear: () => void
}

type ToolbarMode = 'actions' | 'preview'

function truncateText(text: string, max = 160): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

export function SelectionToolbar({ bookId, selection, onClose, onClear }: SelectionToolbarProps) {
  const [mode, setMode] = useState<ToolbarMode>('actions')
  const [analysis, setAnalysis] = useState<NotebookEntryAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
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

  async function handleDeepAnalysis() {
    setAnalyzing(true)
    setError('')
    setMessage('')
    try {
      const configured = await hasZhipuApiKey()
      if (!configured) {
        throw new Error('请先在首页「设置」中配置智谱 API Key')
      }
      const result = await analyzeSentenceDeep(selection.text)
      setAnalysis(result)
      setMode('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : '深度解析失败')
    } finally {
      setAnalyzing(false)
    }
  }

  async function saveToNotebook(notebookId: string) {
    if (!analysis) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await addNotebookEntry(notebookId, selection.text, analysis)
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
    if (!analysis) {
      setError('请先完成深度解析')
      return
    }
    const defaultId = await getBookDefaultNotebookId(bookId)
    if (defaultId) {
      await saveToNotebook(defaultId)
      return
    }
    setShowPicker(true)
  }

  return createPortal(
    <>
      <div className="selection-panel" onMouseDown={(e) => e.preventDefault()}>
        <header className="selection-panel-header">
          <span className="selection-panel-title">选段工具</span>
          <button type="button" className="selection-panel-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <p className="selection-panel-snippet">{truncateText(selection.text)}</p>

        {mode === 'actions' ? (
          <div className="selection-toolbar-row">
            <button type="button" onClick={() => void handleCopy()}>
              复制
            </button>
            <button type="button" onClick={() => void handleDeepAnalysis()} disabled={analyzing}>
              {analyzing ? '解析中…' : '深度解析'}
            </button>
          </div>
        ) : (
          analysis && (
            <div className="selection-analysis-preview">
              <div className="selection-analysis-block">
                <h4>翻译</h4>
                <p>{analysis.translation}</p>
              </div>
              <div className="selection-analysis-block">
                <h4>搭配</h4>
                <p>{analysis.collocations}</p>
              </div>
              <div className="selection-analysis-block">
                <h4>俚语</h4>
                <p>{analysis.slangs}</p>
              </div>
              <div className="selection-analysis-block">
                <h4>句式</h4>
                <p>{analysis.sentencePattern}</p>
              </div>
              <div className="selection-toolbar-row">
                <button type="button" onClick={() => setMode('actions')}>
                  返回
                </button>
                <button type="button" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? '保存中…' : '存笔记'}
                </button>
              </div>
            </div>
          )
        )}

        {mode === 'actions' && (
          <p className="selection-panel-hint">快速翻译请使用系统选区菜单中的「翻译」</p>
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
    </>,
    document.body,
  )
}
