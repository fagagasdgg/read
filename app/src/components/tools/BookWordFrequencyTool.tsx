import { useCallback, useEffect, useState } from 'react'
import { CollapsibleSettingsSection } from '../settings/CollapsibleSettingsSection'
import { listSavedBooks, type SavedBookMeta } from '../../services/epub/library'
import { getBookDefaultNotebookId } from '../../services/notes/bookNotebook'
import {
  getNotebookMeta,
  isFrequencyNotebookMeta,
  type NotebookMeta,
} from '../../services/notes/notebooks'
import { notifyOpenFrequencyNotesPane } from '../../services/notes/events'
import {
  runBookWordFrequencyAnalysis,
  type BookFrequencyProgress,
} from '../../services/tools/bookWordFrequency'
import { Capacitor } from '@capacitor/core'

export function BookWordFrequencyTool() {
  const [books, setBooks] = useState<SavedBookMeta[]>([])
  const [bookId, setBookId] = useState('')
  const [defaultNotebook, setDefaultNotebook] = useState<NotebookMeta | null>(null)
  const [defaultLoading, setDefaultLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<BookFrequencyProgress | null>(null)
  const [resultText, setResultText] = useState('')
  const [error, setError] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)

  const refreshDefaultNotebook = useCallback(async (id: string) => {
    if (!id) {
      setDefaultNotebook(null)
      return
    }
    setDefaultLoading(true)
    try {
      const nbId = await getBookDefaultNotebookId(id)
      if (!nbId) {
        setDefaultNotebook(null)
        return
      }
      const meta = await getNotebookMeta(nbId)
      if (!meta || isFrequencyNotebookMeta(meta)) {
        setDefaultNotebook(null)
        return
      }
      setDefaultNotebook(meta)
    } finally {
      setDefaultLoading(false)
    }
  }, [])

  useEffect(() => {
    void listSavedBooks().then((list) => {
      setBooks(list)
      if (list[0]) {
        setBookId(list[0].id)
        void refreshDefaultNotebook(list[0].id)
      }
    })
  }, [refreshDefaultNotebook])

  function onSelectBook(id: string) {
    setBookId(id)
    setError('')
    setResultText('')
    setProgress(null)
    void refreshDefaultNotebook(id)
  }

  async function handleStart() {
    setError('')
    setResultText('')
    const book = books.find((item) => item.id === bookId)
    if (!book) {
      setError('请先选择一本书')
      return
    }
    if (!defaultNotebook) {
      setError('请先打开该书 → 阅读设置 →「本书笔记」中指定默认保存笔记本')
      return
    }
    if (!Capacitor.isNativePlatform()) {
      setError('全书词频统计需要在手机 App 中运行（需读取本地 EPUB 文件）')
      return
    }

    setRunning(true)
    setProgress({
      phase: 'load',
      current: 0,
      total: 1,
      message: '准备中…',
      percent: 0,
    })

    try {
      const result = await runBookWordFrequencyAnalysis({
        book,
        onProgress: setProgress,
      })
      setResultText(
        `已写入词频笔记本「${result.notebook.title}」：保留 ${result.uniqueKept} 词（扫描约 ${result.wordCount} 次出现）。可在「笔记 → 词频统计」中查看。`,
      )
      notifyOpenFrequencyNotesPane()
    } catch (err) {
      setError(err instanceof Error ? err.message : '统计失败')
    } finally {
      setRunning(false)
    }
  }

  const canStart = Boolean(bookId && defaultNotebook && !running && !defaultLoading)
  const showProgress = running || (progress != null && progress.phase !== 'done')
  const showDoneProgress = !running && progress?.phase === 'done'

  return (
    <CollapsibleSettingsSection
      title="全书词频统计"
      summary="离线统计 · 写入词频笔记本"
      defaultExpanded
    >
      <div className="tools-freq-panel">
        <div className="tools-tool-desc-row">
          <p className="tools-tool-desc">
            从书架选书，离线统计全书词频，结果保存到「笔记 → 词频统计」。
          </p>
          <button
            type="button"
            className="tools-help-q"
            aria-label="查看使用说明"
            onClick={() => setHelpOpen(true)}
          >
            ?
          </button>
        </div>

        <ol className="tools-freq-steps">
          <li>选择要统计的书籍</li>
          <li>确认本书已设置默认笔记本</li>
          <li>点击「开始统计」，等待完成后在词频页查看</li>
        </ol>

        <label className="tools-field">
          <span>选择书籍</span>
          <select
            value={bookId}
            onChange={(e) => onSelectBook(e.target.value)}
            disabled={running || books.length === 0}
          >
            {books.length === 0 ? (
              <option value="">书架暂无书籍</option>
            ) : (
              books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title || book.fileName}
                </option>
              ))
            )}
          </select>
        </label>

        <div className="tools-field">
          <span>词频笔记本名称</span>
          {defaultLoading ? (
            <p className="tools-field-hint">正在读取默认笔记本…</p>
          ) : defaultNotebook ? (
            <p className="tools-freq-notebook-name">{defaultNotebook.title}</p>
          ) : (
            <p className="tools-freq-warn">
              未设置默认笔记本。请打开该书 → 房子图标 → 设置 →「本书笔记」中指定。
            </p>
          )}
        </div>

        <div className="tools-tool-actions tools-freq-actions">
          <button
            type="button"
            className="tools-tool-btn tools-tool-btn-primary tools-freq-start-btn"
            disabled={!canStart}
            onClick={() => void handleStart()}
          >
            {running ? '统计中…' : '开始统计'}
          </button>
        </div>

        {(showProgress || showDoneProgress) && progress && (
          <div
            className={`tools-freq-progress-card${showDoneProgress ? ' is-done' : ''}`}
            aria-live="polite"
          >
            <div className="tools-freq-progress-head">
              <span className="tools-freq-progress-label">
                {showDoneProgress ? '统计完成' : '正在统计'}
              </span>
              <span className="tools-freq-progress-pct">{progress.percent}%</span>
            </div>
            <div className="tools-freq-progress-bar">
              <div
                className="tools-freq-progress-fill"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="tools-freq-progress-text">{progress.message}</p>
          </div>
        )}

        {error && <p className="tools-tool-error tools-freq-message">{error}</p>}
        {resultText && <p className="tools-tool-result tools-freq-message">{resultText}</p>}
      </div>

      {helpOpen && (
        <div
          className="tools-help-mask"
          role="dialog"
          aria-modal="true"
          aria-label="全书词频统计说明"
          onClick={() => setHelpOpen(false)}
        >
          <div className="tools-help-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="tools-help-header">
              <h3>使用说明</h3>
              <button
                type="button"
                className="tools-help-close"
                aria-label="关闭"
                onClick={() => setHelpOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="tools-help-body">
              <div className="tools-help-block">
                <h4>会做什么</h4>
                <p>
                  读取所选 EPUB，过滤停用词并做词形还原，再用本地 ECDICT
                  补全释义与考试等级，生成一本「词频统计」笔记本。
                </p>
              </div>
              <div className="tools-help-block">
                <h4>命名规则</h4>
                <p>
                  名称自动使用该书「默认保存笔记本」的标题。阅读笔记与词频统计分属不同页签，允许同名。
                </p>
              </div>
              <div className="tools-help-block">
                <h4>重复统计</h4>
                <p>同一本书再次统计会覆盖原有词频本内容，不会重复新建。</p>
              </div>
              <div className="tools-help-block">
                <h4>运行环境</h4>
                <p>需在手机 App 中运行（要读取本地 EPUB 文件）。</p>
              </div>
            </div>
            <div className="tools-help-footer">
              <button
                type="button"
                className="tools-tool-btn tools-tool-btn-primary"
                onClick={() => setHelpOpen(false)}
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </CollapsibleSettingsSection>
  )
}
