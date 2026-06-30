import { useCallback, useEffect, useState } from 'react'
import {
  type EpubBook,
  getLastBookId,
  importEpub,
  isNativeApp,
  loadChapterHtml,
  loadEpubFromDevice,
  loadProgress,
  saveProgress,
} from '../../services/epub'
import { ChapterContent } from './ChapterContent'
import { WordDetailPopup } from './WordDetailPopup'

function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

async function openBook(book: EpubBook): Promise<{ book: EpubBook; chapterIndex: number }> {
  const saved = loadProgress(book.id)
  const startIndex = saved?.chapterIndex ?? 0
  const safeIndex = Math.min(startIndex, book.chapters.length - 1)
  return { book, chapterIndex: safeIndex }
}

export function ReaderScreen() {
  const [book, setBook] = useState<EpubBook | null>(null)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [chapterHtml, setChapterHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedWord, setSelectedWord] = useState<string | null>(null)
  const [now, setNow] = useState(() => formatTime(new Date()))
  const [showPanelHint, setShowPanelHint] = useState(false)
  const [lastBookId, setLastBookId] = useState<string | null>(null)
  const native = isNativeApp()

  const chapter = book?.chapters[chapterIndex]
  const progressPercent = book
    ? Math.round(((chapterIndex + 1) / book.chapters.length) * 100)
    : 0

  useEffect(() => {
    const timer = setInterval(() => setNow(formatTime(new Date())), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!native) return
    getLastBookId()
      .then(setLastBookId)
      .catch(() => setLastBookId(null))
  }, [native])

  useEffect(() => {
    if (!book) return
    let cancelled = false
    setLoading(true)
    setError('')

    loadChapterHtml(book, chapterIndex)
      .then((html) => {
        if (!cancelled) setChapterHtml(html)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '章节加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    saveProgress(book.id, chapterIndex)
    return () => {
      cancelled = true
    }
  }, [book, chapterIndex])

  async function handleImport(file?: File) {
    setLoading(true)
    setError('')
    setSelectedWord(null)

    try {
      const parsed = await importEpub(file)
      const opened = await openBook(parsed)
      setBook(opened.book)
      setChapterIndex(opened.chapterIndex)
      if (native) setLastBookId(parsed.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'EPUB 导入失败'
      if (!message.includes('cancel') && !message.includes('Cancel')) {
        setError(message)
      }
      setBook(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleResumeLast() {
    if (!lastBookId) return
    setLoading(true)
    setError('')
    try {
      const parsed = await loadEpubFromDevice(lastBookId)
      const opened = await openBook(parsed)
      setBook(opened.book)
      setChapterIndex(opened.chapterIndex)
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法打开上次的书籍')
    } finally {
      setLoading(false)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await handleImport(file)
    e.target.value = ''
  }

  const handleWordTap = useCallback((rawWord: string) => {
    setSelectedWord(rawWord)
  }, [])

  function goPrev() {
    if (!book || chapterIndex <= 0) return
    setChapterIndex((i) => i - 1)
    setSelectedWord(null)
  }

  function goNext() {
    if (!book || chapterIndex >= book.chapters.length - 1) return
    setChapterIndex((i) => i + 1)
    setSelectedWord(null)
  }

  return (
    <div className="reader-screen">
      {!book && (
        <section className="reader-import card">
          <h2>打开 EPUB 书籍</h2>
          <p>
            {native
              ? '点击下方按钮，从手机存储中选择 EPUB 文件。'
              : '选择一本英文 EPUB 文件，验证解析、逐词点击与翻页。'}
          </p>

          {native ? (
            <button
              type="button"
              className="file-btn"
              disabled={loading}
              onClick={() => void handleImport()}
            >
              {loading ? '导入中…' : '从手机选择 EPUB'}
            </button>
          ) : (
            <label className="file-btn">
              选择 EPUB 文件
              <input
                type="file"
                accept=".epub,application/epub+zip"
                onChange={(e) => void handleFileChange(e)}
              />
            </label>
          )}

          {native && lastBookId && (
            <button
              type="button"
              className="resume-btn"
              disabled={loading}
              onClick={() => void handleResumeLast()}
            >
              继续阅读上次的书籍
            </button>
          )}

          {error && <p className="error">{error}</p>}
        </section>
      )}

      {book && (
        <>
          <header className="reader-top-bar">
            <span className="reader-chapter-name">{chapter?.title ?? ''}</span>
          </header>

          <main className="reader-body">
            {loading && <p className="reader-status">加载章节中…</p>}
            {error && <p className="error">{error}</p>}
            {!loading && chapterHtml && (
              <ChapterContent html={chapterHtml} onWordTap={handleWordTap} />
            )}
          </main>

          <footer className="reader-meta">
            <span>{progressPercent}%</span>
            <span>{now}</span>
          </footer>

          <nav className="reader-bottom-nav">
            <button type="button" onClick={goPrev} disabled={chapterIndex <= 0}>
              ← 上一页
            </button>
            <button
              type="button"
              className="reader-home-btn"
              onClick={() => setShowPanelHint((v) => !v)}
              title="阅读控制面板（待实现）"
            >
              ⌂
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!book || chapterIndex >= book.chapters.length - 1}
            >
              下一页 →
            </button>
          </nav>

          {showPanelHint && (
            <div className="reader-panel-hint" onClick={() => setShowPanelHint(false)}>
              <p>阅读控制面板（目录/设置）将在下一步实现</p>
            </div>
          )}

          <WordDetailPopup
            rawWord={selectedWord}
            onClose={() => setSelectedWord(null)}
            onLookupVariant={setSelectedWord}
          />
        </>
      )}
    </div>
  )
}
