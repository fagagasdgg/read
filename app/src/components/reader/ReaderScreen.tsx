import { useCallback, useEffect, useState } from 'react'
import {
  type EpubBook,
  type SavedBookMeta,
  importEpub,
  isNativeApp,
  listSavedBooks,
  loadChapterHtml,
  loadEpubFromDevice,
  loadProgress,
  removeSavedBook,
  saveProgress,
  touchBookLastRead,
} from '../../services/epub'
import {
  getThemeById,
  loadReadingSettings,
  type ReadingSettings,
} from '../../services/settings/readingSettings'
import { ChapterContent } from './ChapterContent'
import { ReaderControlPanel } from './ReaderControlPanel'
import { ReadingSettingsPanel } from './ReadingSettingsPanel'
import { TocPanel } from './TocPanel'
import { WordDetailPopup } from './WordDetailPopup'

type ReaderOverlay = 'control' | 'toc' | 'settings' | null

function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

async function openBook(book: EpubBook): Promise<{ book: EpubBook; chapterIndex: number }> {
  const saved = loadProgress(book.id)
  const startIndex = saved?.chapterIndex ?? 0
  const safeIndex = Math.min(startIndex, book.chapters.length - 1)
  await touchBookLastRead(book.id)
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
  const [overlay, setOverlay] = useState<ReaderOverlay>(null)
  const [savedBooks, setSavedBooks] = useState<SavedBookMeta[]>([])
  const [readingSettings, setReadingSettings] = useState<ReadingSettings | null>(null)
  const native = isNativeApp()

  const chapter = book?.chapters[chapterIndex]
  const theme = getThemeById(readingSettings?.themeId ?? 'parchment')
  const progressPercent = book
    ? Math.round(((chapterIndex + 1) / book.chapters.length) * 100)
    : 0

  const readerStyle = readingSettings
    ? ({
        '--reader-font-size': `${readingSettings.fontSize}px`,
        '--reader-line-height': String(readingSettings.lineHeight),
        '--reader-bg': theme.background,
        '--reader-text': theme.text,
        '--reader-bar': theme.bar,
      } as React.CSSProperties)
    : undefined

  useEffect(() => {
    const timer = setInterval(() => setNow(formatTime(new Date())), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    void loadReadingSettings().then(setReadingSettings)
  }, [])

  const refreshSavedBooks = useCallback(async () => {
    if (!native) return
    const books = await listSavedBooks()
    setSavedBooks(books)
  }, [native])

  useEffect(() => {
    void refreshSavedBooks()
  }, [refreshSavedBooks])

  useEffect(() => {
    if (!book) return
    let cancelled = false
    let revokeAssets: (() => void) | undefined

    setLoading(true)
    setError('')

    loadChapterHtml(book, chapterIndex)
      .then((result) => {
        if (cancelled) {
          result.revoke()
          return
        }
        revokeAssets = result.revoke
        setChapterHtml(result.html)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '章节加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    saveProgress(book.id, chapterIndex)
    void touchBookLastRead(book.id)
    return () => {
      cancelled = true
      revokeAssets?.()
    }
  }, [book, chapterIndex])

  async function handleOpenBook(parsed: EpubBook) {
    const opened = await openBook(parsed)
    setBook(opened.book)
    setChapterIndex(opened.chapterIndex)
    setOverlay(null)
    setSelectedWord(null)
    await refreshSavedBooks()
  }

  async function handleImport(file?: File) {
    setLoading(true)
    setError('')
    setSelectedWord(null)

    try {
      const parsed = await importEpub(file)
      await handleOpenBook(parsed)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'EPUB 导入失败'
      if (!message.includes('cancel') && !message.includes('Cancel')) {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleOpenSaved(bookId: string) {
    setLoading(true)
    setError('')
    try {
      const parsed = await loadEpubFromDevice(bookId)
      await handleOpenBook(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法打开书籍')
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveSaved(bookId: string) {
    if (!window.confirm('确定从书架删除这本书？')) return
    await removeSavedBook(bookId)
    await refreshSavedBooks()
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

  function exitBook() {
    setBook(null)
    setOverlay(null)
    setSelectedWord(null)
    void refreshSavedBooks()
  }

  return (
    <div className="reader-screen" style={readerStyle}>
      {!book && (
        <section className="reader-import card">
          <h2>{native && savedBooks.length > 0 ? '我的书架' : '打开 EPUB 书籍'}</h2>

          {native && savedBooks.length > 0 && (
            <ul className="bookshelf-list">
              {savedBooks.map((item) => (
                <li key={item.id} className="bookshelf-item">
                  <button
                    type="button"
                    className="bookshelf-open"
                    disabled={loading}
                    onClick={() => void handleOpenSaved(item.id)}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.author}</span>
                  </button>
                  <button
                    type="button"
                    className="bookshelf-delete"
                    disabled={loading}
                    onClick={() => void handleRemoveSaved(item.id)}
                    aria-label="删除"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p>
            {native
              ? savedBooks.length > 0
                ? '点击下方按钮导入更多 EPUB。'
                : '点击下方按钮，从手机存储中选择 EPUB 文件。'
              : '选择一本英文 EPUB 文件，验证解析、逐词点击与翻页。'}
          </p>

          {native ? (
            <button
              type="button"
              className="file-btn"
              disabled={loading}
              onClick={() => void handleImport()}
            >
              {loading ? '导入中…' : savedBooks.length > 0 ? '导入 EPUB' : '从手机选择 EPUB'}
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
              onClick={() => setOverlay('control')}
              title="阅读控制面板"
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

          {overlay === 'control' && (
            <ReaderControlPanel
              bookTitle={book.title}
              onClose={() => setOverlay(null)}
              onExit={exitBook}
              onOpenToc={() => setOverlay('toc')}
              onOpenSettings={() => setOverlay('settings')}
            />
          )}

          {overlay === 'toc' && (
            <TocPanel
              chapters={book.chapters}
              currentIndex={chapterIndex}
              onClose={() => setOverlay(null)}
              onSelectChapter={setChapterIndex}
            />
          )}

          {overlay === 'settings' && readingSettings && (
            <ReadingSettingsPanel
              settings={readingSettings}
              onChange={setReadingSettings}
              onClose={() => setOverlay(null)}
            />
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
