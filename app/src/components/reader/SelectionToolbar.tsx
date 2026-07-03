import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { analyzeSentenceDeep, estimateSelectionTooLongForActiveProvider, hasActiveLlmApiKey } from '../../services/llm/deepAnalysis'
import {
  copyDoubaoPrompt,
  isClipboardReadDeniedError,
  parseDoubaoClipboard,
  readClipboardText,
} from '../../services/llm/doubaoWorkflow'
import { normalizeAnalysisListField } from '../../services/llm/analysisParse'
import { getBookDefaultNotebookId } from '../../services/notes/bookNotebook'
import { addNotebookEntry, type NotebookEntryAnalysis } from '../../services/notes/notebooks'
import { NotebookPickerSheet } from '../notes/NotebookPickerSheet'
import { DoubaoPasteSheet } from './DoubaoPasteSheet'

interface SelectionToolbarProps {
  bookId: string
  text: string
  onClose: () => void
  onClear: () => void
}

type ToolbarMode = 'actions' | 'preview'

function suspendDomSelection() {
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed) sel.removeAllRanges()
}

function truncateText(value: string, max = 160): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

export function SelectionToolbar({ bookId, text, onClose, onClear }: SelectionToolbarProps) {
  const [mode, setMode] = useState<ToolbarMode>('actions')
  const [analysis, setAnalysis] = useState<NotebookEntryAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [doubaoPending, setDoubaoPending] = useState(false)
  const [showPasteSheet, setShowPasteSheet] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [lengthWarning, setLengthWarning] = useState('')

  const applyImportedAnalysis = useCallback((result: NotebookEntryAnalysis) => {
    suspendDomSelection()
    setAnalysis(result)
    setMode('preview')
    setDoubaoPending(false)
    setShowPasteSheet(false)
    setMessage('已导入解析结果')
    setError('')
  }, [])

  const importDoubaoText = useCallback(
    (raw: string) => {
      const result = parseDoubaoClipboard(raw, text)
      applyImportedAnalysis(result)
    },
    [applyImportedAnalysis, text],
  )

  async function handleCopy() {
    setError('')
    try {
      await navigator.clipboard.writeText(text)
      setMessage('已复制选段')
      setTimeout(onClear, 600)
    } catch {
      setError('复制失败')
    }
  }

  async function handleDeepAnalysis() {
    setAnalyzing(true)
    setError('')
    setMessage('')
    setLengthWarning('')
    setDoubaoPending(false)
    try {
      const configured = await hasActiveLlmApiKey()
      if (!configured) {
        throw new Error('请先在首页「设置」中配置 AI API Key')
      }
      const warn = await estimateSelectionTooLongForActiveProvider(text)
      if (warn) setLengthWarning(warn)

      const result = await analyzeSentenceDeep(text)
      applyImportedAnalysis(result)
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '深度解析失败')
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleSendToDoubao() {
    setError('')
    setMessage('')
    try {
      await copyDoubaoPrompt(text)
      setDoubaoPending(true)
      setMessage('已复制豆包指令，请打开豆包粘贴发送，复制回复后点「导入豆包回复」')
    } catch (err) {
      setError(err instanceof Error ? err.message : '复制指令失败')
    }
  }

  async function handleImportClipboard() {
    setImporting(true)
    setError('')
    setMessage('')
    try {
      const clip = await readClipboardText()
      importDoubaoText(clip)
    } catch (err) {
      if (isClipboardReadDeniedError(err)) {
        setShowPasteSheet(true)
        setMessage('无法读取剪贴板，请手动粘贴豆包回复')
      } else {
        setError(err instanceof Error ? err.message : '导入失败')
      }
    } finally {
      setImporting(false)
    }
  }

  async function saveToNotebook(notebookId: string) {
    if (!analysis) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await addNotebookEntry(notebookId, text, analysis)
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
      setError('请先完成深度解析或从豆包导入')
      return
    }
    const defaultId = await getBookDefaultNotebookId(bookId)
    if (defaultId) {
      await saveToNotebook(defaultId)
      return
    }
    setShowPicker(true)
  }

  const expanded = mode === 'preview'

  return createPortal(
    <>
      {expanded && (
        <button
          type="button"
          className="selection-action-backdrop"
          aria-label="关闭解析结果"
          onClick={onClose}
        />
      )}

      <div
        className={`selection-panel${expanded ? ' selection-panel-expanded' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
      >
        <header className="selection-panel-header">
          <span className="selection-panel-title">{expanded ? '深度解析' : '选段工具'}</span>
          <button type="button" className="selection-panel-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        {!expanded && <p className="selection-panel-snippet">{truncateText(text)}</p>}

        {mode === 'actions' ? (
          <>
            <div className="selection-action-grid">
              <button
                type="button"
                className="selection-action-btn selection-action-btn-secondary"
                onClick={() => void handleCopy()}
              >
                复制选段
              </button>
              <button
                type="button"
                className="selection-action-btn selection-action-btn-primary"
                onClick={() => void handleDeepAnalysis()}
                disabled={analyzing}
              >
                {analyzing ? '解析中…' : '深度解析'}
              </button>
              <button
                type="button"
                className="selection-action-btn selection-action-btn-accent"
                onClick={() => void handleSendToDoubao()}
              >
                复制豆包指令
              </button>
              <button
                type="button"
                className="selection-action-btn selection-action-btn-accent"
                onClick={() => void handleImportClipboard()}
                disabled={importing}
              >
                {importing ? '导入中…' : '导入豆包回复'}
              </button>
            </div>
            <p className="selection-panel-hint">
              系统「翻译」可快速查词；豆包：复制指令 → 豆包发送 → 复制回复 → 导入
            </p>
            {doubaoPending && (
              <p className="selection-panel-warn selection-panel-doubao-wait">
                等待豆包回复…复制后点「导入豆包回复」，或用手动粘贴
              </p>
            )}
            {lengthWarning && <p className="selection-panel-warn">{lengthWarning}</p>}
          </>
        ) : (
          analysis && (
            <div className="selection-analysis-preview">
              <p className="selection-panel-snippet selection-panel-snippet-expanded">{text}</p>
              <div className="selection-analysis-block">
                <h4>翻译</h4>
                <p>{analysis.translation}</p>
              </div>
              <div className="selection-analysis-block">
                <h4>搭配</h4>
                <p>{normalizeAnalysisListField(analysis.collocations, 'collocations')}</p>
              </div>
              <div className="selection-analysis-block">
                <h4>俚语</h4>
                <p>{normalizeAnalysisListField(analysis.slangs, 'slangs')}</p>
              </div>
              <div className="selection-analysis-block">
                <h4>句式</h4>
                <p>{analysis.sentencePattern}</p>
              </div>
              <div className="selection-action-grid selection-action-grid-preview">
                <button
                  type="button"
                  className="selection-action-btn selection-action-btn-secondary"
                  onClick={() => setMode('actions')}
                >
                  返回
                </button>
                <button
                  type="button"
                  className="selection-action-btn selection-action-btn-primary"
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  {saving ? '保存中…' : '存笔记'}
                </button>
              </div>
            </div>
          )
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

      {showPasteSheet && (
        <DoubaoPasteSheet
          onClose={() => setShowPasteSheet(false)}
          onConfirm={(raw) => {
            try {
              importDoubaoText(raw)
            } catch (err) {
              setError(err instanceof Error ? err.message : '导入失败')
            }
          }}
        />
      )}
    </>,
    document.body,
  )
}
