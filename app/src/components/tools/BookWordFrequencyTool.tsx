import { useEffect, useState } from 'react'
import { CollapsibleSettingsSection } from '../settings/CollapsibleSettingsSection'
import { listSavedBooks, type SavedBookMeta } from '../../services/epub/library'
import { isNotebookTitleTaken } from '../../services/notes/notebooks'
import {
  runBookWordFrequencyAnalysis,
  type BookFrequencyProgress,
} from '../../services/tools/bookWordFrequency'
import { Capacitor } from '@capacitor/core'

export function BookWordFrequencyTool() {
  const [books, setBooks] = useState<SavedBookMeta[]>([])
  const [bookId, setBookId] = useState('')
  const [notebookTitle, setNotebookTitle] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<BookFrequencyProgress | null>(null)
  const [resultText, setResultText] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void listSavedBooks().then((list) => {
      setBooks(list)
      if (list[0]) {
        setBookId(list[0].id)
        const suggested = (list[0].fileName || list[0].title || '词频统计').replace(/\.epub$/i, '')
        setNotebookTitle(suggested)
      }
    })
  }, [])

  function onSelectBook(id: string) {
    setBookId(id)
    const book = books.find((item) => item.id === id)
    if (!book) return
    const suggested = (book.fileName || book.title || '词频统计').replace(/\.epub$/i, '')
    setNotebookTitle(suggested)
  }

  async function handleStart() {
    setError('')
    setResultText('')
    const book = books.find((item) => item.id === bookId)
    if (!book) {
      setError('请先选择一本书')
      return
    }
    const title = notebookTitle.trim()
    if (!title) {
      setError('请填写笔记本名称')
      return
    }
    if (await isNotebookTitleTaken(title)) {
      setError(`笔记本「${title}」已存在，请换一个名称`)
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
        notebookTitle: title,
        onProgress: setProgress,
      })
      setResultText(
        `已写入词频笔记本「${result.notebook.title}」：保留 ${result.uniqueKept} 词（扫描约 ${result.wordCount} 次出现）。可在「笔记 → 词频统计」中查看。`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '统计失败')
    } finally {
      setRunning(false)
    }
  }

  return (
    <CollapsibleSettingsSection title="全书词频统计" defaultExpanded>
      <p className="tools-tool-desc">
        选择书架中的一本书，离线统计全书词频（停用词过滤、词形还原、ECDICT 释义与考试等级），结果保存为「词频统计」笔记本。
      </p>

      <label className="tools-field">
        <span>笔记本名称</span>
        <input
          type="text"
          value={notebookTitle}
          onChange={(e) => setNotebookTitle(e.target.value)}
          placeholder="例如：Pride_and_Prejudice 词频"
          disabled={running}
        />
      </label>

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

      <div className="tools-tool-actions">
        <button
          type="button"
          className="tools-tool-btn tools-tool-btn-primary"
          disabled={running || !bookId}
          onClick={() => void handleStart()}
        >
          {running ? '统计中…' : '开始统计'}
        </button>
      </div>

      {(running || progress) && (
        <div className="tools-freq-progress" aria-live="polite">
          <div className="tools-freq-progress-bar">
            <div
              className="tools-freq-progress-fill"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
          <p className="tools-freq-progress-text">
            {progress?.message ?? '…'}（{progress?.percent ?? 0}%）
          </p>
        </div>
      )}

      {error && <p className="tools-tool-error">{error}</p>}
      {resultText && <p className="tools-tool-result">{resultText}</p>}
    </CollapsibleSettingsSection>
  )
}
