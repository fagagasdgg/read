import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { analyzeSentenceDeep } from '../../services/llm/deepAnalysis'
import {
  copyDoubaoPrompt,
  parseDoubaoClipboard,
  readClipboardText,
  tryOpenDoubaoApp,
  tryParseDoubaoClipboard,
} from '../../services/llm/doubaoWorkflow'
import {
  estimateSelectionTooLong,
  hasZhipuApiKey,
  loadZhipuSettings,
} from '../../services/llm/zhipuSettings'
import { getBookDefaultNotebookId } from '../../services/notes/bookNotebook'
import { addNotebookEntry, type NotebookEntryAnalysis } from '../../services/notes/notebooks'
import { NotebookPickerSheet } from '../notes/NotebookPickerSheet'

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
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [lengthWarning, setLengthWarning] = useState('')

  const applyImportedAnalysis = useCallback((result: NotebookEntryAnalysis) => {
    suspendDomSelection()
    setAnalysis(result)
    setMode('preview')
    setDoubaoPending(false)
    setMessage('已从豆包导入解析结果')
    setError('')
  }, [])

  const tryAutoImportClipboard = useCallback(async () => {
    if (!doubaoPending || mode === 'preview') return
    try {
      const clip = await readClipboardText()
      const result = tryParseDoubaoClipboard(clip, text)
      if (result) applyImportedAnalysis(result)
    } catch {
      // 自动导入失败时静默，用户可手动点「导入剪贴板」
    }
  }, [applyImportedAnalysis, doubaoPending, mode, text])

  useEffect(() => {
    if (!doubaoPending) return

    function onVisible() {
      if (document.visibilityState === 'visible') {
        void tryAutoImportClipboard()
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [doubaoPending, tryAutoImportClipboard])

  async function handleCopy() {
    setError('')
    try {
      await navigator.clipboard.writeText(text)
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
    setLengthWarning('')
    setDoubaoPending(false)
    try {
      const configured = await hasZhipuApiKey()
      if (!configured) {
        throw new Error('请先在首页「设置」中配置智谱 API Key')
      }
      const settings = await loadZhipuSettings()
      const warn = estimateSelectionTooLong(text, settings.model, settings.customModels)
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
      const opened = tryOpenDoubaoApp()
      setDoubaoPending(true)
      setMessage(
        opened
          ? '已复制指令并尝试打开豆包，发送后复制回复，切回阅读器将自动导入'
          : '已复制指令，请打开豆包粘贴发送；复制回复后可点「导入剪贴板」或切回自动导入',
      )
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
      const result = parseDoubaoClipboard(clip, text)
      applyImportedAnalysis(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
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
            <div className="selection-toolbar-row">
              <button type="button" onClick={() => void handleCopy()}>
                复制
              </button>
              <button type="button" onClick={() => void handleDeepAnalysis()} disabled={analyzing}>
                {analyzing ? '解析中…' : '深度解析'}
              </button>
            </div>
            <div className="selection-toolbar-row">
              <button type="button" onClick={() => void handleSendToDoubao()}>
                发给豆包
              </button>
              <button
                type="button"
                onClick={() => void handleImportClipboard()}
                disabled={importing}
              >
                {importing ? '导入中…' : '导入剪贴板'}
              </button>
            </div>
            <p className="selection-panel-hint">
              快速翻译请用系统选区「翻译」；豆包流程：发给豆包 → 复制回复 → 导入或切回自动识别
            </p>
            {doubaoPending && (
              <p className="selection-panel-warn selection-panel-doubao-wait">
                等待豆包回复中…切回阅读器将尝试自动导入（需含校验标记且句子匹配）
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
              <div className="selection-toolbar-row selection-toolbar-row-sticky">
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
