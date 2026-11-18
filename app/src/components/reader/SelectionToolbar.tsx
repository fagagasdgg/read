import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppToast } from '../common/AppToast'
import { analyzeSentenceDeep, estimateSelectionTooLongForActiveProvider, hasActiveLlmApiKey } from '../../services/llm/deepAnalysis'
import {
  copyDoubaoPrompt,
  isClipboardReadDeniedError,
  parseDoubaoClipboard,
  readClipboardText,
} from '../../services/llm/doubaoWorkflow'
import { normalizeAnalysisListField } from '../../services/llm/analysisParse'
import { getBookDefaultNotebookId } from '../../services/notes/bookNotebook'
import {
  addNotebookEntry,
  updateNotebookEntryTags,
  type NotebookEntryAnalysis,
} from '../../services/notes/notebooks'
import { listNoteTags, type NoteTag } from '../../services/notes/tags'
import { NoteTagPicker } from '../notes/NoteTagPicker'
import { NotebookPickerSheet } from '../notes/NotebookPickerSheet'
import { DoubaoPasteSheet } from './DoubaoPasteSheet'

interface SelectionToolbarProps {
  bookId: string
  bookTitle?: string
  chapterIndex?: number
  text: string
  onClose: () => void
  onClear: () => void
}

type ToolbarMode = 'actions' | 'preview' | 'tag'

function suspendDomSelection() {
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed) sel.removeAllRanges()
}

function truncateText(value: string, max = 160): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

export function SelectionToolbar({
  bookId,
  bookTitle,
  chapterIndex,
  text,
  onClose,
  onClear,
}: SelectionToolbarProps) {
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
  const [toast, setToast] = useState('')
  const [importSuccess, setImportSuccess] = useState(false)
  const [allTags, setAllTags] = useState<NoteTag[]>([])
  const [postSaveTagIds, setPostSaveTagIds] = useState<string[]>([])
  const [savedRef, setSavedRef] = useState<{ notebookId: string; entryId: string } | null>(null)
  const [savingTags, setSavingTags] = useState(false)

  const applyImportedAnalysis = useCallback((result: NotebookEntryAnalysis) => {
    suspendDomSelection()
    setAnalysis(result)
    setMode('preview')
    setDoubaoPending(false)
    setShowPasteSheet(false)
    setImportSuccess(true)
    setMessage('')
    setToast('已成功导入豆包解析结果')
    setTimeout(() => {
      setToast('')
      setImportSuccess(false)
    }, 3200)
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
      const entry = await addNotebookEntry(notebookId, text, analysis, {
        bookId,
        bookTitle,
        chapterIndex,
      })
      setShowPicker(false)
      const tags = await listNoteTags()
      setAllTags(tags)
      setSavedRef({ notebookId, entryId: entry.id })
      setPostSaveTagIds([])
      if (tags.length) {
        setMode('tag')
        setMessage('已保存。可选择标签，或点「完成」跳过')
      } else {
        setMessage('已保存到笔记（可到工具页创建标签后再打标）')
        setTimeout(onClear, 900)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function finishPostSaveTags(apply: boolean) {
    if (!savedRef) {
      onClear()
      return
    }
    setSavingTags(true)
    setError('')
    try {
      if (apply && postSaveTagIds.length) {
        await updateNotebookEntryTags(savedRef.notebookId, savedRef.entryId, postSaveTagIds)
      }
      onClear()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存标签失败')
    } finally {
      setSavingTags(false)
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

  const expanded = mode === 'preview' || mode === 'tag'
  const panelTitle =
    mode === 'tag' ? '添加标签' : mode === 'preview' ? '深度解析' : '选段工具'

  return createPortal(
    <>
      {expanded && (
        <button
          type="button"
          className="selection-action-backdrop"
          aria-label="关闭解析结果"
          onClick={mode === 'tag' ? () => void finishPostSaveTags(false) : onClose}
        />
      )}

      <div
        className={`selection-panel${expanded ? ' selection-panel-expanded' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
      >
        <header className="selection-panel-header">
          <span className="selection-panel-title">{panelTitle}</span>
          <button
            type="button"
            className="selection-panel-close"
            onClick={mode === 'tag' ? () => void finishPostSaveTags(false) : onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>

        {!expanded && <p className="selection-panel-snippet">{truncateText(text)}</p>}

        {mode === 'actions' ? (
          <>
            {importSuccess && (
              <div className="selection-import-success" role="status">
                <span className="selection-import-success-icon" aria-hidden>
                  ✓
                </span>
                <div>
                  <strong>导入成功</strong>
                  <p>豆包解析结果已就绪，可预览并存入笔记</p>
                </div>
              </div>
            )}
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
        ) : mode === 'tag' ? (
          <div className="selection-analysis-preview">
            <p className="selection-panel-hint">为刚保存的笔记选择标签（可多选）</p>
            <NoteTagPicker
              tags={allTags}
              selectedIds={postSaveTagIds}
              onChange={setPostSaveTagIds}
              disabled={savingTags}
            />
            <div className="selection-action-grid selection-action-grid-preview">
              <button
                type="button"
                className="selection-action-btn selection-action-btn-secondary"
                disabled={savingTags}
                onClick={() => void finishPostSaveTags(false)}
              >
                跳过
              </button>
              <button
                type="button"
                className="selection-action-btn selection-action-btn-primary"
                disabled={savingTags}
                onClick={() => void finishPostSaveTags(true)}
              >
                {savingTags ? '保存中…' : '完成'}
              </button>
            </div>
          </div>
        ) : (
          analysis && (
            <div className="selection-analysis-preview">
              {importSuccess && (
                <div className="selection-import-success selection-import-success-inline" role="status">
                  <span className="selection-import-success-icon" aria-hidden>
                    ✓
                  </span>
                  <strong>已成功导入豆包解析结果</strong>
                </div>
              )}
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

      <AppToast message={toast} variant="ok" className="app-toast-reader" />
    </>,
    document.body,
  )
}
